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
  var CUSTOM_THEMES = ['hyperspace', 'cmd', 'candy', 'iceland', 'silk', 'halloween', 'christmas'];
  var html = document.documentElement;

  /* ── Perf-Lite: Software-Rendering erkennen ───────────────────────
     Ist kein echter GPU-Treiber aktiv (Windows-WARP „Microsoft Basic
     Render Driver", SwiftShader, llvmpipe – häufig nach Treiber-Crash,
     auf RDP/VM, oder bei abgeschalteter HW-Beschleunigung), rendert der
     Browser ALLES in Software. Das app-weite backdrop-filter-Glas ist
     dann extrem teuer (gemessen: 27 statt 61 FPS, in JEDEM Theme).
     Erkennen wir das (oder ist prefers-reduced-transparency / der Profil-
     Schalter 'perfLite' gesetzt), setzen wir html.perf-lite VOR dem ersten
     Paint; glass.css schaltet darunter alle Blur-Layer auf deckende
     Flächen. Override: localStorage perfLite='1' erzwingt an, '0' aus.
     GPU-Nutzer bekommen die Klasse nie → sehen exakt das bisherige Glas. */
  function detectSoftwareGL() {
    try {
      var cv = document.createElement('canvas');
      var gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (!gl) return true;   // kein WebGL → mit hoher Wahrscheinlichkeit Software
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      return /SwiftShader|Basic Render|llvmpipe|Software|Microsoft Basic|WARP/i.test(r);
    } catch (e) { return false; }
  }
  try {
    var perfLitePref = localStorage.getItem('perfLite');
    var reduceTransp = window.matchMedia &&
      window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
    if (perfLitePref === '1' ||
        (perfLitePref !== '0' && (reduceTransp || detectSoftwareGL()))) {
      html.classList.add('perf-lite');
    }
  } catch (e) {}

  /* ── Silk-Farbvarianten ───────────────────────────────────────────
     Ein einziger Hue steuert die GESAMTE Silk-Palette: theme-silk.css
     nutzt überall hsl(var(--silk-hue,252) …). Pro Variante nur ein
     Hue-Wert; WebGL-Hintergrund + Login-Strahlen leiten ihre Farbe in
     react-theme-layer.js aus demselben Hue ab. Default = Indigo (252). */
  var SILK_COLOR_KEY = 'silkColor';
  var SILK_COLORS = [
    { id: 'indigo',  label: 'Indigo',  hue: 252 },
    { id: 'blau',    label: 'Blau',    hue: 214 },
    { id: 'tuerkis', label: 'Türkis',  hue: 188 },
    { id: 'gruen',   label: 'Grün',    hue: 145 },
    { id: 'gelb',    label: 'PM-Gelb', hue: 45  },
    { id: 'orange',  label: 'Orange',  hue: 24  },
    { id: 'rot',     label: 'Rot',     hue: 2   },
    { id: 'pink',    label: 'Pink',    hue: 322 }
  ];
  function silkHueOf(id) {
    for (var i = 0; i < SILK_COLORS.length; i++) if (SILK_COLORS[i].id === id) return SILK_COLORS[i].hue;
    return 252;
  }
  function readSilkColor() {
    try {
      var v = localStorage.getItem(SILK_COLOR_KEY);
      return SILK_COLORS.some(function (c) { return c.id === v; }) ? v : 'indigo';
    } catch (e) { return 'indigo'; }
  }
  function applySilkHue() {
    try { html.style.setProperty('--silk-hue', String(silkHueOf(readSilkColor()))); } catch (e) {}
  }

  /* React-„Skins": Custom-Themes, die auf einem Basismodus (light|dark)
     AUFSETZEN, statt eine eigene Palette zu pflegen. Sie erben damit die
     komplette, lesbare Komponenten-Stilistik des Basismodus; ihre eigene
     theme-*.css legt nur die Skin-Ebene (Hintergrund, Glas, Akzent) unter
     [data-skin="<name>"] darüber. data-theme bleibt der Basismodus, damit
     ALLE [data-theme="dark"]-Regeln greifen; die Identität steckt in
     data-skin und in localStorage('customTheme'). */
  var REACT_SKIN_BASE = { silk: 'dark' };
  function setThemeAttrs(theme) {
    var base = REACT_SKIN_BASE[theme];
    if (base) {
      html.setAttribute('data-theme', base);
      html.setAttribute('data-skin', theme);
    } else {
      html.setAttribute('data-theme', theme);
      html.removeAttribute('data-skin');
    }
  }

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

  /* ── Candy: Einhörner als freigestellte Foto-Sprites (Reiter auf
     Einhorn, Seitenansicht – blicken nach RECHTS). Liegen unter
     app/assets/candy-unicorn-{1,2}.png und werden unten per <img> in die
     beiden FX-Hüpf-Ebenen eingehängt; die Spiegelung für den nach links
     laufenden vorderen Reiter macht scaleX in css/theme-candy.css
     (dort auch Wiesen-Lauf + Spring-Hüpfen). */

  var FX_TEMPLATES = {
    /* ── FX-Template: hyperspace (wird vom Theme-Designer befüllt) ──
       3D-Sternentunnel nach CodePen „Hyperspace" (Noah Blon, DpNRyR):
       zwei um 10s versetzte 1000×1000-Würfel-Wraps (je 5 Wände) fliegen
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

    /* ── FX-Template: cmd (wird vom Theme-Designer befüllt) ──
       0/1-Matrix-Regen als DAUERHAFTER Hintergrund (<canvas>): Spalten
       fallender Nullen/Einsen in dezentem Terminal-Grün laufen endlos
       hinter dem Inhalt durch. Der rAF-Loop wird vom PMCmdFX-Controller
       (unten) gesteuert; ensureThemeFX() startet/stoppt ihn am FX-Lebens-
       zyklus. Styling/Fallback-Farbe in css/theme-cmd.css (.pm-cmd-bg).
       (Früher: kurzes Lade-Intro-Overlay via js/cmd-intro.js – entfernt.) */
    cmd: '<canvas class="pm-cmd-bg" aria-hidden="true"></canvas>',

    /* ── FX-Template: candy (wird vom Theme-Designer befüllt) ──
       Candy-Land-Szene: leuchtend schimmernder Regenbogen, eine
       Wolken-Prozession (7 Wolken ziehen ENDLOS von links nach rechts
       und schweben/pulsieren dabei), drei gewellte Zuckerguss-Wiesen-
       Lagen, zwei über die Wiese hüpfende Einhörner plus Deko (Donut,
       Lollipops, Gumdrops) und – als oberste Ebene – ein <canvas> mit
       sanft steigenden Seifenblasen, die beim Treffer auf ein Einhorn
       zerplatzen (Engine = PMCandyBubbles-Controller unten; Charakter-
       wechsel der Einhörner = wireCandyUnicornSwap). Styling/Keyframes
       liegen in css/theme-candy.css (Klassen pm-cd-* zur Kollisions-
       vermeidung). */
    candy:
      '<div class="pm-cd-rainbow"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--1"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--2"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--3"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--4"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--5"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--6"></div>' +
      '<div class="pm-cd-cloud pm-cd-cloud--7"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--back"></div>' +
      '<div class="pm-cd-donut"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--mid"></div>' +
      '<div class="pm-cd-unicorn pm-cd-unicorn--mid"><div class="pm-cd-unicorn__hop"><img class="pm-cd-uni-img" src="assets/candy-unicorn-1.png" alt="" aria-hidden="true"></div></div>' +
      '<div class="pm-cd-lolli pm-cd-lolli--pink"></div>' +
      '<div class="pm-cd-lolli pm-cd-lolli--mint"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--front"></div>' +
      '<div class="pm-cd-unicorn pm-cd-unicorn--front"><div class="pm-cd-unicorn__hop"><img class="pm-cd-uni-img" src="assets/candy-unicorn-2.png" alt="" aria-hidden="true"></div></div>' +
      '<div class="pm-cd-gumdrop pm-cd-gumdrop--1"></div>' +
      '<div class="pm-cd-gumdrop pm-cd-gumdrop--2"></div>' +
      '<canvas class="pm-cd-bubbles" aria-hidden="true"></canvas>',

    /* ── FX-Template: iceland (wird vom Theme-Designer befüllt) ──
       Schneesturm als <canvas>-Animation statt CSS/SVG-Szene: weiche
       Glow-Schneeflocken in 3 Parallax-Ebenen, prozedurale Gletscher-
       Silhouetten, driftende Nebelbänke und Seitenwind mit Böen. Der
       requestAnimationFrame-Loop wird vom PMIcelandFX-Controller (oben)
       gesteuert; ensureThemeFX() startet/stoppt ihn am FX-Lebenszyklus.
       Styling/Fallback-Farbe in css/theme-iceland.css (.pm-is-bg). */
    iceland:
      '<canvas class="pm-is-bg" aria-hidden="true"></canvas>',

    /* ── FX-Template: halloween (wird vom Theme-Designer befüllt) ──
       Basis ist ein fertiges Hintergrundbild (.pm-hw-bg →
       assets/halloween-bg.png: Geisterhaus im Wald mit Mond, Toren,
       Grabsteinen, Kürbissen, Kerzen). Darüber, hinten → vorne, nur noch
       die animierten Layer (Klassen pm-hw-* zur Kollisionsvermeidung):
       Mond-Schimmern (.pm-hw-moonglow) und Fenster-/Tür-Flackern
       (.pm-hw-winflicker) als screen-Glühen, ein <canvas class="pm-hw-fog">
       mit horizontal driftenden Nebelschwaden (Engine = PMHalloweenFog
       unten; ensureThemeFX startet/stoppt ihn am FX-Lebenszyklus),
       Fledermäuse mit natürlichem Flatter-Flug (äußeres .pm-hw-bat = Flug-
       bahn, inneres __body = Flügelschlag), eine sich abseilende Spinne,
       ein oben um die Hausspitzen schwebender Geist (.pm-hw-ghost),
       blinzelnde glühende Augenpaare (.pm-hw-eyes) bei Bäumen/Grabsteinen
       sowie ein großes Spinnennetz in der oberen LINKEN Ecke (.pm-hw-web),
       das hinter dem App-Inhalt sitzt und neben der Nav-Leiste / hinter dem
       Anfang der Kacheln durchscheint. Styling/Keyframes in
       css/theme-halloween.css. */
    halloween:
      '<div class="pm-hw-bg"></div>' +
      '<div class="pm-hw-web"></div>' +
      '<div class="pm-hw-moonglow"></div>' +
      '<div class="pm-hw-winflicker"></div>' +
      '<canvas class="pm-hw-fog" aria-hidden="true"></canvas>' +
      '<div class="pm-hw-bat pm-hw-bat--1"><i class="pm-hw-bat__body"></i></div>' +
      '<div class="pm-hw-bat pm-hw-bat--2"><i class="pm-hw-bat__body"></i></div>' +
      '<div class="pm-hw-bat pm-hw-bat--3"><i class="pm-hw-bat__body"></i></div>' +
      '<div class="pm-hw-spider"><i class="pm-hw-spider__thread"></i><i class="pm-hw-spider__body"></i></div>' +
      '<div class="pm-hw-ghost"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--1"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--2"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--3"></div>',
    /* ── FX-Template: christmas ──
       Basis = Winterbild (.pm-xm-bg → assets/backgrounds/Christmas Background.png,
       2:1-Panorama, center/cover). Darüber eine zum gecoverten Bild deckungs-
       gleiche „Bühne" (.pm-xm-lights, cover-box max(100vw,200vh)×max(100vh,50vw),
       identisch zentriert) – dadurch sitzen alle Glow-Overlays bei jedem Seiten-
       verhältnis exakt auf ihren Bild-Lichtquellen:
         • Tannenbaum rechts: goldener Stern (.pm-xm-glow--star) + farbige,
           einzeln funkelnde Kugeln (.pm-xm-bulb--t*, mix-blend:screen)
         • Laternen/Fenster: warme, sanft flackernde Glows (.pm-xm-glow--lamp …)
       Plus <canvas class="pm-xm-snow"> mit wind-getragenem Schneefall (Engine
       PMChristmasSnow, start/stop am FX-Lebenszyklus). Styling in
       css/theme-christmas.css. */
    christmas:
      '<div class="pm-xm-bg"></div>' +
      '<div class="pm-xm-lights">' +
        '<i class="pm-xm-glow pm-xm-glow--star"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t1"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t2"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t3"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t4"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t5"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t6"></i>' +
        '<i class="pm-xm-bulb pm-xm-bulb--t7"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--lamp pm-xm-glow--boat"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--lamp pm-xm-glow--hang"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--lamp pm-xm-glow--strlt"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--lamp pm-xm-glow--cabin"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--lamp pm-xm-glow--fence"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--lamp pm-xm-glow--btree"></i>' +
      '</div>' +
      '<canvas class="pm-xm-snow" aria-hidden="true"></canvas>'
  };

  /* ── Iceland-FX: Canvas-Schneesturm-Engine ───────────────────────
     Der Iceland-Hintergrund ist – anders als die übrigen Custom-Themes –
     keine reine CSS/SVG-Szene, sondern ein <canvas> mit requestAnimation-
     Frame-Loop: weiche Glow-Schneeflocken in 3 Parallax-Ebenen, ein
     echtes verschneites Bergfoto (assets/mountains.png) mit weich aus-
     gefadeter Oberkante, driftender Nebel und Seitenwind mit
     Böen. Dieser Controller kapselt den Loop und wird vom FX-Lebenszyklus
     gesteuert (start beim Aufbau des iceland-FX, stop beim Theme-Wechsel /
     Teardown). Konventionen aus themes.css werden mit-abgebildet, die für
     ein <canvas> nicht über CSS greifen:
       • prefers-reduced-motion → ein einziges statisches Standbild
       • verstecktes Tab / offenes Modal → Loop pausiert (GPU sparen,
         analog zur animation-play-state-Pause in themes.css).
     Styling/Fallback-Farbe des <canvas> in css/theme-iceland.css. */
  var PMIcelandFX = (function () {
    var THEME = {
      sky:     ['#0c141c', '#19262f', '#2b3a44'],
      mountainSrc: 'assets/mountains.png', // echtes Bergfoto (ersetzt die früheren prozeduralen Gletscher-Ridges)
      fog:     '#b6c6d2',
      fogStrength: 0.34,
      snow:    '#f4f8fc',
      wind:    8.5,
      flakeNear: 130, flakeMid: 340, flakeFar: 1100
    };
    var intensity = 0.4; // niedrigste Sturm-Stufe

    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* Flocken-Sprites einmalig (lazy) bauen und wiederverwenden. */
    var SPR_FAR = null, SPR_MID = null, SPR_NEAR = null;

    /* Bergfoto: einmalig laden, dann pro resize() in einen bildschirm-
       großen Offscreen-Canvas (cover-Fit, unten verankert, Oberkante weich
       ausgefadet) vorrendern → pro Frame nur noch ein drawImage. */
    var mountainImg = null, mountainReady = false;
    var SPR_MTN = null;   // { c: <canvas> } – fertig ausgefadetes Bergband (W×H)

    /* Laufzeit-State (wird pro start() neu aufgebaut). */
    var canvas = null, ctx = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1;
    var windT = 0, last = 0, fogPhase = 0;
    var far = [], mid = [], near = [];

    function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function fogRgb() { return hexToRgb(THEME.fog); }

    function makeFlakeSprite(size, softness) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var cx = c.getContext('2d');
      var r = size / 2;
      var g = cx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(softness, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g;
      cx.beginPath();
      cx.arc(r, r, r, 0, Math.PI * 2);
      cx.fill();
      return c;
    }
    function ensureSprites() {
      if (SPR_FAR) return;
      SPR_FAR  = makeFlakeSprite(16, 0.55);
      SPR_MID  = makeFlakeSprite(32, 0.40);
      SPR_NEAR = makeFlakeSprite(64, 0.22);
    }

    function windAt(t) {
      var base = THEME.wind;
      var gust = Math.sin(t * 0.0004) * 0.42 + Math.sin(t * 0.0011 + 1.3) * 0.28 + Math.sin(t * 0.0027 + 2.7) * 0.14;
      return base * (1 + gust) * intensity;
    }
    function updraft(t, x) { return Math.sin(t * 0.0009 + x * 0.004) * 1.1 * intensity; }

    /* Bergfoto einmalig laden; nach dem Laden das Band neu aufbauen und –
       falls reduced-motion (kein Loop) – das Standbild sofort nachziehen. */
    function ensureMountainImg() {
      if (mountainImg) return;
      mountainImg = new Image();
      mountainImg.onload = function () {
        mountainReady = true;
        buildMountain();
        if (reduceMotion && ctx) renderOnce(2);
      };
      mountainImg.src = THEME.mountainSrc;
    }

    /* Bergband in einen bildschirmgroßen Offscreen vorrendern:
       cover-Fit (füllt die ganze Breite), unten verankert, obere
       Bildschirmhälfte per destination-out weich in den Himmel ausgefadet. */
    function buildMountain() {
      SPR_MTN = null;
      if (!mountainReady || !mountainImg || !W || !H) return;
      var iw = mountainImg.naturalWidth, ih = mountainImg.naturalHeight;
      if (!iw || !ih) return;

      var oc = document.createElement('canvas');
      oc.width  = Math.floor(W * DPR);
      oc.height = Math.floor(H * DPR);
      var octx = oc.getContext('2d');
      if (!octx) return;
      octx.setTransform(DPR, 0, 0, DPR, 0, 0);

      /* cover: skaliere so, dass Breite UND Höhe gefüllt sind … */
      var scale = Math.max(W / iw, H / ih);
      var dw = iw * scale, dh = ih * scale;
      var dx = (W - dw) / 2;   // horizontal zentriert (überstehende Seiten beschnitten)
      var dy = H - dh;         // … und unten verankert (Berge sitzen am unteren Rand)
      octx.drawImage(mountainImg, dx, dy, dw, dh);

      /* Weiche Oberkante: in Bildschirm-Koordinaten von oben (komplett
         aufgelöst) bis ~52 % Höhe (volles Foto) ausradieren. */
      octx.globalCompositeOperation = 'destination-out';
      var fade = octx.createLinearGradient(0, 0, 0, H);
      fade.addColorStop(0.00, 'rgba(0,0,0,1)');
      fade.addColorStop(0.34, 'rgba(0,0,0,0.55)');
      fade.addColorStop(0.52, 'rgba(0,0,0,0)');
      octx.fillStyle = fade;
      octx.fillRect(0, 0, W, H);
      octx.globalCompositeOperation = 'source-over';

      SPR_MTN = { c: oc };
    }

    function makeFar()  { return { x: Math.random() * W, y: Math.random() * H, s: Math.random() * 3 + 2,   speed: Math.random() * 0.5 + 0.4, drift: Math.random() * 0.4 + 0.1, alpha: Math.random() * 0.35 + 0.15 }; }
    function makeMid()  { return { x: Math.random() * W, y: Math.random() * H, s: Math.random() * 6 + 5,   speed: Math.random() * 1.0 + 1.0, drift: Math.random() * 0.6 + 0.4, sway: Math.random() * 6.28, swaySpeed: Math.random() * 0.02 + 0.008, alpha: Math.random() * 0.4 + 0.5 }; }
    function makeNear() { return { x: Math.random() * W, y: Math.random() * H, s: Math.random() * 18 + 16, speed: Math.random() * 1.6 + 2.0, drift: Math.random() * 0.9 + 0.7, sway: Math.random() * 6.28, swaySpeed: Math.random() * 0.03 + 0.01,  alpha: Math.random() * 0.3 + 0.4 }; }
    function fillFlakes(arr, n, fn) { arr.length = 0; for (var i = 0; i < n; i++) arr.push(fn()); }
    function rebuildAll() {
      fillFlakes(far,  THEME.flakeFar,  makeFar);
      fillFlakes(mid,  THEME.flakeMid,  makeMid);
      fillFlakes(near, THEME.flakeNear, makeNear);
    }

    function resize() {
      if (!canvas || !ctx) return;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width  = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      rebuildAll();
      buildMountain();
      /* setzen von canvas.width leert die Fläche → bei reduced-motion
         (kein Loop) das Standbild direkt neu zeichnen. */
      if (reduceMotion) renderOnce(2);
    }

    function drawSky() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0,    'rgb(' + hexToRgb(THEME.sky[0]).join(',') + ')');
      g.addColorStop(0.55, 'rgb(' + hexToRgb(THEME.sky[1]).join(',') + ')');
      g.addColorStop(1,    'rgb(' + hexToRgb(THEME.sky[2]).join(',') + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function recycle(f) {
      if (f.y > H + f.s) { f.y = -f.s; f.x = Math.random() * W; }
      if (f.x > W + f.s) f.x -= W + f.s * 2;
      if (f.x < -f.s)    f.x += W + f.s * 2;
    }
    function drawFar(t, wind) {
      for (var i = 0; i < far.length; i++) { var f = far[i];
        f.x += wind * 0.22 * f.drift; f.y += f.speed * intensity * 0.7; recycle(f);
        ctx.globalAlpha = f.alpha; ctx.drawImage(SPR_FAR, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
    }
    function drawMid(t, wind) {
      for (var i = 0; i < mid.length; i++) { var f = mid[i];
        f.sway += f.swaySpeed;
        f.x += wind * 0.6 * f.drift + Math.sin(f.sway) * 0.7;
        f.y += f.speed * intensity + updraft(t, f.x) * 0.3; recycle(f);
        ctx.globalAlpha = f.alpha; ctx.drawImage(SPR_MID, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
    }
    function drawNear(t, wind) {
      for (var i = 0; i < near.length; i++) { var f = near[i];
        f.sway += f.swaySpeed;
        f.x += wind * 1.2 * f.drift + Math.sin(f.sway) * 1.2;
        f.y += f.speed * intensity * 1.6 + updraft(t, f.x); recycle(f);
        ctx.globalAlpha = f.alpha; ctx.drawImage(SPR_NEAR, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
    }
    function drawMountain() {
      if (!SPR_MTN) return;
      /* Offscreen ist bereits in Geräte-Pixeln (W*DPR × H*DPR) aufgebaut;
         hier 1:1 auf die (per setTransform auf CSS-Pixel skalierte) Fläche. */
      ctx.drawImage(SPR_MTN.c, 0, 0, W, H);
    }
    function drawFog(t, wind) {
      var strength = THEME.fogStrength;
      var rgb = fogRgb(), r = rgb[0], g = rgb[1], b = rgb[2];
      fogPhase += 0.0008 * (1 + Math.abs(wind) * 0.02);
      ctx.save();
      for (var i = 0; i < 3; i++) {
        var yc = H * (0.3 + i * 0.25) + Math.sin(t * 0.0005 + i) * H * 0.08;
        var band = H * 0.5;
        var a = strength * (0.16 + Math.sin(fogPhase * 2 + i * 1.7) * 0.05);
        var grad = ctx.createLinearGradient(0, yc - band, 0, yc + band);
        grad.addColorStop(0,   'rgba(' + r + ',' + g + ',' + b + ',0)');
        grad.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, a) + ')');
        grad.addColorStop(1,   'rgba(' + r + ',' + g + ',' + b + ',0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      }
      var gustHaze = strength * (0.08 + Math.max(0, Math.sin(t * 0.0004)) * 0.08);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + gustHaze + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    function renderOnce(wind) {
      drawSky();
      drawFar(windT, wind);
      drawMountain();
      drawFog(windT, wind);
      drawMid(windT, wind);
      drawNear(windT, wind);
    }

    /* Loop pausieren, wenn es nichts zu sehen gibt: Tab im Hintergrund
       oder offenes Modal (dessen blur-Backdrop alles verdeckt). */
    function isPaused() {
      if (document.hidden) return true;
      if (document.querySelector('.modal-overlay.open')) return true;
      return false;
    }

    function frame(now) {
      if (!running) return;
      if (isPaused()) { last = now; raf = requestAnimationFrame(frame); return; }
      var dt = Math.min(now - last, 50);
      last = now; windT += dt;
      renderOnce(windAt(windT));
      raf = requestAnimationFrame(frame);
    }

    function start(cv) {
      stop();               // idempotent: evtl. laufenden Loop sauber beenden
      if (!cv) return;
      canvas = cv;
      ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) { canvas = null; return; }
      ensureSprites();
      ensureMountainImg();  // Bergfoto laden (onload baut das Band auf)
      resize();             // baut Szene auf (+ zeichnet bei reduced-motion)
      window.addEventListener('resize', resize);
      if (reduceMotion) return;   // statisches Standbild → kein Loop
      running = true;
      last = (window.performance && performance.now) ? performance.now() : 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      window.removeEventListener('resize', resize);
      canvas = null; ctx = null;
    }

    return { start: start, stop: stop };
  })();

  /* ── CMD-FX: 0/1-Matrix-Hintergrund-Engine ───────────────────────
     Der CMD-Hintergrund ist – wie iceland – ein <canvas> mit requestAni-
     mationFrame-Loop: Spalten fallender Nullen/Einsen in dezentem
     Terminal-Grün, die DAUERHAFT hinter dem Inhalt durchlaufen (es gibt
     KEIN Lade-Intro mehr – früher js/cmd-intro.js als Overlay vor dem
     Content). Steuerung über den FX-Lebenszyklus (start beim Aufbau des
     cmd-FX, stop beim Theme-Wechsel/Teardown). themes.css-Konventionen,
     die für ein <canvas> nicht per CSS greifen, hier in JS abgebildet:
       • prefers-reduced-motion → ein einziges statisches Standbild
       • verstecktes Tab / offenes Modal → Loop pausiert (GPU sparen,
         analog zur animation-play-state-Pause in themes.css). */
  var PMCmdFX = (function () {
    var FONT  = 16;          // px Glyphengröße (= Spaltenbreite)
    var STEP  = 60;          // ms pro Regen-Schritt (ruhiger als 60 fps)
    var FADE  = 0.10;        // Nachzieh-Deckkraft pro Schritt (kl. = lange Spuren)
    var BASE  = '#020A03';   // Grundfläche (Terminal-Schwarz)
    var GLYPH = 'rgba(0, 230, 77, 0.40)';    // normale Ziffer (dezent)
    var HEAD  = 'rgba(190, 255, 205, 0.68)'; // gelegentlich hellerer Spaltenkopf
    var FONT_STACK = FONT + 'px Consolas, "Cascadia Mono", "Courier New", monospace';

    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var canvas = null, ctx = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1;
    var cols = [];           // y-Position (in Zeilen) pro Spalte
    var last = 0, acc = 0;

    function resize() {
      if (!canvas || !ctx) return;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width  = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.textBaseline = 'top';
      /* Spaltenanzahl an Breite anpassen, vorhandene Tropfen beibehalten,
         neue Spalten gestaffelt oberhalb des Sichtbereichs starten. */
      var n = Math.max(1, Math.floor(W / FONT));
      var next = [];
      for (var i = 0; i < n; i++) {
        next[i] = (cols[i] != null) ? cols[i] : Math.floor(Math.random() * -50);
      }
      cols = next;
      ctx.fillStyle = BASE;
      ctx.fillRect(0, 0, W, H);
      if (reduceMotion) renderStatic();
    }

    function step() {
      /* Nachzieh-Effekt: leicht transparentes Schwarz über den Vorframe. */
      ctx.fillStyle = 'rgba(2, 10, 3, ' + FADE + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.font = FONT_STACK;
      for (var i = 0; i < cols.length; i++) {
        var ch = (Math.random() < 0.5) ? '0' : '1';
        var x = i * FONT, y = cols[i] * FONT;
        ctx.fillStyle = (Math.random() < 0.05) ? HEAD : GLYPH;
        ctx.fillText(ch, x, y);
        if (y > H && Math.random() > 0.975) {
          cols[i] = Math.floor(Math.random() * -20);   // Spalte oben neu starten
        } else {
          cols[i] += 1;
        }
      }
    }

    /* reduced-motion: ein ruhiges, sparsames Standbild statt Loop. */
    function renderStatic() {
      ctx.font = FONT_STACK;
      var rows = Math.max(1, Math.floor(H / FONT));
      ctx.fillStyle = GLYPH;
      for (var i = 0; i < cols.length; i++) {
        if (Math.random() < 0.55) continue;            // gelichtetes Raster
        var y = Math.floor(Math.random() * rows) * FONT;
        ctx.fillText((Math.random() < 0.5) ? '0' : '1', i * FONT, y);
      }
    }

    /* Loop pausieren, wenn es nichts zu sehen gibt: Tab im Hintergrund
       oder offenes Modal (dessen Backdrop alles verdeckt). */
    function isPaused() {
      if (document.hidden) return true;
      if (document.querySelector('.modal-overlay.open')) return true;
      return false;
    }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (isPaused()) { last = now; return; }
      acc += (now - last);
      last = now;
      if (acc < STEP) return;
      acc = 0;
      step();
    }

    function start(cv) {
      stop();               // idempotent: evtl. laufenden Loop sauber beenden
      if (!cv) return;
      canvas = cv;
      ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) { canvas = null; return; }
      resize();             // baut Szene auf (+ zeichnet bei reduced-motion)
      window.addEventListener('resize', resize);
      if (reduceMotion) return;   // statisches Standbild → kein Loop
      running = true;
      last = (window.performance && performance.now) ? performance.now() : 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      window.removeEventListener('resize', resize);
      cols = [];
      canvas = null; ctx = null;
    }

    return { start: start, stop: stop };
  })();

  /* ── Candy-FX: Canvas-Seifenblasen-Engine ─────────────────────────
     Anders als die übrige Candy-Szene (reines CSS/SVG) sind die Seifen-
     blasen ein <canvas> mit requestAnimationFrame-Loop. Grund: sie sollen
     mit den (CSS-animierten) Einhörnern KOLLIDIEREN und beim Treffer
     zerplatzen – Kollision braucht Positionsdaten, die reines CSS nicht
     liefert. Der Physik-Charakter (Wander, sanftes Steigen, Soft-Body-
     Wabbeln) ist an den CodePen „Water Droplets" (wBzWebb) angelehnt, aber
     bewusst als leichte 2D-Variante OHNE WebGL/Three.js nachgebaut.
     Konventionen wie bei PMIcelandFX/PMCmdFX:
       • prefers-reduced-motion → ein statisches Standbild, kein Loop
       • verstecktes Tab / offenes Modal → Loop pausiert (GPU sparen)
     Fester Zeitschritt (FIXED_DT) → frame-raten-unabhängig; alle Tuning-
     Konstanten sind pro 16-ms-Tick gedacht. Styling/Position des <canvas>
     in css/theme-candy.css (.pm-cd-bubbles, z-index 9 = vor den Einhörnern,
     aber als Teil von #pmThemeFX weiter hinter dem App-Inhalt). */
  var PMCandyBubbles = (function () {
    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var SPRITE = null;            // vorgerendertes Blasen-Sprite (lazy)
    var SPRITE_SIZE = 128;

    /* Laufzeit-State (pro start() neu). */
    var canvas = null, ctx = null, fxRoot = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1;
    var last = 0, acc = 0, spawnT = 0;
    var bubbles = [];
    var uniImgs = [];             // Einhorn-<img> (Kollisionsziele)

    /* Physik – Werte pro fixem 16-ms-Tick (nicht pro Sekunde). */
    var FIXED_DT = 16;
    var MAX_BUBBLES = 16, SEED = 11;
    var BUOY = 0.045;             // Auftrieb (nach oben) pro Tick²
    var WANDER = 0.22;            // seitliche Zufallsbeschleunigung
    var SWAY = 0.10;              // Sinus-Schlinger-Amplitude
    var DAMP = 0.96;              // Geschwindigkeits-Dämpfung
    var MAX_SP = 2.2;             // Tempo-Cap (px/Tick)
    var REPEL = 0.6;              // gegenseitige Abstoßung bei Überlappung
    var POP_MS = 260;             // Dauer der Zerplatz-Animation
    var SPAWN_MS = 1400;          // Auto-Spawn-Intervall

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* Seifenblasen-Sprite: zarte Haut, irisierender Ring, Glanzpunkte. */
    function buildSprite() {
      if (SPRITE) return;
      var s = SPRITE_SIZE, c = document.createElement('canvas');
      c.width = c.height = s;
      var x = c.getContext('2d');
      var r = s / 2, cx = r, cy = r, ringR = r * 0.9;
      /* durchscheinende Haut (leicht sichtbar, bleibt aber glasig) */
      var g = x.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0,    'rgba(255,255,255,0.10)');
      g.addColorStop(0.55, 'rgba(225,240,255,0.07)');
      g.addColorStop(0.85, 'rgba(208,230,255,0.18)');
      g.addColorStop(1,    'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      /* irisierender Ring (Hue-Sweep aus mehreren Bögen) */
      x.lineWidth = Math.max(1.5, s * 0.026);
      var hues = [320, 280, 200, 160, 60, 20];
      for (var i = 0; i < hues.length; i++) {
        x.strokeStyle = 'hsla(' + hues[i] + ', 90%, 70%, 0.50)';
        x.beginPath();
        x.arc(cx, cy, ringR, (i / hues.length) * Math.PI * 2, ((i + 1) / hues.length) * Math.PI * 2);
        x.stroke();
      }
      /* klarer heller äußerer Rand */
      x.lineWidth = Math.max(1, s * 0.018);
      x.strokeStyle = 'rgba(255,255,255,0.78)';
      x.beginPath(); x.arc(cx, cy, ringR, 0, Math.PI * 2); x.stroke();
      /* großer Glanzpunkt oben-links */
      var hl = x.createRadialGradient(cx - r * 0.34, cy - r * 0.38, 0, cx - r * 0.34, cy - r * 0.38, r * 0.30);
      hl.addColorStop(0, 'rgba(255,255,255,0.85)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = hl; x.beginPath(); x.arc(cx - r * 0.34, cy - r * 0.38, r * 0.30, 0, Math.PI * 2); x.fill();
      /* kleiner Glanz unten-rechts */
      var hl2 = x.createRadialGradient(cx + r * 0.30, cy + r * 0.34, 0, cx + r * 0.30, cy + r * 0.34, r * 0.14);
      hl2.addColorStop(0, 'rgba(255,255,255,0.50)');
      hl2.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = hl2; x.beginPath(); x.arc(cx + r * 0.30, cy + r * 0.34, r * 0.14, 0, Math.PI * 2); x.fill();
      SPRITE = c;
    }

    function makeBubble(atBottom) {
      var r = rand(16, 34);
      var b = {
        x: rand(r, Math.max(r + 1, W - r)),
        y: atBottom ? (H + r + rand(0, H * 0.3)) : rand(r, Math.max(r + 1, H - r)),
        r: r,
        vx: rand(-0.4, 0.4),
        vy: -rand(0.4, 1.0),      // negativ = steigt
        phase: rand(0, Math.PI * 2),
        swaySpeed: rand(0.6, 1.3) * 0.035,
        sox: 0, soy: 0, svx: 0, svy: 0, px: 0, py: 0,
        pop: 0                    // 0 = lebt; >0 = Zerplatz-Fortschritt (ms)
      };
      b.px = b.x; b.py = b.y;
      return b;
    }

    function seed() {
      bubbles.length = 0;
      var n = reduceMotion ? 6 : SEED;
      for (var i = 0; i < n; i++) bubbles.push(makeBubble(false));
    }

    function grabUnicorns() {
      uniImgs = [];
      if (!fxRoot) return;
      var els = fxRoot.querySelectorAll('.pm-cd-unicorn .pm-cd-uni-img');
      for (var i = 0; i < els.length; i++) uniImgs.push(els[i]);
    }

    /* Kollisionsrechtecke der Einhörner (einmal pro Tick gelesen). Der
       sichtbare Körper wird geschätzt: PNG ist hochkant, Sprite via
       object-fit:contain unten ausgerichtet → seitlich einschrumpfen,
       oben etwas kappen. Null-Flächen (z. B. mid via Media-Query
       display:none) werden übersprungen. */
    function unicornRects() {
      var out = [];
      for (var i = 0; i < uniImgs.length; i++) {
        var r = uniImgs[i].getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        var insetX = r.width * 0.19;
        out.push({ l: r.left + insetX, r: r.right - insetX, t: r.top + r.height * 0.12, b: r.bottom });
      }
      return out;
    }
    function hitsAny(b, rects) {
      for (var i = 0; i < rects.length; i++) {
        var R = rects[i];
        var nx = b.x < R.l ? R.l : (b.x > R.r ? R.r : b.x);
        var ny = b.y < R.t ? R.t : (b.y > R.b ? R.b : b.y);
        var dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy <= b.r * b.r) return true;
      }
      return false;
    }

    function step() {
      var i, j, b;
      /* Kräfte auf lebende Blasen */
      for (i = 0; i < bubbles.length; i++) {
        b = bubbles[i];
        if (b.pop > 0) { b.pop += FIXED_DT; continue; }
        b.phase += b.swaySpeed;
        b.vx += (Math.random() - 0.5) * WANDER;
        b.vx += Math.cos(b.phase) * SWAY;
        b.vy -= BUOY;
      }
      /* gegenseitige Abstoßung (kein Merge – Seifenblasen jostlen nur) */
      for (i = 0; i < bubbles.length; i++) {
        var a = bubbles[i]; if (a.pop > 0) continue;
        for (j = i + 1; j < bubbles.length; j++) {
          var c = bubbles[j]; if (c.pop > 0) continue;
          var dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy, mn = a.r + c.r;
          if (d2 < mn * mn && d2 > 0.01) {
            var d = Math.sqrt(d2), f = (1 - d / mn) * REPEL, ux = dx / d, uy = dy / d;
            a.vx -= ux * f; a.vy -= uy * f; c.vx += ux * f; c.vy += uy * f;
          }
        }
      }
      /* Integration + Wände + Soft-Body + Kollision */
      var rects = unicornRects();
      for (i = 0; i < bubbles.length; i++) {
        b = bubbles[i];
        if (b.pop > 0) continue;
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp > MAX_SP) { var s = MAX_SP / sp; b.vx *= s; b.vy *= s; }
        b.x += b.vx; b.y += b.vy; b.vx *= DAMP; b.vy *= DAMP;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.5; }
        else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
        if (b.y < -b.r - 6) { bubbles[i] = makeBubble(true); continue; }  // oben raus → unten neu
        /* Soft-Body-Feder: Wabbeln folgt der Bewegung verzögert */
        var mvx = b.x - b.px, mvy = b.y - b.py;
        b.svx = (b.svx + (mvx - b.sox) * 0.25) * 0.55;
        b.svy = (b.svy + (mvy - b.soy) * 0.25) * 0.55;
        b.sox += b.svx; b.soy += b.svy; b.px = b.x; b.py = b.y;
        if (hitsAny(b, rects)) b.pop = 1;   // Einhorn-Treffer → zerplatzt
      }
      /* ausgereifte Pops entfernen */
      for (i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].pop > POP_MS) bubbles.splice(i, 1);
      /* Auto-Spawn füllt geplatzte nach */
      spawnT += FIXED_DT;
      if (spawnT > SPAWN_MS && bubbles.length < MAX_BUBBLES) {
        spawnT = 0; bubbles.push(makeBubble(true));
      }
    }

    function clampW(v) { return v < -0.12 ? -0.12 : (v > 0.12 ? 0.12 : v); }
    function drawBubble(b) {
      if (b.pop > 0) {
        var t = b.pop / POP_MS;             // 0..1
        var alpha = 1 - t;
        var rad = b.r * (1 + t * 0.6);
        ctx.globalAlpha = alpha;
        ctx.drawImage(SPRITE, b.x - rad, b.y - rad, rad * 2, rad * 2);
        /* Burst-Ring */
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1 + t * 0.9), 0, Math.PI * 2); ctx.stroke();
        /* Spritzer */
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (var k = 0; k < 5; k++) {
          var ang = (k / 5) * Math.PI * 2, dd = b.r * (0.6 + t * 1.6), pr = Math.max(0.5, 2 * (1 - t));
          ctx.beginPath(); ctx.arc(b.x + Math.cos(ang) * dd, b.y + Math.sin(ang) * dd, pr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      /* lebende Blase mit leichtem Soft-Body-Squash entlang der Bewegung */
      var sx = 1 + clampW(b.sox * 0.04), sy = 1 + clampW(b.soy * 0.04), d2 = b.r * 2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(sx, sy);
      ctx.drawImage(SPRITE, -b.r, -b.r, d2, d2);
      ctx.restore();
    }

    function renderFrame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < bubbles.length; i++) drawBubble(bubbles[i]);
    }
    function renderStatic() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        ctx.drawImage(SPRITE, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    }

    function resize() {
      if (!canvas || !ctx) return;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (reduceMotion) renderStatic();   // kein Loop → Standbild neu zeichnen
    }

    /* Loop pausieren, wenn nichts zu sehen ist (Tab versteckt / Modal offen –
       analog PMIcelandFX und der animation-play-state-Pause in themes.css). */
    function isPaused() {
      if (document.hidden) return true;
      if (document.querySelector('.modal-overlay.open')) return true;
      return false;
    }
    function frame(now) {
      if (!running) return;
      if (isPaused()) { last = now; raf = requestAnimationFrame(frame); return; }
      var dt = Math.min(now - last, 100);
      last = now; acc += dt;
      var guard = 0;
      while (acc >= FIXED_DT && guard < 6) { step(); acc -= FIXED_DT; guard++; }
      if (guard >= 6) acc = 0;
      renderFrame();
      raf = requestAnimationFrame(frame);
    }

    function start(cv) {
      stop();                 // idempotent
      if (!cv) return;
      canvas = cv;
      fxRoot = cv.parentNode;
      ctx = canvas.getContext('2d');   // alpha → transparent über der Szene
      if (!ctx) { canvas = null; return; }
      buildSprite();
      resize();               // setzt W/H
      seed();
      grabUnicorns();
      window.addEventListener('resize', resize);
      if (reduceMotion) { renderStatic(); return; }   // Standbild, kein Loop
      running = true;
      last = (window.performance && performance.now) ? performance.now() : 0;
      acc = 0; spawnT = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      window.removeEventListener('resize', resize);
      canvas = null; ctx = null; fxRoot = null;
      bubbles.length = 0; uniImgs.length = 0;
    }

    return { start: start, stop: stop };
  })();

  /* ── Halloween-FX: Canvas-Nebel-Engine ────────────────────────────
     Der „leichte Nebel, der über den Bildschirm zieht" ist – wie bei
     iceland/cmd/candy – ein <canvas> mit requestAnimationFrame-Loop,
     bewusst statt einem CSS-filter:blur-Layer (Perf-Regel in themes.css:
     keine großen blur-Filter auf viewportfüllenden fixed Layern). Mehrere
     weiche, halbtransparente Nebelschwaden (radiale Verläufe, daher
     inhärent weich – kein Blur nötig) driften horizontal über die Szene,
     wabern in der Deckkraft und tauchen nach dem rechten Rand links wieder
     auf. Tief angesetzt (untere Bildhälfte) → Bodennebel vor Haus/Gräbern.
     Konventionen wie bei den übrigen FX-Engines:
       • prefers-reduced-motion → ein statisches Standbild, kein Loop
       • verstecktes Tab / offenes Modal → Loop pausiert (GPU sparen).
     Styling/Fallback des <canvas> in css/theme-halloween.css (.pm-hw-fog). */
  var PMHalloweenFog = (function () {
    var FOG = [188, 180, 200];      // kühles, entsättigtes Grau-Lila
    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var canvas = null, ctx = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1, last = 0, t = 0;
    var puffs = [];

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* Nebelschwaden aufbauen (lazy, pro resize neu an die Größe angepasst).
       y im unteren Bereich → Bodennebel; vx nur nach rechts (px pro ms). */
    function build() {
      puffs.length = 0;
      var n = Math.max(6, Math.round(W / 240));
      for (var i = 0; i < n; i++) {
        var r = rand(H * 0.18, H * 0.40);
        puffs.push({
          x: rand(-r, W + r),
          y: rand(H * 0.46, H * 0.94),
          r: r,
          vx: rand(0.004, 0.013),
          a: rand(0.05, 0.11),
          phase: rand(0, Math.PI * 2),
          sw: rand(0.0003, 0.0008)
        });
      }
    }

    function resize() {
      if (!canvas || !ctx) return;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
      if (reduceMotion) render();    // kein Loop → Standbild neu zeichnen
    }

    function drawPuff(p, alpha) {
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0,   'rgba(' + FOG[0] + ',' + FOG[1] + ',' + FOG[2] + ',' + alpha + ')');
      g.addColorStop(0.55,'rgba(' + FOG[0] + ',' + FOG[1] + ',' + FOG[2] + ',' + (alpha * 0.42) + ')');
      g.addColorStop(1,   'rgba(' + FOG[0] + ',' + FOG[1] + ',' + FOG[2] + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < puffs.length; i++) {
        var p = puffs[i];
        var a = p.a * (0.55 + 0.45 * Math.sin(p.phase + t * p.sw));
        if (a > 0) drawPuff(p, a);
      }
    }

    function isPaused() {
      if (document.hidden) return true;
      if (document.querySelector('.modal-overlay.open')) return true;
      return false;
    }

    function frame(now) {
      if (!running) return;
      if (isPaused()) { last = now; raf = requestAnimationFrame(frame); return; }
      var dt = Math.min(now - last, 50);
      last = now; t += dt;
      for (var i = 0; i < puffs.length; i++) {
        var p = puffs[i];
        p.x += p.vx * dt;
        if (p.x - p.r > W) { p.x = -p.r; p.y = rand(H * 0.46, H * 0.94); }   // rechts raus → links neu
      }
      render();
      raf = requestAnimationFrame(frame);
    }

    function start(cv) {
      stop();                 // idempotent
      if (!cv) return;
      canvas = cv;
      ctx = canvas.getContext('2d');   // transparent über der Szene
      if (!ctx) { canvas = null; return; }
      resize();
      window.addEventListener('resize', resize);
      if (reduceMotion) { render(); return; }   // Standbild, kein Loop
      running = true;
      last = (window.performance && performance.now) ? performance.now() : 0;
      t = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      window.removeEventListener('resize', resize);
      puffs.length = 0;
      canvas = null; ctx = null;
    }

    return { start: start, stop: stop };
  })();

  /* ── Christmas-FX: Canvas-Schneefall-Engine ───────────────────────
     Wind-getragene, DICKE Flocken in geringer Dichte (leicht). Anders als
     PMIcelandFX (opakes Schnee-Sturm-Bild) zeichnet diese Engine auf ein
     TRANSPARENTES Canvas ÜBER dem Winterbild (.pm-xm-bg). Starker
     horizontaler Wind mit Böen + per-Flocke-Sway → Flocken treiben seitlich
     statt senkrecht zu fallen. Konventionen wie die übrigen Engines:
       • prefers-reduced-motion → statisches Standbild, kein Loop
       • verstecktes Tab / offenes Modal → Loop pausiert (GPU sparen). */
  var PMChristmasSnow = (function () {
    var WIND = 1.4;            // Grund-Seitenwind (px/Frame bei intensity 1)
    var COUNT_DIVISOR = 26000; // Fläche/Divisor = Flockenzahl (gering = leicht)
    var MAX_FLAKES = 90;

    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var SPRITE = null;
    function makeFlakeSprite(size) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var x = c.getContext('2d'), r = size / 2;
      var g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0,   'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.8, 'rgba(235,244,255,0.35)');
      g.addColorStop(1,   'rgba(235,244,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill();
      return c;
    }
    function ensureSprite() { if (!SPRITE) SPRITE = makeFlakeSprite(64); }

    var canvas = null, ctx = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1, last = 0, windT = 0;
    var flakes = [];

    function makeFlake() {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() * 10 + 8,        // 8–18px: dicke Flocken
        speed: Math.random() * 0.5 + 0.35, // langsames Sinken (leicht)
        drift: Math.random() * 0.7 + 0.5,  // Empfindlichkeit für Wind
        sway: Math.random() * 6.28,
        swaySpeed: Math.random() * 0.02 + 0.008,
        swayAmp: Math.random() * 1.2 + 0.6,
        alpha: Math.random() * 0.4 + 0.55
      };
    }
    function rebuild() {
      var n = Math.min(MAX_FLAKES, Math.max(20, Math.round((W * H) / COUNT_DIVISOR)));
      flakes.length = 0;
      for (var i = 0; i < n; i++) flakes.push(makeFlake());
    }

    function resize() {
      if (!canvas || !ctx) return;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      rebuild();
      if (reduceMotion) renderOnce();
    }

    function windAt(t) {
      var gust = Math.sin(t * 0.0005) * 0.5 + Math.sin(t * 0.0013 + 1.7) * 0.3;
      return WIND * (1 + gust);
    }
    function recycle(f) {
      if (f.y > H + f.s) { f.y = -f.s; f.x = Math.random() * W; }
      if (f.x > W + f.s) f.x -= W + f.s * 2;
      if (f.x < -f.s)    f.x += W + f.s * 2;
    }
    function renderOnce() {
      ctx.clearRect(0, 0, W, H);
      var wind = windAt(windT);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        ctx.globalAlpha = f.alpha;
        ctx.drawImage(SPRITE, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
      return wind;
    }

    function isPaused() {
      if (document.hidden) return true;
      if (document.querySelector('.modal-overlay.open')) return true;
      return false;
    }
    function frame(now) {
      if (!running) return;
      if (isPaused()) { last = now; raf = requestAnimationFrame(frame); return; }
      var dt = Math.min(now - last, 50);
      last = now; windT += dt;
      var wind = windAt(windT);
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.sway += f.swaySpeed;
        f.x += wind * f.drift + Math.sin(f.sway) * f.swayAmp;
        f.y += f.speed;
        recycle(f);
        ctx.globalAlpha = f.alpha;
        ctx.drawImage(SPRITE, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function start(cv) {
      stop();
      if (!cv) return;
      canvas = cv;
      ctx = canvas.getContext('2d');   // transparent über dem Bild
      if (!ctx) { canvas = null; return; }
      ensureSprite();
      resize();
      window.addEventListener('resize', resize);
      if (reduceMotion) return;        // Standbild, kein Loop
      running = true;
      last = (window.performance && performance.now) ? performance.now() : 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      window.removeEventListener('resize', resize);
      flakes.length = 0;
      canvas = null; ctx = null;
    }

    return { start: start, stop: stop };
  })();

  /* ── Halloween-Hintergrundmusik ───────────────────────────────────
     Stimmungs-Loop (assets/music/Halloween-Backgroundmusic.mp3), der NUR
     im Halloween-Theme läuft. Wie die FX-Engines wird er am FX-Lebens-
     zyklus gesteuert (start im halloween-Zweig von ensureThemeFX, stop
     beim Theme-Wechsel/Teardown) und überlebt damit SPA-Navigationen.

     Autoplay-Politik der Browser: Ton ohne Nutzergeste ist blockiert,
     STUMME Wiedergabe aber erlaubt. Der Loop startet daher bewusst
     gemutet und läuft sofort (muted autoplay) – der Nutzer hebt die
     Stummschaltung über den kleinen Button unten rechts auf (ein Klick =
     Nutzergeste → Ton sofort hörbar, da bereits laufend). Standard ist
     also IMMER stumm; eine Reload-übergreifende Merk-Logik gibt es
     bewusst NICHT (sonst würde der Browser unmuted-Autoplay nach einem
     echten Page-Load erneut blockieren und der Loop bliebe stumm stehen).

     <audio> + Steuer-Wrapper hängen DIREKT am <body> (NICHT in #pmThemeFX –
     der ist aria-hidden + pointer-events:none, die Bedienelemente müssen
     aber klickbar sein). router.js fasst nur `body > .modal-overlay` an →
     beide überleben Seitenwechsel. Struktur (Styling in
     css/theme-halloween.css): .pm-hw-music (Wrapper, fixed unten rechts)
     > .pm-hw-music__vol (Lautstärke-Slider) + .pm-hw-music__btn (Mute-
     Button). data-muted am Button = EFFEKTIVE Stille (muted ODER Vol 0). */
  var PMHalloweenMusic = (function () {
    var SRC         = 'assets/music/Halloween-Backgroundmusic.mp3';
    var WRAP_ID     = 'pmHwMusic';
    var AUDIO_ID    = 'pmHwMusicAudio';
    var DEFAULT_VOL = 0.5;
    var audio = null, wrap = null, btn = null, vol = null;

    /* Lautsprecher-Triangel (gefüllt) + Schallwellen / X (gestrichelt).
       Attribute inline, damit die Icons unabhängig vom CSS korrekt füllen. */
    var ICON_ON =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
        '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
        '<path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M18.7 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    var ICON_MUTED =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
        '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
        '<path d="m16 9 5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';

    /* EFFEKTIVE Stille: hart gemutet ODER Lautstärke 0 (siehe CSS-Kommentar). */
    function effectiveMuted() { return !audio || audio.muted || audio.volume === 0; }

    function ensurePlaying() {
      if (audio && audio.paused) {
        try { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      }
    }

    function render() {
      if (!btn || !audio) return;
      var m = effectiveMuted();
      btn.innerHTML = m ? ICON_MUTED : ICON_ON;
      btn.setAttribute('data-muted', m ? 'true' : 'false');
      btn.setAttribute('aria-pressed', m ? 'false' : 'true');
      var label = m ? 'Hintergrundmusik einschalten' : 'Hintergrundmusik stummschalten';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      /* Slider mit der echten Lautstärke synchronisieren (nicht, während der
         Nutzer ihn gerade zieht → würde den Drag stören). */
      if (vol && document.activeElement !== vol) vol.value = String(audio.volume);
    }

    function toggle() {
      if (!audio) return;
      if (effectiveMuted()) {
        audio.muted = false;
        if (audio.volume === 0) audio.volume = DEFAULT_VOL;   // sonst bliebe es still
        ensurePlaying();   // Nutzergeste liegt vor → Ton sicher starten
      } else {
        audio.muted = true;
      }
      render();
    }

    function onVol() {
      if (!audio || !vol) return;
      var v = parseFloat(vol.value);
      if (isNaN(v)) v = 0;
      audio.volume = v;
      if (v > 0) { audio.muted = false; ensurePlaying(); }  // Lautstärke hochziehen = unmuten
      render();
    }

    function start() {
      stop();   // idempotent: evtl. Reste aus einem früheren Aufbau entfernen
      if (!document.body) return;

      audio = document.createElement('audio');
      audio.id = AUDIO_ID;
      audio.src = SRC;
      audio.loop = true;
      audio.muted = true;          // Standard: stumm (muted autoplay erlaubt)
      audio.volume = DEFAULT_VOL;
      audio.preload = 'auto';
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
      try { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}

      wrap = document.createElement('div');
      wrap.id = WRAP_ID;
      wrap.className = 'pm-hw-music';

      vol = document.createElement('input');
      vol.type = 'range';
      vol.className = 'pm-hw-music__vol';
      vol.min = '0'; vol.max = '1'; vol.step = '0.01';
      vol.value = String(DEFAULT_VOL);
      vol.setAttribute('aria-label', 'Lautstärke der Hintergrundmusik');
      vol.addEventListener('input', onVol);

      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-hw-music__btn';
      btn.addEventListener('click', toggle);

      wrap.appendChild(vol);
      wrap.appendChild(btn);
      document.body.appendChild(wrap);
      render();
    }

    function stop() {
      var oldWrap = document.getElementById(WRAP_ID);
      if (oldWrap && oldWrap.parentNode) oldWrap.parentNode.removeChild(oldWrap);
      var oldAudio = document.getElementById(AUDIO_ID);
      if (oldAudio) {
        try { oldAudio.pause(); } catch (e) {}
        if (oldAudio.parentNode) oldAudio.parentNode.removeChild(oldAudio);
      }
      audio = null; wrap = null; btn = null; vol = null;
    }

    return { start: start, stop: stop };
  })();

  /* ── Christmas-Hintergrundmusik ───────────────────────────────────
     Baugleich zu PMHalloweenMusic (siehe ausführlichen Kommentar dort),
     nur Quelle + IDs/Klassen tragen den christmas-Präfix (pm-xm-, wie
     pm-xm-snow). Läuft NUR im Christmas-Theme, am FX-Lebenszyklus
     gesteuert (start im christmas-Zweig von ensureThemeFX, stop beim
     Theme-Wechsel/Teardown), startet als stummer Loop (muted autoplay)
     und wird per Button/Slider unten rechts hörbar gemacht. Styling in
     css/theme-christmas.css (.pm-xm-music…). */
  var PMChristmasMusic = (function () {
    var SRC         = 'assets/music/Christmas background.mp3';
    var WRAP_ID     = 'pmXmMusic';
    var AUDIO_ID    = 'pmXmMusicAudio';
    var DEFAULT_VOL = 0.5;
    var audio = null, wrap = null, btn = null, vol = null;

    /* Lautsprecher (gefüllt) + Schallwellen / X (gestrichelt) – Attribute
       inline, damit die Icons unabhängig vom CSS korrekt füllen. */
    var ICON_ON =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
        '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
        '<path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M18.7 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    var ICON_MUTED =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
        '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
        '<path d="m16 9 5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';

    /* EFFEKTIVE Stille: hart gemutet ODER Lautstärke 0. */
    function effectiveMuted() { return !audio || audio.muted || audio.volume === 0; }

    function ensurePlaying() {
      if (audio && audio.paused) {
        try { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      }
    }

    function render() {
      if (!btn || !audio) return;
      var m = effectiveMuted();
      btn.innerHTML = m ? ICON_MUTED : ICON_ON;
      btn.setAttribute('data-muted', m ? 'true' : 'false');
      btn.setAttribute('aria-pressed', m ? 'false' : 'true');
      var label = m ? 'Hintergrundmusik einschalten' : 'Hintergrundmusik stummschalten';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      if (vol && document.activeElement !== vol) vol.value = String(audio.volume);
    }

    function toggle() {
      if (!audio) return;
      if (effectiveMuted()) {
        audio.muted = false;
        if (audio.volume === 0) audio.volume = DEFAULT_VOL;   // sonst bliebe es still
        ensurePlaying();   // Nutzergeste liegt vor → Ton sicher starten
      } else {
        audio.muted = true;
      }
      render();
    }

    function onVol() {
      if (!audio || !vol) return;
      var v = parseFloat(vol.value);
      if (isNaN(v)) v = 0;
      audio.volume = v;
      if (v > 0) { audio.muted = false; ensurePlaying(); }  // Lautstärke hochziehen = unmuten
      render();
    }

    function start() {
      stop();   // idempotent: evtl. Reste aus einem früheren Aufbau entfernen
      if (!document.body) return;

      audio = document.createElement('audio');
      audio.id = AUDIO_ID;
      audio.src = SRC;
      audio.loop = true;
      audio.muted = true;          // Standard: stumm (muted autoplay erlaubt)
      audio.volume = DEFAULT_VOL;
      audio.preload = 'auto';
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
      try { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}

      wrap = document.createElement('div');
      wrap.id = WRAP_ID;
      wrap.className = 'pm-xm-music';

      vol = document.createElement('input');
      vol.type = 'range';
      vol.className = 'pm-xm-music__vol';
      vol.min = '0'; vol.max = '1'; vol.step = '0.01';
      vol.value = String(DEFAULT_VOL);
      vol.setAttribute('aria-label', 'Lautstärke der Hintergrundmusik');
      vol.addEventListener('input', onVol);

      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-xm-music__btn';
      btn.addEventListener('click', toggle);

      wrap.appendChild(vol);
      wrap.appendChild(btn);
      document.body.appendChild(wrap);
      render();
    }

    function stop() {
      var oldWrap = document.getElementById(WRAP_ID);
      if (oldWrap && oldWrap.parentNode) oldWrap.parentNode.removeChild(oldWrap);
      var oldAudio = document.getElementById(AUDIO_ID);
      if (oldAudio) {
        try { oldAudio.pause(); } catch (e) {}
        if (oldAudio.parentNode) oldAudio.parentNode.removeChild(oldAudio);
      }
      audio = null; wrap = null; btn = null; vol = null;
    }

    return { start: start, stop: stop };
  })();

  /* ── Candy: Vordergrund-Charakterwechsel beim Rand-Austritt ───────
     „Wenn ein Einhorn den Bildschirmrand verlassen hat, wechselt, welcher
     Charakter im Vordergrund läuft." Umgesetzt rein über das CSS-
     animationiteration-Event der LAUF-Animation (pm-cd-uni-run): eine
     Iteration = ein voller Lauf von Rand zu Rand, d. h. das Einhorn ist
     beim Iterations-Ende OFF-SCREEN → der Sprite-Tausch ist unsichtbar.
     Es gibt 2 Charaktere; der Vordergrund wechselt bei jedem Lauf des
     vorderen Einhorns, der Hintergrund nimmt am eigenen (off-screen)
     Rundenende stets den Komplement-Charakter → die beiden bleiben i. d. R.
     verschieden, und jede Änderung passiert unsichtbar am Rand.
     Listener werden beim FX-Teardown automatisch mit den Elementen
     entsorgt (kein manuelles Aufräumen nötig). */
  var UNI_CHARS = [
    { src: 'assets/candy-unicorn-1.png', ar: '330 / 460' },
    { src: 'assets/candy-unicorn-2.png', ar: '321 / 460' }
  ];
  function uniCharIndex(img) {
    var s = img && img.getAttribute('src');
    return (s && s.indexOf('candy-unicorn-2') !== -1) ? 1 : 0;
  }
  function setUniChar(unicornEl, idx) {
    if (!unicornEl) return;
    var img = unicornEl.querySelector('.pm-cd-uni-img');
    if (!img) return;
    img.setAttribute('src', UNI_CHARS[idx].src);
    unicornEl.style.aspectRatio = UNI_CHARS[idx].ar;
  }
  function wireCandyUnicornSwap(fxRoot) {
    var front = fxRoot.querySelector('.pm-cd-unicorn--front');
    var mid   = fxRoot.querySelector('.pm-cd-unicorn--mid');
    if (!front && !mid) return;
    /* aktueller Vordergrund-Charakter aus dem DOM ableiten */
    var frontIdx = front ? uniCharIndex(front.querySelector('.pm-cd-uni-img')) : 1;
    if (front) front.addEventListener('animationiteration', function (e) {
      if (e.animationName !== 'pm-cd-uni-run') return;   // Hüpf-/Schatten-Iteration ignorieren
      frontIdx = 1 - frontIdx;            // Vordergrund wechselt (front ist hier off-screen)
      setUniChar(front, frontIdx);
    });
    if (mid) mid.addEventListener('animationiteration', function (e) {
      if (e.animationName !== 'pm-cd-uni-run') return;
      setUniChar(mid, 1 - frontIdx);      // Hintergrund = Komplement (mid hier off-screen)
    });
  }

  /* Reduzierte FX-Templates NUR für die Login-Seite (greifen in
     ensureThemeFX VOR den Vollszenen-Templates FX_TEMPLATES).
     halloween: eigenes Login-Hintergrundbild (.pm-hw-login-bg) + die
     abseilende Spinne oben links – KEIN Geisterhaus, Nebel oder Musik. */
  var FX_LOGIN_TEMPLATES = {
    halloween:
      '<div class="pm-hw-login-bg"></div>' +
      '<div class="pm-hw-spider pm-hw-spider--login"><i class="pm-hw-spider__thread"></i><i class="pm-hw-spider__body"></i></div>' +
      '<div class="pm-hw-spider pm-hw-spider--login-2"><i class="pm-hw-spider__thread"></i><i class="pm-hw-spider__body"></i></div>' +
      '<div class="pm-hw-spider pm-hw-spider--login-3"><i class="pm-hw-spider__thread"></i><i class="pm-hw-spider__body"></i></div>' +
      '<div class="pm-hw-spider pm-hw-spider--login-4"><i class="pm-hw-spider__thread"></i><i class="pm-hw-spider__body"></i></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--lg1"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--lg2 pm-hw-eyes--green"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--lg3"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--lg4"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--lg5 pm-hw-eyes--green"></div>',
    /* christmas: gemütliche Kaminstube als Login-Hintergrund. Reines CSS-
       Leuchten – flackerndes Kaminfeuer (zwei Ebenen: Kern + Raum-Abstrahlung)
       sowie sanft funkelnde Lichterketten an Decke/Kranz und am Weihnachtsbaum
       (inkl. Spitzenstern). Eine „Stage" in exakter Bildgröße (cover-Box) hält
       alle Glühpunkte deckungsgleich über ihren Bildmotiven – seitenverhältnis-
       unabhängig. Kein Schnee/keine Musik auf der Login-Seite. */
    christmas:
      '<div class="pm-xm-login-stage" aria-hidden="true">' +
        '<div class="pm-xm-fire pm-xm-fire--cast"></div>' +
        '<div class="pm-xm-fire pm-xm-fire--core"></div>' +
        '<i class="pm-xm-glow pm-xm-glow--ceil1"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--ceil2"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--ceil3"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--ceil4"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--wreath"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--mantel"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--star"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--tree1"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--tree2"></i>' +
        '<i class="pm-xm-glow pm-xm-glow--tree3"></i>' +
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
    /* Beim Neuaufbau/Teardown evtl. laufende Canvas-Loops (iceland, cmd,
       candy-Seifenblasen, halloween-Nebel) sauber beenden – sonst rendern
       sie nach dem Theme-Wechsel weiter. Alle stop() sind idempotent. */
    PMIcelandFX.stop();
    PMCmdFX.stop();
    PMCandyBubbles.stop();
    PMHalloweenFog.stop();
    PMChristmasSnow.stop();
    PMHalloweenMusic.stop();
    PMChristmasMusic.stop();

    /* Login-Seite: kein FX – AUSNAHMEN: cmd (Terminal-Matrix als Hintergrund
       statt der Brand-Fläche) und halloween (reduzierte Szene: Login-
       Hintergrundbild + abseilende Spinne oben links). Übrige Custom-Themes
       bleiben auf Login aus (deren ::before/::after-Ambient sind via
       glass.css ohnehin deaktiviert). */
    var isLogin = document.body.classList.contains('login-page');
    if (isLogin && theme !== 'cmd' && theme !== 'halloween' && theme !== 'christmas') return;

    /* Auf der Login-Seite ggf. ein reduziertes Template; sonst die Vollszene.
       light/dark/unbekannt → '' → kein FX. */
    var tpl = (isLogin && FX_LOGIN_TEMPLATES[theme]) || FX_TEMPLATES[theme] || '';
    if (!tpl) return;

    var el = document.createElement('div');
    el.id = 'pmThemeFX';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = tpl;
    document.body.appendChild(el);

    /* iceland/cmd/candy/halloween: Canvas-Loop am frisch eingehängten
       <canvas> starten (alle übrigen Layer sind rein CSS/SVG → kein Loop). */
    if (theme === 'iceland') {
      var isCanvas = el.querySelector('.pm-is-bg');
      if (isCanvas) PMIcelandFX.start(isCanvas);
    } else if (theme === 'cmd') {
      var cmdCanvas = el.querySelector('.pm-cmd-bg');
      if (cmdCanvas) PMCmdFX.start(cmdCanvas);
    } else if (theme === 'candy') {
      var bubbleCanvas = el.querySelector('.pm-cd-bubbles');
      if (bubbleCanvas) PMCandyBubbles.start(bubbleCanvas);
      wireCandyUnicornSwap(el);
    } else if (theme === 'halloween') {
      var fogCanvas = el.querySelector('.pm-hw-fog');   // im Login-Template nicht vorhanden → null
      if (fogCanvas) PMHalloweenFog.start(fogCanvas);
      if (!isLogin) PMHalloweenMusic.start();   // Musik nur in der App, nicht auf Login
    } else if (theme === 'christmas') {
      var snowCanvas = el.querySelector('.pm-xm-snow');
      if (snowCanvas) PMChristmasSnow.start(snowCanvas);
      if (!isLogin) PMChristmasMusic.start();   // Musik nur in der App, nicht auf Login
    }
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
    setThemeAttrs(theme);
    applySilkHue();
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
  setThemeAttrs(theme);
  applySilkHue();
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

    /** Silk-Farbvarianten (für UI-Aufbau) + aktive Farbe/Hue. */
    SILK_COLORS: SILK_COLORS.map(function (c) { return { id: c.id, label: c.label, hue: c.hue }; }),
    getSilkColor: function () { return readSilkColor(); },
    getSilkHue: function () { return silkHueOf(readSilkColor()); },
    /** Silk-Grundfarbe wählen: setzt --silk-hue (CSS) + feuert
        'pm-silk-color-change' (react-theme-layer färbt WebGL + Strahlen um). */
    setSilkColor: function (id) {
      if (!SILK_COLORS.some(function (c) { return c.id === id; })) return;
      try { localStorage.setItem(SILK_COLOR_KEY, id); } catch (e) {}
      applySilkHue();
      try { window.dispatchEvent(new CustomEvent('pm-silk-color-change', { detail: id })); } catch (e) {}
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
    if (cachedRole === 'azubi' || cachedRole === 'pruefer' || cachedRole === 'admin' || cachedRole === 'developer') {
      html.setAttribute('data-role', cachedRole);
    }
  } catch (e) {}

  /* ── Fähigkeits-Init-State ──────────────────────────────────────
     Spiegelt die zuletzt bekannten Fähigkeits-Flags (gesetzt von
     applyCapabilities() in app.js) synchron auf <html data-*>, damit das
     fähigkeitsbasierte Nav-Gating schon vor dem ersten Paint stimmt. */
  try {
    if (localStorage.getItem('capKannPlanen')   === '1') html.setAttribute('data-kann-planen', '1');
    if (localStorage.getItem('capIstAusbilder') === '1') html.setAttribute('data-ist-ausbilder', '1');
    if (localStorage.getItem('capIstAzubi')     === '1') html.setAttribute('data-ist-azubi', '1');
    if (localStorage.getItem('capKorrektur')    === '1') html.setAttribute('data-korrektur', '1');
    if (localStorage.getItem('capIstReinerPruefer') === '1') html.setAttribute('data-ist-reiner-pruefer', '1');
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

  /* ── Testphasen-Hinweis ─────────────────────────────────────────
     Dezente, fixe Pille oben mittig, die auf JEDER Seite (inkl. Login)
     signalisiert, dass sich die Anwendung noch in der Testphase befindet.
     Bewusst hier in theme.js, weil dieses Script als einziges nachweislich
     auf allen Seiten im <head> geladen wird → ein Ort, alle Seiten, ohne
     jede HTML-Datei anzufassen.

     • Eigene, feste Farben (Bernstein) statt Theme-Variablen → konsistent
       in hell/dunkel und allen Custom-Designs, ohne Nachpflege pro Theme.
     • pointer-events:none → blockiert nie Klicks auf darunterliegende UI.
     • Idempotent + SPA-sicher: Element hängt am <body> AUSSERHALB von
       #mainContent (router.js lässt es unangetastet); doppeltes Einhängen
       wird per id verhindert.
     • theme.js läuft im <head> → bei fehlendem document.body auf
       DOMContentLoaded verschieben (once). */
  var TESTPHASE_BADGE = true;   // zum Deaktivieren nach der Testphase auf false setzen
  var testphaseDeferred = false;
  function ensureTestphaseBadge() {
    if (!TESTPHASE_BADGE) return;
    if (!document.body) {
      if (!testphaseDeferred) {
        testphaseDeferred = true;
        document.addEventListener('DOMContentLoaded', function () {
          testphaseDeferred = false;
          ensureTestphaseBadge();
        }, { once: true });
      }
      return;
    }
    if (!document.getElementById('pmTestphaseStyle')) {
      var style = document.createElement('style');
      style.id = 'pmTestphaseStyle';
      style.textContent =
        '#pmTestphaseBadge{' +
          'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9998;' +
          'display:inline-flex;align-items:center;gap:7px;' +
          'padding:5px 12px;border-radius:999px;' +
          'font:600 11.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;' +
          'letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;' +
          'color:#ffd43b;background:rgba(24,24,27,.6);' +
          'border:1px solid rgba(245,197,24,.5);' +
          '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
          'box-shadow:0 2px 10px rgba(0,0,0,.25);' +
          'pointer-events:none;user-select:none;' +
        '}' +
        '#pmTestphaseBadge::before{' +
          'content:"";width:7px;height:7px;border-radius:50%;' +
          'background:#ffd43b;box-shadow:0 0 6px rgba(255,212,59,.9);' +
        '}' +
        /* Blur ist teuer auf Software-Rendering → dann deckende Fläche. */
        'html.perf-lite #pmTestphaseBadge{' +
          '-webkit-backdrop-filter:none;backdrop-filter:none;' +
          'background:rgba(24,24,27,.92);' +
        '}' +
        '@media print{#pmTestphaseBadge{display:none}}';
      (document.head || document.documentElement).appendChild(style);
    }
    if (!document.getElementById('pmTestphaseBadge')) {
      var badge = document.createElement('div');
      badge.id = 'pmTestphaseBadge';
      badge.setAttribute('aria-hidden', 'true');
      badge.setAttribute('title', 'Diese Anwendung befindet sich aktuell in der Testphase.');
      badge.textContent = 'Testphase';
      document.body.appendChild(badge);
    }
  }
  ensureTestphaseBadge();
})();
