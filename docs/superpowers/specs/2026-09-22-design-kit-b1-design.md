# Design-Spec: pm-design-kit Schritt B1 — Mängel beheben

**Datum:** 2026-09-22
**Status:** Entwurf zur Freigabe
**Repo:** `C:\Dev\pm-design-kit` (v0.1.0, 25 Commits, kein Remote)
**Vorgänger-Spec:** [2026-09-21-design-kit-design.md](2026-09-21-design-kit-design.md)

---

## 1. Ziel und Abgrenzung

Schritt A hat den Ist-Zustand gespiegelt und dabei **56 offene Befunde**
dokumentiert. B1 behebt davon die, die eine objektiv richtige Antwort
haben, und schließt drei Lücken, die das Kit für Verwaltungsseiten
unbrauchbar machen.

**B1 ist ausdrücklich nicht die Professionalisierung.** Die acht Achsen
(Gelb-Einsatz, Radien, Glas, Motion, Typo-Skala, Dichte, Marken-Gelb,
Icon-Strichstärke) sind Geschmacksfragen und gehören nach B2. B1 räumt
vorher auf, damit B2 nicht auf defekten Werten aufsetzt.

### Warum diese Reihenfolge

B1 ändert Farben — 21 Kontrastpaare liegen unter WCAG AA. Würde B2
zuerst laufen, müsste jede Farbentscheidung zweimal getroffen werden:
einmal nach Geschmack, einmal nach Grenzwert. Umgekehrt engt B1 den
Spielraum von B2 nur dort ein, wo der Grenzwert es ohnehin erzwingt.

### Was B1 nicht anfasst

| Ausgeschlossen | Wohin stattdessen |
|---|---|
| Die 8 Professionalisierungs-Achsen | B2 |
| Die 7 Glas-Befunde | B2, Achse 3 — sie *sind* die Entscheidungsgrundlage |
| Der Ikonografie-Befund | B2, Achse 8 |
| 9 Entwurfsfragen aus „Bauteil-Lücken" | B2 |
| Reiter, Brotkrumen, Seitenblätterung, Datumswähler, Navigation | offen; nach B2 zu entscheiden |
| Die 6 Einträge unter „Werkzeug und Verfahren" | keine Aufgabe — Protokoll der Lehren, kein Mangel |
| Die 16 Einträge unter „Bereits erledigt" | keine Aufgabe |

## 2. Sortierung der 56 Befunde

| Gruppe im CHANGELOG | gesamt | B1 | B2 | keine Aufgabe |
|---|---|---|---|---|
| Barrierefreiheit — Kontrast | 8 | 8 | — | — |
| Barrierefreiheit — Fokus, Tastatur, Touch | 5 | 5 | — | — |
| Dunkelmodus | 3 | 2 | 1 | — |
| Glas-Ebene | 7 | — | 7 | — |
| Typografie | 4 | 2 | 2 | — |
| Token-System und Konsistenz | 9 | 9 | — | — |
| Ikonografie | 1 | — | 1 | — |
| Bauteil-Lücken und Entwurfsfragen | 13 | 4 | 9 | — |
| Werkzeug, Verfahren, Messumgebung | 6 | — | — | 6 |
| **Summe** | **56** | **30** | **20** | **6** |

Dazu drei neue Bauteile (Abschnitt 5). B1 umfasst damit **30 Befunde +
3 Lücken**.

## 3. Die Kontrast-Reparaturen

### 3.1 Die 21 Durchfaller sind zehn Entscheidungen

Sie verteilen sich nicht gleichmäßig, sondern hängen an wenigen Tokens.
Ausgezählt aus `tools/kontrast-paare.json` (83 Paare, 21 mit `ausnahme`):

| # | Cluster | betroffene Paare | heutiger Wert |
|---|---|---|---|
| 1 | `--pm-grey-400` als Textfarbe | **5** | 3,42–3,69:1 |
| 2 | `--pm-grey-500` auf dem echten Seitengrund | 1 | 4,32:1 |
| 3 | `--color-error` / `-mid` im Dunkelmodus | **3** | 1,65–2,79:1 |
| 4 | Sidebar-Literale ohne Token (2 Klassen × 2 Modi) | **4** | 2,25–4,47:1 |
| 5 | Status-Badge-Literale im Dunkelmodus | **3** | 3,77–4,06:1 |
| 6 | `--status-entwurf` Fläche im Dunkelmodus | 1 | 3,79:1 |
| 7 | `--pm-yellow-darker` auf `--pm-yellow-bg` hell | 1 | 3,07:1 |
| 8 | `--on-yellow-text` auf `--pm-yellow-bg` dunkel | 1 | 1,72:1 |
| 9 | `--pm-grey-900` auf `--pm-yellow` dunkel | 1 | 1,46:1 |
| 10 | `#F18581` auf roter Hover-Fläche mit Glas | 1 | 4,27:1 |

