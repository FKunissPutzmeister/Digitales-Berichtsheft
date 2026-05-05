/* ===================================================================
   JAHRESANSICHT.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const user = initPage('nav-jahresansicht', [{ label: 'Jahresansicht', href: 'jahresansicht.html' }]);
  if (!user) return;

  let currentYear = new Date().getFullYear();
  let viewAzubiId = user.role === 'azubi' ? user.id : null;

  function getStatusFuerTag(wochen, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const kw = DateUtil.getKW(d);
    const year = DateUtil.getKWYear(d);
    const woche = wochen.find(w => w.kw === kw && w.year === year);
    if (!woche) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) return 'frei';
      return 'offen';
    }
    return woche.status;
  }

  function render() {
    const azubiId = viewAzubiId || user.id;
    const wochen = DB.getWochenFuerAzubi(azubiId);
    const isAusbilder = ['ausbilder', 'admin'].includes(user.role);
    const main = document.getElementById('mainContent');

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Jahresansicht</h1>
          <p class="page-subtitle">Alle Kalenderwochen des Jahres ${currentYear} im Überblick.</p>
        </div>
      </div>

      ${isAusbilder ? renderAzubiSelector(azubiId) : ''}

      <div class="year-header">
        <div class="year-nav">
          <button class="year-nav__btn" id="prevYearBtn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="year-nav__year">${currentYear}</div>
          <button class="year-nav__btn" id="nextYearBtn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      <div class="year-legend">
        <div class="legend-item"><div class="week-status-dot week-status-dot--offen" style="flex-shrink:0"></div> Noch nicht freigegeben</div>
        <div class="legend-item"><div class="week-status-dot week-status-dot--freigegeben" style="flex-shrink:0"></div> Zur Abnahme freigegeben</div>
        <div class="legend-item"><div class="week-status-dot week-status-dot--genehmigt" style="flex-shrink:0"></div> Genehmigt</div>
        <div class="legend-item"><div class="week-status-dot week-status-dot--abgelehnt" style="flex-shrink:0"></div> Abgelehnt / Zurückgegeben</div>
        <div class="legend-item"><div class="legend-dot legend-dot--frei"></div> Wochenende / Frei</div>
      </div>

      <div class="year-calendar" id="yearCalendar">
        ${buildYearCalendar(currentYear, wochen)}
      </div>
    `;

    document.getElementById('prevYearBtn')?.addEventListener('click', () => { currentYear--; render(); });
    document.getElementById('nextYearBtn')?.addEventListener('click', () => { currentYear++; render(); });

    document.querySelectorAll('.ausbilder-chip[data-azubi-id]').forEach(btn => {
      btn.addEventListener('click', () => { viewAzubiId = parseInt(btn.dataset.azubiId); render(); });
    });

    // Wochenzeile klickbar → Wochenansicht
    document.querySelectorAll('.week-row[data-kw]').forEach(el => {
      el.addEventListener('click', () => {
        sessionStorage.setItem('gotoKW', el.dataset.kw);
        sessionStorage.setItem('gotoYear', el.dataset.year);
        window.location.href = 'wochenansicht.html';
      });
    });
  }

  function renderAzubiSelector(currentId) {
    const azubis = DB.getAzubis();
    return `
      <div style="margin-bottom:var(--sp-5);display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap">
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--pm-grey-600)">Azubi:</span>
        ${azubis.map(a => `
          <button class="ausbilder-chip ${a.id === currentId ? 'selected' : ''}" data-azubi-id="${a.id}">
            <div class="avatar" style="width:28px;height:28px;font-size:11px">${a.initials}</div>
            ${a.name}
          </button>
        `).join('')}
      </div>
    `;
  }

  function buildYearCalendar(year, wochen) {
    return DateUtil.MONTHS.map((monthName, monthIdx) => {
      const firstDay = new Date(year, monthIdx, 1);
      const lastDay = new Date(year, monthIdx + 1, 0);

      // Wochen des Monats bestimmen
      const weeks = getWeeksInMonth(year, monthIdx);

      return `
        <div class="month-block animate-fade-in" style="animation-delay:${monthIdx * 30}ms">
          <div class="month-block__header">
            <span class="month-block__name">${monthName} ${year}</span>
          </div>
          <div class="month-block__weekdays">
            <span class="month-block__weekday-kw">KW</span>
            ${['Mo','Di','Mi','Do','Fr','Sa','So'].map((d, i) =>
              `<span class="month-block__weekday-label${i >= 5 ? ' weekend' : ''}">${d}</span>`
            ).join('')}
          </div>
          <div class="month-block__grid">
            ${weeks.map(week => buildWeekRow(week, monthIdx, year, wochen)).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function getWeeksInMonth(year, monthIdx) {
    const weeks = [];
    const firstDay = new Date(year, monthIdx, 1);
    // Finde Montag der ersten Woche des Monats
    const firstMonday = new Date(firstDay);
    const dow = firstMonday.getDay() || 7;
    firstMonday.setDate(firstMonday.getDate() - dow + 1);

    let current = new Date(firstMonday);
    while (current.getMonth() <= monthIdx || current.getFullYear() < year) {
      if (current.getFullYear() > year) break;
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      // Nur anzeigen wenn mind. 1 Tag im Monat
      if (week.some(d => d.getMonth() === monthIdx && d.getFullYear() === year)) {
        weeks.push(week);
      }
      if (current.getMonth() > monthIdx && current.getFullYear() >= year) break;
    }
    return weeks;
  }

  function buildWeekRow(week, monthIdx, year, wochen) {
    const monday = week[0];
    const kw = DateUtil.getKW(monday);
    const kwYear = DateUtil.getKWYear(monday);
    const todayStr = DateUtil.toISODate(new Date());
    const isCurrentKW = kw === DateUtil.getKW(new Date()) && kwYear === DateUtil.getKWYear(new Date());

    const woche = wochen.find(w => w.kw === kw && w.year === kwYear);
    const weekStatus = woche ? woche.status : 'offen';

    const cells = week.map(d => {
      const dateStr = DateUtil.toISODate(d);
      const inMonth = d.getMonth() === monthIdx && d.getFullYear() === year;
      const isToday = dateStr === todayStr;
      const isWE = d.getDay() === 0 || d.getDay() === 6;
      const status = inMonth ? getStatusFuerTag(wochen, dateStr) : '';

      let classes = 'day-cell';
      if (!inMonth) classes += ' empty';
      if (isToday) classes += ' today';
      if (!inMonth) return `<div class="${classes}"></div>`;
      if (isWE) classes += ' weekend status-frei';
      else if (status) classes += ' status-' + status;

      return `<div class="${classes}" title="${DateUtil.formatDate(dateStr)}">${d.getDate()}</div>`;
    }).join('');

    return `
      <div class="week-row week-row--clickable" data-kw="${kw}" data-year="${kwYear}" title="KW ${kw} öffnen">
        <div class="week-row__kw${isCurrentKW ? ' current-kw' : ''}">
          ${kw}
          <div class="week-status-dot week-status-dot--${weekStatus}"></div>
        </div>
        ${cells}
      </div>
    `;
  }

  function getStatusFuerTag(wochen, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const kw = DateUtil.getKW(d);
    const year = DateUtil.getKWYear(d);
    const woche = wochen.find(w => w.kw === kw && w.year === year);
    if (!woche) return 'offen';
    return woche.status;
  }

  render();
});
