# Automatische tägliche JSON-Backups der Berichtshefte — Design

**Datum:** 2026-07-31
**Feature:** Server-seitiger Hintergrund-Job, der jede Nacht pro Azubi einen JSON-Snapshot des Berichtshefts auf die Platte schreibt und Snapshots älter als 30 Tage entfernt
**Betroffene Dateien:** `backend/services/berichtsheftBackup.js` (neu), `backend/services/berichtsheftBackup.test.js` (neu), [backend/server.js](../../../backend/server.js), [app/js/api.js](../../../app/js/api.js) (nur Verweis-Kommentar), [README.md](../../../README.md)
**Kein Frontend-Feature:** keine neue Seite, keine neue API-Route, kein UI

## Problem

Berichtsheft-Daten können durch Bedienfehler verloren gehen — ein
versehentliches Löschen, ein fehlerhafter IHK-Import, der bestehende Einträge
überschreibt, oder ein Restore aus einem fremden Backup. Aktuell existiert nur
ein **manuelles** Backup: der Azubi muss selbst im Profil auf „Herunterladen"
klicken ([berichtsheft-export.js](../../../app/js/berichtsheft-export.js)).
Wer das nie tut — also praktisch alle — hat im Ernstfall nichts.

## Ziel

Jede Nacht liegt automatisch ein wiederherstellbarer Stand **aller**
Berichtshefte auf dem Server. Im Ernstfall holt ein Admin/Developer die
betroffene Datei und spielt sie über den **bereits existierenden**
„Wiederherstellen"-Dialog im Profil ein — ohne neuen Restore-Code und ohne
Konvertierungsskript unter Zeitdruck.

## Im Brainstorming festgelegte Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Zweck | Notfall-Wiederherstellung durch Admin/Developer, server-seitig für alle Azubis |
| Ablageort | fest `backend/data/backups/` (kein Konfigurationsschalter) |
| Aufbewahrung | 30 Tage, danach automatisch löschen |
| Zugriff | nur Ordner auf dem Server; keine Seite, keine Download-Route |
| Umfang | Format `berichtsheft-backup` v1 wie das manuelle Backup; **ohne** Datei-Anhänge |
| Format-Logik | eigener Normalizer im Backend, per Unit-Test festgenagelt (bewusste, dokumentierte Duplizierung) |

## Kern-Erkenntnis: Server- und Client-Format unterscheiden sich

Das Backend liefert Wochen in **DB-Schreibweise** (`Id`, `AzubiOid`, `KW`,
`Jahr`, `StartDatum`, `tage[].Anwesenheit`), siehe `parseWoche` in
[backend/routes/wochen.js](../../../backend/routes/wochen.js). Das manuelle
Backup enthält dagegen die **Client-Form** (`azubiId`, `kw`, `year`,
`startDate`, `tage[].datum`), erzeugt von `normalizeWoche` / `normalizeTag` /
`normalizeKommentar` in [app/js/api.js](../../../app/js/api.js) (~Zeile 124-183).

Diese Normalisierung ist mehr als Umbenennung — sie enthält Fachlogik:

- `anwesenheit`: `'krank'` → `'Arbeitsunfähigkeit'` (Altbestand)
- `ort`: `'Zuhause'` / `'Dienstreise'` → `'Betrieb'` (Altbestand)
- `tagdauer`: alles außer `'halbtag'` → `'ganztag'`
- alle Datumswerte auf `YYYY-MM-DD` gekürzt
- `null` → `''` bei allen Textfeldern, `!!` bei allen Bool-Feldern

Ein naiv aus DB-Zeilen erzeugtes JSON wäre deshalb **nicht** über den
bestehenden Dialog einspielbar. `buildBackupPayload` muss diese Normalisierung
nachbilden.

Die Duplizierung ist bewusst gewählt (Alternative wäre ein Dual-Mode-Modul für
Frontend und Backend gewesen — verworfen, weil es funktionierenden Code in
`api.js` umbauen und die Schichtgrenze verwässern würde). Abgesichert wird sie
zweifach:

