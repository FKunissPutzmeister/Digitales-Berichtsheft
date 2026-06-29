/* ===================================================================
   REACT-THEME-LAYER.JS – generischer Controller für React-Themes
   -------------------------------------------------------------------
   Lädt das Vite-Bundle (app/silk/) NUR wenn ein React-Theme aktiv ist.
   Aktuell: „silk".

   Was React macht (wenig, nur wo nötig):
     • <Silk/>     → WebGL-Hintergrund (#5227FF)
     • <DotField/> → Login-Hintergrund
     • <BlurText/> + <GradientText/> → Headings

   Glas + Hover-Kanten-Glow sind REIN CSS (Performance + ponytail):
     • Glas = transluzente Fläche + heller Rand (+ Frost-Blur nur auf den
       Haupt-Panels/Buttons), Klasse .silk-host / .silk-host--flat / --btn.
     • Hover-Glow = CSS-Border-Spotlight (.silk-host::after), der dem Cursor
       folgt und NUR den Rand erleuchtet. Der Controller setzt dafür
       --silk-mx/--silk-my + .silk-hover auf dem überfahrenen Host.
   (Kein GlassSurface/BorderGlow mehr: deren SVG-Displacement-backdrop-
   filter bzw. center-conic-Glow waren auf großen Panels der Perf-Killer
   und der „Mitte-leuchtet"-Bug.)

   Reine Ergänzung: bei jedem Nicht-React-Theme passiert nichts.
   SHARED-Script (router.js) → kein Re-Exec bei SPA-Nav; Re-Scan via
   'pm-page-rendered' + MutationObserver. reduced-motion → kein React.
   =================================================================== */
