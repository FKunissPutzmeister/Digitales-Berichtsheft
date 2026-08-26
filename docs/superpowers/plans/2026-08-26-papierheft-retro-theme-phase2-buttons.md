# Papierheft-Retro Theme – Phase 2: Buttons & Status-Farben Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every button in the app under the `papier` theme to match the
spec's decided system — Federstrich-Unterstreichung (underline, no box) for
normal/secondary/ghost actions, a sichtbarer handgezeichneter Rahmen for
Primär- und destruktive Aktionen — and close a small status-color gap found
during research (`erstgenehmigt` badge falls back to the app's default
violet instead of a Papier-passende Farbe).

**Architecture:** Pure CSS additions to the existing `app/css/theme-papier.css`
(no new files), following the exact `[data-theme="papier"] .btn-*` override
pattern already established by `theme-cmd.css`/`theme-halloween.css`. No JS
changes — research confirmed the app's `.badge` status-chip component is
already 100% token-driven (Phase 1's tokens already color it correctly), and
"Woche freigeben" uses the same generic `.btn-primary` class as every other
primary action, so theming `.btn-primary` app-wide is both correct and
sufficient (no per-button marker classes needed).

**Tech Stack:** Plain CSS (custom properties + `box-shadow`-based underline
trick to avoid fighting the base `.btn`'s `border: 2px solid transparent` +
fixed `height: 40px` box model), `node:test` for CSS-content smoke checks.

**Spec:** [docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md](../specs/2026-08-26-papierheft-retro-theme-design.md) §5
**Phase 1 plan (context/precedent):** [docs/superpowers/plans/2026-08-26-papierheft-retro-theme-phase1-foundation.md](2026-08-26-papierheft-retro-theme-phase1-foundation.md)

**Worktree:** `.claude/worktrees/papierheft-buttons` (branch
`worktree-papierheft-buttons`, forked from `Digitales-Berichtsheft` after
Phase 1 was merged) — all paths below are relative to that worktree's repo
root.

---

## File Structure

- **Modify:** `app/css/theme-papier.css` — append a new numbered section (§4)
  with button + status-token overrides. No other file needs changes.
- **Modify:** `app/js/theme-papier.test.js` — extend the existing
  content-assertion test to also check the new selectors are present.

**Explicitly out of scope for this phase** (confirmed during research, not
overlooked):
- `.b-btn-primary` (the separate Bento-Dashboard-CTA pill component in
  `dashboard.css`) — it already inherits `background: var(--pm-grey-900);
  color: #fff;`, which renders as a dark-ink pill with white text under
  `papier` without any change (reasonable, pill-shaped, doesn't clash with
  the Federstrich/Rahmen system that's specifically about `components.css`'s
  `.btn` family). Restyling it would mean fighting its own pill-radius
  design language for no spec-mandated reason.
- Any JS changes to give "Woche freigeben" its own marker class — unnecessary
  per the architecture note above.

---

### Task 1: Close the `erstgenehmigt` status-token gap

**Files:**
- Modify: `app/css/theme-papier.css`
- Modify: `app/js/theme-papier.test.js`

Research found `--status-erstgenehmigt-bg`/`--status-erstgenehmigt` are
defined in `app/css/variables.css:82-83` (violet, `#6D28D9`-family) but were
not carried over into `theme-papier.css`'s Phase 1 token block, so
`.badge--erstgenehmigt` (`app/css/components.css:291-317`) falls back to the
app-default violet under `papier` — clashing with the sepia palette.

- [ ] **Step 1: Write the failing test**

Open `app/js/theme-papier.test.js` and add this test (after the two existing
`test(...)` calls, same file, same `describe`-less flat style as the rest):

```js
test('Papierheft-Retro: theme-papier.css setzt eigene erstgenehmigt-Statusfarbe (kein Violett-Fallback)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /--status-erstgenehmigt-bg:/);
  assert.match(css, /--status-erstgenehmigt:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL — the new test fails (token not yet defined), the two
original tests still PASS.

- [ ] **Step 3: Add the token**

Open `app/css/theme-papier.css`, find this existing block inside the
`[data-theme="papier"] { ... }` token rule (Phase 1, currently reads):

```css
  --status-offen-bg:        rgba(90, 70, 30, 0.18);
  --status-freigegeben-bg:  rgba(44, 58, 92, 0.18);
  --status-genehmigt-bg:    rgba(60, 110, 60, 0.18);
  --status-abgelehnt-bg:    rgba(122, 42, 28, 0.20);
```

Replace it with (adds two lines, keeps the four existing ones unchanged):

```css
  --status-offen-bg:        rgba(90, 70, 30, 0.18);
  --status-freigegeben-bg:  rgba(44, 58, 92, 0.18);
  --status-genehmigt-bg:    rgba(60, 110, 60, 0.18);
  --status-erstgenehmigt-bg: rgba(122, 90, 30, 0.18);
  --status-abgelehnt-bg:    rgba(122, 42, 28, 0.20);
  --status-erstgenehmigt:   #7A5A1E;
```

(`--status-erstgenehmigt` — the *text* color for the badge — sits with the
`-bg` tokens here rather than further up near `--color-error-mid` etc.,
matching how `--status-offen`/`--status-genehmigt`/etc. text-color tokens are
**not** separately defined in `theme-papier.css` at all today, because
`components.css` falls back to `variables.css`'s neutral text tokens for
those — but `--status-erstgenehmigt` specifically needs its own value here
since its default in `variables.css` is a saturated violet with no earthy
fallback that would look acceptable against sepia.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-papier.css app/js/theme-papier.test.js
git commit -m "feat(theme-papier): erstgenehmigt-Statusfarbe statt Violett-Fallback"
```

---

### Task 2: Button base typography (remove uppercase micro-caps)

**Files:**
- Modify: `app/css/theme-papier.css`
- Modify: `app/js/theme-papier.test.js`

The base `.btn` (`app/css/components.css:16-44`) is uppercase, 0.75rem,
letter-spacing 0.06em — a modern "chip label" look that clashes with the
manuscript aesthetic. Every button variant needs the calligraphic body font
instead, in normal case.

- [ ] **Step 1: Extend the test**

Add to `app/js/theme-papier.test.js`:

```js
test('Papierheft-Retro: Buttons verlieren Versalien-Look (kein uppercase mehr)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\[data-theme="papier"\]\s+\.btn\s*\{[^}]*text-transform:\s*none/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (new test), other 3 PASS.

- [ ] **Step 3: Append the new section to `theme-papier.css`**

At the end of the file (after the existing §3 sidebar/dashboard-glass block
from Phase 1's Task 8 fix), append:

```css

/* ===================================================================
   4 · BUTTONS – Federstrich (leise Aktionen) + gerahmt (Primär/Destruktiv)
   -------------------------------------------------------------------
   Basis-Button (components.css) ist modernes Versal-Chip-Label (uppercase,
   0.75rem, 0.06em Sperrung) — passt nicht zum Manuskript-Ton, wird hier für
   ALLE Varianten auf die Fließtext-Schrift umgestellt. Die eigentliche
   Formensprache trennt sich danach in zwei Gruppen:
   • "Leise" Aktionen (secondary/outline/outline-yellow/ghost/success):
     Federstrich-Unterstreichung statt Kasten. Der Trick: der Rahmen bleibt
     transparent (components.css hat `border: 2px solid transparent` fest
     im Box-Modell — den NICHT anfassen, sonst verschiebt sich die Höhe),
     die Linie kommt stattdessen über einen `inset box-shadow` unten dran.
   • Primär (.btn-primary) und destruktiv (.btn-danger): sichtbarer,
     handgezeichneter Rahmen mit vier ungleichen Eckenradien (Slash-Syntax),
     Werte aus dem gebilligten Brainstorm-Mockup übernommen — bewusst KEIN
     neuer Formentwurf an dieser Stelle.
   .b-btn-primary (Bento-Dashboard-CTA) bleibt unangetastet: erbt bereits
   passabel aus --pm-grey-900/#fff, ist eine eigene Pillen-Komponente außerhalb
   dieses Systems (siehe Plan-Dokument, "Explicitly out of scope").
   =================================================================== */
[data-theme="papier"] .btn {
  font-family: var(--font-body);
  font-weight: 600;
  text-transform: none;
  font-size: 0.85rem;
  letter-spacing: 0.01em;
}

/* ── Leise Aktionen: Federstrich statt Kasten ── */
[data-theme="papier"] .btn-secondary,
[data-theme="papier"] .btn-outline,
[data-theme="papier"] .btn-outline-yellow,
[data-theme="papier"] .btn-ghost,
[data-theme="papier"] .btn-success {
  background: transparent;
  border-color: transparent;
  border-radius: 0;
  box-shadow: inset 0 -1.5px 0 0 var(--pm-grey-500);
  color: var(--pm-grey-700);
}
[data-theme="papier"] .btn-secondary:hover:not(:disabled),
[data-theme="papier"] .btn-outline:hover:not(:disabled),
[data-theme="papier"] .btn-outline-yellow:hover:not(:disabled),
[data-theme="papier"] .btn-ghost:hover:not(:disabled),
[data-theme="papier"] .btn-success:hover:not(:disabled) {
  background: rgba(90, 68, 41, 0.06);
  box-shadow: inset 0 -2.5px 0 0 var(--pm-grey-700);
  color: var(--pm-grey-900);
}
[data-theme="papier"] .btn-secondary:focus-visible,
[data-theme="papier"] .btn-outline:focus-visible,
[data-theme="papier"] .btn-outline-yellow:focus-visible,
[data-theme="papier"] .btn-ghost:focus-visible,
[data-theme="papier"] .btn-success:focus-visible {
  outline: 1px dotted var(--pm-grey-700);
  outline-offset: 3px;
  box-shadow: inset 0 -1.5px 0 0 var(--pm-grey-700);
}
[data-theme="papier"] .btn-secondary:disabled,
[data-theme="papier"] .btn-outline:disabled,
[data-theme="papier"] .btn-outline-yellow:disabled,
[data-theme="papier"] .btn-ghost:disabled,
[data-theme="papier"] .btn-success:disabled {
  box-shadow: inset 0 -1px 0 0 var(--pm-grey-300);
  color: var(--pm-grey-400);
}

/* ── Primär: sichtbarer, handgezeichneter Rahmen (Indigo-Tinte) ── */
[data-theme="papier"] .btn-primary {
  background: rgba(44, 58, 92, 0.08);
  color: var(--pm-yellow);
  border: 1.5px solid var(--pm-yellow);
  border-radius: 3px 7px 4px 8px / 6px 4px 8px 3px;
  box-shadow: inset 0 0 0 1px rgba(44, 58, 92, 0.15);
}
[data-theme="papier"] .btn-primary:hover:not(:disabled) {
  background: rgba(44, 58, 92, 0.16);
  border-color: var(--pm-yellow-dark);
  box-shadow: inset 0 0 0 1px rgba(44, 58, 92, 0.25);
}
[data-theme="papier"] .btn-primary:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px rgba(44, 58, 92, 0.15), 0 0 0 3px rgba(44, 58, 92, 0.25);
}
[data-theme="papier"] .btn-primary:disabled {
  background: transparent;
  color: var(--pm-grey-400);
  border-color: var(--pm-grey-300);
  box-shadow: none;
}

