# pm-design-kit — Schritt B2: Entwurfsentscheidungen

**Stand:** 2026-09-22
**Vorgänger:** [B1](2026-09-22-design-kit-b1-design.md) (Aufgaben 1–7 umgesetzt, 8–14 ruhen)
**Arbeitsort:** `C:\Dev\pm-design-kit`, Zweig `schritt-b1`, Basis `dcc7585`

---

## 1. Zweck

B1 hat behoben, was objektiv falsch war — messbare Verstöße mit rechenbarer
Antwort. B2 entscheidet, was **nicht** rechenbar ist: wie das Kit aussehen
soll.

Der Unterschied ist grundlegend und bestimmt das Verfahren. In B1 konnte
die ausführende Sitzung Entscheidungen in fremdem Namen treffen, weil jede
ein Beleg war. In B2 gibt es keinen Beleg — nur Geschmack. Deshalb wurde
**jede** Achse dem Auftraggeber am gerenderten Bild vorgelegt, nicht
beschrieben: je eine Vergleichsseite mit zwei oder drei Varianten
nebeneinander, am echten Kit erzeugt.

Alle in diesem Dokument festgehaltenen Entscheidungen sind so getroffen
worden. Sie sind Vorgabe, nicht Vorschlag.

## 2. Einsatzzweck des Kits

**Beliebige Web-Anwendungen bei Putzmeister** — nicht nur weitere
Verwaltungsoberflächen wie das Berichtsheft, sondern auch Dashboards,
Portale, Übersichtsseiten.

Daraus folgt: Anwendungsspezifisches muss heraus, Lücken müssen
geschlossen werden. Ein **Corporate Design existiert nicht** als
verbindliche Vorgabe; interne Werkzeuge sind gestalterisch frei. Alle
Achsen waren damit echte Wahlfragen.

## 3. Inventur

### 3.1 Bauteile — alle 17 bleiben

Geprüft wurde, welche Bauteile Berichtsheft-spezifisch sind. **Ergebnis:
keines.** Button, Karte, Stat-Karte, Badge, Avatar, Formular,
Fortschrittsbalken, Modal, Bestätigung, Toast, Leerzustand, Dropdown,
Tooltip, Spinner, Segment, Chip und Kommentar sind das Grundvokabular
jeder Anwendung.

Die Spezifik sitzt eine Ebene tiefer: in **7 von 24 Varianten**.

| Variante | Warum fachlich |
| --- | --- |
| `.badge--offen` `--freigegeben` `--genehmigt` `--erstgenehmigt` `--abgelehnt` | Freigabekette des Berichtshefts; „erstgenehmigt" stammt aus der zweistufigen Genehmigung |
| `.comment--ausbilder` | „Ausbilder" ist eine Berichtsheft-Rolle |
| `.comment--abgelehnt` | dieselbe Freigabelogik |

**Entscheidung:** Diese sieben bleiben im Kit, werden aber klar als
**Anwendungsbeispiel** gekennzeichnet statt als Bestandteil — mit einer
Anleitung, wie eine neue Anwendung ihre eigenen Zustände anlegt.

Das ist dieselbe Struktur wie die Token-Befunde aus B1: Nicht das Ding ist
falsch, sondern ein Name trägt zwei Rollen. Die Antwort war dort Trennen
statt Biegen und ist es hier auch.

### 3.2 Lücken — nur eine wird geschlossen

Gemessen wurde an der Quelle, nicht geraten: Was dort mehrfach über Seiten
hinweg vorkommt und im Kit fehlt, ist eine belegte Lücke.

| Lücke | Beleg | Entscheidung |
| --- | --- | --- |
| **Skeleton / Ladezustand** | steht in `base.css` — einer der vier vom Kit gespiegelten Dateien | **wird ergänzt** |
| Tabs | 3 Seiten | nicht |
| Inline-Hinweis | 4 Seiten mit je eigener `*-hinweis`-Klasse | nicht |
| Tabelle | 5 Seiten | nicht |
| Navigation | `layout.css`, vollständig vorhanden | bleibt Lücke (Layout ist Nicht-Ziel) |

Nicht belegt und deshalb ausdrücklich **nicht** gebaut: Paginierung
(0 Treffer), Akkordeon (0), Datumsauswahl und Upload (je nur eine Seite).

