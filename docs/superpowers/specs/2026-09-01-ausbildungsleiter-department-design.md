# Ausbildungsleiter-Ermittlung über Department statt Berufe-Katalog — Design-Spec

**Datum:** 2026-09-01
**Status:** Entwurf
**Baut auf:** [2026-08-21-beurteilung-ausbildungsleiter-design.md](2026-08-21-beurteilung-ausbildungsleiter-design.md)
(führte `IstAusbildungsleiter`/`AusbildungsleiterBereich` + den Berufe-Katalog
`dbo.Berufe` ein) — diese Spec ersetzt nur die Art, wie der Bereich
(technisch/kaufmaennisch) eines Azubis ermittelt wird.

---

## Problem

`ermittleAusbildungsleiter` (`backend/services/beurteilungen.js`) ermittelt
heute den zuständigen Ausbildungsleiter für einen Azubi über zwei Stufen:
dessen `Beruf`-Freitext (z. B. "Mechatroniker") wird gegen einen manuell
gepflegten Katalog (`dbo.Berufe`) auf einen Bereich (technisch/
kaufmaennisch) abgebildet.

Das ist unnötig aufwändig: Der Bereich steht bereits eindeutig im
`department`-Feld, das Azure AD/Entra für jeden Nutzer liefert —
"Gewerbliche Auszubildende" (technisch), "Kaufmännische Auszubildende"
(kaufmännisch), "DH-Studenten". Eine Berufsbezeichnung müsste sonst für
jeden neuen/abweichenden Fall erst manuell im Katalog nachgetragen werden,
obwohl das Department die Zuordnung schon mitbringt. Zusätzlich fehlt
DH-Studenten heute jede Zuordnung: Sie stehen nicht im Berufe-Katalog, der
dritte Beurteilungs-Schritt entfällt für sie deshalb immer lautlos — obwohl
das Nutzerverwaltungs-UI bei der Bereichsauswahl der Ausbildungsleitung
("Kaufmännische Berufe, IT & DH") bereits andeutet, dass DH-Studenten zur
kaufmännischen Ausbildungsleitung gehören sollen.

`department` wird aktuell beim Entra-Sync zwar aus Graph gelesen, aber nur
flüchtig verwendet, um `BerichtTyp` (täglich/wöchentlich) abzuleiten, und
danach verworfen — nirgends auf `dbo.Users` gespeichert.

## Ziel

- `ermittleAusbildungsleiter` bildet den Bereich künftig aus dem
  Department ab, nicht mehr aus Beruf + Berufe-Katalog.
- DH-Studenten fallen dabei explizit unter den kaufmännischen Bereich
  (Kaufmännische Ausbildungsleitung).
- Department wird dafür wie `Beruf` persistiert (neue Spalte,
  Sync-geschützt über den Migration-041-Mechanismus) — als eigenständiges,
  wiederverwendbares Feld, nicht nur für diesen einen Zweck: künftige
  Unterscheidungen kaufmännisch/gewerblich/DH sollen ebenfalls darüber
  laufen können, ohne dass jede Stelle ihre eigene Ableitung erfindet.

## Entscheidungen aus der Klärung

- **Scope bewusst eng:** Nur `ermittleAusbildungsleiter` wird umgestellt.
  Der Abteilungsplaner-Filter (`app/js/abteilungs-planer.js`, blendet
  technische Azubis aus und filtert kaufmännische + DH über denselben
  Berufe-Katalog) bleibt unverändert — das ist ein separates, gerade
  in Bewegung befindliches Thema (technische Azubis + Marco Rossi sollen
  dort wieder rein). `dbo.Berufe`, `backend/services/berufe.js`,
  `backend/routes/berufe.js` und die "Berufe"-Sektion in der
  Nutzerverwaltung bleiben deshalb vollständig bestehen und unverändert im
  Einsatz.
- **Speicherform:** Rohes `Department` als Textspalte (analog `Beruf`),
  nicht nur ein daraus abgeleiteter Bereichs-Enum. Der Bereich wird bei
  Bedarf live aus dem Text abgeleitet (analog `bereichFuerBeruf`). Grund:
  der Rohwert ist die zukunftsoffene Grundlage für weitere, heute noch
  nicht bekannte Unterscheidungen.
