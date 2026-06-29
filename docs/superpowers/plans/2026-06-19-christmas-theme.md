# Christmas-Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein dunkles, festliches Custom-Design „Christmas" mit verschneiter Winterszene, wind-getragenem Schneefall (dicke Flocken), leuchtenden Baumlichtern und weihnachtlicher Deko (Logo-Mütze, Button-Schnee, Lichterkette).

**Architecture:** Strukturell ein Zwilling des Halloween-Themes. Eine neue `theme-christmas.css` scoped alle Regeln unter `[data-theme="christmas"]` (dunkler Token-Kipp + Rot-Akzent + translucente Surfaces). Die Hintergrundszene liegt im von `theme.js` verwalteten `#pmThemeFX`-Layer (Bild + Glow-Punkte + Schnee-`<canvas>`). Eine neue Canvas-Engine `PMChristmasSnow` (geklont aus `PMIcelandFX`) rendert den Schnee. Registrierung an 3 Stellen (`theme.js` `CUSTOM_THEMES` + `FX_TEMPLATES`, `profil.js` `THEME_DESIGNS`) + `<link>` in 9 HTML-Seiten + geteilte Selektorlisten in `themes.css`.

**Tech Stack:** Vanilla JS (ES5-Stil wie theme.js), CSS Custom Properties, Canvas 2D, kein Build-Step. Verifikation visuell via lokalem Backend (`node server.js`, Port 3000) + npx-Playwright/Edge.

## Global Constraints

- Alle neuen CSS-Regeln MÜSSEN unter `[data-theme="christmas"]` gescoped sein. Das Standard-Theme (light/dark) und andere Custom-Themes dürfen sich um KEIN Pixel ändern.
- `theme.js` ist ES5-Stil (`var`, `function`, IIFE-Module). Neuen Code im gleichen Stil schreiben (kein `let`/`const`/Arrow in theme.js).
- IDs sind GUID-Strings — hier nicht relevant (kein Datenmodell betroffen).
- Akzentfarbe: Weihnachts-Rot `#C8102E` (ersetzt `--pm-yellow`); Grün `#1E7B3C` als sekundärer Glow-Akzent.
- Hintergrundbild liegt unter `app/assets/backgrounds/Christmas Background.jpeg` — in `url()` IMMER gequotet referenzieren (Leerzeichen im Namen): `url("../assets/backgrounds/Christmas Background.jpeg")`.
- Canvas-Engine-Konventionen (wie alle bestehenden FX-Engines): `prefers-reduced-motion` → Standbild statt Loop; Pause bei verstecktem Tab / offenem Modal (`.modal-overlay.open`); `start()`/`stop()` idempotent.
- Nach JEDER sichtbaren Änderung: harter Reload (Strg+F5) — SPA-Router lädt CSS/JS bei Sidebar-Navigation NICHT neu.
- Custom-Themes sind ein reines Azubi-Feature (Theme-Picker nur für Azubi sichtbar) — zum Testen mit einem Azubi-Account anmelden.

---

## File Structure

- **Create:** `app/css/theme-christmas.css` — gesamtes Christmas-Styling (Token-Block, Szene-Layer, Dark-Mirror, Deko). Exklusiv diesem Theme.
- **Create:** `app/assets/santa-hat.svg` — transparente Santa-Mütze (Overlay-Asset für Logo + Button).
- **Modify:** `app/js/theme.js` — `CUSTOM_THEMES`, `FX_TEMPLATES.christmas`, neue `PMChristmasSnow`-Engine, `ensureThemeFX`-Verdrahtung (start/stop).
- **Modify:** `app/js/profil.js` — `THEME_DESIGNS`-Eintrag.
- **Modify:** `app/css/profil.css` — `.theme-tile__swatch--christmas`.
- **Modify:** `app/css/themes.css` — christmas in 4 geteilte Selektorlisten.
- **Modify:** 9 HTML-Seiten — `<link>` auf `theme-christmas.css` direkt vor `themes.css`.

---

## Task 1: Theme registrieren + dunkler Token-Block (auswählbar & lesbar)

Ziel: „Christmas" erscheint im Profil-Picker, lässt sich aktivieren, und die App kippt auf eine lesbare dunkle Rot-Palette (noch ohne Szene/Deko).

**Files:**
- Create: `app/css/theme-christmas.css`
- Modify: `app/js/theme.js` (Zeile 29: `CUSTOM_THEMES`)
- Modify: `app/js/profil.js` (Zeile 125–133: `THEME_DESIGNS`)
- Modify: `app/css/profil.css` (neuer Swatch)
- Modify: `app/css/themes.css` (4 Selektorlisten)
- Modify: 9 HTML-Seiten (`<link>`)

**Interfaces:**
- Produces: Selektor-Scope `[data-theme="christmas"]`; localStorage-Wert `customTheme="christmas"`; CSS-Klasse `.pm-xm-bg`, `.pm-xm-snow`, `.pm-xm-treeglow` (in späteren Tasks gestylt).

- [ ] **Step 1: `theme-christmas.css` mit Token-Block anlegen**

Create `app/css/theme-christmas.css`. Token-Werte aus `theme-halloween.css` (dunkle Basis) übernehmen, Akzent auf Rot, Grau-Skala auf kühles Blau-Nacht. Vollständiger Startinhalt:

```css
/* ===================================================================
   THEME-CHRISTMAS.CSS – „Verschneite Winternacht", dunkel, Weihnachts-Rot
   -------------------------------------------------------------------
   Wird von jeder HTML-Seite als eigenes <link>-Stylesheet DIREKT VOR
   themes.css geladen. Gehört EXKLUSIV dem Christmas-Designer.
   Szene (FX-Layer #pmThemeFX, Template "christmas" in js/theme.js):
   Winterbild (assets/backgrounds/Christmas Background.jpeg) + pulsierende
   Baum-Licht-Glows + <canvas> Schneefall (Engine PMChristmasSnow).
   =================================================================== */
html[data-theme="christmas"] { color-scheme: dark; }

[data-theme="christmas"] {
  /* Akzent: Weihnachts-Rot ersetzt Brand-Gelb */
  --pm-yellow:        #C8102E;
  --pm-yellow-dark:   #E2384F;   /* heller in Dark – Hover */
  --pm-yellow-darker: #C8102E;
  --pm-yellow-light:  #F2667A;
  --pm-yellow-pale:   rgba(200, 16, 46, 0.24);
  --pm-yellow-bg:     rgba(200, 16, 46, 0.14);
  --on-yellow-text:   #FFFFFF;   /* weiß auf Rot */

  /* Grau-Skala → kühles Blau-Nacht (Karten heller als Body), Surfaces
     translucent, damit die Szene durchscheint; Alpha hoch genug für Text. */
  --pm-white:    rgba(24, 34, 52, 0.88);
  --pm-grey-50:  rgba(10, 16, 28, 0.72);
  --pm-grey-100: rgba(96, 120, 160, 0.26);
  --pm-grey-200: #2A3852;
  --pm-grey-300: #3D506E;
  --pm-grey-400: #8FA2C0;
  --pm-grey-500: #AEBFD8;
  --pm-grey-600: #C9D6E8;
  --pm-grey-700: #DEE7F4;
  --pm-grey-800: #EDF2FA;
  --pm-grey-900: #F8FBFF;

  /* Status-Tints als Overlays (wie Dark-Mode) */
  --color-success-light: rgba(67, 168, 86, 0.18);
  --color-error-light:   rgba(229, 57, 53, 0.20);
  --color-info-light:    rgba(25, 118, 210, 0.22);
  --color-warning-light: rgba(244, 81, 30, 0.20);
  --color-error-mid:     #FF7A6B;
  --color-info-mid:      #69B6F2;
  --status-offen-bg:        rgba(150, 165, 195, 0.18);
  --status-freigegeben-bg:  rgba(25, 118, 210, 0.24);
  --status-genehmigt-bg:    rgba(67, 168, 86, 0.20);
  --status-abgelehnt-bg:    rgba(229, 57, 53, 0.24);

  /* Schatten tief; Akzent-Glow rot, sekundär grün */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.50);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.55);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.45), 0 6px 14px rgba(0, 0, 0, 0.55);
  --shadow-lg: 0 4px 10px rgba(0, 0, 0, 0.50), 0 14px 28px rgba(0, 0, 0, 0.58);
  --shadow-xl: 0 8px 16px rgba(0, 0, 0, 0.55), 0 24px 48px rgba(0, 0, 0, 0.68);
  --shadow-yellow:    0 4px 18px rgba(200, 16, 46, 0.40), 0 0 26px rgba(30, 123, 60, 0.24);
  --shadow-yellow-lg: 0 8px 34px rgba(200, 16, 46, 0.48), 0 0 44px rgba(30, 123, 60, 0.28);
  --ring-yellow:    0 0 0 3px rgba(200, 16, 46, 0.36), 0 0 18px rgba(200, 16, 46, 0.40);
  --ring-yellow-sm: 0 0 0 2px rgba(200, 16, 46, 0.32), 0 0 12px rgba(200, 16, 46, 0.34);
  --ring-error:     0 0 0 3px rgba(229, 57, 53, 0.32);
  --ring-info:      0 0 0 3px rgba(25, 118, 210, 0.30);

  /* Inverse Surfaces / Topbar / Overlay */
  --sidebar-bg:           #0C1422;
  --inverse-surface:      #0C1422;
  --inverse-surface-soft: #16202F;
  --inverse-surface-mid:  #1F2C3F;
  --topbar-bg-glass:      rgba(12, 20, 34, 0.80);
  --surface-overlay:      rgba(4, 8, 16, 0.62);

  /* Glass-Token (glass.css) – dunkles, kühles Glas */
  --glass-bg:          rgba(22, 32, 50, 0.55);
  --glass-bg-strong:   rgba(22, 32, 50, 0.82);
  --glass-bg-tint:     rgba(22, 60, 40, 0.36);
  --glass-border:      rgba(170, 200, 230, 0.16);
  --glass-border-soft: rgba(170, 200, 230, 0.08);
  --glass-highlight:   rgba(200, 222, 255, 0.12);
  --glass-shadow:      0 1px 0 rgba(200, 222, 255, 0.08) inset,
                       0 -1px 0 rgba(0, 0, 0, 0.40) inset,
                       0 14px 36px rgba(0, 0, 0, 0.52),
                       0 2px 8px rgba(0, 0, 0, 0.42);
  --ambient-yellow:    rgba(200, 16, 46, 0.10);
  --ambient-yellow-2:  rgba(30, 123, 60, 0.07);
  --ambient-neutral:   rgba(120, 150, 190, 0.07);

  /* App-Hintergrund AUS – die Szene (#pmThemeFX) übernimmt. */
  --app-bg-image:     none;
  --app-bg-overlay:   none;
  --app-bg-vignette:  none;
  --sidebar-bg-image: linear-gradient(180deg, rgba(18, 28, 46, 0.82) 0%, rgba(8, 14, 26, 0.90) 100%);
  --sidebar-glass:      rgba(14, 22, 38, 0.74);
  --sidebar-glass-deep: rgba(8, 14, 26, 0.90);
  --sidebar-line:       rgba(200, 16, 46, 0.32);

  /* Liquid-Glass-Pill-Token (Floating Sidebar) */
  --lg-tint:        rgba(22, 32, 50, 0.62);
  --lg-tint-strong: rgba(28, 40, 60, 0.82);
  --lg-tint-soft:   rgba(22, 32, 50, 0.42);
  --lg-tint-warm:   rgba(22, 60, 40, 0.42);
  --lg-sidebar:     rgba(12, 20, 34, 0.76);
  --lg-border:      rgba(170, 200, 230, 0.16);
}
```

