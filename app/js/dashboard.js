/* ===================================================================
   DASHBOARD.JS – Rollen-spezifisches Dashboard
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  /* Layout-Marker: erlaubt dem Dashboard volle Seitenbreite (Override
     der globalen --content-max-Beschränkung von 1200 px in layout.css). */
  document.body.dataset.page = 'dashboard';

  /* initPage statt initLayout: ruft buildSidebar() auf, das die komplette
     Sidebar inkl. Theme-Toggle im Footer aufbaut. (initLayout alleine
     würde nur die hardcoded sidebar in dashboard.html anbinden, in der
     der Theme-Toggle nicht enthalten ist.) */
  const user = await initPage('nav-dashboard', []);
  if (!user) return;

  /* Wenn ein Render-Pfad wirft (Daten kaputt, undefined property,
     etc.) blieb der mainContent früher einfach LEER — ohne jeden
     Hinweis im UI. Stattdessen: Fehler abfangen und sichtbar machen,
     damit der Bug nicht mehr stillschweigend passiert. */
  try {
    if (user.role === 'azubi') {
      await renderAzubiDashboard(user);
    } else {
      await renderAusbilderDashboard(user);
    }
  } catch (err) {
    console.error('Dashboard-Render gescheitert:', err);
    const main = document.getElementById('mainContent');
    if (main) {
      main.innerHTML = `
        <div class="dash-error-card" role="alert">
          <div class="dash-error-card__head">
            <span class="dash-error-card__icon" aria-hidden="true">⚠️</span>
            <h2>Dashboard konnte nicht geladen werden</h2>
          </div>
          <p>Beim Aufbau des Dashboards ist ein Fehler aufgetreten. Die anderen Seiten (Wochenansicht, Jahresansicht) funktionieren wahrscheinlich weiterhin.</p>
          <pre class="dash-error-card__detail">${(err && err.stack ? err.stack : String(err)).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
          <button type="button" class="btn btn-sm btn-outline" onclick="window.location.reload()">Neu laden</button>
        </div>
      `;
    }
  }

  Toast.init();

  // Wenn der Nutzer per Zurück-Schaltfläche zurückkommt (BFCache-Restore),
  // feuert DOMContentLoaded nicht erneut – aber pageshow mit persisted=true.
  // Damit sieht der Ausbilder immer den aktuellen Stand des Posteingangs.
  window.addEventListener('pageshow', async (event) => {
    if (!event.persisted) return;
    try {
      if (user.role === 'azubi') {
        await renderAzubiDashboard(user);
      } else {
        await renderAusbilderDashboard(user);
      }
    } catch (err) {
      console.error('Dashboard BFCache-Refresh gescheitert:', err);
    }
  });
});

