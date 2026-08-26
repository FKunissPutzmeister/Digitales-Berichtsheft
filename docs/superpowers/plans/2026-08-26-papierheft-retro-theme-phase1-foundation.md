# Papierheft-Retro Theme – Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new custom theme `papier` selectable in the Profil-UI and render a
correct, legible base look everywhere (sepia-parchment surfaces, Blackletter
headings, Garamond body text, indigo accent, sepia-tinted shadows/status colors) —
without buttons/cursor/curl/logo work, which are separate follow-up plans.

**Architecture:** One new self-contained stylesheet `app/css/theme-papier.css`
(token block + paper background), loaded on every page exactly like the five
existing custom themes; theme registered in `theme.js` (`CUSTOM_THEMES`) and
`profil.js` (`THEME_DESIGNS`); four self-hosted webfont files under
`app/assets/fonts/`.

**Tech Stack:** Plain CSS custom properties (no build step), vanilla JS,
`node:test` for asset-presence checks.

**Spec:** [docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md](../specs/2026-08-26-papierheft-retro-theme-design.md)

**Worktree:** `.claude/worktrees/papierheft-retro` (branch `worktree-papierheft-retro`)
— all paths below are relative to that worktree's repo root.

---

## File Structure

- **Create:** `app/assets/fonts/unifraktur-maguntia.woff2`, `eb-garamond-400.woff2`,
  `eb-garamond-600.woff2`, `eb-garamond-400italic.woff2` — self-hosted webfonts
  (Google Fonts OFL, vendored like `app/assets/fonts/space-grotesk-variable.woff2`
  already is for the `silk` theme).
- **Create:** `app/css/theme-papier.css` — token block + paper background, follows
  the exact structure of `app/css/theme-candy.css` (light custom theme).
- **Create:** `app/js/theme-papier.test.js` — asset-presence checks, mirrors
  `app/js/beurteilung-core.test.js`'s PDF-asset-check pattern.
- **Modify:** `app/js/theme.js:29` — register `papier` in `CUSTOM_THEMES`.
- **Modify:** `app/js/profil.js:36-43` — add `papier` entry to `THEME_DESIGNS`.
- **Modify:** `app/css/themes.css:79-85` — hide the light/dark sidebar toggle for
  `papier` too.
- **Modify:** 18 HTML pages — add `<link rel="stylesheet" href="css/theme-papier.css">`
  right after each page's existing `<link ... theme-christmas.css>` line.

---

### Task 1: Vendor the two webfonts

**Files:**
- Create: `app/assets/fonts/unifraktur-maguntia.woff2`
- Create: `app/assets/fonts/eb-garamond-400.woff2`
- Create: `app/assets/fonts/eb-garamond-600.woff2`
- Create: `app/assets/fonts/eb-garamond-400italic.woff2`

Google Fonts serves woff2 files directly from `fonts.gstatic.com` — no build
tool needed, just download once and commit the binary like
`space-grotesk-variable.woff2` already is.

- [ ] **Step 1: Download the four font files**

Run (PowerShell — this exact command was already verified to work from this
machine):

```powershell
$dir = "app\assets\fonts"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$files = @{
  "unifraktur-maguntia.woff2"   = "https://fonts.gstatic.com/s/unifrakturmaguntia/v22/WWXPlieVYwiGNomYU-ciRLRvEmK7oaVemGZM.woff2"
  "eb-garamond-400.woff2"       = "https://fonts.gstatic.com/s/ebgaramond/v33/SlGUmQSNjdsmc35JDF1K5GR1SDk.woff2"
  "eb-garamond-600.woff2"       = "https://fonts.gstatic.com/s/ebgaramond/v33/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-NfNkBI9_.woff2"
  "eb-garamond-400italic.woff2" = "https://fonts.gstatic.com/s/ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QL99U6g.woff2"
}
foreach ($name in $files.Keys) {
  Invoke-WebRequest -Uri $files[$name] -OutFile (Join-Path $dir $name) -UseBasicParsing
}
```

- [ ] **Step 2: Verify all four files are non-trivial binary files**

Run:

```powershell
Get-ChildItem app\assets\fonts\unifraktur-maguntia.woff2, app\assets\fonts\eb-garamond-400.woff2, app\assets\fonts\eb-garamond-600.woff2, app\assets\fonts\eb-garamond-400italic.woff2 | Select-Object Name, Length
```

Expected: four rows, each with `Length` > 20000 (bytes). Known-good sizes from
the verified run: `unifraktur-maguntia.woff2` 26512, `eb-garamond-400.woff2`
44336, `eb-garamond-600.woff2` 25348, `eb-garamond-400italic.woff2` 25388.

- [ ] **Step 3: Commit**

```bash
git add app/assets/fonts/unifraktur-maguntia.woff2 app/assets/fonts/eb-garamond-400.woff2 app/assets/fonts/eb-garamond-600.woff2 app/assets/fonts/eb-garamond-400italic.woff2
git commit -m "feat(theme-papier): Webfonts UnifrakturMaguntia + EB Garamond vendoren"
```

---

### Task 2: Asset-presence test (write first, red)

**Files:**
- Create: `app/js/theme-papier.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const CSS_PATH = path.join(__dirname, '..', 'css', 'theme-papier.css');

test('Papierheft-Retro: alle vier Webfont-Dateien liegen vor und sind nicht leer', () => {
  for (const name of ['unifraktur-maguntia.woff2', 'eb-garamond-400.woff2', 'eb-garamond-600.woff2', 'eb-garamond-400italic.woff2']) {
    const p = path.join(FONT_DIR, name);
    assert.ok(fs.existsSync(p), `Erwartet: ${p}`);
    assert.ok(fs.statSync(p).size > 1000, `${name} ist verdächtig klein`);
  }
});

test('Papierheft-Retro: theme-papier.css existiert und referenziert beide Font-Familien', () => {
  assert.ok(fs.existsSync(CSS_PATH), `Erwartet: ${CSS_PATH}`);
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /Unifraktur Maguntia/);
  assert.match(css, /EB Garamond/);
  assert.match(css, /\[data-theme="papier"\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/theme-papier.test.js`
Expected: FAIL — `theme-papier.css` does not exist yet (second test),
first test also fails until Task 1's files exist (if Task 1 ran already,
only the second test fails here).

- [ ] **Step 3: Commit the failing test**

```bash
git add app/js/theme-papier.test.js
git commit -m "test(theme-papier): Asset-Check für Fonts + theme-papier.css (rot)"
```

---

### Task 3: Create `app/css/theme-papier.css`

**Files:**
- Create: `app/css/theme-papier.css`

Structure mirrors `app/css/theme-candy.css` (light custom theme, no dark FX
canvas): header comment, `@font-face` block, `color-scheme`, token block,
paper background. `--font-heading`/`--font-body` are the two tokens nearly
every other stylesheet in the app already reads via `var(--font-heading)`/
`var(--font-body)` (confirmed: `theme-cmd.css:19-20` and `theme-silk.css:88-89`
already override these two tokens the same way) — overriding them here is
enough to retheme every heading/body-text element in the app automatically.

- [ ] **Step 1: Write the file**

