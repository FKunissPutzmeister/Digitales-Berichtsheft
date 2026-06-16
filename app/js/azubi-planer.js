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

  const today = new Date();
  const todayISO = DateUtil.toISODate(today);
  const planYear = today.getFullYear();
  const jan1 = new Date(planYear, 0, 1);
  const daysInYear = Math.round((new Date(planYear, 11, 31) - jan1) / 86400000) + 1;
  const NUM_DAYS = daysInYear;
  const dayOf = (d) => Math.round((d - jan1) / 86400000);
  let searchText = '';
  let pendingDeleteZuweisungId = null;
  let selectedAzubiId = null;          // im Detailpanel gewählter Azubi
  let filterVerantw = '';              // Filter: Verantwortliche-OID ('' = alle)
  let filterAbteilung = '';            // Filter: Abteilung ('' = alle)
  let filterLehrjahr = '';             // Filter: Lehrjahr ('' = alle)
  let nurOhneZuweisung = false;        // Schnellfilter
  let comboModalAzubi = null, comboModalVerantw = null;

  // Einmal aufgelöste Zeilendaten (Azubi-/Ausbilder-Objekte).
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
        <div class="gantt-scroll">
          <div class="gantt-grid" style="--num-days:${NUM_DAYS};--day-px:22px">
            ${buildGanttHeader()}
            <div class="gantt-body">${ganttRowsHtml}</div>
          </div>
        </div>
      </details>
    `;

    // Events
    const rerenderList = () => {
      document.getElementById('planerList').innerHTML = buildAzubiListe();
      bindListEvents();
    };
    document.getElementById('azubiSearch')?.addEventListener('input', (e) => { searchText = e.target.value.toLowerCase(); rerenderList(); });
    document.getElementById('filterVerantw')?.addEventListener('change', (e) => { filterVerantw = e.target.value; rerenderList(); });
    document.getElementById('filterAbteilung')?.addEventListener('change', (e) => { filterAbteilung = e.target.value; rerenderList(); });
    document.getElementById('filterLehrjahr')?.addEventListener('change', (e) => { filterLehrjahr = e.target.value; rerenderList(); });
    document.getElementById('filterNurOhne')?.addEventListener('change', (e) => { nurOhneZuweisung = e.target.checked; rerenderList(); });
    makeSearchableSelect(document.getElementById('filterVerantw'));
    makeSearchableSelect(document.getElementById('filterAbteilung'));

    bindListEvents();
    if (selectedAzubiId) bindDetailEvents();
    Modal.init();
    Toast.init();
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

  // Linke Liste: ein Eintrag je (gefiltertem) Azubi mit aktueller Zuweisung/Status.
  function buildAzubiListe() {
    const list = gefilterteAzubis();
    if (!list.length) return `<div class="planer-empty">Keine Azubis für die aktuelle Filterung.</div>`;
    return list.map(a => {
      const akt = getAktuelleZuweisung(a.id);
      const lj = lehrjahrVon(a);
      let badge, sub;
      if (!akt) { badge = `<span class="badge badge--abgelehnt">Keine Zuweisung</span>`; sub = '—'; }
      else {
        const farbe = getBarColor(colorIndexFor(akt.z.ausbilderId));
        badge = `<span class="badge ${akt.status.badge}">${akt.status.label}</span>`;
        sub = `<span class="planer-dot" style="background:${farbe}"></span>${akt.z.abteilung || '–'} · ${akt.ausb?.name || '–'}`;
      }
      return `
        <button class="planer-list-item ${a.id === selectedAzubiId ? 'selected' : ''}" data-azubi-id="${a.id}">
          <div class="avatar avatar--sm">${a.initials}</div>
          <div class="planer-list-item__main">
            <div class="planer-list-item__name">${a.name}${lj ? ` <span class="planer-list-item__lj">${lj}. LJ</span>` : ''}</div>
            <div class="planer-list-item__sub">${sub}</div>
          </div>
          ${badge}
        </button>`;
    }).join('');
  }

  // Rechtes Detailpanel: Rotationsplan des gewählten Azubis.
  function buildDetail(azubiId) {
    if (!azubiId) return `<div class="planer-detail__empty">Azubi links auswählen, um den Rotationsplan zu sehen.</div>`;
    const azubi = azubis.find(a => a.id === azubiId);
    if (!azubi) return `<div class="planer-detail__empty">Azubi nicht gefunden.</div>`;
    // Alle Zuweisungen dieses Azubis aus zuwRowData, chronologisch.
    const rows = zuwRowData.filter(r => r.z.azubiId === azubiId)
      .sort((a, b) => a.z.von.localeCompare(b.z.von));
    const liste = rows.length ? rows.map(r => {
      const farbe = getBarColor(colorIndexFor(r.z.ausbilderId));
      return `
        <div class="rotation-item">
          <span class="planer-dot" style="background:${farbe}"></span>
          <div class="rotation-item__main">
            <div class="rotation-item__abt">${r.z.abteilung || '–'}</div>
            <div class="rotation-item__meta">${r.ausb?.name || '–'} · ${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}</div>
          </div>
          <span class="badge ${r.status.badge}">${r.status.label}</span>
          <button class="btn btn-sm btn-ghost detail-delete-btn" data-id="${r.z.id}" title="Löschen">✕</button>
        </div>`;
    }).join('') : `<div class="planer-empty">Noch keine Zuweisungen.</div>`;
    return `
      <div class="planer-detail__header">
        <div>
          <h2 class="planer-detail__name">${azubi.name}</h2>
          <p class="planer-detail__beruf">${azubi.beruf || ''}</p>
        </div>
        <button class="btn btn-sm btn-secondary detail-add-btn" data-azubi-id="${azubiId}">+ Zuweisung</button>
      </div>
      <div class="rotation-list">${liste}</div>`;
  }

  // Detailpanel-Events: Anlegen (vorausgewählt) + Löschen.
  function bindDetailEvents() {
    document.querySelector('.detail-add-btn')?.addEventListener('click', (e) => openNewZuweisung(e.currentTarget.dataset.azubiId));
    document.querySelectorAll('.detail-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeleteZuweisungId = parseInt(btn.dataset.id);
        const row = zuwRowData.find(r => r.z.id === pendingDeleteZuweisungId);
        const textEl = document.getElementById('zuweisungDeleteText');
        if (textEl) textEl.textContent = row?.azubi
          ? `Die Zuweisung von „${row.azubi.name}" wird unwiderruflich entfernt. Möchtest du fortfahren?`
          : 'Diese Zuweisung wird unwiderruflich entfernt. Möchtest du fortfahren?';
        Modal.open('zuweisungDeleteModal');
      });
    });
  }

  function buildGanttHeader() {
    // Obere Zeile: je Monat eine Zelle, Breite = Anzahl Tage des Monats.
    const monate = Array.from({ length: 12 }, (_, m) => {
      const dim = new Date(planYear, m + 1, 0).getDate();
      return `<div class="gantt-month" style="width:calc(${dim} * var(--day-px))">${DateUtil.MONTHS[m]} ${planYear}</div>`;
    }).join('');
    // Untere Zeile: je Kalendertag eine Spalte mit Tageszahl.
    const tage = [];
    for (let m = 0; m < 12; m++) {
      const dim = new Date(planYear, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const date = new Date(planYear, m, d);
        const dow = date.getDay();                 // 0=So, 6=Sa
        const isWeekend = dow === 0 || dow === 6;
        const isToday = today.getFullYear() === planYear && today.getMonth() === m && today.getDate() === d;
        const isMonthStart = d === 1;
        tage.push(`<div class="gantt-day${isWeekend ? ' gantt-day--weekend' : ''}${isToday ? ' current' : ''}${isMonthStart ? ' gantt-day--month' : ''}" title="${DateUtil.formatDate(`${planYear}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)}">${d}</div>`);
      }
    }
    return `
      <div class="gantt-header">
        <div class="gantt-header__name-col">Auszubildende/r</div>
        <div class="gantt-header__timeline">
          <div class="gantt-months">${monate}</div>
          <div class="gantt-days">${tage.join('')}${buildTodayMarker()}</div>
        </div>
      </div>
    `;
  }

  /* „Heute"-Label EINMAL im Header (an der Tages-Position). Die senkrechte
     Linie pro Zeile (buildTodayLine) bleibt als durchgehende Orientierung,
     trägt aber keinen Text mehr – sonst stünde „Heute" auf jeder Zeile. */
  function buildTodayMarker() {
    if (today.getFullYear() !== planYear) return '';
    const pct = (dayOf(today) + 0.5) / NUM_DAYS * 100;
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
          <div class="gantt-row__timeline">
            ${buildTodayLine()}
            ${bars}
          </div>
        </div>
      `;
    }));

    return rows.join('');
  }

  async function buildGanttBars(zuweisungen) {
    const bars = await Promise.all(zuweisungen.map(async z => {
      const fromDay = dayOf(new Date(z.von + 'T00:00:00'));
      const toDay   = dayOf(new Date(z.bis + 'T00:00:00'));
      const startDay = Math.max(0, fromDay);
      const endDay   = Math.min(NUM_DAYS - 1, toDay);
      if (endDay < startDay) return '';            // Zuweisung außerhalb dieses Jahres
      const left  = startDay / NUM_DAYS * 100;
      const width = (endDay - startDay + 1) / NUM_DAYS * 100;
      const ausb = await DB.getUser(z.ausbilderId);
      return `
        <div class="gantt-bar ${COLORS[colorIndexFor(z.ausbilderId)]}"
             style="left:${left}%;width:${width}%"
             title="${ausb?.name || '–'}: ${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}"
             data-zuweisung-id="${z.id}">
          ${width > 2.5 ? (ausb?.initials || '') : ''}
        </div>
      `;
    }));
    return bars.join('');
  }

  function buildTodayLine() {
    if (today.getFullYear() !== planYear) return '';
    const pct = (dayOf(today) + 0.5) / NUM_DAYS * 100;
    return `<div class="gantt-today-line" style="left:${pct}%"></div>`;
  }

  async function loadZuwRowData() {
    const alle = await DB.getAllZuweisungen();
    zuwRowData = await Promise.all(alle.map(async z => {
      const azubi = await DB.getUser(z.azubiId);
      const ausb  = await DB.getUser(z.ausbilderId);
      return { z, azubi, ausb, status: zuweisungStatus(z) };
    }));
  }

  // Escape für sicher eingebettete Labels/Values im Panel-HTML.
  function escHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  /* Progressive Enhancement: macht ein <select> durchsuchbar. Tippen filtert
     die Optionen per Wort-Präfix (Vor- ODER Nachname). Das <select> bleibt
     versteckt als Wert-Quelle und feuert 'change' bei Auswahl. */
  function makeSearchableSelect(select) {
    if (!select || select.dataset.comboEnhanced) return null;
    select.dataset.comboEnhanced = '1';
    select.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'combo';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control combo__input';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    const panel = document.createElement('div');
    panel.className = 'combo__panel';
    panel.hidden = true;
    wrap.appendChild(input);
    wrap.appendChild(panel);
    select.parentNode.insertBefore(wrap, select.nextSibling);

    let options = [];
    function syncFromSelect() {
      options = Array.from(select.options).map(o => ({ value: o.value, label: o.textContent }));
      const cur = select.options[select.selectedIndex];
      input.value = cur ? cur.textContent : '';
    }
    function tokenMatch(label, q) {
      if (!q) return true;
      const ql = q.toLowerCase();
      return label.toLowerCase().split(/\s+/).some(tok => tok.startsWith(ql));
    }
    function renderPanel(q) {
      const matches = options.filter(o => tokenMatch(o.label, q));
      panel.innerHTML = matches.length
        ? matches.map(o => `<div class="combo__option" data-value="${escHtml(o.value)}">${escHtml(o.label)}</div>`).join('')
        : `<div class="combo__empty">Keine Treffer</div>`;
      panel.hidden = false;
    }
    input.addEventListener('focus', () => { input.select(); renderPanel(''); });
    input.addEventListener('input', () => renderPanel(input.value.trim()));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { panel.hidden = true; input.blur(); } });
    // mousedown (vor blur) → Auswahl greift, bevor das Input den Fokus verliert
    panel.addEventListener('mousedown', (e) => {
      const opt = e.target.closest('.combo__option');
      if (!opt) return;
      e.preventDefault();
      select.value = opt.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncFromSelect();
      panel.hidden = true;
    });
    input.addEventListener('blur', () => setTimeout(() => { panel.hidden = true; }, 120));

    syncFromSelect();
    return { refresh: syncFromSelect };
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

  function openNewZuweisung(presetAzubiId) {
    const azubiSel = document.getElementById('zuweisungAzubi');
    const ausbilderSel = document.getElementById('zuweisungAusbilder');
    if (azubiSel) azubiSel.innerHTML = azubis.map(a => `<option value="${a.id}" ${a.id === presetAzubiId ? 'selected' : ''}>${a.name}</option>`).join('');
    if (ausbilderSel) ausbilderSel.innerHTML = ausbilder.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    comboModalAzubi?.refresh();
    comboModalVerantw?.refresh();
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

  // Beide Modal-Inits einmalig binden (Modal-Markup ist statisch in
  // azubi-planer.html). Innerhalb von render() würden Listener mehrfach
  // angehängt, was zu Mehrfach-Einfügungen/-Löschungen führen könnte.
  initZuweisungDeleteModal();
  initZuweisungModal();
  comboModalAzubi   = makeSearchableSelect(document.getElementById('zuweisungAzubi'));
  comboModalVerantw = makeSearchableSelect(document.getElementById('zuweisungAusbilder'));

  await render();
});
