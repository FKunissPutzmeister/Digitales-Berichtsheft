/* IHK-Import-Archiv (developer-only): die serverseitig abgelegten Original-PDFs
   (backend/data/ihk-imports/) durchsuchen, direkt im Browser ansehen und
   herunterladen — sonst käme man nur per RDP auf dem Server an die Dateien. */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-ihk-archiv', [{ label: 'IHK-Import-Archiv', href: 'ihk-archiv.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }
  document.body.dataset.page = 'ihk-archiv';

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  let alle = [], suche = '', aktiv = null;

  const datum = a => String(a.hochgeladenAm || '').slice(0, 10);
  /* Titel/Dateiname enthält den Azubi-Namen, damit die PDF nicht als
     „2026-07-30T12-00-00-000Z_export.pdf" im Download-Ordner landet. */
  const dateiname = a => `${(a.azubiName || a.oid)} ${datum(a)}`.trim() + '.pdf';
  const suchtext = a => `${a.azubiName || ''} ${a.origName || ''} ${a.oid} ${datum(a)}`.toLowerCase();
  const treffer = () => (suche ? alle.filter(a => suchtext(a).includes(suche)) : alle);

  function listeHtml() {
    const t = treffer();
    if (!t.length) return `<p class="ia-empty">${alle.length ? 'Kein Treffer.' : 'Keine archivierten Importe.'}</p>`;
    return t.map(a => `
      <div class="ia-item${a === aktiv ? ' ia-item--aktiv' : ''}">
        <button class="ia-item__pick" type="button" data-key="${esc(a.oid + '/' + a.datei)}"
                ${a === aktiv ? 'aria-current="true"' : ''}>
          <span class="ia-item__name">${esc(a.azubiName || a.oid)}</span>
          <span class="ia-item__meta">${esc(new Date(a.hochgeladenAm).toLocaleString('de-DE'))} ·
            ${Math.round(a.groesseBytes / 1024)} KB${a.wochen != null ? ` · ${a.wochen} Wochen` : ''}${a.modus ? ` · ${esc(a.modus)}` : ''}</span>
          ${a.warnungen.length ? `<span class="ia-item__warn">${a.warnungen.length} Warnungen</span>` : ''}
        </button>
        <a class="ia-item__dl" href="${DB.ihkImportUrl(a.oid, a.datei)}" download="${esc(dateiname(a))}"
           aria-label="${esc(dateiname(a))} herunterladen" title="Herunterladen">${Icon('download', { size: 18 })}</a>
      </div>`).join('');
  }

  function vorschauHtml() {
    if (!aktiv) return '<p class="ia-empty">Import auswählen.</p>';
    const url = DB.ihkImportUrl(aktiv.oid, aktiv.datei);
    const name = dateiname(aktiv);
    return `
      <div class="ia-viewer__head">
        <span class="ia-viewer__title" title="${esc(aktiv.origName)}">${esc(name)}</span>
        <a class="btn btn-sm btn-outline" href="${url}" target="_blank" rel="noopener">Neuer Tab</a>
        <a class="btn btn-sm btn-primary" href="${url}" download="${esc(name)}">Herunterladen</a>
      </div>
      <iframe class="ia-frame" src="${url}#view=FitH" title="Vorschau ${esc(name)}"></iframe>`;
  }

  // Liste und Vorschau getrennt zeichnen: beim Tippen darf die PDF nicht neu laden.
  const zeichneListe    = () => { document.getElementById('iaListe').innerHTML = listeHtml(); };
  const zeichneVorschau = () => { document.getElementById('iaViewer').innerHTML = vorschauHtml(); };

  function render() {
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left"><h1 class="page-title">IHK-Import-Archiv</h1></div></div>
      <div class="ia-split">
        <div>
          <input class="form-control ia-search" type="search" id="iaSuche" placeholder="Azubi suchen…"
                 autocomplete="off" spellcheck="false" value="${esc(suche)}">
          <div class="ia-list" id="iaListe">${listeHtml()}</div>
        </div>
        <div class="ia-viewer" id="iaViewer">${vorschauHtml()}</div>
      </div>`;

    document.getElementById('iaSuche').addEventListener('input', e => {
      suche = e.target.value.trim().toLowerCase();
      zeichneListe();
    });
    document.getElementById('iaListe').addEventListener('click', e => {
      const btn = e.target.closest('[data-key]');
      if (!btn) return;
      aktiv = alle.find(a => a.oid + '/' + a.datei === btn.dataset.key) || null;
      zeichneListe();
      zeichneVorschau();
    });
  }

  try {
    alle = await DB.listIhkImports();
    aktiv = alle[0] || null;   // neuester Import (Server sortiert absteigend) direkt zeigen
  } catch (e) {
    main.innerHTML = `<div class="card"><div class="card__body"><p style="color:var(--color-error)">Laden fehlgeschlagen: ${esc(e.message)}</p></div></div>`;
    return;
  }
  render();
});