1. **Unit-Test** (siehe Testplan), der Keys, Alt-Wert-Mappings und
   Datumsformate festnagelt.
2. **Gegenseitige Verweis-Kommentare:** über `normalizeWoche` in `api.js` ein
   Hinweis auf `services/berichtsheftBackup.js` und umgekehrt — damit eine
   Formatänderung nicht einseitig passiert.

## Architektur

Ein Service + ein Timer, exakt im Muster der bestehenden Hintergrund-Jobs
(`entraSync`, Fehler-Cleanup in [server.js](../../../backend/server.js) ~Zeile 217-231).

### `backend/services/berichtsheftBackup.js`

| Export | Aufgabe | I/O |
| --- | --- | --- |
| `buildBackupPayload(user, wochenRows)` | DB-Zeilen → JSON-Objekt Format `berichtsheft-backup` v1 | keine (rein) |
| `runBackup(deps)` | Snapshots aller Azubis schreiben + Manifest | Datei-I/O, Daten injiziert |
| `pruneOldBackups(keepDays, deps)` | Tagesordner älter als `keepDays` löschen | Datei-I/O |
| `BACKUP_DIR` | `path.join(__dirname, '..', 'data', 'backups')` | — |

`runBackup` bekommt seine Abhängigkeiten **injiziert**:

```js
runBackup({
  listAzubis,   // async () => [{ oid, name, email, beruf, berichtTyp, ausbildungsBeginn, ausbildungsEnde }]
  ladeWochen,   // async (oid) => DB-Zeilen (Form wie parseWoche)
  jetzt,        // Date  (Testbarkeit: Tagesordner + exportiertAm)
  dir,          // Zielverzeichnis (Tests: Temp-Ordner)
})
```

Damit sind Format, Rotation, Dateibenennung und Fehlerpfade **ohne
SQL-Server** testbar. Die Produktions-Implementierungen von `listAzubis` /
`ladeWochen` liegen im selben Modul (dünne SQL-Wrapper) und werden von
`server.js` als Default verwendet.

### Welche Azubis werden gesichert?

Über `SELECT DISTINCT AzubiOid FROM dbo.Wochen`, **nicht** über die
Nutzerliste. Damit sind DH-Studenten und inaktive/ehemalige Konten automatisch
enthalten — genau die, deren abgeschlossene Hefte im Ernstfall gebraucht
werden. Die Stammdaten (`name`, `email`, `beruf`, …) kommen per Join bzw.
`getUserByOid` dazu; fehlt der Nutzer (Datenrest ohne Konto), wird der
Snapshot trotzdem geschrieben, mit den vorhandenen Feldern und leeren
Stammdaten.

### Wochen-Abfrage

Dieselbe Abfrage wie [routes/wochen.js](../../../backend/routes/wochen.js)
`GET /` (inkl. `FOR JSON PATH`-Unterabfragen für Tage und Kommentare), aber
**ohne** Zugriffsfilter und ohne `annotiereWoche` — der Job läuft als System,
nicht als Nutzer. Die Annotationsfelder werden im Payload konstant gesetzt
(`viewerRolle: null`, `erlaubteAktionen: []`), damit die Struktur
formatgleich zum Client-Backup bleibt; der Restore-Pfad wertet sie nicht aus.

## Dateilayout & Rotation

```
backend/data/backups/
  2026-07-31/
    _manifest.json
    florian-kuniss_00000000-0000-0000-0000-000000000001.json
    lena-mueller_00000000-0000-0000-0000-000000000005.json
  2026-07-30/
    ...
```

- **Tagesordner** (`YYYY-MM-DD`), weil die Rotation dann ein Ordner-Löschen ist
  statt Datei-Arithmetik.
