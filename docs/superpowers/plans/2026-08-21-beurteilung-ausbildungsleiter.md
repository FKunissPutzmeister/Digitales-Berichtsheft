# Ausbildungsleiter statt Ausbilder im Beurteilungsbogen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den dritten Signatur-Schritt im Beurteilungsbogen korrekt an den zuständigen Ausbildungsleiter (Beruf→Bereich-Katalog, zwei feste Personen) statt an die dauerhafte Ausbilder-Zuordnung binden; nur der zeitlich zugewiesene Prüfer darf bearbeiten; der dauerhafte Ausbilder wird auf reine Ansicht zurückgestuft.

**Architecture:** Neue Migration 036 benennt die falsch benannten Beurteilungen-Spalten um und legt `dbo.Berufe` (Katalog) + zwei neue `dbo.Users`-Spalten an. Ein neuer `berufe`-Service+Route (CRUD, 1:1 nach dem Muster von `abteilungen.js`) liefert die Beruf→Bereich-Zuordnung. `beurteilungen.js` bekommt eine enge Bearbeiten-Prüfung (nur Prüfer) getrennt von der bestehenden breiten Ansichts-Prüfung, plus eine serverseitig berechnete `modus`-Angabe, auf die das Frontend die komplette Aktionsleiste stützt (kein Client-Raten mehr). Die Nutzerverwaltung bekommt die Ausbildungsleiter-Zuordnung (Checkbox+Bereich) und einen neuen Berufe-Abschnitt auf derselben Seite.

**Tech Stack:** Node.js/Express 5, `mssql`, `node:test` + `node:assert/strict` (kolokierte `*.test.js`, Ausführung via `node --test`), Vanilla-JS-Frontend, SQL Server (`dbo`-Schema).

Spec: [docs/superpowers/specs/2026-08-21-beurteilung-ausbildungsleiter-design.md](../specs/2026-08-21-beurteilung-ausbildungsleiter-design.md)

---

## Wichtige Abweichung von der Spec (bewusst, während der Planung erkannt)

Die Spec sagt, `istDauerhafterAusbilderVon`/`istDauerhafterAusbilder`
„bleiben zwar im Code bestehen … bekommen aber eine neue, engere Aufgabe:
nur noch 'darf ansehen'". Bei der Planung zeigt sich: die bestehende,
**unverändert bleibende** breite `darfBeurteilen`-Prüfung deckt „darf
ansehen" (inkl. dauerhaftem Ausbilder) bereits vollständig über
`verantwortlichFuerZuweisung` (in `zugriff.js`) ab — diese beiden
Funktionen hätten nach dem Umbau **keinen einzigen Aufrufer mehr** in
`beurteilungen.js`. Totes Code lassen widerspricht YAGNI und würde
Verwirrung stiften (zwei parallele „wer ist der Ausbilder"-Konzepte).
Dieser Plan entfernt `istDauerhafterAusbilderVon`, `istDauerhafterAusbilder`
und `berechneAusbilderSchrittEntfaellt` vollständig (Task 5), statt sie
nur umzuwidmen. Das Ergebnis entspricht der Absicht der Spec (dauerhafter
Ausbilder verliert seine Sonderrolle im Signatur-Prozess), nur sauberer.

---

## File Structure

| Datei | Änderung |
|---|---|
| `db/migrations/036_ausbildungsleiter.sql` | neu |
| `backend/services/berufe.js` | neu |
| `backend/services/berufe.test.js` | neu |
| `backend/routes/berufe.js` | neu |
| `backend/server.js` | Route mounten |
| `backend/services/users.js` | erweitert |
| `backend/services/beurteilungen.js` | umgebaut |
| `backend/services/beurteilungen.test.js` | umgebaut |
| `backend/routes/beurteilungen.js` | umgebaut |
| `app/js/api.js` | erweitert |
| `app/js/beurteilung.js` | umgebaut |
| `app/js/nutzerverwaltung.js` | erweitert |

---

### Task 1: Migration 036 — Datenmodell

**Files:**
- Create: `db/migrations/036_ausbildungsleiter.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 036 – Ausbildungsleiter statt Ausbilder im Beurteilungsbogen
-- Ausführen gegen: Berichtsheft_Dev
--
-- Migration 035 hat den dritten Signatur-Schritt fälschlich an "Ausbilder"
-- benannt (gemeint war: der zuständige Ausbildungsleiter, zwei feste
-- Personen je Berufsgruppe). Diese Migration:
-- 1) benennt die betroffenen Beurteilungen-Spalten um (Daten bleiben erhalten)
-- 2) legt den Berufe->Bereich-Katalog an (Pflege in der Nutzerverwaltung)
-- 3) ergänzt IstAusbildungsleiter/AusbildungsleiterBereich auf dbo.Users
-- Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Beurteilungen','AusbilderBestaetigtVon') IS NOT NULL
   AND COL_LENGTH('dbo.Beurteilungen','AusbildungsleiterBestaetigtVon') IS NULL
BEGIN
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderBestaetigtVon', 'AusbildungsleiterBestaetigtVon', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderBestaetigtAm', 'AusbildungsleiterBestaetigtAm', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderUnterschriftBild', 'AusbildungsleiterUnterschriftBild', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderUnterschriftExt', 'AusbildungsleiterUnterschriftExt', 'COLUMN';
  PRINT 'Beurteilungen-Spalten von Ausbilder* auf Ausbildungsleiter* umbenannt.';
END
ELSE PRINT 'Umbenennung bereits erfolgt oder Ausgangsspalten fehlen.';

IF OBJECT_ID('dbo.Berufe', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Berufe (
    Id      INT IDENTITY(1,1) PRIMARY KEY,
    Beruf   NVARCHAR(200) NOT NULL,
    Bereich NVARCHAR(20)  NOT NULL
      CONSTRAINT CK_Berufe_Bereich CHECK (Bereich IN ('technisch','kaufmaennisch')),
    CONSTRAINT UQ_Berufe_Beruf UNIQUE (Beruf)
  );
  INSERT INTO dbo.Berufe (Beruf, Bereich) VALUES
    ('Industriemechaniker', 'technisch'),
    ('Mechatroniker', 'technisch'),
    ('Lackierer', 'technisch');
  PRINT 'Tabelle dbo.Berufe angelegt und mit bekannten technischen Berufen vorbelegt.';
END
ELSE PRINT 'dbo.Berufe existiert bereits.';

IF COL_LENGTH('dbo.Users','IstAusbildungsleiter') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD
    IstAusbildungsleiter     BIT          NOT NULL CONSTRAINT DF_Users_IstAusbildungsleiter DEFAULT 0,
    AusbildungsleiterBereich NVARCHAR(20) NULL
      CONSTRAINT CK_Users_AusbildungsleiterBereich CHECK (AusbildungsleiterBereich IN ('technisch','kaufmaennisch'));
  PRINT 'Spalten IstAusbildungsleiter/AusbildungsleiterBereich auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Ausbildungsleiter-Spalten bereits.';
```

- [ ] **Step 2: Manuell prüfen (kein automatisierter Test — Migrationen laufen manuell)**

Datei auf Syntax/Idempotenz durchlesen. **Nicht selbst gegen die Dev-DB
ausführen** — nur der Repo-Owner spielt Migrationen manuell ein.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/036_ausbildungsleiter.sql
git commit -m "feat(db): Migration 036 - Ausbildungsleiter-Umbau (Rename + Berufe-Katalog)"
```

---

### Task 2: Backend-Service `berufe.js` (TDD)

**Files:**
- Create: `backend/services/berufe.test.js`
- Create: `backend/services/berufe.js`

- [ ] **Step 1: Failing Test für `bereichFuerBeruf` schreiben**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./berufe.js');

test('bereichFuerBeruf: findet den Bereich case-insensitiv exakt', () => {
  const katalog = [
    { beruf: 'Industriemechaniker', bereich: 'technisch' },
    { beruf: 'Industriekaufmann/-frau', bereich: 'kaufmaennisch' },
  ];
  assert.equal(B.bereichFuerBeruf('Industriemechaniker', katalog), 'technisch');
  assert.equal(B.bereichFuerBeruf('industriemechaniker', katalog), 'technisch');
  assert.equal(B.bereichFuerBeruf('  Industriemechaniker  ', katalog), 'technisch');
});

test('bereichFuerBeruf: null ohne Katalog-Treffer, ohne Beruf oder ohne Katalog', () => {
  const katalog = [{ beruf: 'Mechatroniker', bereich: 'technisch' }];
  assert.equal(B.bereichFuerBeruf('Unbekannter Beruf', katalog), null);
  assert.equal(B.bereichFuerBeruf(null, katalog), null);
  assert.equal(B.bereichFuerBeruf('', katalog), null);
  assert.equal(B.bereichFuerBeruf('Mechatroniker', []), null);
  assert.equal(B.bereichFuerBeruf('Mechatroniker', null), null);
});

test('validateBeruf: Pflichtfelder beim Anlegen', () => {
  assert.equal(B.validateBeruf({}).ok, false);
  assert.equal(B.validateBeruf({ beruf: '', bereich: 'technisch' }).ok, false);
  assert.equal(B.validateBeruf({ beruf: 'Lackierer', bereich: 'unsinn' }).ok, false);
  assert.equal(B.validateBeruf({ beruf: 'Lackierer', bereich: 'technisch' }).ok, true);
  assert.equal(B.validateBeruf({ beruf: 'x'.repeat(201), bereich: 'technisch' }).ok, false);
});

test('validateBeruf: partial erlaubt Teilupdate', () => {
  assert.equal(B.validateBeruf({ bereich: 'kaufmaennisch' }, { partial: true }).ok, true);
  assert.equal(B.validateBeruf({ unbekannt: 1 }, { partial: true }).ok, false);
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `node --test backend/services/berufe.test.js`
Expected: FAIL mit "Cannot find module './berufe.js'"

- [ ] **Step 3: Service implementieren**

```js
'use strict';
/* Berufe->Bereich-Katalog (dbo.Berufe) — ordnet Berufsbezeichnungen einem
   Bereich (technisch/kaufmaennisch) zu, damit der zuständige Ausbildungs-
   leiter im Beurteilungsbogen automatisch ermittelt werden kann, ohne
   Berufsbezeichnungen im Code zu verankern. Pflege in der Nutzerverwaltung. */
const { getPool, sql } = require('../db/connection');

const BEREICHE = ['technisch', 'kaufmaennisch'];
const BERUF_MAX = 200;

function validateBeruf(fields, { partial = false } = {}) {
  const known = ['beruf', 'bereich'];
  const keys = Object.keys(fields || {});
  if (keys.length === 0) return { ok: false, error: 'Keine Felder angegeben' };
  for (const k of keys) if (!known.includes(k)) return { ok: false, error: `Unbekanntes Feld: ${k}` };
  if (!partial || 'beruf' in fields) {
    if (typeof fields.beruf !== 'string' || !fields.beruf.trim()) return { ok: false, error: 'Beruf ist Pflicht' };
    if (fields.beruf.length > BERUF_MAX) return { ok: false, error: `Beruf max. ${BERUF_MAX} Zeichen` };
  }
  if (!partial || 'bereich' in fields) {
    if (!BEREICHE.includes(fields.bereich)) return { ok: false, error: 'Bereich muss technisch oder kaufmaennisch sein' };
  }
  return { ok: true };
}

// Reine Logik: Bereich für einen Beruf-Freitext aus dem Katalog ermitteln.
// Case-insensitiv, getrimmt — Beruf kommt konsistent aus Azure AD (jobTitle).
// null, wenn kein Katalog-Eintrag existiert.
function bereichFuerBeruf(beruf, katalog) {
  if (!beruf) return null;
  const gesucht = String(beruf).trim().toLowerCase();
  const treffer = (katalog || []).find(k => String(k.beruf).trim().toLowerCase() === gesucht);
  return treffer ? treffer.bereich : null;
}

async function listBerufe() {
  const pool = await getPool();
  const r = await pool.request().query('SELECT Id, Beruf, Bereich FROM dbo.Berufe ORDER BY Beruf');
  return r.recordset.map(x => ({ id: x.Id, beruf: x.Beruf, bereich: x.Bereich }));
}

async function createBeruf({ beruf, bereich }) {
  const pool = await getPool();
  const r = await pool.request()
    .input('beruf', sql.NVarChar(BERUF_MAX), beruf.trim())
    .input('bereich', sql.NVarChar(20), bereich)
    .query('INSERT INTO dbo.Berufe (Beruf, Bereich) OUTPUT inserted.Id VALUES (@beruf, @bereich)');
  return { id: r.recordset[0].Id, beruf: beruf.trim(), bereich };
}

async function updateBeruf(id, fields) {
  const map = {
    beruf:   { col: 'Beruf',   type: () => sql.NVarChar(BERUF_MAX), val: v => v.trim() },
    bereich: { col: 'Bereich', type: () => sql.NVarChar(20),        val: v => v },
  };
  const pool = await getPool();
  const r = pool.request().input('id', sql.Int, id);
  const sets = [];
  for (const [k, def] of Object.entries(map)) {
    if (k in fields) { r.input(k, def.type(), def.val(fields[k])); sets.push(`${def.col} = @${k}`); }
  }
  if (sets.length === 0) return await getBerufById(id);
  await r.query(`UPDATE dbo.Berufe SET ${sets.join(', ')} WHERE Id = @id`);
  return await getBerufById(id);
}

async function getBerufById(id) {
  const all = await listBerufe();
  return all.find(b => b.id === id) || null;
}

async function deleteBeruf(id) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Berufe WHERE Id = @id');
}

