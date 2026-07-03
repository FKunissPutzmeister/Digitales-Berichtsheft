# Abteilungs-Katalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das freie Textfeld „Abteilung" im Azubi-Planer wird zu einer Auswahl aus einem gepflegten Katalog von 31 Abteilungen mit hinterlegten (E-Mail-verankerten) Verantwortlichen.

**Architecture:** Zwei neue Tabellen (`dbo.Abteilungen`, `dbo.AbteilungVerantwortliche`) halten den Katalog; Verantwortliche werden per **E-Mail (UPN)** geführt, nicht per OID. `dbo.Zuweisungen.AusbilderOid` wird durch `VerantwEmail` ersetzt. Beim SSO-Login werden Anzeigename/OID im Katalog nachgezogen. Neue developer-only Pflege-UI + Endpoints im Stil der bestehenden Nutzerverwaltung.

**Tech Stack:** Node/Express (CommonJS), `mssql` (`getPool()`/`sql` aus `backend/db/connection.js`), Vanilla-JS-Frontend (kein Build), Tests via `node:test` + `node:assert/strict`.

## Global Constraints

- Verantwortliche werden **durchgängig per E-Mail (UPN, lowercase gespeichert)** referenziert; OID ist nur informativ und wird beim Login nachgezogen — nie Schlüssel.
- IDs für User/Azubi/Verantwortliche sind GUID-Strings bzw. E-Mails — **niemals `parseInt`** (nur `dbo.Abteilungen.Id`/`AbteilungVerantwortliche.Id`/`Zuweisungen.Id` sind Integer).
- PMM-Abteilungsnamen tragen den Suffix `" PMM"` im `Name`; `IstPmm=1` dient nur Gruppierung/Badge.
- Schreibende Katalog-Operationen sind **developer-only** (wie `PATCH /api/users`, `req.user.role === 'developer'`); `GET /api/abteilungen` ist für alle authentifizierten Nutzer lesbar.
- Umlaut-Form der App beibehalten: `wöchentlich`/`täglich`, Abteilungsnamen wie geliefert (z. B. „Qualitätssicherung").
- Tests müssen mit `node --test <datei>` grün und die Ausgabe sauber (keine unerwarteten Logs) sein.
- DB-Migration + Seed brauchen einen **DDL-fähigen Account** (Laufzeit-User `Berichtsheft_dev1` hat keine CREATE/ALTER-Rechte) → alle Runtime-/DB-Verifikationen sind bis zur Migration **deferred**; Tasks laufen auf Code + Unit-Tests.
- Scoped `git add <datei>` je Commit — nie `git add .`/`-A`. `backend/.env` niemals committen.

---

### Task 1: DB-Migration + Seed (SQL)

**Files:**
- Create: `backend/db/create-abteilungen-table.sql`
- Create: `backend/db/seed-abteilungen.sql`

**Interfaces:**
- Produces: Tabellen `dbo.Abteilungen(Id,Name,IstPmm,Aktiv)`, `dbo.AbteilungVerantwortliche(Id,AbteilungId,Email,Anzeigename,Oid)`; Spalte `dbo.Zuweisungen.VerantwEmail NVARCHAR(255)` (ersetzt `AusbilderOid`).

Keine Unit-Tests (statisches SQL). Deliverable = reviewbares, idempotentes SQL. **Kann wg. DDL-Blocker nicht ausgeführt werden** — Controller-Review genügt.

- [ ] **Step 1: Migration-SQL schreiben**

Datei `backend/db/create-abteilungen-table.sql`:

```sql
/* Abteilungs-Katalog + E-Mail-verankerte Verantwortliche.
   Idempotent; ALTER an dbo.Zuweisungen defensiv (Tabelle existiert bereits,
   hat aber kein committetes CREATE-Skript). */

IF OBJECT_ID('dbo.Abteilungen', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Abteilungen (
    Id     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name   NVARCHAR(120) NOT NULL,
    IstPmm BIT NOT NULL DEFAULT 0,
    Aktiv  BIT NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IX_Abteilungen_Name ON dbo.Abteilungen(Name);
  PRINT 'Tabelle dbo.Abteilungen angelegt.';
END
ELSE PRINT 'dbo.Abteilungen existiert bereits.';

IF OBJECT_ID('dbo.AbteilungVerantwortliche', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AbteilungVerantwortliche (
    Id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AbteilungId INT NOT NULL,
    Email       NVARCHAR(255) NOT NULL,
    Anzeigename NVARCHAR(200) NULL,
    Oid         NVARCHAR(36)  NULL,
    CONSTRAINT FK_AbteilungVerantw_Abteilung
      FOREIGN KEY (AbteilungId) REFERENCES dbo.Abteilungen(Id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IX_AbteilungVerantw_AbtEmail
    ON dbo.AbteilungVerantwortliche(AbteilungId, Email);
  CREATE INDEX IX_AbteilungVerantw_Email ON dbo.AbteilungVerantwortliche(Email);
  PRINT 'Tabelle dbo.AbteilungVerantwortliche angelegt.';
END
ELSE PRINT 'dbo.AbteilungVerantwortliche existiert bereits.';

/* dbo.Zuweisungen: AusbilderOid -> VerantwEmail. Bestand wird geleert
   (User bestätigt), daher kein Daten-Backfill der neuen Spalte nötig. */
IF COL_LENGTH('dbo.Zuweisungen', 'VerantwEmail') IS NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen ADD VerantwEmail NVARCHAR(255) NULL;
  PRINT 'Spalte dbo.Zuweisungen.VerantwEmail angelegt.';
END
ELSE PRINT 'dbo.Zuweisungen.VerantwEmail existiert bereits.';

DELETE FROM dbo.Zuweisungen;
PRINT 'dbo.Zuweisungen geleert (sauberer Start).';

IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen DROP COLUMN AusbilderOid;
  PRINT 'Spalte dbo.Zuweisungen.AusbilderOid entfernt.';
END
ELSE PRINT 'dbo.Zuweisungen.AusbilderOid existiert nicht (schon entfernt).';
```

- [ ] **Step 2: Seed-SQL schreiben**

Datei `backend/db/seed-abteilungen.sql`. Alle E-Mails lowercase, Domäne `@putzmeister.com`. Nutzt eine Helfer-Prozedur-freie, wiederholbare Form: pro Abteilung upsert per Name, dann Verantwortliche upsert per (AbteilungId, Email). Idempotent via `NOT EXISTS`.

```sql
/* Seed: 31 Abteilungen + Verantwortliche (E-Mail, lowercase).
   Idempotent: legt nur an, was fehlt. */
SET NOCOUNT ON;

DECLARE @cat TABLE (Name NVARCHAR(120), IstPmm BIT, Email NVARCHAR(255));

INSERT INTO @cat (Name, IstPmm, Email) VALUES
 (N'Lehrwerkstatt', 0, 'marco.rossi@putzmeister.com'),
 (N'Montage', 0, 'marco.rossi@putzmeister.com'),
 (N'Empfang', 0, 'sandra.pereira@putzmeister.com'),
 (N'Empfang', 0, 'katja.riester@putzmeister.com'),
 (N'Empfang', 0, 'thomas.look@putzmeister.com'),
 (N'Telefonzentrale', 0, 'sandra.pereira@putzmeister.com'),
 (N'Telefonzentrale', 0, 'katja.riester@putzmeister.com'),
 (N'Telefonzentrale', 0, 'thomas.look@putzmeister.com'),
 (N'Posteingang und -Verteilung', 0, 'thomas.look@putzmeister.com'),
 (N'Posteingang und -Verteilung', 0, 'elena-geanina.rusu@putzmeister.com'),
 (N'Qualitätssicherung', 0, 'karlheinz.roedler@putzmeister.com'),
 (N'Qualitätssicherung', 0, 'korhan.demirbilek@putzmeister.com'),
 (N'Wareneingangskontrolle', 0, 'karlheinz.roedler@putzmeister.com'),
 (N'Wareneingangskontrolle', 0, 'korhan.demirbilek@putzmeister.com'),
 (N'Werkzeuglager', 0, 'michael.haefner@putzmeister.com'),
 (N'Werkzeuglager', 0, 'matthias.bulling@putzmeister.com'),
 (N'Werkzeuglager', 0, 'barbara.rapp@putzmeister.com'),
 (N'Fertigungssteuerung', 0, 'timo.lechler@putzmeister.com'),
 (N'Fertigungssteuerung', 0, 'barbara.rapp@putzmeister.com'),
 (N'Produktmanagement', 0, 'patrick.hildenbrand@putzmeister.com'),
 (N'Produktmanagement', 0, 'christian.plavac@putzmeister.com'),
 (N'Einkauf', 0, 'frank.wenzel@putzmeister.com'),
 (N'Einkauf', 0, 'sebastian.grieb@putzmeister.com'),
 (N'Einkauf', 0, 'christian.weyermann@putzmeister.com'),
 (N'Einkauf', 0, 'nadine.koller@putzmeister.com'),
 (N'Disposition', 0, 'jacqueline.schnizler@putzmeister.com'),
 (N'Disposition', 0, 'maik.flammer@putzmeister.com'),
 (N'Finanz- und Rechnungswesen', 0, 'clemens.thrum@putzmeister.com'),
 (N'Finance and Risk Management', 0, 'hanns-carl.riethmueller@putzmeister.com'),
 (N'Personalwesen', 0, 'anika.kailer@putzmeister.com'),
 (N'Personalwesen', 0, 'linda.ebner@putzmeister.com'),
 (N'Personalwesen', 0, 'kai.knillmann@putzmeister.com'),
 (N'Entgeltabrechnung', 0, 'anika.kailer@putzmeister.com'),
 (N'Entgeltabrechnung', 0, 'linda.ebner@putzmeister.com'),
 (N'Entgeltabrechnung', 0, 'kai.knillmann@putzmeister.com'),
 (N'Service EMEA', 0, 'nadine.lechler@putzmeister.com'),
 (N'Service EMEA', 0, 'frank.riderer@putzmeister.com'),
 (N'Sales Planning', 0, 'stefanie.kuhn@putzmeister.com'),
 (N'Sales Planning', 0, 'torsten.werner@putzmeister.com'),
 (N'Machines CT', 0, 'alessandra.giamouridis@putzmeister.com'),
 (N'Machines CT', 0, 'joey-melina.janicsek@putzmeister.com'),
 (N'Machines CT', 0, 'eva.kernchen@putzmeister.com'),
 (N'Parts CT', 0, 'alessandra.giamouridis@putzmeister.com'),
 (N'Parts CT', 0, 'joey-melina.janicsek@putzmeister.com'),
 (N'Parts CT', 0, 'eva.kernchen@putzmeister.com'),
 (N'Logistik Management', 0, 'marian.deregowski@putzmeister.com'),
 (N'Logistik Management', 0, 'stephan.frank@putzmeister.com'),
 (N'Logistik Management', 0, 'tanja.broeder@putzmeister.com'),
 (N'Marketing PMH', 0, 'ann-kathrin.gehr@putzmeister.com'),
 (N'Marketing PMH', 0, 'julia.haag@putzmeister.com'),
 (N'Marketing PMH', 0, 'michael.walder@putzmeister.com'),
 (N'IT', 0, 'matthias.lengerer@putzmeister.com'),
 (N'Wareneingang PMM', 1, 'ruediger.breuning@putzmeister.com'),
 (N'Versand PMM', 1, 'ruediger.breuning@putzmeister.com'),
 (N'Einkauf PMM', 1, 'marcus.anderson@putzmeister.com'),
 (N'Dispo PMM', 1, 'marcus.anderson@putzmeister.com'),
 (N'FST PMM', 1, 'thomas.ruecker@putzmeister.com'),
 (N'APS PMM', 1, 'simone.schuett@putzmeister.com'),
 (N'Vertrieb PMM', 1, 'markus.hybl@putzmeister.com'),
 (N'QS PMM', 1, 'markus.hybl@putzmeister.com');

-- Abteilungen anlegen (fehlende)
INSERT INTO dbo.Abteilungen (Name, IstPmm, Aktiv)
SELECT DISTINCT c.Name, c.IstPmm, 1
FROM @cat c
WHERE NOT EXISTS (SELECT 1 FROM dbo.Abteilungen a WHERE a.Name = c.Name);

-- Verantwortliche anlegen (fehlende)
INSERT INTO dbo.AbteilungVerantwortliche (AbteilungId, Email)
SELECT a.Id, c.Email
FROM @cat c
JOIN dbo.Abteilungen a ON a.Name = c.Name
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.AbteilungVerantwortliche v
  WHERE v.AbteilungId = a.Id AND v.Email = c.Email
);

PRINT 'Abteilungs-Seed abgeschlossen.';
```

- [ ] **Step 3: Beide Dateien auf Vollständigkeit prüfen (31 Namen, QS PMM = markus.hybl)**

Zähle die DISTINCT `Name` in `@cat`: müssen **31** sein. Prüfe `QS PMM` → `markus.hybl`. Kein Ausführen möglich (DDL-Blocker).

- [ ] **Step 4: Commit**

```bash
git add backend/db/create-abteilungen-table.sql backend/db/seed-abteilungen.sql
git commit -m "feat(abteilungen): DB-Migration + Seed für Abteilungs-Katalog"
```

---

### Task 2: Abteilungs-Service — reine Helfer + Validierung

**Files:**
- Create: `backend/services/abteilungen.js`
- Test: `backend/services/abteilungen.test.js`

**Interfaces:**
- Produces: `deriveName(email) -> string`, `normalizeEmail(email) -> string`, `validateAbteilung(fields, {partial}) -> {ok, error?}`, `validateVerantwEmail(email) -> {ok, error?}`. (DB-Funktionen kommen in Task 3 in dieselbe Datei.)

- [ ] **Step 1: Failing Test schreiben**

Datei `backend/services/abteilungen.test.js`:

```js
'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveName, normalizeEmail, validateAbteilung, validateVerantwEmail } = require('./abteilungen');

test('deriveName: lokaler Teil, Punkte -> Leerzeichen, Bindestriche bleiben', () => {
  assert.equal(deriveName('ruediger.breuning@putzmeister.com'), 'Ruediger Breuning');
  assert.equal(deriveName('ann-kathrin.gehr@putzmeister.com'), 'Ann-Kathrin Gehr');
  assert.equal(deriveName('hanns-carl.riethmueller@x'), 'Hanns-Carl Riethmueller');
  assert.equal(deriveName('it@putzmeister.com'), 'It');
});

test('deriveName: leer/undefined -> leerer String', () => {
  assert.equal(deriveName(''), '');
  assert.equal(deriveName(undefined), '');
  assert.equal(deriveName(null), '');
});

test('normalizeEmail: trimmt + lowercased', () => {
  assert.equal(normalizeEmail('  Korhan.DEMIRBILEK@Putzmeister.com '), 'korhan.demirbilek@putzmeister.com');
  assert.equal(normalizeEmail(undefined), '');
});

test('validateAbteilung: Name Pflicht, <=120, IstPmm/Aktiv bool', () => {
  assert.equal(validateAbteilung({ name: 'Einkauf' }).ok, true);
  assert.equal(validateAbteilung({ name: '' }).ok, false);
  assert.equal(validateAbteilung({ name: 'x'.repeat(121) }).ok, false);
  assert.equal(validateAbteilung({ name: 'A', istPmm: 'ja' }).ok, false);
  assert.equal(validateAbteilung({}).ok, false);
});

test('validateAbteilung partial: Name optional, aber leerer Patch invalid', () => {
  assert.equal(validateAbteilung({ aktiv: false }, { partial: true }).ok, true);
  assert.equal(validateAbteilung({}, { partial: true }).ok, false);
  assert.equal(validateAbteilung({ unbekannt: 1 }, { partial: true }).ok, false);
});

test('validateVerantwEmail: nicht-leer + enthält @', () => {
  assert.equal(validateVerantwEmail('max.muster@putzmeister.com').ok, true);
  assert.equal(validateVerantwEmail('keinemail').ok, false);
  assert.equal(validateVerantwEmail('').ok, false);
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `node --test backend/services/abteilungen.test.js`
Expected: FAIL — `Cannot find module './abteilungen'`.

- [ ] **Step 3: Service-Datei mit reinen Helfern anlegen**

Datei `backend/services/abteilungen.js`:

```js
'use strict';
/* =====================================================================
   ABTEILUNGS-KATALOG-SERVICE.
   Dieser Abschnitt: reine Logik (Namensableitung, E-Mail-Normalisierung,
   Validierung). DB-Zugriffsfunktionen folgen weiter unten (Task 3).
   ===================================================================== */
const { getPool, sql } = require('../db/connection');

// E-Mail (UPN) -> Anzeigename-Fallback bis Azure den echten Namen liefert.
// "ruediger.breuning@x" -> "Ruediger Breuning"; Bindestriche bleiben.
function deriveName(email) {
  if (!email) return '';
  const local = String(email).split('@')[0];
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return local
    .split('.')
    .map((word) => word.split('-').map(cap).join('-'))
    .filter(Boolean)
    .join(' ')
    .trim();
}

// UPN einheitlich klein + getrimmt speichern/vergleichen.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const NAME_MAX = 120;

// Validierung fürs Anlegen (name Pflicht) bzw. Patch (partial: name optional,
// aber mind. ein bekanntes Feld). Unbekannte Felder -> invalid.
function validateAbteilung(fields, { partial = false } = {}) {
  const known = ['name', 'istPmm', 'aktiv'];
  const keys = Object.keys(fields || {});
  if (keys.length === 0) return { ok: false, error: 'Keine Felder angegeben' };
  for (const k of keys) if (!known.includes(k)) return { ok: false, error: `Unbekanntes Feld: ${k}` };
  if (!partial || 'name' in fields) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) return { ok: false, error: 'Name ist Pflicht' };
    if (fields.name.length > NAME_MAX) return { ok: false, error: `Name max. ${NAME_MAX} Zeichen` };
  }
  if ('istPmm' in fields && typeof fields.istPmm !== 'boolean') return { ok: false, error: 'istPmm muss boolean sein' };
  if ('aktiv' in fields && typeof fields.aktiv !== 'boolean') return { ok: false, error: 'aktiv muss boolean sein' };
  return { ok: true };
}

