/* ===================================================================
   BEURTEILUNGEN-LISTE.JS
   Eigenständiger Reiter: flache Liste aller Zuweisungen, die der Nutzer
   beurteilen darf (Ausbilder/Prüfer/Admin/Developer — nicht Azubi).
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-beurteilungen', [{ label: 'Beurteilungen', href: 'beurteilungen.html' }]);
  if (!user) return;
  document.body.dataset.page = 'beurteilungen-liste';

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Beurteilungen</h1>
    </div></div>
    <div id="beurtListWrap"></div>`;
  const wrap = document.getElementById('beurtListWrap');

  try {
    const liste = await DB.getMeineBeurteilungen();
    if (!liste.length) {
      wrap.innerHTML = `<div class="durchlauf-empty">Keine Beurteilungen vorhanden.</div>`;
      return;
    }
    wrap.innerHTML = `<div class="durchlauf-list">${liste.map(b => `
      <div class="durchlauf-card durchlauf-card--clickable" data-zuw="${b.zuweisungId}" role="button" tabindex="0">
        <span class="badge ${b.status === 'abgeschlossen' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
          ${b.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Offen'}
        </span>
        <div class="durchlauf-card__abt">${escapeHtml(b.azubiName)}${b.abteilung ? ' · ' + escapeHtml(b.abteilung) : ''}</div>
        <div class="durchlauf-card__zeit">${DateUtil.formatDate(b.von)} – ${DateUtil.formatDate(b.bis)}</div>
      </div>
    `).join('')}</div>`;

    wrap.querySelectorAll('.durchlauf-card--clickable').forEach(el => {
      const go = () => { window.location.href = `beurteilung.html?zuw=${el.dataset.zuw}`; };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  } catch (err) {
    wrap.innerHTML = `<div class="durchlauf-empty">Beurteilungen konnten nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Beurteilungen konnten nicht geladen werden.');
  }
});
