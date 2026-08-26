# Papierheft-Retro Theme – Phase 5: Dashboard-Karten-Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard's Bento cards read as loose, individually-placed
parchment sheets instead of a mechanically exact grid — subtle per-card
rotation + a sepia-toned drop shadow, cycling through 3 rotation values so
adjacent cards don't look identically tilted (a photocopy repeat instead of
"scattered").

**Architecture:** Pure CSS, `:nth-child` cycling on the existing
`.bento .b-tile` selector — the last of the five phases and, together with
Phase 4, one of the lowest-risk (no JS, no animation, no SVG filter — the
categories that caused rendering bugs in Phases 3b/4 don't apply to a
static `transform: rotate()`).

**One constraint found before writing this plan:** `dashboard.css:1654`
already has `.bento .b-tile:hover { transform: translateY(-2px); }`. A
naive `[data-theme="papier"] .bento .b-tile { transform: rotate(...); }`
would get **overridden** (not combined) by that hover rule, so the card
would visually "snap straight" on hover and rotate back on mouse-leave —
jarring. The hover override below combines both transforms per rotation
variant instead of letting the base hover rule win outright.

**Tech Stack:** Plain CSS (`transform: rotate()` + `:nth-child()`),
`node:test` for content-assertion checks.

**Spec:** [docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md](../specs/2026-08-26-papierheft-retro-theme-design.md) §9 (last remaining spec section)
**Phase 1-4 plans (context/precedent):**
[Phase 1](2026-08-26-papierheft-retro-theme-phase1-foundation.md),
[Phase 2](2026-08-26-papierheft-retro-theme-phase2-buttons.md),
[Phase 3a](2026-08-26-papierheft-retro-theme-phase3a-cursor.md),
[Phase 3b](2026-08-26-papierheft-retro-theme-phase3b-curl.md),
[Phase 4](2026-08-26-papierheft-retro-theme-phase4-logo-icons.md)

**Worktree:** `.claude/worktrees/papierheft-cards` (branch
`worktree-papierheft-cards`, forked from `Digitales-Berichtsheft` after
Phase 4 was merged).

---

## File Structure

- **Modify:** `app/css/theme-papier.css` — append §9 (card rotation).
- **Modify:** `app/js/theme-papier.test.js` — content-assertion check.

---

### Task 1: Card rotation + sepia shadow, hover-safe

**Files:**
- Modify: `app/css/theme-papier.css`
- Modify: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing test**

Append to `app/js/theme-papier.test.js`:

```js
test('Papierheft-Retro: Dashboard-Karten rotieren zyklisch (3 Varianten) und bleiben es beim Hover', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+1\)/);
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+2\)/);
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+3\)/);
  // Hover muss die Rotation MITNEHMEN, nicht durch reines translateY ersetzen
  // (siehe Plan: sonst "springt" die Karte beim Hover gerade).
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+1\):hover \{[\s\S]*?transform: rotate\(-1\.2deg\) translateY\(-2px\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (this new test), the other 13 PASS.

- [ ] **Step 3: Append the CSS**

At the end of `theme-papier.css`, append:

```css

/* ===================================================================
   9 · DASHBOARD-KARTEN – lose, leicht schräg gestapelte Pergamentblätter
   -------------------------------------------------------------------
   .bento .b-tile ist ein Grid-Item (dashboard.css: display:grid,
   grid-template-columns repeat(12,1fr), gap 16px) — die Rotation bleibt
   bewusst klein (max. 1.2°), damit eine gedrehte Karte bei den
   üblichen Kartenbreiten nicht spürbar in den 16px-Gap der Nachbarkarte
   hineinragt. :nth-child(3n+…) zyklisch statt einer festen Rotation für
   ALLE Karten — sonst wirkt es wie ein mechanisch wiederholtes Muster
   statt "zufällig hingelegt".
   WICHTIG: dashboard.css:1654 hat bereits `.bento .b-tile:hover {
   transform: translateY(-2px); }` — das WÜRDE die Rotation beim Hover
   ersetzen (nicht kombinieren) und die Karte sichtbar "geradeschnappen"
   lassen. Die :hover-Overrides hier kombinieren deshalb explizit
   rotate() + translateY() pro Variante.
   =================================================================== */
[data-theme="papier"] .bento .b-tile:nth-child(3n+1) {
  transform: rotate(-1.2deg);
  box-shadow: 2px 3px 6px rgba(90, 60, 20, 0.20);
}
[data-theme="papier"] .bento .b-tile:nth-child(3n+2) {
  transform: rotate(0.8deg);
  box-shadow: 2px 3px 6px rgba(90, 60, 20, 0.20);
}
[data-theme="papier"] .bento .b-tile:nth-child(3n+3) {
  transform: rotate(-0.5deg);
  box-shadow: 2px 3px 6px rgba(90, 60, 20, 0.20);
}
[data-theme="papier"] .bento .b-tile:nth-child(3n+1):hover {
  transform: rotate(-1.2deg) translateY(-2px);
}
[data-theme="papier"] .bento .b-tile:nth-child(3n+2):hover {
  transform: rotate(0.8deg) translateY(-2px);
}
[data-theme="papier"] .bento .b-tile:nth-child(3n+3):hover {
  transform: rotate(-0.5deg) translateY(-2px);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-papier.css app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Dashboard-Karten lose & schräg gestapelt"
```

---

### Task 2: Manual visual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the worktree's own server**

```bash
cp ../../../backend/.env backend/.env    # if not already present
cd backend && npm install                # if node_modules isn't already present
PORT=3037 node server.js
```

- [ ] **Step 2: Check on the Dashboard page**

Log in with a `.demo` account, switch to `papier`, open `dashboard.html`
(dismiss the onboarding tour first if it appears — its
`backdrop-filter: blur(5px)` on the background, `app/css/onboarding.css:112`,
will otherwise make the cards look blurred in a screenshot even though
nothing is actually wrong, a false alarm already hit and resolved during
Phase 4's testing). Confirm:
  - Adjacent cards show visibly different (but each individually subtle)
    rotation angles — not all tilted the same way, not perfectly straight.
  - No card visually overlaps or clips into its neighbor's content at the
    current viewport width (1440px desktop). If overlap is visible, reduce
    the rotation magnitude in the CSS (e.g. -0.8deg/0.5deg/-0.3deg) and
    re-test rather than accepting clipped content.
  - Hovering a card lifts it (translateY) while keeping its tilt — it does
    NOT snap upright on hover.
  - Also check a narrower viewport (e.g. 900px, the dashboard.css responsive
    breakpoint noted in earlier phases' research) to make sure the rotation
    doesn't cause visible overlap once cards are narrower/closer together.

- [ ] **Step 3: If any fix was needed, commit it**

```bash
git add app/css/theme-papier.css
git commit -m "fix(theme-papier): Karten-Rotation-Feinschliff nach visueller Prüfung (Phase 5)"
```

(Skip this commit if Step 2 found nothing to fix.)

- [ ] **Step 4: Stop the test server.**

---

## Self-Review Notes

- **Spec coverage:** Covers spec §9 in full — this is the **last** spec
  section; after this phase, all of §3–§9 (Grundfläche, Typografie,
  Tinte/Buttons/Status, Cursor, Umblättern, Logo/Icons, Dashboard) are
  implemented across Phases 1–5.
- **No placeholders:** literal CSS, literal test code, literal commands.
- **Risk:** low — static `transform`/`box-shadow` only, no JS, no
  animation, no SVG filter (the three ingredients that caused every
  rendering bug found in Phases 3b and 4's investigation).
