# Fahrgelderstattung — Layout-Überarbeitung und Freischaltung

*Design-Spec, 2026-08-25. Vorbereitung Go-Live.*

## Ausgangslage

Die Seite `app/fahrgelderstattung.html` ist funktional fertig, aber optisch nicht
Go-Live-reif:

- **Zu viel Scrollen.** Zwei gestapelte Karten (Stammdaten, Monatsauswahl) plus eine Monatsliste
  mit einer Zeile pro Monat. Nach drei Ausbildungsjahren sind das bis zu 36 Zeilen; schon heute
  liegt „Formular erstellen" unter dem Bildschirmrand.
- **Breite ungenutzt.** `body[data-page="fahrgelderstattung"] .main-content` ist auf `1080px`
  gedeckelt (`app/css/layout.css:696`); auf einem 1920er-Monitor bleiben rechts ~200 px leer,
  und die Karte selbst zieht nur sechs Label/Wert-Paare auseinander.
- **Fette Text-Buttons.** „AUS DOKUMENT ÜBERNEHMEN", „BEARBEITEN", „UNTERSCHRIFT ERSTELLEN" sind
  Text-Pillen in Versalien — laut, ohne dass die Aktionen es rechtfertigen.
- **Kostenstelle vorgegeben.** Placeholder `10000956` und der Modal-Hinweis „die Kostenstelle ist
  vorausgefüllt" suggerieren einen festen Wert. Sie ist je Azubi unterschiedlich.
- **Unterschrift als „optional" ausgewiesen** — fachlich falsch, das Formular verlangt sie.
- **Feature gesperrt.** `previewUnlocked()` zeigt außerhalb von localhost nur „kommt bald".

Zielgerät ist unter anderem ein **11-Zoll-Bildschirm** (1280 × 720 CSS-px im engeren Fall).
Dort soll die Seite ohne Scrollen bedienbar sein.

## Gewählte Richtung: „Kopfzeile + Jahresraster"

Aus drei als 1:1-Mockup geprüften Richtungen (A Zwei-Spalten, B Kopfzeile + Jahresraster,
C Master-Detail mit Inline-Formular) wurde **B** gewählt. Gemessen im Mockup: Inhaltsunterkante
bei 494 px von 720 px — kein Scrollen, ~220 px Reserve.

Mockup-Referenz:
`c:\dev\digitales Berichtsheft\.superpowers\brainstorm\3321-1787641048\content\layout-richtungen.html`
(Rahmen 3 = Richtung B).

Leitgedanke: Die Stammdaten sind **Kontrolldaten** — einmal eingerichtet, danach nur noch
angeschaut. Sie kochen auf eine Zeile ein (nicht: verschwinden). Der Platz geht an die Monate,
die eigentliche Arbeit der Seite.

## Umfang

### 1. Seitenbreite

`app/css/layout.css:694-698` — die Sonderregel für diese Seite von `1080px` auf
`min(1600px, 100%)`. Nicht die vollen 2200 px der Cockpit-Seiten: darüber werden die
Monatskacheln unnötig breit.

### 2. Stammdaten-Kopfzeile (ersetzt `buildStammdatenCard`)

Eine flache Zeile (`.fg-strip`) statt der Karte:

| Feld | Anzeige |
|---|---|
| Name | `Kern, Florian` |
| Pers.-Nr. | `123456` |
| Kostenstelle | `10000956` |
| Strecke | `Aichtal → Werk` (`vonHaltestelle` und `nachHaltestelle` zusammengezogen) |
| Tagessatz | `8,30 €` |
| Unterschrift | Bild-Vorschau, Höhe 26 px |

Jedes Element: Label in `.pm-lbl`-Manier (11 px, versal, `--pm-grey-400`) über dem Wert,
dazwischen 1-px-Trenner. Rechts, am Zeilenende, zwei **rahmenlose Icon-Buttons**:

- Upload-Icon → „Aus Dokument übernehmen" (heutiger `#fg-upload-doc`)
- Stift-Icon → „Bearbeiten" (heutiger `#fg-edit`)

Beide mit `title`/`aria-label`, Hover = dezenter Hintergrund. Keine Beschriftung, keine Rahmen.

Die **Unterschrift-Vorschau ist selbst anklickbar** und öffnet `SignaturDialog` zum Neuzeichnen
(`title="Unterschrift ändern"`). Das ersetzt den bisherigen Button „Ändern".

Die Untertitel „Werden in jede Fahrgelderstattung übernommen." und der Unterschrift-Erklärtext
entfallen ersatzlos.

Die Zeile zeigt nie Lücken: sie wird nur gerendert, wenn `setupFertig()` wahr ist (siehe 5),
also alle Werte vorliegen. Vorher steht der Einrichtungs-Screen.

### 3. Monatsraster (ersetzt `buildMonatCard`)

Eine Karte „Monat auswählen", darin pro Kalenderjahr eine Gruppe:

```
2026  ───────────────────────  13 Berufsschultage · 107,90 €
[August]  [Juli]  [Juni]  [Mai]
[April]   [März]  [Feb]   [Januar]

▸ 2025 ──────────────────────  21 Berufsschultage · 174,30 €
```

- Raster: `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`.
  Ergibt 4 Kacheln bei 11", ~7 auf einem 1920er-Monitor — die Breite wird echt genutzt.
- **Kachel** = `<label>` mit verstecktem Radio (`name="fg-monat"`, wie heute; erhält
  Tastaturbedienung und die bestehende `change`-Bindung). Inhalt: Monatsname, `n Schultage`,
  Betrag in Gelb. Rechts oben der grüne Haken, wenn für diesen Monat bereits heruntergeladen
  wurde (`downloads`-Merker, unverändert). Ausgewählte Kachel wie heute: gelbe Border +
  `inset`-Ring + `--pm-yellow-bg`.
- **Überzählige Tage** (> 10) bleiben als Warnhinweis in der Kachel.
- **Welche Monate erscheinen:** alle Monate mit Berufsschultagen, zusätzlich der laufende Monat.
  Hat der laufende Monat noch keine Schultage, erscheint er ausgegraut und nicht wählbar
  („noch keine Schultage"). Zukünftige Monate erscheinen nicht.
- **Vorauswahl:** der neueste Monat *mit* Schultagen — nicht die ausgegraute Kachel des
  laufenden Monats. `selectedMonatKey` überlebt Re-Renders wie bisher.
- **Jahresgruppen:** absteigend. Das laufende Jahr ist offen (es enthält immer mindestens die
  Kachel des laufenden Monats), alle älteren sind eingeklappt. Umsetzung mit nativem
  `<details>/<summary>` — kein eigener State, kein JS.
  Die `summary`-Zeile trägt Jahr, Anzahl Schultage und Jahressumme.
- Der Hinweistext „Es werden nur Tage mit dem Ort ‚Schule' gefüllt (max. 10 pro Monat …)"
  schrumpft auf eine kurze Randnotiz rechts in der Kartenkopfzeile.

### 4. Aktionsleiste

Unter der Karte, rechtsbündig: gewählter Monat + Anzahl Tage als kleines Label, darunter der
Betrag groß in Gelb, daneben der Primär-Button „Formular erstellen" (öffnet wie bisher das
Vorschau-Modal). Ist der laufende Monat ohne Schultage gewählt bzw. gibt es gar keine Monate,
ist der Button deaktiviert.

### 5. Pflichtfelder

`PFLICHT` (`app/js/fahrgelderstattung.js:33`) wird auf **alle sechs Felder** erweitert — `kst`
kommt dazu. Zusätzlich ist die **Unterschrift Pflicht**.

Trennung, damit das Modal nicht über ein Feld meckert, das es nicht enthält:

- `fehlendeFelder(quelle)` — prüft weiterhin nur die sechs Konfig-Felder, wird im Modal benutzt.
- `setupFertig()` — `fehlendeFelder().length === 0 && !!unterschrift?.dataUrl`. Entscheidet, ob
  der Einrichtungs-Screen (`buildEmptyState`) oder die fertige Seite gerendert wird.

Folgeänderungen:

- Placeholder `z.B. 10000956` am Kostenstellen-Feld entfällt (leer lassen).
- Der Modal-Hinweis „Name kommt aus deinem Profil, die Kostenstelle ist vorausgefüllt. Strecke
  und Tagessatz bitte eintragen." entfällt.
- Der Kommentar „(KST ist konstant/vorausgefüllt)" an `PFLICHT` entfällt.
- In `uploadDokument` fällt die Zeile `if (!neu.kst) neu.kst = konfig?.kst || ''` samt Kommentar
  weg — sie war nur nötig, solange KST kein Pflichtfeld war. Fehlt die KST im Dokument, greift
  ab jetzt der normale „fehlende Felder ergänzen"-Pfad.
- Nach erfolgreichem Speichern im Stammdaten-Modal: fehlt noch die Unterschrift, öffnet sich
  direkt `SignaturDialog` statt eines halbfertigen Zustands.
