# Löschkonzept für inaktive Azubis — Design

**Datum:** 2026-08-11
**Feature:** Nächtlicher Retention-Job, der Azubi-/DH-Studenten-Konten samt aller
personenbezogenen Daten 365 Tage nach ihrer Deaktivierung endgültig löscht,
30 Tage vorher vorwarnt und per Sperrfeld im Einzelfall zurückgehalten werden kann
**Betroffene Dateien:** `backend/services/retention.js` (neu),
`backend/services/retention.test.js` (neu),
`db/migrations/030_users_loeschkonzept.sql` (neu),
`db/migrations/031_benachrichtigungen_loeschtyp.sql` (neu),
[backend/services/users.js](../../../backend/services/users.js),
[backend/server.js](../../../backend/server.js),
[app/js/nutzerverwaltung.js](../../../app/js/nutzerverwaltung.js),
[app/js/dashboard.js](../../../app/js/dashboard.js) **und**
[app/js/mitteilungen.js](../../../app/js/mitteilungen.js) (Mitteilungs-Katalog, doppelt gepflegt),
[docs/funktionsweise.md](../../funktionsweise.md)

**Nicht Teil dieser Spec:** die Denormalisierung der Gegenzeichner-Namen
(`Wochen.KorrigiertVonName`) und das Löschen von Prüfer-/Ausbilder-Konten. Beides
bekommt eine eigene Spec, siehe [Bewusst verschoben](#bewusst-verschoben).

## Problem

Wird ein Azubi aus der Entra-Gruppe entfernt, setzt der Sync sein Konto auf
`Aktiv = 0` ([entraSync.js:206-209](../../../backend/services/entraSync.js#L206-L209),
[users.js:238-245](../../../backend/services/users.js#L238-L245)). Danach passiert
**nichts mehr**: ein `DELETE FROM dbo.Users` existiert im gesamten Backend nicht.
Das Konto bleibt dauerhaft auf „inaktiv", mit allen Wochen, Tagen, Kommentaren,
Beurteilungen, Anhängen, dem Profilfoto und den importierten IHK-PDFs.

Über die Jahre sammelt die Anwendung damit die vollständigen Ausbildungsnachweise
aller je erfassten Azubis ohne jede Löschregel. Das ist zugleich der Gap **G-20**
des eigenen Compliance-Audits, dessen Fix wörtlich lautet: „Löschkonzept
dokumentieren und technisch vollziehen (Frist ab `AusbildungEnde`, Löschjob,
Eintrag in die Datenschutzinformation)"
([2026-07-27-ihk-compliance-audit.md:210](../../2026-07-27-ihk-compliance-audit.md#L210)).
Art. 5 Abs. 1 lit. e DSGVO verlangt eine Speicherbegrenzung; bislang gibt es keine.

## Ziel

Ein Konto mit Rolle `azubi` oder `dhstudent`, das seit 365 Tagen inaktiv ist, wird
automatisch und endgültig gelöscht — samt aller Daten, die an ihm hängen, in
Datenbank **und** Dateisystem. 30 Tage vorher erfährt die Ausbildungsleitung davon
und kann Einzelfälle zurückhalten. Prüfer-, Ausbilder-, Admin- und
Developer-Konten bleiben unangetastet.

## Im Brainstorming festgelegte Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Stichtag der Frist | **Deaktivierung** (`Aktiv` 1 → 0), nicht `AusbildungEnde` — letzteres ist NULL-erlaubt und wird vom Entra-Sync nicht gepflegt |
| Frist | 365 Tage, als Konstante im Modul (**keine** `.env`-Variable, siehe unten) |
| Betroffene Rollen | nur `azubi` und `dhstudent`. Personal wird nicht gelöscht, weil es als Gegenzeichner in fremden, noch bestehenden Heften referenziert ist |
| Archivierung | **keine**. Echte Löschung; die Herausgabe des Nachweises ist organisatorisch vor dem Austritt zu erledigen |
| Auslösung | vollautomatisch, nächtlich — plus Vorwarnung 30 Tage vorher und ein Sperrfeld pro Nutzer |
| Bauform | Service-Modul im Muster von `berichtsheftBackup.js`; **keine** FK-Kaskaden, **keine** Stored Procedure |
| Backup-Snapshots | bleiben liegen und verfallen mit der 30-Tage-Rotation der Tagesordner |
| Demo-Konten | nie löschen (`.demo`-Ausnahme wie in [users.js:233](../../../backend/services/users.js#L233)) |

### Warum die Frist eine Konstante ist und keine Env-Variable

Die Löschfrist ist eine dokumentierte Compliance-Entscheidung, die in die
Datenschutzinformation eingeht. Als `.env`-Wert könnte sie auf dem Dev-Server
anders stehen als produktiv, ohne Spur in Git — bei unwiderruflichem Löschen die
falsche Eigenschaft. Testbarkeit entsteht nicht durch Konfigurierbarkeit, sondern
dadurch, dass `jetzt` und `fristTage` **Parameter** sind statt `new Date()` im
Funktionskörper — genau wie bei
[pruneOldBackups](../../../backend/services/berichtsheftBackup.js#L239).

## Kern-Erkenntnis 1: Namen werden live aufgelöst, nicht mitgespeichert

Die App speichert bei Genehmigung nur die OID (`Wochen.KorrigiertVon`,
[009_korrektur_attribution.sql](../../../db/migrations/009_korrektur_attribution.sql))
und löst den Namen bei jedem Rendern neu auf. Fehlt die `dbo.Users`-Zeile:

| Stelle | Verhalten |
| --- | --- |
| Kommentar-Autor | `'Unbekannt'` ([wochenansicht.js:2520](../../../app/js/wochenansicht.js#L2520)) |
| Banner „Genehmigt durch …" | `korrektorName` leer → Fallback auf den **statisch zugeordneten** Ausbilder ([wochenansicht.js:1245-1249](../../../app/js/wochenansicht.js#L1245-L1249)) |
| PDF-Gegenzeichnung | `'Ausbilder/in'` statt Name ([berichtsheft-export.js:263](../../../app/js/berichtsheft-export.js#L263)) |

Der Banner-Fallback ist der gefährliche: er behauptet stillschweigend, eine andere
Person habe abgenommen. Ein Azubi hat regelmäßig mehrere Ausbilder — deshalb
existiert `KorrigiertVon` überhaupt. Da die IHK die Vorlage des gegengezeichneten
Nachweises jederzeit verlangen kann (§ 76 Abs. 2 BBiG) und das PDF **on demand aus
Live-Daten** gebaut wird, träte der Mangel genau bei der Vorlage auf.

**Konsequenz für diese Spec:** Personal wird nicht gelöscht. Erst wenn der
Gegenzeichner-Name in `dbo.Wochen` denormalisiert ist, wird das gefahrlos möglich.

## Kern-Erkenntnis 2: Keine FK-Kaskaden, dafür lose Referenzen in vier Richtungen

`AzubiOid` / `UserOid` sind fast überall lose `NVARCHAR(36)` ohne Fremdschlüssel auf
`dbo.Users`. Ein `DELETE FROM dbo.Users` kaskadiert also nicht — jede Tabelle muss
explizit angefasst werden. Nachrüsten von FKs mit `ON DELETE CASCADE` wurde
verworfen, weil (a) bestehende Waisen das Anlegen verhindern — der Backup-Job
rechnet ausdrücklich mit Wochen ohne Users-Zeile
([berichtsheftBackup.js:164-168](../../../backend/services/berichtsheftBackup.js#L164-L168))
—, (b) SQL Server mehrere Kaskadenpfade auf dieselbe Tabelle beim Anlegen des
Constraints ablehnt (`Users → Wochen → Kommentare` kollidiert mit
`Users → Kommentare`), und (c) die Unterscheidung „Azubis löschen, Personal nicht"
damit nicht abbildbar wäre.

Die Personenbindung läuft außerdem über **mehr als zwei Spalten**. Bei
`erstgenehmigt` entsteht eine Mitteilung mit `UserOid = Ausbilder`,
`FromUserOid = Prüfer`, `WocheId = Woche des Azubis`
([wochen.js:315-322](../../../backend/routes/wochen.js#L315-L322)) — der Azubi steht
in **keiner** Personenspalte. Beurteilungs-Mitteilungen sind systemgeneriert und
haben `FromUserOid = NULL`
([016:26-32](../../../db/migrations/016_benachrichtigungen_beurteilungstypen.sql#L26-L32));
die Verbindung läuft allein über `ZuweisungId`. Eine Löschbedingung
„`UserOid = @oid OR FromUserOid = @oid`" ließe beide Fälle als Verweise auf
gelöschte Zeilen zurück.

## Architektur

Ein Service plus ein selbst-nachplanender Timer, im Muster der bestehenden
Hintergrund-Jobs ([server.js:212-268](../../../backend/server.js#L212-L268)).

### `backend/services/retention.js`

| Export | Aufgabe | I/O |
| --- | --- | --- |
| `LOESCHFRIST_TAGE = 365`, `VORWARN_TAGE = 30` | Fristen | — |
| `LOESCH_REIHENFOLGE` | geordnete Liste `{ tabelle, bedingung }` | — (Datenkonstante, testbar) |
| `loeschDatum(user, { fristTage })` | `InaktivSeit + Frist` → `Date` | keine (rein) |
| `istFaellig(user, { jetzt, fristTage })` | fällig? inkl. Sperr- und Demo-Prüfung | keine (rein) |
| `istVorwarnFaellig(user, { jetzt, fristTage, vorwarnTage })` | im Vorwarnfenster? | keine (rein) |
| `ermittleKandidaten(deps)` | fällige + vorzuwarnende Konten | DB-Lesen, injiziert |
| `loescheNutzer(oid, deps)` | eine Transaktion über `LOESCH_REIHENFOLGE` | DB-Schreiben |
| `raeumeWaisenDateien(deps)` | `ihk-imports`-Ordner ohne Users-Zeile entfernen | Datei-I/O |
| `runRetention(deps)` | vollständiger Lauf, liefert Bericht | orchestriert |

Abhängigkeiten werden **injiziert**, damit der Job ohne SQL Server und ohne echte
Uhr prüfbar ist:

```js
runRetention({
  listKandidaten,   // async () => [{ oid, name, role, inaktivSeit, loeschsperreBis, email }]
  loescheNutzer,    // async (oid) => { tabelle: anzahl }
  sendeVorwarnung,  // async (user, empfaenger[]) => void
  jetzt,            // Date
  fristTage,        // default LOESCHFRIST_TAGE
  vorwarnTage,      // default VORWARN_TAGE
  dir,              // ihk-imports-Verzeichnis (Tests: Temp-Ordner)
  logFehler,        // Fehler-Posteingang
})
```

### Datenmodell — `db/migrations/030_users_loeschkonzept.sql`

Additiv und idempotent (`IF COL_LENGTH(...) IS NULL`, Muster wie
[028](../../../db/migrations/028_wochen_eingereicht_stempel.sql)):

| Spalte | Typ | Zweck |
| --- | --- | --- |
| `Users.InaktivSeit` | `DATETIME2 NULL` | Stichtag der Frist |
| `Users.LoeschsperreBis` | `DATE NULL` | Einzelfall zurückhalten |

Semantik der Sperre: sie **greift**, solange `LoeschsperreBis >= heute` (Ortsdatum).
`NULL` und ein Datum in der Vergangenheit greifen nicht. Läuft die Sperre ab, ist
das Konto beim nächsten Lauf fällig — die Frist wird durch die Sperre nicht neu
gestartet.

**Backfill:** alle heute inaktiven Konten bekommen `InaktivSeit = SYSUTCDATETIME()`,
also ein volles Jahr ab Migration. Bewusst **nicht** `AktualisiertAm` — die Spalte
wird von jedem Sync-Lauf und jeder manuellen Änderung angefasst, wäre also mal zu
alt, mal zu neu, und ein zu alter Wert würde direkt nach dem Deployment löschen.

**`setUsersAktiv` muss übergangssensitiv werden.** Heute schreibt es stumpf
`Aktiv = @aktiv` über die ganze OID-Liste
([users.js:238-245](../../../backend/services/users.js#L238-L245)). Neu:

- Übergang aktiv → inaktiv: `InaktivSeit = SYSUTCDATETIME()`, aber **nur** wo
  `Aktiv = 1` ist — sonst schiebt jeder Lauf die Frist nach hinten.
- Übergang inaktiv → aktiv: `InaktivSeit = NULL`. Die Reaktivierung setzt die Uhr
  zurück; ein versehentlich entfernter und wieder aufgenommener Azubi startet neu.

### Mitteilungstyp — `db/migrations/031_benachrichtigungen_loeschtyp.sql`

`CK_Benachrichtigungen_Typ` ist eine geschlossene Liste und muss gedroppt und mit
`'loeschung_geplant'` neu angelegt werden (Muster
[022](../../../db/migrations/022_benachrichtigungen_vertretungstypen.sql#L13-L25)).
**Ohne diese Migration scheitert das `INSERT` am CHECK und wird best-effort
verschluckt** (`catch (_) {}`, [zuweisungen.js:41](../../../backend/routes/zuweisungen.js#L41))
— die Vorwarnung käme nie an, ohne Fehlermeldung. Die Migration muss deshalb
**vor** dem Aktivieren des Jobs laufen.

## Ablauf eines Laufs

Timer in `server.js`: selbst-nachplanender `setTimeout` auf **03:00** Ortszeit über
`msBisNaechsteUhrzeit(3)`, nicht `setInterval(24h)` — so driftet die Uhrzeit über
Neustarts und Sommerzeitwechsel nicht weg
([server.js:257-267](../../../backend/server.js#L257-L267)). Eine Stunde nach dem
Backup, damit ein frischer Snapshot vorliegt. Läufe serialisiert über eine
`laufenderLauf`-Promise wie [runBackup](../../../backend/services/berichtsheftBackup.js#L362-L369).
Beim Start **kein** Sofortlauf: der Dev-Server läuft mit `node --watch` und würde
sonst bei jeder Code-Änderung löschen.

1. **Kandidaten ermitteln.** Konten mit `Role IN ('azubi','dhstudent')`,
   `Aktiv = 0`, `InaktivSeit IS NOT NULL`, `(Email IS NULL OR Email NOT LIKE '%.demo%')`.
   Rolle und Demo-Ausnahme werden anschließend in `istFaellig` **erneut** geprüft.
   Das ist beabsichtigt: die SQL-Bedingung hält die Liste klein, die reine Funktion
   ist die Stelle, die per Test festgenagelt ist — und die einzige, die auch gilt,
   wenn jemand die Abfrage später umbaut.
2. **Vorwarnen.** Restlaufzeit ≤ 30 Tage → Mitteilung `loeschung_geplant` an alle
   aktiven Nutzer mit `KannPlanen = 1` sowie Rolle `developer`. Idempotent: nur
   senden, wenn für dieses Konto noch keine Mitteilung dieses Typs existiert —
   sonst 30 Nächte hintereinander dieselbe Meldung.
3. **Löschen.** `InaktivSeit <= jetzt − 365` **und** keine greifende
   `LoeschsperreBis` → `loescheNutzer(oid)`.
4. **Dateien aufräumen.** Nach dem Commit, zustandslos (siehe unten).
5. **Protokollieren.** Bericht in die Konsole; Fehler zusätzlich in den
   Fehler-Posteingang.

## Löschreihenfolge

Eine Transaktion **pro Nutzer**, Kinder vor Eltern. `@wochen` steht für
`SELECT Id FROM dbo.Wochen WHERE AzubiOid = @oid`, `@zuw` für
`SELECT Id FROM dbo.Zuweisungen WHERE AzubiOid = @oid`.

| # | Tabelle | Bedingung | Grund für die Position |
| --- | --- | --- | --- |
| 1 | `Benachrichtigungen` | `UserOid = @oid OR FromUserOid = @oid OR WocheId IN (@wochen) OR ZuweisungId IN (@zuw)` | verweist auf `Wochen` **und** `Zuweisungen`; vier Zweige nötig (Kern-Erkenntnis 2) |
| 2 | `Kommentare` | `WocheId IN (@wochen) OR UserOid = @oid` | `FK_Kommentare_Tage` ohne Cascade ([002:11](../../../db/migrations/002_tagekommentare.sql#L11)) → **vor** `Tage` |
| 3 | `Tage` | `WocheId IN (@wochen)` | |
| 4 | `Wochen` | `AzubiOid = @oid` | `Anhaenge` folgen per `ON DELETE CASCADE` ([004:21-22](../../../db/migrations/004_anhaenge.sql#L21-L22)) |
| 5 | `Beurteilungen` | `AzubiOid = @oid` | `BeurteilungKriterien` per Cascade ([015:45-46](../../../db/migrations/015_beurteilungen.sql#L45-L46)); **vor** `Zuweisungen` wegen `ZuweisungId` |
| 6 | `Zuweisungen` | `AzubiOid = @oid` | |
| 7 | `AusbilderAzubis` | `AzubiOid = @oid OR AusbilderOid = @oid` | |
| 8 | `FahrtgeldKonfig` | `AzubiOid = @oid` | |
| 9 | `Vertretungen` | `VertretenerOid = @oid OR VertreterOid = @oid` | |
| 10 | `McpLog` | `UserOid = @oid` | vor `ApiKeys` |
| 11 | `ApiKeys` | `UserOid = @oid` | |
| 12 | `Users` | `Oid = @oid` | `UserPhotos` per Cascade ([023:20](../../../db/migrations/023_user_photos_tabelle.sql#L20)) |

**Nicht angefasst:** `Fehlerberichte` / `FehlerAnhaenge` — eigene 90-Tage-Rotation
([fehlerberichte.js](../../../backend/services/fehlerberichte.js)), nach 365 Tagen
Inaktivität längst verfallen. `AbteilungVerantwortliche` enthält nur Prüfer.

**Umsetzungs-Voraussetzung:** Die Basistabellen `Wochen`, `Tage`, `Kommentare`,
`Zuweisungen`, `Benachrichtigungen` stammen aus der Zeit vor der
Migrationsnummerierung; ihre Fremdschlüssel liegen **nicht** im Repo. Vor der
Implementierung ist die tatsächliche Constraint-Lage gegen die Dev-Datenbank zu
erheben (`sys.foreign_keys` / `sys.foreign_key_columns`) und die Reihenfolge daran
zu spiegeln. Die Tabelle oben ist die sichere Annahme, kein verifizierter Stand.

## Dateien: zustandslos und selbstheilend

Nach dem Commit löscht der Job jeden Ordner `backend/data/ihk-imports/<oid>/`,
dessen OID **keine** `dbo.Users`-Zeile mehr hat. Der Ordner enthält vollständige
IHK-Nachweis-PDFs und hat bisher **gar keine Rotation**
([ihk-imports.js:7-15](../../../backend/routes/ihk-imports.js#L7-L15)) — ohne diesen
Schritt löscht man die Datenbank und lässt das PDF liegen.

Die Ableitung „Ordner ohne Users-Zeile" braucht keinen Merkzettel: schlägt das
`rmSync` einmal fehl (offenes Handle, Virenscanner — bei
[pruneOldBackups](../../../backend/services/berichtsheftBackup.js#L232-L238) real
aufgetreten), greift der nächste Lauf denselben Ordner wieder auf. Nebeneffekt:
bestehender Waisen-Altbestand wird mit aufgeräumt. Sicherheitsnetz wie dort:
Einzelfehler stoppen die Schleife nicht, sie werden gesammelt und gemeldet.

`data/backups/` bleibt unberührt. Der Snapshot eines gelöschten Azubis verfällt mit
seinem Tagesordner nach 30 Tagen — datenschutzrechtlich als technisches Backup mit
definierter kurzer Frist vertretbar, und faktisch ein auslaufendes Fenster, in dem
eine Fehllöschung noch reparabel ist.

## Selbstprüfung gegen stilles Vergessen

Die Tabellenliste im Code kann veralten, sobald jemand eine neue Tabelle mit
Personenbezug anlegt. Der Job fragt deshalb `INFORMATION_SCHEMA.COLUMNS` nach
Spalten, die auf `Oid` enden, und vergleicht die Trefferliste gegen die in
`LOESCH_REIHENFOLGE` bekannten Tabellen. Unbekannter Treffer → Fehlerbericht mit
Schweregrad `hoch`, der Lauf läuft weiter. Das ersetzt die
Vollständigkeitsgarantie, die echte Fremdschlüssel geliefert hätten.

## Oberfläche

**Nutzerverwaltung** ([nutzerverwaltung.js:246-262](../../../app/js/nutzerverwaltung.js#L246-L262)):
neben dem `inaktiv`-Badge ein Zusatz „Löschung am TT.MM.JJJJ", im
Bearbeiten-Formular ein Datumsfeld `LoeschsperreBis`. Das Feld muss in die
Whitelist der beschreibbaren Spalten in
[users.js:89](../../../backend/services/users.js#L89) aufgenommen werden, sonst
verwirft `updateUser` es still.

**Mitteilungs-Katalog — zwei Stellen.** Der Typ-Katalog existiert doppelt:
[dashboard.js:1473](../../../app/js/dashboard.js#L1473) (Dashboard-Kachel) und
[mitteilungen.js:106](../../../app/js/mitteilungen.js#L106) (Mitteilungsseite).
`loeschung_geplant` muss in **beide** eingetragen werden — fehlt einer, rendert die
Mitteilung an genau dieser Stelle leer, ohne Fehlermeldung.

**Sichtbarkeit:** Kandidaten sind inaktiv und damit nur für `admin`/`developer`
überhaupt in der Nutzerliste ([routes/users.js:12](../../../backend/routes/users.js#L12)).
Nutzer mit `KannPlanen` sehen die Vorwarn-Mitteilung, das betroffene Konto in der
Liste aber nicht — die Mitteilung muss den Namen deshalb im Text tragen.

## Fehlerbehandlung

Ein Fehler bei **einem** Nutzer rollt nur dessen Transaktion zurück und bricht den
Lauf nicht ab — Prinzip wie in
[fuehreBackupAus](../../../backend/services/berichtsheftBackup.js#L317-L333). Der
Bericht:

```js
{ kandidaten, vorgewarnt, geloescht, gesperrt, dateienEntfernt, fehler: [{ oid, name, fehler }] }
```

Fehler gehen in Konsole **und** Fehler-Posteingang. Ein Lauf, der die
Kandidatenliste nicht laden kann, löscht **nichts** — fail closed, wie der
Entra-Sync bei Token-/Gruppenfehlern
([entraSync.js:189-193](../../../backend/services/entraSync.js#L189-L193)).

## Testplan

`backend/services/retention.test.js`, `node --test`, ohne SQL Server:

| Test | Nagelt fest |
| --- | --- |
| `istFaellig` mit injiziertem `jetzt` | Grenze bei genau 365 Tagen; 364 Tage → nicht fällig |
| `istFaellig` mit `LoeschsperreBis` in der Zukunft | Sperre greift; abgelaufene Sperre greift nicht |
| `istFaellig` mit `.demo`-Adresse | nie fällig, auch nach Jahren |
| `istFaellig` mit Rolle `pruefer`/`admin`/`developer` | nie fällig |
| `istFaellig` mit `InaktivSeit = NULL` | nie fällig (Altbestand ohne Stempel) |
| `istVorwarnFaellig` | greift im 30-Tage-Fenster, nicht davor, nicht nach Löschung |
| `LOESCH_REIHENFOLGE` | `Benachrichtigungen` vor `Wochen` **und** vor `Zuweisungen`; `Kommentare` vor `Tage`; `Beurteilungen` vor `Zuweisungen`; `Users` zuletzt |
| Bedingung für `Benachrichtigungen` | enthält alle vier Zweige (`UserOid`, `FromUserOid`, `WocheId`, `ZuweisungId`) |
| `raeumeWaisenDateien` im Temp-Ordner | löscht Ordner ohne Users-Zeile, lässt Ordner mit Users-Zeile stehen, ignoriert Nicht-GUID-Namen |
| `raeumeWaisenDateien` mit fehlschlagendem `rm` | sammelt den Fehler, räumt die übrigen Ordner trotzdem |
| `runRetention` mit einem werfenden `loescheNutzer` | Rest wird abgearbeitet, Fehler steht im Bericht |
| `runRetention` mit werfendem `listKandidaten` | löscht nichts (fail closed) |

Zusätzlich in `users.test.js`: `setUsersAktiv` stempelt `InaktivSeit` nur beim
Übergang und leert es beim Reaktivieren.

**Manuelle Abnahme** auf dem Dev-Server: ein Demo-Azubi (`.demo`-Adresse!) taucht
nie als Kandidat auf; ein Testkonto mit künstlich gesetztem `InaktivSeit` wird
vorgewarnt, per Sperre zurückgehalten, und nach Entfernen der Sperre gelöscht —
danach Prüfung, dass Wochen, Beurteilungen, Mitteilungen, Foto und der
`ihk-imports`-Ordner weg sind.

## Dokumentation

- [docs/funktionsweise.md](../../funktionsweise.md): Abschnitt 11 („Was passiert,
  wenn ein Azubi ausgelernt ist?", Zeile 367-375) und Abschnitt 12 („Kein
  Lösch-/Archivkonzept", Zeile 429-430) sind nach der Umsetzung **falsch** und
  müssen die neue Frist beschreiben.
- [README.md](../../../README.md): Hintergrund-Jobs um den Retention-Job ergänzen.
- Der Audit-Gap G-20 wird damit teilweise geschlossen; G-21 (Datenschutzseite in
  der App) bleibt offen und braucht die Frist als Inhalt.

## Bewusst verschoben

| Thema | Warum später |
| --- | --- |
| `Wochen.KorrigiertVonName` denormalisieren | Berührt den Schreibpfad von Genehmigung und Kommentar, braucht eigene Tests. Voraussetzung dafür, Personal überhaupt löschen zu können — eigene Spec |
| Prüfer-/Ausbilder-Konten löschen oder anonymisieren | Erst nach der Denormalisierung gefahrlos |
| Nachlauf-Fenster für Ex-Azubis (Lese-/Exportzugriff nach Deaktivierung) | Eigener Teil von Audit-Gap G-20, unabhängig vom Löschen |
| Datenschutz-Informationsseite (G-21) | Organisatorisch, braucht diese Spec als Input |
| Zwangs-Export beim Offboarding | Prozess, kein Code — die Herausgabe des Nachweises ist bewusst organisatorisch gelöst |
