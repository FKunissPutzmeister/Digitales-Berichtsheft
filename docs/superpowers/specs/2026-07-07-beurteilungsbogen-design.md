# Beurteilungsbogen für Abteilungsdurchläufe — Design

**Datum:** 2026-07-07
**Repo/Branch:** FKunissPutzmeister/Digitales-Berichtsheft · `Digitales-Berichtsheft`
**Status:** Entwurf zur Review

---

## 1. Kontext & Ziel

Für Abteilungsdurchläufe (Rotationen) füllen die Verantwortlichen nach Ende eines
Durchlaufs einen **Beurteilungsbogen** aus (Papiervorlage „Beurteilungsbogen für
Auszubildende und DH-Studenten"). Diese Beurteilung wird ins digitale Berichtsheft
integriert:

- Verantwortliche/-r füllt den Bogen auf einer eigenen Seite aus 
- Azubi bzw. DH-Student sieht die fertige Beurteilung über die **Kachel des
  Zeitraums** im Reiter „Abteilungsdurchlauf".
- Automatische **Notenberechnung** nach IHK-Notenschlüssel.
- **Kriterienkatalog** einsehbar.
- **PDF-Export** des Bogens.
- **Mitteilungen**: Azubi wird bei abgeschlossener Beurteilung informiert;
  Verantwortliche/-r wird informiert, wenn eine Beurteilung fällig ist.

Das Feature ist **greenfield** — es gibt heute keinerlei Beurteilungs-/Bewertungs-Code
im Repo.

### Technischer Rahmen (Ist-Zustand, relevant)

- **Stack:** Express 5 + MSSQL (`Berichtsheft_Dev`), file-basierte Sessions, statisches
  Multi-Page-SPA-Frontend unter `app/`. Router: `app/js/router.js` (tauscht
  `#mainContent`, echte Navigation bei Standalone-Seiten).
- **Migrationen:** `db/migrations/NNN_*.sql`, **handapplizert, idempotent, kein Runner**.
  Höchste ist `014` (007 fehlt) → nächste ist **`015`**.
- **Anker-Datensatz „Kachel":** eine `Zuweisung` (Rotation) mit
  `Id, AzubiOid, VerantwEmail, Abteilung, Von, Bis`. Azubi per **OID**,
  Verantwortliche/-r per **E-Mail** (`VerantwEmail`, lowercased).
- **Berichte:** `Wochen` (+ `Tage`, `Kommentare`) je Azubi; kein serverseitiges
  Datumsbereich-Query → Frontend filtert per `von/bis`.
- **Mitteilungen:** `Benachrichtigungen` (heute Woche-gekoppelt, Typen nur
  `genehmigt`/`abgelehnt`); Bell-Dropdown in `app/js/app.js` (`initNotifications`).
- **PDF:** rein clientseitig. Muster „Print-HTML → `window.print()`" in
  `app/js/berichtsheft-export.js` (nicht pdf-lib).

---

## 2. Getroffene Entscheidungen

| Aspekt | Entscheidung |
|---|---|
| Anker | 1 Beurteilung ↔ 1 `Zuweisung` (UNIQUE) |
| Eingabe je Kriterium | **Stufe 1–6 markieren + exakte Punkte (0–100)**, bidirektional gekoppelt |
| Speicherung je Kriterium | nur `Punkte`; Stufe wird abgeleitet |
| Note | **automatisch**; kaufmännische Rundung von `Gesamt` für den Tabellen-Lookup |
| Fälligkeit | zum **Ende** des Durchlaufs (`Bis < heute`, keine abgeschlossene Beurteilung); Prüfung beim App-Load (kein Cron) |
| Status | **`entwurf` → `abgeschlossen`**; Abschließen macht sie für Azubi sichtbar + benachrichtigt ihn; danach korrigierbar (mit Attribution + erneuter Info) |
| Kenntnisnahme | Azubi bestätigt digital + `GespraechAm`-Datum; PDF zeigt beides + Unterschriftszeilen |
| Rück-Info bei Kenntnisnahme | **nein** (kein zusätzlicher Mitteilungstyp) |
| Ort | **eine eigenständige Seite** `beurteilung.html?zuw=<id>` für alle Rollen (ohne Sidebar); rollenabhängig editierbar/read-only; DH-Student in eigener Optik |
| Einstieg | Kachel-Klick (in beiden Durchlauf-Shells) + Mitteilungs-Deeplink; **kein** neuer Sidebar-Nav-Link |

---

## 3. Datenmodell — Migration `db/migrations/015_beurteilungen.sql`

Idempotent (`IF OBJECT_ID(...) IS NULL`, `IF COL_LENGTH(...) IS NULL`), **manuell**
gegen `Berichtsheft_Dev` auszuführen. FKs auf `Zuweisungen(Id)`/`Users`-OIDs defensiv
(beide Basistabellen haben kein committetes CREATE — siehe `create-abteilungen-table.sql`).

### 3.1 `Beurteilungen` (1 Zeile je Zuweisung)

| Spalte | Typ | Anm. |
|---|---|---|
| `Id` | `INT IDENTITY(1,1)` PK | |
| `ZuweisungId` | `INT NOT NULL` | FK→`Zuweisungen(Id)`; **UNIQUE** |
| `AzubiOid` | `NVARCHAR(36) NOT NULL` | denormalisiert (Azubi-Query, Mitteilung) |
| `Status` | `NVARCHAR(20) NOT NULL DEFAULT 'entwurf'` | CHECK `('entwurf','abgeschlossen')` |
| `IndividuelleBeurteilung` | `NVARCHAR(MAX) NULL` | Freitext |
| `GesamtPunkte` | `DECIMAL(5,2) NULL` | berechnet, Snapshot |
| `Note` | `DECIMAL(2,1) NULL` | berechnet, Snapshot (z.B. 2.3) |
| `GespraechAm` | `DATE NULL` | „Gespräch geführt am" |
| `BeurteiltVon` | `NVARCHAR(36) NULL` | OID des/der Abschließenden |
| `AbgeschlossenAm` | `DATETIME2 NULL` | |
| `KenntnisnahmeVon` | `NVARCHAR(36) NULL` | Azubi-OID |
| `KenntnisnahmeAm` | `DATETIME2 NULL` | |
| `KorrigiertVon` | `NVARCHAR(36) NULL` | Änderung nach Abschluss |
| `KorrigiertAm` | `DATETIME2 NULL` | |
| `ErstelltAm` | `DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()` | |
| `AktualisiertAm` | `DATETIME2 NULL` | |

### 3.2 `BeurteilungKriterien` (10 Zeilen je Beurteilung)

| Spalte | Typ | Anm. |
|---|---|---|
| `Id` | `INT IDENTITY(1,1)` PK | |
| `BeurteilungId` | `INT NOT NULL` | FK→`Beurteilungen(Id)` **ON DELETE CASCADE** |
| `KriteriumKey` | `NVARCHAR(40) NOT NULL` | stabiler Schlüssel (siehe 4.4) |
| `Punkte` | `TINYINT NOT NULL` | 0–100 (Stufe abgeleitet) |
| | | **UNIQUE(`BeurteilungId`,`KriteriumKey`)** |

### 3.3 `Benachrichtigungen` erweitern

- `+ ZuweisungId INT NULL` (FK→`Zuweisungen(Id)`) — Referenz für Beurteilungs-Mitteilungen
  (die „fällig"-Mitteilung entsteht, **bevor** eine `Beurteilungen`-Zeile existiert, daher
  Zuweisung statt Beurteilung als Referenz). Deep-Link-Ziel: `beurteilung.html?zuw=<ZuweisungId>`.
- **`Typ` von `NVARCHAR(20)` → `NVARCHAR(40)`** verbreitern (der Wert
  `beurteilung_abgeschlossen` hat 24 Zeichen). `Typ` hat keinen CHECK-Constraint → unkritisch.

---

## 4. Berechnungslogik

### 4.1 Stufen-Bänder (Punkte → Stufe, IHK-Umrechnungsschlüssel)

| Stufe | Punkte | verbal |
|---|---|---|
| 1 | 100–92 | sehr gut |
| 2 | 91–81 | gut |
| 3 | 80–67 | befriedigend |
| 4 | 66–50 | ausreichend |
| 5 | 49–30 | mangelhaft |
| 6 | 29–0 | ungenügend |

Bidirektionale Kopplung in der UI: Klick auf eine Stufe setzt den erlaubten Punktebereich;
Eingabe der Punkte markiert automatisch die passende Stufe. Gespeichert wird nur `Punkte`.

### 4.2 Rechenkette (Fußbereich des Bogens)

```
Block-Ø   = Σ Punkte(Block) ÷ Kriterienzahl     (A÷3, B÷3, C÷4)
Summe     = ØA + ØB + ØC                          (0..300)
Gesamt    = Summe ÷ 3                              (0..100)
Note      = Punktetabelle[ Math.round(Gesamt) ]   (kaufmännisch)
```

Die drei Kompetenzblöcke werden **gleich gewichtet** (je ⅓), unabhängig von der
Kriterienzahl. Anzeige: Block-Ø, Summe, Gesamt je 1 Nachkommastelle; Note als `X,Y`.
Live-Neuberechnung bei jeder Eingabe; `GesamtPunkte` und `Note` werden bei jedem
Speichern als Snapshot mitgeschrieben.

### 4.3 Punkte → Note (vollständige Tabelle, aus der gelieferten Excel/PDF)

```
100→1,0  99→1,1  98→1,1  97→1,2  96→1,2  95→1,3  94→1,3  93→1,4  92→1,4  91→1,5
 90→1,6  89→1,7  88→1,8  87→1,9  86→2,0  85→2,0  84→2,1  83→2,2  82→2,3  81→2,4
 80→2,5  79→2,6  78→2,7  77→2,7  76→2,8  75→2,9  74→2,9  73→3,0  72→3,1  71→3,1
 70→3,2  69→3,3  68→3,3  67→3,4  66→3,5  65→3,6  64→3,6  63→3,7  62→3,7  61→3,8
 60→3,9  59→3,9  58→4,0  57→4,0  56→4,1  55→4,1  54→4,2  53→4,3  52→4,3  51→4,4
 50→4,4  49→4,5  48→4,6  47→4,6  46→4,7  45→4,7  44→4,8  43→4,8  42→4,9  41→4,9
 40→5,0  39→5,0  38→5,0  37→5,1  36→5,1  35→5,2  34→5,2  33→5,3  32→5,3  31→5,4
 30→5,4  29→5,5  28→5,6  27→5,6  26→5,6  25→5,6  24→5,6  23→5,6  22→5,7  21→5,7
 20→5,7  19→5,7  18→5,7  17→5,7  16→5,8  15→5,8  14→5,8  13→5,8  12→5,8  11→5,9
 10→5,9   9→5,9   8→5,9   7→5,9   6→5,9   5→6,0   4→6,0   3→6,0   2→6,0   1→6,0   0→6,0
```

Wird als Lookup-Konstante in `beurteilung-core.js` hinterlegt (Index = Punkte 0..100).

### 4.4 Kriterienkatalog (Konstante `KRITERIEN` — Referenztexte)

Reihenfolge = Reihenfolge im Bogen. `block` ∈ {A,B,C}. Jede Stufe 1–6 mit Erläuterung
(Quelle: Kriterienkatalog-PDF). Diese Texte speisen das Katalog-Modal und (optional) Tooltips.

**A — Persönliche Kompetenz**

- `auffassungsgabe` — **Auffassungsgabe** — *Sicherheit und Schnelligkeit beim Erfassen von Lerninhalten und -situationen, im Begreifen von Zusammenhängen*
  1. Auch schwierige Sachverhalte werden schnell begriffen, Zusammenhänge klar erkannt, Einzeldaten gewichtet und zugeordnet.
  2. Schnelle Auffassungsgabe. Der Kern einer Sache wird rasch begriffen. Ist in der Lage, Wesentliches vom Unwesentlichen zu unterscheiden.
  3. Inhalt und Bedeutung eines Sachverhalts werden erfasst. Das Begriffene wird sachlich richtig eingeordnet.
  4. Anleitungen bzw. wiederholte Erklärungen sind notwendig, damit Lerninhalte und -situationen verstanden werden.
  5. Lerninhalte und -situationen werden selbst nach eingehender, wiederholter Erklärung nur unvollkommen verstanden.
  6. Lerninhalte und -situationen werden selbst nach eingehender, wiederholter Erklärung nicht verstanden.
- `transfervermoegen` — **Transfervermögen** — *Umsetzung vorhandener Erkenntnisse auf ähnliche Problemstellungen*
  1. Sichere und richtige Übertragung gewonnener Erkenntnisse.
  2. Gewonnene Erkenntnisse werden übertragen.
  3. Gewonnene Erkenntnisse werden meist übertragen.
  4. Kann gewonnene Erkenntnisse nur vereinzelt übertragen.
  5. Gewonnene Erkenntnisse werden kaum übertragen.
  6. Gewonnene Erkenntnisse können nicht übertragen werden.
- `ausdauer` — **Ausdauer** — *Beharrlichkeit und Beständigkeit bei der Erledigung der gestellten Aufgaben und bei der Erreichung der Ausbildungsziele*
  1. Ist außerordentlich ausdauernd auch unter erschwerten Bedingungen.
  2. Ist ausdauernd. Gelegentliche Schwierigkeiten werden überwunden.
  3. Ist im Allgemeinen beharrlich und beständig.
  4. Ist unterschiedlich ausdauernd. Schwierigkeiten werden nur mühsam überwunden.
  5. Weniger beharrlich und beständig. Gibt bei Schwierigkeiten schnell auf.
  6. Ausdauer ist nicht vorhanden. Gibt auch bei allgemeinen Aufgaben schnell auf.

**B — Soziale Kompetenz**

- `zusammenarbeit` — **Zusammenarbeit** — *Verhalten im Kontakt mit Kollegen und Vorgesetzten. Fähigkeit zur Zusammenarbeit. Hilfsbereitschaft für andere und deren Unterstützung beim Lernen und Arbeiten*
  1. Zeigt besonderes Einfühlungsvermögen im Umgang mit anderen. Gute Zusammenarbeit und Hilfsbereitschaft. Aufgeschlossen und fair.
  2. Besitzt gutes Einfühlungsvermögen im Umgang mit anderen. Ist hilfsbereit und fähig zu guter Zusammenarbeit.
  3. Zeigt in der Regel Einfühlungsvermögen im Umgang mit anderen. Hat den Willen zur Hilfsbereitschaft und Zusammenarbeit.
  4. Zeigt Unsicherheiten im Umgang mit anderen, wodurch eine problemlose Zusammenarbeit erschwert wird. Arbeitet, von Ausnahmen abgesehen, in der Gruppe mit.
  5. Zeigt ungenügendes Einfühlungsvermögen im Umgang mit anderen. Kein ausgeprägtes Gefühl für Zusammenarbeit. Arbeitet lieber allein.
  6. Zeigt kein Einfühlungsvermögen im Umgang mit anderen. Kein Gefühl für Zusammenarbeit. Arbeitet nur allein.
- `interesse_initiative` — **Interesse / Initiative** — *Interesse an der Aufgabe und Initiative, Gelerntes und eigene Fähigkeiten effektiv in der Praxis einzusetzen*
  1. Zeigt außergewöhnliches Interesse. Besonders ausgeprägte Initiative. Scheut auch vor schwierigen Aufgaben nicht zurück. Sehr zielstrebig.
  2. Zeigt Interesse und Initiative. Beteiligt sich an der Lösung auch schwieriger Aufgaben.
  3. Ist interessiert und aufgeschlossen. Setzt seine Fähigkeiten effektiv ein. Braucht nur selten Anregungen bei schwierigen Aufgaben.
  4. Zeigt nicht immer Interesse und Initiative. Bedarf der Anregungen.
  5. Zeigt kaum Interesse und Initiative. Meidet schwierige Aufgaben. Bedarf ständiger Anregungen.
  6. Zeigt keinerlei Interesse und Initiative.
- `zuverlaessigkeit` — **Zuverlässigkeit** — *Bereitschaft, Vorschriften (beispielsweise zur Arbeitssicherheit), Anweisungen und Termine gewissenhaft einzuhalten und Verantwortung zu übernehmen*
  1. Ist sehr zuverlässig und verantwortungsbewusst in der Erledigung der gestellten Aufgaben und insbesondere bei der Einhaltung von Vorschriften, Anweisungen und Terminen.
  2. Ist zuverlässig und verantwortungsbewusst in der Erledigung gestellter Aufgaben. Vorschriften, Anweisungen und Termine werden eingehalten.
  3. Übertragene Aufgaben werden im Allgemeinen zuverlässig durchgeführt. In der Regel werden Vorschriften, Anweisungen und Termine eingehalten.
  4. Zuverlässigkeit lässt zu wünschen übrig. Vorschriften und Anweisungen werden oft nicht ausreichend beachtet. Es gibt Schwierigkeiten bei der Einhaltung von Terminen.
  5. Vorschriften und Anweisungen werden nur ungenügend beachtet. Ist nicht zuverlässig bei der Einhaltung von Terminen.
  6. Vorschriften und Anweisungen werden nicht beachtet. Hält Termine nicht ein.

**C — Fachkompetenz**

- `fertigkeiten` — **Fertigkeiten** — *Verfügen über die für den Ausbildungsprozess bzw. Ausbildungsabschnitt geforderten Fertigkeiten*
  1. Verfügt über einen sehr hohen Fertigkeitsgrad. Führt die übertragenen Tätigkeiten mit großer Geschicklichkeit durch.
  2. Verfügt über einen hohen Fertigkeitsgrad. Arbeitet sicher und geschickt.
  3. Die Fertigkeiten ermöglichen eine zufriedenstellende Arbeitsausführung. Ist selten unsicher.
  4. Der erforderliche Fertigkeitsgrad wird nicht immer erreicht. Die Arbeitsausführung wird dadurch erschwert.
  5. Kann die Anforderungen an Fertigkeiten kaum erfüllen. Ist bei vielen Tätigkeiten unsicher und ungeschickt.
  6. Kann die Anforderungen an Fertigkeiten nicht erfüllen. Ist bei allen Tätigkeiten unsicher und ungeschickt.
- `kenntnisse` — **Kenntnisse** — *Verfügen über die für den Ausbildungsprozess bzw. Ausbildungsabschnitt geforderten Kenntnisse*
  1. Verfügt über besonders umfangreiche Fachkenntnisse und erkennt sicher Zusammenhänge.
  2. Verfügt über umfangreiche Fachkenntnisse. Kann Zusammenhänge herstellen.
  3. Besitzt die erforderlichen Fachkenntnisse, um die übertragenen Aufgaben zufriedenstellend ausführen zu können.
  4. Die erforderlichen Fachkenntnisse sind nicht immer vorhanden. Fehlendes Wissen erschwert den Arbeitsablauf und damit auch den Ausbildungsablauf.
  5. Verfügt kaum über die erforderlichen Fachkenntnisse. Ist häufig auf Erklärungen, Hilfen und Ratschläge angewiesen.
  6. Erforderliche Fachkenntnisse sind nicht vorhanden. Ist ständig auf Erklärungen, Hilfe und Ratschläge angewiesen.
- `sorgfalt` — **Sorgfalt** — *Fähigkeiten, die im jeweiligen durchzuführenden Aufgaben planmäßig und sorgfältig, den Qualitätsanforderungen entsprechend auszuführen*
  1. Arbeitet stets planvoll und mit großer Sorgfalt. Arbeitsergebnisse liegen immer im Bereich der Qualitätsanforderungen.
  2. Arbeitet planvoll. Ist sorgfältig in der Arbeitsausführung. Arbeitsergebnisse liegen nur selten außerhalb der gestellten Qualitätsanforderungen.
  3. Es wird im Allgemeinen planvoll und sorgfältig gearbeitet. Arbeitsergebnisse liegen zum größten Teil im Bereich der Qualitätsanforderungen.
  4. Planmäßigkeit und Sorgfalt bei der Arbeitsausführung lassen zu wünschen übrig. Arbeitsergebnisse entsprechen häufig nicht den gestellten Qualitätsanforderungen.
  5. Übertragene Aufgaben werden nicht planvoll und sorgfältig durchgeführt. Erreicht kein ausreichendes Arbeitsergebnis.
  6. Übertragene Aufgaben werden nachlässig und unvollständig durchgeführt. Erzielt nur ungenügende Arbeitsergebnisse.
- `lerntempo` — **Lerntempo / Zeitaufwand** — *Zeit, die – unter Berücksichtigung des Ausbildungsstandes – für den Erwerb von Fertigkeiten und Kenntnissen bzw. zur Erledigung gestellter Aufgaben benötigt wird*
  1. Fertigkeiten werden besonders rasch beherrscht. Das Lerntempo ist außerordentlich hoch. Gestellte Aufgaben werden immer schneller erledigt, als der Ausbildungsstand erwarten lässt.
  2. Fertigkeiten werden rasch beherrscht. Das Lerntempo ist hoch. Gestellte Aufgaben werden häufig schneller erledigt, als der Ausbildungsstand erwarten lässt.
  3. Fertigkeiten werden nach Übung beherrscht. Das Lerntempo ist ausreichend. Gestellte Aufgaben werden in einer dem Ausbildungsstand angemessenen Zeit bewältigt.
  4. Fertigkeiten werden meist erst nach längerer Übung beherrscht. Das Lerntempo ist nicht immer ausreichend. Benötigt für die gestellten Aufgaben meist mehr Zeit als vorgesehen.
  5. Fertigkeiten werden auch nach längerer Übung kaum beherrscht. Das Lerntempo ist gering. Kommt bei der Ausführung gestellter Aufgaben mit der vorhergesehenen Zeit nicht aus.
  6. Fertigkeiten werden auch nach längerer Übung nicht beherrscht. Das Lerntempo ist sehr gering. Die für die Aufgabe übliche Bearbeitungszeit wird stets überschritten.

---

## 5. Backend

### 5.1 Route `backend/routes/beurteilungen.js` (gemountet in `server.js` mit `devAuth`)

`app.use('/api/beurteilungen', devAuth, beurteilungenRouter)`

| Methode & Pfad | Berechtigung | Zweck |
|---|---|---|
| `GET /api/beurteilungen?zuweisungId=` | Verantw. / Azubi(owner) / dev | eine Beurteilung + Kriterien; Azubi nur wenn `abgeschlossen`, sonst 404/leer |
| `GET /api/beurteilungen?azubiOid=` | Azubi(owner) / Verantw. / dev | Liste (Status je Zuweisung) für Kachel-Badges; Azubi nur `abgeschlossen` |
| `GET /api/beurteilungen/faellig` | jede/-r | für aktuellen User: beendete Durchläufe ohne abgeschlossene Beurteilung; legt fehlende `beurteilung_faellig`-Mitteilungen idempotent an |
| `POST /api/beurteilungen` | Verantwortliche | Entwurf upsert (Body: `zuweisungId, kriterien[], individuelleBeurteilung, gespraechAm`); rechnet & speichert `GesamtPunkte`/`Note`; Status bleibt `entwurf` |
| `PATCH /api/beurteilungen/:id/abschliessen` | Verantwortliche | verlangt alle 10 Kriterien; → `abgeschlossen`, `AbgeschlossenAm`, `BeurteiltVon`; **erzeugt `beurteilung_abgeschlossen` für den Azubi (serverseitig)** |
| `PATCH /api/beurteilungen/:id` | Verantwortliche | Korrektur nach Abschluss; `KorrigiertVon/Am`; erneute Azubi-Info |
| `PATCH /api/beurteilungen/:id/kenntnisnahme` | **nur Azubi(owner)** | `KenntnisnahmeVon/Am` setzen |

Service-Logik in `backend/services/beurteilungen.js` (Persistenz, Berechnung serverseitig
gespiegelt, Mitteilungs-Erzeugung). Mitteilungen werden **serverseitig** erzeugt, da der
offene `POST /api/benachrichtigungen` den Empfänger nicht autorisiert.

### 5.2 Zugriffs-Sonderfall (wichtig)

Beurteilt wird **nach** Ende des Durchlaufs (`Bis < heute`). Die vorhandene
`zugriff.aktivVerantwortlichFuer`-Prüfung ist **datumsaktiv** (`von ≤ heute ≤ bis`) und würde
den/die Verantwortliche/-n für einen beendeten Durchlauf **abweisen**. Daher neuer Helper in
`backend/services/zugriff.js`:

```
verantwortlichFuerZuweisung(user, zuweisung) =
     lower(zuweisung.VerantwEmail) === lower(user.email)   // datumsUNabhängig
  || AusbilderAzubis: (user.oid ist Ausbilder von zuweisung.AzubiOid)  // dauerhaft
  || user.role === 'developer' || 'admin'
```

Genutzt für alle schreibenden Beurteilungs-Endpoints und für die Edit-Ansicht der Seite.

### 5.3 Fälligkeit ohne Cron

Beim App-Load (analog `initNotifications` in `app.js`) ruft das Frontend
`GET /api/beurteilungen/faellig`. Serverseitig: Zuweisungen des aktuellen Users
(`VerantwEmail == user.email`) mit `Bis < heute`, zu denen **keine `abgeschlossen`-Beurteilung**
existiert (ein `entwurf` zählt als noch fällig). Für jede solche Zuweisung lege eine Mitteilung
`(UserOid=user.oid, Typ='beurteilung_faellig', ZuweisungId=z.Id)` an — **nur falls noch keine
existiert** (Idempotenz-Check vor Insert).

> Kante: Ein/-e Verantwortliche/-r ohne bisherigen SSO-Login hat **keine `Users`-Zeile/OID**;
> eine `UserOid`-Mitteilung kann sie erst erreichen, sobald sie sich einloggt (dann läuft der
> Fällig-Check und legt die Mitteilungen an — selbstheilend). Bis dahin keine Mitteilung.

---

## 6. Frontend

### 6.1 Seite `app/beurteilung.html` (+ `app/js/beurteilung.js`, `app/css/beurteilung.css`)

- **Eigenständige, fokussierte Seite ohne Sidebar** (eigener Topbar mit „Zurück"-Link,
  Theme-Toggle, Avatar — analog `abteilungsdurchlauf.html`/`dh-profil.html`). Lädt alle
  Theme-Stylesheets (inkl. Custom-/Saison-Themes) für Konsistenz.
- Parameter `?zuw=<ZuweisungId>`. `beurteilung.js` lädt Zuweisung + User + ggf. bestehende
  Beurteilung und entscheidet **Modus**:
  - `verantwortlichFuerZuweisung` (oder dev) → **editierbar**.
  - Azubi/DH ist Owner und Beurteilung `abgeschlossen` → **read-only** + Kenntnisnahme.
  - sonst (kein Zugriff / read-only ohne abgeschlossene Beurteilung) → freundlicher Hinweis.
- **Kopfdaten auto-befüllt:** Name/Vorname (Azubi), Abteilung + Zeitraum (Zuweisung),
  Beurteilende/-r (Verantw.-Name), Ausbildungs-/Studienberuf (User `beruf`/`studiengang`).
- **Editier-Aktionen:** „Entwurf speichern", „Abschließen", „PDF", „Kriterienkatalog",
  **„Berichte KW x–y ansehen/korrigieren"** (Link in die bestehende Wochenansicht, gefiltert
  auf `von..bis` des Zeitraums — erfüllt „dort einsehen und korrigieren").
- **Read-only (Azubi/DH):** deaktivierte Felder, „Kenntnisnahme bestätigen"-Button (setzt
  `KenntnisnahmeAm`), „PDF". `variant:'dh'` erzeugt die abweichende DH-Optik.

