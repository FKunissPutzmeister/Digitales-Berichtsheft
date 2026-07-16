/* ===================================================================
   ABTEILUNGS-PLANER.JS (ehemals azubi-planer.js)

   Plant Abteilungs-Zuweisungen für Azubis UND DH-Studenten.
   – Planer-Sicht (kannPlanen): Plantafel (Timeline-first, Design 2026-07).
   – Read-only-Sichten: eigener Durchlauf (Azubi) / betreute Azubis (Ausbilder).
   =================================================================== */

const escHtml = window.escapeHtml;

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

/* Status-Badge einer Zuweisung (relativ zu heute). */
function durchlaufStatus(z, heute) {
  if (!z.von || !z.bis)   return { label: 'Offen',      badge: 'badge--grey' };
  if (z.bis < heute)      return { label: 'Beendet',    badge: 'badge--grey' };
  if (z.von > heute)      return { label: 'Zukünftig', badge: 'badge--freigegeben' };
  return { label: 'Aktuell', badge: 'badge--genehmigt' };
}

/* Read-only Durchlauf-Inhalt (Timeline + Karten) EINES Azubis. Gemeinsame Basis
   für die Azubi-Eigensicht und die Ausbilder-Sicht. */
async function durchlaufBodyHtml(azubiId, ausbilderMode = false) {
  const heute = DateUtil.toISODate(new Date());
  const planYear = new Date().getFullYear();
  const zuw = (await DB.getZuweisungenFuerAzubi(azubiId))
    .slice().sort((a, b) => (a.von || '').localeCompare(b.von || ''));
  let beurtByZuw = {};
  try {
    (await DB.getBeurteilungenFuerAzubi(azubiId)).forEach(b => { beurtByZuw[b.zuweisungId] = b; });
  } catch (e) { /* Endpoint evtl. nicht verfügbar -> ohne Badges weiter */ }

  const card = z => {
    const s = durchlaufStatus(z, heute);
    const b = beurtByZuw[z.id];
    // Verantwortliche dürfen ab Beginn des Durchlaufs beurteilen (aktiv ODER beendet),
    // aber nicht bei rein zukünftigen Durchläufen. Backend prüft datumsunabhängig.
    const gestartet = z.von && z.von <= heute;
    let beurtBadge = '', klickbar = false;
    if (b && b.status === 'abgeschlossen') { beurtBadge = `<span class="badge badge--genehmigt durchlauf-card__beurt">Beurteilung ✓</span>`; klickbar = true; }
    else if (ausbilderMode && (b && b.status === 'entwurf')) { beurtBadge = `<span class="badge badge--freigegeben durchlauf-card__beurt">Entwurf</span>`; klickbar = true; }
    else if (ausbilderMode && gestartet) { beurtBadge = `<span class="badge badge--grey durchlauf-card__beurt">Beurteilung offen</span>`; klickbar = true; }
    return `
    <div class="durchlauf-card${s.label === 'Aktuell' ? ' durchlauf-card--current' : ''}${klickbar ? ' durchlauf-card--clickable' : ''}"
         ${klickbar ? `data-zuw="${z.id}" role="button" tabindex="0"` : ''}>
      <span class="badge ${s.badge} durchlauf-card__badge">${s.label}</span>
      <div class="durchlauf-card__abt">${escHtml(z.abteilung) || '–'}</div>
      <div class="durchlauf-card__zeit">${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}</div>
      <div class="durchlauf-card__verantw">Ansprechpartner: <strong>${escHtml(z.verantwName || '–')}</strong></div>
      ${beurtBadge}
    </div>`;
  };
  return `
    ${zuw.length ? azubiTimelineHtml(zuw, planYear) : ''}
    ${zuw.length
      ? `<div class="durchlauf-list">${zuw.map(card).join('')}</div>`
      : `<div class="durchlauf-empty">Aktuell keine Abteilung zugewiesen.</div>`}`;
}