/* ── Azubi-Dashboard (bestehend) ─────────────────────────────── */
async function renderAzubiDashboard(user) {
  const today = new Date();
  const kw = DateUtil.getKW(today);
  const kwYear = DateUtil.getKWYear(today);

  const alleWochen = await DB.getWochenFuerAzubi(user.id);
  const aktuelleWoche = await DB.getWoche(user.id, kw, kwYear);
  const offeneWochen = alleWochen.filter(w => w.status === 'offen').length;
  const genehmigte = alleWochen.filter(w => w.status === 'genehmigt').length;
  const gesamtStunden = alleWochen.reduce((s, w) => s + (w.gesamtstunden || 0), 0);

  /* Sync-Lookup statt DB.getWoche-Promise-Aufrufen im Render-Pfad.
     DB.getWoche ist async und wurde an mehreren Stellen ohne await
     aufgerufen → rec war ein Promise und der ganze Bento-Block
     rechnete mit Schrottwerten oder warf bei Property-Zugriff. */
  const wocheLookup = new Map(alleWochen.map(w => [`${w.year}-${w.kw}`, w]));
  const lookupWoche = (wkw, wyr) => wocheLookup.get(`${wyr}-${wkw}`) || null;

  let fortschritt = 0;
  if (user.ausbildungsBeginn && user.ausbildungsEnde) {
    const start = new Date(user.ausbildungsBeginn);
    const ende = new Date(user.ausbildungsEnde);
    const jetzt = new Date();
    const gesamt = ende - start;
    const vergangen = Math.min(jetzt - start, gesamt);
    fortschritt = Math.round((vergangen / gesamt) * 100);
  }

  const zuw = await DB.getAktuellerAusbilder(user.id);
  const ausbilder = zuw ? await DB.getUser(zuw.ausbilderId) : null;

  const main = document.getElementById('mainContent');

  // "Ausstehend" = vergangene, noch nicht abgegebene Wochen im jüngeren
  // Zeitfenster. Auch Wochen OHNE Datensatz (= leer) zählen – sonst wirken
  // nie begonnene Wochen fälschlich als erledigt. Aktuelle Woche steckt
  // bereits im Hero, daher hier nur vergangene Wochen.
  const OUT_WINDOW = 8;
  const curMonday = DateUtil.getMondayOfKW(kw, kwYear);
  const ausstehend = [];
  for (let i = 1; i <= OUT_WINDOW; i++) {
    const mo = new Date(curMonday); mo.setDate(curMonday.getDate() - i * 7);
    const su = new Date(mo); su.setDate(mo.getDate() + 6);
    // Wochen komplett vor Ausbildungsbeginn überspringen.
    if (user.ausbildungsBeginn && DateUtil.toISODate(su) < user.ausbildungsBeginn) continue;
    const wkw = DateUtil.getKW(mo), wyr = DateUtil.getKWYear(mo);
    const rec = lookupWoche(wkw, wyr);
    const st = weekState(rec);
    if (st !== 'abgegeben') {
      ausstehend.push({ kw: wkw, year: wyr, monday: mo, status: rec ? rec.status : null, state: st });
    }
  }
  ausstehend.sort((a, b) => {
    const ra = a.status === 'abgelehnt' ? 0 : 1;
    const rb = b.status === 'abgelehnt' ? 0 : 1;
    return ra - rb || (a.year - b.year) || (a.kw - b.kw);
  });

  const aktStatus = aktuelleWoche ? aktuelleWoche.status : 'offen';
  const wocheStd  = aktuelleWoche
    ? (aktuelleWoche.tage || []).reduce((s, t) => s + (t.stunden || 0), 0)
    : 0;
  const statusLbl = { offen: 'Offen', freigegeben: 'Freigegeben', genehmigt: 'Genehmigt', abgelehnt: 'Zurückgegeben' }[aktStatus] || 'Offen';
  const monday    = DateUtil.getMondayOfKW(kw, kwYear);
  const sunday    = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const hasProgress = user.ausbildungsBeginn && user.ausbildungsEnde;
  const range = `${DateUtil.formatDateShort(DateUtil.toISODate(monday))} – ${DateUtil.formatDateShort(DateUtil.toISODate(sunday))}`;

  function decToTime(dec) {
    const m = Math.round((dec || 0) * 60);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  }

  function renderOutstandingItem(w) {
    const mo = w.monday || DateUtil.getMondayOfKW(w.kw, w.year);
    const su = new Date(mo); su.setDate(mo.getDate() + 6);
    const cls = w.status === 'abgelehnt' ? 'abgelehnt' : (w.state === 'entwurf' ? 'entwurf' : 'leer');
    const lbl = { abgelehnt: 'Zurückgegeben', entwurf: 'Entwurf', leer: 'Leer' }[cls];
    return `
      <a href="wochenansicht.html" class="dash-out-item dash-out-item--${cls}" data-goto-kw="${w.kw}" data-goto-year="${w.year}">
        <span class="dash-out-item__kw">KW ${w.kw}</span>
        <span class="dash-out-item__range">${DateUtil.formatDateShort(DateUtil.toISODate(mo))} – ${DateUtil.formatDateShort(DateUtil.toISODate(su))}</span>
        <span class="dash-out-badge dash-out-badge--${cls}">${lbl}</span>
        <svg class="dash-out-item__arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>`;
  }

  // Berichtstyp steuert den Hero: 'täglich' (gewerblich) → aktuelle Woche
  // mit Tagen; 'wöchentlich' (kaufmännisch) → Übersicht der letzten KWs.
  const berichtTyp = user.berichtTyp || 'täglich';

  // Zustand einer Woche fürs farbliche Markieren in der Wochenübersicht.
  function weekState(w) {
    if (!w) return 'leer';
    if (w.status === 'freigegeben' || w.status === 'genehmigt') return 'abgegeben';
    const hatInhalt = (w.tage || []).some(t =>
        (t.stunden > 0) || t.eintrag || t.betriebEintrag || t.schuleEintrag || t.unterweisungEintrag)
      || w.betriebEintrag || w.schuleEintrag || w.unterweisungEintrag;
    return hatInhalt ? 'entwurf' : 'leer';
  }

  function renderRecentWeeksGrid(count) {
    const STATE_LBL = { leer: 'Leer', entwurf: 'Entwurf', abgegeben: 'Abgegeben' };
    let html = '';
    for (let i = 0; i < count; i++) {
      const mo = new Date(monday); mo.setDate(monday.getDate() - i * 7);
      const wkw = DateUtil.getKW(mo), wyr = DateUtil.getKWYear(mo);
      const su = new Date(mo); su.setDate(mo.getDate() + 6);
      const st = weekState(lookupWoche(wkw, wyr));
      html += `
        <a href="wochenansicht.html" class="dash-week-chip dash-week-chip--${st}${i === 0 ? ' is-current' : ''}" data-goto-kw="${wkw}" data-goto-year="${wyr}">
          <span class="dash-week-chip__kw">KW ${wkw}</span>
          <span class="dash-week-chip__range">${DateUtil.formatDateShort(DateUtil.toISODate(mo))} – ${DateUtil.formatDateShort(DateUtil.toISODate(su))}</span>
          <span class="dash-week-chip__state">${STATE_LBL[st]}</span>
        </a>`;
    }
    return `<div class="dash-weekgrid">${html}</div>`;
  }

  function renderHero() {
    if (berichtTyp === 'wöchentlich') {
      return `
        <section class="dash-tile dash-hero animate-fade-in">
          <div class="dash-tile__head">
            <div>
              <span class="dash-tile__eyebrow">Deine Wochen</span>
              <h2 class="dash-tile__title">Letzte Kalenderwochen</h2>
            </div>
            <a href="wochenansicht.html" class="btn btn-sm btn-outline" data-goto-kw="${kw}" data-goto-year="${kwYear}">Aktuelle Woche →</a>
          </div>
          ${renderRecentWeeksGrid(8)}
          <div class="dash-weekgrid__legend">
            <span><i class="dash-dot dash-dot--abgegeben"></i> Abgegeben</span>
            <span><i class="dash-dot dash-dot--entwurf"></i> Entwurf</span>
            <span><i class="dash-dot dash-dot--leer"></i> Leer / offen</span>
          </div>
        </section>`;
    }
    return `
      <section class="dash-tile dash-hero animate-fade-in status-${aktStatus}">
        <div class="dash-tile__head">
          <div>
            <span class="dash-tile__eyebrow">Aktuelle Woche</span>
            <h2 class="dash-tile__title">KW ${kw} · ${range}</h2>
          </div>
          <span class="badge badge--${aktStatus}">${statusLbl}</span>
        </div>
        <div class="week-status-list dash-hero__days">
          ${renderWeekStatusDays(aktuelleWoche, kw, kwYear)}
        </div>
        <div class="dash-hero__foot">
          <span class="dash-hero__sum">Diese Woche: <strong>${decToTime(wocheStd)} Std.</strong></span>
          <a href="wochenansicht.html" class="btn btn-primary" data-goto-kw="${kw}" data-goto-year="${kwYear}">
            Zur aktuellen Woche
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>
      </section>`;
  }

  /* ── Bento-Daten aufbereiten ──
     Die linke Spalte (Bento) ersetzt das alte zweispaltige Layout.
     - Hero: aktuelle Woche mit KW, Date-Range, Status, Wochen-Mini, CTAs.
     - Ausbildung: SVG-Donut (Monate Lehrjahr) + Lehrjahr-Segmente.
     - Recent: 6 jüngste Wochen als status-codierte Cards.
     - Frist: Bis Sonntag 23:59 (gelb).
     - Stats: Sparkline der letzten 12 Wochen + Streak-Pille. */

  function bentoStatusClass(status) {
    if (status === 'genehmigt')   return 'genehmigt';
    if (status === 'freigegeben') return 'freigegeben';
    if (status === 'abgelehnt')   return 'abgelehnt';
    return 'offen';
  }
  function bentoStatusLabel(status) {
    return { genehmigt: 'Genehmigt', freigegeben: 'Freigegeben',
             abgelehnt: 'Zurückgegeben', offen: 'Entwurf' }[bentoStatusClass(status)];
  }
  function wkcardKind(w) {
    if (!w) return 'draft';
    if (w.status === 'genehmigt')   return 'ok';
    if (w.status === 'freigegeben') return 'fr';
    if (w.status === 'abgelehnt')   return 'er';
    return 'draft';
  }

  /* Wochen-Mini: Mo–So, today gelb hervorgehoben. KEINE Tages-Stunden,
     nur Datums-Anzeige (siehe Memory: no-day-level-tracking). */
  function renderBentoWeekmini() {
    const todayISO = DateUtil.toISODate(new Date());
    const days = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const iso = DateUtil.toISODate(d);
      const isToday = iso === todayISO;
      const isPast  = iso  <  todayISO;
      const isWE    = i >= 5;
      const cls = isToday ? 'b-day--today'
                : isWE    ? 'b-day--weekend'
                : isPast  ? 'b-day--past'
                :           '';
      html += `<div class="b-day ${cls}"><span class="dn">${days[i]}</span><span class="dnum">${d.getDate()}</span></div>`;
    }
    return html;
  }

  /* Recent (Wochen-Variante): 6 jüngste Wochen (vor der aktuellen, die
     bereits im Hero steckt). Liefert die Wochen-Cards. */
  function renderBentoRecentWeeks() {
    let html = '';
    for (let i = 1; i <= 6; i++) {
      const mo = new Date(monday); mo.setDate(monday.getDate() - i * 7);
      if (user.ausbildungsBeginn && DateUtil.toISODate(mo) < user.ausbildungsBeginn) continue;
      const wkw = DateUtil.getKW(mo), wyr = DateUtil.getKWYear(mo);
      const su = new Date(mo); su.setDate(mo.getDate() + 6);
      const rec = lookupWoche(wkw, wyr);
      const kind = wkcardKind(rec);
      const lbl = kind === 'ok'    ? 'Genehmigt'
               : kind === 'fr'     ? 'Freigegeben'
               : kind === 'er'     ? 'Zurückgegeben'
               :                     'Offen';
      html += `
        <a class="b-wkcard b-wkcard--${kind}" href="wochenansicht.html"
           data-goto-kw="${wkw}" data-goto-year="${wyr}">
          <span class="b-wkcard__kw">${wkw}<small>KW</small></span>
          <span class="b-wkcard__range">${DateUtil.formatDateShort(DateUtil.toISODate(mo))} – ${DateUtil.formatDateShort(DateUtil.toISODate(su))}</span>
          <span class="b-wkcard__status"><span class="d"></span>${lbl}</span>
        </a>`;
    }
    return html;
  }

  /* Recent (Tage-Variante): für gewerbliche Azubis (berichtTyp='täglich')
     die letzten 6 Werktage rückwärts ab gestern. Sa/So und Tage vor
     Ausbildungsbeginn werden übersprungen. Status pro Tag aus
     woche.tage[i] gelesen. */
  function renderBentoRecentDays() {
    const WD_SHORT = ['SO','MO','DI','MI','DO','FR','SA'];
    const M_SHORT  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    let html = '';
    let count = 0;
    const d = new Date(today);
    d.setDate(d.getDate() - 1); // aktuellen Tag überspringen
    let safety = 30;
    while (count < 6 && safety-- > 0) {
      const wd = d.getDay();
      if (wd >= 1 && wd <= 5) {
        const iso = DateUtil.toISODate(d);
        if (user.ausbildungsBeginn && iso < user.ausbildungsBeginn) break;
        const wkw = DateUtil.getKW(d), wyr = DateUtil.getKWYear(d);
        const woche = lookupWoche(wkw, wyr);
        const tag = woche ? (woche.tage || []).find(t => t.datum === iso) : null;
        const hatInhalt = tag && (tag.stunden > 0 || tag.eintrag || tag.betriebEintrag || tag.schuleEintrag || tag.unterweisungEintrag);

        let kind = 'leer';
        let lbl  = 'Leer';
        if (hatInhalt) {
          if (woche.status === 'genehmigt')        { kind = 'ok';    lbl = 'Genehmigt'; }
          else if (woche.status === 'freigegeben') { kind = 'fr';    lbl = 'Freigegeben'; }
          else if (woche.status === 'abgelehnt')   { kind = 'er';    lbl = 'Zurückgegeben'; }
          else                                      { kind = 'draft'; lbl = 'Entwurf'; }
        }

        html += `
          <a class="b-daycard b-daycard--${kind}" href="wochenansicht.html"
             data-goto-kw="${wkw}" data-goto-year="${wyr}">
            <span class="b-daycard__wd">${WD_SHORT[wd]}</span>
            <span class="b-daycard__num">${d.getDate()}.</span>
            <span class="b-daycard__mon">${M_SHORT[d.getMonth()]}</span>
            <span class="b-daycard__status"><span class="d"></span>${lbl}</span>
          </a>`;
        count++;
      }
      d.setDate(d.getDate() - 1);
    }
    return html;
  }

  const renderBentoRecent = berichtTyp === 'täglich'
    ? renderBentoRecentDays
    : renderBentoRecentWeeks;

  /* Ausbildung: Monate vergangen / Gesamt, plus Lehrjahr-Index. */
  let monatsVergangen = 0, monatsTotal = 0, lehrjahr = 1, donutPct = 0;
  if (hasProgress) {
    const beg = new Date(user.ausbildungsBeginn);
    const end = new Date(user.ausbildungsEnde);
    const jetzt = new Date();
    const monthsBetween = (a, b) =>
      (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    monatsTotal     = monthsBetween(beg, end);
    monatsVergangen = Math.max(0, Math.min(monatsTotal, monthsBetween(beg, jetzt)));
    lehrjahr = Math.min(3, Math.max(1, Math.floor(monatsVergangen / 12) + 1));
    donutPct = monatsTotal > 0 ? Math.round((monatsVergangen / monatsTotal) * 100) : 0;
  }
  // SVG-Ring: Kreisumfang bei r=76 → 2π·76 ≈ 477.5. Offset proportional.
  const ringCirc = 2 * Math.PI * 76;
  const ringOffset = ringCirc * (1 - donutPct / 100);

  /* Lehrjahr-Segmente: vorherige sind "done", laufendes ist "now" mit
     Prozent-Wert (innerhalb des Lehrjahrs). */
  const segPctInYear = monatsVergangen % 12 === 0 && lehrjahr > 1
    ? 100 : Math.min(100, Math.round(((monatsVergangen % 12) / 12) * 100));

  /* Stats-Sparkline: 12 jüngste Wochen, Höhe pseudo-zufällig moduliert
     für visuelle Variation. Echtdaten haben keine "Tagesstunden-Höhe"
     (siehe Memory), Höhe steht hier symbolisch für "Aktivität". */
  function bentoSparkSpans() {
    let out = '';
    for (let i = 11; i >= 0; i--) {
      const mo = new Date(monday); mo.setDate(monday.getDate() - i * 7);
      if (user.ausbildungsBeginn && DateUtil.toISODate(mo) < user.ausbildungsBeginn) {
        out += `<span style="height:18%;opacity:.3"></span>`; continue;
      }
      const wkw = DateUtil.getKW(mo), wyr = DateUtil.getKWYear(mo);
      const rec = lookupWoche(wkw, wyr);
      const kind = wkcardKind(rec);
      // Höhe leicht variieren damit's nicht wie ein Balken aussieht
      const h = 40 + ((wkw * 17 + wyr) % 50);
      out += `<span class="${kind}" style="height:${h}%${kind === 'draft' ? ';opacity:.55' : ''}"></span>`;
    }
    return out;
  }

  /* Streak: zähle vergangene zusammenhängende genehmigte/freigegebene Wochen
     rückwärts ab der aktuellen (ohne die aktuelle selbst). */
  let streak = 0;
  for (let i = 1; i <= 26; i++) {
    const mo = new Date(monday); mo.setDate(monday.getDate() - i * 7);
    if (user.ausbildungsBeginn && DateUtil.toISODate(mo) < user.ausbildungsBeginn) break;
    const wkw = DateUtil.getKW(mo), wyr = DateUtil.getKWYear(mo);
    const rec = lookupWoche(wkw, wyr);
    if (!rec) break;
    if (rec.status === 'genehmigt' || rec.status === 'freigegeben') streak++;
    else break;
  }

  /* Stats-Aggregat: Genehmigt-Quote. */
  const genehmigtCount = alleWochen.filter(w => w.status === 'genehmigt').length;
  const wochenMitInhalt = alleWochen.length;
  const quote = wochenMitInhalt > 0 ? Math.round((genehmigtCount / wochenMitInhalt) * 100) : 0;

  const weekdayLong = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][today.getDay()];
  const weekdayShort = ['SO','MO','DI','MI','DO','FR','SA'][today.getDay()];

  /* Eyecatcher = kleines Label (Eyebrow) + große Zahl, spiegelt den Berichtstyp:
     - gewerblich (täglich) → Wochentag-Kürzel + Tagesnummer, z. B. "DI" / "29"
     - kaufmännisch (wöchentlich) → "KW" + Kalenderwoche, z. B. "KW" / "23" */
  const heroEyebrow = berichtTyp === 'täglich' ? weekdayShort.toUpperCase() : 'KW';
  const heroNum = berichtTyp === 'täglich'
    ? String(today.getDate()).padStart(2, '0')
    : String(kw).padStart(2, '0');

  main.innerHTML = `
    <section class="welcome-hero">
      <div class="welcome-hero__body">
        <h1 class="welcome-hero__name">Hallo, ${user.name.split(' ')[0]}</h1>
        <p class="welcome-hero__sub">${weekdayLong}, ${today.getDate()}. ${DateUtil.MONTHS[today.getMonth()]}</p>
      </div>
      <div class="welcome-hero__kw" aria-hidden="true">
        <span class="welcome-hero__kw-eye">${heroEyebrow}</span>
        <span class="welcome-hero__kw-num">${heroNum}</span>
      </div>
    </section>

    <div class="bento">

      <!-- HERO: Aktuelle Woche -->
      <section class="b-tile b-tile--glass b-hero animate-fade-in">
        <div class="b-hero__top">
          <div class="b-hero__eyebrow">
            <span class="b-live"></span>
            ${['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][today.getDay()]}, ${today.getDate()}. ${DateUtil.MONTHS[today.getMonth()]}
          </div>
          <span class="b-status b-status--${bentoStatusClass(aktStatus)}">
            <span class="dot"></span>${bentoStatusLabel(aktStatus)}
          </span>
        </div>
        <div class="b-hero__middle">
          <h1 class="b-hero__kw">
            <small>Aktuelle Woche</small>
            KW ${kw}
          </h1>
          <div class="b-weekmini">${renderBentoWeekmini()}</div>
        </div>
        <div class="b-hero__bottom">
          <a class="b-btn-primary" href="wochenansicht.html"
             data-goto-kw="${kw}" data-goto-year="${kwYear}">
            Bericht öffnen
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
          <button type="button" class="b-btn-ghost">Aus KW ${kw - 1 || 52} vorbefüllen</button>
        </div>
      </section>

      <!-- AUSBILDUNG: Dark Tile mit SVG-Donut -->
      ${hasProgress ? `
      <section class="b-tile b-tile--dark b-azubi animate-fade-in">
        <div class="b-azubi__head">
          <span class="eyebrow">Ausbildung</span>
          <span class="b-azubi__lj">Lehrjahr ${lehrjahr} / 3</span>
        </div>
        <div class="b-donut">
          <svg viewBox="0 0 180 180" aria-hidden="true">
            <circle cx="90" cy="90" r="76" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="14"/>
            <circle cx="90" cy="90" r="76" fill="none" stroke="url(#bentoRingGrad)" stroke-width="14"
                    stroke-linecap="round" stroke-dasharray="${ringCirc.toFixed(1)}" stroke-dashoffset="${ringOffset.toFixed(1)}"/>
            <defs>
              <linearGradient id="bentoRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFE780"/>
                <stop offset="100%" stop-color="#FFC300"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="b-donut__center">
            <div class="b-donut__pct">${monatsVergangen}<small>/${monatsTotal}</small></div>
            <div class="b-donut__label">Monate · LJ ${lehrjahr}</div>
          </div>
        </div>
        <div class="b-azubi__foot">
          <strong>${user.beruf || 'Ausbildung'}</strong>
          <span class="muted">${monatsTotal - monatsVergangen} Monate offen · bis ${DateUtil.formatDate(user.ausbildungsEnde)}</span>
          <div class="b-azubi__segs">
            <span class="${lehrjahr > 1 ? 'done' : (lehrjahr === 1 ? 'now' : '')}"
                  style="--seg-pct:${lehrjahr === 1 ? segPctInYear : 100}%"></span>
            <span class="${lehrjahr > 2 ? 'done' : (lehrjahr === 2 ? 'now' : '')}"
                  style="--seg-pct:${lehrjahr === 2 ? segPctInYear : (lehrjahr > 2 ? 100 : 0)}%"></span>
            <span class="${lehrjahr > 3 ? 'done' : (lehrjahr === 3 ? 'now' : '')}"
                  style="--seg-pct:${lehrjahr === 3 ? segPctInYear : (lehrjahr > 3 ? 100 : 0)}%"></span>
          </div>
        </div>
      </section>` : `
      <section class="b-tile b-tile--dark b-azubi animate-fade-in">
        <div class="b-azubi__head">
          <span class="eyebrow">Ausbildung</span>
        </div>
        <div class="b-azubi__foot">
          <strong>${user.beruf || 'Ausbildung'}</strong>
          <span class="muted">Kein Ausbildungszeitraum hinterlegt</span>
        </div>
      </section>`}

      <!-- RECENT: Wochen-Cards -->
      <section class="b-tile b-tile--glass b-recent animate-fade-in">
        <div class="b-recent__head">
          <div>
            <h3>Zuletzt</h3>
            <span class="sub">${berichtTyp === 'täglich' ? 'letzte 6 Werktage' : 'letzte 6 Wochen'}</span>
          </div>
          <a href="jahresansicht.html">Alle ${alleWochen.length} ${berichtTyp === 'täglich' ? 'Berichtswochen' : 'Wochen'} →</a>
        </div>
        <div class="b-recent__grid b-recent__grid--${berichtTyp === 'täglich' ? 'days' : 'weeks'}">${renderBentoRecent()}</div>
      </section>

    </div>
  `;

  // Sprung-Navigation: jede Kachel/Zeile mit data-goto-kw merkt sich die
  // Ziel-Woche; <a> navigiert per href, andere Elemente per JS.
  main.querySelectorAll('[data-goto-kw]').forEach(el => {
    el.addEventListener('click', () => {
      sessionStorage.setItem('gotoKW', el.dataset.gotoKw);
      sessionStorage.setItem('gotoYear', el.dataset.gotoYear);
      if (el.tagName !== 'A') window.location.href = 'wochenansicht.html';
    });
  });

  // Fortschritts-Ring von 0 % hochfüllen. Start-Leerzustand (dashoffset =
  // Umfang) kommt aus dem CSS, hier wird nur auf den Zielwert animiert.
  setTimeout(() => {
    document.querySelectorAll('.dash-ring__fill').forEach(c => {
      const pct = parseFloat(c.dataset.pct) || 0;
      c.style.strokeDashoffset = (2 * Math.PI * 52) * (1 - pct / 100);
    });
  }, 120);
}