module.exports = {
  BEREICHE, validateBeruf, bereichFuerBeruf,
  listBerufe, createBeruf, updateBeruf, getBerufById, deleteBeruf,
};
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `node --test backend/services/berufe.test.js`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/berufe.js backend/services/berufe.test.js
git commit -m "feat(berufe): Service fuer Berufe->Bereich-Katalog"
```

---

### Task 3: Route `/api/berufe`

**Files:**
- Create: `backend/routes/berufe.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Route implementieren (1:1 nach dem Muster von `backend/routes/abteilungen.js`)**

```js
'use strict';
/* =====================================================================
   Berufe-Katalog-Routen: /api/berufe
   GET ist für alle authentifizierten Nutzer lesbar (wird bei der
   Beurteilungs-Ermittlung des Ausbildungsleiters gebraucht); alle
   schreibenden Operationen sind developer-only (Pflege in der
   Nutzerverwaltung).
   ===================================================================== */
const router = require('express').Router();
const svc = require('../services/berufe');
const { logError } = require('../services/fehlerberichte');

function requireDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  next();
}

// GET /api/berufe
router.get('/', async (req, res) => {
  try { res.json(await svc.listBerufe()); }
  catch (e) {
    logError({ quelle: 'backend', nachricht: `[berufe] list: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /api/berufe
router.post('/', requireDeveloper, async (req, res) => {
  const check = svc.validateBeruf(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  try { res.json(await svc.createBeruf(req.body)); }
  catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Beruf existiert bereits' });
    logError({ quelle: 'backend', nachricht: `[berufe] create: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// PATCH /api/berufe/:id
router.patch('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  const check = svc.validateBeruf(req.body || {}, { partial: true });
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const row = await svc.updateBeruf(id, req.body);
    if (!row) return res.status(404).json({ error: 'Beruf nicht gefunden' });
    res.json(row);
  } catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Beruf bereits vergeben' });
    logError({ quelle: 'backend', nachricht: `[berufe] patch: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/berufe/:id
router.delete('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  try { await svc.deleteBeruf(id); res.json({ ok: true }); }
  catch (e) {
    logError({ quelle: 'backend', nachricht: `[berufe] delete: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

module.exports = router;
```

- [ ] **Step 2: In `backend/server.js` mounten**

Nach der Zeile `const unterschriftRouter   = require('./routes/unterschrift');` ergänzen:

```js
const berufeRouter         = require('./routes/berufe');
```

Nach der Zeile `app.use('/api/abteilungen',         devAuth, abteilungenRouter);` ergänzen:

```js
app.use('/api/berufe',              devAuth, berufeRouter);
```

- [ ] **Step 3: Manuell verifizieren**

`node --check backend/routes/berufe.js` und `node --check backend/server.js` müssen bestehen. Confirm additive-only diff in `server.js` (nur die 2 neuen Zeilen, nichts entfernt/verschoben).

- [ ] **Step 4: Commit**

```bash
git add backend/routes/berufe.js backend/server.js
git commit -m "feat(berufe): Route /api/berufe (GET/POST/PATCH/DELETE)"
```

---

### Task 4: `users.js` — Ausbildungsleiter-Felder

**Files:**
- Modify: `backend/services/users.js`

- [ ] **Step 1: `buildReqUser` erweitern**

In der bestehenden `buildReqUser`-Funktion, nach der Zeile
`istAusbilder: isDev || role === 'pruefer' || !!row.IstAusbilder,` ergänzen:

```js
    // Ausbildungsleiter: eigenständiges Tag, KEIN Zusammenhang mit istAusbilder
    // (der dauerhafte Ausbilder ist eine andere Rolle, siehe Design-Spec
    // 2026-08-21). Genau zwei Personen im echten Betrieb, je Bereich eine.
    istAusbildungsleiter: !!row.IstAusbildungsleiter,
    ausbildungsleiterBereich: row.AusbildungsleiterBereich ?? null,
```

- [ ] **Step 2: `PATCH_COLUMNS` erweitern**

Nach der Zeile `istAzubi:         { col: 'IstAzubi',         type: () => sql.Bit },` ergänzen:

```js
  istAusbildungsleiter:     { col: 'IstAusbildungsleiter',     type: () => sql.Bit },
  ausbildungsleiterBereich: { col: 'AusbildungsleiterBereich', type: () => sql.NVarChar(20) },
```

- [ ] **Step 3: `validateUserPatch` — Bereich-Werte einschränken**

Nach dem bestehenden Block

```js
  if ('berichtTyp' in fields && !ALLOWED_BERICHT.includes(fields.berichtTyp)) {
    return { ok: false, error: 'Ungültiger Berichtstyp' };
  }
```

ergänzen:

```js
  if ('ausbildungsleiterBereich' in fields && fields.ausbildungsleiterBereich != null
      && !['technisch', 'kaufmaennisch'].includes(fields.ausbildungsleiterBereich)) {
    return { ok: false, error: 'Ungültiger Ausbildungsleiter-Bereich' };
  }
```

- [ ] **Step 4: Manuell verifizieren**

```bash
node -e "require('./backend/services/users.js'); console.log('lädt ohne Fehler')"
```

Expected: `lädt ohne Fehler`

- [ ] **Step 5: Commit**

```bash
git add backend/services/users.js
git commit -m "feat(users): IstAusbildungsleiter/AusbildungsleiterBereich lesbar+editierbar"
```

---

### Task 5: `beurteilungen.js` — alte Ausbilder-Signatur-Logik entfernen, enge Bearbeiten-Prüfung einführen

**Files:**
- Modify: `backend/services/beurteilungen.js`
- Modify: `backend/services/beurteilungen.test.js`

- [ ] **Step 1: Alten Test entfernen, neuen (failing) Test schreiben**

Ersetze den **gesamten Inhalt** von `backend/services/beurteilungen.test.js` durch:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilungen.js');

test('darfBeurteilungBearbeiten: true fuer admin/developer unabhaengig von der Zuweisung', () => {
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'admin', email: 'x@y.de' }, null), true);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'developer', email: 'x@y.de' }, { verantwortlicherEmail: 'andere@y.de' }), true);
});

test('darfBeurteilungBearbeiten: true nur bei exaktem E-Mail-Match auf die Zuweisung (case-insensitiv)', () => {
  const zuw = { verantwortlicherEmail: 'Pruefer@Firma.de' };
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'pruefer@firma.de' }, zuw), true);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'andere@firma.de' }, zuw), false);
});

