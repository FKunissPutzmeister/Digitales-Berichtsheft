/* ===================================================================
   AUSBILDUNGSSTAND.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-ausbildungsstand', [{ label: 'Ausbildungsstand', href: 'ausbildungsstand.html' }]);
  if (!user) return;

  document.body.dataset.page = 'ausbildungsstand';

  let viewAzubiId = user.id;

  async function render() {
    const isAusbilder = ['ausbilder', 'admin'].includes(user.role);

    const wochen = await DB.getWochenFuerAzubi(viewAzubiId);
    const fehltage = wochen.reduce((sum, w) => {
      return sum + (w.tage || []).filter(t =>
        t.anwesenheit === 'krank' || t.anwesenheit === 'sonstige Abwesenheit'
      ).length;
    }, 0);
    const FEHLTAGE_SCHWELLE = 30;
    const fehltageProzent = Math.min(Math.round((fehltage / FEHLTAGE_SCHWELLE) * 100), 100);

    const azubis = await DB.getAzubis();

    const main = document.getElementById('mainContent');
    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Ausbildungsstand</h1>
          <p class="page-subtitle">Übersicht über Anwesenheit und Ausbildungsfortschritt.</p>
        </div>
        ${isAusbilder ? `
        <div class="page-header__actions">
          ${azubis.map(a => `
            <button class="ausbilder-chip ${a.id === viewAzubiId ? 'selected' : ''}" data-azubi-id="${a.id}">
              <div class="avatar" style="width:28px;height:28px;font-size:11px">${a.initials}</div>
              ${a.name}
            </button>
          `).join('')}
        </div>
        ` : ''}
      </div>

      <div class="stand-summary">
        <div class="circle-stat animate-fade-in">
          <div class="circle-stat__ring">
            <svg viewBox="0 0 80 80">
              <circle class="track" cx="40" cy="40" r="34"/>
              <circle class="fill ${fehltage >= 20 ? 'fill--error' : fehltage >= 10 ? 'fill--warning' : 'fill--success'}" cx="40" cy="40" r="34"
                      data-pct="${fehltageProzent}"/>
            </svg>
            <div class="circle-stat__value">
              <span class="circle-stat__num" data-len="${String(fehltage).length}">${fehltage}</span>
              <span class="circle-stat__unit">${fehltage === 1 ? 'Tag' : 'Tage'}</span>
            </div>
          </div>
          <span class="circle-stat__label">Fehltage</span>
          <span class="circle-stat__sub">krank + sonstige Abwesenheit</span>
        </div>
      </div>
    `;

    setTimeout(() => {
      document.querySelectorAll('.circle-stat__ring circle.fill').forEach(circle => {
        const pct = parseFloat(circle.dataset.pct) || 0;
        const r = 34;
        const circ = 2 * Math.PI * r;
        const offset = circ - (pct / 100) * circ;
        circle.style.strokeDasharray = circ;
        circle.style.strokeDashoffset = circ;
        setTimeout(() => { circle.style.strokeDashoffset = offset; }, 50);
      });
    }, 100);

    document.querySelectorAll('.ausbilder-chip[data-azubi-id]').forEach(btn => {
      btn.addEventListener('click', () => { viewAzubiId = btn.dataset.azubiId; render(); });
    });
  }

  await render();
});
