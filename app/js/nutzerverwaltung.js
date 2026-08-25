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
  const esc = window.escapeHtml;

  /* Heutiges Datum als lokales YYYY-MM-DD — dieselbe Form wie loeschsperreBis,
     damit der Stringvergleich chronologisch ist. NICHT toISOString() nehmen:
     das ist UTC und würde die Grenze je nach lokaler Zeitzone um bis zu einen
     Tag verschieben (Löschsperre greift NUR, wenn loeschsperreBis >= heute —
     services/retention.js: sperreGreift). Einmal pro Seitenaufruf berechnet,
     von openModal() und renderRow() geteilt (keine zweite Vergleichsform). */
  const heuteStr = DateUtil.toISODate(new Date());

  /* Mehrfachauswahl: OIDs der markierten Zeilen; überlebt Re-Renders/Filter. */
  const selected = new Set();

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
                <input type="checkbox" id="nvIstAusbildungsleiter" name="istAusbildungsleiter">
                Ist Ausbildungsleiter
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
            <div class="form-group">
              <label class="form-label" for="nvLoeschsperre">
                Löschung zurückhalten bis
                <span class="form-hint">· leer = normale Frist (365 Tage nach Deaktivierung)</span>
              </label>
              <input class="form-control" type="date" id="nvLoeschsperre" name="loeschsperreBis">
              <p class="form-hint" id="nvLoeschHinweis"></p>
            </div>
            <div class="form-group" id="nvAusbilderBlock" hidden>
              <label class="form-label">Dauerhafte Ausbilder <span class="form-hint">· sehen &amp; korrigieren alle Wochen</span></label>
              <div class="nv-ausbilder-list" id="nvAusbilderList"></div>
            </div>
            <div class="form-group" id="nvAusbildungsleiterBlock">
              <label class="form-label" for="nvAusbildungsleiterBereich">Zuständig für</label>
              <select class="form-control" id="nvAusbildungsleiterBereich">
                <option value="technisch">Technische Berufe</option>
                <option value="kaufmaennisch">Kaufmännische Berufe, IT &amp; DH</option>
              </select>
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

    /* Rolle/Häkchen bestimmen, welche Felder überhaupt greifen — nicht
       benötigte Felder bleiben sichtbar, aber ausgegraut (siehe
       updateFieldAvailability), statt sie ein-/auszublenden. Live auf jede
       Änderung im Modal reagieren, nicht nur beim Öffnen. */
    document.getElementById('nvRole').addEventListener('change', updateFieldAvailability);
    document.getElementById('nvIstAzubi').addEventListener('change', updateFieldAvailability);
    document.getElementById('nvIstAusbildungsleiter').addEventListener('change', updateFieldAvailability);
  }

  /* Graut Felder aus, die für die aktuelle Rolle/Häkchen-Kombination
     nicht greifen — bleiben aber sichtbar (kein hidden), damit erkennbar ist,
     dass die Option existiert und unter welcher Bedingung sie verfügbar wird.
     Wird beim Öffnen des Modals einmal aufgerufen und danach live bei jeder
     Änderung von Rolle/„Ist Azubi“/„Ist Ausbildungsleiter“. */
  function updateFieldAvailability() {
    const role = document.getElementById('nvRole').value;
    const istAzubi = document.getElementById('nvIstAzubi').checked;
    const istAusbildungsleiter = document.getElementById('nvIstAusbildungsleiter').checked;

    // Berichtstyp + Ausbildungszeitraum sind nur für (getaggte) Azubis relevant
    // — dieselbe Bedingung, die vorher schon für Berichtstyp allein galt.
    const azubiRelevant = role === 'azubi' || istAzubi;
    document.getElementById('nvBerichtTyp').disabled = !azubiRelevant;
    document.getElementById('nvAusbildungBeginn').disabled = !azubiRelevant;
    document.getElementById('nvAusbildungEnde').disabled = !azubiRelevant;

    // „Zuständig für“ ist nur relevant, wenn „Ist Ausbildungsleiter“ gesetzt ist.
    document.getElementById('nvAusbildungsleiterBereich').disabled = !istAusbildungsleiter;
  }

  // Über die PMSelect-Instanz setzen, damit das sichtbare Custom-Label mitzieht.
  // Ein reines native.value=… triggert PMSelects Observer NICHT (der lauscht
  // nur aufs selected-ATTRIBUT eines <option> bzw. aufs disabled-Attribut) —
  // das Dropdown bliebe optisch auf der beim Modal-Aufbau initial sichtbaren
  // Auswahl stehen, unabhängig vom tatsächlichen Wert (siehe selber Kommentar/
  // Fix in wochenansicht.js). Betrifft alle drei PmSelect-verstärkten Selects
  // in diesem Modal: Rolle, Berichtstyp, Ausbildungsleiter-Bereich.
  function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el._pmInstance) el._pmInstance.setValue(value);
    else el.value = value;
  }

  function openModal(u) {
    editingUser = u;
    setSelectValue('nvRole', u.role || 'azubi');
    document.getElementById('nvBeruf').value        = u.beruf || '';
    setSelectValue('nvBerichtTyp', u.berichtTyp || 'wöchentlich');
    /* READ uses ausbildungsBeginn/ausbildungsEnde (with medial 's') */
    document.getElementById('nvAusbildungBeginn').value = u.ausbildungsBeginn || '';
    document.getElementById('nvAusbildungEnde').value   = u.ausbildungsEnde   || '';
    document.getElementById('nvKannPlanen').checked  = !!u.kannPlanen;
    document.getElementById('nvIstAusbilder').checked = !!u.istAusbilder;
    document.getElementById('nvIstAusbildungsleiter').checked = !!u.istAusbildungsleiter;
    setSelectValue('nvAusbildungsleiterBereich', u.ausbildungsleiterBereich || 'technisch');
    document.getElementById('nvIstAzubi').checked    = !!u.istAzubi;
    document.getElementById('nvAktiv').checked       = u.aktiv !== false;
    // Muss NACH Rolle/„Ist Azubi“/„Ist Ausbildungsleiter“ gesetzt werden, weil
    // sie vom aktuellen DOM-Zustand dieser Felder liest (siehe buildModal).
    updateFieldAvailability();
    document.getElementById('nvLoeschsperre').value  = u.loeschsperreBis || '';
    // Löschdatum aus dem Stichtag ableiten (365 Tage, wie services/retention.js).
    const hinweis = document.getElementById('nvLoeschHinweis');
    if (u.aktiv !== false || !u.inaktivSeit) {
      hinweis.textContent = u.aktiv !== false
        ? 'Aktives Konto — die Frist läuft erst ab einer Deaktivierung.'
        : 'Kein Stichtag hinterlegt — dieses Konto wird nicht automatisch gelöscht.';
    } else {
      const ziel = new Date(new Date(u.inaktivSeit).getTime() + 365 * 24 * 3600 * 1000);
      // inaktivSeit/ziel.toISOString() sind volle ISO-Zeitstempel (mit Uhrzeit+Z);
      // DateUtil.formatDate haengt selbst 'T00:00:00' an und erwartet daher ein
      // reines YYYY-MM-DD — deshalb hier auf die ersten 10 Zeichen kuerzen, sonst
      // entsteht ein "...ZT00:00:00"-String und toLocaleDateString liefert "Invalid Date".
      const seit  = DateUtil.formatDate(u.inaktivSeit.slice(0, 10));
      const zielS = DateUtil.formatDate(ziel.toISOString().slice(0, 10));
      // Eine Sperre greift nur, solange sie das heutige Datum noch abdeckt
      // (sperreGreift in services/retention.js) — sonst wird eine bereits
      // abgelaufene Sperre fälschlich als aktiver Schutz angezeigt.
      if (u.loeschsperreBis && u.loeschsperreBis >= heuteStr) {
        hinweis.textContent = `Inaktiv seit ${seit} · Löschung zurückgehalten bis ${DateUtil.formatDate(u.loeschsperreBis)} (regulär ${zielS})`;
      } else if (u.loeschsperreBis) {
        hinweis.textContent = `Inaktiv seit ${seit} · Sperre abgelaufen am ${DateUtil.formatDate(u.loeschsperreBis)} · endgültige Löschung am ${zielS}`;
      } else {
        hinweis.textContent = `Inaktiv seit ${seit} · endgültige Löschung am ${zielS}`;
      }
      // Manuelle Deaktivierung (Migration 038) übersteht den Entra-Sync auch
      // bei gruppen-verwalteten Rollen (Prüfer/Azubi/DH-Student) — sonst würde
      // der nächste Lauf Aktiv=1 sofort wieder herstellen, solange die Person
      // noch Gruppenmitglied ist. Ohne diesen Hinweis wirkt das überraschend.
      if (u.manuellDeaktiviert) {
        hinweis.textContent += ' · manuell deaktiviert — wird vom Entra-Sync nicht automatisch reaktiviert';
      }
    }

    /* Dauerhafte Ausbilder nur bei Azubis (inkl. getaggter Azubis, z.B. Developer+Azubi) */
    const ausbilderBlock = document.getElementById('nvAusbilderBlock');
    const ausbilderList  = document.getElementById('nvAusbilderList');
    if (u.istAzubi) {
      ausbilderBlock.hidden = false;
      ausbilderList.innerHTML = '<p class="form-hint">Lädt…</p>';
      const kandidaten = users.filter(x => x.istAusbilder);
      DB.getAusbilderFuerAzubi(u.oid).then(zugewiesen => {
        if (!editingUser || editingUser.oid !== u.oid) return; // Modal inzwischen für anderen Nutzer geöffnet
        const quelleByOid = new Map((zugewiesen || []).map(a => [a.oid, a.quelle]));
        ausbilderList.innerHTML = kandidaten.length
          ? kandidaten.map(k => {
              const quelle = quelleByOid.get(k.oid);
              const badge = quelle === 'auto' ? ' <span class="form-hint">(automatisch aus Entra)</span>' : '';
              return `
              <label class="nv-form__check-label">
                <input type="checkbox" class="nv-ausbilder-cb" value="${esc(k.oid)}" ${quelleByOid.has(k.oid) ? 'checked' : ''}>
                ${esc(displayName(k.name))} <span class="nv-table__email">${esc(k.email)}</span>${badge}
              </label>`;
            }).join('')
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
      istAusbildungsleiter: document.getElementById('nvIstAusbildungsleiter').checked,
      ausbildungsleiterBereich: document.getElementById('nvIstAusbildungsleiter').checked
        ? document.getElementById('nvAusbildungsleiterBereich').value
        : null,
      istAzubi:         document.getElementById('nvIstAzubi').checked,
      aktiv:            document.getElementById('nvAktiv').checked,
      // Leerer Wert = keine Sperre. null statt '' senden, damit die Spalte
      // wirklich geleert wird (sql.Date verträgt '' nicht).
      loeschsperreBis:  document.getElementById('nvLoeschsperre').value || null,
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
        // Kein Re-Binding nötig: Edit-Button + Checkbox laufen delegiert am #nvTableBody.
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
    // Bei inaktiven Konten das Löschdatum direkt an das Badge hängen: die
    // Zeile ist der einzige Ort, an dem ein Developer die Fälligkeit sieht,
    // ohne das Modal zu öffnen.
    let aktivBadge;
    if (u.aktiv !== false) {
      aktivBadge = `<span class="badge badge--genehmigt">aktiv</span>`;
    } else if (u.loeschsperreBis && u.loeschsperreBis >= heuteStr) {
      // Sperre greift nur, solange sie das heutige Datum noch abdeckt
      // (sperreGreift in services/retention.js) — sonst würde eine bereits
      // abgelaufene Sperre fälschlich als aktiver Schutz angezeigt.
      aktivBadge = `<span class="badge badge--grey">inaktiv</span>`
                 + `<div class="nv-table__email">Löschung zurückgehalten bis ${esc(DateUtil.formatDate(u.loeschsperreBis))}</div>`;
    } else if (u.inaktivSeit) {
      const ziel = new Date(new Date(u.inaktivSeit).getTime() + 365 * 24 * 3600 * 1000);
      // ziel.toISOString() ist ein voller Zeitstempel; auf YYYY-MM-DD kuerzen,
      // siehe Kommentar in openModal() (sonst "Invalid Date").
      // Eine abgelaufene Sperre (loeschsperreBis < heuteStr) fällt hierhin durch;
      // sichtbar als abgelaufen markieren statt sie stillschweigend zu verschweigen.
      const abgelaufenZeile = u.loeschsperreBis
        ? `<div class="nv-table__email">Sperre abgelaufen am ${esc(DateUtil.formatDate(u.loeschsperreBis))}</div>`
        : '';
      aktivBadge = `<span class="badge badge--grey">inaktiv</span>`
                 + `<div class="nv-table__email">Löschung am ${esc(DateUtil.formatDate(ziel.toISOString().slice(0, 10)))}</div>`
                 + abgelaufenZeile;
    } else {
      aktivBadge = `<span class="badge badge--grey">inaktiv</span>`;
    }
    const sel = selected.has(u.oid);
    return `
      <tr data-oid="${esc(u.oid)}"${sel ? ' class="nv-row--selected"' : ''}>
        <td class="nv-table__check">
          <input type="checkbox" class="nv-row-cb" data-oid="${esc(u.oid)}" aria-label="Auswählen"${sel ? ' checked' : ''}>
        </td>
        <td>
          <div class="nv-table__name">${esc(displayName(u.name))}</div>
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
      return `<tr><td colspan="7"><div class="nv-empty">Keine Nutzer gefunden.</div></td></tr>`;
    }
    return list.map(renderRow).join('');
  }

  /* ── Haupt-Render ── */
  function renderPage(list) {
    const tbody = document.getElementById('nvTableBody');
    if (!tbody) return;
    tbody.innerHTML = renderTable(list);
    updateBulkbar();
  }

  /* ── Mehrfachauswahl ──────────────────────────────────────────────── */
  function selectedUsers() { return users.filter(u => selected.has(u.oid)); }

  function visibleCheckboxes() {
    return [...document.querySelectorAll('#nvTableBody .nv-row-cb')];
  }

  function setRowSelected(oid, on) {
    if (on) selected.add(oid); else selected.delete(oid);
    const row = document.querySelector(`tr[data-oid="${CSS.escape(oid)}"]`);
    if (row) row.classList.toggle('nv-row--selected', on);
  }

  function updateBulkbar() {
    const bar = document.getElementById('nvBulkbar');
    if (!bar) return;
    bar.hidden = selected.size === 0;
    const count = document.getElementById('nvBulkCount');
    if (count) count.textContent = String(selected.size);
    const vis = visibleCheckboxes();
    const selAll = document.getElementById('nvSelectAll');
    if (selAll) {
      const selVis = vis.filter(cb => selected.has(cb.dataset.oid)).length;
      selAll.checked = vis.length > 0 && selVis === vis.length;
      selAll.indeterminate = selVis > 0 && selVis < vis.length;
    }
  }

  /* ── Filter (Suche + Rolle, kombiniert) ── */
  function matchesQuery(u, q) {
    if (!q) return true;
    return (u.name  || '').toLowerCase().includes(q) ||
           displayName(u.name || '').toLowerCase().includes(q) ||
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
        <div class="nv-bulkbar" id="nvBulkbar" hidden>
          <span class="nv-bulkbar__count"><b id="nvBulkCount">0</b> ausgewählt</span>
          <div class="nv-bulkbar__actions">
            <button class="btn btn-sm btn-outline" type="button" data-bulk="role">Rolle ändern</button>
            <button class="btn btn-sm btn-outline" type="button" data-bulk="aktiv">Aktiv/Inaktiv</button>
            <button class="btn btn-sm btn-outline" type="button" data-bulk="berichtTyp">Berichtstyp</button>
            <button class="btn btn-sm btn-outline" type="button" data-bulk="ausbilder">Ausbilder zuweisen</button>
          </div>
          <button class="btn btn-sm btn-outline nv-bulkbar__clear" type="button" id="nvBulkClear">Auswahl aufheben</button>
        </div>
        <div style="overflow-x:auto">
          <table class="nv-table">
            <thead>
              <tr>
                <th class="nv-table__check"><input type="checkbox" id="nvSelectAll" aria-label="Alle sichtbaren auswählen"></th>
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
    </div>

    <div class="card" style="margin-top:var(--sp-5)">
      <div class="card__body">
        <div class="nv-toolbar" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h2 style="margin:0;font-size:var(--text-lg)">API-Zugriff (MCP)</h2>
            <p class="form-hint" style="margin:4px 0 0;max-width:70ch">Nutzer, die den Berichtsheft-MCP aus ihrem lokal laufenden Claude (Desktop/Code) verwenden dürfen. Jeder Schlüssel wirkt mit den Rechten seines Besitzers. Der Schlüssel wird nur einmal bei der Erstellung angezeigt.</p>
          </div>
          <button class="btn btn-primary" type="button" id="akAddBtn">+ Nutzer aufnehmen</button>
        </div>
        <div style="overflow-x:auto">
          <table class="nv-table">
            <thead>
              <tr><th>Nutzer</th><th>Bezeichnung</th><th>Erstellt</th><th>Zuletzt genutzt</th><th>Status</th><th></th></tr>
            </thead>
            <tbody id="akTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:var(--sp-5)">
      <div class="card__body">
        <div class="nv-toolbar" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h2 style="margin:0;font-size:var(--text-lg)">Berufe</h2>
            <p class="form-hint" style="margin:4px 0 0;max-width:70ch">Ordnet Berufsbezeichnungen einem Bereich zu (technisch/kaufmännisch), damit der zuständige Ausbildungsleiter im Beurteilungsbogen automatisch ermittelt werden kann.</p>
          </div>
          <button class="btn btn-primary" type="button" id="bfAddBtn">+ Beruf hinzufügen</button>
        </div>
        <div style="overflow-x:auto">
          <table class="nv-table">
            <thead><tr><th>Beruf</th><th>Bereich</th><th></th></tr></thead>
            <tbody id="bfTableBody"></tbody>
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

  /* ── Mehrfachauswahl verdrahten (einmalig; tbody bleibt über Re-Renders
        bestehen, daher Delegation) ── */
  document.getElementById('nvTableBody').addEventListener('change', (e) => {
    const cb = e.target.closest('.nv-row-cb');
    if (!cb) return;
    setRowSelected(cb.dataset.oid, cb.checked);
    updateBulkbar();
  });
  document.getElementById('nvTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('.nv-edit-btn');
    if (!btn) return;
    const u = users.find(x => x.oid === btn.dataset.oid);
    if (u) openModal(u);
  });
  document.getElementById('nvSelectAll')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    visibleCheckboxes().forEach(cb => { cb.checked = on; setRowSelected(cb.dataset.oid, on); });
    updateBulkbar();
  });
  document.getElementById('nvBulkClear')?.addEventListener('click', () => {
    selected.clear();
    visibleCheckboxes().forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#nvTableBody tr.nv-row--selected').forEach(tr => tr.classList.remove('nv-row--selected'));
    updateBulkbar();
  });
  document.querySelectorAll('#nvBulkbar [data-bulk]').forEach(btn =>
    btn.addEventListener('click', () => openBulkModal(btn.dataset.bulk)));

  /* ── Bulk-Modal: baut je Aktion ein passendes Formular und wendet die
        Änderung per client-seitiger Schleife auf alle Ausgewählten an. ── */
  const BULK = {
    role: {
      title: 'Rolle ändern',
      body: (t) => `
        <div class="form-group">
          <label class="form-label" for="bulkRole">Neue Rolle für ${t.length} Nutzer</label>
          <select class="form-control" id="bulkRole">
            <option value="azubi">Auszubildende/r</option>
            <option value="pruefer">Prüfer</option>
            <option value="admin">Administrator</option>
            <option value="dhstudent">DH-Student/in</option>
            <option value="developer">Developer</option>
          </select>
        </div>`,
      apply: async (u) => DB.updateUser(u.oid, { role: document.getElementById('bulkRole').value }),
    },
    aktiv: {
      title: 'Status setzen',
      body: (t) => `
        <div class="form-group">
          <label class="form-label" for="bulkAktiv">Status für ${t.length} Nutzer</label>
          <select class="form-control" id="bulkAktiv">
            <option value="1">Aktiv</option>
            <option value="0">Inaktiv</option>
          </select>
        </div>`,
      apply: async (u) => DB.updateUser(u.oid, { aktiv: document.getElementById('bulkAktiv').value === '1' }),
    },
    berichtTyp: {
      title: 'Berichtstyp setzen',
      onlyAzubi: true,
      body: () => `
        <div class="form-group">
          <label class="form-label" for="bulkBerichtTyp">Berichtstyp</label>
          <select class="form-control" id="bulkBerichtTyp">
            <option value="wöchentlich">Wöchentlich</option>
            <option value="täglich">Täglich</option>
          </select>
        </div>`,
      apply: async (u) => DB.updateUser(u.oid, { berichtTyp: document.getElementById('bulkBerichtTyp').value }),
    },
    ausbilder: {
      title: 'Ausbilder zuweisen',
      onlyAzubi: true,
      body: () => {
        const kandidaten = users.filter(x => x.istAusbilder);
        return `
        <div class="nv-bulk-mode">
          <label><input type="radio" name="bulkAusbMode" value="add" checked> Ergänzen</label>
          <label><input type="radio" name="bulkAusbMode" value="replace"> Ersetzen</label>
        </div>
        <p class="nv-bulk-hint">Ergänzen fügt hinzu, ohne bestehende zu entfernen. Ersetzen ersetzt die manuellen Zuordnungen (automatisch aus Entra zugeordnete bleiben erhalten).</p>
        <div class="form-group">
          <label class="form-label">Ausbilder</label>
          <div class="nv-ausbilder-list">
            ${kandidaten.length
              ? kandidaten.map(k => `<label class="nv-form__check-label"><input type="checkbox" class="bulk-ausb-cb" value="${esc(k.oid)}"> ${esc(displayName(k.name))} <span class="nv-table__email">${esc(k.email)}</span></label>`).join('')
              : '<p class="form-hint">Keine ausbilderfähigen Nutzer vorhanden.</p>'}
          </div>
        </div>`;
      },
      apply: async (u) => {
        const mode = document.querySelector('input[name="bulkAusbMode"]:checked')?.value || 'add';
        const chosen = [...document.querySelectorAll('.bulk-ausb-cb:checked')].map(cb => cb.value);
        // Der PUT ist die vollständige Soll-Menge (nicht additiv): fehlt eine
        // bestehende Zuordnung darin, wird sie entfernt. Deshalb MUSS die aktuelle
        // Menge geladen werden — schlägt das fehl, NICHT schreiben (Fehler
        // propagieren → Schleife zählt fail++, Datensatz bleibt unangetastet).
        const cur = await DB.getAusbilderFuerAzubi(u.oid);
        const base = mode === 'add'
          ? (cur || []).map(a => a.oid)
          : (cur || []).filter(a => a.quelle === 'auto').map(a => a.oid);
        await DB.setAusbilderFuerAzubi(u.oid, [...new Set([...base, ...chosen])]);
      },
    },
  };

  function openBulkModal(action) {
    const cfg = BULK[action];
    if (!cfg) return;
    let targets = selectedUsers();
    if (cfg.onlyAzubi) targets = targets.filter(u => u.istAzubi);
    if (!targets.length) {
      Toast.warning('Nicht anwendbar', cfg.onlyAzubi ? 'Kein/e Azubi in der Auswahl.' : 'Keine Nutzer ausgewählt.');
      return;
    }
    const skipped = selected.size - targets.length;

    let ov = document.getElementById('nvBulkModal'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'nvBulkModal';
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="nvBulkTitle">
        <div class="modal__header">
          <h2 class="modal__title" id="nvBulkTitle">${esc(cfg.title)}</h2>
          <button class="modal__close" type="button" data-x aria-label="Schließen">&times;</button>
        </div>
        <div class="modal__body">
          ${skipped > 0 ? `<p class="nv-bulk-hint">${targets.length} von ${selected.size} ausgewählten Nutzern betroffen (nur Azubis) – ${skipped} übersprungen.</p>` : ''}
          <form class="nv-form" novalidate>${cfg.body(targets)}</form>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" data-x>Abbrechen</button>
          <button class="btn btn-primary" type="button" id="nvBulkApply">Auf ${targets.length} anwenden</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    ov.querySelector('#nvBulkApply').addEventListener('click', async () => {
      const btn = ov.querySelector('#nvBulkApply');
      btn.disabled = true; btn.textContent = 'Wird angewendet…';
      let ok = 0, fail = 0;
      for (const u of targets) {
        try {
          const updated = await cfg.apply(u);
          if (updated && updated.oid) {
            const idx = users.findIndex(x => x.oid === updated.oid);
            if (idx !== -1) users[idx] = { ...users[idx], ...updated };
          }
          ok++;
        } catch (_) { fail++; }
      }
      close();
      applyFilters();
      if (fail === 0) Toast.success('Gespeichert', `${ok} ${ok === 1 ? 'Nutzer' : 'Nutzer'} aktualisiert.`);
      else Toast.warning('Teilweise gespeichert', `${ok} aktualisiert, ${fail} fehlgeschlagen.`);
    });
  }

  /* Manueller Entra-Sync (developer-only Seite) */
  document.getElementById('nvSyncBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('nvSyncBtn');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Synchronisiere…';
    try {
      const r = await DB.runEntraSync();
      if (r.ok) {
        Toast.success('Sync abgeschlossen', `${r.upserted} aktualisiert, ${r.deactivated} deaktiviert`);
        users = await DB.getAllUsers();
        renderPage(users);
      } else {
        Toast.error('Sync fehlgeschlagen', r.errors?.[0] || 'unbekannt');
      }
    } catch (e) {
      Toast.error('Sync fehlgeschlagen', e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  /* ── API-Zugriff (MCP) ───────────────────────────────────────────── */
  let apiKeys = [];
  const akBody = document.getElementById('akTableBody');

  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function renderApiKeys() {
    if (!apiKeys.length) {
      akBody.innerHTML = `<tr><td colspan="6"><div class="nv-empty">Noch niemand für den API-Zugriff aufgenommen.</div></td></tr>`;
      return;
    }
    akBody.innerHTML = apiKeys.map(k => `
      <tr data-id="${k.Id}">
        <td><div class="nv-table__name">${esc(k.UserName || '—')}</div><div class="nv-table__email">${esc(k.UserEmail || '')}</div></td>
        <td>${esc(k.Label || '—')}</td>
        <td>${fmtDate(k.ErstelltAm)}</td>
        <td>${fmtDate(k.ZuletztGenutzt)}</td>
        <td>${k.Aktiv ? '<span class="badge badge--genehmigt">aktiv</span>' : '<span class="badge badge--grey">deaktiviert</span>'}</td>
        <td class="nv-table__actions">
          <button class="btn btn-sm btn-outline ak-toggle" type="button" data-id="${k.Id}" data-aktiv="${k.Aktiv ? 1 : 0}">${k.Aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
          <button class="btn btn-sm btn-outline ak-del" type="button" data-id="${k.Id}">Löschen</button>
        </td>
      </tr>`).join('');
    akBody.querySelectorAll('.ak-toggle').forEach(b => b.addEventListener('click', async () => {
      try { await DB.setApiKeyAktiv(Number(b.dataset.id), b.dataset.aktiv !== '1'); await loadApiKeys(); }
      catch (e) { Toast.error('Fehler', e.message); }
    }));
    akBody.querySelectorAll('.ak-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Diesen API-Schlüssel unwiderruflich löschen? Der Zugriff wird sofort gesperrt.')) return;
      try { await DB.deleteApiKey(Number(b.dataset.id)); await loadApiKeys(); Toast.success('Gelöscht'); }
      catch (e) { Toast.error('Fehler', e.message); }
    }));
  }

  async function loadApiKeys() {
    try { apiKeys = await DB.getApiKeys(); }
    catch (e) { apiKeys = []; Toast.error('API-Schlüssel konnten nicht geladen werden', e.message); }
    renderApiKeys();
  }

  function openAkAdd() {
    let ov = document.getElementById('akAddModal'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'akAddModal';
    const opts = users.filter(u => u.aktiv !== false)
      .map(u => `<option value="${esc(u.oid)}">${esc(displayName(u.name))} — ${esc(u.email)}</option>`).join('');
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header"><h2 class="modal__title">Nutzer für API-Zugriff aufnehmen</h2>
          <button class="modal__close" type="button" data-x aria-label="Schließen">&times;</button></div>
        <div class="modal__body">
          <div class="form-group">
            <label class="form-label" for="akUser">Nutzer</label>
            <select class="form-control" id="akUser" data-pm-search="Nutzer suchen …">${opts}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="akLabel">Bezeichnung <span class="form-hint">· z.B. Gerät oder Client</span></label>
            <input class="form-control" id="akLabel" placeholder="z.B. Claude Desktop – Laptop" autocomplete="off">
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" data-x>Abbrechen</button>
          <button class="btn btn-primary" type="button" id="akCreate">Schlüssel erstellen</button>
        </div>
      </div>`;
    document.body.appendChild(ov); ov.classList.add('open');
    ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => ov.remove()));
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#akCreate').addEventListener('click', async () => {
      const userOid = document.getElementById('akUser').value;
      const labelVal = document.getElementById('akLabel').value.trim();
      if (!userOid) { Toast.error('Bitte einen Nutzer wählen.'); return; }
      try {
        const res = await DB.createApiKey(userOid, labelVal);
        ov.remove();
        showKeyOnce(res.key);
        await loadApiKeys();
      } catch (e) { Toast.error('Fehler', e.message); }
    });
  }

  function showKeyOnce(key) {
    const ov = document.createElement('div'); ov.className = 'modal-overlay open'; ov.id = 'akKeyModal';
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header"><h2 class="modal__title">API-Schlüssel erstellt</h2></div>
        <div class="modal__body">
          <p style="margin:0 0 12px;color:var(--pm-grey-700);font-size:var(--text-sm);line-height:1.5">
            <strong>Nur jetzt sichtbar.</strong> Kopieren und im Client hinterlegen — danach ist nur der Hash gespeichert und der Schlüssel nicht mehr abrufbar. Verloren? Einfach einen neuen erstellen.</p>
          <div style="display:flex;gap:8px">
            <input class="form-control" id="akKeyVal" readonly value="${esc(key)}" style="font-family:ui-monospace,Menlo,monospace">
            <button class="btn btn-secondary" type="button" id="akCopy">Kopieren</button>
          </div>
        </div>
        <div class="modal__footer"><button class="btn btn-primary" type="button" id="akKeyClose">Fertig</button></div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('#akKeyClose').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#akCopy').addEventListener('click', () => {
      const inp = document.getElementById('akKeyVal'); inp.select();
      const done = () => Toast.success('Kopiert');
      if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done).catch(() => { try { document.execCommand('copy'); done(); } catch (_) {} });
      else { try { document.execCommand('copy'); done(); } catch (_) {} }
    });
  }

  document.getElementById('akAddBtn')?.addEventListener('click', openAkAdd);
  loadApiKeys();

  /* ── Berufe-Katalog ──────────────────────────────────────────────── */
  let berufe = [];
  const bfBody = document.getElementById('bfTableBody');
  const BEREICH_LABELS = { technisch: 'Technisch', kaufmaennisch: 'Kaufmännisch' };

  function renderBerufe() {
    if (!berufe.length) {
      bfBody.innerHTML = `<tr><td colspan="3"><div class="nv-empty">Noch keine Berufe im Katalog.</div></td></tr>`;
      return;
    }
    bfBody.innerHTML = berufe.map(b => `
      <tr data-id="${b.id}">
        <td>${esc(b.beruf)}</td>
        <td>${esc(BEREICH_LABELS[b.bereich] || b.bereich)}</td>
        <td class="nv-table__actions">
          <button class="btn btn-sm btn-outline bf-edit" type="button" data-id="${b.id}">Bearbeiten</button>
          <button class="btn btn-sm btn-outline bf-del" type="button" data-id="${b.id}">Löschen</button>
        </td>
      </tr>`).join('');
    bfBody.querySelectorAll('.bf-edit').forEach(btn => btn.addEventListener('click', () =>
      openBerufModal(berufe.find(b => b.id === Number(btn.dataset.id)))));
    bfBody.querySelectorAll('.bf-del').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Diesen Beruf aus dem Katalog löschen?')) return;
      try {
        await DB.deleteBeruf(Number(btn.dataset.id));
        berufe = berufe.filter(b => b.id !== Number(btn.dataset.id));
        renderBerufe();
        Toast.success('Gelöscht');
      } catch (e) { Toast.error('Fehler', e.message); }
    }));
  }

  async function loadBerufe() {
    try { berufe = await DB.getBerufe(); }
    catch (e) { berufe = []; Toast.error('Berufe konnten nicht geladen werden', e.message); }
    renderBerufe();
  }

  function openBerufModal(beruf) {
    let ov = document.getElementById('bfEditModal'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'bfEditModal';
    const bekannteBerufe = [...new Set(users.map(u => u.beruf).filter(Boolean))].sort((a, b2) => a.localeCompare(b2, 'de'));
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header"><h2 class="modal__title">${beruf ? 'Beruf bearbeiten' : 'Beruf hinzufügen'}</h2>
          <button class="modal__close" type="button" data-x aria-label="Schließen">&times;</button></div>
        <div class="modal__body">
          <form class="nv-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="bfBeruf">Beruf</label>
              <input class="form-control" id="bfBeruf" list="bfBerufVorschlaege" value="${esc(beruf?.beruf || '')}" autocomplete="off">
              <datalist id="bfBerufVorschlaege">${bekannteBerufe.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
            </div>
            <div class="form-group">
              <label class="form-label" for="bfBereich">Bereich</label>
              <select class="form-control" id="bfBereich">
                <option value="technisch" ${beruf?.bereich === 'technisch' ? 'selected' : ''}>Technisch</option>
                <option value="kaufmaennisch" ${beruf?.bereich !== 'technisch' ? 'selected' : ''}>Kaufmännisch</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" data-x>Abbrechen</button>
          <button class="btn btn-primary" type="button" id="bfSaveBtn">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(ov); ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#bfSaveBtn').addEventListener('click', async () => {
      const fields = { beruf: document.getElementById('bfBeruf').value.trim(), bereich: document.getElementById('bfBereich').value };
      if (!fields.beruf) { Toast.error('Bitte einen Beruf angeben.'); return; }
      try {
        const saved = beruf ? await DB.updateBeruf(beruf.id, fields) : await DB.createBeruf(fields);
        const idx = berufe.findIndex(b => b.id === saved.id);
        if (idx !== -1) berufe[idx] = saved; else berufe.push(saved);
        berufe.sort((a, b2) => a.beruf.localeCompare(b2.beruf, 'de'));
        renderBerufe();
        close();
        Toast.success('Gespeichert');
      } catch (e) { Toast.error('Fehler', e.message); }
    });
  }

  document.getElementById('bfAddBtn')?.addEventListener('click', () => openBerufModal(null));
  loadBerufe();
});