### 6.2 Gemeinsames Kernmodul `app/js/beurteilung-core.js`

- IIFE → `window.Beurteilung` (idempotent, da Router Page-Scripts re-evaluieren kann).
- Enthält: `KRITERIEN` (4.4), `PUNKTE_ZU_NOTE` (4.3), `stufeFuerPunkte()`, `berechne(kriterien)`
  → `{bloecke, summe, gesamt, note}`, `renderForm(container, data, {editable, variant})`,
  `openKatalogModal()`.
- **Einzige Quelle** für Katalog, Rechenlogik und Layout — dadurch können Edit-/Read-only-/PDF-
  Ansicht nie divergieren.

### 6.3 Kachel-Anbindung (Einstieg)

- `app/js/azubi-planer.js`
  - Azubi-Durchlauf (`renderAzubiDurchlauf`) & DH (`abteilungsdurchlauf.js`, `cardHtml`):
    Kachel bekommt **Badge** (Beurteilung „✓ vorhanden" / „—") aus `GET ?azubiOid=`; Klick auf
    eine Kachel mit abgeschlossener Beurteilung → `beurteilung.html?zuw=<id>`.
  - Ausbilder-Durchlauf (`renderAusbilderDurchlauf`): Kachel-Badge
    (ausstehend / Entwurf / abgeschlossen); Klick → `beurteilung.html?zuw=<id>` (editierbar).
