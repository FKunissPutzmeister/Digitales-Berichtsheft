# Ausbildungsleiter-Ermittlung über Department Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ermittleAusbildungsleiter` im Beurteilungsbogen bildet den Bereich
(technisch/kaufmaennisch) eines Azubis künftig aus dem Entra-`department`-Feld
ab, statt aus Beruf + dem manuell gepflegten Berufe-Katalog — DH-Studenten
fallen dabei explizit unter die kaufmännische Ausbildungsleitung.

**Architecture:** Neue Spalte `dbo.Users.Department` (Migration 042), befüllt
im bestehenden Entra-Sync-Pfad (`entraSync.js` → `upsertUser`) genau wie
`Beruf` heute schon — kein Login nötig. Neues, eigenständiges Modul
`backend/services/department.js` mit einer reinen Ableitungsfunktion
`bereichAusDepartment(department)`. `beurteilungen.js` liest künftig
`Department` statt `Beruf` und ruft diese Funktion statt des Berufe-Katalogs.
Der Berufe-Katalog (`dbo.Berufe`/`berufe.js`) bleibt unverändert bestehen
(wird weiterhin vom Abteilungsplaner benutzt).

**Tech Stack:** Node.js/Express, `mssql`, `node:test` + `node:assert/strict`
(kolozierte `*.test.js`, Ausführung via `node --test <datei>`), SQL Server
(`dbo`-Schema, nummerierte idempotente Migrationsskripte).

**Spec:** [2026-09-01-ausbildungsleiter-department-design.md](../specs/2026-09-01-ausbildungsleiter-department-design.md)

---

## Wichtiger Hinweis zur Ausführung

Migrationen in diesem Repo werden **nicht** von Claude/Agenten gegen die
Dev-DB eingespielt (kein DDL-Recht) — nur Kuniß kann das. Task 1 erstellt
nur die Migrationsdatei. Tasks 2–6 (reiner Code, mit `node:test` via
injizierten Fake-Pools) sind davon unabhängig und benötigen keine
angewendete Migration. Nur Task 7 (manuelle Browser-Verifikation) setzt
voraus, dass Migration 042 bereits eingespielt wurde.

---

### Task 1: Migration 042 — `Department`-Spalte auf `dbo.Users`

**Files:**
- Create: `db/migrations/042_users_department.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 042 – Department-Spalte auf dbo.Users
-- Ausführen gegen: Berichtsheft_Dev
--
-- Speichert das rohe Entra-`department`-Feld (z.B. "Gewerbliche
-- Auszubildende", "Kaufmännische Auszubildende", "DH-Studenten") auf
-- dbo.Users — analog zur bestehenden Beruf-Spalte. Wird wie Beruf im
-- Entra-Sync befüllt (kein Login nötig) und ist über den Migration-041-
-- Mechanismus (ManuellUeberschriebeneFelder) manuell überschreibbar.
--
-- Ersetzt NICHT den Berufe-Katalog (dbo.Berufe) — der bleibt für den
-- Abteilungsplaner-Filter im Einsatz. Siehe Design-Spec
-- docs/superpowers/specs/2026-09-01-ausbildungsleiter-department-design.md
-- Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Users','Department') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD Department NVARCHAR(200) NULL;
  PRINT 'Spalte Department auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Spalte Department bereits.';
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/042_users_department.sql
git commit -m "feat(db): Migration 042 - Department-Spalte auf dbo.Users"
```

---

### Task 2: `bereichAusDepartment` — reine Klassifizierungs-Logik (TDD)

**Files:**
- Create: `backend/services/department.js`
- Test: `backend/services/department.test.js`

- [ ] **Step 1: Failing Test schreiben**

```js
'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./department.js');

test('bereichAusDepartment: gewerblich -> technisch, kaufm -> kaufmaennisch', () => {
  assert.equal(D.bereichAusDepartment('Gewerbliche Auszubildende'), 'technisch');
  assert.equal(D.bereichAusDepartment('Kaufmännische Auszubildende'), 'kaufmaennisch');
});

test('bereichAusDepartment: DH-Studenten zaehlen zur kaufmaennischen Ausbildungsleitung', () => {
  assert.equal(D.bereichAusDepartment('DH-Studenten'), 'kaufmaennisch');
  assert.equal(D.bereichAusDepartment('DH Studenten'), 'kaufmaennisch');
});

test('bereichAusDepartment: case-insensitiv', () => {
  assert.equal(D.bereichAusDepartment('gewerbliche auszubildende'), 'technisch');
  assert.equal(D.bereichAusDepartment('KAUFMÄNNISCHE AUSZUBILDENDE'), 'kaufmaennisch');
});

test('bereichAusDepartment: unbekannt/leer/null -> null', () => {
  assert.equal(D.bereichAusDepartment('Sonstiges'), null);
  assert.equal(D.bereichAusDepartment(''), null);
  assert.equal(D.bereichAusDepartment(null), null);
  assert.equal(D.bereichAusDepartment(undefined), null);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test backend/services/department.test.js`
