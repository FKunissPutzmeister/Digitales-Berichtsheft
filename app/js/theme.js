/* ===================================================================
   THEME.JS – Theme-Engine (Standard-Modus + Custom-Designs)
   Wird im <head> geladen, BEVOR die Stylesheets gelesen werden.
   So setzt das Skript data-theme="…" auf <html>, bevor der Browser zum
   ersten Mal rendert (verhindert FOUC – Flash of Unstyled / Wrong-Theme
   Content).

   Zwei Ebenen:
   • STANDARD-MODUS  localStorage('theme')        = 'light' | 'dark'
     Ohne Wahl gilt die System-Einstellung (prefers-color-scheme), die
     sich live mitändert, bis der Nutzer manuell wechselt.
   • CUSTOM-DESIGN   localStorage('customTheme')  = 'hyperspace' | 'cmd'
     | 'candy' | 'iceland'. Ist ein Custom-Design aktiv, überlagert es
     den Standard-Modus (data-theme = Custom-Name). Die Token-Overrides
     dazu liegen in css/themes.css.

   WICHTIG – Verhalten des Sidebar-Hell/Dunkel-Toggles bei aktivem
   Custom-Design: Ein Klick auf den Toggle VERLÄSST das Custom-Design
   und kehrt zum gespeicherten Standard-Modus zurück (siehe set()/
   toggle() unten). Erst der nächste Klick toggelt wieder hell/dunkel.

   theme.js ist ein SHARED-Script: der SPA-Router (router.js) führt es
   bei Seitenwechseln NICHT erneut aus. Seiten-Scripts (z.B. profil.js)
   nutzen daher das globale window.PMTheme-API.
   =================================================================== */
