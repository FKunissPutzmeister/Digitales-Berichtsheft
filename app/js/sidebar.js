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
      <a href="ausbildungsstand.html" class="sidebar__link" id="nav-ausbildungsstand">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
        <span class="sidebar__link-label">Ausbildungsstand</span>
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

      <div class="sidebar__divider"></div>
      <a href="profil.html" class="sidebar__link" id="nav-profil">
        <span class="sidebar__link-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
        <span class="sidebar__link-label">Mein Profil</span>
      </a>
    </nav>

    <div class="sidebar__footer">
      <div class="sidebar__user">
        <div class="avatar avatar--sm" id="sidebarUserInitials">?</div>
        <div class="sidebar__user-info">
          <span class="sidebar__user-name" id="sidebarUserName">…</span>
          <span class="sidebar__user-role" id="sidebarUserRole">…</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById(activeNavId)?.classList.add('active');
}

function buildTopbar(breadcrumbs) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const crumbHtml = breadcrumbs.map((b, i) => {
    const isLast = i === breadcrumbs.length - 1;
    if (isLast) return `<span class="breadcrumb__item current">${b.label}</span>`;
    return `
      <a href="${b.href}" class="breadcrumb__item" style="text-decoration:none">${b.label}</a>
      <span class="breadcrumb__sep"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></span>
    `;
  }).join('');

  topbar.innerHTML = `
    <button class="topbar__menu-btn" id="mobileMenuBtn" aria-label="Menü">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="dashboard.html" class="breadcrumb__item" style="text-decoration:none">Putzmeister</a>
      <span class="breadcrumb__sep"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></span>
      ${crumbHtml}
    </nav>
    <div class="topbar__actions">
      <div class="dropdown">
        <button class="topbar__action-btn" id="notifBtn" aria-label="Benachrichtigungen">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          <span class="notif-badge hidden" id="notifBadge">0</span>
        </button>
        <div class="dropdown__menu dropdown__menu--notif" id="notifDropdown">
          <div class="notif-header">
            <span class="notif-header__title">Benachrichtigungen</span>
            <button class="notif-header__mark-all" id="notifMarkAllBtn" type="button">Alle gelesen</button>
          </div>
          <div class="notif-list" id="notifList"></div>
        </div>
      </div>
      <div class="dropdown">
        <button class="topbar__user-btn" id="topbarUserBtn">
          <div class="avatar avatar--sm" id="topbarUserInitials">?</div>
          <span class="topbar__user-name" id="topbarUserName">…</span>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;color:var(--pm-grey-400)"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="dropdown__menu" id="topbarUserDropdown">
          <a href="profil.html" class="dropdown__item">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Mein Profil
          </a>
          <div style="height:1px;background:var(--pm-grey-100);margin:4px 0"></div>
          <button class="dropdown__item dropdown__item--danger" id="logoutBtn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Abmelden
          </button>
        </div>
      </div>
    </div>
  `;
}

function initPage(navId, breadcrumbs) {
  buildSidebar(navId);
  buildTopbar(breadcrumbs);
  return initLayout(navId);
}
