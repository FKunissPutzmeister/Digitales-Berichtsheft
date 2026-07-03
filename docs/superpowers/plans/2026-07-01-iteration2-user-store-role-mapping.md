# Iteration 2 — Persistenter User-Store + Rollen-Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DEV_USERS` durch eine persistente `dbo.Users`-Tabelle ersetzen, die Azure-Rolle aus dem SAML-Claim in die Session mappen, und Profile/Rechte admin-pflegbar machen — damit reale SSO-Nutzer die richtige Ansicht mit Inhalten bekommen.

**Architecture:** Eine `dbo.Users`-Tabelle (per `Oid` verschlüsselt) ist die einzige Nutzerquelle. Genau eine `upsertUser(data)`-Funktion schreibt hinein (Login-JIT, CSV-Import, später Graph). `requireAuth` lädt den Nutzer pro Request aus der DB und leitet die Flags ab. Azure liefert die Basisrolle (`azubi`/`pruefer`); feine Rechte (`kannPlanen`, `istAusbilder`) und Sonderrollen (`admin`/`dhstudent`/`developer`) liegen in der DB und werden beim Login nie überschrieben.

**Tech Stack:** Node.js (CommonJS), Express 5, mssql (`getPool()/sql` aus `backend/db/connection.js`), `node:test` + `node:assert/strict`, vanilla JS Frontend.

## Global Constraints

- **CommonJS** (`require`/`module.exports`). Tests: **`node:test` + `node:assert/strict`**, Ausführung `node --test <datei>`, Output pristine (Config-Warnungen im Test unterdrücken bzw. `NODE_ENV=test` vor `require` setzen, wie in `backend/config/saml.test.js`).
- **DB-Zugriff** ausschließlich über `const { getPool, sql } = require('../db/connection')`; Pattern: `const pool = await getPool(); const r = pool.request(); r.input('x', sql.NVarChar(36), val); await r.query('…')`.
- **`Oid`** ist ein GUID-**String** (`sql.NVarChar(36)`), niemals `parseInt`.
- **Rollen-Werte:** `azubi` | `pruefer` | `admin` | `dhstudent` | `developer`. Azure-Claim setzt nur `azubi`/`pruefer`; `admin`/`dhstudent`/`developer` sind admin-gesetzt und werden vom Login **nie** überschrieben (Merge-Regel).
- **Rollen-Claim-URI:** `http://schemas.microsoft.com/ws/2008/06/identity/claims/role` (Wert kann String ODER Array sein).
- **Flag-Ableitung:** `istAzubi = role==='azubi'`; `istDhStudent = role==='dhstudent'`; `istAusbilder = role==='pruefer' || Spalte IstAusbilder`; `kannPlanen = Spalte KannPlanen`; **`developer` → kannPlanen/istAusbilder/istAzubi = true, istDhStudent = false** (bleibt in der normalen Sidebar-Shell, Views per Gate-Sonderfall offen).
- **`req.user`-Form (unverändert ggü. heute):** `{ oid, name, email, role, kannPlanen, istAusbilder, istAzubi, istDhStudent }`.
- **Ein Schreibpfad:** nur `upsertUser(data)` schreibt Identität/Rolle; admin-Edits laufen über `updateUserProfile(oid, fields)`.

---

### Task 1: Reine User-Logik (`parseRoleClaim`, `buildReqUser`)

Pure Funktionen ohne DB — das Herz des Rollen-Mappings, voll unit-getestet.

**Files:**
- Create: `backend/services/users.js`
- Create: `backend/services/users.test.js`

**Interfaces:**
- Produces:
  - `parseRoleClaim(profile: object): 'azubi'|'pruefer'|null`
  - `buildReqUser(row: object|null): {oid,name,email,role,kannPlanen,istAusbilder,istAzubi,istDhStudent}|null`

- [ ] **Step 1: Failing test schreiben**

`backend/services/users.test.js`:
```js
'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoleClaim, buildReqUser } = require('./users');

const ROLE_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

test('parseRoleClaim liest String-Claim', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'azubi' }), 'azubi');
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'pruefer' }), 'pruefer');
});

test('parseRoleClaim nimmt bei Array die erste bekannte Rolle', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: ['pruefer', 'irgendwas'] }), 'pruefer');
});

test('parseRoleClaim gibt null ohne/bei unbekanntem Claim', () => {
  assert.equal(parseRoleClaim({}), null);
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'fremd' }), null);
  assert.equal(parseRoleClaim(null), null);
});

test('buildReqUser leitet Azubi-Flags + Profilfelder ab', () => {
  const u = buildReqUser({ Oid: 'g1', Name: 'A', Email: 'a@b.de', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Beruf: 'Mechatroniker' });
  assert.equal(u.istAzubi, true);
  assert.equal(u.istAusbilder, false);
  assert.equal(u.kannPlanen, false);
  assert.equal(u.istDhStudent, false);
  assert.equal(u.beruf, 'Mechatroniker');
  assert.equal(u.berichtTyp, 'wöchentlich'); // Default ohne BerichtTyp-Spalte
});

test('buildReqUser: pruefer bekommt Korrektur-Zugang automatisch', () => {
  const u = buildReqUser({ Oid: 'g2', Role: 'pruefer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, false);
});

test('buildReqUser: IstAusbilder-Spalte ist additiver Grant', () => {
  const u = buildReqUser({ Oid: 'g3', Role: 'admin', KannPlanen: true, IstAusbilder: true });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.kannPlanen, true);
});

test('buildReqUser: developer bekommt alle Flags, aber NICHT istDhStudent', () => {
  const u = buildReqUser({ Oid: 'g4', Role: 'developer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.kannPlanen, true);
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, true);
  assert.equal(u.istDhStudent, false);
});

test('buildReqUser(null) gibt null', () => {
  assert.equal(buildReqUser(null), null);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/services/users.test.js`
