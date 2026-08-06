# Abteilungsdurchlauf drucken — Auswahl-Dialog + isoliertes Druckdokument

**Datum:** 2026-08-06
**Status:** Entwurf freigegeben, Implementierung offen
**Betrifft:** `app/js/abteilungs-planer.js`, `app/abteilungs-planer.html`,
`app/css/planer-board.css`, neu: `app/js/planer-print.js`

## Problem

Der Abteilungs-Planer hat drei Druckwege, von denen der wichtigste kaputt ist:

1. **Panel-Druck** (`printPerson`) — eigenes Fenster, funktioniert.
2. **Abteilungs-Druck** (`printAbteilung`) — eigenes Fenster, greift nur bei
   gesetztem Abteilungsfilter, funktioniert.
3. **Tafel-Druck** — `window.print()` auf der Live-Seite. Defekt: ein großer
   weißer Kasten verdeckt die Tafel, und die Tafel wird seitlich abgeschnitten.

Außerdem fehlt jede Vorauswahl: gedruckt wird entweder eine Person, eine
Abteilung oder die komplette Tafel. Es gibt keinen Weg, „diese drei Azubis für
diesen Zeitraum" zu drucken.

### Ursache des weißen Kastens (reproduziert)

Beim Druck ist der Inhaltsbereich von A4-Landscape mit 12 mm Rand nur
~1032 CSS-px breit. Damit greift `@media (max-width:1100px)` aus
`planer-board.css:146-149`:

```css
.pt-panel { position:fixed; top:0; right:0; bottom:0; width:min(384px,92vw); z-index:60; }
```

Der `@media print`-Block darunter setzt das nie zurück. Das Detail-Panel wird
so zu einem 384 px breiten, dokumenthohen weißen Block über der Tafel.

Verschärfend: Das `hidden`-Attribut wirkt am Panel **überhaupt nicht**, weil
`.pt-panel { display:flex }` als Klassen-Regel `[hidden] { display:none }` in
der Spezifität schlägt. Am Bildschirm bleibt das unauffällig (das Panel ist im
Flow nur ein 2 px hoher Splitter); im Druck-Layout wird daraus der volle Block.

Dritter, separater Defekt: Im Druck bleiben 252 px linker Rand stehen, obwohl
`planer-board.css` im `@media print`-Block `.main-wrapper { margin-left:0 !important }`
setzt — dadurch wird die Tafel rechts abgeschnitten. Ursache ist die
Cascade-Reihenfolge: `glass.css:1339` setzt

```css
.main-wrapper { margin-left: calc(var(--lg-sidebar-w) + var(--lg-gap) * 2) !important; }
```

und `glass.css` wird in `abteilungs-planer.html` **nach** `planer-board.css`
eingebunden (Zeile 20 vs. 19). Gleiche Spezifität (0,1,0), beide `!important`
→ das später geladene Stylesheet gewinnt, die Druck-Regel verliert.

Dazu malt `body` im Druck einen `linear-gradient`-Hintergrund (Theme).

Nicht die Ursache (geprüft und verworfen): die beiden `.modal-overlay`-Elemente
sind im Druck zwar nicht `display:none`, aber `opacity:0` und malen daher nicht.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Druckbild | **Beides**, im Dialog umschaltbar: Gantt-Tafel oder Tabelle je Azubi |
| Zeitraum | Presets (AJ / ganze Ausbildung / ab heute) **plus** freie Von/Bis-Felder, die die Presets nur vorbelegen |
| Azubi-Vorauswahl | Vorbelegt aus der **aktuellen Toolbar-Filterung**, alle angehakt, einzeln ab-/zuwählbar |
| Randstationen | Station wird **ganz gezeigt, Datum ungekürzt**; Balken am Blattrand abgeschnitten mit `‹`/`›`-Andeutung |
| Druckmechanik | **Eigenes Druckfenster** mit eigenem minimalem CSS (Ansatz A) |

### Warum eigenes Druckfenster und nicht `@media print` auf der Live-Seite

Der gefundene Bug ist genau die Fehlerklasse, die `@media print` auf einer
gethemten SPA-Seite dauerhaft produziert: Theme-Hintergründe, `position:fixed`,
Sidebar-Gutter, Responsive-Breakpoints und horizontaler Overflow müssen alle
einzeln neutralisiert werden, und jede neue Theme- oder Layout-Änderung kann es
erneut brechen. Ein eigenes Dokument ist strukturell immun. Der Planer nutzt
dieses Muster in `printPerson` und `printAbteilung` bereits, inklusive
Popup-Blocker-Behandlung per Toast.