- Stehen die Stammdaten bereits und fehlt **nur** die Unterschrift, zeigt `buildEmptyState()`
  eine eigene Variante („Unterschrift hinterlegen" + Button) statt des Formular-Einrichtens —
  sonst liefe der Azubi durch ein Stammdaten-Modal, in dem er nichts zu ändern hat.
- Die Unterschrift lässt sich nicht mehr entfernen (`#fg-sig-remove` entfällt) — nur ersetzen.

### 6. Unterschrift: localStorage → Backend

Heute liegt sie unter `fahrtgeldUnterschrift_<oid>` im `localStorage`, also pro Browser. Als
Pflichtangabe wäre sie auf jedem neuen Gerät weg und der Azubi landete erneut im
Einrichtungs-Screen.

Umstellung auf die bestehenden Endpunkte — **kein neuer Backend-Code**:

- Laden: `DB.getMeineUnterschrift()` → `GET /api/unterschrift/meine` → `{dataUrl, extension}|null`
- Speichern: `DB.setMeineUnterschrift(sig)` → `PUT /api/unterschrift/meine`

Einmalige Migration beim Laden der Seite: liefert der Server `null` und liegt lokal noch eine
Unterschrift, wird diese hochgeschoben und der `localStorage`-Schlüssel danach gelöscht. Der
Download-Merker (`fahrtgeldDownloads_<oid>`) bleibt bewusst lokal — er ist reine Anzeigehilfe.

### 7. Download-Buttons entschärfen

`.fg-dl-btn` in `app/css/fahrgelderstattung.css`: Farbverläufe, Border und der
`inset`-Glanz-Boxshadow raus, flache Farbe (`#107c41` bzw. `#b91c1c`) und Logo bleiben. Struktur
und Beschriftung unverändert — Grün/Rot ist hier Wiedererkennung, kein Deko-Fett.

### 8. Freischaltung für Azubis

`previewUnlocked`-Sperre entfernen in:

- `app/js/fahrgelderstattung.js:17`
- `app/js/abteilungsdurchlauf.js:41`
- `app/js/abteilungs-planer.js:610` (Ausbilder-Gegenstück — ohne sie könnten Azubis einen
  Durchlauf sehen, den niemand pflegt)

`previewUnlocked()` und `renderComingSoon()` bleiben in `app/js/app.js` stehen: sie sind der
dokumentierte Mechanismus für das nächste unreife Feature, kein Überbleibsel dieser Änderung.

## Kleinere Bildschirme

Gemäß der Hausregel „kleiner Bildschirm = dasselbe Design, nur kleiner" ändert sich unterhalb
von 11" die **Anordnung**, nicht das Material:

- < ~900 px: Kopfzeile bricht in ein 2–3-spaltiges Raster um (`flex-wrap`), Icons rutschen in
  die erste Zeile rechts.
- < ~640 px: Monatskacheln zweispaltig; die Aktionsleiste wird vollbreit.
- Kein Element verschwindet an einem Breakpoint.

## Themes

Die Seite muss in allen Flavor-Themes geprüft werden, insbesondere **Silk** (remappt
`--pm-white`/`--pm-grey`) und **CMD**. Konkret zu prüfen: die Kachel-Borders, der grüne
Download-Haken (`--color-success-*`) und die Trenner in der Kopfzeile — dort haben getönte
Neutral-Tokens in der Vergangenheit Kästchen erzeugt bzw. Statusfarben unsichtbar gemacht.

## Nachtrag 2026-08-25: Beträge, Blockunterricht und Fremddaten im Beleg

Beim Umsetzen kamen drei Punkte dazu, die über das Layout hinausgehen.

### 9. Keine 10-Tage-Deckelung mehr

Bisher rechnete die Seite `Math.min(tage.length, 10) × Tagessatz` und warnte bei „überzähligen"
Tagen. Fachlich falsch: jeder Tag mit dem Ort „Schule" zählt, ein ganzer Blockmonat also auch.
Die Deckelung, der Warnhinweis und der Zusatz „max. 10 pro Monat" entfallen; die Vorschau-Tabelle
wächst über zehn Zeilen hinaus.

Damit musste der **Export** mitwachsen, sonst zeigte die App 124,50 € und die Datei enthielte 83,00 €
(so gemessen, bevor es behoben war). Beide Vorlagen werden deshalb verlängert — aber **nur**, wenn
die Tage die zehn Vorlagenzeilen wirklich überschreiten; bis einschließlich zehn bleibt alles exakt
wie vorher.

- **Excel** (`verlaengereExcelTabelle`): `duplicateRow(19, extra, true)` kopiert Rahmen und
  Zeilenhöhe und schiebt den Fußblock nach unten. ExcelJS zieht dabei die **Verbund-Zellen nicht
  mit** (gemessen: nach Speichern+Laden fehlten die des Fußblocks ganz), deshalb werden alle Merges
  ab der ersten neuen Zeile gelöst und neu gesetzt: `A:B`, `C:D`, `E:F` je Datenzeile und Fußzeile,
  dazu `G{summe}:G{unterschrift}`. Summenformel, Datumszelle und der Anker des Unterschriftsbilds
  hängen ab jetzt an berechneten Zeilennummern statt an den Konstanten 20/21.
- **PDF** (`verlaengerePdfSeite`): Die Seite kann nicht umbrechen, der Unterschriftsblock steht
  direkt unter der Tabelle. Statt das Gitter nachzuzeichnen, wird eine **saubere Zeilen-Bande der
  Vorlage als XObject gestempelt** (`embedPage` mit Bounding-Box y 399,3–418,6), die Abschlusslinie
  und der Fußblock wandern um `extra × 19,32 pt` nach unten. Das Original-Formular bleibt damit
  pixelgenau. Geometrie aus dem Content-Stream gemessen, nicht aus den Feld-Rechtecken — die streuen
  um bis zu 1,4 pt. Unter y≈283 ist die Seite leer, es passen also 13 zusätzliche Zeilen; mehr
  Berufsschultage hat kein Monat.
  Die gestempelten Zeilen tragen keine Formularfelder, ihre Werte werden gezeichnet
  (Helvetica 9, linksbündig wie die Feldzeilen darüber). Summen- und Auszubildenden-Feld liegen im
  verschobenen Fußblock — ihre Widgets kleben als Annotation über allem, was man darunter zeichnet,
  also werden sie entfernt und ebenfalls gezeichnet. Bis zehn Tage bleibt die PDF unverändert
  ausfüllbar.

### 10. Keine Angabe im Beleg, die nicht vom Nutzer stammt

Ein Audit beider Vorlagen förderte zutage: die **PDF-Vorlage enthält die Kostenstelle `10000957`
als statischen Seiteninhalt**, nicht als Formularfeld. Jede erzeugte PDF trug damit eine fremde
Kostenstelle, unabhängig von der Eingabe — in einem Beleg, der zur Entgeltabrechnung geht.

- Der Text wird **aus dem Content-Stream entfernt** (`entferneStatischenText`), nicht weiß
  übermalt: übermalt bliebe er in der Datei und wäre per Textsuche oder Copy-Paste auslesbar.
  Die Zeichenketten des Textblocks an der bekannten Textmatrix werden geleert, das Gerüst
  (`BT`/`ET`, `Tf`, `Tm`) bleibt stehen, damit der Stream gültig bleibt. Findet sich nichts —
  etwa weil die Vorlage später bereinigt wird — passiert nichts (Rückfall: überdecken plus
  Konsolen-Warnung).
- Danach wird die **echte** Kostenstelle an dieselbe Stelle gezeichnet.
- Zusätzlich werden **alle Textfelder der PDF zuerst geleert** und Name/Pers.-Nr. danach
  unbedingt gesetzt. Vorher liefen sie über `if (konstanten.x)` — bei leerem Wert wäre ein
  Vorgabewert der Vorlage im Dokument geblieben.
- Nachgewiesen mit einem **Leertest**: Dokumente mit komplett leeren Stammdaten erzeugen und
  prüfen, dass außer Formular-Beschriftungen und den Daten aus dem Berichtsheft nichts drinsteht.
  `10000957` taucht nicht mehr auf.

Nicht angefasst: das zweite Arbeitsblatt „Tabelle 2" der Excel-Vorlage (eine Monatsliste 2015–2017,
vermutlich Quelle einer Auswahlliste) und der SharePoint-Link in der PDF-Fußzeile. Beides ist Teil
des Firmenformulars und enthält keine Personendaten.

