# Noten & Zeugnisse — Design-Spec

**Datum:** 2026-09-01
**Status:** Entwurf
**Baut auf:** [2026-08-26-beurteilung-notenschluessel-design.md](2026-08-26-beurteilung-notenschluessel-design.md)
(IHK-Punkteschlüssel), [2026-08-11-loeschkonzept-inaktive-nutzer-design.md](2026-08-11-loeschkonzept-inaktive-nutzer-design.md)
(Retention-Phasen), [2026-09-01-ausbildungsleiter-department-design.md](2026-09-01-ausbildungsleiter-department-design.md)
(Ausbildungsleiter-Ermittlung über `Users.Department`)

## Problem

Azubis und DH-Studenten sammeln ihre Schulleistungen vollständig außerhalb der App: Klassenarbeiten
auf Papier, Zeugnisse im Ordner, DHBW-Noten im Hochschulportal. Ausbilder und Ausbildungsleitung
haben keinen Ort, an dem sie nachsehen können, wie ein Azubi in der Schule steht.

Im Repo existiert dazu bisher nichts. Verwandt, aber fachlich anderes: `Beurteilungen.Note` /
`GesamtPunkte` (`db/migrations/015_beurteilungen.sql`) sind **Ausbilder**-Beurteilungsnoten, keine
Schulnoten; der IHK-Punkteschlüssel `PUNKTE_ZU_NOTE` / `noteFuerPunkte()`
(`app/js/beurteilung-core.js:129-144`) gehört zu diesem Beurteilungsbogen und ist die einzige
wiederverwendbare Zutat.

## Ziel

- Ein Ort, an dem ein Azubi seine Noten und die zugehörigen Fächer/Kurse übersichtlich sieht.
- Belege (iPad-Foto, gescanntes PDF, Portal-Screenshot) hängen am jeweiligen Eintrag.
- Zeugnisse können abgelegt werden.
- Die zuständigen Ausbilder und die Ausbildungsleitung können lesen — und werden über Zeugnisse
  und Prüfungsergebnisse aktiv informiert.
- Durchschnitte pro Fach und gesamt, weil sie die Übersicht ausmachen.

**Zweck ist ein Nachweis-Archiv**, kein Auswertungswerkzeug. Frühwarnung, Jahrgangsvergleiche und
Exporte sind ausdrücklich nicht Ziel.

## Entscheidungen aus der Klärung