Expected: FAIL mit `Cannot find module './department.js'`

- [ ] **Step 3: Modul implementieren**

```js
'use strict';
/* Department-Klassifizierung: bildet das Entra-`department`-Feld eines
   Nutzers (siehe backend/services/entraSync.js) auf einen Bereich ab.
   Eigenständiges Modul, weil diese Unterscheidung über die Ausbildungs-
   leiter-Ermittlung (beurteilungen.js) hinaus gebraucht werden kann —
   siehe Design-Spec docs/superpowers/specs/
   2026-09-01-ausbildungsleiter-department-design.md. Kein Anbau an
   berufe.js (Beruf-Katalog, bleibt unverändert für den Abteilungsplaner
   bestehen) oder entraSync.js (Sync-Service). */

// Case-insensitiv/substring, gleiches Muster wie das bestehende
// berichtTypAusDepartment (entraSync.js). DH-Studenten zählen zur
// kaufmännischen Ausbildungsleitung (fachliche Vorgabe).
function bereichAusDepartment(department) {
  const d = String(department || '').toLowerCase();
  if (d.includes('gewerblich')) return 'technisch';
  if (d.includes('kaufm')) return 'kaufmaennisch';
  if (d.includes('dh-student') || d.includes('dh student')) return 'kaufmaennisch';
  return null;
}

module.exports = { bereichAusDepartment };
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node --test backend/services/department.test.js`
Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/department.js backend/services/department.test.js
git commit -m "feat(department): bereichAusDepartment - Department auf Bereich abbilden"
```

---

### Task 3: Entra-Sync — `Department` durchreichen

**Files:**
- Modify: `backend/services/entraSync.js:213`

- [ ] **Step 1: `department` an `upsertUser` übergeben**

Aktuell (Zeile 213):

```js
      await upsertUser({ oid: u.oid, name: u.name, email: u.email, role: u.role, beruf: berufAusJobtitle(u.jobTitle), berichtTyp: berichtTypAusDepartment(u.department), letzterLogin: false });
```

Ersetzen durch:

```js
      await upsertUser({ oid: u.oid, name: u.name, email: u.email, role: u.role, beruf: berufAusJobtitle(u.jobTitle), department: u.department ?? null, berichtTyp: berichtTypAusDepartment(u.department), letzterLogin: false });
```

(`u.department` kommt bereits über `resolveMembers` durch — siehe
bestehender Test `resolveMembers: reicht jobTitle und department durch` in
`entraSync.test.js`. Nur der `upsertUser`-Aufruf bekommt das Feld jetzt
zusätzlich zum bereits genutzten `berichtTypAusDepartment(u.department)`.)

- [ ] **Step 2: Bestehende Tests laufen lassen (Regressionscheck)**

Run: `node --test backend/services/entraSync.test.js`
Expected: PASS (alle bisherigen Tests unverändert grün — `department` wird
hier noch nicht gegen eine echte DB geprüft, das folgt in Task 4/7)

- [ ] **Step 3: Commit**

```bash
git add backend/services/entraSync.js
git commit -m "feat(entra-sync): Department an upsertUser durchreichen"
```

---

### Task 4: `users.js` — `Department` speichern & vor Sync schützen (TDD)

**Files:**
- Modify: `backend/services/users.js`
- Test: `backend/services/users.test.js`

- [ ] **Step 1: Failing Tests schreiben**

In `backend/services/users.test.js` nach dem Test `buildReqUser leitet
Azubi-Flags + Profilfelder ab` (endet auf Zeile 32) einfügen:

```js
test('buildReqUser: Department wird durchgereicht', () => {
  const u = buildReqUser({ Oid: 'g1b', Role: 'azubi', Department: 'Kaufmännische Auszubildende' });
  assert.equal(u.department, 'Kaufmännische Auszubildende');
});