- [ ] **Step 2: `christmas` in `CUSTOM_THEMES` aufnehmen (theme.js)**

In `app/js/theme.js` Zeile 29:

```javascript
  var CUSTOM_THEMES = ['hyperspace', 'cmd', 'candy', 'iceland', 'silk', 'halloween', 'christmas'];
```

- [ ] **Step 3: Picker-Eintrag in `THEME_DESIGNS` (profil.js)**

In `app/js/profil.js` nach dem halloween-Eintrag (Zeile 132) ergänzen:

```javascript
    { id: 'christmas',  name: 'Christmas',  sub: 'Verschneit & festlich' },
```

- [ ] **Step 4: Swatch im Picker (profil.css)**

Eine bestehende `.theme-tile__swatch--halloween`-Regel in `app/css/profil.css` als Vorlage suchen (`grep -n "theme-tile__swatch--halloween" app/css/profil.css`) und direkt daneben ergänzen:

```css
.theme-tile__swatch--christmas {
  background: linear-gradient(135deg, #0C1422 0%, #C8102E 55%, #1E7B3C 100%);
}
```

- [ ] **Step 5: christmas in die 4 geteilten Selektorlisten (themes.css)**

In `app/css/themes.css`:
- Sidebar-Toggle ausblenden (Block bei Zeile ~80): `html[data-theme="christmas"] .sidebar__theme-toggle,` zur Liste hinzufügen (vor `html[data-skin]`).
- Modal-FX-Pause (Block bei Zeile ~102): `[data-theme="christmas"] body:has(.modal-overlay.open)::before,` und `…::after,` ergänzen.
- `@media (prefers-reduced-motion: reduce)` (Block bei Zeile ~118): `[data-theme="christmas"] body::before,` und `…::after,` ergänzen.
- `@media print` (Block bei Zeile ~141): `[data-theme="christmas"] body::before, [data-theme="christmas"] body::after,` ergänzen.

- [ ] **Step 6: `<link>` in alle 9 HTML-Seiten**

In jeder Seite direkt VOR der `themes.css`-Zeile die christmas-Zeile einfügen (nach `theme-halloween.css`). Beispiel dashboard.html (Zeile 26/27):

```html
  <link rel="stylesheet" href="css/theme-halloween.css">
  <link rel="stylesheet" href="css/theme-christmas.css">
  <link rel="stylesheet" href="css/themes.css">
```

Seiten: `ausbildungsstand.html`, `azubi-planer.html`, `berichtsheftverwaltung.html`, `dashboard.html`, `fahrgelderstattung.html`, `index.html`, `jahresansicht.html`, `profil.html`, `wochenansicht.html`. (Pfad in index.html prüfen — gleiche `css/`-Basis.)

Verifikation der Vollständigkeit:

Run: `grep -L "theme-christmas.css" app/ausbildungsstand.html app/azubi-planer.html app/berichtsheftverwaltung.html app/dashboard.html app/fahrgelderstattung.html app/index.html app/jahresansicht.html app/profil.html app/wochenansicht.html`
Expected: keine Ausgabe (alle Seiten enthalten den Link).

- [ ] **Step 7: Visuell verifizieren (Backend + Playwright/Edge)**

Backend starten (`node server.js`, Port 3000), als Azubi anmelden, Profil → „Darstellung & Themes" → Kachel „Christmas" klicken. Auf Dashboard navigieren, Strg+F5.
Erwartet: App in dunkler blau-nacht Palette, rote Akzente (Buttons/aktive Nav), Text überall lesbar (keine hellgrauen-auf-hell-Reste). Noch KEIN Bild/Schnee — nur Palette.

- [ ] **Step 8: Commit**

```bash
git add app/css/theme-christmas.css app/js/theme.js app/js/profil.js app/css/profil.css app/css/themes.css app/*.html
git commit -m "feat(theme): Christmas-Theme registrieren + dunkler Token-Block"
```

---

## Task 2: Hintergrundszene (Bild) + Dark-Mode-Komponenten-Spiegelblock

Ziel: Das Winterbild erscheint als App-Hintergrund über `#pmThemeFX`; Komponenten, die hart an `[data-theme="dark"]` hängen, werden gespiegelt (sonst laufen sie mit Light-Werten).

**Files:**
- Modify: `app/js/theme.js` (`FX_TEMPLATES`)
- Modify: `app/css/theme-christmas.css` (Szene-Layer + Mirror-Block)

**Interfaces:**
- Consumes: Scope `[data-theme="christmas"]`, `#pmThemeFX`-Container (von `ensureThemeFX` injiziert).
- Produces: DOM-Layer `.pm-xm-bg`, `.pm-xm-snow`, `.pm-xm-treeglow--1..3` als Kinder von `#pmThemeFX` (Snow-/Glow-Styling folgt in Task 3/4).

- [ ] **Step 1: `FX_TEMPLATES.christmas` definieren (theme.js)**

In `app/js/theme.js` im `FX_TEMPLATES`-Objekt nach dem `halloween`-Eintrag (vor der schließenden `}` bei Zeile ~211) ergänzen — Komma nach dem halloween-Block beachten:

```javascript
,
    /* ── FX-Template: christmas ──
       Basis = Winterbild (.pm-xm-bg → assets/backgrounds/Christmas Background.jpeg).
       Darüber: pulsierende Glows über den Baumlichtern + Hütten-Fenster
       (.pm-xm-treeglow, mix-blend-mode:screen) und ein <canvas class="pm-xm-snow">
       mit wind-getragenem Schneefall (Engine PMChristmasSnow, start/stop am
       FX-Lebenszyklus). Styling in css/theme-christmas.css. */
    christmas:
      '<div class="pm-xm-bg"></div>' +
      '<div class="pm-xm-treeglow pm-xm-treeglow--1"></div>' +
      '<div class="pm-xm-treeglow pm-xm-treeglow--2"></div>' +
      '<div class="pm-xm-treeglow pm-xm-treeglow--3"></div>' +
      '<canvas class="pm-xm-snow" aria-hidden="true"></canvas>'
```

- [ ] **Step 2: Szene-Layer stylen (theme-christmas.css)**

Ans Ende von `app/css/theme-christmas.css` anfügen:

```css
/* ===================================================================
   SZENE (#pmThemeFX-Kinder)
   =================================================================== */
[data-theme="christmas"] #pmThemeFX { background: #0A1019; }

[data-theme="christmas"] .pm-xm-bg {
  position: fixed; inset: 0; z-index: 0;
  background: center / cover no-repeat
    url("../assets/backgrounds/Christmas Background.jpeg");
}
/* Dezenter Abdunkel-Overlay für Lesbarkeit über dem hellen Himmel */
[data-theme="christmas"] .pm-xm-bg::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,14,26,0.30) 0%, rgba(8,14,26,0.55) 100%);
}
[data-theme="christmas"] .pm-xm-snow {
  position: fixed; inset: 0; z-index: 2; pointer-events: none;
}
```

- [ ] **Step 3: Dark-Mode-Komponenten-Spiegelblock**

Den halloween-Spiegelblock als Vorlage extrahieren und für christmas anlegen. Befehl zum Auffinden aller dark-gespiegelten Regeln in halloween:

Run: `grep -n "data-theme=\"halloween\"" app/css/theme-halloween.css`

Jede dort gespiegelte Komponenten-Regel (Sidebar-Hover, Karten-Borders, Toast, Badges, `.profil-logout`, Time-Spinner etc. — der Block ab dem Token-Block bis zum Logo-Abschnitt) nach `theme-christmas.css` kopieren, dabei `halloween` → `christmas` ersetzen und Akzent-/Flächenfarben auf die Christmas-Palette (Rot/Blau-Nacht) anpassen. Logo-/Avatar-Abschnitte (halloween Abschnitt 7/8) NICHT mitkopieren — die kommen in Task 5.

Praktischer Ansatz: Block per `sed` vorbereiten, dann Farben manuell angleichen:

```bash
sed -n '/^\[data-theme="halloween"\]/,/7 · PUTZMEISTER-LOGO/p' app/css/theme-halloween.css \
  | sed 's/halloween/christmas/g' > /tmp/xm-mirror.css
```

Inhalt von `/tmp/xm-mirror.css` sichten, Orange-Werte (`#FF7518` etc.) auf Rot `#C8102E` / Grün-Glow angleichen, dann in `theme-christmas.css` einfügen.

- [ ] **Step 4: Visuell verifizieren**

Backend läuft, Christmas aktiv, Strg+F5 auf Dashboard.
Erwartet: Winterbild als Hintergrund sichtbar (Karten/Toolbar scheinen translucent darüber), Sidebar/Toast/Badges/Karten-Borders korrekt dunkel gestylt (keine Light-Reste). Noch kein Schnee/Glühen.

- [ ] **Step 5: Commit**

```bash
git add app/js/theme.js app/css/theme-christmas.css
git commit -m "feat(theme/christmas): Hintergrundbild-Szene + Dark-Mode-Spiegelblock"
```

---

## Task 3: Schnee-Engine `PMChristmasSnow` (dicke, wind-getragene Flocken)

Ziel: Ein transparentes `<canvas>` über dem Bild rendert wenige, große, weiche Flocken, die mit starkem Seitenwind + Sway über den Schirm driften.

**Files:**
- Modify: `app/js/theme.js` (neue IIFE-Engine + `ensureThemeFX`-Verdrahtung)

**Interfaces:**
- Consumes: `el.querySelector('.pm-xm-snow')` (Canvas aus FX-Template, Task 2).
- Produces: globales (Modul-internes) `PMChristmasSnow` mit `start(canvas)` / `stop()` (idempotent).

- [ ] **Step 1: `PMChristmasSnow`-IIFE einfügen (theme.js)**

Direkt NACH dem `PMHalloweenFog`-Modul (nach dessen `})();` bei Zeile ~1019) einfügen:

```javascript
  /* ── Christmas-FX: Canvas-Schneefall-Engine ───────────────────────
     Wind-getragene, DICKE Flocken in geringer Dichte (leicht). Anders als
     PMIcelandFX (opakes Schnee-Sturm-Bild) zeichnet diese Engine auf ein
     TRANSPARENTES Canvas ÜBER dem Winterbild (.pm-xm-bg). Starker
     horizontaler Wind mit Böen + per-Flocke-Sway → Flocken treiben seitlich
     statt senkrecht zu fallen. Konventionen wie die übrigen Engines:
       • prefers-reduced-motion → statisches Standbild, kein Loop
       • verstecktes Tab / offenes Modal → Loop pausiert (GPU sparen). */
  var PMChristmasSnow = (function () {
    var WIND = 1.4;            // Grund-Seitenwind (px/Frame bei intensity 1)
    var COUNT_DIVISOR = 26000; // Fläche/Divisor = Flockenzahl (gering = leicht)
    var MAX_FLAKES = 90;

    var reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var SPRITE = null;
    function makeFlakeSprite(size) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var x = c.getContext('2d'), r = size / 2;
      var g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0,   'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.8, 'rgba(235,244,255,0.35)');
      g.addColorStop(1,   'rgba(235,244,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill();
      return c;
    }
    function ensureSprite() { if (!SPRITE) SPRITE = makeFlakeSprite(64); }

    var canvas = null, ctx = null;
    var raf = 0, running = false;
    var W = 0, H = 0, DPR = 1, last = 0, windT = 0;
    var flakes = [];

    function makeFlake() {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() * 10 + 8,        // 8–18px: dicke Flocken
        speed: Math.random() * 0.5 + 0.35, // langsames Sinken (leicht)
        drift: Math.random() * 0.7 + 0.5,  // Empfindlichkeit für Wind
        sway: Math.random() * 6.28,
        swaySpeed: Math.random() * 0.02 + 0.008,
        swayAmp: Math.random() * 1.2 + 0.6,
        alpha: Math.random() * 0.4 + 0.55
      };
    }
    function rebuild() {
      var n = Math.min(MAX_FLAKES, Math.max(20, Math.round((W * H) / COUNT_DIVISOR)));
      flakes.length = 0;
      for (var i = 0; i < n; i++) flakes.push(makeFlake());
    }

    function resize() {
      if (!canvas || !ctx) return;
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      rebuild();
      if (reduceMotion) renderOnce();
    }

    function windAt(t) {
      var gust = Math.sin(t * 0.0005) * 0.5 + Math.sin(t * 0.0013 + 1.7) * 0.3;
      return WIND * (1 + gust);
    }
    function recycle(f) {
      if (f.y > H + f.s) { f.y = -f.s; f.x = Math.random() * W; }
      if (f.x > W + f.s) f.x -= W + f.s * 2;
      if (f.x < -f.s)    f.x += W + f.s * 2;
    }
    function renderOnce() {
      ctx.clearRect(0, 0, W, H);
      var wind = windAt(windT);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        ctx.globalAlpha = f.alpha;
        ctx.drawImage(SPRITE, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
      return wind;
    }

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
      var wind = windAt(windT);
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.sway += f.swaySpeed;
        f.x += wind * f.drift + Math.sin(f.sway) * f.swayAmp;
        f.y += f.speed;
        recycle(f);
        ctx.globalAlpha = f.alpha;
        ctx.drawImage(SPRITE, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function start(cv) {
      stop();
      if (!cv) return;
      canvas = cv;
      ctx = canvas.getContext('2d');   // transparent über dem Bild
      if (!ctx) { canvas = null; return; }
      ensureSprite();
      resize();
      window.addEventListener('resize', resize);
      if (reduceMotion) return;        // Standbild, kein Loop
      running = true;
      last = (window.performance && performance.now) ? performance.now() : 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      window.removeEventListener('resize', resize);
      flakes.length = 0;
      canvas = null; ctx = null;
    }

    return { start: start, stop: stop };
  })();
```

- [ ] **Step 2: Teardown verdrahten (ensureThemeFX)**

In `app/js/theme.js` im `ensureThemeFX`-Teardown-Block (bei Zeile ~1088, wo `PMIcelandFX.stop(); … PMHalloweenFog.stop();` stehen) ergänzen:

```javascript
    PMChristmasSnow.stop();
```

- [ ] **Step 3: Start verdrahten (ensureThemeFX)**

Im `else if`-Block (bei Zeile ~1120, nach dem `halloween`-Zweig) ergänzen:

```javascript
    } else if (theme === 'christmas') {
      var snowCanvas = el.querySelector('.pm-xm-snow');
      if (snowCanvas) PMChristmasSnow.start(snowCanvas);
    }
```

- [ ] **Step 4: Visuell verifizieren**

Christmas aktiv, Strg+F5.
Erwartet: Wenige, große, weiche Flocken treiben deutlich seitlich (Wind) über das Bild, leichte Dichte, kein dichter Schneesturm. Theme-Wechsel weg & zurück → kein Doppel-Loop (Flockenzahl bleibt konstant). DevTools → „Emulate prefers-reduced-motion: reduce" + Reload → Flocken stehen still.

- [ ] **Step 5: Commit**

```bash
git add app/js/theme.js
git commit -m "feat(theme/christmas): PMChristmasSnow – wind-getragene dicke Flocken"
```

---

## Task 4: Glühen der Baum-Lichter

Ziel: Sanft pulsierende, mehrfarbige Glow-Punkte über den Lichtern des Weihnachtsbaums (oben rechts im Bild) + ein warmer Fenster-Glow an der Hütte.

**Files:**
- Modify: `app/css/theme-christmas.css`

**Interfaces:**
- Consumes: `.pm-xm-treeglow--1..3` (DOM-Layer aus FX-Template, Task 2).

- [ ] **Step 1: Glow-Layer + Keyframes stylen (theme-christmas.css)**

Ans Ende von `theme-christmas.css` anfügen. Positionen sind Startwerte (Baum oben rechts) — in Step 2 visuell feinjustieren:

```css
/* ===================================================================
   BAUM-LICHTER – pulsierendes Glühen (mix-blend-mode: screen)
   Positionen relativ zum Viewport; an die Lage des Baums im Bild getunt
   (oben rechts). Feintuning per Augenmaß im Browser.
   =================================================================== */
[data-theme="christmas"] .pm-xm-treeglow {
  position: fixed; z-index: 1; pointer-events: none;
  border-radius: 50%; mix-blend-mode: screen; filter: blur(6px);
  will-change: opacity, transform;
}
[data-theme="christmas"] .pm-xm-treeglow--1 {
  top: 12%; right: 6%; width: 16vw; height: 26vh;
  background: radial-gradient(circle, rgba(255,210,120,0.55) 0%, rgba(255,170,60,0) 70%);
  animation: pm-xm-twinkle 3.1s ease-in-out infinite;
}
[data-theme="christmas"] .pm-xm-treeglow--2 {
  top: 20%; right: 9%; width: 10vw; height: 16vh;
  background: radial-gradient(circle, rgba(120,200,255,0.5) 0%, rgba(80,150,255,0) 70%);
  animation: pm-xm-twinkle 2.3s ease-in-out infinite 0.6s;
}
[data-theme="christmas"] .pm-xm-treeglow--3 {
  top: 8%; right: 3%; width: 8vw; height: 12vh;
  background: radial-gradient(circle, rgba(255,120,140,0.5) 0%, rgba(255,80,110,0) 70%);
  animation: pm-xm-twinkle 3.7s ease-in-out infinite 1.2s;
}
@keyframes pm-xm-twinkle {
  0%, 100% { opacity: 0.35; transform: scale(0.95); }
  50%      { opacity: 0.95; transform: scale(1.05); }
}
```

- [ ] **Step 2: Position visuell feinjustieren**

Christmas aktiv, Strg+F5. Die drei Glows müssen ÜBER den sichtbaren Baumlichtern (oben rechts) sitzen. `top`/`right`/`width`/`height` der drei `--1..3`-Regeln per DevTools anpassen, bis sie über den Lichtern liegen, dann Werte in die CSS-Datei übernehmen.
Erwartet: Baum wirkt, als würden seine Lichter sanft funkeln; Glühen liegt hinter dem App-Inhalt (z-index 1 < .app-shell z-index 1 → prüfen, dass Inhalt nicht überstrahlt wird; ggf. Glows nur im rechten Randbereich, wo kein Content liegt).

- [ ] **Step 3: reduced-motion verifizieren**

DevTools → reduced-motion: reduce + Reload.
Erwartet: Glows stehen still (Animation via `themes.css`-Sammelblock aus, da `#pmThemeFX *` dort abgedeckt — verifizieren).

- [ ] **Step 4: Commit**

```bash
git add app/css/theme-christmas.css
git commit -m "feat(theme/christmas): pulsierendes Glühen der Baumlichter"
```

---

## Task 5: Santa-Mütze auf dem Logo

Ziel: Eine transparente Santa-Mütze liegt schräg auf dem Putzmeister-Logo (Sidebar + Login). Original-Logo bleibt unverändert; die Mütze ist ein Overlay auf dem WRAPPER (Pseudo-Elemente rendern nicht auf `<img>`).

**Files:**
- Create: `app/assets/santa-hat.svg`
- Modify: `app/css/theme-christmas.css`

**Interfaces:**
- Consumes: `.sidebar__logo-wrap` (div, enthält `.sidebar__logo-mark` img); `.login-card__ident` (flex-Zeile, enthält `.login-card__mark` img).
- Produces: `app/assets/santa-hat.svg` (auch in Task 6 für Buttons genutzt).

- [ ] **Step 1: Santa-Hut-SVG erzeugen**

Create `app/assets/santa-hat.svg` (transparent, rote Mütze mit weißem Rand + Bommel):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">
  <path d="M14 60 C14 30 40 8 70 14 C84 17 90 28 88 40 C86 52 70 56 54 58 C40 60 26 62 18 64 Z" fill="#C8102E"/>
  <path d="M12 58 C30 52 50 54 64 56 C58 64 40 68 24 68 C18 68 12 64 12 58 Z" fill="#ffffff"/>
  <ellipse cx="14" cy="62" rx="11" ry="10" fill="#ffffff"/>
  <circle cx="88" cy="40" r="9" fill="#ffffff"/>
</svg>
```

(Falls die Form unsauber wirkt: Mütze stattdessen per ai-image-generator als transparentes PNG erzeugen und als `santa-hat.png` ablegen; CSS-`url()` entsprechend anpassen.)

- [ ] **Step 2: Logo-Overlay stylen (theme-christmas.css)**

Ans Ende von `theme-christmas.css` anfügen. Die Wrapper müssen `position: relative` haben (sonst ergänzen):

```css
/* ===================================================================
   PUTZMEISTER-LOGO – Santa-Mütze (Overlay, Original-Logo bleibt)
   ::after auf dem WRAPPER (nicht auf dem <img> – dort rendern keine
   Pseudo-Elemente). Mütze sitzt schräg auf der oberen Ecke des Logos.
   =================================================================== */