Expected: FAIL — `parseRoleClaim is not a function`.

- [ ] **Step 3: Reine Logik implementieren**

`backend/services/users.js` (nur die pure Logik; DB-Funktionen kommen in Task 2):
```js
'use strict';
/* =====================================================================
   USER-STORE: einzige Nutzerquelle (dbo.Users).
   Dieser Abschnitt: reine Logik (Rollen-Claim-Parsing, Flag-Ableitung).
   ===================================================================== */
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const AZURE_ROLES = ['azubi', 'pruefer'];

// Rollen-Claim aus der Assertion lesen (String ODER Array), auf bekannte
// Azure-Basisrollen einschränken. Unbekannt/fehlend → null.
function parseRoleClaim(profile) {
  const raw = profile && profile[ROLE_CLAIM];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.find((r) => AZURE_ROLES.includes(r)) || null;
}

// DB-Zeile → req.user-Form mit abgeleiteten Flags.
function buildReqUser(row) {
  if (!row) return null;
  const role = row.Role;
  const isDev = role === 'developer';
  return {
    oid: row.Oid,
    name: row.Name,
    email: row.Email,
    role,
    kannPlanen:   isDev || !!row.KannPlanen,
    istAusbilder: isDev || role === 'pruefer' || !!row.IstAusbilder,
    istAzubi:     isDev || role === 'azubi',
    istDhStudent: role === 'dhstudent', // developer NICHT (sonst Zwangs-Redirect)
    // Profilfelder (Azubi-Ansicht + Admin-UI brauchen sie):
    beruf:            row.Beruf ?? null,
    ausbildungBeginn: row.AusbildungBeginn ?? null,
    ausbildungEnde:   row.AusbildungEnde ?? null,
    berichtTyp:       row.BerichtTyp || 'wöchentlich',
    aktiv:            row.Aktiv !== false,
  };
}

module.exports = { parseRoleClaim, buildReqUser };
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/services/users.test.js`
Expected: PASS (8 Tests, pristine).

- [ ] **Step 5: Commit**

```bash
git add backend/services/users.js backend/services/users.test.js
git commit -m "feat(users): Rollen-Claim-Parsing + Flag-Ableitung (pure)"
```

---

### Task 2: `dbo.Users`-Tabelle + DB-Zugriff

Schema-Migration und die DB-Funktionen. `validateUserPatch` (pur) wird unit-getestet; die DB-Funktionen werden manuell gegen die DB verifiziert (Integration).

**Files:**
- Create: `backend/db/create-users-table.sql`
- Modify: `backend/services/users.js`
- Modify: `backend/services/users.test.js`

**Interfaces:**
- Consumes: `getPool`, `sql` aus `../db/connection`.
- Produces:
  - `upsertUser(data): Promise<void>` — `data = { oid, name, email, role?, kannPlanen?, istAusbilder?, beruf?, ausbildungBeginn?, ausbildungEnde?, berichtTyp?, aktiv?, letzterLogin? }`. INSERT-or-UPDATE per MERGE; Merge-Regel schützt Sonderrollen und aktualisiert nur übergebene Felder.
  - `getUserByOid(oid): Promise<object|null>` (rohe DB-Zeile)
  - `getUserByEmail(email): Promise<object|null>`
  - `listUsers({role?, exclRole?}): Promise<object[]>`
  - `updateUserProfile(oid, fields): Promise<void>` — nur Whitelist-Spalten.
  - `validateUserPatch(fields): {ok: boolean, error?: string}` (pur)

- [ ] **Step 1: Schema-Skript schreiben**

`backend/db/create-users-table.sql`:
```sql
/* Persistente Nutzer (einzige Quelle, ersetzt DEV_USERS). Per Oid (GUID). */
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Users (
    Oid              NVARCHAR(36)  NOT NULL PRIMARY KEY,
    Name             NVARCHAR(200) NOT NULL,
    Email            NVARCHAR(256) NULL,
    Role             NVARCHAR(20)  NOT NULL,           -- azubi|pruefer|admin|dhstudent|developer
    KannPlanen       BIT           NOT NULL DEFAULT 0,
    IstAusbilder     BIT           NOT NULL DEFAULT 0,
    Beruf            NVARCHAR(200) NULL,
    AusbildungBeginn DATE          NULL,
    AusbildungEnde   DATE          NULL,
    BerichtTyp       NVARCHAR(20)  NOT NULL DEFAULT N'wöchentlich', -- wöchentlich|täglich (Umlaut-Form wie in der App)
    Aktiv            BIT           NOT NULL DEFAULT 1,
    LetzterLogin     DATETIME2     NULL,
    ErstelltAm       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    AktualisiertAm   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Users_Email ON dbo.Users(Email);
  CREATE INDEX IX_Users_Role  ON dbo.Users(Role);
  PRINT 'Tabelle dbo.Users angelegt.';
END
ELSE PRINT 'dbo.Users existiert bereits.';
```

- [ ] **Step 2: Failing test für `validateUserPatch` schreiben**

In `backend/services/users.test.js` anhängen:
```js
const { validateUserPatch } = require('./users');

test('validateUserPatch akzeptiert erlaubte Felder/Werte', () => {
  assert.deepEqual(validateUserPatch({ role: 'pruefer', berichtTyp: 'täglich', kannPlanen: true }), { ok: true });
});

test('validateUserPatch lehnt unbekannte Rolle ab', () => {
  assert.equal(validateUserPatch({ role: 'chef' }).ok, false);
});

test('validateUserPatch lehnt unbekanntes Feld ab', () => {
  assert.equal(validateUserPatch({ gehalt: 999 }).ok, false);
});

test('validateUserPatch lehnt ungültigen berichtTyp ab', () => {
  assert.equal(validateUserPatch({ berichtTyp: 'monatlich' }).ok, false);
});
```

