# Papierheft-Retro Theme – Phase 4: Logo & Sidebar-Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor the Putzmeister mark (same technique as `candy`/`silk`) into
ink-on-parchment and give it, plus the sidebar nav icons, a subtle
hand-drawn wobble via a reusable SVG filter — without redrawing the
Putzmeister brand mark's shape or the 10 sidebar icon glyphs by hand.

**Architecture:** Two new static assets (`app/assets/logo-papier.png`,
`app/assets/filters-papier.svg`) + CSS-only wiring in `theme-papier.css`,
following the exact `content: url(...)` logo-swap pattern already
established by `theme-candy.css:870-879`. No JS, no HTML changes (the same
`content:url()` mechanism candy already uses needs no per-page markup
changes — it's a pure CSS override on the existing `<img>` tags).

**Two scope decisions made before writing this plan (documented here, not
silently skipped):**
1. **No "ghost duplicate" second logo layer** (the brainstorm mockup's
   sketch-retrace effect) — `.sidebar__logo-mark` etc. are plain `<img>`
   tags (`app/js/sidebar.js:13`, `app/dashboard.html:40`), and `::before`/
   `::after` generated content on replaced elements like `<img>` is not
   reliably supported across browsers. The wobble filter alone carries the
   "hand-drawn" read.
2. **Sidebar icons are NOT redrawn** — `app/js/icons.js` is an
   auto-generated registry from a commercial icon set
   (`tools/build-icons.mjs`, explicitly "nicht von Hand bearbeiten").
   Instead, the *existing* icon shapes get the same wobble filter applied.
   Their **color is deliberately left untouched** — the spec's `#5A4A1E`
   suggestion predates Phase 1's sidebar-contrast fix (dark ink
   `--sidebar-bg`); icons already inherit the correct light-parchment
   color via `currentColor` from `.sidebar__link`'s color (fixed in
   Phase 1 Task 8) — applying `#5A4A1E` now would recreate the exact
   dark-on-dark contrast bug that fix resolved.

**Tech Stack:** Static PNG (already generated + pixel-verified, see Task 1),
static SVG filter primitives (`feTurbulence`/`feDisplacementMap`,
non-animated — the Phase 3b `filter`+animated-`clip-path` rendering bug
does not apply here since nothing here animates), `node:test` for
asset-presence + content checks.

**Spec:** [docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md](../specs/2026-08-26-papierheft-retro-theme-design.md) §8
**Phase 1-3b plans (context/precedent):**
[Phase 1](2026-08-26-papierheft-retro-theme-phase1-foundation.md),
[Phase 2](2026-08-26-papierheft-retro-theme-phase2-buttons.md),
[Phase 3a](2026-08-26-papierheft-retro-theme-phase3a-cursor.md),
[Phase 3b](2026-08-26-papierheft-retro-theme-phase3b-curl.md)

**Worktree:** `.claude/worktrees/papierheft-logo` (branch
`worktree-papierheft-logo`, forked from `Digitales-Berichtsheft` after
Phase 3b was merged).

---

## File Structure

- **Create:** `app/assets/logo-papier.png` — already generated from
  `app/assets/logo-candy.png` via the same 2-color-remap technique
  documented in `theme-candy.css:870-875` (background→transparent instead
  of a flat color, mark→`#3D2C14`), pixel-verified (corner alpha=0, center
  alpha=255, matches ink RGB exactly). Sits on disk in this worktree,
  untracked until Task 1 commits it.
- **Create:** `app/assets/filters-papier.svg` — two reusable
  `feTurbulence`/`feDisplacementMap` filter primitives (`#roughen` for the
  logo, `#roughen-fine` for small sidebar icons — separate frequency/scale
  so a tiny 18×18 icon doesn't get the same distortion magnitude as a
  ~200px logo). Already on disk in this worktree.
- **Modify:** `app/css/theme-papier.css` — append §7 (logo + icon wobble).
- **Modify:** `app/js/theme-papier.test.js` — asset-presence + content
  checks.

---

### Task 1: Vendor the logo asset + filter SVG

**Files:**
- Create: `app/assets/logo-papier.png` (already generated, see above)
- Create: `app/assets/filters-papier.svg` (already generated, see above)
- Modify: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing test**

Append to `app/js/theme-papier.test.js`:

