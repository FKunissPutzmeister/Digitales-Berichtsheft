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
              <label class="form-label" for="nvBeruf">Beruf</label>
              <input class="form-control" type="text" id="nvBeruf" name="beruf" placeholder="z. B. Mechatroniker/in">
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
                <input type="checkbox" id="nvAktiv" name="aktiv">
                Aktiv
              </label>
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
    document.getElementById('nvAktiv').checked       = u.aktiv !== false;

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

    const berufVal = document.getElementById('nvBeruf').value.trim();
    const beginnVal = document.getElementById('nvAusbildungBeginn').value;
    const endeVal   = document.getElementById('nvAusbildungEnde').value;

    /* WRITE uses ausbildungBeginn/ausbildungEnde (without medial 's') */
    const fields = {
      role:             document.getElementById('nvRole').value,
      beruf:            berufVal   || null,
      berichtTyp:       document.getElementById('nvBerichtTyp').value,
      ausbildungBeginn: beginnVal  || null,
      ausbildungEnde:   endeVal    || null,
      kannPlanen:       document.getElementById('nvKannPlanen').checked,
      istAusbilder:     document.getElementById('nvIstAusbilder').checked,
      aktiv:            document.getElementById('nvAktiv').checked,
    };

    try {
      const updated = await DB.updateUser(editingUser.oid, fields);
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

  /* ── Suche ── */
  function filterUsers(query) {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name  || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role  || '').toLowerCase().includes(q) ||
      ((ROLE_LABELS[u.role] || '').toLowerCase().includes(q))
    );
  }

  /* ── Seite aufbauen ── */
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header__left">
        <h1 class="page-title">Nutzerverwaltung</h1>
        <p class="page-subtitle">Rollen, Rechte und Profildaten aller Nutzer verwalten</p>
      </div>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="nv-toolbar">
          <input class="form-control" type="search" id="nvSearch"
                 placeholder="Suchen (Name, E-Mail, Rolle)…" autocomplete="off">
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

  /* Suche verdrahten */
  document.getElementById('nvSearch').addEventListener('input', (e) => {
    renderPage(filterUsers(e.target.value));
  });
});
