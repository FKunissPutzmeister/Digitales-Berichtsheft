/* ===================================================================
   ABTEILUNGSVERWALTUNG.JS – Developer-only Abteilungs-Katalog
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-abteilungsverwaltung', [{ label: 'Abteilungen', href: 'abteilungsverwaltung.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;

  let abteilungen;
  try { abteilungen = await DB.getAbteilungen({ all: true }); }
  catch (e) {
    main.innerHTML = `<div class="page-header"><div class="page-header__left"><h1 class="page-title">Abteilungen</h1></div></div>
      <div class="card"><div class="card__body"><p style="color:var(--color-error)">Fehler beim Laden: ${esc(e.message)}</p></div></div>`;
    return;
  }

  let editing = null; // Abteilung im Modal (null = neu)

  function renderRow(a) {
    const pmm = a.istPmm ? `<span class="badge badge--freigegeben">PMM</span>` : '';
    const status = a.aktiv ? `<span class="badge badge--genehmigt">aktiv</span>` : `<span class="badge badge--grey">inaktiv</span>`;
    const verantw = (a.verantwortliche || []).length
      ? `<ul class="av-verantw-list">${a.verantwortliche.map(v => `<li title="${esc(v.email)}">${esc(displayName(v.name))}</li>`).join('')}</ul>`
      : `<span style="color:var(--pm-grey-500)">— keine —</span>`;
    return `<tr data-id="${a.id}">
      <td><div>${esc(a.name)}</div> ${pmm}</td>
      <td>${verantw}</td>
      <td>${status}</td>
      <td><button class="btn btn-sm btn-outline av-edit-btn" type="button" data-id="${a.id}">Bearbeiten</button></td>
    </tr>`;
  }

  function renderTable(list) {
    if (!list.length) return `<tr><td colspan="4"><div class="av-empty">Keine Abteilungen.</div></td></tr>`;
    return list.map(renderRow).join('');
  }

  function filter(q) {
    q = q.trim().toLowerCase();
    if (!q) return abteilungen;
    return abteilungen.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.verantwortliche || []).some(v => (v.name + ' ' + v.email).toLowerCase().includes(q)));
  }

  function renderList(list) {
    const tbody = document.getElementById('avTableBody');
    if (!tbody) return;
    tbody.innerHTML = renderTable(list);
    tbody.querySelectorAll('.av-edit-btn').forEach(b => b.addEventListener('click', () => openModal(abteilungen.find(a => a.id === Number(b.dataset.id)))));
  }

  /* ── Modal ── */
  function buildModal() {
    if (document.getElementById('avEditModal')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'avEditModal';
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header"><h2 class="modal__title" id="avModalTitle">Abteilung</h2>
          <button class="modal__close" type="button" aria-label="Schließen">&times;</button></div>
        <div class="modal__body">
          <div class="form-group"><label class="form-label" for="avName">Name</label>
            <input class="form-control" type="text" id="avName" placeholder="z. B. Einkauf PMM"></div>
          <div class="av-form__checks">
            <label class="av-form__check-label"><input type="checkbox" id="avIstPmm"> PMM-Abteilung</label>
            <label class="av-form__check-label"><input type="checkbox" id="avAktiv" checked> Aktiv</label>
          </div>
          <div class="form-group" id="avVerantwGroup" style="margin-top:var(--sp-4)">
            <label class="form-label">Verantwortliche (E-Mail)</label>
            <ul class="av-verantw-list" id="avVerantwList"></ul>
            <div class="av-toolbar" style="margin-top:var(--sp-2)">
              <input class="form-control" type="email" id="avNewEmail" placeholder="vorname.nachname@putzmeister.com" autocomplete="off">
              <button class="btn btn-sm btn-outline" type="button" id="avAddVerantwBtn">Hinzufügen</button>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" id="avDeleteBtn" style="margin-right:auto">Löschen</button>
          <button class="btn btn-outline" type="button" id="avCancelBtn">Abbrechen</button>
          <button class="btn btn-primary" type="button" id="avSaveBtn">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.modal__close').addEventListener('click', closeModal);
    document.getElementById('avCancelBtn').addEventListener('click', closeModal);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    document.getElementById('avSaveBtn').addEventListener('click', handleSave);
    document.getElementById('avDeleteBtn').addEventListener('click', handleDelete);
    document.getElementById('avAddVerantwBtn').addEventListener('click', handleAddVerantw);
  }

  function renderVerantwInModal() {
    const ul = document.getElementById('avVerantwList');
    const group = document.getElementById('avVerantwGroup');
    if (!editing) { group.style.display = 'none'; return; }
    group.style.display = '';
    const list = editing.verantwortliche || [];
    ul.innerHTML = list.length
      ? list.map(v => `<li title="${esc(v.email)}">${esc(displayName(v.name))} <button class="av-vremove" type="button" data-vid="${v.id}">✕</button></li>`).join('')
      : `<li style="color:var(--pm-grey-500)">— keine —</li>`;
    ul.querySelectorAll('.av-vremove').forEach(b => b.addEventListener('click', () => handleRemoveVerantw(Number(b.dataset.vid))));
  }

  function openModal(a) {
    editing = a || null;
    document.getElementById('avModalTitle').textContent = a ? 'Abteilung bearbeiten' : 'Neue Abteilung';
    document.getElementById('avName').value = a ? a.name : '';
    document.getElementById('avIstPmm').checked = a ? !!a.istPmm : false;
    document.getElementById('avAktiv').checked = a ? a.aktiv !== false : true;
    document.getElementById('avDeleteBtn').style.display = a ? '' : 'none';
    document.getElementById('avNewEmail').value = '';
    renderVerantwInModal();
    document.getElementById('avEditModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    document.getElementById('avEditModal')?.classList.remove('open');
    document.body.style.overflow = ''; editing = null;
  }

  function upsertLocal(updated) {
    const idx = abteilungen.findIndex(a => a.id === updated.id);
    if (idx === -1) abteilungen.push(updated); else abteilungen[idx] = updated;
    abteilungen.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function handleSave() {
    const btn = document.getElementById('avSaveBtn'); btn.disabled = true;
    const fields = {
      name: document.getElementById('avName').value.trim(),
      istPmm: document.getElementById('avIstPmm').checked,
      aktiv: document.getElementById('avAktiv').checked,
    };
    if (!fields.name) { Toast.error('Pflichtfeld', 'Name ist Pflicht.'); btn.disabled = false; return; }
    try {
      const saved = editing ? await DB.updateAbteilung(editing.id, fields) : await DB.createAbteilung(fields);
      upsertLocal(saved);
      Toast.success('Gespeichert');
      renderList(filter(document.getElementById('avSearch').value));
      closeModal();
    } catch (e) { Toast.error('Fehler', e.message); } finally { btn.disabled = false; }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Abteilung „${editing.name}" wirklich löschen?`)) return;
    try {
      await DB.deleteAbteilung(editing.id);
      abteilungen = abteilungen.filter(a => a.id !== editing.id);
      Toast.success('Gelöscht');
      renderList(filter(document.getElementById('avSearch').value));
      closeModal();
    } catch (e) { Toast.error('Fehler', e.message); }
  }

  async function handleAddVerantw() {
    if (!editing) return;
    const email = document.getElementById('avNewEmail').value.trim();
    if (!email || !email.includes('@')) { Toast.error('Ungültig', 'Bitte gültige E-Mail angeben.'); return; }
    try {
      const v = await DB.addVerantwortliche(editing.id, email);
      editing.verantwortliche = [...(editing.verantwortliche || []), v].sort((a, b) => a.name.localeCompare(b.name));
      upsertLocal(editing);
      document.getElementById('avNewEmail').value = '';
      renderVerantwInModal();
      renderList(filter(document.getElementById('avSearch').value));
    } catch (e) { Toast.error('Fehler', e.message); }
  }

  async function handleRemoveVerantw(vid) {
    if (!editing) return;
    try {
      await DB.removeVerantwortliche(editing.id, vid);
      editing.verantwortliche = (editing.verantwortliche || []).filter(v => v.id !== vid);
      upsertLocal(editing);
      renderVerantwInModal();
      renderList(filter(document.getElementById('avSearch').value));
    } catch (e) { Toast.error('Fehler', e.message); }
  }

  /* ── Seite aufbauen ── */
  main.innerHTML = `
    <div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Abteilungen</h1>
      <p class="page-subtitle">Abteilungs-Katalog und verantwortliche Prüfer verwalten</p>
    </div></div>
    <div class="card"><div class="card__body">
      <div class="av-toolbar">
        <input class="form-control" type="search" id="avSearch" placeholder="Suchen (Abteilung, Verantwortliche)…" autocomplete="off">
        <span class="av-spacer"></span>
        <button class="btn btn-primary" type="button" id="avNewBtn">${Icon('add')} Neue Abteilung</button>
      </div>
      <div style="overflow-x:auto"><table class="av-table">
        <thead><tr><th>Abteilung</th><th>Verantwortliche</th><th>Status</th><th></th></tr></thead>
        <tbody id="avTableBody"></tbody>
      </table></div>
    </div></div>`;

  buildModal();
  renderList(abteilungen);
  document.getElementById('avSearch').addEventListener('input', (e) => renderList(filter(e.target.value)));
  document.getElementById('avNewBtn').addEventListener('click', () => openModal(null));
});
