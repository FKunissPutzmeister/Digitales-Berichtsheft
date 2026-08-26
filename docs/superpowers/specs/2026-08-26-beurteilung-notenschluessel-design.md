# Beurteilungsbogen: IHK-Notenschlüssel sichtbar machen — Design

**Datum:** 2026-08-26
**Repo/Branch:** FKunissPutzmeister/Digitales-Berichtsheft · `Digitales-Berichtsheft`
**Status:** Entwurf zur Review

---

## 1. Kontext & Ziel

Auf der Beurteilungsseite ([app/beurteilung.html](../../../app/beurteilung.html),
Logik in [app/js/beurteilung-core.js](../../../app/js/beurteilung-core.js)) gibt es
heute genau einen unauffälligen Ghost-Button „Kriterienkatalog“, der ein Modal mit
den Bewertungsstufen-Texten öffnet. Der IHK-Notenschlüssel (Punkte → Schulnote,
sh. angehängtes PDF „Beurteilungsbogen IHK-Notenschlüssel.pdf“) ist zwar
**inhaltlich bereits vollständig im Code** (`PUNKTE_ZU_NOTE`-Array, `STUFEN`), aber
nirgends **anschaubar**. Zusätzlich ist nicht ersichtlich, dass Punkte auch frei
(nicht nur über die Stufen-Radios) eingetragen werden können.

Drei Änderungen an der Beurteilungsseite:

1. Zweiter Einstieg neben „Kriterienkatalog“: **„IHK-Notenschlüssel“**.
2. Beide Einstiege werden als **deutlich erkennbare, klickbare Buttons mit Icon**
   dargestellt (statt eines einzelnen unauffälligen Ghost-Buttons).
3. Kleiner Hinweis am Beurteilungsbogen selbst, dass Punkte frei vergeben werden
   können, unabhängig von der Stufenwahl.

Kein Datenmodell-, Backend- oder Rollen-Bezug — reine Frontend-Änderung an
`beurteilung-core.js` (+ CSS) plus eine neue statische Asset-Datei.

---

## 2. Getroffene Entscheidungen

| Aspekt | Entscheidung |
|---|---|
| Einstiegs-Layout | Zwei Buttons nebeneinander (📖 Kriterienkatalog / 🎯 IHK-Notenschlüssel), gleicher Stil wie der bestehende Button (`btn btn-ghost btn-sm`), nur mit Icon-Präfix |
| Notenschlüssel-Inhalt | **Generierte HTML-Tabelle** aus vorhandenen Daten (`PUNKTE_ZU_NOTE` + `STUFEN`) — kein Zweitpflege-Risiko, automatisch themefähig — **plus** Link „Original-PDF öffnen“ |
| Original-PDF | Als Datei ins Projekt gelegt: `app/templates/ihk-notenschluessel.pdf` (Muster: `app/templates/fahrgeld-vorlage.pdf`), Link mit `target="_blank" rel="noopener"` |
| Hinweis „frei wählbar“ | Kleiner Untertext unter der **„Punkte“-Spaltenüberschrift im Beurteilungsbogen** (`beurt-table`), gleicher Stil wie der bestehende Hinweis unter „Beurteilungsstufen“ (`.beurt-th-sub`) — **nicht** im Modal |
| Modal-Technik | Zweites Modal-Overlay analog `openKatalogModal()`, gleiche CSS-Klassen (`modal-overlay`, `modal modal--lg`) |
| Tests | Neue `node:test`-Fälle in `beurteilung-core.test.js` für die Gruppierungsfunktion |

---

## 3. UI — Einstiegspunkte

`beurt__kopf` in `renderForm()` bekommt statt des einzelnen
`<button id="beurtKatalogBtn">` einen Wrapper mit zwei Buttons:

```html
<div class="beurt__referenzen">
  <button type="button" class="btn btn-ghost btn-sm beurt__ref-btn" id="beurtKatalogBtn">
    <span aria-hidden="true">📖</span> Kriterienkatalog
  </button>
  <button type="button" class="btn btn-ghost btn-sm beurt__ref-btn" id="beurtNotenBtn">
    <span aria-hidden="true">🎯</span> IHK-Notenschlüssel
  </button>
</div>
```

CSS: `.beurt__referenzen` ersetzt `.beurt__katalog-btn` (`grid-column: 1 / -1`,
`display: flex`, `gap: var(--sp-3)`, `flex-wrap: wrap`). Icons sind Deko
(`aria-hidden`), der sichtbare Text bleibt die zugängliche Beschriftung.

---

## 4. UI — Notenschlüssel-Modal

Neue Funktion `openNotenschluesselModal()` (Struktur/Verhalten analog
`openKatalogModal()`: lazy erzeugtes Overlay, `.open`-Klasse, Schließen per
Backdrop-Klick/`data-modal-close`).

Inhalt:

```html
<div class="modal modal--lg">
  <div class="modal__header">
    <h2 class="modal__title">IHK-Notenschlüssel</h2>
    <button class="modal__close" type="button" data-modal-close aria-label="Schließen">×</button>
  </div>
  <div class="modal__body beurt-noten">
    <table class="beurt-noten__table">
      <thead><tr><th>Schulnote</th><th>Punkte</th><th>Bereich der Note</th></tr></thead>
      <tbody><!-- generiert, siehe §5 --></tbody>
    </table>
    <a class="beurt-noten__pdf-link" href="/templates/ihk-notenschluessel.pdf"
       target="_blank" rel="noopener">Original-PDF öffnen</a>
  </div>
</div>
```

Styling folgt dem bestehenden `.beurt-katalog`-Muster (Borders über
`var(--pm-grey-200)`, Kopfzeile `var(--pm-grey-50)`) — keine neuen Farb-Tokens.

---

## 5. Tabellen-Generierung aus vorhandenen Daten

Neue reine Funktion in `beurteilung-core.js`, Teil der exportierten `api`
(testbar wie `berechne`):

```js
function notenschluesselZeilen() {
  // Gruppiert PUNKTE_ZU_NOTE (Index = Punkte 0..100) nach Notenwert.
  // Punkte je Notenwert sind laut Datenlage stets zusammenhängend (0..100 absteigend).
  const byNote = new Map(); // note -> [punkte,...] absteigend
  for (let p = 100; p >= 0; p--) {
    const note = PUNKTE_ZU_NOTE[p];
    if (!byNote.has(note)) byNote.set(note, []);
    byNote.get(note).push(p);
  }
  return [...byNote.entries()].map(([note, punkte]) => ({
    note,
    punkteLabel: formatPunkteGruppe(punkte),
    stufe: stufeFuerPunkte(punkte[0]),          // erste (=höchste) Punktzahl der Gruppe
    verbal: STUFEN.find(s => s.stufe === stufeFuerPunkte(punkte[0])).verbal,
  }));
}

function formatPunkteGruppe(punkte) {
  // punkte: absteigend sortiertes Array, z.B. [99,98] oder [40,39,38]
  if (punkte.length === 1) return String(punkte[0]);
  if (punkte.length === 2) return `${punkte[1]} + ${punkte[0]}`;
  return `${punkte[punkte.length - 1]} - ${punkte[0]}`;
}
```

Rendering gruppiert zusätzlich pro `verbal`-Wert mit `rowspan` (wie im
Original-PDF: „sehr gut“ umspannt die Zeilen 1,0–1,4 usw.) — analog zur
bestehenden Block-Gruppierung in `blockHtml()`.

**Verifikation gegen das Original-PDF** (Stichproben, fließen als Tests ein):

| Schulnote | erwartet | Bereich |
|---|---|---|
| 1,0 | 100 | sehr gut |
| 1,1 | 98 + 99 | sehr gut |
| 3,9 | 59 + 60 | ausreichend |
| 5,0 | 38 - 40 | mangelhaft |
| 5,6 | 23 - 28 | ungenügend |
| 6,0 | 0 - 5 | ungenügend |

---

## 6. Hinweis „frei wählbar“

In `renderForm()`, Tabellenkopf der Kriterien-Tabelle:

```html
<th>Punkte<br><span class="beurt-th-sub">frei wählbar, unabhängig von der Stufe</span></th>
```

(Bisher nur `<th>Punkte</th>` ohne Subtext — Analogie zum bestehenden
`beurt-th-sub` unter „Beurteilungsstufen“.)

---

## 7. Asset

`app/templates/ihk-notenschluessel.pdf` — Kopie der vom Nutzer bereitgestellten
Datei `C:\Users\KunissF\Downloads\Beurteilungsbogen IHK-Notenschlüssel.pdf`.
Statisch ausgeliefert wie andere Dateien unter `app/` (kein Backend-Endpoint
nötig — Vorlage: `app/templates/fahrgeld-vorlage.pdf` wird ebenso direkt verlinkt).

---

## 8. Tests

Erweiterung von `app/js/beurteilung-core.test.js`:

- `notenschluesselZeilen()` liefert korrekte Anzahl Gruppen (Schulnoten 1,0…6,0
  mit Lücken bei 3,4/3,5-Übergang o.ä. — aus den tatsächlichen Stützstellen
  im Array ableiten, keine Annahme einer festen Zahl vorab treffen).
- `formatPunkteGruppe`: 1 Punktwert → reine Zahl; 2 → `"X + Y"`; 3+ → `"X - Y"`.
- Stichproben aus §5-Tabelle exakt gegen `notenschluesselZeilen()`-Ausgabe prüfen.

---

## 9. Out of Scope

- Keine Änderung an Berechnungslogik (`berechne`, `noteFuerPunkte` etc.).
- Kein PDF-Export des Notenschlüssels als Teil des Beurteilungsbogen-Drucks.
- Keine Rollen-/Rechte-Änderung — Modal ist für alle Betrachter der Seite gleich
  sichtbar (wie der bestehende Kriterienkatalog).
