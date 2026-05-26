/* ===================================================================
   DASHBOARD.JS – Rollen-spezifisches Dashboard
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  /* Layout-Marker: erlaubt dem Dashboard volle Seitenbreite (Override
     der globalen --content-max-Beschränkung von 1200 px in layout.css). */
  document.body.dataset.page = 'dashboard';

  /* initPage statt initLayout: ruft buildSidebar() auf, das die komplette
     Sidebar inkl. Theme-Toggle im Footer aufbaut. (initLayout alleine
     würde nur die hardcoded sidebar in dashboard.html anbinden, in der
     der Theme-Toggle nicht enthalten ist.) */
  const user = initPage('nav-dashboard', []);
  if (!user) return;

  if (user.role === 'azubi') {
    renderAzubiDashboard(user);
  } else {
    renderAusbilderDashboard(user);
  }

  Toast.init();
});

/* ── Azubi-Dashboard (bestehend) ─────────────────────────────── */
function renderAzubiDashboard(user) {
  const today = new Date();
  const kw = DateUtil.getKW(today);
  const kwYear = DateUtil.getKWYear(today);

  const alleWochen = DB.getWochenFuerAzubi(user.id);
  const aktuelleWoche = DB.getWoche(user.id, kw, kwYear);
  const offeneWochen = alleWochen.filter(w => w.status === 'offen').length;
  const genehmigte = alleWochen.filter(w => w.status === 'genehmigt').length;
  const gesamtStunden = alleWochen.reduce((s, w) => s + (w.gesamtstunden || 0), 0);

  let fortschritt = 0;
  if (user.ausbildungsBeginn && user.ausbildungsEnde) {
    const start = new Date(user.ausbildungsBeginn);
    const ende = new Date(user.ausbildungsEnde);
    const jetzt = new Date();
    const gesamt = ende - start;
    const vergangen = Math.min(jetzt - start, gesamt);
    fortschritt = Math.round((vergangen / gesamt) * 100);
  }

  const zuw = DB.getAktuellerAusbilder(user.id);
  const ausbilder = zuw ? DB.getUser(zuw.ausbilderId) : null;

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-banner__content">
        <p class="welcome-banner__greeting">${getGreeting()}, ${user.name.split(' ')[0]} 👋</p>
        <h1 class="welcome-banner__title">Dein Berichtsheft-Dashboard</h1>
        <p class="welcome-banner__info">
          ${user.beruf || ''} &nbsp;·&nbsp; ${user.unternehmen || 'Putzmeister'}
          ${ausbilder ? ` &nbsp;·&nbsp; Ausbilder: ${ausbilder.name}` : ''}
        </p>
      </div>
      <div class="welcome-banner__kw">
        <div class="welcome-banner__kw-number">KW&nbsp;${kw}</div>
        <div class="welcome-banner__kw-label">${DateUtil.MONTHS[today.getMonth()]} ${today.getFullYear()}</div>
      </div>
    </div>

    ${renderAzubiPrimaryCta(user, aktuelleWoche, alleWochen, kw, kwYear)}

    <div class="stats-grid stats-grid--3">
      <div class="stat-card animate-fade-in" style="animation-delay:0ms">
        <div class="stat-card__icon stat-card__icon--yellow">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Gesamtstunden</div>
          <div class="stat-card__value">${formatHoursDecimal(gesamtStunden)}</div>
          <div class="stat-card__sub">Alle erfassten Wochen</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:60ms">
        <div class="stat-card__icon stat-card__icon--success">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Genehmigte Wochen</div>
          <div class="stat-card__value">${genehmigte}</div>
          <div class="stat-card__sub">von ${alleWochen.length} gesamt</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:120ms">
        <div class="stat-card__icon stat-card__icon--${offeneWochen > 0 ? 'error' : 'success'}">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Ausstehend</div>
          <div class="stat-card__value">${offeneWochen}</div>
          <div class="stat-card__sub">Wochen noch offen</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- LINKS (Hero): KW-Wochenstatus, kompakt — nur so hoch wie nötig -->
      <div class="dashboard-grid__col dashboard-grid__col--hero">
        <div class="week-status-card animate-fade-in">
          <div class="week-status-card__header">
            <span class="week-status-card__kw">KW ${kw} – Aktuelle Woche</span>
            <a href="wochenansicht.html" class="btn btn-sm btn-outline-yellow">Öffnen</a>
          </div>
          <div class="week-status-list" id="weekStatusList">
            ${renderWeekStatusDays(aktuelleWoche, kw, kwYear)}
          </div>
          <div style="padding:var(--sp-3) var(--sp-5);border-top:1px solid var(--pm-grey-100);display:flex;justify-content:flex-end;align-items:center;gap:var(--sp-3)">
            <span style="font-size:var(--text-xs);color:var(--pm-grey-500)">Gesamtstunden:</span>
            <span style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:var(--pm-grey-900)">${aktuelleWoche ? aktuelleWoche.gesamtstunden : 0}:00</span>
          </div>
        </div>
      </div>

      <!-- RECHTS (gestapelt): Ausbildungsfortschritt (wenn Daten) + Aktivitäten -->
      <div class="dashboard-grid__col">
        ${user.ausbildungsBeginn && user.ausbildungsEnde ? `
        <div class="ausbildung-progress animate-fade-in">
          <div class="ausbildung-progress__header">
            <span class="ausbildung-progress__label">Ausbildungsfortschritt</span>
            <span class="ausbildung-progress__pct">${fortschritt}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" id="ausbildungProgressBar" style="width:0%"></div>
          </div>
          <div class="ausbildung-progress__dates">
            <span class="ausbildung-progress__date-item">Start: ${DateUtil.formatDate(user.ausbildungsBeginn)}</span>
            <span class="ausbildung-progress__date-item">Ende: ${DateUtil.formatDate(user.ausbildungsEnde)}</span>
          </div>
        </div>
        ` : ''}

        <div class="card animate-fade-in">
          <div class="card__header">
            <span class="card__title">Letzte Aktivitäten</span>
          </div>
          <div class="card__body" style="padding-top:0;padding-bottom:0">
            <div class="activity-feed" id="activityFeed">
              ${renderAzubiActivities(alleWochen)}
            </div>
          </div>
        </div>
      </div>
    </div>

  `;

  setTimeout(() => {
    const bar = document.getElementById('ausbildungProgressBar');
    if (bar) bar.style.width = fortschritt + '%';
  }, 300);

  bindPrimaryCtaNav();
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
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}
function iconAlert() {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
}
function iconCheck() {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><polyline stroke-linecap="round" stroke-linejoin="round" points="20 6 9 17 4 12"/></svg>`;
}
function iconHourglass() {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 2h12M6 22h12M6 2v4a6 6 0 0 0 12 0V2M6 22v-4a6 6 0 0 1 12 0v4"/></svg>`;
}
function iconInbox() {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 12h-6l-2 3h-4l-2-3H2"/><path stroke-linecap="round" stroke-linejoin="round" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
}