- [ ] **Step 3: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/services/users.test.js`
Expected: FAIL — `validateUserPatch is not a function`.

- [ ] **Step 4: DB-Funktionen + `validateUserPatch` implementieren**

In `backend/services/users.js` oben ergänzen: `const { getPool, sql } = require('../db/connection');`
Vor `module.exports` einfügen:
```js
const ALLOWED_ROLES = ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer'];
const ALLOWED_BERICHT = ['wöchentlich', 'täglich'];

// Whitelist der admin-editierbaren Felder → DB-Spalte + mssql-Typ.
const PATCH_COLUMNS = {
  role:             { col: 'Role',             type: () => sql.NVarChar(20) },
  kannPlanen:       { col: 'KannPlanen',       type: () => sql.Bit },
  istAusbilder:     { col: 'IstAusbilder',     type: () => sql.Bit },
  beruf:            { col: 'Beruf',            type: () => sql.NVarChar(200) },
  ausbildungBeginn: { col: 'AusbildungBeginn', type: () => sql.Date },
  ausbildungEnde:   { col: 'AusbildungEnde',   type: () => sql.Date },
  berichtTyp:       { col: 'BerichtTyp',       type: () => sql.NVarChar(20) },
  aktiv:            { col: 'Aktiv',            type: () => sql.Bit },
};

function validateUserPatch(fields) {
  for (const key of Object.keys(fields)) {
    if (!(key in PATCH_COLUMNS)) return { ok: false, error: `Unbekanntes Feld: ${key}` };
  }
  if ('role' in fields && !ALLOWED_ROLES.includes(fields.role)) {
    return { ok: false, error: 'Ungültige Rolle' };
  }
  if ('berichtTyp' in fields && !ALLOWED_BERICHT.includes(fields.berichtTyp)) {
    return { ok: false, error: 'Ungültiger Berichtstyp' };
  }
  return { ok: true };
}

// EIN Schreibpfad für Identität/Rolle (Login-JIT, CSV-Import, später Graph).
// Merge-Regel: Sonderrollen (admin/dhstudent/developer) werden NIE von einer
// Azure-Basisrolle überschrieben; nur übergebene Felder werden aktualisiert.
async function upsertUser(data) {
  const pool = await getPool();
  const r = pool.request();
  r.input('oid',   sql.NVarChar(36),  data.oid);
  r.input('name',  sql.NVarChar(200), data.name ?? null);
  r.input('email', sql.NVarChar(256), data.email ?? null);
  r.input('role',  sql.NVarChar(20),  data.role ?? null);
  r.input('kannPlanen',   sql.Bit,          data.kannPlanen ?? null);
  r.input('istAusbilder', sql.Bit,          data.istAusbilder ?? null);
  r.input('beruf',        sql.NVarChar(200),data.beruf ?? null);
  r.input('beginn',       sql.Date,         data.ausbildungBeginn ?? null);
  r.input('ende',         sql.Date,         data.ausbildungEnde ?? null);
  r.input('berichtTyp',   sql.NVarChar(20), data.berichtTyp ?? null);
  r.input('setLogin',     sql.Bit,          data.letzterLogin ? 1 : 0);
  await r.query(`
    MERGE dbo.Users AS t
    USING (SELECT @oid AS Oid) AS s ON t.Oid = s.Oid
    WHEN MATCHED THEN UPDATE SET
      Name  = COALESCE(@name, t.Name),
      Email = COALESCE(@email, t.Email),
      -- Basisrolle nur setzen, wenn aktuelle Rolle azubi/pruefer/leer ist:
      Role  = CASE WHEN @role IS NULL THEN t.Role
                   WHEN t.Role IN ('azubi','pruefer') OR t.Role IS NULL THEN @role
                   ELSE t.Role END,
      KannPlanen   = COALESCE(@kannPlanen, t.KannPlanen),
      IstAusbilder = COALESCE(@istAusbilder, t.IstAusbilder),
      Beruf            = COALESCE(@beruf, t.Beruf),
      AusbildungBeginn = COALESCE(@beginn, t.AusbildungBeginn),
      AusbildungEnde   = COALESCE(@ende, t.AusbildungEnde),
      BerichtTyp       = COALESCE(@berichtTyp, t.BerichtTyp),
      LetzterLogin     = CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE t.LetzterLogin END,
      AktualisiertAm   = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT
      (Oid, Name, Email, Role, KannPlanen, IstAusbilder, Beruf, AusbildungBeginn, AusbildungEnde, BerichtTyp, LetzterLogin)
    VALUES
      (@oid, @name, @email, COALESCE(@role,'azubi'), COALESCE(@kannPlanen,0), COALESCE(@istAusbilder,0),
       @beruf, @beginn, @ende, COALESCE(@berichtTyp, N'wöchentlich'),
       CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END);
  `);
}

async function getUserByOid(oid) {
  const pool = await getPool();
  const res = await pool.request().input('oid', sql.NVarChar(36), oid)
    .query('SELECT * FROM dbo.Users WHERE Oid = @oid');
  return res.recordset[0] || null;
}

async function getUserByEmail(email) {
  const pool = await getPool();
  const res = await pool.request().input('email', sql.NVarChar(256), email)
    .query('SELECT * FROM dbo.Users WHERE Email = @email');
  return res.recordset[0] || null;
}

async function listUsers({ role, exclRole } = {}) {
  const pool = await getPool();
  const r = pool.request();
  const where = ['Aktiv = 1'];
  if (role)     { r.input('role', sql.NVarChar(20), role);     where.push('Role = @role'); }
  if (exclRole) { r.input('excl', sql.NVarChar(20), exclRole); where.push('Role <> @excl'); }
  const res = await r.query(`SELECT * FROM dbo.Users WHERE ${where.join(' AND ')} ORDER BY Name`);
  return res.recordset;
}

