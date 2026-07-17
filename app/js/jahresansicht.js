/* ===================================================================
   JAHRESANSICHT.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-jahresansicht', [{ label: 'Jahresansicht', href: 'jahresansicht.html' }]);
  if (!user) return;
  if (user.istReinerPruefer) { window.location.href = 'dashboard.html'; return; }

  // Layout-Marker: Jahresansicht braucht die volle Breite, damit die
  // 12-Monats-Kalenderkacheln nebeneinander Platz finden.
  document.body.dataset.page = 'jahresansicht';

  let currentYear = new Date().getFullYear();
  let viewAzubiId = user.istAzubi ? user.id : null;
  const isAusbilder = ['pruefer', 'admin', 'developer'].includes(user.role);

  // Azubi aus sessionStorage übernehmen (Navigation von Wochenansicht/Dashboard)
  const savedAzubiId = sessionStorage.getItem('gotoAzubiId');
  if (savedAzubiId && isAusbilder) {
    // Expliziter Sprung aus Wochenansicht/Dashboard hat Vorrang.
    viewAzubiId = savedAzubiId;
    sessionStorage.removeItem('gotoAzubiId');
  } else if (isAusbilder) {
    // Zuletzt gewählten Azubi wiederherstellen (geteilt mit der Wochenansicht,
    // s. get/setPersistedAzubiId in app.js).
    const selectable = await DB.getSelectableAzubis();
    const persisted = getPersistedAzubiId();
    if (persisted && selectable.some(a => String(a.id) === String(persisted))) {
      viewAzubiId = persisted;
    } else if (!viewAzubiId || !selectable.some(a => String(a.id) === String(viewAzubiId))) {
      viewAzubiId = selectable[0]?.id || viewAzubiId;
    }
  }

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

  async function render() {
    const azubiId = viewAzubiId || user.id;
    const wochen = await DB.getWochenFuerAzubi(azubiId);
    const isAusbilder = ['pruefer', 'admin', 'developer'].includes(user.role);
    const main = document.getElementById('mainContent');

    const azubiSelectorHtml = isAusbilder ? await renderAzubiSelector(azubiId) : '';

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Jahresansicht</h1>
        </div>
      </div>

      ${azubiSelectorHtml}

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
        <button class="year-today-btn" id="yearTodayBtn" title="Zur aktuellen Kalenderwoche springen">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="10"/></svg>
          Heutige Woche
        </button>
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

    document.getElementById('prevYearBtn')?.addEventListener('click', () => switchYear(-1, 'prev'));
    document.getElementById('nextYearBtn')?.addEventListener('click', () => switchYear(1, 'next'));

    document.getElementById('yearTodayBtn')?.addEventListener('click', async () => {
      const realYear = new Date().getFullYear();
      if (currentYear !== realYear) {
        await switchYear(realYear - currentYear, realYear > currentYear ? 'next' : 'prev');
      }
      scrollToCurrentWeek();
    });

    const azubiSelectEl = document.getElementById('azubiSelect');
    if (azubiSelectEl) {
      azubiSelectEl.addEventListener('change', () => { viewAzubiId = azubiSelectEl.value; setPersistedAzubiId(viewAzubiId); render(); });
    }

    bindWeekRows();
  }

  // Wochenzeile klickbar → Wochenansicht. Eigene Funktion, weil sie nach
  // jedem Kalender-Neuaufbau (auch beim animierten Jahreswechsel) neu
  // gebunden werden muss.
  function bindWeekRows() {
    document.querySelectorAll('.week-row[data-kw]').forEach(el => {
      el.addEventListener('click', () => {
        sessionStorage.setItem('gotoKW', el.dataset.kw);
        sessionStorage.setItem('gotoYear', el.dataset.year);
        if (viewAzubiId) sessionStorage.setItem('gotoAzubiId', viewAzubiId);
        window.location.href = 'wochenansicht.html';
      });
    });
  }

  // Jahreswechsel mit Slide-Animation (analog Wochenwechsel): NUR die
  // #yearCalendar-Ebene wird neu gerendert und horizontal geslidet — Header,
  // Jahres-Nav und Legende bleiben stehen (deshalb kein Y-Springen mehr).
  // reduced-motion → harter Swap ohne Animation.
  let yearAnimating = false;
  async function switchYear(delta, dir) {
    if (yearAnimating || !delta) return;
    yearAnimating = true;
    currentYear += delta;
    const yEl = document.querySelector('.year-nav__year');
    if (yEl) yEl.textContent = currentYear;

    const cal = document.getElementById('yearCalendar');
    const azubiId = viewAzubiId || user.id;
    const wochenP = DB.getWochenFuerAzubi(azubiId);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!cal || reduce) {
      const wochen = await wochenP;
      if (cal) { cal.innerHTML = buildYearCalendar(currentYear, wochen); bindWeekRows(); }
      yearAnimating = false;
      return;
    }

    const main = document.getElementById('mainContent');
    if (main) main.style.overflowX = 'hidden';
    cal.dataset.dir = dir;
    cal.classList.add('year-calendar--leaving');

    // Daten holen UND die Exit-Animation (180ms) abwarten, dann erst swappen.
    const [wochen] = await Promise.all([wochenP, new Promise(r => setTimeout(r, 180))]);
    cal.innerHTML = buildYearCalendar(currentYear, wochen);
    cal.classList.remove('year-calendar--leaving');
    cal.classList.add('year-calendar--entering');
    bindWeekRows();

    setTimeout(() => {
      cal.classList.remove('year-calendar--entering');
      cal.removeAttribute('data-dir');
      if (main) main.style.removeProperty('overflow-x');
      yearAnimating = false;
    }, 500);
  }

  async function renderAzubiSelector(currentId) {
    const azubis = await DB.getSelectableAzubis();
    return renderAzubiSelect(azubis, currentId);
  }

  function buildYearCalendar(year, wochen) {
    return DateUtil.MONTHS.map((monthName, monthIdx) => {
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
    const now = new Date();
    const todayStr = DateUtil.toISODate(now);
    // Aktuelle KW nur in dem Monat markieren, in dem HEUTE liegt – sonst wäre eine
    // monatsübergreifende Woche (z. B. KW 27 über Jun/Jul) in zwei Kacheln gelb.
    const todayInThisMonth = now.getMonth() === monthIdx && now.getFullYear() === year;
    const isCurrentKW = kw === DateUtil.getKW(now) && kwYear === DateUtil.getKWYear(now) && todayInThisMonth;

    const woche = wochen.find(w => w.kw === kw && w.year === kwYear);
    const weekStatus = woche ? woche.status : 'offen';

    const cells = week.map(d => {
      const dateStr = DateUtil.toISODate(d);
      const inMonth = d.getMonth() === monthIdx && d.getFullYear() === year;
      const isToday = dateStr === todayStr;
      const isWE = d.getDay() === 0 || d.getDay() === 6;
      const status = inMonth ? getStatusFuerTag(wochen, dateStr) : '';

      // Nicht-Monatstage: leere Zelle ohne today/Status (sonst gelber Block ohne Zahl).
      if (!inMonth) return `<div class="day-cell empty"></div>`;
      let classes = 'day-cell';
      if (isToday) classes += ' today';
      if (isWE) classes += ' weekend status-frei';
      else if (status) classes += ' status-' + status;

      return `<div class="${classes}" title="${DateUtil.formatDate(dateStr)}">${d.getDate()}</div>`;
    }).join('');

    return `
      <div class="week-row week-row--clickable${isCurrentKW ? ' week-row--current' : ''}" data-kw="${kw}" data-year="${kwYear}" title="KW ${kw} öffnen">
        <div class="week-row__kw${isCurrentKW ? ' current-kw' : ''}">
          ${kw}
          <div class="week-status-dot week-status-dot--${weekStatus}"></div>
        </div>
        ${cells}
      </div>
    `;
  }

  function scrollToCurrentWeek() {
    const row = document.querySelector('.week-row--current');
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Kurzer Pulse-Highlight, damit Auge die Zeile findet
    row.classList.remove('week-row--pulse');
    void row.offsetWidth;
    row.classList.add('week-row--pulse');
    setTimeout(() => row.classList.remove('week-row--pulse'), 2400);
  }

  await render();
});
