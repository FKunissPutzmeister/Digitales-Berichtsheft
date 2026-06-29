# Auto-Complete für häufige Tätigkeiten — Design

- **Datum:** 2026-06-24
- **Status:** Design freigegeben (vor Implementierungsplanung)
- **Bereich:** Wochenansicht (Tätigkeitsfelder des Berichtshefts)

## 1. Kontext & Problem

Im Berichtsheft tippt der Azubi seine Tätigkeiten in die Tätigkeitsfelder der
Wochenansicht. Diese Felder sind **Quill-Rich-Text-Editoren** (`new Quill(...)`,
Inhalt als HTML über `quill.root.innerHTML`), keine `<input>`/`<textarea>`. Pro
Tag existieren bis zu drei Editoren (Betrieb / Schule / Unterweisung), im
Wochenmodus ebenso drei (`woche_betrieb` / `woche_schule` / `woche_unterweisung`).
Alle Instanzen liegen in der globalen Map `quillInstances`.

Wiederkehrende Tätigkeiten müssen heute jedes Mal neu getippt werden. Eine
Eingabehilfe soll während des Tippens passende, bereits bekannte Tätigkeiten
vorschlagen — schneller und konsistenter, ohne Freitext einzuschränken.

## 2. Ziele / Nicht-Ziele

**Ziele**
- Während der Eingabe passende Vorschläge aus bekannten Tätigkeiten anzeigen.
- Übernahme per Maus, Touch und Tastatur (Pfeiltasten, Enter, Escape, Tab).
- Beim Fokus auf eine leere Zeile sofort Top-Vorschläge zeigen.
- Übereinstimmenden Teil im Vorschlag visuell hervorheben.
- Max. 5–8 Vorschläge gleichzeitig.
- Freitext bleibt jederzeit erlaubt; keine Pflichtauswahl, kein Auto-Einfügen.
- Barrierefrei (ARIA-Combobox, Screenreader-tauglich).

**Nicht-Ziele**
- Den gesamten Bericht automatisch schreiben.
- Globale Standard-/Vorlagenliste (out of scope, s. §9).
- Azubi-übergreifender Vorschlag-Pool (out of scope, s. §9).
- Backend-Änderungen (Feature ist rein clientseitig).

## 3. Getroffene Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | **Granularität: zeilenweise Tätigkeit.** Jede Klartextzeile / jeder Stichpunkt früherer Einträge ist ein eigener Vorschlag. | Entspricht „wiederkehrende Tätigkeiten"; ganze Tagesblöcke wiederholen sich selten 1:1. |
| D2 | **Datenbasis: nur eigene Historie des Azubis.** Keine globale Liste, kein Fremd-Pool. | Einfachste, datenschutzfreundlichste Lösung; kein Backend nötig. Kaltstart (kein Verlauf) = keine Vorschläge, bis selbst geschrieben wurde. |
| D3 | **Ansatz: eigenes Typeahead-Overlay an Quill.** Kein natives `<datalist>`, keine Fremd-Library. | `<datalist>` lässt sich nicht am Cursor in mehrzeiligem Rich-Text positionieren und bietet kein Match-Highlight/Ranking. Fremd-Library = unnötige CDN-Abhängigkeit in der build-freien Vanilla-App. |
| D4 | **Vorschläge pro Kind getrennt** (Betrieb↔Betrieb, Schule↔Schule, Unterweisung↔Unterweisung). | Schulinhalte ≠ Betriebstätigkeiten ≠ Unterweisungsthemen → vermeidet Rauschen. |
| D5 | **Nur im bearbeitbaren Azubi-View aktiv**, nicht in Readonly/Ausbilder-Sicht. | Korrektoren tippen keine Tätigkeiten; Readonly-Editoren haben keine Toolbar. |

## 4. Architektur

Drei kleine, klar getrennte Einheiten plus ein Stylesheet. Reine Logik ist von
DOM und DB entkoppelt und dadurch unit-testbar.

```
DB.getWochenFuerAzubi ──► activity-suggestions.js ──► (ranked lines per kind)
                              ▲  (pure logic, no DOM)        │
                              │                              ▼
wochenansicht.js  ──attach──► activity-autocomplete.js ──► Dropdown-Overlay
   (initSingleDayEditor /         (UI-Controller,            (DOM, ARIA,
    Wochen-Editor-Init)            no DB knowledge)           Keyboard)
```

