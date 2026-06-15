# IHK-Import: Zeiten/Ort-Korrektur + Formatierungsübernahme — Design-Spec

**Datum:** 2026-06-15
**Status:** Entwurf
**Baut auf:** [2026-05-27-ihk-berichtsheft-import-design.md](2026-05-27-ihk-berichtsheft-import-design.md)

---

## Überblick

Der bestehende IHK-PDF-Import hat drei Schwächen, die hier behoben werden:

1. **Nicht alle Zeiten/Tage** werden übernommen.
2. **Der Ort** fehlt teilweise.
3. **Fett/Unterstrichen/Kursiv** aus den Tätigkeitstexten werden nicht übernommen.

Die Analyse (an den echten Exporten `Berichtsheft exporte/Flo K.pdf` und `Luca D.pdf`, pdf.js 3.11.174, identische `itemsToText`-Logik nachgestellt) zeigt: (1) und (2) haben **dieselben zwei strukturellen Parser-Ursachen** und sind keine Extraktionsfehler. (3) ist möglich, weil das PDF Fett/Kursiv über eigene eingebettete Fonts und Unterstreichung über dünne Füll-Rechtecke kodiert — die aktuelle Erkennung greift nur am falschen Signal an.

**Kein Backend, kein markitdown.** markitdown würde Formatierung verwerfen (reiner pdfminer-Text), einen Python-Dienst erfordern (kein Python auf dem Zielsystem) und das „Datei bleibt lokal"-Versprechen brechen — und die Zeiten/Ort-Bugs gar nicht berühren. Alles bleibt clientseitig in pdf.js.

---

## Problemanalyse (mit Belegen aus `Flo K.pdf`)

### Ursache 1 — `Qualifikationen:` killt den Seitenrest