- **Dateiname** `<slug(name)>_<oid>.json` — lesbar für den Admin, eindeutig
  auch bei Namensgleichheit. Slug: Kleinbuchstaben, Umlaute transliteriert
  (ä→ae, ö→oe, ü→ue, ß→ss), alles Übrige zu `-`, führende/schließende `-`
  entfernt. Ist der Slug leer (kein Name hinterlegt), heißt die Datei
  `<oid>.json` — ohne führenden Unterstrich, damit sie nicht wie eine
  Metadatei aussieht. Umgekehrt kann ein Slug nie mit `_` beginnen, weshalb
  `_manifest.json` garantiert nicht mit einer Azubi-Datei kollidiert.
- **Idempotent:** ein zweiter Lauf am selben Tag (z. B. Dienst-Neustart)
  überschreibt die Datei des Tages. Keine Duplikate, keine Zeitstempel im Namen.
- **Leere Hefte:** Azubis ohne eine einzige Woche werden übersprungen (kein
  leeres File) und im Manifest als `uebersprungen` gezählt.
- Verzeichnisse per `fs.mkdirSync(dir, { recursive: true })` (Muster
  [routes/ihk-imports.js](../../../backend/routes/ihk-imports.js)).
- **Rotation:** nach dem Schreiben werden Einträge in `BACKUP_DIR` betrachtet,
  deren Name auf `YYYY-MM-DD` passt. Ein Ordner **bleibt**, wenn sein Datum
  >= (heute − `AUFBEWAHRUNG_TAGE`) ist, sonst wird er rekursiv gelöscht. Mit
  der Konstante `AUFBEWAHRUNG_TAGE = 30` im Service heißt das: der Ordner von
  heute−30 bleibt, heute−31 fällt weg. Namen, die nicht auf das Muster passen
  (z. B. `notizen/` oder eine abgelegte Datei), bleiben unangetastet — Schutz
  gegen versehentliches Löschen fremder Daten.

### `_manifest.json`

```json
{
  "erzeugtAm": "2026-07-31T02:00:03.412Z",
  "dauerMs": 1840,
  "azubis": 42,
  "dateien": 39,
  "uebersprungen": 3,
  "geloeschteTage": ["2026-06-30"],
  "fehler": [{ "oid": "…", "name": "…", "fehler": "…" }]
}
```

Damit ist im Nachhinein erkennbar, ob ein Lauf vollständig war, ohne Dateien
zu zählen.

## Zeitsteuerung

- **Nächtlich um 02:00 Ortszeit.** Umgesetzt als `setTimeout`, das sich nach
  jedem Lauf neu auf die nächste 02:00 stellt (`msBisNaechsteUhrzeit(2)`).
  Bewusst **kein** starres `setInterval(24h)`: das driftet über Neustarts und
  Sommerzeitwechsel weg von der gewünschten Nachtzeit.
- **Zusätzlich ein Lauf beim Serverstart**, damit nach einem Deployment sofort
  ein Stand existiert (und ein Server, der nie über Nacht läuft, überhaupt
  Backups erzeugt). Dieser Start-Lauf wird **übersprungen, wenn für den
  heutigen Tag bereits ein `_manifest.json` existiert** — sonst würde der
  Dev-Server, der mit `node --watch` bei jeder Code-Änderung neu startet, die
  Datenbank dutzende Male am Tag durchziehen. Der 02:00-Lauf läuft immer.
- Der Timer wird nur im normalen Serverbetrieb gestartet (in `server.js`, wie
  `entra-sync`), nicht in Tests.

## Fehlerbehandlung

- **Pro Azubi** `try/catch`: ein kaputter Datensatz kippt nicht den ganzen
  Lauf. Der Fehler landet im Manifest und über `logFehler({ quelle: 'backend' })`
  im Fehler-Posteingang.
- **Ganzer Lauf** scheitert (DB nicht erreichbar, Verzeichnis nicht
  schreibbar): einmal protokollieren, Prozess läuft weiter — Muster
  `entraRunSync().catch(...)`.
