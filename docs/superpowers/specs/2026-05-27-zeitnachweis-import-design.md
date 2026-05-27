# Zeitnachweis-Import (SAP ESS → Berichtsheft)

**Datum:** 2026-05-27
**Status:** Design freigegeben, bereit für Implementierungsplan
**Betroffener Bereich:** Frontend (`app/`)

---

## 1. Ziel & Kontext

Auszubildende laden im Profil ihren **Zeitnachweis** (PDF aus SAP ESS) hoch. Die App
liest die im PDF enthaltenen Tageszeiten aus und füllt das Berichtsheft (Wochenansicht)
automatisch vor: **ob** und **wie lange** an welchem Tag gearbeitet wurde, sowie der
grobe Kontext (Betrieb / Schule / Feiertag / Abwesenheit).

Vorbild ist die interne App **better-ess** (`daito001.github.io/better-ess`), die denselben
PDF-Typ liest und als Dashboard darstellt. better-ess ist ein gebautes Vite-Bundle ohne
lesbaren Quellcode, nutzt aber erkennbar **pdf.js**. Den Parser bauen wir anhand des
bekannten PDF-Formats selbst nach. Das Download-Tutorial (3 Screenshots) wird aus
better-ess übernommen.

**Tätigkeitsbeschreibungen** (was inhaltlich gemacht wurde) stehen **nicht** im PDF und
werden daher **nicht** befüllt — diese füllt der Azubi weiterhin selbst aus.

---

## 2. PDF-Format (Referenz: `Zeitnachweis_20260501_20260531.pdf`)

Relevant ist Seite 1, Abschnitt **„Einzelergebnisse pro Tag"**. Tabellen-Spalten:
`Tag | von | bis | Ist | Sollz | +/- | Pause | TAZP`.

- Jeder Tag beginnt mit zweistelliger Tagesnummer + Wochentagskürzel (`MO DI MI DO FR SA SO`).
- Ein Tag kann mehrere Folgezeilen haben (z. B. mehrere `Stempelzeit`-Intervalle); diese
  Folgezeilen haben **keine** Tagesnummer.
- **`Ist`** = netto gearbeitete Zeit in **Dezimalstunden** mit deutschem Komma
  (z. B. `6,27` = 6,27 h = 6 h 16 min). Pausen/Lücken sind bereits abgezogen; ein
  ggf. vorhandener Dienstreise-Anteil ist in `Ist` enthalten.
- Der Header enthält einen **Stichtag**: „Ihre Zeitdaten konnten nur bis einschließlich
  dem `TT.MM.JJJJ` fehlerfrei ausgewertet werden." Tage nach dem Stichtag stehen nicht in
  der Tabelle.

Beispielzeilen:

```
01 FR Maifeiertg                 7,00 7,00
04 MO Stempelzeit  07:15 08:01   6,27 7,00 0,73-  V70C
      Stempelzeit  08:11 11:56
      Stempelzeit  12:44 14:29
05 DI Berufsschule               7,00 7,00 0,00   V70C
06 MI Stempelzeit  07:14 08:00   7,72 7,00 0,12-  V70C
      ...
      Dienstreise Arbeitszeit 18:45 19:50
14 DO Himmelfhrt                 7,00 7,00
```

---

## 3. Datenmodell (bestehend, unverändert)

Wochen liegen in `DB.data.wochen` (siehe `app/js/data.js`). Jede Woche hat ein
`tage[]`-Array mit Tagesobjekten:

```js
{ datum: 'YYYY-MM-DD', anwesenheit, ort, stunden, betriebEintrag/schuleEintrag/..., abwesenheitsnotiz }
```

- `anwesenheit` (aus `ANWESENHEIT_OPTS`, `app/js/app.js`):
  `'anwesend' | 'Urlaub' | 'krank' | 'Feiertag' | 'sonstige Abwesenheit'`
  (zusätzlich intern `'Wochenende'` für SA/SO).
- `ort` (aus `ORT_OPTS`): `'' | 'Betrieb' | 'Schule' | 'Betrieb/Schule' | 'Zuhause' | 'Dienstreise'`.
- `stunden`: Dezimalzahl. Der Time-Spinner zeigt sie als `H:MM` (`Math.round(stunden*60)`).

Wochen werden über `azubiId + kw + year` adressiert. Hilfsfunktionen:
`DateUtil.getKW`, `getKWYear`, `getMondayOfKW`, `toISODate`. Upsert über `DB.saveWoche`.

Eine Woche gilt als **schreibgeschützt**, wenn `status ∈ {'freigegeben', 'genehmigt'}`.