Die Cluster 7, 8 und 9 sind derselbe Sachverhalt — **Text auf gelber
Fläche im Dunkelmodus** — und werden gemeinsam entschieden.

### 3.2 Vorgehen: Minimaleingriff mit erhaltenem Farbton

Für jeden Cluster gilt dieselbe Regel, damit die Reparatur nicht zur
verdeckten Umgestaltung wird:

1. **Farbwinkel bleibt.** Nur Helligkeit, und wenn nötig Sättigung,
   werden verändert.
2. **So wenig wie möglich.** Zielwert ist AA (4,5:1 für Fließtext,
   3:1 für großen Text ab 18,66px oder 24px fett), aufgerundet auf
   **mindestens 4,6:1 bzw. 3,1:1** — nicht der maximal mögliche
   Kontrast. Der Aufschlag verhindert, dass ein Wert bei einer
   späteren Rundung oder einer minimalen Flächenänderung wieder
   unter den Grenzwert kippt.
3. **Der Grund wird notiert.** Jede geänderte Farbe bekommt im
   Rollen-Satz des Tokens einen Hinweis, dass und warum sie in B1
   angepasst wurde, mit Vorher- und Nachher-Wert.
4. **Dunkelmodus zuerst.** 15 der 21 Durchfaller liegen dort. Wer
   den Hellmodus zuerst anpasst, ändert Tokens, die im Dunkelmodus
   ohnehin überschrieben werden.

### 3.3 Die Literale werden tokenisiert

Sieben der 21 Durchfaller sind **CSS-Literale ohne Token** — fünf
Status-Badge-Textfarben (`components.css:1152-1156` der Quelle) und
zwei Sidebar-Textfarben (`layout.css:87` und `:123`). Sie lassen sich
nicht anpassen, ohne sie vorher zu benennen.

B1 macht daraus echte Tokens mit Rollen-Satz und korrigiert sie im
selben Zug. Das erledigt zwei Befunde mit einer Änderung — die
Tokenisierung steht ohnehin als eigener Eintrag auf der Liste.

Bei den Sidebar-Farben ist zu beachten, dass sie in der Quelle
Transparenzwerte sind (`rgba(255,255,255,0.25)` und `0.45`). Die
Tokenisierung darf das nicht zu deckenden Farben umbauen — das wäre
eine Gestaltungsänderung. Angehoben wird die Deckkraft, nicht die
Farbe.

### 3.4 Sichtprüfung vor dem Einfrieren

Nach allen Clustern wird die Palette als Ganzes gerendert (`npm run
schuss`, beide Modi) und vorgelegt. Einzelne Kontrastwerte lassen sich
rechnen; ob die Palette danach noch zusammenpasst, nicht.

## 4. Die übrigen 22 B1-Befunde

### 4.1 Fokus, Tastatur, Touch (5)

| Befund | Zu tun |
|---|---|
| Zwei Fokus-Zustände ohne erkennbaren Indikator (`.pm-select__search input:focus`, `.pm-select__option:focus-visible`) | Sichtbaren Indikator ergänzen; bei der Option muss er sich vom Hover unterscheiden |
| Vierte Fokusring-Variante existiert nur als Literal | Als Token aufnehmen oder auf eine bestehende Variante zurückführen |
| Tooltip-Inhalt per Tastatur nicht erreichbar | Auslösung um Fokus erweitern |
| Keine Touch-Regeln, obwohl die Zielgeräte 11″-iPads sind | Die 44px-Mindestgröße aus `DESIGN.md` 9.5 als CSS-Ebene umsetzen |
| Toast lässt sich nicht anhalten | Anhalten bei Zeiger und Fokus (WCAG 2.2.1) |

### 4.2 Token-System und Konsistenz (9)

Zwei parallele Schatten-Vokabulare (roh und semantisch), die vierte
Easing-Kurve nur als Literal, zwei verschiedene Rahmentöne für
gleichrangige Elemente, `--sidebar-w` trägt den Tablet- statt den
Desktop-Wert, `border: 1.5px` rendert bei einfacher Pixeldichte als
1px, acht der 13 semantischen Farbtokens ohne eigenen Dunkelmodus-Wert,
zwei Gedankenstrich-Zeichen im Umlauf.