/* ── Primärer CTA: Azubi-Sicht ────────────────────────────────
   Bestimmt den „Was muss ich jetzt tun?"-Block basierend auf dem
   Status der aktuellen und vergangener Wochen. Priorität:
     1) Zurückgegebene Wochen (abgelehnt) → URGENT
     2) Aktuelle Woche offen / leer       → ACTION
     3) Aktuelle Woche freigegeben        → WAITING (info)
     4) Aktuelle Woche genehmigt          → DONE
*/
function renderAzubiPrimaryCta(user, aktuelleWoche, alleWochen, kw, kwYear) {
  const abgelehnt = alleWochen.filter(w => w.status === 'abgelehnt');

  // Priorität 1: Zurückgegebene Wochen
  if (abgelehnt.length > 0) {
    // Älteste zurückgegebene Woche zuerst öffnen
    const aelteste = abgelehnt
      .slice()
      .sort((a, b) => (a.year - b.year) || (a.kw - b.kw))[0];
    const count = abgelehnt.length;
    const title = count === 1
      ? `KW ${aelteste.kw} überarbeiten`
      : `${count} Wochen überarbeiten`;
    const sub = count === 1
      ? 'Eine Woche wurde zur Korrektur zurückgegeben. Kommentar des Ausbilders prüfen.'
      : `${count} Wochen wurden zur Korrektur zurückgegeben – jetzt überarbeiten.`;
    return ctaTemplate({
      variant: 'urgent',
      eyebrow: 'Handlung erforderlich',
      title,
      sub,
      icon: iconAlert(),
      gotoKW: aelteste.kw,
      gotoYear: aelteste.year,
    });
  }

  // Status der aktuellen Woche bestimmen
  const aktStatus = aktuelleWoche ? aktuelleWoche.status : 'offen';
  const tageCount = aktuelleWoche && Array.isArray(aktuelleWoche.tage)
    ? aktuelleWoche.tage.filter(t => t.anwesenheit || t.stunden).length
    : 0;

  // Priorität 4: Genehmigt → DONE
  if (aktStatus === 'genehmigt') {
    return ctaTemplate({
      variant: 'done',
      eyebrow: 'Alles erledigt',
      title: `KW ${kw} ist abgeschlossen`,
      sub: 'Diese Woche wurde genehmigt. Sehr gut – weiter so!',
      icon: iconCheck(),
    });
  }

  // Priorität 3: Freigegeben → WAITING
  if (aktStatus === 'freigegeben') {
    return ctaTemplate({
      variant: 'waiting',
      eyebrow: 'Wartet auf Prüfung',
      title: `KW ${kw} freigegeben`,
      sub: 'Dein Eintrag liegt zur Prüfung bei deinem Ausbilder. Du wirst informiert.',
      icon: iconHourglass(),
      gotoKW: kw,
      gotoYear: kwYear,
    });
  }

  // Priorität 2: Offen / leer → ACTION
  const restTage = restlicheArbeitstage(kw, kwYear);
  let sub;
  if (tageCount === 0) {
    sub = restTage > 0
      ? `Noch keine Einträge in dieser Woche. ${restTage} ${restTage === 1 ? 'Werktag verbleibt' : 'Werktage verbleiben'}.`
      : 'Noch keine Einträge in dieser Woche – jetzt nachtragen.';
  } else {
    sub = `${tageCount} von 5 Werktagen erfasst. Jetzt die fehlenden Tage ergänzen und freigeben.`;
  }
  return ctaTemplate({
    variant: 'action',
    eyebrow: 'Nächster Schritt',
    title: `KW ${kw} jetzt eintragen`,
    sub,
    icon: iconPen(),
    gotoKW: kw,
    gotoYear: kwYear,
  });
}