---

## 4. Architektur & Module

Client-seitig, kein Backend. Vier Bausteine, jeweils klar abgegrenzt:

### 4.1 `app/js/vendor/pdf.min.js` + `pdf.worker.min.js`
pdf.js als **vendored Legacy-Build** (kein CDN — internes IIS-/Intranet-Setup blockt
CDNs, offline-Tauglichkeit). Wird per `<script>` in `profil.html` geladen.
Worker-Pfad wird auf den vendored Worker gesetzt.

### 4.2 `app/js/zeitnachweis-parser.js` — reine Logik
Keine DOM-, keine pdf.js-Abhängigkeit. Damit isoliert testbar.

```js
ZeitnachweisParser.parse(text) → {
  zeitraum: { von: 'YYYY-MM-DD', bis: 'YYYY-MM-DD' } | null,
  stichtag: 'YYYY-MM-DD' | null,
  monat:    { jahr, monat },        // aus "Monat: Mai - 2026"
  tage: [ { datum, wochentag, anwesenheit, ort, stunden, quelle, eindeutig } ],
  warnungen: [ string ]
}
```

- `text` = der aus dem PDF extrahierte, zeilenweise zusammengesetzte Text.
- `quelle` = Roh-Label zur Anzeige in der Vorschau (z. B. „Stempelzeit", „Berufsschule",
  „Maifeiertg").
- `eindeutig` = `false`, wenn der Tag nicht sicher zugeordnet werden konnte
  (Werktag mit Inhalt, aber kein bekanntes Muster) → Vorschau-Checkbox standardmäßig aus.

### 4.3 `app/js/zeitnachweis-upload.js` — UI-Glue
Hält `profil.js` schlank. Exporte:
- `ZeitnachweisUpload.renderSection(user) → htmlString` (die Profil-Sektion inkl. Tutorial).
- `ZeitnachweisUpload.bind(user)` (Datei-Input + Drag-&-Drop, pdf.js-Textextraktion,
  Parser-Aufruf, Vorschau-Dialog, Übernahme).

### 4.4 `data.js` — Übernahme in die DB
Neue Methode:

```js
DB.applyZeitnachweis(azubiId, tage, { overwrite }) → {
  uebernommen, uebersprungenReadonly, uebersprungenBelegt, betroffeneWochen
}
```

Gruppiert `tage` nach KW/Jahr, legt fehlende Wochen vollständig an (alle 7 Tage,
SA/SO als `'Wochenende'`), merged die erkannten Tage und überspringt schreibgeschützte
Wochen. Bei `overwrite=false` werden nur Tage gefüllt, die noch leer sind
(weder `stunden>0` noch gesetzte `anwesenheit` außer Default/`'Wochenende'`).
Texteinträge (`betriebEintrag` etc.) werden **nie** angefasst.

---

## 5. Parser-Mapping (Kern)

Je Tagesblock werden gesammelt: alle `HH:MM`-Tokens (von/bis), der `Ist`-Dezimalwert
(erster `x,xx`-Wert nach dem von/bis-Bereich) und der Label-Text.

| Erkannt im Tagesblock | `anwesenheit` | `ort` | `stunden` |
|---|---|---|---|
| `Stempelzeit` vorhanden | `anwesend` | `Betrieb` | `Ist` |
| `Berufsschule` (ohne Stempelzeit) | `anwesend` | `Schule` | `Ist` |
| `Stempelzeit` **und** `Berufsschule` | `anwesend` | `Betrieb/Schule` | `Ist` |
| nur `Dienstreise` (keine Stempelzeit) | `anwesend` | `Dienstreise` | `Ist` |
| `Urlaub` | `Urlaub` | `''` | `0` |
| `Krank` / `AU` / `Krankheit` | `krank` | `''` | `0` |
| Werktag, `Ist>0`, kein Stempeln, unbekanntes Label (Feiertagsname) | `Feiertag` | `''` | `0` |
| SA/SO ohne Inhalt | `Wochenende` | `''` | `0` |
| Werktag, Inhalt aber kein Muster passt | *(nicht gesetzt, `eindeutig=false`)* | | |

- Dezimal-Parsing: `'6,27'` → `6.27`. Trailing `-` (in der `+/-`-Spalte) gehört nicht zu `Ist`.
- Feiertags-Heuristik: Werktag mit `Ist`-Wert, der weder Stempelzeit noch bekanntes
  Abwesenheits-/Schul-Label trägt (z. B. „Maifeiertg", „Himmelfhrt", „Pfingstmontg",
  „Fronleichnam"). Bekannte Abwesenheits-Labels (`Urlaub`, `Krank`…) werden in einer
  erweiterbaren Liste geführt.

---

## 6. Profil-Sektion + Tutorial (UI)

Neuer `<details class="profil-section">`-Block **„Zeitnachweis-Import"**, eingehängt in
`profil.js` **nur für Rolle `azubi`** (analog zu `buildAusbildungsDaten` etc.). Aufbau:

1. Kurze Einleitung („Lade deinen Zeitnachweis aus SAP ESS hoch — die App füllt deine
   Arbeitszeiten automatisch ins Berichtsheft.").
2. Ausklappbares Tutorial **„Wo finde ich die richtige Datei?"** mit den 3 Screenshots
   aus better-ess (`tutorial/zeitraum.png`, `download.png`, `speichern.png`), nach
   `app/assets/zeitnachweis/` heruntergeladen, plus erklärendem Schritttext
   (Zeitraum wählen → herunterladen → speichern).
3. **Subtiler Outline-Button „Zeitnachweis hochladen"** (Klasse `btn btn-outline`) mit
   verstecktem `<input type="file" accept="application/pdf">`; die Sektionsfläche dient
   zusätzlich als Drag-&-Drop-Ziel.

`profil.html` lädt zusätzlich `js/zeitnachweis-parser.js`, `js/zeitnachweis-upload.js`
und die beiden pdf.js-Dateien. `profil.js` ruft im azubi-Zweig
`ZeitnachweisUpload.renderSection(user)` und in `render()` `ZeitnachweisUpload.bind(user)`.

---

## 7. Vorschau-Dialog & Übernahme

Nach erfolgreichem Parsen öffnet ein Modal (bestehende `Modal`-Komponente):

- **Kopf:** erkannter Zeitraum + Hinweis auf den **Stichtag** („Daten nur bis
  `TT.MM.JJJJ` ausgewertet"), falls vorhanden.
- **Umschalter:** „Alle erkannten Tage überschreiben" ↔ „Nur leere Tage füllen"
  (Default: **überschreiben**). Steuert das `overwrite`-Flag.
- **Tabelle, nach KW gruppiert.** Pro Zeile: Datum, Wochentag, Anwesenheit, Ort,
  Stunden (`H:MM`) und eine **Checkbox** (an/aus, Default an).
  - Zeilen in **schreibgeschützten Wochen** (`freigegeben`/`genehmigt`) sind ausgegraut,
    Checkbox deaktiviert, mit Hinweis „Woche bereits eingereicht — übersprungen".
  - Nicht eindeutige Tage (`eindeutig=false`): Checkbox standardmäßig **aus**, optisch markiert.
- **Footer:** „Abbrechen" / „**X Tage übernehmen**". Bei Klick → `DB.applyZeitnachweis`
  mit den angehakten Tagen → Erfolgs-Toast mit Zusammenfassung
  (übernommen / übersprungen) + Link/Button zur Wochenansicht.

---

## 8. Fehlerbehandlung & Edge-Cases

- **Kein/falscher Dateityp** (nicht PDF) → Toast-Fehler, kein Dialog.
- **PDF ohne „Einzelergebnisse pro Tag"** (falsches Dokument) → Meldung
  „Kein gültiger Zeitnachweis erkannt".
- **pdf.js-Ladefehler / Parsefehler** → Toast-Fehler, Konsolen-Log, kein Teil-Schreiben.
- **Tage nach Stichtag** → nicht in der Tabelle, werden nicht angefasst.
- **Mehrere KWs / Monatsgrenze:** Der PDF-Monat (z. B. Mai 2026) erstreckt sich über
  mehrere ISO-Wochen (KW 18–22); `applyZeitnachweis` legt jede betroffene Woche bei
  Bedarf an. Tage aus angrenzenden Monaten, die in derselben ISO-Woche liegen, bleiben
  unberührt, wenn sie nicht im PDF stehen.
- **Demo-Persistenz:** Schreiben erfolgt über die bestehende `DB`/localStorage-Schicht;
  in der späteren produktiven Variante landet es serverseitig über dieselbe DB-Methode.

---

## 9. Bewusst nicht im Scope (YAGNI)

- Kein Auslesen der GLZ-/FLEXI-Konten (Seite 2) oder Urlaubsansprüche (Seite 3).
- Kein Befüllen von Tätigkeitstexten (stehen nicht im PDF).
- Kein Server-Upload des PDFs.
- Keine automatische Rundung der `Ist`-Stunden (netto wird 1:1 übernommen).
- Kein Mehrfach-/Stapel-Upload mehrerer PDFs gleichzeitig.