test('darfBeurteilungBearbeiten: false ohne Zuweisung oder ohne E-Mail', () => {
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'x@y.de' }, null), false);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: '' }, { verantwortlicherEmail: 'x@y.de' }), false);
});

test('darfBeurteilungBearbeiten: dauerhafter Ausbilder bekommt KEINE Bearbeiten-Rechte mehr', () => {
  // Regressionstest fuer den Kernpunkt dieses Umbaus: frueher gewaehrte
  // verantwortlichFuerZuweisung (via dauerAusbilderAzubiOids) hier Zugriff —
  // darfBeurteilungBearbeiten kennt diesen Pfad bewusst nicht.
  const zuw = { verantwortlicherEmail: 'zeitboxierter.pruefer@firma.de' };
  const dauerhafterAusbilder = { role: 'pruefer', email: 'dauerhafter.ausbilder@firma.de' };
  assert.equal(B.darfBeurteilungBearbeiten(dauerhafterAusbilder, zuw), false);
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: FAIL — `B.darfBeurteilungBearbeiten is not a function`

- [ ] **Step 3: `beurteilungen.js` umbauen**

Am Kopf der Datei die nicht mehr benötigten Imports entfernen — ersetze

```js
const { verantwortlichFuerZuweisung, ymd } = require('./zugriff');
const { aktiveVertreteneEmails } = require('./vertretungen');
const { listFuerAzubi } = require('./ausbilderAzubis');
const unterschriftenSvc = require('./unterschriften');
```

durch (ohne die `ausbilderAzubis`-Zeile, `berufe` neu):

```js
const { verantwortlichFuerZuweisung, ymd } = require('./zugriff');
const { aktiveVertreteneEmails } = require('./vertretungen');
const unterschriftenSvc = require('./unterschriften');
const berufeSvc = require('./berufe');
```

Ersetze den Block

```js
// Datums-UNABHÄNGIGE Prüfung: ist userOid unter den dauerhaften Ausbildern
// dieses Azubis (dbo.AusbilderAzubis)? Reine Logik, DB-unabhängig testbar —
// analog zum Muster verantwortlichFuerZuweisung/darfBeurteilen.
function istDauerhafterAusbilderVon(userOid, ausbilderZeilen) {
  if (!userOid) return false;
  return (ausbilderZeilen || []).some(a => a.oid === userOid);
}

// Ist der Nutzer der dauerhafte Ausbilder DIESES Azubis? admin/developer
// zählen immer (wie bei darfBeurteilen). user zuerst, analog zu darfBeurteilen.
async function istDauerhafterAusbilder(user, azubiOid, pool) {
  if (user.role === 'developer' || user.role === 'admin') return true;
  const zeilen = await listFuerAzubi(azubiOid);
  return istDauerhafterAusbilderVon(user.oid, zeilen);
}

// Wiederverwendbare Personalunion-Prüfung für Schreibpfade (die Lesepfad-
// Berechnung steckt bereits in getByZuweisung; dieser Helfer macht dieselbe
// Prüfung verfügbar, ohne eine ganze Zuweisung laden zu müssen).
async function berechneAusbilderSchrittEntfaellt(beurteiltVon, azubiOid) {
  if (!beurteiltVon) return false;
  const zeilen = await listFuerAzubi(azubiOid);
  return istDauerhafterAusbilderVon(beurteiltVon, zeilen);
}
```

durch:

```js
// Eng: darf NUR der zeitlich zugewiesene Prüfer (E-Mail-Match) ODER admin/
// developer bearbeiten. Anders als das bestehende, breitere darfBeurteilen
// (das über verantwortlichFuerZuweisung auch den dauerhaften Ausbilder
// einschließt) — der darf die Beurteilung zwar ANSEHEN, aber nicht mehr
// bearbeiten (siehe Design-Spec 2026-08-21). Rein synchron, keine DB nötig.
function darfBeurteilungBearbeiten(user, zuweisung) {
  if (!zuweisung) return false;
  if (user.role === 'developer' || user.role === 'admin') return true;
  const email = (user.email || '').toLowerCase();
  return !!email && (zuweisung.verantwortlicherEmail || '').toLowerCase() === email;
}

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

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: PASS (4 Tests)

- [ ] **Step 5: Zwischenstand `module.exports` (wird in Task 7 final ergänzt)**

Ersetze das bestehende `module.exports` durch:

```js
module.exports = {
  ladeZuweisung, darfBeurteilen, darfBeurteilungBearbeiten, ermittleAusbildungsleiter,
  getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren,
};
```

(Hinweis: `ausbilderBestaetigen` fehlt hier bewusst — die Funktion selbst existiert noch unter altem Namen im File-Rest und wird erst in Task 6 umbenannt/neu exportiert. Der Export wird in Task 6/7 weiter angepasst.)

- [ ] **Step 6: Datei lädt weiterhin — Zwischen-Check**

```bash
node -e "require('./backend/services/beurteilungen.js'); console.log('lädt ohne Fehler')"
```

Expected: `lädt ohne Fehler` (die Funktion `ausbilderBestaetigen` existiert im Dateikörper zwar weiter, wird aber erst ab Task 6 umbenannt — das ist ein Zwischenstand, kein Endzustand).

- [ ] **Step 7: Commit**

```bash
git add backend/services/beurteilungen.js backend/services/beurteilungen.test.js
git commit -m "refactor(beurteilung): istDauerhafterAusbilder(Von) entfernt, darfBeurteilungBearbeiten + ermittleAusbildungsleiter eingefuehrt"
```

---

### Task 6: `beurteilungen.js` — `ausbildungsleiterBestaetigen` (Rename + Spalten)

**Files:**
- Modify: `backend/services/beurteilungen.js`

- [ ] **Step 1: Funktion umbenennen und Spalten anpassen**

Ersetze die bestehende Funktion

```js
// Neuer, eigenständiger dritter Schritt: der dauerhafte Ausbilder bestätigt
// die Beurteilung — unabhängig davon, ob/wann der Azubi seine Kenntnisnahme
// gegeben hat (keine Reihenfolge-Pflicht, siehe Design-Spec).
async function ausbilderBestaetigen(pool, id, ausbilderOid, signatur) {
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  await pool.request()
    .input('id', sql.Int, id)
    .input('von', sql.NVarChar(36), ausbilderOid)
    .input('bild', sql.VarBinary(sql.MAX), sigBytes)
    .input('ext', sql.NVarChar(10), sigExt)
    .query(`UPDATE dbo.Beurteilungen SET AusbilderBestaetigtVon=@von, AusbilderBestaetigtAm=SYSUTCDATETIME(),
              AusbilderUnterschriftBild=@bild, AusbilderUnterschriftExt=@ext,
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, ausbilderOid, signatur); }
    catch (e) { console.error('[beurteilungen] speichereMeine (best effort):', e.message); }
  }
}
```

durch:

```js
// Dritter, eigenständiger Schritt: der zuständige Ausbildungsleiter bestätigt
// die Beurteilung — unabhängig davon, ob/wann der Azubi seine Kenntnisnahme
// gegeben hat (keine Reihenfolge-Pflicht, siehe Design-Spec).
async function ausbildungsleiterBestaetigen(pool, id, ausbildungsleiterOid, signatur) {
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  await pool.request()
    .input('id', sql.Int, id)
    .input('von', sql.NVarChar(36), ausbildungsleiterOid)
    .input('bild', sql.VarBinary(sql.MAX), sigBytes)
    .input('ext', sql.NVarChar(10), sigExt)
    .query(`UPDATE dbo.Beurteilungen SET AusbildungsleiterBestaetigtVon=@von, AusbildungsleiterBestaetigtAm=SYSUTCDATETIME(),
              AusbildungsleiterUnterschriftBild=@bild, AusbildungsleiterUnterschriftExt=@ext,
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, ausbildungsleiterOid, signatur); }
    catch (e) { console.error('[beurteilungen] speichereMeine (best effort):', e.message); }
  }
}
```

- [ ] **Step 2: Manuell verifizieren**

```bash
node -e "require('./backend/services/beurteilungen.js'); console.log('lädt ohne Fehler')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "refactor(beurteilung): ausbilderBestaetigen zu ausbildungsleiterBestaetigen umbenannt (+ Spalten)"
```

---

### Task 7: `beurteilungen.js` — `getByZuweisung`, `patchNachAbschluss`, `ermittleModus`, finale Exports

**Files:**
- Modify: `backend/services/beurteilungen.js`

- [ ] **Step 1: `getByZuweisung` umbauen**

Ersetze die bestehende Funktion

```js
async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query(`SELECT Id, ZuweisungId, AzubiOid, Status, IndividuelleBeurteilung, GesamtPunkte, Note,
              GespraechAm, BeurteiltVon, AbgeschlossenAm, KenntnisnahmeVon, KenntnisnahmeAm,
              KorrigiertVon, KorrigiertAm, ErstelltAm, AktualisiertAm,
              BeurteilerUnterschriftExt, KenntnisnahmeUnterschriftExt,
              AusbilderBestaetigtVon, AusbilderBestaetigtAm, AusbilderUnterschriftExt
            FROM dbo.Beurteilungen WHERE ZuweisungId = @zid`);
  const b = r.recordset[0];
  if (!b) return null;
  b.kriterien = await ladeKriterien(pool, b.Id);
  // Personalunion: hat der Beurteiler selbst bereits die dauerhafte
  // Ausbilder-Rolle für diesen Azubi, entfällt der dritte Signaturschritt
  // (keine doppelte Unterschrift derselben Person).
  const ausbilderZeilen = b.BeurteiltVon ? await listFuerAzubi(b.AzubiOid) : [];
  b.ausbilderSchrittEntfaellt = istDauerhafterAusbilderVon(b.BeurteiltVon, ausbilderZeilen);
  // Nur die *Ext-Spalten wurden geladen (nicht die *Bild-Spalten selbst — bis
  // zu 2 MB je Slot, hier nur als Vorhanden-Flag gebraucht). Bild/Ext werden
  // immer gemeinsam geschrieben, daher ist Ext-non-null gleichwertig zu
  // Bild-non-null. Die eigentlichen Bilder kommen über den Bild-Endpunkt (Task 13).
  b.hatBeurteilerUnterschrift = !!b.BeurteilerUnterschriftExt;
  b.hatKenntnisnahmeUnterschrift = !!b.KenntnisnahmeUnterschriftExt;
  b.hatAusbilderUnterschrift = !!b.AusbilderUnterschriftExt;
  delete b.BeurteilerUnterschriftExt;
  delete b.KenntnisnahmeUnterschriftExt;
  delete b.AusbilderUnterschriftExt;
  return b;
}
```

durch:

```js
async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query(`SELECT Id, ZuweisungId, AzubiOid, Status, IndividuelleBeurteilung, GesamtPunkte, Note,
              GespraechAm, BeurteiltVon, AbgeschlossenAm, KenntnisnahmeVon, KenntnisnahmeAm,
              KorrigiertVon, KorrigiertAm, ErstelltAm, AktualisiertAm,
              BeurteilerUnterschriftExt, KenntnisnahmeUnterschriftExt,
              AusbildungsleiterBestaetigtVon, AusbildungsleiterBestaetigtAm, AusbildungsleiterUnterschriftExt
            FROM dbo.Beurteilungen WHERE ZuweisungId = @zid`);
  const b = r.recordset[0];
  if (!b) return null;
  b.kriterien = await ladeKriterien(pool, b.Id);
  // Personalunion: ist der Beurteiler selbst der zuständige Ausbildungsleiter
  // für diesen Azubi, entfällt der dritte Signaturschritt (keine doppelte
  // Unterschrift derselben Person).
  const ausbildungsleiterOid = b.BeurteiltVon ? await ermittleAusbildungsleiter(pool, b.AzubiOid) : null;
  b.ausbildungsleiterSchrittEntfaellt = !!ausbildungsleiterOid && ausbildungsleiterOid === b.BeurteiltVon;
  // Nur die *Ext-Spalten wurden geladen (nicht die *Bild-Spalten selbst — bis
  // zu 2 MB je Slot, hier nur als Vorhanden-Flag gebraucht). Bild/Ext werden
  // immer gemeinsam geschrieben, daher ist Ext-non-null gleichwertig zu
  // Bild-non-null. Die eigentlichen Bilder kommen über den Bild-Endpunkt.
  b.hatBeurteilerUnterschrift = !!b.BeurteilerUnterschriftExt;
  b.hatKenntnisnahmeUnterschrift = !!b.KenntnisnahmeUnterschriftExt;
  b.hatAusbildungsleiterUnterschrift = !!b.AusbildungsleiterUnterschriftExt;
  delete b.BeurteilerUnterschriftExt;
  delete b.KenntnisnahmeUnterschriftExt;
  delete b.AusbildungsleiterUnterschriftExt;
  return b;
}
```

- [ ] **Step 2: `patchNachAbschluss` — Spaltennamen anpassen**

Ersetze in der bestehenden `patchNachAbschluss`-Funktion die UPDATE-Query

```js
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr, KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                KenntnisnahmeVon=NULL, KenntnisnahmeAm=NULL,
                KenntnisnahmeUnterschriftBild=NULL, KenntnisnahmeUnterschriftExt=NULL,
                AusbilderBestaetigtVon=NULL, AusbilderBestaetigtAm=NULL,
                AusbilderUnterschriftBild=NULL, AusbilderUnterschriftExt=NULL,
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
```

durch:

```js
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr, KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                KenntnisnahmeVon=NULL, KenntnisnahmeAm=NULL,
                KenntnisnahmeUnterschriftBild=NULL, KenntnisnahmeUnterschriftExt=NULL,
                AusbildungsleiterBestaetigtVon=NULL, AusbildungsleiterBestaetigtAm=NULL,
                AusbildungsleiterUnterschriftBild=NULL, AusbildungsleiterUnterschriftExt=NULL,
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
```

- [ ] **Step 3: Neue Funktion `ermittleModus` hinzufügen**

Direkt nach `ermittleAusbildungsleiter` (Task 5) einfügen:

```js
// Bestimmt, in welchem der vier Modi das Frontend die Beurteilung anzeigen
// soll — EINE serverseitige Quelle statt (fehleranfälliger) Client-Heuristik.
// b = das Ergebnis von getByZuweisung (oder irgendein Objekt mit denselben
// AzubiOid/Status/AusbildungsleiterBestaetigtAm/ausbildungsleiterSchrittEntfaellt-Feldern).
async function ermittleModus(user, zuweisung, b, pool) {
  if (darfBeurteilungBearbeiten(user, zuweisung)) return 'bearbeiten';
  if (user.oid === b.AzubiOid) return 'azubi';
  // ausbildungsleiterSchrittEntfaellt (Personalunion) MUSS hier mitprüfen:
  // sonst könnte ein Beurteiler, dessen E-Mail nach dem Abschluss von der
  // Zuweisung abweicht (z.B. nachträgliche Korrektur), sich selbst ein
  // zweites Mal als Ausbildungsleiter bestätigen (bei Task-7-Review entdeckt).
  if (b.Status === 'abgeschlossen' && !b.AusbildungsleiterBestaetigtAm && !b.ausbildungsleiterSchrittEntfaellt) {
    const ausbildungsleiterOid = await ermittleAusbildungsleiter(pool, b.AzubiOid);
    if (ausbildungsleiterOid && ausbildungsleiterOid === user.oid) return 'ausbildungsleiter';
  }
  return 'ansicht';
}
```

- [ ] **Step 4: `module.exports` final**

Ersetze das `module.exports` aus Task 5 durch:

```js
module.exports = {
  ladeZuweisung, darfBeurteilen, darfBeurteilungBearbeiten, ermittleAusbildungsleiter, ermittleModus,
  getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren, ausbildungsleiterBestaetigen,
};
```

- [ ] **Step 5: Testsuite läuft weiter, Datei lädt**

```bash
node --test backend/services/beurteilungen.test.js
node -e "require('./backend/services/beurteilungen.js'); console.log('lädt ohne Fehler')"
```

Expected: 4/4 Tests bestehen, Datei lädt fehlerfrei.

- [ ] **Step 6: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "refactor(beurteilung): getByZuweisung/patchNachAbschluss auf Ausbildungsleiter-Spalten umgestellt, ermittleModus ergaenzt"
```