Die echten Detailseiten enthalten **nach jedem Tag** einen eigenen `Qualifikationen:`-Block. Der Parser setzt beim ersten Treffer `skipRest = true` ([ihk-parser.js:107](../../../app/js/ihk-parser.js#L107)) und ignoriert **alles Folgende auf der Seite**. Auf Seite 7 (Woche 06.01.2025) gehen so `Mi | 08.01.2025 | Betrieb | anwesend 07:25` und alles danach verloren.

### Ursache 2 — Wochen erstrecken sich über mehrere PDF-Seiten

Tag 4+5 (Do/Fr) der Woche 06.01.2025 stehen auf **Seite 8** — **ohne** `Ausbildungswoche …`-Kopf. `parsePage` gibt für kopflose Seiten `null` zurück ([ihk-parser.js:148](../../../app/js/ihk-parser.js#L148)), die ganze Seite (Zeiten **und** Ort dieser Tage) fällt weg.

**Effekt zusammen:** Woche 06.01.2025 importiert real nur **2 von 5** Werktagen. Die „fehlenden Zeiten" und der „fehlende Ort" sind dieselben verlorenen Tage.

### Trap bei Fix 2 — die Inhaltsverzeichnis-Seite

Seite 3 trägt `Ausbildungswoche 30.12.2024 bis 08.02.2026` (der **gesamte** Exportzeitraum, >1 Jahr) und matcht `WOCHE_RE`. Beim seitenübergreifenden Zusammenführen würde daraus eine Geister-Woche, die nachfolgende Seiten „aufsaugt". Muss explizit abgefangen werden.

### Ursache 3 — Formatierung am falschen Signal

`itemsToText` prüft `styles[fontName].fontFamily` auf `/bold|demi|black/` ([ihk-import.js:233](../../../app/js/ihk-import.js#L233)). pdf.js meldet für **jede** Schrift dieses PDFs generisch `"sans-serif"` → die Prüfung schlägt **nie** an.

Das echte Signal (verifiziert via `page.getOperatorList()` + `page.commonObjs.get(fontName).name`):

| Font-ID | echter Name | Bedeutung |
|---|---|---|
| `g_d0_f2` | `EAAAAA+LiberationSans-Bold` | fett |
| `g_d0_f3` | `EAAAAB+LiberationSans` | normal |
| `g_d0_f4` | `EAAAAC+LiberationSans-Italic` | kursiv |

Unterstreichung ist kein Textattribut, sondern ein **dünnes gefülltes Rechteck** (Höhe ≈ 0,3 Einheiten) direkt unter der Grundlinie, dessen Breite exakt dem Textlauf entspricht. Verifiziert für `Dienstag:` (Linie y=565.9, x=69..114, Länge 46 = Textbreite) und `IT-Abteilung:` (y=423.4, Länge 61 = Textbreite). Tabellenränder sind **gestrichen** (nicht gefüllt) und breiter als der Text → sauber abgrenzbar.

**End-to-End bestätigt:** Der Editor ist Quill; Inhalte werden über `quill.clipboard.dangerouslyPasteHTML()` ([wochenansicht.js:1068](../../../app/js/wochenansicht.js#L1068)) geladen, die Toolbar registriert `['bold','italic','underline']` ([wochenansicht.js:10](../../../app/js/wochenansicht.js#L10)). `<strong>`/`<u>`/`<em>` überleben Laden, Anzeige und erneutes Speichern.

---

## Scope

**Im Scope:** Fix Ursache 1+2 (Zeiten/Ort), Übernahme von **fett + unterstrichen + kursiv** in den Tätigkeitstexten.

**Nicht im Scope:** Schriftfarbe (blaue Überschriften); markitdown/Backend; die hartkodierte `status='genehmigt'`-Logik beim Speichern ([ihk-import.js:402](../../../app/js/ihk-import.js#L402)); IHK-Status-Erkennung aus dem Detailseiten-Kopf (cosmetisch, da Status beim Speichern ohnehin überschrieben wird).

---

## Architektur / geänderte Dateien

| Datei | Änderung |
|---|---|
| `app/js/ihk-import.js` | `extractPages`/`itemsToText`: `getOperatorList()` je Seite; Fett/Kursiv aus echtem Font-Namen; Unterstreichung aus Füll-Rechtecken; pro Textlauf ein Format-Marker. |
| `app/js/ihk-parser.js` | `parse()` seitenübergreifend zustandsbehaftet (Wochen-Stitching + `inQuali`-Modus + Wochenkopf-Plausibilität); `linesToHtml` auf alle drei Marker verallgemeinert; Marker-Strippen vor Struktur-Regexes erweitert. |

Keine DB-, HTML- oder Backend-Änderungen. Die Schnittstelle `IhkParser.parse(pages[]) → {wochen, warnungen}` bleibt unverändert.

---

## Detaildesign

### A) Extraktion (`ihk-import.js`)

`extractPages` ergänzt pro Seite **vor** `getTextContent()` einen `await page.getOperatorList()`-Aufruf — das (a) füllt `page.commonObjs` (damit Font-Namen lesbar sind) und (b) liefert die Zeichen-Ops für die Unterstreichungs-Erkennung.

**Font-Klassifikation** (pro Seite einmal, gecacht je `fontName`):
```
name   = page.commonObjs.get(fontName)?.name || ''
isBold   = /bold|black|heavy|semibold|demi/i.test(name)
isItalic = /italic|oblique/i.test(name)
```
`commonObjs.get` defensiv kapseln (try/catch → Default „nicht fett/kursiv"), falls eine Schrift nicht aufgelöst ist.

**Unterstreichungs-Segmente** aus der Operator-Liste (mit CTM-Tracking über `save`/`restore`/`transform`):
- Pfad-Ops dekodieren (`moveTo`/`lineTo`/`rectangle`); Endpunkte mit aktueller CTM in Seitenkoordinaten transformieren.
- Bei `fill`/`eoFill`: **horizontale Füll-Rechtecke mit Höhe < ~1,5** als Unterstreichungs-Kandidat `{y, x0, x1}` sammeln.
- Gestrichene Pfade (`stroke`) zählen **nicht** als Unterstreichung (das sind Tabellen-/Boxränder).

**Marker-Vergabe je Text-Item** (`itemsToText`):
- `x0 = transform[4]`, `x1 = x0 + width`, `baseline = transform[5]`.
- `underlined` = es existiert ein Segment mit `0 ≤ baseline − segY ≤ ~4`, x-Überlappung ≥ ~60 % der Item-Breite **und** `segLen ≤ ~1,4 × Item-Breite`.
- Flags `bold|italic|underlined` → falls mindestens eins gesetzt: Item-Text in Marker wrappen (Schema unten). Sonst roher Text.

### B) Marker-Schema (atomar pro Lauf)

Jedes pdf.js-Text-Item hat genau einen Font und einen einheitlichen Formatzustand → ein Item = ein Lauf = **ein** Marker, keine Verschachtelung im Emitter nötig.

```
Marker = \x02 <flag> <text> \x03
flag   = Ziffer '1'..'7' als Bitmaske: 1=bold, 2=italic, 4=underline
```
Beispiele: fett → `\x02` `1` `…` `\x03`; fett+unterstrichen (`Dienstag:`) → `\x02` `5` `Dienstag:` `\x03`.

Die Steuerzeichen `\x02`/`\x03` kommen in PDF-Textinhalten nicht vor. Das Schema **ersetzt** den bisherigen bloßen `\x02…\x03`-Bold-Marker (Emitter, Konsument und Stripper werden konsistent angepasst).

### C) Parser (`ihk-parser.js`)

**`linesToHtml`** wird auf das Flag-Schema verallgemeinert:
- Zeile an `/(\x02[1-7][^\x03]*\x03)/` zerlegen.
- Marker-Teil: Flag lesen, Text HTML-escapen, gemäß Bitmaske verschachteln — feste Reihenfolge `<strong>`(1) → `<em>`(2) → `<u>`(4) innen, z. B. flag 5 → `<strong><u>…</u></strong>`.
- Nicht-Marker-Teil: nur escapen.
- Jede Zeile bleibt ein `<p>…</p>` (Quill-kompatibel).

**Marker-Strippen vor Struktur-Regexes** ([ihk-parser.js:104](../../../app/js/ihk-parser.js#L104)): aus `line.replace(/\x02|\x03/g,'')` wird ein Strippen, das `\x02` **inklusive Flag-Ziffer** und `\x03` entfernt (`/\x02[1-7]|\x03/g`), damit `DAY_RE`/`WOCHE_RE`/Header weiter matchen.

**Seitenübergreifende State-Machine** — `parse(pages)` ersetzt das „eine Seite = eine Woche"-Modell:
- Ein flacher Zeilenstrom über alle Seiten; Zustand: `currentWoche | null`, `textSection`, `inQuali`.
- **Boilerplate-Zeilen** explizit überspringen (und **nicht** in Textblöcke sammeln, auch wenn `textSection` aktiv): `^Seite \d+$`, `^Ausbildungsnachweis auf Wochenbasis$`, `^Inhaltsverzeichnis$`, `^Übersicht$`, `^Dauer gesamt:`.
- **Neuer Wochenkopf** = `WOCHE_RE`-Treffer **mit Plausibilität**: `endDate − startDate ≤ 10 Tage` (fängt die Inhaltsverzeichnis-Zeile mit >1-Jahres-Spanne ab). → aktuelle Woche finalisieren, neue beginnen, `textSection=null`, `inQuali=false`.
- **Tageszeile** (`DAY_RE`) → `textSection=null`, `inQuali=false`, Tag an `currentWoche` anhängen (Sammlung je Datum wie bisher).
- **Abschnitts-Header** `Schule:`/`Betrieb:`/`Unterweisung:` → `textSection` setzen (nur bei offener Woche).
- **`Qualifikationen:`** → `inQuali=true` (folgende Aufzählungszeilen überspringen); wird durch die nächste Tageszeile, den nächsten Abschnitts-Header oder einen neuen Wochenkopf beendet. **Kein** `skipRest` mehr.
- **Sonstige Zeile** → nur wenn `currentWoche && textSection && !inQuali`: an `textBlocks[textSection]` anhängen (mit Markern).
- Folgeseiten **ohne** Wochenkopf hängen Tage/Texte an die offene Woche an → Multi-Page-Wochen werden vollständig.
- Am Ende: letzte Woche finalisieren.

**Finalisierung je Woche** (ausgelagerte, unveränderte Logik): Betrieb+Schule-Merge gleichen Datums, Sortierung, `getISOKW`, `linesToHtml` für die drei Textblöcke.

---

## Datenfluss (unverändert in der Form)

```
PDF → extractPages():
        je Seite: getOperatorList() (Fonts + Pfade) → Unterstreichungs-Segmente
                  getTextContent() → Items mit Bold/Italic/Underline-Markern → Seitentext
     → IhkParser.parse(pages[]) → {wochen, warnungen}   (jetzt seitenübergreifend)
     → Preview-Modal → Auswahl → DB.saveWoche (wie bisher)
```

---

## Verifikation

1. **Automatisierter Abgleich** gegen die echten Exporte (Node-Harness mit pdfjs-dist 3.11.174, wie in der Analyse verwendet — nicht zwingend committen):
   - Woche 06.01.2025: **5/5** Werktage mit Zeit **und** Ort (vorher 2/5).
   - Stichprobe weiterer Multi-Page-Wochen über beide PDFs: erkannte Tage = erwartete Werktage; keine Geister-Woche aus dem Inhaltsverzeichnis.
   - `Dienstag:` und `IT-Abteilung:` → `<strong><u>…</u></strong>`; `Software:`/`Hardware:`/… → `<strong>…</strong>`; Fließtext ohne Marker.
2. **Visuell in der App** (`node server.js`, Port 3000; Edge via npx-Playwright): PDF importieren, Woche in der Wochenansicht öffnen, Fett/Unterstrichen/Kursiv im Quill-Editor prüfen, speichern und erneut laden (Rundlauf).

---

## Risiken & Gegenmaßnahmen

- **`commonObjs.get` nicht aufgelöst** → try/catch, Default „keine Formatierung" (Text bleibt korrekt, nur unformatiert).
- **Unterstreichungs-Heuristik** (Toleranzen für y-Abstand/Länge) könnte je Export leicht abweichen → Schwellen konservativ, gegen beide vorliegenden PDFs kalibriert; Tabellenränder durch „nur Füll-Rechtecke" ausgeschlossen.
- **Textblock über Seitenumbruch** (selten): Boilerplate-Zeilen werden nicht mitgesammelt; falls ein Eintrag mitten im Satz umbricht, kann ein Leerzeichen/Umbruch abweichen — akzeptabel, da in den Beispieldaten nicht beobachtet.
- **CTM-Tracking** deckt `save`/`restore`/`transform` ab; exotische Pfad-Ops (Kurven) sind für Unterstreichung irrelevant.