function validateVerantwEmail(email) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return { ok: false, error: 'Gültige E-Mail erforderlich' };
  return { ok: true };
}

module.exports = { deriveName, normalizeEmail, validateAbteilung, validateVerantwEmail };
```

- [ ] **Step 4: Test ausführen (muss bestehen)**

Run: `node --test backend/services/abteilungen.test.js`
Expected: PASS (alle Tests grün, saubere Ausgabe).

- [ ] **Step 5: Commit**

```bash
git add backend/services/abteilungen.js backend/services/abteilungen.test.js
git commit -m "feat(abteilungen): reine Service-Helfer (deriveName/validate) + Tests"
```

---

### Task 3: Abteilungs-Service — DB-Funktionen

**Files:**
- Modify: `backend/services/abteilungen.js` (DB-Funktionen ergänzen + exportieren)

**Interfaces:**
- Consumes: `deriveName`, `normalizeEmail` (Task 2); `getPool`, `sql`.
- Produces:
  - `listAbteilungen({inclInactive}) -> [{id,name,istPmm,aktiv,verantwortliche:[{id,email,name,oid}]}]`
  - `createAbteilung({name,istPmm,aktiv}) -> {id,...}`
  - `updateAbteilung(id, fields) -> {id,...} | null`
  - `deleteAbteilung(id) -> void`
  - `addVerantwortliche(abteilungId, email) -> {id,email,name,oid}` (wirft `{code:'DUP'}` bei Kollision)
  - `removeVerantwortliche(verantwId) -> void`
  - `backfillVerantwortlicheByEmail(email, name, oid) -> void`

DB-Verifikation ist wg. Blocker deferred → Controller-Review der Query-Sicherheit (parametrisiert, Injection-frei). Keine neuen Unit-Tests (reine DB-Funktionen; die Task-2-Tests bleiben grün).

- [ ] **Step 1: DB-Funktionen ergänzen**

In `backend/services/abteilungen.js` VOR `module.exports` einfügen:

```js
// Katalog inkl. Verantwortliche. inclInactive=false blendet Aktiv=0 aus
// (Planer-Dropdown); true zeigt alle (Pflege-UI).
async function listAbteilungen({ inclInactive = true } = {}) {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT Id, Name, IstPmm, Aktiv FROM dbo.Abteilungen ORDER BY Name;
    SELECT Id, AbteilungId, Email, Anzeigename, Oid FROM dbo.AbteilungVerantwortliche;
  `);
  const [abt, verantw] = res.recordsets;
  const byAbt = {};
  for (const v of verantw) (byAbt[v.AbteilungId] = byAbt[v.AbteilungId] || []).push(v);
  return abt
    .filter((a) => inclInactive || a.Aktiv)
    .map((a) => ({
      id: a.Id,
      name: a.Name,
      istPmm: !!a.IstPmm,
      aktiv: a.Aktiv !== false,
      verantwortliche: (byAbt[a.Id] || [])
        .map((v) => ({ id: v.Id, email: v.Email, name: v.Anzeigename || deriveName(v.Email), oid: v.Oid || null }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

async function createAbteilung({ name, istPmm = false, aktiv = true }) {
  const pool = await getPool();
  const res = await pool.request()
    .input('name', sql.NVarChar(120), name.trim())
    .input('istPmm', sql.Bit, istPmm ? 1 : 0)
    .input('aktiv', sql.Bit, aktiv ? 1 : 0)
    .query(`INSERT INTO dbo.Abteilungen (Name, IstPmm, Aktiv)
            OUTPUT inserted.Id VALUES (@name, @istPmm, @aktiv)`);
  return { id: res.recordset[0].Id, name: name.trim(), istPmm: !!istPmm, aktiv: !!aktiv, verantwortliche: [] };
}

// Dynamisches UPDATE nur der übergebenen Felder. Gibt die frische Abteilung
// (inkl. Verantwortliche) zurück, oder null bei unbekannter Id.
async function updateAbteilung(id, fields) {
  const map = { name: { col: 'Name', type: () => sql.NVarChar(120), val: (v) => v.trim() },
                istPmm: { col: 'IstPmm', type: () => sql.Bit, val: (v) => (v ? 1 : 0) },
                aktiv: { col: 'Aktiv', type: () => sql.Bit, val: (v) => (v ? 1 : 0) } };
  const pool = await getPool();
  const r = pool.request().input('id', sql.Int, id);
  const sets = [];
  for (const [k, def] of Object.entries(map)) {
    if (k in fields) { r.input(k, def.type(), def.val(fields[k])); sets.push(`${def.col} = @${k}`); }
  }
  if (sets.length === 0) return await getAbteilungById(id);
  await r.query(`UPDATE dbo.Abteilungen SET ${sets.join(', ')} WHERE Id = @id`);
  return await getAbteilungById(id);
}

async function getAbteilungById(id) {
  const all = await listAbteilungen({ inclInactive: true });
  return all.find((a) => a.id === id) || null;
}

async function deleteAbteilung(id) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id)
    .query('DELETE FROM dbo.Abteilungen WHERE Id = @id'); // Verantwortliche via ON DELETE CASCADE
}

// Fügt eine/n Verantwortliche/n hinzu. Kollision (bereits vorhanden) -> Error mit code 'DUP'.
async function addVerantwortliche(abteilungId, email) {
  const e = normalizeEmail(email);
  const pool = await getPool();
  const dup = await pool.request()
    .input('aid', sql.Int, abteilungId).input('email', sql.NVarChar(255), e)
    .query('SELECT TOP 1 Id FROM dbo.AbteilungVerantwortliche WHERE AbteilungId=@aid AND Email=@email');
  if (dup.recordset.length) { const err = new Error('Verantwortliche/r bereits zugeordnet'); err.code = 'DUP'; throw err; }
  const res = await pool.request()
    .input('aid', sql.Int, abteilungId).input('email', sql.NVarChar(255), e)
    .query(`INSERT INTO dbo.AbteilungVerantwortliche (AbteilungId, Email)
            OUTPUT inserted.Id, inserted.Email, inserted.Anzeigename, inserted.Oid
            VALUES (@aid, @email)`);
  const row = res.recordset[0];
  return { id: row.Id, email: row.Email, name: row.Anzeigename || deriveName(row.Email), oid: row.Oid || null };
}

async function removeVerantwortliche(verantwId) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, verantwId)
    .query('DELETE FROM dbo.AbteilungVerantwortliche WHERE Id = @id');
}

// Beim SSO-Login: echten Azure-Namen + OID im Katalog nachziehen (per E-Mail).
async function backfillVerantwortlicheByEmail(email, name, oid) {
  const e = normalizeEmail(email);
  if (!e) return;
  const pool = await getPool();
  await pool.request()
    .input('email', sql.NVarChar(255), e)
    .input('name', sql.NVarChar(200), name ?? null)
    .input('oid', sql.NVarChar(36), oid ?? null)
    .query(`UPDATE dbo.AbteilungVerantwortliche
               SET Anzeigename = COALESCE(@name, Anzeigename),
                   Oid         = COALESCE(@oid, Oid)
             WHERE Email = @email`);
}
```

- [ ] **Step 2: Exporte erweitern**

`module.exports` in `backend/services/abteilungen.js` ersetzen durch:

```js
module.exports = {
  deriveName, normalizeEmail, validateAbteilung, validateVerantwEmail,
  listAbteilungen, createAbteilung, updateAbteilung, getAbteilungById,
  deleteAbteilung, addVerantwortliche, removeVerantwortliche,
  backfillVerantwortlicheByEmail,
};
```

- [ ] **Step 3: Syntax + Bestandstests prüfen**

Run: `node --check backend/services/abteilungen.js`
Expected: keine Ausgabe (ok).
Run: `node --test backend/services/abteilungen.test.js`
Expected: PASS (Task-2-Tests weiter grün).

- [ ] **Step 4: Commit**

```bash
git add backend/services/abteilungen.js
git commit -m "feat(abteilungen): DB-Funktionen (list/create/update/delete/verantw/backfill)"
```

---

### Task 4: Endpoints + Mount + Login-Backfill

**Files:**
- Create: `backend/routes/abteilungen.js`
- Modify: `backend/server.js` (Router mounten)
- Modify: `backend/services/users.js` (`upsertUser` ruft Backfill)

**Interfaces:**
- Consumes: `backend/services/abteilungen.js` (alle Task-3-Funktionen + `validateAbteilung`/`validateVerantwEmail`); Mount-Muster `app.use('/api/…', devAuth, router)`.
- Produces: REST unter `/api/abteilungen` (siehe Tabelle in der Spec); `upsertUser` zieht bei jedem Login den Katalog-Namen/OID nach.

Route-Verhalten (developer-only, 403/400/404/409) ist wg. DB-Blocker per Review verifiziert; keine Route-Integrationstests (Projektmuster: reine Logik testen, Routen reviewen).

- [ ] **Step 1: Router schreiben**

Datei `backend/routes/abteilungen.js`:

```js
'use strict';
/* =====================================================================
   Abteilungs-Katalog-Routen: /api/abteilungen
   GET ist für alle authentifizierten Nutzer lesbar (Planer-Dropdown);
   alle schreibenden Operationen sind developer-only.
   ===================================================================== */
const router = require('express').Router();
const svc = require('../services/abteilungen');

function requireDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  next();
}

// GET /api/abteilungen[?all=1]  (all=1 nur developer -> inkl. inaktive)
router.get('/', async (req, res) => {
  try {
    const inclInactive = req.query.all === '1' && req.user.role === 'developer';
    res.json(await svc.listAbteilungen({ inclInactive }));
  } catch (e) { console.error('[abteilungen] list:', e); res.status(500).json({ error: 'Fehler' }); }
});

// POST /api/abteilungen
router.post('/', requireDeveloper, async (req, res) => {
  const check = svc.validateAbteilung(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    res.json(await svc.createAbteilung(req.body));
  } catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Abteilung existiert bereits' });
    console.error('[abteilungen] create:', e); res.status(500).json({ error: 'Fehler' });
  }
});

// PATCH /api/abteilungen/:id
router.patch('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  const check = svc.validateAbteilung(req.body || {}, { partial: true });
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const row = await svc.updateAbteilung(id, req.body);
    if (!row) return res.status(404).json({ error: 'Abteilung nicht gefunden' });
    res.json(row);
  } catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Name bereits vergeben' });
    console.error('[abteilungen] patch:', e); res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/abteilungen/:id
router.delete('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  try { await svc.deleteAbteilung(id); res.json({ ok: true }); }
  catch (e) { console.error('[abteilungen] delete:', e); res.status(500).json({ error: 'Fehler' }); }
});

// POST /api/abteilungen/:id/verantwortliche  { email }
router.post('/:id/verantwortliche', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  const check = svc.validateVerantwEmail((req.body || {}).email);
  if (!check.ok) return res.status(400).json({ error: check.error });
  try { res.json(await svc.addVerantwortliche(id, req.body.email)); }
  catch (e) {
    if (e.code === 'DUP') return res.status(409).json({ error: e.message });
    console.error('[abteilungen] addVerantw:', e); res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/abteilungen/:id/verantwortliche/:vid
router.delete('/:id/verantwortliche/:vid', requireDeveloper, async (req, res) => {
  const vid = Number(req.params.vid);
  if (!Number.isInteger(vid)) return res.status(400).json({ error: 'Ungültige Id' });
  try { await svc.removeVerantwortliche(vid); res.json({ ok: true }); }
  catch (e) { console.error('[abteilungen] removeVerantw:', e); res.status(500).json({ error: 'Fehler' }); }
});

module.exports = router;
```

- [ ] **Step 2: Router in server.js mounten**

In `backend/server.js` bei den Router-Requires (nach Zeile 97, `zuweisungenRouter`) ergänzen:

```js
const abteilungenRouter    = require('./routes/abteilungen');
```

und bei den Mounts (nach Zeile 105, `app.use('/api/zuweisungen', …)`) ergänzen:

```js
app.use('/api/abteilungen',         devAuth, abteilungenRouter);
```

- [ ] **Step 3: Backfill in upsertUser einhängen**

In `backend/services/users.js`:

Oben bei den Requires (nach Zeile 7, `const { getPool, sql } = …`) ergänzen:

```js
const { backfillVerantwortlicheByEmail, normalizeEmail } = require('./abteilungen');
```

Am **Ende** von `upsertUser` (nach dem `await r.query(...)`-MERGE, vor Funktionsende) ergänzen:

```js
  // Katalog-Verantwortliche mit echtem Azure-Namen/OID nachziehen (per E-Mail).
  // Defensiv: fehlt der Abteilungs-Katalog (vor Migration), darf der Login nicht brechen.
  if (data.email) {
    try { await backfillVerantwortlicheByEmail(normalizeEmail(data.email), data.name ?? null, data.oid ?? null); }
    catch (e) { console.error('[users] backfill verantwortliche:', e.message); }
  }
```

- [ ] **Step 4: Syntax prüfen**

Run: `node --check backend/routes/abteilungen.js`
Run: `node --check backend/server.js`
Run: `node --check backend/services/users.js`
Expected: keine Ausgabe (ok).
Run: `node --test backend/services/abteilungen.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/abteilungen.js backend/server.js backend/services/users.js
git commit -m "feat(abteilungen): REST-Endpoints + Mount + Login-Backfill"
```

---

### Task 5: Frontend-API — deriveName, Zuweisungs-Normalisierung, Katalog-Methoden

**Files:**
- Modify: `app/js/api.js`
- Test: `app/js/abteilungen-api.test.js` (neu — testet die reinen Helfer)

**Interfaces:**
- Consumes: `apiFetch`, `normalizeUser`, `toDateStr` (bestehend).
- Produces (auf `DB` + global):
  - `deriveName(email)` (global, analog `DateUtil`)
  - `normalizeZuweisung(z)` liefert künftig `{ id, azubiId, verantwEmail, verantwName, abteilung, von, bis }` (kein `ausbilderId` mehr)
  - `DB.addZuweisung({azubiId, verantwEmail, abteilung, von, bis})`
  - `DB.getZuweisungenFuerVerantw(email)` (ersetzt `getZuweisungenFuerAusbilder`)
  - `DB.getAbteilungen({all})`, `DB.createAbteilung`, `DB.updateAbteilung`, `DB.deleteAbteilung`, `DB.addVerantwortliche`, `DB.removeVerantwortliche`

- [ ] **Step 1: Failing Test schreiben**

Datei `app/js/abteilungen-api.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveName } = require('./abteilungen-helpers.js');

test('deriveName (frontend) spiegelt Backend-Verhalten', () => {
  assert.equal(deriveName('ruediger.breuning@putzmeister.com'), 'Ruediger Breuning');
  assert.equal(deriveName('ann-kathrin.gehr@putzmeister.com'), 'Ann-Kathrin Gehr');
  assert.equal(deriveName(''), '');
});
```

Damit `deriveName` sowohl im Browser (global via `api.js`) als auch im Test (CommonJS) nutzbar ist, wird die reine Funktion in eine kleine, dual-nutzbare Datei ausgelagert.

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `node --test app/js/abteilungen-api.test.js`
Expected: FAIL — `Cannot find module './abteilungen-helpers.js'`.

- [ ] **Step 3: Dual-nutzbaren Helfer anlegen**

Datei `app/js/abteilungen-helpers.js`:

```js
/* deriveName: E-Mail (UPN) -> Anzeigename-Fallback. Identisch zum Backend
   (backend/services/abteilungen.js). Browser: global; Node/Test: module.exports. */
(function (root) {
  function deriveName(email) {
    if (!email) return '';
    const local = String(email).split('@')[0];
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    return local.split('.').map((w) => w.split('-').map(cap).join('-')).filter(Boolean).join(' ').trim();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { deriveName };
  else root.deriveName = deriveName;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Test ausführen (muss bestehen)**

Run: `node --test app/js/abteilungen-api.test.js`
Expected: PASS.

- [ ] **Step 5: `abteilungen-helpers.js` in alle HTML-Seiten einbinden**

Auf **jeder** HTML-Seite, die `js/api.js` einbindet, **direkt davor** ergänzen:

```html
<script src="js/abteilungen-helpers.js"></script>
```

Implementer: Seiten ermitteln mit `grep -rl "js/api.js" app/*.html` und den Helfer auf allen gelisteten Seiten vor `api.js` einfügen (nicht nur die 6 Anzeige-Seiten — jede Seite, die `normalizeZuweisung` indirekt über `DB.*Zuweisungen*` nutzt, braucht `deriveName`). Der defensive Fallback in `normalizeZuweisung` (Step 6) verhindert Crashes, liefert ohne Helfer aber nur die rohe E-Mail statt des Namens.

- [ ] **Step 6: `normalizeZuweisung` umstellen**

In `app/js/api.js` die Funktion `normalizeZuweisung` (Zeilen 107-116) ersetzen durch:

```js
function normalizeZuweisung(z) {
  const email = z.VerantwEmail ?? '';
  // Defensiv: falls abteilungen-helpers.js auf einer Seite fehlt, nicht crashen.
  const dn = (typeof deriveName === 'function') ? deriveName : (e) => e;
  return {
    id: z.Id,
    azubiId: z.AzubiOid,
    verantwEmail: email,
    verantwName: email ? dn(email) : '',
    abteilung: z.Abteilung ?? '',
    von: toDateStr(z.Von),
    bis: toDateStr(z.Bis),
  };
}
```

- [ ] **Step 7: `addZuweisung` + Reverse-Lookup umstellen**

In `app/js/api.js`:

`getZuweisungenFuerAusbilder` (Zeilen 309-312) ersetzen durch:

```js
  async getZuweisungenFuerVerantw(email) {
    const data = await apiFetch(`/zuweisungen?verantwEmail=${encodeURIComponent(email)}`);
    return data.map(normalizeZuweisung);
  },
```

`addZuweisung` (Zeilen 339-348) ersetzen durch:

```js
  async addZuweisung(zuweisung) {
    const data = await apiFetch('/zuweisungen', { method: 'POST', body: {
      azubiOid:     zuweisung.azubiId,
      verantwEmail: zuweisung.verantwEmail,
      abteilung:    zuweisung.abteilung,
      von:          zuweisung.von,
      bis:          zuweisung.bis,
    }});
    return data.id;
  },
```

`getBetreuteAzubis` (Zeile 327) — Aufruf `this.getZuweisungenFuerAusbilder(me.id)` ersetzen durch `this.getZuweisungenFuerVerantw(me.email)`.

- [ ] **Step 8: Katalog-DB-Methoden ergänzen**

In `app/js/api.js` im `DB`-Objekt (nach `deleteZuweisung`, Zeile 352) ergänzen:

```js
  /* Abteilungs-Katalog */
  async getAbteilungen({ all = false } = {}) {
    return await apiFetch(`/abteilungen${all ? '?all=1' : ''}`);
  },
  async createAbteilung(fields) { return await apiFetch('/abteilungen', { method: 'POST', body: fields }); },
  async updateAbteilung(id, fields) { return await apiFetch(`/abteilungen/${id}`, { method: 'PATCH', body: fields }); },
  async deleteAbteilung(id) { await apiFetch(`/abteilungen/${id}`, { method: 'DELETE' }); },
  async addVerantwortliche(abteilungId, email) {
    return await apiFetch(`/abteilungen/${abteilungId}/verantwortliche`, { method: 'POST', body: { email } });
  },
  async removeVerantwortliche(abteilungId, verantwId) {
    await apiFetch(`/abteilungen/${abteilungId}/verantwortliche/${verantwId}`, { method: 'DELETE' });
  },
```

- [ ] **Step 9: Backend-Query-Param angleichen**

In `backend/routes/zuweisungen.js` GET-Handler (Zeilen 15-27): `ausbilderOid` durch `verantwEmail` ersetzen:

```js
    const { azubiOid, verantwEmail } = req.query;
    ...
    if (verantwEmail) {
      request.input('verantwEmail', sql.NVarChar(255), verantwEmail);
      where += ' AND VerantwEmail = @verantwEmail';
    }
```

POST-Handler (Zeilen 41, 68-78): `ausbilderOid`/`AusbilderOid` durch `verantwEmail`/`VerantwEmail` ersetzen:

```js
    const { azubiOid, verantwEmail, abteilung, von, bis } = req.body;
    ...
      .input('verantwEmail', sql.NVarChar(255), (verantwEmail || '').toLowerCase() || null)
    ...
      .query(`
        INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, Abteilung, Von, Bis)
        OUTPUT inserted.Id
        VALUES (@azubiOid, @verantwEmail, @abteilung, @von, @bis)
      `);
```

- [ ] **Step 10: Syntax + Tests**

Run: `node --check backend/routes/zuweisungen.js`
Expected: keine Ausgabe.
Run: `node --test app/js/abteilungen-api.test.js`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add app/js/api.js app/js/abteilungen-helpers.js app/js/abteilungen-api.test.js backend/routes/zuweisungen.js app/azubi-planer.html app/abteilungsdurchlauf.html app/profil.html app/dh-profil.html app/dashboard.html app/wochenansicht.html
git commit -m "feat(abteilungen): Frontend-API auf VerantwEmail umgestellt + deriveName + Katalog-Methoden"
```

---

### Task 6: Azubi-Planer — Abteilungs-Dropdown, abhängige Verantwortliche, Anzeige/KPI/Filter

**Files:**
- Modify: `app/azubi-planer.html` (Abteilung-Input → Select)
- Modify: `app/js/azubi-planer.js`

**Interfaces:**
- Consumes: `DB.getAbteilungen()`, `deriveName`, `normalizeZuweisung`-Form (`verantwEmail`/`verantwName`), `DB.addZuweisung({…verantwEmail})`.

Verifikation manuell nach Migration (Dropdown filtert, Speichern, Anzeige) — hier Review + `node --check` (kein Frontend-Testrunner für DOM).

- [ ] **Step 1: HTML — Abteilung als Select, Reihenfolge Abteilung→Verantwortliche**

In `app/azubi-planer.html` den Block Zeilen 75-82 ersetzen durch (Abteilung ZUERST, dann Verantwortliche, da abhängig):

```html
        <div class="form-group">
          <label class="form-label">Abteilung</label>
          <select class="form-control" id="zuweisungAbteilung"></select>
        </div>
        <div class="form-group">
          <label class="form-label">Verantwortliche/r</label>
          <select class="form-control" id="zuweisungAusbilder"></select>
        </div>
```

(Der bestehende Azubi-Block Zeilen 71-74 bleibt darüber.)

- [ ] **Step 2: Katalog laden**

In `app/js/azubi-planer.js` nach Zeile 209 (`const azubis = await DB.getAzubis();`) ergänzen:

```js
  // Abteilungs-Katalog (nur aktive) für das Zuweisungs-Dropdown.
  const abteilungenKatalog = await DB.getAbteilungen();
```

- [ ] **Step 3: `openNewZuweisung` auf Katalog umstellen**

`openNewZuweisung` (Zeilen 629-635) ersetzen durch:

```js
  function fillVerantwOptions(abteilungName) {
    const ausbilderSel = document.getElementById('zuweisungAusbilder');
    if (!ausbilderSel) return;
    const abt = abteilungenKatalog.find(a => a.name === abteilungName);
    const list = abt ? abt.verantwortliche : [];
    ausbilderSel.innerHTML = list.length
      ? list.map(v => `<option value="${v.email}">${v.name}</option>`).join('')
      : `<option value="">— keine hinterlegt —</option>`;
  }

  function openNewZuweisung(presetAzubiId) {
    const azubiSel = document.getElementById('zuweisungAzubi');
    const abteilungSel = document.getElementById('zuweisungAbteilung');
    if (azubiSel) azubiSel.innerHTML = azubis.map(a => `<option value="${a.id}" ${a.id === presetAzubiId ? 'selected' : ''}>${a.name}</option>`).join('');
    if (abteilungSel) {
      abteilungSel.innerHTML = abteilungenKatalog.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
      fillVerantwOptions(abteilungSel.value);
      abteilungSel.onchange = () => fillVerantwOptions(abteilungSel.value);
    }
    Modal.open('zuweisungModal');
  }
```

- [ ] **Step 4: Speichern auf `verantwEmail` umstellen**

In `initZuweisungModal` (Zeilen 638-668): `ausbilderId` (Zeile 642) und der `abteilung`-Wert (Zeile 645) bleiben Element-Reads, aber der Save-Body ändert sich. Zeile 642 ersetzen:

```js
      const verantwEmail = document.getElementById('zuweisungAusbilder').value;
```

Validierung nach Zeile 648 ergänzen:

```js
      const abteilung = document.getElementById('zuweisungAbteilung').value;
      if (!abteilung) { Toast.error('Pflichtfeld', 'Bitte Abteilung wählen.'); return; }
      if (!verantwEmail) { Toast.error('Pflichtfeld', 'Für diese Abteilung ist keine verantwortliche Person hinterlegt.'); return; }
```

(Die bestehende `const abteilung = …value;` auf Zeile 645 entfernen, da oben neu gesetzt.)

`addZuweisung`-Aufruf (Zeile 659) ersetzen:

```js
        await DB.addZuweisung({ azubiId, verantwEmail, von, bis, abteilung });
```

- [ ] **Step 5: Anzeige-Auflösung von OID auf verantwName umstellen**

Alle `await DB.getUser(z.ausbilderId)`-Aufrufe in `azubi-planer.js` (Zeilen 127, 559, 606) ersetzen. Muster:

- Zeile 127 (in `renderAzubiDurchlauf`): `const v = await DB.getUser(z.ausbilderId);` → entfernen; wo `v.name`/`v` genutzt wird, `z.verantwName || '–'` verwenden.
- Zeile 559 (`buildGanttRows`): `const ausb = await DB.getUser(z.ausbilderId);` → entfernen; im `title` `escHtml((ausb && ausb.name) || '–')` → `escHtml(z.verantwName || '–')`.
- Zeile 606 (`loadZuwRowData`): `const ausb = await DB.getUser(z.ausbilderId);` → entfernen; `return { z, azubi, ausb, status };` → `return { z, azubi, ausbName: z.verantwName, status };`. Alle nachgelagerten `r.ausb?.name`/`r.ausb.name` → `r.ausbName`.

**Hinweis für Implementer:** Nach dem Ersetzen im ganzen File `grep -n "ausb" app/js/azubi-planer.js` prüfen und jede Rest-Referenz auf `.ausb` (Objekt) auf `ausbName` (String) angleichen. Die Detailpanel-/Listen-Renderer, die `r.ausb.name` lesen, entsprechend auf `r.ausbName` umstellen.

- [ ] **Step 6: KPI + Filter auf E-Mail umstellen**

In `computeKpis` (Zeile 244): `new Set(aktuelle.map(r => r.z.ausbilderId))` → `new Set(aktuelle.map(r => r.z.verantwEmail).filter(Boolean))`.

`filterVerantw`-Logik (Zeile 291): `akt?.z.ausbilderId !== filterVerantw` → `akt?.z.verantwEmail !== filterVerantw`.

`buildVerantwOptions` (Zeilen 298-301) ersetzen — Optionen aus den in Zuweisungen tatsächlich vorkommenden Verantwortlichen (E-Mail → Name), dedupliziert:

```js
  function alleVerantwortliche() {
    const map = new Map();
    zuwRowData.forEach(r => { if (r.z.verantwEmail) map.set(r.z.verantwEmail, r.z.verantwName || r.z.verantwEmail); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  function buildVerantwOptions() {
    return `<option value="">Alle Verantwortlichen</option>` +
      alleVerantwortliche().map(([email, name]) => `<option value="${email}" ${email === filterVerantw ? 'selected' : ''}>${name}</option>`).join('');
  }
```

- [ ] **Step 7: Syntax prüfen**

Run: `node --check app/js/azubi-planer.js`
Expected: keine Ausgabe.

- [ ] **Step 8: Commit**

```bash
git add app/azubi-planer.html app/js/azubi-planer.js
git commit -m "feat(abteilungen): Planer-Dropdown + abhängige Verantwortliche + E-Mail-Anzeige/KPI/Filter"
```

---

### Task 7: Restliche Anzeige-/Reverse-Lookup-Stellen umstellen

**Files:**
- Modify: `app/js/abteilungsdurchlauf.js` (Zeile 60)
- Modify: `app/js/dh-profil.js` (Zeile 48)
- Modify: `app/js/profil.js` (Zeilen 43, 367, 406)
- Modify: `app/js/wochenansicht.js` (Zeile 293)
- Modify: `app/js/dashboard.js` (Zeile 1010)
- Modify: `app/js/app.js` (Zeile 144)

**Interfaces:**
- Consumes: `z.verantwName` (aus `normalizeZuweisung`), `DB.getZuweisungenFuerVerantw(email)`, `user.email`.

Kein Testrunner für diese DOM-Skripte → Review + `node --check` je Datei.

- [ ] **Step 1: Anzeige-Stellen (getUser → verantwName)**

Jeweils den Namen des Verantwortlichen künftig aus `z.verantwName` (bzw. `zuw.verantwName`) lesen statt via `DB.getUser(z.ausbilderId)`:

- `app/js/abteilungsdurchlauf.js:60` — `const v = await DB.getUser(z.ausbilderId);` entfernen; nachfolgende `v?.name`/`v.name` → `z.verantwName || '–'`.
- `app/js/dh-profil.js:48` — `const v = await DB.getUser(zuw.ausbilderId);` entfernen; `v?.name` → `zuw.verantwName || '–'`.
- `app/js/profil.js:43` — `const ausbilder = zuw ? await DB.getUser(zuw.ausbilderId) : null;` → `const ausbilderName = zuw ? (zuw.verantwName || '–') : null;`; nachgelagerte `ausbilder?.name`/`ausbilder.name` → `ausbilderName`.
- `app/js/profil.js:367` — `const ausb = await DB.getUser(z.ausbilderId);` entfernen; `ausb?.name` → `z.verantwName || '–'`.
- `app/js/wochenansicht.js:293` — `const azubiAusbilder = azubiZuw ? await DB.getUser(azubiZuw.ausbilderId) : null;` → `const azubiAusbilderName = azubiZuw ? (azubiZuw.verantwName || '') : '';`; nachgelagerte `azubiAusbilder?.name`/`azubiAusbilder.name` → `azubiAusbilderName`.

**Hinweis:** In jeder Datei nach dem Edit `grep -n "ausbilderId\|\.ausbilder\b\|getUser(.*ausbilder" <datei>` prüfen; keine Rest-Referenz auf die alte OID-Auflösung darf bleiben.

- [ ] **Step 2: Reverse-Lookup-Stellen (getZuweisungenFuerAusbilder → getZuweisungenFuerVerantw)**

- `app/js/profil.js:406` — `isAusbilder ? await DB.getZuweisungenFuerAusbilder(user.id) : []` → `isAusbilder ? await DB.getZuweisungenFuerVerantw(user.email) : []`.
- `app/js/dashboard.js:1010` — `(await DB.getZuweisungenFuerAusbilder(user.id))` → `(await DB.getZuweisungenFuerVerantw(user.email))`.
- `app/js/app.js:144` — `const z = await DB.getZuweisungenFuerAusbilder(user.id);` → `const z = await DB.getZuweisungenFuerVerantw(user.email);`.

- [ ] **Step 3: Syntax prüfen (alle 6 Dateien)**

Run: `node --check app/js/abteilungsdurchlauf.js && node --check app/js/dh-profil.js && node --check app/js/profil.js && node --check app/js/wochenansicht.js && node --check app/js/dashboard.js && node --check app/js/app.js`
Expected: keine Ausgabe.

- [ ] **Step 4: Gesamt-Grep auf Alt-Referenzen**

Run: `grep -rn "ausbilderId\|getZuweisungenFuerAusbilder\|AusbilderOid" app/js backend`
Expected: **keine Treffer** mehr (außer evtl. Kommentar-Erwähnungen, die bewusst umbenannt wurden). Jeder verbleibende Code-Treffer ist ein Fehler.

- [ ] **Step 5: Commit**

```bash
git add app/js/abteilungsdurchlauf.js app/js/dh-profil.js app/js/profil.js app/js/wochenansicht.js app/js/dashboard.js app/js/app.js
git commit -m "refactor(abteilungen): Verantwortlichen-Anzeige + Reverse-Lookup auf E-Mail umgestellt"
```

---

### Task 8: Pflege-UI (developer-only Reiter)

**Files:**
- Create: `app/abteilungsverwaltung.html`
- Create: `app/js/abteilungsverwaltung.js`
- Create: `app/css/abteilungsverwaltung.css`
- Modify: `app/js/sidebar.js` (Nav-Eintrag)

**Interfaces:**
- Consumes: `initPage`, `Icon`, `Toast`, `DB.getAbteilungen({all:true})`, `DB.createAbteilung`, `DB.updateAbteilung`, `DB.deleteAbteilung`, `DB.addVerantwortliche`, `DB.removeVerantwortliche`, `ROLE_LABELS`, Design-System-Klassen (`.card`, `.badge--*`, `.btn-*`, `.form-*`, `.modal-*`).

Muster: `app/nutzerverwaltung.html` / `app/js/nutzerverwaltung.js` (developer-Gate, `page-header`, `card`, Tabelle, Modal, `esc()`-XSS-Schutz).

- [ ] **Step 1: Nav-Eintrag in der Sidebar**

In `app/js/sidebar.js` nach dem `nav-nutzerverwaltung`-Block (Zeile 65, nach `</a>`) ergänzen:

```html
      <a href="abteilungsverwaltung.html" class="sidebar__link nav-developer-only" id="nav-abteilungsverwaltung" style="display:none">
        <span class="sidebar__link-icon">${Icon('verwaltung')}</span>
        <span class="sidebar__link-label">Abteilungen</span>
      </a>
```

(`nav-developer-only` wird bereits von `applyCapabilities` in `app.js` ein-/ausgeblendet — kein weiterer JS-Hook nötig.)

- [ ] **Step 2: HTML-Seite anlegen**

Datei `app/abteilungsverwaltung.html` — Struktur exakt wie `app/nutzerverwaltung.html`, aber mit eigenem CSS/JS und `<div id="mainContent">`. Kopiere `app/nutzerverwaltung.html` und ersetze:
- `<title>` → `Abteilungen · Digitales Berichtsheft`
- den CSS-Link → zusätzlich `<link rel="stylesheet" href="css/abteilungsverwaltung.css">`
- `<script src="js/abteilungen-helpers.js"></script>` vor `api.js` einbinden
- das Seiten-Script → `<script src="js/abteilungsverwaltung.js"></script>`

- [ ] **Step 3: CSS anlegen**

Datei `app/css/abteilungsverwaltung.css`:

```css
/* Abteilungsverwaltung – lehnt sich an nutzerverwaltung.css an. */
.av-toolbar { display:flex; gap:var(--sp-3); align-items:center; margin-bottom:var(--sp-4); }
.av-toolbar .form-control { max-width:360px; }
.av-toolbar .av-spacer { flex:1; }
.av-table { width:100%; border-collapse:collapse; }
.av-table th, .av-table td { text-align:left; padding:var(--sp-3) var(--sp-4); border-bottom:1px solid var(--color-border); vertical-align:top; }
.av-table th { font-size:var(--text-xs); text-transform:uppercase; letter-spacing:.04em; color:var(--pm-grey-500); }
.av-verantw-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--sp-1); }
.av-verantw-list li { display:flex; align-items:center; gap:var(--sp-2); }
.av-verantw-list .av-vremove { cursor:pointer; color:var(--color-error); background:none; border:none; font-size:var(--text-sm); }
.av-empty { padding:var(--sp-6); text-align:center; color:var(--pm-grey-500); }
.av-form__checks { display:flex; gap:var(--sp-4); margin-top:var(--sp-2); }
.av-form__check-label { display:flex; align-items:center; gap:var(--sp-2); }
```

- [ ] **Step 4: Seiten-Script anlegen**

Datei `app/js/abteilungsverwaltung.js`:

```js
/* ===================================================================
   ABTEILUNGSVERWALTUNG.JS – Developer-only Abteilungs-Katalog
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-abteilungsverwaltung', [{ label: 'Abteilungen', href: 'abteilungsverwaltung.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }

  const main = document.getElementById('mainContent');
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let abteilungen;
  try { abteilungen = await DB.getAbteilungen({ all: true }); }
  catch (e) {
    main.innerHTML = `<div class="page-header"><div class="page-header__left"><h1 class="page-title">Abteilungen</h1></div></div>
      <div class="card"><div class="card__body"><p style="color:var(--color-error)">Fehler beim Laden: ${esc(e.message)}</p></div></div>`;
    return;
  }

  let editing = null; // Abteilung im Modal (null = neu)

  function renderRow(a) {
    const pmm = a.istPmm ? `<span class="badge badge--freigegeben">PMM</span>` : '';
    const status = a.aktiv ? `<span class="badge badge--genehmigt">aktiv</span>` : `<span class="badge badge--grey">inaktiv</span>`;
    const verantw = (a.verantwortliche || []).length
      ? `<ul class="av-verantw-list">${a.verantwortliche.map(v => `<li title="${esc(v.email)}">${esc(v.name)}</li>`).join('')}</ul>`
      : `<span style="color:var(--pm-grey-500)">— keine —</span>`;
    return `<tr data-id="${a.id}">
      <td><div>${esc(a.name)}</div> ${pmm}</td>
      <td>${verantw}</td>
      <td>${status}</td>
      <td><button class="btn btn-sm btn-outline av-edit-btn" type="button" data-id="${a.id}">Bearbeiten</button></td>
    </tr>`;
  }

  function renderTable(list) {
    if (!list.length) return `<tr><td colspan="4"><div class="av-empty">Keine Abteilungen.</div></td></tr>`;
    return list.map(renderRow).join('');
  }

  function filter(q) {
    q = q.trim().toLowerCase();
    if (!q) return abteilungen;
    return abteilungen.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.verantwortliche || []).some(v => (v.name + ' ' + v.email).toLowerCase().includes(q)));
  }

  function renderList(list) {
    const tbody = document.getElementById('avTableBody');
    if (!tbody) return;
    tbody.innerHTML = renderTable(list);
    tbody.querySelectorAll('.av-edit-btn').forEach(b => b.addEventListener('click', () => openModal(abteilungen.find(a => a.id === Number(b.dataset.id)))));
  }

  /* ── Modal ── */
  function buildModal() {
    if (document.getElementById('avEditModal')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'avEditModal';
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header"><h2 class="modal__title" id="avModalTitle">Abteilung</h2>
          <button class="modal__close" type="button" aria-label="Schließen">&times;</button></div>
        <div class="modal__body">
          <div class="form-group"><label class="form-label" for="avName">Name</label>
            <input class="form-control" type="text" id="avName" placeholder="z. B. Einkauf PMM"></div>
          <div class="av-form__checks">
            <label class="av-form__check-label"><input type="checkbox" id="avIstPmm"> PMM-Abteilung</label>
            <label class="av-form__check-label"><input type="checkbox" id="avAktiv" checked> Aktiv</label>
          </div>
          <div class="form-group" id="avVerantwGroup" style="margin-top:var(--sp-4)">
            <label class="form-label">Verantwortliche (E-Mail)</label>
            <ul class="av-verantw-list" id="avVerantwList"></ul>
            <div class="av-toolbar" style="margin-top:var(--sp-2)">
              <input class="form-control" type="email" id="avNewEmail" placeholder="vorname.nachname@putzmeister.com" autocomplete="off">
              <button class="btn btn-sm btn-outline" type="button" id="avAddVerantwBtn">Hinzufügen</button>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" id="avDeleteBtn" style="margin-right:auto">Löschen</button>
          <button class="btn btn-outline" type="button" id="avCancelBtn">Abbrechen</button>
          <button class="btn btn-primary" type="button" id="avSaveBtn">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.modal__close').addEventListener('click', closeModal);
    document.getElementById('avCancelBtn').addEventListener('click', closeModal);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    document.getElementById('avSaveBtn').addEventListener('click', handleSave);
    document.getElementById('avDeleteBtn').addEventListener('click', handleDelete);
    document.getElementById('avAddVerantwBtn').addEventListener('click', handleAddVerantw);
  }

  function renderVerantwInModal() {
    const ul = document.getElementById('avVerantwList');
    const group = document.getElementById('avVerantwGroup');
    if (!editing) { group.style.display = 'none'; return; }
    group.style.display = '';
    const list = editing.verantwortliche || [];
    ul.innerHTML = list.length
      ? list.map(v => `<li title="${esc(v.email)}">${esc(v.name)} <button class="av-vremove" type="button" data-vid="${v.id}">✕</button></li>`).join('')
      : `<li style="color:var(--pm-grey-500)">— keine —</li>`;
    ul.querySelectorAll('.av-vremove').forEach(b => b.addEventListener('click', () => handleRemoveVerantw(Number(b.dataset.vid))));
  }

  function openModal(a) {
    editing = a || null;
    document.getElementById('avModalTitle').textContent = a ? 'Abteilung bearbeiten' : 'Neue Abteilung';
    document.getElementById('avName').value = a ? a.name : '';
    document.getElementById('avIstPmm').checked = a ? !!a.istPmm : false;
    document.getElementById('avAktiv').checked = a ? a.aktiv !== false : true;
    document.getElementById('avDeleteBtn').style.display = a ? '' : 'none';
    document.getElementById('avNewEmail').value = '';
    renderVerantwInModal();
    document.getElementById('avEditModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    document.getElementById('avEditModal')?.classList.remove('open');
    document.body.style.overflow = ''; editing = null;
  }

  function upsertLocal(updated) {
    const idx = abteilungen.findIndex(a => a.id === updated.id);
    if (idx === -1) abteilungen.push(updated); else abteilungen[idx] = updated;
    abteilungen.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function handleSave() {
    const btn = document.getElementById('avSaveBtn'); btn.disabled = true;
    const fields = {
      name: document.getElementById('avName').value.trim(),
      istPmm: document.getElementById('avIstPmm').checked,
      aktiv: document.getElementById('avAktiv').checked,
    };
    if (!fields.name) { Toast.error('Pflichtfeld', 'Name ist Pflicht.'); btn.disabled = false; return; }
    try {
      const saved = editing ? await DB.updateAbteilung(editing.id, fields) : await DB.createAbteilung(fields);
      upsertLocal(saved);
      Toast.success('Gespeichert');
      renderList(filter(document.getElementById('avSearch').value));
      closeModal();
    } catch (e) { Toast.error('Fehler', e.message); } finally { btn.disabled = false; }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Abteilung „${editing.name}" wirklich löschen?`)) return;
    try {
      await DB.deleteAbteilung(editing.id);
      abteilungen = abteilungen.filter(a => a.id !== editing.id);
      Toast.success('Gelöscht');
      renderList(filter(document.getElementById('avSearch').value));
      closeModal();
    } catch (e) { Toast.error('Fehler', e.message); }
  }

  async function handleAddVerantw() {
    if (!editing) return;
    const email = document.getElementById('avNewEmail').value.trim();
    if (!email || !email.includes('@')) { Toast.error('Ungültig', 'Bitte gültige E-Mail angeben.'); return; }
    try {
      const v = await DB.addVerantwortliche(editing.id, email);
      editing.verantwortliche = [...(editing.verantwortliche || []), v].sort((a, b) => a.name.localeCompare(b.name));
      upsertLocal(editing);
      document.getElementById('avNewEmail').value = '';
      renderVerantwInModal();
      renderList(filter(document.getElementById('avSearch').value));
    } catch (e) { Toast.error('Fehler', e.message); }
  }

  async function handleRemoveVerantw(vid) {
    if (!editing) return;
    try {
      await DB.removeVerantwortliche(editing.id, vid);
      editing.verantwortliche = (editing.verantwortliche || []).filter(v => v.id !== vid);
      upsertLocal(editing);
      renderVerantwInModal();
      renderList(filter(document.getElementById('avSearch').value));
    } catch (e) { Toast.error('Fehler', e.message); }
  }

  /* ── Seite aufbauen ── */
  main.innerHTML = `
    <div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Abteilungen</h1>
      <p class="page-subtitle">Abteilungs-Katalog und verantwortliche Prüfer verwalten</p>
    </div></div>
    <div class="card"><div class="card__body">
      <div class="av-toolbar">
        <input class="form-control" type="search" id="avSearch" placeholder="Suchen (Abteilung, Verantwortliche)…" autocomplete="off">
        <span class="av-spacer"></span>
        <button class="btn btn-primary" type="button" id="avNewBtn">${Icon('plus')} Neue Abteilung</button>
      </div>
      <div style="overflow-x:auto"><table class="av-table">
        <thead><tr><th>Abteilung</th><th>Verantwortliche</th><th>Status</th><th></th></tr></thead>
        <tbody id="avTableBody"></tbody>
      </table></div>
    </div></div>`;

  buildModal();
  renderList(abteilungen);
  document.getElementById('avSearch').addEventListener('input', (e) => renderList(filter(e.target.value)));
  document.getElementById('avNewBtn').addEventListener('click', () => openModal(null));
});
```

**Hinweis:** Falls `Icon('plus')` nicht existiert, im Icon-Set prüfen (`app/js/*icon*` bzw. wie in `nutzerverwaltung`) und ein vorhandenes Icon (z. B. `'verwaltung'`) verwenden — Implementer prüft `Icon(...)`-Verfügbarkeit vor Commit.

- [ ] **Step 5: Syntax prüfen**

Run: `node --check app/js/abteilungsverwaltung.js && node --check app/js/sidebar.js`
Expected: keine Ausgabe.

- [ ] **Step 6: Commit**

```bash
git add app/abteilungsverwaltung.html app/js/abteilungsverwaltung.js app/css/abteilungsverwaltung.css app/js/sidebar.js
git commit -m "feat(abteilungen): developer-only Pflege-UI (Reiter + Tabelle + Modal)"
```

---

## Nach allen Tasks

1. **Migration + Seed ausführen** (DDL-Account): `create-abteilungen-table.sql` → `seed-abteilungen.sql`. Dem User zum Ausführen übergeben.
2. **Smoke-Test** (nach Migration): Planer-Modal → Abteilung wählen → Verantwortliche werden gefiltert → Speichern → Anzeige/Gantt zeigt Namen; developer-Reiter „Abteilungen" legt an/bearbeitet/entfernt Verantwortliche; Login eines Prüfers zieht echten Namen nach.
3. Finale Whole-Branch-Review (SDD), dann `finishing-a-development-branch`.