### 11. Beträge immer mit zwei Nachkommastellen

Die Excel-Vorlage bringt das Zahlenformat `#,##0.00 _€` selbst mit, `duplicateRow` trägt es auf die
neuen Zeilen. Im PDF wird ohnehin `toFixed(2)` gezeichnet. Offen waren zwei Stellen in der App:
das Tagessatz-Feld im Stammdaten-Modal (zeigte „8,3") und die editierbaren Betragszellen der
Vorschau (blieben stehen, wie getippt). Beide normalisieren jetzt auf zwei Nachkommastellen.

### 12. Summe in der Vorschau zentriert

`.fg-sheet__summe-wert` saß rechtsbündig am unteren Rand des Felds und wirkte verrutscht. Sie steht
jetzt mittig im freien Feld über der „Summe"-Leiste.

### 13. Sidebar: einklappen unter 14 Zoll, sichtbar bleiben bis 600 px

Drei zusammenhängende Fehler, gemessen statt geraten (Zustand über acht Breiten, je einmal beim
Laden und einmal per Resize):

1. **Auto-Collapse reagierte nicht auf Resize.** Nur `buildSidebar()` wertete die Breite aus — und
   das genau einmal beim Laden. Wer sein Fenster kleiner zog, behielt die breite Sidebar bis
   hinunter zum Off-Canvas-Breakpoint; es sah aus, als klappe sie „viel zu spät" ein. Jetzt hängt
   ein `matchMedia`-`change`-Listener in `app.js` daran. `localStorage` wird dabei bewusst nicht
   beschrieben: oberhalb der Grenze gilt wieder die gespeicherte Präferenz.
2. **Unter 768 px verschwand die Navigation ganz** (`translateX(-100%)`, nur noch ein Menü-Knopf).
   Der Off-Canvas-Breakpoint steht jetzt bei **600 px**; dazwischen bleibt die 68-px-Icon-Leiste
   sichtbar. Zu ändern waren zwei CSS-Blöcke, die zusammenpassen müssen: `layout.css` (Off-Canvas,
   Menü-Knopf, `main-wrapper`-Margin) und `glass.css` (Margin der Glass-Shell).
3. **Ein weißer Kasten oben links.** Der Mobil-Menü-Knopf nutzte `background: var(--surface, #fff)`
   und `border-color: var(--outline, …)` — **beide Variablen gibt es im Projekt nicht**, es griff
   immer der weiße Fallback. Im Dark-Theme leuchtete er entsprechend. Jetzt `--pm-white` /
   `--pm-grey-200`. Zusätzlich lag er `position: fixed` über dem Seitentitel; der Kopf bekommt im
   Off-Canvas-Bereich `padding-left: 54px`, damit der Titel daneben statt darunter steht.

Die Grenzen (`mobil: 600`, `autoCollapse: 1440`) stehen ab jetzt **an einer Stelle**:
`window.PM_SIDEBAR_BP` in `theme.js` (läuft als erstes Skript im `<head>`). `sidebar.js` und
`app.js` lesen von dort. Vorher standen dieselben Zahlen in drei Dateien — genau die Drift war
Teil des Fehlers. Die CSS-Blöcke bei 1280 px in `layout.css`/`glass.css` verschmälern nur die
Sidebar (256 → 220 px) und bleiben unverändert.

1440 als Einklapp-Grenze, weil 14-Zoll-Geräte bei üblicher Skalierung auf 1440–1536 CSS-px landen,
kleinere auf ≤ 1280.

## Nicht im Umfang

- Vorschau-Modal und Aufbau der Formular-Replik (`buildSheet`) bleiben unverändert — bis auf die
  Zeilenzahl (wächst mit den Tagen) und die zentrierte Summe.
- Excel-/PDF-Erzeugung (`FahrtgeldCore`): unverändert für alle Monate mit **bis zu zehn**
  Berufsschultagen. Darüber greifen die Erweiterungen aus Punkt 9; die Bereinigung aus Punkt 10
  greift immer.
- Die Vorlagendateien selbst (`app/templates/fahrgeld-vorlage.{xlsx,pdf}`) werden nicht geändert —
  die fest einkodierte Kostenstelle wird beim Erzeugen entfernt, nicht in der Vorlage. Wird die
  Vorlage später bereinigt, läuft der Code unverändert weiter.
- Backend: keine Schema- oder Routenänderung.
- Der Einrichtungs-Screen (`buildEmptyState`) behält Aufbau und Texte; nur der Pflicht-Begriff
  dahinter ändert sich.

## Erfolgskriterien

1. Bei 1280 × 720 CSS-px (Sidebar ausgeklappt) ist die gesamte Seite inklusive
   „Formular erstellen" ohne Scrollen sichtbar — nachgemessen per Playwright:
   Inhaltsunterkante ≤ Viewport-Höhe.
2. Auf 1920 px Breite bleibt rechts keine leere Spur; die Kachelanzahl pro Zeile wächst mit.
3. Kein Text-Button mehr in der Kopfzeile — nur Icons; kein Element trägt mehr das Wort
   „optional".
4. Ein leeres Kostenstellen-Feld verhindert das Speichern der Stammdaten; eine fehlende
   Unterschrift verhindert, dass die Seite als eingerichtet gilt.
5. Nach Browserwechsel (anderes Profil, leerer `localStorage`) ist die Unterschrift weiterhin da.
6. Ein Azubi-Konto auf `berichtsheft.jumbo.net` sieht Fahrgelderstattung und
   Abteilungsdurchlauf statt „kommt bald".
7. Die Seite sieht in Standard hell/dunkel, Silk, CMD, Candy und Halloween unbeschädigt aus.