Gemeinsame Regel: **Ein Konzept, ein Vokabular.** Wo zwei Schreibweisen
dasselbe meinen, gewinnt die semantische; die rohe wird zur Ableitung.
Jede Zusammenführung wird in `CHANGELOG.md` unter „Bereinigt"
protokolliert, und `check:paritaet` muss danach weiterhin grün sein —
Vokabular-Aufräumen darf den gerenderten Zustand nicht verändern.

### 4.3 Typografie (2)

Die fehlenden Libre-Franklin-Schnitte (Regular 400, Medium 500)
nachladen — das offizielle Brand Manual nennt sie ausdrücklich, und
ihr Fehlen erzeugt heute einen synthetischen Schnitt. Und
`font-weight: 600` bei `.segment__btn` auf die Skala zurückführen.

Beides ist objektiv: Ein Gewicht, das die eigene Skala nicht kennt,
ist ein Fehler, keine Gestaltung. Die Frage, ob die Skala **insgesamt**
verdichtet wird, bleibt B2.

### 4.4 Dunkelmodus (2) und Bauteil-Fehler (4)

Stufen, die im Dunkelmodus zusammenfallen; die `::selection`-Regel, die
nicht dort steht, wo man sie sucht.

Dazu genau vier Einträge aus der Bauteil-Gruppe — die, die kein
Geschmack sind, sondern gegen eine Regel verstoßen, die das Kit selbst
aufstellt:

| Befund | Warum B1 und nicht B2 |
|---|---|
| Pflichtfeld-Sternchen steht auf `display: none` | Klasse, Markup und CSS sind da; gerendert wird nichts. Die einzige Kombination, die nichts bringt |
| `.form-error` hat im ganzen Quellrepo keine Markup-Referenz | Gepflegtes Bauteil ohne Verbraucher — entweder verbauen oder streichen |
| `.toast--warning` fehlt, obwohl `Toast.warning()` die Klasse setzt | Das JS erzeugt eine Klasse, für die keine Regel existiert. Ein Warn-Toast ist heute nicht von einer neutralen Meldung zu unterscheiden |
| `.stat-card:hover` hebt die Karte, die `cursor: default` trägt | Widerspricht `DESIGN.md` 6 wörtlich („überfahren … nur für Elemente, die auch etwas tun") |

Die übrigen neun Einträge der Gruppe — fehlendes `.badge--entwurf`,
eckige Checkbox, Tooltip-Selektor, die drei Bauteile ohne
Markup-Referenz, der 3px-Farbstreifen am Toast, fehlender
Segment-Hover, fehlender Button-Ladezustand, die zwei Buttons ohne
Verb — sind Entwurfsfragen und gehören nach B2.

## 5. Die drei neuen Bauteile

Sie fehlen dem Kit für den Normalfall einer Verwaltungsseite — die
Probe aufs Exempel in der Schlussprüfung ist an allen dreien hängen
geblieben.

### 5.1 Tabelle — gemessen, nicht erfunden

Die Quelle hat **keine** generische Tabellen-Komponente. Nachgezählt
über `app/css/*.css` (Themedateien und `vendor/` ausgenommen) gibt es
**fünf echte UI-Datentabellen**:

| Datei | Klasse | Eigenart |
|---|---|---|
| `nutzerverwaltung.css:35-75` | `.nv-table` | die vollständigste: Kopf, Zeilentrenner, Zeilen-Hover mit Übergang, Auswahlzustand, Dunkelmodus-Regel |
| `abteilungsverwaltung.css:5-7` | `.av-table` | ausdrücklich „lehnt sich an nutzerverwaltung.css an", aber knapper |
| `import-ui.css:132-151` | `.ztn-table` | einzige mit klebendem Spaltenkopf (`position: sticky`) und Rollrahmen |
| `noten.css:355-372` | `.noten-spiegel` | einzige mit Gliederungszeilen quer über die Tabelle |
| `beurteilung.css:51-86` | `.beurt-table` | Matrix statt Liste: Vollgitter, Kopf ohne Versalien |

Nicht mitgezählt, mit Begründung: `fahrgelderstattung.css:336`
(`.fg-sheet__tabelle`) bildet ein Papierformular nach — Literal-Rahmen
`#333`, feste Zeilenhöhe 25px; `abteilungs-planer.css:923` und
`quill-editor.css:465` formatieren Tabellen **im Editorinhalt**, nicht
im Bedienrahmen. `wochenansicht.css`, `dashboard.css`, `profil.css`
und `berichtsheftverwaltung.css` haben entgegen einer früheren Zählung
**gar keine** Tabellenregeln.

Das Kit erfindet keine Tabelle. Stattdessen:

1. **Alle fünf ernten.** Das Ernte-Werkzeug bekommt über das bestehende
   Feld `zusatzCss` die jeweilige Seiten-CSS dazugeladen — derselbe
   Weg, über den in Schritt A der Segment-Umschalter gemessen wurde.
2. **Den gemeinsamen Nenner bestimmen.** Wo alle oder fast alle
   denselben Wert tragen, ist das der Wert des Kits. Vorab sichtbar:
   `width: 100%` und `border-collapse: collapse` stehen in allen fünf,
   `font-size: var(--text-sm)` in vier, ein Spaltenkopf in Versalien
   mit `--text-xs`/`--pm-grey-500` in vier.
3. **Die Abweichungen dokumentieren.** Wo sie auseinandergehen — das
   Zellenpolster (`--sp-3 --sp-4` zweimal, `--sp-2 --sp-3` zweimal,
   `--sp-3` einmal) und die Sperrung des Kopfes (`.04em` zweimal,
   `.05em`, `.06em`) —, wird die Streuung benannt und ein Wert
   gewählt, mit Begründung.
4. **Was nirgends vorkommt, fehlt weiter.** Sortierbare Spaltenköpfe
   und Seitenblätterung gibt es in keiner der fünf. Sie bleiben Lücken.

Damit bleibt die Methode des Kits intakt: gemessen statt entworfen.

### 5.2 `.sr-only`

`DESIGN.md` 9.4 verlangt die Klasse ausdrücklich („Verstecken heißt
`.sr-only`") und räumt im selben Satz ein, dass das Kit sie nicht
führt. Ein barrierefreies Suchfeld ohne sichtbares Label ist damit
nicht baubar.

Das ist kein Gestaltungsthema — die Umsetzung ist seit Jahren
standardisiert. B1 übernimmt die gängige Fassung und dokumentiert sie
als **abgeleitet**, da sie in der Quelle nicht vorkommt.

### 5.3 Breitenregel für Eingabefelder

`.form-control` ist heute immer `width: 100%`. `DESIGN.md` 9.7 regelt
Breiten nur für PmSelect. Wer ein schmales Suchfeld braucht, erfindet
etwas.

B1 misst, welche Breiten in der Quelle tatsächlich vorkommen, und
leitet daraus eine Zuordnung ab (Feldzweck → Breite), im selben Format
wie die Abstands-Zuordnung in `DESIGN.md` 4.1. Die Messung startet bei
den fünf belegten Stellen: `.av-toolbar .form-control` 360px
(Suchfeld), `.dh-filter__suche` 260px (Suchfeld), `.nv-toolbar__role`
200–280px (Auswahlfilter), `.dh-filter .pm-select--block` 180px
(Auswahlfilter), `.date-range-row .form-group` ab 140px (Datum).

## 6. Umbau der Paritätsprüfung

Heute beweist `check:paritaet` Gleichheit mit der **Vorlage**. Sobald
B1 den ersten Wert absichtlich ändert, wird sie rot. Ohne Umbau bliebe
nur, sie stillzulegen — und damit fiele in der Phase mit den meisten
Änderungen das Netz weg.

### 6.1 Neue Rollenverteilung

| Datei | Rolle ab B1 |
|---|---|
| `extraktion/ist-light.json`, `ist-dark.json`, `ist-glass-aus.json` | umbenannt zu `vorlage-*.json`. Historischer Bezug: so sah die Anwendung am 2026-09-21 aus. **Nie wieder Prüfgrundlage.** |
| `extraktion/soll-light.json`, `soll-dark.json` | **neu.** Der freigegebene Soll-Stand des Kits, erzeugt aus `preview.html`. Prüfgrundlage von `check:paritaet`. |

### 6.2 Zwei getrennte Befehle

- `npm run soll` — erzeugt `soll-*.json` aus dem Kit neu. Wird
  **ausschließlich** nach einer freigegebenen Änderung aufgerufen.
- `npm run check:paritaet` — prüft das Kit gegen `soll-*.json`.

Die Trennung ist der Kern: Solange beides in einem Befehl steckt,
„repariert" sich jede unbeabsichtigte Änderung selbst.

### 6.3 Schutz gegen versehentliches Mitziehen

`npm run soll` gibt vor dem Schreiben aus, **was sich gegenüber dem
bisherigen Soll-Stand ändert** — Eintrag, Eigenschaft, alter und neuer
Wert — und verlangt eine Bestätigung. Ein Lauf ohne Bestätigung
schreibt nichts.

`npm run check` ruft `soll` **nicht** auf.

### 6.4 Was mit der Vorlage-Ernte passiert

Sie bleibt liegen und wird nicht mehr aktualisiert. Ein neues
Prüfskript ist dafür nicht nötig; ihr Zweck ist Nachvollziehbarkeit:
Wer in zwei Jahren wissen will, wie weit sich das Kit von seiner
Vorlage entfernt hat, vergleicht `vorlage-*.json` gegen
`soll-*.json`. Das ist eine Frage, keine Prüfung.

## 7. Dokumentation

Jede Änderung schlägt sich in drei Dateien nieder:

- **`DESIGN.md`** — die betroffene Regel, mit dem neuen Wert. Wo eine
  Farbe geändert wurde, wird der alte Wert genannt und warum er
  gewichen ist. Abschnitt 9.3 (die AA-Ausnahmeliste) schrumpft
  entsprechend.
- **`CHANGELOG.md`** — Version `0.2.0`, neue Rubrik **„Behoben"**
  neben den bestehenden vier. Jeder behobene Befund wird in
  „Beobachtungen für Schritt B" als erledigt markiert, nicht gelöscht
  — die Liste bleibt als Protokoll lesbar.
- **`SKILL.md`** — nur wo sich ein Schnellzugriffswert ändert.

`tools/check-zahlen.mjs` erzwingt, dass die Zahlen in allen vier
Dokumenten mitwandern.

## 8. Verifikation

Die Prüfkette wächst um einen Schritt und bleibt Pflicht:

| Prüfung | Was sie nach B1 sichert |
|---|---|
| `check:tokens` | Token-Parität css ↔ json, jede Rolle gefüllt |
| `check:kontrast` | **Ziel: 0 Durchfaller ohne Ausnahme.** Jede verbleibende Ausnahme braucht eine Begründung, die sagt, warum sie *nicht* behebbar war |
| `check:css` | Alle CSS-Dateien parsen |
| `check:standalone` | Keine Fremdreferenzen |
| `check:zahlen` | Zahlen in den vier Dokumenten stimmen |
| `check:paritaet` | **neu gegen `soll-*.json`** |

Dazu vor der Freigabe:

1. **Sichtprüfung der Palette** (Abschnitt 3.4).
2. **Die Probe aufs Exempel wiederholen** — dieselbe Nutzerverwaltung
   noch einmal bauen, diesmal mit Tabelle, `.sr-only` und
   Feldbreitenregel. Die elf Stellen, an denen die Schlussprüfung raten
   musste, müssen messbar weniger geworden sein. Das ist die einzige
   Prüfung, die den Zweck des Kits direkt misst.

## 9. Offene Punkte

Bewusst in B1 nicht entschieden:

1. **Sie oder Du** in Ausbilder-Ansichten. Das Kit legt sich vorläufig
   auf „Du" fest; die Quelle siezt an einer Stelle. Eine Frage an den
   Auftraggeber, keine ableitbare.
2. ~~**Ob `--pm-grey-400` nach der Korrektur noch eine eigene Stufe
   ist.**~~ **In B1 beantwortet, geht nicht nach B2.** Nachgerechnet
   ergab der ursprünglich gedachte Weg — den Ton abdunkeln, bis AA
   fällt — `#707070` gegen `--pm-grey-500` `#6B6B6B`, also fünf
   Einheiten je Kanal: die Stufe wäre verschwunden. Der Widerspruch
   steckt in der Rolle, nicht im Wert: ein Token kann nicht
   gleichzeitig die *gedämpfte* Stufe sein und eine Untergrenze
   halten. `--pm-grey-400` bleibt deshalb eine eigene Stufe — als
   **Nicht-Text-Farbe** für Icons und Ränder neben `--pm-grey-300`,
   mit unverändertem Wert. Jede Text-Verwendung steht seit B1 auf
   `--pm-grey-500`. Einzige Ausnahme: deaktivierte Bedienelemente, die
   WCAG 1.4.3 ausdrücklich von der Kontrastanforderung ausnimmt.
3. **Welcher Tabellen-Wert gewinnt**, wo die fünf Quellen
   auseinandergehen — Zellenpolster und Kopf-Sperrung. B1 legt sich
   fest und begründet; die Entscheidung ist in B2 revidierbar.

## 10. Versionierung

`0.2.0` nach Abschluss von B1. `1.0.0` bleibt Schritt C vorbehalten.
