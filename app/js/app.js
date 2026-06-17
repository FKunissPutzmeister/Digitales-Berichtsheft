/* ===================================================================
   APP.JS – Auth-Guard, Sidebar, Toast, globale Hilfsfunktionen
   =================================================================== */

/**
 * Verzögert fn-Aufrufe – verhindert übermäßige Ausführung bei Resize/Input.
 * @param {Function} fn
 * @param {number} delay - Millisekunden
 */
function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ── Auth Guard ── */
async function requireAuth() {
  const user = await DB.fetchCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

async function requireRole(...roles) {
  const user = await requireAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

/* Spiegelt die Fähigkeiten des Nutzers auf <html data-*> (für CSS-Gating),
   persistiert sie für den Pre-Paint-Read in theme.js (kein Flash beim nächsten
   Load) und blendet die Nav-Items zusätzlich per JS ein/aus (belt-and-suspenders). */
function applyCapabilities(caps) {
  const html = document.documentElement;
  const attrs = {
    'data-kann-planen':   caps.kannPlanen,
    'data-ist-ausbilder': caps.istAusbilder,
    'data-ist-azubi':     caps.istAzubi,
    'data-korrektur':     caps.korrektur,
  };
  for (const [attr, on] of Object.entries(attrs)) {
    if (on) html.setAttribute(attr, '1'); else html.removeAttribute(attr);
  }
  try {
    localStorage.setItem('capKannPlanen',   caps.kannPlanen   ? '1' : '0');
    localStorage.setItem('capIstAusbilder', caps.istAusbilder ? '1' : '0');
    localStorage.setItem('capIstAzubi',     caps.istAzubi     ? '1' : '0');
    localStorage.setItem('capKorrektur',    caps.korrektur    ? '1' : '0');
  } catch (e) { /* localStorage kann blockieren */ }
  document.querySelectorAll('.nav-planer-only').forEach(el => {
    el.style.display = caps.kannPlanen ? '' : 'none';
  });
  document.querySelectorAll('.nav-berichtsheft-only').forEach(el => {
    el.style.display = (caps.istAzubi || caps.korrektur) ? '' : 'none';
  });
  document.querySelectorAll('.nav-azubi-only').forEach(el => {
    el.style.display = caps.istAzubi ? '' : 'none';
  });
}

/* ── Sidebar & Navigation ── */
async function initLayout(activeNavId) {
  const user = await requireAuth();
  if (!user) return null;

  // Sidebar-Toggle
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const menuBtn = document.getElementById('mobileMenuBtn');

  const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (isCollapsed && window.innerWidth > 768) {
    sidebar?.classList.add('collapsed');
  }

  // Synchron-Marker aus dem <head>-Skript wieder entfernen, NACHDEM
  // die echte .collapsed-Klasse auf dem <aside> liegt. Dadurch wechseln
  // wir lautlos vom HTML-Marker auf die Element-Klasse, ohne dass eine
  // Width-Transition triggert (der berechnete Wert ist in beiden
  // Zuständen identisch).
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('sidebar-init-collapsed');
  });

  toggleBtn?.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', collapsed);
  });

  menuBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('mobile-open');
    overlay?.classList.toggle('visible');
  });

  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('mobile-open');
    overlay?.classList.remove('visible');
  });

  // Aktiver Nav-Link
  if (activeNavId) {
    const activeLink = document.getElementById(activeNavId);
    activeLink?.classList.add('active');
  }

  // Nutzerinfo einsetzen
  const userName = document.getElementById('sidebarUserName');
  const userRole = document.getElementById('sidebarUserRole');
  const userInitials = document.getElementById('sidebarUserInitials');
  const topbarName = document.getElementById('topbarUserName');
  const topbarInitials = document.getElementById('topbarUserInitials');

  if (userName) userName.textContent = user.name;
  if (userRole) {
    // Rollen-Badge: kleine farbige Pill, Farb-Variante per data-role
    const label = ROLE_LABELS[user.role] || user.role;
    userRole.innerHTML = `<span class="role-badge" data-role="${user.role}">${label}</span>`;
  }
  if (userInitials) userInitials.textContent = user.initials || user.name.split(' ').map(n => n[0]).join('');
  if (topbarName) topbarName.textContent = user.name;
  if (topbarInitials) topbarInitials.textContent = user.initials || user.name.split(' ').map(n => n[0]).join('');

  // Fähigkeits-Gating der Navigation.
  // "Korrektur-berechtigt" = Ausbilder ODER hat (aktuelle/frühere) Zuweisungen
  // als Verantwortliche/r. Pure Planer (kannPlanen, kein Azubi, keine Zuweisung)
  // sehen daher KEIN Berichtsheft-Menü.
  let istKorrektor = !!user.istAusbilder;
  if (!istKorrektor && !user.istAzubi) {
    try {
      const z = await DB.getZuweisungenFuerAusbilder(user.id);
      istKorrektor = Array.isArray(z) && z.length > 0;
    } catch (e) { /* ohne Zuweisungsdaten: konservativ kein Korrektur-Menü */ }
  }
  applyCapabilities({
    kannPlanen:   !!user.kannPlanen,
    istAusbilder: !!user.istAusbilder,
    istAzubi:     !!user.istAzubi,
    korrektur:    istKorrektor,
  });

  // Abmelden-Button via Event-Delegation an document.body. Der Button
  // wird je nach Seite zu unterschiedlichen Zeitpunkten in den DOM
  // gehängt (auf der Profil-Seite z.B. erst nach render(), also NACH
  // initLayout). Direktes addEventListener auf getElementById('logoutBtn')
  // greift dort ins Leere — daher Delegation.
  if (!document.body.dataset.logoutBound) {
    document.body.dataset.logoutBound = '1';
    document.body.addEventListener('click', async (e) => {
      if (e.target.closest('#logoutBtn')) {
        await DB.logout();
        window.location.href = 'index.html';
      }
    });
  }

  // Nutzer-Dropdown
  const userBtn = document.getElementById('topbarUserBtn');
  const userDropdown = document.getElementById('topbarUserDropdown');
  userBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    // Andere Dropdowns schließen, wenn dieses geöffnet wird
    if (!userDropdown?.classList.contains('open')) {
      document.querySelectorAll('.dropdown__menu.open').forEach(m => m.classList.remove('open'));
    }
    userDropdown?.classList.toggle('open');
  });
  document.addEventListener('click', () => userDropdown?.classList.remove('open'));

  // Benachrichtigungen
  initNotifications(user);

  // Topbar-Schatten beim Scrollen (passiv, sehr günstig – nur Class-Toggle).
  // Sorgt für die dezente Tiefenwirkung gegenüber dem Inhalt.
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    let isScrolled = false;
    const onScroll = () => {
      const shouldBe = window.scrollY > 4;
      if (shouldBe !== isScrolled) {
        isScrolled = shouldBe;
        topbar.classList.toggle('is-scrolled', shouldBe);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Theme-Toggle wandert in die DS-Topbar (js/topbar-ds.js) — alter
  // Button neben dem Mitteilungssymbol entfällt damit.
  // initThemeToggle();

  return user;
}

/* ── Theme-Toggle (Dark/Light) ────────────────────────────────────────
   Fügt einen Button in die Topbar ein. Theme-Init + Persistierung
   passiert in js/theme.js (im <head> geladen). */
function initThemeToggle() {
  const actions = document.querySelector('.topbar__actions');
  if (!actions || document.getElementById('themeToggleBtn')) return;
  if (!window.PMTheme) return;

  const SUN = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
  const MOON = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  const btn = document.createElement('button');
  btn.id = 'themeToggleBtn';
  btn.className = 'topbar__action-btn theme-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(window.PMTheme.get() === 'dark'));

  function syncIcon() {
    const isDark = window.PMTheme.get() === 'dark';
    btn.innerHTML = isDark ? SUN : MOON;
    btn.setAttribute('aria-label',
      isDark ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren');
    btn.setAttribute('data-tooltip',
      isDark ? 'Helles Design' : 'Dunkles Design');
    btn.setAttribute('aria-pressed', String(isDark));
  }
  syncIcon();

  btn.addEventListener('click', () => {
    window.PMTheme.toggle();
    syncIcon();
  });

  // Auf Theme-Änderungen aus anderen Quellen (Tab-Sync, System) reagieren
  window.addEventListener('pm-theme-change', syncIcon);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncIcon);
  }

  // An den Anfang der Topbar-Aktionen einsetzen (links neben Notifications)
  actions.insertBefore(btn, actions.firstChild);
}

