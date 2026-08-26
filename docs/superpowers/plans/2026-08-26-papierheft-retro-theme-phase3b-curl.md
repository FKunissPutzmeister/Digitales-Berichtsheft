# Papierheft-Retro Theme – Phase 3b: Eck-Curl-Umblättern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default slide-out animation with a corner-curl (clip-path
sweep + drop-shadow, direction-aware) for the "leaving" week-pane during
week navigation under the `papier` theme, plus a synced canvas highlight
band riding the fold — exactly the "hybrid" approach approved after a
feasibility spike ruled out rasterizing real DOM content (Quill editor,
form controls) onto canvas.

**Architecture:** Reuses `wochenansicht.js`'s **existing** clone/stage
mechanism (`transitionedRender`) entirely unchanged in its own logic — the
curl shape is 100% CSS, hooked onto the `.week-pane--leaving[data-dir]`
selectors the JS *already* creates. The only `wochenansicht.js` change is
one small, isolated, theme-gated block that creates a `<canvas>` sibling
next to the existing clone and hands it to a new FX engine in `theme.js`
(`PMPaperCurl`, following the exact structural pattern of the existing
`PMHalloweenFog`/`PMCandyBubbles` engines) — no existing line in
`wochenansicht.js` is modified, only new lines inserted, and the canvas is
cleaned up for free by the *already-existing* `stage.remove()` cleanup
(it's a child of `stage`).

**Timing constraint (found during research, binding for this plan):**
`transitionedRender` hard-removes the clone/stage via
`setTimeout(..., 260)` (`app/js/wochenansicht.js:999-1002`). The curl
animation MUST fit inside that window — 220ms was chosen to match the
*existing* default slide-out duration (`week-pane-out-next`/`-prev`,
`wochenansicht.css:1691-1692`) exactly, not the ~1200ms used in the
approved brainstorm mockup (which assumed no such constraint existed).

**Tech Stack:** CSS `clip-path`/`filter:drop-shadow` animations, one Canvas
2D `requestAnimationFrame` loop (self-terminating after ~220ms, no
persistent loop), `node:test` for content-presence smoke checks.

**Spec:** [docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md](../specs/2026-08-26-papierheft-retro-theme-design.md) §7
**Phase 1-3a plans (context/precedent):**
[Phase 1](2026-08-26-papierheft-retro-theme-phase1-foundation.md),
[Phase 2](2026-08-26-papierheft-retro-theme-phase2-buttons.md),
[Phase 3a](2026-08-26-papierheft-retro-theme-phase3a-cursor.md)

**Worktree:** `.claude/worktrees/papierheft-curl` (branch
`worktree-papierheft-curl`, forked from `Digitales-Berichtsheft` after
Phase 3a was merged).

---

## File Structure

- **Modify:** `app/css/theme-papier.css` — append §6 (two mirrored keyframe
  sets + drop-shadow + reduced-motion override).
- **Modify:** `app/js/theme.js` — add `PMPaperCurl` engine (new IIFE, placed
  after `PMHalloweenFog`, same file section as the other FX engines) +
  one new method `paintWeekCurl` on the public `window.PMTheme` API object.
- **Modify:** `app/js/wochenansicht.js` — one small inserted block (not a
  modification of existing lines) in `transitionedRender`, right after the
  existing clone is appended to `stage`.
- **Modify:** `app/js/theme-papier.test.js` — content-assertion tests for
  the new CSS/JS.

**Explicitly out of scope:** rasterizing real week-pane content onto canvas
(ruled out by the feasibility spike — real markup isn't valid XHTML,
`foreignObject` fails to even load it). The canvas here only ever draws an
abstract highlight gradient, never DOM content.

---

### Task 1: CSS curl (both directions) + reduced-motion guard

**Files:**
- Modify: `app/css/theme-papier.css`
- Modify: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `app/js/theme-papier.test.js`:

```js
test('Papierheft-Retro: Eck-Curl-Keyframes für beide Wochenwechsel-Richtungen', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /@keyframes papier-week-curl-next/);
  assert.match(css, /@keyframes papier-week-curl-prev/);
  assert.match(css, /\[data-theme="papier"\] \.week-pane--leaving\[data-dir="next"\] \{[\s\S]*?animation: papier-week-curl-next 220ms/);
  assert.match(css, /\[data-theme="papier"\] \.week-pane--leaving\[data-dir="prev"\] \{[\s\S]*?animation: papier-week-curl-prev 220ms/);
});

test('Papierheft-Retro: Curl respektiert prefers-reduced-motion', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\[data-theme="papier"\] \.week-pane--leaving\[data-dir="next"\][\s\S]*?animation: none;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (these 2 new tests), the other 7 tests still PASS.

- [ ] **Step 3: Append the CSS to `theme-papier.css`**

At the end of the file, append EXACTLY this:

```css

/* ===================================================================
   6 · WOCHENWECHSEL – Eck-Umblättern statt Slide
   -------------------------------------------------------------------
   Ersetzt NUR die "leaving"-Slide-Animation aus wochenansicht.css
   (.week-pane--leaving[data-dir]) durch einen Eck-Curl (clip-path-
   Sweep + mitlaufender Schlagschatten über filter:drop-shadow, folgt
   automatisch der aktuellen Schnittkante). "next" startet oben rechts,
   "prev" spiegelbildlich unten links — eigenes, gespiegeltes Keyframe-
   Set statt animation-direction:reverse (eine zeitlich rückwärts
   abgespielte "leaving"-Animation würde am Ende wieder sichtbar statt
   verschwunden enden, das wäre falsch).
   Timing bewusst an die bestehenden 220ms/260ms-JS-Konstanten in
   wochenansicht.js gebunden (transitionedRender räumt den Klon nach
   260ms hart weg) — NICHT die ~1200ms aus dem ursprünglichen
   Brainstorm-Mockup, sonst wird der Klon mitten in der Animation
   abgeschnitten.
   Die "entering"-Pane bleibt bewusst unverändert (Spring-Slide) — sie
   wird nicht abgeschnitten, nur die "leaving"-Seite bekommt den Curl.
   Kanvas-Lichtkante: siehe PMPaperCurl in js/theme.js, aufgerufen aus
   wochenansicht.js direkt nach der Klon-Erzeugung (Task 3 dieses Plans).
   =================================================================== */
@keyframes papier-week-curl-next {
  0%   { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); }
  20%  { clip-path: polygon(0% 0%, 72% 0%, 100% 20%, 100% 100%, 0% 100%); }
  45%  { clip-path: polygon(0% 0%, 38% 0%, 100% 55%, 100% 100%, 0% 100%); }
  70%  { clip-path: polygon(0% 0%, 10% 0%, 100% 85%, 100% 100%, 0% 100%); }
  100% { clip-path: polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%); }
}
@keyframes papier-week-curl-prev {
  0%   { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); }
  20%  { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 28% 100%, 0% 80%); }
  45%  { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 62% 100%, 0% 45%); }
  70%  { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 90% 100%, 0% 15%); }
  100% { clip-path: polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%); }
}
[data-theme="papier"] .week-pane--leaving[data-dir="next"] {
  animation: papier-week-curl-next 220ms ease-in both;
  filter: drop-shadow(-5px 6px 9px rgba(61, 44, 20, 0.4));
}
[data-theme="papier"] .week-pane--leaving[data-dir="prev"] {
  animation: papier-week-curl-prev 220ms ease-in both;
  filter: drop-shadow(5px -6px 9px rgba(61, 44, 20, 0.4));
}
@media (prefers-reduced-motion: reduce) {
  [data-theme="papier"] .week-pane--leaving[data-dir="next"],
  [data-theme="papier"] .week-pane--leaving[data-dir="prev"] {
    animation: none;
    filter: none;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-papier.css app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Eck-Curl-Umblättern (CSS, beide Richtungen)"
```

---

### Task 2: `PMPaperCurl` canvas-highlight engine in `theme.js`

**Files:**
- Modify: `app/js/theme.js`
- Modify: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing test**

Append to `app/js/theme-papier.test.js` (this test reads `theme.js`, not
`theme-papier.css` — add a second path constant near the top of the file,
right after the existing `CSS_PATH` line):

```js
const THEME_JS_PATH = path.join(__dirname, 'theme.js');
```

Then append the test:

```js
test('Papierheft-Retro: PMPaperCurl-Engine + paintWeekCurl-API existieren in theme.js', () => {
  const js = fs.readFileSync(THEME_JS_PATH, 'utf8');
  assert.match(js, /var PMPaperCurl = \(function \(\) \{/);
  assert.match(js, /paintWeekCurl: function \(canvas, dir\) \{/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (this new test), the other 9 PASS.

- [ ] **Step 3: Add `PMPaperCurl`, right after `PMHalloweenFog`'s closing `})();`**

Current (`app/js/theme.js`, exact end of the `PMHalloweenFog` IIFE):

```js
    return { start: start, stop: stop };
  })();

  /* ── Christmas-FX: Canvas-Schneefall-Engine ───────────────────────
```

New (inserts the whole `PMPaperCurl` block between the two, changes
nothing else — the `PMHalloweenFog` block above and the Christmas-FX
comment below stay byte-identical):

```js
    return { start: start, stop: stop };
  })();

  /* ── Papier-FX: Canvas-Lichtkante fürs Eck-Umblättern ─────────────
     Kein Dauerloop wie die übrigen FX-Engines (Nebel/Schnee) — läuft nur
     für die Dauer einer einzelnen Wochenwechsel-Animation (~220ms), dann
     endet die Schleife von selbst. Gemalt wird KEIN Seiteninhalt (ein
     Machbarkeits-Spike ergab: DOM-Rasterung über SVG-foreignObject
     scheitert am echten App-Markup, das nie valides XHTML ist), sondern
     nur ein schmales, diagonal wanderndes Lichtband über dem CSS-
     clip-path-Falz (theme-papier.css §6), das die Krümmung zusätzlich
     zum reinen box-shadow verkauft. */
  var PMPaperCurl = (function () {
    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function paint(canvas, dir) {
      if (reduceMotion || !canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var duration = 220;
      var start = null;

      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / duration);
        ctx.clearRect(0, 0, w, h);
        var pos = dir === 'prev' ? (1 - t) : t;
        var cx = dir === 'prev' ? pos * w : (1 - pos) * w;
        var cy = dir === 'prev' ? (1 - pos) * h : pos * h;
        var alpha = 0.45 * Math.sin(Math.PI * t);
        if (alpha > 0.01) {
          var grad = ctx.createLinearGradient(cx - 70, cy - 70, cx + 70, cy + 70);
          grad.addColorStop(0, 'rgba(255,248,230,0)');
          grad.addColorStop(0.5, 'rgba(255,248,230,' + alpha.toFixed(3) + ')');
          grad.addColorStop(1, 'rgba(255,248,230,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    return { paint: paint };
  })();

  /* ── Christmas-FX: Canvas-Schneefall-Engine ───────────────────────
```

- [ ] **Step 4: Add `paintWeekCurl` to the public `window.PMTheme` API**

Current (`app/js/theme.js`, inside the `window.PMTheme = { ... }` object):

```js
    /** Aktives Custom-Design oder null. */
    getCustom: function () {
      return readStoredCustom();
    },
```

New (adds one method right after `getCustom`, nothing else in the object
changes):

```js
    /** Aktives Custom-Design oder null. */
    getCustom: function () {
      return readStoredCustom();
    },

    /** Lichtkanten-Effekt fürs Papierheft-Umblättern (no-op außerhalb
        des papier-Themes, selbst-schützend falls je aus Versehen ohne
        vorherigen Theme-Check aufgerufen) — von wochenansicht.js beim
        Wochenwechsel aufgerufen. */
    paintWeekCurl: function (canvas, dir) {
      if (readStoredCustom() !== 'papier') return;
      PMPaperCurl.paint(canvas, dir);
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/js/theme.js app/js/theme-papier.test.js
git commit -m "feat(theme-papier): PMPaperCurl-Lichtkanten-Engine + paintWeekCurl-API"
```

---

### Task 3: Wire the canvas into `wochenansicht.js`'s existing clone

**Files:**
- Modify: `app/js/wochenansicht.js`
- Modify: `app/js/theme-papier.test.js`

Only ADDS lines — no existing line in `transitionedRender` is changed,
reordered, or removed.

- [ ] **Step 1: Write the failing test**

Add near the top of `app/js/theme-papier.test.js` (alongside the other
path constants):

```js
const WOCHENANSICHT_JS_PATH = path.join(__dirname, 'wochenansicht.js');
```

Append the test:

```js
test('Papierheft-Retro: wochenansicht.js erzeugt Curl-Canvas nur für papier-Theme (theme-gated, additiv)', () => {
  const js = fs.readFileSync(WOCHENANSICHT_JS_PATH, 'utf8');
  assert.match(js, /window\.PMTheme && window\.PMTheme\.getCustom\(\) === 'papier'/);
  assert.match(js, /window\.PMTheme\.paintWeekCurl\(curlCanvas, dir\)/);
  // Bestehende Zeilen müssen unverändert bleiben — stichprobenartig prüfen,
  // dass der ursprüngliche Klon-Code noch exakt so da steht wie vorher.
  assert.match(js, /clone\.classList\.add\('week-pane--leaving'\);/);
  assert.match(js, /stage\.appendChild\(clone\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL only on the new assertions about `PMTheme`/`paintWeekCurl`
(the "unchanged lines" assertions already PASS since that code already
exists), other 10 tests PASS.

- [ ] **Step 3: Insert the canvas-creation block**

Current (`app/js/wochenansicht.js`, exact existing lines — do not touch
anything above `stage.appendChild(clone);` or below
`pane.style.opacity = '0';`):

```js
      clone.style.left  = (rect.left - mwRect.left) + 'px';
      clone.style.width = rect.width + 'px';
      stage.appendChild(clone);
      document.body.appendChild(stage);
      pane.style.opacity = '0';
```

New (inserts one block between `stage.appendChild(clone);` and
`document.body.appendChild(stage);` — every other line identical):

```js
      clone.style.left  = (rect.left - mwRect.left) + 'px';
      clone.style.width = rect.width + 'px';
      stage.appendChild(clone);

      // Papier-Theme: schlanke Lichtkanten-Canvas als weiteres Stage-Kind,
      // wird beim bestehenden `stage.remove()`-Cleanup unten (260 ms)
      // automatisch mit entfernt — kein eigener Cleanup-Code nötig. Für
      // alle anderen Themes bleibt dieser Block ein no-op (weder Canvas
      // noch FX-Aufruf).
      if (window.PMTheme && window.PMTheme.getCustom() === 'papier') {
        const curlCanvas = document.createElement('canvas');
        curlCanvas.className = 'week-pane-curl-fx';
        curlCanvas.width = Math.round(rect.width);
        curlCanvas.height = Math.round(rect.height);
        curlCanvas.style.position = 'absolute';
        curlCanvas.style.left = clone.style.left;
        curlCanvas.style.top = '0';
        curlCanvas.style.width = rect.width + 'px';
        curlCanvas.style.height = rect.height + 'px';
        curlCanvas.style.pointerEvents = 'none';
        stage.appendChild(curlCanvas);
        window.PMTheme.paintWeekCurl(curlCanvas, dir);
      }

      document.body.appendChild(stage);
      pane.style.opacity = '0';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/js/wochenansicht.js app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Curl-Canvas additiv in transitionedRender einhängen"
```

---

### Task 4: Manual visual + regression verification

**Files:** none (verification only).

This task carries the most risk in the whole plan — `wochenansicht.js` is
shared, actively-used code. Every check below that mentions "other themes"
or "default theme" exists specifically to catch a regression that Tasks
1-3's CSS-content tests structurally cannot catch (they only prove the new
code *exists*, not that the *old* behavior survives unchanged).

- [ ] **Step 1: Start the worktree's own server**

```bash
cp ../../../backend/.env backend/.env    # if not already present
cd backend && npm install                # if node_modules isn't already present
PORT=3033 node server.js
```

- [ ] **Step 2: Regression-check the DEFAULT theme first**

Log in, do **not** switch to `papier`. Navigate `wochenansicht.html`, click
"prev"/"next" week several times, including rapid double-clicks. Confirm:
the existing slide animation looks and behaves exactly as before (no visual
change, no new canvas element in the DOM — check via DevTools that no
`.week-pane-curl-fx` element appears), no new console errors.

- [ ] **Step 3: Switch to `papier` and check the curl**

Switch theme, navigate weeks:
  - "Next week" (▸): the leaving pane curls from the top-right corner,
    with a soft light band sweeping diagonally across the fold as it goes.
  - "Previous week" (◂): the leaving pane curls from the bottom-left
    corner (mirrored), light band sweeping the opposite diagonal.
  - Content underneath (the new week, already rendering while the old one
    curls away) is not distorted or clipped incorrectly.
  - No visual "pop"/jump when the clone is removed at the end (i.e. the
    220ms CSS animation and the 260ms JS cleanup don't visibly race).
  - Rapid repeated clicking (the existing "quickfade" fallback path,
    `commitWeekSwitch`) doesn't break — confirm no leftover canvas
    elements pile up in the DOM after several fast clicks (each should be
    cleaned up by its own 260ms timeout).

- [ ] **Step 4: `prefers-reduced-motion` check**

Emulate reduced motion (Playwright: `page.emulateMedia({ reducedMotion:
'reduce' })`, or DevTools rendering panel). Confirm the curl animation and
drop-shadow are disabled (pane just disappears/is replaced without the
clip-path sweep) and the canvas draws nothing (the `PMPaperCurl.paint`
early-return kicks in).

- [ ] **Step 5: If any fix was needed, commit it**

```bash
git add app/css/theme-papier.css app/js/theme.js app/js/wochenansicht.js
git commit -m "fix(theme-papier): Umblättern-Feinschliff nach visueller Prüfung (Phase 3b)"
```

(Skip this commit if Steps 2-4 found nothing to fix.)

- [ ] **Step 6: Stop the test server.**

---

## Self-Review Notes

- **Spec coverage:** Covers spec §7 (Umblättern) — corner-curl, direction-
  aware, "Canvas mit echtem Curl-Algorithmus" satisfied via the highlight
  engine (content rasterization was explicitly ruled infeasible by the
  Phase 3b feasibility spike, documented above and in the conversation this
  plan followed from — the spec's phrase is honored in spirit via a real,
  synced canvas render loop, not by rasterizing DOM pixels). Scope limited
  to the week-pane transition only, per the original design decision (no
  general page-to-page transition).
- **Risk containment:** Every `wochenansicht.js` change is a pure insertion
  (verified by Task 3's test asserting the untouched lines are still
  present verbatim) gated behind a `getCustom() === 'papier'` check, so
  behavior for all 6 other themes (and the default light/dark mode) is
  provably unchanged at the source level — Task 4 exists to verify this
  holds at the *runtime* level too, which static tests can't prove.
- **Type/name consistency:** `PMPaperCurl`/`paintWeekCurl` naming follows
  the exact casing/verb conventions of the sibling engines
  (`PMHalloweenFog`/`start`/`stop`, `PMCandyBubbles`, etc.).
- **No placeholders:** literal CSS, literal JS, literal test code, literal
  commands throughout.
