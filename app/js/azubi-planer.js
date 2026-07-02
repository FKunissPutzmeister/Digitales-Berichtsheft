/* ===================================================================
   AZUBI-PLANER.JS

   Drei klar getrennte Zonen (siehe Design 2026-06-12):
     1. Kopf   – Filter + Auswertung (KPIs, Roster=Legende, Suche)
     2. Mitte  – Timeline (Gantt)
     3. Unten  – strukturierte, sortierbare Zuweisungsliste
   =================================================================== */

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

/* Intervalltest: zwei Zeiträume desselben Azubis überschneiden sich, wenn
   neu.von ≤ vorhanden.bis UND vorhanden.von ≤ neu.bis. Leeres Bis = offen
   (unbegrenzt). Gleicher Tag zählt bewusst als Überschneidung. */
function zeitraeumeUeberschneiden(neuVon, neuBis, exVon, exBis) {
  const nBis = neuBis || '9999-12-31';
  const eBis = exBis || '9999-12-31';
  return neuVon <= eBis && exVon <= nBis;
}

/* Meldungstext für eine überschneidende Zuweisung (Abteilung + Zeitraum). */
function zuwKonfliktText(z) {
  const vonS = DateUtil.formatDateShort(z.von);
  const bisS = z.bis ? DateUtil.formatDateShort(z.bis) : 'offen';
  const abt  = z.abteilung ? z.abteilung : 'ohne Abteilung';
  return `In diesem Zeitraum besteht bereits eine Zuweisung (${abt}, ${vonS}–${bisS}). Bitte einen freien Zeitraum wählen.`;
}

/* Einheitliche Abteilungs-Palette (15 ruhige, entsättigte Farben, alle für
   weißen Balkentext geeignet). EINE Quelle der Wahrheit – sowohl die Gantt-
   Balken als auch die Farbpunkte in Liste/Detailpanel beziehen ihre Farbe
   hierüber. Index 0 (Teal) bewusst NICHT Marken-Gelb, damit die Balken nicht
   mit den gelben UI-Akzenten (Heute, aktueller Monat) konkurrieren. Bei mehr
   als 15 Abteilungen wiederholen sich Farben (Modulo). */
const GANTT_PALETTE = [
  '#4F9D9A', '#5B86C2', '#5FAE72', '#D8835A', '#9B7BC4',
  '#C75C6B', '#C99A3E', '#6B8E4E', '#C77FB2', '#4F8FB8',
  '#7E70BE', '#B06A52', '#5BA98C', '#6E7E8C', '#A86FA0',
];
function ganttColor(idx) { return GANTT_PALETTE[((idx % GANTT_PALETTE.length) + GANTT_PALETTE.length) % GANTT_PALETTE.length]; }

/* Eigenständige, einzeilige Timeline für die Azubi-Ansicht (gleiche .gantt-*-Styles
   wie der Planer). Zeigt die Abteilungen des Azubis als farbige Balken mit Abteilungsname. */
