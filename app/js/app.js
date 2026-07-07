/* ===================================================================
   APP.JS – Auth-Guard, Sidebar, Toast, globale Hilfsfunktionen
   =================================================================== */

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
  if (user.role !== 'developer' && !roles.includes(user.role)) {
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
  document.querySelectorAll('.nav-durchlauf').forEach(el => {
    el.style.display = (caps.istAzubi || caps.istAusbilder) ? '' : 'none';
  });
  document.querySelectorAll('.nav-developer-only').forEach(el => {
    el.style.display = caps.role === 'developer' ? '' : 'none';
  });
  // DH-Studenten brauchen kein Dashboard – auf der (einzig erreichbaren)
  // Profil-Seite den Dashboard-Link ausblenden.
  if (caps.istDhStudent) {
    const dash = document.getElementById('nav-dashboard');
    if (dash) dash.style.display = 'none';
  }
}

/* Dev-View-Switch (Sidebar-Fußzeile). Nur für serverseitig berechtigte Nutzer
   (user.devViewEligible). Beim Umlegen wird der Wunsch an den Server geschickt
   und die Seite neu geladen, damit Rollen-Gating, Nav und evtl. Redirects sauber
   für die neue effektive Rolle greifen. Default = aus (= Azubi-Ansicht). */
function setupDevViewSwitch(user) {
  const wrap = document.getElementById('sidebarDevView');
  const toggle = document.getElementById('devViewToggle');
  if (!wrap || !toggle) return;
  if (!user.devViewEligible) { wrap.style.display = 'none'; return; }

  wrap.style.display = '';
  toggle.checked = !!user.devViewActive;

  if (toggle.dataset.bound) return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    try {
      await DB.setDevView(toggle.checked);
      // Fähigkeits-Cache SYNCHRON auf die neue Ansicht bringen, BEVOR neu
      // geladen wird: sonst liest der Pre-Paint (theme.js) noch die alten
      // cap*-localStorage-Werte und die Planer-/Verwaltungs-Reiter blitzen
      // beim Wechsel developer→azubi kurz auf. fetchCurrentUser liefert die
      // neue effektive Rolle; applyCapabilities schreibt die cap*-Keys.
      const u = await DB.fetchCurrentUser();
      if (u) applyCapabilities({
        kannPlanen:   !!u.kannPlanen,
        istAusbilder: !!u.istAusbilder,
        istAzubi:     !!u.istAzubi,
        istDhStudent: !!u.istDhStudent,
        korrektur:    !!u.istAusbilder,
        role:         u.role,
      });
      window.location.reload();
    } catch (e) {
      toggle.checked = !toggle.checked; // Zustand zurückdrehen
      toggle.disabled = false;
      if (window.Toast) Toast.error('Ansicht konnte nicht gewechselt werden: ' + e.message);
    }
  });
}