- **Rotation** scheitert (Ordner gesperrt): protokollieren, Lauf gilt trotzdem
  als erfolgreich; die Snapshots selbst sind wichtiger als das Aufräumen.

## Testplan

`backend/services/berichtsheftBackup.test.js`, `node:test` wie die übrigen
`services/*.test.js`, gegen ein Temp-Verzeichnis und mit injizierten Daten
(kein SQL-Server nötig):

1. **Format-Treue:** synthetische DB-Zeile → erwartetes JSON. Prüft
   `format`/`version`, camelCase-Keys, `krank` → `Arbeitsunfähigkeit`,
   `Zuhause` → `Betrieb`, `tagdauer`-Default `ganztag`, Datumswerte
   `YYYY-MM-DD`, `null` → `''`.
2. **Struktur-Vollständigkeit:** der Key-Satz einer Woche/eines Tages
   entspricht dem, was der Restore-Dialog erwartet (Liste im Test explizit
   hinterlegt, damit ein versehentliches Weglassen auffällt).
3. **Dateibenennung:** Name mit Umlauten/Sonderzeichen → erwarteter Slug;
   leerer Name → nur OID.
4. **Idempotenz:** zweimal derselbe Tag → eine Datei, Inhalt vom zweiten Lauf.
5. **Leeres Heft:** Azubi ohne Wochen → keine Datei, `uebersprungen: 1`.
6. **Fehler-Isolation:** `ladeWochen` wirft für einen von drei Azubis → zwei
   Dateien, ein Eintrag in `fehler`, Lauf beendet sich normal.
7. **Rotation:** Ordner 31 Tage alt → gelöscht; 29 Tage alt → bleibt;
   Fremdordner (`notizen/`) und Fremddateien bleiben unangetastet.
8. **Manifest:** wird geschrieben und enthält die erwarteten Zähler.

Zusätzlich manuell nach der Implementierung: Server starten und prüfen, dass
`backend/data/backups/<heute>/` mit plausiblen Dateien entsteht, und **eine**
davon über den „Wiederherstellen"-Dialog im Profil einspielen (Dev-Konto), um
die Format-Kompatibilität end-to-end zu belegen.

## Dokumentation

[README.md](../../../README.md) bekommt im Abschnitt „Export & Backup" einen
Satz zum automatischen Nacht-Job (Ort, Rhythmus, Aufbewahrung, und dass die
Dateien über den bestehenden Dialog einspielbar sind) sowie eine Zeile in der
Projektstatus-Tabelle. `backend/data/` ist bereits in
[.gitignore](../../../.gitignore) — die Snapshots landen also nicht im Repo.

## Bewusst nicht enthalten (YAGNI)

- **Datei-Anhänge** (liegen als `VARBINARY` in der DB) — würden die Snapshots
  vervielfachen und sind über den Dialog ohnehin nicht einspielbar.
- **Beurteilungen, Fahrtgelddaten, Zuweisungen, Nutzerkonten** — gesichert
  wird das Berichtsheft, wie besprochen.
- **UI / API-Route / Download-Seite** — Zugriff über den Server-Ordner.
- **Konfigurierbarer Zielpfad** (`BACKUP_DIR` per `.env`), Netzfreigabe,
  Verschlüsselung, ZIP-Komprimierung.
- **Monatliche Langzeitstände** (Großeltern-Prinzip) — 30 Tageskopien.
- **Automatisches Zurückspielen.**

## Betrieblicher Vorbehalt

Die Snapshots liegen auf derselben Maschine wie die SQL-Datenbank. Das schützt
gegen Bedien- und Anwendungsfehler (versehentliches Löschen, fehlerhafter
Import), **nicht** gegen einen Plattenausfall. Wer echten Katastrophenschutz
will, kopiert den Ordner regelmäßig weg oder rüstet später einen
konfigurierbaren Zielpfad nach — im Service ist das eine Zeile, weil alle
Datei-Operationen über `dir` laufen.