Ein versteckter Druck-Container in der Seite (Muster aus `wochenansicht.js`)
vermeidet den Popup-Blocker, bleibt aber im gethemten Dokument und erbt damit
einen Teil des Problems.

## Architektur

### Neues Modul `app/js/planer-print.js`

Klassisches Script (kein ESM, wie der Rest von `app/js/`), eingebunden in
`abteilungs-planer.html` **vor** `abteilungs-planer.js`. Exponiert ein globales
`PlanerPrint`.

Begründung für die eigene Datei: `abteilungs-planer.js` hat 1595 Zeilen und
trägt bereits Planer-Sicht, Azubi-Eigensicht und Ausbilder-Sicht. Der Druck ist
sauber abgrenzbar und hat keine Abhängigkeit auf Planer-Interna.

Schnittstelle bewusst datengetrieben:

```js
PlanerPrint.open({
  azubis,          // [{ id, name, beruf, gruppe }] — bereits gefiltert + sortiert
  zuweisungenFor,  // (azubiId) => [{ abteilung, von, bis, verantwName, verantwEmail }]
  preselectedIds,  // string[] — Vorauswahl (= azubis, alle angehakt)
  von, bis,        // ISO-Strings — Vorbelegung Zeitraum (sichtbares AJ)
  colorFor,        // (abteilungName) => CSS-Farbe (zentrale GANTT_PALETTE)
  verantwNameFor,  // (email) => Anzeigename
})
```

Alle IDs sind GUID-Strings — nie `parseInt`.

### Units

1. **`buildDialog(ctx)` → `Promise<auswahl|null>`**
   Modal, State (Auswahl-Set, Zeitraum, Darstellung), Validierung.
   `null` bei Abbruch.
   Liefert `{ mode:'tafel'|'tabelle', azubiIds:[], von, bis }`.

2. **`renderTafelHtml(sel)` / `renderTabelleHtml(sel)` → `string`**
   **Reine Funktionen** — Auswahl + Daten rein, vollständiges HTML-Dokument
   raus. Kein DOM-Zugriff, keine Browser-API. Damit in Node testbar.

3. **`openPrintWindow(html)`**
   `window.open` → `document.write` → `close` → `focus` → `print()`, mit dem
   bestehenden Popup-Blocker-Toast.

`printPerson` und `printAbteilung` werden auf `openPrintWindow` und das
gemeinsame Stylesheet umgestellt. Damit entfällt der dreifach kopierte
`<style>`-Block (aktuell in `abteilungs-planer.js:1512-1515` und `1544-1547`).

### Einstieg im Planer

`abteilungs-planer.js`, Toolbar-Binding aktuell:

```js
on('ptPrint', 'click', () => filterAbteilung ? printAbteilung(filterAbteilung) : window.print());
```

wird zu einem Aufruf von `PlanerPrint.open(...)` mit dem aktuell gefilterten
Personen-Set. Der Abteilungsfilter-Sonderweg bleibt erhalten: ist ein
Abteilungsfilter gesetzt, ist die Vorauswahl entsprechend eingeschränkt — der
Dialog ist dann die Feinjustierung, nicht ein zweiter Filterweg.

`window.print()` als Tafel-Druck verschwindet damit aus der Toolbar. Direktes
Strg+P bleibt trotzdem möglich und wird durch den Bugfix unten brauchbar.

## Druckdokument

### Tafel (Querformat)

Echte `<table>` mit `<thead>` — Browser wiederholen den Tabellenkopf auf jeder
Folgeseite von selbst; ein nachgebauter Grid-Kopf täte das nicht.

- Eine `<tr>` je Azubi. Namensspalte + eine Timeline-Zelle über `colspan`.
- Timeline-Zelle `position:relative`; Balken als absolut positionierte `<div>`
  mit `left`/`width` in **Prozent** des Zeitraums. Prozent funktioniert, weil
  die Zellbreite vom Tabellenlayout festgelegt wird — keine Pixelrechnung, die
  von der Papiergröße abhängt.
- Spaltenraster automatisch aus der Zeitraumlänge:
  ≤ 3 Monate → Kalenderwochen · ≤ 18 Monate → Monate · darüber → Quartale.
  Bewusst **kein** Zoom-Regler im Dialog (YAGNI).
- `@page { size:A4 landscape; margin:12mm }`
- `print-color-adjust:exact` an den Balken, sonst schlucken Browser die
  Abteilungsfarben im Sparmodus.
- Legende nur mit den Abteilungen, die tatsächlich gedruckt werden.

### Randstationen

Eine Station, die den Zeitraum nur berührt, wird gezeigt:

- beginnt vor dem Zeitraum → Balken bei `left:0`, Marker `‹`
- endet nach dem Zeitraum → Balken bis zum rechten Rand, Marker `›`
- Datumsangabe im Balken und in der Tabelle bleibt das **echte, ungekürzte**
  Von–Bis. Das Papier soll über Zeiträume nicht lügen.

Filter dafür ist der bestehende `zeitraeumeUeberschneiden(von, bis, vonISO, bisISO)`
aus `abteilungs-planer.js` — leeres `Bis` gilt dort als offen (`9999-12-31`).

### Tabelle (Hochformat)

Je Azubi ein Abschnitt: Kopf mit Name, Beruf, Gruppe; darunter Tabelle mit
Abteilung / Zeitraum / Verantwortlich. `break-inside:avoid` pro Abschnitt,
damit kein Azubi mitten im Namen umbricht. `@page { size:A4 portrait; margin:16mm }`.

### Azubis ohne Station im Zeitraum

Erscheinen mit dem Hinweis „keine Zuweisung im Zeitraum" statt zu verschwinden
— konsistent zum CSV-Export, der Vollständigkeit bewusst sichtbar macht
(`exportCsv`, Leerzeile für ungeplante Personen).

### Kopf beider Varianten

Titel „Abteilungsdurchlauf", gewählter Zeitraum, Anzahl Personen, Stand-Datum.
Personennamen überall als „Vorname Nachname" über `displayName()` — das Backend
liefert „Nachname, Vorname" roh.

## Dialog

`#ptPrintModal` statisch in `abteilungs-planer.html`, neben `#zuweisungModal`
und `#zuweisungDeleteModal`. Gesteuert über `Modal` aus `app.js` — das ist eine
`const`, wird also **bare** verwendet, nicht als `window.Modal`.

Aufbau:

```
┌─ Abteilungsdurchlauf drucken ────────────────────────┐
│ Darstellung:   [ Tafel ][ Tabelle ]                  │
│                                                      │
│ Zeitraum:  [AJ 2025/26] [Ganze Ausbildung] [Ab heute]│
│            Von [01.09.2025]   Bis [31.08.2026]       │
│                                                      │
│ Azubis (3 von 45)            [Alle] [Keine]          │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [Suchen …]                                       │ │
│ │ [x] Lena Müller       Industriekauffrau          │ │
│ │ [x] Jana Hofer        DH Maschinenbau            │ │
│ │ [ ] Kevin Albaque     Mechatroniker              │ │
│ └──────────────────────────────────────────────────┘ │
│                          [Abbrechen]  [Drucken]      │
└──────────────────────────────────────────────────────┘
```

- Vorbelegung: aktuell gefilterte Personen, alle angehakt; Zeitraum =
  sichtbares Ausbildungsjahr (`ajWindow()`).
- Preset „Ganze Ausbildung" = Min/Max über `AusbildungBeginn`/`-Ende` der
  gewählten Personen; fehlen die Daten, bleibt das aktuelle AJ stehen.
- „Drucken" ist deaktiviert bei 0 gewählten Azubis oder `von > bis`, mit
  Inline-Hinweis am Feld.

### Darstellung und Presets als Segmente, nicht als `<select>`

In diesem Projekt wrappt PmSelect **jedes** `.form-control`-`<select>` zu einem
full-width `.pm-select--block`-Container; Breitenangaben am Select selbst sind
wirkungslos und müssten am Wrapper mit ≥ (0,3,0) überstimmt werden. Bei einem
Zwei-Werte-Umschalter ist ein Segment (`.pt-seg`, im Planer bereits für den
Zoom vorhanden) ohnehin die passendere Form und umgeht die Falle.

Beim Neu-Rendern des Dialogs muss `cleanupPMSelect` beachtet werden, falls
später doch ein Select hinzukommt.

## Bugfix weißer Kasten (unabhängig vom Feature)

Auch mit eigenem Druckfenster bleibt Strg+P direkt auf der Seite erreichbar und
soll nicht kaputt sein. Zwei Ebenen:

1. **Ursache am Bildschirm** — `.pt-panel[hidden] { display:none }` in
   `planer-board.css`. Behebt, dass `hidden` am Panel von `.pt-panel{display:flex}`
   überstimmt wird. Das ist der eigentliche Defekt; der Druck macht ihn nur sichtbar.
