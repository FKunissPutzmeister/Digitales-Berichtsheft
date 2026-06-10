# Tablet-Optimierung: Design-Spec
**Datum:** 2026-06-10  
**Scope:** Microsoft Surface Pro & iPad (primär Keyboard + Touchpad/Maus)  
**Ansatz:** B – Umfassende Tablet-Optimierung (Performance + Layout, kein Offline/PWA)

---

## Ziel

Die Anwendung soll auf Tablets (Surface Pro, iPad) sowohl performant laufen als auch den verfügbaren Bildschirmraum optimal nutzen – ohne das bestehende Design oder Animationen zu verändern.

**Nicht im Scope:**
- Service Worker / Offline-Support
- Touch-spezifische Gesten (Swipe, Pinch)
- Stift-/Pen-Eingabe-Optimierungen
- Änderungen am Desktop-Layout (> 1280px)

---

## Abschnitt 1: Performance-Layer (CSS & HTML)

### 1a. Font Loading

**Dateien:** alle 8 HTML-Seiten

**Status:** `font-display: swap` ist bereits in allen drei `@font-face`-Regeln in `variables.css` vorhanden (Zeilen 11, 18, 29) – keine CSS-Änderung nötig.

**Ausstehend:** `<link rel="preload">` Hints in allen HTML-Dateien.

Die Fonts liegen unter `Corporate Design/Fonts/` (außerhalb von `app/`). Preload-Pfad relativ zur HTML-Datei in `app/`:

```html
<link rel="preload" href="../Corporate%20Design/Fonts/librefranklin-bold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="../Corporate%20Design/Fonts/librefranklin-light.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="../Corporate%20Design/Fonts/OpenSans-Variable.ttf" as="font" type="font/ttf" crossorigin>
```

**Effekt:** Fonts werden parallel zum HTML-Parse geladen statt nachgelagert über CSS-Discovery. Auf Tablets mit schwächerer Verbindung sichtbar schnellere erste Textdarstellung.

---

### 1b. `will-change` auf animierten Elementen

**Dateien:** `app/css/layout.css`, `app/css/components.css`

| Element | Regel |
|---|---|
| `.sidebar` | `will-change: transform` |
| `.modal-overlay` | `will-change: opacity` |
| `.modal-content` | `will-change: transform, opacity` |
| `.toast` | `will-change: transform, opacity` |

`will-change` wird **ausschließlich** auf Elemente gesetzt, die bereits animiert werden. Kein pauschales Setzen (würde Speicher verschwenden).

---

### 1c. CSS `contain` auf Karten

**Dateien:** `app/css/wochenansicht.css`, `app/css/dashboard.css`, `app/css/components.css`

```css
.week-day-card {
  contain: layout style;
}
.stat-card {
  contain: layout style;
}
```

**Effekt:** Reflows bei Texteingabe in einem Tagesfeld kaskadieren nicht auf alle anderen 6 Karten. Auf Tablets mit schwächerer CPU messbar weniger Layout-Arbeit.

---

### 1d. `touch-action: manipulation`

**Datei:** `app/css/components.css`

```css
button, a, [role="button"], input[type="submit"] {
  touch-action: manipulation;
}
```

**Effekt:** Entfernt die 300ms Tap-Verzögerung auf Tablets. Kein visueller Unterschied; Klicks fühlen sich sofort an.

---

## Abschnitt 2: Viewport & Device-Fixes

### 2a. Safe Area Insets für iPad

**Dateien:** alle 8 HTML-Seiten, `app/css/layout.css`

**Viewport Meta (alle HTML-Dateien):**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**CSS-Ergänzungen in `layout.css`:**
```css
.topbar {
  padding-top: env(safe-area-inset-top);
}
.sidebar {
  padding-bottom: env(safe-area-inset-bottom);
}
```

Auf Surface Pro und iPads ohne Notch ist `env(safe-area-inset-*)` stets `0` – kein Effekt auf diesen Geräten.

---

### 2b. Text-Size-Adjust

**Datei:** `app/css/base.css`

```css
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
```

**Effekt:** Verhindert automatische Schriftgrößen-Inflation beim Orientierungswechsel (Portrait → Landscape) in iOS Safari und Chromium auf Android.

---

### 2c. Scroll-Optimierung

**Datei:** `app/css/base.css`, `app/css/layout.css`

```css
html {
  scroll-behavior: smooth;
}

.main-content {
  overscroll-behavior: none;
}
```

- `scroll-behavior: smooth`: Sanftes Scrollen bei Anker-Sprüngen
- `overscroll-behavior: none` auf `.main-content`: Verhindert den iOS "Bounce"-Effekt, der in App-Kontexten desorientierend wirkt
- Veraltetes `-webkit-overflow-scrolling: touch` entfernen, falls vorhanden (seit iOS 13 ohne Funktion, kann Bugs verursachen)

---

## Abschnitt 3: Layout & Breakpoints

### 3a. Neuer Zwischenbreakpoint 1280px

**Datei:** `app/css/layout.css`

**Zielgeräte:** iPad Pro 11" Landscape (1194px), iPad Air Landscape (1180px)

**Neue Regel:**

Die App verwendet CSS Custom Properties für die Sidebar-Breite (`--sidebar-w: 256px` in `variables.css`). Sidebar und `.main-wrapper` referenzieren diese Variable. Daher wird die Variable im Media Query überschrieben – beide Elemente passen sich automatisch an:

```css
@media (max-width: 1280px) {
  :root {
    --sidebar-w: 220px;
  }
}
```

