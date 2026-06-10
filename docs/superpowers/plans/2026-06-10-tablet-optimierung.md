# Tablet-Optimierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimiere die App für Microsoft Surface Pro & iPad (Keyboard + Touchpad/Maus) in Performance und Layout, ohne das bestehende Design oder Animationen zu verändern.

**Architecture:** Drei unabhängige Änderungspakete: (1) CSS-Performance-Layer – `will-change`, `contain`, `touch-action`, Safe-Area-Insets, Breakpoint; (2) HTML-Preload-Hints in allen 8 Seiten; (3) JS-Passive-Listener + Debounce-Utility. Kein Backend-Touch.

**Tech Stack:** Vanilla CSS (Custom Properties), Vanilla JS, Quill Editor, 8 HTML-Seiten

---

## Vorab: Was bereits erledigt ist (kein Code nötig)

Diese Spec-Punkte wurden beim Planerstellen als bereits vorhanden verifiziert:

| Spec-Punkt | Wo vorhanden |
|---|---|
| `font-display: swap` | `variables.css:11,18,29` |
| `-webkit-text-size-adjust: 100%` | `base.css:13` |
| `scroll-behavior: smooth` | `base.css:14` |
| Scroll-Listener mit `{ passive: true }` | `app.js:142` (onScroll für Topbar) |
| PDF.js `workerSrc` gesetzt | `zeitnachweis-upload.js:209`, `ihk-import.js:211` |

Der Spec-Punkt "4+3-Grid Wochenansicht unter 900px" entfällt: `.wochen-kacheln` nutzt ein vertikales Flex-Layout (Karten bereits gestapelt) – ein Grid-Breakpoint hätte keinen Effekt.

---

## Datei-Übersicht

| Datei | Änderungen |
|---|---|
| `app/css/base.css` | `text-size-adjust` (unprefixed), `:focus-visible` stärken |
| `app/css/layout.css` | `will-change` Sidebar, safe-area-insets Topbar+Sidebar, `overscroll-behavior`, neuer 1280px-Breakpoint |
| `app/css/components.css` | `will-change` Modal+Toast, `touch-action: manipulation`, `contain` stat-card |
| `app/css/wochenansicht.css` | `contain: layout style` auf `.wochen-kachel` |
| `app/css/quill-editor.css` | Toolbar `flex-wrap: nowrap` + `overflow-x: auto` im Tablet-Breakpoint |
| `app/index.html` | viewport-fit=cover, Font-Preloads, Script-Preload api.js |
| `app/dashboard.html` + 6 weitere HTML | viewport-fit=cover, Font-Preloads, Script-Preloads api.js + app.js |
| `app/js/app.js` | Debounce-Utility ergänzen, PMSelect-Scroll-Listener passiv machen |
| `app/js/sidebar.js` | Scroll-Listener passiv machen |

---

## Task 1: CSS – base.css

**Dateien:**
- Modify: `app/css/base.css:11-17` (html-Regel)
- Modify: `app/css/base.css:92-97` (focus-visible-Regel)

### Kontext

`base.css:11-17` aktuell:
```css
html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
  color-scheme: light;
}
```

`base.css:92-97` aktuell:
```css
:focus-visible {
  outline: 2px solid var(--pm-yellow);
  outline-offset: 2px;
  border-radius: var(--r-sm);
  transition: outline-offset var(--t-fast);
}
```

---

- [ ] **Schritt 1: `text-size-adjust` (unprefixed) ergänzen**

In `base.css` die `html`-Regel um die ungeprefixt Variante ergänzen (Zeile nach `-webkit-text-size-adjust`):

```css
html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
  color-scheme: light;
}
```

**Warum:** `-webkit-` deckt Safari/Chrome ab. Die unprefixte Variante ist für zukünftige Browser-Standards. Auf iOS ist `-webkit-` die wirksame Regel.

---

- [ ] **Schritt 2: Fokus-Ring stärken**

In `base.css` die `:focus-visible`-Regel auf 3px/3px anpassen:

```css
:focus-visible {
  outline: 3px solid var(--pm-yellow);
  outline-offset: 3px;
  border-radius: var(--r-sm);
  transition: outline-offset var(--t-fast);
}
```

**Warum:** Surface Pro läuft typisch bei 200% Skalierung – der 2px-Ring ist dann visuell nur 1px auf dem physischen Pixel. 3px bleibt subtil, ist aber bei hoher DPI klar erkennbar.

---

- [ ] **Schritt 3: Änderungen visuell verifizieren**

Öffne die App im Browser und drücke Tab. Der Fokus-Ring auf Buttons und Links soll sichtbar sein. Kein sonstiger visueller Unterschied.

---

- [ ] **Schritt 4: Commit**

```bash
git add app/css/base.css
git commit -m "perf(tablet): text-size-adjust unprefixed, stärkerer Fokus-Ring"
```

---

## Task 2: CSS – layout.css

**Dateien:**
- Modify: `app/css/layout.css:12` (`.sidebar`-Regel)
- Modify: `app/css/layout.css:28-36` (`.sidebar__header`-Regel)
- Modify: `app/css/layout.css:478-494` (`.topbar`-Regel)
- Modify: `app/css/layout.css:579-585` (`.main-content`-Regel)
- Modify: `app/css/layout.css:638` (vor dem bestehenden `@media (max-width: 1024px)`)

### Kontext

`.sidebar` beginnt bei Zeile 12:
```css
.sidebar {
  view-transition-name: sidebar;
  position: fixed;
  top: 0; left: 0;
  height: 100vh;
  width: var(--sidebar-w);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  z-index: var(--z-sidebar);
  transition: width var(--t-normal), transform var(--t-normal),
              background-color 220ms var(--ease-out-quart);
  overflow: hidden;
}
```

`.sidebar__header` beginnt bei Zeile 28:
```css
.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-4);
  height: var(--topbar-h);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
```

`.topbar` beginnt bei Zeile 478:
```css
.topbar {
  position: sticky;
  top: 0;
  height: var(--topbar-h);
  background: var(--topbar-bg-glass);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  border-bottom: 1px solid var(--pm-grey-200);
  display: flex;
  align-items: center;
  padding: 0 var(--sp-6);
  gap: var(--sp-4);
  z-index: var(--z-sticky);
  flex-shrink: 0;
  transition: box-shadow var(--t-normal), background-color 220ms var(--ease-out-quart),
              border-color var(--t-normal);
}
```

`.main-content` beginnt bei Zeile 579:
```css
.main-content {
  flex: 1;
  padding: var(--sp-6);
  max-width: var(--content-max);
  width: 100%;
  animation: fadeIn var(--t-normal) both;
}
```

Bestehender Tablet-Breakpoint liegt bei Zeile 639:
```css
@media (max-width: 1024px) { ... }
```

---

- [ ] **Schritt 1: `will-change` zur Sidebar ergänzen**

In `.sidebar` eine `will-change`-Zeile hinzufügen (nach der letzten `transition`-Zeile, vor dem schließenden `}`):

```css
.sidebar {
  view-transition-name: sidebar;
  position: fixed;
  top: 0; left: 0;
  height: 100vh;
  width: var(--sidebar-w);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  z-index: var(--z-sidebar);
  transition: width var(--t-normal), transform var(--t-normal),
              background-color 220ms var(--ease-out-quart);
  overflow: hidden;
  will-change: transform;
}
```

---

- [ ] **Schritt 2: Safe-Area-Insets für Topbar und Sidebar ergänzen**

Diese Änderungen fügen `env(safe-area-inset-*)` ein. Auf Geräten ohne Notch (Surface Pro, ältere iPads) ist der Wert `0px` → kein Effekt. Auf iPad Pro mit Face ID wird der Inhalt korrekt unterhalb der Kamera positioniert.

**`.topbar` anpassen** – `padding` und `height` erweitern:

```css
.topbar {
  position: sticky;
  top: 0;
  height: calc(var(--topbar-h) + env(safe-area-inset-top, 0px));
  background: var(--topbar-bg-glass);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  border-bottom: 1px solid var(--pm-grey-200);
  display: flex;
  align-items: center;
  padding: env(safe-area-inset-top, 0px) var(--sp-6) 0 var(--sp-6);
  gap: var(--sp-4);
  z-index: var(--z-sticky);
  flex-shrink: 0;
  transition: box-shadow var(--t-normal), background-color 220ms var(--ease-out-quart),
              border-color var(--t-normal);
}
```

**`.sidebar__header` synchron halten** – gleiche Höhe wie Topbar:

```css
.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: env(safe-area-inset-top, 0px) var(--sp-4) 0 var(--sp-4);
  height: calc(var(--topbar-h) + env(safe-area-inset-top, 0px));
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
```

**`padding-bottom` zur Sidebar ergänzen** (Home-Indicator auf iPhone/iPad):

```css
.sidebar {
  /* ... alle bestehenden Regeln ... */
  will-change: transform;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

---

- [ ] **Schritt 3: `overscroll-behavior` auf `.main-content`**

In `.main-content` ergänzen:

```css
.main-content {
  flex: 1;
  padding: var(--sp-6);
  max-width: var(--content-max);
  width: 100%;
  animation: fadeIn var(--t-normal) both;
  overscroll-behavior: none;
}
```

**Warum:** Verhindert den iOS-"Bounce"-Effekt am Ende des Scroll-Bereichs, der in App-Kontexten (nicht Webseiten) irritierend wirkt.

---

- [ ] **Schritt 4: Neuen 1280px-Breakpoint einfügen**

Direkt **vor** dem bestehenden `@media (max-width: 1024px)` (aktuell Zeile 639) einfügen:

```css
/* ── Responsive: Kompakter Tablet-Landscape (Surface Pro 13", iPad Pro 11"/12.9" Landscape) ── */
@media (max-width: 1280px) {
  :root { --sidebar-w: 220px; }
}

/* ── Responsive: Tablet ── */
@media (max-width: 1024px) {
  /* ... bestehende Regeln unverändert ... */
```

**Warum:** Mit `--sidebar-w: 220px` passen sich `.sidebar` (nutzt `width: var(--sidebar-w)`) und `.main-wrapper` (nutzt `margin-left: var(--sidebar-w)`) automatisch an. 36px mehr Inhaltsbreite bei iPad Pro 11"/Air Landscape. Desktop (> 1280px) bleibt unverändert.

---

- [ ] **Schritt 5: Verifizieren**

Browserbreite auf 1200px ziehen (DevTools): Sidebar soll 220px breit sein, Labels noch lesbar. Bei 1024px kollabiert sie zu Icon-Only (68px) wie bisher. Bei 768px Mobile-Modus wie bisher.

---

- [ ] **Schritt 6: Commit**

```bash
git add app/css/layout.css
git commit -m "perf(tablet): will-change sidebar, safe-area-insets, overscroll, 1280px breakpoint"
```

---

## Task 3: CSS – components.css

**Dateien:**
- Modify: `app/css/components.css:207` (`.stat-card`)
- Modify: `app/css/components.css:512` (`.modal-overlay`)
- Modify: `app/css/components.css:533` (`.modal`)
- Modify: `app/css/components.css:620` (`.toast`)
- Modify: `app/css/components.css` – `touch-action` zu bestehenden Button/Link-Selektoren

### Kontext

Aktuelle Regeln:

```css
/* Zeile 207 */
.stat-card { ... }

/* Zeile 512 */
.modal-overlay {
  ...
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--t-normal), backdrop-filter var(--t-normal);
}

/* Zeile 533 */
.modal {
  ...
  transform: scale(0.95) translateY(16px);
  transition: transform var(--t-spring);
}

