/* ===================================================================
   SIDEBAR.JS – Generiert Sidebar & Topbar für alle inneren Seiten
   =================================================================== */

function buildSidebar(activeNavId) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar__header">
      <div class="sidebar__logo-wrap">
        <img src="../Corporate Design/Digital Logo_png/Social Logo/200 x 200 px.png"
             alt="PM" class="sidebar__logo-mark"
             onerror="this.style.display='none'">
        <div class="sidebar__logo-text">
          <span class="sidebar__logo-name">Putzmeister</span>
          <span class="sidebar__logo-sub">Digitales Berichtsheft</span>
        </div>
      </div>
      <button class="sidebar__toggle" id="sidebarToggle" aria-label="Navigation einklappen">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6"/></svg>
      </button>
    </div>

    <nav class="sidebar__nav" aria-label="Hauptnavigation">
      <span class="sidebar__section-label">Übersicht</span>
      <a href="dashboard.html" class="sidebar__link" id="nav-dashboard">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg></span>
        <span class="sidebar__link-label">Dashboard</span>
      </a>

      <span class="sidebar__section-label">Berichtsheft</span>
      <a href="wochenansicht.html" class="sidebar__link" id="nav-wochenansicht">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg></span>
        <span class="sidebar__link-label">Wochenansicht</span>
      </a>
      <a href="jahresansicht.html" class="sidebar__link" id="nav-jahresansicht">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        <span class="sidebar__link-label">Jahresansicht</span>
      </a>

      <div class="sidebar__divider"></div>
      <span class="sidebar__section-label nav-ausbilder-only">Verwaltung</span>
      <a href="berichtsheftverwaltung.html" class="sidebar__link nav-ausbilder-only" id="nav-verwaltung">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
        <span class="sidebar__link-label">Berichtsheftverwaltung</span>
      </a>
      <a href="azubi-planer.html" class="sidebar__link nav-ausbilder-only" id="nav-planer">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        <span class="sidebar__link-label">Azubi-Planer</span>
      </a>

    </nav>

    <div class="sidebar__footer">
      <a href="profil.html" class="sidebar__user-link" id="nav-profil"
         aria-label="Mein Profil" title="Mein Profil">
        <div class="avatar avatar--sm" id="sidebarUserInitials">?</div>
        <span class="sidebar__user-name" id="sidebarUserName">…</span>
      </a>
      <button class="sidebar__icon-btn sidebar__theme-toggle" id="sidebarThemeToggle" type="button"
              aria-label="Hell-/Dunkel-Modus umschalten" title="Hell / Dunkel">
        <svg class="sidebar__theme-icon sidebar__theme-icon--sun"
             fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        </svg>
        <svg class="sidebar__theme-icon sidebar__theme-icon--moon"
             fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  `;

  document.getElementById(activeNavId)?.classList.add('active');

  // Tooltips für Collapsed-State: Label-Text als data-tooltip pflegen.
  sidebar.querySelectorAll('.sidebar__link').forEach(link => {
    const label = link.querySelector('.sidebar__link-label')?.textContent.trim();
    if (label) link.setAttribute('data-tooltip', label);
  });

  setupSidebarTooltips(sidebar);
  setupSidebarThemeToggle();
}

/* Theme-Toggle im Sidebar-Footer.
   – Klickt zwischen 'light' und 'dark' (PMTheme aus theme.js).
   – Icon-Wechsel passiert per CSS via [data-theme="…"]-Selector.
   – Tooltip im Collapsed-Zustand kommt aus dem nativen title-Attribut. */
function setupSidebarThemeToggle() {
  const btn = document.getElementById('sidebarThemeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!window.PMTheme) return;
    const next = window.PMTheme.get() === 'dark' ? 'light' : 'dark';
    window.PMTheme.set(next);
  });
}

/* Zeigt ein floating Tooltip rechts neben dem Icon, sobald die Sidebar
   eingeklappt ist und der Cursor über einem Link verweilt (250 ms Delay).
   Tooltip-Element hängt am <body>, damit overflow-x:hidden des Navs es
   nicht abschneidet. */
function setupSidebarTooltips(sidebar) {
  let tooltip = document.querySelector('.sidebar-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'sidebar-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
  }
  let hideTimer = null;
  let showTimer = null;

  function isCollapsed() {
    return sidebar.classList.contains('collapsed');
  }

  function hide() {
    clearTimeout(showTimer);
    tooltip.classList.remove('visible');
  }

  function show(link) {
    if (!isCollapsed()) return;
    const text = link.getAttribute('data-tooltip');
    if (!text) return;
    const rect = link.getBoundingClientRect();
    tooltip.textContent = text;
    tooltip.style.top  = `${rect.top + rect.height / 2}px`;
    tooltip.style.left = `${rect.right + 12}px`;
    tooltip.style.transform = 'translateY(-50%) translateX(0)';
    requestAnimationFrame(() => tooltip.classList.add('visible'));
  }

  sidebar.addEventListener('mouseover', (e) => {
    const link = e.target.closest('.sidebar__link[data-tooltip]');
    if (!link || !isCollapsed()) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(link), 250);
  });
  sidebar.addEventListener('mouseout', (e) => {
    const link = e.target.closest('.sidebar__link[data-tooltip]');
    if (!link) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, 80);
  });
  sidebar.addEventListener('focusin', (e) => {
    const link = e.target.closest('.sidebar__link[data-tooltip]');
    if (link) show(link);
  });
  sidebar.addEventListener('focusout', hide);
  // Beim Toggle ein-/auszuklappen direkt verstecken
  document.addEventListener('click', (e) => {
    if (e.target.closest('#sidebarToggle')) hide();
  });
  window.addEventListener('scroll', hide, true);
}

/* Topbar = jetzt der DS-Header (sc-nav). Die in-page #topbar-Leiste ist
   per CSS ausgeblendet; wir reichen die Breadcrumb-Daten nur noch
   weiter an topbar-ds.js → setBreadcrumbs(). Notifications + User-Pill
   sind ebenfalls in die sc-nav gewandert und behalten ihre IDs, damit
   app.js → initLayout()/initNotifications() unverändert greifen. */
function buildTopbar(breadcrumbs) {
  // Falls topbar-ds.js den Header noch nicht initialisiert hat (z. B.
  // weil die Script-Reihenfolge unter Caching variiert), kurz retry'en.
  function trySet(attempt) {
    if (typeof window.setBreadcrumbs === 'function') {
      window.setBreadcrumbs(breadcrumbs || []);
      return;
    }
    if (attempt < 10) setTimeout(function () { trySet(attempt + 1); }, 60);
  }
  trySet(0);
}

async function initPage(navId, breadcrumbs) {
  buildSidebar(navId);
  buildTopbar(breadcrumbs);
  return initLayout(navId);
}