`--sidebar-icon-w` (68px für Icon-Only) bleibt unverändert.

**Breakpoint-Übersicht nach Änderung:**

| Viewport | Sidebar-Verhalten |
|---|---|
| > 1280px | Volle Sidebar (256px) – unverändert |
| 1024–1280px | Kompakte Sidebar (220px) – neu |
| 768–1024px | Icon-Only (68px) – unverändert |
| < 768px | Versteckt / Mobile – unverändert |

---

### 3b. Wochenansicht 4+3-Layout unter 900px

**Datei:** `app/css/wochenansicht.css`

```css
@media (max-width: 900px) {
  .week-days-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

**Ergebnis:** Mo–Do in Zeile 1 (4 Karten), Fr–So in Zeile 2 (3 Karten). Jede Karte bekommt deutlich mehr Breite für den Quill-Editor-Text. Auf Desktop und Landscape-Tablets (> 900px) bleibt das 7-spaltige Layout.

---

### 3c. Quill-Toolbar Scroll

**Datei:** `app/css/quill-editor.css`

```css
.ql-toolbar {
  overflow-x: auto;
  white-space: nowrap;
}
```

**Effekt:** Die Formatierungsleiste scrollt horizontal, statt umzubrechen oder den Editorbereich zu überlappen. Auf Desktop (ausreichend Breite) kein sichtbarer Effekt.

---

### 3d. Fokus-Ring Verstärkung

**Datei:** `app/css/base.css`

```css
:focus-visible {
  outline-width: 3px;
  outline-offset: 3px;
}
```

Auf Surface Pro-Displays (typisch 200% Scaling) ist der bestehende 2px-Ring grenzwertig dünn. 3px bleibt subtil, ist aber auch bei hoher DPI klar erkennbar.

---

## Abschnitt 4: JavaScript-Performance

### 4a. Passive Event Listener

**Dateien:** `app/js/app.js`, `app/js/sidebar.js`, `app/js/wochenansicht.js`

Alle `addEventListener`-Aufrufe für folgende Event-Typen erhalten `{ passive: true }`:
- `scroll`
- `touchstart`
- `touchmove`
- `wheel`

```js
// Vorher:
element.addEventListener('scroll', handler);

// Nachher:
element.addEventListener('scroll', handler, { passive: true });
```

**Einschränkung:** `passive: true` bedeutet, dass `preventDefault()` im Handler nicht aufgerufen werden darf. Alle reinen Scroll/Touch-Listener, die kein `preventDefault()` verwenden, können sicher umgestellt werden. Bei Listenern, die `preventDefault()` benötigen (z.B. Drag-and-Drop), wird `passive` weggelassen.

---

### 4b. Debounce auf Resize-Handler

**Dateien:** `app/js/app.js`, `app/js/wochenansicht.js`

Eine einfache `debounce`-Hilfsfunktion wird geprüft – falls noch nicht vorhanden, in `app.js` ergänzt:

```js
function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

Alle `window.addEventListener('resize', ...)` Aufrufe werden mit `debounce(handler, 150)` gewrappt.

---

### 4c. Script Preload Hints

**Dateien:** alle 8 HTML-Seiten

Für die kritischen Module, die auf jeder Seite geladen werden:

```html
<link rel="preload" href="js/app.js" as="script">
<link rel="preload" href="js/api.js" as="script">
```

`theme.js` ist bereits synchron im `<head>` – kein Preload nötig (wäre kontraproduktiv).  
Seitenspezifische Module (z.B. `wochenansicht.js`) werden **nicht** preloaded, da sie nur auf ihrer Seite benötigt werden.

---

### 4d. PDF.js Worker-Pfad Prüfung

**Dateien:** `app/js/zeitnachweis-upload.js`, `app/js/ihk-import.js`

Prüfen und bei Bedarf sicherstellen:

```js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
```

Falls nicht gesetzt, läuft pdf.js im Main-Thread und blockiert die UI beim PDF-Import für mehrere Sekunden. Diese Zeile muss **vor dem ersten** `pdfjsLib`-Aufruf stehen.

---

## Betroffene Dateien (Übersicht)

| Datei | Änderungen |
|---|---|
| `app/index.html` + 7 weitere HTML | preload fonts, preload scripts, viewport-fit=cover |
| `app/css/base.css` | text-size-adjust, scroll-behavior, overscroll-behavior, focus-ring |
| `app/css/layout.css` | will-change sidebar, safe-area-insets, neuer 1280px-Breakpoint |
| `app/css/components.css` | will-change modal/toast, touch-action manipulation, contain stat-card |
| `app/css/wochenansicht.css` | contain week-day-card, 900px 4+3-Grid |
| `app/css/quill-editor.css` | Toolbar overflow-x scroll |
| `app/js/app.js` | passive listeners, debounce utility |
| `app/js/sidebar.js` | passive listeners |
| `app/js/wochenansicht.js` | passive listeners, debounce resize |
| `app/js/zeitnachweis-upload.js` | PDF.js worker-src prüfen |
| `app/js/ihk-import.js` | PDF.js worker-src prüfen |

---

## Nicht geänderte Bereiche

- Alle Animationen (Sidebar, Modals, Toasts, Fade-Ins) bleiben **unverändert** – `will-change` macht sie nur flüssiger
- Desktop-Layout (> 1280px): **keine Änderungen**
- Dark/Light Mode: **keine Änderungen**
- Backend: **keine Änderungen**
- Glassmorphism-Effekte: **keine Änderungen**