---

### Task 8: `backend/routes/beurteilungen.js` — Autorisierung, Ausbildungsleiter-Route, `modus`

**Files:**
- Modify: `backend/routes/beurteilungen.js`

- [ ] **Step 1: `ladeUndAutorisiere` auf die enge Prüfung umstellen**

Ersetze

```js
// Gemeinsame Autorisierung für PATCH auf :id (Verantwortliche/dev).
async function ladeUndAutorisiere(req, res) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, Number(req.params.id) || 0)
    .query('SELECT b.Id, b.ZuweisungId, b.AzubiOid FROM dbo.Beurteilungen b WHERE b.Id = @id');
  const b = r.recordset[0];
  if (!b) { res.status(404).json({ error: 'Beurteilung nicht gefunden.' }); return null; }
  const zuw = await svc.ladeZuweisung(pool, b.ZuweisungId);
  if (!(await svc.darfBeurteilen(req.user, zuw, pool))) { res.status(403).json({ error: 'Kein Beurteilungsrecht.' }); return null; }
  return { pool, b, zuw };
}
```

durch:

```js
// Gemeinsame Autorisierung für PATCH auf :id (nur der zeitlich zugewiesene
// Prüfer bzw. admin/developer — NICHT der dauerhafte Ausbilder, siehe
// Design-Spec 2026-08-21).
async function ladeUndAutorisiere(req, res) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, Number(req.params.id) || 0)
    .query('SELECT b.Id, b.ZuweisungId, b.AzubiOid FROM dbo.Beurteilungen b WHERE b.Id = @id');
  const b = r.recordset[0];
  if (!b) { res.status(404).json({ error: 'Beurteilung nicht gefunden.' }); return null; }
  const zuw = await svc.ladeZuweisung(pool, b.ZuweisungId);
  if (!svc.darfBeurteilungBearbeiten(req.user, zuw)) { res.status(403).json({ error: 'Kein Beurteilungsrecht.' }); return null; }
  return { pool, b, zuw };
}
```