- `app/js/abteilungsdurchlauf.js` (DH-Standalone): analoge Badge + Klick.

### 6.4 Zustände einer Kachel

| Bedingung | Azubi/DH-Kachel | Ausbilder-Kachel |
|---|---|---|
| Durchlauf läuft noch (`Bis ≥ heute`) | kein Beurteilungs-Badge | „—" (noch nicht fällig) |
| beendet, keine Beurteilung | „—" (nicht klickbar/Hinweis) | **„Beurteilung ausstehend"** → anlegen |
| Entwurf vorhanden | „—" (für Azubi unsichtbar) | „Entwurf" → fortsetzen |
| abgeschlossen | **„Beurteilung ansehen"** → read-only | „abgeschlossen" → ansehen/korrigieren |

### 6.5 API-Client `app/js/api.js`

Neue `DB`-Methoden + Normalizer (PascalCase→camelCase, Datums-Slicing via `toDateStr`):
`getBeurteilung(zuweisungId)`, `getBeurteilungenFuerAzubi(azubiOid)`, `getFaelligeBeurteilungen()`,
`saveBeurteilung(payload)`, `abschliessenBeurteilung(id)`, `patchBeurteilung(id, payload)`,
`kenntnisnahmeBeurteilung(id)`, `normalizeBeurteilung`.

