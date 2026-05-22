/* ===================================================================
   AZUBI-PLANER.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const user = initPage('nav-planer', [{ label: 'Azubi-Planer', href: 'azubi-planer.html' }]);
  if (!user) return;

  if (!['ausbilder', 'admin'].includes(user.role)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const COLORS = [
    'gantt-bar--ausbilder-1',
    'gantt-bar--ausbilder-2',
    'gantt-bar--ausbilder-3',
    'gantt-bar--ausbilder-4',
    'gantt-bar--ausbilder-5',
  ];

  const MONTHS = 12;
  const today = new Date();
  const planYear = today.getFullYear();
  let searchText = '';
  let pendingDeleteZuweisungId = null;

  const ausbilder = DB.getAusbilder();
  const azubis = DB.getAzubis();

  // Ausbilder-Farb-Map
  const ausbilderColors = {};
  ausbilder.forEach((a, i) => { ausbilderColors[a.id] = COLORS[i % COLORS.length]; });

  function render() {
    const main = document.getElementById('mainContent');

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Azubi-Planer</h1>
          <p class="page-subtitle">Zuweisungen von Auszubildenden zu Ausbilder/innen verwalten.</p>
        </div>
        <div class="page-header__actions">
          <button class="lg-btn lg-btn--yellow-solid" id="newZuweisungBtn">
            <span class="btn__glass"></span>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Neue Zuweisung
          </button>
        </div>
      </div>

      <!-- Ausbildungsbeauftragte -->
      <div class="planer-header">
        <div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--pm-grey-600);margin-bottom:var(--sp-3)">Ausbildungsbeauftragte im Unternehmen</div>
          <div class="planer-ausbilder-list">
            ${ausbilder.map((a, i) => `
              <div class="ausbilder-chip" style="border-color: transparent">
                <div class="avatar avatar--sm" style="background: ${getBarColor(i)}">${a.initials}</div>
                ${a.name}
                <span class="badge badge--grey">${a.abteilung || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Suche -->
      <div class="planer-search-wrap">
        <div style="position:relative;flex:1;max-width:320px">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
               style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--pm-grey-400);pointer-events:none">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-control" id="azubiSearch"
                 style="padding-left:34px" placeholder="Azubi suchen…" value="${searchText}">
        </div>
      </div>

      <!-- Gantt -->
      <div class="gantt-wrap">
        ${buildGanttHeader()}
        <div class="gantt-body">
          ${buildGanttRows()}
        </div>
        ${buildGanttLegend()}
      </div>

      <!-- Zuweisungsliste -->
      <div class="card" style="margin-top:var(--sp-6)">
        <div class="card__header">
          <span class="card__title">Bestehende Zuweisungen</span>
        </div>
        <div class="card__body" style="padding:0 var(--sp-5) 0 0">
          ${buildZuweisungTable()}
        </div>
      </div>
    `;

    // Events
    document.getElementById('newZuweisungBtn')?.addEventListener('click', openNewZuweisung);
    document.getElementById('azubiSearch')?.addEventListener('input', (e) => {
      searchText = e.target.value.toLowerCase();
      document.querySelector('.gantt-body').innerHTML = buildGanttRows();
    });

    bindZuweisungTableEvents();
    Modal.init();
    initZuweisungModal();
    Toast.init();
  }

  function buildGanttHeader() {
    const monthHeaders = Array.from({ length: MONTHS }, (_, i) => {
      const m = new Date(planYear, i, 1);
      const isCurrent = i === today.getMonth() && planYear === today.getFullYear();
      return `<div class="gantt-header__month${isCurrent ? ' current' : ''}">${DateUtil.MONTHS_SHORT[i]}</div>`;
    }).join('');

    return `
      <div class="gantt-header">
        <div class="gantt-header__name-col">Auszubildende/r</div>
        <div class="gantt-header__timeline">${monthHeaders}</div>
      </div>
    `;
  }

  function buildGanttRows() {
    let filteredAzubis = azubis;
    if (searchText) {
      filteredAzubis = azubis.filter(a => a.name.toLowerCase().includes(searchText));
    }

    if (!filteredAzubis.length) {
      return `<div style="padding:var(--sp-8);text-align:center;color:var(--pm-grey-400)">Keine Auszubildenden gefunden.</div>`;
    }

    return filteredAzubis.map(azubi => {
      const zuweisungen = DB.getZuweisungenFuerAzubi(azubi.id);
      const bars = buildGanttBars(zuweisungen);

      return `
        <div class="gantt-row">
          <div class="gantt-row__info">
            <div class="avatar avatar--sm">${azubi.initials}</div>
            <div class="gantt-row__info-text">
              <div class="gantt-row__name" title="${azubi.name}">${azubi.name}</div>
              <div class="gantt-row__beruf" title="${azubi.beruf || ''}">${azubi.beruf || ''}</div>
            </div>
          </div>
          <div class="gantt-row__timeline" style="--months:${MONTHS}">
            ${buildTodayLine()}
            ${bars}
          </div>
        </div>
      `;
    }).join('');
  }

  function buildGanttBars(zuweisungen) {
    const yearStart = new Date(planYear, 0, 1).getTime();
    const yearEnd = new Date(planYear + 1, 0, 1).getTime();
    const yearDuration = yearEnd - yearStart;

    return zuweisungen.map(z => {
      const from = new Date(z.von + 'T00:00:00').getTime();
      const to = new Date(z.bis + 'T00:00:00').getTime();

      const left = Math.max(0, (from - yearStart) / yearDuration * 100);
      const right = Math.min(100, (to - yearStart) / yearDuration * 100);
      const width = right - left;

      if (width <= 0) return '';

      const ausb = DB.getUser(z.ausbilderId);
      const colorClass = ausbilder.findIndex(a => a.id === z.ausbilderId);

      return `
        <div class="gantt-bar ${COLORS[colorClass % COLORS.length]}"
             style="left:${left}%;width:${width}%"
             title="${ausb?.name || '–'}: ${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}"
             data-zuweisung-id="${z.id}">
          ${width > 8 ? (ausb?.initials || '') : ''}
        </div>
      `;
    }).join('');
  }

  function buildTodayLine() {
    const yearStart = new Date(planYear, 0, 1).getTime();
    const yearEnd = new Date(planYear + 1, 0, 1).getTime();
    if (today.getFullYear() !== planYear) return '';
    const pct = (today.getTime() - yearStart) / (yearEnd - yearStart) * 100;
    return `<div class="gantt-today-line" style="left:${pct}%"></div>`;
  }

  function buildGanttLegend() {
    return `
      <div class="gantt-legend">
        ${ausbilder.map((a, i) => `
          <div class="gantt-legend-item">
            <div class="gantt-legend-bar" style="background: ${getBarColor(i)}"></div>
            ${a.name}
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildZuweisungTable() {
    const alle = DB.data.zuweisungen;
    if (!alle.length) {
      return '<div style="padding:var(--sp-8);text-align:center;color:var(--pm-grey-400)">Keine Zuweisungen vorhanden.</div>';
    }

    return `
      <table class="qual-table zuweisung-table">
        <colgroup>
          <col style="width: 32%">
          <col style="width: 20%">
          <col style="width: 22%">
          <col style="width: 11%">
          <col style="width: 11%">
          <col style="width: 4%">
        </colgroup>
        <thead>
          <tr>
            <th>Azubi</th>
            <th>Ausbilder/in</th>
            <th>Abteilung</th>
            <th>Von</th>
            <th>Bis</th>
            <th aria-label="Aktionen"></th>
          </tr>
        </thead>
        <tbody>
          ${alle.map(z => {
            const azubi = DB.getUser(z.azubiId);
            const ausb = DB.getUser(z.ausbilderId);
            const isCurrent = z.von <= DateUtil.toISODate(today) && z.bis >= DateUtil.toISODate(today);
            return `
              <tr${isCurrent ? ' class="zuweisung-row--current"' : ''}>
                <td>
                  <div class="zuweisung-azubi-cell">
                    <div class="avatar avatar--sm">${azubi?.initials || '?'}</div>
                    <span class="zuweisung-azubi-name">${azubi?.name || '–'}</span>
                    ${isCurrent ? '<span class="badge badge--genehmigt">Aktuell</span>' : ''}
                  </div>
                </td>
                <td>${ausb?.name || '–'}</td>
                <td>${z.abteilung || '–'}</td>
                <td class="zuweisung-date">${DateUtil.formatDate(z.von)}</td>
                <td class="zuweisung-date">${DateUtil.formatDate(z.bis)}</td>
                <td class="zuweisung-action-cell">
                  <button class="btn btn-sm btn-ghost delete-zuweisung-btn" data-id="${z.id}" aria-label="Löschen">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function bindZuweisungTableEvents() {
    document.querySelectorAll('.delete-zuweisung-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        pendingDeleteZuweisungId = id;

        // Modal-Text personalisieren, damit klar ist, was gleich gelöscht wird.
        const z = DB.data.zuweisungen.find(x => x.id === id);
        const azubi = z ? DB.getUser(z.azubiId) : null;
        const textEl = document.getElementById('zuweisungDeleteText');
        if (textEl) {
          textEl.textContent = azubi
            ? `Die Zuweisung von „${azubi.name}" wird unwiderruflich entfernt. Möchtest du fortfahren?`
            : 'Diese Zuweisung wird unwiderruflich entfernt. Möchtest du fortfahren?';
        }

        Modal.open('zuweisungDeleteModal');
      });
    });
  }

  function initZuweisungDeleteModal() {
    // Bindung erfolgt einmalig beim ersten Render – das Modal selbst bleibt
    // im DOM stehen, nur pendingDeleteZuweisungId wird pro Klick neu gesetzt.
    document.getElementById('zuweisungDeleteConfirmBtn')?.addEventListener('click', () => {
      if (pendingDeleteZuweisungId == null) return;
      DB.deleteZuweisung(pendingDeleteZuweisungId);
      pendingDeleteZuweisungId = null;
      Modal.closeAll();
      Toast.success('Gelöscht', 'Zuweisung wurde entfernt.');
      render();
    });
  }

  function openNewZuweisung() {
    const azubiSel = document.getElementById('zuweisungAzubi');
    const ausbilderSel = document.getElementById('zuweisungAusbilder');
    if (azubiSel) azubiSel.innerHTML = azubis.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    if (ausbilderSel) ausbilderSel.innerHTML = ausbilder.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    Modal.open('zuweisungModal');
  }

  function initZuweisungModal() {
    document.getElementById('zuweisungSaveBtn')?.addEventListener('click', () => {
      const azubiId = parseInt(document.getElementById('zuweisungAzubi').value);
      const ausbilderId = parseInt(document.getElementById('zuweisungAusbilder').value);
      const von = document.getElementById('zuweisungVon').value;
      const bis = document.getElementById('zuweisungBis').value;
      const abteilung = document.getElementById('zuweisungAbteilung').value;

      if (!von || !bis) { Toast.error('Pflichtfeld', 'Bitte Zeitraum angeben.'); return; }
      if (von > bis) { Toast.error('Ungültiger Zeitraum', 'Startdatum muss vor Enddatum liegen.'); return; }

      DB.addZuweisung({ azubiId, ausbilderId, von, bis, abteilung });
      Modal.closeAll();
      Toast.success('Gespeichert', 'Neue Zuweisung wurde angelegt.');
      render();
    });
  }

  function getBarColor(idx) {
    const colors = ['#FFC300', '#4A90D9', '#56C271', '#E87040', '#9B59B6'];
    return colors[idx % colors.length];
  }

  // Bestätigungs-Modal für Löschen einmalig binden (Modal-Markup ist statisch
  // in azubi-planer.html). Innerhalb von render() würden Listener mehrfach
  // angehängt, was zu Mehrfach-Löschungen führen könnte.
  initZuweisungDeleteModal();

  render();
});
