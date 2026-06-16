/* ===================================================================
   AZUBI-PLANER.JS

   Drei klar getrennte Zonen (siehe Design 2026-06-12):
     1. Kopf   – Filter + Auswertung (KPIs, Roster=Legende, Suche)
     2. Mitte  – Timeline (Gantt)
     3. Unten  – strukturierte, sortierbare Zuweisungsliste
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-planer', [{ label: 'Azubi-Planer', href: 'azubi-planer.html' }]);
  if (!user) return;

  if (!user.kannPlanen) {
    window.location.href = 'dashboard.html';
    return;
  }

  /* Layout-Marker: erlaubt dem Azubi-Planer die volle Seitenbreite (Override
     der globalen --content-max-Beschränkung in layout.css) – die Timeline
     braucht den Platz für die 12 Monate. */
  document.body.dataset.page = 'azubi-planer';

  const COLORS = [
    'gantt-bar--ausbilder-1',
    'gantt-bar--ausbilder-2',
    'gantt-bar--ausbilder-3',
    'gantt-bar--ausbilder-4',
    'gantt-bar--ausbilder-5',
  ];

  const MONTHS = 12;
  const today = new Date();
  const todayISO = DateUtil.toISODate(today);
  const planYear = today.getFullYear();
  let searchText = '';
  let pendingDeleteZuweisungId = null;
  let selectedAzubiId = null;          // im Detailpanel gewählter Azubi
  let filterVerantw = '';              // Filter: Verantwortliche-OID ('' = alle)
  let filterAbteilung = '';            // Filter: Abteilung ('' = alle)
  let filterLehrjahr = '';             // Filter: Lehrjahr ('' = alle)
  let nurOhneZuweisung = false;        // Schnellfilter

  // Sortierzustand der unteren Zuweisungsliste. key='default' = aktuelle
  // zuerst, danach nach Von-Datum; ein Spaltenklick setzt key+dir.
  let tableSort = { key: 'default', dir: 'asc' };
  // Einmal aufgelöste Zeilendaten (Azubi-/Ausbilder-Objekte), damit das
  // Umsortieren per Header-Klick ohne erneute DB-Abfragen läuft.
  let zuwRowData = [];

  // Verantwortliche-Auswahl = alle Nicht-Azubi-Nutzer (nicht nur Ausbilder).
  const ausbilder = await DB.getVerantwortliche();
  const azubis = await DB.getAzubis();

  // Ausbilder-Farb-Map: jeder Ausbilder-ID einen STABILEN Paletten-Index
  // zuordnen. Zuerst aus der Ausbilder-Liste vorbefüllt (Reihenfolge = Legende),
  // nimmt aber auch IDs auf, die NUR in Zuweisungen vorkommen – etwa ein als
  // Betreuer eingetragener Admin oder ein/e ehemalige/r Ausbilder/in. Früher
  // lieferte findIndex(...) für solche IDs -1 → COLORS[-1] === undefined → der
  // Balken bekam die Klasse "undefined", also gar keine Hintergrundfarbe und
  // wirkte schwarz. So bekommt jede Zuweisung eine gut erkennbare Farbe.
  const ausbilderColorIdx = {};
  let _nextColorIdx = 0;
  function colorIndexFor(ausbilderId) {
    if (ausbilderId == null) return 0;
    if (!(ausbilderId in ausbilderColorIdx)) {
      ausbilderColorIdx[ausbilderId] = _nextColorIdx % COLORS.length;
      _nextColorIdx++;
    }
    return ausbilderColorIdx[ausbilderId];
  }
  // Bekannte Ausbilder zuerst einfärben, damit Legende und Balken exakt
  // dieselbe Farbe pro Person verwenden.
  ausbilder.forEach(a => colorIndexFor(a.id));

  /* ── Status einer Zuweisung relativ zu heute ────────────────────── */
  function zuweisungStatus(z) {
    // badge = vorhandene .badge-Variante (deckt Hell- und Dunkelmodus ab)
    if (z.bis < todayISO) return { key: 'beendet',    label: 'Beendet',    badge: 'badge--grey' };
    if (z.von > todayISO) return { key: 'zukuenftig', label: 'Zukünftig', badge: 'badge--freigegeben' };
    return { key: 'aktuell', label: 'Aktuell', badge: 'badge--genehmigt' };
  }

  /* ── Kennzahlen für die Auswertungsleiste ───────────────────────── */
  function computeKpis() {
    const aktuelle = zuwRowData.filter(r => r.status.key === 'aktuell');
    const azubisMitAktuell = new Set(aktuelle.map(r => r.z.azubiId));
    const ausbilderAktiv    = new Set(aktuelle.map(r => r.z.ausbilderId));
    const ohne = azubis.filter(a => !azubisMitAktuell.has(a.id)).length;
    return {
      azubisTotal: azubis.length,
      aktiveZuweisungen: aktuelle.length,
      ohneZuweisung: ohne,
      ausbilderAktiv: ausbilderAktiv.size,
    };
  }

  function buildKpis() {
    const k = computeKpis();
    const tile = (value, label, mod = '') => `
      <div class="planer-kpi${mod}">
        <div class="planer-kpi__value">${value}</div>
        <div class="planer-kpi__label">${label}</div>
      </div>`;
    return `
      <div class="planer-kpis">
        ${tile(k.azubisTotal, 'Azubis gesamt')}
        ${tile(k.aktiveZuweisungen, 'Aktive Zuweisungen')}
        ${tile(k.ohneZuweisung, 'Ohne aktuelle Zuweisung', k.ohneZuweisung > 0 ? ' planer-kpi--warn' : '')}
        ${tile(k.ausbilderAktiv, 'Verantwortliche aktiv')}
      </div>`;
  }

  // Aktuell aktive Zuweisung eines Azubis (oder null).
  function getAktuelleZuweisung(azubiId) {
    return zuwRowData.find(r => r.z.azubiId === azubiId && r.status.key === 'aktuell') || null;
  }
  // Lehrjahr aus ausbildungsBeginn (1..4), wie in der Wochenansicht.
  function lehrjahrVon(azubi) {
    if (!azubi?.ausbildungsBeginn) return null;
    const start = new Date(azubi.ausbildungsBeginn + 'T00:00:00');
    const m = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    return Math.max(1, Math.min(4, Math.floor(m / 12) + 1));
  }
  // Alle Abteilungs-Namen (für den Abteilungs-Filter), dedupliziert/sortiert.
  function alleAbteilungen() {
    return [...new Set(zuwRowData.map(r => r.z.abteilung).filter(Boolean))].sort();
  }
  // Azubi-Liste nach allen aktiven Filtern.
  function gefilterteAzubis() {
    return azubis.filter(a => {
      if (searchText && !(`${a.name} ${a.beruf || ''}`.toLowerCase().includes(searchText))) return false;
      const akt = getAktuelleZuweisung(a.id);
      if (nurOhneZuweisung && akt) return false;
      if (filterVerantw && akt?.z.ausbilderId !== filterVerantw) return false;
      if (filterAbteilung && akt?.z.abteilung !== filterAbteilung) return false;
      if (filterLehrjahr && String(lehrjahrVon(a)) !== filterLehrjahr) return false;
      return true;
    });
  }

  /* ── Roster der Ausbildungsbeauftragten – dient zugleich als Legende
     der Balkenfarben (die separate Gantt-Legende entfällt dadurch). ── */
  function buildRoster() {
    return `
      <div class="planer-roster">
        <span class="planer-roster__label">Ausbildungsbeauftragte</span>
        <div class="planer-roster__items">
          ${ausbilder.map((a) => `
            <span class="planer-roster__item" title="${a.name}${a.abteilung ? ' · ' + a.abteilung : ''}">
              <span class="planer-roster__dot" style="background:${getBarColor(colorIndexFor(a.id))}"></span>
              <span class="planer-roster__name">${a.name}</span>
              ${a.abteilung ? `<span class="planer-roster__abt">${a.abteilung}</span>` : ''}
            </span>
          `).join('')}
        </div>
      </div>`;
  }

  function buildVerantwOptions() {
    return `<option value="">Alle Verantwortlichen</option>` +
      ausbilder.map(a => `<option value="${a.id}" ${a.id === filterVerantw ? 'selected' : ''}>${a.name}</option>`).join('');
  }
  function buildAbteilungOptions() {
    return `<option value="">Alle Abteilungen</option>` +
      alleAbteilungen().map(ab => `<option value="${ab}" ${ab === filterAbteilung ? 'selected' : ''}>${ab}</option>`).join('');
  }
  function buildLehrjahrOptions() {
    return `<option value="">Alle Lehrjahre</option>` +
      [1,2,3,4].map(j => `<option value="${j}" ${String(j) === filterLehrjahr ? 'selected' : ''}>${j}. Lehrjahr</option>`).join('');
  }

  async function render() {
    const main = document.getElementById('mainContent');

    await loadZuwRowData();
    const ganttRowsHtml = await buildGanttRows();

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Azubi-Planer</h1>
          <p class="page-subtitle">Zuweisungen von Auszubildenden zu Verantwortlichen verwalten.</p>
        </div>
        <button class="btn btn-secondary" id="newZuweisungBtn">+ Zuweisung</button>
      </div>

      ${buildKpis()}

      <div class="planer-filterbar">
        <div class="planer-search">
          <input type="search" id="azubiSearch" class="form-control" placeholder="Azubi suchen …" value="${searchText}">
        </div>
        <select class="form-control" id="filterVerantw">${buildVerantwOptions()}</select>
        <select class="form-control" id="filterAbteilung">${buildAbteilungOptions()}</select>
        <select class="form-control" id="filterLehrjahr">${buildLehrjahrOptions()}</select>
        <label class="planer-quickfilter">
          <input type="checkbox" id="filterNurOhne" ${nurOhneZuweisung ? 'checked' : ''}> nur ohne aktuelle Zuweisung
        </label>
      </div>

      <div class="planer-master">
        <div class="planer-list" id="planerList">${buildAzubiListe()}</div>
        <div class="planer-detail" id="planerDetail">${buildDetail(selectedAzubiId)}</div>
      </div>

      <details class="planer-gantt-details">
        <summary>Gesamt-Timeline (${planYear})</summary>
        <div class="gantt-wrap">
          ${buildGanttHeader()}
          <div class="gantt-body">${ganttRowsHtml}</div>
        </div>
      </details>
    `;

    // Events
    document.getElementById('newZuweisungBtn')?.addEventListener('click', () => openNewZuweisung());

    const rerenderList = () => {
      document.getElementById('planerList').innerHTML = buildAzubiListe();
      bindListEvents();
    };
    document.getElementById('azubiSearch')?.addEventListener('input', (e) => { searchText = e.target.value.toLowerCase(); rerenderList(); });
    document.getElementById('filterVerantw')?.addEventListener('change', (e) => { filterVerantw = e.target.value; rerenderList(); });
    document.getElementById('filterAbteilung')?.addEventListener('change', (e) => { filterAbteilung = e.target.value; rerenderList(); });
    document.getElementById('filterLehrjahr')?.addEventListener('change', (e) => { filterLehrjahr = e.target.value; rerenderList(); });
    document.getElementById('filterNurOhne')?.addEventListener('change', (e) => { nurOhneZuweisung = e.target.checked; rerenderList(); });

    bindListEvents();
    Modal.init();
    initZuweisungModal();
    Toast.init();
    // Delete-Modal einmalig (außerhalb render, s. bestehende Bindung am Ende)
  }

  function bindListEvents() {
    document.querySelectorAll('.planer-list-item[data-azubi-id]').forEach(el => {
      el.addEventListener('click', () => {
        selectedAzubiId = el.dataset.azubiId;
        document.getElementById('planerDetail').innerHTML = buildDetail(selectedAzubiId);
        bindDetailEvents();
        document.querySelectorAll('.planer-list-item').forEach(x => x.classList.toggle('selected', x.dataset.azubiId === selectedAzubiId));
      });
    });
  }

  function buildGanttHeader() {
    const monthHeaders = Array.from({ length: MONTHS }, (_, i) => {
      const isCurrent = i === today.getMonth() && planYear === today.getFullYear();
      const isQuarter = i % 3 === 0;   // Q-Start (Jan/Apr/Jul/Okt) – stärkere Linie
      return `<div class="gantt-header__month${isCurrent ? ' current' : ''}${isQuarter ? ' gantt-header__month--q' : ''}">${DateUtil.MONTHS_SHORT[i]}</div>`;
    }).join('');

    return `
      <div class="gantt-header">
        <div class="gantt-header__name-col">Auszubildende/r</div>
        <div class="gantt-header__timeline">${monthHeaders}${buildTodayMarker()}</div>
      </div>
    `;
  }

  /* „Heute"-Label EINMAL im Header (an der Tages-Position). Die senkrechte
     Linie pro Zeile (buildTodayLine) bleibt als durchgehende Orientierung,
     trägt aber keinen Text mehr – sonst stünde „Heute" auf jeder Zeile. */
  function buildTodayMarker() {
    const yearStart = new Date(planYear, 0, 1).getTime();
    const yearEnd = new Date(planYear + 1, 0, 1).getTime();
    if (today.getFullYear() !== planYear) return '';
    const pct = (today.getTime() - yearStart) / (yearEnd - yearStart) * 100;
    return `<div class="gantt-today-marker" style="left:${pct}%">Heute</div>`;
  }

  async function buildGanttRows() {
    let filteredAzubis = azubis;
    if (searchText) {
      filteredAzubis = azubis.filter(a => a.name.toLowerCase().includes(searchText));
    }

    if (!filteredAzubis.length) {
      return `<div style="padding:var(--sp-8);text-align:center;color:var(--pm-grey-400)">Keine Auszubildenden gefunden.</div>`;
    }

    const rows = await Promise.all(filteredAzubis.map(async azubi => {
      const zuweisungen = await DB.getZuweisungenFuerAzubi(azubi.id);
      const bars = await buildGanttBars(zuweisungen);

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
    }));

    return rows.join('');
  }

  async function buildGanttBars(zuweisungen) {
    const yearStart = new Date(planYear, 0, 1).getTime();
    const yearEnd = new Date(planYear + 1, 0, 1).getTime();
    const yearDuration = yearEnd - yearStart;

    const bars = await Promise.all(zuweisungen.map(async z => {
      const from = new Date(z.von + 'T00:00:00').getTime();
      const to = new Date(z.bis + 'T00:00:00').getTime();

      const left = Math.max(0, (from - yearStart) / yearDuration * 100);
      const right = Math.min(100, (to - yearStart) / yearDuration * 100);
      const width = right - left;

      if (width <= 0) return '';

      const ausb = await DB.getUser(z.ausbilderId);

      return `
        <div class="gantt-bar ${COLORS[colorIndexFor(z.ausbilderId)]}"
             style="left:${left}%;width:${width}%"
             title="${ausb?.name || '–'}: ${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}"
             data-zuweisung-id="${z.id}">
          ${width > 8 ? (ausb?.initials || '') : ''}
        </div>
      `;
    }));

    return bars.join('');
  }

  function buildTodayLine() {
    const yearStart = new Date(planYear, 0, 1).getTime();
    const yearEnd = new Date(planYear + 1, 0, 1).getTime();
    if (today.getFullYear() !== planYear) return '';
    const pct = (today.getTime() - yearStart) / (yearEnd - yearStart) * 100;
    return `<div class="gantt-today-line" style="left:${pct}%"></div>`;
  }

  /* ── Untere Zuweisungsliste (sortierbar) ────────────────────────── */

  async function loadZuwRowData() {
    const alle = await DB.getAllZuweisungen();
    zuwRowData = await Promise.all(alle.map(async z => {
      const azubi = await DB.getUser(z.azubiId);
      const ausb  = await DB.getUser(z.ausbilderId);
      return { z, azubi, ausb, status: zuweisungStatus(z) };
    }));
  }

  function sortedRowData() {
    const data = [...zuwRowData];
    const { key, dir } = tableSort;
    const mul = dir === 'desc' ? -1 : 1;
    const statusOrder = { aktuell: 0, zukuenftig: 1, beendet: 2 };

    if (key === 'default') {
      // aktuelle zuerst, danach chronologisch nach Beginn
      data.sort((a, b) =>
        (statusOrder[a.status.key] - statusOrder[b.status.key]) ||
        a.z.von.localeCompare(b.z.von));
      return data;
    }

    data.sort((a, b) => {
      let av, bv;
      switch (key) {
        case 'azubi':     av = (a.azubi?.name || '').toLowerCase(); bv = (b.azubi?.name || '').toLowerCase(); break;
        case 'ausbilder': av = (a.ausb?.name  || '').toLowerCase(); bv = (b.ausb?.name  || '').toLowerCase(); break;
        case 'abteilung': av = (a.z.abteilung || '').toLowerCase(); bv = (b.z.abteilung || '').toLowerCase(); break;
        case 'von':       av = a.z.von; bv = b.z.von; break;
        case 'bis':       av = a.z.bis; bv = b.z.bis; break;
        case 'status':    av = statusOrder[a.status.key]; bv = statusOrder[b.status.key]; break;
        default:          av = 0; bv = 0;
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return  1 * mul;
      return 0;
    });
    return data;
  }

  function buildZuweisungTableHtml() {
    const data = sortedRowData();
    if (!data.length) {
      return '<div style="padding:var(--sp-8);text-align:center;color:var(--pm-grey-400)">Keine Zuweisungen vorhanden.</div>';
    }

    const arrow = (key) => tableSort.key === key
      ? `<span class="zuw-th__arrow">${tableSort.dir === 'asc' ? '▲' : '▼'}</span>` : '';
    const ariaSort = (key) => tableSort.key === key
      ? (tableSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const th = (key, label) =>
      `<th class="zuw-th${tableSort.key === key ? ' is-sorted' : ''}" data-sort="${key}"
           role="button" tabindex="0" aria-sort="${ariaSort(key)}"
           title="Nach ${label} sortieren">${label}${arrow(key)}</th>`;

    const rows = data.map(({ z, azubi, ausb, status }) => `
      <tr${status.key === 'aktuell' ? ' class="zuweisung-row--current"' : ''}>
        <td>
          <div class="zuweisung-azubi-cell">
            <div class="avatar avatar--sm">${azubi?.initials || '?'}</div>
            <span class="zuweisung-azubi-name">${azubi?.name || '–'}</span>
          </div>
        </td>
        <td>${ausb?.name || '–'}</td>
        <td>${z.abteilung || '–'}</td>
        <td class="zuweisung-date">${DateUtil.formatDate(z.von)}</td>
        <td class="zuweisung-date">${DateUtil.formatDate(z.bis)}</td>
        <td><span class="badge ${status.badge}">${status.label}</span></td>
        <td class="zuweisung-action-cell">
          <button class="btn btn-sm btn-ghost delete-zuweisung-btn" data-id="${z.id}" aria-label="Löschen">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </td>
      </tr>
    `).join('');

    return `
      <table class="qual-table zuweisung-table">
        <colgroup>
          <col style="width: 27%">
          <col style="width: 19%">
          <col style="width: 19%">
          <col style="width: 11%">
          <col style="width: 11%">
          <col style="width: 9%">
          <col style="width: 4%">
        </colgroup>
        <thead>
          <tr>
            ${th('azubi', 'Azubi')}
            ${th('ausbilder', 'Verantwortliche/r')}
            ${th('abteilung', 'Abteilung')}
            ${th('von', 'Von')}
            ${th('bis', 'Bis')}
            ${th('status', 'Status')}
            <th aria-label="Aktionen"></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  function renderZuweisungTable() {
    const host = document.getElementById('zuweisungTableHost');
    if (!host) return;
    host.innerHTML = buildZuweisungTableHtml();
    bindZuweisungTableEvents();
    bindSortHeaders();
  }

  function bindSortHeaders() {
    document.querySelectorAll('.zuw-th[data-sort]').forEach(th => {
      const apply = () => {
        const key = th.dataset.sort;
        if (tableSort.key === key) {
          tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          tableSort.key = key;
          tableSort.dir = 'asc';
        }
        renderZuweisungTable();
      };
      th.addEventListener('click', apply);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
      });
    });
  }

  function bindZuweisungTableEvents() {
    document.querySelectorAll('.delete-zuweisung-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Zuweisungs-IDs sind Integer (DB-Id), daher hier parseInt korrekt.
        const id = parseInt(btn.dataset.id);
        pendingDeleteZuweisungId = id;

        // Modal-Text personalisieren, damit klar ist, was gleich gelöscht wird.
        const row = zuwRowData.find(r => r.z.id === id);
        const azubi = row?.azubi || null;
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
    document.getElementById('zuweisungDeleteConfirmBtn')?.addEventListener('click', async () => {
      if (pendingDeleteZuweisungId == null) return;
      await DB.deleteZuweisung(pendingDeleteZuweisungId);
      pendingDeleteZuweisungId = null;
      Modal.closeAll();
      Toast.success('Gelöscht', 'Zuweisung wurde entfernt.');
      await render();
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
    document.getElementById('zuweisungSaveBtn')?.addEventListener('click', async () => {
      // Azubi-/Ausbilder-IDs sind GUID-Strings – nicht per parseInt() in
      // Zahlen wandeln (ergäbe 0 und damit eine ungültige Zuweisung).
      const azubiId = document.getElementById('zuweisungAzubi').value;
      const ausbilderId = document.getElementById('zuweisungAusbilder').value;
      const von = document.getElementById('zuweisungVon').value;
      const bis = document.getElementById('zuweisungBis').value;
      const abteilung = document.getElementById('zuweisungAbteilung').value;

      if (!von || !bis) { Toast.error('Pflichtfeld', 'Bitte Zeitraum angeben.'); return; }
      if (von > bis) { Toast.error('Ungültiger Zeitraum', 'Startdatum muss vor Enddatum liegen.'); return; }

      await DB.addZuweisung({ azubiId, ausbilderId, von, bis, abteilung });
      Modal.closeAll();
      Toast.success('Gespeichert', 'Neue Zuweisung wurde angelegt.');
      await render();
    });
  }

  function getBarColor(idx) {
    // Ruhige, entsättigte Palette; Index 0 bewusst NICHT Marken-Gelb,
    // damit die Balken nicht mit den gelben UI-Akzenten konkurrieren.
    // Muss zu den .gantt-bar--ausbilder-N Farben in azubi-planer.css passen.
    const colors = ['#4F9D9A', '#5B86C2', '#5FAE72', '#D8835A', '#9B7BC4'];
    return colors[idx % colors.length];
  }

  // Bestätigungs-Modal für Löschen einmalig binden (Modal-Markup ist statisch
  // in azubi-planer.html). Innerhalb von render() würden Listener mehrfach
  // angehängt, was zu Mehrfach-Löschungen führen könnte.
  initZuweisungDeleteModal();

  await render();
});
