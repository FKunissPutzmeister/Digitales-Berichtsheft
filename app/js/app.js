/* ===================================================================
   APP.JS – Auth-Guard, Sidebar, Toast, globale Hilfsfunktionen
   =================================================================== */

/* Liefert den Container, der tatsächlich scrollt — oder null, wenn es das
   Dokument selbst ist.

   Auf Touchgeräten scrollt nicht die Seite, sondern der .main-wrapper
   (Media-Query in layout.css). Grund: WebKit auf iOS zeichnet fixierte
   Elemente während einer Scrollgeste nicht laufend neu, sie wandern sichtbar
   mit. Scrollt das Dokument nicht, tritt das nicht auf.

   Wer eine Scrollposition liest oder setzt, muss daher hier nachfragen statt
   window.scrollY/scrollTo zu verwenden. Erkannt wird der Wechsel am
   berechneten Stil, nicht an einer Geräteabfrage — so kann die CSS-Regel
   allein bestimmen, welches Modell gilt. */
function scrollHost() {
  const wrapper = document.querySelector('.main-wrapper');
  if (!wrapper) return null;
  const overflow = getComputedStyle(wrapper).overflowY;
  return (overflow === 'auto' || overflow === 'scroll') ? wrapper : null;
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
    'data-ist-reiner-pruefer': caps.istReinerPruefer,
  };
  for (const [attr, on] of Object.entries(attrs)) {
    if (on) html.setAttribute(attr, '1'); else html.removeAttribute(attr);
  }
  try {
    localStorage.setItem('capKannPlanen',   caps.kannPlanen   ? '1' : '0');
    localStorage.setItem('capIstAusbilder', caps.istAusbilder ? '1' : '0');
    localStorage.setItem('capIstAzubi',     caps.istAzubi     ? '1' : '0');
    localStorage.setItem('capKorrektur',    caps.korrektur    ? '1' : '0');
    localStorage.setItem('capIstReinerPruefer', caps.istReinerPruefer ? '1' : '0');
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
    el.style.display = (caps.istAzubi || (caps.istAusbilder && !caps.istReinerPruefer)) ? '' : 'none';
  });
  document.querySelectorAll('.nav-jahresansicht-only').forEach(el => {
    el.style.display = ((caps.istAzubi || caps.korrektur) && !caps.istReinerPruefer) ? '' : 'none';
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

/* ── Vorschau-Feature-Gate ─────────────────────────────────────────────
   Abteilungsdurchlauf & Fahrgelderstattung sind noch nicht für echte Nutzer
   reif. Voll verfügbar auf localhost (Entwicklung) ODER mit aktiver Developer-
   Ansicht (effektive Rolle 'developer' — der Dev-Schalter stuft die Rolle sonst
   auf 'azubi'). Auf dem Deploy sehen alle mit ausgeschaltetem Dev-Schalter —
   auch der Entwickler selbst — denselben Coming-Soon-Platzhalter wie ein echter
   Nutzer. ponytail: reine Client-Sicht-Sperre (versteckt unreife Features), ist
   keine harte Zugriffskontrolle — die Backend-Endpunkte bleiben erreichbar. */
function previewUnlocked(role) {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '') return true;
  return role === 'developer';
}
function renderComingSoon(titel) {
  const main = document.getElementById('mainContent');
  if (!main) return;
  // WICHTIG: #mainContent NICHT per Inline-Style anfassen — der SPA-Router
  // (router.js) tauscht nur dessen innerHTML und lässt Inline-Styles stehen;
  // die würden auf die nächste Ansicht durchlecken und das Layout zerstören.
  // Zentrierung deshalb in einen Kind-Wrapper, der beim Seitenwechsel mit
  // ersetzt wird. min-height:100% füllt das flex:1-hohe #mainContent → mittig.
  main.innerHTML = `
    <div style="min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div class="empty-state">
        <div class="empty-state__icon">${typeof Icon === 'function' ? Icon('clock') : ''}</div>
        <div class="empty-state__title">${titel} – kommt bald</div>
        <p class="empty-state__text">Diese Funktion ist noch in Arbeit und wird in Kürze für alle freigeschaltet.</p>
      </div>
    </div>`;
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
        istReinerPruefer: !!u.istReinerPruefer,
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

  // Mobile-Menü-Trigger: In den Seiten-Shells fehlt das Element, ohne das die
  // Sidebar unter 768px (dort per translateX(-100%) ausgeblendet) gar nicht
  // mehr erreichbar wäre. Deshalb hier einmalig erzeugen, falls nicht vorhanden.
  let menuBtn = document.getElementById('mobileMenuBtn');
  if (!menuBtn && sidebar) {
    menuBtn = document.createElement('button');
    menuBtn.id = 'mobileMenuBtn';
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Navigation öffnen');
    menuBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
    document.body.appendChild(menuBtn);
  }

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

  // Nach Navigation den mobilen Drawer schließen, sonst verdeckt er den Inhalt.
  sidebar?.querySelectorAll('.sidebar__link').forEach((link) => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay?.classList.remove('visible');
    });
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

  if (userName) userName.textContent = displayName(user.name);
  if (userRole) {
    // Rollen-Badge: kleine farbige Pill, Farb-Variante per data-role
    const label = ROLE_LABELS[user.role] || user.role;
    userRole.innerHTML = `<span class="role-badge" data-role="${user.role}">${label}</span>`;
  }
  applyAvatar(userInitials, user);
  if (topbarName) topbarName.textContent = displayName(user.name);
  applyAvatar(topbarInitials, user);

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
    istReinerPruefer: !!user.istReinerPruefer,
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

  // Für Verantwortliche fällige Beurteilungen ermitteln — legt serverseitig die
  // „Beurteilung fällig"-Mitteilungen an. War früher ein Seiteneffekt der Topbar-
  // Glocke (entfernt); die Mitteilungen selbst erscheinen im Dashboard-Widget bzw.
  // auf der Mitteilungen-Seite. Fire-and-forget, nicht blockierend.
  if (user && (user.istAusbilder || user.kannPlanen)) {
    DB.getFaelligeBeurteilungen().catch(() => { /* nicht blockierend */ });
  }

  // Topbar-Schatten beim Scrollen (passiv, sehr günstig – nur Class-Toggle).
  // Sorgt für die dezente Tiefenwirkung gegenüber dem Inhalt.
  // Liest die Position über scrollHost(), weil auf Touchgeräten nicht das
  // Dokument scrollt, sondern der .main-wrapper (s. layout.css).
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    let isScrolled = false;
    const onScroll = () => {
      const host = scrollHost();
      const shouldBe = (host ? host.scrollTop : window.scrollY) > 4;
      if (shouldBe !== isScrolled) {
        isScrolled = shouldBe;
        topbar.classList.toggle('is-scrolled', shouldBe);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const host = scrollHost();
    if (host) host.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Theme-Toggle sitzt in der DS-Topbar (js/topbar-ds.js).

  return user;
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
  'anwesend', 'Urlaub', 'Arbeitsunfähigkeit', 'Feiertag',
  'sonstige Abwesenheit',
];

// ponytail: ohne Leer-Option – ein Arbeitstag findet immer irgendwo statt, neue
// Tage starten ohnehin auf "Betrieb". Altbestand mit leerem Ort zeigt dann die
// erste Option, bleibt aber per --needs-input markiert.
const ORT_OPTS = ['Betrieb', 'Schule', 'Betrieb/Schule'];

function getStatusLabel(status) {
  const map = {
    offen: 'Offen',
    freigegeben: 'Eingereicht',
    erstgenehmigt: 'Erstgenehmigt',
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
const _pmEscapeHtml = window.escapeHtml;

class PMSelect {
  constructor(nativeSelect) {
    this.native = nativeSelect;
    this.native.dataset.pmEnhanced = 'true';
    this.native._pmInstance = this;
    this.query = '';

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

    // Optionales sichtbares Suchfeld im Menü (Opt-in: <select data-pm-search>).
    // Nutzt denselben filterByQuery-Pfad wie der unsichtbare Type-ahead-Puffer.
    this.searchInput = null;
    this.searchWrap = null;
    if (nativeSelect.dataset.pmSearch != null) {
      this.searchWrap = document.createElement('div');
      this.searchWrap.className = 'pm-select__search';
      this.searchWrap.innerHTML = '<span class="pm-select__search-ico" aria-hidden="true">'
        + '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">'
        + '<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg></span>';
      this.searchInput = document.createElement('input');
      this.searchInput.type = 'search';
      this.searchInput.placeholder = nativeSelect.dataset.pmSearch || 'Suchen …';
      this.searchInput.setAttribute('aria-label', 'Optionen durchsuchen');
      this.searchInput.addEventListener('input', () => {
        this.query = this.searchInput.value;
        this.filterByQuery();
      });
      this.searchWrap.appendChild(this.searchInput);
    }

    // Sichtbare Antwort, wenn die Suche nichts findet (sonst stünde da ein
    // leerer Kasten). Überlebt Rebuilds wie das Suchfeld.
    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'pm-select__empty';
    this.emptyEl.textContent = 'Keine Treffer';
    this.emptyEl.hidden = true;

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
    if (this.searchWrap) this.menu.appendChild(this.searchWrap); // Suchfeld überlebt Rebuilds
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
    this.menu.appendChild(this.emptyEl);
  }

  /* Kleinschreiben + Diakritika entfernen, aber LÄNGENTREU (ü→u, ß→s), damit
     die Treffer-Positionen weiter aufs Original-Label passen. So findet
     „buro" auch „Büro". */
  static _norm(s) {
    return String(s).toLowerCase().replace(/ß/g, 's')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Tippfehler-Abstand des Suchbegriffs zum BESTEN PRÄFIX eines Wortes (das
     Wortende ist frei). Eine Rechnung für alle Fälle: „einakuf" → „Einkauf" und
     „fertigunk" → „Fertigungssteuerung" (Vertipper im Präfix).
     Damerau: ein Buchstabendreher zählt als EIN Fehler, nicht als zwei – sonst
     fällt „Dipso" für „Dispo" durch, und Dreher sind der häufigste Tippfehler. */
  static _prefixDist(term, word) {
    let prev2 = null;
    let prev = new Array(word.length + 1);
    for (let j = 0; j <= word.length; j++) prev[j] = j;
    for (let i = 1; i <= term.length; i++) {
      const cur = new Array(word.length + 1);
      cur[0] = i;
      for (let j = 1; j <= word.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,                                                  // Zeichen fehlt
          cur[j - 1] + 1,                                               // Zeichen zu viel
          prev[j - 1] + (term[i - 1] === word[j - 1] ? 0 : 1)            // Vertipper
        );
        if (i > 1 && j > 1 && term[i - 1] === word[j - 2] && term[i - 2] === word[j - 1]) {
          cur[j] = Math.min(cur[j], prev2[j - 2] + 1);                   // Dreher
        }
      }
      prev2 = prev;
      prev = cur;
    }
    return Math.min(...prev);
  }

  /* Treffer-Bereiche eines Labels für die aktuelle Query, oder null wenn ein
     Suchbegriff fehlt. Mehrere Begriffe müssen ALLE vorkommen („ein pmm" →
     „Einkauf PMM"), Reihenfolge egal. Erst wörtlich (auch mitten im Wort),
     dann tippfehlertolerant – Toleranz wächst mit der Länge des Begriffs,
     kurze Begriffe bleiben streng, damit die Liste nicht ausufert. */
  _matchRanges(label, query) {
    const hay = PMSelect._norm(label);
    const terms = PMSelect._norm(query).split(/\s+/).filter(Boolean);
    const ranges = [];
    for (const term of terms) {
      const at = hay.indexOf(term);
      if (at >= 0) { ranges.push([at, at + term.length]); continue; }
      const tol = term.length <= 3 ? 0 : term.length <= 5 ? 1 : 2;
      let hit = null;
      if (tol) {
        for (const m of hay.matchAll(/\S+/g)) {
          if (PMSelect._prefixDist(term, m[0]) <= tol) { hit = [m.index, m.index + m[0].length]; break; }
        }
      }
      if (!hit) return null;                 // ein Begriff fehlt → Option raus
      ranges.push(hit);                      // Vertipper: ganzes Wort markieren
    }
    return ranges;
  }

  /* Label mit hellgelb hervorgehobenen Treffer-Bereichen (überlappende
     Bereiche verschmelzen). */
  static _markHtml(label, ranges) {
    let html = '', pos = 0;
    for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
      if (e <= pos) continue;
      const start = Math.max(s, pos);
      html += _pmEscapeHtml(label.slice(pos, start))
        + `<mark class="pm-select__hl">${_pmEscapeHtml(label.slice(start, e))}</mark>`;
      pos = e;
    }
    return html + _pmEscapeHtml(label.slice(pos));
  }

  // Blendet alles aus, was nicht zur Query passt, und hebt die Treffer hervor.
  // Leere Query → alle sichtbar, kein Markup.
  filterByQuery() {
    const q = this.query.trim();
    let hits = 0;
    this.menu.querySelectorAll('.pm-select__option').forEach(btn => {
      const textEl = btn.querySelector('.pm-select__option-text');
      const label = (btn._pmLabel != null) ? btn._pmLabel : textEl.textContent;
      if (!q) { textEl.textContent = label; btn.hidden = false; hits++; return; }
      const ranges = this._matchRanges(label, q);
      btn.hidden = !ranges;
      if (ranges) { textEl.innerHTML = PMSelect._markHtml(label, ranges); hits++; }
    });
    this.emptyEl.hidden = hits > 0;
  }
  // Tippen sammelt sich in einem unsichtbaren Puffer (verfällt nach 1,5 s).
  // Space NICHT abfangen (bleibt Auswahl/öffnen). Liefert true, wenn behandelt.
  typeAhead(e) {
    if (this.searchInput) {
      // Sichtbares Suchfeld ist die Quelle der Wahrheit: Tippen mit Fokus auf
      // Trigger/Option landet dort statt im unsichtbaren Puffer (kein Verfall).
      if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.searchInput.focus();
        this.searchInput.value += e.key;
        this.query = this.searchInput.value;
        this.filterByQuery();
        return true;
      }
      return false;
    }
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
    // Kein Verfall: solange das Menü offen ist, IST die Query der sichtbare
    // Filter (gefilterte Liste + gelb hervorgehobene Treffer). Ein Timeout
    // löschte die Eingabe nach 1,5 s stillschweigend – die Vorschläge sprangen
    // dann zurück, als hätte man nichts getippt. Zurückgesetzt wird beim
    // Öffnen, beim Schließen und per Backspace.
    this.filterByQuery();
    // Ohne sichtbaren Treffer bliebe der Fokus auf einer ausgeblendeten Option
    // hängen (Fokus damit weg vom Menü) und jede weitere Taste, auch
    // Backspace, käme nirgends an → in diesem Fall zurück auf den Trigger.
    const fv = this.menu.querySelector('.pm-select__option:not(:disabled):not([hidden])');
    (fv || this.trigger).focus();
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
      // Events aus dem Suchfeld: nur Navigation/Auswahl abfangen, Tippen
      // (inkl. Leerzeichen/Backspace) normal im Input landen lassen.
      if (this.searchInput && e.target === this.searchInput) {
        const first = this.menu.querySelector('.pm-select__option:not(:disabled):not([hidden])');
        if (e.key === 'ArrowDown') { e.preventDefault(); first?.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); first?.click(); }
        return;
      }
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
    if (this.searchInput) { this.searchInput.value = ''; }
    this.filterByQuery();
    this.position();
    if (this.searchInput) this.searchInput.focus();
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
    this.query = '';
    if (this.searchInput) this.searchInput.value = '';
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

/* ===================================================================
   Einheitliche Azubi-Auswahl
   -------------------------------------------------------------------
   Rendert ein <select class="form-control azubi-select">, das der globale
   PMSelect-Observer automatisch in ein Such-Dropdown (Type-Ahead) verwandelt.
   Einzige Markup-Quelle für die Azubi-Auswahl in Wochen-/Jahresansicht,
   Ausbildungsstand und Abteilungsdurchlauf – ersetzt die früheren Chip-Listen.
   Event-Anbindung beim Aufrufer: change-Listener auf #<id> (Default 'azubiSelect').
   =================================================================== */
function renderAzubiSelect(azubis, currentId, opts = {}) {
  const { id = 'azubiSelect', label = 'Azubi:' } = opts;
  const cur = currentId != null ? String(currentId) : '';
  const options = (azubis || []).map(a =>
    `<option value="${_pmEscapeHtml(a.id)}"${String(a.id) === cur ? ' selected' : ''}>${_pmEscapeHtml(a.name)}</option>`
  ).join('');
  return `<div class="azubi-select-row">
      <label class="azubi-select-row__label" for="${id}">${_pmEscapeHtml(label)}</label>
      <select class="form-control azubi-select" id="${id}" aria-label="Azubi auswählen" data-pm-search="Azubi suchen …">${options}</select>
    </div>`;
}

/* Persistenz der Azubi-Auswahl (pro Gerät).
   -------------------------------------------------------------------
   Wochen- und Jahresansicht teilen sich denselben Schlüssel, sodass ein in der
   einen Ansicht gewählter Azubi auch in der anderen – und nach einem Reload –
   vorausgewählt bleibt. localStorage kann im Privat-/Kioskmodus werfen → immer
   defensiv kapseln; scheitert die Persistenz, bleibt die Auswahl eben nur für
   die aktuelle Sitzung erhalten. */
const AZUBI_VIEW_STORAGE_KEY = 'berichtsheft.viewAzubiId';
function getPersistedAzubiId() {
  try { return localStorage.getItem(AZUBI_VIEW_STORAGE_KEY) || null; }
  catch (e) { return null; }
}
function setPersistedAzubiId(id) {
  try {
    if (id) localStorage.setItem(AZUBI_VIEW_STORAGE_KEY, String(id));
    else localStorage.removeItem(AZUBI_VIEW_STORAGE_KEY);
  } catch (e) { /* Speicher nicht verfügbar → nur für diese Sitzung */ }
}

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