(function () {
  var STORAGE_KEY = 'theme';        // Standard-Modus: 'light' | 'dark'
  var CUSTOM_KEY  = 'customTheme';  // Custom-Design oder nicht gesetzt
  var CUSTOM_THEMES = ['hyperspace', 'cmd', 'candy', 'iceland'];
  var html = document.documentElement;

  /* ── FX-Layer-Engine ─────────────────────────────────────────────
     Custom-Themes können echte DOM-Hintergrund-Layer bekommen (z.B.
     einen 3D-Tunnel aus mehreren divs), nicht nur body::before/::after.
     ensureThemeFX() injiziert dazu <div id="pmThemeFX" aria-hidden>
     als direktes <body>-Kind; die Basisregeln (position:fixed, inset:0,
     z-index:0, pointer-events:none, print/reduced-motion) liegen in
     css/themes.css, das Per-Theme-Styling in css/theme-<name>.css.

     SPA-sicher: #pmThemeFX liegt AUSSERHALB von #mainContent;
     router.js (syncBodyOverlays) entfernt/klont ausschließlich
     `body > .modal-overlay` – der FX-Container überlebt Navigationen.

     Jeder Template-Eintrag unten gehört EXKLUSIV einem Theme-Designer:
     dort den HTML-String für die Layer-Kinder eintragen (leerer String
     = kein DOM-FX für dieses Theme). */
  var FX_TEMPLATES = {
    /* ── FX-Template: hyperspace (wird vom Theme-Designer befüllt) ──
       3D-Sternentunnel nach CodePen „Hyperspace" (Noah Blon, DpNRyR):
       zwei um 6s versetzte 1000×1000-Würfel-Wraps (je 5 Wände) fliegen
       per perspective:5px durch den Viewport. Styling/Keyframes liegen
       in css/theme-hyperspace.css (Klassen pm-hs-* zur Kollisions-
       vermeidung). */
    hyperspace:
      '<div class="pm-hs-scene">' +
        '<div class="pm-hs-wrap">' +
          '<div class="pm-hs-wall pm-hs-wall--right"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--left"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--top"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--bottom"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--back"></div>' +
        '</div>' +
        '<div class="pm-hs-wrap">' +
          '<div class="pm-hs-wall pm-hs-wall--right"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--left"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--top"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--bottom"></div>' +
          '<div class="pm-hs-wall pm-hs-wall--back"></div>' +
        '</div>' +
      '</div>',

    /* ── FX-Template: cmd (wird vom Theme-Designer befüllt) ── */
    cmd: '',

    /* ── FX-Template: candy (wird vom Theme-Designer befüllt) ──
       Candy-Land-Szene: halb sichtbarer Regenbogen, sehr langsam
       driftende Wolken, drei gewellte Zuckerguss-Wiesen-Lagen plus
       Deko (Donut, Lollipops, Gumdrops). Styling/Keyframes liegen in
       css/theme-candy.css (Klassen pm-cd-* zur Kollisionsvermeidung). */
    candy:
      '<div class="pm-cd-rainbow"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--1"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--2"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--3"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--4"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--back"></div>' +
      '<div class="pm-cd-donut"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--mid"></div>' +
      '<div class="pm-cd-lolli pm-cd-lolli--pink"></div>' +
      '<div class="pm-cd-lolli pm-cd-lolli--mint"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--front"></div>' +
      '<div class="pm-cd-gumdrop pm-cd-gumdrop--1"></div>' +
      '<div class="pm-cd-gumdrop pm-cd-gumdrop--2"></div>',

    /* ── FX-Template: iceland (wird vom Theme-Designer befüllt) ──
       Realistische Gletscher-Szene: 3 Berg-Silhouetten (SVG-Polygone,
       hinten hell/neblig → vorne dunkler), 2 driftende Nebelbänke,
       Schneeboden, Iglu aus Eisblöcken (Inline-SVG mit Blockfugen +
       kühlem Innenleuchten), 3 Schneeregen-Lagen (schräge Streifen,
       transform-only) und Frost-Kristall-Ecken am Viewport-Rand.
       Styling/Keyframes in css/theme-iceland.css (Klassen pm-is-*). */
    iceland:
      '<div class="pm-is-scene">' +
        '<svg class="pm-is-range pm-is-range--far" viewBox="0 0 1440 320" preserveAspectRatio="none">' +
          '<polygon points="0,196 110,150 210,176 330,118 420,156 540,108 660,158 780,122 900,164 1020,118 1140,168 1250,138 1340,170 1440,144 1440,320 0,320"/>' +
        '</svg>' +
        '<div class="pm-is-fog pm-is-fog--high"></div>' +
        '<svg class="pm-is-range pm-is-range--mid" viewBox="0 0 1440 320" preserveAspectRatio="none">' +
          '<polygon points="0,238 130,186 250,224 380,160 500,212 640,170 760,218 880,176 1010,224 1140,186 1270,228 1370,200 1440,216 1440,320 0,320"/>' +
        '</svg>' +
        '<div class="pm-is-fog pm-is-fog--low"></div>' +
        '<svg class="pm-is-range pm-is-range--near" viewBox="0 0 1440 320" preserveAspectRatio="none">' +
          '<polygon points="0,272 150,232 300,266 470,218 640,258 810,228 980,266 1150,238 1310,268 1440,248 1440,320 0,320"/>' +
        '</svg>' +
        '<div class="pm-is-ground"></div>' +
        '<svg class="pm-is-igloo" viewBox="0 0 320 200">' +
          '<defs>' +
            '<linearGradient id="pmIsDome" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0" stop-color="#FBFDFE"/>' +
              '<stop offset="0.55" stop-color="#E7EEF2"/>' +
              '<stop offset="1" stop-color="#CFDBE2"/>' +
            '</linearGradient>' +
            '<linearGradient id="pmIsTun" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0" stop-color="#EEF3F6"/>' +
              '<stop offset="1" stop-color="#C5D3DC"/>' +
            '</linearGradient>' +
            '<radialGradient id="pmIsGlow" cx="0.5" cy="0.88" r="0.85">' +
              '<stop offset="0" stop-color="#CDEAF4"/>' +
              '<stop offset="0.5" stop-color="#7FA9BC"/>' +
              '<stop offset="1" stop-color="#36505F"/>' +
            '</radialGradient>' +
          '</defs>' +
          '<ellipse cx="158" cy="184" rx="150" ry="10" fill="#8DA0AD" opacity="0.28"/>' +
          '<path d="M28 182 A112 112 0 0 1 252 182 Z" fill="url(#pmIsDome)" stroke="#AFC0CB" stroke-width="2.5"/>' +
          '<g fill="none" stroke="#B9CAD4" stroke-width="2">' +
            '<path d="M56 182 A84 84 0 0 1 224 182"/>' +
            '<path d="M84 182 A56 56 0 0 1 196 182"/>' +
            '<path d="M110 182 A30 30 0 0 1 170 182"/>' +
            '<path d="M244 140 L218 151 M209 94 L192 116 M156 71 L152 99 M98 78 L108 104 M52 113 L74 130 M32 151 L59 159"/>' +
            '<path d="M208 133 L185 149 M171 104 L161 130 M125 99 L130 127 M84 120 L103 140 M61 153 L87 163"/>' +
            '<path d="M172 136 L157 157 M140 126 L140 152 M108 136 L123 157"/>' +
          '</g>' +
          '<path d="M86 112 A80 80 0 0 1 178 105" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity="0.6"/>' +
          '<path d="M206 182 A40 34 0 0 1 286 182 Z" fill="url(#pmIsTun)" stroke="#A7B9C4" stroke-width="2.5"/>' +
          '<path d="M216 182 A30 25 0 0 1 276 182" fill="none" stroke="#B9CAD4" stroke-width="2"/>' +
          '<path d="M226 182 A20 17 0 0 1 266 182 Z" fill="url(#pmIsGlow)"/>' +
        '</svg>' +
        '<div class="pm-is-sleet pm-is-sleet--far"></div>' +
        '<div class="pm-is-sleet pm-is-sleet--mid"></div>' +
        '<div class="pm-is-sleet pm-is-sleet--near"></div>' +
        '<svg class="pm-is-frost pm-is-frost--tl" viewBox="0 0 150 150">' +
          '<g fill="none" stroke="#EAF4F9" stroke-linecap="round">' +
            '<path d="M4 4 L128 128" stroke-width="3"/>' +
            '<path d="M34 34 L66 22 M34 34 L22 66 M62 62 L98 46 M62 62 L46 98 M92 92 L124 78 M92 92 L78 124" stroke-width="2"/>' +
            '<path d="M66 22 L84 16 M66 22 L72 4 M22 66 L16 84 M22 66 L4 72" stroke-width="1.4"/>' +
            '<path d="M4 64 L74 134 M64 4 L134 74" stroke-width="1.6" opacity="0.7"/>' +
            '<path d="M24 86 L44 82 M86 24 L82 44 M44 104 L60 98 M104 44 L98 60" stroke-width="1.2" opacity="0.7"/>' +
          '</g>' +
          '<circle cx="128" cy="128" r="3" fill="#EAF4F9"/><circle cx="134" cy="74" r="2" fill="#EAF4F9"/><circle cx="74" cy="134" r="2" fill="#EAF4F9"/>' +
        '</svg>' +
        '<svg class="pm-is-frost pm-is-frost--tr" viewBox="0 0 150 150">' +
          '<g fill="none" stroke="#EAF4F9" stroke-linecap="round">' +
            '<path d="M4 4 L128 128" stroke-width="3"/>' +
            '<path d="M34 34 L66 22 M34 34 L22 66 M62 62 L98 46 M62 62 L46 98 M92 92 L124 78 M92 92 L78 124" stroke-width="2"/>' +
            '<path d="M66 22 L84 16 M66 22 L72 4 M22 66 L16 84 M22 66 L4 72" stroke-width="1.4"/>' +
            '<path d="M4 64 L74 134 M64 4 L134 74" stroke-width="1.6" opacity="0.7"/>' +
            '<path d="M24 86 L44 82 M86 24 L82 44 M44 104 L60 98 M104 44 L98 60" stroke-width="1.2" opacity="0.7"/>' +
          '</g>' +
          '<circle cx="128" cy="128" r="3" fill="#EAF4F9"/><circle cx="134" cy="74" r="2" fill="#EAF4F9"/><circle cx="74" cy="134" r="2" fill="#EAF4F9"/>' +
        '</svg>' +
        '<svg class="pm-is-frost pm-is-frost--bl" viewBox="0 0 150 150">' +
          '<g fill="none" stroke="#EAF4F9" stroke-linecap="round">' +
            '<path d="M4 4 L128 128" stroke-width="3"/>' +
            '<path d="M34 34 L66 22 M34 34 L22 66 M62 62 L98 46 M62 62 L46 98 M92 92 L124 78 M92 92 L78 124" stroke-width="2"/>' +
            '<path d="M66 22 L84 16 M66 22 L72 4 M22 66 L16 84 M22 66 L4 72" stroke-width="1.4"/>' +
            '<path d="M4 64 L74 134 M64 4 L134 74" stroke-width="1.6" opacity="0.7"/>' +
            '<path d="M24 86 L44 82 M86 24 L82 44 M44 104 L60 98 M104 44 L98 60" stroke-width="1.2" opacity="0.7"/>' +
          '</g>' +
          '<circle cx="128" cy="128" r="3" fill="#EAF4F9"/><circle cx="134" cy="74" r="2" fill="#EAF4F9"/><circle cx="74" cy="134" r="2" fill="#EAF4F9"/>' +
        '</svg>' +
        '<svg class="pm-is-frost pm-is-frost--br" viewBox="0 0 150 150">' +
          '<g fill="none" stroke="#EAF4F9" stroke-linecap="round">' +
            '<path d="M4 4 L128 128" stroke-width="3"/>' +
            '<path d="M34 34 L66 22 M34 34 L22 66 M62 62 L98 46 M62 62 L46 98 M92 92 L124 78 M92 92 L78 124" stroke-width="2"/>' +
            '<path d="M66 22 L84 16 M66 22 L72 4 M22 66 L16 84 M22 66 L4 72" stroke-width="1.4"/>' +
            '<path d="M4 64 L74 134 M64 4 L134 74" stroke-width="1.6" opacity="0.7"/>' +
            '<path d="M24 86 L44 82 M86 24 L82 44 M44 104 L60 98 M104 44 L98 60" stroke-width="1.2" opacity="0.7"/>' +
          '</g>' +
          '<circle cx="128" cy="128" r="3" fill="#EAF4F9"/><circle cx="134" cy="74" r="2" fill="#EAF4F9"/><circle cx="74" cy="134" r="2" fill="#EAF4F9"/>' +
        '</svg>' +
      '</div>'
  };

  /* FX-Container für das übergebene Theme (neu) aufbauen.
     Idempotent: ein evtl. vorhandener Container wird immer zuerst
     entfernt; mehrfaches apply() erzeugt also keine Duplikate.
     theme.js läuft im <head> → beim allerersten Aufruf existiert
     document.body noch nicht: dann auf DOMContentLoaded verschieben
     (once) und dort das DANN aktuelle data-theme auflösen. */
  var fxDeferred = false;
  function ensureThemeFX(theme) {
    if (!document.body) {
      if (!fxDeferred) {
        fxDeferred = true;
        document.addEventListener('DOMContentLoaded', function () {
          fxDeferred = false;
          ensureThemeFX(html.getAttribute('data-theme') || 'light');
        }, { once: true });
      }
      return;
    }
    var existing = document.getElementById('pmThemeFX');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var tpl = FX_TEMPLATES[theme] || '';   // light/dark/unbekannt → ''
    if (!tpl) return;
    /* Login-Seite: kein FX (dort sind auch die ::before/::after-
       Ambient-Layer via glass.css deaktiviert) */
    if (document.body.classList.contains('login-page')) return;

    var el = document.createElement('div');
    el.id = 'pmThemeFX';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = tpl;
    document.body.appendChild(el);
  }

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

  function readStoredCustom() {
    try {
      var v = localStorage.getItem(CUSTOM_KEY);
      return (CUSTOM_THEMES.indexOf(v) !== -1) ? v : null;
    } catch (e) { return null; }
  }

  /* data-theme setzen + FX-Layer syncen + Event feuern
     (eine zentrale Apply-Stelle) */
  function apply(theme) {
    html.setAttribute('data-theme', theme);
    ensureThemeFX(theme);
    try {
      window.dispatchEvent(new CustomEvent('pm-theme-change', { detail: theme }));
    } catch (e) {}
  }

  // Initial-Theme bestimmen + sofort setzen (synchron, vor dem ersten
  // Paint → FOUC-frei): Custom-Design > gespeicherter Modus > System.
  // ensureThemeFX() läuft hier im <head> → verschiebt sich selbst auf
  // DOMContentLoaded, sobald document.body existiert.
  var theme = readStoredCustom() || readStored() || readSystem();
  html.setAttribute('data-theme', theme);
  ensureThemeFX(theme);

  // Globales Theme-API
  window.PMTheme = {
    /** Liste der verfügbaren Custom-Designs (für UI-Aufbau). */
    CUSTOM_THEMES: CUSTOM_THEMES.slice(),

    /** Aktuell ANGEWENDETES Theme (light|dark|<custom>). */
    get: function () {
      return html.getAttribute('data-theme') || 'light';
    },

    /** Gewählter STANDARD-MODUS (light|dark) – unabhängig davon,
        ob gerade ein Custom-Design aktiv ist. */
    getMode: function () {
      return readStored() || readSystem();
    },

    /** Aktives Custom-Design oder null. */
    getCustom: function () {
      return readStoredCustom();
    },

    /** Standard-Modus setzen (aus der Profil-Einstellungs-Karte).
        Beendet ein ggf. aktives Custom-Design und wendet den Modus
        sofort an. */
    setMode: function (next) {
      if (next !== 'dark' && next !== 'light') return;
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      try { localStorage.removeItem(CUSTOM_KEY); } catch (e) {}
      apply(next);
    },

    /** Custom-Design aktivieren (name) oder deaktivieren
        (null | '' | 'standard'). Ohne Custom-Design gilt wieder der
        gewählte Standard-Modus. */
    setCustom: function (name) {
      if (!name || name === 'standard') {
        try { localStorage.removeItem(CUSTOM_KEY); } catch (e) {}
        apply(this.getMode());
        return;
      }
      if (CUSTOM_THEMES.indexOf(name) === -1) return;
      try { localStorage.setItem(CUSTOM_KEY, name); } catch (e) {}
      apply(name);
    },

    /** Legacy-API (Sidebar-Toggle in sidebar.js ruft set('light'|'dark')).
        Bei aktivem Custom-Design wird das übergebene Ziel bewusst
        IGNORIERT: der Klick verlässt nur das Custom-Design und kehrt
        zum gespeicherten Standard-Modus zurück (Spez-Verhalten). */
    set: function (next) {
      if (readStoredCustom()) {
        try { localStorage.removeItem(CUSTOM_KEY); } catch (e) {}
        apply(this.getMode());
        return;
      }
      if (next !== 'dark' && next !== 'light') return;
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      apply(next);
    },

    toggle: function () {
      if (readStoredCustom()) {
        // Custom-Design verlassen → zurück zum Standard-Modus
        this.setCustom(null);
        return;
      }
      this.set(this.get() === 'dark' ? 'light' : 'dark');
    },

    /** Hat der Nutzer manuell gewählt? Dann ignorieren wir System-Wechsel. */
    hasUserChoice: function () { return readStored() !== null; },
    clearChoice: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      if (!readStoredCustom()) apply(readSystem());
    },
  };

  // System-Änderung (z.B. macOS Auto-Theme) live übernehmen, solange der
  // Nutzer weder manuell gewählt hat noch ein Custom-Design aktiv ist.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var mqHandler = function (e) {
      if (!window.PMTheme.hasUserChoice() && !readStoredCustom()) {
        /* über apply() statt setAttribute direkt: feuert pm-theme-change,
           damit z.B. die Theme-Karte auf der Profil-Seite mitzieht */
        apply(e.matches ? 'dark' : 'light');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', mqHandler);
    else if (mq.addListener) mq.addListener(mqHandler); // Safari < 14
  }

  // Cross-Tab-Sync: wenn ein anderes Tab Modus oder Custom-Design
  // wechselt, hier neu auflösen (Custom > Modus > System).
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY && e.key !== CUSTOM_KEY) return;
    var resolved = readStoredCustom() || readStored() || readSystem();
    apply(resolved);
  });

  /* ── Sidebar-Init-State ──────────────────────────────────────────
     Synchroner Marker, der den eingeklappten Sidebar-Zustand schon vor
     dem ersten Paint signalisiert. Verhindert, dass die Sidebar beim
     Seitenwechsel kurz aufklappt und sich dann animiert wieder
     einklappt. Der Marker wird in app.js im requestAnimationFrame
     wieder entfernt, sobald die "echte" .collapsed-Klasse gesetzt ist. */
  try {
    var sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    /* Tablet-Auto-Collapse (769–1280px): beim echten Page-Load startet
       die Sidebar IMMER eingeklappt — überstimmt eine gespeicherte
       "offen"-Präferenz. <= 768px greift das Mobile-Off-Canvas-Layout
       (dort wäre der Marker via .main-wrapper-Margin kontraproduktiv),
       > 1280px gilt weiterhin nur die Nutzer-Präferenz.
       Pendant: buildSidebar() in sidebar.js setzt unter derselben
       Bedingung die echte .collapsed-Klasse auf das <aside>. */
    var tabletAutoCollapse = window.matchMedia &&
        window.matchMedia('(min-width: 769px) and (max-width: 1280px)').matches;
    if (sidebarCollapsed || tabletAutoCollapse) {
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