/* ── Primärer CTA: Ausbilder-Sicht ──────────────────────────── */
function renderAusbilderPrimaryCta(queue, azubiCount) {
  if (queue.length === 0) {
    return ctaTemplate({
      variant: 'done',
      eyebrow: 'Posteingang leer',
      title: 'Alles geprüft',
      sub: azubiCount === 1
        ? 'Für deinen Azubi liegen aktuell keine Berichte zur Abnahme vor.'
        : `Für deine ${azubiCount} Azubis liegen aktuell keine Berichte zur Abnahme vor.`,
      icon: iconCheck(),
    });
  }

  // Ältester wartender Bericht
  const aelteste = queue[0];
  const monday = DateUtil.getMondayOfKW(aelteste.kw, aelteste.year);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const today = new Date();
  const wochenSeitEnde = Math.max(0, Math.floor((today - sunday) / (1000 * 60 * 60 * 24 * 7)));

  let warteText;
  if (wochenSeitEnde === 0)      warteText = 'Ältester Bericht wurde diese Woche freigegeben.';
  else if (wochenSeitEnde === 1) warteText = 'Ältester Bericht wartet seit 1 Woche.';
  else                           warteText = `Ältester Bericht wartet seit ${wochenSeitEnde} Wochen.`;

  const variant = wochenSeitEnde >= 2 ? 'urgent' : 'action';
  const title = queue.length === 1
    ? `1 Bericht zur Abnahme prüfen`
    : `${queue.length} Berichte zur Abnahme prüfen`;

  return ctaTemplate({
    variant,
    eyebrow: 'Posteingang',
    title,
    sub: warteText + ' Klicken, um den ältesten zuerst zu öffnen.',
    icon: variant === 'urgent' ? iconAlert() : iconInbox(),
    gotoAzubiId: aelteste.azubi.id,
    gotoKW: aelteste.kw,
    gotoYear: aelteste.year,
  });
}