// Kachel-Klick -> Beurteilungsseite (Delegation; einmal pro Render aufrufen).
function wireBeurteilungKacheln(root) {
  (root || document).querySelectorAll('.durchlauf-card--clickable').forEach(el => {
    const go = () => { window.location.href = `beurteilung.html?zuw=${el.dataset.zuw}`; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

/* Timeline nach dem Rendern auf „heute" scrollen. */
function scrollDurchlaufToToday() {
  const azTs = document.getElementById('azubiGanttScroll');
  if (!azTs) return;
  const jan1 = new Date(new Date().getFullYear(), 0, 1);
  const dayIdx = Math.round((new Date() - jan1) / 86400000);
  requestAnimationFrame(() => { azTs.scrollLeft = Math.max(0, (dayIdx - 3) * 30); });
}

/* Read-only Sicht für Azubis: der eigene Abteilungsdurchlauf. */
async function renderAzubiDurchlauf(user) {
  // Aktiven Nav-Punkt korrigieren (der Azubi erreicht die Seite über „Abteilungsdurchlauf").
  document.getElementById('nav-planer')?.classList.remove('active');
  document.getElementById('nav-abteilungsplan')?.classList.add('active');

  const main = document.getElementById('mainContent');
  // Volle Seitenbreite (gleicher Marker wie der Planer) – die Timeline nutzt so den ganzen Platz.
  document.body.dataset.page = 'abteilungs-planer';

  try {
    main.innerHTML = `
    <div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Mein Abteilungsdurchlauf</h1>
    </div></div>
    ${await durchlaufBodyHtml(user.id)}`;
    scrollDurchlaufToToday();
    wireBeurteilungKacheln(main);
  } catch (err) {
    main.innerHTML = `<div class="durchlauf-empty">Abteilungsdurchlauf konnte nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Abteilungsdurchlauf konnte nicht geladen werden.');
  }
}

/* Read-only Sicht für Ausbilder: der Abteilungsdurchlauf ihrer betreuten Azubis,
   mit Azubi-Selektor (gleiche Chips wie Wochen-/Jahresansicht). Keine Planungs-
   oder Verwaltungsrechte – reine Anzeige. */
async function renderAusbilderDurchlauf(user) {
  document.getElementById('nav-planer')?.classList.remove('active');
  document.getElementById('nav-abteilungsplan')?.classList.add('active');
  document.body.dataset.page = 'abteilungs-planer';
  const main = document.getElementById('mainContent');

  try {
    const azubis = await DB.getSelectableAzubis();
    const header = `<div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Abteilungsdurchlauf</h1>
    </div></div>`;

    if (!azubis.length) {
      main.innerHTML = `${header}
        <div class="durchlauf-empty">Ihnen ist aktuell kein Azubi zugewiesen.</div>`;
      return;
    }

    const selectorHtml = (currentId) => renderAzubiSelect(azubis, currentId);

    async function renderFor(azubiId) {
      // Vorherige PMSelect-Instanz (Azubi-Dropdown) sauber trennen, bevor
      // innerHTML ersetzt wird – sonst lecken MutationObserver auf detachten Nodes.
      if (typeof PMSelect !== 'undefined') {
        PMSelect.closeAll();
        main.querySelectorAll('select[data-pm-enhanced]').forEach(s => {
          try { s._pmInstance && s._pmInstance.destroy(); } catch (e) { /* defensiv */ }
        });
      }
      main.innerHTML = `${header}${selectorHtml(azubiId)}${await durchlaufBodyHtml(azubiId, true)}`;
      const azubiSelectEl = main.querySelector('#azubiSelect');
      if (azubiSelectEl) azubiSelectEl.addEventListener('change', () => renderFor(azubiSelectEl.value));
      scrollDurchlaufToToday();
      wireBeurteilungKacheln(main);
    }

    await renderFor(azubis[0].id);
  } catch (err) {
    main.innerHTML = `<div class="durchlauf-empty">Abteilungsdurchlauf konnte nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Abteilungsdurchlauf konnte nicht geladen werden.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-planer', [{ label: 'Abteilungs-Planer', href: 'abteilungs-planer.html' }]);
  if (!user) return;

  // Über „Abteilungsdurchlauf" (?mein=1) sehen Azubis immer den EIGENEN
  // Durchlauf – auch Planer/Developer, die selbst Azubi sind (Dev-Hybrid).
  if (user.istAzubi && new URLSearchParams(location.search).has('mein')) {
    await renderAzubiDurchlauf(user);
    return;
  }

  if (!user.kannPlanen) {
    if (user.istAzubi) {
      await renderAzubiDurchlauf(user);       // read-only: eigener Abteilungsdurchlauf
    } else if (user.istReinerPruefer) {
      window.location.href = 'dashboard.html'; // Abteilungsdurchlauf ist für reine Prüfer komplett unsichtbar
    } else if (user.istAusbilder) {
      await renderAusbilderDurchlauf(user);   // read-only: Durchlauf der betreuten Azubis
    } else {
      window.location.href = 'dashboard.html';
    }
    return;
  }

  /* ═══════════════════════════════════════════════════════════════════
     PLANTAFEL – Timeline-first Arbeitsfläche (Design „Plantafel", 2026-07)
     Eine Zeitleiste ist das Herzstück: Personen nach Lehrjahr/DH gruppiert,
     ein Balken je Zuweisung, Detail-Panel rechts. Daten werden EINMAL
     geladen (kein N+1) und im Speicher gepflegt; Mutationen patchen den
     State und rendern neu – ohne Refetch.
     ═══════════════════════════════════════════════════════════════════ */
  document.body.dataset.page = 'abteilungs-planer';

  const PALETTE_LEN = GANTT_PALETTE.length;
  const DAY = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = DateUtil.toISODate(today);

  // Ausbildungsjahr (Sep–Aug); Default = laufendes AJ.
  let ajStartYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  let zoom = 'jahr';                                   // 'monat' | 'quartal' | 'jahr'
  const DAY_PX = { monat: 26, quartal: 9, jahr: 3.4 };

  // Filter-State
  let searchText = '', filterBeruf = '', filterJahrgang = '', filterAbteilung = '',
      filterVerantw = '', nurOhne = false, showInaktive = false;
  let selectedAzubiId = null;
  const collapsed = new Set();                         // eingeklappte Gruppen (Titel)
  let editId = null;                                   // im Modal bearbeitete Zuweisung (null = neu)
  let addPresetAzubiId = null;                         // Vorauswahl beim Anlegen
  let lastUndo = null;                                 // { id, prev:{von,bis} } für Strg+Z

  // ── Daten einmal laden (Namen kommen per JOIN mit) ──
  const [azubisRaw, dhRaw, abteilungenKatalog, alleZuweisungen] = await Promise.all([
    DB.getAzubis(), DB.getDhStudenten(), DB.getAbteilungen(), DB.getAllZuweisungen(),
  ]);
  // Nach Nachname sortieren (unabhängig vom Speicherformat), dann Anzeige-
  // Namen "Vorname Nachname" + Initialen "FK" setzen (initials via api.js).
  const nachnameKey = raw => {
    const n = String(raw ?? '').trim();
    return (n.includes(',') ? n.split(',')[0] : n.split(/\s+/).slice(-1)[0] || n).toLowerCase();
  };
  // Nach OID deduplizieren: ein Konto, das sowohl in der Azubi- (Role='azubi'
  // ODER IstAzubi=1) als auch in der DH-Liste steht, käme sonst doppelt als
  // zwei Zeilen mit identischem Avatar. (Echte Namensdubletten = verschiedene
  // OIDs = verschiedene Menschen und bleiben bewusst getrennt.)
  const seenOid = new Set();
  const azubis = [...azubisRaw, ...dhRaw]
    .filter(a => (seenOid.has(a.id) ? false : (seenOid.add(a.id), true)))
    .sort((a, b) => nachnameKey(a.name).localeCompare(nachnameKey(b.name), 'de'))
    .map(a => ({ ...a, name: displayName(a.name), initials: getInitials(a.name) }));
  const azubiById = new Map(azubis.map(a => [a.id, a]));

  // Zuweisungen je Azubi (In-Memory-Index).
  let zuwByAzubi = new Map();
  function indexZuweisungen(list) {
    zuwByAzubi = new Map();
    list.forEach(z => {
      if (!zuwByAzubi.has(z.azubiId)) zuwByAzubi.set(z.azubiId, []);
      zuwByAzubi.get(z.azubiId).push(z);
    });
    zuwByAzubi.forEach(arr => arr.sort((a, b) => (a.von || '').localeCompare(b.von || '')));
  }
  indexZuweisungen(alleZuweisungen);
  function zuwList(azubiId) { return zuwByAzubi.get(azubiId) || []; }
  function findZuw(id) {
    for (const arr of zuwByAzubi.values()) { const z = arr.find(x => x.id === id); if (z) return z; }
    return null;
  }

  // Stabile Abteilungsfarbe (alphabetisch vorbelegt → gleiche Abteilung immer gleiche Farbe).
  const abteilungColorIdx = {};
  let _nextC = 0;
  [...new Set(alleZuweisungen.map(z => z.abteilung).filter(Boolean))].sort()
    .forEach(ab => { abteilungColorIdx[ab] = (_nextC++) % PALETTE_LEN; });
  function colorFor(ab) {
    if (!ab) return ganttColor(0);
    if (!(ab in abteilungColorIdx)) { abteilungColorIdx[ab] = (_nextC++) % PALETTE_LEN; }
    return ganttColor(abteilungColorIdx[ab]);
  }
  function verantwNameFor(email) {
    if (!email) return '';
    for (const abt of abteilungenKatalog) {
      const v = (abt.verantwortliche || []).find(x => (x.email || '').toLowerCase() === email.toLowerCase());
      if (v) return v.name || email;
    }
    return (typeof deriveName === 'function') ? deriveName(email) : email;
  }

  // ── Zeit-/Gruppen-Helfer ──
  function ajWindow() {
    const start = new Date(ajStartYear, 8, 1);         // 1. Sep
    const end   = new Date(ajStartYear + 1, 7, 31);    // 31. Aug
    const days  = Math.round((end - start) / DAY) + 1;
    return { start, end, days };
  }
  function ajLabel() { return `AJ ${ajStartYear}/${String(ajStartYear + 1).slice(2)}`; }
  function lehrjahrVon(a) {
    if (a.istDhStudent || !a.ausbildungsBeginn) return null;
    const s = new Date(a.ausbildungsBeginn + 'T00:00:00');
    const m = (today.getFullYear() - s.getFullYear()) * 12 + (today.getMonth() - s.getMonth());
    return Math.max(1, Math.min(4, Math.floor(m / 12) + 1));
  }
  function gruppeVon(a) {
    if (a.istDhStudent) return 'DH-Studenten';
    const lj = lehrjahrVon(a);
    return lj ? `${lj}. Lehrjahr` : 'Ohne Zuordnung';
  }
  const GROUP_ORDER = ['1. Lehrjahr', '2. Lehrjahr', '3. Lehrjahr', '4. Lehrjahr', 'DH-Studenten', 'Ohne Zuordnung'];

  function statusOf(z) {
    if (z.bis && z.bis < todayISO) return { key: 'beendet',    label: 'Beendet',    badge: 'badge--grey' };
    if (z.von > todayISO)          return { key: 'zukuenftig', label: 'Zukünftig', badge: 'badge--freigegeben' };
    return { key: 'aktuell', label: 'Aktuell', badge: 'badge--genehmigt' };
  }
  function aktuelleZuw(azubiId) { return zuwList(azubiId).find(z => statusOf(z).key === 'aktuell') || null; }
  function konfliktIds(azubiId) {
    const arr = zuwList(azubiId); const set = new Set();
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        if (zeitraeumeUeberschneiden(arr[i].von, arr[i].bis, arr[j].von, arr[j].bis)) { set.add(arr[i].id); set.add(arr[j].id); }
    return set;
  }

  // ── Suche: tippfehler-tolerant + diakritika-insensitiv ──
  // ponytail: O(azubis × tokens × wortlänge) – bei ~Dutzenden Azubis irrelevant;
  // erst bei Tausenden auf einen vorab normalisierten Index umstellen.
  const normDia = s => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  // Damerau-Levenshtein (OSA): benachbarte Vertauschung = 1 Edit ("kenr"→"kern").
  function editDist(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[m][n];
  }
  // Query matcht, wenn jedes Query-Wort Teilstring ist ODER einem Token nah genug.
  function fuzzyMatch(query, text) {
    const q = normDia(query).trim();
    if (!q) return true;
    const t = normDia(text);
    if (t.includes(q)) return true;
    const toks = t.split(/\s+/).filter(Boolean);
    return q.split(/\s+/).filter(Boolean).every(qw => {
      const tol = qw.length <= 6 ? 1 : qw.length <= 9 ? 2 : 3;
      // Exakter Teilstring gewinnt immer; die Fuzzy-Toleranz nur bei gleichem
      // Anfangsbuchstaben zulassen – sonst matchen fremde Namen gleicher Länge
      // (z. B. "muller"↔"haller" = Distanz 2) und blenden falsche Personen ein.
      return toks.some(tw => tw.includes(qw) || (qw[0] === tw[0] && editDist(qw, tw) <= tol));
    });
  }

  // ── Filter ──
  function passtFilter(a) {
    if (searchText && !fuzzyMatch(searchText, `${a.name} ${a.beruf || ''}`)) return false;
    if (!showInaktive && a.aktiv === false) return false;
    if (filterBeruf && a.beruf !== filterBeruf) return false;
    if (filterJahrgang) {
      if (filterJahrgang === 'DH') { if (!a.istDhStudent) return false; }
      else if (String(lehrjahrVon(a)) !== filterJahrgang) return false;
    }
    if (nurOhne && aktuelleZuw(a.id)) return false;
    if (filterAbteilung && !zuwList(a.id).some(z => z.abteilung === filterAbteilung)) return false;
    if (filterVerantw && !zuwList(a.id).some(z => z.verantwEmail === filterVerantw)) return false;
    return true;
  }
  function gruppierteAzubis() {
    const gefiltert = azubis.filter(passtFilter);
    const byGroup = new Map();
    gefiltert.forEach(a => {
      const g = gruppeVon(a);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(a);
    });
    return GROUP_ORDER.filter(g => byGroup.has(g)).map(g => ({ title: g, azubis: byGroup.get(g) }));
  }

  // ── Options der Filter-Dropdowns ──
  function opt(v, label, cur) { return `<option value="${escHtml(v)}" ${v === cur ? 'selected' : ''}>${escHtml(label)}</option>`; }
  function berufOptions() {
    const set = [...new Set(azubis.map(a => a.beruf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    return `<option value="">Alle Berufe</option>` + set.map(b => opt(b, b, filterBeruf)).join('');
  }
  function jahrgangOptions() {
    const ljs = [...new Set(azubis.map(lehrjahrVon).filter(Boolean))].sort();
    let html = `<option value="">Alle Jahrgänge</option>` + ljs.map(j => opt(String(j), `${j}. Lehrjahr`, filterJahrgang)).join('');
    if (azubis.some(a => a.istDhStudent)) html += opt('DH', 'DH-Studenten', filterJahrgang);
    return html;
  }
  function abteilungOptions() {
    const set = [...new Set([
      ...abteilungenKatalog.map(a => a.name),
      ...alleZuweisungen.map(z => z.abteilung).filter(Boolean),
    ])].sort((a, b) => a.localeCompare(b, 'de'));
    return `<option value="">Alle Abteilungen</option>` + set.map(a => opt(a, a, filterAbteilung)).join('');
  }
  function verantwOptions() {
    const map = new Map();
    alleZuweisungen.forEach(z => { if (z.verantwEmail) map.set(z.verantwEmail, z.verantwName || verantwNameFor(z.verantwEmail)); });
    const arr = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
    return `<option value="">Alle Verantwortlichen</option>` + arr.map(([email, name]) => opt(email, name, filterVerantw)).join('');
  }

  // ═══════════════════ RENDER ═══════════════════
  function cleanupPMSelect(root) {
    if (typeof PMSelect === 'undefined') return;
    PMSelect.closeAll();
    root.querySelectorAll('select[data-pm-enhanced]').forEach(s => {
      try { s._pmInstance && s._pmInstance.destroy(); } catch (e) { /* defensiv */ }
    });
  }

  function buildToolbar() {
    return `
      <div class="pt-toolbar">
        <div class="pt-search">
          <input type="search" id="ptSearch" class="form-control" placeholder="Person suchen …" value="${escHtml(searchText)}" aria-label="Person suchen">
        </div>
        <select class="form-control" id="ptFilterBeruf" data-pm-search="Beruf suchen …" aria-label="Beruf filtern">${berufOptions()}</select>
        <select class="form-control" id="ptFilterJahrgang" aria-label="Jahrgang filtern">${jahrgangOptions()}</select>
        <select class="form-control" id="ptFilterAbteilung" data-pm-search="Abteilung suchen …" aria-label="Abteilung filtern">${abteilungOptions()}</select>
        <select class="form-control" id="ptFilterVerantw" data-pm-search="Verantwortliche suchen …" aria-label="Verantwortliche filtern">${verantwOptions()}</select>
        <label class="pt-quickfilter" style="display:inline-flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--pm-grey-700);white-space:nowrap">
          <input type="checkbox" id="ptNurOhne" ${nurOhne ? 'checked' : ''}> ohne Zuweisung
        </label>
        <div class="pt-toolbar__spacer"></div>
        <div class="pt-stepper">
          <button type="button" id="ptAjPrev" aria-label="Vorheriges Ausbildungsjahr">‹</button>
          <span class="pt-stepper__lbl" id="ptAjLabel">${ajLabel()}</span>
          <button type="button" id="ptAjNext" aria-label="Nächstes Ausbildungsjahr">›</button>
        </div>
        <div class="pt-seg" id="ptZoom">
          <button type="button" data-z="monat" class="${zoom === 'monat' ? 'is-on' : ''}">Monat</button>
          <button type="button" data-z="quartal" class="${zoom === 'quartal' ? 'is-on' : ''}">Quartal</button>
          <button type="button" data-z="jahr" class="${zoom === 'jahr' ? 'is-on' : ''}">Jahr</button>
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="ptHeute">Heute</button>
        <button type="button" class="btn btn-outline btn-sm" id="ptExport" title="Aktuell gefilterte Personen + Zuweisungen als CSV (öffnet in Excel)">Export</button>
        <button type="button" class="btn btn-outline btn-sm" id="ptPrint" title="Mit gesetztem Abteilungsfilter: diese Abteilung drucken. Sonst: gesamte Tafel.">Drucken</button>
        <button type="button" class="btn btn-secondary btn-sm" id="ptAdd">+ Zuweisung</button>
      </div>`;
  }

  function render() {
    const main = document.getElementById('mainContent');
    cleanupPMSelect(main);
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left">
        <h1 class="page-title">Abteilungs-Planer</h1>
        <p style="margin:2px 0 0;color:var(--pm-grey-400);font-size:var(--text-sm)">Einsatzplanung Ausbildung · ${ajLabel()}</p>
      </div></div>
      ${buildToolbar()}
      <div class="pt-layout ${selectedAzubiId ? 'pt-has-panel' : ''}" id="ptLayout">
        <div class="pt-wrap">
          <div class="pt-scroll" id="ptScroll">
            <div class="pt-board" id="ptBoard" style="--tl-w:${Math.round(ajWindow().days * DAY_PX[zoom])}px"></div>
          </div>
          <div class="pt-legend" id="ptLegend"></div>
        </div>
        <aside class="pt-panel" id="ptPanel" ${selectedAzubiId ? '' : 'hidden'}></aside>
      </div>`;
    bindToolbar();
    renderTimeline();
    renderLegend();
    renderPanel();
    bindBoardDrag();
    Modal.init(); Toast.init();
    scrollToToday();
  }

  function bindToolbar() {
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
    on('ptSearch', 'input', e => { searchText = e.target.value.toLowerCase(); renderTimeline(); });
    on('ptFilterBeruf', 'change', e => { filterBeruf = e.target.value; renderTimeline(); });
    on('ptFilterJahrgang', 'change', e => { filterJahrgang = e.target.value; renderTimeline(); });
    on('ptFilterAbteilung', 'change', e => { filterAbteilung = e.target.value; renderTimeline(); });
    on('ptFilterVerantw', 'change', e => { filterVerantw = e.target.value; renderTimeline(); });
    on('ptNurOhne', 'change', e => { nurOhne = e.target.checked; renderTimeline(); });
    on('ptAjPrev', 'click', () => { ajStartYear--; afterAjOrZoom(); });
    on('ptAjNext', 'click', () => { ajStartYear++; afterAjOrZoom(); });
    on('ptHeute', 'click', () => {
      // Falls „heute" außerhalb des gewählten AJ liegt, erst dorthin springen.
      const w = ajWindow();
      if (today < w.start || today > w.end) { ajStartYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1; afterAjOrZoom(); }
      scrollToToday(true);
    });
    on('ptExport', 'click', exportCsv);
    on('ptPrint', 'click', () => filterAbteilung ? printAbteilung(filterAbteilung) : window.print());
    on('ptAdd', 'click', () => openZuwModal(null, selectedAzubiId));
    document.getElementById('ptZoom')?.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      zoom = b.dataset.z;
      document.querySelectorAll('#ptZoom button').forEach(x => x.classList.toggle('is-on', x === b));
      const board = document.getElementById('ptBoard');
      if (board) board.style.setProperty('--tl-w', Math.round(ajWindow().days * DAY_PX[zoom]) + 'px');
      renderTimeline();
      scrollToToday();
    });
  }
  function afterAjOrZoom() {
    document.getElementById('ptAjLabel').textContent = ajLabel();
    const board = document.getElementById('ptBoard');
    if (board) board.style.setProperty('--tl-w', Math.round(ajWindow().days * DAY_PX[zoom]) + 'px');
    renderTimeline();
    renderPanel();
    scrollToToday();
  }

  // Balken-Geometrie relativ zum AJ-Fenster (in %). null = außerhalb.
  function barGeom(z, win) {
    const von = new Date(z.von + 'T00:00:00');
    const bisRaw = z.bis ? new Date(z.bis + 'T00:00:00') : win.end;
    const s = von < win.start ? win.start : von;
    const e = bisRaw > win.end ? win.end : bisRaw;
    if (e < win.start || s > win.end) return null;
    const startIdx = Math.round((s - win.start) / DAY);
    const endIdx   = Math.round((e - win.start) / DAY);
    return { left: startIdx / win.days * 100, width: (endIdx - startIdx + 1) / win.days * 100, open: !z.bis };
  }
  function pctLeftOf(date, win) { return Math.round((date - win.start) / DAY) / win.days * 100; }

  function renderTimeline() {
    const board = document.getElementById('ptBoard');
    if (!board) return;
    const win = ajWindow();

    // Monatskopf
    let months = '';
    let cur = new Date(win.start);
    while (cur <= win.end) {
      const name = cur.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
      months += `<div class="pt-month" style="left:${pctLeftOf(cur, win)}%">${name.charAt(0).toUpperCase() + name.slice(1)}<span class="yr">${String(cur.getFullYear()).slice(2)}</span></div>`;
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    const todayInWin = today >= win.start && today <= win.end;
    const todayFlag = todayInWin
      ? `<div class="pt-today-flag" style="left:${pctLeftOf(today, win)}%">Heute · ${today.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }).replace('.', '')}</div>` : '';

    // Gruppen + Zeilen
    const groups = gruppierteAzubis();
    let body = '';
    if (!groups.length) {
      body = `<div class="pt-empty">Keine Personen für die aktuelle Filterung.</div>`;
    } else {
      body = groups.map(g => {
        const isColl = collapsed.has(g.title);
        const rows = g.azubis.map(a => {
          const konf = konfliktIds(a.id);
          const bars = zuwList(a.id).map(z => {
            const geo = barGeom(z, win); if (!geo) return '';
            const isConf = konf.has(z.id);
            const cls = 'pt-bar' + (geo.open ? ' pt-bar--open' : '') + (isConf ? ' pt-bar--conf' : '');
            const bisTxt = z.bis ? DateUtil.formatDate(z.bis) : 'offen';
            return `<div class="${cls}" data-id="${z.id}" data-azubi="${a.id}"
              style="left:${geo.left}%;width:${geo.width}%;background:${colorFor(z.abteilung)}"
              title="${escHtml(z.abteilung || '–')} · ${escHtml(z.verantwName || verantwNameFor(z.verantwEmail) || '–')} (${DateUtil.formatDate(z.von)} – ${bisTxt})">
              <span class="pt-grip pt-grip--l" data-grip="l"></span>
              <span class="pt-bar__label">${escHtml(z.abteilung || '')}</span>
              <span class="pt-grip pt-grip--r" data-grip="r"></span>
            </div>`;
          }).join('');
          // Lücken zwischen Stationen als Schraffur
          let gaps = '';
          const arr = zuwList(a.id).filter(z => z.bis);
          for (let i = 0; i < arr.length - 1; i++) {
            const gapStartD = new Date(new Date(arr[i].bis + 'T00:00:00').getTime() + DAY);
            const gapEndD   = new Date(new Date(arr[i + 1].von + 'T00:00:00').getTime() - DAY);
            if (gapEndD <= gapStartD) continue;
            const g1 = barGeom({ von: DateUtil.toISODate(gapStartD), bis: DateUtil.toISODate(gapEndD) }, win);
            if (g1 && g1.width > 0) gaps += `<div class="pt-gap" style="left:${g1.left}%;width:${g1.width}%"></div>`;
          }
          // Ganz leere Zeile: Schraffur über die volle Breite (= „ungeplant"
          // laut Legende). Kein Inline-Text – der würde beim Scrollen abschneiden.
          const emptyGap = zuwList(a.id).length === 0
            ? `<div class="pt-gap" style="left:0;width:100%"></div>` : '';
          const ljTag = a.istDhStudent ? 'DH' : (lehrjahrVon(a) ? `${lehrjahrVon(a)}. LJ` : '');
          const confTag = konf.size ? `<span class="pt-tag pt-tag--conf">Konflikt</span>` : '';
          const todayLine = todayInWin ? `<div class="pt-today" style="left:${pctLeftOf(today, win)}%"></div>` : '';
          return `
            <div class="pt-row ${a.id === selectedAzubiId ? 'is-sel' : ''}" data-azubi="${a.id}">
              <div class="pt-name" tabindex="0" role="button" data-azubi="${a.id}" aria-label="${escHtml(a.name)} – Details">
                ${renderAvatar(a, 'avatar--sm')}
                <span class="pt-nm">
                  <span class="pt-nm__n"><span>${escHtml(a.name)}</span>${ljTag ? `<span class="pt-tag">${ljTag}</span>` : ''}${confTag}</span>
                  <span class="pt-nm__b">${escHtml(a.beruf || '')}</span>
                </span>
              </div>
              <div class="pt-track">${emptyGap}${gaps}${todayLine}${bars}</div>
            </div>`;
        }).join('');
        return `
          <div class="pt-grp ${isColl ? 'is-collapsed' : ''}" data-group="${escHtml(g.title)}">
            <button type="button" class="pt-grp__head" data-group="${escHtml(g.title)}">
              <span class="pt-grp__head-inner">
                <span class="pt-grp__caret">▼</span>
                <span class="pt-grp__title">${escHtml(g.title)}</span>
                <span class="pt-grp__count">${g.azubis.length}</span>
              </span>
            </button>
            <div class="pt-rows">${rows}</div>
          </div>`;
      }).join('');
    }

    board.innerHTML = `
      <div class="pt-head">
        <div class="pt-head__name">Person</div>
        <div class="pt-months">${months}${todayFlag}</div>
      </div>
      ${body}`;

    // Zeilen-/Gruppen-Events
    board.querySelectorAll('.pt-grp__head').forEach(h => h.addEventListener('click', () => {
      const t = h.dataset.group;
      if (collapsed.has(t)) collapsed.delete(t); else collapsed.add(t);
      h.closest('.pt-grp').classList.toggle('is-collapsed');
    }));
    board.querySelectorAll('.pt-name[data-azubi]').forEach(n => n.addEventListener('click', () => selectAzubi(n.dataset.azubi)));
    board.querySelectorAll('.pt-name[data-azubi]').forEach(n => n.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAzubi(n.dataset.azubi); }
    }));
  }

  function renderLegend() {
    const el = document.getElementById('ptLegend'); if (!el) return;
    const depts = [...new Set([
      ...abteilungenKatalog.map(a => a.name),
      ...alleZuweisungen.map(z => z.abteilung).filter(Boolean),
    ])].sort((a, b) => a.localeCompare(b, 'de'));
    el.innerHTML = depts.map(d => `<b><span class="pt-swatch" style="background:${colorFor(d)}"></span>${escHtml(d)}</b>`).join('')
      + `<b><span class="pt-swatch" style="background:repeating-linear-gradient(45deg,transparent 0 3px,var(--pm-grey-300) 3px 4px);border:1px solid var(--pm-grey-200)"></span>ungeplant</b>`
      + `<b><span class="pt-swatch" style="background:var(--color-error-mid)"></span>Heute</b>`;
  }

  // ── Beurteilungen (lazy pro Azubi) ──
  const beurtCache = new Map();
  async function ladeBeurteilungen(azubiId) {
    if (beurtCache.has(azubiId)) return beurtCache.get(azubiId);
    let map = {};
    try { (await DB.getBeurteilungenFuerAzubi(azubiId)).forEach(b => { map[b.zuweisungId] = b; }); }
    catch (e) { /* Endpoint evtl. weg → ohne Badges */ }
    beurtCache.set(azubiId, map);
    return map;
  }

  function selectAzubi(id) {
    selectedAzubiId = (selectedAzubiId === id) ? null : id;
    document.getElementById('ptLayout')?.classList.toggle('pt-has-panel', !!selectedAzubiId);
    document.querySelectorAll('.pt-row').forEach(r => r.classList.toggle('is-sel', r.dataset.azubi === selectedAzubiId));
    renderPanel();
  }

  // Klick (kein Ziehen) auf einen Balken → Panel immer öffnen (nicht toggeln)
  // und die geklickte Station hervorheben. Zeitraum + Verantwortliche/r stehen
  // dort je Station (renderPanel).
  function focusStation(azubiId, zid) {
    selectedAzubiId = azubiId;
    document.getElementById('ptLayout')?.classList.add('pt-has-panel');
    document.querySelectorAll('.pt-row').forEach(r => r.classList.toggle('is-sel', r.dataset.azubi === azubiId));
    renderPanel(zid);
  }

  async function renderPanel(focusZid) {
    const panel = document.getElementById('ptPanel');
    if (!panel) return;
    if (!selectedAzubiId) { panel.hidden = true; panel.innerHTML = ''; return; }
    const a = azubiById.get(selectedAzubiId);
    if (!a) { panel.hidden = true; return; }
    panel.hidden = false;

    // Grundgerüst sofort (Badges kommen nach dem Laden nach).
    const grp = gruppeVon(a);
    const foot = `
      <div class="pt-panel__foot">
        <button type="button" class="btn btn-secondary" id="ptPanelAdd">+ Zuweisung</button>
        <div class="pt-panel__foot-row">
          <button type="button" class="btn btn-outline" id="ptPanelCopy">Durchlauf kopieren</button>
          <button type="button" class="btn btn-outline" id="ptPanelPrint">Drucken</button>
        </div>
      </div>`;
    const head = `
      <div class="pt-panel__head">
        ${renderAvatar(a)}
        <div><div class="pt-panel__nm">${escHtml(a.name)}</div><div class="pt-panel__meta">${escHtml(a.beruf || '')} · ${escHtml(grp)}</div></div>
        <button type="button" class="pt-panel__close" id="ptPanelClose" aria-label="Panel schließen">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" style="width:16px;height:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    panel.innerHTML = `${head}<div class="pt-panel__body" id="ptPanelBody"><div class="pt-empty">Lädt …</div></div>${foot}`;
    bindPanelFoot();

    const beurt = await ladeBeurteilungen(selectedAzubiId);
    if (selectedAzubiId !== a.id) return;              // zwischenzeitlich gewechselt
    const stns = zuwList(a.id);
    const konf = konfliktIds(a.id);
    let bodyHtml = '';
    if (!stns.length) bodyHtml = `<div class="pt-empty">Noch keine Zuweisung geplant.</div>`;
    else {
      let prevBis = null;
      bodyHtml = stns.map(z => {
        let luecke = '';
        if (prevBis && z.von) {
          const gapStart = new Date(new Date(prevBis + 'T00:00:00').getTime() + DAY);
          const gapEnd   = new Date(new Date(z.von + 'T00:00:00').getTime() - DAY);
          if (gapEnd >= gapStart) luecke = `<div class="pt-luecke">Lücke: ${DateUtil.formatDateShort(DateUtil.toISODate(gapStart))} – ${DateUtil.formatDateShort(DateUtil.toISODate(gapEnd))}</div>`;
        }
        if (z.bis) prevBis = z.bis;
        const st = statusOf(z);
        const b = beurt[z.id];
        let badge;
        if (b && b.status === 'abgeschlossen') badge = `<span class="pt-stn__badge pt-b-ok">Abgeschlossen</span>`;
        else if (b && b.status === 'entwurf')  badge = `<span class="pt-stn__badge pt-b-draft">Entwurf</span>`;
        else if (z.von && z.von <= todayISO)    badge = `<span class="pt-stn__badge pt-b-open">Beurteilung offen</span>`;
        else                                    badge = `<span class="pt-stn__badge pt-b-draft">${st.label}</span>`;
        const konfMark = konf.has(z.id) ? ` <span class="pt-tag pt-tag--conf">Konflikt</span>` : '';
        const bisTxt = z.bis ? DateUtil.formatDate(z.bis) : 'offen';
        return `${luecke}
          <div class="pt-stn ${st.key === 'aktuell' ? 'pt-stn--cur' : ''}" data-stn="${z.id}" style="--pt-sd:${colorFor(z.abteilung)}">
            <div class="pt-stn__acts">
              <button type="button" data-edit="${z.id}" aria-label="Bearbeiten" title="Bearbeiten">✎</button>
              <button type="button" data-del="${z.id}" aria-label="Löschen" title="Löschen">✕</button>
            </div>
            <div class="pt-stn__top"><span class="pt-stn__abt">${escHtml(z.abteilung || '–')}${konfMark}</span>${badge}</div>
            <div class="pt-stn__meta">${DateUtil.formatDate(z.von)} – ${bisTxt} · ${escHtml(z.verantwName || verantwNameFor(z.verantwEmail) || '–')}</div>
          </div>`;
      }).join('');
    }
    const bodyEl = document.getElementById('ptPanelBody');
    if (bodyEl) {
      bodyEl.innerHTML = `<div class="pt-label">Alle Stationen (${stns.length})</div>${bodyHtml}`;
      bodyEl.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openZuwModal(findZuw(Number(btn.dataset.edit)), null)));
      bodyEl.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => askDelete(Number(btn.dataset.del))));
      // Balken-Klick: zugehörige Station ins Blickfeld holen + kurz hervorheben.
      if (focusZid != null) {
        const stnEl = bodyEl.querySelector(`[data-stn="${focusZid}"]`);
        if (stnEl) { stnEl.classList.add('pt-stn--focus'); stnEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      }
    }
  }
  function bindPanelFoot() {
    document.getElementById('ptPanelClose')?.addEventListener('click', () => selectAzubi(selectedAzubiId));
    document.getElementById('ptPanelAdd')?.addEventListener('click', () => openZuwModal(null, selectedAzubiId));
    document.getElementById('ptPanelPrint')?.addEventListener('click', () => printPerson(selectedAzubiId));
    document.getElementById('ptPanelCopy')?.addEventListener('click', () => openCopyDialog(selectedAzubiId));
  }

  function scrollToToday(smooth) {
    const scroll = document.getElementById('ptScroll'); if (!scroll) return;
    const win = ajWindow();
    if (today < win.start || today > win.end) { scroll.scrollLeft = 0; return; }
    const tlW = ajWindow().days * DAY_PX[zoom];
    const x = Math.max(0, (Math.round((today - win.start) / DAY) / win.days) * tlW - scroll.clientWidth * 0.4);
    requestAnimationFrame(() => scroll.scrollTo({ left: x, behavior: smooth ? 'smooth' : 'auto' }));
  }

  // ═══════════════════ DRAG / RESIZE ═══════════════════
  function snapMondayISO(iso) {
    const d = new Date(iso + 'T00:00:00'); const dow = d.getDay();  // 0 So .. 6 Sa
    const off = (dow + 6) % 7;                                      // Tage seit Montag
    if (off <= 3) d.setDate(d.getDate() - off); else d.setDate(d.getDate() + (7 - off));
    return DateUtil.toISODate(d);
  }
  function addDaysISO(iso, days) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return DateUtil.toISODate(d); }
  function diffDays(isoA, isoB) { return Math.round((new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / DAY); }

  // Drag/Resize per window-Listener (statt setPointerCapture): robust auch
  // wenn der Zeiger die Leiste verlässt, und zuverlässig unter Automatisierung.
  let drag = null;
  // Doppelklick auf einen Balken = Bearbeiten-Dialog. Über Zeitfenster erkannt
  // (nicht via nativem dblclick), weil der Balken-Drag pointerdown mit
  // preventDefault kapert und native click/dblclick-Events dadurch je nach
  // Browser ausbleiben. Ein Klick ohne Bewegung landet in onDragUp.
  let lastBarClick = null;
  function bindBoardDrag() {
    const board = document.getElementById('ptBoard'); if (!board) return;
    board.addEventListener('pointerdown', onDragDown);
  }
  function onDragDown(e) {
    if (e.button != null && e.button !== 0) return;    // nur linke Maustaste
    const bar = e.target.closest('.pt-bar'); if (!bar) return;
    const z = findZuw(Number(bar.dataset.id)); if (!z) return;
    const grip = e.target.closest('.pt-grip');
    const mode = grip ? (grip.dataset.grip === 'l' ? 'resize-l' : 'resize-r') : 'move';
    if (mode !== 'move' && !z.bis) return;             // offene Zuweisung: nur verschieben
    drag = { bar, z, mode, startX: e.clientX, von0: z.von, bis0: z.bis || z.von,
             dayPx: DAY_PX[zoom], win: ajWindow(), moved: false, newVon: z.von, newBis: z.bis };
    bar.classList.add('is-dragging');
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', onDragUp);
    e.preventDefault();
  }
  function onDragMove(e) {
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startX) / drag.dayPx);
    if (deltaDays !== 0) drag.moved = true;
    let von = drag.von0, bis = drag.bis0;
    if (drag.mode === 'move') { von = addDaysISO(drag.von0, deltaDays); bis = drag.bis0 ? addDaysISO(drag.bis0, deltaDays) : ''; }
    else if (drag.mode === 'resize-l') { von = addDaysISO(drag.von0, deltaDays); if (von > drag.bis0) von = drag.bis0; }
    else { bis = addDaysISO(drag.bis0, deltaDays); if (bis < drag.von0) bis = drag.von0; }
    drag.newVon = von; drag.newBis = drag.z.bis ? bis : '';
    const geo = barGeom({ von, bis: bis || von }, drag.win);
    if (geo) { drag.bar.style.left = geo.left + '%'; drag.bar.style.width = geo.width + '%'; }
  }
  async function onDragUp() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragUp);
    if (!drag) return;
    const d = drag; drag = null;
    d.bar.classList.remove('is-dragging');
    if (!d.moved) {
      const now = Date.now();
      if (lastBarClick && lastBarClick.id === d.z.id && now - lastBarClick.t < 350) {
        lastBarClick = null;
        openZuwModal(d.z, null);                          // Doppelklick = Bearbeiten
      } else {
        lastBarClick = { id: d.z.id, t: now };
        focusStation(d.bar.dataset.azubi, d.z.id);        // Einfachklick = Details
      }
      return;
    }
    // Auf Montag snappen; Dauer beim Verschieben erhalten.
    const origVon = d.von0, origBis = d.z.bis || '';
    let von = snapMondayISO(d.newVon);
    let bis = d.z.bis ? (d.mode === 'move' ? addDaysISO(von, diffDays(d.von0, d.bis0)) : snapMondayISO(d.newBis)) : '';
    if (bis && bis < von) bis = von;
    if (von === origVon && bis === origBis) { renderTimeline(); return; }   // nichts geändert
    const ok = await persistEdit(d.z.id, { von, bis: bis || null });
    if (ok) {
      Toast.success('Verschoben', `${d.z.abteilung || 'Zuweisung'}: ${DateUtil.formatDateShort(von)} – ${bis ? DateUtil.formatDateShort(bis) : 'offen'}. Rückgängig mit Strg+Z.`);
    }
    renderTimeline(); renderPanel();
  }

  // Strg+Z: letzte Verschiebung rückgängig.
  document.addEventListener('keydown', async e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && lastUndo) {
      e.preventDefault();
      const u = lastUndo; lastUndo = null;
      const ok = await persistEdit(u.id, { von: u.prev.von, bis: u.prev.bis || null }, true);
      if (ok) { Toast.info('Rückgängig', 'Zeitraum wiederhergestellt.'); renderTimeline(); renderPanel(); }
    }
  });

  // PATCH + In-Memory-Update. isUndo=true unterdrückt das erneute Undo-Recording.
  async function persistEdit(id, patch, isUndo) {
    const z = findZuw(id); if (!z) return false;
    const prev = { von: z.von, bis: z.bis };
    try { await DB.updateZuweisung(id, patch); }
    catch (err) { Toast.error('Nicht möglich', err.message || 'Konnte nicht gespeichert werden.'); renderTimeline(); return false; }
    z.von = patch.von != null ? patch.von : z.von;
    z.bis = ('bis' in patch) ? (patch.bis || '') : z.bis;
    if ('abteilung' in patch) z.abteilung = patch.abteilung || '';
    if ('verantwEmail' in patch) { z.verantwEmail = patch.verantwEmail || ''; z.verantwName = verantwNameFor(z.verantwEmail); }
    zuwList(z.azubiId).sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    if (!isUndo) lastUndo = { id, prev };
    return true;
  }

  // ═══════════════════ MODAL: Anlegen / Bearbeiten ═══════════════════
  function fillVerantwOptions(abteilungName, selectedEmail) {
    const sel = document.getElementById('zuweisungAusbilder'); if (!sel) return;
    const abt = abteilungenKatalog.find(a => a.name === abteilungName);
    const list = abt ? (abt.verantwortliche || []) : [];
    sel.innerHTML = list.length
      ? list.map(v => `<option value="${escHtml(v.email)}" ${v.email === selectedEmail ? 'selected' : ''}>${escHtml(v.name || v.email)}</option>`).join('')
      : `<option value="">— keine hinterlegt —</option>`;
  }
  function openZuwModal(z, presetAzubiId) {
    editId = z ? z.id : null;
    addPresetAzubiId = presetAzubiId || (z ? z.azubiId : null);
    const titleEl = document.querySelector('#zuweisungModal .modal__title');
    if (titleEl) titleEl.textContent = z ? 'Zuweisung bearbeiten' : 'Neue Zuweisung';
    const azubiSel = document.getElementById('zuweisungAzubi');
    const abtSel = document.getElementById('zuweisungAbteilung');
    if (azubiSel) {
      azubiSel.innerHTML = azubis.map(a => `<option value="${a.id}" ${a.id === addPresetAzubiId ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('');
      azubiSel.disabled = !!z;                          // beim Bearbeiten Person fest
    }
    if (abtSel) {
      const cur = z ? z.abteilung : '';
      abtSel.innerHTML = abteilungenKatalog.map(a => `<option value="${escHtml(a.name)}" ${a.name === cur ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('');
      fillVerantwOptions(abtSel.value, z ? z.verantwEmail : '');
      abtSel.onchange = () => fillVerantwOptions(abtSel.value);
    }
    const vonI = document.getElementById('zuweisungVon');
    const bisI = document.getElementById('zuweisungBis');
    if (vonI) vonI.value = z ? (z.von || '') : '';
    if (bisI) bisI.value = z ? (z.bis || '') : '';
    Modal.open('zuweisungModal');
  }
  function initZuweisungModal() {
    document.getElementById('zuweisungSaveBtn')?.addEventListener('click', async () => {
      const azubiId = document.getElementById('zuweisungAzubi').value;
      const verantwEmail = document.getElementById('zuweisungAusbilder').value;
      const von = document.getElementById('zuweisungVon').value;
      const bis = document.getElementById('zuweisungBis').value;
      const abteilung = document.getElementById('zuweisungAbteilung').value;
      if (!abteilung) { Toast.error('Pflichtfeld', 'Bitte Abteilung wählen.'); return; }
      if (!verantwEmail) { Toast.error('Pflichtfeld', 'Für diese Abteilung ist keine verantwortliche Person hinterlegt.'); return; }
      if (!von || !bis) { Toast.error('Pflichtfeld', 'Bitte Zeitraum angeben.'); return; }
      if (von > bis) { Toast.error('Ungültiger Zeitraum', 'Startdatum muss vor Enddatum liegen.'); return; }

      // Überschneidungs-Vorabprüfung (die eigene Zeile beim Bearbeiten ausnehmen).
      const konflikt = zuwList(azubiId).find(z => z.id !== editId && zeitraeumeUeberschneiden(von, bis, z.von, z.bis));
      if (konflikt) { Toast.error('Überschneidung', zuwKonfliktText(konflikt)); return; }

      try {
        if (editId) {
          const ok = await persistEdit(editId, { abteilung, verantwEmail, von, bis });
          if (!ok) return;
        } else {
          const id = await DB.addZuweisung({ azubiId, verantwEmail, von, bis, abteilung });
          const neu = { id, azubiId, verantwEmail, verantwName: verantwNameFor(verantwEmail), abteilung, von, bis, azubiName: '', azubiBeruf: '' };
          if (!zuwByAzubi.has(azubiId)) zuwByAzubi.set(azubiId, []);
          zuwByAzubi.get(azubiId).push(neu);
          zuwList(azubiId).sort((a, b) => (a.von || '').localeCompare(b.von || ''));
          alleZuweisungen.push(neu);
        }
      } catch (e) {
        Toast.error('Nicht möglich', e.message || 'Zuweisung konnte nicht gespeichert werden.');
        return;
      }
      Modal.closeAll();
      Toast.success('Gespeichert', editId ? 'Zuweisung aktualisiert.' : 'Neue Zuweisung angelegt.');
      editId = null;
      renderTimeline(); renderPanel();
    });
  }

  // ═══════════════════ LÖSCHEN ═══════════════════
  let pendingDeleteId = null;
  function askDelete(id) {
    pendingDeleteId = id;
    const z = findZuw(id);
    const a = z ? azubiById.get(z.azubiId) : null;
    const textEl = document.getElementById('zuweisungDeleteText');
    if (textEl) textEl.textContent = a
      ? `Die Zuweisung „${z.abteilung || '–'}" von ${a.name} wird unwiderruflich entfernt. Fortfahren?`
      : 'Diese Zuweisung wird unwiderruflich entfernt. Fortfahren?';
    Modal.open('zuweisungDeleteModal');
  }
  function initDeleteModal() {
    document.getElementById('zuweisungDeleteConfirmBtn')?.addEventListener('click', async () => {
      if (pendingDeleteId == null) return;
      const id = pendingDeleteId; pendingDeleteId = null;
      try { await DB.deleteZuweisung(id); }
      catch (e) { Modal.closeAll(); Toast.error('Nicht möglich', e.message || 'Konnte nicht gelöscht werden.'); return; }
      const z = findZuw(id);
      if (z) {
        const arr = zuwList(z.azubiId); const i = arr.indexOf(z); if (i >= 0) arr.splice(i, 1);
        const j = alleZuweisungen.indexOf(z); if (j >= 0) alleZuweisungen.splice(j, 1);
      }
      Modal.closeAll();
      Toast.success('Gelöscht', 'Zuweisung wurde entfernt.');
      renderTimeline(); renderPanel();
    });
  }

  // ═══════════════════ DURCHLAUF KOPIEREN ═══════════════════
  function openCopyDialog(sourceId) {
    const src = azubiById.get(sourceId);
    const srcStns = zuwList(sourceId).filter(z => z.bis);   // offene nicht kopieren
    if (!src || !srcStns.length) { Toast.info('Nichts zu kopieren', 'Diese Person hat keine (abgeschlossenen) Stationen.'); return; }
    const ziele = azubis.filter(a => a.id !== sourceId);

    let overlay = document.getElementById('ptCopyModal');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay'; overlay.id = 'ptCopyModal';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <h3 class="modal__title">Durchlauf von ${escHtml(src.name)} kopieren</h3>
          <button class="modal__close" data-modal-close><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="modal__body">
          <p style="margin:0 0 10px;color:var(--pm-grey-600);font-size:var(--text-sm)">${srcStns.length} Station(en) werden auf die gewählten Personen übertragen. Die Daten werden am Ausbildungsbeginn der Zielperson ausgerichtet (auf Montag gerundet).</p>
          <input type="search" class="form-control" id="ptCopySearch" placeholder="Personen filtern …" style="margin-bottom:10px">
          <div id="ptCopyList" style="max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:2px"></div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" data-modal-close>Abbrechen</button>
          <button class="btn btn-secondary" id="ptCopyConfirm">Kopieren</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('#ptCopyList');
    const renderList = (q = '') => {
      listEl.innerHTML = ziele.filter(a => a.name.toLowerCase().includes(q)).map(a => `
        <label style="display:flex;align-items:center;gap:9px;padding:7px 9px;border:1px solid var(--pm-grey-200);border-radius:var(--r-md);cursor:pointer">
          <input type="checkbox" value="${a.id}">
          <span style="font-weight:600;font-size:var(--text-sm)">${escHtml(a.name)}</span>
          <span style="color:var(--pm-grey-400);font-size:var(--text-xs)">${escHtml(a.beruf || '')}</span>
        </label>`).join('') || `<div class="pt-empty">Keine Treffer.</div>`;
    };
    renderList();
    overlay.querySelector('#ptCopySearch').addEventListener('input', e => renderList(e.target.value.toLowerCase()));
    overlay.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.classList.add('open');

    overlay.querySelector('#ptCopyConfirm').addEventListener('click', async () => {
      const targetIds = [...overlay.querySelectorAll('#ptCopyList input:checked')].map(c => c.value);
      if (!targetIds.length) { Toast.error('Keine Auswahl', 'Bitte mindestens eine Zielperson wählen.'); return; }
      overlay.remove();
      await copyDurchlauf(sourceId, srcStns, targetIds);
    });
  }
  async function copyDurchlauf(sourceId, srcStns, targetIds) {
    const src = azubiById.get(sourceId);
    let angelegt = 0, uebersprungen = 0;
    for (const tid of targetIds) {
      const ziel = azubiById.get(tid);
      // Offset: Differenz der Ausbildungsbeginne (sonst 0), damit Stationen an
      // der äquivalenten Stelle im Zyklus der Zielperson landen.
      let offset = 0;
      if (src.ausbildungsBeginn && ziel.ausbildungsBeginn) offset = diffDays(src.ausbildungsBeginn, ziel.ausbildungsBeginn);
      for (const z of srcStns) {
        const von = snapMondayISO(addDaysISO(z.von, offset));
        const bis = addDaysISO(von, diffDays(z.von, z.bis));
        // Kollision im Ziel? (In-Memory-Vorabprüfung; Backend prüft verbindlich.)
        if (zuwList(tid).some(x => zeitraeumeUeberschneiden(von, bis, x.von, x.bis))) { uebersprungen++; continue; }
        try {
          const id = await DB.addZuweisung({ azubiId: tid, verantwEmail: z.verantwEmail, von, bis, abteilung: z.abteilung });
          const neu = { id, azubiId: tid, verantwEmail: z.verantwEmail, verantwName: z.verantwName, abteilung: z.abteilung, von, bis, azubiName: '', azubiBeruf: '' };
          if (!zuwByAzubi.has(tid)) zuwByAzubi.set(tid, []);
          zuwByAzubi.get(tid).push(neu); alleZuweisungen.push(neu); angelegt++;
        } catch (e) { uebersprungen++; }
      }
      zuwList(tid).sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    }
    renderTimeline(); renderPanel();
    Toast.success('Kopiert', `${angelegt} Station(en) angelegt${uebersprungen ? `, ${uebersprungen} wegen Überschneidung übersprungen` : ''}.`);
  }

  // ═══════════════════ DRUCK (eine Person) ═══════════════════
  function printPerson(azubiId) {
    const a = azubiById.get(azubiId); if (!a) return;
    const stns = zuwList(azubiId);
    const rows = stns.map(z => `<tr>
      <td>${escHtml(z.abteilung || '–')}</td>
      <td>${DateUtil.formatDate(z.von)} – ${z.bis ? DateUtil.formatDate(z.bis) : 'offen'}</td>
      <td>${escHtml(z.verantwName || verantwNameFor(z.verantwEmail) || '–')}</td>
    </tr>`).join('') || `<tr><td colspan="3">Keine Zuweisungen.</td></tr>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { Toast.error('Popup blockiert', 'Bitte Pop-ups für diese Seite erlauben.'); return; }
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Durchlauf ${escHtml(a.name)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;margin:32px}h1{font-size:20px;margin:0 0 4px}
      .sub{color:#666;margin:0 0 20px;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888}
      @media print{@page{margin:16mm}}</style></head><body>
      <h1>Abteilungsdurchlauf – ${escHtml(a.name)}</h1>
      <p class="sub">${escHtml(a.beruf || '')} · ${escHtml(gruppeVon(a))} · Stand ${DateUtil.formatDate(todayISO)}</p>
      <table><thead><tr><th>Abteilung</th><th>Zeitraum</th><th>Verantwortlich</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
  }

  // ═══════════════════ DRUCK (eine Abteilung) ═══════════════════
  // Alle Personen, die im aktuellen AJ-Fenster in dieser Abteilung sind.
  function printAbteilung(abteilungName) {
    const win = ajWindow();
    const vonISO = DateUtil.toISODate(win.start), bisISO = DateUtil.toISODate(win.end);
    const stns = alleZuweisungen
      .filter(z => z.abteilung === abteilungName && zeitraeumeUeberschneiden(z.von, z.bis, vonISO, bisISO))
      .sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    const rows = stns.map(z => {
      const a = azubiById.get(z.azubiId);
      return `<tr>
        <td>${escHtml(a ? a.name : (z.azubiName || '–'))}${a && a.beruf ? ` <span class="b">${escHtml(a.beruf)}</span>` : ''}</td>
        <td>${DateUtil.formatDate(z.von)} – ${z.bis ? DateUtil.formatDate(z.bis) : 'offen'}</td>
        <td>${escHtml(z.verantwName || verantwNameFor(z.verantwEmail) || '–')}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="3">Keine Personen in diesem Zeitraum.</td></tr>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { Toast.error('Popup blockiert', 'Bitte Pop-ups für diese Seite erlauben.'); return; }
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Abteilung ${escHtml(abteilungName)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;margin:32px}h1{font-size:20px;margin:0 0 4px}
      .sub{color:#666;margin:0 0 20px;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888}
      .b{color:#888}@media print{@page{margin:16mm}}</style></head><body>
      <h1>Abteilung – ${escHtml(abteilungName)}</h1>
      <p class="sub">${ajLabel()} · Stand ${DateUtil.formatDate(todayISO)}</p>
      <table><thead><tr><th>Person</th><th>Zeitraum</th><th>Verantwortlich</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
  }

  // ═══════════════════ EXPORT (CSV für Excel) ═══════════════════
  // Aktuell gefilterte Personen, eine Zeile je Zuweisung; ungeplante Personen
  // bekommen eine Leerzeile, damit Vollständigkeit (wie in der Excel-Liste)
  // sichtbar bleibt. Deutsches Excel: Semikolon-Delimiter + UTF-8-BOM (Umlaute).
  function exportCsv() {
    const cols = ['Nachname', 'Vorname', 'Beruf', 'Gruppe', 'Abteilung', 'Von', 'Bis', 'Verantwortliche/r', 'Status'];
    const splitName = (n) => {
      const parts = String(n || '').trim().split(/\s+/);        // Anzeige = "Vorname Nachname"
      return parts.length < 2 ? { vor: '', nach: n || '' } : { vor: parts.slice(0, -1).join(' '), nach: parts[parts.length - 1] };
    };
    const rows = [];
    azubis.filter(passtFilter).forEach(a => {
      const { vor, nach } = splitName(a.name);
      const gruppe = a.istDhStudent ? 'DH' : (lehrjahrVon(a) ? `${lehrjahrVon(a)}. LJ` : '');
      const stns = zuwList(a.id);
      if (!stns.length) {
        rows.push([nach, vor, a.beruf || '', gruppe, '', '', '', '', 'ungeplant']);
      } else {
        stns.forEach(z => rows.push([nach, vor, a.beruf || '', gruppe, z.abteilung || '',
          DateUtil.formatDate(z.von), z.bis ? DateUtil.formatDate(z.bis) : 'offen',
          z.verantwName || verantwNameFor(z.verantwEmail) || '', statusOf(z).label]));
      }
    });
    const esc = v => { const s = String(v ?? ''); return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [cols, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = `abteilungsplaner_${ajLabel().replace(/[^\w]+/g, '_')}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Toast.success('Exportiert', `${rows.length} Zeile(n) als CSV.`);
  }

  // Modals einmalig binden (Markup ist statisch in abteilungs-planer.html).
  initZuweisungModal();
  initDeleteModal();

  render();
});
