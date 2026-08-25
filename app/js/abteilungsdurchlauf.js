/* ===================================================================
   ABTEILUNGSDURCHLAUF.JS – Ansicht für DH-Studenten (Rolle: dhstudent)
   -------------------------------------------------------------------
   Read-only Sicht auf den eigenen Abteilungsdurchlauf:
     Hero → Kennzahlen → Filter → Stationen-Liste → Zeitstrahl (ausklappbar)

   Die Stationen-Liste ist die Hauptansicht (früher: Tages-Gantt + eigene
   Kachel-Liste „Alle Abteilungen"). Sie zeigt jede Station als Zeile und
   führt bei abgeschlossener Beurteilung direkt auf beurteilung.html.
   Der Tages-Gantt (30 px/Tag) ist entfallen: über einen mehrjährigen
   DH-Durchlauf ergab er ~22.000 px Breite. Der Zeitstrahl darunter ist
   monatsbasiert und damit unabhängig von der Durchlaufdauer.

   Nutzt ausschließlich bestehende, theme-fähige Komponenten + Design-
   Tokens, damit alle Themes automatisch greifen.
   =================================================================== */

/* Einheitliche, ruhige Abteilungs-Palette (wie im Azubi-Planer). */
const GANTT_PALETTE = ['#4F9D9A','#5B86C2','#5FAE72','#D8835A','#9B7BC4',
  '#C75C6B','#C99A3E','#6B8E4E','#C77FB2','#4F8FB8','#7E70BE','#B06A52','#5BA98C','#6E7E8C','#A86FA0'];