/* CTA-Markup-Builder. Variants ohne goto* sind nicht klickbar. */
function ctaTemplate({ variant, eyebrow, title, sub, icon, gotoKW, gotoYear, gotoAzubiId }) {
  const clickable = (variant === 'action' || variant === 'urgent' || variant === 'waiting')
                    && (gotoKW || gotoAzubiId);
  const tag = clickable ? 'a' : 'div';
  const attrs = clickable
    ? `class="primary-cta primary-cta--${variant}" href="wochenansicht.html"`
      + ` data-cta-goto="1"`
      + (gotoKW      ? ` data-goto-kw="${gotoKW}"`           : '')
      + (gotoYear    ? ` data-goto-year="${gotoYear}"`       : '')
      + (gotoAzubiId ? ` data-goto-azubi="${gotoAzubiId}"`   : '')
    : `class="primary-cta primary-cta--${variant}" role="status"`;

  const arrow = clickable
    ? `<div class="primary-cta__arrow" aria-hidden="true">
         <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
           <line x1="5" y1="12" x2="19" y2="12"/>
           <polyline points="12 5 19 12 12 19"/>
         </svg>
       </div>`
    : '';

  return `
    <${tag} ${attrs}>
      <div class="primary-cta__icon" aria-hidden="true">${icon}</div>
      <div class="primary-cta__body">
        <div class="primary-cta__eyebrow">${eyebrow}</div>
        <div class="primary-cta__title">${title}</div>
        <div class="primary-cta__sub">${sub}</div>
      </div>
      ${arrow}
    </${tag}>
  `;
}

/* Klick auf CTA → vor Navigation Goto-Werte in sessionStorage spiegeln,
   damit die Wochenansicht direkt die richtige Woche / den richtigen
   Azubi öffnet. */
function bindPrimaryCtaNav() {
  const el = document.querySelector('.primary-cta[data-cta-goto]');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const kw      = el.dataset.gotoKw;
    const year    = el.dataset.gotoYear;
    const azubiId = el.dataset.gotoAzubi;
    if (kw)      sessionStorage.setItem('gotoKW', kw);
    if (year)    sessionStorage.setItem('gotoYear', year);
    if (azubiId) sessionStorage.setItem('gotoAzubiId', azubiId);
    // <a href="wochenansicht.html"> übernimmt die Navigation
  });
}

/* Wie viele Werktage (Mo–Fr) der aktuellen KW liegen heute noch in
   der Zukunft (heute eingeschlossen)? */
function restlicheArbeitstage(kw, year) {
  const monday = DateUtil.getMondayOfKW(kw, year);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let rest = 0;
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (d >= today) rest++;
  }
  return rest;
}

/* ── Inline-SVG-Icons für den CTA ─────────────────────────── */
function iconPen() {
  return Icon('edit');
}
function iconAlert() {
  return Icon('warning');
}
function iconCheck() {
  return Icon('success');
}
function iconHourglass() {
  return Icon('hourglass');
}
function iconInbox() {
  return Icon('inbox');
}

