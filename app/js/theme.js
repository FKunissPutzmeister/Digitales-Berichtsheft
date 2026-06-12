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

  /* ── Candy: Einhorn-Sprite (rein selbst gezeichnetes Inline-SVG, nur
     Vollfarben – KEINE <defs>/IDs, damit der Sprite ohne ID-Kollision
     mehrfach eingehängt werden kann). Blickt nach rechts; Mähne & Schweif
     als gefächerte Pastell-Regenbogen-Kapseln, goldenes Spiralhorn.
     Gestylt/animiert (Hüpfen + Wiesen-Lauf) in css/theme-candy.css. */
  var CD_UNICORN_SVG =
    '<svg class="pm-cd-uni-svg" viewBox="0 0 104 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g class="pm-cd-uni-tail">' +
        '<rect x="16" y="48" width="9" height="32" rx="4.5" fill="#A77BFF" transform="rotate(34 30 56)"/>' +
        '<rect x="17" y="49" width="9" height="30" rx="4.5" fill="#6CC6FF" transform="rotate(24 30 56)"/>' +
        '<rect x="18" y="50" width="9" height="28" rx="4.5" fill="#7DE3A6" transform="rotate(14 30 56)"/>' +
        '<rect x="19" y="51" width="9" height="26" rx="4.5" fill="#FFE066" transform="rotate(4 30 56)"/>' +
        '<rect x="20" y="52" width="9" height="24" rx="4.5" fill="#FF8FB6" transform="rotate(-6 30 56)"/>' +
      '</g>' +
      '<ellipse cx="52" cy="57" rx="30" ry="19" fill="#FFFFFF"/>' +
      '<path d="M24 62c8 11 48 11 56 0 0 9-12 15-28 15S24 71 24 62z" fill="#FFE3F1"/>' +
      '<g fill="#FFFFFF">' +
        '<rect x="30" y="66" width="8" height="24" rx="4"/>' +
        '<rect x="42" y="68" width="8" height="24" rx="4"/>' +
        '<rect x="56" y="68" width="8" height="24" rx="4"/>' +
        '<rect x="68" y="66" width="8" height="24" rx="4"/>' +
      '</g>' +
      '<g fill="#FFB3D4">' +
        '<rect x="30" y="85" width="8" height="6" rx="3"/>' +
        '<rect x="42" y="87" width="8" height="6" rx="3"/>' +
        '<rect x="56" y="87" width="8" height="6" rx="3"/>' +
        '<rect x="68" y="85" width="8" height="6" rx="3"/>' +
      '</g>' +
      '<path d="M70 50 Q73 35 85 32 L95 43 Q90 58 76 60 Z" fill="#FFFFFF"/>' +
      '<ellipse cx="87" cy="33" rx="14" ry="13" fill="#FFFFFF"/>' +
      '<path d="M97 33c7-1 11 2 11 6s-5 6-11 4z" fill="#FFFFFF"/>' +
      '<path d="M77 18l4 11-10-4z" fill="#FFFFFF"/>' +
      '<path d="M87 17l4-17 5 16z" fill="#FFD55E"/>' +
      '<path d="M88 13l5 1M89 8l4 1M90 4l3 1" stroke="#FFEBB0" stroke-width="1.3" fill="none"/>' +
      '<g class="pm-cd-uni-mane">' +
        '<rect x="64" y="2"  width="9" height="26" rx="4.5" fill="#A77BFF" transform="rotate(20 74 17)"/>' +
        '<rect x="65" y="4"  width="9" height="24" rx="4.5" fill="#6CC6FF" transform="rotate(11 74 17)"/>' +
        '<rect x="65" y="7"  width="9" height="23" rx="4.5" fill="#7DE3A6" transform="rotate(0 72 19)"/>' +
        '<rect x="63" y="11" width="9" height="23" rx="4.5" fill="#FFE066" transform="rotate(-12 70 22)"/>' +
        '<rect x="60" y="16" width="9" height="22" rx="4.5" fill="#FF8FB6" transform="rotate(-24 68 26)"/>' +
      '</g>' +
      '<circle cx="90" cy="32" r="2.6" fill="#3D1030"/>' +
      '<circle cx="89" cy="31" r="0.9" fill="#FFFFFF"/>' +
      '<circle cx="95" cy="38" r="3" fill="#FFC2DD"/>' +
      '<circle cx="103" cy="36" r="1" fill="#C76B96"/>' +
    '</svg>';

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

    /* ── FX-Template: cmd (wird vom Theme-Designer befüllt) ── */
    cmd: '',

    /* ── FX-Template: candy (wird vom Theme-Designer befüllt) ──
       Candy-Land-Szene: leuchtend schimmernder Regenbogen, eine
       Wolken-Prozession (7 Wolken ziehen ENDLOS von links nach rechts
       und schweben/pulsieren dabei), drei gewellte Zuckerguss-Wiesen-
       Lagen, zwei über die Wiese hüpfende Einhörner plus Deko (Donut,
       Lollipops, Gumdrops). Styling/Keyframes liegen in
       css/theme-candy.css (Klassen pm-cd-* zur Kollisionsvermeidung). */
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
      '<div class="pm-cd-unicorn pm-cd-unicorn--mid"><div class="pm-cd-unicorn__hop">' + CD_UNICORN_SVG + '</div></div>' +
      '<div class="pm-cd-lolli pm-cd-lolli--pink"></div>' +
      '<div class="pm-cd-lolli pm-cd-lolli--mint"></div>' +
      '<div class="pm-cd-hill pm-cd-hill--front"></div>' +
      '<div class="pm-cd-unicorn pm-cd-unicorn--front"><div class="pm-cd-unicorn__hop">' + CD_UNICORN_SVG + '</div></div>' +
      '<div class="pm-cd-gumdrop pm-cd-gumdrop--1"></div>' +
      '<div class="pm-cd-gumdrop pm-cd-gumdrop--2"></div>',

    /* ── FX-Template: iceland (wird vom Theme-Designer befüllt) ──
       Schneesturm als <canvas>-Animation statt CSS/SVG-Szene: weiche
       Glow-Schneeflocken in 3 Parallax-Ebenen, prozedurale Gletscher-
       Silhouetten, driftende Nebelbänke und Seitenwind mit Böen. Der
       requestAnimationFrame-Loop wird vom PMIcelandFX-Controller (oben)
       gesteuert; ensureThemeFX() startet/stoppt ihn am FX-Lebenszyklus.
       Styling/Fallback-Farbe in css/theme-iceland.css (.pm-is-bg). */
    iceland:
      '<canvas class="pm-is-bg" aria-hidden="true"></canvas>'
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
    /* Beim Neuaufbau/Teardown einen evtl. laufenden Canvas-Loop (iceland)
       sauber beenden – sonst rendert er nach dem Theme-Wechsel weiter. */
    PMIcelandFX.stop();

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

    /* iceland: Canvas-Schneesturm-Loop am frisch eingehängten <canvas>
       starten (alle anderen Themes sind rein CSS/SVG → kein JS-Loop). */
    if (theme === 'iceland') {
      var isCanvas = el.querySelector('.pm-is-bg');
      if (isCanvas) PMIcelandFX.start(isCanvas);
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
