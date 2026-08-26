/* ===================================================================
   BEURTEILUNGEN-LISTE.JS
   Eigenständiger Reiter: Liste aller Zuweisungen, die der Nutzer beurteilen
   darf (Ausbilder/Prüfer/Admin/Developer — nicht Azubi).

   Admin/Developer (globale Sicht) und dauerhafte Ausbilder bekommen einen
   Azubi-Selector (wie Wochen-/Jahresansicht) und sehen nur die Beurteilungen
   des gewählten Azubis. Reine Prüfer behalten ihre kleine, ohnehin meist auf
   einen Azubi begrenzte flache Liste unverändert.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-beurteilungen', [{ label: 'Beurteilungen', href: 'beurteilungen.html' }]);
  if (!user) return;
  document.body.dataset.page = 'beurteilungen-liste';

  const mitSelector = user.role === 'admin' || user.role === 'developer'
    || (user.istAusbilder && !user.istReinerPruefer);

  // Von der Dashboard-Kachel "Offene Beurteilungen" kommt man mit diesem
  // Filter direkt hier an, statt blind bei irgendeiner Beurteilung zu landen.
  const nurOffen = new URLSearchParams(window.location.search).get('filter') === 'offen';

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Beurteilungen</h1>
    </div></div>
    <div id="beurtSelectorWrap"></div>
    <div id="beurtListWrap"></div>`;
  const selectorWrap = document.getElementById('beurtSelectorWrap');
  const listWrap = document.getElementById('beurtListWrap');

  function renderListe(liste) {
    const gefiltert = nurOffen ? liste.filter(b => b.status === 'offen') : liste;
    if (!gefiltert.length) {
      listWrap.innerHTML = nurOffen
        ? `<div class="durchlauf-empty">Keine offenen Beurteilungen vorhanden.</div>`
        : `<div class="durchlauf-empty">Keine Beurteilungen vorhanden.</div>`;
      return;
    }
    const hinweis = nurOffen
      ? `<p class="durchlauf-hinweis"><a href="beurteilungen.html">Alle Beurteilungen anzeigen</a></p>`
      : '';
    listWrap.innerHTML = `${hinweis}<div class="durchlauf-list">${gefiltert.map(b => `
      <div class="durchlauf-card durchlauf-card--clickable" data-zuw="${b.zuweisungId}" role="button" tabindex="0">
        <span class="badge ${b.status === 'abgeschlossen' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
          ${b.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Offen'}
        </span>
        <div class="durchlauf-card__abt">${escapeHtml(displayName(b.azubiName))}${b.abteilung ? ' · ' + escapeHtml(b.abteilung) : ''}${b.typ === 'kurz' ? ' <span class="badge badge--freigegeben">Kurzfeedback</span>' : ''}</div>
        <div class="durchlauf-card__zeit">${DateUtil.formatDate(b.von)} – ${DateUtil.formatDate(b.bis)}</div>
      </div>
    `).join('')}</div>`;

    listWrap.querySelectorAll('.durchlauf-card--clickable').forEach(el => {
      const go = () => { window.location.href = `beurteilung.html?zuw=${el.dataset.zuw}`; };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  async function ladeUndZeige(azubiOid) {
    try {
      renderListe(await DB.getMeineBeurteilungen(azubiOid));
    } catch (err) {
      listWrap.innerHTML = `<div class="durchlauf-empty">Beurteilungen konnten nicht geladen werden.</div>`;
      if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Beurteilungen konnten nicht geladen werden.');
    }
  }

  // Von beurteilung.html kommt man per history.back() hierher zurück (z. B.
  // nach "Abschließen"). Der Browser stellt das Dokument dabei oft aus dem
  // BFCache wieder her (pageshow mit persisted=true) statt es neu zu laden –
  // DOMContentLoaded feuert dann NICHT erneut, die Liste zeigt also weiter
  // den Stand von vor dem Abschließen (gerade abgeschlossene Beurteilung
  // erscheint fälschlich noch als "Offen"). Deshalb hier gezielt neu laden,
  // analog zum selben BFCache-Fix in dashboard.js.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const azubiOid = mitSelector ? document.getElementById('azubiSelect')?.value : undefined;
    ladeUndZeige(azubiOid);
  });

  if (!mitSelector) {
    await ladeUndZeige();
    return;
  }

  try {
    const azubis = await DB.getSelectableAzubis();
    if (!azubis.length) {
      listWrap.innerHTML = `<div class="durchlauf-empty">Aktuell kein Azubi zugewiesen.</div>`;
      return;
    }
    const persisted = getPersistedAzubiId();
    const start = (persisted && azubis.some(a => String(a.id) === String(persisted))) ? persisted : azubis[0].id;
    selectorWrap.innerHTML = renderAzubiSelect(azubis, start);
    document.getElementById('azubiSelect').addEventListener('change', (e) => {
      setPersistedAzubiId(e.target.value);
      ladeUndZeige(e.target.value);
    });
    setPersistedAzubiId(start);
    await ladeUndZeige(start);
  } catch (err) {
    listWrap.innerHTML = `<div class="durchlauf-empty">Beurteilungen konnten nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Beurteilungen konnten nicht geladen werden.');
  }
});
