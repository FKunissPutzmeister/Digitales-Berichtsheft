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
    if (user.istAzubi) {
      await renderAzubiDashboard(user);
    } else if (user.istReinerPruefer) {
      await renderReinerPrueferDashboard(user);
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
          <pre class="dash-error-card__detail">${escapeHtml(err && err.stack ? err.stack : String(err))}</pre>
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
    // Unter dem SPA-Router (router.js) bleibt das dashboard.html-Dokument
    // physisch geladen, auch wenn per pushState längst zu einer anderen Seite
    // (z. B. beurteilungen.html) navigiert wurde. Kommt der Nutzer dann per
    // "Zurück" aus einer Vollseite (beurteilung.html) über den BFCache zurück,
    // feuert dieser pageshow-Handler – würde er bedingungslos rendern, klatschte
    // er das Dashboard über den korrekt gecachten Fremd-Content, ohne Nav/Layout
    // zu aktualisieren (Nav bliebe auf "Beurteilungen"). Daher nur refreshen,
    // wenn die aktuell sichtbare Seite wirklich noch das Dashboard ist.
    const currentPage = location.pathname.split('/').pop() || 'dashboard.html';
    if (currentPage !== 'dashboard.html') return;
    try {
      if (user.istAzubi) {
        await renderAzubiDashboard(user);
      } else if (user.istReinerPruefer) {
        await renderReinerPrueferDashboard(user);
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

  /* Sync-Lookup statt DB.getWoche-Promise-Aufrufen im Render-Pfad.
     DB.getWoche ist async und wurde an mehreren Stellen ohne await
     aufgerufen → rec war ein Promise und der ganze Bento-Block
     rechnete mit Schrottwerten oder warf bei Property-Zugriff. */
  const wocheLookup = new Map(alleWochen.map(w => [`${w.year}-${w.kw}`, w]));
  const lookupWoche = (wkw, wyr) => wocheLookup.get(`${wyr}-${wkw}`) || null;

  const main = document.getElementById('mainContent');

  const aktStatus = aktuelleWoche ? aktuelleWoche.status : 'offen';
  const wocheTage = aktuelleWoche
    ? (aktuelleWoche.tage || []).filter(t => t.anwesenheit === 'anwesend').length
    : 0;
  const monday    = DateUtil.getMondayOfKW(kw, kwYear);
  const sunday    = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const range = `${DateUtil.formatDateShort(DateUtil.toISODate(monday))} – ${DateUtil.formatDateShort(DateUtil.toISODate(sunday))}`;

  // Berichtstyp steuert den Hero: 'täglich' (gewerblich) → aktuelle Woche
  // mit Tagen; 'wöchentlich' (kaufmännisch) → Übersicht der letzten KWs.
  const berichtTyp = user.berichtTyp || 'täglich';

  // Zustand einer Woche fürs farbliche Markieren in der Wochenübersicht.
  function weekState(w) {
    if (!w) return 'leer';
    if (w.status === 'freigegeben' || w.status === 'erstgenehmigt' || w.status === 'genehmigt') return 'abgegeben';
    const hatInhalt = (w.tage || []).some(t =>
        (t.anwesenheit === 'anwesend') || t.eintrag || t.betriebEintrag || t.schuleEintrag || t.unterweisungEintrag)
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

  /* ── Bento-Daten aufbereiten ──
     Die linke Spalte (Bento) ersetzt das alte zweispaltige Layout.
     - Hero: aktuelle Woche mit KW, Date-Range, Status, Wochen-Mini, CTAs.
     - Ausbildung: SVG-Donut (Monate Lehrjahr) + Lehrjahr-Segmente.
     - Recent: 6 jüngste Wochen als status-codierte Cards.
     - Frist: Bis Sonntag 23:59 (gelb).
     - Stats: Sparkline der letzten 12 Wochen + Streak-Pille. */

  function wkcardKind(w) {
    if (!w) return 'draft';
    if (w.status === 'genehmigt')   return 'ok';
    if (w.status === 'freigegeben') return 'fr';
    if (w.status === 'erstgenehmigt') return 'fr';
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
      html += `<div class="b-day ${cls}" role="button" tabindex="0" style="cursor:pointer"
        data-goto-kw="${kw}" data-goto-year="${kwYear}" data-goto-date="${iso}"
        aria-label="Zum ${days[i]}, ${d.getDate()}."><span class="dn">${days[i]}</span><span class="dnum">${d.getDate()}</span></div>`;
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
               : kind === 'fr'     ? 'Eingereicht'
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
        const hatInhalt = tag && (tag.anwesenheit === 'anwesend' || tag.eintrag || tag.betriebEintrag || tag.schuleEintrag || tag.unterweisungEintrag);

        let kind = 'leer';
        let lbl  = 'Leer';
        if (hatInhalt) {
          if (woche.status === 'genehmigt')          { kind = 'ok';    lbl = 'Genehmigt'; }
          else if (woche.status === 'erstgenehmigt') { kind = 'fr';    lbl = 'Erstgenehmigt'; }
          else if (woche.status === 'freigegeben')   { kind = 'fr';    lbl = 'Eingereicht'; }
          else if (woche.status === 'abgelehnt')     { kind = 'er';    lbl = 'Zurückgegeben'; }
          else                                        { kind = 'draft'; lbl = 'Entwurf'; }
        }

        // Gleiche Karte wie die Wochen-Variante (.b-wkcard), nur mit
        // Tages-Inhalt – so greifen alle Theme-Styles (Silk-Gradient etc.)
        // automatisch auch hier. 'leer' hat kein --sig → graue Fallbacks.
        html += `
          <a class="b-wkcard b-wkcard--${kind}" href="wochenansicht.html"
             data-goto-kw="${wkw}" data-goto-year="${wyr}">
            <span class="b-wkcard__kw">${d.getDate()}.<small>${WD_SHORT[wd]}</small></span>
            <span class="b-wkcard__range">${M_SHORT[d.getMonth()]}</span>
            <span class="b-wkcard__status"><span class="d"></span>${lbl}</span>
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

  const weekdayLong = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][today.getDay()];

  /* Eyecatcher = kleines Label (Eyebrow) + große Zahl. Zeigt für ALLE Azubis
     (täglich wie wöchentlich) das Datum des aktuellen Tages: Monatskürzel als
     Eyebrow (per CSS in Großbuchstaben) + Tag des Monats als große Zahl,
     z. B. "JUN" / "12". Früher zeigte die wöchentliche Variante stattdessen
     "KW" + Kalenderwoche – das war für Azubis verwirrend und ist ersetzt. */
  const heroEyebrow = DateUtil.MONTHS_SHORT[today.getMonth()];
  const heroNum = String(today.getDate()).padStart(2, '0');

  // ── Mitteilungszentrale (ersetzt das frühere Ausbildung-Donut) ───────
  // Quelle = bestehender Benachrichtigungs-Feed (genehmigt/zurückgegeben
  // durch Ausbilder/in) + zeitbasierter Fahrgeld-Reminder nach dem letzten
  // Berufsschultag (Tag mit Ort „Schule") des aktuellen Monats.
  const MT_ICON_OK = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  const MT_ICON_ER = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  const MT_ICON_REM = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 1.5"/></svg>';
  const mtEsc = window.escapeHtml;
  const mtRelTime = ts => {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'gerade eben';
    if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
    if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
    if (s < 86400 * 2) return 'gestern';
    if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} Tagen`;
    return new Date(ts).toLocaleDateString('de-DE');
  };
  function computeFahrgeldReminder() {
    const y = today.getFullYear(), mo = today.getMonth();
    let last = null;
    for (const w of alleWochen) {
      const wSchule = (w.wochenOrt || '').includes('Schule');
      for (const t of (w.tage || [])) {
        const ort = t.ort || (wSchule ? 'Schule' : '');
        if (!ort.includes('Schule')) continue;
        const d = new Date((t.datum || '') + 'T00:00:00');
        if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo) continue;
        if (!last || d > last) last = d;
      }
    }
    if (!last) return null;
    const todayMid = new Date(y, mo, today.getDate());
    if (todayMid < last) return null;   // letzter Berufsschultag noch nicht vorbei
    return { month: DateUtil.MONTHS[mo], date: DateUtil.toISODate(last) };
  }
  // Versetzungs-Mitteilungen erscheinen nur in der Glocke, nicht in dieser
  // KW-zentrischen Berichtsheft-Mitteilungsliste (hätten kein KW/Jahr).
  // „genehmigt" erzeugt bewusst keine Mitteilung; Versetzungen laufen über die
  // Glocke, nicht über diese KW-zentrische Liste.
  const mtItems = (await DB.getBenachrichtigungenFuerUser(user.id))
    .filter(b => !String(b.type || '').startsWith('versetzung_') && b.type !== 'genehmigt');
  const mtUnread = mtItems.filter(b => !b.gelesen).length;
  const mtFahrgeld = computeFahrgeldReminder();
  const mtFahrgeldHtml = mtFahrgeld ? `
          <a class="b-mitteilung b-mitteilung--reminder" href="fahrgelderstattung.html">
            <span class="b-mitteilung__icon b-mitteilung__icon--rem">${MT_ICON_REM}</span>
            <span class="b-mitteilung__body">
              <span class="b-mitteilung__title">Fahrgelderstattung ${mtFahrgeld.month} nicht vergessen</span>
              <span class="b-mitteilung__meta">Letzter Berufsschultag war am ${DateUtil.formatDateShort(mtFahrgeld.date)}</span>
            </span>
          </a>` : '';
  const mtNotifHtml = mtItems.slice(0, 6).map(b => {
    const isErst = b.type === 'erstgenehmigt';
    const ok = b.type === 'genehmigt' || isErst;
    const title = isErst
      ? `KW ${b.kw}/${b.year} erstgenehmigt`
      : ok ? `KW ${b.kw}/${b.year} genehmigt` : `KW ${b.kw}/${b.year} zurückgegeben`;
    const prev = (!ok && b.kommentar) ? `<span class="b-mitteilung__preview">${mtEsc(b.kommentar)}</span>` : '';
    return `
          <a class="b-mitteilung${b.gelesen ? '' : ' b-mitteilung--unread'}" href="wochenansicht.html"
             data-notif-id="${b.id}" data-kw="${b.kw}" data-year="${b.year}"${b.azubiId ? ` data-azubi="${b.azubiId}"` : ''}>
            <span class="b-mitteilung__icon b-mitteilung__icon--${ok ? 'ok' : 'er'}">${ok ? MT_ICON_OK : MT_ICON_ER}</span>
            <span class="b-mitteilung__body">
              <span class="b-mitteilung__title">${title}</span>
              <span class="b-mitteilung__meta">${mtRelTime(b.timestamp)}</span>
              ${prev}
            </span>
            ${b.gelesen ? '' : '<span class="b-mitteilung__dot" aria-hidden="true"></span>'}
          </a>`;
  }).join('');
  const mtEmptyHtml = (!mtNotifHtml && !mtFahrgeldHtml)
    ? '<div class="b-mitteilungen__empty">Keine neuen Mitteilungen</div>' : '';
  const mtMehrHtml = mtItems.length > 6
    ? `<a class="b-mitteilungen__more" href="mitteilungen.html">Alle ${mtItems.length} anzeigen
         <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>`
    : '';
  const mitteilungenSectionHtml = `
      <section class="b-tile b-mitteilungen animate-fade-in">
        <div class="b-azubi__head">
          <span class="eyebrow">Mitteilungen</span>
          ${mtUnread > 0 ? `<span class="b-mitteilungen__badge">${mtUnread > 9 ? '9+' : mtUnread}</span>` : ''}
        </div>
        <div class="b-mitteilungen__list">
          ${mtFahrgeldHtml}
          ${mtNotifHtml}
          ${mtEmptyHtml}
        </div>
        ${mtMehrHtml}
      </section>`;

  main.innerHTML = `
    <section class="welcome-hero">
      <div class="welcome-hero__body">
        <h1 class="welcome-hero__name">${getGreeting(today)}, ${firstName(user.name)}</h1>
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
        <div class="b-hero__middle">
          <h1 class="b-hero__kw">
            <small>Aktuelle Woche</small>
            <span class="b-hero__kw-num">KW ${kw}</span>
          </h1>
        </div>
        <div class="b-hero__bottom">
          <a class="b-btn-primary" href="wochenansicht.html"
             data-goto-kw="${kw}" data-goto-year="${kwYear}">
            ${berichtTyp === 'täglich' ? 'Tag öffnen' : 'Woche öffnen'}
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
          <div class="b-weekmini">${renderBentoWeekmini()}</div>
        </div>
      </section>

      <!-- MITTEILUNGEN: Benachrichtigungen + Fahrgeld-Reminder -->
      ${mitteilungenSectionHtml}

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
    const go = () => {
      sessionStorage.setItem('gotoKW', el.dataset.gotoKw);
      sessionStorage.setItem('gotoYear', el.dataset.gotoYear);
      if (el.dataset.gotoDate) sessionStorage.setItem('gotoDate', el.dataset.gotoDate);
      if (el.tagName !== 'A') window.location.href = 'wochenansicht.html';
    };
    el.addEventListener('click', go);
    // Tastatur für nicht-<a>-Sprungziele (z.B. die Tages-Pills im Hero)
    if (el.getAttribute('role') === 'button') {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    }
  });

  // Mitteilungszentrale: Klick markiert die Benachrichtigung als gelesen und
  // springt zur betroffenen Woche (eigenes Handling, weil mark-read VOR der
  // Navigation laufen muss).
  main.querySelectorAll('.b-mitteilung[data-notif-id]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = parseInt(el.dataset.notifId, 10);
      if (!isNaN(id)) { try { await DB.markBenachrichtigungGelesen(id); } catch (_) {} }
      if (el.dataset.kw)    sessionStorage.setItem('gotoKW', el.dataset.kw);
      if (el.dataset.year)  sessionStorage.setItem('gotoYear', el.dataset.year);
      if (el.dataset.azubi) sessionStorage.setItem('gotoAzubiId', el.dataset.azubi);
      window.location.href = 'wochenansicht.html';
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

/* ── Reiner-Prüfer-Dashboard: befristete Zuweisungen statt "Meine Azubis" ── */
async function renderReinerPrueferDashboard(user) {
  const main = document.getElementById('mainContent');
  const [pruefungen, kommende, beurteilungen] = await Promise.all([
    DB.getMeinePruefungen(),
    DB.getMeinePruefungenKommend(),
    DB.getMeineBeurteilungen(),
  ]);

  // Offene Berichte: über alle aktuell zugreifbaren Azubis die Wochen
  // sammeln, auf die der Prüfer reagieren kann (nie 'endgenehmigen' — das
  // bleibt dem dauerhaften Ausbilder vorbehalten). Älteste zuerst, wie im
  // normalen Ausbilder-Posteingang.
  const offeneBerichte = [];
  for (const p of pruefungen) {
    const wochen = await DB.getWochenFuerAzubi(p.azubiOid);
    wochen.forEach(w => {
      if ((w.erlaubteAktionen || []).includes('erstgenehmigen')) {
        offeneBerichte.push({ ...w, azubiOid: p.azubiOid, azubiName: p.azubiName });
      }
    });
  }
  offeneBerichte.sort((a, b) => (a.year - b.year) || (a.kw - b.kw));

  const offeneBeurteilungen = beurteilungen
    .filter(b => b.status === 'offen')
    .sort((a, b) => (a.bis < b.bis ? -1 : 1));

  const warnungen = pruefungen.filter(p => p.status === 'nachlauf');

  const STATUS_LABEL = p => p.status === 'laeuft'
    ? 'Läuft'
    : `Nachlauf bis ${DateUtil.formatDate(p.nachlaufBis)}`;

  const pruefungCard = p => `
    <div class="durchlauf-card">
      <span class="badge ${p.status === 'laeuft' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
        ${STATUS_LABEL(p)}
      </span>
      <div class="durchlauf-card__abt">${escapeHtml(p.azubiName)}${p.abteilung ? ' · ' + escapeHtml(p.abteilung) : ''}</div>
      <div class="durchlauf-card__zeit">${DateUtil.formatDate(p.von)} – ${DateUtil.formatDate(p.bis)}</div>
      <div class="durchlauf-card__verantw">
        <a href="wochenansicht.html" class="dash-pruefung-link" data-goto-azubi="${escapeHtml(p.azubiOid)}">Wochenansicht öffnen</a>
        &nbsp;·&nbsp;
        <a href="beurteilungen.html">Beurteilung</a>
      </div>
    </div>`;

  main.innerHTML = `
    <div class="welcome-banner welcome-banner--ausbilder">
      <div class="welcome-banner__content">
        <p class="welcome-banner__greeting">${getGreeting()}, ${firstName(user.name)} 👋</p>
        <h1 class="welcome-banner__title">Meine Prüfzeiträume</h1>
        <p class="welcome-banner__info">${pruefungen.length} ${pruefungen.length === 1 ? 'Zuweisung' : 'Zuweisungen'}</p>
      </div>
    </div>

    <div class="stats-grid stats-grid--3">
      <div class="stat-card animate-fade-in" id="statOffeneBerichte" style="animation-delay:0ms${offeneBerichte.length ? ';cursor:pointer' : ''}"${offeneBerichte.length ? ' role="button" tabindex="0"' : ''}>
        <div class="stat-card__icon stat-card__icon--${offeneBerichte.length ? 'error' : 'success'}">
          ${Icon('document')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Offene Berichte</div>
          <div class="stat-card__value">${offeneBerichte.length}</div>
          <div class="stat-card__sub">${offeneBerichte.length ? 'warten auf Erstgenehmigung' : 'Keine offenen Berichte'}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" id="statOffeneBeurteilungen" style="animation-delay:60ms${offeneBeurteilungen.length ? ';cursor:pointer' : ''}"${offeneBeurteilungen.length ? ' role="button" tabindex="0"' : ''}>
        <div class="stat-card__icon stat-card__icon--${offeneBeurteilungen.length ? 'error' : 'success'}">
          ${Icon('cap')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Offene Beurteilungen</div>
          <div class="stat-card__value">${offeneBeurteilungen.length}</div>
          <div class="stat-card__sub">${offeneBeurteilungen.length ? 'noch zu erstellen' : 'Keine offenen Beurteilungen'}</div>
        </div>
      </div>
    </div>

    ${warnungen.length ? `
      <div class="durchlauf-list">
        ${warnungen.map(p => `
          <div class="durchlauf-card durchlauf-card--warnung">
            <div class="durchlauf-card__abt">Zugriff für ${escapeHtml(p.azubiName)} endet am ${DateUtil.formatDate(p.nachlaufBis)}</div>
            <div class="durchlauf-card__zeit">Zuweisung (${p.abteilung ? escapeHtml(p.abteilung) : 'ohne Abteilung'}) endete bereits am ${DateUtil.formatDate(p.bis)} — danach ist keine Korrektur mehr möglich.</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <h2 class="dashboard-section-title" style="font-size:var(--text-base);margin:var(--sp-6) 0 var(--sp-3)">Meine Prüfzeiträume</h2>
    ${pruefungen.length
      ? `<div class="durchlauf-list">${pruefungen.map(pruefungCard).join('')}</div>`
      : `<div class="durchlauf-empty">Aktuell keine aktive Zuweisung.</div>`}

    ${kommende.length ? `
      <h2 class="dashboard-section-title" style="font-size:var(--text-base);margin:var(--sp-6) 0 var(--sp-3)">Demnächst</h2>
      <div class="durchlauf-list">
        ${kommende.map(k => `
          <div class="durchlauf-card">
            <span class="badge badge--grey durchlauf-card__badge">Kommend</span>
            <div class="durchlauf-card__abt">${escapeHtml(k.azubiName)}${k.abteilung ? ' · ' + escapeHtml(k.abteilung) : ''}</div>
            <div class="durchlauf-card__zeit">${DateUtil.formatDate(k.von)} – ${DateUtil.formatDate(k.bis)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  main.querySelectorAll('.dash-pruefung-link').forEach(a => {
    a.addEventListener('click', () => sessionStorage.setItem('gotoAzubiId', a.dataset.gotoAzubi));
  });

  if (offeneBerichte.length) {
    const goBerichte = () => {
      const b = offeneBerichte[0];
      sessionStorage.setItem('gotoAzubiId', b.azubiOid);
      sessionStorage.setItem('gotoKW', String(b.kw));
      sessionStorage.setItem('gotoYear', String(b.year));
      window.location.href = 'wochenansicht.html';
    };
    const el = document.getElementById('statOffeneBerichte');
    el.addEventListener('click', goBerichte);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBerichte(); } });
  }
  if (offeneBeurteilungen.length) {
    const goBeurteilung = () => { window.location.href = `beurteilung.html?zuw=${offeneBeurteilungen[0].zuweisungId}`; };
    const el = document.getElementById('statOffeneBeurteilungen');
    el.addEventListener('click', goBeurteilung);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBeurteilung(); } });
  }
}

/* ── Ausbilder-Cockpit ────────────────────────────────────────── */
async function renderAusbilderDashboard(user) {
  const today = new Date();
  const weekdayLong = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][today.getDay()];
  const heroEyebrow = DateUtil.MONTHS_SHORT[today.getMonth()];
  const heroNum = String(today.getDate()).padStart(2, '0');

  const meineAzubis = await getMeineAzubis(user);
  const istKorrektor   = user.istAusbilder || meineAzubis.length > 0;

  // Alle Wochen aller zugewiesenen Azubis
  const allWochen = [];
  for (const a of meineAzubis) {
    const wochen = await DB.getWochenFuerAzubi(a.id);
    wochen.forEach(w => {
      allWochen.push({ ...w, azubi: a });
    });
  }

  // Posteingang: alle Wochen, auf die der Betrachter reagieren kann
  // (Prüfer: freigegeben → erstgenehmigen; Ausbilder: freigegeben/erstgenehmigt),
  // sortiert nach Wartedauer (älteste zuerst).
  const queue = allWochen
    .filter(w => (w.erlaubteAktionen || []).some(a => a === 'erstgenehmigen' || a === 'endgenehmigen'))
    .sort((a, b) => (a.year - b.year) || (a.kw - b.kw));

  // Posteingang nach Azubi gruppieren → eine Karte pro Azubi statt einer
  // flachen Wochen-Liste. queue ist bereits älteste-zuerst, also ist
  // wochen[0] je Azubi der dringendste Bericht.
  const byAzubi = new Map();
  for (const w of queue) {
    if (!byAzubi.has(w.azubi.id)) byAzubi.set(w.azubi.id, []);
    byAzubi.get(w.azubi.id).push(w);
  }
  const cards = meineAzubis.map(a => ({
    azubi: a,
    wochen: byAzubi.get(a.id) || [],
    abgelehnt: allWochen.filter(w => w.azubi.id === a.id && w.status === 'abgelehnt').length,
  }));
  // Handlungsbedarf zuerst, sortiert nach ältestem wartenden Bericht.
  const pending = cards.filter(c => c.wochen.length > 0)
    .sort((x, y) => (x.wochen[0].year - y.wochen[0].year) || (x.wochen[0].kw - y.wochen[0].kw));
  const erledigt = cards.filter(c => c.wochen.length === 0);

  // Abgeschlossene Beurteilungen fürs Aktivitäten-Panel (pro Azubi ein
  // Request, parallel via Promise.all).
  // ponytail: N+1 – Batch-Endpoint erst, wenn viele Azubis das spürbar machen.
  const beurteilungen = (await Promise.all(meineAzubis.map(async a => {
    try {
      const bs = await DB.getBeurteilungenFuerAzubi(a.oid);
      return bs.filter(b => b.status === 'abgeschlossen' && b.abgeschlossenAm)
               .map(b => ({ azubi: a, ...b }));
    } catch (_) { return []; }
  }))).flat();

  // Durchlauf-Übersicht („wer ist wo"): Zuweisungen je Azubi (parallel).
  // ponytail: N+1 wie oben – Batch-Endpoint erst, wenn viele Azubis das spürbar machen.
  const durchlaufRows = await Promise.all(meineAzubis.map(async a => {
    try { return { azubi: a, zuw: await DB.getZuweisungenFuerAzubi(a.oid) }; }
    catch (_) { return { azubi: a, zuw: [] }; }
  }));

  const zeigeSuche = meineAzubis.length >= 6;

  // Mitteilungen (rechte Spalte): auf eine vernünftige Länge kappen; darüber
  // hinaus führt ein subtiler Button auf die Vollseite mit Filter + Suche.
  const MITT_CAP = 6;
  const mittItems = buildAusbilderMitteilungen(allWochen, beurteilungen);
  const mittListHtml = mittItems.length
    ? renderActivityRows(mittItems.slice(0, MITT_CAP))
    : '<div class="empty-state" style="padding:var(--sp-8)"><p class="empty-state__text">Noch keine Mitteilungen.</p></div>';
  const mittMehrHtml = mittItems.length > MITT_CAP
    ? `<a class="activity-more" href="mitteilungen.html">Alle ${mittItems.length} Mitteilungen anzeigen
         <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>`
    : '';

  const durchlaufHtml = meineAzubis.length > 0 ? renderDurchlaufListe(durchlaufRows, today) : '';

  const mitteilungenCardHtml = `
    <div class="card animate-fade-in">
      <div class="card__header">
        <span class="card__title">Mitteilungen</span>
      </div>
      <div class="card__body" style="padding-top:0;padding-bottom:0">
        <div class="activity-feed">
          ${mittListHtml}
        </div>
      </div>
      ${mittMehrHtml}
    </div>`;

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <section class="welcome-hero">
      <div class="welcome-hero__body">
        <h1 class="welcome-hero__name">${getGreeting(today)}, ${firstName(user.name)}</h1>
        <p class="welcome-hero__sub">${weekdayLong}, ${today.getDate()}. ${DateUtil.MONTHS[today.getMonth()]}</p>
      </div>
      <div class="welcome-hero__kw" aria-hidden="true">
        <span class="welcome-hero__kw-eye">${heroEyebrow}</span>
        <span class="welcome-hero__kw-num">${heroNum}</span>
      </div>
    </section>

    ${istKorrektor ? `
    <div class="dashboard-grid">
      <!-- LINKS (Hero): Zu prüfen + darunter der Abteilungsdurchlauf -->
      <div class="dashboard-grid__col dashboard-grid__col--hero">
        <div class="card review-inbox animate-fade-in" id="reviewInboxCard">
          <div class="card__header review-inbox__header">
            <div>
              <span class="card__title">Zu prüfen</span>
              ${pending.length > 0 ? `<p class="review-inbox__subtitle">${pending.length} ${pending.length === 1 ? 'Azubi hat' : 'Azubis haben'} offene Berichte · dringendste zuerst</p>` : ''}
            </div>
            ${queue.length > 0 ? `<span class="badge badge--freigegeben">${queue.length} offen</span>` : ''}
          </div>
          ${zeigeSuche ? `
          <div class="review-filter-bar">
            <div class="review-filter-bar__field review-filter-bar__field--search">
              ${Icon('search')}
              <input type="search" id="azubiSearchInput" class="review-filter-bar__search"
                     placeholder="Azubi suchen…" autocomplete="off" spellcheck="false">
            </div>
          </div>` : ''}
          <div class="review-list" id="reviewList">
            ${pending.length > 0
              ? pending.map((c, i) => renderAzubiCard(c, i)).join('')
              : renderInboxEmpty(meineAzubis.length)}
          </div>
          ${erledigt.length > 0 ? renderAzubiDoneGroup(erledigt) : ''}
        </div>
        ${durchlaufHtml}
      </div>

      <!-- RECHTS: Mitteilungen (inkl. abgeschlossener Beurteilungen) -->
      <div class="dashboard-grid__col">
        ${mitteilungenCardHtml}
      </div>
    </div>
    ` : durchlaufHtml}
  `;

  bindAusbilderCards();
  bindDurchlaufListe(main);

  // Bulk-Action-System aufsetzen (findet die Checkboxen in den
  // aufgeklappten Karten-Bodies innerhalb von #reviewList).
  initBulkActions(queue, user);
}

/* ── Abteilungsdurchlauf-Übersicht ─────────────────────────────────
   Kompakte Zeile pro Azubi: aktuelle Abteilung → nächste (+ Datum).
   Nach Dringlichkeit sortiert (ohne Zuweisung → endet bald ohne
   Nachfolger → läuft). Ersetzt die frühere Signal-Kachel-Reihe. */
function analyseDurchlauf(zuw, heute, grenze) {
  const sorted  = [...zuw].sort((a, b) => (a.von || '').localeCompare(b.von || ''));
  const current = sorted.find(z => z.von <= heute && z.bis >= heute) || null;
  const next    = sorted.find(z => z.von > heute) || null;
  const endetBald = !!current && current.bis <= grenze;
  // Nahtloser Nachfolger = beginnt spätestens 3 Tage nach Ende der aktuellen.
  let nahtlos = false;
  if (current && next) {
    const d = new Date(current.bis); d.setDate(d.getDate() + 3);
    nahtlos = next.von <= d.toISOString().split('T')[0];
  }
  let tier, dot, rowMod = '';
  if (!current)                        { tier = next ? 1 : 0; dot = 'crit'; rowMod = 'rot-row--crit'; }
  else if (endetBald && !nahtlos)      { tier = 2; dot = 'warn'; rowMod = 'rot-row--warn'; }
  else if (next && next.von <= grenze) { tier = 3; dot = 'ok'; }
  else                                 { tier = 4; dot = 'ok'; }
  const sortKey = (current && current.bis) || (next && next.von) || '9999';
  return { current, next, tier, dot, rowMod, endetBald, sortKey };
}

const DLB_ARROW = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
const DLB_CHEV = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;

/* Eine Station der Journey. Gefüllt = wo der Azubi gerade ist, umrandet =
   wohin es geht, gestrichelt = noch nicht geplant / nicht zugewiesen. */
function durchlaufStop(mod, lbl, dept, date) {
  return `
    <div class="rot-stop rot-stop--${mod}">
      <span class="rot-stop__lbl">${lbl}</span>
      <span class="rot-stop__dept">${dept}</span>
      <span class="rot-stop__date">${date || '&nbsp;'}</span>
    </div>`;
}

function durchlaufRowHtml(azubi, m, dShort) {
  const cur = m.current
    ? durchlaufStop('cur', 'Aktuell', escapeHtml(m.current.abteilung || '–'), `bis ${dShort(m.current.bis)}`)
    : durchlaufStop('empty rot-stop--crit', 'Aktuell', 'Nicht zugewiesen', '');
  const next = m.next
    ? durchlaufStop('next', m.current ? 'Danach' : 'Geplant', escapeHtml(m.next.abteilung || '–'), `ab ${dShort(m.next.von)}`)
    : durchlaufStop('empty', 'Danach', 'Noch offen', '');

  return `
    <a class="rot-row ${m.rowMod}" href="abteilungs-planer.html"
       data-azubi-id="${azubi.id}" data-name="${escapeHtml((azubi.name || '').toLowerCase())}">
      <div class="rot-head">
        <span class="rot-dot rot-dot--${m.dot}"></span>
        ${renderAvatar(azubi, 'rot-av')}
        <span class="rot-id">
          <span class="rot-name">${escapeHtml(azubi.name)}</span>
          <span class="rot-beruf">${escapeHtml(azubi.beruf || '–')}</span>
        </span>
        <span class="rot-chev">${DLB_CHEV}</span>
      </div>
      <div class="rot-journey">
        ${cur}
        <span class="rot-journey__arrow">${DLB_ARROW}</span>
        ${next}
      </div>
    </a>`;
}

function renderDurchlaufListe(rows, today) {
  const heute  = DateUtil.toISODate(today);
  const gd = new Date(today); gd.setDate(gd.getDate() + 14);
  const grenze = DateUtil.toISODate(gd);
  const dShort = iso => { if (!iso) return ''; const p = iso.split('-'); return `${p[2]}.${p[1]}.`; };

  const analysed = rows
    .map(r => ({ azubi: r.azubi, m: analyseDurchlauf(r.zuw || [], heute, grenze) }))
    .sort((x, y) => (x.m.tier - y.m.tier) || String(x.m.sortKey).localeCompare(String(y.m.sortKey)));

  const ohne    = analysed.filter(o => !o.m.current).length;
  const endet   = analysed.filter(o => o.m.tier === 2).length;
  const wechsel = analysed.filter(o => o.m.tier === 3).length;
  const zeigeSuche = analysed.length >= 8;

  const sumItem = (c, l, col) => c
    ? `<span class="rot-sum-item"><span class="rot-sum-dot" style="background:${col}"></span><b>${c}</b> ${l}</span>` : '';
  const summary = (ohne || endet || wechsel)
    ? `<div class="rot-summary">
         ${sumItem(ohne, 'ohne Zuweisung', '#e5484d')}
         ${sumItem(endet, 'enden bald (kein Nachfolger)', 'var(--pm-yellow, #FFC300)')}
         ${sumItem(wechsel, 'Wechsel in ≤ 14 Tagen', '#3f9a54')}
       </div>` : '';

  const searchSvg = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  const linkArrow = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

  return `
    <div class="card rot" id="durchlaufCard">
      <div class="rot__head">
        <span class="card__title">Abteilungsdurchlauf</span>
        <span class="rot__count">${analysed.length} ${analysed.length === 1 ? 'Azubi' : 'Azubis'}</span>
        <span class="rot__spacer"></span>
        ${zeigeSuche ? `<span class="rot__search">${searchSvg}<input type="search" id="durchlaufSearch" placeholder="Azubi suchen…" autocomplete="off" spellcheck="false"></span>` : ''}
        <a class="rot__link" href="abteilungs-planer.html">Planer öffnen ${linkArrow}</a>
      </div>
      ${summary}
      <div class="rot__list" id="durchlaufList">
        ${analysed.map(o => durchlaufRowHtml(o.azubi, o.m, dShort)).join('')}
      </div>
    </div>`;
}

function bindDurchlaufListe(root) {
  const list = root.querySelector('#durchlaufList');
  if (!list) return;
  // Klick auf eine Zeile → diesen Azubi im Abteilungs-Planer vorwählen
  // (das <a> navigiert selbst; sessionStorage wird davor synchron gesetzt).
  list.querySelectorAll('.rot-row[data-azubi-id]').forEach(row => {
    row.addEventListener('click', () => {
      sessionStorage.setItem('gotoAzubiId', row.dataset.azubiId);
    });
  });
  const s = root.querySelector('#durchlaufSearch');
  if (s) s.addEventListener('input', () => {
    const q = s.value.trim().toLowerCase();
    list.querySelectorAll('.rot-row').forEach(r => {
      r.style.display = (!q || (r.dataset.name || '').includes(q)) ? '' : 'none';
    });
  });
}

/* ── Azubi-Karte: ein Azubi mit seinen offenen Berichten ───────────
   Aufklappbar; im Body die einzelnen Wochen (renderReviewItem) mit
   Checkboxen für die Sammel-Freigabe. */
function renderAzubiCard(c, idx) {
  const a = c.azubi;
  const n = c.wochen.length;
  const oldest = c.wochen[0];
  const monday = DateUtil.getMondayOfKW(oldest.kw, oldest.year);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const wochenSeit = Math.max(0, Math.floor((new Date() - sunday) / (1000 * 60 * 60 * 24 * 7)));
  const dringlich = wochenSeit >= 2 ? 'urgent' : wochenSeit === 1 ? 'warn' : 'fresh';
  const seitText = wochenSeit === 0 ? 'diese Woche eingereicht'
                 : wochenSeit === 1 ? 'älteste wartet seit 1 Woche'
                 : `älteste wartet seit ${wochenSeit} Wochen`;

  return `
    <div class="azubi-card azubi-card--${dringlich}" data-azubi-id="${a.id}" style="animation-delay:${idx * 50}ms">
      <div class="azubi-card__header" role="button" tabindex="0" aria-expanded="false"
           aria-label="${a.name}: ${n} ${n === 1 ? 'Bericht' : 'Berichte'} zu prüfen – aufklappen">
        <div class="avatar avatar--lg azubi-card__avatar">${a.initials}</div>
        <div class="azubi-card__info">
          <div class="azubi-card__name">${a.name}</div>
          <div class="azubi-card__role">${a.beruf || '–'}</div>
          <div class="azubi-card__status">
            <span class="azubi-card__count">${n} ${n === 1 ? 'Bericht' : 'Berichte'} offen</span>
            <span class="review-item__sep">·</span>
            <span class="azubi-card__wait">${seitText}</span>
            ${c.abgelehnt > 0 ? `<span class="badge badge--abgelehnt azubi-card__badge">${c.abgelehnt} zurückgegeben</span>` : ''}
          </div>
        </div>
        <a class="btn btn-sm azubi-card__cta" href="wochenansicht.html"
           data-goto-azubi="${a.id}" data-goto-kw="${oldest.kw}" data-goto-year="${oldest.year}">
          Älteste prüfen
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
        <div class="azubi-card__chevron" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="azubi-card__body" hidden>
        <label class="azubi-card__selectall">
          <input type="checkbox" class="azubi-card__selectall-cb">
          <span>Alle ${n} markieren</span>
        </label>
        ${c.wochen.map((w, i) => renderReviewItem(w, i)).join('')}
      </div>
    </div>
  `;
}

/* ── "Aktuell": Azubis ohne offene Berichte, eingeklappt (native
   <details>, kein JS für die Klappmechanik). */
function renderAzubiDoneGroup(erledigt) {
  const n = erledigt.length;
  return `
    <details class="azubi-done">
      <summary class="azubi-done__summary">
        <span class="azubi-done__check" aria-hidden="true">${Icon('success', { size: 16 })}</span>
        <span>${n} ${n === 1 ? 'Azubi ist aktuell' : 'Azubis sind aktuell'} – keine offenen Berichte</span>
        <svg class="azubi-done__caret" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="azubi-done__list">
        ${erledigt.map(c => `
          <div class="azubi-done__item" data-azubi-id="${c.azubi.id}" role="button" tabindex="0">
            <div class="avatar azubi-done__avatar">${c.azubi.initials}</div>
            <div class="azubi-done__info">
              <div class="azubi-done__name">${c.azubi.name}</div>
              <div class="azubi-done__role">${c.azubi.beruf || '–'}</div>
            </div>
            ${c.abgelehnt > 0
              ? `<span class="badge badge--abgelehnt">${c.abgelehnt} zurück</span>`
              : `<span class="badge badge--genehmigt">Aktuell</span>`}
            <div class="azubi-overview-item__chevron">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function renderInboxEmpty(azubiCount) {
  if (azubiCount === 0) {
    return `
      <div class="review-empty">
        <div class="review-empty__icon" style="background:var(--pm-grey-100);color:var(--pm-grey-500)">
          ${Icon('users', { size: 32 })}
        </div>
        <h3 class="review-empty__title">Keine Azubis zugewiesen</h3>
        <p class="review-empty__text">Sobald dir Auszubildende zugewiesen sind, erscheinen sie hier.</p>
      </div>`;
  }
  return `
    <div class="review-empty">
      <div class="review-empty__icon">${Icon('success', { size: 32 })}</div>
      <h3 class="review-empty__title">Alles geprüft!</h3>
      <p class="review-empty__text">Aktuell warten keine Berichtshefte auf deine Abnahme.</p>
    </div>`;
}

/* Event-Handler für die Azubi-Karten (Auf-/Zuklappen, Sprünge,
   Karten-Sammelauswahl, Suche). */
function bindAusbilderCards() {
  // Karte auf-/zuklappen
  document.querySelectorAll('.azubi-card__header').forEach(h => {
    const toggle = () => {
      const card = h.closest('.azubi-card');
      const body = card.querySelector('.azubi-card__body');
      const open = card.classList.toggle('azubi-card--open');
      h.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (body) body.hidden = !open;
    };
    h.addEventListener('click', (e) => {
      if (e.target.closest('.azubi-card__cta')) return;   // CTA navigiert selbst
      toggle();
    });
    h.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // "Älteste prüfen" → richtigen Sprung merken (das <a> navigiert selbst)
  document.querySelectorAll('.azubi-card__cta[data-goto-azubi]').forEach(cta => {
    cta.addEventListener('click', (e) => {
      e.stopPropagation();
      sessionStorage.setItem('gotoAzubiId', cta.dataset.gotoAzubi);
      sessionStorage.setItem('gotoKW',      cta.dataset.gotoKw);
      sessionStorage.setItem('gotoYear',    cta.dataset.gotoYear);
    });
  });

  // Einzelne Woche im aufgeklappten Body → direkt zu dieser Woche
  document.querySelectorAll('.azubi-card__body .review-item[data-azubi-id][data-kw]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.review-item__check')) return;
      sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
      sessionStorage.setItem('gotoKW',      item.dataset.kw);
      sessionStorage.setItem('gotoYear',    item.dataset.year);
      window.location.href = 'wochenansicht.html';
    });
  });

  // Pro-Karte "Alle markieren" → Checkboxen der Karte toggeln (dispatch
  // change, damit initBulkActions die Auswahl übernimmt)
  document.querySelectorAll('.azubi-card__selectall-cb').forEach(sa => {
    sa.addEventListener('change', () => {
      const card = sa.closest('.azubi-card');
      card.querySelectorAll('.review-item__checkbox').forEach(cb => {
        if (cb.checked !== sa.checked) {
          cb.checked = sa.checked;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  });

  // "Aktuell"-Gruppe: Klick auf Azubi → dessen Wochenansicht
  document.querySelectorAll('.azubi-done__item[data-azubi-id]').forEach(item => {
    const go = () => {
      sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
      window.location.href = 'wochenansicht.html';
    };
    item.addEventListener('click', go);
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });

  // Azubi-Suche (nur bei vielen Azubis eingeblendet) – blendet Karten ein/aus
  const search = document.getElementById('azubiSearchInput');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('#reviewList .azubi-card').forEach(card => {
        const name = (card.querySelector('.azubi-card__name')?.textContent || '').toLowerCase();
        card.style.display = (!q || name.includes(q)) ? '' : 'none';
      });
    });
  }
}

/* ── Hilfsfunktionen für Ausbilder-Dashboard ──────────────────── */
/* Planer-Signale: Datenpfad identisch zum Azubi-Planer (DB.getAllZuweisungen
   + DB.getAzubis). "bald" = innerhalb der nächsten 14 Tage. */
async function getPlanerSignale() {
  const heuteD  = new Date();
  const grenzeD = new Date(); grenzeD.setDate(grenzeD.getDate() + 14);
  const heute   = heuteD.toISOString().split('T')[0];
  const grenze  = grenzeD.toISOString().split('T')[0];
  const [azubis, zuw] = await Promise.all([DB.getAzubis(), DB.getAllZuweisungen()]);
  const nameVon = id => (azubis.find(a => a.id === id)?.name) || 'Unbekannt';
  const aktiveAzubiIds = new Set(
    zuw.filter(z => z.von <= heute && z.bis >= heute).map(z => z.azubiId)
  );
  // Nach dem relevanten Datum sortiert, damit die dringendsten Einträge
  // zuerst in der Kachel-Vorschau stehen.
  const ablaufend = zuw.filter(z => z.bis >= heute && z.bis <= grenze)
                       .sort((a, b) => a.bis.localeCompare(b.bis));
  const beginnend = zuw.filter(z => z.von >  heute && z.von <= grenze)
                       .sort((a, b) => a.von.localeCompare(b.von));
  // Jede Liste trägt die Zeilen-Daten für die Mini-Vorschau; `.length` bleibt
  // die Kennzahl der Kachel.
  return {
    ohneZuweisung: azubis.filter(a => !aktiveAzubiIds.has(a.id))
                         .map(a => ({ name: a.name })),
    baldAblaufend: ablaufend.map(z => ({ name: nameVon(z.azubiId), abteilung: z.abteilung, von: z.von, bis: z.bis })),
    baldBeginnend: beginnend.map(z => ({ name: nameVon(z.azubiId), abteilung: z.abteilung, von: z.von, bis: z.bis })),
  };
}

/* Drei klickbare Signalkarten (führen in den Planer). Wiederverwendet die
   stat-card-Styles; Icon('planer') existiert (Sidebar). */
/* Drei Spalten: je eine große Signal-Kachel (Kennzahl) mit den passenden
   Azubi-Detail-Kacheln direkt darunter. "Ohne Zuweisung" zeigt nur den
   Namen, die übrigen zusätzlich Abteilung und Zeitraum. Max. MAX Kacheln
   je Spalte, der Rest verweist in den Planer. */
function renderPlanerSignale(sig) {
  const esc = window.escapeHtml;
  const MAX = 8;
  const zeitraum = r => (r.von || r.bis)
    ? `${DateUtil.formatDateShort(r.von)} – ${DateUtil.formatDateShort(r.bis)}` : '';
  const kachel = r => {
    const abt  = r.abteilung ? `<div class="signal-tile__abt">${esc(r.abteilung)}</div>` : '';
    const zeit = zeitraum(r) ? `<div class="signal-tile__zeit">${zeitraum(r)}</div>` : '';
    return `<div class="signal-tile">
              <div class="signal-tile__name">${esc(r.name)}</div>
              ${abt}${zeit}
            </div>`;
  };
  const kacheln = (rows, leer) => {
    if (!rows.length) return `<p class="signal-col__empty">${leer}</p>`;
    const tiles = rows.slice(0, MAX).map(kachel).join('');
    const rest = rows.length - MAX;
    const mehr = rest > 0
      ? `<a href="abteilungs-planer.html" class="signal-tile signal-tile--more">+${rest} weitere im Planer →</a>`
      : '';
    return `<div class="signal-tiles">${tiles}${mehr}</div>`;
  };
  const spalte = (rows, label, sub, mod, leer) => `
    <div class="signal-col signal-col--${mod}">
      <a href="abteilungs-planer.html" class="stat-card animate-fade-in" style="text-decoration:none">
        <div class="stat-card__icon stat-card__icon--${mod}">${Icon('planer')}</div>
        <div class="stat-card__content">
          <div class="stat-card__label">${label}</div>
          <div class="stat-card__value">${rows.length}</div>
          <div class="stat-card__sub">${sub}</div>
        </div>
      </a>
      ${kacheln(rows, leer)}
    </div>`;
  return `
    <div class="signal-cols">
      ${spalte(sig.ohneZuweisung, 'Azubis ohne aktuelle Zuweisung',
               sig.ohneZuweisung.length ? 'Handlungsbedarf' : 'Alles zugewiesen',
               sig.ohneZuweisung.length ? 'error' : 'success',
               'Alle Azubis sind aktuell zugewiesen.')}
      ${spalte(sig.baldAblaufend, 'Zuweisungen enden bald', 'in den nächsten 14 Tagen', 'info',
               'Keine Zuweisung endet in den nächsten 14 Tagen.')}
      ${spalte(sig.baldBeginnend, 'Zuweisungen beginnen bald', 'in den nächsten 14 Tagen', 'info',
               'Keine Zuweisung beginnt in den nächsten 14 Tagen.')}
    </div>`;
}

async function getMeineAzubis(user) {
  const heute = new Date().toISOString().split('T')[0];
  const byId = new Map();
  // (1) Aktuell laufende befristete Zuweisungen (Verantwortliche/r per E-Mail).
  const meineZuw = (await DB.getZuweisungenFuerVerantw(user.email))
    .filter(z => z.von <= heute && z.bis >= heute);
  const azubiIds = [...new Set(meineZuw.map(z => z.azubiId))];
  for (const u of (await Promise.all(azubiIds.map(id => DB.getUser(id)))).filter(Boolean)) {
    byId.set(u.oid, u);
  }
  // (2) Dauerhafte Ausbilder-Zuordnung (OID-basiert) – immer „meine" Azubis,
  //     unabhängig von befristeten Zuweisungen/der Zuweisungs-E-Mail.
  for (const u of await DB.getDauerhafteAzubis()) {
    if (!byId.has(u.oid)) byId.set(u.oid, u);
  }
  return [...byId.values()];
}

function renderReviewItem(w, idx) {
  const a = w.azubi;
  const monday = DateUtil.getMondayOfKW(w.kw, w.year);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const startStr = DateUtil.formatDateShort(DateUtil.toISODate(monday));
  const endStr   = DateUtil.formatDateShort(DateUtil.toISODate(sunday));
  const anwesenheitstage = (w.tage || []).filter(t => t.anwesenheit === 'anwesend').length
    || (w.gesamtstunden || 0);
  const stundenStr = `${anwesenheitstage} ${anwesenheitstage === 1 ? 'Tag' : 'Tage'}`;

  // Wartedauer berechnen (Endwoche-basiert)
  const today = new Date();
  const wochenSeitEnde = Math.max(0, Math.floor((today - sunday) / (1000 * 60 * 60 * 24 * 7)));
  const wartetSeit = wochenSeitEnde === 0 ? 'Diese Woche eingereicht'
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
      ${renderAvatar(a, 'review-item__avatar')}
      <div class="review-item__main">
        <div class="review-item__name">${a.name}</div>
        <div class="review-item__meta">
          <span class="review-item__kw">KW ${w.kw}/${w.year}</span>
          <span class="review-item__sep">·</span>
          <span>${startStr} – ${endStr}</span>
          <span class="review-item__sep">·</span>
          <span class="review-item__hours">${stundenStr}</span>
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
      const erst = (w?.erlaubteAktionen || []).includes('erstgenehmigen');
      await DB.setWocheStatus(wocheId, erst ? 'erstgenehmigt' : 'genehmigt');
      if (w && !erst) await DB.addBenachrichtigung({
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

/* Mitteilungen des Ausbilders = Wochen- + Beurteilungs-Ereignisse als Feed,
   neueste zuerst. Wochen haben keinen echten Timestamp – Sonntag der KW dient
   als Näherung. „genehmigt" erscheint bewusst NICHT (der Ausbilder hat selbst
   genehmigt – keine Mitteilung nötig). Abgabe des Azubis heißt „eingereicht". */
function buildAusbilderMitteilungen(allWochen, beurteilungen = []) {
  const items = [];

  allWochen
    .filter(w => w.status !== 'offen' && w.status !== 'genehmigt')
    .forEach(w => {
      const sunday = DateUtil.getMondayOfKW(w.kw, w.year);
      sunday.setDate(sunday.getDate() + 6);
      let type, verb;
      if (w.status === 'freigegeben')       { type = 'info';    verb = 'eingereicht'; }
      else if (w.status === 'abgelehnt')    { type = 'error';   verb = 'zurückgegeben'; }
      else if (w.status === 'erstgenehmigt'){ type = 'success'; verb = 'erstgenehmigt'; }
      else                                  { type = 'yellow';  verb = ''; }
      items.push({
        ts:   sunday.getTime(),
        type,
        text: `<strong>${escapeHtml(w.azubi.name)}</strong>: KW ${w.kw} ${verb}`.trim(),
        time: `KW ${w.kw}/${w.year}`,
      });
    });

  // Abgeschlossene Beurteilungen – klickbar, öffnen den Bogen zum Ansehen.
  beurteilungen.forEach(b => {
    const d = new Date(b.abgeschlossenAm);
    const note = b.note != null ? ` · Note ${b.note.toLocaleString('de-DE')}` : '';
    items.push({
      ts:   isNaN(d) ? 0 : d.getTime(),
      type: 'yellow',
      text: `<strong>${escapeHtml(b.azubi.name)}</strong>: Beurteilung abgeschlossen${note}`,
      time: isNaN(d) ? '' : d.toLocaleDateString('de-DE'),
      href: `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId)}`,
    });
  });

  return items.sort((a, b) => b.ts - a.ts);
}

function renderActivityRows(items) {
  return items.map((it, i) => {
    const tag = it.href ? 'a' : 'div';
    const attrs = it.href
      ? `class="activity-item activity-item--link" href="${it.href}"`
      : 'class="activity-item"';
    return `
      <${tag} ${attrs} style="animation-delay:${i * 40}ms">
        <div class="activity-item__dot activity-item__dot--${it.type}"></div>
        <div class="activity-item__content">
          <div class="activity-item__text">${it.text}</div>
          <div class="activity-item__time">${it.time}</div>
        </div>
      </${tag}>
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

    let dauer = '';
    let anwesenheit = '';
    if (woche && woche.tage) {
      const tag = woche.tage.find(t => t.datum === dateStr);
      if (tag) { dauer = tag.tagdauer || ''; anwesenheit = tag.anwesenheit; }
    }

    const isAnwesend = anwesenheit === 'anwesend';
    const pct = isAnwesend ? (dauer === 'halbtag' ? 50 : 100) : 0;
    const isFull = isAnwesend && dauer !== 'halbtag';
    const hoursStr = isWE ? '–'
      : (isAnwesend ? (dauer === 'halbtag' ? '½' : 'Tag')
      : (anwesenheit ? '–' : ''));

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

