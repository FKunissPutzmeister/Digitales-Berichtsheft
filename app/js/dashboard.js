/* ===================================================================
   DASHBOARD.JS – Rollen-spezifisches Dashboard
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const user = initLayout('nav-dashboard');
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

    <div class="stats-grid">
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
      <div class="stat-card animate-fade-in" style="animation-delay:180ms">
        <div class="stat-card__icon stat-card__icon--info">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Ausbildungsfortschritt</div>
          <div class="stat-card__value">${fortschritt}%</div>
          <div class="stat-card__sub">bis ${user.ausbildungsEnde ? DateUtil.formatDate(user.ausbildungsEnde) : '–'}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div>
        <div class="card" style="margin-bottom:var(--sp-5)">
          <div class="card__header">
            <span class="card__title">Schnellzugriff</span>
          </div>
          <div class="card__body">
            <div class="quick-access">
              <a href="wochenansicht.html" class="quick-access-tile" style="animation-delay:0ms">
                <div class="quick-access-tile__icon">${Icons.book}</div>
                <div class="quick-access-tile__label">Wochenbericht</div>
                <div class="quick-access-tile__desc">KW ${kw} bearbeiten</div>
              </a>
              <a href="jahresansicht.html" class="quick-access-tile" style="animation-delay:40ms">
                <div class="quick-access-tile__icon">${Icons.calendar}</div>
                <div class="quick-access-tile__label">Jahresansicht</div>
                <div class="quick-access-tile__desc">Alle Wochen ${kwYear}</div>
              </a>
              <a href="ausbildungsstand.html" class="quick-access-tile" style="animation-delay:80ms">
                <div class="quick-access-tile__icon">${Icons.chart}</div>
                <div class="quick-access-tile__label">Ausbildungsstand</div>
                <div class="quick-access-tile__desc">Qualifikationen ansehen</div>
              </a>
              <a href="profil.html" class="quick-access-tile" style="animation-delay:120ms">
                <div class="quick-access-tile__icon">${Icons.user}</div>
                <div class="quick-access-tile__label">Mein Profil</div>
                <div class="quick-access-tile__desc">Profildaten einsehen</div>
              </a>
            </div>
          </div>
        </div>

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
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
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

    <!-- Hilfe & Tipps – FAQ-Accordion -->
    <section class="dashboard-faq" aria-labelledby="faqHeading">
      <div class="dashboard-faq__head">
        <h2 id="faqHeading" class="dashboard-faq__title">Hilfe &amp; Tipps</h2>
        <p class="dashboard-faq__sub">Antworten auf häufige Fragen rund um dein digitales Berichtsheft.</p>
      </div>
      <div class="accordion accordion--flush">
        <details class="accordion__item">
          <summary class="accordion__trigger">Wann muss ich mein Berichtsheft eintragen?</summary>
          <div class="accordion__panel"><div class="accordion__content">
            Trage deine Tätigkeiten möglichst täglich ein – spätestens jedoch am Ende der Woche.
            Eine zeitnahe Pflege ist Pflichtbestandteil deiner Ausbildung gemäß §&nbsp;13 BBiG und
            erleichtert dir die Freigabe in der <a href="wochenansicht.html" style="color:var(--pm-yellow-darker);font-weight:700;text-decoration:underline">Wochenansicht</a>.
          </div></div>
        </details>

        <details class="accordion__item">
          <summary class="accordion__trigger">Was passiert nach der Freigabe einer Woche?</summary>
          <div class="accordion__panel"><div class="accordion__content">
            Sobald du eine Woche freigibst, wechselt der Status auf
            <span class="badge badge--freigegeben" style="vertical-align:1px">Freigegeben</span>
            und dein/e Ausbildungsbeauftragte/r erhält die Woche zur Prüfung.
            Anschließend wird sie entweder
            <span class="badge badge--genehmigt" style="vertical-align:1px">Genehmigt</span>
            oder
            <span class="badge badge--abgelehnt" style="vertical-align:1px">Zurückgegeben</span> –
            zurückgegebene Wochen kannst du erneut bearbeiten und freigeben.
          </div></div>
        </details>

        <details class="accordion__item">
          <summary class="accordion__trigger">Wie überarbeite ich eine zurückgegebene Woche?</summary>
          <div class="accordion__panel"><div class="accordion__content">
            Öffne die betreffende Woche in der <a href="wochenansicht.html" style="color:var(--pm-yellow-darker);font-weight:700;text-decoration:underline">Wochenansicht</a>.
            Der Kommentar deines/r Ausbildungsbeauftragten erklärt, welche Anpassungen erforderlich
            sind. Nach der Korrektur gibst du die Woche einfach erneut frei – ein neuer Eintrag muss
            nicht angelegt werden.
          </div></div>
        </details>

        <details class="accordion__item">
          <summary class="accordion__trigger">Was bedeuten die Status-Farben?</summary>
          <div class="accordion__panel"><div class="accordion__content">
            <div style="display:grid;grid-template-columns:max-content 1fr;gap:var(--sp-2) var(--sp-4);align-items:center">
              <span class="badge badge--offen">Offen</span>
              <span>Eintrag begonnen oder leer – noch nicht zur Prüfung freigegeben.</span>
              <span class="badge badge--freigegeben">Freigegeben</span>
              <span>Wartet auf Prüfung durch den/die Ausbildungsbeauftragte/n.</span>
              <span class="badge badge--genehmigt">Genehmigt</span>
              <span>Geprüft und akzeptiert – diese Woche ist abgeschlossen.</span>
              <span class="badge badge--abgelehnt">Zurückgegeben</span>
              <span>Korrektur erforderlich – siehe Kommentar im Bericht.</span>
            </div>
          </div></div>
        </details>

        <details class="accordion__item">
          <summary class="accordion__trigger">Wo finde ich meinen Ausbildungsstand?</summary>
          <div class="accordion__panel"><div class="accordion__content">
            Unter <a href="ausbildungsstand.html" style="color:var(--pm-yellow-darker);font-weight:700;text-decoration:underline">Ausbildungsstand</a>
            siehst du Soll- und Ist-Stunden je Qualifikation, getrennt nach Betrieb und Berufsschule.
            Die Daten werden automatisch aus deinen freigegebenen Wochen ermittelt.
          </div></div>
        </details>
      </div>
    </section>
  `;

  setTimeout(() => {
    const bar = document.getElementById('ausbildungProgressBar');
    if (bar) bar.style.width = fortschritt + '%';
  }, 300);
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

    <div class="stats-grid">
      <div class="stat-card stat-card--accent animate-fade-in" style="animation-delay:0ms">
        <div class="stat-card__icon stat-card__icon--yellow">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Zur Abnahme</div>
          <div class="stat-card__value">${queue.length}</div>
          <div class="stat-card__sub">${queue.length === 0 ? 'Alles geprüft' : (queue.length === 1 ? 'Wartet auf dich' : 'Warten auf dich')}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:60ms">
        <div class="stat-card__icon stat-card__icon--info">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Aktive Azubis</div>
          <div class="stat-card__value">${meineAzubis.length}</div>
          <div class="stat-card__sub">${user.role === 'admin' ? 'im System' : 'aktuell zugewiesen'}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:120ms">
        <div class="stat-card__icon stat-card__icon--success">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Diese Woche genehmigt</div>
          <div class="stat-card__value">${genehmigtDieseWoche}</div>
          <div class="stat-card__sub">in KW ${kw}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" style="animation-delay:180ms">
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
      <!-- Posteingang: Prüfungen -->
      <div>
        <div class="card review-inbox animate-fade-in">
          <div class="card__header review-inbox__header">
            <div>
              <span class="card__title">Posteingang – Zu prüfende Berichtshefte</span>
              <p class="review-inbox__subtitle">Sortiert nach Wartedauer · älteste zuerst</p>
            </div>
            ${queue.length > 0 ? `<span class="badge badge--freigegeben">${queue.length} ${queue.length === 1 ? 'offen' : 'offen'}</span>` : ''}
          </div>
          <div class="review-list">
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

      <!-- Rechts: Meine Azubis + Aktivität -->
      <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
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
  document.querySelectorAll('.review-item[data-azubi-id][data-kw]').forEach(item => {
    item.addEventListener('click', () => {
      sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
      sessionStorage.setItem('gotoKW',      item.dataset.kw);
      sessionStorage.setItem('gotoYear',    item.dataset.year);
      window.location.href = 'wochenansicht.html';
    });
  });

  // Klick auf Azubi-Übersicht-Item: Zur aktuellen KW dieses Azubis
  document.querySelectorAll('.azubi-overview-item[data-azubi-id]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      sessionStorage.setItem('gotoAzubiId', item.dataset.azubiId);
      window.location.href = 'wochenansicht.html';
    });
  });
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
         data-azubi-id="${a.id}" data-kw="${w.kw}" data-year="${w.year}"
         style="animation-delay:${idx * 50}ms"
         tabindex="0" role="button"
         aria-label="Berichtsheft KW ${w.kw} von ${a.name} prüfen">
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

    html += `
      <div class="week-status-day${isWE ? ' week-status-day--weekend' : ''}">
        <span class="week-status-day__name">${days[i]}</span>
        <span class="week-status-day__date${isToday ? '" style="background:var(--pm-yellow);color:var(--pm-grey-900);border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center' : ''}">${d.getDate()}</span>
        <div class="week-status-day__bar">
          <div class="week-status-day__bar-fill${isFull ? ' week-status-day__bar-fill--full' : ''}" style="width:${pct}%"></div>
        </div>
        <span class="week-status-day__hours">${stunden ? stunden + ':00' : isWE ? '–' : (anwesenheit && anwesenheit !== 'anwesend' ? '–' : '0:00')}</span>
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
