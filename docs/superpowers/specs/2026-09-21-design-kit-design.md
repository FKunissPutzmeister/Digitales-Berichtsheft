# Design-Spec: Putzmeister Design-Kit (`pm-design-kit`)

**Datum:** 2026-09-21
**Status:** Entwurf zur Freigabe
**Ziel-Repo:** `FKunissPutzmeister/pm-design-kit`, lokal `C:\Dev\pm-design-kit`

---

## 1. Ziel

Ein eigenständiges, eingefrorenes Design-Kit, das das visuelle Regelwerk
des Digitalen Berichtshefts so vollständig beschreibt, dass es in weiteren
internen Web-Projekten **ohne Rückfragen zum Aussehen** verwendet werden
kann — auch und besonders von Claude.

Der Erfolgsmaßstab ist konkret: Bekommt ein Entwickler oder ein LLM nur
dieses Kit und die Aufgabe „baue eine Nutzerverwaltung", darf keine Frage
der Form „welche Farbe / welcher Abstand / wie sieht der Hover aus"
offenbleiben.

### Zwei-Schritt-Ansatz

Das Kit wird **nicht** direkt in seiner Zielform geschrieben, sondern in
zwei Durchgängen:

- **Schritt A — Spiegelung:** Der heutige Look wird 1:1 als Kit abgebildet.
  Lauffähig, vollständig, mit visueller Musterseite.
- **Schritt B — Professionalisierung:** Am fertigen Kit wird Achse für
  Achse nachgeschärft, mit sofortiger visueller Kontrolle.
- **Schritt C — Einfrieren:** Version 1.0. Ab dann gilt das Kit
  unverändert für alle Projekte; kein Anpassen mehr pro Projekt.

Begründung für diese Reihenfolge: Entscheidungen über „professioneller"
lassen sich am lebenden Objekt treffen. `preview.html` wird zum
Vorher-Nachher-Prüfstand, auf dem jede Änderung sofort an allen
Komponenten gleichzeitig sichtbar ist.

## 2. Nicht-Ziele

Ausdrücklich **nicht** Teil des Kits:

| Ausgeschlossen | Begründung |
|---|---|
| Layout und Seitenaufbau | Vom Auftraggeber ausgenommen. Das Kit regelt, wie Dinge aussehen, nicht wie eine Seite gegliedert wird. |
| Die 7 Custom-Themes (candy, hyperspace, christmas, halloween, cmd, papier, silk) | Berichtsheft-Feature für Azubis, kein Firmenstandard. Widerspricht dem Ziel „professioneller". Nur die Theming-*Mechanik* wird dokumentiert. |
| Berichtsheft-Fachlogik | Die 6 Status-Farben werden als generisches **Muster** übernommen (wie baut man eine Statusfarben-Familie), nicht als Berichtsheft-Status. |
| Print, Dokumente, Präsentationen | Zielmedium ist ausschließlich Web-App / internes Tool. |
| Logo-Regeln (Schutzzonen, Mindestgrößen, Social-Formate) | Bereits abschließend im offiziellen `Digital Brand Manual V1.pdf` geregelt. Das Kit verweist darauf, dupliziert es nicht. |

## 3. Ausgangslage

### 3.1 Quellen im Berichtsheft-Repo

| Datei | Zeilen | Rolle für das Kit |
|---|---|---|
| `app/css/variables.css` | 278 | Primärquelle aller Tokens, inkl. vollständigem Dark-Mode |
| `app/css/base.css` | 324 | Reset, Heading-Skala, Fokus-Regel, Scrollbar, Selection |
| `app/css/components.css` | 1271 | Komponenten-Primärquelle |
| `app/css/glass.css` | 1436 | Glassmorphism-Ebene; trägt den heute sichtbaren Look wesentlich mit |
| `Corporate Design/Digital Brand manual V1.pdf` | 24 S. | Offizielle Marken-Vorgaben |
| `Corporate Design/Fonts/` | — | Libre Franklin (Bold/Light), Open Sans (Variable 300–800) |

### 3.2 Befunde aus dem offiziellen Brand Manual

Das Manual regelt **Logo, Typografie und Social-/E-Mail-Templates**. Es
enthält **keine** Vorgaben zu Komponenten, Abständen, Radien, Schatten
oder Interaktionszuständen. Das Kit füllt damit eine echte Lücke und
konkurriert nicht mit dem Manual.

**Übereinstimmung:** Libre Franklin für Überschriften, Open Sans für
Fließtext — jeweils in Light, Regular, Medium, Bold. Genau so in der App
umgesetzt.

**Abweichung (Entscheidung in Schritt B nötig):**