---

## 7. Benachrichtigungen (`app/js/app.js`)

Zwei neue Typen:

| Typ | Empfänger | Auslöser | Deep-Link |
|---|---|---|---|
| `beurteilung_faellig` | Verantwortliche/-r | Fällig-Check beim App-Load | `beurteilung.html?zuw=<ZuweisungId>` |
| `beurteilung_abgeschlossen` | Azubi | Abschließen/Korrektur (serverseitig) | `beurteilung.html?zuw=<ZuweisungId>` |

In `initNotifications` je ein neuer Zweig für **Icon**, **Titel** (z.B. „Beurteilung fällig:
{Abteilung}" / „Neue Beurteilung: {Abteilung}") und **Klick-Ziel** (echte Navigation zur
Standalone-Seite via `?zuw=`, statt der Woche-`sessionStorage`-Logik). Ohne diese Zweige würde
die vorhandene Woche-zentrierte Render-Logik „KW undefined" anzeigen.

---

## 8. PDF-Export

Clientseitig im **Print-HTML-Muster** von `berichtsheft-export.js` (nicht pdf-lib):
eigenständiges A4-Dokument als String, CD-`@font-face`, Logo als Data-URI,
`@page { size:A4 }`, `window.print()` nach Font-Load. Layout spiegelt den Papierbogen 1:1:

- Kopf (Name/Abteilung/Zeitraum/Beurteilende/-r/Beruf),
- Blöcke A/B/C mit Kriteriumszeilen, 6 Stufen-Spalten (markiert) + Beurteilungspunkte,
- „Summe Punkte : Anzahl Kriterien" je Block, Summe / ÷3 / Gesamt / Note,
- Individuelle Beurteilung (Freitext),
- Unterschriftszeilen (Beurteilende/-r, Ausbildungsleiter/-in, Auszubildende/-r) +
  „Beurteilungsgespräch durchgeführt und Kopie erhalten am" (mit `GespraechAm`/`KenntnisnahmeAm`).

Umsetzung als `Beurteilung.exportPdf(data)` im Kernmodul (oder `app/js/beurteilung-export.js`),
`_buildHtml(data)` als reine, testbare Funktion.

---

## 9. Betroffene Dateien

**Neu**
- `db/migrations/015_beurteilungen.sql`
- `backend/routes/beurteilungen.js`
- `backend/services/beurteilungen.js`
- `app/beurteilung.html`
- `app/js/beurteilung.js`
- `app/js/beurteilung-core.js`
- `app/css/beurteilung.css`

**Geändert**
- `backend/server.js` — Route mounten (mit `devAuth`)
- `backend/services/zugriff.js` — `verantwortlichFuerZuweisung()`
- `app/js/api.js` — DB-Methoden + Normalizer
- `app/js/app.js` — Mitteilungs-Zweige (Icon/Titel/Klick) + Fällig-Check beim Load
- `app/js/azubi-planer.js` — Kachel-Badge + Klick (Azubi- & Ausbilder-Durchlauf)
- `app/js/abteilungsdurchlauf.js` — Kachel-Badge + Klick (DH)

