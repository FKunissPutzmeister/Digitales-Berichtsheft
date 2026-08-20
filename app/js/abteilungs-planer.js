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

/* ═══════════════════════════════════════════════════════════════════
   DURCHLAUF-STATUS-BOARD (2026-07) – Read-only
   Hero (aktueller Einsatz) + Verlaufs-Rail + abgeschlossene Abteilungen;
   Details/Beurteilung erst auf der Detailseite einer Abteilung (?abt=…).
   Zwei Sichten auf denselben Code:
     • Azubi  – eigener Durchlauf, ?mein=1 (renderAzubiDurchlauf)
     • Ausbilder – betreuter Azubi, ?azubi=<oid> (renderAusbilderDurchlauf),
       gesteuert über die opts von durchlaufBoardHtml/renderAbteilungDetail.
   CSS: .dlb-* in abteilungs-planer.css.
   ═══════════════════════════════════════════════════════════════════ */
const DLB_ICO = {
  cal:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  check:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.3 2.3L15.5 9.5"/></svg>',
  circle:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3"><circle cx="12" cy="12" r="9"/></svg>',
  chev:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  pin:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  calCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>',
  clock:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.7"/></svg>',
  cap:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
  scroll:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/></svg>',
};

function dlbInitials(name) {
  if (typeof getInitials === 'function') return getInitials(name);
  return String(name || '').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
}
// Ansprechpartner-Avatar: Initialen + Echtfoto, sobald die OID bekannt ist
// (siehe verantwOid in api.js/normalizeZuweisung). Gleiches Lade-/Fallback-
// Muster wie avatarInnerHTML in api.js, nur auf die dlb-avatar-Klasse gemünzt.
function dlbAvatarHTML(name, oid) {
  const initials = dlbInitials(name);
  if (!oid) return initials;
  return `${initials}<img src="/api/users/${oid}/photo" alt="" loading="lazy" onerror="this.remove()">`;
}
function dlbStatusKey(z, heute) {
  if (!z.von) return 'offen';
  if (z.bis && z.bis < heute) return 'beendet';
  if (z.von > heute) return 'zukuenftig';
  return 'aktuell';
}
/* Beurteilungs-Block für die Abteilungs-Detailseite. Der Azubi sieht die
   abgeschlossene Beurteilung (mit Öffnen-Link); Entwürfe der Ausbilder bleiben
   verborgen (nur der Status „noch nicht abgeschlossen").
   Im Ausbilder-Modus dagegen sind Entwürfe sichtbar und die Beurteilung ist ab
   Beginn des Einsatzes zum Bearbeiten verlinkt (gleiche Regel wie zuvor auf den
   Durchlauf-Kacheln: aktiv ODER beendet, aber nicht rein zukünftig). */
function dlbBeurtBlock(z, b, statusKey, ausbilderMode = false) {
  if (ausbilderMode && (!b || b.status !== 'abgeschlossen')) {
    const gestartet = z.von && z.von <= DateUtil.toISODate(new Date());
    const entwurf = b && b.status === 'entwurf';
    const info = entwurf
      ? `<div class="dlb-beurt dlb-beurt--open">${DLB_ICO.circle} Entwurf – noch nicht abgeschlossen</div>`
      : `<div class="dlb-beurt dlb-beurt--open">${DLB_ICO.circle} Noch nicht abgeschlossen</div>`;
    if (!gestartet) return `${info}<div class="dlb-detail__note">Die Beurteilung ist ab Beginn des Einsatzes möglich.</div>`;
    return `${info}<a class="btn btn-outline btn-sm dlb-beurt-open" href="beurteilung.html?zuw=${z.id}">${entwurf ? 'Entwurf öffnen' : 'Beurteilung anlegen'}</a>`;
  }
  if (b && b.status === 'abgeschlossen') {
    const note = b.note != null ? b.note.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–';
    const pkt = b.gesamtPunkte != null ? Math.round(b.gesamtPunkte) : null;
    return `
      <div class="dlb-beurt dlb-beurt--done">${DLB_ICO.check} Beurteilung abgeschlossen</div>
      <div class="dlb-note">
        <div class="dlb-note__grade"><span class="dlb-note__val">${note}</span><span class="dlb-note__cap">Gesamtnote</span></div>
        ${pkt != null ? `<div class="dlb-note__grade"><span class="dlb-note__pts">${pkt}</span><span class="dlb-note__cap">von 100 Punkten</span></div>` : ''}
      </div>
      ${b.individuelleBeurteilung ? `<div class="dlb-note__text">„${escHtml(b.individuelleBeurteilung)}"</div>` : ''}
      <a class="btn btn-outline btn-sm dlb-beurt-open" href="beurteilung.html?zuw=${z.id}">Öffnen</a>`;
  }
  if (statusKey === 'zukuenftig' || statusKey === 'offen') {
    return `<div class="dlb-detail__note">Die Beurteilung erfolgt nach dem Einsatz.</div>`;
  }
  return `<div class="dlb-beurt dlb-beurt--open">${DLB_ICO.circle} Noch nicht abgeschlossen</div>`;
}

/* Baut das komplette Board (Zeitstrahl + 3 Spalten) als HTML-String.
   Beurteilungen werden hier NICHT geladen – sie erscheinen erst auf der
   Detailseite einer Abteilung (?abt=<id>).

   opts steuert die Fremdsicht (Ausbilder schaut auf einen betreuten Azubi):
     title      – Überschrift (Default „Mein Abteilungsdurchlauf")
     self       – false ⇒ neutrale Texte statt Du-Ansprache
     detailHref – Link-Builder je Zuweisung (Default eigene Sicht ?mein=1&abt=…) */
function durchlaufBoardHtml(user, zuw, heute, beurtByZuw = {}, opts = {}) {
  const self = opts.self !== false;
  const detailHref = opts.detailHref || (z => `?mein=1&abt=${z.id}`);
  // Stabile Farbe je Abteilung (alphabetisch vorbelegt → gleiche Abteilung, gleiche Farbe).
  const cIdx = {}; let cN = 0;
  const colorFor = ab => {
    if (!ab) return ganttColor(0);
    if (!(ab in cIdx)) { cIdx[ab] = cN++; }
    return ganttColor(cIdx[ab]);
  };
  [...new Set(zuw.map(z => z.abteilung).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')).forEach(colorFor);

  const today = new Date();
  today.setHours(0, 0, 0, 0);   // Mitternacht → Heute-Linie im Zeitstrahl trifft exakt den heutigen Tag
  const rows = zuw.map(z => ({ z, key: dlbStatusKey(z, heute) }));
  const done = rows.filter(r => r.key === 'beendet');
  const now  = rows.filter(r => r.key === 'aktuell');
  const plan = rows.filter(r => r.key === 'zukuenftig' || r.key === 'offen');

  // ── Kopf ──
  const chips = [
    user.beruf ? `<span class="dlb-chip">${DLB_ICO.cap}${escHtml(user.beruf)}</span>` : '',
  ].join('');
  const wd = today.toLocaleDateString('de-DE', { weekday: 'short' });
  const stand = `<span class="dlb-stand">${DLB_ICO.clock}Stand: ${wd}, ${DateUtil.formatDate(heute)}</span>`;

  // Kompaktes, gut lesbares Datumsformat für die Rail-Stationen.
  function shortRange(von, bis) {
    if (!von) return '';
    const md = iso => new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const full = iso => new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    if (!bis) return `ab ${full(von)}`;
    return von.slice(0, 4) === bis.slice(0, 4) ? `${md(von)}–${full(bis)}` : `${full(von)}–${full(bis)}`;
  }
  const CHECK_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>';
  const CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';

  // ── Hero: aktueller Einsatz – oder ehrlicher Ersatz, wenn gerade keiner läuft ──
  function heroCurrent(r) {
    const z = r.z;
    const von = new Date(z.von + 'T00:00:00'), bis = z.bis ? new Date(z.bis + 'T00:00:00') : null;
    let prog = '';
    if (bis) {
      const pct = Math.min(100, Math.max(0, Math.round((today - von) / (bis - von) * 100)));
      const rem = Math.max(0, Math.ceil((bis - today) / 86400000));
      prog = `<div class="dlb-hero__prog">
        <div class="dlb-hero__proglab"><span>Aktueller Einsatz</span><b>läuft noch ${rem} ${rem === 1 ? 'Tag' : 'Tage'}</b></div>
        <div class="dlb-track"><div class="dlb-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
    return `<a class="dlb-hero dlb-hero--link" href="${detailHref(z)}" style="--edge:${colorFor(z.abteilung)}">
      <div class="dlb-hero__main">
        <span class="dlb-hero__eye">${DLB_ICO.pin}Aktueller Einsatz</span>
        <h2 class="dlb-hero__t">${escHtml(z.abteilung || '–')}</h2>
        <div class="dlb-hero__when">${DLB_ICO.cal}<b>${DateUtil.formatDate(z.von)}</b><span>bis</span><b>${z.bis ? DateUtil.formatDate(z.bis) : 'offen'}</b></div>
        ${prog}
      </div>
      <div class="dlb-hero__side">
        <span class="dlb-ap"><span class="dlb-avatar dlb-avatar--now" style="background:${colorFor(z.abteilung)}">${dlbAvatarHTML(z.verantwName, z.verantwOid)}</span>
          <span class="dlb-ap__col"><span class="dlb-ap__name--now">${escHtml(z.verantwName || '–')}</span><span class="dlb-ap__role">Ansprechpartner</span></span></span>
        <span class="dlb-hero__cta">Details ${DLB_ICO.chev}</span>
      </div>
    </a>`;
  }
  function heroFallback() {
    const nextR = plan[0];
    if (nextR) {
      const z = nextR.z;
      return `<div class="dlb-hero dlb-hero--quiet"><div class="dlb-hero__main">
        <span class="dlb-hero__eye dlb-hero__eye--muted">Kein aktueller Einsatz</span>
        <h2 class="dlb-hero__t">Zwischen zwei Einsätzen</h2>
        <p class="dlb-hero__note">${self ? 'Deine nächste' : 'Die nächste'} Abteilung <b>${escHtml(z.abteilung || '–')}</b> beginnt am <b>${z.von ? DateUtil.formatDate(z.von) : '—'}</b>.</p>
      </div></div>`;
    }
    if (done.length) {
      return `<div class="dlb-hero dlb-hero--quiet"><div class="dlb-hero__main">
        <span class="dlb-hero__eye dlb-hero__eye--muted">Kein aktueller Einsatz</span>
        <h2 class="dlb-hero__t">Zurzeit keine laufende Abteilung</h2>
      </div></div>`;
    }
    return `<div class="dlb-hero dlb-hero--quiet"><div class="dlb-hero__main">
      <span class="dlb-hero__eye dlb-hero__eye--muted">Abteilungsdurchlauf</span>
      <h2 class="dlb-hero__t">Noch keine Abteilung zugewiesen</h2>
      <p class="dlb-hero__note">Sobald die Ausbildungsleitung ${self ? 'deine erste' : 'die erste'} Abteilung einträgt, erscheint sie hier.</p>
    </div></div>`;
  }
  const heroHtml = now.length ? now.map(heroCurrent).join('') : heroFallback();

  // ── Verlaufs-Rail: alle Abteilungen chronologisch. Knoten liegen VOR der
  //    durchgehenden Linie (deckende Füllung), aktuelle Station wird mittig
  //    gescrollt, Pfeile blättern (s. wireDurchlaufBoard). ──
  function stopHtml(r, i) {
    const z = r.z;
    const st = r.key === 'beendet' ? 'done' : r.key === 'aktuell' ? 'now' : 'plan';
    const b = beurtByZuw[z.id];
    const grade = (st === 'done' && b && b.status === 'abgeschlossen' && b.note != null)
      ? b.note.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
    const foot = st === 'done'
      ? (grade ? `<span class="dlb-stop__grade">${grade}</span>` : `<span class="dlb-stop__soon">beendet</span>`)
      : st === 'now' ? `<span class="dlb-stop__now">● aktuell</span>`
      : `<span class="dlb-stop__soon">geplant</span>`;
    const tag = st === 'plan' ? 'div' : 'a';
    const href = st === 'plan' ? '' : ` href="${detailHref(z)}"`;
    return `<${tag} class="dlb-stop dlb-stop--${st}"${href}>
      <div class="dlb-stop__nw"><span class="dlb-stop__node" style="--edge:${colorFor(z.abteilung)}">${st === 'done' ? CHECK_SM : (i + 1)}</span></div>
      <div class="dlb-stop__name">${escHtml(z.abteilung || '–')}</div>
      <div class="dlb-stop__date">${shortRange(z.von, z.bis)}</div>
      ${foot}
    </${tag}>`;
  }
  const railStops = rows.map(stopHtml).join('');

  // ── Abgeschlossen: kompakte Karten mit Note (Klick → Detailseite) ──
  function miniCard(r) {
    const z = r.z;
    const b = beurtByZuw[z.id];
    const grade = (b && b.status === 'abgeschlossen' && b.note != null)
      ? b.note.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
    return `<a class="dlb-mini-card" href="${detailHref(z)}" style="--edge:${colorFor(z.abteilung)}">
      <div class="dlb-mini-card__top">
        <div class="dlb-mini-card__body">
          <div class="dlb-mini-card__t">${escHtml(z.abteilung || '–')}</div>
          <div class="dlb-mini-card__date">${DLB_ICO.cal}${DateUtil.formatDate(z.von)} – ${z.bis ? DateUtil.formatDate(z.bis) : 'offen'}</div>
        </div>
        ${grade ? `<div class="dlb-grade"><span class="dlb-grade__val">${grade}</span><span class="dlb-grade__cap">Note</span></div>` : ''}
      </div>
      <div class="dlb-mini-card__foot">
        <span class="dlb-ap"><span class="dlb-avatar" style="background:${colorFor(z.abteilung)};color:#fff">${dlbAvatarHTML(z.verantwName, z.verantwOid)}</span><span class="dlb-ap__name">${escHtml(z.verantwName || '–')}</span></span>
        ${grade ? '' : `<span class="dlb-beurt dlb-beurt--open">${DLB_ICO.circle}offen</span>`}
      </div>
    </a>`;
  }

  return `
  <div class="dlb dlb-board">
    <div class="dlb-head">
      <div><h1 class="dlb-h1">${escHtml(opts.title || 'Mein Abteilungsdurchlauf')}</h1>${chips ? `<div class="dlb-h1meta">${chips}</div>` : ''}</div>
      ${stand}
    </div>
    ${heroHtml}
    <div class="dlb-sec-h"><h2 class="dlb-sec-title">Verlauf</h2></div>
    <div class="dlb-railwrap">
      <button class="dlb-rail-arrow dlb-rail-arrow--l" id="dlbArrowL" type="button" aria-label="Frühere Abteilungen">${CHEV_L}</button>
      <div class="dlb-rail-vp" id="dlbRailVp"><div class="dlb-rail" id="dlbRail"><div class="dlb-rail-base"></div><div class="dlb-rail-prog"></div>${railStops}</div></div>
      <button class="dlb-rail-arrow dlb-rail-arrow--r" id="dlbArrowR" type="button" aria-label="Weitere Abteilungen">${DLB_ICO.chev}</button>
    </div>
    ${done.length ? `<div class="dlb-sec-h"><h2 class="dlb-sec-title">Abgeschlossen</h2><span class="dlb-count">${done.length}</span></div>
    <div class="dlb-done-grid">${done.map(miniCard).join('')}</div>` : ''}
  </div>`;
}

