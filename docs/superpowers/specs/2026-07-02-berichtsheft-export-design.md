# Berichtsheft-Export & Backup — Design

**Datum:** 2026-07-02
**Status:** Entwurf zur Freigabe
**Betroffener Bereich:** `app/` (Profilseite „Mein Profil"), Frontend-only bis auf eine kleine Normalisierungs-Ergänzung

## Ziel

Der Azubi kann sein Berichtsheft aus den Einstellungen (Profilseite) exportieren:

1. **PDF-Export** — professionell, im Putzmeister Corporate Design, IHK-tauglich zum Vorlegen/Drucken. Primärfunktion.
2. **JSON-Export** — vollständiges Backup zum Sichern.
3. **JSON-Import** — Backup wiederherstellen, falls die App-Sicherungsmechanismen versagen.

Zugänglich für Rolle `azubi` über zwei neue Profil-Sektionen: „Berichtsheft exportieren" und „Backup wiederherstellen".

## Design-Entscheidungen (im Brainstorming visuell freigegeben)

- **Layout-Richtung:** IHK-Formularklassiker (Variante A) — strenge Tabellen, konservativ, kein Prüfer stolpert darüber. Kein „§ 13 BBiG"-Zusatz, nur die nötigsten Angaben.
- **Logo:** Putzmeister Banner-Logo (`Corporate Design/.../Standard Logo`, graue Variante für weißen Druckgrund), **bündig an der oberen Blattkante**, linksbündig, **~45 mm breit** („Mittel"). Titel „Ausbildungsnachweis" darunter in derselben linken Spalte.
- **Keine Stundenspalte:** Exakte Arbeitsstunden sind IHK-rechtlich keine Pflicht (nur „soll"); die App erfasst nur Ganztag/Halbtag. Es werden keine Stundenzahlen erfunden. `gesamtstunden` wird nicht als Pflichtspalte geführt.
- **Elektronische Bestätigung statt Unterschriftslinien:** Da Führung und Prüfung digital erfolgen, ersetzt der Bestätigungsblock (Azubi-Freigabe + Ausbilder-Genehmigung mit Datum) die handschriftliche Unterschrift. Die IHK akzeptiert die elektronische Bestätigung.
- **Deckblatt:** ja — Titelseite mit großem Logo, „Ausbildungsnachweis", Name, Beruf, Ausbildungszeitraum, Firma.
- **Export-Umfang:** standardmäßig das komplette Heft; optional ein wählbarer Zeitraum (Ausbildungsjahr oder KW-Bereich).
- **Vielschreiber-Absicherung:** lange Einträge laufen auf Folgeseiten mit wiederholtem Kopf (Name + Zeitraum, IHK-Pflicht auf jedem Blatt); der Bestätigungsblock steht am Ende der Woche.

## Technischer Ansatz: `window.print()` + branded HTML

Statt pdf-lib (Koordinaten-Zeichnen) wird ein **eigenständiges, gebrandetes HTML-Dokument** gebaut und über den Druckdialog des Browsers als PDF gespeichert. Begründung siehe Skill `web-print-pdf-export`:

- Echter, auswählbarer/durchsuchbarer **Vektortext** (Pflicht für ein Dokument von Rang).
- Umlaute (ä/ö/ü/ß) und € **automatisch korrekt** — kein Zeichen-Mapping.
- Das Layout ist **exakt die freigegebenen HTML-Mockups**; Tabellen, Seitenumbrüche und der wiederholte Kopf entstehen per CSS statt per Hand.
- CD-Fonts (Libre Franklin / Open Sans) per `@font-face` einbettbar.

**Preis:** ein Klick „Als PDF speichern" im Druckdialog statt Direkt-Download. Für ein selten erzeugtes Abgabe-Dokument vertretbar. Späterer 1-Klick-Download serverseitig (headless Chrome) nachrüstbar, denselben HTML-Code wiederverwendend.

Die pdf-lib-Variante des bereits begonnenen `app/js/berichtsheft-export.js` wird für den PDF-Teil durch den HTML-Ansatz ersetzt; die JSON-Logik daraus bleibt erhalten.

## Die sechs Print-Gotchas (aus dem Skill, verbindlich)

1. **Absolute Asset-URLs im Opener berechnen** (`new URL(rel, document.baseURI).href`) und in den HTML-String einbacken — im `about:blank`-Popup scheitern relative Pfade zu Logo/Fonts sonst still.
2. **Popup synchron im Klick-Handler öffnen** (`window.open('', '_blank')`), Daten erst danach async laden und hineinschreiben. `null` → Hinweis „Pop-ups erlauben".
3. `print-color-adjust: exact` global — sonst verschwinden Brand-Gelb, graue Tabellenköpfe und Badges beim Druck.
4. **Seitenumbruch je „Blatt"** mit `break-before: page` (`--first` mit `auto`, keine Leerseite vorweg); `break-inside: avoid` auf Zeilen/Tabellen.
5. **Auto-Print nur im echten Top-Fenster** (`window.self === window.top`) und erst nach `document.fonts.ready` (+ kurzer Timeout).
6. **`@font-face` mit passendem `format()`** (variable `.ttf` → `truetype-variations` mit Weight-Range) und echtem Fallback-Stack.

## Dokumentstruktur

### Deckblatt (1 Seite)
Großes Logo (bündig oben links), Titel „Ausbildungsnachweis", darunter Stammdaten: Name, Ausbildungsberuf, Ausbildungszeitraum (`ausbildungsBeginn`–`ausbildungsEnde`), Firma („Putzmeister"), sowie exportierter Berichtszeitraum und Anzahl Wochen. `break-after: page`.

### Wochenblatt — Berichtsform `wöchentlich`
- **Kopf (auf jedem Blatt der Woche):** Logo oben links + „Ausbildungsnachweis"; darunter 3-Spalten-Tabelle: Name der/des Auszubildenden · Ausbildungsjahr · Berichtszeitraum „KW n/Jahr".
- **Inhalt:** Tabelle „Ausgeführte Arbeiten, Unterricht, Unterweisungen" mit den drei Blöcken **Betriebliche Tätigkeiten** (`betriebEintrag`), **Berufsschule (Unterrichtsthemen)** (`schuleEintrag`), **Unterweisungen** (`unterweisungEintrag`). Leere Blöcke werden weggelassen.
- **Bestätigungsblock** am Ende der Woche (siehe unten).

### Wochenblatt — Berichtsform `täglich`
- Gleicher Kopf und Bestätigungsblock.
- **Inhalt:** Tabelle mit **einer Zeile je Wochentag** — Spalte „Tag" (Wochentag, Datum, Ort, Ganztag/Halbtag), Spalte „Ausgeführte Arbeiten / Unterweisung" (`eintrag`, ggf. betrieb/schule/unterweisung).
- **Abwesende Tage** (Berufsschule-Block, Urlaub, krank, kein Eintrag): grau hinterlegte Zeile mit kursivem Vermerk aus `anwesenheit`, keine erfundene Tätigkeit. Reine Wochenend-Zeilen ohne Inhalt werden weggelassen.

Die Berichtsform wird pro Azubi aus `user.berichtTyp` (`wöchentlich`/`täglich`) bestimmt. Fallback: hat eine Woche Tages-Einträge aber keine Wochen-Einträge → Tagesdarstellung, sonst Wochendarstellung. So bleiben gemischte Alt-Daten robust.

### Bestätigungsblock (elektronisch), je Woche
Zwei Spalten:
- **Auszubildende/r:** Name; Text „Berichtsheft geführt und zur Prüfung freigegeben" — nur wenn Status `freigegeben` oder `genehmigt` (es gibt keinen Azubi-Freigabe-Zeitstempel in der DB).
- **Ausbilder/in:** Name (aufgelöst über `korrigiertVon`); „Geprüft und genehmigt am {KorrigiertAm}" bei Status `genehmigt`; bei `abgelehnt` „Zur Überarbeitung zurückgegeben am …"; bei `offen`/`freigegeben` „Prüfung ausstehend".
- Statusabhängiger Hinweis, damit nicht-genehmigte Wochen im Export ehrlich als solche erkennbar sind.
- Fußzeile: „Digital geführt und elektronisch bestätigt (Berichtsheft-System Putzmeister)" + Seitenzahl.

## Datenmodell / benötigte Felder

Frontend-Wochenobjekt (`normalizeWoche` in `app/js/api.js`):

- Vorhanden: `kw`, `year`, `startDate`, `endDate`, `status`, `betriebEintrag`, `schuleEintrag`, `unterweisungEintrag`, `tage[]` (mit `datum`, `anwesenheit`, `ort`, `eintrag`, `tagdauer`, `betriebEintrag`, `schuleEintrag`, `unterweisungEintrag`), `kommentare[]`.
- **Ergänzen:** `korrigiertVon: w.KorrigiertVon` und `korrigiertAm: toDateStr(w.KorrigiertAm)`. Die Spalten kommen über `SELECT w.*` bereits aus dem Backend, werden aber noch nicht ins Frontend-Objekt gemappt. **Einzige Nicht-Frontend-only-Änderung** (rein additive Normalisierung, bricht nichts).

Ausbildername für den Bestätigungsblock: `DB.getUser(korrigiertVon)` (einmal je eindeutige Korrektor-OID vorladen, dann Map). Azubi-Stammdaten aus `DB.getCurrentUser()`.

Ausbildungsjahr je Woche: aus `user.ausbildungsBeginn` und `woche.startDate` berechnet (1-basiert).

## JSON-Backup / Restore

- **Export:** vollständiges Objekt `{ format:'berichtsheft-backup', version:1, exportiertAm, azubi:{…}, wochen:[…] }` als Download `Berichtsheft-Backup_{Name}_{Datum}.json`. Wochen inkl. Tage & Kommentare (Kommentare nur informativ).
- **Import:** Datei einlesen → validieren (`format`, `version`, `wochen` Array). Vorschau zeigt: neu anzulegende vs. zu überschreibende vs. geschützte Wochen. **Freigegebene/genehmigte** Wochen in der DB werden nie überschrieben (abgezeichnet = unveränderlich). `azubiId` wird beim Restore immer auf das eigene Konto gezwungen — ein Backup schreibt nie in ein fremdes Heft. Kommentare werden nicht wiederhergestellt. Speichern über bestehendes `DB.saveWoche`.

## Modulform

Ein Modul `app/js/berichtsheft-export.js`, IIFE, exportiert `global.BerichtsheftExport = { renderSection, bind }` — analog zu `IhkImport`/`ZeitnachweisUpload`. Eingebunden in `app/profil.html`; in `app/js/profil.js` in `render()` per `renderSection(user)` (nur Azubi) und `bind(user)` verdrahtet, sichtbar im Profil-Panel (nicht im Import-Tab).

Der PDF-HTML-Builder als testbare reine Funktion `_buildHtml(ctx)` (Daten rein → HTML-String raus, kein DOM/Netz), damit das Layout mit Mock-Daten ohne Backend visuell verifizierbar ist (Gotcha #5 verhindert Auto-Print in der Preview). `open(win, ctx)` schreibt in das Popup.

PDF-Logo-Button im Stil der Fahrgelderstattung (`img/pdf-logo.png`), JSON-Button daneben.

## Testplan (nach Implementierung, end-to-end)

Mit mehreren Azubis verschiedener Ausbildungsberufe und Führungsarten, jeweils PDF + JSON prüfen:

1. **Wöchentlich, normal** (z. B. Mechatroniker): alle drei Blöcke gefüllt, Umlaute/Sonderzeichen korrekt, Kopf/Zeitraum/Ausbildungsjahr stimmen.
2. **Täglich, normal** (z. B. Zerspaner): eine Zeile je Tag, Ganztag/Halbtag, Ort korrekt.
3. **Täglich mit Abwesenheiten:** Berufsschul-Block, Urlaub, krank korrekt als Vermerk, keine erfundenen Tätigkeiten.
4. **Vielschreiber:** sehr langer Eintrag läuft sauber auf Folgeseite mit wiederholtem Kopf, nichts abgeschnitten.
5. **Gemischte Status:** offen / freigegeben / genehmigt / abgelehnt → Bestätigungsblock zeigt je Woche den korrekten Zustand samt Ausbildername und Genehmigungsdatum.
6. **Zeitraum-Auswahl:** Teilexport (ein Ausbildungsjahr) enthält genau die erwarteten Wochen.
7. **JSON round-trip:** Export → Import in leeres/teilweise gefülltes Heft; geschützte Wochen bleiben unangetastet, Werte identisch.
8. **Leeres Heft:** klare Meldung statt kaputtem PDF.

Verifikation über die vorhandenen Dev-Azubis (`/api/dev/users`) bzw. angelegte Testwochen; visuelle Kontrolle des gerenderten HTML + Feld-für-Feld-Abgleich gegen die DB-Werte.

## Bewusst nicht enthalten (YAGNI)

- Serverseitiger 1-Klick-PDF-Download (späterer Upgrade-Pfad, nur bei Bedarf).
- Wiederherstellung von Kommentaren aus dem Backup (nur informativ gesichert).
- Qualifikations-Zuordnung nach Ausbildungsrahmenplan (IHK-rechtlich „kann", nicht nachgebaut).
