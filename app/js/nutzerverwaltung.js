/* ===================================================================
   NUTZERVERWALTUNG.JS – Developer-only Nutzerverwaltung
   =================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-nutzerverwaltung', [{ label: 'Nutzerverwaltung', href: 'nutzerverwaltung.html' }]);
  if (!user) return;
  if (user.role !== 'developer') {
    window.location.href = 'dashboard.html';
    return;
  }

  /* Volle Seitenbreite: aktiviert den body[data-page="nutzerverwaltung"]-
     Override in layout.css. Muss hier gesetzt werden, weil der SPA-Router
     data-page bei jeder Navigation löscht (siehe profil.js). */
  document.body.dataset.page = 'nutzerverwaltung';

  const main = document.getElementById('mainContent');

  /* ── XSS-Schutz: alle user-supplied strings durch esc() jagen ── */
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Nutzer laden ── */
  let users;
  try {
    users = await DB.getAllUsers();
  } catch (e) {
    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Nutzerverwaltung</h1>
        </div>
      </div>
      <div class="card">
        <div class="card__body">
          <p style="color:var(--color-error)">Fehler beim Laden der Nutzerdaten: ${esc(e.message)}</p>
        </div>
      </div>`;
    return;
  }

  /* ── Modal einmalig in den DOM hängen ── */
  const modalId = 'nvEditModal';
  let editingUser = null;

  function buildModal() {
    if (document.getElementById(modalId)) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = modalId;
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="nvModalTitle">
        <div class="modal__header">
          <h2 class="modal__title" id="nvModalTitle">Nutzer bearbeiten</h2>
          <button class="modal__close" type="button" aria-label="Schließen">&times;</button>
        </div>
        <div class="modal__body">
          <form class="nv-form" id="nvEditForm" novalidate>
            <div class="form-group">
              <label class="form-label" for="nvRole">Rolle</label>
              <select class="form-control" id="nvRole" name="role">
                <option value="azubi">Auszubildende/r</option>
                <option value="pruefer">Prüfer</option>
                <option value="admin">Administrator</option>
                <option value="dhstudent">DH-Student/in</option>
                <option value="developer">Developer</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="nvBeruf">Beruf <span class="form-hint">· aus Azure synchronisiert</span></label>
              <input class="form-control" type="text" id="nvBeruf" name="beruf" readonly placeholder="wird beim Login aus Azure (Position) übernommen">
            </div>
            <div class="form-group">
              <label class="form-label" for="nvBerichtTyp">Berichtstyp</label>
              <select class="form-control" id="nvBerichtTyp" name="berichtTyp">
                <option value="wöchentlich">Wöchentlich</option>
                <option value="täglich">Täglich</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Ausbildungszeitraum</label>
              <div class="nv-form__date-row">
                <div>
                  <label class="form-label" for="nvAusbildungBeginn" style="font-size:var(--text-xs);color:var(--pm-grey-500)">Von</label>
                  <input class="form-control" type="date" id="nvAusbildungBeginn" name="ausbildungBeginn">
                </div>
                <div>
                  <label class="form-label" for="nvAusbildungEnde" style="font-size:var(--text-xs);color:var(--pm-grey-500)">Bis</label>
                  <input class="form-control" type="date" id="nvAusbildungEnde" name="ausbildungEnde">
                </div>
              </div>
            </div>
            <div class="nv-form__checks">
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvKannPlanen" name="kannPlanen">
                Kann planen
              </label>
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvIstAusbilder" name="istAusbilder">
                Ist Ausbilder
              </label>
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvIstAzubi" name="istAzubi">
                Ist Azubi
              </label>
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvAktiv" name="aktiv">
                Aktiv
              </label>
            </div>
            <div class="form-group" id="nvAusbilderBlock" hidden>
              <label class="form-label">Dauerhafte Ausbilder <span class="form-hint">· sehen &amp; korrigieren alle Wochen</span></label>
              <div class="nv-ausbilder-list" id="nvAusbilderList"></div>
            </div>
          </form>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" id="nvCancelBtn">Abbrechen</button>
          <button class="btn btn-primary" type="button" id="nvSaveBtn">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    /* Schließen-Logik */
    overlay.querySelector('.modal__close').addEventListener('click', closeModal);
    document.getElementById('nvCancelBtn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    /* Speichern */
    document.getElementById('nvSaveBtn').addEventListener('click', handleSave);
  }

  function openModal(u) {
    editingUser = u;
    document.getElementById('nvRole').value         = u.role || 'azubi';
    document.getElementById('nvBeruf').value        = u.beruf || '';
    document.getElementById('nvBerichtTyp').value   = u.berichtTyp || 'wöchentlich';
    /* READ uses ausbildungsBeginn/ausbildungsEnde (with medial 's') */
    document.getElementById('nvAusbildungBeginn').value = u.ausbildungsBeginn || '';
    document.getElementById('nvAusbildungEnde').value   = u.ausbildungsEnde   || '';
    document.getElementById('nvKannPlanen').checked  = !!u.kannPlanen;
    document.getElementById('nvIstAusbilder').checked = !!u.istAusbilder;
    document.getElementById('nvIstAzubi').checked    = !!u.istAzubi;
    document.getElementById('nvAktiv').checked       = u.aktiv !== false;

    /* Dauerhafte Ausbilder nur bei Azubis (inkl. getaggter Azubis, z.B. Developer+Azubi) */
    const ausbilderBlock = document.getElementById('nvAusbilderBlock');
    const ausbilderList  = document.getElementById('nvAusbilderList');
    if (u.istAzubi) {
      ausbilderBlock.hidden = false;
      ausbilderList.innerHTML = '<p class="form-hint">Lädt…</p>';
      const kandidaten = users.filter(x => x.istAusbilder);
      DB.getAusbilderFuerAzubi(u.oid).then(zugewiesen => {
        if (!editingUser || editingUser.oid !== u.oid) return; // Modal inzwischen für anderen Nutzer geöffnet
        const aktiv = new Set((zugewiesen || []).map(a => a.oid));
        ausbilderList.innerHTML = kandidaten.length
          ? kandidaten.map(k => `
              <label class="nv-form__check-label">
                <input type="checkbox" class="nv-ausbilder-cb" value="${esc(k.oid)}" ${aktiv.has(k.oid) ? 'checked' : ''}>
                ${esc(k.name)} <span class="nv-table__email">${esc(k.email)}</span>
              </label>`).join('')
          : '<p class="form-hint">Keine ausbilderfähigen Nutzer vorhanden.</p>';
      }).catch(e => { ausbilderList.innerHTML = `<p style="color:var(--color-error)">Fehler: ${esc(e.message)}</p>`; });
    } else {
      ausbilderBlock.hidden = true;
      ausbilderList.innerHTML = '';
    }

    document.getElementById(modalId).classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById(modalId)?.classList.remove('open');
    document.body.style.overflow = '';
    editingUser = null;
  }

  async function handleSave() {
    if (!editingUser) return;
    const saveBtn = document.getElementById('nvSaveBtn');
    saveBtn.disabled = true;

    const beginnVal = document.getElementById('nvAusbildungBeginn').value;
    const endeVal   = document.getElementById('nvAusbildungEnde').value;

    /* Beruf wird NICHT gesendet — er wird beim Login aus Azure synchronisiert
       (read-only im Editor). WRITE uses ausbildungBeginn/ausbildungEnde (ohne 's'). */
    const fields = {
      role:             document.getElementById('nvRole').value,
      berichtTyp:       document.getElementById('nvBerichtTyp').value,
      ausbildungBeginn: beginnVal  || null,
      ausbildungEnde:   endeVal    || null,
      kannPlanen:       document.getElementById('nvKannPlanen').checked,
      istAusbilder:     document.getElementById('nvIstAusbilder').checked,
      istAzubi:         document.getElementById('nvIstAzubi').checked,
      aktiv:            document.getElementById('nvAktiv').checked,
    };

    try {
      const updated = await DB.updateUser(editingUser.oid, fields);
      /* Dauerhafte Ausbilder nur schreiben, wenn das Ziel NACH dieser Änderung noch
         Azubi ist. Maßgeblich ist der neue Zustand (fields), nicht das veraltete
         editingUser — sonst würde beim Demoten (azubi→prüfer) ein PUT abgesetzt, den
         das Backend zu Recht mit 400 „kein Azubi" ablehnt und der den Save abbricht. */
      const zielIstAzubi = fields.role === 'azubi' || fields.istAzubi;
      if (zielIstAzubi) {
        const oids = [...document.querySelectorAll('.nv-ausbilder-cb:checked')].map(cb => cb.value);
        await DB.setAusbilderFuerAzubi(editingUser.oid, oids);
      }
      /* Patch in-memory user array */
      const idx = users.findIndex(u => u.oid === editingUser.oid);
      if (idx !== -1) {
        /* Merge returned data; keep existing fields for anything not in updated */
        users[idx] = { ...users[idx], ...updated };
      }
      Toast.success('Gespeichert');
      /* Re-render only the changed row */
      const row = document.querySelector(`tr[data-oid="${CSS.escape(editingUser.oid)}"]`);
      if (row) {
        const u = users[idx] ?? editingUser;
        row.outerHTML = renderRow(u);
        bindRowEvents();
      }
      closeModal();
    } catch (e) {
      Toast.error('Fehler: ' + e.message);
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* ── Render-Helfer ── */
  function renderRow(u) {
    const label = ROLE_LABELS[u.role] || esc(u.role);
    const aktivBadge = u.aktiv !== false
      ? `<span class="badge badge--genehmigt">aktiv</span>`
      : `<span class="badge badge--grey">inaktiv</span>`;
    return `
      <tr data-oid="${esc(u.oid)}">
        <td>
          <div class="nv-table__name">${esc(u.name)}</div>
          <div class="nv-table__email">${esc(u.email)}</div>
        </td>
        <td>${esc(u.email)}</td>
        <td><span class="role-badge" data-role="${esc(u.role)}">${label}</span></td>
        <td>${esc(u.beruf)}</td>
        <td>${aktivBadge}</td>
        <td class="nv-table__actions">
          <button class="btn btn-sm btn-outline nv-edit-btn" type="button" data-oid="${esc(u.oid)}">Bearbeiten</button>
        </td>
      </tr>`;
  }

  function renderTable(list) {
    if (!list.length) {
      return `<tr><td colspan="6"><div class="nv-empty">Keine Nutzer gefunden.</div></td></tr>`;
    }
    return list.map(renderRow).join('');
  }

  function bindRowEvents() {
    document.querySelectorAll('.nv-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const oid = btn.dataset.oid;
        const u = users.find(x => x.oid === oid);
        if (u) openModal(u);
      });
    });
  }

  /* ── Haupt-Render ── */
  function renderPage(list) {
    const tbody = document.getElementById('nvTableBody');
    if (!tbody) return;
    tbody.innerHTML = renderTable(list);
    bindRowEvents();
  }

  /* ── Filter (Suche + Rolle, kombiniert) ── */
  function matchesQuery(u, q) {
    if (!q) return true;
    return (u.name  || '').toLowerCase().includes(q) ||
           (u.email || '').toLowerCase().includes(q) ||
           (u.role  || '').toLowerCase().includes(q) ||
           ((ROLE_LABELS[u.role] || '').toLowerCase().includes(q));
  }

  function filterUsers(query, role) {
    const q = (query || '').trim().toLowerCase();
    return users.filter(u =>
      (!role || u.role === role) && matchesQuery(u, q)
    );
  }

  function applyFilters() {
    const q    = document.getElementById('nvSearch')?.value || '';
    const role = document.getElementById('nvRoleFilter')?.value || '';
    renderPage(filterUsers(q, role));
  }

  /* ── Seite aufbauen ── */
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header__left">
        <h1 class="page-title">Nutzerverwaltung</h1>
        <p class="page-subtitle">Rollen, Rechte und Profildaten aller Nutzer verwalten</p>
      </div>
      <div class="page-header__right">
        <button class="btn btn-outline" type="button" id="nvSyncBtn">Jetzt synchronisieren</button>
      </div>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="nv-toolbar">
          <input class="form-control nv-toolbar__search" type="search" id="nvSearch"
                 placeholder="Suchen (Name, E-Mail, Rolle)…" autocomplete="off">
          <select class="form-control nv-toolbar__role" id="nvRoleFilter" aria-label="Nach Rolle filtern">
            <option value="">Alle Rollen</option>
            <option value="azubi">Auszubildende</option>
            <option value="pruefer">Prüfer / Ausbilder</option>
            <option value="admin">Administrator</option>
            <option value="dhstudent">DH-Student/in</option>
            <option value="developer">Developer</option>
          </select>
        </div>
        <div style="overflow-x:auto">
          <table class="nv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Beruf</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="nvTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;

  /* Modal einmalig bauen */
  buildModal();

  /* Initiale Tabelle */
  renderPage(users);

  /* Filter verdrahten (Suche + Rolle greifen kombiniert) */
  document.getElementById('nvSearch').addEventListener('input', applyFilters);
  document.getElementById('nvRoleFilter').addEventListener('change', applyFilters);

  /* Manueller Entra-Sync (developer-only Seite) */
  document.getElementById('nvSyncBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('nvSyncBtn');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Synchronisiere…';
    try {
      const r = await DB.runEntraSync();
      if (r.ok) {
        Toast.success(`Sync ok: ${r.upserted} aktualisiert, ${r.deactivated} deaktiviert`);
        users = await DB.getAllUsers();
        renderPage(users);
      } else {
        Toast.error('Sync fehlgeschlagen: ' + (r.errors?.[0] || 'unbekannt'));
      }
    } catch (e) {
      Toast.error('Sync fehlgeschlagen: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
});