```css
/* ===================================================================
   THEME-PAPIER.CSS – Papierheft-Retro: vergilbtes Pergament-Manuskript
   -------------------------------------------------------------------
   Wird von jeder HTML-Seite als eigenes <link>-Stylesheet DIREKT VOR
   themes.css geladen (dort liegen die geteilten Blöcke: #pmThemeFX-
   Basis, Modal-FX-Pause, prefers-reduced-motion, print).
   Diese Datei gehört EXKLUSIV dem Papierheft-Retro-Theme.

   Phase 1 (dieses File): Grundfläche + Typografie + Token-Remap.
   Buttons/Status-Chips, Federspitzen-Cursor, Eck-Curl-Umblättern beim
   Wochenwechsel, handgezeichnetes Logo und Sidebar-Icons im
   Gravur-Stil folgen als separate Phasen (siehe Spec-Dokument
   docs/superpowers/specs/2026-08-26-papierheft-retro-theme-design.md).

   Kein #pmThemeFX-Canvas, keine body::before/::after-Ambient-Animation
   – die Grundfläche ist bewusst statisch (Pergament altert nicht live).
   =================================================================== */

@font-face {
  font-family: 'Unifraktur Maguntia';
  src: url('../assets/fonts/unifraktur-maguntia.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'EB Garamond';
  src: url('../assets/fonts/eb-garamond-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'EB Garamond';
  src: url('../assets/fonts/eb-garamond-600.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'EB Garamond';
  src: url('../assets/fonts/eb-garamond-400italic.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}

html[data-theme="papier"] { color-scheme: light; }

/* ===================================================================
   1 · TOKEN-BLOCK – Sepia-Pergament + Indigo-Tinte
   =================================================================== */
[data-theme="papier"] {
  /* Typografie: Überschriften Blackletter, Fließtext klassischer Buchdruck */
  --font-heading: 'Unifraktur Maguntia', Georgia, 'Times New Roman', serif;
  --font-body:    'EB Garamond', Georgia, 'Times New Roman', serif;

  /* Akzent: Indigo-Tinte ersetzt das Marken-Gelb */
  --pm-yellow:          #2C3A5C;
  --pm-yellow-dark:     #22304C;
  --pm-yellow-darker:   #1C2740;
  --pm-yellow-light:    #4A5C8A;
  --pm-yellow-pale:     rgba(44, 58, 92, 0.22);
  --pm-yellow-bg:       rgba(44, 58, 92, 0.10);
  --on-yellow-text:     #F0E8D2;

  /* Status-Streifen "Tag fertig": gedämpftes Waldgrün statt neutralem Grün */
  --color-status-done:  #4E7D4E;

  /* Grau-Skala → warmes Sepia-Pergament (Karten = Papierton,
     dunkelster Wert 900 = tiefe Tinte für Headings/Strong-Text) */
  --pm-white:           #E9D9B3;   /* Karten / Modal / Form-Control = Papierton */
  --pm-grey-50:         #E3D1A5;   /* Body-Hintergrund, etwas dunkler */
  --pm-grey-100:        #DCC99C;   /* sub-surface / Hover-BG */
  --pm-grey-200:        #CBB583;   /* Default-Borders */
  --pm-grey-300:        #B9A06A;   /* stärkere Borders / Icons */
  --pm-grey-400:        #96835C;   /* Mute (≥ 4.5:1 auf Papierton) */
  --pm-grey-500:        #7A6B4A;   /* Sekundär-Text */
  --pm-grey-600:        #6B5436;   /* Sekundär-Text (emphasized) */
  --pm-grey-700:        #5A4429;   /* Body-Text */
  --pm-grey-800:        #4A3620;   /* Strong-Text */
  --pm-grey-900:        #3D2C14;   /* Headings, tiefste Tinte */

  /* Status-Tints als Overlays, passend zu den in der Spec entschiedenen
     Chip-Farben (Genehmigt=Waldgrün, Abgelehnt=Wachssiegel-Rot,
     Offen=Ocker/Braun); Info/Freigegeben aus der Indigo-Akzentfamilie
     abgeleitet (in der Spec nicht separat entschieden). */
  --color-success-light: rgba(60, 110, 60, 0.18);
  --color-error-light:   rgba(122, 42, 28, 0.20);
  --color-info-light:    rgba(44, 58, 92, 0.16);
  --color-warning-light: rgba(90, 70, 30, 0.18);
  --color-error-mid:     #7A2A1C;
  --color-info-mid:      #2C3A5C;
  --status-offen-bg:        rgba(90, 70, 30, 0.18);
  --status-freigegeben-bg:  rgba(44, 58, 92, 0.18);
  --status-genehmigt-bg:    rgba(60, 110, 60, 0.18);
  --status-abgelehnt-bg:    rgba(122, 42, 28, 0.20);

  /* Sepia-getönte Schatten statt neutralem Blauschwarz */
  --shadow-xs:  0 1px 2px rgba(90, 60, 20, 0.10);
  --shadow-sm:  0 1px 2px rgba(90, 60, 20, 0.10), 0 1px 3px rgba(90, 60, 20, 0.14);
  --shadow-md:  0 2px 4px rgba(90, 60, 20, 0.10), 0 4px 12px rgba(90, 60, 20, 0.16);
  --shadow-lg:  0 4px 8px rgba(90, 60, 20, 0.12), 0 12px 28px rgba(90, 60, 20, 0.20);
  --shadow-xl:  0 8px 16px rgba(90, 60, 20, 0.14), 0 24px 48px rgba(90, 60, 20, 0.26);
  --shadow-yellow:    0 4px 16px rgba(44, 58, 92, 0.28);
  --shadow-yellow-lg: 0 8px 32px rgba(44, 58, 92, 0.36);

  /* Inverse Surfaces / Topbar / Overlay */
  --sidebar-bg:           #3D2C14;
  --inverse-surface:      #3D2C14;
  --inverse-surface-soft: #4A3620;
  --inverse-surface-mid:  #5A4429;
  --topbar-bg-glass:      rgba(233, 217, 179, 0.85);
  --surface-overlay:      rgba(61, 44, 20, 0.40);

  /* Glass-Token (glass.css) – Pergament-getöntes Glas */
  --glass-bg:           rgba(233, 217, 179, 0.65);
  --glass-bg-strong:    rgba(233, 217, 179, 0.85);
  --glass-bg-tint:      rgba(220, 201, 156, 0.55);
  --glass-border:       rgba(185, 160, 106, 0.55);
  --glass-border-soft:  rgba(90, 60, 20, 0.10);
  --glass-highlight:    rgba(255, 248, 230, 0.55);
  --ambient-yellow:     rgba(44, 58, 92, 0.08);
  --ambient-yellow-2:   rgba(122, 42, 28, 0.05);
  --ambient-neutral:    rgba(122, 100, 60, 0.08);

  /* Liquid-Glass-Pill-Token (Floating Sidebar) */
  --lg-tint:           rgba(233, 217, 179, 0.62);
  --lg-tint-strong:    rgba(233, 217, 179, 0.85);
  --lg-tint-soft:      rgba(233, 217, 179, 0.42);
  --lg-tint-warm:      rgba(220, 201, 156, 0.50);
  --lg-sidebar:        rgba(61, 44, 20, 0.88);
  --lg-border:         rgba(185, 160, 106, 0.45);
  --lg-border-soft:    rgba(185, 160, 106, 0.22);
  --lg-edge:           rgba(0, 0, 0, 0.30);
  --lg-spec:           rgba(255, 248, 230, 0.35);
  --lg-spec-soft:      rgba(255, 248, 230, 0.14);
}

/* ===================================================================
   2 · GRUNDFLÄCHE – Sepia-Pergament, keine Karo-/Heftlinien
   -------------------------------------------------------------------
   Statische Textur (kein Animations-/FX-Layer nötig): mehrere radiale
   Alterungsflecken (Foxing) über einem Sepia-Gradient. Die Ambient-
   Pseudo-Layer aus glass.css (body::before/::after) bleiben für dieses
   Theme ungenutzt und werden ausgeblendet.
   =================================================================== */
[data-theme="papier"] body::before,
[data-theme="papier"] body::after {
  display: none;
}

[data-theme="papier"] body:not(.login-page) {
  background:
    radial-gradient(ellipse at 15% 20%, rgba(120, 80, 30, 0.10) 0%, transparent 35%),
    radial-gradient(ellipse at 80% 70%, rgba(120, 80, 30, 0.12) 0%, transparent 40%),
    radial-gradient(ellipse at 60% 15%, rgba(90, 60, 20, 0.08) 0%, transparent 30%),
    linear-gradient(180deg, #E9D9B3 0%, #E3D1A5 100%);
}
```

