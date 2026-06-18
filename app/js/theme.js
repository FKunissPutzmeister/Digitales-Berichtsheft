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
     | 'candy' | 'iceland' | 'halloween'. Ist ein Custom-Design aktiv,
     überlagert es den Standard-Modus (data-theme = Custom-Name). Die
     Token-Overrides dazu liegen in css/themes.css.

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
  var CUSTOM_THEMES = ['hyperspace', 'cmd', 'candy', 'iceland', 'halloween'];
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
       vereinzelt flatternde Fledermäuse, eine sich abseilende Spinne sowie
       – zur Belebung – unten hin und her wandelnde Skelette/Zombies
       (.pm-hw-walker mit innerem __fig fürs Geh-Wippen), ein schwebender
       Geist (.pm-hw-ghost) und blinzelnde glühende Augenpaare (.pm-hw-eyes).
       Styling/Keyframes liegen in css/theme-halloween.css. */
    halloween:
      '<div class="pm-hw-bg"></div>' +
      '<div class="pm-hw-moonglow"></div>' +
      '<div class="pm-hw-winflicker"></div>' +
      '<canvas class="pm-hw-fog" aria-hidden="true"></canvas>' +
      '<div class="pm-hw-bat pm-hw-bat--1"></div>' +
      '<div class="pm-hw-bat pm-hw-bat--2"></div>' +
      '<div class="pm-hw-bat pm-hw-bat--3"></div>' +
      '<div class="pm-hw-spider"><i class="pm-hw-spider__thread"></i><i class="pm-hw-spider__body"></i></div>' +
      '<div class="pm-hw-walker pm-hw-walker--a"><i class="pm-hw-walker__fig pm-hw-skeleton"></i></div>' +
      '<div class="pm-hw-walker pm-hw-walker--b"><i class="pm-hw-walker__fig pm-hw-zombie"></i></div>' +
      '<div class="pm-hw-walker pm-hw-walker--c"><i class="pm-hw-walker__fig pm-hw-skeleton"></i></div>' +
      '<div class="pm-hw-ghost"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--1"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--2"></div>' +
      '<div class="pm-hw-eyes pm-hw-eyes--3"></div>'
  };

  /* ── Iceland-FX: Canvas-Schneesturm-Engine ───────────────────────
     Der Iceland-Hintergrund ist – anders als die übrigen Custom-Themes –
     keine reine CSS/SVG-Szene, sondern ein <canvas> mit requestAnimation-
     Frame-Loop: weiche Glow-Schneeflocken in 3 Parallax-Ebenen, proze-
     durale Gletscher-Silhouetten, driftender Nebel und Seitenwind mit
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
      glacier: ['#16242f', '#22394a', '#33566b'],
      iceHi:   '#bfe6f5',
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

    /* Laufzeit-State (wird pro start() neu aufgebaut). */
    var canvas = null, ctx = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1;
    var windT = 0, last = 0, fogPhase = 0;
    var far = [], mid = [], near = [], glaciers = [];

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

    function iceRidge(baseY, amp, jag, seed) {
      var pts = [], steps = 22;
      for (var i = 0; i <= steps; i++) {
        var x = (i / steps) * (W + 80) - 40;
        var n = Math.sin(i * 0.7 + seed) * amp
              + Math.sin(i * 1.9 + seed * 2.1) * amp * jag
              + Math.sin(i * 4.3 + seed * 0.6) * amp * jag * 0.5
              + (Math.sin(i * 9.1 + seed) > 0.6 ? amp * 0.25 : 0);
        pts.push({ x: x, y: baseY - Math.abs(n) * 0.6 + n * 0.4 });
      }
      return pts;
    }
    function buildGlaciers() {
      glaciers = [
        { pts: iceRidge(H * 0.78, H * 0.16, 0.55, 1.0),  ci: 0, parallax: 0.04 },
        { pts: iceRidge(H * 0.86, H * 0.13, 0.50, 5.3),  ci: 1, parallax: 0.08 },
        { pts: iceRidge(H * 0.94, H * 0.10, 0.45, 11.2), ci: 2, parallax: 0.14 }
      ];
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
      buildGlaciers();
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
    function drawGlaciers(wind) {
      var hi = THEME.iceHi;
      for (var li = 0; li < glaciers.length; li++) {
        var layer = glaciers[li];
        var off = Math.sin(windT * 0.0003) * wind * layer.parallax * 6;
        ctx.save();
        ctx.translate(off, 0);
        ctx.fillStyle = 'rgb(' + hexToRgb(THEME.glacier[layer.ci]).join(',') + ')';
        ctx.beginPath();
        ctx.moveTo(layer.pts[0].x, H + 5);
        ctx.lineTo(layer.pts[0].x, layer.pts[0].y);
        for (var i = 1; i < layer.pts.length; i++) {
          var p = layer.pts[i], prev = layer.pts[i - 1];
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
        }
        var lastP = layer.pts[layer.pts.length - 1];
        ctx.lineTo(lastP.x, H + 5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.22 + layer.ci * 0.06;
        ctx.strokeStyle = hi;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(layer.pts[0].x, layer.pts[0].y);
        for (var j = 1; j < layer.pts.length; j++) {
          var p2 = layer.pts[j], prev2 = layer.pts[j - 1];
          ctx.quadraticCurveTo(prev2.x, prev2.y, (prev2.x + p2.x) / 2, (prev2.y + p2.y) / 2);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
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
      drawGlaciers(wind);
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
      var fogCanvas = el.querySelector('.pm-hw-fog');
      if (fogCanvas) PMHalloweenFog.start(fogCanvas);
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

  /* ── Fähigkeits-Init-State ──────────────────────────────────────
     Spiegelt die zuletzt bekannten Fähigkeits-Flags (gesetzt von
     applyCapabilities() in app.js) synchron auf <html data-*>, damit das
     fähigkeitsbasierte Nav-Gating schon vor dem ersten Paint stimmt. */
  try {
    if (localStorage.getItem('capKannPlanen')   === '1') html.setAttribute('data-kann-planen', '1');
    if (localStorage.getItem('capIstAusbilder') === '1') html.setAttribute('data-ist-ausbilder', '1');
    if (localStorage.getItem('capIstAzubi')     === '1') html.setAttribute('data-ist-azubi', '1');
    if (localStorage.getItem('capKorrektur')    === '1') html.setAttribute('data-korrektur', '1');
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