/* ── Benachrichtigungen ───────────────────────────────────────────────
   Erwartet im Topbar-Markup:
     #notifBtn          – die Glocke
     #notifBadge        – Counter-Badge an der Glocke
     #notifDropdown     – das ausklappende Menü
     #notifList         – Container für die Notification-Items
     #notifMarkAllBtn   – „Alle gelesen"-Button im Header
   Wird von initLayout() pro Page einmal aufgerufen. */
async function initNotifications(user) {
  const btn = document.getElementById('notifBtn');
  const badge = document.getElementById('notifBadge');
  const dropdown = document.getElementById('notifDropdown');
  const list = document.getElementById('notifList');
  const markAllBtn = document.getElementById('notifMarkAllBtn');
  if (!btn || !dropdown || !list) return;

  function relativeTime(ts) {
    if (!ts) return '';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60)        return 'gerade eben';
    if (diffSec < 3600)      return `vor ${Math.floor(diffSec / 60)} Min.`;
    if (diffSec < 86400)     return `vor ${Math.floor(diffSec / 3600)} Std.`;
    if (diffSec < 86400 * 2) return 'gestern';
    if (diffSec < 86400 * 7) return `vor ${Math.floor(diffSec / 86400)} Tagen`;
    return new Date(ts).toLocaleDateString('de-DE');
  }

  const ICON = {
    genehmigt: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    abgelehnt: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  };

  async function renderItem(b) {
    const isApproved = b.type === 'genehmigt';
    const from = b.fromUserId ? await DB.getUser(b.fromUserId) : null;
    const fromName = from ? from.name : 'Ausbilder/in';
    const title = isApproved
      ? `KW ${b.kw}/${b.year} wurde genehmigt`
      : `KW ${b.kw}/${b.year} wurde zurückgegeben`;
    const meta = `${fromName} · ${relativeTime(b.timestamp)}`;
    const preview = !isApproved && b.kommentar
      ? `<div class="notif-item__preview">${escapeHtmlSafe(b.kommentar)}</div>`
      : '';
    return `
      <button type="button" class="notif-item${b.gelesen ? '' : ' notif-item--unread'}" data-id="${b.id}">
        <span class="notif-item__icon notif-item__icon--${isApproved ? 'success' : 'error'}">
          ${ICON[b.type] || ICON.genehmigt}
        </span>
        <span class="notif-item__body">
          <span class="notif-item__title">${title}</span>
          <span class="notif-item__meta">${meta}</span>
          ${preview}
        </span>
        ${b.gelesen ? '' : '<span class="notif-item__dot" aria-label="ungelesen"></span>'}
      </button>
    `;
  }

  function escapeHtmlSafe(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function render() {
    const items = await DB.getBenachrichtigungenFuerUser(user.id);
    const unread = items.filter(b => !b.gelesen).length;

    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (markAllBtn) {
      markAllBtn.disabled = unread === 0;
    }

    if (items.length === 0) {
      list.innerHTML = `
        <div class="notif-empty">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          <p class="notif-empty__title">Keine Benachrichtigungen</p>
          <p class="notif-empty__text">Hier erscheinen Updates zu deinen Berichtsheften.</p>
        </div>`;
      return;
    }

    list.innerHTML = (await Promise.all(items.slice(0, 30).map(renderItem))).join('');

    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = parseInt(el.dataset.id);
        const item = items.find(b => b.id === id);
        if (!item) return;
        await DB.markBenachrichtigungGelesen(id);
        // Navigations-Hinweise an wochenansicht.js übergeben
        if (item.kw)        sessionStorage.setItem('gotoKW',    String(item.kw));
        if (item.year)      sessionStorage.setItem('gotoYear',  String(item.year));
        if (item.azubiId)   sessionStorage.setItem('gotoAzubiId', String(item.azubiId));
        window.location.href = 'wochenansicht.html';
      });
    });
  }

  // Glocken-Klick → Dropdown toggeln (und andere Dropdowns schließen)
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const wasOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.dropdown__menu.open').forEach(m => m.classList.remove('open'));
    if (!wasOpen) {
      await render();
      dropdown.classList.add('open');
    }
  });

  // Click außerhalb schließt das Menü
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
  // ESC schließt das Menü
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });

  // „Alle gelesen"-Button
  markAllBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await DB.markAlleBenachrichtigungenGelesen(user.id);
    await render();
  });

  // Initial-Render (für korrekten Badge-Stand sofort beim Pageload)
  await render();
}