```js
test('Papierheft-Retro: Logo-Asset + Filter-SVG liegen vor', () => {
  const logoPath = path.join(__dirname, '..', 'assets', 'logo-papier.png');
  const filterPath = path.join(__dirname, '..', 'assets', 'filters-papier.svg');
  assert.ok(fs.existsSync(logoPath), `Erwartet: ${logoPath}`);
  assert.ok(fs.statSync(logoPath).size > 1000, 'logo-papier.png ist verdächtig klein');
  assert.ok(fs.existsSync(filterPath), `Erwartet: ${filterPath}`);
  const svg = fs.readFileSync(filterPath, 'utf8');
  assert.match(svg, /id="roughen"/);
  assert.match(svg, /id="roughen-fine"/);
  assert.match(svg, /feDisplacementMap/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (files aren't committed to git yet, even though they exist
on disk in this worktree — `fs.existsSync` will actually already find them
since they're real files on disk; if it unexpectedly PASSES here that's
fine too, it just means Step 1 accidentally validated already-correct
state — either way, proceed to Step 3 to make the commit itself the
meaningful gate).

- [ ] **Step 3: Commit**

```bash
git add app/assets/logo-papier.png app/assets/filters-papier.svg app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Logo-Asset (Tinte, transparent) + Wackel-Filter-SVG"
```

---

### Task 2: Wire the logo swap + wobble into `theme-papier.css`

**Files:**
- Modify: `app/css/theme-papier.css`
- Modify: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing test**

Append to `app/js/theme-papier.test.js`:

```js
test('Papierheft-Retro: Logo wird per content:url() getauscht + gewackelt', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\[data-theme="papier"\] \.sidebar__logo-mark,/);
  assert.match(css, /content: url\("\.\.\/assets\/logo-papier\.png"\);/);
  assert.match(css, /filter: url\("\.\.\/assets\/filters-papier\.svg#roughen"\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (this new test only), others PASS.

- [ ] **Step 3: Append the CSS**

At the end of `theme-papier.css`, append:

```css

/* ===================================================================
   7 · LOGO – Putzmeister-Marke, Tinte auf Pergament, handgezeichnet
   -------------------------------------------------------------------
   Gleiches Muster wie theme-candy.css:870-879: content:url() tauscht nur
   unter [data-theme="papier"] das <img>-Bitmap der Marke; alle anderen
   Themes behalten das Original. Form/Silhouette bleibt vollständig
   erhalten — nur Farbe (Tinte statt Marken-Gelb/Grau) und Kontur (Wackel-
   Filter statt digital glatt) ändern sich.
   Asset: assets/logo-papier.png — aus assets/logo-candy.png per 2-Farben-
   Remap erzeugt (Hintergrund→transparent statt Pink, Marke→#3D2C14),
   pixelverifiziert (Rand-Alpha 0, Mitte-Alpha 255).
   KEINE zweite "Geister"-Kopie (siehe Plan-Dokument, Scope-Entscheidung
   1) — <img> unterstützt generierte ::before/::after-Inhalte nicht
   zuverlässig browserübergreifend.
   =================================================================== */
[data-theme="papier"] .sidebar__logo-mark,
[data-theme="papier"] .login-card__mark,
[data-theme="papier"] .dh-topbar__logo {
  content: url("../assets/logo-papier.png");
  filter: url("../assets/filters-papier.svg#roughen");
}

/* ===================================================================
   8 · SIDEBAR-ICONS – dezenter Gravur-Wackel
   -------------------------------------------------------------------
   Icons bleiben die bestehenden Solar-Icon-Set-Formen aus js/icons.js
   (AUTO-GENERIERT, nicht von Hand redrawn — siehe Plan-Dokument, Scope-
   Entscheidung 2) — nur der Wackel-Filter (feinere Variante als das Logo,
   passend zur kleineren Größe) gibt ihnen einen "handgraviert" wirkenden
   Kontur-Jitter. Farbe bewusst NICHT verändert: die Icons erben bereits
   über currentColor die in Phase 1 (Task 8) korrigierte helle
   Pergament-Farbe von .sidebar__link — ein hartes #5A4A1E hier würde den
   dort behobenen Dunkel-auf-Dunkel-Kontrastfehler wieder herstellen.
   =================================================================== */
[data-theme="papier"] .sidebar__link-icon {
  filter: url("../assets/filters-papier.svg#roughen-fine");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-papier.css app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Logo-Remap + Sidebar-Icon-Wackel verdrahtet"
```

---

### Task 3: Manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the worktree's own server**

```bash
cp ../../../backend/.env backend/.env    # if not already present
cd backend && npm install                # if node_modules isn't already present
PORT=3035 node server.js
```

- [ ] **Step 2: Check in a real browser session (or via Playwright)**

Log in with a `.demo` account, switch to `papier`, and confirm:
  - Sidebar logo mark shows the ink-colored Putzmeister mark on the
    parchment sidebar background, with a visible (not overdone) hand-drawn
    edge wobble — compare against the default theme's crisp logo on the
    same page to confirm the swap actually happened (not silently falling
    back to the original asset due to a path typo).
  - Login page mark (`.login-card__mark`) shows the same treatment — this
    page renders BEFORE the demo-login flow, so check it by logging out
    first or opening `/` directly with `papier` already selected via
    `localStorage`.
  - Sidebar icons show a subtle contour jitter on close inspection (zoom
    in) without looking broken/blurry at normal viewing size, and remain
    clearly legible (this is the main risk — a "fine" wobble that's still
    too strong at 18×18px would turn icons into mush; if so, reduce the
    `scale` value in `filters-papier.svg#roughen-fine` and re-test, don't
    just accept a bad result).
  - No console errors related to the new asset paths (a 404 on
    `logo-papier.png` or `filters-papier.svg` would mean the relative path
    from `app/css/` is wrong).

- [ ] **Step 3: If any fix was needed, commit it**

```bash
git add app/css/theme-papier.css app/assets/filters-papier.svg app/assets/logo-papier.png
git commit -m "fix(theme-papier): Logo/Icon-Feinschliff nach visueller Prüfung (Phase 4)"
```

(Skip this commit if Step 2 found nothing to fix.)

- [ ] **Step 4: Stop the test server.**

---

## Self-Review Notes

- **Spec coverage:** Covers spec §8 in full for the logo. Sidebar-icon
  coverage is a deliberate, documented reinterpretation (wobble instead of
  hand-redraw, no color change) — not a silent gap. Favicon is explicitly
  out of scope per the spec itself (§8: "bleibt unverändert").
- **No placeholders:** literal file paths, literal CSS, literal test code.
- **Risk:** lowest of all phases so far — pure CSS `content:url()`/`filter`
  additions on already-established selectors, no JS, no shared-file
  surgery like Phase 3b's `wochenansicht.js` change.
