/* ===================================================================
   THEME.JS – Dark / Light Mode
   Wird im <head> geladen, BEVOR die Stylesheets gelesen werden.
   So setzt das Skript data-theme="dark|light" auf <html>, bevor der
   Browser zum ersten Mal rendert (verhindert FOUC – Flash of Unstyled /
   Wrong-Theme Content).

   Gespeicherte Präferenz in localStorage('theme'). Wenn keine Wahl
   getroffen wurde, wird die System-Einstellung (prefers-color-scheme)
   übernommen und ändert sich live mit, bis der Nutzer manuell wechselt.
   =================================================================== */
(function () {
  var STORAGE_KEY = 'theme';
  var html = document.documentElement;

  function readSystem() {
    return (window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark' : 'light';
  }

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return (v === 'dark' || v === 'light') ? v : null;
    } catch (e) { return null; }
  }

  // Initial-Theme bestimmen + sofort setzen (synchron, vor dem ersten Paint)
  var stored = readStored();
  var theme = stored || readSystem();
  html.setAttribute('data-theme', theme);

  // Globales Theme-API
  window.PMTheme = {
    get: function () {
      return html.getAttribute('data-theme') || 'light';
    },
    set: function (next) {
      if (next !== 'dark' && next !== 'light') return;
      html.setAttribute('data-theme', next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      // Andere Tabs informieren
      try {
        window.dispatchEvent(new CustomEvent('pm-theme-change', { detail: next }));
      } catch (e) {}
    },
    toggle: function () {
      this.set(this.get() === 'dark' ? 'light' : 'dark');
    },
    /** Hat der Nutzer manuell gewählt? Dann ignorieren wir System-Wechsel. */
    hasUserChoice: function () { return readStored() !== null; },
    clearChoice: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      this.set(readSystem());
    },
  };

  // System-Änderung (z.B. macOS Auto-Theme) live übernehmen, solange der
  // Nutzer nicht manuell gewählt hat.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var mqHandler = function (e) {
      if (!window.PMTheme.hasUserChoice()) {
        html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', mqHandler);
    else if (mq.addListener) mq.addListener(mqHandler); // Safari < 14
  }

  // Cross-Tab-Sync: wenn ein anderes Tab das Theme wechselt, mitziehen.
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
      html.setAttribute('data-theme', e.newValue);
    }
  });

  /* ── Sidebar-Init-State ──────────────────────────────────────────
     Synchroner Marker, der den eingeklappten Sidebar-Zustand schon vor
     dem ersten Paint signalisiert. Verhindert, dass die Sidebar beim
     Seitenwechsel kurz aufklappt und sich dann animiert wieder
     einklappt. Der Marker wird in app.js im requestAnimationFrame
     wieder entfernt, sobald die "echte" .collapsed-Klasse gesetzt ist. */
  try {
    var sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
      html.classList.add('sidebar-init-collapsed');
    }
  } catch (e) {}

  /* ── Rollen-Init-State ──────────────────────────────────────────
     Spiegelt die zuletzt bekannte Rolle (siehe cacheUserRole() in
     api.js) synchron auf <html data-role="…">, damit rollen-spezifische
     Nav-Items per CSS schon vor dem ersten Paint korrekt sichtbar/
     versteckt sind. Verhindert den Flash, bei dem „Verwaltung" für
     Azubis kurz erscheint, bevor initLayout() es per JS versteckt.
     Bei Rollen-Mismatch (cache vs. Server) korrigiert api.js den Wert
     direkt nach dem ersten /auth/me-Roundtrip. */
  try {
    var cachedRole = localStorage.getItem('userRole');
    if (cachedRole === 'azubi' || cachedRole === 'ausbilder' || cachedRole === 'admin') {
      html.setAttribute('data-role', cachedRole);
    }
  } catch (e) {}

  /* ── Navigations-Übergang ───────────────────────────────────────
     sidebar.js setzt sessionStorage('navTransition') = '1' bevor es
     zu einer inneren Seite navigiert. Wir lesen das Flag hier synchron
     (vor dem ersten Paint) und setzen [data-page-enter] auf <html>.
     base.css greift darauf an und startet die Einblendeanimation auf
     .main-wrapper sofort ab Frame 0 – kein weißer Blitz sichtbar. */
  try {
    if (sessionStorage.getItem('navTransition') === '1') {
      sessionStorage.removeItem('navTransition');
      html.setAttribute('data-page-enter', '');
    }
  } catch (e) {}
})();