/* Zeile 620 */
.toast {
  ...
  animation: toastIn var(--t-normal) both;
  position: relative;
  overflow: hidden;
}
```

---

- [ ] **Schritt 1: `contain: layout style` auf `.stat-card`**

Direkt nach dem öffnenden `{` der `.stat-card`-Regel ergänzen:

```css
.stat-card {
  contain: layout style;
  /* ... alle bestehenden Regeln ... */
}
```

**Warum:** Isoliert Reflow-Kaskaden. Wenn eine Karte sich ändert, wird nicht das gesamte Dashboard-Grid neu berechnet.

---

- [ ] **Schritt 2: `will-change` auf `.modal-overlay` und `.modal`**

```css
.modal-overlay {
  /* ... alle bestehenden Regeln ... */
  will-change: opacity;
}

.modal {
  /* ... alle bestehenden Regeln ... */
  will-change: transform, opacity;
}
```

---

- [ ] **Schritt 3: `will-change` auf `.toast`**

```css
.toast {
  /* ... alle bestehenden Regeln ... */
  will-change: transform, opacity;
}
```

---

- [ ] **Schritt 4: `touch-action: manipulation` ergänzen**

Suche in `components.css` nach dem primären `button`-Selektor (oder füge als neue Regel am Anfang der Komponenten-Sektion ein). Der beste Ort ist zusammen mit dem bestehenden `button`-Reset oder als eigene Ergänzung:

```css
button,
a,
[role="button"],
input[type="submit"],
input[type="button"],
label[for] {
  touch-action: manipulation;
}
```

Prüfe zuerst per Grep, ob ein `button, a {` Block existiert – falls ja, dort ergänzen. Falls nicht, als neue Regel in die Button-Sektion von `components.css` einfügen (nach Zeile ~1 oder dem ersten Button-Selector-Block).

**Warum:** Entfernt die 300ms-Tap-Verzögerung auf Tablets. Kein visueller Effekt.

---

- [ ] **Schritt 5: Verifizieren**

Öffne Dashboard. Animiere ein Modal (z.B. über einen Button) – Animation läuft flüssig. Keine visuellen Änderungen an Karten, Modals oder Toasts erkennbar.

---

- [ ] **Schritt 6: Commit**

```bash
git add app/css/components.css
git commit -m "perf(tablet): will-change modal/toast, contain stat-card, touch-action manipulation"
```

---

## Task 4: CSS – wochenansicht.css

**Dateien:**
- Modify: `app/css/wochenansicht.css:618` (`.wochen-kachel`)

### Kontext

`.wochen-kachel` beginnt bei Zeile 618:
```css
.wochen-kachel {
  background: var(--pm-white);
  border: 1.5px solid var(--pm-grey-200);
  border-radius: var(--r-xl);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  animation: fadeIn var(--t-normal) both;
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
}
```

---

- [ ] **Schritt 1: `contain` auf `.wochen-kachel` setzen**

```css
.wochen-kachel {
  background: var(--pm-white);
  border: 1.5px solid var(--pm-grey-200);
  border-radius: var(--r-xl);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  animation: fadeIn var(--t-normal) both;
  transition: border-color var(--t-fast), box-shadow var(--t-fast);
  contain: layout style;
}
```

**Warum:** In der Wochenansicht gibt es 7 Kacheln (eine pro Tag). Ohne `contain` löst eine Texteingabe in Kachel 3 Reflow-Neuberechnungen für alle 7 Kacheln aus. Mit `contain: layout style` sind die Kacheln isoliert.

**Hinweis:** Die v2-Design-Überschreibung (`body[data-page="wochenansicht"] .wochen-kachel`) setzt `overflow: visible`. Da `contain: layout style` von der Basisklasse vererbt wird und die v2-Regel kein `contain` überschreibt, bleibt es aktiv. Falls Dropdown-Menüs oder Tooltips innerhalb einer Kachel abgeschnitten erscheinen, `contain: style` (ohne `layout`) als Fallback setzen.

---

- [ ] **Schritt 2: Verifizieren**

Öffne die Wochenansicht. Tippe in ein Textfeld einer Kachel. Kein visueller Unterschied – nur die Rendering-Performance ist besser.

---

- [ ] **Schritt 3: Commit**

```bash
git add app/css/wochenansicht.css
git commit -m "perf(tablet): contain layout style auf wochen-kachel"
```

---

## Task 5: CSS – quill-editor.css

**Dateien:**
- Modify: `app/css/quill-editor.css:11-20` (`.ql-editor-wrap .ql-toolbar.ql-snow`)

### Kontext

Aktuelle Toolbar-Regel (Zeile 11):
```css
.ql-editor-wrap .ql-toolbar.ql-snow {
  border: none;
  background: transparent;
  padding: 0 0 var(--sp-2) 0;
  font-family: var(--font-body);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}
```

---

- [ ] **Schritt 1: Tablet-Breakpoint für Quill-Toolbar ergänzen**

Am Ende von `quill-editor.css` anfügen:

```css
/* ── Tablet: Toolbar scrollt horizontal statt umzubrechen ── */
@media (max-width: 1280px) {
  .ql-editor-wrap .ql-toolbar.ql-snow {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: auto;
  }
}
```

**Warum:** Bei schmalen Viewports (Tablet Portrait oder halber Bildschirm) gibt es zu wenig Breite für alle Quill-Toolbar-Buttons nebeneinander. Mit `flex-wrap: nowrap` + `overflow-x: auto` scrollt die Toolbar horizontal statt umzubrechen. `-webkit-overflow-scrolling: auto` statt `touch` – die ältere `touch`-Variante ist seit iOS 13 ohne Funktion und kann Bugs verursachen.

---

- [ ] **Schritt 2: Verifizieren**

Öffne die Wochenansicht. Ziehe das Browserfenster auf ~800px Breite. Die Quill-Toolbar soll horizontal scrollbar sein, nicht auf zwei Zeilen umbrechen. Auf voller Desktop-Breite kein Unterschied.

---

- [ ] **Schritt 3: Commit**

```bash
git add app/css/quill-editor.css
git commit -m "perf(tablet): quill-toolbar horizontal scrollbar auf <= 1280px"
```

---

## Task 6: HTML – Alle 8 Seiten (Viewport + Preloads)

**Dateien (alle modifizieren):**
- `app/index.html`
- `app/dashboard.html`
- `app/wochenansicht.html`
- `app/jahresansicht.html`
- `app/ausbildungsstand.html`
- `app/azubi-planer.html`
- `app/berichtsheftverwaltung.html`
- `app/profil.html`

### Änderung A: Viewport Meta (alle 8 Dateien, identisch)

**Vorher:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**Nachher:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

**Warum:** `viewport-fit=cover` lässt den Inhalt hinter Notch/Kamera-Ausschnitt auf Face-ID iPads rendern. Die CSS `env(safe-area-inset-*)` Regeln aus Task 2 greifen nur, wenn dieser Parameter gesetzt ist.

### Änderung B: Font-Preloads (alle 8 Dateien, identisch)

**Direkt nach dem Viewport-Meta-Tag einfügen:**
```html
<link rel="preload" href="../Corporate Design/Fonts/librefranklin-bold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="../Corporate Design/Fonts/librefranklin-light.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="../Corporate Design/Fonts/OpenSans-Variable.ttf" as="font" type="font/ttf" crossorigin>
```

**Pfad-Erklärung:** HTML-Dateien liegen in `app/`, Fonts in `(Projektroot)/Corporate Design/Fonts/` → relativer Pfad `../Corporate Design/Fonts/`. Der Pfad enthält ein Leerzeichen, was in `href`-Attributen ohne URL-Encoding funktioniert (Browser normalisieren es).

**Warum:** Die Fonts werden derzeit erst beim CSS-Parse entdeckt. Mit `rel="preload"` startet der Browser den Font-Download parallel zum HTML-Parse – schnellere erste Textdarstellung, kein Flash of Invisible Text (FOIT).

### Änderung C: Script-Preloads (unterschiedlich je Seite)

**Nur `index.html` (Login-Seite, kein `app.js`):**
```html
<link rel="preload" href="js/api.js" as="script">
```

**Alle anderen 7 Seiten (haben `app.js` und `api.js`):**
```html
<link rel="preload" href="js/api.js" as="script">
<link rel="preload" href="js/app.js" as="script">
```

**Platzierung:** Alle Preload-Links kommen direkt nach der Viewport-Meta, vor den `<link rel="stylesheet">` Tags.

---

- [ ] **Schritt 1: `index.html` anpassen**

Viewport Meta auf `viewport-fit=cover` ändern und Preloads einfügen:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="preload" href="../Corporate Design/Fonts/librefranklin-bold.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="../Corporate Design/Fonts/librefranklin-light.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="../Corporate Design/Fonts/OpenSans-Variable.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="js/api.js" as="script">
  <title>Anmelden – Digitales Berichtsheft | Putzmeister</title>
  <!-- Theme-Init muss VOR den Stylesheets laufen ... -->
```

---

- [ ] **Schritt 2: `dashboard.html` anpassen**

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="preload" href="../Corporate Design/Fonts/librefranklin-bold.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="../Corporate Design/Fonts/librefranklin-light.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="../Corporate Design/Fonts/OpenSans-Variable.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="js/api.js" as="script">
  <link rel="preload" href="js/app.js" as="script">
  <title>Dashboard – Digitales Berichtsheft | Putzmeister</title>
```

---

- [ ] **Schritt 3: Die verbleibenden 6 Seiten anpassen**

Jede der folgenden Seiten erhält dieselben Preloads wie `dashboard.html` (Fonts + api.js + app.js). Nur die `<title>` und ggf. der Page-Slug unterscheiden sich – nichts anderes:

1. `app/wochenansicht.html`
2. `app/jahresansicht.html`
3. `app/ausbildungsstand.html`
4. `app/azubi-planer.html`
5. `app/berichtsheftverwaltung.html`
6. `app/profil.html`

---

- [ ] **Schritt 4: Verifizieren**

In den Chrome DevTools → Network-Tab: "Disable cache" aktivieren, Seite neu laden. Im Wasserfalldiagramm sollen die Font-Dateien und `api.js`/`app.js` als frühe Requests erscheinen – noch bevor die CSS-Datei fertig geparsed wurde.

---

- [ ] **Schritt 5: Commit**

```bash
git add app/index.html app/dashboard.html app/wochenansicht.html \
        app/jahresansicht.html app/ausbildungsstand.html \
        app/azubi-planer.html app/berichtsheftverwaltung.html app/profil.html
git commit -m "perf(tablet): viewport-fit=cover, font-preloads, script-preloads alle 8 HTML-Seiten"
```

---

## Task 7: JS – app.js (Debounce + Passive Listener)

**Dateien:**
- Modify: `app/js/app.js`

### Kontext

In `app.js` gibt es die `PMSelect`-Klasse, deren `open()`-Methode (Zeile ~714) einen Scroll- und Resize-Listener registriert:

```js
// Zeile 725-728 (innerhalb von open()):
document.addEventListener('mousedown', this.outsideClickHandler);
document.addEventListener('keydown', this.escapeHandler);
window.addEventListener('scroll', this.repositionHandler, true);   // ← scroll, capture mode
window.addEventListener('resize', this.repositionHandler);
```

```js
// Zeile 742-745 (innerhalb von close()):
document.removeEventListener('mousedown', this.outsideClickHandler);
document.removeEventListener('keydown', this.escapeHandler);
window.removeEventListener('scroll', this.repositionHandler, true);
window.removeEventListener('resize', this.repositionHandler);
```

`this.repositionHandler = () => this.position()` (Zeile 568) – ruft kein `preventDefault()` auf.

---

- [ ] **Schritt 1: Debounce-Utility ergänzen**

Suche in `app.js` nach dem Ende der `const`/`function`-Deklarationen im globalen Scope (vor der ersten Klassen- oder DOMContentLoaded-Definition). Füge die Debounce-Utility ein:

```js
/**
 * Verzögert fn-Aufrufe – verhindert übermäßige Ausführung bei Resize/Input.
 * @param {Function} fn
 * @param {number} delay - Millisekunden
 */
function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

**Wo einfügen:** Finde die Zeile direkt nach den `import`-/`use strict`-Statements bzw. vor der ersten Klassendefinition (`class PMSelect` oder ähnlichem). Wenn kein klarer Ort, am Anfang von `app.js` nach dem Kommentar-Header.

---

- [ ] **Schritt 2: Scroll-Listener in `open()` passiv machen**

Zeile 727 in der `open()`-Methode ändern:

**Vorher:**
```js
window.addEventListener('scroll', this.repositionHandler, true);
```

**Nachher:**
```js
window.addEventListener('scroll', this.repositionHandler, { capture: true, passive: true });
```

Und die korrespondierende Zeile 744 in `close()`:

**Vorher:**
```js
window.removeEventListener('scroll', this.repositionHandler, true);
```

**Nachher:**
```js
window.removeEventListener('scroll', this.repositionHandler, { capture: true });
```

**Wichtig:** `removeEventListener` braucht `capture: true` im Options-Objekt, aber **kein** `passive`. Das `passive`-Flag ist nur für `addEventListener` relevant.

---

- [ ] **Schritt 3: Verifizieren**

Öffne die App, klicke auf einen PMSelect-Dropdown (z.B. in der Wochenansicht), scrolle die Seite. Der Dropdown soll sich neu positionieren. Chrome DevTools Console soll **keine** Violation-Warnung "Added non-passive event listener to a scroll-blocking event" zeigen.

---

- [ ] **Schritt 4: Commit**

```bash
git add app/js/app.js
git commit -m "perf(tablet): debounce utility, PMSelect scroll-listener passiv"
```

---

## Task 8: JS – sidebar.js (Passive Listener)

**Dateien:**
- Modify: `app/js/sidebar.js:162`

### Kontext

In `sidebar.js` Zeile 162:
```js
window.addEventListener('scroll', hide, true);
```

Dieser Listener schließt Sidebar-Tooltips beim Scrollen. Er ruft kein `preventDefault()` auf.

---

- [ ] **Schritt 1: Scroll-Listener passiv machen**

**Vorher:**
```js
window.addEventListener('scroll', hide, true);
```

**Nachher:**
```js
window.addEventListener('scroll', hide, { capture: true, passive: true });
```

Überprüfe, ob es eine korrespondierende `removeEventListener`-Zeile gibt. Falls ja, auf `{ capture: true }` ändern (ohne `passive`):

```js
window.removeEventListener('scroll', hide, { capture: true });
```

---

- [ ] **Schritt 2: Verifizieren**

Öffne die App bei kollabierter Sidebar (Tablet-Modus). Hover über ein Sidebar-Icon um den Tooltip zu zeigen, dann scrolle. Der Tooltip soll verschwinden. Keine Console-Violations.

---

- [ ] **Schritt 3: Commit**

```bash
git add app/js/sidebar.js
git commit -m "perf(tablet): sidebar scroll-listener passiv (capture + passive)"
```

---

## Spec-Abgleich

| Spec-Punkt | Task | Status |
|---|---|---|
| Font-Preloads (`<link rel="preload">`) | Task 6 | ✓ geplant |
| `font-display: swap` | — | Bereits vorhanden |
| `will-change` Sidebar | Task 2 | ✓ geplant |
| `will-change` Modal/Toast | Task 3 | ✓ geplant |
| `contain` stat-card | Task 3 | ✓ geplant |
| `contain` wochen-kachel | Task 4 | ✓ geplant |
| `touch-action: manipulation` | Task 3 | ✓ geplant |
| Safe-Area-Insets + viewport-fit | Task 2 + Task 6 | ✓ geplant |
| `text-size-adjust` unprefixed | Task 1 | ✓ geplant |
| `scroll-behavior: smooth` | — | Bereits vorhanden |
| `overscroll-behavior: none` | Task 2 | ✓ geplant |
| `:focus-visible` 3px | Task 1 | ✓ geplant |
| 1280px-Breakpoint | Task 2 | ✓ geplant |
| 4+3 Wochenansicht 900px | — | Entfällt (Layout ist vertikal) |
| Quill-Toolbar Scroll | Task 5 | ✓ geplant |
| Passive Listener | Task 7 + Task 8 | ✓ geplant |
| Debounce-Utility | Task 7 | ✓ geplant |
| Script-Preloads | Task 6 | ✓ geplant |
| PDF.js `workerSrc` | — | Bereits vorhanden |