**Was Phase 1 bewusst NICHT enthält** (folgt in späteren Phasen, siehe
Spec-Dokument §5-§9): Button-Federstrich/-Rahmen, Status-Chip-Komponenten
(nur die Farb-Tokens sind hier gesetzt), Cursor, Curl-Canvas, Logo-Remap,
Sidebar-Icons im Gravur-Stil, Dashboard-Karten-Rotation.

- [ ] **Step 2: Run the asset test again**

Run: `node --test app/js/theme-papier.test.js`
Expected: beide Tests PASS (der zweite Test war der einzige, der noch rot
war — er prüft nur Existenz + Grundstruktur der Datei, nicht das visuelle
Ergebnis).

- [ ] **Step 3: Commit**

```bash
git add app/css/theme-papier.css
git commit -m "feat(theme-papier): Token-Block + Pergament-Grundfläche (Phase 1)"
```

---

### Task 4: Register `papier` in `theme.js`

**Files:**
- Modify: `app/js/theme.js:29`

- [ ] **Step 1: Extend `CUSTOM_THEMES`**

Current line 29:

```js
  var CUSTOM_THEMES = ['hyperspace', 'cmd', 'candy', 'silk', 'halloween', 'christmas'];
```

New:

```js
  var CUSTOM_THEMES = ['hyperspace', 'cmd', 'candy', 'silk', 'halloween', 'christmas', 'papier'];
```

