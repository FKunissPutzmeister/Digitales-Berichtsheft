# Fahrgelderstattung — Eigene Signatur erstellen (Zeichnen / Tippen / Hochladen)

**Datum:** 2026-07-24
**Feature:** Signatur-Erstellung für die Fahrgelderstattung
**Betroffene Seite:** [app/fahrgelderstattung.html](../../../app/fahrgelderstattung.html)

## Problem

Beim Erzeugen der Fahrgelderstattung lässt sich aktuell nur ein **Bild** als
Unterschrift hochladen. Das Ergebnis sieht oft schlecht aus (falsches
Seitenverhältnis, Hintergrund, Auflösung), weil hochgeladene Fotos/Scans selten
zum schmalen Unterschriftsbereich passen. Nutzer sollen ihre Signatur stattdessen
direkt in der App erstellen können — bequem und in gleichbleibender Qualität.

## Ziele

1. **Getippte Signatur** — Name als Text eingeben, wird in Handschrift-Optik
   gerendert (wie die Signatur-Funktion in PDF-Programmen).
2. **Gezeichnete Signatur** — mit Maus/Touch/Stift auf einer Zeichenfläche
   unterschreiben.
3. **Upload bleibt erhalten**, wird aber **weniger präsent** dargestellt (nur
   noch als dritter Tab, nicht mehr als eigener Button auf der Karte).

## Nicht-Ziele (YAGNI)

- Keine serverseitige Speicherung der Signatur (bleibt lokal je Nutzer im
  `localStorage`, wie bisher).
- Keine Signatur-Verwaltung mit mehreren gespeicherten Signaturen.
- Keine Änderung an der Einbettungslogik in Excel/PDF.

## Kern-Erkenntnis: Einheitliche Schnittstelle

Die Excel-/PDF-Einbettung in [app/js/fahrtgeld-core.js](../../../app/js/fahrtgeld-core.js)
erwartet ausschließlich `unterschriftBytes` (ArrayBuffer) + `unterschriftExtension`
(`'png'` | `'jpeg'`). Im UI wird die Signatur in [app/js/fahrgelderstattung.js](../../../app/js/fahrgelderstattung.js)
(Zeilen ~47–64) als `{ dataUrl, extension }` im `localStorage` gehalten und über
`setSignature()` gesetzt.

**Konsequenz:** Alle drei Eingabemethoden müssen lediglich eine PNG-`dataUrl`
erzeugen und `setSignature({ dataUrl, extension: 'png' })` aufrufen. Die
Einbettungslogik (Core) und die Persistenz bleiben **komplett unverändert**. Das
Feature ist damit risikoarm — es kommt im Wesentlichen *ein neuer Weg zur
Erzeugung der dataUrl* hinzu.

## Architektur

### Neues Modul: `app/js/fahrtgeld-signatur.js`

`fahrgelderstattung.js` ist bereits ~600 Zeilen groß. Die Canvas-, Tipp- und
Font-Logik gehört nicht zusätzlich hinein. Ein neues, isoliertes Modul kapselt
den Dialog und stellt eine schmale Schnittstelle bereit:

```js
// Öffnet das Signatur-Modal. Ruft onSave mit { dataUrl, extension:'png' }
// auf, sobald der Nutzer eine Signatur übernimmt.
SignaturDialog.open({
  name,               // Vorbelegung fürs Tipp-Feld (aus Stammdaten)
  onSave: (sig) => {} // sig = { dataUrl, extension:'png' } | null
})
```

- Als globales IIFE-Modul wie die übrigen `app/js/*.js` (kein Bundler im Projekt).
- Kennt weder `localStorage` noch Core — nur Ein-/Ausgabe über `open()`/`onSave`.
- Wird in [app/fahrgelderstattung.html](../../../app/fahrgelderstattung.html) vor
  `fahrgelderstattung.js` eingebunden.

### Verantwortlichkeiten

| Einheit | Aufgabe | Abhängigkeiten |
|---|---|---|
| `fahrtgeld-signatur.js` | Modal-UI, 3 Tabs, Canvas-Zeichnen, Text→Canvas-Rendering, Export als PNG-dataUrl | `Modal`-Helper, geladene Fonts |
| `fahrgelderstattung.js` | ruft `SignaturDialog.open`, speichert via `setSignature`, rendert Karte/Vorschau | `fahrtgeld-signatur.js`, `FahrtgeldCore` |
| `fahrtgeld-core.js` | **unverändert** — Einbettung Excel/PDF | — |

## UI-Design

### Signatur-Karte (vereinfacht)

Die Unterschrift-Sektion der Stammdaten-Karte in `buildStammdatenCard()`
([fahrgelderstattung.js](../../../app/js/fahrgelderstattung.js) ~147–190) wird
umgebaut:

- **Vorher:** Buttons „Bild hochladen"/„Ersetzen" + „Entfernen".
- **Nachher:** ein primärer Button **„Unterschrift erstellen"** (bzw. **„Ändern"**,
  wenn vorhanden) + **„Entfernen"** (nur wenn vorhanden) + Vorschau-Bild.