- [ ] **Step 2: `POST /` (Entwurf erstellen/speichern) auf die enge Prüfung umstellen**

Ersetze in der bestehenden `router.post('/', ...)`-Route die Zeile

```js
    if (!(await svc.darfBeurteilen(req.user, zuw, pool))) return res.status(403).json({ error: 'Kein Beurteilungsrecht.' });
```

durch:

```js
    if (!svc.darfBeurteilungBearbeiten(req.user, zuw)) return res.status(403).json({ error: 'Kein Beurteilungsrecht.' });
```

- [ ] **Step 3: `PATCH /:id/kenntnisnahme` — Signatur-Fehler-Import bleibt, keine Bearbeiten-Prüfung nötig (unverändert, nur zur Vollständigkeit geprüft)**

Keine Code-Änderung nötig — diese Route prüft bereits eigenständig
`row.AzubiOid !== req.user.oid`, unabhängig von `darfBeurteilen`.

- [ ] **Step 4: `PATCH /:id/ausbilder-bestaetigung` → `PATCH /:id/ausbildungsleiter-bestaetigung`**

Ersetze den kompletten Handler

```js
// PATCH /api/beurteilungen/:id/ausbilder-bestaetigung  (nur der dauerhafte Ausbilder des Azubis)
router.patch('/:id/ausbilder-bestaetigung', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT Id, AzubiOid, BeurteiltVon, Status, AusbilderBestaetigtAm FROM dbo.Beurteilungen WHERE Id=@id');
    const b = r.recordset[0];
    if (!b) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    if (!(await svc.istDauerhafterAusbilder(req.user, b.AzubiOid, pool))) {
      return res.status(403).json({ error: 'Nur der zuständige Ausbilder kann bestätigen.' });
    }
    if (b.Status !== 'abgeschlossen') return res.status(400).json({ error: 'Beurteilung ist noch nicht abgeschlossen.' });
    if (await svc.berechneAusbilderSchrittEntfaellt(b.BeurteiltVon, b.AzubiOid)) {
      return res.status(400).json({ error: 'Dieser Bestätigungsschritt ist für diese Beurteilung nicht erforderlich.' });
    }
    await svc.ausbilderBestaetigen(pool, b.Id, req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (unterschriftenSvc.istValidierungsfehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] ausbilder-bestaetigung: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

durch:

```js
// PATCH /api/beurteilungen/:id/ausbildungsleiter-bestaetigung
// (nur der Nutzer, den ermittleAusbildungsleiter fuer diesen Azubi liefert)
router.patch('/:id/ausbildungsleiter-bestaetigung', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT Id, AzubiOid, BeurteiltVon, Status, AusbildungsleiterBestaetigtAm FROM dbo.Beurteilungen WHERE Id=@id');
    const b = r.recordset[0];
    if (!b) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    const ausbildungsleiterOid = await svc.ermittleAusbildungsleiter(pool, b.AzubiOid);
    if (!ausbildungsleiterOid || ausbildungsleiterOid !== req.user.oid) {
      return res.status(403).json({ error: 'Nur der zuständige Ausbildungsleiter kann bestätigen.' });
    }
    if (b.Status !== 'abgeschlossen') return res.status(400).json({ error: 'Beurteilung ist noch nicht abgeschlossen.' });
    if (b.BeurteiltVon && b.BeurteiltVon === ausbildungsleiterOid) {
      return res.status(400).json({ error: 'Dieser Bestätigungsschritt ist für diese Beurteilung nicht erforderlich.' });
    }
    await svc.ausbildungsleiterBestaetigen(pool, b.Id, req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (unterschriftenSvc.istValidierungsfehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] ausbildungsleiter-bestaetigung: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: `GET /` (zuweisungId-Zweig) — `modus` statt `darfAusbilderBestaetigen`**

Ersetze den Block

```js
    if (zuweisungId) {
      const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
      if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
      const darfBearbeiten = await svc.darfBeurteilen(req.user, zuw, pool);
      const istAzubiOwner = req.user.oid === zuw.azubiOid;
      if (!darfBearbeiten && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
      const b = await svc.getByZuweisung(pool, Number(zuweisungId));
      // Azubi sieht die Beurteilung erst, wenn abgeschlossen.
      if (istAzubiOwner && !darfBearbeiten && (!b || b.Status !== 'abgeschlossen')) return res.json(null);
      if (b) {
        b.darfAusbilderBestaetigen = b.Status === 'abgeschlossen' && !b.ausbilderSchrittEntfaellt
          && !b.AusbilderBestaetigtAm && await svc.istDauerhafterAusbilder(req.user, zuw.azubiOid, pool);
      }
      return res.json(b);
    }
```

durch:

```js
    if (zuweisungId) {
      const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
      if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
      const darfAnsehen = await svc.darfBeurteilen(req.user, zuw, pool); // breit: inkl. dauerhaftem Ausbilder
      const istAzubiOwner = req.user.oid === zuw.azubiOid;
      if (!darfAnsehen && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
      const b = await svc.getByZuweisung(pool, Number(zuweisungId));
      // Azubi sieht die Beurteilung erst, wenn abgeschlossen.
      if (istAzubiOwner && !darfAnsehen && (!b || b.Status !== 'abgeschlossen')) return res.json(null);
      if (b) {
        b.modus = await svc.ermittleModus(req.user, zuw, b, pool);
      }
      return res.json(b);
    }
```

- [ ] **Step 6: Bild-Endpunkt — `rolle` umbenennen**

Ersetze

```js
const ROLLE_SPALTEN = {
  beurteiler: { bild: 'BeurteilerUnterschriftBild', ext: 'BeurteilerUnterschriftExt' },
  azubi:      { bild: 'KenntnisnahmeUnterschriftBild', ext: 'KenntnisnahmeUnterschriftExt' },
  ausbilder:  { bild: 'AusbilderUnterschriftBild', ext: 'AusbilderUnterschriftExt' },
};
```

durch:

```js
const ROLLE_SPALTEN = {
  beurteiler:      { bild: 'BeurteilerUnterschriftBild', ext: 'BeurteilerUnterschriftExt' },
  azubi:           { bild: 'KenntnisnahmeUnterschriftBild', ext: 'KenntnisnahmeUnterschriftExt' },
  ausbildungsleiter: { bild: 'AusbildungsleiterUnterschriftBild', ext: 'AusbildungsleiterUnterschriftExt' },
};
```

(Der Rest des Bild-Endpunkts — Autorisierung vor Bild-Abruf, `darfBeurteilen`
für die Ansicht — bleibt unverändert, das ist weiterhin korrekt: der
dauerhafte Ausbilder darf die vorhandenen Unterschriften sehen, auch wenn er
keine eigene mehr beisteuert.)

- [ ] **Step 7: Manuell verifizieren**

```bash
node --check backend/routes/beurteilungen.js
node -e "require('./backend/routes/beurteilungen.js'); console.log('lädt ohne Fehler')"
```

- [ ] **Step 8: Commit**

```bash
git add backend/routes/beurteilungen.js
git commit -m "refactor(beurteilung): Routen auf Ausbildungsleiter + engen Bearbeiten-Check + modus umgestellt"
```

---

### Task 9: `app/js/api.js` — Wrapper anpassen

**Files:**
- Modify: `app/js/api.js`

- [ ] **Step 1: `normalizeBeurteilung` umbauen**

Ersetze die bestehende Funktion durch:

```js
function normalizeBeurteilung(b) {
  if (!b) return null;
  return {
    id: b.Id,
    zuweisungId: b.ZuweisungId,
    azubiId: b.AzubiOid,
    status: b.Status,
    individuelleBeurteilung: b.IndividuelleBeurteilung ?? '',
    gesamtPunkte: b.GesamtPunkte != null ? Number(b.GesamtPunkte) : null,
    note: b.Note != null ? Number(b.Note) : null,
    gespraechAm: toDateStr(b.GespraechAm),
    beurteiltVon: b.BeurteiltVon ?? null,
    abgeschlossenAm: b.AbgeschlossenAm ?? null,
    kenntnisnahmeVon: b.KenntnisnahmeVon ?? null,
    kenntnisnahmeAm: b.KenntnisnahmeAm ?? null,
    korrigiertVon: b.KorrigiertVon ?? null,
    korrigiertAm: b.KorrigiertAm ?? null,
    kriterien: (b.kriterien || []).map(k => ({ kriteriumKey: k.kriteriumKey, punkte: k.punkte })),
    modus: b.modus ?? null,
    ausbildungsleiterSchrittEntfaellt: !!b.ausbildungsleiterSchrittEntfaellt,
    ausbildungsleiterBestaetigtVon: b.AusbildungsleiterBestaetigtVon ?? null,
    ausbildungsleiterBestaetigtAm: b.AusbildungsleiterBestaetigtAm ?? null,
    hatBeurteilerUnterschrift: !!b.hatBeurteilerUnterschrift,
    hatKenntnisnahmeUnterschrift: !!b.hatKenntnisnahmeUnterschrift,
    hatAusbildungsleiterUnterschrift: !!b.hatAusbildungsleiterUnterschrift,
  };
}
```

- [ ] **Step 2: `ausbilderBestaetigenBeurteilung` → `ausbildungsleiterBestaetigenBeurteilung`**

Ersetze

```js
  async ausbilderBestaetigenBeurteilung(id, signatur) {
    await apiFetch(`/beurteilungen/${id}/ausbilder-bestaetigung`, { method: 'PATCH', body: { signatur: signatur || null } });
  },
```

durch:

```js
  async ausbildungsleiterBestaetigenBeurteilung(id, signatur) {
    await apiFetch(`/beurteilungen/${id}/ausbildungsleiter-bestaetigung`, { method: 'PATCH', body: { signatur: signatur || null } });
  },
```

- [ ] **Step 3: Berufe-Katalog-Wrapper ergänzen**

Direkt nach den Unterschrift-Wrappern (`getMeineUnterschrift`/`setMeineUnterschrift`) ergänzen:

```js
  async getBerufe() {
    return await apiFetch('/berufe');
  },
  async createBeruf(fields) {
    return await apiFetch('/berufe', { method: 'POST', body: fields });
  },
  async updateBeruf(id, fields) {
    return await apiFetch(`/berufe/${id}`, { method: 'PATCH', body: fields });
  },
  async deleteBeruf(id) {
    await apiFetch(`/berufe/${id}`, { method: 'DELETE' });
  },
```

- [ ] **Step 4: Manuell verifizieren**

```bash
node --check app/js/api.js
```

Grep-Check: `grep -rn "ausbilderBestaetigenBeurteilung\|ausbilder-bestaetigung" app/` sollte danach **keine** Treffer mehr liefern (alle Aufrufer werden in Task 10 mitgezogen — falls hier schon Treffer außerhalb von `app/js/beurteilung.js` auftauchen, das VOR Task 10 melden, nicht selbst anfassen).

- [ ] **Step 5: Commit**

```bash
git add app/js/api.js
git commit -m "refactor(beurteilung): api.js auf Ausbildungsleiter-Namen + modus umgestellt, Berufe-Wrapper ergaenzt"
```

---

### Task 10: `app/js/beurteilung.js` — vier Modi statt zwei

**Files:**
- Modify: `app/js/beurteilung.js`

- [ ] **Step 1: `loadContext` — enge Bearbeiten-Heuristik**

Ersetze in `loadContext`

```js
  // editable, wenn ich verantwortlich bin (E-Mail-Match) ODER developer/admin – der Server prüft es endgültig.
  const email = (me.email || '').toLowerCase();
  const editable = me.role === 'developer' || me.role === 'admin'
    || (!!zuweisung.verantwEmail && zuweisung.verantwEmail.toLowerCase() === email)
    || (me.istAusbilder && !me.istAzubi && me.oid !== zuweisung.azubiId);
  return { zuweisung, beurteilung, azubi, editable: !!editable && me.oid !== zuweisung.azubiId };
```

durch:

```js
  // editable ist NUR der clientseitige Fallback für den Fall, dass noch gar
  // keine Beurteilung existiert (dann kann der Server keinen modus mitgeben —
  // siehe renderActions). Sobald eine Beurteilung existiert, ist ausschließlich
  // beurteilung.modus (serverseitig ermittelt) maßgeblich für die UI. Der
  // dauerhafte Ausbilder gehört bewusst NICHT mehr hierher (siehe Design-Spec
  // 2026-08-21) — der Server prüft bei jeder Aktion ohnehin endgültig.
  const email = (me.email || '').toLowerCase();
  const editable = me.role === 'developer' || me.role === 'admin'
    || (!!zuweisung.verantwEmail && zuweisung.verantwEmail.toLowerCase() === email);
  return { zuweisung, beurteilung, azubi, editable: !!editable && me.oid !== zuweisung.azubiId };
```

- [ ] **Step 2: `renderActions` auf vier Modi umstellen**

Ersetze die **gesamte** bestehende `renderActions`-Funktion durch:

```js
// Rendert die Aktionsleiste je nach serverseitig ermitteltem Modus:
// 'bearbeiten' (Prüfer) / 'azubi' / 'ausbildungsleiter' / 'ansicht' (u.a.
// der dauerhafte Ausbilder — nur Drucken, keine Aktionen).
function renderActions(ctx) {
  const { zuweisung, beurteilung, editable, form, user, back } = ctx;
  const host = document.getElementById('beurtActions');
  if (!host) return;
  let id = beurteilung?.id || null;
  const status = beurteilung?.status || (editable ? 'neu' : null);
  // Ohne bestehende Beurteilung kennt nur der Client-Fallback (editable) den
  // Modus; sobald eine Beurteilung existiert, ist beurteilung.modus die
  // serverseitig autoritative Quelle.
  const modus = beurteilung?.modus || (editable ? 'bearbeiten' : null);

  if (modus === 'bearbeiten') {
    const abgeschlossen = status === 'abgeschlossen';
    host.innerHTML = `
      <button class="btn btn-ghost" id="beurtPdf">Als PDF</button>
      <button class="btn btn-secondary" id="beurtSave">Entwurf speichern</button>
      <button class="btn btn-primary" id="beurtFinish">${abgeschlossen ? 'Änderungen speichern' : 'Abschließen'}</button>`;

    document.getElementById('beurtSave').addEventListener('click', async () => {
      try {
        const st = form.getState();
        id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
        Toast.success('Gespeichert', 'Entwurf wurde gespeichert.');
      } catch (e) { Toast.error('Fehler', e.message); }
    });

    document.getElementById('beurtFinish').addEventListener('click', async () => {
      const st = form.getState();
      if (st.kriterien.length < 10) { Toast.error('Unvollständig', 'Bitte alle 10 Kriterien bewerten.'); return; }
      if (abgeschlossen) {
        try {
          await DB.patchBeurteilung(id, st);
          Toast.success('Aktualisiert', 'Beurteilung wurde aktualisiert (Azubi wird informiert).');
          setTimeout(back, 800);
        } catch (e) { Toast.error('Fehler', e.message); }
        return;
      }
      const bestehende = await DB.getMeineUnterschrift().catch(() => null);
      window.SignaturDialog.open({
        name: displayName(user.name || ''),
        bestehende,
        onSave: async (sig) => {
          try {
            id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
            await DB.abschliessenBeurteilung(id, sig);
            Toast.success('Abgeschlossen', 'Beurteilung abgeschlossen. Der Azubi wurde benachrichtigt.');
            setTimeout(back, 800);
          } catch (e) { Toast.error('Fehler', e.message); }
        },
      });
    });

    document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
    return;
  }

  if (modus === 'azubi') {
    const bestaetigt = !!beurteilung?.kenntnisnahmeAm;
    host.innerHTML = `
      <button class="btn btn-ghost" id="beurtPdf">Als PDF</button>
      <button class="btn btn-primary" id="beurtAck" ${bestaetigt ? 'disabled' : ''}>
        ${bestaetigt ? 'Kenntnisnahme bestätigt' : 'Kenntnisnahme bestätigen'}</button>`;
    document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
    if (!bestaetigt) {
      document.getElementById('beurtAck').addEventListener('click', async () => {
        const bestehende = await DB.getMeineUnterschrift().catch(() => null);
        window.SignaturDialog.open({
          name: displayName(user.name || ''),
          bestehende,
          onSave: async (sig) => {
            try {
              await DB.kenntnisnahmeBeurteilung(beurteilung.id, sig);
              Toast.success('Bestätigt', 'Kenntnisnahme wurde vermerkt.');
              setTimeout(() => location.reload(), 800);
            } catch (e) { Toast.error('Fehler', e.message); }
          },
        });
      });
    }
    return;
  }

  if (modus === 'ausbildungsleiter') {
    const bestaetigt = !!beurteilung?.ausbildungsleiterBestaetigtAm;
    host.innerHTML = `
      <button class="btn btn-ghost" id="beurtPdf">Als PDF</button>
      <button class="btn btn-primary" id="beurtAusbildungsleiterBestaetigen" ${bestaetigt ? 'disabled' : ''}>
        ${bestaetigt ? 'Als Ausbildungsleiter bestätigt' : 'Als Ausbildungsleiter bestätigen'}</button>`;
    document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
    if (!bestaetigt) {
      document.getElementById('beurtAusbildungsleiterBestaetigen').addEventListener('click', async () => {
        const bestehende = await DB.getMeineUnterschrift().catch(() => null);
        window.SignaturDialog.open({
          name: displayName(user.name || ''),
          bestehende,
          onSave: async (sig) => {
            try {
              await DB.ausbildungsleiterBestaetigenBeurteilung(beurteilung.id, sig);
              Toast.success('Bestätigt', 'Beurteilung als Ausbildungsleiter bestätigt.');
              setTimeout(() => location.reload(), 800);
            } catch (e) { Toast.error('Fehler', e.message); }
          },
        });
      });
    }
    return;
  }

  // modus === 'ansicht' (u.a. der dauerhafte Ausbilder): nur Drucken.
  host.innerHTML = `<button class="btn btn-ghost" id="beurtPdf">Als PDF</button>`;
  document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
}
```

- [ ] **Step 3: Manuell verifizieren**

```bash
node --check app/js/beurteilung.js
```

Grep-Check: `grep -n "darfAusbilderBestaetigen\|ausbilderSchrittEntfaellt\|hatAusbilderUnterschrift\|ausbilderBestaetigtAm" app/js/beurteilung.js` — sollte an dieser Stelle noch **3 Treffer** im PDF-Export-Teil (`exportBeurteilungPdf`) liefern, der erst in Task 11 umgestellt wird. Keine Treffer mehr in `renderActions`/`loadContext`.

- [ ] **Step 4: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "refactor(beurteilung): renderActions auf vier serverseitige Modi umgestellt (bearbeiten/azubi/ausbildungsleiter/ansicht)"
```

---

### Task 11: `app/js/beurteilung.js` — PDF-Export Feldnamen

**Files:**
- Modify: `app/js/beurteilung.js`

- [ ] **Step 1: Feldnamen in `exportBeurteilungPdf` umbenennen**

Ersetze

```js
    <div class="sign">
      ${beurteilung ? signSlot('beurteiler', beurteilung.hatBeurteilerUnterschrift, 'Unterschrift des/r Beurteilenden') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">Unterschrift des/r Beurteilenden</div></div>`}
      ${beurteilung && !beurteilung.ausbilderSchrittEntfaellt ? signSlot('ausbilder', beurteilung.hatAusbilderUnterschrift, 'Unterschrift des/r Ausbildungsleiters/-in') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">${beurteilung?.ausbilderSchrittEntfaellt ? '' : 'Unterschrift des/r Ausbildungsleiters/-in'}</div></div>`}
      ${beurteilung ? signSlot('azubi', beurteilung.hatKenntnisnahmeUnterschrift, 'Unterschrift des/r Auszubildenden') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">Unterschrift des/r Auszubildenden</div></div>`}
    </div>
```

durch:

```js
    <div class="sign">
      ${beurteilung ? signSlot('beurteiler', beurteilung.hatBeurteilerUnterschrift, 'Unterschrift des/r Beurteilenden') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">Unterschrift des/r Beurteilenden</div></div>`}
      ${beurteilung && !beurteilung.ausbildungsleiterSchrittEntfaellt ? signSlot('ausbildungsleiter', beurteilung.hatAusbildungsleiterUnterschrift, 'Unterschrift des/r Ausbildungsleiters/-in') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">${beurteilung?.ausbildungsleiterSchrittEntfaellt ? '' : 'Unterschrift des/r Ausbildungsleiters/-in'}</div></div>`}
      ${beurteilung ? signSlot('azubi', beurteilung.hatKenntnisnahmeUnterschrift, 'Unterschrift des/r Auszubildenden') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">Unterschrift des/r Auszubildenden</div></div>`}
    </div>
```

- [ ] **Step 2: Manuell verifizieren**

```bash
node --check app/js/beurteilung.js
```

Grep-Check: `grep -rn "hatAusbilderUnterschrift\|ausbilderSchrittEntfaellt\|ausbilderBestaetigtAm\|darfAusbilderBestaetigen" app/js/beurteilung.js` → **keine Treffer mehr**.

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "refactor(beurteilung): PDF-Export auf Ausbildungsleiter-Feldnamen umgestellt"
```

---

### Task 12: `app/js/nutzerverwaltung.js` — Ausbildungsleiter-Zuordnung im Nutzer-Modal

**Files:**
- Modify: `app/js/nutzerverwaltung.js`

- [ ] **Step 1: Checkbox + Bereich-Dropdown im Modal-Markup ergänzen**

In `buildModal()`, ersetze

```html
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvIstAusbilder" name="istAusbilder">
                Ist Ausbilder
              </label>
```

durch:

```html
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvIstAusbilder" name="istAusbilder">
                Ist Ausbilder
              </label>
              <label class="nv-form__check-label">
                <input type="checkbox" id="nvIstAusbildungsleiter" name="istAusbildungsleiter">
                Ist Ausbildungsleiter
              </label>
```

Und ergänze direkt nach dem bestehenden `nvAusbilderBlock`-`<div>` (vor dem schließenden `</form>`):

```html
            <div class="form-group" id="nvAusbildungsleiterBlock" hidden>
              <label class="form-label" for="nvAusbildungsleiterBereich">Zuständig für</label>
              <select class="form-control" id="nvAusbildungsleiterBereich">
                <option value="technisch">Technische Berufe</option>
                <option value="kaufmaennisch">Kaufmännische Berufe, IT &amp; DH</option>
              </select>
            </div>
```

- [ ] **Step 2: Live-Umschaltung verdrahten**

In `buildModal()`, direkt nach der Zeile `document.getElementById('nvSaveBtn').addEventListener('click', handleSave);` ergänzen:

```js
    document.getElementById('nvIstAusbildungsleiter').addEventListener('change', (e) => {
      document.getElementById('nvAusbildungsleiterBlock').hidden = !e.target.checked;
    });
```

- [ ] **Step 3: `openModal` — Werte vorbelegen**

Direkt nach der Zeile `document.getElementById('nvIstAusbilder').checked = !!u.istAusbilder;` ergänzen:

```js
    document.getElementById('nvIstAusbildungsleiter').checked = !!u.istAusbildungsleiter;
    document.getElementById('nvAusbildungsleiterBereich').value = u.ausbildungsleiterBereich || 'technisch';
    document.getElementById('nvAusbildungsleiterBlock').hidden = !u.istAusbildungsleiter;
```

- [ ] **Step 4: `handleSave` — Felder mitsenden**

Ersetze in `handleSave()` die Zeile

```js
      istAusbilder:     document.getElementById('nvIstAusbilder').checked,
```

durch:

```js
      istAusbilder:     document.getElementById('nvIstAusbilder').checked,
      istAusbildungsleiter: document.getElementById('nvIstAusbildungsleiter').checked,
      ausbildungsleiterBereich: document.getElementById('nvIstAusbildungsleiter').checked
        ? document.getElementById('nvAusbildungsleiterBereich').value
        : null,
```

- [ ] **Step 5: Manuell verifizieren**

```bash
node --check app/js/nutzerverwaltung.js
```

- [ ] **Step 6: Commit**

```bash
git add app/js/nutzerverwaltung.js
git commit -m "feat(nutzerverwaltung): Ausbildungsleiter-Tag + Bereich im Bearbeiten-Modal"
```

---

### Task 13: `app/js/nutzerverwaltung.js` — Berufe-Katalog-Abschnitt

**Files:**
- Modify: `app/js/nutzerverwaltung.js`

- [ ] **Step 1: Neue Card im Seiten-Markup ergänzen**

Direkt nach der schließenden `</div>` der bestehenden „API-Zugriff (MCP)"-Card
(also ganz am Ende des `main.innerHTML`-Template-Strings, vor dem
abschließenden `` `; ``), ergänzen:

```html

    <div class="card" style="margin-top:var(--sp-5)">
      <div class="card__body">
        <div class="nv-toolbar" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h2 style="margin:0;font-size:var(--text-lg)">Berufe</h2>
            <p class="form-hint" style="margin:4px 0 0;max-width:70ch">Ordnet Berufsbezeichnungen einem Bereich zu (technisch/kaufmännisch), damit der zuständige Ausbildungsleiter im Beurteilungsbogen automatisch ermittelt werden kann.</p>
          </div>
          <button class="btn btn-primary" type="button" id="bfAddBtn">+ Beruf hinzufügen</button>
        </div>
        <div style="overflow-x:auto">
          <table class="nv-table">
            <thead><tr><th>Beruf</th><th>Bereich</th><th></th></tr></thead>
            <tbody id="bfTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: JS-Logik ergänzen**

Direkt vor der Zeile `document.getElementById('akAddBtn')?.addEventListener('click', openAkAdd);` (also nach dem Ende des bestehenden API-Zugriff-Blocks, noch innerhalb des `DOMContentLoaded`-Handlers) ergänzen:

```js
  /* ── Berufe-Katalog ──────────────────────────────────────────────── */
  let berufe = [];
  const bfBody = document.getElementById('bfTableBody');
  const BEREICH_LABELS = { technisch: 'Technisch', kaufmaennisch: 'Kaufmännisch' };

  function renderBerufe() {
    if (!berufe.length) {
      bfBody.innerHTML = `<tr><td colspan="3"><div class="nv-empty">Noch keine Berufe im Katalog.</div></td></tr>`;
      return;
    }
    bfBody.innerHTML = berufe.map(b => `
      <tr data-id="${b.id}">
        <td>${esc(b.beruf)}</td>
        <td>${esc(BEREICH_LABELS[b.bereich] || b.bereich)}</td>
        <td class="nv-table__actions">
          <button class="btn btn-sm btn-outline bf-edit" type="button" data-id="${b.id}">Bearbeiten</button>
          <button class="btn btn-sm btn-outline bf-del" type="button" data-id="${b.id}">Löschen</button>
        </td>
      </tr>`).join('');
    bfBody.querySelectorAll('.bf-edit').forEach(btn => btn.addEventListener('click', () =>
      openBerufModal(berufe.find(b => b.id === Number(btn.dataset.id)))));
    bfBody.querySelectorAll('.bf-del').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Diesen Beruf aus dem Katalog löschen?')) return;
      try {
        await DB.deleteBeruf(Number(btn.dataset.id));
        berufe = berufe.filter(b => b.id !== Number(btn.dataset.id));
        renderBerufe();
        Toast.success('Gelöscht');
      } catch (e) { Toast.error('Fehler', e.message); }
    }));
  }

  async function loadBerufe() {
    try { berufe = await DB.getBerufe(); }
    catch (e) { berufe = []; Toast.error('Berufe konnten nicht geladen werden', e.message); }
    renderBerufe();
  }

  function openBerufModal(beruf) {
    let ov = document.getElementById('bfEditModal'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'bfEditModal';
    const bekannteBerufe = [...new Set(users.map(u => u.beruf).filter(Boolean))].sort((a, b2) => a.localeCompare(b2, 'de'));
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__header"><h2 class="modal__title">${beruf ? 'Beruf bearbeiten' : 'Beruf hinzufügen'}</h2>
          <button class="modal__close" type="button" data-x aria-label="Schließen">&times;</button></div>
        <div class="modal__body">
          <form class="nv-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="bfBeruf">Beruf</label>
              <input class="form-control" id="bfBeruf" list="bfBerufVorschlaege" value="${esc(beruf?.beruf || '')}" autocomplete="off">
              <datalist id="bfBerufVorschlaege">${bekannteBerufe.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
            </div>
            <div class="form-group">
              <label class="form-label" for="bfBereich">Bereich</label>
              <select class="form-control" id="bfBereich">
                <option value="technisch" ${beruf?.bereich === 'technisch' ? 'selected' : ''}>Technisch</option>
                <option value="kaufmaennisch" ${beruf?.bereich !== 'technisch' ? 'selected' : ''}>Kaufmännisch</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" data-x>Abbrechen</button>
          <button class="btn btn-primary" type="button" id="bfSaveBtn">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(ov); ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#bfSaveBtn').addEventListener('click', async () => {
      const fields = { beruf: document.getElementById('bfBeruf').value.trim(), bereich: document.getElementById('bfBereich').value };
      if (!fields.beruf) { Toast.error('Bitte einen Beruf angeben.'); return; }
      try {
        const saved = beruf ? await DB.updateBeruf(beruf.id, fields) : await DB.createBeruf(fields);
        const idx = berufe.findIndex(b => b.id === saved.id);
        if (idx !== -1) berufe[idx] = saved; else berufe.push(saved);
        berufe.sort((a, b2) => a.beruf.localeCompare(b2.beruf, 'de'));
        renderBerufe();
        close();
        Toast.success('Gespeichert');
      } catch (e) { Toast.error('Fehler', e.message); }
    });
  }

  document.getElementById('bfAddBtn')?.addEventListener('click', () => openBerufModal(null));
  loadBerufe();

```

- [ ] **Step 3: Manuell verifizieren**

```bash
node --check app/js/nutzerverwaltung.js
```

- [ ] **Step 4: Commit**

```bash
git add app/js/nutzerverwaltung.js
git commit -m "feat(nutzerverwaltung): Berufe-Katalog-Abschnitt (Liste + Anlegen/Bearbeiten/Loeschen)"
```

---

### Task 14: Abschließende manuelle Gesamt-Verifikation

Keine Code-Änderung — Abschluss-Checkliste (Migration 036 muss vorher gegen
die Dev-DB eingespielt sein). Demo-Konten nötig: ein zeitlich zugewiesener
Prüfer, ein Azubi mit einem im Berufe-Katalog als „technisch" oder
„kaufmaennisch" eingetragenen Beruf, ein Nutzer mit dauerhafter
`AusbilderAzubis`-Zuordnung zu diesem Azubi (ANDERE Person als der Prüfer),
und ein Nutzer, der in der Nutzerverwaltung als Ausbildungsleiter für den
passenden Bereich getaggt ist.

- [ ] **Schritt 1:** Migration 036 eingespielt.
- [ ] **Schritt 2:** In der Nutzerverwaltung: Beruf des Test-Azubis im
      neuen Berufe-Abschnitt anlegen (z. B. „Mechatroniker" → technisch);
      einen Nutzer als Ausbildungsleiter für „technisch" taggen.
- [ ] **Schritt 3:** Prüfer öffnet die Beurteilung → sieht Bearbeiten-
      Buttons (Entwurf speichern/Abschließen/Als PDF), schließt mit
      Unterschrift ab.
- [ ] **Schritt 4:** Der dauerhafte Ausbilder (nicht der getaggte
      Ausbildungsleiter) öffnet dieselbe Beurteilung → sieht **nur** „Als
      PDF", keine anderen Buttons. Direkter API-Call auf
      `PATCH /:id/abschliessen` mit seinem Login → 403.
- [ ] **Schritt 5:** Azubi sieht nur „Kenntnisnahme bestätigen" + Drucken.
- [ ] **Schritt 6:** Der getaggte Ausbildungsleiter sieht „Als
      Ausbildungsleiter bestätigen" + Drucken, unabhängig davon, ob der
      Azubi schon bestätigt hat oder nicht (auch vorher testen).
- [ ] **Schritt 7:** PDF-Export zeigt alle vorhandenen Unterschriften an
      der richtigen Stelle, Label weiterhin „Unterschrift des/r
      Ausbildungsleiters/-in".
- [ ] **Schritt 8:** Personalunion-Testfall: Beruf des Azubis so wählen,
      dass der Prüfer selbst der getaggte Ausbildungsleiter für diesen
      Bereich ist → kein dritter Button, PDF zeigt nur zwei Zeilen.
- [ ] **Schritt 9:** Korrektur nach Abschluss („Änderungen speichern") →
      Azubi- und Ausbildungsleiter-Unterschrift verschwinden aus
      Ansicht/PDF, Beurteiler-Unterschrift bleibt.
- [ ] **Schritt 10:** Berufe-Katalog: Beruf anlegen/bearbeiten/löschen in
      der Nutzerverwaltung, Vorschlagsliste beim Anlegen zeigt bekannte
      Berufe aus den Nutzerdaten.