(function () {
  'use strict';

  var REACT_THEMES = { silk: { bundle: 'silk-bundle.js', css: 'silk-bundle.css' } };

  /* frost = Glas mit Blur (Haupt-Panels); flat = transluzentes Glas ohne
     Blur (viele/kleine Wiederholungs-Kacheln → Performance); btn = Glas-
     Button; blur/grad = animierte Headings. */
  var SEL = {
    frost: ['.card', '.stat-card', '.welcome-hero', '.b-hero', '.b-azubi', '.b-recent',
            '.modal', '.pm-select__menu', '.dropdown__menu', '.week-status-bar'],
    flat:  ['.b-tile', '.b-wkcard', '.b-daycard', '.b-day', '.day-card', '.tag-row',
            '.time-spinner', '.dash-out-item', '.quick-access-tile'],
    btn:   ['.btn', '.b-btn-primary', '.demo-login-btn', '.btn-ms', '.week-nav__btn',
            '.pm-select__trigger', '.week-actions button'],
    blur:  ['.welcome-hero__name'],
    grad:  ['.b-hero__kw']
  };

  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) ||
                   (location.origin + '/app/js/react-theme-layer.js');
  function bundleUrl(rel) { return new URL('../silk/' + rel, SCRIPT_SRC).href; }

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var activeTheme = null, api = null, bundlePromise = null, cssInjected = false;
  var bgRoot = null, loginRoot = null;
  var textRoots = [];        // [{ root, host, el }] – nur blur/grad (React)
  var pageObserver = null, scanning = false;
  var pointerBound = false, lastHost = null, lastMove = 0;

  function cfgFor(t) { return Object.prototype.hasOwnProperty.call(REACT_THEMES, t) ? REACT_THEMES[t] : null; }

  function injectCss(rel) {
    if (cssInjected) return;
    cssInjected = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = bundleUrl(rel);
    link.setAttribute('data-silk-bundle-css', '');
    document.head.appendChild(link);
  }
  function loadBundle(cfg) {
    if (bundlePromise) return bundlePromise;
    injectCss(cfg.css);
    bundlePromise = import(/* @vite-ignore */ bundleUrl(cfg.bundle)).then(function (m) { return m && m.default ? m.default : m; });
    return bundlePromise;
  }

  function fadeIn(el) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-ready'); }); });
  }

  // Aktueller Silk-Hue (von theme.js/PMTheme gesetzt) → Farbe für den
  // WebGL-Silk-Hintergrund + die Login-Strahlen, abgeleitet aus demselben
  // Hue wie die CSS-Palette (hsl(var(--silk-hue,252) …)).
  function silkHue() {
    return (window.PMTheme && PMTheme.getSilkHue) ? PMTheme.getSilkHue() : 252;
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      var c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    }
    return '#' + f(0) + f(8) + f(4);
  }

  function mountBackground() {
    if (document.body.classList.contains('login-page')) {
      if (loginRoot) return;
      var lel = document.createElement('div');
      lel.id = 'silk-login-bg'; lel.className = 'light-rays-container';
      lel.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(lel, document.body.firstChild);
      loginRoot = { el: lel, cleanup: null, root: null };
      fadeIn(lel);
      // LightRays (ogl/WebGL) als Login-Hintergrund. Eigenständiges ESM-Modul,
      // lazy per import() — kein React/Silk-Bundle nötig. Fallback: DotField.
      import(new URL('./light-rays.js', SCRIPT_SRC).href).then(function (LR) {
        if (!loginRoot || loginRoot.el !== lel) return; // inzwischen Theme verlassen
        loginRoot.cleanup = LR.mount(lel, {
          raysOrigin: 'top-center', raysColor: hslToHex(silkHue(), 100, 86), raysSpeed: 1.2,
          lightSpread: 1.0, rayLength: 1.6, followMouse: true, mouseInfluence: 0.15,
          noiseAmount: 0.06, distortion: 0.05, saturation: 1.0, fadeDistance: 1.1
        });
      }).catch(function (err) {
        if (window.console) console.warn('[react-theme-layer] LightRays-Ladefehler, Fallback DotField:', err);
        if (loginRoot && loginRoot.el === lel && api && api.mountDotField) loginRoot.root = api.mountDotField(lel, {});
      });
    } else {
      if (bgRoot) return;
      var bel = document.createElement('div');
      bel.id = 'silk-react-root'; bel.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(bel, document.body.firstChild);
      bgRoot = { root: api.mountSilk(bel, { color: hslToHex(silkHue(), 100, 58) }), el: bel };
      fadeIn(bel);
    }
  }

  // Silk-Grundfarbe gewechselt (pm-silk-color-change) → WebGL-Hintergrund
  // bzw. Login-Strahlen mit der neuen Farbe neu mounten. (CSS-Palette zieht
  // automatisch über --silk-hue mit; nur das WebGL braucht den expliziten
  // Re-Mount, weil die Farbe ein Shader-Uniform ist.)
  function recolorSilk() {
    if (loginRoot) {
      try { if (loginRoot.cleanup) loginRoot.cleanup(); else if (loginRoot.root) loginRoot.root.unmount(); } catch (_) {}
      if (loginRoot.el && loginRoot.el.parentNode) loginRoot.el.parentNode.removeChild(loginRoot.el);
      loginRoot = null;
    }
    if (bgRoot) {
      try { bgRoot.root.unmount(); } catch (_) {}
      if (bgRoot.el && bgRoot.el.parentNode) bgRoot.el.parentNode.removeChild(bgRoot.el);
      bgRoot = null;
    }
    // Gradient/Blur-Headings tragen ihre Farbe aus dem React-Mount → abräumen
    // und per scan() mit dem neuen Hue neu aufbauen (Glas-Panels brauchen das
    // nicht, deren Farben kommen live über --silk-hue aus dem CSS).
    for (var i = 0; i < textRoots.length; i++) {
      var e = textRoots[i];
      try { if (e.root) e.root.unmount(); } catch (_) {}
      if (e.el && e.el.parentNode) e.el.parentNode.removeChild(e.el);
      if (e.host) { e.host.classList.remove('silk-sr-only'); e.host.__silk = false; }
    }
    textRoots = [];
    mountBackground();
    scan();
  }

  /* Das PM-Logo ist ein OPAKES Quadrat (grauer Elefant auf gelbem Grund),
     keine transparente Silhouette → die rohe PNG als Maske ergäbe nur ein
     volles Gradient-Rechteck. Daher zur Laufzeit per Canvas eine Silhouette
     bauen: graue/niedrig-chroma Pixel (= Elefant) behalten, Gelb wegwerfen.
     Liefert eine weiße-Elefant-auf-transparent PNG (data-URL) als Maske. */
  function buildLogoSilhouette(src, cb) {
    var im = new Image();
    im.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        var ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0);
        var d = ctx.getImageData(0, 0, c.width, c.height);
        var p = d.data;
        for (var i = 0; i < p.length; i += 4) {
          var chroma = Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]);
          var keep = p[i + 3] > 40 && chroma < 60;   // grau & sichtbar = Elefant
          p[i] = 255; p[i + 1] = 255; p[i + 2] = 255;
          p[i + 3] = keep ? p[i + 3] : 0;
        }
        ctx.putImageData(d, 0, 0);
        cb(c.toDataURL('image/png'));
      } catch (e) { cb(null); }   // getImageData getaintet o.ä. → Fallback
    };
    im.onerror = function () { cb(null); };
    im.src = src;
  }

  /* Logo im Theme-Gradient einfärben: Silhouette als Maske über .silk-logo-grad
     (Gradient-Span), Original-img ausblenden. Async; bei Fehler bleibt Original. */
  /* Den getönten Gradient-Span aus einer fertigen Masken-data-URL einhängen
     und das Roh-<img> ausblenden. */
  function applyLogoMask(img, mask) {
    if (!img.__silkTint) return;                  // inzwischen Theme verlassen
    var cs = getComputedStyle(img);
    var span = document.createElement('span');
    span.className = 'silk-logo-grad';
    span.setAttribute('aria-hidden', 'true');
    span.style.width = (img.offsetWidth || parseInt(cs.width, 10) || 36) + 'px';
    span.style.height = (img.offsetHeight || parseInt(cs.height, 10) || 36) + 'px';
    span.style.webkitMaskImage = 'url("' + mask + '")';
    span.style.maskImage = 'url("' + mask + '")';
    img.style.display = 'none';
    img.parentNode.insertBefore(span, img.nextSibling);
    img.__silkSpan = span;
  }

  /* Silhouetten-Maske je Logo-Quelle cachen: die Maske ist hue-UNABHÄNGIG
     (die Farbe liefert allein der CSS-Gradient) und ändert sich nur, wenn die
     Logo-PNG selbst wechselt → pro src einmal bauen, dann aus localStorage
     wiederverwenden. So entfällt beim Reload der async Bild-Load+Canvas und der
     getönte Span steht praktisch sofort (kein „leeres Logo"-Moment mehr). */
  function maskCacheKey(src) { return 'pmSilkLogoMask:' + (src || ''); }

  function tintLogo() {
    var marks = document.querySelectorAll('.sidebar__logo-mark, .login-card__mark');
    for (var i = 0; i < marks.length; i++) {
      (function (img) {
        if (img.__silkTint) return;
        img.__silkTint = true;
        var src = img.getAttribute('src');
        var cached = null;
        try { cached = localStorage.getItem(maskCacheKey(src)); } catch (e) {}
        if (cached) { applyLogoMask(img, cached); return; }   // synchron → flash-frei
        buildLogoSilhouette(src, function (mask) {
          if (!img.__silkTint) return;            // inzwischen Theme verlassen
          if (!mask) {                            // Fallback: Silhouette-Bau fehlgeschlagen
            img.__silkTint = false;
            /* theme-silk.css versteckt das Roh-<img> pre-paint (visibility:hidden);
               ohne getönten Span muss es wieder sichtbar werden, sonst fehlt das
               Logo ganz. */
            img.style.visibility = 'visible';
            return;
          }
          try { localStorage.setItem(maskCacheKey(src), mask); } catch (e) {}
          applyLogoMask(img, mask);
        });
      })(marks[i]);
    }
  }
  function untintLogo() {
    var marks = document.querySelectorAll('.sidebar__logo-mark, .login-card__mark');
    for (var i = 0; i < marks.length; i++) {
      var img = marks[i];
      if (!img.__silkTint) continue;
      img.__silkTint = false;
      img.style.display = '';
      if (img.__silkSpan && img.__silkSpan.parentNode) img.__silkSpan.parentNode.removeChild(img.__silkSpan);
      img.__silkSpan = null;
    }
  }

  /* Panels UND Buttons = reines CSS-Glas (Klasse silk-host / --flat / --btn,
     Styling in theme-silk.css). Buttons trugen früher pro Stück ein React-
     GlassSurface-Backing; das mountete async als heller --fallback und
     flippte per useEffect auf --svg → weiß→indigo-Blitz, der bei jedem
     Re-Scan (Refresh/Wochenwechsel/Slide-Clone) neu auftrat. CSS-Glas ist
     synchron, mountet nie neu und flackert nicht. */
  function decorate(el, kind) {
    if (el.__silk) return;
    el.__silk = true;
    el.classList.add('silk-host');
    if (kind === 'flat') { el.classList.add('silk-host--flat'); return; }
    if (kind === 'btn') el.classList.add('silk-host--btn');
  }

  /* Headings: Original sr-only (a11y) + echte React-Variante daneben. */
  function enhanceText(el, kind) {
    if (el.__silk) return;
    var text = (el.textContent || '').trim();
    if (!text) return;
    el.__silk = true;
    var cs = getComputedStyle(el);
    el.classList.add('silk-sr-only');
    var host = document.createElement('span');
    host.className = 'silk-text-host silk-text-host--' + kind;
    host.setAttribute('aria-hidden', 'true');
    host.style.fontFamily = cs.fontFamily; host.style.fontSize = cs.fontSize;
    host.style.fontWeight = cs.fontWeight; host.style.lineHeight = cs.lineHeight;
    host.style.letterSpacing = cs.letterSpacing; host.style.color = cs.color;
    el.parentNode.insertBefore(host, el.nextSibling);
    var root;
    if (kind === 'grad') {
      // GradientText-Farben aus dem aktuellen Silk-Hue ableiten (Default im
      // Bundle ist fix indigo/pink → bliebe sonst lila bei anderer Farbe).
      var gh = silkHue();
      root = api.mountGradientText(host, {
        text: text,
        colors: [hslToHex(gh, 100, 62), hslToHex((gh + 35) % 360, 100, 76), hslToHex(gh, 70, 82)]
      });
    } else {
      root = api.mountBlurText(host, { text: text });
    }
    textRoots.push({ root: root, host: el, el: host });
  }

  function gcArr(arr) {
    return arr.filter(function (e) {
      if (document.contains(e.host)) return true;
      try { if (e.root) e.root.unmount(); } catch (_) {}
      if (e.el && e.el.parentNode) e.el.parentNode.removeChild(e.el);
      return false;
    });
  }
  function gcDetachedText() { textRoots = gcArr(textRoots); }

  function scan() {
    if (!api || scanning) return;
    scanning = true;
    try {
      gcDetachedText();
      var onLogin = document.body.classList.contains('login-page');
      var glass = function (list, kind) {
        for (var i = 0; i < list.length; i++) {
          var n = document.querySelectorAll(list[i]);
          for (var j = 0; j < n.length; j++) decorate(n[j], kind);
        }
      };
      var text = function (list, kind) {
        for (var i = 0; i < list.length; i++) {
          var n = document.querySelectorAll(list[i]);
          for (var j = 0; j < n.length; j++) enhanceText(n[j], kind);
        }
      };
      if (onLogin) {
        glass(['.login-card'], 'frost');
        glass(SEL.btn, 'btn');
      } else {
        glass(SEL.frost, 'frost');
        glass(SEL.flat, 'flat');
        glass(SEL.btn, 'btn');
        text(SEL.blur, 'blur');
        text(SEL.grad, 'grad');
      }
      tintLogo();
    } finally { scanning = false; }
  }

  /* ── Hover-Border-Spotlight: Cursorposition als CSS-Variablen auf den
     überfahrenen Host; CSS (.silk-host::after) erleuchtet nur den Rand. ── */
  function clearHost(host) {
    if (host) host.classList.remove('silk-hover');
  }
  function onPointerMove(e) {
    var now = e.timeStamp || Date.now();
    if (now - lastMove < 24) return;
    lastMove = now;
    var host = e.target && e.target.closest ? e.target.closest('.silk-host') : null;
    if (host !== lastHost) { clearHost(lastHost); lastHost = host; }
    if (!host) return;
    var rect = host.getBoundingClientRect();
    host.style.setProperty('--silk-mx', (e.clientX - rect.left).toFixed(1) + 'px');
    host.style.setProperty('--silk-my', (e.clientY - rect.top).toFixed(1) + 'px');
    host.classList.add('silk-hover');
  }
  // Cursor verlässt das Fenster (pointerout mit relatedTarget=null) oder der
  // Tab verliert den Fokus (blur): Hover-Glow abräumen. Ohne das bleibt der
  // Border-Spotlight am zuletzt überfahrenen Button „kleben" (= die manchmal
  // verbuggte Umrandung), weil onPointerMove nur beim Wechsel auf ein ANDERES
  // Element räumt – beim Rausfahren kommt kein weiteres pointermove mehr.
  function onLeaveWindow(e) {
    if (e && e.type === 'pointerout' && e.relatedTarget) return;
    clearHost(lastHost); lastHost = null;
  }
  function bindPointer() {
    if (pointerBound) return;
    pointerBound = true;
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onLeaveWindow, { passive: true });
    window.addEventListener('blur', onLeaveWindow);
  }
  function unbindPointer() {
    if (!pointerBound) return;
    pointerBound = false;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerout', onLeaveWindow);
    window.removeEventListener('blur', onLeaveWindow);
    clearHost(lastHost); lastHost = null;
  }

  function startPageObserver() {
    if (pageObserver) return;
    var main = document.getElementById('mainContent');
    if (!main || typeof MutationObserver === 'undefined') return;
    var t = null;
    pageObserver = new MutationObserver(function () {
      if (scanning) return;
      clearTimeout(t);
      t = setTimeout(function () { if (activeTheme) scan(); }, 90);
    });
    pageObserver.observe(main, { childList: true, subtree: true });
  }
  function stopPageObserver() { if (pageObserver) { pageObserver.disconnect(); pageObserver = null; } }

  function activate(theme) {
    activeTheme = theme;
    /* Logo SOFORT tönen – unabhängig vom (schweren) React/WebGL-Bundle.
       tintLogo() braucht nur Canvas, kein React; früher lief es erst nach
       loadBundle().then→scan(), wodurch beim Reload sekundenbruchteillang das
       gelbe Standard-Logo sichtbar war. Vor dem reduceMotion-Return, damit
       auch reduced-motion-Nutzer das getönte Logo bekommen. (Idempotent via
       img.__silkTint → der spätere scan()-Aufruf ist ein No-op.) */
    tintLogo();
    if (reduceMotion) return;
    var cfg = cfgFor(theme);
    if (!cfg) return;
    loadBundle(cfg).then(function (mod) {
      if (activeTheme !== theme) return;
      api = mod;
      mountBackground();
      scan();
      bindPointer();
      startPageObserver();
      // Scroll-Parallax deaktiviert: das Per-Element-translate verschob die
      // dicht gepackten Bento-Kacheln (und welcome-hero) um je ein anderes Y
      // → ungleiche Abstände im Dashboard. Gleiches Problem wie zuvor in der
      // Wochenansicht; jetzt ganz aus statt nur dort ausgeschlossen.
    }).catch(function (err) { if (window.console) console.warn('[react-theme-layer] Bundle-Ladefehler:', err); });
  }

  function deactivate() {
    stopPageObserver();
    unbindPointer();
    untintLogo();
    for (var i = 0; i < textRoots.length; i++) {
      var e = textRoots[i];
      try { if (e.root) e.root.unmount(); } catch (_) {}
      if (e.el && e.el.parentNode) e.el.parentNode.removeChild(e.el);
      if (e.host) e.host.classList.remove('silk-sr-only');
    }
    textRoots = [];
    var hosts = document.querySelectorAll('.silk-host');
    for (var k = 0; k < hosts.length; k++) {
      hosts[k].classList.remove('silk-host', 'silk-host--flat', 'silk-host--btn', 'silk-hover');
      hosts[k].__silk = false;
      hosts[k].style.removeProperty('--silk-mx');
      hosts[k].style.removeProperty('--silk-my');
    }
    if (bgRoot) { try { bgRoot.root.unmount(); } catch (_) {} if (bgRoot.el.parentNode) bgRoot.el.parentNode.removeChild(bgRoot.el); bgRoot = null; }
    if (loginRoot) { try { if (loginRoot.cleanup) loginRoot.cleanup(); else if (loginRoot.root) loginRoot.root.unmount(); } catch (_) {} if (loginRoot.el && loginRoot.el.parentNode) loginRoot.el.parentNode.removeChild(loginRoot.el); loginRoot = null; }
    activeTheme = null;
  }

  function sync(theme) {
    var want = cfgFor(theme) ? theme : null;
    if (want === activeTheme) return;
    if (activeTheme) deactivate();
    if (want) activate(want);
  }

  window.addEventListener('pm-theme-change', function (e) { sync(e && e.detail); });
  window.addEventListener('pm-silk-color-change', function () { if (activeTheme && api) recolorSilk(); });
  window.addEventListener('pm-page-rendered', function () { if (activeTheme && api) scan(); });
  /* Sidebar komplett neu aufgebaut (buildSidebar in sidebar.js) → das frische
     Logo-<img> erneut tönen. Unabhängig vom React-Bundle (tintLogo braucht nur
     Canvas); mit gecachter Maske synchron → kein „leeres/Standard-Logo"-Frame. */
  window.addEventListener('pm-sidebar-rendered', function () { if (activeTheme && cfgFor(activeTheme)) tintLogo(); });

  function init() {
    var pm = window.PMTheme;
    var cur = (pm && pm.getCustom && pm.getCustom()) || (pm && pm.get && pm.get()) ||
              document.documentElement.getAttribute('data-theme') || 'light';
    sync(cur);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