/* ── Ausbilder-Cockpit ────────────────────────────────────────── */
async function renderAusbilderDashboard(user) {
  const today = new Date();
  const kw = DateUtil.getKW(today);
  const kwYear = DateUtil.getKWYear(today);

  const meineAzubis = await getMeineAzubis(user);

  // Alle Wochen aller zugewiesenen Azubis
  const allWochen = [];
  for (const a of meineAzubis) {
    const wochen = await DB.getWochenFuerAzubi(a.id);
    wochen.forEach(w => {
      allWochen.push({ ...w, azubi: a });
    });
  }

  // Posteingang: zur Abnahme freigegeben (älteste zuerst)
  const queue = allWochen
    .filter(w => w.status === 'freigegeben')
    .sort((a, b) => (a.year - b.year) || (a.kw - b.kw));

  const zurueckgegeben = allWochen.filter(w => w.status === 'abgelehnt').length;
  const genehmigtDieseWoche = allWochen.filter(w =>
    w.status === 'genehmigt' && w.year === kwYear && w.kw === kw
  ).length;

  // Pro-Azubi-Stats für die rechte Liste
  const azubiStatsRaw = await Promise.all(meineAzubis.map(async a => {
    const wochen = await DB.getWochenFuerAzubi(a.id);
    return {
      azubi: a,
      zuPruefen: wochen.filter(w => w.status === 'freigegeben').length,
      offen:     wochen.filter(w => w.status === 'offen').length,
      abgelehnt: wochen.filter(w => w.status === 'abgelehnt').length,
      genehmigt: wochen.filter(w => w.status === 'genehmigt').length,
    };
  }));
  const azubiStats = azubiStatsRaw.sort((a, b) => b.zuPruefen - a.zuPruefen);

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="welcome-banner welcome-banner--ausbilder">
      <div class="welcome-banner__content">
        <p class="welcome-banner__greeting">${getGreeting()}, ${user.name.split(' ')[0]} 👋</p>
        <h1 class="welcome-banner__title">Ausbilder-Cockpit</h1>
        <p class="welcome-banner__info">
          ${meineAzubis.length} Auszubildende
          ${queue.length > 0 ? ` &nbsp;·&nbsp; <strong style="color:var(--pm-yellow)">${queue.length} ${queue.length === 1 ? 'Eintrag' : 'Einträge'} zur Abnahme</strong>` : ' &nbsp;·&nbsp; Keine offenen Prüfungen'}
        </p>
      </div>
      <div class="welcome-banner__kw">
        <div class="welcome-banner__kw-number">KW&nbsp;${kw}</div>
        <div class="welcome-banner__kw-label">${DateUtil.MONTHS[today.getMonth()]} ${today.getFullYear()}</div>
      </div>
    </div>

    ${renderAusbilderPrimaryCta(queue, meineAzubis.length)}

    <div class="stats-grid stats-grid--3">
      <div class="stat-card animate-fade-in" style="animation-delay:0ms">
        <div class="stat-card__icon stat-card__icon--info">
          ${Icon('users')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Aktive Azubis</div>
          <div class="stat-card__value">${meineAzubis.length}</div>
          <div class="stat-card__sub">${user.role === 'admin' ? 'im System' : 'aktuell zugewiesen'}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:60ms">
        <div class="stat-card__icon stat-card__icon--success">
          ${Icon('success')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Diese Woche genehmigt</div>
          <div class="stat-card__value">${genehmigtDieseWoche}</div>
          <div class="stat-card__sub">in KW ${kw}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:120ms">
        <div class="stat-card__icon stat-card__icon--${zurueckgegeben > 0 ? 'error' : 'success'}">
          ${Icon('refresh')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Zurückgegeben</div>
          <div class="stat-card__value">${zurueckgegeben}</div>
          <div class="stat-card__sub">${zurueckgegeben === 0 ? 'Keine Nacharbeit' : 'In Nacharbeit'}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- LINKS (Hero): Posteingang über die volle Spaltenhöhe -->
      <div class="dashboard-grid__col dashboard-grid__col--hero">
        <div class="card review-inbox animate-fade-in" id="reviewInboxCard">
          <div class="card__header review-inbox__header">
            <div>
              <span class="card__title">Posteingang – Zu prüfende Berichtshefte</span>
              <p class="review-inbox__subtitle" id="reviewInboxSubtitle">Sortiert nach Wartedauer · älteste zuerst</p>
            </div>
            ${queue.length > 0 ? `<span class="badge badge--freigegeben" id="reviewInboxCount">${queue.length} ${queue.length === 1 ? 'offen' : 'offen'}</span>` : ''}
          </div>
          ${queue.length > 0 ? renderReviewFilterBar(queue, meineAzubis) : ''}
          <div class="review-list" id="reviewList">
            ${queue.length > 0 ? queue.map((w, i) => renderReviewItem(w, i)).join('') : `
              <div class="review-empty">
                <div class="review-empty__icon">
                  ${Icon('success', { size: 32 })}
                </div>
                <h3 class="review-empty__title">Alles geprüft!</h3>
                <p class="review-empty__text">Aktuell warten keine Berichtshefte auf deine Abnahme.</p>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- RECHTS (gestapelt): Meine Azubis + Letzte Aktivitäten -->
      <div class="dashboard-grid__col">
        <div class="card animate-fade-in">
          <div class="card__header">
            <span class="card__title">Meine Azubis</span>
            ${user.role === 'admin' || user.role === 'ausbilder' ? `<a href="azubi-planer.html" class="btn btn-sm btn-ghost">Verwalten</a>` : ''}
          </div>
          <div class="azubi-overview-list">
            ${azubiStats.length > 0 ? azubiStats.map(s => renderAzubiOverviewItem(s)).join('') : `
              <div style="padding:var(--sp-6);text-align:center;color:var(--pm-grey-400);font-size:var(--text-sm)">
                Keine Azubis zugewiesen.
              </div>
            `}
          </div>
        </div>

        <div class="card animate-fade-in">
          <div class="card__header">
            <span class="card__title">Letzte Aktivitäten</span>
          </div>
          <div class="card__body" style="padding-top:0;padding-bottom:0">
            <div class="activity-feed">
              ${renderAusbilderActivities(allWochen)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Klick auf Review-Item: Direkt zur Wochenansicht des Azubis springen
  // (Checkbox-Klick wird per stopPropagation am Label aufgehalten)
  document.querySelectorAll('.review-item[data-azubi-id][data-kw]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.review-item__check')) return;
      sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
      sessionStorage.setItem('gotoKW',      item.dataset.kw);
      sessionStorage.setItem('gotoYear',    item.dataset.year);
      window.location.href = 'wochenansicht.html';
    });
  });

  // Bulk-Action-System aufsetzen
  initBulkActions(queue, user);

  // Klick auf Azubi-Übersicht-Item: Zur aktuellen KW dieses Azubis
  document.querySelectorAll('.azubi-overview-item[data-azubi-id]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
      window.location.href = 'wochenansicht.html';
    });
  });

  bindPrimaryCtaNav();
  bindReviewFilterBar(queue);
}

/* ── Filter-Bar: Suche, Status, Sortierung über der Review-Inbox ────
   Lokale Filterung (kein Netzwerk-Roundtrip), damit Ausbilder bei
   wachsender Liste schnell finden was sie brauchen. */
function renderReviewFilterBar(queue, azubis) {
  if (!queue.length) return '';
  return `
    <div class="review-filter-bar" id="reviewFilterBar">
      <div class="review-filter-bar__field review-filter-bar__field--search">
        ${Icon('search')}
        <input type="search" id="reviewSearchInput" class="review-filter-bar__search"
               placeholder="Suche: Name oder KW…"
               autocomplete="off" spellcheck="false">
        <button type="button" class="review-filter-bar__clear" id="reviewSearchClear" aria-label="Suche leeren" hidden>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <label class="review-filter-bar__field" title="Nach Wartedauer filtern">
        <span class="review-filter-bar__field-label">Wartet seit</span>
        <select class="review-filter-bar__select" id="reviewWaitFilter">
          <option value="all">Beliebig</option>
          <option value="urgent">2+ Wochen (dringend)</option>
          <option value="week1">1 Woche</option>
          <option value="fresh">Diese Woche</option>
        </select>
      </label>

      <label class="review-filter-bar__field" title="Sortier-Reihenfolge">
        <span class="review-filter-bar__field-label">Sortierung</span>
        <select class="review-filter-bar__select" id="reviewSortSelect">
          <option value="oldest">Älteste zuerst</option>
          <option value="newest">Neueste zuerst</option>
          <option value="name">Name (A → Z)</option>
        </select>
      </label>

      <label class="review-filter-bar__select-all" title="Alle sichtbaren Berichte markieren">
        <input type="checkbox" id="reviewSelectAll">
        <span class="review-filter-bar__select-all-box" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="review-filter-bar__select-all-text">Alle</span>
      </label>

      <div class="review-filter-bar__count">
        <span id="reviewFilterCount">${queue.length}</span> von ${queue.length}
      </div>
    </div>
  `;
}

function bindReviewFilterBar(queue) {
  const bar = document.getElementById('reviewFilterBar');
  if (!bar) return;
  const searchInp = document.getElementById('reviewSearchInput');
  const clearBtn  = document.getElementById('reviewSearchClear');
  const waitSel   = document.getElementById('reviewWaitFilter');
  const sortSel   = document.getElementById('reviewSortSelect');
  const list      = document.getElementById('reviewList');
  const countEl   = document.getElementById('reviewFilterCount');
  const subtitle  = document.getElementById('reviewInboxSubtitle');
  const countBadge = document.getElementById('reviewInboxCount');

  const subtitleByWait = {
    all:    'Sortiert nach Wartedauer · älteste zuerst',
    urgent: 'Nur dringende: 2+ Wochen wartend',
    week1:  'Wartet seit ca. 1 Woche',
    fresh:  'Diese Woche freigegeben',
  };
  const subtitleBySort = {
    oldest: 'Sortiert nach Wartedauer · älteste zuerst',
    newest: 'Sortiert nach Wartedauer · neueste zuerst',
    name:   'Sortiert nach Name · A → Z',
  };

  function applyFilters() {
    const q       = (searchInp?.value || '').trim().toLowerCase();
    const wait    = waitSel?.value || 'all';
    const sort    = sortSel?.value || 'oldest';
    const today   = new Date();

    let filtered = queue.slice();

    // Such-Filter
    if (q) {
      filtered = filtered.filter(w => {
        const name = (w.azubi.name || '').toLowerCase();
        const kwStr = `kw ${w.kw}`;
        return name.includes(q)
            || String(w.kw).includes(q)
            || kwStr.includes(q)
            || String(w.year).includes(q);
      });
    }

    // Wartedauer-Filter
    if (wait !== 'all') {
      filtered = filtered.filter(w => {
        const monday = DateUtil.getMondayOfKW(w.kw, w.year);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const wochenSeitEnde = Math.max(0, Math.floor((today - sunday) / (1000 * 60 * 60 * 24 * 7)));
        if (wait === 'urgent') return wochenSeitEnde >= 2;
        if (wait === 'week1')  return wochenSeitEnde === 1;
        if (wait === 'fresh')  return wochenSeitEnde === 0;
        return true;
      });
    }

    // Sortierung
    if (sort === 'oldest') {
      filtered.sort((a, b) => (a.year - b.year) || (a.kw - b.kw));
    } else if (sort === 'newest') {
      filtered.sort((a, b) => (b.year - a.year) || (b.kw - a.kw));
    } else if (sort === 'name') {
      filtered.sort((a, b) => a.azubi.name.localeCompare(b.azubi.name, 'de'));
    }

    // Re-Render
    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="review-empty">
          <div class="review-empty__icon" style="background:var(--pm-grey-100);color:var(--pm-grey-500)">
            ${Icon('search', { size: 32 })}
          </div>
          <h3 class="review-empty__title">Keine Treffer</h3>
          <p class="review-empty__text">Mit den aktuellen Filtern wurde nichts gefunden. Filter zurücksetzen, um alle ${queue.length} Einträge zu zeigen.</p>
        </div>
      `;
    } else {
      list.innerHTML = filtered.map((w, i) => renderReviewItem(w, i)).join('');
      // Klick-Handler neu binden – Items wurden neu gerendert
      list.querySelectorAll('.review-item[data-azubi-id][data-kw]').forEach(item => {
        item.addEventListener('click', () => {
          sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
          sessionStorage.setItem('gotoKW',      item.dataset.kw);
          sessionStorage.setItem('gotoYear',    item.dataset.year);
          window.location.href = 'wochenansicht.html';
        });
      });
    }

    // Zähler + Untertitel aktualisieren
    if (countEl) countEl.textContent = filtered.length;
    if (countBadge) {
      // Solange kein Filter aktiv ist, lieber "X offen" zeigen statt "X von X"
      countBadge.textContent = (filtered.length === queue.length)
        ? `${queue.length} offen`
        : `${filtered.length} von ${queue.length}`;
    }
    if (subtitle) {
      // Untertitel-Logik: Filter dominiert, sonst Sortierung
      subtitle.textContent = wait !== 'all'
        ? subtitleByWait[wait]
        : subtitleBySort[sort];
    }
    if (clearBtn) clearBtn.hidden = !q;
  }

  // Debounce für Suche
  let searchTimer;
  searchInp?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 120);
  });
  clearBtn?.addEventListener('click', () => {
    if (searchInp) searchInp.value = '';
    applyFilters();
    searchInp?.focus();
  });
  waitSel?.addEventListener('change', applyFilters);
  sortSel?.addEventListener('change', applyFilters);
}