async function updateUserProfile(oid, fields) {
  const pool = await getPool();
  const r = pool.request();
  r.input('oid', sql.NVarChar(36), oid);
  const sets = [];
  for (const [key, val] of Object.entries(fields)) {
    const c = PATCH_COLUMNS[key];
    if (!c) continue;
    r.input(key, c.type(), val);
    sets.push(`${c.col} = @${key}`);
  }
  if (sets.length === 0) return;
  sets.push('AktualisiertAm = SYSUTCDATETIME()');
  await r.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE Oid = @oid`);
}
```
Und `module.exports` erweitern:
```js
module.exports = {
  parseRoleClaim, buildReqUser, validateUserPatch,
  upsertUser, getUserByOid, getUserByEmail, listUsers, updateUserProfile,
};
```

- [ ] **Step 5: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/services/users.test.js`
Expected: PASS (12 Tests, pristine). *(Die DB-Funktionen werden hier nicht ausgeführt — nur `validateUserPatch` + Task-1-Logik.)*

- [ ] **Step 6: Migration ausführen + DB-Funktionen manuell verifizieren**

Tabelle anlegen (DB-Zugang aus `backend/.env`):
```bash
node -e "const {getPool}=require('./backend/db/connection');const fs=require('fs');(async()=>{const p=await getPool();await p.request().batch(fs.readFileSync('backend/db/create-users-table.sql','utf8'));console.log('migriert');process.exit(0);})().catch(e=>{console.error(e);process.exit(1);})"
```
Expected: `Tabelle dbo.Users angelegt.` / `migriert`.

Upsert + Merge-Regel prüfen:
```bash
node -e "require('dotenv').config({path:'backend/.env'});const u=require('./backend/services/users');(async()=>{await u.upsertUser({oid:'test-oid-1',name:'Test',email:'t@pm.com',role:'azubi',letzterLogin:true});await u.upsertUser({oid:'test-oid-1',name:'Test',email:'t@pm.com',role:'admin'});/* admin ist keine Azure-Rolle → wird von späterem azubi NICHT gesetzt */ await u.upsertUser({oid:'test-oid-1',name:'Test2',email:'t@pm.com',role:'azubi'});const row=await u.getUserByOid('test-oid-1');console.log('Role bleibt admin? ->',row.Role,'| Name aktualisiert ->',row.Name);process.exit(0);})().catch(e=>{console.error(e);process.exit(1);})"
```
Expected: `Role bleibt admin? -> admin | Name aktualisiert -> Test2` (Merge-Regel schützt Sonderrolle, Identität wird aktualisiert). Danach Testzeile entfernen:
```bash
node -e "require('dotenv').config({path:'backend/.env'});const {getPool,sql}=require('./backend/db/connection');(async()=>{const p=await getPool();await p.request().input('o',sql.NVarChar(36),'test-oid-1').query('DELETE FROM dbo.Users WHERE Oid=@o');console.log('cleanup ok');process.exit(0);})()"
```

- [ ] **Step 7: Commit**

```bash
git add backend/db/create-users-table.sql backend/services/users.js backend/services/users.test.js
git commit -m "feat(users): dbo.Users-Schema + Store (upsert/get/list/update) + Patch-Validierung"
```

---

### Task 3: `requireAuth` auf DB umstellen + Dev-Login-Endpunkte + `berechtigungen` ablösen

**Files:**
- Modify: `backend/middleware/auth.js`
- Modify: `backend/server.js`
- Modify: `backend/middleware/auth.test.js`
- Delete: `backend/config/berechtigungen.js`

**Interfaces:**
- Consumes: `getUserByOid`, `buildReqUser` aus `../services/users`.
- Produces: `requireAuth(req,res,next)` (async, DB-gestützt); `devAuth` (Alias); **kein** `DEV_USERS`-Export mehr.

- [ ] **Step 1: Failing test schreiben (auth.test.js ersetzen)**

`backend/middleware/auth.test.js` komplett ersetzen — `requireAuth` lädt jetzt aus der DB; wir stubben `getUserByOid` über den require-Cache:
```js
'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const usersMod = require('../services/users');

// getUserByOid stubben (kein echter DB-Zugriff im Unit-Test).
let STUB = null;
usersMod.getUserByOid = async (oid) => (STUB && STUB.Oid === oid ? STUB : null);

const { requireAuth } = require('./auth');

function makeRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; }, json(b){ this.body=b; return this; } };
}

test('SAML-Session-oid → Nutzer aus DB, Flags abgeleitet', async () => {
  STUB = { Oid: 'real-1', Name: 'A', Email: 'a@b.de', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Aktiv: true };
  const req = { headers: {}, session: { user: { oid: 'real-1' } } };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.role, 'azubi');
  assert.equal(req.user.istAzubi, true);
});

