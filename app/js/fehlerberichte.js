document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-fehlerberichte', [{ label: 'Fehlerberichte', href: 'fehlerberichte.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }
  document.body.dataset.page = 'fehlerberichte';

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  let filterErledigt = false;

  async function laden() {
    let rows;
    try {
      rows = await apiFetch(`/dev/errors?erledigt=${filterErledigt}`);
    } catch (e) {
      main.innerHTML = `<div class="card"><div class="card__body"><p style="color:var(--color-error)">Laden fehlgeschlagen: ${esc(e.message)}</p></div></div>`;
      return;
    }
    render(rows);
  }

  function zeile(r) {
    const kontext = r.Kontext ? esc(r.Kontext) : '';
    return `
      <div class="fb-row" data-id="${r.Id}">
        <div class="fb-row__head">
          <span class="fb-badge fb-badge--${esc(r.Quelle)}">${esc(r.Quelle)}</span>
          <span class="fb-count">×${r.Anzahl}</span>
          <span class="fb-time">${esc(new Date(r.LetzterZeitpunkt).toLocaleString('de-DE'))}</span>
          <span class="fb-user">${esc(r.BenutzerName || '—')}</span>
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
        <label class="fb-filter"><input type="checkbox" id="fbErledigt" ${filterErledigt ? 'checked' : ''}> Erledigte anzeigen</label>
      </div>
      <div class="fb-list">${rows.length ? rows.map(zeile).join('') : '<p class="fb-empty">Keine Fehler.</p>'}</div>`;
    document.getElementById('fbErledigt').addEventListener('change', e => { filterErledigt = e.target.checked; laden(); });
    main.querySelectorAll('[data-resolve]').forEach(btn => btn.addEventListener('click', async () => {
      try { await apiFetch(`/dev/errors/${btn.dataset.resolve}`, { method: 'PATCH' }); laden(); }
      catch (e) { Toast.error('Fehler', 'Konnte nicht aktualisieren.'); }
    }));
  }

  laden();
});