/* ── Hilfsfunktionen für Ausbilder-Dashboard ──────────────────── */
async function getMeineAzubis(user) {
  if (user.role === 'admin') return await DB.getAzubis();

  const heute = new Date().toISOString().split('T')[0];
  const meineZuw = (await DB.getZuweisungenFuerAusbilder(user.id))
    .filter(z => z.von <= heute && z.bis >= heute);
  const azubiIds = [...new Set(meineZuw.map(z => z.azubiId))];
  const users = await Promise.all(azubiIds.map(id => DB.getUser(id)));
  return users.filter(Boolean);
}

function renderReviewItem(w, idx) {
  const a = w.azubi;
  const monday = DateUtil.getMondayOfKW(w.kw, w.year);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const startStr = DateUtil.formatDateShort(DateUtil.toISODate(monday));
  const endStr   = DateUtil.formatDateShort(DateUtil.toISODate(sunday));
  const tageStunden = (w.tage || []).reduce((s, t) => s + (t.stunden || 0), 0);
  const stunden = tageStunden > 0 ? tageStunden : (w.gesamtstunden || 0);
  const stundenStr = `${Math.floor(stunden)}:${String(Math.round((stunden % 1) * 60)).padStart(2, '0')}`;

  // Wartedauer berechnen (Endwoche-basiert)
  const today = new Date();
  const wochenSeitEnde = Math.max(0, Math.floor((today - sunday) / (1000 * 60 * 60 * 24 * 7)));
  const wartetSeit = wochenSeitEnde === 0 ? 'Diese Woche freigegeben'
                   : wochenSeitEnde === 1 ? 'Wartet seit 1 Woche'
                   : `Wartet seit ${wochenSeitEnde} Wochen`;
  const wartendKlasse = wochenSeitEnde >= 2 ? ' review-item--urgent' : '';

  return `
    <div class="review-item${wartendKlasse}"
         data-woche-id="${w.id}" data-azubi-id="${a.id}" data-kw="${w.kw}" data-year="${w.year}"
         style="animation-delay:${idx * 50}ms"
         tabindex="0" role="button"
         aria-label="Berichtsheft KW ${w.kw} von ${a.name} prüfen">
      <label class="review-item__check" aria-label="Auswählen" onclick="event.stopPropagation()">
        <input type="checkbox" class="review-item__checkbox" data-woche-id="${w.id}">
        <span class="review-item__check-box" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      </label>
      <div class="review-item__avatar avatar">${a.initials}</div>
      <div class="review-item__main">
        <div class="review-item__name">${a.name}</div>
        <div class="review-item__meta">
          <span class="review-item__kw">KW ${w.kw}/${w.year}</span>
          <span class="review-item__sep">·</span>
          <span>${startStr} – ${endStr}</span>
          <span class="review-item__sep">·</span>
          <span class="review-item__hours">${stundenStr} Std.</span>
        </div>
        <div class="review-item__waiting">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${wartetSeit}
        </div>
      </div>
      <div class="review-item__action">
        <span class="review-item__btn">
          Prüfen
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </div>
    </div>
  `;
}

function renderAzubiOverviewItem(s) {
  const a = s.azubi;
  return `
    <div class="azubi-overview-item" data-azubi-id="${a.id}" tabindex="0" role="button">
      <div class="avatar avatar--lg">${a.initials}</div>
      <div class="azubi-overview-item__info">
        <div class="azubi-overview-item__name">${a.name}</div>
        <div class="azubi-overview-item__role">${a.beruf || '–'}</div>
        <div class="azubi-overview-item__badges">
          ${s.zuPruefen > 0
            ? `<span class="badge badge--freigegeben">${s.zuPruefen} zu prüfen</span>`
            : `<span class="badge badge--genehmigt">Aktuell</span>`}
          ${s.abgelehnt > 0 ? `<span class="badge badge--abgelehnt">${s.abgelehnt} zurück</span>` : ''}
        </div>
      </div>
      <div class="azubi-overview-item__chevron">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>
  `;
}

/* ── Bulk-Actions in der Review-Inbox ────────────────────────────
   Checkbox-Pattern mit sticky Action-Toolbar – Genehmigung oder
   Rückgabe mehrerer Berichte in einem Schritt. Auswahl überlebt
   Re-Renders durch den Filter (MutationObserver synchronisiert
   neu eingehängte Items mit dem Selection-Set). */
