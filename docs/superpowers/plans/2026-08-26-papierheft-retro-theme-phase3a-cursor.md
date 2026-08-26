# Papierheft-Retro Theme – Phase 3a: Federspitzen-Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the system cursor with a golden feather-nib pointer
everywhere under the `papier` theme, exactly as approved during brainstorming
(kite-shaped nib, breather hole + slit, gold fill).

**Architecture:** One CSS addition to `app/css/theme-papier.css` — an inline
SVG data URI as the `cursor` value, applied theme-wide via a high-specificity
`!important` override (this project has no existing `cursor: url(...)`
precedent to follow, and per-component specificity is too inconsistent to
rely on the cascade alone — `themes.css` already sets the precedent of using
`!important` for a theme-level override that must win regardless of local
component specificity, e.g. the `.sidebar__theme-toggle { display: none
!important; }` rule).

**Tech Stack:** Plain CSS, `node:test` for a content-presence smoke check.

**Spec:** [docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md](../specs/2026-08-26-papierheft-retro-theme-design.md) §6
**Phase 1/2 plans (context/precedent):**
[Phase 1](2026-08-26-papierheft-retro-theme-phase1-foundation.md),
[Phase 2](2026-08-26-papierheft-retro-theme-phase2-buttons.md)

**Worktree:** `.claude/worktrees/papierheft-cursor` (branch
`worktree-papierheft-cursor`, forked from `Digitales-Berichtsheft` after
Phase 2 was merged).

---

## File Structure

- **Modify:** `app/css/theme-papier.css` — append §5 (cursor rule only).
- **Modify:** `app/js/theme-papier.test.js` — one content-assertion test.

---

### Task 1: Add the feather-nib cursor

**Files:**
- Modify: `app/css/theme-papier.css`
- Modify: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing test**

Append to `app/js/theme-papier.test.js`:

```js
test('Papierheft-Retro: goldener Federspitzen-Cursor ist gesetzt', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /cursor:\s*url\("data:image\/svg\+xml,/);
  assert.match(css, /%23c9a227/i); // Gold-Füllung der Feder, URL-encodiert
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL (new test), the other 6 tests still PASS.

- [ ] **Step 3: Append the cursor rule to `theme-papier.css`**

At the end of the file, append EXACTLY this (the SVG path/colors/hotspot
were already designed and approved in an earlier review — copy verbatim,
do not redraw or adjust):

```css

/* ===================================================================
   5 · CURSOR – goldene Federspitze
   -------------------------------------------------------------------
   Kite-Form mit Luftloch + Mittelschlitz (die zwei Merkmale, an denen
   eine Füllerfeder auch in Cursor-Größe erkennbar bleibt). Canvas
   34×34, Hotspot an der Spitze (17, 30). Erster cursor:url()-Einsatz
   im Projekt — kein bestehendes Muster zu befolgen, deshalb per
   Universalselektor + !important (wie schon
   ".sidebar__theme-toggle { display: none !important; }" in
   themes.css) erzwungen, statt gegen jede einzelne Komponenten-
   Spezifität einzeln anzutreten.
   =================================================================== */
html[data-theme="papier"],
html[data-theme="papier"] * {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34'%3E%3Cpath d='M17 3 L27 13 L18 30 L16 30 L7 13 Z' fill='%23c9a227' stroke='%237a5c12' stroke-width='1.3'/%3E%3Ccircle cx='17' cy='13' r='2' fill='none' stroke='%234a3610' stroke-width='1'/%3E%3Cline x1='17' y1='15' x2='17' y2='27' stroke='%234a3610' stroke-width='1'/%3E%3C/svg%3E") 17 30, auto !important;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test app/js/theme-papier.test.js`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-papier.css app/js/theme-papier.test.js
git commit -m "feat(theme-papier): Goldene Federspitze als Cursor"
```

---

### Task 2: Manual visual verification

**Files:** none (verification only).

CSS content-matching (Task 1) proves the rule exists and is syntactically
plausible, but not that the browser actually renders the custom cursor (SVG
data-URI cursors have real-world gotchas: some browsers cap cursor image
size, mis-encoded data URIs fail silently and fall back to `auto` without
any console error). This needs an actual browser check.

- [ ] **Step 1: Start the worktree's own server**

```bash
cp ../../../backend/.env backend/.env    # if not already present
cd backend && npm install                # if node_modules isn't already present
PORT=3032 node server.js
```

- [ ] **Step 2: Check in a real (non-headless) browser session or via Playwright `page.evaluate`**

Headless screenshots cannot show the live OS cursor image, so this needs
either: (a) the human operator opening `http://localhost:3032/`, switching
to the `papier` theme via Profil, and visually confirming the cursor changes
when hovering over the page (do NOT just trust a screenshot), or (b) a
Playwright check of `getComputedStyle(document.documentElement).cursor` to
confirm the property value contains the expected data URI and hotspot
(`17, 30`) — this proves the CSS resolved correctly even though it can't
prove the OS actually painted the custom bitmap.

- [ ] **Step 3: If the cursor doesn't render, common causes to check**
  - Data URI has a stray unescaped character breaking the SVG parse (test
    the raw `data:image/svg+xml,...` string by pasting it into a browser
    address bar — it should render the nib as a small standalone image).
  - Cursor image too large — some browsers silently ignore cursor images
    over 128×128px; 34×34 here is well under that, unlikely but check if
    it fails.
  - `!important` still lost to an even more specific rule (e.g. an inline
    `style="cursor:pointer"` on an element beats any stylesheet rule,
    `!important` or not) — if found, note which element/file sets it
    inline and decide a targeted fix in a follow-up commit.

- [ ] **Step 4: If any fix was needed, commit it**

```bash
git add app/css/theme-papier.css
git commit -m "fix(theme-papier): Cursor-Feinschliff nach visueller Prüfung"
```

(Skip this commit if Step 2/3 found nothing to fix.)

- [ ] **Step 5: Stop the test server.**

---

## Self-Review Notes

- **Spec coverage:** Covers spec §6 (Cursor) in full. Does not touch §7
  (Umblättern — separate, harder phase per the user's explicit request to
  split it out), §8 (Logo/Icons), §9 (Dashboard-Karten).
- **No placeholders:** literal CSS, literal test code, literal commands.
