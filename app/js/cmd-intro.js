/* ===================================================================
   CMD-INTRO.JS – 0/1-Matrix-Lade-Intro (AUSSCHLIESSLICH im CMD-Theme)
   -------------------------------------------------------------------
   Legt beim Laden einer Seite ein kurzes <canvas>-Overlay über den
   Hauptbereich (.main-wrapper = Topbar + Inhalt, Sidebar bleibt frei):
   Spalten fallender Nullen/Einsen in Terminal-Grün, danach Ausblenden
   und Freigabe des fertig gerenderten Inhalts.

   Einstiegspunkte:
     • Voll-Load / F5 / Direktaufruf → Self-Init unten (play()).
     • SPA-Navigation               → router.js ruft start() beim Klick
                                       und end() nach dem Content-Tausch.

   Nur CMD: jeder Einstieg prüft data-theme === 'cmd'. Bei anderem Theme
   passiert nichts (der Router nutzt dann seine normale Fade-Animation).
   prefers-reduced-motion: Intro wird komplett übersprungen (der globale
   CSS-Motion-Override in base.css greift bei rAF NICHT, daher hier in JS).

   Dieses Modul ist als SHARED-Script registriert (router.js): es wird
   einmalig geladen und bei SPA-Wechseln nicht neu ausgeführt.
   =================================================================== */
(function () {
  'use strict';

  var DURATION = 700;   // ms Mindestdauer des Regens
  var FADE     = 220;   // ms Ausblend-Übergang
  var FONT     = 14;    // px Glyphengröße (= Spaltenbreite)
  var FONT_STACK = FONT + 'px Consolas, "Cascadia Mono", "Courier New", monospace';

  var _overlay = null;
  var _canvas  = null;
  var _ctx     = null;
  var _raf     = 0;
  var _startTs = 0;
  var _cols    = [];          // y-Position (in Zeilen) pro Spalte
  var _onResize = null;

  function isCmd() {
    return document.documentElement.getAttribute('data-theme') === 'cmd';
  }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function teardown() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
    if (_onResize) { window.removeEventListener('resize', _onResize); _onResize = null; }
    if (_overlay && _overlay.parentNode) { _overlay.parentNode.removeChild(_overlay); }
    _overlay = _canvas = _ctx = null;
    _cols = [];
  }

  function sizeCanvas() {
    if (!_overlay || !_canvas || !_ctx) return;
    var dpr = window.devicePixelRatio || 1;
    var w = _overlay.clientWidth;
    var h = _overlay.clientHeight;
    _canvas.width  = Math.max(1, Math.floor(w * dpr));
    _canvas.height = Math.max(1, Math.floor(h * dpr));
    _canvas.style.width  = w + 'px';
    _canvas.style.height = h + 'px';
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _ctx.textBaseline = 'top';

    /* Spaltenanzahl an Breite anpassen, vorhandene Tropfen beibehalten,
       neue Spalten oberhalb des Sichtbereichs gestaffelt starten. */
    var colCount = Math.max(1, Math.floor(w / FONT));
    var next = [];
    for (var i = 0; i < colCount; i++) {
      next[i] = (_cols[i] != null) ? _cols[i] : Math.floor(Math.random() * -40);
    }
    _cols = next;

    /* Volldeckendes Schwarz, damit beim ersten Frame kein Inhalt durchblitzt. */
    _ctx.fillStyle = '#010401';
    _ctx.fillRect(0, 0, w, h);
  }

  function frame() {
    if (!_ctx || !_overlay) return;
    var w = _overlay.clientWidth;
    var h = _overlay.clientHeight;

    /* Nachzieh-Effekt: leicht transparentes Schwarz über den Vorframe. */
    _ctx.fillStyle = 'rgba(1, 4, 1, 0.12)';
    _ctx.fillRect(0, 0, w, h);
    _ctx.font = FONT_STACK;

    for (var i = 0; i < _cols.length; i++) {
      var ch = (Math.random() < 0.5) ? '0' : '1';
      var x = i * FONT;
      var y = _cols[i] * FONT;
      /* Kopf der Spalte gelegentlich hell, sonst Terminal-Grün. */
      _ctx.fillStyle = (Math.random() < 0.08) ? '#D9FFD8' : '#00E64D';
      _ctx.fillText(ch, x, y);

      if (y > h && Math.random() > 0.975) {
        _cols[i] = Math.floor(Math.random() * -20);   // Spalte oben neu starten
      } else {
        _cols[i] += 1;
      }
    }
    _raf = requestAnimationFrame(frame);
  }

  /* Baut Overlay + Canvas auf und startet den Regen.
     Rückgabe: true, wenn das Intro tatsächlich läuft; sonst false. */
  function start() {
    if (!isCmd() || reducedMotion()) return false;
    var wrapper = document.querySelector('.main-wrapper');
    if (!wrapper) return false;

    teardown();   // evtl. noch laufendes Intro sauber abräumen

    /* .main-wrapper ist ein Flex-Item (position: static); ohne
       Containing-Block würde inset:0 am Viewport haften. */
    if (getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }

    _overlay = document.createElement('div');
    _overlay.className = 'cmd-intro-overlay';
    _canvas = document.createElement('canvas');
    _canvas.className = 'cmd-intro-canvas';
    _canvas.setAttribute('aria-hidden', 'true');
    _overlay.appendChild(_canvas);
    wrapper.appendChild(_overlay);

    _ctx = _canvas.getContext('2d');
    if (!_ctx) { teardown(); return false; }

    _onResize = function () { sizeCanvas(); };
    window.addEventListener('resize', _onResize);

    sizeCanvas();
    _startTs = now();
    _raf = requestAnimationFrame(frame);
    return true;
  }

  /* Wartet die Restzeit bis DURATION ab, blendet das Overlay aus und
     räumt auf. Promise löst nach dem Abbau (auch wenn kein Intro läuft). */
  function end() {
    return new Promise(function (resolve) {
      if (!_overlay) { resolve(); return; }
      var wait = Math.max(0, DURATION - (now() - _startTs));
      setTimeout(function () {
        if (!_overlay) { resolve(); return; }
        var ov = _overlay;
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          teardown();
          resolve();
        };
        ov.style.transition = 'opacity ' + FADE + 'ms ease';
        ov.style.opacity = '0';
        ov.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, FADE + 120);   // Fallback, falls transitionend ausbleibt
      }, wait);
    });
  }

  /* In sich abgeschlossener Durchlauf (Voll-Load): start + automatisches end. */
  function play() {
    if (!start()) return Promise.resolve();
    return end();
  }

  window.CmdIntro = { start: start, end: end, play: play };

  /* ── Self-Init beim Voll-Load ──────────────────────────────────────
     Beim echten Laden/Neuladen einer Seite (kein SPA-Wechsel) sofort den
     Regen über dem Hauptbereich starten und nach DURATION ausblenden.
     Bei SPA-Navigation steuert router.js start()/end() selbst. */
  function init() {
    if (isCmd() && !reducedMotion()) { play(); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
