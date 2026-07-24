/* ============================================================================
   LIQUID GLASS — ReactBits <GlassSurface>, vanilla port (no React, no build).
   ----------------------------------------------------------------------------
   LiquidGlass.init(root?) enhances every [data-glass] element into a glass
   surface, and wires .glass-nav (Apple liquid tab bar) + .glass-seg (segmented
   selector). Auto-runs on DOMContentLoaded. Call LiquidGlass.init(container)
   again after injecting glass markup dynamically (e.g. SPA route render).

   Per-element tuning via data-attributes (all optional, sensible defaults):
     data-radius      borderRadius px           (default: computed border-radius or 20)
     data-distortion  distortionScale           (default -180; moderate -70..-130 avoids edge seams)
     data-displace    output blur (soft edge)   (default 0; ~0.5 softens)
     data-blur        displacement-map blur     (default 11; raise to 14-20 on thin elements)
     data-green/-blue/-red  chromatic offsets   (default 0/10/20; lower = less colour fringing)
     data-frost       backgroundOpacity 0..1    (default 0 = clear; .08-.2 = frosted)
     data-saturation  backdrop saturate         (default 1)
     data-brightness / data-opacity / data-border / data-blend  (GlassSurface internals)
   See references/presets.md for ready presets per component + transparency levels.
   ============================================================================ */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  const D = {
    borderRadius: 20, borderWidth: 0.07, brightness: 50, opacity: 0.93,
    blur: 11, displace: 0, backgroundOpacity: 0, saturation: 1,
    distortionScale: -180, redOffset: 0, greenOffset: 10, blueOffset: 20,
    xChannel: 'R', yChannel: 'G', mixBlendMode: 'difference'
  };

  // Chromium/Edge support SVG filters in backdrop-filter; Safari/Firefox don't.
  const SVG_OK = (() => {
    const ua = navigator.userAgent;
    if ((/Safari/.test(ua) && !/Chrome/.test(ua)) || /Firefox/.test(ua)) return false;
    const d = document.createElement('div');
    d.style.backdropFilter = 'url(#x)';
    return d.style.backdropFilter !== '';
  })();

  const num = (ds, k, def) => (ds[k] != null ? +ds[k] : def);

  function props(el) {
    const ds = el.dataset;
    return {
      ...D,
      borderRadius: ds.radius != null ? +ds.radius : (parseFloat(getComputedStyle(el).borderRadius) || D.borderRadius),
      borderWidth: num(ds, 'border', D.borderWidth),
      brightness:  num(ds, 'brightness', D.brightness),
      opacity:     num(ds, 'opacity', D.opacity),
      blur:        num(ds, 'blur', D.blur),
      displace:    num(ds, 'displace', D.displace),
      backgroundOpacity: num(ds, 'frost', D.backgroundOpacity),
      saturation:  num(ds, 'saturation', D.saturation),
      distortionScale: num(ds, 'distortion', D.distortionScale),
      redOffset:   num(ds, 'red', D.redOffset),
      greenOffset: num(ds, 'green', D.greenOffset),
      blueOffset:  num(ds, 'blue', D.blueOffset),
      mixBlendMode: ds.blend || D.mixBlendMode,
      // LOKALE ERGÄNZUNG (Putzmeister): echter Frost-Blur des Backdrops.
      // GlassSurface bricht nur (Refraktion), blurrt nicht → über großen
      // Panels sieht man den scharfen Hintergrund durch = „durchsichtig".
      // data-frostblur=Npx nimmt ein blur(Npx) MIT in denselben backdrop-
      // filter auf (eine Filter-Kette, kein verschachteltes backdrop-filter).
      frostBlur:   num(ds, 'frostblur', 0)
    };
  }

  // The GlassSurface displacement map (verbatim algorithm): two corner gradients
  // (R = x-displacement, B unused, blended with mix-blend-mode) + a blurred inner
  // rect that neutralises the centre. feDisplacementMap reads x from R, y from G.
  function dmap(w, h, p, rg, bg) {
    const edge = Math.min(w, h) * (p.borderWidth * 0.5);
    const svg =
      `<svg viewBox="0 0 ${w} ${h}" xmlns="${NS}"><defs>` +
      `<linearGradient id="${rg}" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>` +
      `<linearGradient id="${bg}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs>` +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="black"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${p.borderRadius}" fill="url(#${rg})"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${p.borderRadius}" fill="url(#${bg})" style="mix-blend-mode:${p.mixBlendMode}"/>` +
      `<rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${p.borderRadius}" fill="hsl(0 0% ${p.brightness}% / ${p.opacity})" style="filter:blur(${p.blur}px)"/></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function channel(filter, scale, x, y, res, matrix, out) {
    const d = document.createElementNS(NS, 'feDisplacementMap');
    d.setAttribute('in', 'SourceGraphic'); d.setAttribute('in2', 'map'); d.setAttribute('scale', scale);
    d.setAttribute('xChannelSelector', x); d.setAttribute('yChannelSelector', y); d.setAttribute('result', 'd' + res);
    const c = document.createElementNS(NS, 'feColorMatrix');
    c.setAttribute('in', 'd' + res); c.setAttribute('type', 'matrix'); c.setAttribute('values', matrix); c.setAttribute('result', out);
    filter.append(d, c);
  }
  function blend(filter, a, b, out) {
    const e = document.createElementNS(NS, 'feBlend');
    e.setAttribute('in', a); e.setAttribute('in2', b); e.setAttribute('mode', 'screen'); e.setAttribute('result', out);
    filter.appendChild(e);
  }

  function enhance(el) {
    if (el.__glass) return; el.__glass = true;
    el.classList.add('glass-surface');

    // Wrap existing children into .glass-surface__content (mirror the React DOM).
    const content = document.createElement('div');
    content.className = 'glass-surface__content';
    while (el.firstChild) content.appendChild(el.firstChild);
    el.appendChild(content);

    const p = props(el);
    el.style.borderRadius = p.borderRadius + 'px';

    if (!SVG_OK) { el.classList.add('glass-surface--fallback'); return; }
    el.classList.add('glass-surface--svg');

    const id = 'glass-filter-' + (++uid), rg = 'rg-' + uid, bg = 'bg-' + uid;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'glass-surface__filter');
    const defs = document.createElementNS(NS, 'defs');
    const filter = document.createElementNS(NS, 'filter');
    filter.id = id; filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0%'); filter.setAttribute('y', '0%'); filter.setAttribute('width', '100%'); filter.setAttribute('height', '100%');
    const img = document.createElementNS(NS, 'feImage');
    img.setAttribute('x', '0'); img.setAttribute('y', '0'); img.setAttribute('width', '100%'); img.setAttribute('height', '100%');
    img.setAttribute('preserveAspectRatio', 'none'); img.setAttribute('result', 'map');
    filter.appendChild(img);

    channel(filter, p.distortionScale + p.redOffset,   p.xChannel, p.yChannel, 'R', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'red');
    channel(filter, p.distortionScale + p.greenOffset, p.xChannel, p.yChannel, 'G', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'green');
    channel(filter, p.distortionScale + p.blueOffset,  p.xChannel, p.yChannel, 'B', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'blue');
    blend(filter, 'red', 'green', 'rg'); blend(filter, 'rg', 'blue', 'output');
    if (p.displace > 0) {  // feGaussianBlur with stdDeviation 0 is an identity pass → skip it
      const gb = document.createElementNS(NS, 'feGaussianBlur');
      gb.setAttribute('in', 'output'); gb.setAttribute('stdDeviation', p.displace); filter.appendChild(gb);
    }
    defs.appendChild(filter); svg.appendChild(defs); el.insertBefore(svg, content);

    el.style.setProperty('--glass-frost', p.backgroundOpacity);
    el.style.setProperty('--glass-saturation', p.saturation);
    el.style.setProperty('--filter-id', `url(#${id})`);
    // saturate(1) is an identity pass → omit it when saturation is 1.
    // LOKALE ERGÄNZUNG: frostBlur als blur(Npx) in dieselbe Filter-Kette
    // aufnehmen (Displacement refraktiert, blur macht den Frost/Milchglas).
    let active = p.frostBlur > 0 ? `blur(${p.frostBlur}px) url(#${id})` : `url(#${id})`;
    if (p.saturation !== 1) active += ` saturate(${p.saturation})`;
    const setBF = on => { el.style.backdropFilter = on ? active : 'none'; el.style.webkitBackdropFilter = el.style.backdropFilter; };
    setBF(true);

    const refresh = () => { const r = el.getBoundingClientRect(); img.setAttribute('href', dmap(Math.round(r.width), Math.round(r.height), p, rg, bg)); };
    refresh();

    let raf = 0;  // ResizeObserver fires in bursts → coalesce via rAF (avoid rebuilding the map every event)
    new ResizeObserver(() => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); }).observe(el);
    // Perf: a live displacement backdrop-filter re-runs every frame the backdrop
    // moves. Disable it while the element is off-screen (identical look on-screen).
    new IntersectionObserver(es => es.forEach(e => { el.classList.toggle('is-off', !e.isIntersecting); setBF(e.isIntersecting); }), { rootMargin: '200px' }).observe(el);
  }

  // Liquid-Glass nav pill: the pill marks the ACTIVE link. On click it sets its
  // position to the new link, then plays a DAMPED HORIZONTAL WOBBLE — it eases in
  // from the side it came (capped so a far jump never looks like a long drag),
  // overshoots and oscillates left/right with decreasing amplitude, then fixes.
  // That settle-jiggle is the liquid feel. Modelled as a damped spring sampled
  // into keyframes (Web Animations API): x(p) = from·e^(−4.2p)·cos(10p), p∈[0,1].
  // Hover is a CSS preview pill, not a glide. Honors prefers-reduced-motion.
  function initNav(nav) {
    const ind = nav.querySelector('.glass-nav__ind'); if (!ind) return;
    const links = [...nav.querySelectorAll('.glass-nav__link')];
    let active = nav.querySelector('.glass-nav__link.active') || links[0];
    if (!active) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let prevLeft = null;

    const place = a => { ind.style.left = a.offsetLeft + 'px'; ind.style.width = a.offsetWidth + 'px'; };
    function wobble(from) {
      const n = 48, frames = [];
      for (let i = 0; i <= n; i++) {
        const p = i / n, x = from * Math.exp(-4.2 * p) * Math.cos(10 * p);
        frames.push({ transform: `translateY(-50%) translateX(${x.toFixed(2)}px)` });
      }
      ind.animate(frames, { duration: 600, easing: 'linear' });
    }
    function select(a) {
      const newLeft = a.offsetLeft;
      active = a; links.forEach(x => x.classList.toggle('active', x === a)); place(a);
      if (prevLeft != null && !reduce) {
        const cap = 28;                                   // limit visible spring travel → no "dragged" look
        let from = Math.max(-cap, Math.min(cap, prevLeft - newLeft));
        if (from) wobble(from);
      }
      prevLeft = newLeft;
    }
    links.forEach(a => a.addEventListener('click', () => { if (a !== active) select(a); }));
    requestAnimationFrame(() => { place(active); prevLeft = active.offsetLeft; });
    window.addEventListener('resize', () => { place(active); prevLeft = active.offsetLeft; });
  }

  // Segmented / brand selector: indicator pill slides to the clicked option.
  function initSeg(seg) {
    const ind = seg.querySelector('.glass-seg__ind'); if (!ind) return;
    const opts = [...seg.querySelectorAll('.glass-seg__opt')]; if (!opts.length) return;
    const move = o => { ind.style.width = o.offsetWidth + 'px'; ind.style.transform = `translateX(${o.offsetLeft}px)`; opts.forEach(x => x.classList.toggle('active', x === o)); };
    seg.addEventListener('click', e => { const o = e.target.closest('.glass-seg__opt'); if (o) move(o); });
    requestAnimationFrame(() => move(seg.querySelector('.glass-seg__opt.active') || opts[0]));
  }

  // Press feedback: the glass button physically SCALES — shrinks to .95 on press
  // and settles back to 1 (Apple's press scale-down; the web norm too, e.g.
  // scale(.95) on :active). NO overshoot >1 (would flash a black filter-edge line
  // on the rounded corner). Bound once via delegation (covers
  // dynamically added buttons). Fired as a TIMED animation on the CLICK EVENT,
  // not :active — a quick tap doesn't dwell in :active long enough to be seen.
  // It scales the GLASS BOX, which is safe ONLY because the button carries
  // will-change:transform (its own compositing layer) → the backdrop-filter is
  // rendered once and the layer scaled as a unit, so the refraction scales
  // cleanly instead of swimming. Honors prefers-reduced-motion.
  function bindPress() {
    if (document.__glassPress) return; document.__glassPress = true;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest('button.glass-surface, a.glass-surface');
      if (!el) return;
      if (el.__press) el.__press.cancel();   // rapid clicks must REPLACE, not stack (stacked transforms jitter)
      // NO overshoot (no scale > 1): a value above 1 makes the element exceed its
      // layout box, the displacement filter region re-renders and a black edge
      // line flashes on the rounded corner. Ending exactly at scale(1) = layout
      // size → the compositor teardown re-rasters at native size, no edge glitch.
      el.__press = el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(.95)', offset: .42 },
         { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' });
    }, { passive: true });
  }

  function init(root) {
    root = root || document;
    root.querySelectorAll('.glass-nav, .glass-seg').forEach(enhance);  // ensure bars are glass even without data-glass
    root.querySelectorAll('[data-glass]').forEach(enhance);
    root.querySelectorAll('.glass-nav').forEach(initNav);
    root.querySelectorAll('.glass-seg').forEach(initSeg);
    bindPress();
  }

  window.LiquidGlass = { init, enhance };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', () => init());
})();