test('Dev X-Dev-OID → gleicher DB-Pfad', async () => {
  STUB = { Oid: 'dev-1', Name: 'D', Email: 'd@b.de', Role: 'pruefer', KannPlanen: true, IstAusbilder: false, Aktiv: true };
  const req = { headers: { 'x-dev-oid': 'dev-1' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.istAusbilder, true); // pruefer → Korrektur
});

test('unbekannte oid → 401', async () => {
  STUB = null;
  const req = { headers: { 'x-dev-oid': 'ghost' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('inaktiver Nutzer → 401', async () => {
  STUB = { Oid: 'x', Role: 'azubi', Aktiv: false };
  const req = { headers: { 'x-dev-oid': 'x' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/middleware/auth.test.js`
Expected: FAIL (altes `auth.js` exportiert noch die DEV_USERS-Variante / `requireAuth` liest nicht aus der DB).

- [ ] **Step 3: `auth.js` neu schreiben**

`backend/middleware/auth.js` komplett ersetzen:
```js
/* ===================================================================
   AUTH-MIDDLEWARE
   Lädt den Nutzer pro Request aus dbo.Users (einzige Quelle) und leitet
   die Flags ab. Ein Pfad für SAML (Session-oid) und Dev (X-Dev-OID /
   Session-userOid).
   =================================================================== */
const { getUserByOid, buildReqUser } = require('../services/users');

async function requireAuth(req, res, next) {
  try {
    const oid = (req.session && req.session.user && req.session.user.oid)
      || req.headers['x-dev-oid']
      || (req.session && req.session.userOid);
    if (!oid) return res.status(401).json({ error: 'Nicht angemeldet.' });
    const row = await getUserByOid(oid);
    if (!row || !row.Aktiv) return res.status(401).json({ error: 'Kein aktiver Nutzer.' });
    req.user = buildReqUser(row);
    next();
  } catch (e) {
    console.error('[auth] requireAuth:', e);
    res.status(500).json({ error: 'Authentifizierung fehlgeschlagen.' });
  }
}

module.exports = { requireAuth, devAuth: requireAuth };
```

- [ ] **Step 4: `server.js` anpassen (DEV_USERS/berechtigungen raus, DB rein)**

In `backend/server.js`:
- Zeile `const { devAuth, DEV_USERS } = require('./middleware/auth');` → `const { devAuth } = require('./middleware/auth');`
- Zeile `const { faehigkeitenFuer } = require('./config/berechtigungen');` **entfernen**.
- `const { getUserByEmail, getUserByOid } = require('./services/users');` **hinzufügen**.
- Die drei Auth-Endpunkte ersetzen:
```js
app.post('/api/auth/login', async (req, res) => {
  const { oid } = req.body;
  const row = await getUserByOid(oid);
  if (!row || !row.Aktiv) return res.status(400).json({ error: 'Unbekannte/inaktive OID' });
  req.session.userOid = oid;
  res.json({ user: require('./services/users').buildReqUser(row) });
});

app.post('/api/auth/login-by-email', async (req, res) => {
  const { email } = req.body;
  const row = await getUserByEmail((email || '').trim().toLowerCase());
  if (!row || !row.Aktiv) return res.status(401).json({ error: 'E-Mail nicht gefunden' });
  req.session.userOid = row.Oid;
  res.json({ user: require('./services/users').buildReqUser(row) });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
```
- Den Dev-Block `app.get('/api/dev/users', …)` der auf `DEV_USERS` zugreift ersetzen durch eine DB-Liste:
```js
if (process.env.NODE_ENV !== 'production') {
  const { listUsers } = require('./services/users');
  app.get('/api/dev/users', async (req, res) => res.json(await listUsers({})));
}
```

- [ ] **Step 5: `berechtigungen.js` löschen**

```bash
git rm backend/config/berechtigungen.js
```
Sicherstellen, dass keine weiteren `require('../config/berechtigungen')` / `faehigkeitenFuer` mehr existieren:
Run: `grep -rn "berechtigungen\|faehigkeitenFuer" backend --include=*.js | grep -v node_modules`
Expected: keine Treffer.

- [ ] **Step 6: Tests ausführen**

Run: `node --test backend/services/users.test.js backend/middleware/auth.test.js backend/routes/saml.test.js`
Expected: alle PASS, pristine.

- [ ] **Step 7: Commit**

```bash
git add backend/middleware/auth.js backend/middleware/auth.test.js backend/server.js
git commit -m "feat(users): requireAuth + Dev-Logins DB-gestützt, berechtigungen/DEV_USERS abgelöst"
```

---

### Task 4: ACS — Rolle mappen & Nutzer beim Login upserten

**Files:**
- Modify: `backend/routes/saml.js`
- Modify: `backend/routes/saml.test.js`

**Interfaces:**
- Consumes: `parseRoleClaim`, `upsertUser` aus `../services/users`; bestehendes `profileToUser`.
- Produces: `assertionToUserData(profile): {oid,name,email,role}` (exportiert, testbar).

- [ ] **Step 1: Failing test schreiben**

In `backend/routes/saml.test.js` anhängen (Datei setzt bereits `process.env.NODE_ENV='test'` in Zeile 1):
```js
const { assertionToUserData } = require('./saml');
const RURI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

test('assertionToUserData bündelt Identität + Rolle', () => {
  const d = assertionToUserData({ objectid: 'g9', email: 'x@pm.com', displayname: 'X Y', [RURI]: 'azubi' });
  assert.equal(d.oid, 'g9');
  assert.equal(d.email, 'x@pm.com');
  assert.equal(d.name, 'X Y');
  assert.equal(d.role, 'azubi');
});

test('assertionToUserData: role null ohne Claim', () => {
  const d = assertionToUserData({ objectid: 'g9', email: 'x@pm.com' });
  assert.equal(d.role, null);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/routes/saml.test.js`
Expected: FAIL — `assertionToUserData is not a function`.

- [ ] **Step 3: `saml.js` anpassen**

Oben ergänzen: `const { parseRoleClaim, upsertUser } = require('../services/users');`
Nach `profileToUser` einfügen:
```js
// Assertion → Datensatz für upsertUser (Identität + Azure-Basisrolle).
function assertionToUserData(profile) {
  return { ...profileToUser(profile), role: parseRoleClaim(profile) };
}
```
Im ACS-Handler den Erfolgszweig ändern — statt `req.session.user = user` erst upserten, dann nur die oid in die Session:
```js
    const data = assertionToUserData(profile);
    if (!data.oid) throw new Error('Assertion ohne objectid-Claim');
    await upsertUser({ ...data, letzterLogin: true });
    req.session.regenerate((err) => {
      if (err) { console.error('[saml] session.regenerate:', err); return res.redirect(`${LOGIN_PAGE}?error=sso`); }
      req.session.user = { oid: data.oid };
      req.session.save((saveErr) => {
        if (saveErr) { console.error('[saml] session.save:', saveErr); return res.redirect(`${LOGIN_PAGE}?error=sso`); }
        res.redirect(DASHBOARD);
      });
    });
```
(Die bestehende `profileToUser`-Nutzung/-Zeile `const user = profileToUser(profile)` entfällt zugunsten von `data`.)
Exporte ergänzen: `module.exports.assertionToUserData = assertionToUserData;`

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/routes/saml.test.js`
Expected: PASS, pristine.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/saml.js backend/routes/saml.test.js
git commit -m "feat(saml): ACS mappt role-Claim und upsertet Nutzer beim Login"
```

---

### Task 5: `/api/users` aus der DB + `PATCH /api/users/:oid`

**Files:**
- Modify: `backend/routes/users.js`

**Interfaces:**
- Consumes: `listUsers`, `getUserByOid`, `updateUserProfile`, `validateUserPatch`, `buildReqUser` aus `../services/users`.

- [ ] **Step 1: Router neu schreiben**

`backend/routes/users.js` komplett ersetzen:
```js
const router = require('express').Router();
const { listUsers, getUserByOid, updateUserProfile, validateUserPatch, buildReqUser } = require('../services/users');

// GET /api/users?role=azubi | ?exclRole=azubi
router.get('/', async (req, res) => {
  try {
    const rows = await listUsers({ role: req.query.role, exclRole: req.query.exclRole });
    res.json(rows.map(buildReqUser));
  } catch (e) { console.error('[users] list:', e); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/users/:oid
router.get('/:oid', async (req, res) => {
  const row = await getUserByOid(req.params.oid);
  if (!row) return res.status(404).json({ error: 'User nicht gefunden' });
  res.json(buildReqUser(row));
});

// PATCH /api/users/:oid  – nur admin/developer
router.patch('/:oid', async (req, res) => {
  if (!['admin', 'developer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Nur Admin/Developer' });
  }
  const check = validateUserPatch(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    await updateUserProfile(req.params.oid, req.body);
    const row = await getUserByOid(req.params.oid);
    res.json(buildReqUser(row));
  } catch (e) { console.error('[users] patch:', e); res.status(500).json({ error: 'Fehler' }); }
});

module.exports = router;
```

- [ ] **Step 2: Manuell verifizieren (Server läuft auf 3000, DB migriert + geseedet nach Task 6)**

Nach dem Seed (Task 6) mit einem Dev-Admin-Login:
```bash
node -e "const http=require('http');const b=JSON.stringify({oid:'00000000-0000-0000-0000-000000000004'});const r=http.request({host:'localhost',port:3000,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json'}},res=>{let s=res.headers['set-cookie'];let d='';res.on('data',x=>d+=x);res.on('end',()=>{const c=http.request({host:'localhost',port:3000,path:'/api/users?role=azubi',headers:{Cookie:s}},r2=>{let o='';r2.on('data',x=>o+=x);r2.on('end',()=>console.log('azubis:',o))});c.end();})});r.end(b)"
```
Expected: JSON-Liste der Azubi-Nutzer aus der DB.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/users.js
git commit -m "feat(users): /api/users aus DB + PATCH (admin/developer)"
```

---

### Task 6: Demo-Seed + DH-Seed-Kompatibilität

**Files:**
- Create: `backend/db/seed-demo-users.sql`

**Interfaces:** —

- [ ] **Step 1: Seed-Skript schreiben**

`backend/db/seed-demo-users.sql` — die bisherigen DEV_USERS + ein Developer + Jana Hofer (DH):
```sql
SET NOCOUNT ON;
MERGE dbo.Users AS t USING (VALUES
  ('00000000-0000-0000-0000-000000000001', N'Florian Kuniß',     'florian.kuniss@putzmeister.com', 'azubi',     0,0, N'Mechatroniker',                     '2024-09-01','2027-08-31',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000002', N'Matthias Lengerer', 'matthias.fauser@putzmeister.com','pruefer',   1,1, NULL, NULL, NULL, N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000003', N'Florian Kern',      'florian.kern@putzmeister.com',   'azubi',     0,0, N'Fachinformatiker für Systemintegration','2025-09-01','2028-08-31',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000004', N'Admin Verwaltung',  'admin@putzmeister.com',          'admin',     1,0, NULL, NULL, NULL, N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000005', N'Lena Müller',       'lena.mueller@putzmeister.com',   'azubi',     0,0, N'Industriekauffrau',                 '2024-09-01','2027-08-31',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000006', N'Jonas Becker',      'jonas.becker@putzmeister.com',   'azubi',     0,0, N'Mechatroniker',                     '2023-09-01','2026-08-31',N'täglich'),
  ('00000000-0000-0000-0000-000000000007', N'Jana Hofer',        'jana.hofer@putzmeister.com',     'dhstudent', 0,0, N'DH Maschinenbau',                   '2025-10-01','2028-09-30',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000099', N'Developer Demo',    'dev@putzmeister.com',            'developer', 0,0, NULL, NULL, NULL, N'wöchentlich')
) AS s(Oid,Name,Email,Role,KannPlanen,IstAusbilder,Beruf,AusbildungBeginn,AusbildungEnde,BerichtTyp)
ON t.Oid = s.Oid
WHEN MATCHED THEN UPDATE SET Name=s.Name, Email=s.Email, Role=s.Role, KannPlanen=s.KannPlanen,
  IstAusbilder=s.IstAusbilder, Beruf=s.Beruf, AusbildungBeginn=s.AusbildungBeginn,
  AusbildungEnde=s.AusbildungEnde, BerichtTyp=s.BerichtTyp, Aktiv=1, AktualisiertAm=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (Oid,Name,Email,Role,KannPlanen,IstAusbilder,Beruf,AusbildungBeginn,AusbildungEnde,BerichtTyp)
  VALUES (s.Oid,s.Name,s.Email,s.Role,s.KannPlanen,s.IstAusbilder,s.Beruf,s.AusbildungBeginn,s.AusbildungEnde,s.BerichtTyp);
PRINT 'Demo-User geseedet.';
```

- [ ] **Step 2: Seed ausführen + verifizieren**

```bash
node -e "const {getPool}=require('./backend/db/connection');const fs=require('fs');require('dotenv').config({path:'backend/.env'});(async()=>{const p=await getPool();await p.request().batch(fs.readFileSync('backend/db/seed-demo-users.sql','utf8'));const r=await p.request().query('SELECT COUNT(*) n FROM dbo.Users');console.log('User-Zeilen:',r.recordset[0].n);process.exit(0);})().catch(e=>{console.error(e);process.exit(1);})"
```
Expected: `Demo-User geseedet.` und `User-Zeilen: 8` (oder mehr, falls reale Nutzer schon existieren).

- [ ] **Step 3: Commit**

```bash
git add backend/db/seed-demo-users.sql
git commit -m "feat(users): Demo-Seed (7 Demo-User + Developer) für lokale Dev"
```

---

### Task 7: CSV-Bootstrap-Import

**Files:**
- Create: `backend/db/import-users.js`
- Create: `backend/db/import-users.test.js`

**Interfaces:**
- Consumes: `upsertUser` aus `../services/users`.
- Produces: `parseUsersCsv(text): object[]` (pur, testbar) — Header-Zeile + Komma-getrennt; Spalten `oid,email,name,role,beruf,beginn,ende,berichtTyp`.

- [ ] **Step 1: Failing test schreiben**

`backend/db/import-users.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsersCsv } = require('./import-users');

test('parseUsersCsv liest Zeilen in Objekte', () => {
  const csv = 'oid,email,name,role,beruf,beginn,ende,berichtTyp\n' +
              '43ccffad,florian.kuniss@pm.com,Kuniß Florian,azubi,Mechatroniker,2024-09-01,2027-08-31,wöchentlich';
  const rows = parseUsersCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].oid, '43ccffad');
  assert.equal(rows[0].role, 'azubi');
  assert.equal(rows[0].berichtTyp, 'wöchentlich');
});

test('parseUsersCsv ignoriert Leerzeilen und trimmt', () => {
  const csv = 'oid,email,name,role\n a1 , x@pm.com , Max , azubi \n\n';
  const rows = parseUsersCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].oid, 'a1');
  assert.equal(rows[0].name, 'Max');
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/db/import-users.test.js`
Expected: FAIL — `parseUsersCsv is not a function`.

- [ ] **Step 3: Import-Skript implementieren**

`backend/db/import-users.js`:
```js
'use strict';
/* CSV-Bootstrap: befüllt dbo.Users aus einer vom Azure-Kollegen gelieferten
   CSV. Aufruf:  node backend/db/import-users.js <pfad-zur-csv>
   Erwartete Spalten (Header): oid,email,name,role[,beruf,beginn,ende,berichtTyp] */
const fs = require('node:fs');

function parseUsersCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

async function main() {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const { upsertUser } = require('../services/users');
  const file = process.argv[2];
  if (!file) { console.error('Usage: node backend/db/import-users.js <csv>'); process.exit(2); }
  const rows = parseUsersCsv(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const r of rows) {
    if (!r.oid) continue;
    await upsertUser({
      oid: r.oid, name: r.name, email: (r.email || '').toLowerCase(),
      role: r.role || 'azubi', beruf: r.beruf || null,
      ausbildungBeginn: r.beginn || null, ausbildungEnde: r.ende || null,
      berichtTyp: r.berichtTyp || null,
    });
    n++;
  }
  console.log(`Import: ${n} Nutzer verarbeitet.`);
  process.exit(0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { parseUsersCsv };
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/db/import-users.test.js`
Expected: PASS (2 Tests, pristine).

- [ ] **Step 5: Commit**

```bash
git add backend/db/import-users.js backend/db/import-users.test.js
git commit -m "feat(users): CSV-Bootstrap-Import (parseUsersCsv + upsert)"
```

---

### Task 8: Frontend — `developer`-Voll-Sicht + Rollen-Labels

**Files:**
- Modify: `app/js/app.js`

**Interfaces:**
- Consumes: `req.user`-Flags (via `DB.fetchCurrentUser`).

**Hinweis:** Die Capability-Flags eines Developers (`kannPlanen`/`istAusbilder`/`istAzubi` = true, `istDhStudent` = false) liefert bereits `buildReqUser` server-seitig (Task 1). Das Frontend braucht daher **nur** noch die seitenweise Rollen-Sperre (`requireRole`) für `developer` zu öffnen und die Labels zu ergänzen — `applyCapabilities`/`initLayout` funktionieren dann ohne Sonderfall korrekt.

- [ ] **Step 1: `requireRole` — developer immer zulassen**

In `app/js/app.js` die Funktion `requireRole` anpassen:
```js
async function requireRole(...roles) {
  const user = await requireAuth();
  if (!user) return null;
  if (user.role !== 'developer' && !roles.includes(user.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}
```

- [ ] **Step 2: `ROLE_LABELS` erweitern**

Die `ROLE_LABELS`-Konstante in `app.js` um die neuen Rollen ergänzen (bestehende Einträge unverändert lassen):
```js
  pruefer:   'Prüfer',
  developer: 'Developer',
```

- [ ] **Step 3: Prüfen, ob eine Seite `requireRole('dhstudent')` o. Ä. nutzt**

Run: `grep -rn "requireRole(" app/js | grep -v node_modules`
Für jede Fundstelle sicherstellen, dass `developer` durch die Änderung in Step 1 automatisch zugelassen ist (das ist der Fall, da Step 1 `developer` global durchlässt). Kein weiterer Code nötig — dieser Step ist eine Verifikation, kein Edit.

- [ ] **Step 4: Syntax + manuelle Verifikation**

Run: `node --check app/js/app.js`
Expected: exit 0.
Manuell (Server auf 3000, Dev-Login als Developer-OID `00000000-0000-0000-0000-000000000099`): alle Nav-Einträge sichtbar, Dashboard + Wochenansicht + Planer + Berichtsheftverwaltung erreichbar, keine Zwangs-Umleitung auf `abteilungsdurchlauf.html`.

- [ ] **Step 5: Commit**

```bash
git add app/js/app.js
git commit -m "feat(users): developer sieht alle Ansichten + Rollen-Labels pruefer/developer"
```

---

### Task 9: Frontend — Admin-UI zur Nutzer-/Profil-Pflege

Ein Nutzer-Editor für Admin/Developer in der Berichtsheftverwaltung: Liste + Formular, das `PATCH /api/users/:oid` aufruft.

**Files:**
- Modify: `app/js/api.js` (DB-Methoden)
- Modify: `app/berichtsheftverwaltung.html` (Editor-Sektion)
- Modify: `app/js/berichtsheftverwaltung.js` (Editor-Logik)

**Interfaces:**
- Consumes: `GET /api/users?exclRole=dhstudent`, `PATCH /api/users/:oid`.
- Produces: `DB.getAllUsers()`, `DB.updateUser(oid, fields)` in `api.js`.

- [ ] **Step 1: API-Methoden ergänzen**

In `app/js/api.js` im `DB`-Objekt ergänzen (neben den anderen User-Methoden):
```js
  async getAllUsers() {
    const data = await apiFetch('/users');
    return data.map(u => normalizeUser(u.oid, u));
  },
  async updateUser(oid, fields) {
    const data = await apiFetch(`/users/${oid}`, { method: 'PATCH', body: fields });
    return normalizeUser(data.oid, data);
  },
```

- [ ] **Step 2: Editor-Sektion ins HTML**

In `app/berichtsheftverwaltung.html` innerhalb des Hauptcontainers (nur für Admin sichtbar via bestehender `nav-planer-only`/CSS-Konvention) einfügen:
```html
<section id="userAdmin" class="card" data-admin-only hidden>
  <h2>Nutzerverwaltung</h2>
  <table id="userAdminTable"><thead><tr>
    <th>Name</th><th>Rolle</th><th>Beruf</th><th>Berichtstyp</th><th>Planen</th><th>Korrektur</th><th>Aktiv</th><th></th>
  </tr></thead><tbody></tbody></table>
</section>
```

- [ ] **Step 3: Editor-Logik**

In `app/js/berichtsheftverwaltung.js` ans Ende der Initialisierung einfügen:
```js
async function initUserAdmin(currentUser) {
  const sec = document.getElementById('userAdmin');
  if (!sec || !['admin', 'developer'].includes(currentUser.role)) return;
  sec.hidden = false;
  const tbody = sec.querySelector('#userAdminTable tbody');
  const users = await DB.getAllUsers();
  const ROLES = ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer'];
  const TYPES = ['wöchentlich', 'täglich'];
  tbody.innerHTML = '';
  for (const u of users) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${u.name}</td>` +
      `<td><select data-f="role">${ROLES.map(r => `<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></td>` +
      `<td><input data-f="beruf" value="${u.beruf ?? ''}"></td>` +
      `<td><select data-f="berichtTyp">${TYPES.map(t => `<option ${u.berichtTyp===t?'selected':''}>${t}</option>`).join('')}</select></td>` +
      `<td><input type="checkbox" data-f="kannPlanen" ${u.kannPlanen?'checked':''}></td>` +
      `<td><input type="checkbox" data-f="istAusbilder" ${u.istAusbilder?'checked':''}></td>` +
      `<td><input type="checkbox" data-f="aktiv" ${u.aktiv!==false?'checked':''}></td>` +
      `<td><button data-save>Speichern</button></td>`;
    tr.querySelector('[data-save]').addEventListener('click', async () => {
      const fields = {};
      tr.querySelectorAll('[data-f]').forEach(el => {
        const f = el.dataset.f;
        fields[f] = el.type === 'checkbox' ? el.checked : el.value;
      });
      try { await DB.updateUser(u.oid, fields); showToast?.('Gespeichert'); }
      catch (e) { showToast?.('Fehler: ' + e.message); }
    });
    tbody.appendChild(tr);
  }
}
```
Und im bestehenden Init-Fluss (nachdem `currentUser` feststeht) `initUserAdmin(currentUser);` aufrufen.

- [ ] **Step 4: Syntax + manuelle Verifikation**

Run: `node --check app/js/api.js app/js/berichtsheftverwaltung.js`
Expected: exit 0.
Manuell (Dev-Login Admin/Developer): Berichtsheftverwaltung öffnen → Nutzerliste erscheint; ein Feld ändern + Speichern → `PATCH` erfolgreich, Wert bleibt nach Reload. Als Azubi eingeloggt: Sektion **nicht** sichtbar.

- [ ] **Step 5: Commit**

```bash
git add app/js/api.js app/berichtsheftverwaltung.html app/js/berichtsheftverwaltung.js
git commit -m "feat(users): Admin-UI zur Nutzer-/Profil-/Rechte-Pflege (PATCH)"
```

---

## Hinweise / Reihenfolge

- **Phase A (Tasks 1–6)** liefert den Kernwert: reale SSO-Nutzer bekommen die richtige Ansicht; Dev-Logins laufen DB-gestützt. **Phase B (Tasks 7–9)** ergänzt CSV-Bootstrap und Admin-Pflege.
- **DB-Migration (Task 2 Step 6) und Seed (Task 6)** müssen einmalig gegen die Dev-DB laufen, bevor Task 3/5/8/9 manuell verifiziert werden.
- **Graph-Ready:** ein späterer Graph-Sync ruft dieselbe `upsertUser(data)` — kein Umbau nötig.
- **Prod (nicht dieser Plan):** `import-users.js` mit der Kollegen-CSV ausführen; Florian + Kollege in `dbo.Users` auf `Role='developer'` setzen; Migration/Seed gegen Prod-DB.