/* Board-Interaktion: Lehrjahr-Gruppen ein-/ausklappen; Zeitstrahl auf „heute"
   vorscrollen. Die Abteilungen selbst sind native <a>-Links → Detailseite. */
function wireDurchlaufBoard(root) {
  const vp = root.querySelector('#dlbRailVp');
  const rail = root.querySelector('#dlbRail');
  if (!vp || !rail) return;
  const aL = root.querySelector('#dlbArrowL'), aR = root.querySelector('#dlbArrowR');
  const base = rail.querySelector('.dlb-rail-base'), prog = rail.querySelector('.dlb-rail-prog');

  function updateArrows() {
    const max = vp.scrollWidth - vp.clientWidth - 2;
    const fits = vp.scrollWidth <= vp.clientWidth + 2;
    if (aL) aL.disabled = fits || vp.scrollLeft <= 2;
    if (aR) aR.disabled = fits || vp.scrollLeft >= max;
  }
  // Eine durchgehende Linie von der ersten bis zur letzten Station (grün bis zur
  // aktuellen/letzten erreichten). Geometrie per Knoten-Mitte gemessen → robust
  // bei Zentrierung, Scroll und beliebiger Stationszahl.
  function layoutLine() {
    if (!base || !prog) return;
    const stops = [...rail.querySelectorAll('.dlb-stop')];
    if (!stops.length) { base.style.display = prog.style.display = 'none'; return; }
    const rr = rail.getBoundingClientRect();
    const cx = s => { const n = s.querySelector('.dlb-stop__node').getBoundingClientRect(); return { x: n.left + n.width / 2 - rr.left, y: n.top + n.height / 2 - rr.top }; };
    const f = cx(stops[0]), l = cx(stops[stops.length - 1]);
    base.style.display = ''; base.style.left = f.x + 'px'; base.style.top = f.y + 'px'; base.style.width = Math.max(0, l.x - f.x) + 'px';
    let reached = -1;
    stops.forEach((s, i) => { if (s.classList.contains('dlb-stop--done') || s.classList.contains('dlb-stop--now')) reached = i; });
    if (reached > 0) { const rc = cx(stops[reached]); prog.style.display = ''; prog.style.left = f.x + 'px'; prog.style.top = f.y + 'px'; prog.style.width = (rc.x - f.x) + 'px'; }
    else { prog.style.display = 'none'; }
  }
  function center() {
    const el = rail.querySelector('.dlb-stop--now') || rail.querySelector('.dlb-stop');
    if (el) vp.scrollLeft = el.offsetLeft - vp.clientWidth / 2 + el.offsetWidth / 2;
    updateArrows();
  }
  function relayout() { center(); layoutLine(); }

  if (aL) aL.addEventListener('click', () => vp.scrollBy({ left: -336, behavior: 'smooth' }));
  if (aR) aR.addEventListener('click', () => vp.scrollBy({ left: 336, behavior: 'smooth' }));
  vp.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', relayout);
  requestAnimationFrame(relayout);
}

/* Read-only Sicht für Azubis: der eigene Abteilungsdurchlauf (Status-Board). */
async function renderAzubiDurchlauf(user) {
  // Aktiven Nav-Punkt korrigieren (der Azubi erreicht die Seite über „Abteilungsdurchlauf").
  document.getElementById('nav-planer')?.classList.remove('active');
  document.getElementById('nav-abteilungsplan')?.classList.add('active');

  const main = document.getElementById('mainContent');
  // Volle Seitenbreite (gleicher Marker wie der Planer).
  document.body.dataset.page = 'abteilungs-planer';

  try {
    const heute = DateUtil.toISODate(new Date());
    const zuw = (await DB.getZuweisungenFuerAzubi(user.id))
      .slice().sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    const beurtByZuw = {};
    try { (await DB.getBeurteilungenFuerAzubi(user.id)).forEach(b => { beurtByZuw[b.zuweisungId] = b; }); } catch (e) { /* ohne Noten weiter */ }
    main.innerHTML = durchlaufBoardHtml(user, zuw, heute, beurtByZuw);
    wireDurchlaufBoard(main);
  } catch (err) {
    main.innerHTML = `<div class="durchlauf-empty">Abteilungsdurchlauf konnte nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Abteilungsdurchlauf konnte nicht geladen werden.');
  }
}

/* Detailseite EINER Abteilung (?abt=<id>): Berichtsheft-Wochen dieses Zeitraums
   + Beurteilung. Read-only. Standard: die eigene Abteilung des angemeldeten
   Azubis. Über ctx (Ausbilder-Sicht) auch die eines betreuten Azubis – die
   Zugehörigkeit wird gegen ctx.azubiId geprüft, das der Aufrufer zuvor gegen
   die Liste der betreuten Azubis validiert hat. */
async function renderAbteilungDetail(user, zuwId, ctx = {}) {
  document.getElementById('nav-planer')?.classList.remove('active');
  document.getElementById('nav-abteilungsplan')?.classList.add('active');
  const main = document.getElementById('mainContent');
  document.body.dataset.page = 'abteilungs-planer';
  const azubiId = ctx.azubiId || user.id;

  try {
    const heute = DateUtil.toISODate(new Date());
    const z = await DB.getZuweisung(zuwId);
    if (!z || String(z.azubiId) !== String(azubiId)) {   // Fremdzugriff/leer → nur Zurück
      main.innerHTML = durchlaufDetailHtml(null, null, [], heute, ctx);
      wireDurchlaufDetail(main, ctx);
      return;
    }
    let beurt = null;
    try { beurt = await DB.getBeurteilung(zuwId); } catch (e) { /* ohne Beurteilung weiter */ }
    let wochen = [];
    try {
      // Wochen, die den Zeitraum [von, bis] überschneiden (bis leer = offenes Ende).
      wochen = (await DB.getWochenFuerAzubi(azubiId))
        .filter(w => w.startDate && w.endDate && z.von && w.endDate >= z.von && (!z.bis || w.startDate <= z.bis))
        .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    } catch (e) { /* ohne Wochen weiter */ }
    main.innerHTML = durchlaufDetailHtml(z, beurt, wochen, heute, ctx);
    wireDurchlaufDetail(main, ctx);
  } catch (err) {
    main.innerHTML = `<div class="durchlauf-empty">Abteilung konnte nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Abteilung konnte nicht geladen werden.');
  }
}

function durchlaufDetailHtml(z, beurt, wochen, heute, ctx = {}) {
  const backHref = ctx.backHref || '?mein=1';
  const backLabel = ctx.backLabel || 'Mein Abteilungsdurchlauf';
  const back = `<a class="dlb-back" href="${backHref}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="m15 6-6 6 6 6"/></svg>${escHtml(backLabel)}</a>`;
  if (!z) return `<div class="dlb dlb-detailpage">${back}<div class="durchlauf-empty">Abteilung nicht gefunden.</div></div>`;
  const statusKey = dlbStatusKey(z, heute);
  const statusLbl = { beendet: 'Beendet', aktuell: 'Aktuell', zukuenftig: 'Zukünftig', offen: 'Offen' }[statusKey] || '';
  const statusIcon = { beendet: DLB_ICO.check, aktuell: DLB_ICO.pin }[statusKey] || DLB_ICO.cal;
  const weeksHtml = wochenDigestHtml(wochen);
  return `
  <div class="dlb dlb-detailpage">
    ${back}
    <header class="dlb-dhero dlb-dhero--${statusKey}">
      <div class="dlb-dhero__main">
        <span class="dlb-dhero__eye">${statusIcon}${statusLbl}</span>
        <h1 class="dlb-dhero__t">${escHtml(z.abteilung || '–')}</h1>
        <div class="dlb-dhero__when">${DLB_ICO.cal}<b>${DateUtil.formatDate(z.von)}</b><span>bis</span><b>${z.bis ? DateUtil.formatDate(z.bis) : 'offen'}</b></div>
      </div>
      ${z.verantwName ? `<div class="dlb-dhero__ap"><span class="dlb-avatar dlb-avatar--now">${dlbAvatarHTML(z.verantwName, z.verantwOid)}</span><span class="dlb-ap__col"><span class="dlb-ap__name--now">${escHtml(z.verantwName)}</span><span class="dlb-ap__role">Ansprechpartner</span></span></div>` : ''}
    </header>
    <div class="dlb-detailgrid">
      <section class="dlb-panel">
        <h2 class="dlb-panel__title">Berichtsheft-Wochen</h2>
        <div class="dlb-weeks">${weeksHtml}</div>
      </section>
      <section class="dlb-panel dlb-panel--side">
        <h2 class="dlb-panel__title">Beurteilung</h2>
        <div class="dlb-panel__body">${dlbBeurtBlock(z, beurt, statusKey, !!ctx.ausbilderMode)}</div>
      </section>
    </div>
  </div>`;
}