| Größe | Brand Manual (S. 5) | App heute |
|---|---|---|
| Marken-Gelb | `#FFCD00` (255, 205, 0) | `#FFC300` (255, 195, 0) |
| Marken-Grau | `#54585A` (84, 88, 90) | eigene neutrale Skala `#1A1A1A`…`#F7F7F7`, `#54585A` kommt nicht vor |
| Icons | Font Awesome | eigene Inline-SVGs |

Das App-Gelb ist merklich wärmer/orangestichiger als das offizielle. Für
Schritt A wird der App-Wert übernommen (Vorgabe: „erstmal alles so wie es
gerade ist"); die Korrektur ist ein Kandidat für Schritt B.

### 3.3 Befunde zum Ist-Zustand

Drei Beobachtungen, die die Extraktionsregeln in Abschnitt 5 begründen:

1. **Widersprüchliche Deklarationen.** `.btn` setzt `font-size` zweimal
   (`var(--text-sm)` = 13px, dann `0.75rem` = 12px) und `letter-spacing`
   zweimal (`0.02em`, dann `0.06em`). Effektiv gelten die zweiten Werte.
   Der Dateiinhalt ist also nicht identisch mit dem Ist-Zustand.
2. **`glass.css` ist nicht rein additiv.** Es überschreibt Tokens aus
   `variables.css` — `--sidebar-bg` wechselt von `var(--pm-grey-800)`
   (dunkelgrau) auf `rgba(255,255,255,0.86)` (hell-transluzent). Wer nur
   `variables.css` liest, bekommt den falschen Look.
3. **Icons ohne Regelwerk.** 10 verschiedene Strichstärken im Einsatz
   (1.5 / 1.7 / 1.8 / 1.9 / 2 / 2.2 / 2.4 / 2.5 / 3 / 3.2). Häufigste
   Werte: `2` (55×) und `2.5` (47×). Das Kit legt hier erstmals eine
   Regel fest.
4. **Fehlende Schriftschnitte.** Von Libre Franklin sind nur **Light
   (300)** und **Bold (700)** als Datei vorhanden und per `@font-face`
   eingebunden. Das Brand Manual nennt zusätzlich Regular und Medium, und
   im CSS steht an mehreren Stellen `font-weight: 800` — beides ohne
   passende Datei. Der Browser rechnet daraus einen synthetischen
   Fettschnitt, was das Schriftbild unsauber macht. Open Sans ist davon
   nicht betroffen (Variable Font, 300–800 durchgehend).

## 4. Aufbau des Kits

```
pm-design-kit/
├── README.md              Einstieg für Menschen: Was, wofür, wie einbinden
├── DESIGN.md              Das Regelwerk (Abschnitt 6) — der eigentliche Wert
├── SKILL.md               Damit Claude das Kit automatisch anwendet
├── CHANGELOG.md           Versionshistorie ab 1.0
├── css/
│   ├── tokens.css         Alle Custom Properties, Light + Dark
│   ├── base.css           Reset, Typo-Defaults, Fokus, Scrollbar, Selection
│   ├── components.css     Alle Komponenten, framework-frei
│   └── surface-glass.css  Optionale Glas-Ebene (siehe 4.2)
├── tokens.json            Maschinenlesbar für Tailwind / Figma / Build-Tools
├── fonts/                 Libre Franklin + Open Sans, mit @font-face-Block
└── preview.html           Musterseite: jede Komponente in jedem Zustand
```

### 4.1 Token-Schichtung

Eine einzige, flache Token-Ebene — **keine** Indirektion über
austauschbare Marken-Variablen. Das Kit ist bewusst fest auf Putzmeister
festgelegt; eine Abstraktionsschicht für fremde Marken wäre ungenutzter
Aufwand.

Innerhalb von `tokens.css` werden die Werte trotzdem sichtbar getrennt:
**Markenwerte** (Farbe, Schrift) oben, **Systemwerte** (Skalen für
Abstand, Radius, Schatten, Motion) darunter. Rein zur Lesbarkeit, ohne
technische Umleitung.

### 4.2 Glas-Ebene als Schalter

`glass.css` wird als **separate, per `<link>` abschaltbare Datei**
übernommen (`css/surface-glass.css`). Grund: In Schritt B ist „Glas raus"
damit ein Ein-/Aus-Vergleich statt einer Umbauaktion — der
Vorher-Nachher-Test kostet Sekunden statt einer Refactoring-Runde.

Die dort enthaltenen **Token-Überschreibungen** (z. B. `--sidebar-bg`)
werden dabei kenntlich gemacht, damit der Konflikt aus 3.3 (2) nicht
unbemerkt mitwandert.

Die vollflächigen Hintergrundbilder (`abstract-app-light/dark.png`, je
~1,4 MB) werden **nicht** ins Kit kopiert. Sie werden in `DESIGN.md` als
optionales Ambient-Muster beschrieben, mit Hinweis auf die Dateigröße.
Ein Kit, das 3 MB Bilder mitschleppt, wird nicht kopiert.

## 5. Extraktionsregeln

Bindend für Schritt A:

1. **Gelebter Ist-Zustand, nicht Dateiinhalt.** Maßgeblich ist, was der
   Browser rechnet (Computed Style), nicht was in der Datei steht. Bei
   Widersprüchen wie `.btn` (3.3 (1)) gilt der effektive Wert; der
   verworfene Wert wird in `CHANGELOG.md` unter „bereinigt" vermerkt.
2. **Toter Code fliegt raus.** Tokens, die nirgends verwendet werden, und
   überschriebene Regeln werden nicht übernommen. Vorher wird die
   Verwendung geprüft, nicht geraten.
3. **Konflikte werden aufgelöst, nicht mitgenommen.** Wo zwei Quellen sich
   widersprechen (`variables.css` vs. `glass.css`), entscheidet der
   sichtbare Zustand; die Auflösung wird dokumentiert.
4. **Jeder Wert bekommt eine Rolle.** Kein Token ohne Antwort auf „wofür".
   Werte ohne erkennbaren Zweck werden zur Klärung vorgelegt statt still
   übernommen.
5. **Verifikation gegen die echte App.** Am Ende von Schritt A wird
   `preview.html` mit Screenshots der laufenden App verglichen
   (Light + Dark).

## 6. Inhalt von `DESIGN.md`

17 Abschnitte. Leitprinzip: **Entscheidungsdichte statt Wertelisten.**
Nicht „es gibt `--sp-4: 16px`", sondern „Karten-Innenabstand: 20px,
Abstand zwischen Karten: 16px, zwischen Abschnitten: 32px".

### Fundament

| # | Abschnitt | Inhalt |
|---|---|---|
| 1 | Grundsätze | 5–7 Leitsätze, jeweils mit Begründung, die im Zweifel die Entscheidung tragen |
| 2 | Farbe | Jede Stufe mit Hex, Rolle, gemessenem Kontrastwert, Dark-Mode-Entsprechung. Statusfarben-System. Regeln zum Gelb-Einsatz. Verbotene Kombinationen. |
| 3 | Typografie | Fonts inkl. Einbindung und Lizenz, Größenskala (px + rem), Gewichtszuordnung je Rolle, Zeilenhöhen, Überschriften-Hierarchie, Textfarben-Zuordnung, maximale Zeilenlänge |
| 4 | Abstände | Skala **und** Zuordnung: welcher Abstand in welcher Situation. Container-Breiten. Dichtestufen. |
| 5 | Radien | Skala mit Zuordnung je Elementtyp |
| 6 | Elevation | Semantische Ebenen (ruhend / überfahren / aktiv / schwebend) statt roher Schattenwerte |
| 7 | Rahmen & Trennlinien | Wann Kante, wann Schatten, wann Fläche — die häufigste offene Frage |
| 8 | Motion | Kurven, Dauern, was animiert werden darf und was nicht, `prefers-reduced-motion` |
| 9 | Fokus & Barrierefreiheit | Fokusring-Definition, WCAG-AA-Mindestwerte, Tastaturbedienung, **44px Touch-Ziele** (die Zielgeräte sind 11″-iPads) |
| 10 | Ikonografie | Stil, **eine** verbindliche Strichstärke, Größenraster, Farbzuordnung, Regel „keine gefüllten Flächen hinter Icons" |

### Komponenten-Katalog (Abschnitt 11)

Je Komponente: Zweck · Anatomie · exakte Maße · **alle** Zustände
(default, hover, active, focus-visible, disabled, loading, leer, Fehler) ·
Varianten · Do/Don't · Code-Snippet.

Buttons · Cards · Stat-Cards · Badges/Status-Chips · Avatare ·
Formulare (Input, Textarea, Select, Checkbox, Switch, Radio) ·
Progress · Modal · Bestätigungs-Dialog · Toast · Empty-State ·
Dropdown · Tooltip · Spinner · Tabellen · Tabs/Segment-Umschalter ·
Chips · Navigations-Muster (Sidebar/Topbar, nur Optik)

### Verhalten & Sprache

| # | Abschnitt | Inhalt |
|---|---|---|
| 12 | Feedback-Sprache | Wann Toast, wann Inline-Meldung, wann Modal, wann gar nichts |
| 13 | Microcopy | Buttonbeschriftungen (Verb statt Substantiv), Sie/Du, Datums- und Zahlenformate, Namensdarstellung („Vorname Nachname") |
| 14 | Dark-Mode | Regeln **und Fallen** — insbesondere: die Grauskala ist im Dunkelmodus invertiert; `grey-700/800/900` sind dort Textfarben, keine Flächen |
| 15 | Anti-Patterns | Verbotsliste mit Begründung. Was das Kit bewusst nicht tut. |
| 16 | Theming-Mechanik | Wie `data-theme` und Token-Überschreibung funktionieren, falls jemand einen eigenen Skin braucht |
| 17 | Checkliste | Abhakbare Liste für „neue Komponente" und „neue Seite" |

## 7. `SKILL.md`

Damit Claude das Kit in anderen Projekten von selbst anwendet, ohne dass
es jedes Mal erklärt werden muss. Enthält Frontmatter mit
Auslöse-Beschreibung (greift bei UI-Arbeit in Projekten, die das Kit
enthalten), einen komprimierten Schnellzugriff auf die häufigsten Werte
und Verweise in die ausführlichen `DESIGN.md`-Abschnitte.

Bewusst zweistufig: der Schnellzugriff deckt den Alltagsfall ab, ohne das
gesamte Regelwerk in den Kontext zu laden.

## 8. Professionalisierungs-Achsen (Schritt B)

Nach Freigabe von Schritt A wird je Achse ein Vorschlag vorgelegt,
gerendert und einzeln entschieden:

| # | Achse | Ist | Denkbare Richtung |
|---|---|---|---|
| 1 | Gelb-Einsatz | großflächig, auch als Fläche und Glow | nur Akzent: Fokus, Primäraktion, aktiver Zustand |
| 2 | Radien | 2–20px, 7 Stufen | flacher, weniger Stufen |
| 3 | Glas/Blur | 22 Stellen `backdrop-filter`, Ambient-Hintergründe | abschalten, ersetzt durch Fläche + Kante |
| 4 | Motion | inkl. `--ease-spring` (überschwingt) | nur ruhige Kurven, kürzere Dauern |
| 5 | Typografie | 9 Stufen, Buttons 12px/0.06em Versalien | Skala verdichten, Versalien prüfen |
| 6 | Dichte & Elevation | 7 Schattenstufen + 4 Elevation-Rollen | flacher, weniger Ebenen |
| 7 | Marken-Gelb | `#FFC300` | Angleichung an offizielles `#FFCD00` (siehe 3.2) |
| 8 | Icon-Strichstärke | 10 verschiedene Werte | eine verbindliche Stärke |

Die Liste ist der Startpunkt, nicht abschließend — aus Schritt A können
weitere Achsen dazukommen.

## 9. Verifikation

**Nach Schritt A:**
- `preview.html` in Light und Dark rendern (Playwright + Edge), Screenshots
- Direktvergleich gegen die laufende Berichtsheft-App (`localhost:3000`)
- Alle Text-auf-Fläche-Kombinationen gegen WCAG AA prüfen, Werte in
  `DESIGN.md` eintragen
- Gegenprobe: `preview.html` darf ausschließlich vom Kit abhängen, nicht
  von Berichtsheft-Dateien

**Nach Schritt B:** dieselben Prüfungen erneut, zusätzlich
Vorher-Nachher-Gegenüberstellung je Achse.

**Vor dem Einfrieren (Schritt C):** Praxistest — eine kleine Beispielseite
allein aus `DESIGN.md` bauen und prüfen, ob dabei Fragen offenbleiben.
Jede offene Frage ist eine Lücke im Kit und wird geschlossen.

## 10. Offene Punkte

Bewusst auf Schritt B vertagt, nicht vergessen:

1. **Marken-Gelb** `#FFC300` vs. offizielles `#FFCD00` — Korrektur oder
   bewusste Beibehaltung? Betrifft jede gelbe Fläche.
2. **Marken-Grau** `#54585A` aus dem Manual kommt in der App nicht vor.
   Als zusätzlicher Ton aufnehmen oder bei der neutralen Skala bleiben?
3. **Button-Versalien** — `text-transform: uppercase` bei 12px mit
   0.06em Laufweite. Markentypisch oder zu laut?
4. **Ambient-Hintergrundbilder** — ersatzlos streichen oder durch eine
   leichtgewichtige Alternative ersetzen?
5. **Fehlende Libre-Franklin-Schnitte** (siehe 3.3 (4)) — Regular und
   Medium nachladen (beide als Google Web Font frei verfügbar, das
   Manual nennt sie ausdrücklich) oder die Typografie-Regel auf die
   vorhandenen zwei Schnitte begrenzen? Ohne Entscheidung erbt jedes
   Folgeprojekt den synthetischen Fettschnitt.

## 11. Versionierung

`CHANGELOG.md` ab Version 1.0 (dem Stand nach Schritt C). Schritt A
erhält `0.1.0` als Zwischenstand, damit der Vorher-Nachher-Vergleich im
Git-Verlauf nachvollziehbar bleibt.

Ab 1.0 gilt: Das Kit wird zentral gepflegt, nicht pro Projekt angepasst.
Änderungswünsche aus Projekten fließen zurück ins Kit und kommen allen
zugute — oder sie werden abgelehnt. Das ist der Punkt der ganzen Übung.