**Zum Skeleton:** Die Regel ist beim Ernten durchgerutscht, vermutlich weil
sie kein Bauteil mit sichtbaren Zuständen ist — kein Hover, kein Fokus,
nichts zu messen, also nie im Katalog. Das Kit kennt damit nur *einen*
Ladezustand (Spinner: „es passiert etwas, Dauer unbekannt"); der zweite und
verbreitetere („der Inhalt kommt gleich, hier ist seine Form") fehlt. Die
Regel ist rein token-basiert (`--pm-grey-100/200`, `--r-sm`) und damit
unverändert übernehmbar.

## 4. Die Entscheidungen

### 4.1 Glas-Ebene — entfällt vollständig

`css/surface-glass.css` (380 Zeilen) wird gelöscht.

**Grundlage der Entscheidung.** Gemessen wurde, was die Ebene tatsächlich
tut: 12 Unterschiede im Hellmodus, 11 im Dunkelmodus, verteilt auf drei
sehr ungleiche Wirkungen.

| Wirkung | Bauteile | hell | dunkel |
| --- | --- | --- | --- |
| Weißer Glanzstreifen (inset) | 5 | 0,45–0,70 | 0,05–0,10 |
| Farbverlauf von oben | 3 | 0,45–0,55 | 0,04–0,05 |
| Transparenz + Weichzeichner | **1** | `blur(16px) saturate(1.6)` | identisch |

Der namensgebende Effekt betrifft genau **ein** Bauteil von sieben
(`.pm-select__menu`). Die übrigen elf Wirkungen sind Glanz und Verlauf —
Hochglanz-Optik, kein Glas — und im Dunkelmodus auf Deckkraft 0,04 bis 0,10
heruntergeregelt, also rechnerisch vorhanden und praktisch unsichtbar.

**Folgearbeiten, die daraus zwingend entstehen:**

1. `.dropdown__item--danger` bezieht seine Dunkelmodus-Lesbarkeitskorrektur
   (`--color-error-mid`) **ausschließlich** über diese Datei. Sie muss
   nach `components.css` übernommen werden, sonst entsteht ein neuer
   Lesbarkeitsmangel.
2. Die neun Glas-Tokens werden toter Code und sind zu entfernen.
3. `.card--flat` wirkt danach wieder wie vorgesehen — der Befund aus
   Schritt A erledigt sich.
4. Die eigenen Modal-Literale (0,06 / 0,04) entfallen mit.
5. `DESIGN.md` 7.4 („Die Glas-Ebene") entfällt; Abschnitt 6 (Elevation)
   und 7 (Rahmen) sind auf Verweise zu prüfen.
6. `preview.html` lädt die Datei nicht mehr; `check:standalone` und
   `check:paritaet` sind entsprechend nachzuziehen.

**Nützlich:** `extraktion/vorlage-glass-aus.json` aus Schritt A ist bereits
eine Messung ohne Glas. Als Kontrolle brauchbar, **nicht als Soll** — die
Farbänderungen aus B1 fehlen darin.

### 4.2 Radien — 1 · 2 · 4 · 6 · 8

| Token | alt | neu |
| --- | --- | --- |
| `--r-sm` | 4px | **1px** |
| `--r-md` | 8px | **2px** |
| `--r-lg` | 12px | **4px** |
| `--r-xl` | 16px | **6px** |
| `--r-2xl` | 20px | **8px** |
| `--r-full` | 9999px | unverändert |

Nicht betroffen: die vier literalen `50%` (Avatar, Spinner, Punkte). Das
ist Kreisform, keine Radius-Entscheidung.

**Warum nicht weiter.** Eine noch schärfere Stufe (0 · 2 · 2 · 4 · 4) wurde
verworfen, weil dort zwei Tokenpaare denselben Wert trügen: Unterhalb von
etwa 8px ist kein Platz für fünf unterscheidbare Abstufungen. Zwei Tokens
mit identischem Wert geben vor, eine Entscheidung anzubieten, die es nicht
gibt — wer `--r-lg` statt `--r-md` schriebe, drückte damit nichts mehr aus.
Bei 1 · 2 · 4 · 6 · 8 bleiben alle fünf Stufen wirksam.

### 4.3 Dichte — −25 %

| Token | alt | neu | Token | alt | neu |
| --- | --- | --- | --- | --- | --- |
| `--sp-1` | 4px | **3px** | `--sp-4` | 16px | **12px** |
| `--sp-2` | 8px | **6px** | `--sp-5` | 20px | **15px** |
| `--sp-3` | 12px | **9px** | `--sp-6` | 24px | **18px** |

`--sp-8` bis `--sp-16` (Layout-Abstände) bleiben unverändert — Layout ist
Nicht-Ziel des Kits.

### 4.4 Schriftgrößen — Grundtext 14px

| Token | alt | neu | | Token | alt | neu |
| --- | --- | --- | --- | --- | --- | --- |
| `--text-xs` | 11px | **10px** | | `--text-xl` | 20px | **19px** |
| `--text-sm` | 13px | **12px** | | `--text-2xl` | 24px | **22px** |
| `--text-base` | 15px | **14px** | | `--text-3xl` | 30px | **28px** |
| `--text-md` | 16px | **15px** | | `--text-4xl` | 36px | **34px** |
| `--text-lg` | 18px | **17px** | | | | |

**Geprüft und unkritisch:** Von den 102 Kontrastpaaren fordern 96 bereits
4,5:1; die sechs mit 3,0 sind ausnahmslos **Nicht-Text** (WCAG 1.4.11:
Icons, Ränder, grafische Punkte). Kein Paar beruft sich auf die
Vergünstigung für großen Text. Die Verkleinerung kann deshalb über diesen
Weg keine neuen Verstöße erzeugen — was nicht selbstverständlich ist:
`--text-2xl` fällt von 24px auf 22px und verlöre den Status „großer Text",
wenn ein Paar darauf gebaut hätte.

### 4.5 Gelb — Aktion ja, Identität nein

**Die Regel:** Gelb als Akzent und Linie ja, Gelb als große Fläche
grundsätzlich nein. Gelb markiert **Aktion und Fortschritt**, nicht
Identität und Schmuck.

Das Kit setzte Gelb an 32 Stellen ein, davon 14 als Fläche. Was sich
ändert:

| Stelle | alt | neu |
| --- | --- | --- |
| `.avatar` | `--pm-yellow` Fläche | `--pm-grey-200`, Text `--pm-grey-800` |
| `.stat-card__icon--yellow` | `--pm-yellow-bg` | `--pm-grey-100` |
| `.pm-select__option--selected` | `--pm-yellow-bg` | `--pm-grey-100` |
| `.comment--ausbilder` | gelbe Kante | `--pm-grey-400` |
| `.chip.selected` box-shadow | gelber Schatten | **entfällt ersatzlos** |
| `.btn-primary:focus-visible` | gelber Ring | `--pm-grey-900` |
| `.badge--yellow` | gelb getönt | **Variante wird abgeschafft** |

**Unverändert gelb:** `.btn-primary` (Fläche und Hover),
`.progress-bar__fill`, `.toast::after`, `.pm-select__hl` (Suchtreffer),
`::selection`, `.btn-outline-yellow`, `.pm-switch`,
Checkbox-`accent-color`, Spinner, `.pm-select--open .pm-select__trigger`.

**Nicht mehr gelb, siehe 4.5.1:** `.form-control:focus` und jede weitere
Fokus-Darstellung.

**Marken-Gelb `#FFC300` bleibt unverändert** — der Ton stand nie in Frage,
nur seine Verwendung.

**Der Fokusring wird neutral, nicht entfernt.** Das ist keine
Geschmacksentscheidung, sondern technisch erzwungen: Ein gelber Ring um
einen gelben Button ist nicht zu sehen, und auf weißem Grund kontrastiert
Gelb ohnehin zu schwach. Entfernen wäre ein Verstoß gegen WCAG 2.4.7.
Neutral erreicht er 17,40:1.

### 4.5.1 Fokus wird durchgehend neutral

**Entschieden:** Der Fokus ist im ganzen Kit neutral. Gelb bleibt
Auswahlfarbe. Zwei Bedeutungen, zwei Farben, keine Überschneidung:

> **Dunkel heißt „hier ist die Tastatur". Gelb heißt „das ist gewählt".**

Der Anlass war ein Widerspruch, der beim Einzelentscheiden nicht auffällt:
Der Fokusring am Button musste neutral werden (Gelb auf Gelb ist
unsichtbar), der Fokus am Eingabefeld wäre als gelber Rand geblieben —
zwei Fokusfarben in **einem** Formular. Jede Begründung für sich trägt,
zusammen ergeben sie eine Inkonsistenz. Es ist dieselbe Fehlerklasse, die
B1 viermal beseitigt hat, und die Antwort ist dieselbe: ein Name, eine
Rolle.

**Betroffen sind alle Fokus-Darstellungen**, nicht nur die beiden
genannten:

| Stelle | alt | neu |
| --- | --- | --- |
| `.btn-primary:focus-visible` | weißer + gelber Ring | weißer + `--pm-grey-900` |
| `.form-control:focus` | Rand `--pm-yellow` | neutral |
| `.pm-select__trigger:focus-visible` | `--ring-yellow` | neutral |
| `.btn-secondary` / `.btn-success` Ringe | farblich zur Fläche | neutral, oder als begründete Ausnahme beibehalten |
| übrige `:focus-visible` | uneinheitlich | neutral |

**Folge für die Token-Namen.** `--ring-yellow` und `--ring-yellow-sm`
heißen danach falsch — ein Token, dessen Name eine Farbe nennt, die er
nicht mehr trägt, ist schlimmer als gar keiner. Sie sind umzubenennen
(etwa `--ring-fokus`, `--ring-fokus-sm`). Das berührt die in B1-Aufgabe 8
geplante Ring-Landschaft grundlegend: Deren Entwurf ging von fünf
Ring-Tokens für sechs Fokus-Darstellungen aus, teils farblich zur
Schaltfläche passend. Diese Begründung entfällt mit der
Neutral-Entscheidung; der Brief zu Aufgabe 8 ist entsprechend zu
überarbeiten, bevor er ausgeführt wird.

**Nicht betroffen:** `.pm-select--open .pm-select__trigger` (gelber Rand
am *aufgeklappten* Feld). Das ist ein Zustand, kein Fokus — „offen" ist
eine Form von „gewählt" und bleibt damit gelb.

**Alle neuen Kombinationen sind gerechnet und bestehen AA:**

| Kombination | Kontrast | Ziel |
| --- | --- | --- |
| Avatar-Initialen auf Grau (hell) | 10,58:1 | 4,5 |
| Avatar dunkel (Grauskala invertiert!) | 7,25:1 | 4,5 |
| Stat-Icon- / Auswahlfläche | 12,25:1 | 4,5 |
| Fokusring gegen Seitengrund | 17,40:1 | 3,0 |
| Kommentarkante (Nicht-Text) | 4,54:1 | 3,0 |
| Primärbutton-Text auf Gelb | 10,82:1 | 4,5 |

### 4.6 Bewegung — ruhiger, ohne Überschwinger

| Token | alt | neu |
| --- | --- | --- |
| `--t-fast` | 140ms | **100ms** |
| `--t-normal` | 220ms | **160ms** |
| `--t-slow` | 380ms | **240ms** |
| `--t-spring` | 320ms, `cubic-bezier(.34, 1.56, .64, 1)` | **180ms**, `cubic-bezier(.25, 1, .5, 1)` |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | **`cubic-bezier(.25, 1, .5, 1)`** |

Der Wert **1,56** war ein Überschwinger: Aufklappendes schoss über seine
Endgröße hinaus und federte zurück — der deutlichste verspielte Zug im Kit
und unvereinbar mit der sachlichen Richtung der übrigen Entscheidungen.
Übergänge bleiben erhalten, sie drängen sich nur nicht mehr auf.

### 4.7 Icon-Strichstärke — 1,5

`DESIGN.md` 10.2 schreibt bisher **2** vor (die Quelle hält sich mit zehn
verschiedenen Stärken ohnehin nicht daran). Künftig gilt **1,5**.

Das Kit liefert weiterhin **keine** Icons mit; es schreibt nur vor, wie sie
auszusehen haben. Zu dokumentieren ist der größenabhängige Vorbehalt:
Dieselbe Stärke wirkt bei 16px und bei 32px unterschiedlich.

## 5. Was nicht Teil von B2 ist

- **Layout und Navigation.** Unverändertes Nicht-Ziel.
- **Die B1-Aufgaben 8–14.** Sie ruhen. Ihre Briefe liegen fertig vor; die
  Tabelle (Aufgabe 12) entfällt ersatzlos, da die Lücke bewusst offen
  bleibt. Aufgabe 8 lag als Teilstand vor und wurde gestasht
  (`stash@{0}`) — durch die Token-Änderungen dieser Spec wird er
  voraussichtlich unanwendbar; dann ist aus dem Brief neu zu bauen.
- **Der Dunkelmodus als eigene Achse.** Er folgt den Token-Änderungen
  automatisch, ist aber nach jedem Schritt zu prüfen: Die Grauskala ist
  dort invertiert (`--pm-grey-800` ist Textfarbe, nicht Fläche).

## 6. Prüfverfahren

Die bestehende Kette gilt unverändert und muss am Ende vollständig grün
sein: `check:tokens`, `check:kontrast`, `check:css`, `check:standalone`,
`check:zahlen`, `check:werte`, `check:paritaet`.

Besonders zu beachten:

1. **`check:paritaet` schlägt zwangsläufig aus.** Die Soll-Werte
   (`extraktion/soll-*.json`) bilden den Zustand vor B2 ab. Sie sind nach
   jeder Aufgabe über `npm run soll -- --uebernehmen` neu zu setzen — und
   **jede Abweichung muss im Bericht einer Ursache zugeordnet sein.** Eine
   unerklärte Abweichung ist ein Mangel, keine Formalie.
2. **`check:werte` hält die Dokumentation gegen `tokens.json`.** Wer einen
   Wert nennt, nennt den aktuellen (`DESIGN.md` 17.3). Bei diesem Umfang
   an Wertänderungen ist das die wahrscheinlichste Fehlerquelle.
3. **`check:zahlen` prüft 25 numerische Aussagen.** Viele davon ändern
   sich (Tokenzahlen, Größenangaben, die Zahl der Bauteilvarianten).
4. **Die Kontrastpaare sind anzupassen**, nicht nur zu bestehen: Paare zu
   `.badge--yellow` entfallen, Paare zu Avatar, Stat-Icon, Auswahlfläche,
   Kommentarkante und Fokusring kommen hinzu.
5. **Null AA-Verstöße bleiben Bedingung.** Der in B1 erreichte Stand darf
   durch keine Gestaltungsentscheidung verloren gehen.

## 7. Risiken

| Risiko | Einschätzung |
| --- | --- |
| **Touch-Ziele** | `dropdown__item` fällt von 42px auf 35px. Erfüllt WCAG 2.5.8 (24px), nicht die empfohlenen 44px. Zu lösen über die `@media (pointer: coarse)`-Ebene aus B1-Aufgabe 8, die damit von Kür zu Pflicht wird — die Azubis arbeiten auf 11-Zoll-iPads. Bauteile mit fester Höhe (Button 40px, btn-sm 32px, PmSelect 36px) sind nicht betroffen. |
| **10px-Texte** | `--text-xs` landet bei 10px (Hinweis unterm Feld, Datum am Kommentar). Kontrastseitig unkritisch, aber an der Grenze des Lesbaren. Bei der Sichtprüfung gezielt zu bewerten. |
| **Kumulative Wirkung** | Radien, Dichte, Schrift und Gelb greifen alle in dieselbe Richtung. Die Kombination wurde vorgelegt und bestätigt; eine erneute Sichtprüfung am fertigen Kit bleibt trotzdem der letzte Schritt. |
| **Umfang** | Es ändern sich rund 25 Tokens, eine Datei entfällt, und `DESIGN.md` ist an mindestens zehn Stellen betroffen. Das ist deutlich mehr als eine B1-Aufgabe. Die Arbeit ist entsprechend zu schneiden. |

## 8. Offene Punkte

1. **Sie oder Du** in Ausbilder-Ansichten (aus B1 offen).
2. **Libre-Franklin-Schnitte 400 und 500** fehlen; bis dahin erzwingt
   `check:css` die Einschränkung (aus B1 offen).
3. **Zwei vorbestehende Geister-Dateien** im Quell-Repo
   (`Ausbilder-Ansicht`, `list.includes(role))`) — Entscheidung des
   Auftraggebers.
4. **Der Ordner `entscheidungen/`** ist Werkzeug, nicht Kit-Bestandteil.
   Nach B2 ist zu entscheiden, ob er bleibt (als Nachweis, worauf die
   Entscheidungen beruhten) oder entfernt wird.