`setCustom()`, `readStoredCustom()` and `apply()` all check membership in
this array generically (`CUSTOM_THEMES.indexOf(...)`) — no further code
change is needed in `theme.js` for Phase 1, since `papier` has no
`FX_TEMPLATES`/`FX_LOGIN_TEMPLATES` entry yet (added when the Curl-Canvas
phase implements one).

- [ ] **Step 2: Commit**

```bash
git add app/js/theme.js
git commit -m "feat(theme-papier): papier in CUSTOM_THEMES registrieren"
```

---

### Task 5: Register `papier` in `profil.js` (Theme-Picker UI)

**Files:**
- Modify: `app/js/profil.js:36-43`

- [ ] **Step 1: Add the entry**

Current (lines 36-43):

```js
  const THEME_DESIGNS = [
    { id: '',           name: 'Standard',   sub: 'Putzmeister-Design' },
    { id: 'silk',       name: 'Silk',       sub: 'Liquid Glass · futuristisch' },
    { id: 'cmd',        name: 'CMD',        sub: 'Terminal, Grün auf Schwarz' },
    { id: 'candy',      name: 'Candy Land', sub: 'Pastell & Regenbogen' },
    { id: 'halloween',  name: 'Halloween',  sub: 'Geisterhaus & Nebel' },
    { id: 'christmas',  name: 'Christmas',  sub: 'Verschneit & festlich' },
  ].filter(d => isDeveloper || !SEASONAL_DESIGNS.includes(d.id));
```

New:

```js
  const THEME_DESIGNS = [
    { id: '',           name: 'Standard',   sub: 'Putzmeister-Design' },
    { id: 'silk',       name: 'Silk',       sub: 'Liquid Glass · futuristisch' },
    { id: 'cmd',        name: 'CMD',        sub: 'Terminal, Grün auf Schwarz' },
    { id: 'candy',      name: 'Candy Land', sub: 'Pastell & Regenbogen' },
    { id: 'papier',     name: 'Papierheft', sub: 'Vergilbtes Pergament-Manuskript' },
    { id: 'halloween',  name: 'Halloween',  sub: 'Geisterhaus & Nebel' },
    { id: 'christmas',  name: 'Christmas',  sub: 'Verschneit & festlich' },
  ].filter(d => isDeveloper || !SEASONAL_DESIGNS.includes(d.id));
```

`papier` is **not** added to `SEASONAL_DESIGNS` (line 35) — per spec it's a
regular design, visible to Azubi + Developer like `candy`/`silk`, not
developer-only. The click-wiring (`document.querySelectorAll('[data-theme-design]')`,
`profil.js:132/155`) is generic over this array — no further change needed.

- [ ] **Step 2: Commit**

```bash
git add app/js/profil.js
git commit -m "feat(theme-papier): Papierheft im Theme-Picker (Profil) sichtbar machen"
```

---

### Task 6: Hide the light/dark toggle for `papier`

**Files:**
- Modify: `app/css/themes.css:79-85`

- [ ] **Step 1: Add `papier` to the sidebar-toggle-hide selector list**

Current (lines 79-85):