/* ── Sidebar & Navigation ── */
async function initLayout(activeNavId) {
  const user = await requireAuth();
  if (!user) return null;

  // DH-Studenten nutzen ausschließlich ihre eigenen schlanken Seiten
  // (abteilungsdurchlauf.html, dh-profil.html) – die haben KEINE Sidebar-Shell
  // und rufen initLayout gar nicht auf. Landet ein DH-Student doch auf einer
  // Sidebar-Seite (Dashboard, profil.html, …), zurück zum Durchlauf.
  if (user.istDhStudent) {
    location.replace('abteilungsdurchlauf.html');
    return null;
  }

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
      const z = await DB.getZuweisungenFuerVerantw(user.email);
      istKorrektor = Array.isArray(z) && z.length > 0;
    } catch (e) { /* ohne Zuweisungsdaten: konservativ kein Korrektur-Menü */ }
  }
  applyCapabilities({
    kannPlanen:   !!user.kannPlanen,
    istAusbilder: !!user.istAusbilder,
    istAzubi:     !!user.istAzubi,
    istDhStudent: !!user.istDhStudent,
    korrektur:    istKorrektor,
    role:         user.role,
  });

  setupDevViewSwitch(user);

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

  // Theme-Toggle sitzt in der DS-Topbar (js/topbar-ds.js).

  return user;
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
    beurteilung_faellig: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    beurteilung_abgeschlossen: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  };

  async function renderItem(b) {
    if (b.type === 'beurteilung_faellig' || b.type === 'beurteilung_abgeschlossen') {
      const faellig = b.type === 'beurteilung_faellig';
      const title = faellig ? 'Beurteilung fällig' : 'Neue Beurteilung liegt vor';
      const meta = relativeTime(b.timestamp);
      return `
        <button type="button" class="notif-item${b.gelesen ? '' : ' notif-item--unread'}" data-id="${b.id}" data-zuw="${b.zuweisungId || ''}" data-nav="beurteilung">
          <span class="notif-item__icon notif-item__icon--${faellig ? 'error' : 'success'}">${ICON[b.type]}</span>
          <span class="notif-item__body"><span class="notif-item__title">${title}</span><span class="notif-item__meta">${meta}</span></span>
          ${b.gelesen ? '' : '<span class="notif-item__dot" aria-label="ungelesen"></span>'}
        </button>`;
    }
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
        if (el.dataset.nav === 'beurteilung') {
          const zuw = el.dataset.zuw;
          if (zuw) { window.location.href = `beurteilung.html?zuw=${zuw}`; return; }
        }
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

  // Für Verantwortliche: fällige Beurteilungen ermitteln (legt serverseitig Mitteilungen an).
  if (user && (user.istAusbilder || user.kannPlanen)) {
    try { await DB.getFaelligeBeurteilungen(); } catch (e) { /* nicht blockierend */ }
  }

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

/* ── Konstanten ── */
const ROLE_LABELS = {
  azubi:     'Auszubildende/r',
  ausbilder: 'Ausbilder/in',
  admin:     'Administrator',
  dhstudent: 'DH-Student/in',
  pruefer:   'Prüfer',
  developer: 'Developer',
};

/* Start-/Landeseite je Rolle. DH-Studenten sehen ausschließlich den
   Abteilungsdurchlauf (keine Dashboard-/Berichtsheft-Seiten). */
function landingPageFor(user) {
  if (user && user.istDhStudent) return 'abteilungsdurchlauf.html';
  return 'dashboard.html';
}

const ANWESENHEIT_OPTS = [
  'anwesend', 'Urlaub', 'krank', 'Feiertag',
  'sonstige Abwesenheit',
];

const ORT_OPTS = ['', 'Betrieb', 'Schule', 'Betrieb/Schule', 'Zuhause', 'Dienstreise'];

function getStatusLabel(status) {
  const map = {
    offen: 'Offen',
    freigegeben: 'Freigegeben',
    genehmigt: 'Genehmigt',
    abgelehnt: 'Abgelehnt',
  };
  return map[status] || status;
}

function getGreeting(d = new Date()) {
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins >= 180 && mins < 600)  return 'Guten Morgen'; // 03:00–10:00
  if (mins >= 600 && mins < 690)  return 'Guten Tag';    // 10:00–11:30
  if (mins >= 690 && mins < 780)  return 'Mahlzeit';     // 11:30–13:00
  if (mins >= 780 && mins < 1020) return 'Guten Tag';    // 13:00–17:00
  return 'Guten Abend';                                  // 17:00–03:00 (über Mitternacht)
}

// Vorname aus dem Anzeigenamen ziehen. Namen liegen in beiden Formaten vor:
// "Nachname, Vorname" (dann steht der Vorname hinter dem Komma) oder
// "Vorname Nachname" (dann ist es das erste Wort). Verhindert das frühere
// "Hallo, <Nachname>," mit angehängtem Komma.
function firstName(fullName) {
  const n = (fullName || '').trim();
  if (!n) return '';
  if (n.includes(',')) return (n.split(',')[1] || '').trim().split(/\s+/)[0] || n.split(',')[0].trim();
  return n.split(/\s+/)[0];
}

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
        return;
      }
      // Type-ahead: druckbare Taste (oder Backspace) filtert – egal ob das Menü
      // per Tastatur ODER per Mausklick geöffnet wurde. Nach einem Klick behält
      // der Trigger den Fokus; die alte `this.menu.hidden`-Bedingung verschluckte
      // dann jede Eingabe, sodass die Suche im offenen Menü nicht ankam.
      const isPrintable = e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (isPrintable) {
        if (this.menu.hidden) this.open();
        this.typeAhead(e);
      } else if (e.key === 'Backspace' && !this.menu.hidden) {
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