/* ── Destruktiv: sichtbarer, handgezeichneter Rahmen (Rot-Tinte) ── */
[data-theme="papier"] .btn-danger {
  background: rgba(122, 42, 28, 0.08);
  color: var(--color-error-mid);
  border: 1.5px solid var(--color-error-mid);
  border-radius: 6px 3px 8px 4px / 4px 8px 3px 6px;
  box-shadow: inset 0 0 0 1px rgba(122, 42, 28, 0.15);
}
[data-theme="papier"] .btn-danger:hover:not(:disabled) {
  background: rgba(122, 42, 28, 0.16);
  box-shadow: inset 0 0 0 1px rgba(122, 42, 28, 0.25);
}
[data-theme="papier"] .btn-danger:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px rgba(122, 42, 28, 0.15), 0 0 0 3px rgba(122, 42, 28, 0.25);
}
[data-theme="papier"] .btn-danger:disabled {
  background: transparent;
  color: var(--pm-grey-400);
  border-color: var(--pm-grey-300);
  box-shadow: none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-papier.css app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Federstrich-Buttons + gerahmte Primär-/Destruktiv-Aktionen"
```

---

### Task 3: Extend the smoke test to cover both button groups explicitly

**Files:**
- Modify: `app/js/theme-papier.test.js`

Task 2's test only checked the typography override. Add two more targeted
checks so a future accidental deletion of either button group is caught
immediately by `node --test`, without needing a browser.

- [ ] **Step 1: Add the tests**

```js
test('Papierheft-Retro: leise Buttons bekommen Federstrich (kein Kasten)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  // .btn-ghost steht in einer Mehrfach-Selektor-Liste (zusammen mit
  // .btn-secondary/.btn-outline/.btn-outline-yellow/.btn-success), deshalb
  // NICHT ".btn-ghost {" direkt matchen (das gibt es so nicht) — stattdessen
  // Selektor-Präsenz und die Federstrich-Deklaration getrennt prüfen.
  assert.match(css, /\[data-theme="papier"\]\s+\.btn-ghost[,\s]/);
  assert.match(css, /box-shadow:\s*inset 0 -1\.5px 0 0 var\(--pm-grey-500\);/);
});