### 4.1 `app/js/activity-suggestions.js` — Daten & Ranking (pure, testbar)

Kein DOM-Zugriff. Dual-Export wie `ihk-parser.js`
(`global.ActivitySuggestions = api; if (module?.exports) module.exports = api;`),
damit die Logik unter `node:test` läuft.

Öffentliche API:
- `htmlToLines(html) -> string[]` — zerlegt einen Eintrags-HTML-String pro
  Blockelement (`<p>`, `<li>`, `<div>`, `<h1..3>`, `<br>`) in Klartextzeilen,
  strippt Tags/`&nbsp;`, trimmt und verwirft leere Zeilen.
- `normalize(line) -> string` — Vergleichsschlüssel: lowercase, Akzente
  entfernt (`String.prototype.normalize('NFD')` + Diakritika-Strip), Mehrfach-
  Whitespace zu einem Space.
- `buildIndex(wochen) -> Index` — iteriert alle Wochen → alle `tage` **und** die
  Wochen-Ebene; sammelt Zeilen je Kind (`betrieb`/`schule`/`unterweisung`) aus
  `betriebEintrag` / `eintrag` (Alt-Feld) / `schuleEintrag` / `unterweisungEintrag`.
  Ergebnis je Kind: `Map<normalize(line), { text, count, lastDate }>`
  (`text` = zuletzt gesehene Original-Schreibweise, `lastDate` = ISO-Datum des
  jüngsten Vorkommens).
- `query(index, kind, q, limit=7) -> Array<{ text, matchStart, matchLen }>` —
  Ranking s. §6; `matchStart/matchLen` markieren den hervorzuhebenden Bereich
  (`-1` wenn kein Highlight, d. h. bei leerem `q`).
- `bump(index, kind, text)` — `count++` und `lastDate = heute` für eine
  übernommene Zeile (sofort höheres Ranking). *Hinweis:* „heute" wird als
  Argument hereingereicht (Testbarkeit / keine versteckte `Date.now`-Abhängigkeit
  in der reinen Logik).

Laufzeit-Wrapper (Browser, mit DB/Cache):
- `ensure(azubiId) -> Promise<Index>` — baut den Index **einmal pro `azubiId`**
  (`DB.getWochenFuerAzubi`), cached in-memory; weitere Aufrufe liefern den Cache.
- `invalidate(azubiId)` — verwirft den Cache (Azubi-Wechsel/Seitenwechsel).

### 4.2 `app/js/activity-autocomplete.js` — UI-Controller

Kein DB-Wissen. Dual-Export (`global.ActivityAutocomplete`).

- `attach(quill, { kind, getSuggestions, onAccept }) -> { destroy() }`
  - `getSuggestions(q) -> Array<{text,matchStart,matchLen}>` (vom Aufrufer an
    `ActivitySuggestions.query` gebunden).
  - `onAccept(text)` (optional) — z. B. für `bump`.
- **Query-Ermittlung:** `sel = quill.getSelection()`; `[line] = quill.getLine(sel.index)`;
  `lineStart = quill.getIndex(line)`; `q = quill.getText(lineStart, sel.index - lineStart)`
  (= auf der aktuellen Zeile bis zum Cursor Getipptes). Trim für die Abfrage.
- **Trigger:** auf `selection-change` (Focus/Cursor) und `text-change`. Leeres
  `q` bei Fokus → Top-N. `q.length >= 1` → Live-Filter. Listener werden
  entprellt (~80 ms), Quill-eigene Saves bleiben unberührt.
- **Positionierung:** Dropdown wird an `document.body` gehängt
  (`position: fixed`), Koordinaten = `quill.root.getBoundingClientRect()` +
  `quill.getBounds(sel.index)` → direkt unter der aktuellen Zeile. Reposition bei
  `scroll`/`resize` (capture, throttled), solange offen. Body-Anker vermeidet
  Clipping durch `overflow` der Tageskarten.
- **Keyboard:** Capture-Phase-`keydown` auf `quill.root`. **Nur bei offenem
  Dropdown** werden abgefangen (`preventDefault` + `stopPropagation`, damit
  Quills eigene Bindings nicht feuern): `ArrowDown`/`ArrowUp` (Auswahl bewegen,
  mit Wrap), `Enter`/`Tab` (markierten Vorschlag übernehmen), `Escape`
  (schließen, Fokus bleibt im Editor). Ohne offenes Dropdown: Tasten laufen
  normal durch.