/* Wochen-Zeile → Sprung in die Wochenansicht (gleiche Deep-Link-Mechanik wie
   Jahresansicht/Ausbilder-Cockpit: gotoKW/gotoYear via sessionStorage). */
function wireDurchlaufDetail(root, ctx = {}) {
  root.querySelectorAll('.dlb-wk__open').forEach(btn => btn.addEventListener('click', () => {
    sessionStorage.setItem('gotoKW', btn.dataset.kw);
    sessionStorage.setItem('gotoYear', btn.dataset.year);
    // Fremdsicht: die Wochenansicht wählt den Azubi über den gemerkten
    // Azubi-Filter – sonst landet der Ausbilder auf einer anderen Person.
    if (ctx.ausbilderMode && ctx.azubiId && typeof setPersistedAzubiId === 'function') setPersistedAzubiId(ctx.azubiId);
    window.location.href = 'wochenansicht.html';
  }));
  // Wochen-Umschalter: alle Wochen liegen im DOM, sichtbar ist immer genau eine.
  const box = root.querySelector('.dlb-wkbox');
  if (!box) return;
  box.querySelectorAll('.dlb-wkpill').forEach(pill => pill.addEventListener('click', () => {
    box.querySelectorAll('.dlb-wkpill').forEach(p => {
      const on = p === pill;
      p.classList.toggle('is-active', on);
      p.setAttribute('aria-pressed', String(on));
    });
    box.querySelectorAll('.dlb-wk').forEach(w => w.classList.toggle('is-active', w.dataset.i === pill.dataset.i));
  }));
}

/* Lesbarer „Tätigkeitsbericht": EINE Woche auf einmal, oben ein Umschalter mit
   den Wochen dieser Abteilung – ab 1 durchnummeriert, damit „Woche 3" heißt
   „dritte Woche in der Abteilung". Die echte KW steht im Kopf der Woche und
   führt per Button in die Wochenansicht.
   Passt sich dem Berichtstyp an: wöchentliches Berichtsheft → EIN Textblock je
   Woche (Wochenebene); tägliches → je Tag ein Block; ohne Ganztag/Halbtag/
   Anwesenheit.

   Die Einträge kommen aus dem Quill-Editor und SIND HTML (Absätze, Listen,
   Tabellen). Sie werden deshalb über den Whitelist-Sanitizer aus api.js
   gerendert statt escaped – sonst stünde das Markup als Text auf der Seite.
   Aus demselben Grund entscheidet richTextIstLeer(), ob ein Block Inhalt hat:
   Quill hinterlässt für „leer" ein wahrheitswertiges "<p><br></p>". */
function wochenDigestHtml(wochen) {
  if (!wochen.length) return `<div class="dlb-col__empty">Für diesen Zeitraum sind noch keine Berichtsheft-Wochen erfasst.</div>`;
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const hatText = v => v && !richTextIstLeer(v);
  const lab = l => l ? `<span class="dlb-entry__lab">${l}</span>` : '';
  const block = (l, t) => `<div class="dlb-entry">${lab(l)}<div class="dlb-entry__t dlb-rich">${sanitizeRichHtml(t)}</div></div>`;

  const items = wochen.map(w => {
    // Wochenebene zuerst (wöchentliches Berichtsheft); sonst Tagesebene.
    const wk = [];
    if (hatText(w.betriebEintrag)) wk.push(['', w.betriebEintrag]);
    if (hatText(w.schuleEintrag)) wk.push(['Berufsschule', w.schuleEintrag]);
    if (hatText(w.unterweisungEintrag)) wk.push(['Unterweisung', w.unterweisungEintrag]);
    if (wk.length) {
      return { w, leer: false, body: `<div class="dlb-wk__body">${wk.map(([l, t]) => block(l, t)).join('')}</div>` };
    }

    const tage = (w.tage || []).slice().sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
    const dayRows = tage.map(t => {
      const segs = [];
      if (hatText(t.betriebEintrag)) segs.push(['', t.betriebEintrag]);
      if (hatText(t.schuleEintrag)) segs.push(['Berufsschule', t.schuleEintrag]);
      if (hatText(t.unterweisungEintrag)) segs.push(['Unterweisung', t.unterweisungEintrag]);
      if (!segs.length && hatText(t.eintrag)) segs.push(['', t.eintrag]);
      if (!segs.length) return '';
      const p = (t.datum || '').split('-');
      const d = t.datum ? new Date(t.datum + 'T00:00:00') : null;
      const dl = d ? `${WD[d.getDay()]} ${p[2]}.${p[1]}.` : '';
      const txt = segs.map(([l, t2]) => `<div class="dlb-dayseg">${lab(l)}<div class="dlb-rich">${sanitizeRichHtml(t2)}</div></div>`).join('');
      return `<div class="dlb-day"><span class="dlb-day__d">${dl}</span><div class="dlb-day__t">${txt}</div></div>`;
    }).filter(Boolean).join('');
    return { w, leer: !dayRows,
             body: dayRows ? `<div class="dlb-wk__body">${dayRows}</div>` : `<div class="dlb-wk__empty">Keine Einträge erfasst.</div>` };
  });

  // Startwoche: die laufende Woche, sonst Woche 1.
  const heute = DateUtil.toISODate(new Date());
  const start = Math.max(0, items.findIndex(it => it.w.startDate <= heute && heute <= it.w.endDate));

  const nav = items.map((it, i) => `<button class="dlb-wkpill${it.leer ? ' dlb-wkpill--empty' : ''}${i === start ? ' is-active' : ''}"
      type="button" data-i="${i}" aria-pressed="${i === start}"
      title="KW ${it.w.kw} · ${DateUtil.formatDate(it.w.startDate)} – ${DateUtil.formatDate(it.w.endDate)}${it.leer ? ' · keine Einträge' : ''}">${i + 1}</button>`).join('');
  const panes = items.map((it, i) => `<article class="dlb-wk${i === start ? ' is-active' : ''}" data-i="${i}">
      <div class="dlb-wk__head">
        <span class="dlb-wk__kw">Woche ${i + 1}</span>
        <span class="dlb-wk__range">KW ${it.w.kw} · ${DateUtil.formatDate(it.w.startDate)} – ${DateUtil.formatDate(it.w.endDate)}</span>
        <button class="dlb-wk__open" type="button" data-kw="${it.w.kw}" data-year="${it.w.year}">Wochenansicht ${DLB_ICO.chev}</button>
      </div>
      ${it.body}
    </article>`).join('');

  return `<div class="dlb-wkbox">
    <div class="dlb-wknav"><span class="dlb-wknav__lab">Woche</span>${nav}</div>
    ${panes}
  </div>`;
}

/* Read-only Sicht für Ausbilder: derselbe Status-Board wie beim Azubi
   (durchlaufBoardHtml), nur für den im Selektor gewählten betreuten Azubi.
   Keine Planungs- oder Verwaltungsrechte – reine Anzeige; die Beurteilung
   ist über die Detailseite einer Abteilung erreichbar.

   Der gewählte Azubi steht in der URL (?azubi=<oid>), damit Detailseite,
   Zurück-Link und Reload dieselbe Person zeigen. Mit ?abt=<zuwId> wird
   stattdessen die Detailseite dieser Abteilung gerendert. */