test('Papierheft-Retro: Primär- und Destruktiv-Buttons bekommen sichtbaren, handgezeichneten Rahmen', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  // .btn-primary/.btn-danger sind hier Einzel-Selektor-Blöcke (kein Komma-
  // Selektor wie oben), deshalb DARF hier direkt "Selektor {...}" geprüft werden.
  assert.match(css, /\[data-theme="papier"\] \.btn-primary \{[\s\S]*?border-radius: 3px 7px 4px 8px \/ 6px 4px 8px 3px;/);
  assert.match(css, /\[data-theme="papier"\] \.btn-danger \{[\s\S]*?border-radius: 6px 3px 8px 4px \/ 4px 8px 3px 6px;/);
});
```

- [ ] **Step 2: Run the full suite**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 6 tests PASS (these two are already satisfied by Task 2's
work — this task is pure regression-safety, not new CSS).

- [ ] **Step 3: Commit**

```bash
git add app/js/theme-papier.test.js
git commit -m "test(theme-papier): Regressionsschutz für Button-Gruppen (Federstrich/Rahmen)"
```

---

### Task 4: Manual visual verification

**Files:** none (verification only — any fix lands as a small follow-up
commit to `app/css/theme-papier.css`).

Reuse the Phase 1 approach (documented in the Phase 1 plan's Task 8 and
proven to work): run this worktree's own backend on a spare port with a
copy of `backend/.env`, log in with a `.demo` account, switch to the
`papier` theme, and look at real buttons in context — CSS content-matching
tests (Tasks 1-3) can't catch things like insufficient click-target size,
two adjacent buttons whose underlines visually merge, or a hover state that
looks broken in practice.

- [ ] **Step 1: Start the worktree's own server**

```bash
cp ../../../backend/.env backend/.env    # if not already present in this worktree
cd backend && npm install                # if node_modules isn't already present
PORT=3031 node server.js
```

(Port 3031 — Phase 1 used 3030; pick a port not already in use by another
open worktree's test server.)

- [ ] **Step 2: Log in and switch theme**

Using Playwright with the Edge channel (Chrome is not installed for the
`playwright` MCP plugin in this environment — use
`require('c:/Dev/Digitales-Berichtsheft/node_modules/playwright')` with
`chromium.launch({ channel: 'msedge', headless: true })` instead), navigate
to `http://localhost:3031/`, fill `#email` with
`florian.kuniss.demo@putzmeister.com`, click `#loginBtn`, wait for
`**/dashboard.html`, then `localStorage.setItem('customTheme', 'papier')`
and reload.

- [ ] **Step 3: Check each of these points on real pages, note any that fail**

  - **Wochenansicht** (`app/wochenansicht.html`): the bottom "Zur Abnahme
    freigeben" button (`#releaseBtnBottom`, `.btn-primary`) shows the
    handgezeichnete Rahmen, not a Federstrich-Unterlinie.
  - **Abteilungs-Planer** (`app/abteilungs-planer.html`): the delete
    confirmation buttons (`#zuweisungDeleteConfirmBtn`,
    `#ptGrpDeleteConfirmBtn`, both `.btn-danger`) show the red-ink framed
    rahmen, visually distinct from the indigo primary frame.
  - Any `.btn-ghost`/`.btn-outline`/`.btn-secondary` button on any page
    (e.g. a modal's "Abbrechen") shows underline-only, no visible box, and
    the underline visibly thickens on hover.
  - Tab through a form with multiple button types — focus state is visible
    on every variant (dotted outline for Federstrich buttons, box-shadow
    ring for framed buttons), not just the browser's default focus ring.
  - A disabled button (any variant — e.g. a save button before the form is
    dirty, if one exists on the current test page) is visibly muted/paler
    than its enabled state.
  - `.badge--erstgenehmigt` (if visible on the current data — check
    `abteilungsdurchlauf.html` or the dashboard's approval list) renders in
    the new ocher/brown tone, not violet.
  - No console errors introduced by this change (compare against Phase 1's
    already-known-benign 401/404 noise).

- [ ] **Step 4: If any fix was needed, commit it**

```bash
git add app/css/theme-papier.css
git commit -m "fix(theme-papier): Button-Feinschliff nach visueller Prüfung (Phase 2)"
```

(Skip this commit if Step 3 found nothing to fix.)

- [ ] **Step 5: Stop the test server and clean up**

Kill the `node server.js` process started in Step 1. Do not leave it
running — it holds a lock on this worktree's directory that blocks later
`git worktree remove`.

---

## Self-Review Notes

- **Spec coverage:** Covers spec §5 in full (Akzent-Tinte, Federstrich für
  leise Aktionen, gerahmte Primär-/Destruktiv-Aktionen, Status-Chip-Farben —
  the latter turned out to need only a one-token gap-fill since the badge
  component was already fully token-driven from Phase 1). Does not touch
  §6 (Cursor), §7 (Umblättern), §8 (Logo/Icons), §9 (Dashboard-Karten) —
  separate phases.
- **Type/name consistency:** All new selectors scoped under
  `[data-theme="papier"]`, matching every existing selector in the file.
  Token names (`--status-erstgenehmigt-bg`, `--status-erstgenehmigt`) match
  the naming pattern of the four sibling tokens already in the file.
- **No placeholders:** every step has literal selectors, literal CSS values,
  literal test code, literal commands.
