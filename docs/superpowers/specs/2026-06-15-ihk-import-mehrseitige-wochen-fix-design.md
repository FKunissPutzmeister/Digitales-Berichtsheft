# IHK-Import — Fix: mehrseitige Wochen, Qualifikationen-Blöcke, Berichtsform-Gating

**Datum:** 2026-06-15
**Status:** In Arbeit
**Bezug:** ergänzt/korrigiert [2026-05-27-ihk-berichtsheft-import-design.md](2026-05-27-ihk-berichtsheft-import-design.md)

---

## Problem

Der IHK-Import übernimmt nicht alle Tage/Zeiten und teils keinen Ort. An einer
echten Export-PDF (`Berichtsheft exporte/Flo K.pdf`, 128 Seiten, pdf.js 3.11.174)
nachgestellt: Woche 06.01.2025 hat 5 Tage, importiert werden nur **2**.

Drei belegte Ursachen — alle aus der falschen Grundannahme **„eine PDF-Seite = eine Woche"**:

1. **`Qualifikationen:` mitten auf der Seite kappt den Rest.**
   [ihk-parser.js:107](../../app/js/ihk-parser.js#L107) setzt bei der ersten
   `Qualifikationen:`-Zeile `skipRest = true`. Tatsächlich druckt der Export
   **nach jedem Tag** einen Qualifikationen-Block → alle Folgetage der Seite
   (z. B. `Mi | 08.01. | Betrieb | anwesend 07:25`) werden verworfen.

2. **Eine Woche erstreckt sich über mehrere PDF-Seiten.**
   Fortsetzungsseiten tragen den Kopf „Ausbildungsnachweis auf Wochenbasis", aber
   **keinen** `Ausbildungswoche DD.MM.YYYY bis …`-Marker.
   [parsePage](../../app/js/ihk-parser.js#L148) gibt ohne Wochenkopf `null` zurück
   → die ganze Fortsetzungsseite (Do+Fr mit Zeiten **und** Ort, plus Textblöcke)
   geht verloren.

3. **Inhaltsverzeichnis kollidiert mit `WOCHE_RE`.**
   Die TOC-Seiten (3–5) enthalten „Ausbildungswoche 30.12.2024 bis 08.02.2026"
   (Gesamt-Exportzeitraum) und matchen damit `WOCHE_RE` als Schein-Woche.

Kombiniert erklärt das exakt „nicht alle Zeiten ordentlich übernommen" und
„Ort teilweise nicht eingetragen".

### Bestätigte PDF-Struktur

```
Seite 1   Deckblatt        ("IHK Ausbildungsnachweis", Stammdaten, Exportzeitraum)
Seite 2   Übersicht        (Zähler Bearbeitung/Prüfung/…)
Seite 3–5 Inhaltsverzeichnis (Wochenliste + Seitenzahl + Anwesend/Abwesend + Ort)
Seite 6+  Detailseiten je Woche:
            erste Seite einer Woche:  "Ausbildungsnachweis auf Wochenbasis"
                                      Stammzeile, "Status …",
                                      "Ausbildungswoche A bis B",
                                      "Schule/Betrieb",
                                      Textblöcke Schule:/Betrieb:/Unterweisung:,
                                      Tageszeilen (Mo…), je Tag gefolgt von
                                      Dublette-Zeitzeile + "Qualifikationen:"-Block
            Folgeseite(n):            "Ausbildungsnachweis auf Wochenbasis",
                                      direkt weiter mit Qualifikationen/Tageszeilen,
                                      Abschluss "Dauer gesamt: HH:MM", "Seite N"
```

---

## Lösung (Ansatz A: dokumentweite State-Machine)

Änderung im Wesentlichen nur in [ihk-parser.js](../../app/js/ihk-parser.js).
[ihk-import.js](../../app/js/ihk-import.js) bleibt bis auf das Gating unverändert;
die pdf.js-Extraktion (`extractPages` → Array von Seiten-Strings) und die
Datenstruktur bleiben gleich.

### Parser-Umbau

1. **`parse(pages)`** fügt die Seiten-Strings zu **einem** Zeilenstrom zusammen
   und entfernt Rausch-Zeilen, bevor gesplittet wird:
   - `Seite N`
   - `Ausbildungsnachweis auf Wochenbasis`
   - `Dauer gesamt: HH:MM`
   - alleinstehende Dublette-Zeitzeilen (`^\d{1,2}:\d{2}$`)
2. **Wochen-Split** an `WOCHE_RE`, aber nur gültig, wenn die Spanne
   **≤ 10 Tage** ist → der TOC-Treffer „30.12.2024 bis 08.02.2026" wird verworfen.
   Alle Zeilen **vor** dem ersten gültigen Wochen-Marker (Deckblatt, Übersicht,
   Inhaltsverzeichnis) gehören zu keiner Woche und werden verworfen; TOC-Zeilen
   matchen weder `DAY_RE` noch eine gültige (≤10 Tage) `WOCHE_RE`.
3. **`parsePage` → `parseWeek(lines)`**: die bestehende Tages-/Textblock-/
   Merge-Logik bleibt erhalten (sie ist korrekt, sobald die Wochengrenzen stimmen),
   nur die Qualifikationen-Behandlung ändert sich.
4. **`Qualifikationen:` → Skip-Sub-Modus** statt `skipRest`. Der Skip endet bei der
   nächsten Zeile, die eines erfüllt:
   - `DAY_RE` (nächste Tageszeile),
   - `WOCHE_RE` (nächste Woche),
   - Abschnitts-Header `Schule:` / `Betrieb:` / `Unterweisung:`.
   So überleben Mi/Do/Fr sowie Folgeseiten-Tage.
5. **Status** weiterhin best-effort: Keyword-Scan
   (genehmigt/freigegeben/eingereicht/abgelehnt/zurückgegeben). **Achtung Ordering:**
   die Status-Zeile steht im Export **vor** dem `Ausbildungswoche`-Marker (im
   Kopfbereich „Ausbilder Status … Eingereicht am … freigegeben"). Der Split muss
   die Kopf-Vorlauf-Zeilen seit der vorigen Woche der **kommenden** Woche zuordnen
   (Status-Preamble), sonst landet der Status bei der Vorwoche. Betrifft nur das
   Vorschau-Label, nicht den Datenimport (Apply erzwingt unverändert `genehmigt`;
   das bestehende `STATUS_RE` matchte am echten Export ohnehin nie).

### Was unverändert bleibt

- `DAY_RE`, `mapDayType`, `hmToDecimal`, Betrieb+Schule-Tagesmerge,
  `linesToHtml`/Fett-Marker (Fett-/Unterstrich-Erkennung ist **separater,
  späterer** Scope — siehe „Nicht im Scope").
- `ihk-import.js`: Extraktion, Vorschau-Modal, DB-Schreiben, Erfolgs-Screen.
- Datenstruktur `{ wochen, warnungen }` und Wochen-/Tages-Felder.

---

## Berichtsform-Gating (neue Anforderung)

Der Import soll **vorerst nur für die wöchentliche Berichtsform** verfügbar sein
(kaufmännische und IT-Azubis). Tägliche Berichtsform folgt später.

- Technischer Anker: `user.berichtTyp === 'wöchentlich'`
  (pro Azubi gespeichert, siehe [api.js:51](../../app/js/api.js#L51),
  [wochenansicht.js:74](../../app/js/wochenansicht.js#L74),
  [data.js:315](../../app/js/data.js#L315)).
- Änderung in [ihk-import.js:33](../../app/js/ihk-import.js#L33):
  Guard erweitern auf
  `if (!user || user.role !== 'azubi' || user.berichtTyp !== 'wöchentlich') return '';`
- Wirkung: Für tägliche Azubis liefert `renderSection` `''` → die Sektion wird
  gar nicht gerendert (gleiches Muster wie für Nicht-Azubis). `bind()` findet dann
  kein `#ihkSection` und kehrt früh zurück — kein zusätzlicher Code nötig.
- Kein „Demnächst"-Hinweis (YAGNI): die Funktion ist schlicht unsichtbar, bis der
  tägliche Import nachgezogen wird.

---

## Verifikation

Reiner Parser-Test in Node (pdf.js-Extraktion identisch zu `itemsToText`) gegen
**beide** echten Exporte (`Flo K.pdf`, `Luca D.pdf`):

1. Pro Woche: erkannte Tageszahl == IHK-Tageszahl (Anwesend + Abwesend aus dem
   Inhaltsverzeichnis der jeweiligen Woche).
2. Beispielwoche 06.01.2025 liefert **5/5** Tage (vorher 2/5), inkl. korrektem Ort
   (Feiertag/Schule/Betrieb) und Zeiten.
3. Summe der Tagesstunden einer Woche ≈ `Dauer gesamt: HH:MM` der Detailseite.
4. Keine Schein-Woche aus dem Inhaltsverzeichnis (Gesamtzeitraum).
5. Gating: `renderSection` mit `berichtTyp: 'täglich'` → `''`;
   mit `'wöchentlich'` → Sektion vorhanden.

---

## Nicht im Scope (dieser Version)

- **Formatierung Fett/Unterstrichen.** Am echten PDF gemessen: pdf.js meldet für
  alle eingebetteten Subset-Fonts `fontFamily: "sans-serif"` → die jetzige
  Fett-Erkennung kann nicht greifen; Unterstrichen ist eine gezeichnete
  Vektorlinie (nicht im Textstrom). Eigener, späterer Scope; benötigt ein
  Beispiel-PDF mit tatsächlich vom Azubi gesetzter Formatierung. **markitdown ist
  hierfür ungeeignet** (verwirft Formatierung, ist Python/Backend, bricht das
  Lokal-bleibt-lokal-Versprechen).
- **Täglicher Import** (`berichtTyp === 'täglich'`) inkl. tagesbezogener
  `eintrag`-Texte.
- Qualifikationen-Inhalte, persönliche Stammdaten aus dem PDF.
