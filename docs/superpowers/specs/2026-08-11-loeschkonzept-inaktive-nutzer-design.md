# Löschkonzept für inaktive Nutzer — Design

**Datum:** 2026-08-11
**Feature:** Nächtlicher Retention-Job, der jedes Konto 365 Tage nach seiner
Deaktivierung endgültig löscht — eigene Daten hart, Handlungen an fremden
Nachweisen anonymisiert bis auf den Namen. 30 Tage Vorwarnung, Sperrfeld für
Einzelfälle.
**Betroffene Dateien:**
`backend/services/retention.js` (neu), `backend/services/retention.test.js` (neu),
`db/migrations/030_users_loeschkonzept.sql` (neu),
`db/migrations/031_belege_namensspalten.sql` (neu),
`db/migrations/032_benachrichtigungen_loeschtyp.sql` (neu),
[backend/services/users.js](../../../backend/services/users.js),
[backend/routes/wochen.js](../../../backend/routes/wochen.js),
[backend/routes/kommentare.js](../../../backend/routes/kommentare.js),
[backend/routes/zuweisungen.js](../../../backend/routes/zuweisungen.js),
[backend/server.js](../../../backend/server.js),
[app/js/api.js](../../../app/js/api.js),
[app/js/wochenansicht.js](../../../app/js/wochenansicht.js),
[app/js/berichtsheft-export.js](../../../app/js/berichtsheft-export.js),
[app/js/nutzerverwaltung.js](../../../app/js/nutzerverwaltung.js),
[app/js/dashboard.js](../../../app/js/dashboard.js) **und**
[app/js/mitteilungen.js](../../../app/js/mitteilungen.js) (Mitteilungs-Katalog, doppelt gepflegt),
[docs/funktionsweise.md](../../funktionsweise.md)

## Problem