- **Übernahme:** `quill.deleteText(lineStart, sel.index - lineStart, 'user')` +
  `quill.insertText(lineStart, text, 'user')` + Caret ans Ende
  (`quill.setSelection(lineStart + text.length, 0)`). Klartext-Insert → keine
  Fremdformatierung. Danach `onAccept(text)`, Dropdown schließen.
- **Schließen:** Escape, Außenklick (Pointerdown außerhalb Editor+Dropdown),
  Blur des Editors, Cursor verlässt die Zeile, keine Treffer.
- **Maus/Touch:** `mousedown` auf einem Option-Eintrag übernimmt (auf
  `mousedown`, nicht `click`, damit der Editor-Blur die Liste nicht vorher
  schließt); Hover markiert den Eintrag.
- `destroy()` — alle Listener (Quill + window + body) entfernen, Dropdown aus
  dem DOM lösen.

### 4.3 Integration in `app/js/wochenansicht.js`

- Modul-lokale Registry `activeAutocompletes = []`.
- `detachAllAutocompletes()` — am **Anfang jedes `render()`** aufrufen (Editoren
  werden pro Render neu erzeugt → sonst Listener-Leaks/Doppelauslösung) sowie bei
  `beforeunload`.
- In `initSingleDayEditor(...)` und `initSingleWochenEditor(...)` (Voll-Aufbau
  über `initWochenQuillEditors`): nach `new Quill`, **falls `!readonly` und
  Azubi-View**, einmal
  `ActivitySuggestions.ensure(azubiId)` sicherstellen und
  `ActivityAutocomplete.attach(quill, { kind, getSuggestions, onAccept })`; Handle
  in die Registry legen.
- `azubiId` = `viewAzubiId || user.id`. Bei Azubi-Wechsel
  `ActivitySuggestions.invalidate(alterAzubiId)`.

### 4.4 CSS / Theming

- Neues `app/css/activity-autocomplete.css`, in `wochenansicht.html` nach
  `quill-editor.css` verlinkt.
- Nutzt bestehende Design-Tokens (`--pm-*`, Flächen-/Elevation-Variablen) →
  erbt automatisch Light/Dark und alle Sonder-Themes.
- Klassen: `.ac-dropdown` (Container, `role=listbox`), `.ac-option`
  (`role=option`), `.ac-option--active` (markiert), `.ac-option__match`
  (hervorgehobener Treffer, fett/Akzentfarbe). Hoher `z-index` über Quill-Toolbar.

## 5. Detailverhalten

- **Fokus, leere Zeile:** Top-7-Vorschläge des Kinds (nach Häufigkeit, dann
  Aktualität), kein Highlight.
- **Ab 1 Zeichen:** Live-Filter, Trefferbereich hervorgehoben.
- **Übernahme:** ersetzt das auf der Zeile Getippte durch den vollen
  Vorschlagstext; Cursor ans Ende; Eingabe läuft normal weiter.
- **Nichts erzwungen:** Schließen ohne Auswahl lässt den getippten Freitext
  unangetastet.
- **Leerer Index (Kaltstart):** kein Dropdown.

## 6. Ranking-Algorithmus (`query`)

1. **Leeres `q`:** alle Einträge des Kinds, sortiert nach `count` ⬇, dann
   `lastDate` ⬇; auf `limit` gekürzt; `matchStart = -1`.
2. **Nicht-leeres `q`** (`nq = normalize(q)`): Kandidat qualifiziert sich, wenn
   `normalize(text)`
   - mit `nq` **beginnt** (Voll-Präfix, Rangklasse 0), **oder**
   - ein **Wort** enthält, das mit `nq` beginnt (Token-Präfix, Rangklasse 1).
   Sortierung: Rangklasse ⬆, dann `count` ⬇, dann `lastDate` ⬇, dann
   alphabetisch. `limit` Treffer.
   **Highlight:** `matchStart` = case-insensitiver `indexOf` von `q` im
   Original-`text` (Voll-Präfix ⇒ 0; Token-Präfix ⇒ Tokenstart), `matchLen` =
   `q.length`. Lässt sich der Treffer akzent-/sonderzeichenbedingt nicht als
   literaler Teilstring lokalisieren, gilt `matchStart = -1` (kein Highlight,
   Treffer bleibt gültig). `normalize` dient ausschließlich dem **Vergleich**,
   nie der Positionsberechnung (NFD-Zerlegung ist nicht längenerhaltend).