| Thema | Entscheidung | Begründung |
|---|---|---|
| Struktur | Der Azubi legt **Ordner per Freitext** an („Englisch", „Software", „Zeugnisse"); Einträge liegen darin | Kein globaler Fächerkatalog: gewerblich, kaufmännisch und DH haben zu verschiedene Fächer, und ein gepflegter Katalog wäre Dauerarbeit. Der Fachname wird einmal getippt, nicht bei jedem Eintrag |
| Zeugnisse/Prüfungen | Sind normale Ordner, keine eigene Ebene | Ein Konzept weniger. Die Unterscheidung trägt stattdessen die **Art** am Eintrag |
| Art am Eintrag | `klassenarbeit` · `zwischenpruefung` · `abschlusspruefung` · `zeugnis` · `semesterpruefung` · `sonstiges` | Steuert zwei Dinge: welche Felder die UI zeigt (Klassenarbeiten haben keine IHK-Punkte, Prüfungen schon) und ob eine Mitteilung rausgeht |
| Noteneingabe | Frei, deutsche Komma-Eingabe („2,3"). Punkte 0–100 optional | Der Azubi trägt ein, was auf dem Blatt steht |
| Punkte→Note | Azubis über den vorhandenen IHK-Schlüssel (feste 100 Punkte). DH-Studenten über die offizielle DUALIS-Tabelle, **Skala je gewählter Maximalpunktzahl** | Zwei getrennte Skalen; die DHBW-Umrechnung hängt zwingend am Maximum (siehe unten) |
| Durchschnitte | Ordner-Ø immer; Gesamt-Ø **eintragsgewichtet** über Ordner mit `ZaehltInSchnitt=1`, immer mit `n` daneben | Mittel-der-Mittel würde einen Ordner mit einer Note so schwer wiegen lassen wie einen mit zwanzig. Das `n` macht die Zahl nachprüfbar |
| Ordner-Flag | `ZaehltInSchnitt` (Default 1) wirkt **nur** auf den Gesamt-Ø | Ein „Zeugnisse"-Ordner wiederholt Noten, die schon in den Fachordnern stehen, und würde den Gesamtschnitt doppelt gewichten. Der Ordner-Ø bleibt trotzdem sichtbar |
| Zeitraum | Gespeichertes Feld `AbschnittTyp` + `AbschnittNr` am Eintrag | Nicht aus `AusbildungBeginn` abgeleitet: ein abgeleiteter Wert deutet Altdaten um, sobald der Beginn korrigiert wird, und DH-Semester decken sich nicht mit Ausbildungsjahren |
| Änderbarkeit | Azubi darf jederzeit ändern und löschen; `AktualisiertAm` wird als „zuletzt geändert" auch dem Ausbilder gezeigt | Tippfehler und Nachträge sind der Normalfall. Der Stempel macht Korrekturen nachvollziehbar, ohne einen Freigabe-Workflow einzuführen |
| Schreibrecht | **Nur der Eigentümer** — auch `admin`/`developer` nicht | Die Noten sind eine Selbstauskunft; ein fremder Schreibzugriff würde sie entwerten. Developer testet über `backend/routes/dev-login.js` |
| Ausbilder-Rechte | Nur lesen: ansehen, Beleg öffnen/herunterladen | Kein Genehmigungs-Workflow, kein Kommentieren |
| Ausbilder-Einstieg | Übersichtsliste „meine Azubis" (Anzahl Einträge, letzter Eintrag, Gesamt-Ø) → Einzelansicht | Ausdrücklicher Wunsch. Bleibt bewusst schmal: drei Kennzahlen, kein Reporting |
| Mitteilung | Genau **einmal** je Eintrag, bei Art Zeugnis / Zwischen- / Abschluss- / Semesterprüfung | Bei jeder Klassenarbeit zu benachrichtigen würde die Mitteilungen fluten; ohne Einmaligkeits-Stempel würde jede Notenkorrektur erneut senden |
| Dateien | 10 MB, `pdf jpg jpeg png gif webp heic heif`; Bilder clientseitig auf 2000 px / JPEG q0.85 | Gleiche Entscheidung wie `dbo.Anhaenge`. Kein eigener Scanner im Browser — die iOS-Dateien-App scannt selbst nach PDF |

### Sichtbarkeit

| Wer | Lesen | Schreiben |
|---|---|---|
| Der Azubi / DH-Student selbst | ja | **ja** |
| Dauerhaft zugeordneter Ausbilder (`dbo.AusbilderAzubis`) | ja | nein |
| Aktive Vertretung eines solchen Ausbilders | ja | nein |
| Ausbildungsleitung des passenden Bereichs (`Users.Department` → `bereichAusDepartment()`) | ja | nein |
| `admin`, `developer` | ja | nein |
| **Verantwortlicher einer befristeten Abteilungs-Zuweisung (`dbo.Zuweisungen`)** | **nein** | nein |
| Sonstige `pruefer` ohne Zuordnung | nein | nein |

Die letzte Zeile ist der wesentliche Unterschied zu Wochen und Beurteilungen. Dort ist die
befristete Abteilungs-Zuweisung eine gleichwertige Zugriffsquelle (`services/zugriffContext.js:11-23`).
Schulnoten gehören nicht zum Abteilungseinsatz — wer einen Azubi sechs Wochen in seiner Abteilung
hat, bekommt deswegen keinen Einblick in dessen Berufsschulzeugnis.

**Konsequenz für DH-Studenten:** `dbo.AusbilderAzubis` ist für Rolle `dhstudent` strukturell leer —
der Entra-Sync filtert auf `istAzubi` (`services/entraSync.js:235`) und `validateZuordnung`
(`services/ausbilderAzubis.js:56-61`) weist eine manuelle Zuordnung mit *„Ziel-Nutzer ist kein
Azubi."* ab. Das bleibt so: `AusbilderAzubis` wird für dieses Feature **nicht** geöffnet. DH-Noten
sieht damit die **kaufmännische** Ausbildungsleitung (`services/department.js` mappt
„dh-student"/„dh student" auf `kaufmaennisch`) sowie `admin`/`developer` — kein einzelner Ausbilder.
Bewusste Entscheidung des Auftraggebers.

## Scope

### 1. Datenmodell — Migration 043

`db/migrations/043_noten_zeugnisse.sql`. Drei Ebenen, beide Fremdschlüssel mit `ON DELETE CASCADE`:
`NotenOrdner` → `NotenEintraege` → `NotenBelege`.

**dbo.NotenOrdner** — `Id INT IDENTITY` · `AzubiOid NVARCHAR(36) NOT NULL` ·
`Name NVARCHAR(100) NOT NULL` · `ZaehltInSchnitt BIT NOT NULL DEFAULT 1` ·
`Sortierung INT NOT NULL DEFAULT 0` · `ErstelltAm DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()` ·
`AktualisiertAm DATETIME2 NULL`. `UQ_NotenOrdner_AzubiName (AzubiOid, Name)`,
`CK_NotenOrdner_Name` (nicht leer nach Trim), `IX_NotenOrdner_AzubiOid`.

**dbo.NotenEintraege** — `Id` · `OrdnerId INT NOT NULL` (FK → NotenOrdner, Kaskade) ·
`Titel NVARCHAR(200) NOT NULL` · `Art NVARCHAR(20) NOT NULL` (CHECK-Whitelist der sechs Arten) ·
`Datum DATE NOT NULL` · `AbschnittTyp NVARCHAR(15) NULL` (CHECK `'ausbildungsjahr'|'semester'`) ·
`AbschnittNr TINYINT NULL` (CHECK 1–8) · `Note DECIMAL(3,2) NULL` (CHECK 1,0–6,0) ·
`Punkte TINYINT NULL` (CHECK ≤ 100) · `NoteAusPunkten BIT NOT NULL DEFAULT 0` ·
`Bemerkung NVARCHAR(1000) NULL` · `MitteilungGesendetAm DATETIME2 NULL` · `ErstelltAm` ·
`AktualisiertAm NULL`. `IX_NotenEintraege_OrdnerId`.

`Note` ist `DECIMAL(3,2)`, nicht `DECIMAL(2,1)` wie `Beurteilungen.Note`: Schulnoten wie 2,35 und
DHBW-Zwischenwerte brauchen zwei Nachkommastellen.

> **Überholt durch Migration 045:** `Punkte` ist dort `DECIMAL(5,1)` (halbe Punkte, bis 400) und die
> Spalte `MaxPunkte` kommt hinzu. Siehe Abschnitt 2.

**dbo.NotenBelege** — `Id` · `EintragId INT NOT NULL` (FK → NotenEintraege, Kaskade) ·
`Dateiname NVARCHAR(255) NOT NULL` · `MimeTyp NVARCHAR(100) NULL` · `GroesseBytes INT NOT NULL` ·
`Inhalt VARBINARY(MAX) NOT NULL` · `HochgeladenAm`. `IX_NotenBelege_EintragId`.
Inhalt als `VARBINARY(MAX)` in der DB — gleiche Entscheidung und Begründung wie `dbo.Anhaenge`
(Migration 004).

**Denormalisierung bewusst unterlassen.** `NotenEintraege` bekommt **kein** `AzubiOid`,
`NotenBelege` **kein** `HochgeladenVon`. Beides wäre für Abfragen bequem, erzeugt aber je eine
weitere Personenspalte, die `pruefeUnbekannteSpalten()` (`services/retention.js:432-444`) melden
müsste. So ist `NotenOrdner.AzubiOid` die einzige Personenspalte des Features und **eine**
PHASE_A-Zeile genügt. Hochladen darf ohnehin nur der Eigentümer, `HochgeladenVon` wäre reine
Dopplung.

### 2. Datenmodell — Migration 045 (DHBW-Punkte)

Nachgereicht, nachdem der Auftraggeber die offizielle
`DUALIS_Punkte-Noten-Tabelle_2022.pdf` geliefert hat (DHBW, Studienbereich Wirtschaft, Stand
14.10.2022). Die Tabelle kennt **sechs Maximalpunktzahlen** — 60, 90, 100, 120, 150 und 180 — und
dieselbe Punktzahl ergibt je Maximum eine andere Note: 60 Punkte sind bei max 100 die Note 3,4, bei
max 120 aber genau 4,0. Ohne die Maximalpunktzahl ist keine Umrechnung möglich, also gehört sie an
den Eintrag.

Zwei Annahmen aus Migration 043 halten damit nicht mehr:

- **`Punkte` war `TINYINT`.** Die DUALIS-Tabelle liegt auf einem **Halbpunkt-Raster** (Note 1,0 bei
  100 Punkten beginnt bei 98,5) — `TINYINT` kann 98,5 nicht speichern. Neu: `DECIMAL(5,1)`.
- **`CK_NotenEintraege_Punkte` begrenzte auf 100** (IHK-Schlüssel). Bei 180 möglichen Punkten ist
  das zu eng. Neue Obergrenze 400, bewusst großzügig — die fachliche Grenze ist `MaxPunkte`, und
  die prüft `CK_NotenEintraege_PunkteMax` (`Punkte <= MaxPunkte`) mit.

Neue Spalte `MaxPunkte SMALLINT NULL` mit `CHECK IN (60, 90, 100, 120, 150, 180)`. Bewusst **kein
freies Feld**: für jede andere Maximalpunktzahl gibt es keine amtliche Umrechnung, und ein freier
Wert würde stillschweigend falsche Noten erzeugen. Passt das Maximum nicht, bleibt `MaxPunkte` NULL
und der Student trägt die Note direkt ein.

IHK-Prüfungen der Azubis bleiben unberührt: dort ist `MaxPunkte` NULL und die Umrechnung läuft
weiter über `PUNKTE_ZU_NOTE` (0..100) aus `app/js/beurteilung-core.js`. Der IHK-Pfad weist halbe
Punkte ab — der Schlüssel ist auf ganze Punkte indiziert, ein versehentliches „87,5" darf keine
erfundene Note ergeben.

Die sechs Skalen liegen als `DHBW_SKALEN` in `app/js/noten-core.js`, je Skala 41 Paare
`[minPunkte, Note]` absteigend, mit `[0, 5.0]` als Auffangfall. Sie sind **maschinell aus dem PDF
erzeugt**, nicht abgeschrieben (Parser: vendored pdf.js, Zellen über Item-Breiten
zusammengesetzt), und werden von `noten-core.test.js` gegen vier unabhängige Struktureigenschaften
geprüft: Notenfolge 1,0..5,0 in 0,1-Schritten, streng fallende Schwellen, alle Schwellen auf dem
0,5-Raster, Note 4,0 bei genau `max/2` und die 5,0-Grenze bei `max/3`. Die letzten beiden sind die
einzige Kontrolle, dass keine Spalte verrutscht ist.

### 3. Datenmodell — Migration 044 (Benachrichtigungstyp)

*(Der Reihenfolge im Text nach steht 045 vor 044, weil es dieselbe Tabelle korrigiert wie 043.
Eingespielt werden sie in Nummernfolge: 043, 044, 045.)*


`db/migrations/044_benachrichtigungen_notentypen.sql`. `CK_Benachrichtigungen_Typ` ist eine
Whitelist (Stand Migration 040: 13 Typen). Die Migration droppt sie und legt sie mit der
**vollständigen** alten Liste plus `'noten_eintrag_neu'` neu an — Liste nie verengen.

Die Tabelle trägt nur `WocheId` / `ZuweisungId` / `FromUserOid` als Bezugsfelder. Ein Feld für die
Eintrags-Id gibt es bewusst nicht: `FromUserOid` = OID des Azubi, das Frontend verlinkt auf
`noten.html?azubi=<oid>` statt auf den einzelnen Eintrag.

### 4. Kernlogik — `app/js/noten-core.js`

Shell-agnostisch, im Browser **und** in Node lauffähig (`module.exports` + `root.Noten`, Muster
`app/js/beurteilung-core.js:416-418`). Wird auch vom Backend requirt, damit Arten-Whitelist und
Notengrenzen genau eine Wahrheit haben.

- `ARTEN` — je Art `id`, `label`, `zeigtNote`, `zeigtPunkte`, `mitteilung`
- `parseNote(text)` / `formatNote(n)` — deutsche Komma-Eingabe, `null` bei Unsinn
- `noteAusPunkten(punkte, { dh })` — Azubis über `Beurteilung.noteFuerPunkte`, DH über
  `DHBW_PUNKTE_ZU_NOTE` (noch leer → `null`)
- `ordnerSchnitt(eintraege)` / `gesamtSchnitt(ordner)` — eintragsgewichtet, Einträge ohne Note
  zählen nirgends
- `verkleinereBild(file, maxKante)` — nur Browser; gehoben aus dem vorhandenen Canvas-Verkleinerer
  in `app/js/error-reporter.js:156-196`, aber mit `canvas.toBlob()` statt `toDataURL()` und Rückgabe
  eines `File`: der Base64-Umweg kostet 33 % Größe und einen Riesen-String im iPad-Speicher, und
  `apiUpload()` will ohnehin ein `File`

`beurteilung-core.js` darf **nicht** auf Top-Level requirt werden (crasht im Browser) — lazy in der
Funktion über `root.Beurteilung ?? require(…)`.

### 5. Backend — `backend/services/noten.js`

Reine Entscheidungslogik und unreine Loader in einer Datei, getrennt durch einen Trennkommentar
(Muster: `services/beurteilungen.js`).

Rein, getestet: `darfNotenSehen(user, azubiOid, kontext)` · `darfNotenBearbeiten(user, azubiOid)` ·
`ARTEN_MIT_MITTEILUNG`.
Unrein: `ladeNotenKontext(pool, user)` · `sichtbareAzubis(pool, user)` ·
`empfaengerFuerMitteilung(pool, azubiOid)`.

`darfNotenBearbeiten` braucht keinen Kontext — Schreiben ist ausschließlich Eigentümer-Sache. Das
ist strenger als `darfWocheSehen` (`services/zugriff.js:213-223`, wo admin/developer global lesen
dürfen) und muss so im Datei-Header stehen, damit es niemand später „vereinheitlicht".

**Warum nicht in `zugriff.js`:** dessen sämtliche Exporte nehmen `woche` oder `zuweisung`, und
`ladeKorrekturKontext()` (`services/zugriffContext.js:36-54`) liefert die befristeten Zuweisungen
als erste Zutat. Genau die schließt dieses Feature aus — dort untergebracht wäre es eine Einladung,
sie „symmetrisch" wieder aufzunehmen.

**`vertretungen.listDelegierteAzubis` ist hier unbrauchbar:** sie unioniert `AusbilderAzubis` mit
`Zuweisungen.VerantwEmail` (`services/vertretungen.js:70-88`). Über eine Vertretung käme damit
genau der Weg zurück, den die Sichtbarkeitsregel ausschließt. Stattdessen
`vertretungen.aktiveVertreteneOids` plus eigene `AusbilderAzubis`-Abfrage.

### 6. Backend — `backend/routes/noten.js`

Mount in `backend/server.js`: `app.use('/api/noten', devAuth, notenRouter)`. Rollen-Gates lokal im
Router (Muster `nurDeveloper` in `routes/fehlerberichte.js:8-13`), es gibt kein generisches
`requireRole`.

| Methode & Pfad | Antwort / Besonderheit | Status |
|---|---|---|
| `GET /api/noten/azubis` | `?mitSchnitt=1` liefert je Azubi `anzahlEintraege`, `letzterEintrag`, `gesamtSchnitt` | 200 |
| `GET /api/noten` | `?azubiOid=` (default: eigene OID) → `{azubiOid, darfBearbeiten, gesamtSchnitt, ordner:[…]}` | 200 · 403 · 404 |
| `POST /api/noten/ordner` | `{name, zaehltInSchnitt?}` | 201 · 400 · 403 · 409 |
| `PATCH /api/noten/ordner/:id` | `{name?, zaehltInSchnitt?, sortierung?}` | 200 · 400 · 403 · 404 · 409 |
| `DELETE /api/noten/ordner/:id` | ohne `?kaskade=1` und nicht leer → 409 mit `{eintraege, belege}` | 200 · 403 · 404 · 409 |
| `POST /api/noten/ordner/:id/eintraege` | `{titel, art, datum, abschnittTyp?, abschnittNr?, note?, punkte?, bemerkung?}` | 201 · 400 · 403 · 404 |
| `PATCH` / `DELETE /api/noten/eintraege/:id` | Teilmenge derselben Felder | 200 · 400 · 403 · 404 |
| `POST /api/noten/eintraege/:id/belege` | multipart, Feld `datei` | 201 · 400 · 403 · 404 · 413 |
| `GET /api/noten/belege/:id/download` | Bytes, `Content-Disposition: attachment; filename*=UTF-8''…` | 200 · 403 · 404 |
| `DELETE /api/noten/belege/:id` | `{ok:true}` | 200 · 403 · 404 |

Der Upload-Block wird 1:1 aus `routes/anhaenge.js:11-38` übernommen — inklusive des
`uploadSingle`-Wrappers, der `LIMIT_FILE_SIZE` als **413 JSON** statt als 500 beantwortet, und der
Dateinamen-Reparatur `Buffer.from(originalname,'latin1').toString('utf8')` (`anhaenge.js:87`).
Die Sichtbarkeit wird bei **jedem** Zugriff neu geprüft, auch beim Download — nicht nur beim Upload.

Mitteilungs-Fanout als lokale `benachrichtige()` nach dem Vorbild `routes/zuweisungen.js:46-62`
(best-effort try/catch, Empfänger um Vertreter erweitert). **Nicht** `erzeugeBenachrichtigung`
importieren: die Funktion ist in `services/beurteilungen.js` nicht exportiert. Gefeuert wird nur bei
`ARTEN_MIT_MITTEILUNG.has(art) && !MitteilungGesendetAm`, danach wird der Stempel gesetzt — genau
einmal je Eintrag, auch wenn ein PATCH die Art erst später zu einer Mitteilungs-Art macht.

### 7. Retention — `backend/services/retention.js`

PHASE_A um `{ tabelle: 'NotenOrdner', bedingung: 'AzubiOid = @oid' }` erweitern; Einträge und Belege
folgen per Kaskade. Der Kommentarblock über den Phasen (Z. 100-102) nennt die beiden Kindtabellen.
Ein `BEKANNTE_SPALTEN`-Eintrag ist nicht nötig — `NotenOrdner.AzubiOid` wird aus dem
Phasen-Fragment abgeleitet (`retention.js:270-273`).

### 8. Frontend — zwei Shells über einer Kernlogik

DH-Studenten haben keine Sidebar, sondern eine eigene `.dh-topbar`-Shell und laden weder
`sidebar.js` noch `router.js`. Deshalb:

- `app/noten.html` + `app/js/noten.js` + `app/css/noten.css` — Azubi- und Ausbilder-Ansicht, mit
  Sidebar und SPA-Router. Gerüst nach `app/ausbildungsstand.html`; `css/noten.css` an der
  Seiten-CSS-Position (vor `glass.css` und den Theme-Dateien, `themes.css` bleibt letztes);
  Scripts in der Reihenfolge `beurteilung-core.js` → `noten-core.js` → `noten.js`.
- `app/dh-noten.html` + `app/js/dh-noten.js` — DH-Shell nach `app/dh-profil.html`, ohne
  Azubi-Selektor; dritter Link in `.dh-topbar__nav` **beider** DH-Seiten
  (`abteilungsdurchlauf.html`, `dh-profil.html`) als statisches Inline-SVG.

Sidebar-Eintrag in `app/js/sidebar.js` mit Klasse `nav-noten-only`; Pre-Paint-Gate in
`app/css/layout.css` als
`html:not([data-ist-azubi="1"]):not([data-ist-ausbilder="1"]) .nav-noten-only { display:none }`
und die passende Zeile in `applyCapabilities()` (`app/js/app.js:49-92`). **Kein neues
`data-*`-Attribut und kein neuer localStorage-Cap** — die zwei vorhandenen genügen, `theme.js`
bleibt unangetastet.

Der Ausbilder-Selektor wird aus `DB.getNotenAzubis()` gefüllt, **nicht** aus
`DB.getSelectableAzubis()`: letzteres enthält befristete Zuweisungs-Azubis, die hier 403 bekämen,
und keine DH-Studenten.

Neue `DB`-Methoden und `normalize*`-Funktionen in `app/js/api.js` neben dem bestehenden
Anhang-Block.

### 9. Mitteilungs-Darstellung

Je ein Eintrag für `noten_eintrag_neu` in `app/js/dashboard.js` (`VERWALTUNG_MT_TYPEN`) und
`app/js/mitteilungen.js` (`VERWALTUNG_TYPEN`), Ziel `noten.html?azubi=<fromUserId>`. Das
Frontend-Feld heißt `fromUserId`, nicht `fromUserOid` (`app/js/api.js:356`). `dh-mitteilungen.js`
wird **nicht** angefasst — DH-Studenten sind nie Empfänger dieses Typs. Fehlt der Typ in einer der
beiden Maps, rendert die Mitteilung dort lautlos leer.

## Nicht im Scope

- Trendanalyse, Frühwarnung, Jahrgangsvergleiche, Export (CSV/PDF) — der Zweck ist ein Archiv.
- Kommentare oder Genehmigungen durch den Ausbilder.
- Ein Eintrag mit mehreren Fachnoten (etwa alle Noten eines Zeugnisses in einem Datensatz). Ein
  Zeugnis ist ein Eintrag mit PDF und optional der Gesamtnote; Einzelnoten gehören in die
  Fachordner.
- Öffnen von `dbo.AusbilderAzubis` für DH-Studenten (siehe Sichtbarkeit).
- Deep-Link aus einer Mitteilung auf den einzelnen Eintrag.
- HEIC-Dekodierung (WASM-Decoder oder serverseitiges `sharp`/libheif).
- Zugriffsprotokollierung („wer hat welche Noten wann gesehen") — es gibt im Repo kein
  Web-Audit-Log, nur `dbo.McpLog`. Offener Compliance-Befund G-21 in
  `docs/2026-07-27-ihk-compliance-audit.md`, hier nicht mit gelöst.

## Risiken / Randfälle

1. **Ordner mit Inhalt löschen.** Die Kaskade räumt Einträge und Belege klaglos ab. Deshalb liefert
   `DELETE` ohne `?kaskade=1` einen **409** mit `{eintraege, belege}`, und das Frontend fragt mit
   diesen Zahlen nach („Ordner ‚Englisch' mit 7 Einträgen und 9 Belegen endgültig löschen?").
2. **Gleiche Ordnernamen.** `UQ_NotenOrdner_AzubiName` greift bei der CI-Default-Collation auch für
   „Englisch"/„englisch" — gewollt. Vor dem Insert trimmen und Mehrfach-Whitespace kollabieren, die
   Constraint-Verletzung als **409 mit Klartext** fangen, nicht als 500 durchreichen.
3. **Datum.** `DATE`, nicht `DATETIME2`, und im Frontend `<input type="date">` — sonst der
   klassische Zeitzonen-Off-by-one. Keine Kopplung an `Users.AusbildungBeginn`: Schulzeugnisse
   können älter als der Ausbildungsvertrag sein. Nur grobe Plausibilität: vor 2015 oder mehr als 30
   Tage in der Zukunft → 400.
4. **Mitteilung bei Korrekturen.** Ein PATCH von `klassenarbeit` auf `zeugnis` muss die Mitteilung
   auslösen; jede weitere Notenkorrektur darf es nicht. Dafür ist `MitteilungGesendetAm` da.
5. **HEIC.** In Edge/Chrome nicht dekodierbar; `canvas` fällt per `img.onerror` auf das Original
   zurück. iOS transcodiert bei `accept="image/*"` aus der Fotobibliothek meist selbst nach JPEG —
   HEIC kommt praktisch nur über „Dateien durchsuchen". Also annehmen und speichern, in der
   Beleg-Kachel aber statt der Vorschau „Vorschau nicht möglich – zum Ansehen herunterladen".
   PDFs werden nie skaliert.
6. **SPA-Router.** `app/js/router.js` führt Seiten-Scripts beim zweiten Besuch erneut in
   `new Function()` aus. `noten.js` muss re-entrant sein: kein Zustand außerhalb der
   `DOMContentLoaded`-Closure.
7. **iPad.** Scrollposition ausschließlich über `scrollHost()` (`app/js/app.js:17`), siehe
   `docs/ios-touch-verhalten.md`. Auf Touchgeräten scrollt `.main-wrapper`, nicht das Dokument.
8. **`istDhStudent` ist für `developer` bewusst `false`** (`services/users.js`). Die DH-Shell lässt
   sich nicht per Rollenwechsel testen — dafür `backend/db/seed-dhstudent-demo.sql` und Dev-Login.
9. **Maximalpunktzahl nach einem Art-Wechsel.** Wird ein Eintrag von „Semesterprüfung" auf
   „Klassenarbeit" umgestellt, verschwindet das Punktefeld — das Frontend sendet `maxPunkte: null`
   mit, damit kein verwaister Wert stehen bleibt. Der PATCH-Pfad rechnet Note und Punkte immer
   gemeinsam neu, sobald sich Note, Punkte, Art **oder** Maximalpunktzahl ändern; sonst bliebe eine
   aus Punkten berechnete Note stehen, nachdem das Maximum korrigiert wurde.
10. **Kein Maximum in der Tabelle.** Hat eine Prüfung z.B. 200 Punkte, bleibt `MaxPunkte` NULL, das
    Punktefeld ist rein informativ, und die Note muss getippt werden. Das Feld sagt das ausdrücklich
    („– keine Umrechnung –").

## Verifikation

1. `node --test app/js/noten-core.test.js backend/services/noten.test.js backend/services/retention.test.js`
2. Migrationen 043 und 044 **zweimal** einspielen
   (`node backend/db/run-sql.js ../../db/migrations/043_noten_zeugnisse.sql`); beim zweiten Lauf
   müssen alle `PRINT`-Zeilen „existiert bereits" melden. Danach `pruefeUnbekannteSpalten()` gegen
   die migrierte DB → muss `[]` liefern.
3. Backend über `npm run dev` starten und die App **immer über `localhost:3000`** öffnen (Node
   serviert `app/` statisch mit).
4. Als Azubi (Dev-Login, `.demo`-Konto): Ordner anlegen → denselben Namen erneut → 409 mit Klartext;
   Eintrag `klassenarbeit` mit Note „2,3"; Eintrag `zeugnis` mit PDF-Beleg; Ordner-Ø und Gesamt-Ø
   gegen die Handrechnung prüfen; `ZaehltInSchnitt` umschalten → Gesamt-Ø ändert sich, Ordner-Ø
   nicht; Ordner mit Inhalt löschen → Rückfrage mit korrekten Zahlen.
5. Mitteilungen: Art `zeugnis` erzeugt beim Ausbilder eine Zeile auf dem Dashboard und in
   `mitteilungen.html`, der Klick landet auf der Noten-Seite mit vorausgewähltem Azubi. PATCH
   derselben Note → **keine** zweite Mitteilung. Art `klassenarbeit` → **keine** Mitteilung.
6. Rollen-Matrix von Hand: Azubi (schreibt) · DH-Student (schreibt, eigene Shell) · dauerhafter
   Ausbilder (liest; PATCH per Konsole → 403) · Ausbilder mit **nur** befristeter Zuweisung → 403 ·
   Vertreter eines dauerhaften Ausbilders (liest) · Ausbildungsleitung beider Bereiche · `admin`
   und `developer` (lesen, schreiben nicht).
7. iPad (11″, Emulation und echtes Gerät): Foto aus der Kamera, PDF-Scan aus der Dateien-App, HEIC
   aus der Fotobibliothek → Upload gelingt, die HEIC-Kachel zeigt den Download-Hinweis;
   `.main-wrapper` scrollt, nicht das Dokument.
