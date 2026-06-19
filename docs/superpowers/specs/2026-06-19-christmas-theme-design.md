# Christmas-Theme – Design / Spec

**Datum:** 2026-06-19
**Status:** Genehmigt (Design), bereit für Implementierungsplan
**Branch:** `Digitales-Berichtsheft`

## Ziel

Ein neues Custom-Design **„Christmas"** – ein dunkles, gemütliches Weihnachts-Theme
mit verschneiter Winterszene als Hintergrund, leicht wirkendem, vom Wind getragenem
Schneefall mit dicken Flocken und mehreren festlichen Spezial-Elementen
(Weihnachtsmütze auf dem Logo, Schnee/Mütze auf Buttons, blinkende Lichterkette um
ausgewählte Elemente, sanftes Leuchten der Lichter des Weihnachtsbaums im
Hintergrundbild).

Strukturell ein Zwilling des bestehenden **Halloween-Themes**: dunkler Basis-Modus,
fertiges Hintergrundbild als Szene über `#pmThemeFX`, Token-Kipp + Akzent-Umfärbung,
translucente Surfaces, eine Canvas-FX-Engine, Logo-Tausch und ein Dark-Mode-
Komponenten-Spiegelblock.

## Entscheidungen (mit dem Nutzer abgestimmt)

