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
          <span class="sidebar__logo-sub">Berichtsheft</span>
        </div>
      </div>
      <button class="sidebar__toggle" id="sidebarToggle" aria-label="Navigation einklappen">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6"/></svg>
      </button>
    </div>

    <nav class="sidebar__nav" aria-label="Hauptnavigation">
      <span class="sidebar__section-label">Übersicht</span>
      <a href="dashboard.html" class="sidebar__link" id="nav-dashboard">
        <span class="sidebar__link-icon">${Icon('dashboard')}</span>
        <span class="sidebar__link-label">Dashboard</span>
      </a>

      <span class="sidebar__section-label nav-berichtsheft-only">Berichtsheft</span>
      <a href="wochenansicht.html" class="sidebar__link nav-berichtsheft-only" id="nav-wochenansicht">
        <span class="sidebar__link-icon">${Icon('wochenansicht')}</span>
        <span class="sidebar__link-label">Wochenansicht</span>
      </a>
      <a href="jahresansicht.html" class="sidebar__link nav-berichtsheft-only" id="nav-jahresansicht">
        <span class="sidebar__link-icon">${Icon('jahresansicht')}</span>
        <span class="sidebar__link-label">Jahresansicht</span>
      </a>

      <span class="sidebar__section-label nav-azubi-only">Sonstiges</span>
      <a href="fahrgelderstattung.html" class="sidebar__link nav-azubi-only" id="nav-fahrgelderstattung">
        <span class="sidebar__link-icon">${Icon('document')}</span>
        <span class="sidebar__link-label">Fahrgelderstattung</span>
      </a>
      <a href="azubi-planer.html" class="sidebar__link nav-azubi-only" id="nav-abteilungsplan">
        <span class="sidebar__link-icon">${Icon('planer')}</span>
        <span class="sidebar__link-label">Abteilungsdurchlauf</span>
      </a>

      <div class="sidebar__divider nav-planer-only"></div>
      <span class="sidebar__section-label nav-planer-only">Verwaltung</span>
      <a href="azubi-planer.html" class="sidebar__link nav-planer-only" id="nav-planer">
        <span class="sidebar__link-icon">${Icon('planer')}</span>
        <span class="sidebar__link-label">Azubi-Planer</span>
      </a>
      <a href="berichtsheftverwaltung.html" class="sidebar__link nav-planer-only" id="nav-verwaltung">
        <span class="sidebar__link-icon">${Icon('verwaltung')}</span>
        <span class="sidebar__link-label">Berichtsheftverwaltung</span>
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

  /* Tablet-Auto-Collapse (769–1280px): beim echten Page-Load eingeklappt
     starten — unabhängig von localStorage('sidebarCollapsed'). Gegenstück
     zum Pre-Paint-Marker html.sidebar-init-collapsed (theme.js); die
     Klasse muss hier synchron sitzen, BEVOR app.js den Marker im
     requestAnimationFrame entfernt, sonst klappt die Sidebar nach dem
     ersten Frame sichtbar auf. Manuelles Aufklappen über den Toggle
     (app.js) funktioniert danach normal; SPA-Navigationen durchlaufen
     buildSidebar nicht erneut (router.js patcht initPage), der Session-
     Zustand bleibt also erhalten. localStorage wird hier bewusst NICHT
     beschrieben, damit die Desktop-Präferenz unangetastet bleibt. */
  if (window.matchMedia &&
      window.matchMedia('(min-width: 769px) and (max-width: 1280px)').matches) {
    sidebar.classList.add('collapsed');
  }

  // Tooltips für Collapsed-State: Label-Text als data-tooltip pflegen.
  sidebar.querySelectorAll('.sidebar__link').forEach(link => {
    const label = link.querySelector('.sidebar__link-label')?.textContent.trim();
    if (label) link.setAttribute('data-tooltip', label);
  });

  setupSidebarTooltips(sidebar);
  setupSidebarThemeToggle();
  if (typeof window.initRouter === 'function') window.initRouter(sidebar);

  /* Sidebar wurde komplett neu aufgebaut (innerHTML ersetzt) → das frische
     Logo-<img> ist wieder das gelbe Original. react-theme-layer.js lauscht
     hierauf und tönt das Logo (silk) erneut – mit gecachter Maske synchron,
     also ohne dass das Standard-Logo sichtbar wird. */
  try { window.dispatchEvent(new CustomEvent('pm-sidebar-rendered')); } catch (e) {}
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
  window.addEventListener('scroll', hide, { capture: true, passive: true });
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