- Der direkte Upload-Button verschwindet von der Karte → Upload nur noch im
  Modal-Tab (weniger präsent).

### Signatur-Modal (`fgSigModal`)

Über den bestehenden `Modal`-Helper (`Modal.open` / `Modal.closeAll` /
`data-modal-close`), gleiches Markup-Muster wie `buildModal()` in
`fahrgelderstattung.js`. Drei Tabs:

```
┌─ Unterschrift erstellen ───────────────┐
│ [ Zeichnen ][ Tippen ][ Hochladen ]    │
│                                        │
│   ╭──────────────────────────────────╮ │
│   │   (Zeichenfläche / Feld / Upload) │ │
│   ╰──────────────────────────────────╯ │
│                                        │
│              [Abbrechen] [Übernehmen]  │
└────────────────────────────────────────┘
```

**Tab „Zeichnen"**
- `<canvas>` als Zeichenfläche, weißer Hintergrund.
- **Pointer-Events** (`pointerdown`/`pointermove`/`pointerup`) → Maus, Touch und
  Stift ohne Sonderbehandlung. `touch-action:none` am Canvas gegen
  Scroll-Konflikt.
- **High-DPI:** internes Canvas `width = cssWidth * devicePixelRatio`, Context
  entsprechend skaliert; Linien mit `lineJoin/lineCap = 'round'` geglättet.
- Button **„Löschen"** leert die Fläche.

**Tab „Tippen"**
- Textfeld (vorbelegt mit `name` aus Stammdaten).
- **3 Handschrift-Stile** zum Durchklicken (Radio/Chips), Live-Vorschau des
  eingegebenen Textes.
- Text wird zentriert auf ein Canvas gerendert (`fillText`), weißer Hintergrund.

**Tab „Hochladen"** (dezent, dritter Platz)
- Die bestehende `uploadSignatureImage`-Logik zieht hierher; PNG/JPG bleibt
  erlaubt. Hinweis auf empfohlene Alternativen (Zeichnen/Tippen).

### Übernehmen

„Übernehmen" exportiert den aktiven Tab, ruft `onSave({ dataUrl, extension:'png' })`
und schließt das Modal. `fahrgelderstattung.js` speichert per `setSignature` und
rendert neu.

## Bild-Export

Beide Canvas-Modi (Zeichnen + Tippen):

1. **Weißer Hintergrund** (bewusste Entscheidung): robuster als transparent, keine
   Anti-Aliasing-Ränder; der Unterschriftsbereich im Fahrgeld-Formular ist ohnehin
   weiß.
2. **Auf Bounding-Box getrimmt** — freier Rand wird abgeschnitten, damit
   Seitenverhältnis und Skalierung stimmen. Die vorhandene
   `liesBilddimensionen`-Aspect-Ratio-Logik im Core verwendet das direkt weiter.
3. Export via `canvas.toDataURL('image/png')` → `extension: 'png'`.

## Fonts

- **2–3 Handschrift-Fonts mit OFL-Lizenz** (z.B. *Dancing Script*, *Caveat*,
  *Sacramento*), **lokal** in `app/assets/fonts/` (kein CDN — self-contained,
  konsistent mit bestehenden Fonts wie `Oswald-Variable.ttf`).
- `@font-face`-Regeln in [app/css/fahrgelderstattung.css](../../../app/css/fahrgelderstattung.css),
  Muster wie in `variables.css` (mit `font-display:swap`).
- **Kritisch:** vor dem `fillText` `await document.fonts.load('<size> <family>')`
  bzw. `document.fonts.ready` awaiten — sonst rendert der erste Versuch im
  Fallback-Font oder leer.

## Fehlerbehandlung

- **Leere Signatur:** „Übernehmen" ohne gezeichneten Inhalt / ohne Text →
  Hinweis-Toast, kein Speichern (leeres Bild vermeiden).
- **Font lädt nicht:** Rendering erst nach `document.fonts.ready`; schlägt der
  Load fehl, Fallback auf Systemschrift + Warn-Log (kein harter Fehler).
- **Upload falsches Format:** bestehende Prüfung (PNG/JPG) bleibt, Warn-Toast.

## Test-Strategie

Manuelles Verifizieren über die lokale App (Node auf `:3000`, Edge via
Playwright — siehe Projekt-Memory „Lokales App-Testing"):

1. Zeichnen → Übernehmen → Vorschau auf Karte erscheint.
2. Tippen (jeder der 3 Stile) → Vorschau, Stil sichtbar unterschiedlich.
3. Upload weiterhin funktionsfähig (jetzt im Tab).
4. Excel **und** PDF generieren → Signatur korrekt eingebettet (Seitenverhältnis,
   Position, Datum darunter) — für alle drei Eingabearten identisch, da gleicher
   `setSignature`-Pfad.
5. „Entfernen" → Signatur weg, Datum bleibt.
6. High-DPI: gezeichnete Linie im generierten Dokument scharf (nicht pixelig).

## Offene Punkte

- Konkrete Font-Dateien müssen einmalig ins Repo geladen werden (OFL, kein CDN).