2. **`@media print`-Block** in `planer-board.css` ergänzen:
   - `.pt-panel { display:none !important; position:static !important; }`
     — das Panel gehört nie aufs Papier
   - `body`-Hintergrund neutralisieren (`background:none !important`), sonst
     druckt der Theme-Gradient mit
   - linken Gutter auf 0. Die vorhandene Regel `.main-wrapper { margin-left:0 !important }`
     verliert gegen `glass.css:1339` (gleiche Spezifität, später geladen).
     Fix daher über **höhere Spezifität statt `!important`-Duell**:
     `.app-shell .main-wrapper { margin-left:0 !important; margin-right:0 !important }`
     (0,2,0 schlägt 0,1,0 unabhängig von der Ladereihenfolge). Das ist
     robuster, als `planer-board.css` in der HTML-Reihenfolge nach hinten zu
     schieben — diese Reihenfolge trägt anderes Verhalten mit.

Zu prüfen, ob eine Theme-Datei den Offset ebenfalls setzt: mehrere haben eigene
`@media print`-Blöcke (`theme-silk.css:575`, `theme-halloween.css:542`,
`theme-hyperspace.css:262`, `theme-candy.css:1388`, `theme-christmas.css:1405`,
`themes.css:140`, `glass.css:645`) und alle laden nach `planer-board.css`. Die
Spezifitäts-Lösung deckt den Regelfall ab; verifiziert wird per Gegenprobe
unten. `hyperspace` und `cmd` erben `[data-theme="dark"]`-Regeln generell nicht
und sind separat zu sichten.

## Tests

**Node, ohne Browser** (die Builder sind reine Funktionen):
- Randstation links / rechts / beidseitig überhängend → Marker und ungekürztes Datum
- Station komplett außerhalb → nicht enthalten
- Azubi ohne Station → Hinweiszeile vorhanden
- Rasterstufen: 2 Monate → Wochen, 12 Monate → Monate, 36 Monate → Quartale
- leere Auswahl → Builder wird nie aufgerufen (Dialog blockt)
- offenes `Bis` (`null`) → Balken bis Zeitraumende + `›`

**Playwright/Edge headless** (`chromium.launch({channel:'msedge'})`,
`node_modules/playwright`, Login passwortlos über `*.demo@putzmeister.com`,
App unter `/app/abteilungs-planer.html`, Static-Root ist das Repo-Root):
- Dialog öffnen, Vorauswahl entspricht der Toolbar-Filterung
- Auswahl reduzieren + Zeitraum setzen, `window.print` stubben, erzeugtes
  Dokument auf Personenzahl und Zeitraum prüfen
- Bugfix-Gegenprobe: `emulateMedia({media:'print'})` bei Viewport-Breite 1032
  (echte A4-Landscape-Inhaltsbreite) →
  `.pt-panel` ist `display:none`, kein Element mit `position:fixed` überdeckt
  die Tafel, `.main-wrapper` hat `margin-left: 0px`, und die Prüfung läuft
  über **alle** Themes (Theme per `data-theme` durchschalten), weil jedes
  Theme-Stylesheet nach `planer-board.css` lädt

Die 1032-px-Gegenprobe ist der Regressionstest für genau diesen Bug — bei
1600 px Viewport ist er unsichtbar.

## Nicht Teil dieses Entwurfs

- Zoomstufe im Druckdialog frei wählen (Raster wird automatisch bestimmt)
- Serienbrief/Sammel-PDF über mehrere Ausbildungsjahre
- Beurteilungs-Noten im Druck (steckt in `printPerson` heute auch nicht drin)
- Server-seitige PDF-Erzeugung

---

## Nachtrag nach der Umsetzung (2026-08-06)

Umgesetzt in den Commits `94271ec`..`fab8b7c` (16 Commits). `app/js/planer-print.js`
ist neu, `app/js/planer-print.test.js` deckt es mit 107 Tests ab. Vier Punkte
korrigieren oder ergänzen den Entwurf oben — sie sind hier festgehalten, damit
niemand einen offenen Defekt für erledigt hält.

### 1. Strg+P schneidet die Tafel weiterhin seitlich ab — NICHT behoben

Die Problembeschreibung oben (Zeile 16) nennt zwei Symptome: den weißen Kasten
und die seitlich abgeschnittene Tafel. **Nur das erste ist behoben.**

Der weiße Kasten ist weg, verifiziert in allen 16 Kombinationen (8 Themes ×
Sidebar aus-/eingeklappt) bei echter A4-Landscape-Inhaltsbreite. Der 252-px-Gutter
ist ebenfalls weg. Aber `.pt-wrap` (`planer-board.css:37`) behält
`overflow-x: hidden`, und der `@media print`-Block öffnet nur `.pt-scroll`.
Gemessen: `.pt-wrap` 984 px breit, Tafelinhalt 1481 px → **497 px werden
abgeschnitten**.