- **Kein Login nötig:** Department wird — wie `Beruf` schon heute — direkt
  im Entra-Sync (`entraSync.js`, `runSync`) gesetzt, nicht erst bei einem
  SSO-Login. `runSync` läuft automatisch beim Serverstart und danach im
  konfigurierten Intervall (`server.js`), zusätzlich manuell antriggerbar
  ("Jetzt synchronisieren") — und erfasst dabei auch Entra-Gruppenmitglieder,
  die noch nie eingeloggt waren (`MERGE … WHEN NOT MATCHED THEN INSERT`).
- **DH-Matching:** Substring-Erkennung ("dh-student"/"dh student"), analog
  zum bestehenden Muster in `berichtTypAusDepartment` (case-insensitiv,
  keine Exakt-Matches auf die volle Department-Zeichenkette) — robuster
  gegen kleine Schreibvarianten in Entra.
- **Neues Modul statt Anbau an Bestehendes:** `bereichAusDepartment` bekommt
  ein eigenes kleines Modul `backend/services/department.js`, nicht
  `berufe.js` (anderes Konzept, bleibt für den Planer bestehen) und nicht
  `entraSync.js` (Sync-Service; die Klassifizierung wird aber auch
  außerhalb von Sync gebraucht, z. B. in `beurteilungen.js`).

## Scope

### 1. Datenmodell — Migration 042

```sql
IF COL_LENGTH('dbo.Users','Department') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD Department NVARCHAR(200) NULL;
  PRINT 'Spalte Department auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Spalte Department bereits.';
```

### 2. Backend — Sync (`backend/services/entraSync.js`)

- `runSync`: `department: u.department` zusätzlich an `upsertUser(...)`
  übergeben (Zeile ~213). `u.department` kommt bereits über
  `resolveMembers` durch (siehe bestehender Test
  `resolveMembers: reicht jobTitle und department durch`) — bisher aber
  nur für `berichtTypAusDepartment` genutzt und danach verworfen.
- `berichtTypAusDepartment` bleibt unverändert (separates, bereits
  funktionierendes Derivat für den Berichtstyp).

### 3. Backend — Speicherung (`backend/services/users.js`), analog `Beruf`

- `PATCH_COLUMNS.department = { col: 'Department', type: () =>
  sql.NVarChar(200) }`.
- `SYNC_PROTECTABLE_COLS` um `'Department'` ergänzen — eine manuelle
  Korrektur in der Nutzerverwaltung übersteht damit den nächsten
  Login/Sync (Migration-041-Mechanismus, exakt wie bei `Beruf`).
- `buildReqUser`: `department: row.Department ?? null` ergänzen.
- `upsertUser`: neuer `@department`-Input, MERGE-SET über
  `protectedExpr('Department', 'COALESCE(@department, t.Department)')`,
  INSERT-Spalten-/Werteliste ergänzen.

### 4. Neue reine Logik — `backend/services/department.js`

```js
'use strict';
// Department-Klassifizierung: bildet das Entra-`department`-Feld auf einen
// Bereich ab. Eigenständiges Modul, weil diese Unterscheidung über die
// Ausbildungsleiter-Ermittlung hinaus gebraucht werden kann (siehe
// Design-Spec 2026-09-01) — kein Anbau an berufe.js (Beruf-Katalog, bleibt
// für den Abteilungsplaner bestehen) oder entraSync.js (Sync-Service).

// Case-insensitiv/substring, gleiches Muster wie berichtTypAusDepartment
// (entraSync.js). DH-Studenten zählen zur kaufmännischen Ausbildungsleitung.
function bereichAusDepartment(department) {
  const d = String(department || '').toLowerCase();
  if (d.includes('gewerblich')) return 'technisch';
  if (d.includes('kaufm')) return 'kaufmaennisch';
  if (d.includes('dh-student') || d.includes('dh student')) return 'kaufmaennisch';
  return null;
}

module.exports = { bereichAusDepartment };
```

Unit-Test `department.test.js` (analog `berufe.test.js`): alle drei
bekannten Department-Werte, Groß-/Kleinschreibung, Leerzeichen-Variante bei
DH, unbekannt/leer/null → `null`.

### 5. Backend — `beurteilungen.js`

`ermittleAusbildungsleiter` liest `Department` statt `Beruf` und ruft
`departmentSvc.bereichAusDepartment(...)` statt
`berufeSvc.bereichFuerBeruf(...)`:

