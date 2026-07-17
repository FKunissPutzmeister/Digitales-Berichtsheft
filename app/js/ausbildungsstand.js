/* ===================================================================
   AUSBILDUNGSSTAND.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-ausbildungsstand', [{ label: 'Ausbildungsstand', href: 'ausbildungsstand.html' }]);
  if (!user) return;
  if (user.istReinerPruefer) { window.location.href = 'dashboard.html'; return; }

  document.body.dataset.page = 'ausbildungsstand';

  let viewAzubiId = user.id;

  async function render() {
    const isAusbilder = ['pruefer', 'admin', 'developer'].includes(user.role);

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

    // Vorherige PMSelect-Instanz (Azubi-Dropdown) sauber trennen, bevor
    // innerHTML ersetzt wird – sonst lecken MutationObserver auf detachten Nodes.
    if (typeof PMSelect !== 'undefined') {
      PMSelect.closeAll();
      main.querySelectorAll('select[data-pm-enhanced]').forEach(s => {
        try { s._pmInstance && s._pmInstance.destroy(); } catch (e) { /* defensiv */ }
      });
    }

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Ausbildungsstand</h1>
        </div>
        ${isAusbilder ? `<div class="page-header__actions">${renderAzubiSelect(azubis, viewAzubiId)}</div>` : ''}
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

    const azubiSelectEl = document.getElementById('azubiSelect');
    if (azubiSelectEl) {
      azubiSelectEl.addEventListener('change', () => { viewAzubiId = azubiSelectEl.value; render(); });
    }
  }

  await render();
});