async function renderAusbilderDurchlauf(user) {
  document.getElementById('nav-planer')?.classList.remove('active');
  document.getElementById('nav-abteilungsplan')?.classList.add('active');
  document.body.dataset.page = 'abteilungs-planer';
  const main = document.getElementById('mainContent');

  try {
    // Bewusst NICHT getSelectableAzubis(): der Durchlauf ist die Gesamtsicht auf
    // eine Ausbildung und gehört den FEST zugeordneten Ausbildern (dbo.Ausbilder-
    // Azubis, plus aktive Vertretungen). Ein Prüfer, der nur über eine befristete
    // Zuweisung verantwortlich ist, sähe sonst einen „Durchlauf", der aus seiner
    // eigenen Station besteht – das Backend gibt ihm die übrigen zu Recht nicht.
    // Admin/Developer behalten den Gesamtüberblick.
    const me = DB.getCurrentUser();
    const azubis = (me && (me.role === 'admin' || me.role === 'developer'))
      ? await DB.getAzubis()
      : await DB.getDauerhafteAzubis();
    if (!azubis.length) {
      main.innerHTML = `<div class="page-header"><div class="page-header__left">
        <h1 class="page-title">Abteilungsdurchlauf</h1>
      </div></div>
      <div class="durchlauf-empty">Ihnen ist aktuell kein Azubi fest zugeordnet.</div>`;
      return;
    }

    // Vorauswahl: URL (?azubi=) > Dashboard-Sprung („Wer ist wo") > gemerkter
    // Azubi-Filter der anderen Ansichten > erster betreuter Azubi.
    const params = new URLSearchParams(location.search);
    const goto = sessionStorage.getItem('gotoAzubiId');
    if (goto) sessionStorage.removeItem('gotoAzubiId');
    const findAzubi = id => azubis.find(a => String(a.id) === String(id));
    const start = findAzubi(params.get('azubi')) || findAzubi(goto)
      || findAzubi(typeof getPersistedAzubiId === 'function' ? getPersistedAzubiId() : null)
      || azubis[0];

    const boardHref = a => `?azubi=${encodeURIComponent(a.id)}`;

    // Detailseite einer Abteilung dieses Azubis (?azubi=…&abt=…).
    const abt = params.get('abt');
    if (abt) {
      await renderAbteilungDetail(user, abt, {
        azubiId: start.id,
        ausbilderMode: true,
        backHref: boardHref(start),
        backLabel: displayName(start.name || '') || 'Abteilungsdurchlauf',
      });
      return;
    }

    async function renderFor(azubiId) {
      const a = findAzubi(azubiId) || azubis[0];
      // Azubi-Wahl merken (gleicher Filter wie Wochen-/Jahresansicht) und in die
      // URL schreiben – ohne History-Eintrag, der Wechsel ist kein Seitenwechsel.
      if (typeof setPersistedAzubiId === 'function') setPersistedAzubiId(a.id);
      history.replaceState(null, '', boardHref(a));

      // Vorherige PMSelect-Instanz (Azubi-Dropdown) sauber trennen, bevor
      // innerHTML ersetzt wird – sonst lecken MutationObserver auf detachten Nodes.
      if (typeof PMSelect !== 'undefined') {
        PMSelect.closeAll();
        main.querySelectorAll('select[data-pm-enhanced]').forEach(s => {
          try { s._pmInstance && s._pmInstance.destroy(); } catch (e) { /* defensiv */ }
        });
      }

      const heute = DateUtil.toISODate(new Date());
      const zuw = (await DB.getZuweisungenFuerAzubi(a.id))
        .slice().sort((x, y) => (x.von || '').localeCompare(y.von || ''));
      const beurtByZuw = {};
      try { (await DB.getBeurteilungenFuerAzubi(a.id)).forEach(b => { beurtByZuw[b.zuweisungId] = b; }); } catch (e) { /* ohne Noten weiter */ }

      main.innerHTML = renderAzubiSelect(azubis, a.id)
        + durchlaufBoardHtml(a, zuw, heute, beurtByZuw, {
            title: displayName(a.name || '') || 'Abteilungsdurchlauf',
            self: false,
            detailHref: z => `${boardHref(a)}&abt=${z.id}`,
          });
      const azubiSelectEl = main.querySelector('#azubiSelect');
      if (azubiSelectEl) azubiSelectEl.addEventListener('change', () => renderFor(azubiSelectEl.value));
      wireDurchlaufBoard(main);
    }

    await renderFor(start.id);
  } catch (err) {
    main.innerHTML = `<div class="durchlauf-empty">Abteilungsdurchlauf konnte nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Abteilungsdurchlauf konnte nicht geladen werden.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-planer', [{ label: 'Abteilungs-Planer', href: 'abteilungs-planer.html' }]);
  if (!user) return;

  // Vorschau-Feature: außerhalb localhost/Developer-Ansicht Coming-Soon statt
  // Board (gilt für Azubi-Durchlauf ?mein=1, Ausbilder-Sicht und Planer).
  if (!previewUnlocked(user.role)) { renderComingSoon('Abteilungsdurchlauf'); return; }

  // Über „Abteilungsdurchlauf" (?mein=1) sehen Azubis immer den EIGENEN
  // Durchlauf – auch Planer/Developer, die selbst Azubi sind (Dev-Hybrid).
  if (user.istAzubi && new URLSearchParams(location.search).has('mein')) {
    const abt = new URLSearchParams(location.search).get('abt');
    if (abt) await renderAbteilungDetail(user, abt);   // Detailseite einer Abteilung
    else await renderAzubiDurchlauf(user);             // Status-Board
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
  let searchText = '', filterBeruf = '', filterAbteilung = '',
      filterVerantw = '', nurOhne = false, showInaktive = false;
  let selectedAzubiId = null;
  // Verschobene Detail-Kachel: null = angedockt am rechten Tafelrand (CSS
  // right:0), sonst {left,top} als Viewport-Koordinaten. Bewusst nur im
  // Speicher — nach F5 sitzt die Kachel wieder am Ausgangsplatz.
  let panelPos = null;
  const collapsed = new Set();                         // eingeklappte Gruppen (Titel)
  let editId = null;                                   // im Modal bearbeitete Zuweisung (null = neu)
  let addPresetAzubiId = null;                         // Vorauswahl beim Anlegen
  let lastUndo = null;                                 // { id, prev:{von,bis} } für Strg+Z
  let switchDir = 0;                                   // AJ-Wechselrichtung fuer das Eingangs-Feedback (+1/-1)

  // ── Daten einmal laden (Namen kommen per JOIN mit) ──
  const [azubisRaw, dhRaw, abteilungenKatalog, alleZuweisungen, gruppenRaw] = await Promise.all([
    DB.getAzubis(), DB.getDhStudenten(), DB.getAbteilungen(), DB.getAllZuweisungen(),
    DB.getPlanerGruppen(),
  ]);
  // Eigene Gruppen (Migration 035): gemeinsam gepflegte, frei benannte Buendel.
  // Nicht im State-Konstanten-Block oben, weil sie nach jeder Aenderung neu
  // vom Server kommen (einzige Quelle der Wahrheit, kein lokales Patchen).
  let planerGruppen = Array.isArray(gruppenRaw) ? gruppenRaw : [];
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

  // Verantwortlichen-Namen kommen per JOIN im Entra-Format "Nachname, Vorname"
  // – einmalig auf die Anzeige "Vorname Nachname" drehen (idempotent), damit
  // alle Render-Stellen unten das Anzeigeformat sehen.
  alleZuweisungen.forEach(z => { if (z.verantwName) z.verantwName = displayName(z.verantwName); });

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
      if (v) return displayName(v.name || '') || email;
    }
    return (typeof deriveName === 'function') ? deriveName(email) : email;
  }

  // ── Druck-Helfer ──
  // Stationen einer Person im Format des Druckmoduls. EINE Stelle: die
  // Auflösung des Verantwortlichen (verantwName vs. verantwEmail) und die
  // Abteilungsfarbe brauchten sonst bei jeder Änderung zwei Nachträge
  // (Toolbar-Druck und Panel-Druck).
  // Namen sind bereits Anzeigenamen ("Vorname Nachname", displayName() beim
  // Laden bzw. in verantwNameFor) — hier NICHT erneut anwenden.
  function stationenFuerDruck(azubiId) {
    return zuwList(azubiId).map(z => ({
      abteilung: z.abteilung || '',
      von: z.von,
      bis: z.bis || null,
      verantw: z.verantwName || verantwNameFor(z.verantwEmail) || '',
      farbe: colorFor(z.abteilung),
    }));
  }

  // ── Zeit-/Gruppen-Helfer ──
  // Sichtbare Breite der Zeitleiste (ohne Namensspalte). Gemessen statt
  // gerechnet: --name-w wechselt per Media-Query auf 170px.
  function timelineViewportWidth() {
    const scroll = document.getElementById('ptScroll');
    const board  = document.getElementById('ptBoard');
    if (!scroll || !board) return 1200;
    const nameW = parseFloat(getComputedStyle(board).getPropertyValue('--name-w')) || 240;
    return Math.max(560, scroll.clientWidth - nameW - 1);   // -1px: kein Sub-Pixel-Ueberlauf
  }
  // Fenster = Ausbildungsjahr + AUSBLICK. Der Ausblick fuellt genau den Platz,
  // der rechts sonst leer stehen blieb (Jahres-Zoom auf breiten Schirmen), und
  // ist mindestens AUSBLICK_MIN_DAYS lang – damit ein Einsatz ueber den 31.8.
  // hinaus sichtbar weiterlaeuft statt an der Jahresgrenze abgeschnitten zu
  // wirken. Passt das Fenster in die Breite, wird die Skala (pxd) so gedehnt,
  // dass sie exakt aufgeht; sonst bleibt der Zoom-Wert und die Tafel scrollt.
  // ajEnd = hartes AJ-Ende fuer alles, was am Ausbildungsjahr haengt (Druck,
  // Heute-Sprung) – dort darf der Ausblick NICHT mitzaehlen.
  const AUSBLICK_MIN_DAYS = 61;
  function ajWindow() {
    const start  = new Date(ajStartYear, 8, 1);         // 1. Sep
    const ajEnd  = new Date(ajStartYear + 1, 7, 31);    // 31. Aug
    const ajDays = Math.round((ajEnd - start) / DAY) + 1;
    const avail  = timelineViewportWidth();
    // „Jahr" ist eine Fit-Ansicht: Ausbildungsjahr + Ausblick fuellt die Breite
    // exakt aus – auf breiten Schirmen wird die Skala gedehnt (kein toter Rand),
    // auf einem 14"-Notebook gestaucht (kein Scrollbalken, wo vorher keiner
    // war). DAY_PX.jahr dient dort nur noch als Maß fuer die Ausblick-Laenge.
    // „Monat"/„Quartal" sollen scrollen, dort bleibt px/Tag unangetastet und
    // der Ausblick haengt einfach hinten dran.
    const fit  = zoom === 'jahr';
    const days = Math.max(ajDays + AUSBLICK_MIN_DAYS, fit ? Math.floor(avail / DAY_PX[zoom]) : 0);
    const pxd  = fit ? avail / days : DAY_PX[zoom];
    // Ueber setDate statt start + n*DAY, damit die Sommerzeit-Umstellung nicht
    // auf den Vortag 23:00 fuehrt.
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (days - 1));
    return { start, end, days, ajEnd, pxd, w: days * pxd };
  }
  function ausblickStart() { return new Date(ajStartYear + 1, 8, 1); }   // 1. Sep des Folge-AJ
  function ajLabel(y = ajStartYear) { return `AJ ${y}/${String(y + 1).slice(2)}`; }
  // Lehrjahr wird aktuell nicht getrackt – daher keine Lehrjahr-Gruppen mehr.
  // "Ohne Zuordnung" bedeutet hier wörtlich: aktuell keine laufende Zuweisung
  // (aktuelleZuw === null), nicht "Lehrjahr unbekannt".
  function gruppeVon(a) {
    if (a.istDhStudent) return 'DH-Studenten';
    return aktuelleZuw(a.id) ? 'Zugewiesen' : 'Ohne Zuordnung';
  }
  const GROUP_ORDER = ['Ohne Zuordnung', 'Zugewiesen', 'DH-Studenten'];

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
    const automatisch = GROUP_ORDER.filter(g => byGroup.has(g))
      .map(g => ({ key: 'a:' + g, title: g, azubis: byGroup.get(g) }));

    // Eigene Gruppen stehen DARUEBER; die automatischen bleiben unveraendert.
    // Eine Person kann in mehreren eigenen Gruppen sein und steht dann mehrfach
    // auf der Tafel – bewusst so gewaehlt, damit "Schlosserei" und "Pruefung
    // Herbst" gleichzeitig moeglich sind. Die Zeilen sind identisch aufgebaut,
    // Auswahl/Ziehen wirken auf denselben Datensatz.
    const sichtbar = new Map(gefiltert.map(a => [a.id, a]));
    const eigene = planerGruppen.map(g => {
      // Mitglieder in der Reihenfolge der Tafel (nach Nachname), nicht in der
      // Speicherreihenfolge. Der aktuelle Filter gilt auch hier – deshalb
      // zusaetzlich `gesamt` (alle Mitglieder, die es noch gibt): sonst waere
      // nicht erkennbar, dass jemand nur ausgefiltert ist. Gelöschte Personen
      // zaehlen bewusst nicht mit, sonst stimmte die Zahl nie wieder.
      const alle = azubis.filter(a => g.mitglieder.includes(a.id));
      const drin = alle.filter(a => sichtbar.has(a.id));
      return {
        key: 'g:' + g.id,
        title: g.name,
        gruppeId: g.id,
        gesamt: alle.length,
        // Zwei ganz verschiedene Gruende, warum ein Mitglied fehlt – im Kopf
        // getrennt ausgewiesen, sonst raetselt man (ein "5 von 6" ohne aktiven
        // Filter sieht wie ein Fehler aus): ausgeschieden (aktiv=false, die
        // Tafel zeigt solche Personen nie) vs. von einem Filter ausgeblendet.
        ausgeschieden: alle.filter(a => a.aktiv === false && !sichtbar.has(a.id)).length,
        azubis: drin,
      };
    });
    // Eigene Gruppen bleiben auch leer sichtbar (frisch angelegt oder alle
    // Mitglieder ausgefiltert) – sonst waere eine neue Gruppe unsichtbar und
    // wirkte verloren. Die automatischen verschwinden wie bisher, wenn leer.
    return [...eigene, ...automatisch];
  }

  // Gruppen neu vom Server holen und Tafel zeichnen (nach Anlegen/Aendern/Loeschen).
  async function ladeGruppenNeu() {
    planerGruppen = await DB.getPlanerGruppen();
    renderTimeline();
  }

  // ── Options der Filter-Dropdowns ──
  function opt(v, label, cur) { return `<option value="${escHtml(v)}" ${v === cur ? 'selected' : ''}>${escHtml(label)}</option>`; }
  function berufOptions() {
    const set = [...new Set(azubis.map(a => a.beruf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    return `<option value="">Alle Berufe</option>` + set.map(b => opt(b, b, filterBeruf)).join('');
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
        <select class="form-control" id="ptFilterAbteilung" data-pm-search="Abteilung suchen …" aria-label="Abteilung filtern">${abteilungOptions()}</select>
        <select class="form-control" id="ptFilterVerantw" data-pm-search="Verantwortliche suchen …" aria-label="Verantwortliche filtern">${verantwOptions()}</select>
        <label class="pt-quickfilter">
          <input type="checkbox" id="ptNurOhne" ${nurOhne ? 'checked' : ''}> ohne Zuweisung
        </label>
        <div class="pt-toolbar__spacer"></div>
        <div class="pt-toolbar__nav">
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
        <span class="pt-toolbar__sep"></span>
        <button type="button" class="pt-ib" id="ptGrpAdd" aria-label="Gruppe anlegen" title="Eigene Gruppe anlegen (Name + Mitglieder)">${Icon('users', { size: 19 })}</button>
        <button type="button" class="pt-ib" id="ptExport" aria-label="Exportieren" title="Aktuell gefilterte Personen + Zuweisungen als Excel-Arbeitsmappe (Übersicht, Zuweisungen, Personen, Abteilungen, Belegung, Verantwortliche)">${Icon('download', { size: 19 })}</button>
        <button type="button" class="pt-ib" id="ptPrint" aria-label="Drucken" title="Azubis, Zeitraum und Darstellung wählen, dann drucken">${Icon('print', { size: 19 })}</button>
        <button type="button" class="btn btn-secondary btn-sm" id="ptAdd">+ Zuweisung</button>
        </div>
      </div>`;
  }

  function render() {
    const main = document.getElementById('mainContent');
    cleanupPMSelect(main);
    // Eine verschobene Kachel hängt an der .app-shell (applyPanelPos) und damit
    // außerhalb von #mainContent — ohne dieses Aufräumen gäbe es nach dem
    // Neuaufbau zwei #ptPanel, und getElementById träfe das falsche.
    const strayPanel = document.getElementById('ptPanel');
    if (strayPanel && !main.contains(strayPanel)) strayPanel.remove();
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left">
        <h1 class="page-title">Abteilungs-Planer</h1>
        <p style="margin:2px 0 0;color:var(--pm-grey-400);font-size:var(--text-sm)">Einsatzplanung Ausbildung · ${ajLabel()}</p>
      </div></div>
      ${buildToolbar()}
      <div class="pt-layout ${selectedAzubiId ? 'pt-has-panel' : ''}" id="ptLayout">
        <div class="pt-wrap">
          <div class="pt-scroll" id="ptScroll">
            <div class="pt-board" id="ptBoard"></div>
          </div>
        </div>
        <aside class="pt-panel" id="ptPanel" ${selectedAzubiId ? '' : 'hidden'}></aside>
      </div>`;
    applyTlWidth();          // erst jetzt messbar: #ptScroll steht im DOM
    observeTlWidth();
    bindToolbar();
    // Nach dem PMSelect-Umbau messen; die Toolbar-Hoehe bestimmt mit, wie viel
    // Platz die Tafel darunter hat – daher erst skalieren, dann deckeln.
    requestAnimationFrame(() => { fitToolbar(); capBoardHeight(); });
    renderTimeline();
    renderPanel();
    bindBoardDrag();
    bindPanelDrag();
    Modal.init(); Toast.init();
    scrollToToday();
  }

  function bindToolbar() {
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
    on('ptSearch', 'input', e => { searchText = e.target.value.toLowerCase(); renderTimeline(); });
    on('ptFilterBeruf', 'change', e => { filterBeruf = e.target.value; renderTimeline(); });
    on('ptFilterAbteilung', 'change', e => { filterAbteilung = e.target.value; renderTimeline(); });
    on('ptFilterVerantw', 'change', e => { filterVerantw = e.target.value; renderTimeline(); });
    on('ptNurOhne', 'change', e => { nurOhne = e.target.checked; renderTimeline(); });
    on('ptAjPrev', 'click', () => { ajStartYear--; afterAjOrZoom(-1); });
    on('ptAjNext', 'click', () => { ajStartYear++; afterAjOrZoom(1); });
    on('ptGrpAdd', 'click', () => openGruppeDialog(null));
    on('ptExport', 'click', exportExcel);
    on('ptPrint', 'click', () => {
      // Vorauswahl = genau die Personen, die die Toolbar gerade zeigt.
      // Namen sind hier bereits Anzeigenamen ("Vorname Nachname", siehe
      // displayName() beim Laden), Verantwortliche werden hier aufgeloest,
      // damit das Druckmodul ohne App-Globals arbeitet.
      const win = ajWindow();
      const sichtbar = gruppierteAzubis().flatMap(g => g.azubis);
      PlanerPrint.open({
        personen: sichtbar.map(a => ({
          id: a.id,
          name: a.name,
          beruf: a.beruf || '',
          gruppe: gruppeVon(a),
          ausbildungsBeginn: a.ausbildungsBeginn || null,
          ausbildungsEnde: a.ausbildungsEnde || null,
          stationen: stationenFuerDruck(a.id),
        })),
        von: DateUtil.toISODate(win.start),
        bis: DateUtil.toISODate(win.ajEnd),   // Druck-Preset = AJ, ohne Ausblick
        ajLabel: ajLabel(),
        stand: todayISO,
      });
    });
    on('ptAdd', 'click', () => openZuwModal(null, selectedAzubiId));
    document.getElementById('ptZoom')?.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      zoom = b.dataset.z;
      document.querySelectorAll('#ptZoom button').forEach(x => x.classList.toggle('is-on', x === b));
      applyTlWidth();
      renderTimeline();
      scrollToToday();
    });
  }
  // Passt die Toolbar in EINE Zeile? Sonst eine Stufe kleiner (data-scale, Maße
  // im CSS). Geprueft wird immer von der groessten Stufe an, damit sie beim
  // Verbreitern von selbst wieder hochgeht; die Funktion ist idempotent und
  // darf darum beliebig oft laufen. „Eine Zeile" heisst: die Leiste ist nicht
  // hoeher als ihr hoechstes Kind.
  const TB_SCALES = ['', 'sm', 'xs'];
  let tbFitting = false;
  function fitToolbar() {
    const tb = document.querySelector('.pt-toolbar');
    if (!tb || tbFitting) return;
    tbFitting = true;
    for (const s of TB_SCALES) {
      if (s) tb.dataset.scale = s; else delete tb.dataset.scale;
      let tallest = 0;
      for (const el of tb.children) tallest = Math.max(tallest, el.offsetHeight);
      if (tb.offsetHeight <= tallest + 2) break;
    }
    tbFitting = false;
  }

  // Hoehe der Plantafel gemessen statt gerechnet – dasselbe Muster wie
  // capPanelHeight() bei der Detail-Kachel. Bezugsrahmen ist der Scroll-Host
  // (auf Touchgeraeten .main-wrapper, sonst das Dokument, s. scrollHost() in
  // app.js): dessen clientHeight hat die Safe-Area unten schon abgezogen.
  // Bei nach unten gescrolltem Host wird top negativ – dann auf 0 geklemmt,
  // sonst wuechse die Tafel mit jedem Scrollschritt weiter.
  const BOARD_BOTTOM_GAP = 6;
  function capBoardHeight() {
    const scroll = document.getElementById('ptScroll'); if (!scroll) return;
    const host = (typeof scrollHost === 'function') ? scrollHost() : null;
    const hostTop = host ? host.getBoundingClientRect().top : 0;
    const hostH   = host ? host.clientHeight : document.documentElement.clientHeight;
    const top = Math.max(0, scroll.getBoundingClientRect().top - hostTop);
    const cap = Math.max(240, hostH - top - BOARD_BOTTOM_GAP);
    scroll.style.maxHeight = cap + 'px';
    // Zweiter Durchgang: unter der Tafel liegen noch Innenabstaende des
    // Seitencontainers (und auf dem iPad die Safe-Area), die von hier aus nicht
    // einzeln messbar sind. Statt sie zu erraten, den entstandenen Ueberhang
    // wieder abziehen – sonst faengt die Seite an, um wenige Pixel zu scrollen.
    const box = host || document.documentElement;
    const over = box.scrollHeight - box.clientHeight;
    if (over > 0) scroll.style.maxHeight = Math.max(240, cap - over) + 'px';
  }

  function applyTlWidth() {
    const board = document.getElementById('ptBoard');
    if (board) board.style.setProperty('--tl-w', Math.round(ajWindow().w) + 'px');
  }
  // Die Breite bestimmt, wie viele Ausblick-Monate ins Fenster passen – aendert
  // sie sich, muessen Skala UND Kopf/Zone neu gezeichnet werden. Ein
  // ResizeObserver deckt auch das Ein-/Ausklappen der Sidebar ab, das kein
  // resize-Event ausloest. Neu gezeichnet wird nur bei echter Breitenaenderung,
  // sonst laeuft schon der erste Observer-Aufruf ins Leere.
  let tlRo = null, tlRoTimer = null;
  function observeTlWidth() {
    const scroll = document.getElementById('ptScroll');
    if (!scroll || typeof ResizeObserver === 'undefined') return;
    if (tlRo) tlRo.disconnect();
    tlRo = new ResizeObserver(() => {
      clearTimeout(tlRoTimer);
      tlRoTimer = setTimeout(() => {
        fitToolbar();
        capBoardHeight();
        const board = document.getElementById('ptBoard'); if (!board) return;
        const next = Math.round(ajWindow().w) + 'px';
        if (board.style.getPropertyValue('--tl-w') === next) return;
        board.style.setProperty('--tl-w', next);
        renderTimeline();
      }, 120);
    });
    tlRo.observe(scroll);
  }
  // dir: +1 = vorwaerts, -1 = zurueck, 0/undefined = ohne Feedback (Zoomwechsel).
  function afterAjOrZoom(dir) {
    switchDir = dir || 0;
    document.getElementById('ptAjLabel').textContent = ajLabel();
    nudgeAjLabel(dir);
    applyTlWidth();
    renderTimeline();
    renderPanel();
    scrollToToday();
  }

  // Die Jahreszahl selbst bekommt denselben kleinen Impuls wie die Balken.
  // Per WAAPI statt CSS-Klasse: das Element bleibt beim Wechsel bestehen (nur
  // sein Text aendert sich), eine CSS-Animation wuerde ohne Reflow-Trick nicht
  // neu starten.
  function nudgeAjLabel(dir) {
    if (!dir) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lbl = document.getElementById('ptAjLabel');
    if (!lbl || !lbl.animate) return;
    lbl.getAnimations().forEach(a => a.cancel());
    lbl.animate(
      [{ transform: `translateX(${dir * 8}px)`, opacity: 0.25 }, { transform: 'none', opacity: 1 }],
      { duration: 180, easing: 'ease-out' });
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
    return { left: startIdx / win.days * 100, width: (endIdx - startIdx + 1) / win.days * 100, open: !z.bis,
             clipL: von < win.start, clipR: !!z.bis && bisRaw > win.end };
  }
  function pctLeftOf(date, win) { return Math.round((date - win.start) / DAY) / win.days * 100; }

  function renderTimeline() {
    const board = document.getElementById('ptBoard');
    if (!board) return;
    const win = ajWindow();

    // Monatskopf – Monate jenseits des 31.8. gehoeren zum Ausblick und treten
    // farblich zurueck (Klasse pt-month--ahead).
    const ausblick = ausblickStart();
    let months = '';
    let cur = new Date(win.start);
    while (cur <= win.end) {
      const name = cur.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
      const ahead = cur >= ausblick ? ' pt-month--ahead' : '';
      months += `<div class="pt-month${ahead}" style="left:${pctLeftOf(cur, win)}%">${name.charAt(0).toUpperCase() + name.slice(1)}<span class="yr">${String(cur.getFullYear()).slice(2)}</span></div>`;
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    // Ausblick-Zone in px (nicht %): die Flaeche unter den Zeilen sitzt in
    // .pt-board, dessen Breite die Namensspalte mit einschliesst.
    const ausblickPx = Math.round((ausblick - win.start) / DAY) * win.pxd;
    const ausblickW  = Math.max(0, win.w - ausblickPx);
    const zoneHead = `<div class="pt-zone" style="left:${ausblickPx.toFixed(1)}px;width:${ausblickW.toFixed(1)}px"></div>`;
    const zoneBody = `<div class="pt-zone" style="left:calc(var(--name-w) + ${ausblickPx.toFixed(1)}px);width:${ausblickW.toFixed(1)}px"></div>`
      + `<div class="pt-zoneline" style="left:calc(var(--name-w) + ${ausblickPx.toFixed(1)}px)"></div>`;
    const zoneChip = `<button type="button" class="pt-zonechip" id="ptZoneChip" title="Zum nächsten Ausbildungsjahr">${ajLabel(ajStartYear + 1)}${DLB_ICO.chev}</button>`;
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
        const isColl = collapsed.has(g.key);   // Schluessel, nicht Titel: eigene Gruppen duerfen so heissen wie eine automatische
        const versteckt = g.gesamt ? g.gesamt - g.azubis.length : 0;   // fehlende Mitglieder
        const gefiltert = versteckt - (g.ausgeschieden || 0);
        const warum = [
          g.ausgeschieden ? `${g.ausgeschieden} ausgeschieden` : '',
          gefiltert > 0 ? `${gefiltert} durch die Filter ausgeblendet` : '',
        ].filter(Boolean).join(', ');
        const rows = g.azubis.map(a => {
          const konf = konfliktIds(a.id);
          const bars = zuwList(a.id).map(z => {
            const geo = barGeom(z, win); if (!geo) return '';
            const isConf = konf.has(z.id);
            const cls = 'pt-bar' + (geo.open ? ' pt-bar--open' : '') + (isConf ? ' pt-bar--conf' : '')
              + (geo.clipL ? ' pt-bar--contl' : '') + (geo.clipR ? ' pt-bar--contr' : '');
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
          const dhTag = a.istDhStudent ? 'DH' : '';
          const confTag = konf.size ? `<span class="pt-tag pt-tag--conf">Konflikt</span>` : '';
          const todayLine = todayInWin ? `<div class="pt-today" style="left:${pctLeftOf(today, win)}%"></div>` : '';
          return `
            <div class="pt-row ${a.id === selectedAzubiId ? 'is-sel' : ''}" data-azubi="${a.id}">
              <div class="pt-name" tabindex="0" role="button" data-azubi="${a.id}" aria-label="${escHtml(a.name)} – Details">
                ${renderAvatar(a, 'avatar--sm')}
                <span class="pt-nm">
                  <span class="pt-nm__n"><span>${escHtml(a.name)}</span>${dhTag ? `<span class="pt-tag">${dhTag}</span>` : ''}${confTag}</span>
                  <span class="pt-nm__b">${escHtml(a.beruf || '')}</span>
                </span>
              </div>
              <div class="pt-track">${emptyGap}${gaps}${todayLine}${bars}</div>
            </div>`;
        }).join('');
        // Aktionen nur bei eigenen Gruppen. Sie sitzen INNERHALB von
        // .pt-grp__head-inner, weil dieser Bereich horizontal sticky ist –
        // rechts am Tafelrand waeren sie beim Scrollen weg. Der Aufklapp-Griff
        // ist deshalb ein eigener Button daneben (Button in Button ist kein
        // gueltiges HTML, und der Klick wuerde sich verbeissen).
        const aktionen = g.gruppeId ? `
              <span class="pt-grp__actions">
                <button type="button" class="pt-grp__ib" data-grp-edit="${g.gruppeId}" title="Gruppe bearbeiten" aria-label="Gruppe ${escHtml(g.title)} bearbeiten">${Icon('edit', { size: 14 })}</button>
                <button type="button" class="pt-grp__ib" data-grp-del="${g.gruppeId}" title="Gruppe löschen" aria-label="Gruppe ${escHtml(g.title)} löschen">${Icon('trash', { size: 14 })}</button>
              </span>` : '';
        return `
          <div class="pt-grp ${isColl ? 'is-collapsed' : ''}${g.gruppeId ? ' pt-grp--eigen' : ''}" data-group="${escHtml(g.key)}">
            <div class="pt-grp__head">
              <span class="pt-grp__head-inner">
                <button type="button" class="pt-grp__toggle" data-group="${escHtml(g.key)}" aria-expanded="${!isColl}">
                  <span class="pt-grp__caret">▼</span>
                  <span class="pt-grp__title">${escHtml(g.title)}</span>
                  <span class="pt-grp__count"${versteckt ? ` title="${g.gesamt} Mitglieder · ${escHtml(warum)}"` : ''}>${g.azubis.length}${versteckt ? ` von ${g.gesamt}` : ''}</span>
                </button>${aktionen}
              </span>
            </div>
            <div class="pt-rows">${rows}${g.gruppeId && !g.azubis.length ? `<div class="pt-grp__leer">${versteckt
              ? `Kein Mitglied sichtbar: ${escHtml(warum)}.`
              : 'Noch niemand in dieser Gruppe – über das Stift-Symbol Personen hinzufügen.'}</div>` : ''}</div>
          </div>`;
      }).join('');
    }

    // Eingangs-Feedback: haengt an den neuen Knoten, laeuft also von selbst nach
    // dem Neuaufbau an. Klasse bleibt bis zum naechsten Render stehen – die
    // Animation ist dann langst durch, ein Timer waere nur eine Fehlerquelle.
    board.classList.toggle('is-switching', switchDir !== 0);
    if (switchDir) { board.style.setProperty('--pt-shift', (switchDir * 10) + 'px'); switchDir = 0; }

    board.innerHTML = `
      <div class="pt-head">
        <div class="pt-head__name">Person</div>
        <div class="pt-months">${zoneHead}${months}${todayFlag}${zoneChip}</div>
      </div>
      ${zoneBody}
      ${body}`;

    document.getElementById('ptZoneChip')?.addEventListener('click', () => { ajStartYear++; afterAjOrZoom(1); });

    // Zeilen-/Gruppen-Events
    board.querySelectorAll('.pt-grp__toggle').forEach(h => h.addEventListener('click', () => {
      const t = h.dataset.group;
      if (collapsed.has(t)) collapsed.delete(t); else collapsed.add(t);
      const zu = h.closest('.pt-grp').classList.toggle('is-collapsed');
      h.setAttribute('aria-expanded', String(!zu));
    }));
    board.querySelectorAll('[data-grp-edit]').forEach(b => b.addEventListener('click', () => {
      openGruppeDialog(planerGruppen.find(g => String(g.id) === b.dataset.grpEdit) || null);
    }));
    board.querySelectorAll('[data-grp-del]').forEach(b => b.addEventListener('click', () => {
      openGruppeDelete(planerGruppen.find(g => String(g.id) === b.dataset.grpDel) || null);
    }));
    board.querySelectorAll('.pt-name[data-azubi]').forEach(n => n.addEventListener('click', () => selectAzubi(n.dataset.azubi)));
    board.querySelectorAll('.pt-name[data-azubi]').forEach(n => n.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAzubi(n.dataset.azubi); }
    }));
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
    if (!selectedAzubiId) { panel.hidden = true; panel.innerHTML = ''; applyPanelPos(); return; }
    const a = azubiById.get(selectedAzubiId);
    if (!a) { panel.hidden = true; applyPanelPos(); return; }
    panel.hidden = false;

    // Grundgerüst sofort (Badges kommen nach dem Laden nach).
    const grp = gruppeVon(a);
    const foot = `
      <div class="pt-panel__foot">
        <button type="button" class="btn btn-secondary" id="ptPanelAdd">+ Zuweisung</button>
      </div>`;
    const head = `
      <div class="pt-panel__head">
        ${renderAvatar(a)}
        <div><div class="pt-panel__nm">${escHtml(a.name)}</div><div class="pt-panel__meta">${escHtml(a.beruf || '')} · ${escHtml(grp)}</div></div>
        <button type="button" class="pt-panel__hb" id="ptPanelPrint" aria-label="Drucken" title="Diesen Durchlauf drucken">${Icon('print', { size: 16 })}</button>
        <button type="button" class="pt-panel__hb pt-panel__close" id="ptPanelClose" aria-label="Panel schließen">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" style="width:16px;height:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    panel.innerHTML = `${head}<div class="pt-panel__body" id="ptPanelBody"><div class="pt-empty">Lädt …</div></div>${foot}`;
    bindPanelFoot();
    applyPanelPos();                                   // Position der Sitzung wiederherstellen/nachklemmen

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
        // Abgeschlossene Beurteilung: ganze Kachel verlinkt auf die Detailseite
        // (gleiches Muster wie der "Öffnen"-Link im Durchlauf-Board, dlbBeurtBlock).
        const abgeschlossen = b && b.status === 'abgeschlossen';
        const tag = abgeschlossen ? 'a' : 'div';
        const hrefAttr = abgeschlossen ? ` href="beurteilung.html?zuw=${z.id}"` : '';
        const clickCls = abgeschlossen ? ' pt-stn--clickable' : '';
        return `${luecke}
          <${tag} class="pt-stn ${st.key === 'aktuell' ? 'pt-stn--cur' : ''}${clickCls}" data-stn="${z.id}"${hrefAttr} style="--pt-sd:${colorFor(z.abteilung)}">
            <div class="pt-stn__acts">
              <button type="button" data-edit="${z.id}" aria-label="Bearbeiten" title="Bearbeiten">✎</button>
              <button type="button" data-del="${z.id}" aria-label="Löschen" title="Löschen">✕</button>
            </div>
            <div class="pt-stn__top"><span class="pt-stn__abt">${escHtml(z.abteilung || '–')}${konfMark}</span>${badge}</div>
            <div class="pt-stn__meta">${DateUtil.formatDate(z.von)} – ${bisTxt} · ${escHtml(z.verantwName || verantwNameFor(z.verantwEmail) || '–')}</div>
          </${tag}>`;
      }).join('');
    }
    const bodyEl = document.getElementById('ptPanelBody');
    if (bodyEl) {
      bodyEl.innerHTML = `<div class="pt-label">Alle Stationen (${stns.length})</div>${bodyHtml}`;
      // stopPropagation/preventDefault: verhindert, dass ein Klick auf ✎/✕
      // zusätzlich die Link-Navigation der umschließenden Kachel auslöst,
      // wenn die Station (abgeschlossene Beurteilung) ein <a> ist.
      bodyEl.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openZuwModal(findZuw(Number(btn.dataset.edit)), null); }));
      bodyEl.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); askDelete(Number(btn.dataset.del)); }));
      // Balken-Klick: zugehörige Station ins Blickfeld holen + kurz hervorheben.
      if (focusZid != null) {
        const stnEl = bodyEl.querySelector(`[data-stn="${focusZid}"]`);
        if (stnEl) { stnEl.classList.add('pt-stn--focus'); stnEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      }
      applyPanelPos();     // Stationen ändern die Höhe → erneut ans Fenster klemmen
    }
  }
  function bindPanelFoot() {
    document.getElementById('ptPanelClose')?.addEventListener('click', () => selectAzubi(selectedAzubiId));
    document.getElementById('ptPanelAdd')?.addEventListener('click', () => openZuwModal(null, selectedAzubiId));
    document.getElementById('ptPanelPrint')?.addEventListener('click', () => printPerson(selectedAzubiId));
  }

  // ═══════════════════ DETAIL-KACHEL VERSCHIEBEN ═══════════════════
  // Die Kachel schwebt über der Tafel (planer-board.css) und lässt sich an der
  // Kopfzeile frei über die Seite ziehen; der Fensterrand hält sie fest.
  // panelPos sind Viewport-Koordinaten der linken oberen Ecke.
  const PANEL_MARGIN = 8;                              // Mindestluft zum Fensterrand
  let panelDrag = null;
  let lastHeadClick = 0;                               // für Doppelklick = zurücksetzen

  // Unter 1100px ist die Kachel ein Vollhöhen-Drawer am Viewport-Rand –
  // verschieben wäre dort sinnlos und würde das Layout zerlegen.
  function panelDragBlocked() { return window.matchMedia('(max-width:1100px)').matches; }

  function clampToViewport(left, top, w, h) {
    const vw = document.documentElement.clientWidth;   // ohne Scrollbar, anders als innerWidth
    const vh = document.documentElement.clientHeight;
    // Ist die Kachel groesser als das Fenster, waere max < min – dann gewinnt
    // min, sie bleibt oben/links ausgerichtet statt aus dem Bild zu wandern.
    const maxL = Math.max(PANEL_MARGIN, vw - w - PANEL_MARGIN);
    const maxT = Math.max(PANEL_MARGIN, vh - h - PANEL_MARGIN);
    return { left: Math.min(Math.max(left, PANEL_MARGIN), maxL),
             top:  Math.min(Math.max(top,  PANEL_MARGIN), maxT) };
  }

  // Höhe deckeln, damit die Kachel unten nicht aus dem Fenster ragt und die
  // Fußleiste (+ Zuweisung / Drucken) erreichbar bleibt.
  // Gemessen statt gerechnet: die Oberkante hängt an Topbar, Testphase-Banner,
  // Seitentitel UND am Umbruch der Toolbar – jede feste Zahl stimmt nur für
  // eine Fensterbreite. Genau daran scheiterte das calc(100vh - 172px) im CSS,
  // das als Fallback stehen bleibt, bis diese Funktion das erste Mal läuft:
  // die Kachel startet real bei y≈204 und ragte damit 32px nach unten heraus.
  function capPanelHeight(panel, moved) {
    const vh = document.documentElement.clientHeight;
    // Verschoben: die Kachel darf nie höher als das Fenster minus Luft sein –
    // clampToViewport rechnet danach mit dieser Höhe weiter.
    if (moved) { panel.style.maxHeight = (vh - 2 * PANEL_MARGIN) + 'px'; return; }
    // Angedockt: von der real gemessenen Oberkante bis kurz über den
    // Fensterboden. Bei nach unten gescrollter Seite ist top negativ, dann
    // wächst der Deckel korrekt mit.
    const top = Math.round(panel.getBoundingClientRect().top);
    panel.style.maxHeight = Math.max(160, vh - top - PANEL_MARGIN) + 'px';
  }

  // panelPos → Position. Ohne Position (oder im Drawer-Modus) wird alles
  // abgeräumt, damit wieder die CSS-Andockung am rechten Tafelrand greift –
  // Inline-Styles schlagen jede Media-Query, das Aufräumen ist Pflicht.
  //
  // Die verschobene Kachel hängt an der .app-shell statt im Layout: das
  // .main-content darüber trägt eine (identische) transform-Matrix und bildet
  // damit einen Stacking-Context mit z-index:auto. Darin bleibt die Kachel
  // IMMER unter der Sidebar (position:fixed, z-index 100) – egal welchen
  // z-index sie bekommt; sie verschwindet dahinter und ist nicht mehr
  // greifbar. Erst als Kind der Shell konkurriert ihr z-index direkt mit dem
  // der Sidebar (siehe .pt-panel.is-moved in planer-board.css).
  function applyPanelPos() {
    const panel = document.getElementById('ptPanel'); if (!panel) return;
    const layout = document.getElementById('ptLayout');
    if (!panelPos || panel.hidden || panelDragBlocked()) {
      // Der Drawer unter 1100px muss ebenfalls an der Shell hängen: im Layout
      // bezieht sich sein position:fixed auf .main-content (transform-Matrix!)
      // statt aufs Fenster – er wurde damit 1038px hoch in einem 800px-Fenster
      // und seine Fußleiste war UNERREICHBAR, weil sich ein fixed-Element
      // nicht ins Bild scrollen lässt. An der Shell meint top/bottom:0 wieder
      // die Fensterhöhe.
      const dockHost = (!panel.hidden && panelDragBlocked())
        ? (document.querySelector('.app-shell') || document.body)
        : layout;
      if (dockHost && panel.parentElement !== dockHost) dockHost.appendChild(panel);
      panel.style.left = ''; panel.style.top = '';
      panel.classList.remove('is-moved');
      // Der Drawer unter 1100px füllt die Höhe selbst (max-height:none), ein
      // Inline-Deckel würde ihn 8px zu kurz machen.
      if (panel.hidden || panelDragBlocked()) panel.style.maxHeight = '';
      else capPanelHeight(panel, false);
      return;
    }
    const host = document.querySelector('.app-shell') || document.body;
    if (panel.parentElement !== host) host.appendChild(panel);
    panel.classList.add('is-moved');
    capPanelHeight(panel, true);
    const want = clampToViewport(panelPos.left, panelPos.top, panel.offsetWidth, panel.offsetHeight);
    panelPos = want;
    // Zwei Durchgänge: setzen, messen, Versatz abziehen. Welches Element der
    // Containing Block für position:fixed ist, hängt am Theme (filter,
    // backdrop-filter und transform erzeugen jeweils einen) – der gemessene
    // Fehler ist verlässlicher als jede Annahme darüber.
    panel.style.left = want.left + 'px';
    panel.style.top  = want.top + 'px';
    const r = panel.getBoundingClientRect();
    const ex = Math.round(r.left - want.left), ey = Math.round(r.top - want.top);
    if (ex) panel.style.left = (want.left - ex) + 'px';
    if (ey) panel.style.top  = (want.top - ey) + 'px';
  }

  // Nach SPA-Navigation auf eine andere Seite bleibt die an der Shell
  // hängende Kachel sonst über der neuen Seite kleben – die Shell überlebt
  // den innerHTML-Tausch des Routers.
  window.addEventListener('pm-page-rendered', () => {
    if (document.getElementById('ptBoard')) return;    // noch im Planer
    const stray = document.getElementById('ptPanel');
    if (stray && stray.parentElement !== document.getElementById('ptLayout')) stray.remove();
    panelPos = null;
  });

  // pointerdown hängt an der Kachel, nicht an der Kopfzeile: renderPanel()
  // tauscht das innerHTML komplett aus, ein Listener am Kopf wäre nach jedem
  // Azubi-Wechsel weg.
  function bindPanelDrag() {
    document.getElementById('ptPanel')?.addEventListener('pointerdown', onPanelDown);
  }
  function onPanelDown(e) {
    if (e.button != null && e.button !== 0) return;    // nur linke Maustaste
    if (panelDragBlocked()) return;
    if (!e.target.closest('.pt-panel__head')) return;  // nur am Griff
    if (e.target.closest('button')) return;            // Kopf-Icons bleiben Buttons
    const panel = e.currentTarget;
    const br = panel.getBoundingClientRect();
    panelDrag = { panel, startX: e.clientX, startY: e.clientY, moved: false,
                  dx: e.clientX - br.left, dy: e.clientY - br.top }; // Griffpunkt in der Kachel
    panel.classList.add('is-dragging');
    document.body.classList.add('pt-dragging');
    window.addEventListener('pointermove', onPanelMove);
    window.addEventListener('pointerup', onPanelUp);
    window.addEventListener('pointercancel', onPanelUp);
    e.preventDefault();
  }
  function onPanelMove(e) {
    const d = panelDrag; if (!d) return;
    // 3px Totzone: ein Klick auf den Kopf soll die Kachel nicht vom Rand lösen.
    if (!d.moved && Math.abs(e.clientX - d.startX) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
    d.moved = true;
    panelPos = { left: e.clientX - d.dx, top: e.clientY - d.dy };
    applyPanelPos();
  }
  function onPanelUp() {
    window.removeEventListener('pointermove', onPanelMove);
    window.removeEventListener('pointerup', onPanelUp);
    window.removeEventListener('pointercancel', onPanelUp);
    const d = panelDrag; if (!d) return;
    panelDrag = null;
    d.panel.classList.remove('is-dragging');
    document.body.classList.remove('pt-dragging');
    if (d.moved) { lastHeadClick = 0; return; }
    // Doppelklick auf den Kopf = zurück an den rechten Tafelrand. Über
    // Zeitfenster erkannt statt via dblclick-Event: onPanelDown ruft
    // preventDefault (sonst markiert das Ziehen Text), womit native
    // click/dblclick je nach Browser ausbleiben – dieselbe Falle wie beim
    // Balken-Drag weiter unten.
    const now = Date.now();
    if (now - lastHeadClick < 350) { lastHeadClick = 0; panelPos = null; applyPanelPos(); }
    else lastHeadClick = now;
  }

  // Nach Fensteränderungen nachklemmen, sonst liegt die Kachel außerhalb –
  // und beim Wechsel in den Drawer-Modus müssen die Inline-Styles weg. Läuft
  // auch für die angedockte Kachel, deren Höhendeckel an der Fensterhöhe hängt.
  window.addEventListener('resize', applyPanelPos);
  window.addEventListener('resize', capBoardHeight);

  function scrollToToday() {
    const scroll = document.getElementById('ptScroll'); if (!scroll) return;
    const win = ajWindow();
    if (today < win.start || today > win.end) { scroll.scrollLeft = 0; return; }
    const x = Math.max(0, Math.round((today - win.start) / DAY) * win.pxd - scroll.clientWidth * 0.4);
    requestAnimationFrame(() => scroll.scrollTo({ left: x, behavior: 'auto' }));
  }

  // Eine Zeile senkrecht ins Bild holen. Nur die Tafel scrollt, die Seite
  // bleibt stehen – deshalb kein scrollIntoView (das zieht auch den Scroll-Host
  // mit und wuerde auf dem iPad die ganze Seite verschieben).
  function scrollRowIntoView(azubiId) {
    const scroll = document.getElementById('ptScroll'); if (!scroll) return;
    const row = [...scroll.querySelectorAll('.pt-row')].find(r => r.dataset.azubi === String(azubiId));
    if (!row) return;
    scroll.scrollTop += row.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientHeight / 3;
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
    const dragWin = ajWindow();
    drag = { bar, z, mode, startX: e.clientX, von0: z.von, bis0: z.bis || z.von,
             dayPx: dragWin.pxd, win: dragWin, moved: false, newVon: z.von, newBis: z.bis };
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
      ? list.map(v => `<option value="${escHtml(v.email)}" ${v.email === selectedEmail ? 'selected' : ''}>${escHtml(displayName(v.name || '') || v.email)}</option>`).join('')
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
  /* ═══════════════════ EIGENE GRUPPEN ═══════════════════
     Anlegen/Bearbeiten in einem Dialog: Name + Mitgliederliste mit Suche.
     Die Liste zeigt bewusst ALLE Personen, nicht nur die von der Toolbar
     gefilterten – wer eine Gruppe zusammenstellt, will nicht erst den Filter
     aufräumen müssen. Gespeichert wird immer die vollständige Zielliste
     (PUT ersetzt die Mitglieder), damit es keine Reihenfolge-Effekte gibt. */
  let grpDlg = { id: null, gewaehlt: new Set(), suche: '' };
  let grpDeleteId = null;

  // Waehlbar ist nur, wer auch auf der Tafel erscheinen kann: ausgeschiedene
  // Personen (aktiv=false) zeigt die Tafel nie, und Oids ohne Person dahinter
  // (geloescht) schon gar nicht. Beides gehoert nicht in die Auswahl.
  function waehlbareAzubis() { return azubis.filter(a => a.aktiv !== false); }

  function openGruppeDialog(gruppe) {
    const waehlbar = new Set(waehlbareAzubis().map(a => a.id));
    const bisher = gruppe ? gruppe.mitglieder : [];
    // Altbestand: Mitglieder, die nicht mehr waehlbar sind, stehen nicht in der
    // Liste – dann muss der Dialog sagen, dass Speichern sie entfernt. Sonst
    // waere es ein stiller Datenverlust.
    const entfallen = bisher.filter(o => !waehlbar.has(o)).length;
    grpDlg = {
      id: gruppe ? gruppe.id : null,
      gewaehlt: new Set(bisher.filter(o => waehlbar.has(o))),
      suche: '',
    };
    const note = document.getElementById('ptGrpNote');
    if (note) {
      note.textContent = entfallen
        ? (entfallen === 1
          ? '1 ausgeschiedene Person ist noch in dieser Gruppe. Sie erscheint nicht auf der Tafel und wird beim Speichern entfernt.'
          : `${entfallen} ausgeschiedene Personen sind noch in dieser Gruppe. Sie erscheinen nicht auf der Tafel und werden beim Speichern entfernt.`)
        : '';
      note.hidden = !entfallen;
    }
    const t = document.querySelector('#ptGruppeModal .modal__title');
    if (t) t.textContent = gruppe ? 'Gruppe bearbeiten' : 'Gruppe anlegen';
    const nameI = document.getElementById('ptGrpName');
    if (nameI) nameI.value = gruppe ? gruppe.name : '';
    const suche = document.getElementById('ptGrpSearch');
    if (suche) suche.value = '';
    grpFehler('');
    grpZeichnen();
    Modal.open('ptGruppeModal');
    setTimeout(() => nameI && nameI.focus(), 30);
  }

  function grpFehler(text) {
    const el = document.getElementById('ptGrpErr');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function grpZeichnen() {
    const list = document.getElementById('ptGrpList');
    if (!list) return;
    const q = grpDlg.suche;
    const basis = waehlbareAzubis();
    const sichtbar = q ? basis.filter(a => fuzzyMatch(q, `${a.name} ${a.beruf || ''}`)) : basis;
    list.innerHTML = sichtbar.map(a => `
      <label class="pp-dlg__item">
        <input type="checkbox" data-oid="${escHtml(a.id)}" ${grpDlg.gewaehlt.has(a.id) ? 'checked' : ''}>
        <b>${escHtml(a.name)}</b><span>${escHtml(a.beruf || '')}</span>
      </label>`).join('')
      || `<div class="pp-dlg__item">${q ? 'Keine Treffer.' : 'Keine Personen vorhanden.'}</div>`;
    list.querySelectorAll('input[data-oid]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) grpDlg.gewaehlt.add(cb.dataset.oid); else grpDlg.gewaehlt.delete(cb.dataset.oid);
      grpZaehler();
    }));
    grpZaehler();
  }
  function grpZaehler() {
    const count = document.getElementById('ptGrpCount');
    if (count) count.textContent = `(${grpDlg.gewaehlt.size} gewählt)`;
  }

  function initGruppeModal() {
    const suche = document.getElementById('ptGrpSearch');
    suche?.addEventListener('input', e => { grpDlg.suche = e.target.value.trim().toLowerCase(); grpZeichnen(); });
    document.getElementById('ptGrpNone')?.addEventListener('click', () => { grpDlg.gewaehlt.clear(); grpZeichnen(); });
    // Enter im Namensfeld speichert, statt (wie im Formular ueblich) nichts zu tun.
    document.getElementById('ptGrpName')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ptGrpSave')?.click(); }
    });
    document.getElementById('ptGrpSave')?.addEventListener('click', async () => {
      const btn = document.getElementById('ptGrpSave');
      const name = document.getElementById('ptGrpName').value.trim();
      if (!name) { grpFehler('Bitte einen Namen angeben.'); return; }
      const mitglieder = [...grpDlg.gewaehlt];
      btn.disabled = true;
      try {
        if (grpDlg.id) await DB.updatePlanerGruppe(grpDlg.id, { name, mitglieder });
        else await DB.createPlanerGruppe(name, mitglieder);
      } catch (e) {
        // Doppelter Name (409) ist der einzige erwartbare Fehler und gehoert in
        // den Dialog, nicht in einen Toast hinter dem geschlossenen Dialog.
        grpFehler(e.message || 'Konnte nicht gespeichert werden.');
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
      Modal.closeAll();
      Toast.success(grpDlg.id ? 'Gruppe gespeichert' : 'Gruppe angelegt',
        `${escHtml(name)} · ${mitglieder.length} ${mitglieder.length === 1 ? 'Person' : 'Personen'}`);
      await ladeGruppenNeu();
    });
  }

  function openGruppeDelete(gruppe) {
    if (!gruppe) return;
    grpDeleteId = gruppe.id;
    const el = document.getElementById('ptGrpDeleteText');
    if (el) el.textContent = `„${gruppe.name}" wird entfernt (${gruppe.mitglieder.length} `
      + `${gruppe.mitglieder.length === 1 ? 'Mitglied' : 'Mitglieder'}). `
      + 'Die Personen und ihre Zuweisungen bleiben unverändert.';
    Modal.open('ptGrpDeleteModal');
  }
  function initGruppeDeleteModal() {
    document.getElementById('ptGrpDeleteConfirmBtn')?.addEventListener('click', async () => {
      if (grpDeleteId == null) return;
      const id = grpDeleteId; grpDeleteId = null;
      try { await DB.deletePlanerGruppe(id); }
      catch (e) { Modal.closeAll(); Toast.error('Nicht möglich', e.message || 'Konnte nicht gelöscht werden.'); return; }
      Modal.closeAll();
      Toast.success('Gelöscht', 'Gruppe wurde entfernt.');
      await ladeGruppenNeu();
    });
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

  // ═══════════════════ DRUCK (eine Person) ═══════════════════
  // Nutzt das Tabellen-Dokument aus planer-print.js — dadurch nur noch EIN
  // Druck-Stylesheet im Projekt statt dreier kopierter <style>-Bloecke.
  //
  // Zeitraum = der GANZE Durchlauf der Person, nicht das gerade gewählte
  // Ausbildungsjahr: renderTabelleHtml filtert intern mit barGeom, ein
  // AJ-Fenster hätte also Stationen aus anderen Lehrjahren lautlos
  // verschluckt (Ausbilder klickt im Panel „Drucken" und erwartet „seinen
  // Durchlauf", nicht „sein aktuelles Jahr").
  //
  // Die Regel selbst liegt als reine Funktion in planer-print.js
  // (PlanerPrint.druckZeitraum) — dort ist sie in node:test prüfbar und steht
  // direkt neben barGeom(), aus dessen Filterbedingung sie sich ableitet. Hier
  // bleibt nur das Auflösen der App-Globals zu ISO-Strings.
  function printPerson(azubiId) {
    const a = azubiById.get(azubiId); if (!a) return;
    const stationen = stationenFuerDruck(azubiId);
    const win = ajWindow();
    const zeitraum = PlanerPrint.druckZeitraum(a, stationen, {
      von: DateUtil.toISODate(win.start),
      bis: DateUtil.toISODate(win.ajEnd),
      heute: todayISO,
    });
    const html = PlanerPrint.renderTabelleHtml({
      von: zeitraum.von,
      bis: zeitraum.bis,
      stand: todayISO,
      titelZusatz: a.name,          // zurück im Fenster- und Dokumenttitel
      personen: [{
        name: a.name, beruf: a.beruf || '', gruppe: gruppeVon(a),
        stationen,
      }],
    });
    if (!PlanerPrint.openPrintWindow(html)) Toast.error('Popup blockiert', 'Bitte Pop-ups für diese Seite erlauben.');
  }

  // ═══════════════════ EXPORT (Excel-Arbeitsmappe) ═══════════════════
  // Aktuell gefilterte Personen + ALLE ihre Zuweisungen. Die Mappe selbst
  // (Blätter, Formeln, Formatierung) baut abteilungsplaner-export.js.

  // 0,9-MB-Bundle erst beim ersten Export holen, nicht bei jedem Seitenaufruf.
  function ladeExcelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/exceljs.min.js';
      s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS nicht verfügbar.')));
      s.onerror = () => reject(new Error('ExcelJS konnte nicht geladen werden.'));
      document.head.appendChild(s);
    });
  }

  function exportModelInput() {
    const splitName = (n) => {
      const parts = String(n || '').trim().split(/\s+/);        // Anzeige = "Vorname Nachname"
      return parts.length < 2 ? { vor: '', nach: n || '' } : { vor: parts.slice(0, -1).join(' '), nach: parts[parts.length - 1] };
    };
    const gefiltert = azubis.filter(passtFilter);
    const ids = new Set(gefiltert.map(a => a.id));
    const filter = [];
    if (searchText) filter.push({ label: 'Suche', wert: searchText });
    if (filterBeruf) filter.push({ label: 'Beruf', wert: filterBeruf });
    if (filterAbteilung) filter.push({ label: 'Abteilung', wert: filterAbteilung });
    if (filterVerantw) filter.push({ label: 'Verantwortlich', wert: verantwNameFor(filterVerantw) || filterVerantw });
    if (nurOhne) filter.push({ label: 'nur ohne Zuweisung', wert: 'ja' });
    if (showInaktive) filter.push({ label: 'inaktive Personen', wert: 'eingeschlossen' });
    return {
      ajStartYear, heute: todayISO,
      exportiertVon: displayName(user.name || '') || user.email || '',
      filter,
      personen: gefiltert.map(a => {
        const { vor, nach } = splitName(a.name);
        return {
          id: a.id, nachname: nach, vorname: vor, name: a.name,
          beruf: a.beruf || '', typ: a.istDhStudent ? 'DH-Student' : 'Azubi',
          gruppe: gruppeVon(a), email: a.email || '', aktiv: a.aktiv !== false,
          ausbildungVon: a.ausbildungsBeginn || '', ausbildungBis: a.ausbildungsEnde || '',
        };
      }),
      zuweisungen: alleZuweisungen.filter(z => ids.has(z.azubiId)).map(z => ({
        id: z.id, personId: z.azubiId, abteilung: z.abteilung || '',
        von: z.von || '', bis: z.bis || '',
        verantwEmail: z.verantwEmail || '',
        verantwName: displayName(z.verantwName || '') || verantwNameFor(z.verantwEmail) || '',
      })),
      abteilungen: abteilungenKatalog.map(a => ({
        name: a.name, istPmm: !!a.istPmm, aktiv: a.aktiv !== false, farbe: colorFor(a.name),
        verantwortliche: (a.verantwortliche || []).map(v => ({ email: v.email || '', name: displayName(v.name || '') || '' })),
      })),
    };
  }

  async function exportExcel() {
    const btn = document.getElementById('ptExport');
    const icon = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = Icon('refresh', { size: 19, cls: 'pt-ib__spin' }); }
    try {
      const ExcelJS = await ladeExcelJs();
      const model = AbtPlanerExport.buildExportModel(exportModelInput());
      const wb = AbtPlanerExport.buildWorkbook(ExcelJS, model);
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Abteilungsplaner_${ajLabel().replace(/[^\w]+/g, '_')}_${todayISO}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      Toast.success('Excel exportiert', `${model.personen.length} Personen · ${model.zuweisungen.length} Zuweisungen · 7 Blätter.`);
    } catch (err) {
      console.error('[planer] Excel-Export fehlgeschlagen:', err);
      Toast.error('Export fehlgeschlagen', err.message || 'Unbekannter Fehler.');
    } finally {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = icon; }
    }
  }

  // Modals einmalig binden (Markup ist statisch in abteilungs-planer.html).
  initZuweisungModal();
  initDeleteModal();
  initGruppeModal();
  initGruppeDeleteModal();

  // Sprung aus dem Dashboard („Abteilungsdurchlauf"-Kachel): die geklickte
  // Person vorwaehlen, damit hier direkt ihre Detail-Kachel offen steht. Den
  // Schluessel sofort verbrauchen – ein spaeteres F5 soll nicht wieder
  // aufklappen. Vergleich ueber String(), weil im Dashboard-DOM (data-Attribut)
  // aus jeder Id ein String wird; dieselbe Stelle in der read-only
  // Ausbilder-Sicht macht es genauso (findAzubi weiter oben).
  const gotoId = sessionStorage.getItem('gotoAzubiId');
  if (gotoId) {
    sessionStorage.removeItem('gotoAzubiId');
    const treffer = azubis.find(a => String(a.id) === String(gotoId));
    if (treffer) selectedAzubiId = treffer.id;
  }

  render();
  // Nach dem Aufbau (capBoardHeight laeuft im rAF davor) die vorgewaehlte
  // Zeile ins Bild holen – sonst steht die Kachel offen, waehrend ihre Zeile
  // weit unten in der Tafel liegt.
  if (selectedAzubiId) requestAnimationFrame(() => scrollRowIntoView(selectedAzubiId));
});