/* ── Toast-System ── */
const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(type, title, msg = '') {
    this.init();
    const icons = {
      success: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      error:   `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      info:    `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      warning: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <div class="toast__icon">${icons[type] || icons.info}</div>
      <div class="toast__content">
        <div class="toast__title">${title}</div>
        ${msg ? `<div class="toast__msg">${msg}</div>` : ''}
      </div>
    `;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  success(title, msg) { this.show('success', title, msg); },
  error(title, msg)   { this.show('error', title, msg); },
  info(title, msg)    { this.show('info', title, msg); },
  warning(title, msg) { this.show('warning', title, msg); },
};

/* ── Modal-Helfer ── */
const Modal = {
  open(id) {
    document.getElementById(id)?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close(id) {
    document.getElementById(id)?.classList.remove('open');
    document.body.style.overflow = '';
  },
  closeAll() {
    document.querySelectorAll('.modal-overlay.open').forEach(el => {
      el.classList.remove('open');
    });
    document.body.style.overflow = '';
  },
  init() {
    // Idempotent: darf nach jeder SPA-Navigation erneut laufen, ohne
    // Handler doppelt zu binden. Bereits verdrahtete Elemente tragen
    // data-modal-bound; der ESC-Listener wird nur EINMAL global gesetzt.
    // Close on overlay-click
    document.querySelectorAll('.modal-overlay:not([data-modal-bound])').forEach(overlay => {
      overlay.dataset.modalBound = '1';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) Modal.closeAll();
      });
    });
    // Close buttons
    document.querySelectorAll('.modal__close:not([data-modal-bound]), [data-modal-close]:not([data-modal-bound])').forEach(btn => {
      btn.dataset.modalBound = '1';
      btn.addEventListener('click', Modal.closeAll);
    });
    // ESC (nur einmal pro Seitensession registrieren)
    if (!Modal._escBound) {
      Modal._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') Modal.closeAll();
      });
    }
  }
};

/* ── Tab-System ── */
function initTabs(containerSelector) {
  const containers = document.querySelectorAll(containerSelector || '.tabs-container');
  containers.forEach(container => {
    const btns = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.tab-panel');
    btns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        panels[i]?.classList.add('active');
      });
    });
  });
}

/* ── Konstanten ── */
const ROLE_LABELS = {
  azubi:     'Auszubildende/r',
  ausbilder: 'Ausbilder/in',
  admin:     'Administrator',
};

const ANWESENHEIT_OPTS = [
  'anwesend', 'Urlaub', 'krank', 'Feiertag',
  'sonstige Abwesenheit',
];

const ORT_OPTS = ['', 'Betrieb', 'Schule', 'Betrieb/Schule', 'Zuhause', 'Dienstreise'];

/* ── Format-Hilfsfunktionen ── */
function formatHours(minuten) {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return m > 0 ? `${h}:${String(m).padStart(2, '0')} Std.` : `${h} Std.`;
}

function formatHoursDecimal(dezimal) {
  const h = Math.floor(dezimal);
  const m = Math.round((dezimal - h) * 60);
  if (m === 0) return `${h}:00 Std.`;
  return `${h}:${String(m).padStart(2, '0')} Std.`;
}

function formatStunden(raw) {
  if (!raw && raw !== 0) return '–';
  const str = String(raw);
  if (str.length <= 2) return str + ':00';
  const h = str.slice(0, -2);
  const m = str.slice(-2);
  return `${parseInt(h, 10)}:${m}`;
}

function getStatusLabel(status) {
  const map = {
    offen: 'Offen',
    freigegeben: 'Freigegeben',
    genehmigt: 'Genehmigt',
    abgelehnt: 'Abgelehnt',
  };
  return map[status] || status;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  return 'Guten Abend';
}

/* ── SVG Icons (zentral) ── */
const Icons = {
  home: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`,
  book: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
  calendar: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  chart: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  folder: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  users: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path stroke-linecap="round" stroke-linejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87"/><path stroke-linecap="round" stroke-linejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  user: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  logout: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>`,
  bell: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>`,
  chevronLeft: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`,
  chevronDown: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
  menu: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  check: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  plus: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  download: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>`,
  upload: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>`,
  save: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  settings: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  info: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  eye: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  trash: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  edit: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  filter: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  search: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  lock: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  mail: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  building: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  clock: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  arrowRight: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  collapse: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6"/></svg>`,
  expand: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/><polyline points="15 18 21 12 15 6"/></svg>`,
  paperclip: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
};

/* ===================================================================
   PMSelect – moderner Dropdown-Ersatz für native <select>
   =================================================================== */
function _pmEscapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

class PMSelect {
  constructor(nativeSelect) {
    this.native = nativeSelect;
    this.native.dataset.pmEnhanced = 'true';
    this.native._pmInstance = this;
    this.query = '';
    this.queryTimer = null;

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'pm-select';
    // Klassen vom nativen <select> übernehmen für Kontext (.day-card__select, .form-control etc.)
    nativeSelect.classList.forEach(c => this.wrapper.classList.add(c));
    if (nativeSelect.classList.contains('day-card__select')) this.wrapper.classList.add('pm-select--sm');
    if (nativeSelect.classList.contains('form-control'))    this.wrapper.classList.add('pm-select--block');

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'pm-select__trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');

    this.label = document.createElement('span');
    this.label.className = 'pm-select__label';
    this.trigger.appendChild(this.label);

    const chev = document.createElement('span');
    chev.className = 'pm-select__chevron';
    chev.setAttribute('aria-hidden', 'true');
    chev.innerHTML = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    this.trigger.appendChild(chev);

    this.menu = document.createElement('div');
    this.menu.className = 'pm-select__menu';
    this.menu.setAttribute('role', 'listbox');
    this.menu.hidden = true;

    // <select> in den Wrapper verschieben, daneben Trigger einfügen
    nativeSelect.parentNode.insertBefore(this.wrapper, nativeSelect);
    this.wrapper.appendChild(nativeSelect);
    this.wrapper.appendChild(this.trigger);

    this.outsideClickHandler = (e) => {
      if (!this.wrapper.contains(e.target) && !this.menu.contains(e.target)) this.close();
    };
    this.escapeHandler = (e) => { if (e.key === 'Escape' && !this.menu.hidden) { this.close(); this.trigger.focus(); } };
    this.repositionHandler = () => this.position();

    this.attachEvents();
    this.rebuildOptions();
    this.syncFromNative();
    this.observeNative();
  }

  rebuildOptions() {
    this.query = '';
    this.menu.innerHTML = '';
    Array.from(this.native.options).forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-select__option';
      btn.dataset.value = opt.value;
      btn.dataset.idx = String(idx);
      btn.setAttribute('role', 'option');
      btn.disabled = opt.disabled;
      const isPlaceholder = opt.value === '' || (opt.textContent || '').trim().startsWith('–');
      if (isPlaceholder) btn.classList.add('pm-select__option--placeholder');

      const check = document.createElement('span');
      check.className = 'pm-select__option-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';

      const text = document.createElement('span');
      text.className = 'pm-select__option-text';
      text.textContent = opt.textContent;
      btn._pmLabel = opt.textContent;
      btn.hidden = false;

      btn.appendChild(check);
      btn.appendChild(text);
      this.menu.appendChild(btn);
    });
  }

  // Filtert die Optionen per Wort-Präfix (Vor- ODER Nachname) und hebt den
  // getroffenen Präfix hellgelb hervor. Leere Query → alle sichtbar, kein Markup.
  filterByQuery() {
    const q = this.query;
    const ql = q.toLowerCase();
    this.menu.querySelectorAll('.pm-select__option').forEach(btn => {
      const textEl = btn.querySelector('.pm-select__option-text');
      const label = (btn._pmLabel != null) ? btn._pmLabel : textEl.textContent;
      if (!q) { textEl.textContent = label; btn.hidden = false; return; }
      let matched = false;
      const html = label.split(/(\s+)/).map(tok => {
        if (/^\s+$/.test(tok)) return _pmEscapeHtml(tok);
        if (tok.toLowerCase().startsWith(ql)) {
          matched = true;
          return `<mark class="pm-select__hl">${_pmEscapeHtml(tok.slice(0, q.length))}</mark>${_pmEscapeHtml(tok.slice(q.length))}`;
        }
        return _pmEscapeHtml(tok);
      }).join('');
      btn.hidden = !matched;
      if (matched) textEl.innerHTML = html;
    });
  }
  // Tippen sammelt sich in einem unsichtbaren Puffer (verfällt nach 1,5 s).
  // Space NICHT abfangen (bleibt Auswahl/öffnen). Liefert true, wenn behandelt.
  typeAhead(e) {
    if (e.key === 'Backspace') { e.preventDefault(); this.query = this.query.slice(0, -1); this._afterQuery(); return true; }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.query += e.key;
      this._afterQuery();
      return true;
    }
    return false;
  }
  _afterQuery() {
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => { this.query = ''; this.filterByQuery(); }, 1500);
    this.filterByQuery();
    const fv = this.menu.querySelector('.pm-select__option:not(:disabled):not([hidden])');
    if (fv) fv.focus();
  }

  attachEvents() {
    this.trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this.menu.hidden) this.open();
        this.focusFirst();
      }
      if (this.menu.hidden && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.open();
        this.typeAhead(e);
      }
    });

    this.menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.pm-select__option');
      if (!opt || opt.disabled) return;
      this.setValue(opt.dataset.value);
      this.close();
      this.trigger.focus();
    });

    this.menu.addEventListener('keydown', (e) => {
      if (this.typeAhead(e)) return;
      const focused = document.activeElement;
      const options = Array.from(this.menu.querySelectorAll('.pm-select__option:not(:disabled):not([hidden])'));
      if (!options.length) return;
      const idx = options.indexOf(focused);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        options[(idx + 1) % options.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        options[(idx - 1 + options.length) % options.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        options[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        options[options.length - 1]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focused?.classList.contains('pm-select__option')) {
          this.setValue(focused.dataset.value);
          this.close();
          this.trigger.focus();
        }
      } else if (e.key === 'Tab') {
        this.close();
      }
    });

    // Native <select>-Disabled-Änderungen spiegeln
    this.disabledObserver = new MutationObserver(() => this.syncFromNative());
    this.disabledObserver.observe(this.native, { attributes: true, attributeFilter: ['disabled'] });
  }

  observeNative() {
    // Falls externer Code <option>-Liste oder selected-Attribute ändert, neu aufbauen
    this.optionsObserver = new MutationObserver(() => {
      this.rebuildOptions();
      this.syncFromNative();
    });
    this.optionsObserver.observe(this.native, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });
  }

  syncFromNative() {
    this.trigger.disabled = this.native.disabled;

    const value = this.native.value;
    const selectedOpt = Array.from(this.native.options).find(o => o.value === value);
    const labelText = selectedOpt ? selectedOpt.textContent : '';
    const isPlaceholder = !labelText || labelText.trim().startsWith('–') || labelText.trim() === '';
    this.label.textContent = labelText || (this.native.options[0]?.textContent || '');
    this.label.classList.toggle('pm-select__label--placeholder', isPlaceholder);

    this.menu.querySelectorAll('.pm-select__option').forEach(el => {
      const sel = el.dataset.value === value;
      el.classList.toggle('pm-select__option--selected', sel);
      el.setAttribute('aria-selected', String(sel));
    });
  }

  setValue(value) {
    this.native.value = value;
    this.syncFromNative();
    this.native.dispatchEvent(new Event('change', { bubbles: true }));
    this.native.dispatchEvent(new Event('input', { bubbles: true }));
  }

  position() {
    const rect = this.trigger.getBoundingClientRect();
    const menuMaxH = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < menuMaxH + 12 && rect.top > spaceBelow;

    this.menu.style.left = rect.left + 'px';
    this.menu.style.minWidth = rect.width + 'px';
    this.menu.style.maxWidth = Math.max(rect.width, 320) + 'px';

    if (placeAbove) {
      this.menu.style.top = '';
      this.menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      this.menu.style.bottom = '';
      this.menu.style.top = (rect.bottom + 4) + 'px';
    }
  }

  open() {
    if (this.native.disabled) return;
    // Andere offene Menüs zuerst schließen
    PMSelect.closeAll();
    document.body.appendChild(this.menu);
    this.menu.hidden = false;
    this.query = '';
    this.filterByQuery();
    this.position();
    this.trigger.setAttribute('aria-expanded', 'true');
    this.wrapper.classList.add('pm-select--open');
    PMSelect._openInstance = this;

    document.addEventListener('mousedown', this.outsideClickHandler);
    document.addEventListener('keydown', this.escapeHandler);
    window.addEventListener('scroll', this.repositionHandler, { capture: true, passive: true });
    window.addEventListener('resize', this.repositionHandler);
  }

  close() {
    if (this.menu.hidden) return;
    clearTimeout(this.queryTimer);
    this.query = '';
    this.menu.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.wrapper.classList.remove('pm-select--open');
    if (this.menu.parentElement === document.body) {
      // Menü zurück in den Wrapper für korrekte DOM-Hygiene
      this.wrapper.appendChild(this.menu);
    }
    if (PMSelect._openInstance === this) PMSelect._openInstance = null;

    document.removeEventListener('mousedown', this.outsideClickHandler);
    document.removeEventListener('keydown', this.escapeHandler);
    window.removeEventListener('scroll', this.repositionHandler, { capture: true });
    window.removeEventListener('resize', this.repositionHandler);
  }

  destroy() {
    this.close();
    if (this.optionsObserver) this.optionsObserver.disconnect();
    if (this.disabledObserver) this.disabledObserver.disconnect();
    clearTimeout(this.queryTimer);
  }

  toggle() {
    if (this.menu.hidden) this.open();
    else this.close();
  }

  focusFirst() {
    const sel = this.menu.querySelector('.pm-select__option--selected:not(:disabled)');
    const first = this.menu.querySelector('.pm-select__option:not(:disabled)');
    (sel || first)?.focus();
  }

  static closeAll() {
    if (PMSelect._openInstance) PMSelect._openInstance.close();
  }

  static enhance(root = document) {
    const selects = root.querySelectorAll('select:not([data-pm-enhanced]):not([data-pm-skip])');
    selects.forEach(sel => {
      // Selects in Quill-Toolbars o.ä. nicht anfassen
      if (sel.closest('.ql-toolbar')) return;
      try { new PMSelect(sel); } catch (err) { console.warn('PMSelect failed for', sel, err); }
    });
  }
}
PMSelect._openInstance = null;

/* Auto-Enhancement: bei Seitenload und bei dynamisch eingefügten Selects */
const _pmSelectMutationObserver = new MutationObserver(mutations => {
  let needsEnhance = false;
  for (const m of mutations) {
    if (m.type !== 'childList') continue;
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'SELECT' && !node.dataset.pmEnhanced) { needsEnhance = true; break; }
      if (node.querySelector && node.querySelector('select:not([data-pm-enhanced])')) { needsEnhance = true; break; }
    }
    if (needsEnhance) break;
  }
  if (needsEnhance) PMSelect.enhance();
});

/* Auto-Initialisierung bei Seitenload */
document.addEventListener('DOMContentLoaded', () => {
  Modal.init();
  PMSelect.enhance();
  _pmSelectMutationObserver.observe(document.body, { childList: true, subtree: true });
});