function azubiTimelineHtml(zuw, planYear) {
  const jan1 = new Date(planYear, 0, 1);
  const daysInYear = Math.round((new Date(planYear, 11, 31) - jan1) / 86400000) + 1;
  const dayOf = d => Math.round((d - jan1) / 86400000);
  const now = new Date();

  const monate = Array.from({ length: 12 }, (_, m) => {
    const dim = new Date(planYear, m + 1, 0).getDate();
    return `<div class="gantt-month" style="width:calc(${dim} * var(--day-px))">${DateUtil.MONTHS[m]} ${planYear}</div>`;
  }).join('');
  const tage = [];
  for (let m = 0; m < 12; m++) {
    const dim = new Date(planYear, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = new Date(planYear, m, d);
      const dow = date.getDay();
      const isWe = dow === 0 || dow === 6;
      const isToday = now.getFullYear() === planYear && now.getMonth() === m && now.getDate() === d;
      const isMonthStart = d === 1;
      tage.push(`<div class="gantt-day${isWe ? ' gantt-day--weekend' : ''}${isToday ? ' current' : ''}${isMonthStart ? ' gantt-day--month' : ''}">${d}</div>`);
    }
  }
  const bars = zuw.map((z, i) => {
    if (!z.von || !z.bis) return '';
    const fromDay = dayOf(new Date(z.von + 'T00:00:00'));
    const toDay   = dayOf(new Date(z.bis + 'T00:00:00'));
    const startDay = Math.max(0, fromDay);
    const endDay   = Math.min(daysInYear - 1, toDay);
    if (endDay < startDay) return '';
    const left  = startDay / daysInYear * 100;
    const width = (endDay - startDay + 1) / daysInYear * 100;
    return `<div class="gantt-bar" style="left:${left}%;width:${width}%;background:${ganttColor(i)}"
              title="${escHtml(z.abteilung || '–')} (${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)})">
              <span class="gantt-bar__label">${escHtml(z.abteilung || '')}</span>
            </div>`;
  }).join('');
  const todayPct = now.getFullYear() === planYear ? (dayOf(now) + 0.5) / daysInYear * 100 : null;
  const todayLine = todayPct != null
    ? `<div class="gantt-today-line" style="left:${todayPct}%"></div>
       <div class="gantt-today-marker" style="left:${todayPct}%">Heute</div>`
    : '';

  return `
    <div class="gantt-scroll" id="azubiGanttScroll">
      <div class="gantt-grid gantt--lg" style="--num-days:${daysInYear};--day-px:30px">
        <div class="gantt-header">
          <div class="gantt-header__name-col">${planYear}</div>
          <div class="gantt-header__timeline">
            <div class="gantt-months">${monate}</div>
            <div class="gantt-days">${tage.join('')}</div>
          </div>
        </div>
        <div class="gantt-body">
          <div class="gantt-row">
            <div class="gantt-row__info"><span class="gantt-row__name">Abteilungen</span></div>
            <div class="gantt-row__timeline">${todayLine}${bars}</div>
          </div>
        </div>
      </div>
    </div>`;
}

/* Read-only Sicht für Azubis: zeigt ausschließlich die eigenen Zuweisungen –
   pro Eintrag Abteilung, Zeitraum und Ansprechpartner/Verantwortliche/r. */