const esc = window.escapeHtml;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await DB.fetchCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }
  // Nur DH-Studenten sehen diese Seite – alle anderen auf ihre Startseite.
  if (!user.istDhStudent) {
    window.location.replace(typeof landingPageFor === 'function' ? landingPageFor(user) : 'dashboard.html');
    return;
  }

  // Topbar: Avatar + Theme-Toggle
  applyAvatar(document.getElementById('dhAvatar'), user);
  document.getElementById('dhThemeToggle')?.addEventListener('click', () => {
    if (!window.PMTheme) return;
    window.PMTheme.set(window.PMTheme.get() === 'dark' ? 'light' : 'dark');
  });


  const main = document.getElementById('mainContent');
  const today = new Date();
  const heute = DateUtil.toISODate(today);
  let beurtByZuw = {};         // Beurteilungen je ZuweisungId; VOR try, damit die Sibling-Funktionen sie sehen

  // Konstanten der Render-Funktionen. Müssen VOR dem ersten Render stehen:
  // die Funktionen werden gehoistet, const/let dagegen nicht (temporale
  // Todeszone) – stünden sie weiter unten, bliebe die Seite leer.
  const DAY_PX = 30;                 // Spaltenbreite im Tagesraster
  const VORAUSSCHAU_AB_MONAT = 10;   // Filter: ab November das Folgejahr freigeben (0-basiert)
  const ZEITSTRAHL_AB_MONAT  = 9;    // Zeitstrahl: ab Oktober bis Ende des Folgejahres

  // Stabile Farbe je Abteilung (alphabetisch vorbelegt).
  const abtColorIdx = {}; let _nextIdx = 0;
  const colorFor = (abt) => {
    if (!abt) return GANTT_PALETTE[0];
    if (!(abt in abtColorIdx)) { abtColorIdx[abt] = _nextIdx % GANTT_PALETTE.length; _nextIdx++; }
    return GANTT_PALETTE[abtColorIdx[abt]];
  };

  function statusFor(z) {
    if (!z.von || !z.bis) return { key: 'offen',      label: 'Offen',      badge: 'badge--grey' };
    if (z.bis < heute)    return { key: 'beendet',    label: 'Beendet',    badge: 'badge--grey' };
    if (z.von > heute)    return { key: 'zukuenftig', label: 'Zukünftig', badge: 'badge--freigegeben' };
    return { key: 'aktuell', label: 'Aktuell', badge: 'badge--genehmigt' };
  }

  try {
    const zuwRaw = await DB.getZuweisungenFuerAzubi(user.id);
    const zuw = zuwRaw.slice().sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    try { (await DB.getBeurteilungenFuerAzubi(user.id)).forEach(b => { beurtByZuw[b.zuweisungId] = b; }); } catch (e) {}
    // Abteilungen vorab einfärben (sortiert → stabile Farbe je Abteilung).
    [...new Set(zuw.map(z => z.abteilung).filter(Boolean))].sort().forEach(colorFor);

    const rows = zuw.map(z => ({ z, verantw: displayName(z.verantwName || '') || '–', status: statusFor(z) }));

    const aktuell  = rows.find(r => r.status.key === 'aktuell') || null;
    const naechste = rows.find(r => r.status.key === 'zukuenftig') || null;
    const erste    = rows[0] || null;

    main.innerHTML = `
      ${heroHtml(user, today, aktuell)}
      ${kpisHtml(aktuell, naechste, erste)}
      <h2 class="dh-section-title">Deine Abteilungen</h2>
      ${rows.length ? `
        ${filterHtml(rows)}
        <div class="dh-stations" id="dhStations">${rows.map(stationHtml).join('')}</div>
        <div class="dh-empty dh-stations__none" id="dhStationsNone" hidden>Zu dieser Auswahl gibt es keine Abteilung.</div>
        ${timelineBoxHtml(rows)}`
        : `<div class="dh-empty">Dir ist aktuell keine Abteilung zugewiesen. Sobald die Personalabteilung deine Abteilungen plant, erscheinen sie hier.</div>`}
    `;

    if (rows.length) { initFilter(); initTimelineBox(); }
  } catch (err) {
    console.error('Abteilungsdurchlauf konnte nicht geladen werden:', err);
    main.innerHTML = `
      ${heroHtml(user, today, null)}
      <div class="dh-empty">Dein Abteilungsdurchlauf konnte gerade nicht geladen werden. Bitte später erneut versuchen.</div>`;
  }

  /* ── Hero (dunkles Welcome-Banner, in allen Themes konsistent) ── */
  function heroHtml(u, date, aktuell) {
    // firstName() (app.js) beherrscht das Entra-Format "Nachname, Vorname" –
    // naives split(' ')[0] ergäbe dort den Nachnamen.
    const first = (typeof firstName === 'function') ? firstName(u.name) : (u.name || '').split(' ')[0];
    const greeting = (typeof getGreeting === 'function') ? getGreeting() : 'Hallo';
    const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
    const info = [
      u.studiengang || '',
      u.semester ? `${u.semester}. Semester` : '',
      `${weekday}, ${date.getDate()}. ${DateUtil.MONTHS[date.getMonth()]}`,
    ].filter(Boolean).join(' · ');
    return `
      <section class="welcome-banner">
        <div class="welcome-banner__content">
          <p class="welcome-banner__greeting">${esc(greeting)}, ${esc(first)}</p>
          <h1 class="welcome-banner__title">Abteilungsdurchlauf</h1>
          <p class="welcome-banner__info">${esc(info)}</p>
        </div>
        <div class="welcome-banner__kw">
          <div class="welcome-banner__kw-number">${date.getDate()}</div>
          <div class="welcome-banner__kw-label">${DateUtil.MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}</div>
        </div>
      </section>`;
  }

  /* ── Kennzahlen (bestehende .planer-kpi-Kacheln) ── */
  function kpisHtml(aktuell, naechste, erste) {
    const tile = (value, label, meta = '') => `
      <div class="planer-kpi">
        <div class="planer-kpi__value">${esc(value)}</div>
        <div class="planer-kpi__label">${esc(label)}</div>
        ${meta ? `<div class="planer-kpi__label" style="text-transform:none;letter-spacing:0;color:var(--pm-grey-500);margin-top:2px">${esc(meta)}</div>` : ''}
      </div>`;
    const monatJahr = (iso) => { if (!iso) return '–'; const d = new Date(iso + 'T00:00:00'); return `${DateUtil.MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
    return `
      <div class="planer-kpis">
        ${tile(aktuell ? aktuell.z.abteilung : '–', 'Aktuelle Abteilung', aktuell ? `noch bis ${DateUtil.formatDate(aktuell.z.bis)}` : 'derzeit keine')}
        ${tile(naechste ? naechste.z.abteilung : '–', 'Nächste Abteilung', naechste ? `ab ${DateUtil.formatDate(naechste.z.von)}` : 'keine geplant')}
        ${tile(aktuell ? aktuell.verantw : '–', 'Verantwortlich (aktuell)')}
        ${tile(erste ? monatJahr(erste.z.von) : '–', 'Durchlauf seit', erste ? 'erste Abteilung' : '')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     FILTER – Status-Chips + Zeitraum (Jahr) + Freitext
     ---------------------------------------------------------------
     Rein clientseitig: alle Stationen sind gerendert, der Filter blendet
     nur aus (hidden). Dadurch bleibt der Zeitstrahl unten synchron und
     es entsteht kein zweiter Datenpfad zum Backend.
     ═══════════════════════════════════════════════════════════════ */

  /* Alle Jahre, die eine Zuweisung berührt (von..bis über Jahresgrenzen). */
  function jahreOf(z) {
    if (!z.von || !z.bis) return [];
    const a = Number(z.von.slice(0, 4)), b = Number(z.bis.slice(0, 4));
    const out = [];
    for (let y = a; y <= b; y++) out.push(y);
    return out;
  }

  /* Alle Monate ("2026-03"), die eine Zuweisung berührt. */
  function monateOf(z) {
    if (!z.von || !z.bis) return [];
    const out = [];
    let cur = new Date(Number(z.von.slice(0, 4)), Number(z.von.slice(5, 7)) - 1, 1);
    const bis = new Date(Number(z.bis.slice(0, 4)), Number(z.bis.slice(5, 7)) - 1, 1);
    while (cur <= bis) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return out;
  }

  /* Zeitliche Spanne der Ansicht – bewusst aus den DATEN abgeleitet:
       - früheste/späteste Zuweisung
       - erweitert um einen gepflegten Ausbildungs-/Studienzeitraum

     Ausdrücklich NICHT die erste Anmeldung in der Anwendung: DH-Studenten
     haben lange vor Einführung dieser Anwendung angefangen und melden sich
     erst jetzt an – ihre eigene Vergangenheit wäre damit abgeschnitten.
     Der datengetriebene Ansatz korrigiert sich dagegen selbst: werden alte
     Abteilungen und Beurteilungen nachgepflegt, wächst das Fenster
     automatisch mit, ohne dass irgendwo ein Datum gesetzt werden muss. */
  /* Oberer Horizont des Zeitstrahls: Ende des laufenden Jahres, ab Oktober
     Ende des Folgejahres. Bewusst NICHT das Ausbildungsende – sonst reichte
     die Achse Jahre in die Zukunft, in denen nichts geplant ist. Ein
     Studienende vor dem Horizont zieht ihn nach vorn, geplante Abteilungen
     darüber hinaus schieben ihn nach hinten (sie müssen sichtbar bleiben). */
  function horizont() {
    const jahr = today.getFullYear() + (today.getMonth() >= ZEITSTRAHL_AB_MONAT ? 1 : 0);
    const ende = `${jahr}-12-31`;
    return (user.ausbildungsEnde && user.ausbildungsEnde < ende) ? user.ausbildungsEnde : ende;
  }

  function durchlaufSpanne(rows) {
    const von = [], bis = [horizont()];
    if (user.ausbildungsBeginn) von.push(user.ausbildungsBeginn);
    rows.forEach(r => { if (r.z.von && r.z.bis) { von.push(r.z.von); bis.push(r.z.bis); } });
    if (!von.length) return null;
    return {
      von: von.reduce((m, d) => d < m ? d : m),
      bis: bis.reduce((m, d) => d > m ? d : m),
    };
  }

  /* Monatsliste zwischen zwei ISO-Daten, ohne Lücken ("2026-03"). */
  function monateZwischen(vonISO, bisISO) {
    const out = [];
    let cur = new Date(Number(vonISO.slice(0, 4)), Number(vonISO.slice(5, 7)) - 1, 1);
    const bis = new Date(Number(bisISO.slice(0, 4)), Number(bisISO.slice(5, 7)) - 1, 1);
    while (cur <= bis) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return out;
  }

  /* Auswählbarer Zeitraum im Filter – enger als der Zeitstrahl:
       Anfang: Beginn des Durchlaufs (nichts davor ist je auswählbar)
       Ende:   der aktuelle Monat; ab November zusätzlich das ganze Folgejahr
               (Jahreswechsel steht an, Planung schaut nach vorn); und immer
               mindestens bis zur letzten bereits geplanten Abteilung, sonst
               ließe sich ein eingeplanter Einsatz nicht herausfiltern.
     Der Zeitstrahl zeigt weiterhin den vollen Studienzeitraum – dort ist der
     Ausblick sinnvoll, in einer Auswahlliste wären leere Jahre nur Ballast. */
  function filterSpanne(rows) {
    const sp = durchlaufSpanne(rows);
    if (!sp) return null;

    let ende = new Date(today.getFullYear(), today.getMonth(), 1);
    if (today.getMonth() >= VORAUSSCHAU_AB_MONAT) ende = new Date(today.getFullYear() + 1, 11, 1);

    const letzteGeplant = rows.reduce((m, r) => (r.z.bis && r.z.bis > m) ? r.z.bis : m, '');
    if (letzteGeplant) {
      const lg = new Date(Number(letzteGeplant.slice(0, 4)), Number(letzteGeplant.slice(5, 7)) - 1, 1);
      if (lg > ende) ende = lg;
    }
    const endeISO = `${ende.getFullYear()}-${String(ende.getMonth() + 1).padStart(2, '0')}-01`;
    return { von: sp.von, bis: endeISO < sp.von ? sp.von : endeISO };
  }

  function filterHtml(rows) {
    const count = (key) => rows.filter(r => r.status.key === key).length;
    const chip = (key, label, n) => `
      <button type="button" class="dh-chip${key === 'alle' ? ' is-active' : ''}" data-status="${key}"
              aria-pressed="${key === 'alle'}"${n === 0 ? ' disabled' : ''}>
        ${esc(label)}<span class="dh-chip__count">${n}</span>
      </button>`;

    // Zeitraum-Auswahl: ganze Jahre UND einzelne Monate. PMSelect flacht
    // <optgroup> ein (rebuildOptions liest select.options), deshalb müssen die
    // Beschriftungen für sich stehen – „2026 · ganzes Jahr" vs. „Okt 2026".
    // Monate UND Jahre lückenlos, aber nur im sinnvoll auswählbaren Fenster
    // (siehe filterSpanne) – nicht über den kompletten Studienzeitraum.
    const fs     = filterSpanne(rows);
    const monate = fs ? monateZwischen(fs.von, fs.bis) : [];
    const jahre  = [...new Set(monate.map(ym => ym.slice(0, 4)))];
    const monatLabel = (ym) => {
      const [y, m] = ym.split('-').map(Number);
      return `${DateUtil.MONTHS_SHORT[m - 1]} ${y}`;
    };
    const zeitraumOpts = ['<option value="">Alle Zeiträume</option>']
      .concat(jahre.map(y => `<option value="j:${y}">${y} · ganzes Jahr</option>`))
      .concat(monate.map(ym => `<option value="m:${ym}">${monatLabel(ym)}</option>`))
      .join('');

    return `
      <div class="dh-filter">
        <div class="dh-filter__chips" role="group" aria-label="Nach Status filtern">
          ${chip('alle', 'Alle', rows.length)}
          ${chip('beendet', 'Abgeschlossen', count('beendet'))}
          ${chip('aktuell', 'Aktuell', count('aktuell'))}
          ${chip('zukuenftig', 'Geplant', count('zukuenftig'))}
          ${count('offen') ? chip('offen', 'Ohne Zeitraum', count('offen')) : ''}
        </div>
        <div class="dh-filter__tools">
          <label class="dh-filter__field">
            <span class="dh-filter__label">Zeitraum</span>
            <select class="form-control dh-filter__zeitraum" id="dhZeitraum" data-pm-search>${zeitraumOpts}</select>
          </label>
          <label class="dh-filter__field">
            <span class="dh-filter__label">Suche</span>
            <input type="search" class="form-control dh-filter__suche" id="dhSuche"
                   placeholder="Abteilung oder Person…" autocomplete="off">
          </label>
        </div>
      </div>
      <p class="dh-filter__result" id="dhFilterResult" role="status" aria-live="polite"></p>`;
  }

  function initFilter() {
    const listeEl   = document.getElementById('dhStations');
    const noneEl    = document.getElementById('dhStationsNone');
    const resultEl  = document.getElementById('dhFilterResult');
    const zeitraumEl = document.getElementById('dhZeitraum');
    const sucheEl   = document.getElementById('dhSuche');
    const chips     = [...document.querySelectorAll('.dh-chip')];
    if (!listeEl) return;

    let status = 'alle';
    const stationen = [...listeEl.querySelectorAll('.dh-station')];

    function apply() {
      // Zeitraum: "" (alle) | "j:2026" (ganzes Jahr) | "m:2026-03" (Monat)
      const zeitraum = zeitraumEl ? zeitraumEl.value : '';
      const [art, wert] = zeitraum ? zeitraum.split(':') : ['', ''];
      const suche = (sucheEl ? sucheEl.value : '').trim().toLowerCase();
      let sichtbar = 0;

      stationen.forEach(el => {
        const passtStatus = status === 'alle' || el.dataset.status === status;
        const passtZeit =
          !zeitraum ? true
          : art === 'j' ? (el.dataset.jahre  || '').split(' ').includes(wert)
          :               (el.dataset.monate || '').split(' ').includes(wert);
        const passtSuche  = !suche || (el.dataset.suche || '').includes(suche);
        const zeigen = passtStatus && passtZeit && passtSuche;
        el.hidden = !zeigen;
        if (zeigen) sichtbar++;
        // Zeitstrahl unten mitziehen: nicht passende Segmente zurücknehmen.
        document.querySelectorAll(`.dh-tl__seg[data-zuw="${CSS.escape(el.dataset.zuw)}"]`)
          .forEach(seg => seg.classList.toggle('is-dimmed', !zeigen));
      });

      if (noneEl) noneEl.hidden = sichtbar > 0;
      const gefiltert = status !== 'alle' || zeitraum || suche;
      if (resultEl) {
        const wort = (n) => n === 1 ? 'Abteilung' : 'Abteilungen';
        resultEl.textContent = gefiltert
          ? `${sichtbar} von ${stationen.length} ${wort(stationen.length)}`
          : `${stationen.length} ${wort(stationen.length)} insgesamt`;
      }
    }

    chips.forEach(c => c.addEventListener('click', () => {
      status = c.dataset.status;
      chips.forEach(o => { const on = o === c; o.classList.toggle('is-active', on); o.setAttribute('aria-pressed', String(on)); });
      apply();
    }));
    zeitraumEl?.addEventListener('change', apply);
    sucheEl?.addEventListener('input', apply);
    apply();
  }

  /* ═══════════════════════════════════════════════════════════════
     STATIONEN-LISTE – eine Zeile je Abteilung
     ---------------------------------------------------------------
     Ersetzt die frühere Kachel-Liste „Alle Abteilungen". Bei
     abgeschlossener Beurteilung ist die Zeile ein echtes <a> auf
     beurteilung.html?zuw=… (Tastatur/Mittelklick ohne Extra-JS).
     ═══════════════════════════════════════════════════════════════ */
  function stationHtml(r) {
    const z = r.z;
    const b = beurtByZuw[z.id];
    const beurteilbar = b && b.status === 'abgeschlossen';
    const zeitraum = (z.von && z.bis)
      ? `${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}`
      : 'Zeitraum offen';
    const dauer = dauerText(z);
    const suche = [z.abteilung || '', r.verantw || ''].join(' ').toLowerCase();
    const tag = beurteilbar ? 'a' : 'div';
    const attrs = beurteilbar ? ` href="beurteilung.html?zuw=${encodeURIComponent(z.id)}"` : '';
    // Note deutsch formatiert: 2 → „2,0", 1.7 → „1,7".
    const note = (beurteilbar && b.note != null)
      ? `<span class="dh-station__note">Note ${esc(Number(b.note).toFixed(1).replace('.', ','))}</span>`
      : '';

    return `
      <${tag} class="dh-station dh-station--${r.status.key}${beurteilbar ? ' dh-station--link' : ''}"${attrs}
         data-zuw="${esc(String(z.id))}" data-status="${r.status.key}"
         data-jahre="${jahreOf(z).join(' ')}" data-monate="${monateOf(z).join(' ')}"
         data-suche="${esc(suche)}">
        <span class="dh-station__dot" style="background:${colorFor(z.abteilung)}" aria-hidden="true"></span>
        <span class="dh-station__zeit">
          <span class="dh-station__datum">${zeitraum}</span>
          ${dauer ? `<span class="dh-station__dauer">${esc(dauer)}</span>` : ''}
        </span>
        <span class="dh-station__haupt">
          <span class="dh-station__abt">${esc(z.abteilung || '–')}</span>
          <span class="dh-station__verantw">Ansprechpartner: <strong>${esc(r.verantw)}</strong></span>
        </span>
        <span class="dh-station__meta">
          ${note}
          <span class="badge ${r.status.badge}">${esc(r.status.label)}</span>
          ${beurteilbar
            ? `<span class="dh-station__cta">Beurteilung ansehen<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>`
            : `<span class="dh-station__cta dh-station__cta--off">${z.bis && z.bis < heute ? 'Beurteilung ausstehend' : ''}</span>`}
        </span>
      </${tag}>`;
  }

  function dauerText(z) {
    if (!z.von || !z.bis) return '';
    const tage = Math.round((new Date(z.bis + 'T00:00:00') - new Date(z.von + 'T00:00:00')) / 86400000) + 1;
    if (tage < 45) return `${Math.max(1, Math.round(tage / 7))} Wochen`;
    return `${Math.max(1, Math.round(tage / 30.4))} Monate`;
  }

  /* ═══════════════════════════════════════════════════════════════
     ZEITSTRAHL – kompaktes Band, ausklappbar auf Tagesraster
     ---------------------------------------------------------------
     Zwei Zustände mit unterschiedlichem Maßstab:
       • eingeklappt: Übersichtsband in Prozent → passt immer in die Breite
       • ausgeklappt: Tagesraster mit DAY_PX Pixeln pro Tag → horizontal
         scrollbar, springt beim Öffnen auf „heute"
     Die Balken rechnen in beiden Fällen in Prozent der Gesamtspanne; im
     Tagesraster ist die Canvas-Breite numDays × DAY_PX, dadurch bleiben
     Prozentangaben und Tagesspalten deckungsgleich.
     ═══════════════════════════════════════════════════════════════ */
  function timelineBoxHtml(rows) {
    const mit = rows.filter(r => r.z.von && r.z.bis);
    if (!mit.length) return '';

    // Achse über den gesamten Ausbildungs-/Studienzeitraum, nicht nur über die
    // belegten Monate – sonst endet der Zeitstrahl an der letzten Zuweisung.
    const sp = durchlaufSpanne(rows);
    const [sy, sm] = sp.von.split('-').map(Number);
    const [ey, em] = sp.bis.split('-').map(Number);
    const start = new Date(sy, sm - 1, 1);
    const ende  = new Date(ey, em, 0);                  // letzter Tag des End-Monats
    const numDays = Math.round((ende - start) / 86400000) + 1;
    const pct = (d) => (d - start) / 86400000 / numDays * 100;

    // Monats- und Jahresleiste. Breiten als Vielfaches von --day-px, damit
    // Kopfzeilen, Tagesspalten und Balken exakt übereinander liegen.
    const monate = [];
    for (let c = new Date(start); c <= ende; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
      const dim = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
      monate.push({ y: c.getFullYear(), m: c.getMonth(), dim });
    }
    const jahre = [];
    monate.forEach(mo => {
      const last = jahre[jahre.length - 1];
      if (last && last.y === mo.y) last.dim += mo.dim; else jahre.push({ y: mo.y, dim: mo.dim });
    });
    const px = (tage) => `calc(${tage} * var(--day-px))`;

    // Tagesspalten: Nummer, Wochenende gerastert, heute hervorgehoben.
    const tageHtml = monate.map(mo => {
      let out = '';
      for (let d = 1; d <= mo.dim; d++) {
        const dt = new Date(mo.y, mo.m, d);
        const dow = dt.getDay();
        const heuteTag = dt.getFullYear() === today.getFullYear()
          && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate();
        out += `<span class="dh-tl__day${dow === 0 || dow === 6 ? ' dh-tl__day--we' : ''}`
             + `${d === 1 ? ' dh-tl__day--first' : ''}${heuteTag ? ' dh-tl__day--today' : ''}">${d}</span>`;
      }
      return out;
    }).join('');

    const segs = (mitLabel) => mit.map(r => {
      const l = pct(new Date(r.z.von + 'T00:00:00'));
      const w = pct(new Date(r.z.bis + 'T00:00:00')) - l + (100 / numDays);
      return `<button type="button" class="dh-tl__seg dh-tl__seg--${r.status.key}" data-zuw="${esc(String(r.z.id))}"
        style="left:${l}%;width:${w}%;background:${colorFor(r.z.abteilung)}"
        title="${esc(r.z.abteilung || '–')} · ${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}">
        ${mitLabel ? `<span class="dh-tl__seglabel">${esc(r.z.abteilung || '')}</span>` : ''}
        <span class="sr-only">${esc(r.z.abteilung || '')} ${DateUtil.formatDate(r.z.von)} bis ${DateUtil.formatDate(r.z.bis)}</span>
      </button>`;
    }).join('');

    const heuteDrin = today >= start && today <= ende;
    const heutePct  = heuteDrin ? pct(today) : 0;
    // Nur die Linie markiert „heute"; die rote Tageszelle in der Kopfzeile
    // benennt den Tag bereits, eine zusätzliche Sprechblase wäre doppelt.
    const heuteLinie = heuteDrin ? `<span class="dh-tl__today" style="left:${heutePct}%"></span>` : '';

    return `
      <section class="dh-tl" id="dhTl">
        <div class="dh-tl__head">
          <h2 class="dh-section-title dh-tl__title">Zeitstrahl</h2>
          <button type="button" class="dh-tl__toggle" id="dhTlToggle" aria-expanded="false" aria-controls="dhTlBody">
            <span class="dh-tl__toggle-text">Ausklappen</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>

        <div class="dh-tl__mini" id="dhTlMini">${heuteLinie}${segs(false)}</div>

        <div class="dh-tl__body" id="dhTlBody" hidden>
          <div class="dh-tl__scroll" id="dhTlScroll" tabindex="0" role="region"
               aria-label="Zeitstrahl im Tagesraster, horizontal scrollbar">
            <div class="dh-tl__canvas" style="--day-px:${DAY_PX}px;width:${px(numDays)}">
              <div class="dh-tl__years">${jahre.map(j =>
                `<span class="dh-tl__year" style="width:${px(j.dim)}"><span class="dh-tl__yearlabel">${j.y}</span></span>`).join('')}</div>
              <div class="dh-tl__months">${monate.map(mo =>
                `<span class="dh-tl__month" style="width:${px(mo.dim)}">${DateUtil.MONTHS[mo.m]}</span>`).join('')}</div>
              <div class="dh-tl__days">${tageHtml}</div>
              <div class="dh-tl__trackwrap">
                <div class="dh-tl__track">
                  ${monate.map(mo => `<span class="dh-tl__gridline" style="width:${px(mo.dim)}"></span>`).join('')}
                  ${segs(true)}
                  ${heuteLinie}
                </div>
              </div>
            </div>
          </div>

          <!-- Eigene Scrollleiste: Edge zeichnet Overlay-Scrollbars, die keine
               Layout-Höhe belegen und nur beim Hovern erscheinen. -->
          <div class="dh-tl__bar" id="dhTlBar">
            <div class="dh-tl__thumb" id="dhTlThumb" role="scrollbar" tabindex="0"
                 aria-controls="dhTlScroll" aria-orientation="horizontal"
                 aria-label="Zeitstrahl verschieben"></div>
          </div>
        </div>
      </section>`;
  }

  function initTimelineBox() {
    const box = document.getElementById('dhTl');
    if (!box) return;
    const toggle = document.getElementById('dhTlToggle');
    const body   = document.getElementById('dhTlBody');

    const scroll = document.getElementById('dhTlScroll');

    /* ── Eigene Scrollleiste ──────────────────────────────────────
       Edge/Chromium zeichnen Overlay-Scrollbars: keine Layout-Höhe, nur beim
       Hovern sichtbar. Die native Leiste ist per CSS ausgeblendet, hier kommt
       eine dauerhaft sichtbare, ziehbare Leiste unter dem Zeitstrahl. */
    const bar   = document.getElementById('dhTlBar');
    const thumb = document.getElementById('dhTlThumb');

    function syncLeiste() {
      if (!scroll || !bar || !thumb) return;
      const maxScroll = scroll.scrollWidth - scroll.clientWidth;
      if (maxScroll <= 0) { bar.hidden = true; return; }
      bar.hidden = false;
      const spurBreite  = bar.clientWidth;
      const griffBreite = Math.max(48, spurBreite * (scroll.clientWidth / scroll.scrollWidth));
      const anteil      = scroll.scrollLeft / maxScroll;
      thumb.style.width = `${griffBreite}px`;
      thumb.style.transform = `translateX(${anteil * (spurBreite - griffBreite)}px)`;
      thumb.setAttribute('aria-valuenow', String(Math.round(anteil * 100)));
    }

    scroll?.addEventListener('scroll', syncLeiste, { passive: true });
    window.addEventListener('resize', syncLeiste);

    // Griff ziehen: Pointer-Capture, damit der Zug auch außerhalb weiterläuft.
    let ziehStart = null;
    thumb?.addEventListener('pointerdown', (e) => {
      ziehStart = { x: e.clientX, scrollLeft: scroll.scrollLeft };
      thumb.setPointerCapture(e.pointerId);
      thumb.classList.add('is-dragging');
      e.preventDefault();
    });
    thumb?.addEventListener('pointermove', (e) => {
      if (!ziehStart) return;
      const maxScroll = scroll.scrollWidth - scroll.clientWidth;
      const spur = bar.clientWidth - thumb.offsetWidth;
      if (spur <= 0) return;
      scroll.scrollLeft = ziehStart.scrollLeft + (e.clientX - ziehStart.x) * (maxScroll / spur);
    });
    const ziehEnde = () => { ziehStart = null; thumb?.classList.remove('is-dragging'); };
    thumb?.addEventListener('pointerup', ziehEnde);
    thumb?.addEventListener('pointercancel', ziehEnde);

    // Klick auf die Spur: Griff dorthin zentrieren.
    bar?.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return;
      const maxScroll = scroll.scrollWidth - scroll.clientWidth;
      const spur = bar.clientWidth - thumb.offsetWidth;
      if (spur <= 0) return;
      const x = e.clientX - bar.getBoundingClientRect().left - thumb.offsetWidth / 2;
      scroll.scrollTo({ left: Math.min(Math.max(0, x / spur * maxScroll), maxScroll), behavior: 'smooth' });
    });

    // Tastatur: Pfeiltasten verschieben den Griff (role="scrollbar").
    thumb?.addEventListener('keydown', (e) => {
      const schritt = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!schritt) return;
      e.preventDefault();
      scroll.scrollBy({ left: schritt * 7 * DAY_PX, behavior: 'smooth' });
    });

    /* Beim Aufklappen auf den heutigen Tag zentrieren – ohne sichtbaren
       Button, rein als Startposition. Offsets sind erst messbar, wenn der
       Body nicht mehr hidden ist, daher nur von dort aufgerufen. */
    function zuHeute(smooth) {
      if (!scroll) return;
      const marke = scroll.querySelector('.dh-tl__today');
      if (!marke) return;
      const ziel = Math.max(0, marke.offsetLeft - scroll.clientWidth / 2);
      scroll.scrollTo({ left: ziel, behavior: smooth ? 'smooth' : 'auto' });
    }

    toggle?.addEventListener('click', () => {
      const offen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!offen));
      body.hidden = offen;
      box.classList.toggle('is-open', !offen);
      toggle.querySelector('.dh-tl__toggle-text').textContent = offen ? 'Ausklappen' : 'Einklappen';
      // Maße sind erst nach dem Aufklappen messbar (vorher hidden).
      if (!offen) requestAnimationFrame(() => { zuHeute(false); syncLeiste(); });
    });

    /* Mausrad über dem Zeitstrahl scrollt horizontal. preventDefault nur,
       wenn in der Richtung wirklich noch Weg ist – sonst bliebe die Seite am
       Zeitstrahl hängen, sobald man am Anfang oder Ende angekommen ist. */
    scroll?.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;                                  // Browser-Zoom nicht abfangen
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      const max = scroll.scrollWidth - scroll.clientWidth;
      const geht = delta < 0 ? scroll.scrollLeft > 0 : scroll.scrollLeft < max - 1;
      if (!geht) return;
      e.preventDefault();
      scroll.scrollLeft += delta;
    }, { passive: false });

    // Segment → zugehörige Station in der Liste anspringen und kurz hervorheben.
    box.querySelectorAll('.dh-tl__seg').forEach(seg => {
      seg.addEventListener('click', () => {
        const ziel = document.querySelector(`.dh-station[data-zuw="${CSS.escape(seg.dataset.zuw)}"]`);
        if (!ziel || ziel.hidden) return;
        ziel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ziel.classList.add('dh-station--flash');
        setTimeout(() => ziel.classList.remove('dh-station--flash'), 1400);
      });
    });
  }
});
