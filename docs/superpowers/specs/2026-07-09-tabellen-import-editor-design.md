# Design: Tabellen im Berichtsheft (IHK-Import + Editor)

**Datum:** 2026-07-09
**Status:** Genehmigt

## Problem

Mehrere Azubis nutzen im IHK-Ausbildungsnachweis-Portal Tabellen (v. a. der
Schul-Block „Fach | Inhalte"). Beim Import in das Digitale Berichtsheft gehen
diese Tabellen kaputt:

1. **Parsing:** `itemsToText()` (ihk-import.js) gruppiert PDF-Textläufe nur
   nach y-Koordinate. Die linke Spalte („BWL") verschmilzt mit der ersten
   Inhaltszeile; Folgezeilen mehrzeiliger Zellen („o Prokura") verlieren den
   Bezug zum Fach. Die Tabellen-Zellränder (gestrichene Pfade) werden in
   `decodeUnderlineSegments()` (ihk-parser.js) bewusst verworfen — die
   Geometrie-Information wäre vorhanden, wird aber nicht genutzt.
2. **Editor:** Die Wochenansicht nutzt Quill **1.3.7** (CDN) — diese Version
   kann keine Tabellen. `dangerouslyPasteHTML` wirft `<table>` beim Laden weg.
3. **Export:** Die `RICH_ALLOWED`-Whitelist des App-eigenen PDF-Exports
   (berichtsheft-export.js) strippt Tabellen-Tags.

## Ziel

- Der IHK-Import erkennt Tabellen im PDF und übernimmt sie als **echte
  `<table>`-Strukturen** mit korrekter Zellzuordnung.
- Azubis können Tabellen **selbst im Editor erstellen und bearbeiten**
  (einfügen, Zeilen/Spalten verwalten, Zellen mergen).
- Tabellen erscheinen korrekt in der Ausbilder-Readonly-Sicht und im
  App-eigenen PDF-Export.

## Entscheidung: Ansatz A — Quill 2.x + `quill-table-better`

Geprüfte Alternativen:

- **B: Quill 2 + natives (experimentelles) Table-Modul** — keine
  Zusatz-Dependency, aber ohne UI (Eigenbau nötig), kein Zellen-Merge.
- **C: Editor-Wechsel (TipTap/ProseMirror)** — beste Tabellen-UX, aber
  mehrwöchiger Rewrite der gesamten Editor-Schicht (Toolbar, Autocomplete,
  Limits, CSS) plus Strukturbruch (npm/Bundler) im Vanilla-JS-Frontend.
  Unverhältnismäßig.

Ansatz A bietet das beste Verhältnis aus Nutzen und Migrationsrisiko und
passt zum bestehenden Setup (Drop-in-Dateien, lokal vendored).

## 1. Quill-2-Migration + Tabellen-Modul

- Quill 1.3.7 (CDN) → **Quill 2.x lokal vendored**
  (`app/js/vendor/quill.min.js`, `app/css/vendor/quill.snow.css`).
  Beseitigt nebenbei die CDN-Abhängigkeit auf dem Intranet-Server.
- **`quill-table-better`** (JS + CSS) ebenfalls vendored und als Quill-Modul
  registriert. Liefert die Tabellen-UI: Einfügen per Raster-Picker,
  Zeilen/Spalten hinzufügen/entfernen, Zellen mergen, Tabelle löschen.
- `QUILL_TOOLBAR` (wochenansicht.js) erhält einen „Tabelle einfügen"-Button;
  das Kontextmenü für Zeilen/Spalten kommt vom Modul.
- Nachzutestende Integrationen (APIs existieren in Quill 2 weiter, Verhalten
  prüfen): `dangerouslyPasteHTML`-Laden, `attachActivityAutocomplete`,
  `markQuillLimit`/Zeichenzähler, History (Strg+Z), Readonly-Modus
  (Ausbilder-Sicht: Tabellen werden angezeigt, nicht editierbar).
- `app/css/quill-editor.css` auf Quill-2-Klassenänderungen prüfen und
  Tabellen-Styling ergänzen (Rahmen, Zellen-Padding, beide Themes/Dark-Mode).

## 2. IHK-Import: Tabellenerkennung im Parser

- **Neue Geometrie-Stufe** in `ihk-parser.js`: Aus der pdf.js-Operatorliste
  zusätzlich die *gestrichenen* Linien/Rechtecke sammeln und zu Zellgittern
  clustern. **Heuristik: nur Gitter mit ≥ 2 Spalten und ≥ 2 Zeilen gelten als
  Tabelle** — schließt einspaltige Layout-Boxen (Wochenkopf, Tageskarten)
  sicher aus.
- `itemsToText()` (ihk-import.js): Textläufe innerhalb eines erkannten
  Gitters werden **pro Zelle** gesammelt (statt pro y-Zeile über Spalten
  hinweg verschmolzen). Die Tabelle wandert als **In-Band-Blockmarker**
  (analog zu den bestehenden `\x02…\x03`-Formatmarkern) durch den
  Zeilenstrom, damit Wochen-Splitting und Rausch-Filter unverändert
  funktionieren.
- `linesToHtml()` wandelt den Tabellenmarker in
  `<table><tbody><tr><td><p>…` um; Fett/Kursiv/Unterstrichen innerhalb der
  Zellen bleibt erhalten (bestehende Format-Marker gelten auch in Zellen).
- **Fallback ohne Datenverlust:** Schlägt die Gittererkennung für einen
  Bereich fehl (unvollständige Ränder, exotisches Layout), greift das heutige
  zeilenweise Verhalten.
- Tabellenmarker werden nur innerhalb der Textblöcke (Schule/Betrieb/
  Unterweisung bzw. Tagesbeschreibung im Tagesbasis-Format) zu Tabellen —
  Strukturzeilen (Tageszeilen, Wochenmarker, Statuskopf) bleiben vom
  Tabellenpfad unberührt.

## 3. Speicherung & Datenmodell

**Keine Schema-Änderung.** Tabellen leben als HTML im bestehenden
Eintrag-HTML (`NVARCHAR(MAX)`, backend/routes/wochen.js speichert
ungefiltert). Bestehende Einträge bleiben unverändert kompatibel; das
Delta-Format von Quill 2 lädt Quill-1-Inhalte problemlos.

## 4. App-eigener PDF-Export

- `RICH_ALLOWED`-Whitelist (berichtsheft-export.js) um
  `table, thead, tbody, tr, th, td` erweitern. Der Sanitizer verwirft
  weiterhin alle Attribute — Spaltenbreiten aus dem Editor erscheinen im
  Export als gleichverteilte Spalten (bewusst einfach gehalten).
- Druck-CSS: Tabellenrahmen, Zellen-Padding, Seitenumbruch-Verhalten
  (`page-break-inside: avoid` je Tabellenzeile).

## 5. Nicht betroffen

- Dashboard/Jahresansicht: prüfen nur, *ob* Inhalt existiert, rendern kein
  Eintrag-HTML.
- Activity-Suggestions: arbeiten auf Textbasis (`textContent`);
  Tabelleninhalte fließen als Textzeilen ein — akzeptiert.
- Backend/DB: keine Änderung.

## 6. Tests

- Node-Tests in `ihk-parser.test.js` erweitern: Gitter-Clustering,
  Zellzuordnung, Marker→HTML, Fallback-Verhalten, Wochen- und
  Tagesbasis-Format.
- Manuelle Verifikation mit dem echten Beispiel-Export (Celikten,
  „Berichtsheft Export mit tabellen.pdf") über den lokalen Dev-Server
  (localhost:3000) inkl. visuellem Layout-Check (Editor, Readonly,
  PDF-Export) per Playwright/Edge.