```css
html[data-theme="hyperspace"] .sidebar__theme-toggle,
html[data-theme="cmd"]        .sidebar__theme-toggle,
html[data-theme="candy"]      .sidebar__theme-toggle,
html[data-theme="christmas"]  .sidebar__theme-toggle,
html[data-skin]               .sidebar__theme-toggle {
  display: none !important;
}
```

New:

```css
html[data-theme="hyperspace"] .sidebar__theme-toggle,
html[data-theme="cmd"]        .sidebar__theme-toggle,
html[data-theme="candy"]      .sidebar__theme-toggle,
html[data-theme="christmas"]  .sidebar__theme-toggle,
html[data-theme="papier"]     .sidebar__theme-toggle,
html[data-skin]               .sidebar__theme-toggle {
  display: none !important;
}
```

(`halloween` is missing from this particular list already in the current
codebase — pre-existing, out of scope for this plan, not touched here.)

- [ ] **Step 2: Commit**

```bash
git add app/css/themes.css
git commit -m "feat(theme-papier): Hell/Dunkel-Toggle bei aktivem Papierheft-Theme ausblenden"
```

---

### Task 7: Load `theme-papier.css` on every page

**Files:**
- Modify (one identical one-line insertion each): `app/abteilungs-planer.html:27`,
  `app/abteilungsdurchlauf.html:28`, `app/abteilungsverwaltung.html:26`,
  `app/ausbildungsstand.html:26`, `app/berichtsheftverwaltung.html:26`,
  `app/beurteilung.html:22`, `app/beurteilungen.html:25`, `app/dashboard.html:28`,
  `app/dh-profil.html:27`, `app/fahrgelderstattung.html:27`,
  `app/fehlerberichte.html:26`, `app/ihk-archiv.html:26`, `app/index.html:24`,
  `app/jahresansicht.html:26`, `app/mitteilungen.html:26`,
  `app/nutzerverwaltung.html:26`, `app/profil.html:28`, `app/wochenansicht.html:32`

Every one of these 18 lines currently reads exactly:

```html
  <link rel="stylesheet" href="css/theme-christmas.css">
```

immediately followed on the next line by:

```html
  <link rel="stylesheet" href="css/themes.css">
```

- [ ] **Step 1: Insert the new stylesheet link on all 18 pages**

For each of the 18 files above, insert this line directly **after** the
`theme-christmas.css` line and **before** the `themes.css` line:

```html
  <link rel="stylesheet" href="css/theme-papier.css">
```

- [ ] **Step 2: Verify no page was missed**

Run:

```bash
grep -L "theme-papier.css" app/abteilungs-planer.html app/abteilungsdurchlauf.html app/abteilungsverwaltung.html app/ausbildungsstand.html app/berichtsheftverwaltung.html app/beurteilung.html app/beurteilungen.html app/dashboard.html app/dh-profil.html app/fahrgelderstattung.html app/fehlerberichte.html app/ihk-archiv.html app/index.html app/jahresansicht.html app/mitteilungen.html app/nutzerverwaltung.html app/profil.html app/wochenansicht.html
```

Expected: no output (empty — `-L` prints files that do **not** contain the
string; an empty result means all 18 now have it).

- [ ] **Step 3: Verify link order is still theme-papier.css → themes.css on every page**

Run:

```bash
grep -A1 "theme-papier.css" app/dashboard.html app/wochenansicht.html app/profil.html
```

Expected: each pair of lines shows `theme-papier.css` immediately followed
by `themes.css`.

- [ ] **Step 4: Commit**

```bash
git add app/abteilungs-planer.html app/abteilungsdurchlauf.html app/abteilungsverwaltung.html app/ausbildungsstand.html app/berichtsheftverwaltung.html app/beurteilung.html app/beurteilungen.html app/dashboard.html app/dh-profil.html app/fahrgelderstattung.html app/fehlerberichte.html app/ihk-archiv.html app/index.html app/jahresansicht.html app/mitteilungen.html app/nutzerverwaltung.html app/profil.html app/wochenansicht.html
git commit -m "feat(theme-papier): theme-papier.css auf allen 18 Seiten einbinden"
```

---

### Task 8: Manual visual verification (no automated visual test infra exists)