test('buildReqUser: fehlendes Department ergibt null', () => {
  const u = buildReqUser({ Oid: 'g1c', Role: 'azubi' });
  assert.equal(u.department, null);
});
```

Nach dem Test `updateUserProfile: ohne aktiv-Feld wird InaktivSeit nicht
angefasst` (endet auf Zeile 230) einfügen:

```js
test('updateUserProfile: Department-Feld wird geschrieben', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { department: 'Gewerbliche Auszubildende' }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.department, 'Gewerbliche Auszubildende');
  assert.match(text, /Department = @department/);
});
```

Nach dem Test `updateUserProfile: mehrere Sync-Felder in einem Patch werden
beide vorgemerkt` (endet auf Zeile 283) einfügen:

```js
test('updateUserProfile: Department-Patch merkt die Spalte in ManuellUeberschriebeneFelder vor', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { department: 'Kaufmännische Auszubildende' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /CHARINDEX\(',Department,'/);
});
```

Im Test `upsertUser: MERGE schützt manuell überschriebene Spalten vor der
Azure-Basisrolle` (Zeile 302-311) die letzte `assert.match`-Zeile ergänzen —
vollständiger Test danach:

```js
test('upsertUser: MERGE schützt manuell überschriebene Spalten vor der Azure-Basisrolle', async () => {
  const pool = fakePool();
  await upsertUser({ oid: 'g1', role: 'azubi', beruf: 'Fachinformatiker', department: 'Kaufmännische Auszubildende', letzterLogin: false }, pool);

  const merge = pool.calls.find((c) => /MERGE dbo\.Users/.test(c.sql));
  assert.ok(merge, 'MERGE-Query nicht gefunden');
  assert.match(merge.sql, /CHARINDEX\(',Role,', ',' \+ t\.ManuellUeberschriebeneFelder \+ ','\) > 0 THEN t\.Role/);
  assert.match(merge.sql, /CHARINDEX\(',Beruf,', ',' \+ t\.ManuellUeberschriebeneFelder \+ ','\) > 0 THEN t\.Beruf/);
  assert.match(merge.sql, /CHARINDEX\(',Department,', ',' \+ t\.ManuellUeberschriebeneFelder \+ ','\) > 0 THEN t\.Department/);
  assert.equal(merge.inputs.role, 'azubi');
  assert.equal(merge.inputs.department, 'Kaufmännische Auszubildende');
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `node --test backend/services/users.test.js`
Expected: FAIL — `u.department` ist `undefined` statt des erwarteten
Strings, `Department = @department` fehlt im generierten SQL, kein
`CHARINDEX(',Department,'` in der MERGE-Query.

- [ ] **Step 3: `users.js` erweitern**

`PATCH_COLUMNS` (Zeile 97-112) — nach der `beruf`-Zeile ergänzen:

```js
  beruf:            { col: 'Beruf',            type: () => sql.NVarChar(200) },
  department:       { col: 'Department',       type: () => sql.NVarChar(200) },
```

`SYNC_PROTECTABLE_COLS` (Zeile 135) — `'Department'` nach `'Beruf'`
ergänzen:

```js
const SYNC_PROTECTABLE_COLS = ['Role', 'KannPlanen', 'IstAusbilder', 'Beruf', 'Department', 'AusbildungBeginn', 'AusbildungEnde', 'BerichtTyp'];
```

`buildReqUser` (Zeile 70) — nach der `beruf`-Zeile ergänzen:

```js
    beruf:             row.Beruf ?? null,
    department:        row.Department ?? null,
```

`upsertUser` — nach dem `beruf`-Input (Zeile 191) ergänzen:

```js
  r.input('beruf',        sql.NVarChar(200),data.beruf ?? null);
  r.input('department',   sql.NVarChar(200),data.department ?? null);
```

Im MERGE-Statement, `SET`-Liste (Zeile 209) — nach der `Beruf`-Zeile
ergänzen:

```js
      Beruf            = ${protectedExpr('Beruf', 'COALESCE(@beruf, t.Beruf)')},
      Department       = ${protectedExpr('Department', 'COALESCE(@department, t.Department)')},
```

`INSERT`-Spaltenliste (Zeile 220) und `VALUES`-Liste (Zeile 222-223) —
`Department`/`@department` jeweils nach `Beruf`/`@beruf` ergänzen:

```js
    WHEN NOT MATCHED THEN INSERT
      (Oid, Name, Email, Role, KannPlanen, IstAusbilder, Beruf, Department, AusbildungBeginn, AusbildungEnde, BerichtTyp, LetzterLogin, ErsteAnmeldung)
    VALUES
      (@oid, @name, @email, COALESCE(@role,'azubi'), COALESCE(@kannPlanen,0), COALESCE(@istAusbilder,0),
       @beruf, @department, @beginn, @ende, COALESCE(@berichtTyp, N'wöchentlich'),
       CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END,
       CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END);
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `node --test backend/services/users.test.js`
Expected: PASS (alle Tests, inkl. der bereits vorher bestehenden)

- [ ] **Step 5: Commit**

```bash
git add backend/services/users.js backend/services/users.test.js
git commit -m "feat(users): Department speichern und vor Sync/Login schuetzen"
```

---

### Task 5: `beurteilungen.js` — `ermittleAusbildungsleiter` auf Department umstellen

**Files:**
- Modify: `backend/services/beurteilungen.js:10,54-70`
- Test: `backend/services/beurteilungen.test.js`

Hinweis: Die bisherige Implementierung ruft intern
`berufeSvc.listBerufe()` auf, das sich seinen eigenen DB-Pool über
`getPool()` besorgt (nicht über den übergebenen `pool`-Parameter) — sie ist
deshalb ohne echte DB nicht sauber testbar (kein bestehender Test dafür).
Die neue Implementierung liest ausschließlich über den übergebenen `pool`
und wird dadurch sauber mockbar. Reihenfolge deshalb hier: erst die
Implementierung umstellen, danach die (jetzt möglichen) Tests schreiben —
keine strikte Red-Green-Abfolge, weil der alte Code keine sinnvolle rote
Baseline liefern würde (er würde einen echten DB-Connect versuchen statt
sauber zu fehlschlagen).

- [ ] **Step 1: Require umstellen**

Zeile 10, aktuell:

```js
const berufeSvc = require('./berufe');
```

Ersetzen durch:

```js
const departmentSvc = require('./department');
```

- [ ] **Step 2: Funktion umstellen**

Zeilen 54-70, aktuell:

```js
// Ermittelt den zuständigen Ausbildungsleiter für einen Azubi: dessen Beruf
// wird über den Berufe-Katalog auf einen Bereich abgebildet, dann wird der
// (einzige vorgesehene) Nutzer mit IstAusbildungsleiter=1 in diesem Bereich
// gesucht. null, wenn kein Katalog-Treffer ODER kein passend getaggter
// Nutzer existiert — beide Fälle werden von den Aufrufern gleich behandelt
// (dritter Schritt entfällt lautlos, siehe Design-Spec, Abschnitt Randfälle).
async function ermittleAusbildungsleiter(pool, azubiOid) {
  const r = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT Beruf FROM dbo.Users WHERE Oid=@oid');
  const beruf = r.recordset[0]?.Beruf ?? null;
  const katalog = await berufeSvc.listBerufe();
  const bereich = berufeSvc.bereichFuerBeruf(beruf, katalog);
  if (!bereich) return null;
  const leiter = await pool.request().input('bereich', sql.NVarChar(20), bereich)
    .query('SELECT TOP 1 Oid FROM dbo.Users WHERE IstAusbildungsleiter=1 AND AusbildungsleiterBereich=@bereich ORDER BY Oid');
  return leiter.recordset[0]?.Oid ?? null;
}
```

Ersetzen durch:

```js
// Ermittelt den zuständigen Ausbildungsleiter für einen Azubi: dessen
// Department wird auf einen Bereich abgebildet (siehe Design-Spec
// 2026-09-01 — ersetzt den bisherigen Beruf+Berufe-Katalog-Weg), dann wird
// der (einzige vorgesehene) Nutzer mit IstAusbildungsleiter=1 in diesem
// Bereich gesucht. null, wenn kein Department-Treffer ODER kein passend
// getaggter Nutzer existiert — beide Fälle werden von den Aufrufern gleich
// behandelt (dritter Schritt entfällt lautlos, siehe Design-Spec, Abschnitt
// Randfälle).
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

- [ ] **Step 3: Tests schreiben**

In `backend/services/beurteilungen.test.js` nach den bestehenden Requires
(Zeile 1-4) einen kleinen Fake-Pool-Helfer ergänzen, der SQL-Texte per
Substring auf ein vorgegebenes `recordset` routet (gleiches Grundmuster wie
`fakePool()` in `users.test.js`, hier aber mit mehreren möglichen Queries
pro Test):

```js
// Fake-Pool für ermittleAusbildungsleiter: routet den SQL-Text per
// Substring auf ein vorgegebenes recordset (zwei verschiedene Queries pro
// Aufruf: erst Department lesen, dann den getaggten Leiter suchen).
function fakePoolFuer(routen) {
  return {
    request() {
      const api = {
        input() { return api; },
        query(text) {
          const treffer = routen.find(([nadel]) => text.includes(nadel));
          return Promise.resolve({ recordset: treffer ? treffer[1] : [] });
        },
      };
      return api;
    },
  };
}
```

Am Ende der Datei ergänzen:

```js
test('ermittleAusbildungsleiter: Department "Gewerbliche Auszubildende" -> technischer Ausbildungsleiter', async () => {
  const pool = fakePoolFuer([
    ['SELECT Department FROM dbo.Users', [{ Department: 'Gewerbliche Auszubildende' }]],
    ['SELECT TOP 1 Oid FROM dbo.Users WHERE IstAusbildungsleiter=1', [{ Oid: 'rossi-oid' }]],
  ]);
  assert.equal(await B.ermittleAusbildungsleiter(pool, 'azubi-oid'), 'rossi-oid');
});

test('ermittleAusbildungsleiter: DH-Studenten landen bei der kaufmaennischen Ausbildungsleitung', async () => {
  const pool = fakePoolFuer([
    ['SELECT Department FROM dbo.Users', [{ Department: 'DH-Studenten' }]],
    ['SELECT TOP 1 Oid FROM dbo.Users WHERE IstAusbildungsleiter=1', [{ Oid: 'kailer-oid' }]],
  ]);
  assert.equal(await B.ermittleAusbildungsleiter(pool, 'dh-oid'), 'kailer-oid');
});

test('ermittleAusbildungsleiter: null ohne Department-Treffer', async () => {
  const pool = fakePoolFuer([
    ['SELECT Department FROM dbo.Users', [{ Department: null }]],
  ]);
  assert.equal(await B.ermittleAusbildungsleiter(pool, 'azubi-oid'), null);
});

test('ermittleAusbildungsleiter: null ohne passend getaggten Nutzer', async () => {
  const pool = fakePoolFuer([
    ['SELECT Department FROM dbo.Users', [{ Department: 'Kaufmännische Auszubildende' }]],
    ['SELECT TOP 1 Oid FROM dbo.Users WHERE IstAusbildungsleiter=1', []],
  ]);
  assert.equal(await B.ermittleAusbildungsleiter(pool, 'azubi-oid'), null);
});
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: PASS (alle Tests, inkl. der bereits vorher bestehenden)

- [ ] **Step 5: Commit**

```bash
git add backend/services/beurteilungen.js backend/services/beurteilungen.test.js
git commit -m "feat(beurteilungen): ermittleAusbildungsleiter ueber Department statt Berufe-Katalog"
```

---

### Task 6: Nutzerverwaltung — Department-Anzeige im Bearbeiten-Modal

**Files:**
- Modify: `app/js/nutzerverwaltung.js:80-83` (Modal-HTML), `:208` (Befüllung)

- [ ] **Step 1: Feld im Modal-HTML ergänzen**

Zeilen 80-83, aktuell:

```html
            <div class="form-group">
              <label class="form-label" for="nvBeruf">Beruf <span class="form-hint">· aus Azure synchronisiert</span></label>
              <input class="form-control" type="text" id="nvBeruf" name="beruf" readonly placeholder="wird beim Login aus Azure (Position) übernommen">
            </div>
```

Ersetzen durch:

```html
            <div class="form-group">
              <label class="form-label" for="nvBeruf">Beruf <span class="form-hint">· aus Azure synchronisiert</span></label>
              <input class="form-control" type="text" id="nvBeruf" name="beruf" readonly placeholder="wird beim Login aus Azure (Position) übernommen">
            </div>
            <div class="form-group">
              <label class="form-label" for="nvDepartment">Department <span class="form-hint">· aus Azure synchronisiert, bestimmt die Ausbildungsleiter-Zuordnung</span></label>
              <input class="form-control" type="text" id="nvDepartment" name="department" readonly placeholder="wird beim Entra-Sync übernommen">
            </div>
```

- [ ] **Step 2: Feld in `openModal()` befüllen**

Zeile 208, aktuell:

```js
    document.getElementById('nvBeruf').value        = u.beruf || '';
```

Ersetzen durch:

```js
    document.getElementById('nvBeruf').value        = u.beruf || '';
    document.getElementById('nvDepartment').value    = u.department || '';
```

(Kein Eintrag in `handleSave()`s `fields`-Objekt — Department bleibt wie
Beruf rein informativ/readonly, wird nicht gesendet.)

- [ ] **Step 3: Manuell im Browser prüfen**

Kein automatisierter Test für dieses UI-Modul vorhanden (reine
DOM-Darstellung). Voraussetzung: Migration 042 ist eingespielt und
mindestens ein Nutzer hat einen `Department`-Wert (siehe Task 7).

1. Backend starten (`npm run dev` im `backend`-Verzeichnis), Nutzerverwaltung
   im Browser öffnen (`http://localhost:3000/app/nutzerverwaltung.html`,
   Developer-Login).
2. Einen Nutzer mit gesetztem Department bearbeiten → Feld "Department"
   zeigt den Wert, ist grau/readonly wie "Beruf".
3. Speichern auslösen, Netzwerk-Tab prüfen: Request-Payload enthält kein
   `department`-Feld.

- [ ] **Step 4: Commit**

```bash
git add app/js/nutzerverwaltung.js
git commit -m "feat(nutzerverwaltung): Department-Anzeige im Bearbeiten-Modal"
```

---

### Task 7: Manuelle End-to-End-Verifikation

**Voraussetzung:** Kuniß hat Migration 042 gegen die Dev-DB eingespielt
(Claude/Agenten haben kein DDL-Recht auf der Dev-DB).

- [ ] **Step 1: Test-Departments für vorhandene Demo-Konten setzen**

Gegen die Dev-DB (durch Kuniß oder mit DB-Schreibrechten) — nutzt die
bestehenden Demo-Konten aus `backend/db/seed-demo-users.sql` (vorher
einspielen, falls dort noch nicht vorhanden):

```sql
-- Azubis (Bereich soll aus dem Department kommen):
UPDATE dbo.Users SET Department = 'Gewerbliche Auszubildende'   WHERE Email = 'florian.kuniss.demo@putzmeister.com'; -- Beruf: Mechatroniker
UPDATE dbo.Users SET Department = 'Kaufmännische Auszubildende' WHERE Email = 'lena.mueller.demo@putzmeister.com';   -- Beruf: Industriekauffrau
UPDATE dbo.Users SET Department = 'DH-Studenten'                WHERE Email = 'jana.hofer.demo@putzmeister.com';    -- dhstudent

-- Ausbildungsleiter-Tags auf zwei bestehende Prüfer-Demo-Konten (noch nicht gesetzt):
UPDATE dbo.Users SET IstAusbildungsleiter = 1, AusbildungsleiterBereich = 'technisch'     WHERE Email = 'matthias.lengerer.demo@putzmeister.com';
UPDATE dbo.Users SET IstAusbildungsleiter = 1, AusbildungsleiterBereich = 'kaufmaennisch' WHERE Email = 'test.pruefer.demo@putzmeister.com';
```

- [ ] **Step 2: Browser-Checks**

Backend starten, im Browser als jeweiliger Prüfer/Beurteiler anmelden (Demo-
Login, siehe `reference_local_app_testing`), den Beurteilungsbogen einer
abgeschlossenen Beurteilung öffnen:

1. Florian Kuniß (Demo, `Department = 'Gewerbliche Auszubildende'`) → der
   dritte Schritt (Ausbildungsleiter-Bestätigung) geht an Matthias Lengerer
   (`technisch`-getaggt).
2. Lena Müller (Demo, `Department = 'Kaufmännische Auszubildende'`) → geht
   an Test Prüfer (IT) (`kaufmaennisch`-getaggt).
3. Jana Hofer (Demo, `Department = 'DH-Studenten'`) → geht ebenfalls an
   Test Prüfer (IT)/kaufmännisch (bisher entfiel der Schritt hier immer
   lautlos — das ist der Kernfix dieser Änderung).
4. Ein Azubi ohne Department (z. B. Florian Kern, Demo, noch kein
   `Department` gesetzt) → Schritt entfällt lautlos, kein Fehler, kein
   500er.

- [ ] **Step 3: Ergebnis festhalten**

Kurz im PR/der Commit-Historie vermerken, welche der vier Fälle geprüft
wurden (siehe Spec, Abschnitt "Verifikation").