[data-theme="christmas"] .sidebar__logo-wrap { position: relative; }
[data-theme="christmas"] .sidebar__logo-wrap::after,
[data-theme="christmas"] .login-card__ident::after {
  content: ""; position: absolute; z-index: 3; pointer-events: none;
  background: center / contain no-repeat url("../assets/santa-hat.svg");
  transform: rotate(-18deg);
}
/* Sidebar: Mütze auf der oberen rechten Ecke des Logo-Marks */
[data-theme="christmas"] .sidebar__logo-wrap::after {
  width: 26px; height: 21px; left: 20px; top: -8px;
}
/* Login-Karte: größeres Logo → größere Mütze */
[data-theme="christmas"] .login-card__ident { position: relative; }
[data-theme="christmas"] .login-card__ident::after {
  width: 42px; height: 34px; left: 30px; top: -14px;
}
```

- [ ] **Step 2b: Login-FX-Hinweis beachten**

`ensureThemeFX` lässt FX auf der Login-Seite aus (außer cmd) → auf Login KEIN Bild/Schnee, aber das Logo-Overlay ist reines CSS und greift trotzdem. Verifikation deshalb sowohl in der App (Sidebar) als auch auf der Login-Seite (`index.html`).

- [ ] **Step 3: Visuell feinjustieren + verifizieren**

Christmas aktiv. Sidebar-Logo prüfen (auch eingeklappte Sidebar — Logo-Mark bleibt sichtbar; Mütze muss mitwandern/passen). Dann Logout → Login-Seite prüfen.
`left/top/width/height/rotate` per DevTools justieren, bis die Mütze sauber auf dem Logo sitzt; Werte übernehmen.
Erwartet: PM-Logo trägt eine schräge Santa-Mütze, in Sidebar (offen + eingeklappt) und auf der Login-Karte.

- [ ] **Step 4: Commit**

```bash
git add app/assets/santa-hat.svg app/css/theme-christmas.css
git commit -m "feat(theme/christmas): Santa-Mütze als Logo-Overlay (Sidebar + Login)"
```

---

## Task 6: Schnee/Mütze auf primären Buttons

Ziel: Primäre CTA-Buttons bekommen eine dünne Schneekappe an der Oberkante; die Mütze nur auf der Haupt-CTA. Konservativ — nur `.btn-primary` (bzw. das Primär-Button-Pattern des Projekts).

**Files:**
- Modify: `app/css/theme-christmas.css`

**Interfaces:**
- Consumes: Primär-Button-Selektor des Projekts; `app/assets/santa-hat.svg` (Task 5).

- [ ] **Step 1: Primär-Button-Selektor bestätigen**

Run: `grep -rn "btn-primary\|btn--primary\|\.btn\b" app/css/components.css | head`
Den tatsächlichen Primär-Button-Selektor notieren (im Folgenden Platzhalter `.btn-primary` — durch den realen ersetzen).

- [ ] **Step 2: Schneekappe + Mütze stylen (theme-christmas.css)**

Ans Ende anfügen (Selektor an Step 1 anpassen):

```css
/* ===================================================================
   PRIMÄR-BUTTONS – Schneekappe + Mütze auf der Ecke
   =================================================================== */
[data-theme="christmas"] .btn-primary { position: relative; overflow: visible; }
/* dünne Schneekappe an der Oberkante */
[data-theme="christmas"] .btn-primary::before {
  content: ""; position: absolute; left: 6px; right: 6px; top: -3px; height: 7px;
  border-radius: 6px 6px 4px 4px;
  background: linear-gradient(180deg, #ffffff 0%, #e8f0fb 100%);
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  pointer-events: none;
}
/* kleine schräge Mütze auf der rechten oberen Ecke */
[data-theme="christmas"] .btn-primary::after {
  content: ""; position: absolute; right: -6px; top: -12px;
  width: 22px; height: 18px; transform: rotate(16deg);
  background: center / contain no-repeat url("../assets/santa-hat.svg");
  pointer-events: none;
}
```

- [ ] **Step 3: Visuell verifizieren**

Christmas aktiv, Seite mit primärer CTA öffnen (z.B. Wochenansicht „Speichern" / Dashboard-Aktion).
Erwartet: Schneekappe sitzt sauber auf der Oberkante, Mütze auf der Ecke, kein Clipping durch `overflow` der Eltern (falls die Mütze abgeschnitten wird: `overflow: visible` am Button reicht meist; ist der Button-Container `overflow:hidden`, Mütze weglassen und nur Schneekappe behalten — in dem Fall `::after` entfernen). Sekundär-Buttons unverändert.

- [ ] **Step 4: Commit**

```bash
git add app/css/theme-christmas.css
git commit -m "feat(theme/christmas): Schneekappe + Mütze auf primären Buttons"
```

---

## Task 7: Lichterkette (Topbar + Dashboard-Hero)

Ziel: Eine animiert blinkende Lichterkette hängt über der Topbar und der Dashboard-Hero-Karte. Rein CSS, konservativ gescoped.

**Files:**
- Modify: `app/css/theme-christmas.css`

**Interfaces:**
- Consumes: Topbar-Selektor + Dashboard-Hero-Karten-Selektor des Projekts.

- [ ] **Step 1: Ziel-Selektoren bestätigen**

Run: `grep -rn "topbar\|\.topbar" app/css/topbar-ds.css | head` — Topbar-Hauptcontainer notieren.
Run: `grep -rn "hero\|dashboard-hero\|dashboard__hero\|greeting" app/css/dashboard.css | head` — Hero-/Begrüßungskarte notieren.
(Platzhalter unten: `.topbar` und `.dashboard-hero` — durch reale ersetzen.)

- [ ] **Step 2: Lichterkette stylen (theme-christmas.css)**

Ans Ende anfügen (Selektoren an Step 1 anpassen). Die Kette ist ein `::before`-Band mit Birnchen aus `radial-gradient`s + Twinkle-Animation:

```css
/* ===================================================================
   LICHTERKETTE – blinkendes Birnchen-Band (Topbar + Dashboard-Hero)
   =================================================================== */
[data-theme="christmas"] .topbar,
[data-theme="christmas"] .dashboard-hero { position: relative; }
[data-theme="christmas"] .topbar::after,
[data-theme="christmas"] .dashboard-hero::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 14px;
  pointer-events: none; z-index: 5;
  background-repeat: repeat-x;
  background-size: 44px 14px;
  background-image:
    radial-gradient(circle at 6px 9px, rgba(255,210,120,0.95) 0 3px, rgba(255,210,120,0) 4px),
    radial-gradient(circle at 17px 9px, rgba(120,200,255,0.95) 0 3px, rgba(120,200,255,0) 4px),
    radial-gradient(circle at 28px 9px, rgba(255,120,140,0.95) 0 3px, rgba(255,120,140,0) 4px),
    radial-gradient(circle at 39px 9px, rgba(120,255,160,0.95) 0 3px, rgba(120,255,160,0) 4px),
    linear-gradient(90deg, rgba(40,60,30,0.6) 0 100%);
  background-position: 0 0, 0 0, 0 0, 0 0, 0 2px;
  /* das Draht-Band nur 2px hoch oben */
  animation: pm-xm-lights 1.6s steps(1) infinite;
}
@keyframes pm-xm-lights {
  0%   { filter: brightness(1);   }
  50%  { filter: brightness(0.55);}
  100% { filter: brightness(1);   }
}
```

Hinweis: Der `linear-gradient` als letzte Lage simuliert den Draht (oben, 2px). Falls zu dominant: letzte `background-image`-Lage + zugehörige `background-position` entfernen.

- [ ] **Step 3: Visuell verifizieren**

Christmas aktiv, Dashboard, Strg+F5.
Erwartet: Über Topbar und Hero-Karte hängt eine Reihe farbiger Birnchen, die gemeinsam dezent blinken. Liegt nicht über klickbarem Text (z-index/Position prüfen; Höhe 14px am oberen Rand). Andere Seiten ohne Hero: nur Topbar-Kette.

- [ ] **Step 4: reduced-motion verifizieren**

DevTools → reduced-motion: reduce + Reload.
Erwartet: Kette leuchtet konstant (kein Blinken). Falls sie weiterblinkt, ist die Regel nicht von `#pmThemeFX`-Sammelblock erfasst (sie hängt an Topbar/Hero, nicht an `#pmThemeFX`) → eigene Regel ergänzen:

```css
@media (prefers-reduced-motion: reduce) {
  [data-theme="christmas"] .topbar::after,
  [data-theme="christmas"] .dashboard-hero::before { animation: none !important; }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/css/theme-christmas.css
git commit -m "feat(theme/christmas): blinkende Lichterkette (Topbar + Dashboard-Hero)"
```

---

## Task 8: Cross-Page-Verifikation + Sonderzustände

Ziel: Sicherstellen, dass das Theme auf allen 9 Seiten lesbar/konsistent ist und Sonderzustände (Modal, Print, reduced-motion, Tab-Wechsel) sauber sind.

**Files:** keine (nur Verifikation; Fixes ggf. in `theme-christmas.css`).

- [ ] **Step 1: Alle Seiten durchklicken**

Christmas aktiv, als Azubi. Jede Seite öffnen, je Strg+F5: dashboard, wochenansicht, jahresansicht, azubi-planer, ausbildungsstand, berichtsheftverwaltung, fahrgelderstattung, profil, (Login via Logout).
Erwartet: Text überall ≥ 4.5:1 lesbar, keine Light-Reste, Karten translucent über dem Bild, Deko nicht über kritischem Content.

- [ ] **Step 2: Modal-Pause prüfen**

Ein Modal öffnen (z.B. eine Aktion mit Bestätigungsdialog).
Erwartet: Schnee + Glows + Lichterkette pausieren hinter dem Blur-Backdrop (CPU/GPU-Schonung).

- [ ] **Step 3: Tab-Wechsel prüfen**

In anderen Tab wechseln, zurück.
Erwartet: Schnee läuft flüssig weiter, kein „Sprung" / Doppel-Loop.

- [ ] **Step 4: Print prüfen**

Druckvorschau (Strg+P) auf einer Inhaltsseite.
Erwartet: `#pmThemeFX` (Bild/Schnee/Glow) ausgeblendet, Inhalt sauber druckbar.

- [ ] **Step 5: Theme-Wechsel-Robustheit**

Christmas → Standard → Halloween → Christmas durchschalten.
Erwartet: Keine verwaisten Canvas-Loops (Flockenzahl konstant), kein zurückbleibendes `#pmThemeFX`, kein FOUC.

- [ ] **Step 6: Abschluss-Commit (falls Fixes nötig)**

```bash
git add app/css/theme-christmas.css
git commit -m "fix(theme/christmas): Kontrast-/Layout-Feinschliff nach Cross-Page-Check"
```

---

## Self-Review (vom Plan-Autor durchgeführt)

**Spec-Coverage:**
- Hintergrundbild → Task 2 ✓
- Wind-getragene dicke Flocken → Task 3 ✓
- Logo-Mütze → Task 5 ✓
- Button-Schnee/Mütze → Task 6 ✓
- Lichterkette → Task 7 ✓
- Baum-Licht-Glühen → Task 4 ✓
- Dunkler Basis-Modus + Rot-Akzent → Task 1 ✓
- Registrierung (3 Stellen + 9 Links) → Task 1 ✓
- Dark-Mode-Spiegelblock → Task 2 ✓
- Sonderzustände (Modal/Print/reduced-motion) → Task 1 (Listen) + Task 8 (Verifikation) ✓

**Abweichung von der Spec (dokumentiert):** Logo-Mütze als Overlay auf dem WRAPPER statt `::after` auf dem `<img>` (Pseudo-Elemente rendern nicht auf replaced elements). Visuelles Ergebnis identisch.

**Platzhalter-Hinweise (bewusst, nicht-blockierend):** Primär-Button-Selektor (Task 6) und Topbar/Hero-Selektoren (Task 7) werden im jeweils ersten Step per `grep` bestätigt, da die exakten Projekt-Klassennamen dort verifiziert werden müssen. Position der Glows/Mütze/Lichterkette wird visuell feinjustiert (inhärent augenmaß-basiert; Startwerte sind angegeben).

**Typ-/Namens-Konsistenz:** `PMChristmasSnow.start/stop`, Klassen `pm-xm-bg`/`pm-xm-snow`/`pm-xm-treeglow`, `id christmas` — durchgängig identisch in theme.js (FX_TEMPLATES, ensureThemeFX), CSS und Plan.