**Files:** none (verification only — fixes, if any, land as amendments to
Task 3's/Task 6's files, re-committed with `git commit --amend` or a small
follow-up commit).

The project has no visual-regression test suite (confirmed: `node:test`
only covers logic/asset-presence). Sidebar text color in particular is a
known trap in this codebase — the default `.sidebar__link { color:
var(--pm-grey-700); }` (glass.css) is legible or illegible **depending on
what the theme's `--sidebar-bg`/`--lg-sidebar` tokens are**, and other
custom themes handle this per-theme (see `[data-theme="dark"] .sidebar__link`
in glass.css:1202 for the pattern). This step exists specifically to catch
that class of bug before merging.

- [ ] **Step 1: Start the dev server**

Run: `cd backend && npm run dev` (uses `node --watch server.js`, so later
edits in this task are picked up without a manual restart — a plain `node
server.js` would need restarting after each fix).

- [ ] **Step 2: Open the app and switch to the Papierheft theme**

Open `http://localhost:3000` in a real browser (Edge/Chrome — not just a
static file preview, session/auth is required), log in, go to **Profil →
Darstellung & Themes**, click the **Papierheft** tile.

- [ ] **Step 3: Check each of these points, note any that fail**

  - Body background is sepia parchment with visible (subtle) foxing spots,
    not a flat single color and not the old light-theme white.
  - Headings render in the Blackletter typeface (visibly different from
    body text, not falling back to a system serif — if it looks like plain
    Georgia everywhere, the `@font-face` failed to load; check DevTools
    Network tab for a 404 on the `.woff2` files).
  - Body text (e.g. paragraph copy, table cells) renders in EB Garamond,
    not falling back to a sans-serif.
  - Cards/modals/form controls show the parchment `--pm-white` tone, not
    white.
  - **Sidebar nav-link text is legible against the sidebar background** —
    this is the specific risk called out above. If link text is invisible
    or near-invisible against `--sidebar-bg`/`--lg-sidebar`, add an
    explicit override to `theme-papier.css`:

    ```css
    [data-theme="papier"] .sidebar__link { color: #E9D9B3; }
    [data-theme="papier"] .sidebar__link:hover { color: #FFFFFF; }
    [data-theme="papier"] .sidebar__link.active { color: var(--pm-yellow); }
    ```

    (Exact selector/values to be confirmed against what's actually
    rendered — the snippet above is the fallback fix, not a guess to apply
    blindly if the sidebar already reads fine.)
  - Status chips/badges elsewhere in the app (e.g. Dashboard "Genehmigt"/
    "Offen" indicators) pick up the new sepia/green/red tint instead of the
    old blue/grey ones.
  - No console errors in DevTools related to `theme-papier.css` or the
    font files.

- [ ] **Step 4: If any fix was needed, commit it**

```bash
git add app/css/theme-papier.css
git commit -m "fix(theme-papier): Sidebar-Text-Kontrast nach visueller Prüfung"
```

(Skip this commit if Step 3 found nothing to fix.)

---

## Self-Review Notes

- **Spec coverage:** This plan covers Spec §3 (Grundfläche), §4 (Typografie)
  and the registration/scope portions of §2/§10 (Rollen-Gating, kein Dark
  Mode — achieved simply by never adding a `[data-theme="papier"][data-theme="dark"]`
  combination, and there's no toggle to trigger one after Task 6). It
  explicitly does NOT cover §5 (Tinte/Buttons/Status-Komponenten — only the
  color *tokens* are set here, not button/chip markup+CSS), §6 (Cursor),
  §7 (Umblättern), §8 (Logo/Icons), §9 (Dashboard-Karten-Rotation) — those
  are separate follow-up plans per the phased approach agreed with the user.
- **Type/name consistency:** `papier` used consistently as the theme id
  across `CUSTOM_THEMES`, `THEME_DESIGNS`, all CSS selectors, and the test
  file. Font family names (`'Unifraktur Maguntia'`, `'EB Garamond'`) match
  between the `@font-face` declarations and the `--font-heading`/
  `--font-body` token values.
- **No placeholders:** every step has literal file paths, literal code, and
  literal shell commands with expected output.
