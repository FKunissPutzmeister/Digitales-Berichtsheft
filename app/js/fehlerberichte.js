document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-fehlerberichte', [{ label: 'Fehlerberichte', href: 'fehlerberichte.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }
  document.body.dataset.page = 'fehlerberichte';

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  let filterErledigt = false;
  let filterSchweregrad = '';

  const SEV_RANG = { hoch: 0, mittel: 1, gering: 2 };
  const SEV_OPTIONEN = ['hoch', 'mittel', 'gering'];

  async function laden() {
    let rows;
    try {
      let url = `/dev/errors?erledigt=${filterErledigt}`;
      if (filterSchweregrad) url += `&schweregrad=${filterSchweregrad}`;
      rows = await apiFetch(url);
    } catch (e) {
      main.innerHTML = `<div class="card"><div class="card__body"><p style="color:var(--color-error)">Laden fehlgeschlagen: ${esc(e.message)}</p></div></div>`;
      return;
    }
    rows.sort((a, b) => {
      const rang = (SEV_RANG[a.Schweregrad] ?? 1) - (SEV_RANG[b.Schweregrad] ?? 1);
      if (rang !== 0) return rang;
      return new Date(b.LetzterZeitpunkt) - new Date(a.LetzterZeitpunkt);
    });
    render(rows);
  }

  function sevOptionen(aktuell) {
    return SEV_OPTIONEN.map(s => `<option value="${s}" ${s === aktuell ? 'selected' : ''}>${s}</option>`).join('');
  }

  function zeile(r) {
    const kontext = r.Kontext ? esc(r.Kontext) : '';
    return `
      <div class="fb-row" data-id="${r.Id}">
        <div class="fb-row__head">
          <span class="fb-sev fb-sev--${esc(r.Schweregrad)}">${esc(r.Schweregrad)}</span>
          <span class="fb-badge fb-badge--${esc(r.Quelle)}">${esc(r.Quelle)}</span>
          <span class="fb-count">×${r.Anzahl}</span>
          <span class="fb-time">${esc(new Date(r.LetzterZeitpunkt).toLocaleString('de-DE'))}</span>
          <span class="fb-user">${esc(r.BenutzerName || '—')}</span>
          <select class="fb-sev-select" data-sev-id="${r.Id}">${sevOptionen(r.Schweregrad)}</select>
          ${r.Erledigt ? '' : `<button class="btn btn-sm btn-outline" data-resolve="${r.Id}">Erledigt</button>`}
        </div>
        <div class="fb-row__msg">${esc(r.Nachricht)}</div>
        ${r.Stack ? `<details class="fb-row__stack"><summary>Stacktrace</summary><pre>${esc(r.Stack)}</pre></details>` : ''}
        ${kontext ? `<details class="fb-row__ctx"><summary>Kontext</summary><pre>${kontext}</pre></details>` : ''}
      </div>`;
  }

  function render(rows) {
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left"><h1 class="page-title">Fehlerberichte</h1></div>
        <div class="fb-header-controls">
          <select class="fb-filter-sev" id="fbSevFilter">
            <option value="" ${filterSchweregrad === '' ? 'selected' : ''}>Alle Schweregrade</option>
            <option value="hoch" ${filterSchweregrad === 'hoch' ? 'selected' : ''}>hoch</option>
            <option value="mittel" ${filterSchweregrad === 'mittel' ? 'selected' : ''}>mittel</option>
            <option value="gering" ${filterSchweregrad === 'gering' ? 'selected' : ''}>gering</option>
          </select>
          <label class="fb-filter"><input type="checkbox" id="fbErledigt" ${filterErledigt ? 'checked' : ''}> Erledigte anzeigen</label>
        </div>
      </div>
      <div class="fb-list">${rows.length ? rows.map(zeile).join('') : '<p class="fb-empty">Keine Fehler.</p>'}</div>`;
    document.getElementById('fbErledigt').addEventListener('change', e => { filterErledigt = e.target.checked; laden(); });
    document.getElementById('fbSevFilter').addEventListener('change', e => { filterSchweregrad = e.target.value; laden(); });
    main.querySelectorAll('[data-resolve]').forEach(btn => btn.addEventListener('click', async () => {
      try { await apiFetch(`/dev/errors/${btn.dataset.resolve}`, { method: 'PATCH' }); laden(); }
      catch (e) { Toast.error('Fehler', 'Konnte nicht aktualisieren.'); }
    }));
    main.querySelectorAll('[data-sev-id]').forEach(sel => sel.addEventListener('change', async (e) => {
      const id = sel.dataset.sevId;
      try {
        await apiFetch('/dev/errors/' + id, { method: 'PATCH', body: { schweregrad: e.target.value } });
        laden();
      } catch (err) {
        if (typeof Toast !== 'undefined') Toast.error('Fehler', 'Konnte Schweregrad nicht ändern.');
      }
    }));
  }

  laden();
});