async function renderAzubiDurchlauf(user) {
  // Aktiven Nav-Punkt korrigieren (der Azubi erreicht die Seite über „Abteilungsdurchlauf").
  document.getElementById('nav-planer')?.classList.remove('active');
  document.getElementById('nav-abteilungsplan')?.classList.add('active');

  const main = document.getElementById('mainContent');
  // Volle Seitenbreite (gleicher Marker wie der Planer) – die Timeline nutzt so den ganzen Platz.
  document.body.dataset.page = 'azubi-planer';
  const esc = escHtml;  // identisch zur Datei-Funktion escHtml – kein dupliziertes Escape-Regex

  try {
    const heute = DateUtil.toISODate(new Date());
    const planYearAz = new Date().getFullYear();

    const zuwRaw = await DB.getZuweisungenFuerAzubi(user.id);
    const zuw = zuwRaw.slice().sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    const rows = await Promise.all(zuw.map(async z => {
      let status;
      if (!z.von || !z.bis)    status = { label: 'Offen',      badge: 'badge--grey' };
      else if (z.bis < heute)  status = { label: 'Beendet',    badge: 'badge--grey' };
      else if (z.von > heute)  status = { label: 'Zukünftig', badge: 'badge--freigegeben' };
      else                     status = { label: 'Aktuell',   badge: 'badge--genehmigt' };
      return { z, status };
    }));

    const card = r => `
    <div class="durchlauf-card${r.status.label === 'Aktuell' ? ' durchlauf-card--current' : ''}">
      <span class="badge ${r.status.badge} durchlauf-card__badge">${r.status.label}</span>
      <div class="durchlauf-card__abt">${esc(r.z.abteilung) || '–'}</div>
      <div class="durchlauf-card__zeit">${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}</div>
      <div class="durchlauf-card__verantw">Ansprechpartner: <strong>${esc(r.z.verantwName || '–')}</strong></div>
    </div>`;

    main.innerHTML = `
    <div class="page-header">
      <div class="page-header__left">
        <h1 class="page-title">Mein Abteilungsdurchlauf</h1>
      </div>
    </div>
    ${zuw.length ? azubiTimelineHtml(zuw, planYearAz) : ''}
    ${rows.length
      ? `<div class="durchlauf-list">${rows.map(card).join('')}</div>`
      : `<div class="durchlauf-empty">Dir ist aktuell keine Abteilung zugewiesen.</div>`}
  `;

    const azTs = document.getElementById('azubiGanttScroll');
    if (azTs) {
      const jan1Az = new Date(planYearAz, 0, 1);
      const dayIdx = Math.round((new Date() - jan1Az) / 86400000);
      requestAnimationFrame(() => { azTs.scrollLeft = Math.max(0, (dayIdx - 3) * 30); });
    }
  } catch (err) {
    main.innerHTML = `<div class="durchlauf-empty">Abteilungsdurchlauf konnte nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Abteilungsdurchlauf konnte nicht geladen werden.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-planer', [{ label: 'Azubi-Planer', href: 'azubi-planer.html' }]);
  if (!user) return;

  if (!user.kannPlanen) {
    if (user.istAzubi) {
      await renderAzubiDurchlauf(user);   // read-only Sicht: eigene Abteilungs-Durchläufe
    } else {
      window.location.href = 'dashboard.html';
    }
    return;
  }

  /* Layout-Marker: erlaubt dem Azubi-Planer die volle Seitenbreite (Override
     der globalen --content-max-Beschränkung in layout.css) – die Timeline
     braucht den Platz für die 12 Monate. */
  document.body.dataset.page = 'azubi-planer';

  // Balken-/Punktfarben kommen aus der zentralen GANTT_PALETTE (15 Farben,
  // siehe oben). Die Länge steuert auch das Modulo in colorIndexFor().
  const PALETTE_LEN = GANTT_PALETTE.length;

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
  // Einmal aufgelöste Zeilendaten (Azubi-/Ausbilder-Objekte).
  let zuwRowData = [];

  // Verantwortliche-Auswahl = alle Nicht-Azubi-Nutzer (nicht nur Ausbilder).
  const ausbilder = await DB.getVerantwortliche();
  const azubis = await DB.getAzubis();
  // Abteilungs-Katalog (nur aktive) für das Zuweisungs-Dropdown.
  const abteilungenKatalog = await DB.getAbteilungen();

  // Abteilungs-Farb-Map: jeder ABTEILUNG einen STABILEN Paletten-Index
  // zuordnen (bewusst NICHT mehr pro Verantwortlicher). Gleiche Abteilung =
  // gleiche Farbe – einheitlich über Gantt-Balken, Listen-Punkt und
  // Detailpanel. Die Zuordnung wird in loadZuwRowData() einmal aus den
  // sortierten Abteilungsnamen vorbefüllt, damit dieselbe Abteilung
  // sitzungsweit dieselbe Farbe behält; hier dient die Funktion zusätzlich als
  // sicherer Fallback (leer/unbekannt → Index 0 statt -1/undefined, sonst
  // bekäme der Balken die Klasse "undefined" = keine Farbe = schwarz).
  // Hinweis: mehr Abteilungen als Palettenfarben (5) führen bewusst zu
  // Farbwiederholungen.
  const abteilungColorIdx = {};
  let _nextColorIdx = 0;
  function colorIndexFor(abteilung) {
    if (!abteilung) return 0;
    if (!(abteilung in abteilungColorIdx)) {
      abteilungColorIdx[abteilung] = _nextColorIdx % PALETTE_LEN;
      _nextColorIdx++;
    }
    return abteilungColorIdx[abteilung];
  }

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
    const ausbilderAktiv    = new Set(aktuelle.map(r => r.z.verantwEmail).filter(Boolean));
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
      if (filterVerantw && akt?.z.verantwEmail !== filterVerantw) return false;
      if (filterAbteilung && akt?.z.abteilung !== filterAbteilung) return false;
      if (filterLehrjahr && String(lehrjahrVon(a)) !== filterLehrjahr) return false;
      return true;
    });
  }

  function alleVerantwortliche() {
    const map = new Map();
    zuwRowData.forEach(r => { if (r.z.verantwEmail) map.set(r.z.verantwEmail, r.z.verantwName || r.z.verantwEmail); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  function buildVerantwOptions() {
    return `<option value="">Alle Verantwortlichen</option>` +
      alleVerantwortliche().map(([email, name]) => `<option value="${email}" ${email === filterVerantw ? 'selected' : ''}>${name}</option>`).join('');
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

    // Alte PMSelect-Instanzen im Hauptbereich aufräumen, bevor innerHTML ersetzt
    // wird: offenes Menü schließen + MutationObserver trennen (sonst lecken sie
    // auf detachten <select>-Nodes und ein offenes Menü bliebe als Body-Orphan).
    if (typeof PMSelect !== 'undefined') {
      PMSelect.closeAll();
      main.querySelectorAll('select[data-pm-enhanced]').forEach(s => {
        try { s._pmInstance && s._pmInstance.destroy(); } catch (e) { /* defensiv */ }
      });
    }

    await loadZuwRowData();
    const ganttRowsHtml = await buildGanttRows();

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Azubi-Planer</h1>
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

      <details class="planer-gantt-details" open>
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

    const ganttDetails = document.querySelector('.planer-gantt-details');
    if (ganttDetails) {
      const ganttScroll = () => ganttDetails.querySelector('.gantt-scroll');
      ganttDetails.addEventListener('toggle', () => {
        if (ganttDetails.open) { applyGanttHeight(ganttScroll()); scrollGanttToToday(ganttScroll()); }
      });
      // Standardmäßig ausgeklappt: einmal initial Höhe begrenzen + auf "heute"
      // scrollen – das toggle-Event feuert beim bereits offenen <details> nicht.
      if (ganttDetails.open) { applyGanttHeight(ganttScroll()); scrollGanttToToday(ganttScroll()); }
    }

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
        const farbe = getBarColor(colorIndexFor(akt.z.abteilung));
        badge = `<span class="badge ${akt.status.badge}">${akt.status.label}</span>`;
        sub = `<span class="planer-dot" style="background:${farbe}"></span>${akt.z.abteilung || '–'} · ${akt.ausbName || '–'}`;
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
      const farbe = getBarColor(colorIndexFor(r.z.abteilung));
      return `
        <div class="rotation-item">
          <span class="planer-dot" style="background:${farbe}"></span>
          <div class="rotation-item__main">
            <div class="rotation-item__abt">${r.z.abteilung || '–'}</div>
            <div class="rotation-item__meta">${r.ausbName || '–'} · ${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}</div>
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
      return `
        <div class="gantt-bar"
             style="left:${left}%;width:${width}%;background:${ganttColor(colorIndexFor(z.abteilung))}"
             title="${escHtml(z.abteilung || '–')} · ${escHtml(z.verantwName || '–')} (${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)})">
          <span class="gantt-bar__label">${escHtml(z.abteilung || '')}</span>
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

  // Scrollt den Gantt so, dass die aktuelle Woche sichtbar ist (heute ~3 Tage vom linken Rand).
  function scrollGanttToToday(scrollEl) {
    if (!scrollEl || today.getFullYear() !== planYear) return;
    requestAnimationFrame(() => { scrollEl.scrollLeft = Math.max(0, (dayOf(today) - 3) * 22); });
  }

  // Begrenzt die Gesamt-Timeline auf max. 10 Azubi-Zeilen; ab der 11. Zeile
  // wird vertikal gescrollt. Header (sticky top) und Personenspalte (sticky
  // left) bleiben dabei stehen. Die Höhe wird aus den REALEN Zeilenhöhen
  // summiert (nicht 10×64px fest), damit zweizeilige Namen exakt mitzählen.
  const GANTT_VISIBLE_ROWS = 10;
  function applyGanttHeight(scrollEl) {
    if (!scrollEl) return;
    requestAnimationFrame(() => {
      const header = scrollEl.querySelector('.gantt-header');
      const rows = scrollEl.querySelectorAll('.gantt-row');
      if (!header) return;
      // ≤10 Zeilen: keine Begrenzung – Timeline wächst natürlich mit.
      if (rows.length <= GANTT_VISIBLE_ROWS) { scrollEl.style.maxHeight = ''; return; }
      let h = header.offsetHeight;
      for (let i = 0; i < GANTT_VISIBLE_ROWS; i++) h += rows[i].offsetHeight;
      scrollEl.style.maxHeight = h + 'px';
    });
  }

  async function loadZuwRowData() {
    const alle = await DB.getAllZuweisungen();
    zuwRowData = await Promise.all(alle.map(async z => {
      const azubi = await DB.getUser(z.azubiId);
      const ausbName = z.verantwName;
      return { z, azubi, ausbName, status: zuweisungStatus(z) };
    }));
    // Abteilungs-Farben in stabiler (alphabetischer) Reihenfolge vorbelegen,
    // damit dieselbe Abteilung über Renders/Filter hinweg dieselbe Farbe behält
    // – unabhängig davon, welcher Azubi zuerst gerendert wird.
    [...new Set(zuwRowData.map(r => r.z.abteilung).filter(Boolean))].sort()
      .forEach(ab => colorIndexFor(ab));
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

  function fillVerantwOptions(abteilungName) {
    const ausbilderSel = document.getElementById('zuweisungAusbilder');
    if (!ausbilderSel) return;
    const abt = abteilungenKatalog.find(a => a.name === abteilungName);
    const list = abt ? abt.verantwortliche : [];
    ausbilderSel.innerHTML = list.length
      ? list.map(v => `<option value="${v.email}">${v.name}</option>`).join('')
      : `<option value="">— keine hinterlegt —</option>`;
  }

  function openNewZuweisung(presetAzubiId) {
    const azubiSel = document.getElementById('zuweisungAzubi');
    const abteilungSel = document.getElementById('zuweisungAbteilung');
    if (azubiSel) azubiSel.innerHTML = azubis.map(a => `<option value="${a.id}" ${a.id === presetAzubiId ? 'selected' : ''}>${a.name}</option>`).join('');
    if (abteilungSel) {
      abteilungSel.innerHTML = abteilungenKatalog.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
      fillVerantwOptions(abteilungSel.value);
      abteilungSel.onchange = () => fillVerantwOptions(abteilungSel.value);
    }
    Modal.open('zuweisungModal');
  }

  function initZuweisungModal() {
    document.getElementById('zuweisungSaveBtn')?.addEventListener('click', async () => {
      // Azubi-/Ausbilder-IDs sind GUID-Strings – nicht per parseInt() in
      // Zahlen wandeln (ergäbe 0 und damit eine ungültige Zuweisung).
      const azubiId = document.getElementById('zuweisungAzubi').value;
      const verantwEmail = document.getElementById('zuweisungAusbilder').value;
      const von = document.getElementById('zuweisungVon').value;
      const bis = document.getElementById('zuweisungBis').value;
      const abteilung = document.getElementById('zuweisungAbteilung').value;
      if (!abteilung) { Toast.error('Pflichtfeld', 'Bitte Abteilung wählen.'); return; }
      if (!verantwEmail) { Toast.error('Pflichtfeld', 'Für diese Abteilung ist keine verantwortliche Person hinterlegt.'); return; }

      if (!von || !bis) { Toast.error('Pflichtfeld', 'Bitte Zeitraum angeben.'); return; }
      if (von > bis) { Toast.error('Ungültiger Zeitraum', 'Startdatum muss vor Enddatum liegen.'); return; }

      // Überschneidung mit bestehender Zuweisung desselben Azubis verhindern.
      // Frisch laden (kein Cache), damit auch zwischenzeitlich angelegte zählen.
      try {
        const bestehende = await DB.getZuweisungenFuerAzubi(azubiId);
        const konflikt = bestehende.find(z => zeitraeumeUeberschneiden(von, bis, z.von, z.bis));
        if (konflikt) { Toast.error('Überschneidung', zuwKonfliktText(konflikt)); return; }
      } catch (_) { /* Pre-Check optional – das Backend prüft ohnehin verbindlich */ }

      try {
        await DB.addZuweisung({ azubiId, verantwEmail, von, bis, abteilung });
      } catch (e) {
        // Backend lehnt Überschneidungen mit 409 ab (deckt Race/Direktaufruf ab).
        Toast.error('Nicht möglich', e.message || 'Zuweisung konnte nicht gespeichert werden.');
        return;
      }
      Modal.closeAll();
      Toast.success('Gespeichert', 'Neue Zuweisung wurde angelegt.');
      await render();
    });
  }

  // Farbpunkt für Liste/Detailpanel – greift auf dieselbe zentrale Palette
  // wie die Balken zu (GANTT_PALETTE), damit Punkt und Balken einer Abteilung
  // exakt dieselbe Farbe haben.
  function getBarColor(idx) { return ganttColor(idx); }

  // Beide Modal-Inits einmalig binden (Modal-Markup ist statisch in
  // azubi-planer.html). Innerhalb von render() würden Listener mehrfach
  // angehängt, was zu Mehrfach-Einfügungen/-Löschungen führen könnte.
  initZuweisungDeleteModal();
  initZuweisungModal();

  await render();
});