Wird ein Nutzer aus der Entra-Gruppe entfernt, setzt der Sync sein Konto auf
`Aktiv = 0` ([entraSync.js:206-209](../../../backend/services/entraSync.js#L206-L209),
[users.js:238-245](../../../backend/services/users.js#L238-L245)). Danach passiert
**nichts mehr**: ein `DELETE FROM dbo.Users` existiert im gesamten Backend nicht.
Das Konto bleibt dauerhaft auf „inaktiv", mit allen Wochen, Tagen, Kommentaren,
Beurteilungen, Anhängen, dem Profilfoto und den importierten IHK-PDFs.

Über die Jahre sammelt die Anwendung damit die vollständigen Ausbildungsnachweise
aller je erfassten Azubis sowie die Konten aller je beteiligten Prüfer, ohne jede
Löschregel. Das ist der Gap **G-20** des eigenen Compliance-Audits, dessen Fix
wörtlich lautet: „Löschkonzept dokumentieren und technisch vollziehen (Frist ab
`AusbildungEnde`, Löschjob, Eintrag in die Datenschutzinformation)"
([2026-07-27-ihk-compliance-audit.md:210](../../2026-07-27-ihk-compliance-audit.md#L210)).
Art. 5 Abs. 1 lit. e DSGVO verlangt eine Speicherbegrenzung; bislang gibt es keine.

## Ziel

Jedes Konto, das seit 365 Tagen inaktiv ist, wird automatisch und endgültig
gelöscht — unabhängig von der Rolle. Erhalten bleibt ausschließlich der **Name** an
Belegen, an denen die Person an einem fremden Ausbildungsnachweis gehandelt hat;
dieser Name verschwindet, sobald der Nachweis selbst gelöscht wird. 30 Tage vorher
erfährt die Ausbildungsleitung davon und kann Einzelfälle zurückhalten.

## Im Brainstorming festgelegte Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Stichtag der Frist | **Deaktivierung** (`Aktiv` 1 → 0), nicht `AusbildungEnde` — letzteres ist NULL-erlaubt und wird vom Entra-Sync nicht gepflegt |
| Frist | 365 Tage, als Konstante im Modul (**keine** `.env`-Variable, siehe unten) |
| Betroffene Rollen | **alle**. Eine Regel ohne Ausnahmeliste; `admin`/`developer` landen nur nach manueller Deaktivierung im Job |
| Namen an Belegen | bleiben erhalten (Gegenzeichnung, Kommentar-Autor, Ansprechpartner) — Rechtsgrundlage wie für das Heft selbst, Art. 6 Abs. 1 lit. c DSGVO i. V. m. BBiG |
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

## Kern-Erkenntnis 1: Nicht die Rolle entscheidet, sondern die Beziehung der Zeile

Der naheliegende Entwurf verzweigt nach `Role`: Azubis bekommen ihr Heft gelöscht,
Personal wird anonymisiert. Dieser Entwurf hat eine Lücke — den **übernommenen
Azubi**. Wer nach der Ausbildung als Prüfer weiterbeschäftigt wird, hat heute
`Role = 'pruefer'`; sein altes Berichtsheft würde vom Personal-Zweig nie angefasst
und bliebe für immer liegen.

Deshalb verzweigt der Job **nicht** nach Rolle, sondern wendet auf jede Person
beide Phasen an:

- **Phase A — eigene Daten, hart löschen.** Alles, wo die Person das *Subjekt* ist:
  ihr Berichtsheft, ihre Beurteilungen, ihre Zuweisungen, ihre
  Fahrtgeld-Konfiguration.
- **Phase B — Handlungen an fremden Daten, anonymisieren.** Wo die Person an einem
  *fremden* Nachweis gehandelt hat: Referenz nullen, Name behalten.
- **Phase C — Konto und Verkehrsdaten, hart löschen.**

Ein Konto ohne Berichtsheft löscht in Phase A einfach null Zeilen. Damit
verschwindet die Rollenlogik komplett, und der Sonderfall ist ohne
Sonderbehandlung erledigt.

## Kern-Erkenntnis 2: Namen werden live aufgelöst — mit einer gegenläufigen Ausnahme

Die App speichert an Belegen nur die OID und löst den Namen bei jedem Rendern neu
auf. Fehlt die `dbo.Users`-Zeile:

| Stelle | Verhalten |
| --- | --- |
| Kommentar-Autor | `'Unbekannt'` ([wochenansicht.js:2520](../../../app/js/wochenansicht.js#L2520)) |
| Rückweisungsgrund-Autor | `null` ([wochenansicht.js:1304](../../../app/js/wochenansicht.js#L1304)) |
| Banner „Genehmigt durch …" | `korrektorName` leer → Fallback auf den **statisch zugeordneten** Ausbilder ([wochenansicht.js:1245-1249](../../../app/js/wochenansicht.js#L1245-L1249)) |
| PDF-Gegenzeichnung | `'Ausbilder/in'` statt Name ([berichtsheft-export.js:263](../../../app/js/berichtsheft-export.js#L263), Auflösung `:610`) |

Der Banner-Fallback ist der gefährliche: er behauptet stillschweigend, eine andere
Person habe abgenommen. Ein Azubi hat regelmäßig mehrere Ausbilder — deshalb
existiert `KorrigiertVon` überhaupt
([009_korrektur_attribution.sql](../../../db/migrations/009_korrektur_attribution.sql)).
Da die IHK die Vorlage des gegengezeichneten Nachweises jederzeit verlangen kann
(§ 76 Abs. 2 BBiG) und das PDF **on demand aus Live-Daten** gebaut wird, träte der
Mangel genau bei der Vorlage auf.

**Die Ausnahme läuft gegenläufig.** `dbo.Zuweisungen` speichert **keine OID,
sondern die E-Mail-Adresse** des Verantwortlichen, und der angezeigte Name wird
**aus der E-Mail abgeleitet**, nicht aus `dbo.Users`:

```js
const dn = (typeof deriveName === 'function') ? deriveName : (e) => e;
verantwName: email ? dn(email) : '',      // api.js:242-247
```

Hier bricht beim Löschen also nichts — die Löschung wäre **wirkungslos**: die
E-Mail-Adresse des gelöschten Prüfers bliebe in jeder Zuweisung stehen, und die App
leitete weiter seinen Namen daraus ab. Eine E-Mail-Adresse ist eindeutiger
personenbezogen als ein Name. Deshalb muss die Zuweisung eine echte Namensspalte
bekommen und die E-Mail beim Löschen geleert werden.

### Nicht betroffen — geprüft

| Spalte | Warum keine Namensspalte nötig |
| --- | --- |
| `Wochen.EingereichtVon` | `einreichen` ist azubi-exklusiv ([zugriff.js:106-108](../../../backend/services/zugriff.js#L106-L108)) → immer der Azubi selbst, die Woche stirbt mit ihm |
| `Beurteilungen.BeurteiltVon`, `.KenntnisnahmeVon`, `.KorrigiertVon` | werden nirgends als Name gerendert; der Beurteilungsbogen zeigt `zuweisung.verantwName` ([beurteilung.js:47](../../../app/js/beurteilung.js#L47), `:210`) |
| `Anhaenge.HochgeladenVon` | wird nur durchgereicht ([api.js:268](../../../app/js/api.js#L268)), nie als Name angezeigt |

Ihre OIDs werden trotzdem genullt — ein dangling GUID ist ein pseudonymer
Personenbezug.

## Kern-Erkenntnis 3: Keine FK-Kaskaden, Referenzen in vier Richtungen

`AzubiOid` / `UserOid` sind fast überall lose `NVARCHAR(36)` ohne Fremdschlüssel auf
`dbo.Users`. Ein `DELETE FROM dbo.Users` kaskadiert nicht — jede Tabelle muss
explizit angefasst werden. Nachrüsten von FKs mit `ON DELETE CASCADE` wurde
verworfen, weil (a) bestehende Waisen das Anlegen verhindern — der Backup-Job
rechnet ausdrücklich mit Wochen ohne Users-Zeile
([berichtsheftBackup.js:164-168](../../../backend/services/berichtsheftBackup.js#L164-L168))
—, (b) SQL Server mehrere Kaskadenpfade auf dieselbe Tabelle beim Anlegen des
Constraints ablehnt (`Users → Wochen → Kommentare` kollidiert mit
`Users → Kommentare`), und (c) Cascade nur löschen kann, nicht anonymisieren —
Phase B wäre damit nicht abbildbar.

Die Personenbindung von `dbo.Benachrichtigungen` läuft über **vier** Spalten. Bei
`erstgenehmigt` entsteht eine Mitteilung mit `UserOid = Ausbilder`,
`FromUserOid = Prüfer`, `WocheId = Woche des Azubis`
([wochen.js:315-322](../../../backend/routes/wochen.js#L315-L322)) — der Azubi steht
in **keiner** Personenspalte. Beurteilungs-Mitteilungen sind systemgeneriert und
haben `FromUserOid = NULL`
([016:26-32](../../../db/migrations/016_benachrichtigungen_beurteilungstypen.sql#L26-L32));
die Verbindung läuft allein über `ZuweisungId`. Eine Bedingung
„`UserOid = @oid OR FromUserOid = @oid`" ließe beide Fälle als Verweise auf
gelöschte Zeilen zurück.

## Architektur

Ein Service plus ein selbst-nachplanender Timer, im Muster der bestehenden
Hintergrund-Jobs ([server.js:212-268](../../../backend/server.js#L212-L268)).

### `backend/services/retention.js`

| Export | Aufgabe | I/O |
| --- | --- | --- |
| `LOESCHFRIST_TAGE = 365`, `VORWARN_TAGE = 30` | Fristen | — |
| `PHASE_A`, `PHASE_B`, `PHASE_C` | geordnete Listen `{ tabelle, art, bedingung }` | — (Datenkonstanten, testbar) |
| `loeschDatum(user, { fristTage })` | `InaktivSeit + Frist` → `Date` | keine (rein) |
| `istFaellig(user, { jetzt, fristTage })` | fällig? inkl. Sperr- und Demo-Prüfung | keine (rein) |
| `istVorwarnFaellig(user, { jetzt, fristTage, vorwarnTage })` | im Vorwarnfenster? | keine (rein) |
| `ermittleKandidaten(deps)` | fällige + vorzuwarnende Konten | DB-Lesen, injiziert |
| `loescheNutzer(user, deps)` | eine Transaktion über alle drei Phasen | DB-Schreiben |
| `raeumeWaisenDateien(deps)` | `ihk-imports`-Ordner ohne Users-Zeile entfernen | Datei-I/O |
| `runRetention(deps)` | vollständiger Lauf, liefert Bericht | orchestriert |

`loescheNutzer` nimmt den **vollständigen Nutzer**, nicht nur die OID — Phase B
braucht `Name` und `Email` der Person, die gerade gelöscht wird.

Abhängigkeiten werden **injiziert**, damit der Job ohne SQL Server und ohne echte
Uhr prüfbar ist:

```js
runRetention({
  listKandidaten,   // async () => [{ oid, name, email, role, inaktivSeit, loeschsperreBis }]
  loescheNutzer,    // async (user) => { tabelle: anzahl }
  sendeVorwarnung,  // async (user, empfaenger[]) => void
  jetzt,            // Date
  fristTage,        // default LOESCHFRIST_TAGE
  vorwarnTage,      // default VORWARN_TAGE
  dir,              // ihk-imports-Verzeichnis (Tests: Temp-Ordner)
  logFehler,        // Fehler-Posteingang
})
```

## Datenmodell

### `030_users_loeschkonzept.sql`

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
  `Aktiv = 1` ist — sonst schiebt jeder Sync-Lauf die Frist nach hinten.
- Übergang inaktiv → aktiv: `InaktivSeit = NULL`. Ein versehentlich entfernter und
  wieder aufgenommener Nutzer startet neu.

### `031_belege_namensspalten.sql`

| Tabelle | Neue Spalte | Ersetzt die Live-Auflösung von |
| --- | --- | --- |
| `Wochen` | `KorrigiertVonName NVARCHAR(200) NULL` | `KorrigiertVon` → Banner, PDF-Gegenzeichnung |
| `Kommentare` | `AutorName NVARCHAR(200) NULL` | `UserOid` → Kommentarliste, Rückweisungsgrund |
| `Zuweisungen` | `VerantwName NVARCHAR(200) NULL` | `VerantwEmail` → Planer, Beurteilungsbogen |

Das Muster ist im Repo nicht neu: `dbo.AbteilungVerantwortliche` führt seit
Migration 012 neben `Oid` bereits einen `Anzeigename`
([012:31-39](../../../db/migrations/012_abteilungen_katalog.sql#L31-L39)), und
`dbo.Beurteilungen.AzubiOid` ist ausdrücklich als „denormalisiert" kommentiert
([015:15](../../../db/migrations/015_beurteilungen.sql#L15)).

**Kein Backfill nötig — und das ist Absicht.** Der Löschjob kennt die
`dbo.Users`-Zeile in dem Moment, in dem er sie löscht, und schreibt den Namen in
Phase B genau in die betroffenen Belegzeilen, bevor er die Referenz nullt. Ein
Massen-`UPDATE` über alle historischen Wochen und Kommentare wäre also nicht nur
unnötig, sondern unnötiges Risiko. Bestehende Waisen (Zeilen, deren Person längst
ohne diesen Job verschwunden ist) zeigen heute schon keinen Namen; daran ändert
sich nichts.

**Leseregel:** gespeicherter Name hat Vorrang, `NULL` fällt auf die heutige
Live-Auflösung zurück. Das ist zugleich fachlich richtig — bei einer
Namensänderung (Heirat) trägt der Beleg den Namen zum Zeitpunkt der Handlung, was
für ein Nachweisdokument die korrekte Semantik ist.

**Schreibpfade**, die den Namen ab sofort mitschreiben:

| Stelle | Spalte |
| --- | --- |
| `PATCH /wochen/:id/status` bei `korrektur: true` ([wochen.js:297-299](../../../backend/routes/wochen.js#L297-L299)) | `KorrigiertVonName` |
| `POST /kommentare` ([kommentare.js](../../../backend/routes/kommentare.js)) | `AutorName` |
| `POST /zuweisungen` ([zuweisungen.js:140-143](../../../backend/routes/zuweisungen.js#L140-L143)) | `VerantwName` aus dem E-Mail-JOIN, sonst `NULL` |

Dazu die Normalizer in [api.js](../../../app/js/api.js) (`normalizeWoche`,
`normalizeKommentar`, `normalizeZuweisung`) und die drei Leseseiten.

> **Formatkopplung beachten:** `normalizeWoche`/`normalizeKommentar` sind im
> Backend für die Backup-Snapshots gespiegelt
> ([berichtsheftBackup.js:8-21](../../../backend/services/berichtsheftBackup.js#L8-L21)).
> Neue Felder müssen dort **und** in der hartkodierten Key-Liste von
> `berichtsheftBackup.test.js` nachgezogen werden — der Test wird sonst grün
> bleiben, obwohl die Kopplung gebrochen ist.

### `032_benachrichtigungen_loeschtyp.sql`

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

1. **Kandidaten ermitteln.** Konten mit `Aktiv = 0`, `InaktivSeit IS NOT NULL`,
   `(Email IS NULL OR Email NOT LIKE '%.demo%')`. Keine Rollenbedingung.
   Die Demo-Ausnahme wird anschließend in `istFaellig` **erneut** geprüft — die
   SQL-Bedingung hält die Liste klein, die reine Funktion ist die per Test
   festgenagelte Stelle und die einzige, die auch gilt, wenn jemand die Abfrage
   später umbaut.
2. **Vorwarnen.** Restlaufzeit ≤ 30 Tage → Mitteilung `loeschung_geplant` an alle
   aktiven Nutzer mit `KannPlanen = 1` sowie Rolle `developer`. Idempotent: nur
   senden, wenn für dieses Konto noch keine Mitteilung dieses Typs existiert —
   sonst 30 Nächte hintereinander dieselbe Meldung.
3. **Löschen.** `InaktivSeit <= jetzt − 365` und keine greifende `LoeschsperreBis`
   → `loescheNutzer(user)`, eine Transaktion über die Phasen A, B, C.
4. **Dateien aufräumen.** Nach dem Commit, zustandslos (siehe unten).
5. **Protokollieren.** Bericht in die Konsole; Fehler zusätzlich in den
   Fehler-Posteingang.

## Phase A — eigene Daten, hart löschen

Kinder vor Eltern. `@wochen` steht für
`SELECT Id FROM dbo.Wochen WHERE AzubiOid = @oid`, `@zuw` für
`SELECT Id FROM dbo.Zuweisungen WHERE AzubiOid = @oid`.

| # | Tabelle | Bedingung | Grund für die Position |
| --- | --- | --- | --- |
| 1 | `Benachrichtigungen` | `UserOid = @oid OR FromUserOid = @oid OR WocheId IN (@wochen) OR ZuweisungId IN (@zuw)` | verweist auf `Wochen` **und** `Zuweisungen`; vier Zweige nötig (Kern-Erkenntnis 3) |
| 2 | `Kommentare` | `WocheId IN (@wochen)` | `FK_Kommentare_Tage` ohne Cascade ([002:11](../../../db/migrations/002_tagekommentare.sql#L11)) → **vor** `Tage` |
| 3 | `Tage` | `WocheId IN (@wochen)` | |
| 4 | `Wochen` | `AzubiOid = @oid` | `Anhaenge` folgen per `ON DELETE CASCADE` ([004:21-22](../../../db/migrations/004_anhaenge.sql#L21-L22)) |
| 5 | `Beurteilungen` | `AzubiOid = @oid` | `BeurteilungKriterien` per Cascade ([015:45-46](../../../db/migrations/015_beurteilungen.sql#L45-L46)); **vor** `Zuweisungen` wegen `ZuweisungId` |
| 6 | `Zuweisungen` | `AzubiOid = @oid` | |
| 7 | `FahrtgeldKonfig` | `AzubiOid = @oid` | |

Schritt 1 löscht auch Mitteilungen **anderer** Personen, wenn sie sich auf eine
Woche oder Zuweisung des Gelöschten beziehen. Das ist gewollt: die referenzierte
Woche existiert danach nicht mehr, die Mitteilung wäre ein toter Link.

## Phase B — Handlungen an fremden Daten, anonymisieren

`@name` ist `Users.Name` der Person, die gerade gelöscht wird, `@email` ihre
E-Mail. Alle Anweisungen sind `UPDATE`, kein `DELETE`.

| Tabelle | Anweisung |
| --- | --- |
| `Wochen` | `SET KorrigiertVonName = COALESCE(KorrigiertVonName, @name), KorrigiertVon = NULL WHERE KorrigiertVon = @oid` |
| `Kommentare` | `SET AutorName = COALESCE(AutorName, @name), UserOid = NULL WHERE UserOid = @oid` |
| `Zuweisungen` | `SET VerantwName = COALESCE(VerantwName, @name), VerantwEmail = '' WHERE LOWER(VerantwEmail) = LOWER(@email)` |
| `Beurteilungen` | `SET BeurteiltVon = NULL WHERE BeurteiltVon = @oid` — analog `KenntnisnahmeVon`, `KorrigiertVon` |
| `Anhaenge` | `SET HochgeladenVon = NULL WHERE HochgeladenVon = @oid` |
| `Benachrichtigungen` | `SET FromUserOid = NULL WHERE FromUserOid = @oid` |

Das `COALESCE` ist nötig, damit ein bereits vom Schreibpfad gefüllter Name nicht
überschrieben wird — der gespeicherte Name ist der zum Zeitpunkt der Handlung, der
aktuelle `Users.Name` könnte inzwischen abweichen.

`Benachrichtigungen.FromUserOid` wird hier **genullt statt gelöscht** — die Zeile
gehört dem Empfänger. Ein Azubi soll seine Mitteilung „Woche genehmigt" nicht
verlieren, nur weil der Prüfer das Unternehmen verlassen hat.

Die geleerte `VerantwEmail` hat eine gewollte Nebenwirkung: der befristete
Lesezugriff des Verantwortlichen hängt an dieser E-Mail
([zugriff.js:37-47](../../../backend/services/zugriff.js#L37-L47)). Nach dem
Löschen kann sich die Person ohnehin nicht mehr anmelden, aber die Zuweisung darf
auch keinem *neuen* Träger derselben Adresse Zugriff geben.

## Phase C — Konto und Verkehrsdaten, hart löschen

| # | Tabelle | Bedingung |
| --- | --- | --- |
| 1 | `AusbilderAzubis` | `AzubiOid = @oid OR AusbilderOid = @oid` |
| 2 | `AbteilungVerantwortliche` | `Oid = @oid OR LOWER(Email) = LOWER(@email)` — die Tabelle bindet über **beide** ([012:31-39](../../../db/migrations/012_abteilungen_katalog.sql#L31-L39)); `Anzeigename` geht mit der Zeile |
| 3 | `Vertretungen` | `VertretenerOid = @oid OR VertreterOid = @oid` |
| 4 | `McpLog` | `UserOid = @oid` |
| 5 | `ApiKeys` | `UserOid = @oid` |
| 6 | `Users` | `Oid = @oid` — `UserPhotos` folgt per Cascade ([023:20](../../../db/migrations/023_user_photos_tabelle.sql#L20)) |

**Nicht angefasst:** `Fehlerberichte` / `FehlerAnhaenge` — eigene 90-Tage-Rotation
([fehlerberichte.js](../../../backend/services/fehlerberichte.js)), nach 365 Tagen
Inaktivität längst verfallen.

**Umsetzungs-Voraussetzung:** Die Basistabellen `Wochen`, `Tage`, `Kommentare`,
`Zuweisungen`, `Benachrichtigungen` stammen aus der Zeit vor der
Migrationsnummerierung; ihre Fremdschlüssel liegen **nicht** im Repo. Vor der
Implementierung ist die tatsächliche Constraint-Lage gegen die Dev-Datenbank zu
erheben (`sys.foreign_keys` / `sys.foreign_key_columns`) und die Reihenfolge daran
zu spiegeln. Die Tabellen oben sind die sichere Annahme, kein verifizierter Stand.

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

Die Tabellenlisten im Code können veralten, sobald jemand eine neue Tabelle mit
Personenbezug anlegt. Der Job fragt deshalb `INFORMATION_SCHEMA.COLUMNS` nach
Spalten, die auf `Oid` enden oder `Email` heißen, und vergleicht die Trefferliste
gegen die in `PHASE_A`/`PHASE_B`/`PHASE_C` bekannten Tabellen. Unbekannter Treffer
→ Fehlerbericht mit Schweregrad `hoch`, der Lauf läuft weiter. Das ersetzt die
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
{ kandidaten, vorgewarnt, geloescht, gesperrt, anonymisiert, dateienEntfernt,
  fehler: [{ oid, name, fehler }] }
```

Fehler gehen in Konsole **und** Fehler-Posteingang. Ein Lauf, der die
Kandidatenliste nicht laden kann, löscht **nichts** — fail closed, wie der
Entra-Sync bei Token-/Gruppenfehlern
([entraSync.js:189-193](../../../backend/services/entraSync.js#L189-L193)).

Phasen A, B und C laufen in **einer** Transaktion pro Person. Ein Abbruch zwischen
A und B wäre der schlimmste Zustand: Heft gelöscht, Konto und Belege noch da.

## Testplan

`backend/services/retention.test.js`, `node --test`, ohne SQL Server:

| Test | Nagelt fest |
| --- | --- |
| `istFaellig` mit injiziertem `jetzt` | Grenze bei genau 365 Tagen; 364 Tage → nicht fällig |
| `istFaellig` mit `LoeschsperreBis` in der Zukunft | Sperre greift; abgelaufene Sperre greift nicht; Frist läuft dabei nicht neu |
| `istFaellig` mit `.demo`-Adresse | nie fällig, auch nach Jahren |
| `istFaellig` mit `InaktivSeit = NULL` | nie fällig (Altbestand ohne Stempel) |
| `istFaellig` für jede Rolle | fällig unabhängig von der Rolle (keine Ausnahmeliste) |
| `istVorwarnFaellig` | greift im 30-Tage-Fenster, nicht davor, nicht nach Löschung |
| `PHASE_A` | `Benachrichtigungen` zuerst; `Kommentare` vor `Tage`; `Beurteilungen` vor `Zuweisungen` |
| Bedingung für `Benachrichtigungen` | enthält alle vier Zweige (`UserOid`, `FromUserOid`, `WocheId`, `ZuweisungId`) |
| `PHASE_B` | ausschließlich `UPDATE`, kein `DELETE`; jede Anweisung mit `COALESCE` auf der Namensspalte |
| `PHASE_C` | `Users` zuletzt |
| `loescheNutzer` mit Person ohne Berichtsheft | Phase A löscht 0 Zeilen, Phasen B und C laufen trotzdem |
| `raeumeWaisenDateien` im Temp-Ordner | löscht Ordner ohne Users-Zeile, lässt Ordner mit Users-Zeile stehen, ignoriert Nicht-GUID-Namen |
| `raeumeWaisenDateien` mit fehlschlagendem `rm` | sammelt den Fehler, räumt die übrigen Ordner trotzdem |
| `runRetention` mit einem werfenden `loescheNutzer` | Rest wird abgearbeitet, Fehler steht im Bericht |
| `runRetention` mit werfendem `listKandidaten` | löscht nichts (fail closed) |

Zusätzlich in `users.test.js`: `setUsersAktiv` stempelt `InaktivSeit` nur beim
Übergang und leert es beim Reaktivieren.

**Manuelle Abnahme** auf dem Dev-Server:

1. Ein Demo-Azubi (`.demo`-Adresse) taucht nie als Kandidat auf.
2. Testkonto mit künstlich gesetztem `InaktivSeit` wird vorgewarnt, per Sperre
   zurückgehalten, nach Entfernen der Sperre gelöscht. Danach prüfen, dass Wochen,
   Beurteilungen, Mitteilungen, Foto und der `ihk-imports`-Ordner weg sind.
3. **Der entscheidende Test:** einen Prüfer löschen, der Wochen eines *noch
   aktiven* Azubis genehmigt hat. Erwartet: Status-Banner und PDF-Gegenzeichnung
   zeigen weiter seinen Namen, der Ansprechpartner in der Zuweisung ebenso, aber
   Avatar-Foto und E-Mail sind verschwunden.

## Dokumentation

- [docs/funktionsweise.md](../../funktionsweise.md): Abschnitt 11 („Was passiert,
  wenn ein Azubi ausgelernt ist?", Zeile 367-375) und Abschnitt 12 („Kein
  Lösch-/Archivkonzept", Zeile 429-430) sind nach der Umsetzung **falsch** und
  müssen die neue Frist beschreiben.
- [README.md](../../../README.md): Hintergrund-Jobs um den Retention-Job ergänzen.
- Der Audit-Gap G-20 wird damit weitgehend geschlossen; G-21 (Datenschutzseite in
  der App) bleibt offen und braucht die Frist als Inhalt.

## Bewusst verschoben

| Thema | Warum später |
| --- | --- |
| Nachlauf-Fenster für Ex-Azubis (Lese-/Exportzugriff nach Deaktivierung) | Eigener Teil von Audit-Gap G-20, unabhängig vom Löschen |
| Datenschutz-Informationsseite (G-21) | Organisatorisch, braucht diese Spec als Input |
| Zwangs-Export beim Offboarding | Prozess, kein Code — die Herausgabe des Nachweises ist bewusst organisatorisch gelöst |
| Kohorten-Export für Ausbilder (Stub in `berichtsheftverwaltung.js:148-150`) | Eigener Audit-Befund, berührt das Löschkonzept nur indirekt |