- **Basis-Modus:** dunkel (cozy Abendstimmung). `html[data-theme="christmas"] { color-scheme: dark; }`
- **Akzentfarbe:** Brand-Gelb → Weihnachts-**Rot `#C8102E`**; Grün als sekundärer
  Glow-/Ring-Akzent (rot & grün lesen als „Weihnachten").
- **Hintergrundbild:** liegt unter `app/assets/backgrounds/Christmas Background.jpeg`
  (vom Nutzer abgelegt). CSS-Referenz aus `app/css/`:
  `url("../assets/backgrounds/Christmas Background.jpeg")` – **gequotet** (Leerzeichen
  im Dateinamen).
- **Santa-Hat-Asset:** wird von Claude erzeugt (kleines transparentes PNG/SVG).
- **Deko-Elemente:** alle vier (Logo-Mütze, Button-Schnee/Mütze, Lichterkette,
  Baum-Licht-Glühen).
- **Scope der „lauten" Deko (konservativ):** Lichterkette nur auf Topbar +
  Dashboard-Hero-Karte; Button-Schnee nur auf primären CTAs.

## Architektur-Kontext (bestehend, nicht ändern)

Themes registrieren sich an **drei koordinierten Stellen** plus HTML-Verlinkung:

1. `app/js/theme.js`
   - `CUSTOM_THEMES`-Array (Liste der Custom-Designs).
   - `FX_TEMPLATES`-Objekt (HTML-String der DOM-Hintergrund-Layer pro Theme).
   - `ensureThemeFX()` startet/stoppt pro Theme die zugehörige Canvas-Engine.
2. `app/js/profil.js` – `THEME_DESIGNS`-Array (Kacheln im Theme-Picker, nur Azubi).
3. `app/css/themes.css` – geteilte Selektorlisten: Sidebar-Toggle ausblenden,
   FX-Pause bei offenem Modal, `prefers-reduced-motion`, `@media print`.
4. Jede HTML-Seite bindet `theme-<name>.css` als eigenes `<link>` **direkt vor**
   `themes.css` ein. Betroffen sind **9 Seiten**: `ausbildungsstand.html`,
   `azubi-planer.html`, `berichtsheftverwaltung.html`, `dashboard.html`,
   `fahrgelderstattung.html`, `index.html`, `jahresansicht.html`, `profil.html`,
   `wochenansicht.html`.

Die per-Theme-Datei (`theme-christmas.css`) gehört exklusiv diesem Theme und scoped
**alle** Regeln unter `[data-theme="christmas"]`. Das Standard-Theme (light/dark)
darf sich um kein Pixel ändern.

## Komponenten

### 1. `app/css/theme-christmas.css` (neu)

Aufbau modelliert nach `theme-halloween.css`:

- **Token-Block** unter `[data-theme="christmas"]`:
  - `--pm-yellow` & Varianten → Weihnachts-Rot (`#C8102E`, hellere Hover-/Light-
    Varianten, `--on-yellow-text` hell auf Rot für Kontrast ≥ 4.5:1).
  - Komplette `--pm-grey-*`-Skala auf **kühles Blau-Nacht** gekippt (passend zum
    dämmrigen Himmel des Bildes), Karten heller als Body. Die drei Surface-Stufen
    **transluzent** (rgba), damit die Szene hinter Karten/Toolbars durchscheint;
    Alpha hoch genug für Text-Kontrast ≥ 4.5:1.
  - Status-Tints, Schatten (tief), Akzent-Glow/Ringe (rot, mit grünem Sekundär-Glow).
  - Inverse Surfaces / Topbar / Overlay / Glass-Token → dunkles, kühles Glas.
  - `--app-bg-image/-overlay/-vignette: none` – die Szene (`#pmThemeFX`) übernimmt.
  - Sidebar-Token (dunkles Glas, roter `--sidebar-line`).
- **Szene-Styling** (`#pmThemeFX`-Kinder, siehe FX-Template unten):
  - `.pm-xm-bg` – Hintergrundbild, `background-size: cover`, zentriert/verankert,
    `position: fixed; inset: 0; z-index: 0`. Optional dezenter Abdunkel-Overlay
    (Lesbarkeit über dem hellen Himmel).
  - `.pm-xm-treeglow` (mehrere, `--1..--n`) – klein, absolut positioniert über den
    Lichtern des Baums (oben rechts), `mix-blend-mode: screen`, mehrfarbig,
    gestaffelte Pulse-Keyframes → Funkeln. Zusätzlich ein warmer Fenster-Glow über
    der Hütte.
  - `.pm-xm-snow` – `<canvas>`, Fallback-Hintergrundfarbe.
- **Deko-Elemente** (siehe §4).
- **Dark-Mode-Komponenten-Spiegelblock:** Regeln, die in anderen Dateien hart an
  `[data-theme="dark"]` hängen (Sidebar-Hover, Karten-Borders, Toast, Badges,
  `.profil-logout` etc.), unter `[data-theme="christmas"]` spiegeln – sonst laufen
  sie mit ihren Light-Werten. Inhaltlich = Halloween-Spiegelblock, nur Akzent/
  Flächen auf die Christmas-Palette umgefärbt.

### 2. `FX_TEMPLATES.christmas` (in `theme.js`)

Layer-HTML, hinten → vorne:

```
'<div class="pm-xm-bg"></div>' +
'<div class="pm-xm-treeglow pm-xm-treeglow--1"></div>' +
… (mehrere Glow-Punkte über den Baumlichtern + 1 Hütten-Fenster-Glow) +
'<canvas class="pm-xm-snow" aria-hidden="true"></canvas>'
```

### 3. Schnee-Engine `PMChristmasSnow` (in `theme.js`)

Geklont aus `PMIcelandFX`-Loop-Gerüst (bewährt), **neu getunt** für die Vorgabe
„leichter Schneefall mit dicken Flocken, vom Wind getragen":

- **Wenige, große, weiche Flocken** (dick), **geringe Dichte** (leicht).
- **Starker horizontaler Wind mit Böen** + **per-Flocke-Sway** → Flocken driften
  seitlich über den Bildschirm statt senkrecht zu fallen.
- Konventionen aus den anderen Engines übernehmen:
  - `prefers-reduced-motion` → ein statisches Standbild, kein Loop.
  - Pause bei verstecktem Tab / offenem Modal (`.modal-overlay.open`).
  - `start(canvas)` / `stop()` idempotent, am FX-Lebenszyklus gesteuert.
- Einbindung in `ensureThemeFX()`: `else if (theme === 'christmas')` →
  `PMChristmasSnow.start(el.querySelector('.pm-xm-snow'))`; im Teardown-Block
  oben `PMChristmasSnow.stop()` ergänzen.

### 4. Festliche Spezial-Elemente (CSS in `theme-christmas.css`)

- **Weihnachtsmütze auf Logo:** `::after`-Overlay (transparentes Hat-Asset, von
  Claude erzeugt, z.B. `app/assets/santa-hat.png` oder inline-SVG) leicht schräg auf
  der Ecke von `.sidebar__logo-mark` **und** `.login-card__mark`. Additiv – kein
  Logo-Recolor (kein `content: url()`-Tausch nötig).
- **Schnee/Mütze auf Buttons:** primäre Buttons (CTA) bekommen eine dünne CSS-
  Schneekappe an der Oberkante; die Haupt-CTA zusätzlich eine kleine schräge Mütze
  an der Ecke. **Nur primäre CTAs.**
- **Lichterkette:** animiert blinkende Lichterkette (CSS: `repeating-linear-gradient`-
  Birnchen + Twinkle-Keyframes), gehängt über **Topbar + Dashboard-Hero-Karte**.
- **Baum-Licht-Glühen:** via `.pm-xm-treeglow` (§1/§2).

### 5. Theme-Picker

- `profil.js` → `THEME_DESIGNS`: `{ id: 'christmas', name: 'Christmas', sub: 'Verschneit & festlich' }`.
- `profil.css` → `.theme-tile__swatch--christmas` (Vorschau-Swatch, rot/grün/weiß).

### 6. Assets

- `app/assets/backgrounds/Christmas Background.jpeg` – **vorhanden** (Nutzer).
- Santa-Hat-Overlay – **von Claude zu erzeugen** (kleines transparentes PNG, via
  System.Drawing/Add-Type oder ai-image-generator), abgelegt unter `app/assets/`.

## Datenfluss / Verhalten

- Auswahl im Profil → `PMTheme.setCustom('christmas')` → `localStorage('customTheme')`
  = `'christmas'` → `apply()` setzt `data-theme="christmas"`, baut `#pmThemeFX` neu,
  startet `PMChristmasSnow`.
- Sidebar-Hell/Dunkel-Toggle verlässt das Custom-Design (Standard-Verhalten, bereits
  implementiert; Toggle wird via `themes.css` ausgeblendet).
- FOUC-frei: `theme.js` läuft im `<head>` und setzt `data-theme` vor dem ersten Paint.

## Fehler-/Edge-Cases

- **Leerzeichen im Bild-Dateinamen:** `url()` gequotet.
- **Login-Seite:** `ensureThemeFX` lässt FX auf Login aus (Ausnahme nur `cmd`) →
  Christmas-Szene erscheint nicht auf Login; das ist konsistent mit den übrigen
  Themes. Logo-Mütze auf `.login-card__mark` greift dennoch (reines CSS, nicht FX).
- **reduced-motion / Modal offen / Tab versteckt:** Schnee-Loop pausiert/Standbild;
  Pseudo-Layer-Animationen via `themes.css`-Sammelblöcke still (christmas dort
  ergänzen).
- **Print:** `#pmThemeFX` und Pseudo-Layer ausblenden (christmas in
  `@media print`-Liste ergänzen).
- **Kontrast:** transluzente Surfaces mit genug Alpha; Token-Werte gegen das helle
  Himmel-Bild auf ≥ 4.5:1 prüfen (visueller Layout-Check nach Umsetzung).

## Nicht im Scope (YAGNI)

- Keine interaktiven Elemente (kein Kollisions-Spiel wie Candy-Bubbles).
- Lichterkette/Button-Schnee NICHT app-weit – nur der oben genannte konservative
  Scope.
- Kein eigener Light-Modus (Theme ist bewusst dunkel).

## Verifikation

- Lokal: Backend (`node server.js`, Port 3000) + Edge via npx-Playwright; Theme im
  Profil aktivieren, Seiten durchklicken (Strg+F5 wegen SPA-CSS-Reload).
- Visueller Layout-Check auf allen 9 Seiten (Kontrast, Deko-Position, Schnee-Look,
  Baum-Glühen-Position relativ zum Bild).
- reduced-motion, offenes Modal und Print stichprobenartig prüfen.