Das ist nicht merge-blockierend, weil das Feature bewusst über ein eigenes
Druckfenster geht und der Dialog der vorgesehene Weg ist. Aber wer Strg+P direkt
auf der Seite drückt, bekommt weiterhin eine beschnittene Tafel.

### 2. `printAbteilung` wurde gelöscht, nicht umgestellt

Zeile 124 kündigt an, `printPerson` **und** `printAbteilung` auf `openPrintWindow`
umzustellen. Tatsächlich wurde `printAbteilung` entfernt: nach der Umstellung des
Toolbar-Handlers hatte sie keinen Aufrufer mehr.

Das ist eine **fachliche Funktionsrücknahme**, nicht nur eine technische
Aufräumarbeit: Der abteilungszentrierte Bericht („eine Abteilung, alle Personen,
chronologisch nach `von`") ist in keiner Form mehr erreichbar. Der Dialog druckt
bei gesetztem Abteilungsfilter die betroffenen Personen mit *allen* ihren
Stationen — dieselben Daten, aber nach Person gruppiert statt nach Abteilung.
Wer die Gruppierung nach Abteilung braucht, bekommt sie als dritte
Darstellungsvariante im Dialog.

### 3. Ergänzungen gegenüber dem Entwurf

Aus den Reviews kamen vier Entscheidungen, die der Entwurf nicht vorsah:

- **Datum hat im Balken Vorrang vor dem Abteilungsnamen.** Der Entwurf verlangte
  das echte Datum im Balken (Zeile 170), das Label war aber nur der
  Abteilungsname — auf Papier stand damit kein einziges Datum. Der Balkeninhalt
  ist jetzt nach Breite gestaffelt; reicht der Platz nicht für beides, gewinnt
  das Datum (die Abteilung ist über Farbe und Legende bestimmbar, das Datum
  nirgends sonst). Unterhalb einer Schwelle bleibt der Balken leer — ein
  Wortfragment wie „Ei" für „Einkauf PMM" liest sich auf Papier wie ein Name.
- **Gruppen-Trennzeilen in der Tafel** („Ohne Zuordnung / Zugewiesen /
  DH-Studenten", mit Anzahl), damit Papier und Bildschirm dieselbe Struktur
  zeigen. Ohne sie startete das Alphabet dreimal neu und die Sortierung sah
  falsch aus.
- **Fallback-Farbe für Balken und Legendenkästchen.** Ein fehlender Farbwert
  ergab einen transparenten und damit auf Papier unsichtbaren Balken — stiller
  Datenverlust.
- **Der Panel-Druck zeigt den ganzen Durchlauf**, nicht nur das aktuelle
  Ausbildungsjahr. Die Zeitraumbildung liegt als `PlanerPrint.druckZeitraum`
  neben der Filterbedingung `barGeom`, aus der sie sich ableitet — beides in
  getrennten Dateien war die Konstellation, die den Fehler ermöglichte.

### 4. Bekannte, bewusst offene Punkte

Keiner davon verliert Daten; alle sind als Nachlauf geeignet:

| Punkt | Wirkung |
|---|---|
| Kein Seitenfuß, keine Seitenzahl | Ein herausgefallenes Blatt ist nicht zuzuordnen (Tafel ≈ 3 Seiten, Tabelle ≈ 5 bei 45 Personen) |
| Legende nur auf der letzten Seite | Auf Seite 1–2 fehlt der Farbschlüssel |
| Legende ohne `break-inside`-Schutz | Bricht bei sehr vielen Abteilungen über die Seite |
| Kopftext-Überlauf in schmaler Randspalte | Bei mitten in einer Einheit beginnendem Zeitraum überlappen die ersten zwei Spaltenköpfe (gemessen 5,9 px) |
| Kein Schalter „nur Personen mit Zuweisung" | Standarddruck zeigt alle gefilterten Personen; bei 45 sind 40 Zeilen „keine Zuweisung im Zeitraum" — bewusst vollständig, aber papierintensiv |
| Fast leere erste Seite bei überlangem Abschnitt | `break-inside:avoid` hat Vorrang; kein Datenverlust |
| `planer-print.js` trägt zwei Aufgaben | Zeilen 17–327 reine Dokumentbauer, danach ein Dialog-Controller mit harten DOM-IDs. Ein Schnitt in eine zweite Datei würde die Zusicherung „reine Funktionen" wieder für die ganze Datei wahr machen |
| Label-Staffelung auf Papierbreite kalibriert | `TRACK_PX = 800` gilt für A4 quer mit 12 mm Rand; in der Bildschirmansicht des Druckfensters greift bei schmalem Fenster weiter `overflow:hidden` |