```js
async function ermittleAusbildungsleiter(pool, azubiOid) {
  const r = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT Department FROM dbo.Users WHERE Oid=@oid');
  const bereich = departmentSvc.bereichAusDepartment(r.recordset[0]?.Department ?? null);
  if (!bereich) return null;
  const leiter = await pool.request().input('bereich', sql.NVarChar(20), bereich)
    .query('SELECT TOP 1 Oid FROM dbo.Users WHERE IstAusbildungsleiter=1 AND AusbildungsleiterBereich=@bereich ORDER BY Oid');
  return leiter.recordset[0]?.Oid ?? null;
}
```

Restlicher Ablauf (Suche nach `IstAusbildungsleiter=1 AND
AusbildungsleiterBereich=@bereich`) bleibt unverändert. Der `berufeSvc`-
Require entfällt in dieser Datei (sonst nirgends mehr in `beurteilungen.js`
verwendet).

### 6. Frontend — Nutzerverwaltung (`app/js/nutzerverwaltung.js`)

Neues Feld "Department · aus Azure synchronisiert" im Bearbeiten-Modal,
direkt unter "Beruf" — gleiches readonly/informatives Muster (wird beim
Speichern NICHT mitgesendet, exakt wie das bestehende `nvBeruf`-Feld).
Zweck: Admins sehen im Modal, warum die Ausbildungsleiter-Zuordnung für
eine Person (nicht) greift, ohne in die DB schauen zu müssen. Keine neue
Tabellenspalte in der Nutzerliste (Scope klein halten).

## Nicht im Scope

- `app/js/abteilungs-planer.js` (Filter "nur kaufmännische Azubis + DH")
  bleibt unverändert auf dem Berufe-Katalog — separates, laufendes Thema.
- `dbo.Berufe`, `backend/services/berufe.js`, `backend/routes/berufe.js`,
  die "Berufe"-Sektion der Nutzerverwaltung: unverändert, bleiben im
  Einsatz für den Abteilungsplaner.
- Keine neue Tabellenspalte "Department" in der Nutzerliste.
- Keine Änderung an `berichtTypAusDepartment`/`BerichtTyp`.
- Keine rückwirkende Neuberechnung bereits abgeschlossener Beurteilungen —
  wie bisher wird der Modus bei jedem Aufruf neu bestimmt, niemand wird
  nachträglich benachrichtigt.

## Risiken / Randfälle

- **Bereits vor diesem Feature angelegte Nutzer:** `Department` ist `NULL`,
  bis der nächste automatische ODER manuelle Sync-Lauf durchläuft (Minuten
  bis maximal `intervalHours`, siehe `server.js`) — kein Login nötig. Bis
  dahin liefert `bereichAusDepartment(null)` → `null` → dritter Schritt
  entfällt lautlos, exakt das gleiche Verhalten wie heute bei fehlendem
  Katalog-Treffer, kein Rückschritt.
- **Demo-/Dev-Konten (nicht Entra-synced):** bekommen nie automatisch ein
  Department. Für lokale Tests muss es manuell gesetzt werden (Seed-SQL
  oder direktes DB-Update) — analog zu anderen Demo-Daten.
- **Unbekannter/leerer Department-Wert:** gleiche Behandlung wie "kein
  Katalog-Treffer" bisher — Schritt entfällt lautlos, kein Fehler.
- **Kein Nutzer mit passendem `AusbildungsleiterBereich` getaggt:**
  unverändert (siehe Vorgänger-Spec) — Schritt entfällt lautlos.

## Verifikation

Manuell im Browser (Demo-Konten, Department vorher per SQL gesetzt):

1. Azubi mit `Department = 'Gewerbliche Auszubildende'` → dritter Schritt
   geht an den `technisch`-getaggten Ausbildungsleiter (Marco Rossi).
2. Azubi mit `Department = 'Kaufmännische Auszubildende'` → geht an den
   `kaufmaennisch`-getaggten Ausbildungsleiter (Anika Kailer).
3. DH-Student mit `Department = 'DH-Studenten'` → geht ebenfalls an die
   kaufmännische Ausbildungsleitung (Anika Kailer) — bisher entfiel der
   Schritt hier immer lautlos.
4. Azubi ohne Department (z. B. frisch angelegt, noch kein Sync-Lauf) →
   Schritt entfällt lautlos, kein Fehler.
5. Nutzerverwaltung: Department-Feld im Modal zeigt den synchronisierten
   Wert korrekt an, ist nicht editierbar, Speichern verändert es nicht.