function initBulkActions(queue, currentUser) {
  if (!queue || queue.length === 0) return;
  const list = document.getElementById('reviewList');
  if (!list) return;
  const selectedIds = new Set();
  const queueById = new Map(queue.map(w => [w.id, w]));
  const toolbar = ensureBulkToolbar();
  const selectAll = document.getElementById('reviewSelectAll');

  function syncCheckboxesToState() {
    list.querySelectorAll('.review-item__checkbox').forEach(cb => {
      const id = parseInt(cb.dataset.wocheId);
      const sel = selectedIds.has(id);
      cb.checked = sel;
      cb.closest('.review-item')?.classList.toggle('review-item--selected', sel);
    });
    updateToolbar();
    updateSelectAllState();
  }

  function updateToolbar() {
    const count = selectedIds.size;
    toolbar.querySelector('[data-bulk-count]').textContent = count;
    toolbar.classList.toggle('bulk-actions-toolbar--visible', count > 0);
    toolbar.querySelector('[data-bulk-label]').textContent =
      count === 1 ? 'Bericht ausgewählt' : 'Berichte ausgewählt';
  }

  function updateSelectAllState() {
    if (!selectAll) return;
    const visibleCbs = Array.from(list.querySelectorAll('.review-item__checkbox'));
    if (visibleCbs.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }
    const visibleSelected = visibleCbs.filter(cb => selectedIds.has(+cb.dataset.wocheId)).length;
    selectAll.checked       = visibleSelected === visibleCbs.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleCbs.length;
  }

  // Klick auf einzelne Checkbox
  list.addEventListener('change', (e) => {
    const cb = e.target.closest('.review-item__checkbox');
    if (!cb) return;
    const id = parseInt(cb.dataset.wocheId);
    if (cb.checked) selectedIds.add(id);
    else            selectedIds.delete(id);
    cb.closest('.review-item')?.classList.toggle('review-item--selected', cb.checked);
    updateToolbar();
    updateSelectAllState();
  });

  // "Alle" – nur sichtbare Items
  selectAll?.addEventListener('change', () => {
    const visibleCbs = list.querySelectorAll('.review-item__checkbox');
    visibleCbs.forEach(cb => {
      const id = parseInt(cb.dataset.wocheId);
      if (selectAll.checked) selectedIds.add(id);
      else                   selectedIds.delete(id);
    });
    syncCheckboxesToState();
  });

  // Re-Sync nach Filter-Re-Render
  new MutationObserver(syncCheckboxesToState)
    .observe(list, { childList: true });

  // Auswahl aufheben
  toolbar.querySelector('[data-bulk-clear]').addEventListener('click', () => {
    selectedIds.clear();
    syncCheckboxesToState();
  });

  // Bulk-Genehmigen
  toolbar.querySelector('[data-bulk-approve]').addEventListener('click', async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} Berichtshefte gemeinsam genehmigen?`)) return;
    for (const wocheId of ids) {
      const w = queueById.get(wocheId);
      await DB.setWocheStatus(wocheId, 'genehmigt');
      if (w) await DB.addBenachrichtigung({
        userId: w.azubiId, type: 'genehmigt',
        wocheId, azubiId: w.azubiId, kw: w.kw, year: w.year,
        fromUserId: currentUser.id,
      });
    }
    Toast.success('Genehmigt', `${ids.length} ${ids.length === 1 ? 'Bericht' : 'Berichte'} genehmigt.`);
    setTimeout(() => window.location.reload(), 700);
  });

  // Bulk-Zurückgeben (mit einer gemeinsamen Begründung)
  toolbar.querySelector('[data-bulk-reject]').addEventListener('click', async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const reason = prompt(`Begründung für die Rückgabe von ${ids.length} ${ids.length === 1 ? 'Bericht' : 'Berichten'}:`);
    if (!reason || !reason.trim()) return;
    const reasonTrim = reason.trim();
    for (const wocheId of ids) {
      const w = queueById.get(wocheId);
      await DB.addKommentar(wocheId, {
        userId: currentUser.id, text: reasonTrim,
        datum: new Date().toLocaleDateString('de-DE'), typ: 'abgelehnt',
      });
      await DB.setWocheStatus(wocheId, 'abgelehnt');
      if (w) await DB.addBenachrichtigung({
        userId: w.azubiId, type: 'abgelehnt',
        wocheId, azubiId: w.azubiId, kw: w.kw, year: w.year,
        fromUserId: currentUser.id, kommentar: reasonTrim,
      });
    }
    Toast.warning('Zurückgegeben', `${ids.length} ${ids.length === 1 ? 'Bericht' : 'Berichte'} zurückgegeben.`);
    setTimeout(() => window.location.reload(), 700);
  });
}

function ensureBulkToolbar() {
  let toolbar = document.getElementById('bulkActionsToolbar');
  if (toolbar) return toolbar;
  toolbar = document.createElement('div');
  toolbar.id = 'bulkActionsToolbar';
  toolbar.className = 'bulk-actions-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Bulk-Aktionen für ausgewählte Berichte');
  toolbar.innerHTML = `
    <div class="bulk-actions-toolbar__info">
      <span class="bulk-actions-toolbar__count-pill"><span data-bulk-count>0</span></span>
      <span data-bulk-label>Berichte ausgewählt</span>
    </div>
    <div class="bulk-actions-toolbar__actions">
      <button type="button" class="btn btn-ghost btn-sm" data-bulk-clear>Auswahl aufheben</button>
      <button type="button" class="btn btn-danger btn-sm" data-bulk-reject>Zurückgeben</button>
      <button type="button" class="btn btn-success btn-sm" data-bulk-approve>Genehmigen</button>
    </div>
  `;
  document.body.appendChild(toolbar);
  return toolbar;
}

function renderAusbilderActivities(allWochen) {
  // Sortiere: kürzlich aktive Wochen zuerst (höchste KW/Year)
  const sorted = allWochen
    .filter(w => w.status !== 'offen')
    .sort((a, b) => (b.year - a.year) || (b.kw - a.kw))
    .slice(0, 8);

  if (!sorted.length) {
    return '<div class="empty-state" style="padding:var(--sp-8)"><p class="empty-state__text">Noch keine Aktivitäten.</p></div>';
  }

  return sorted.map((w, i) => {
    let type, text;
    const azubiName = w.azubi.name;
    if (w.status === 'genehmigt') {
      type = 'success';
      text = `<strong>${azubiName}</strong>: KW ${w.kw} genehmigt`;
    } else if (w.status === 'freigegeben') {
      type = 'info';
      text = `<strong>${azubiName}</strong>: KW ${w.kw} freigegeben`;
    } else if (w.status === 'abgelehnt') {
      type = 'error';
      text = `<strong>${azubiName}</strong>: KW ${w.kw} zurückgegeben`;
    } else {
      type = 'default';
      text = `<strong>${azubiName}</strong>: KW ${w.kw}`;
    }

    return `
      <div class="activity-item" style="animation-delay:${i * 40}ms">
        <div class="activity-item__dot activity-item__dot--${type === 'default' ? 'yellow' : type}"></div>
        <div class="activity-item__content">
          <div class="activity-item__text">${text}</div>
          <div class="activity-item__time">KW ${w.kw}/${w.year}</div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Hilfsfunktionen für Azubi-Dashboard (bestehend) ──────────── */
function renderWeekStatusDays(woche, kw, year) {
  const monday = DateUtil.getMondayOfKW(kw, year);
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const maxH = 9;
  let html = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = DateUtil.toISODate(d);
    const isWE = i >= 5;
    const isToday = DateUtil.isToday(dateStr);

    let stunden = 0;
    let anwesenheit = '';
    if (woche && woche.tage) {
      const tag = woche.tage.find(t => t.datum === dateStr);
      if (tag) { stunden = tag.stunden || 0; anwesenheit = tag.anwesenheit; }
    }

    const pct = Math.min((stunden / maxH) * 100, 100);
    const isFull = stunden >= maxH;
    const hoursStr = stunden
      ? stunden + ':00'
      : (isWE ? '–' : (anwesenheit && anwesenheit !== 'anwesend' ? '–' : '0:00'));

    html += `
      <div class="week-status-day${isWE ? ' week-status-day--weekend' : ''}${isToday ? ' week-status-day--today' : ''}">
        <span class="week-status-day__name">${days[i]}</span>
        <span class="week-status-day__date">${d.getDate()}</span>
        <div class="week-status-day__bar" aria-hidden="true">
          <div class="week-status-day__bar-fill${isFull ? ' week-status-day__bar-fill--full' : ''}" style="height:${pct}%"></div>
        </div>
        <span class="week-status-day__hours">${hoursStr}</span>
      </div>
    `;
  }
  return html;
}

function renderAzubiActivities(wochen) {
  const activities = [];
  wochen.slice().reverse().forEach(w => {
    if (w.status === 'genehmigt') {
      activities.push({ type: 'success', text: `<strong>KW ${w.kw}/${w.year}</strong> wurde genehmigt`, time: '–' });
    } else if (w.status === 'freigegeben') {
      activities.push({ type: 'info', text: `<strong>KW ${w.kw}/${w.year}</strong> zur Abnahme freigegeben`, time: '–' });
    } else if (w.status === 'abgelehnt') {
      activities.push({ type: 'error', text: `<strong>KW ${w.kw}/${w.year}</strong> wurde zurückgegeben`, time: '–' });
    } else {
      activities.push({ type: 'default', text: `<strong>KW ${w.kw}/${w.year}</strong> – Eintrag offen`, time: '–' });
    }
  });

  if (activities.length === 0) {
    return '<div class="empty-state" style="padding:var(--sp-8)"><p class="empty-state__text">Noch keine Aktivitäten vorhanden.</p></div>';
  }

  return activities.slice(0, 8).map((a, i) => `
    <div class="activity-item" style="animation-delay:${i * 40}ms">
      <div class="activity-item__dot activity-item__dot--${a.type === 'default' ? 'yellow' : a.type}"></div>
      <div class="activity-item__content">
        <div class="activity-item__text">${a.text}</div>
        <div class="activity-item__time">${a.time}</div>
      </div>
    </div>
  `).join('');
}