3. Eine Zeile, die exakt dem aktuellen `q` entspricht, wird ausgelassen
   (kein Vorschlag „vervollständige zu dem, was schon dasteht").

## 7. Barrierefreiheit

- Editor-Root: `aria-autocomplete="list"`, `aria-expanded` (true/false),
  `aria-controls` = Dropdown-ID, `aria-activedescendant` = ID der markierten
  Option (während offen).
- Dropdown `role="listbox"`, Optionen `role="option"` mit `aria-selected`.
- Vollständige Tastaturbedienung (§4.2). Escape gibt Fokus nie aus dem Editor.
- `prefers-reduced-motion`: keine Einblende-Animation.

## 8. Edge Cases

- **Mehrere offene Tage gleichzeitig:** je Editor ein eigenes Handle; nur der
  fokussierte Editor zeigt ein Dropdown. Beim Öffnen eines neuen schließt das
  alte (globaler „nur eines offen"-Wächter).
- **Re-Render während offenem Dropdown** (Autosave/KW-Wechsel):
  `detachAllAutocompletes()` schließt sauber.
- **Sehr lange Zeile / Scroll:** Reposition bei Scroll; notfalls Schließen.
- **HTML-Sonderzeichen** in Vorschlägen: Optionen werden als `textContent`
  gesetzt bzw. escaped gerendert (kein HTML-Inject).
- **Theme-Wechsel zur Laufzeit:** CSS-Variablen → automatisch korrekt.
- **Duplikate / Schreibvarianten:** über `normalize` zusammengefasst, Anzeige in
  jüngster Original-Schreibweise.

## 9. Out of Scope (v1, bewusst — YAGNI)

- Globale Standard-/Vorlagen-Tätigkeitsliste.
- Azubi-übergreifender (anonymisierter) Pool.
- Live-Reindex innerhalb derselben Sitzung: in dieser Sitzung neu getippte
  Zeilen erscheinen erst nach nächstem Load als Vorschlag (Index baut bei
  `ensure` + `bump` bei Übernahme). Akzeptierte Vorschläge ranken via `bump`
  sofort höher.
- Server-seitiges Ranking / Persistenz von Häufigkeiten.

## 10. Teststrategie

- **Unit (`node:test`, kolokiert):** `app/js/activity-suggestions.test.js`
  - `htmlToLines`: `<p>`/`<li>`/`<br>`-Splitting, Tag-Strip, `&nbsp;`, Leerzeilen,
    Alt-Feld `eintrag`.
  - `normalize`: Case/Akzente/Whitespace.
  - `buildIndex`: Zählung über mehrere Wochen, `lastDate`, Kind-Trennung.
  - `query`: leeres `q` (Top-N nach count/recency), Voll- vs. Token-Präfix-Rang,
    `limit`, Exakt-Match-Ausschluss, `matchStart/matchLen`.
  - `bump`: count/lastDate-Anhebung mit injiziertem Datum.
- **Manuell (Edge + Backend lokal):** `node server.js` (Port 3000) + Edge via
  npx-Playwright — Fokus-Top-Vorschläge, Live-Filter+Highlight, Keyboard
  (↑↓/Enter/Esc/Tab), Maus/Touch, Übernahme ersetzt nur die Zeile, Freitext
  bleibt frei, Readonly/Ausbilder zeigt nichts, Theme-Durchlauf (inkl.
  Dark + Sonder-Themes). Hartes Reload (Strg+F5) wegen SPA-CSS/JS-Caching.

## 11. Betroffene Dateien

**Neu**
- `app/js/activity-suggestions.js`
- `app/js/activity-suggestions.test.js`
- `app/js/activity-autocomplete.js`
- `app/css/activity-autocomplete.css`

**Geändert**
- `app/wochenansicht.html` — zwei neue `<script>` + ein `<link>`.
- `app/js/wochenansicht.js` — Registry + `detachAllAutocompletes()` in `render()`,
  `attach`-Aufrufe in `initSingleDayEditor` und `initSingleWochenEditor`,
  `invalidate` bei Azubi-Wechsel.