---

## 10. Annahmen & Nicht-Ziele

**Annahmen**
- Note-Rundung: `Math.round(Gesamt)` (kaufmännisch) für den Punkte→Note-Lookup.
- Genau **10 Kriterien** (3/3/4) gemäß aktuellem offiziellen Bogen; Änderungen erfolgen über
  die `KRITERIEN`-Konstante.
- Es existiert genau **eine** Beurteilung je Zuweisung.
- Beurteilung ist nach Abschluss weiter korrigierbar (mit Attribution + erneuter Azubi-Info).

**Nicht-Ziele (YAGNI)**
- Kein Hintergrund-Job/Cron (Fälligkeit lazy beim Load).
- Keine Rück-Mitteilung an Verantwortliche bei Kenntnisnahme.
- Keine echte digitale Signatur (nur Kenntnisnahme-Flag + Unterschriftszeilen im PDF).
- Keine serverseitige PDF-Erzeugung.
- Kein separater Sidebar-Nav-Link (Einstieg nur kontextuell über Kachel/Mitteilung).
- Keine Versionierung/Historie einzelner Bewertungsstände (nur letzter Stand + Korrektur-Attribution).

## 11. Offene Punkte

- Exakte Wortlaute der Mitteilungstitel/Icons (Feinschliff bei der Umsetzung).
- Feinheiten der DH-Optik (`variant:'dh'`) — an bestehende DH-Styles angleichen.