/* ── Ausbilder-Cockpit ────────────────────────────────────────── */
function renderAusbilderDashboard(user) {
  const today = new Date();
  const kw = DateUtil.getKW(today);
  const kwYear = DateUtil.getKWYear(today);

  const meineAzubis = getMeineAzubis(user);

  // Alle Wochen aller zugewiesenen Azubis
  const allWochen = [];
  meineAzubis.forEach(a => {
    DB.getWochenFuerAzubi(a.id).forEach(w => {
      allWochen.push({ ...w, azubi: a });
    });
  });

  // Posteingang: zur Abnahme freigegeben (älteste zuerst)
  const queue = allWochen
    .filter(w => w.status === 'freigegeben')
    .sort((a, b) => (a.year - b.year) || (a.kw - b.kw));

  const zurueckgegeben = allWochen.filter(w => w.status === 'abgelehnt').length;
  const genehmigtDieseWoche = allWochen.filter(w =>
    w.status === 'genehmigt' && w.year === kwYear && w.kw === kw
  ).length;

  // Pro-Azubi-Stats für die rechte Liste
  const azubiStats = meineAzubis.map(a => {
    const wochen = DB.getWochenFuerAzubi(a.id);
    return {
      azubi: a,
      zuPruefen: wochen.filter(w => w.status === 'freigegeben').length,
      offen:     wochen.filter(w => w.status === 'offen').length,
      abgelehnt: wochen.filter(w => w.status === 'abgelehnt').length,
      genehmigt: wochen.filter(w => w.status === 'genehmigt').length,
    };
  }).sort((a, b) => b.zuPruefen - a.zuPruefen);

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
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Aktive Azubis</div>
          <div class="stat-card__value">${meineAzubis.length}</div>
          <div class="stat-card__sub">${user.role === 'admin' ? 'im System' : 'aktuell zugewiesen'}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:60ms">
        <div class="stat-card__icon stat-card__icon--success">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Diese Woche genehmigt</div>
          <div class="stat-card__value">${genehmigtDieseWoche}</div>
          <div class="stat-card__sub">in KW ${kw}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:120ms">
        <div class="stat-card__icon stat-card__icon--${zurueckgegeben > 0 ? 'error' : 'success'}">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
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
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
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
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
function getMeineAzubis(user) {
  if (user.role === 'admin') return DB.getAzubis();

  const heute = new Date().toISOString().split('T')[0];
  const meineZuw = DB.getZuweisungenFuerAusbilder(user.id)
    .filter(z => z.von <= heute && z.bis >= heute);
  const azubiIds = [...new Set(meineZuw.map(z => z.azubiId))];
  return azubiIds.map(id => DB.getUser(id)).filter(Boolean);
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
  toolbar.querySelector('[data-bulk-approve]').addEventListener('click', () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} Berichtshefte gemeinsam genehmigen?`)) return;
    ids.forEach(wocheId => {
      const w = queueById.get(wocheId);
      DB.setWocheStatus(wocheId, 'genehmigt');
      if (w) DB.addBenachrichtigung({
        userId: w.azubiId, type: 'genehmigt',
        wocheId, azubiId: w.azubiId, kw: w.kw, year: w.year,
        fromUserId: currentUser.id,
      });
    });
    Toast.success('Genehmigt', `${ids.length} ${ids.length === 1 ? 'Bericht' : 'Berichte'} genehmigt.`);
    setTimeout(() => window.location.reload(), 700);
  });

  // Bulk-Zurückgeben (mit einer gemeinsamen Begründung)
  toolbar.querySelector('[data-bulk-reject]').addEventListener('click', () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const reason = prompt(`Begründung für die Rückgabe von ${ids.length} ${ids.length === 1 ? 'Bericht' : 'Berichten'}:`);
    if (!reason || !reason.trim()) return;
    const reasonTrim = reason.trim();
    ids.forEach(wocheId => {
      const w = queueById.get(wocheId);
      DB.addKommentar(wocheId, {
        userId: currentUser.id, text: reasonTrim,
        datum: new Date().toLocaleDateString('de-DE'), typ: 'abgelehnt',
      });
      DB.setWocheStatus(wocheId, 'abgelehnt');
      if (w) DB.addBenachrichtigung({
        userId: w.azubiId, type: 'abgelehnt',
        wocheId, azubiId: w.azubiId, kw: w.kw, year: w.year,
        fromUserId: currentUser.id, kommentar: reasonTrim,
      });
    });
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
