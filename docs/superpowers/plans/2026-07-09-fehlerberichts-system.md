# Fehlerberichts-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zentrale Erfassung aller Frontend- und Backend-Fehler (automatisch + manueller Melde-Button im Profil) mit DB-gestützter Developer-Ansicht in der App.

**Architecture:** Neue DB-Tabelle `Fehlerberichte` mit Fingerprint-Gruppierung. Ein Backend-Service `fehlerberichte.js` kapselt Fingerprint-Berechnung (rein, testbar) und DB-Zugriff. Eine Route bietet Ingest (`POST /api/errors`) für Frontend/manuell und developer-only Lese-/Erledigt-Endpunkte. Ein globaler Express-Error-Handler, Prozess-Handler und die auf `logError` umgestellten Routen-Catches decken das Backend ab. Ein Frontend-Modul `error-reporter.js` fängt `window.error`/`unhandledrejection`/`apiFetch`-Fehler ab und meldet sie (mit Client-Dedupe). Eine developer-gated Seite zeigt die filterbare Liste.

**Tech Stack:** Node/Express (CommonJS), mssql (SQL Server), Vanilla-JS-Frontend (kein Bundler), `node:test` für Unit-Tests.

## Global Constraints

- **DB-Migrationen:** `db/migrations/NNN_name.sql`, nummeriert (nächste = `017`), idempotent, manuell gegen `Berichtsheft_Dev` ausgeführt. Kein Auto-Runner.
- **IDs sind GUID-Strings** (User/Azubi-Oid); niemals `parseInt`. mssql-Typ dafür: `sql.NVarChar(36)`.
- **Frontend hat keinen Bundler:** neue JS-Dateien müssen per `<script src>` in jede betroffene HTML-Seite eingebunden werden; `api.js` lädt als erstes und stellt `apiFetch`, `API_BASE`, `window.escapeHtml` bereit.
- **Developer-Gate:** serverseitig `req.user.role === 'developer'` (403 sonst); clientseitig Seiten-Guard mit Redirect (kein Sicherheitsersatz, nur UX).
- **`req.user`** enthält `{ oid, name, email, role, … }` (aus `buildReqUser`).
- **XSS:** alle nutzerkontrollierten Strings in innerHTML über `window.escapeHtml`.
- **Tests:** `node --test <datei>`; reine Logik von DB-Zugriff trennen (Muster `zugriff.js` rein vs. `zugriffContext.js` DB).
- **Commit-Trailer:** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Dateistruktur

**Neu:**
- `db/migrations/017_fehlerberichte.sql` — Tabelle + Indizes
- `backend/services/fehlerberichte.js` — Fingerprint (rein) + DB-Funktionen
- `backend/services/fehlerberichte.test.js` — Unit-Tests der reinen Logik
- `backend/routes/fehlerberichte.js` — Ingest + Developer-Endpunkte
- `app/js/error-reporter.js` — Frontend-Erfassung + Dedupe
- `app/js/error-reporter.test.js` — Unit-Test der Dedupe-Logik
- `app/fehlerberichte.html`, `app/js/fehlerberichte.js`, `app/css/fehlerberichte.css` — Developer-Seite

**Geändert:**
- `backend/server.js` — Route mounten, globaler Error-Handler, Prozess-Handler, Cleanup-Interval
- `backend/routes/{abteilungen,users,wochen,kommentare,anhaenge,benachrichtigungen,fahrtgeld,beurteilungen,zuweisungen,sync}.js`, `backend/middleware/auth.js` — Catch → `logError`
- `app/js/sidebar.js` — developer-gated Nav-Eintrag
- alle Shell-`app/*.html` — `error-reporter.js` einbinden
- `app/js/profil.js`, `app/js/dh-profil.js` — Melde-Button + Modal

---

### Task 1: DB-Migration `017_fehlerberichte.sql`

**Files:**
- Create: `db/migrations/017_fehlerberichte.sql`

**Interfaces:**
- Produces: Tabelle `dbo.Fehlerberichte` mit Spalten `Id, ErsterZeitpunkt, LetzterZeitpunkt, Quelle, Nachricht, Stack, Kontext, BenutzerOid, BenutzerName, Fingerprint, Anzahl, Erledigt, ErledigtVon, ErledigtAm`.

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 017 – Fehlerberichts-System
-- Ausführen gegen: Berichtsheft_Dev
-- Zentrale Tabelle für Frontend-/Backend-/manuelle Fehler.
-- Idempotent.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Fehlerberichte' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.Fehlerberichte (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    ErsterZeitpunkt  DATETIME2   NOT NULL DEFAULT SYSUTCDATETIME(),
    LetzterZeitpunkt DATETIME2   NOT NULL DEFAULT SYSUTCDATETIME(),
    Quelle           NVARCHAR(20)  NOT NULL,
    Nachricht        NVARCHAR(MAX) NOT NULL,
    Stack            NVARCHAR(MAX) NULL,
    Kontext          NVARCHAR(MAX) NULL,
    BenutzerOid      NVARCHAR(36)  NULL,
    BenutzerName     NVARCHAR(200) NULL,
    Fingerprint      NVARCHAR(64)  NOT NULL,
    Anzahl           INT           NOT NULL DEFAULT 1,
    Erledigt         BIT           NOT NULL DEFAULT 0,
    ErledigtVon      NVARCHAR(200) NULL,
    ErledigtAm       DATETIME2     NULL,
    CONSTRAINT CK_Fehlerberichte_Quelle CHECK (Quelle IN ('frontend','backend','manual'))
  );
  PRINT 'Tabelle dbo.Fehlerberichte angelegt.';
END
ELSE PRINT 'dbo.Fehlerberichte existiert bereits.';

-- Gruppierung beim Insert: schneller Zugriff auf offene Einträge je Fingerprint.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Fehlerberichte_Fingerprint_offen')
  CREATE INDEX IX_Fehlerberichte_Fingerprint_offen
    ON dbo.Fehlerberichte (Fingerprint, Erledigt);

-- Liste sortieren + Cleanup nach Alter.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Fehlerberichte_LetzterZeitpunkt')
  CREATE INDEX IX_Fehlerberichte_LetzterZeitpunkt
    ON dbo.Fehlerberichte (LetzterZeitpunkt DESC);

PRINT 'Migration 017 fertig.';
```

- [ ] **Step 2: Gegen die Dev-DB ausführen und Idempotenz prüfen**

Führe die Migration im SQL-Client gegen `Berichtsheft_Dev` aus. Dann **ein zweites Mal** ausführen.
Erwartet: Erster Lauf legt Tabelle + Indizes an; zweiter Lauf gibt nur „existiert bereits"-PRINTs, keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/017_fehlerberichte.sql
git commit -m "feat(db): Migration 017 – Tabelle Fehlerberichte"
```

---

### Task 2: Backend-Service `fehlerberichte.js`

**Files:**
- Create: `backend/services/fehlerberichte.js`
- Test: `backend/services/fehlerberichte.test.js`

**Interfaces:**
- Consumes: `getPool, sql` aus `../db/connection`.
- Produces:
  - `berechneFingerprint({ quelle, nachricht, stack })` → `string` (64-hex SHA-256)
  - `async logError({ quelle, nachricht, stack, kontext, benutzerOid, benutzerName })` → `Promise<void>` (verschluckt eigene Fehler, ruft immer `console.error`)
  - `async listErrors({ quelle, erledigt, benutzerOid, seit, limit })` → `Promise<Array>`
  - `async markResolved(id, erledigtVon)` → `Promise<void>`
  - `async cleanupAlt(tage)` → `Promise<number>` (Anzahl gelöschter Zeilen)

- [ ] **Step 1: Failing test für die reine Fingerprint-Funktion**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fehlerberichte.js');

test('berechneFingerprint: gleiche Eingabe → gleicher Hash', () => {
  const a = F.berechneFingerprint({ quelle: 'frontend', nachricht: 'Boom', stack: 'at x.js:1\nat y.js:2' });
  const b = F.berechneFingerprint({ quelle: 'frontend', nachricht: 'Boom', stack: 'at x.js:1\nat y.js:2' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('berechneFingerprint: andere Quelle → anderer Hash', () => {
  const a = F.berechneFingerprint({ quelle: 'frontend', nachricht: 'Boom', stack: '' });
  const b = F.berechneFingerprint({ quelle: 'backend',  nachricht: 'Boom', stack: '' });
  assert.notEqual(a, b);
});

test('berechneFingerprint: ignoriert Stack unterhalb der ersten 3 Zeilen', () => {
  const a = F.berechneFingerprint({ quelle: 'backend', nachricht: 'E', stack: 'l1\nl2\nl3\nl4-anders' });
  const b = F.berechneFingerprint({ quelle: 'backend', nachricht: 'E', stack: 'l1\nl2\nl3\nl4-abweichend' });
  assert.equal(a, b);
});

test('berechneFingerprint: fehlender Stack ist erlaubt', () => {
  const a = F.berechneFingerprint({ quelle: 'manual', nachricht: 'Text', stack: undefined });
  assert.match(a, /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test backend/services/fehlerberichte.test.js`
Expected: FAIL (`Cannot find module './fehlerberichte.js'` bzw. `berechneFingerprint is not a function`).

- [ ] **Step 3: Service implementieren**

```js
'use strict';
const crypto = require('crypto');
const { getPool, sql } = require('../db/connection');

// Fingerprint gruppiert „gleiche" Fehler: Quelle + Nachricht + die ersten 3
// Stack-Zeilen (tiefer unten wandern Zeilennummern/async-Frames, das würde
// sonst jeden Aufruf einzigartig machen). Rein & testbar, kein DB-Zugriff.
function berechneFingerprint({ quelle, nachricht, stack }) {
  const stackKopf = String(stack || '').split('\n').slice(0, 3).join('\n');
  const basis = `${quelle}|${nachricht}|${stackKopf}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}

// Persistiert einen Fehler. Gruppiert per Fingerprint auf einen OFFENEN Eintrag
// (Anzahl++ + LetzterZeitpunkt/Stack/Kontext aktualisieren) statt neuer Zeile.
// Logging darf den Request NIE killen → alle Fehler hier werden verschluckt,
// nachdem sie zusätzlich auf der Konsole gelandet sind (nssm-Datei-Boden).
async function logError({ quelle, nachricht, stack, kontext, benutzerOid, benutzerName }) {
  const msg = String(nachricht == null ? '' : nachricht).slice(0, 8000);
  const kontextStr = kontext == null ? null
    : (typeof kontext === 'string' ? kontext : JSON.stringify(kontext));
  console.error(`[fehler:${quelle}]`, msg, stack ? `\n${stack}` : '');
  try {
    const fp = berechneFingerprint({ quelle, nachricht: msg, stack });
    const pool = await getPool();
    const upd = await pool.request()
      .input('fp', sql.NVarChar(64), fp)
      .input('stack', sql.NVarChar(sql.MAX), stack || null)
      .input('kontext', sql.NVarChar(sql.MAX), kontextStr)
      .query(`
        UPDATE TOP (1) dbo.Fehlerberichte
        SET Anzahl = Anzahl + 1,
            LetzterZeitpunkt = SYSUTCDATETIME(),
            Stack = @stack,
            Kontext = @kontext
        WHERE Fingerprint = @fp AND Erledigt = 0
      `);
    if (upd.rowsAffected[0] > 0) return;
    await pool.request()
      .input('quelle', sql.NVarChar(20), quelle)
      .input('nachricht', sql.NVarChar(sql.MAX), msg)
      .input('stack', sql.NVarChar(sql.MAX), stack || null)
      .input('kontext', sql.NVarChar(sql.MAX), kontextStr)
      .input('benutzerOid', sql.NVarChar(36), benutzerOid || null)
      .input('benutzerName', sql.NVarChar(200), benutzerName || null)
      .input('fp', sql.NVarChar(64), fp)
      .query(`
        INSERT INTO dbo.Fehlerberichte
          (Quelle, Nachricht, Stack, Kontext, BenutzerOid, BenutzerName, Fingerprint)
        VALUES (@quelle, @nachricht, @stack, @kontext, @benutzerOid, @benutzerName, @fp)
      `);
  } catch (e) {
    console.error('[fehlerberichte] logError konnte nicht persistieren:', e.message);
  }
}

async function listErrors({ quelle, erledigt, benutzerOid, seit, limit } = {}) {
  const pool = await getPool();
  const bedingungen = [];
  const req = pool.request();
  if (quelle)      { req.input('quelle', sql.NVarChar(20), quelle); bedingungen.push('Quelle = @quelle'); }
  if (erledigt !== undefined) { req.input('erledigt', sql.Bit, erledigt ? 1 : 0); bedingungen.push('Erledigt = @erledigt'); }
  if (benutzerOid) { req.input('benutzerOid', sql.NVarChar(36), benutzerOid); bedingungen.push('BenutzerOid = @benutzerOid'); }
  if (seit)        { req.input('seit', sql.DateTime2, new Date(seit)); bedingungen.push('LetzterZeitpunkt >= @seit'); }
  const where = bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : '';
  const top = Math.min(Number(limit) || 500, 2000);
  const result = await req.query(`
    SELECT TOP (${top}) *
    FROM dbo.Fehlerberichte
    ${where}
    ORDER BY LetzterZeitpunkt DESC
  `);
  return result.recordset;
}

async function markResolved(id, erledigtVon) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, Number(id))
    .input('von', sql.NVarChar(200), erledigtVon || null)
    .query(`
      UPDATE dbo.Fehlerberichte
      SET Erledigt = 1, ErledigtVon = @von, ErledigtAm = SYSUTCDATETIME()
      WHERE Id = @id
    `);
}

async function cleanupAlt(tage = 90) {
  const pool = await getPool();
  const result = await pool.request()
    .input('tage', sql.Int, tage)
    .query(`
      DELETE FROM dbo.Fehlerberichte
      WHERE LetzterZeitpunkt < DATEADD(day, -@tage, SYSUTCDATETIME())
    `);
  return result.rowsAffected[0];
}

module.exports = { berechneFingerprint, logError, listErrors, markResolved, cleanupAlt };
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `node --test backend/services/fehlerberichte.test.js`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/fehlerberichte.js backend/services/fehlerberichte.test.js
git commit -m "feat(backend): fehlerberichte-Service (Fingerprint + DB-Zugriff)"
```

---

### Task 3: Route `fehlerberichte.js` + Mount

**Files:**
- Create: `backend/routes/fehlerberichte.js`
- Modify: `backend/server.js` (Route mounten)

**Interfaces:**
- Consumes: `logError, listErrors, markResolved` aus `../services/fehlerberichte`; `req.user` (`oid`, `name`, `role`).
- Produces: `POST /api/errors`, `GET /api/dev/errors`, `PATCH /api/dev/errors/:id` (alle unter `devAuth`).

- [ ] **Step 1: Route implementieren**

```js
const router = require('express').Router();
const { logError, listErrors, markResolved } = require('../services/fehlerberichte');

// Nur Server setzt 'backend'. Der Client darf ausschließlich diese Quellen melden.
const CLIENT_QUELLEN = new Set(['frontend', 'manual']);

function nurDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Nur für Developer.' });
  }
  next();
}

// POST /api/errors — Ingest für Frontend-Handler + manuellen Melde-Button.
// Identität kommt aus der Session (req.user), NICHT aus dem Body → nicht fälschbar.
router.post('/errors', async (req, res) => {
  try {
    const { quelle, nachricht, stack, kontext } = req.body || {};
    if (!CLIENT_QUELLEN.has(quelle)) return res.status(400).json({ error: 'Ungültige Quelle.' });
    if (!nachricht || typeof nachricht !== 'string') return res.status(400).json({ error: 'Nachricht fehlt.' });
    await logError({
      quelle,
      nachricht,
      stack: typeof stack === 'string' ? stack : null,
      kontext: kontext && typeof kontext === 'object' ? kontext : null,
      benutzerOid: req.user && req.user.oid,
      benutzerName: req.user && req.user.name,
    });
    res.status(204).end();
  } catch (e) {
    // Kein logError hier — sonst Endlosschleife, wenn genau das scheitert.
    console.error('[errors] Ingest fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Konnte Fehler nicht speichern.' });
  }
});

// GET /api/dev/errors — Liste (developer-only). Query: quelle, erledigt, benutzerOid, seit, limit.
router.get('/dev/errors', nurDeveloper, async (req, res) => {
  try {
    const { quelle, erledigt, benutzerOid, seit, limit } = req.query;
    const rows = await listErrors({
      quelle: quelle || undefined,
      erledigt: erledigt === undefined ? undefined : erledigt === 'true' || erledigt === '1',
      benutzerOid: benutzerOid || undefined,
      seit: seit || undefined,
      limit: limit || undefined,
    });
    res.json(rows);
  } catch (e) {
    console.error('[dev/errors] list:', e.message);
    res.status(500).json({ error: 'Fehler beim Laden.' });
  }
});

// PATCH /api/dev/errors/:id — als erledigt markieren (developer-only).
router.patch('/dev/errors/:id', nurDeveloper, async (req, res) => {
  try {
    await markResolved(req.params.id, req.user.name);
    res.json({ ok: true });
  } catch (e) {
    console.error('[dev/errors] patch:', e.message);
    res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Route in `server.js` mounten**

In `backend/server.js` nach den anderen geschützten Routen (nach Zeile mit `app.use('/api/sync', devAuth, syncRouter);`) einfügen:

```js
const fehlerRouter = require('./routes/fehlerberichte');
app.use('/api', devAuth, fehlerRouter);   // /api/errors, /api/dev/errors
```

- [ ] **Step 3: Manuell verifizieren (Server läuft auf :3000)**

Als Demo-Azubi einloggen, dann im Browser-DevTools:
```js
await fetch('/api/errors', { method:'POST', credentials:'include',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ quelle:'manual', nachricht:'Plan-Test', kontext:{ seite:'test' } }) });
```
Erwartet: HTTP 204. Danach als Developer-Konto `GET /api/dev/errors` → JSON-Array mit dem Eintrag; als Nicht-Developer → 403.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/fehlerberichte.js backend/server.js
git commit -m "feat(backend): /api/errors Ingest + developer-only Lese-Endpunkte"
```

---

### Task 4: Globale Backend-Erfassung + Cleanup in `server.js`

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `logError, cleanupAlt` aus `./services/fehlerberichte`.
- Produces: Express-Error-Handler, `process`-Handler, tägliches Cleanup.

- [ ] **Step 1: Import ergänzen**

Oben bei den Service-Requires (z.B. nach dem `entraSync`-Require-Block) einfügen:

```js
const { logError: logFehler, cleanupAlt: cleanupFehler } = require('./services/fehlerberichte');
```

- [ ] **Step 2: Globalen Error-Handler NACH dem statischen Frontend, VOR `app.listen` einfügen**

```js
// Globaler Fehler-Handler: fängt alles ab, was eine Route per next(err) oder
// als geworfener Fehler durchreicht. Persistiert + antwortet 500.
app.use((err, req, res, next) => {
  logFehler({
    quelle: 'backend',
    nachricht: `[unhandled] ${err && err.message ? err.message : String(err)}`,
    stack: err && err.stack,
    kontext: { route: req.path, methode: req.method },
    benutzerOid: req.user && req.user.oid,
    benutzerName: req.user && req.user.name,
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});
```

- [ ] **Step 3: Prozess-Handler + Cleanup nach `app.listen(...)` einfügen**

```js
// Letzte Fangnetze: unbehandelte Rejections/Exceptions protokollieren.
process.on('unhandledRejection', (reason) => {
  logFehler({ quelle: 'backend', nachricht: `[unhandledRejection] ${reason && reason.message ? reason.message : String(reason)}`,
    stack: reason && reason.stack });
});
process.on('uncaughtException', (err) => {
  logFehler({ quelle: 'backend', nachricht: `[uncaughtException] ${err.message}`, stack: err.stack });
});

// Täglicher Cleanup: Einträge älter als 90 Tage entfernen (Muster wie entra-sync).
cleanupFehler(90).then(n => n && console.log(`[fehler-cleanup] ${n} alte Einträge entfernt.`))
  .catch(e => console.error('[fehler-cleanup] Start:', e.message));
setInterval(() => {
  cleanupFehler(90).then(n => n && console.log(`[fehler-cleanup] ${n} alte Einträge entfernt.`))
    .catch(e => console.error('[fehler-cleanup]', e.message));
}, 24 * 3600 * 1000);
```

- [ ] **Step 4: Manuell verifizieren**

Server neu starten (`npm run dev`). Erwartet: Start ohne Fehler; Log-Zeile `[fehler-cleanup]` erscheint nur, wenn tatsächlich etwas gelöscht wurde (sonst still). Eine bewusst fehlerhafte Route (z.B. temporär `throw new Error('x')` in einem Handler) → Antwort 500 + neuer Eintrag in `GET /api/dev/errors` mit Quelle `backend`. Danach den Test-`throw` wieder entfernen.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): globaler Error-Handler, Prozess-Handler, taeglicher Cleanup"
```

---

### Task 5: Bestehende Catch-Blöcke auf `logError` umstellen

**Files:**
- Modify: `backend/routes/abteilungen.js`, `backend/routes/users.js`, `backend/routes/wochen.js`, `backend/routes/kommentare.js`, `backend/routes/anhaenge.js`, `backend/routes/benachrichtigungen.js`, `backend/routes/fahrtgeld.js`, `backend/routes/beurteilungen.js`, `backend/routes/zuweisungen.js`, `backend/routes/sync.js`, `backend/middleware/auth.js`

**Interfaces:**
- Consumes: `logError` aus `../services/fehlerberichte` (in `middleware/auth.js`: `../services/fehlerberichte`).

**Muster:** Jede Datei bekommt oben den Require. Jeder Request-Kontext-Catch, der bisher `console.error('[tag]', e)` macht, ruft zusätzlich `logError`. `logError` ruft intern selbst `console.error` — die alte Konsolenzeile wird also ersetzt, nicht dupliziert. Die HTTP-Antwort (`res.status(500)…`) bleibt unverändert.

- [ ] **Step 1: Require in jede betroffene Datei einfügen**

Ganz oben nach den bestehenden `require`-Zeilen (Beispiel `abteilungen.js`):

```js
const { logError } = require('../services/fehlerberichte');
```
(In `middleware/auth.js` ebenfalls `require('../services/fehlerberichte')`.)

- [ ] **Step 2: Catch-Blöcke umschreiben — exakte Ersetzung pro Stelle**

Ersetze jedes Vorkommen nach diesem Schema. Beispiel `routes/abteilungen.js` (Tag `[abteilungen] list:`):

Vorher:
```js
} catch (e) { console.error('[abteilungen] list:', e); res.status(500).json({ error: 'Fehler' }); }
```
Nachher:
```js
} catch (e) {
  logError({ quelle: 'backend', nachricht: `[abteilungen] list: ${e.message}`, stack: e.stack,
    kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
  res.status(500).json({ error: 'Fehler' });
}
```

Wende dasselbe Schema auf ALLE folgenden Stellen an (Tag = bisheriger `console.error`-Präfix; die 500-Antwort der jeweiligen Zeile beibehalten):
- `routes/abteilungen.js`: `list`, `create`, `patch`, `delete`, `addVerantw`, `removeVerantw`
- `routes/users.js`: `list`, `me/azubis`, `get/:oid`, `patch`, `ausbilder list`, `ausbilder set`
- `routes/benachrichtigungen.js`: 5 Catches (bisher nur `res.status(500).json({ error: err.message })`, kein Tag) → Tag `[benachrichtigungen] <route>` vergeben, `err` heißt hier `err`
- `routes/wochen.js`, `routes/kommentare.js`, `routes/anhaenge.js`, `routes/fahrtgeld.js`, `routes/beurteilungen.js`, `routes/zuweisungen.js`, `routes/sync.js`: jeden vorhandenen Request-Catch analog
- `middleware/auth.js:51` (`[auth] requireAuth:`): hier ist `req.user` noch nicht gesetzt → `benutzerOid`/`benutzerName` weglassen:
  ```js
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[auth] requireAuth: ${e.message}`, stack: e.stack, kontext: { route: req.path } });
    res.status(500).json({ error: 'Authentifizierung fehlgeschlagen.' });
  }
  ```

**Nicht anfassen** (kein Request-Kontext / bewusst nur Konsole): `db/import-users.js` (CLI), `config/saml.js` (Startup), `services/entraSync.js` + `services/users.js` Backfill (Service-Kontext), die `console.log`-Startzeilen.

- [ ] **Step 3: Syntax-Check + bestehende Tests**

Run: `node --check backend/routes/abteilungen.js` (und die übrigen geänderten Dateien)
Run: `node --test backend/`
Expected: Kein Syntaxfehler; alle bestehenden Backend-Tests weiterhin grün.

- [ ] **Step 4: Commit**

```bash
git add backend/routes backend/middleware/auth.js
git commit -m "feat(backend): Routen-Catches auf logError umgestellt"
```

---

### Task 6: Frontend-Modul `error-reporter.js`

**Files:**
- Create: `app/js/error-reporter.js`
- Test: `app/js/error-reporter.test.js`
- Modify: alle Shell-`app/*.html` (Script-Einbindung)

**Interfaces:**
- Consumes: `window.apiFetch`/`fetch` (globale API), lädt nach `api.js`.
- Produces: globale Fehlererfassung; exportiert für den Test eine reine Funktion `sollMelden(key, jetzt, lastMap, fensterMs)`.

- [ ] **Step 1: Failing test für die Dedupe-Logik**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// error-reporter.js exportiert die reine Dedupe-Funktion unter module.exports,
// wenn es in Node läuft (Browser: hängt sie an window). Siehe Step 3.
const { sollMelden } = require('./error-reporter.js');

test('sollMelden: erstes Vorkommen wird gemeldet', () => {
  const map = new Map();
  assert.equal(sollMelden('k1', 1000, map, 5000), true);
});

test('sollMelden: Wiederholung im Fenster wird unterdrückt', () => {
  const map = new Map();
  sollMelden('k1', 1000, map, 5000);
  assert.equal(sollMelden('k1', 2000, map, 5000), false);
});

test('sollMelden: nach Ablauf des Fensters wieder gemeldet', () => {
  const map = new Map();
  sollMelden('k1', 1000, map, 5000);
  assert.equal(sollMelden('k1', 7000, map, 5000), true);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test app/js/error-reporter.test.js`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Modul implementieren**

```js
/* ===================================================================
   ERROR-REPORTER.JS – meldet Frontend-Fehler an /api/errors.
   Lädt nach api.js (nutzt API_BASE). Meldet still, kein UI-Popup.
   =================================================================== */
(function () {
  'use strict';

  // Reine Dedupe-Entscheidung: gleicher key innerhalb fensterMs → nicht erneut.
  function sollMelden(key, jetzt, lastMap, fensterMs) {
    const last = lastMap.get(key);
    if (last !== undefined && jetzt - last < fensterMs) return false;
    lastMap.set(key, jetzt);
    return true;
  }

  // Node/Test-Kontext: nur die reine Funktion exportieren, nichts anhängen.
  if (typeof window === 'undefined') {
    module.exports = { sollMelden };
    return;
  }

  const gesehen = new Map();
  const FENSTER_MS = 10000;
  let sendet = false;   // reentrancy-Guard gegen Selbst-Fehlerschleifen

  const API_BASE = (window.location.port === '5500')
    ? `http://${window.location.hostname}:3000/api` : '/api';

  function melde(quelle, nachricht, stack, extra) {
    if (sendet) return;
    const key = `${quelle}|${nachricht}|${String(stack || '').split('\n').slice(0, 2).join('|')}`;
    if (!sollMelden(key, Date.now(), gesehen, FENSTER_MS)) return;
    sendet = true;
    try {
      fetch(API_BASE + '/errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quelle,
          nachricht: String(nachricht || '').slice(0, 4000),
          stack: stack ? String(stack).slice(0, 8000) : null,
          kontext: Object.assign({ url: location.href, seite: document.body?.dataset?.page || null,
            userAgent: navigator.userAgent }, extra || {}),
        }),
      }).catch(() => {}).finally(() => { sendet = false; });
    } catch (e) { sendet = false; }
  }

  window.addEventListener('error', (ev) => {
    melde('frontend', ev.message || 'Unbekannter Fehler',
      ev.error && ev.error.stack, { quelltext: ev.filename, zeile: ev.lineno });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    melde('frontend', (r && r.message) || String(r) || 'Unhandled rejection', r && r.stack);
  });

  // apiFetch-Fehler zusätzlich melden (api.js wirft Error mit .message).
  if (typeof window.apiFetch === 'function') {
    const orig = window.apiFetch;
    window.apiFetch = async function (path, options) {
      try { return await orig(path, options); }
      catch (e) {
        melde('frontend', `apiFetch ${path}: ${e.message}`, e.stack, { apiPfad: path });
        throw e;
      }
    };
  }

  // Für den manuellen Melde-Button (Task 7) freigeben.
  window.meldeFehler = melde;
})();
```

Hinweis: `api.js` definiert `apiFetch` als Funktions-Deklaration; damit `window.apiFetch` gesetzt ist, in `api.js` einmalig `window.apiFetch = apiFetch;` nach der Definition ergänzen (falls nicht vorhanden). Prüfen und nur bei Bedarf hinzufügen.

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `node --test app/js/error-reporter.test.js`
Expected: PASS (3 Tests).

- [ ] **Step 5: Script auf allen Shell-Seiten einbinden**

In JEDER der folgenden Dateien direkt NACH der `<script src="js/api.js"></script>`-Zeile `<script src="js/error-reporter.js"></script>` einfügen:
`app/dashboard.html`, `app/wochenansicht.html`, `app/jahresansicht.html`, `app/fahrgelderstattung.html`, `app/profil.html`, `app/dh-profil.html`, `app/nutzerverwaltung.html`, `app/abteilungs-planer.html`, `app/abteilungsdurchlauf.html`, `app/abteilungsverwaltung.html`, `app/berichtsheftverwaltung.html`, `app/beurteilung.html`, `app/ausbildungsstand.html`, `app/index.html`.

- [ ] **Step 6: Manuell verifizieren**

Server läuft. Als Azubi eine Seite öffnen, in DevTools `throw new Error('reporter-test')` in der Konsole absetzen (löst `window.error` NICHT aus, daher stattdessen): `setTimeout(() => { null.x; }, 0)`.
Erwartet: `POST /api/errors` im Network-Tab (204). Als Developer erscheint der Eintrag in `GET /api/dev/errors`. Zweimaliges Auslösen innerhalb 10 s → nur ein Netzwerk-Call (Dedupe).

- [ ] **Step 7: Commit**

```bash
git add app/js/error-reporter.js app/js/error-reporter.test.js app/*.html app/js/api.js
git commit -m "feat(frontend): error-reporter (window.error/rejection/apiFetch, Dedupe)"
```

---

### Task 7: Manueller Melde-Button im Profil

**Files:**
- Modify: `app/js/profil.js`, `app/js/dh-profil.js`

**Interfaces:**
- Consumes: `window.meldeFehler(quelle, nachricht, stack, extra)` aus Task 6; `window.escapeHtml`.

- [ ] **Step 1: Melde-Abschnitt + Modal in `profil.js` einbauen**

Einen Abschnitt „Fehler melden" mit Button rendern (an passender Stelle im bestehenden Profil-Aufbau, analog zu anderen `profil-section`-Blöcken). Button-Handler:

```js
function oeffneFehlerMeldung() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fmTitle">
      <h2 id="fmTitle" class="modal__title">Fehler melden</h2>
      <p class="modal__hint">Beschreibe kurz, was nicht funktioniert hat.</p>
      <textarea id="fmText" class="form-control" rows="5" maxlength="4000"
        placeholder="Was ist passiert?"></textarea>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" data-fm-cancel>Abbrechen</button>
        <button type="button" class="btn btn-primary" data-fm-send>Senden</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const schliessen = () => overlay.remove();
  overlay.querySelector('[data-fm-cancel]').addEventListener('click', schliessen);
  overlay.addEventListener('click', e => { if (e.target === overlay) schliessen(); });
  overlay.querySelector('[data-fm-send]').addEventListener('click', () => {
    const text = overlay.querySelector('#fmText').value.trim();
    if (!text) return;
    if (typeof window.meldeFehler === 'function') {
      window.meldeFehler('manual', text, null, { gemeldetVon: 'profil' });
    }
    schliessen();
    if (typeof window.toast === 'function') window.toast('Danke! Deine Meldung wurde übermittelt.');
  });
}
```

Den auslösenden Button (z.B. `<button class="btn btn-outline" id="btnFehlerMelden">Fehler melden</button>`) im gerenderten Profil-HTML ergänzen und verdrahten:
```js
document.getElementById('btnFehlerMelden')?.addEventListener('click', oeffneFehlerMeldung);
```
Hinweis: Prüfen, ob `window.toast` existiert (in `app.js`); falls anders benannt, den vorhandenen Toast-Helfer verwenden. Modal-Klassen (`modal-overlay`, `modal`) müssen existieren — sonst die im Projekt übliche Modal-Konvention nutzen (z.B. wie in `nutzerverwaltung.js`).

- [ ] **Step 2: Gleichen Button in `dh-profil.js` einbauen**

`oeffneFehlerMeldung` (identische Funktion) in `dh-profil.js` ergänzen und einen Button im DH-Profil-Aufbau verdrahten. Falls die Funktion 1:1 identisch ist, akzeptabel (zwei kleine Profil-Seiten, keine gemeinsame Datei) — alternativ als `window.oeffneFehlerMeldung` aus einer der Dateien exponieren; hier bewusst dupliziert gehalten für Isolation der Profilseiten.

- [ ] **Step 3: Manuell verifizieren**

Als Azubi (profil.html) und als DH-Student (dh-profil.html): „Fehler melden" → Modal → Text → Senden. Erwartet: `POST /api/errors` mit `quelle:'manual'` (204), Toast erscheint, als Developer sichtbar in der Liste.

- [ ] **Step 4: Commit**

```bash
git add app/js/profil.js app/js/dh-profil.js
git commit -m "feat(frontend): manueller Fehler-melden-Button im Profil"
```

---

### Task 8: Developer-Seite „Fehlerberichte"

**Files:**
- Create: `app/fehlerberichte.html`, `app/js/fehlerberichte.js`, `app/css/fehlerberichte.css`
- Modify: `app/js/sidebar.js` (Nav-Eintrag)

**Interfaces:**
- Consumes: `initPage`, `DB`/`apiFetch`, `window.escapeHtml`; Endpunkte `GET /api/dev/errors`, `PATCH /api/dev/errors/:id`.

- [ ] **Step 1: HTML-Gerüst anlegen**

`app/fehlerberichte.html` nach dem Muster von `app/abteilungsverwaltung.html` (gleiche Kopf-/Script-Includes: theme.js, api.js, error-reporter.js, app.js, icons.js, sidebar.js, react-theme-layer.js, topbar-ds.js + Seiten-CSS + `js/fehlerberichte.js`). Titel „Fehlerberichte – Berichtsheft | Putzmeister", `<link rel="stylesheet" href="css/fehlerberichte.css">`, `<main id="mainContent">`.

- [ ] **Step 2: Seiten-Logik implementieren**

`app/js/fehlerberichte.js`:

```js
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-fehlerberichte', [{ label: 'Fehlerberichte', href: 'fehlerberichte.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }
  document.body.dataset.page = 'fehlerberichte';

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  let filterErledigt = false;

  async function laden() {
    let rows;
    try {
      rows = await apiFetch(`/dev/errors?erledigt=${filterErledigt}`);
    } catch (e) {
      main.innerHTML = `<div class="card"><div class="card__body"><p style="color:var(--color-error)">Laden fehlgeschlagen: ${esc(e.message)}</p></div></div>`;
      return;
    }
    render(rows);
  }

  function zeile(r) {
    const kontext = r.Kontext ? esc(r.Kontext) : '';
    return `
      <div class="fb-row" data-id="${r.Id}">
        <div class="fb-row__head">
          <span class="fb-badge fb-badge--${esc(r.Quelle)}">${esc(r.Quelle)}</span>
          <span class="fb-count">×${r.Anzahl}</span>
          <span class="fb-time">${esc(new Date(r.LetzterZeitpunkt).toLocaleString('de-DE'))}</span>
          <span class="fb-user">${esc(r.BenutzerName || '—')}</span>
          ${r.Erledigt ? '' : `<button class="btn btn-sm btn-outline" data-resolve="${r.Id}">Erledigt</button>`}
        </div>
        <div class="fb-row__msg">${esc(r.Nachricht)}</div>
        ${r.Stack ? `<details class="fb-row__stack"><summary>Stacktrace</summary><pre>${esc(r.Stack)}</pre></details>` : ''}
        ${kontext ? `<details class="fb-row__ctx"><summary>Kontext</summary><pre>${kontext}</pre></details>` : ''}
      </div>`;
  }

  function render(rows) {
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left"><h1 class="page-title">Fehlerberichte</h1></div>
        <label class="fb-filter"><input type="checkbox" id="fbErledigt" ${filterErledigt ? 'checked' : ''}> Erledigte anzeigen</label>
      </div>
      <div class="fb-list">${rows.length ? rows.map(zeile).join('') : '<p class="fb-empty">Keine Fehler.</p>'}</div>`;
    document.getElementById('fbErledigt').addEventListener('change', e => { filterErledigt = e.target.checked; laden(); });
    main.querySelectorAll('[data-resolve]').forEach(btn => btn.addEventListener('click', async () => {
      try { await apiFetch(`/dev/errors/${btn.dataset.resolve}`, { method: 'PATCH' }); laden(); }
      catch (e) { if (window.toast) window.toast('Konnte nicht aktualisieren.'); }
    }));
  }

  laden();
});
```

- [ ] **Step 3: CSS anlegen**

`app/css/fehlerberichte.css`: schlichte Listendarstellung mit Design-Tokens (`.fb-row`, `.fb-badge`, `.fb-count`, `pre`-Umbruch `white-space: pre-wrap; overflow-x:auto`). An `abteilungsverwaltung.css` orientieren.

- [ ] **Step 4: Nav-Eintrag in `sidebar.js` (developer-gated)**

In `app/js/sidebar.js` nach dem `nav-abteilungsverwaltung`-Link einen weiteren developer-only Link ergänzen:

```js
      <a href="fehlerberichte.html" class="sidebar__link nav-developer-only" id="nav-fehlerberichte" style="display:none">
        <span class="sidebar__link-icon">${Icon('document')}</span>
        <span class="sidebar__link-label">Fehlerberichte</span>
      </a>
```
(Die `nav-developer-only`-Sichtbarkeit wird bereits durch die bestehende Capability-Logik in `app.js`/`applyCapabilities` gesteuert — kein weiterer Code nötig. Falls `Icon('document')` fehlt, ein vorhandenes Icon-Kürzel verwenden.)

- [ ] **Step 5: Manuell verifizieren (Browser)**

Als Developer einloggen: Nav-Eintrag „Fehlerberichte" sichtbar; Seite listet Fehler (aus den vorigen Tasks), Stacktrace aufklappbar, „Erledigt" verschiebt den Eintrag aus der offenen Liste. Als Azubi: Nav-Eintrag unsichtbar, direkter Aufruf `fehlerberichte.html` → Redirect auf dashboard. Screenshot der Liste anfertigen.

- [ ] **Step 6: Commit**

```bash
git add app/fehlerberichte.html app/js/fehlerberichte.js app/css/fehlerberichte.css app/js/sidebar.js
git commit -m "feat(frontend): Developer-Seite Fehlerberichte + Sidebar-Eintrag"
```

---

## Abschluss-Verifikation (nach allen Tasks)

- [ ] `node --test backend/ app/js/*.test.js` → alle Tests grün (inkl. neuer Fingerprint-/Dedupe-Tests).
- [ ] Browser-Durchlauf als Azubi, Developer, DH-Student: keine Konsolenfehler; automatische Erfassung (JS-Fehler + API-Fehler), manueller Button, Developer-Liste, Erledigt-Flow, 403 für Nicht-Developer.
- [ ] Migration 017 auf `Berichtsheft_Dev` angewandt und idempotent.

---

# Erweiterung: Schweregrad (Tasks 9–12)

Spec-Abschnitt „Erweiterung (2026-07-09): Schweregrad". Serverseitige regelbasierte
Einstufung `hoch`/`mittel`/`gering`; Developer kann nachträglich ändern; manuelle
Meldungen = mittel.

### Task 9: Migration `018_fehlerberichte_schweregrad.sql`

**Files:**
- Create: `db/migrations/018_fehlerberichte_schweregrad.sql`

**Interfaces:**
- Produces: Spalte `Fehlerberichte.Schweregrad NVARCHAR(10) NOT NULL DEFAULT 'mittel'` + CHECK.

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 018 – Schweregrad für Fehlerberichte
-- Ausführen gegen: Berichtsheft_Dev
-- hoch = Kernaktion fehlgeschlagen (Absenden/Genehmigen/Speichern),
-- mittel = Lese-Fehler/manuelle Meldung, gering = Kleinigkeit.
-- Idempotent.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Fehlerberichte')
                 AND name = 'Schweregrad')
BEGIN
  ALTER TABLE dbo.Fehlerberichte ADD Schweregrad NVARCHAR(10) NOT NULL
    CONSTRAINT DF_Fehlerberichte_Schweregrad DEFAULT 'mittel';
  PRINT 'Spalte Fehlerberichte.Schweregrad angelegt.';
END
ELSE PRINT 'Fehlerberichte.Schweregrad existiert bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_Fehlerberichte_Schweregrad'
                 AND parent_object_id = OBJECT_ID('dbo.Fehlerberichte'))
BEGIN
  ALTER TABLE dbo.Fehlerberichte ADD CONSTRAINT CK_Fehlerberichte_Schweregrad
    CHECK (Schweregrad IN ('hoch','mittel','gering'));
  PRINT 'CK_Fehlerberichte_Schweregrad angelegt.';
END
ELSE PRINT 'CK_Fehlerberichte_Schweregrad existiert bereits.';

PRINT 'Migration 018 fertig.';
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/018_fehlerberichte_schweregrad.sql
git commit -m "feat(db): Migration 018 – Schweregrad fuer Fehlerberichte"
```

(Ausführung gegen die DB macht der User manuell, zusammen mit 017.)

---

### Task 10: Service — `bewerteSchwere` (TDD) + Persistenz

**Files:**
- Modify: `backend/services/fehlerberichte.js`
- Modify (Tests ergänzen): `backend/services/fehlerberichte.test.js`

**Interfaces:**
- Produces: `bewerteSchwere({ quelle, nachricht, kontext })` → `'hoch'|'mittel'|'gering'`;
  `setSchweregrad(id, schweregrad)` → `Promise<void>`; `logError` schreibt `Schweregrad`
  beim INSERT (UPDATE-Zweig unverändert → Developer-Korrektur überlebt Wiederholungen);
  `listErrors` akzeptiert zusätzlich `schweregrad`.

- [ ] **Step 1: Failing Tests ergänzen** (an bestehende Tests anhängen)

```js
// ── bewerteSchwere ─────────────────────────────────────────────
test('bewerteSchwere: manual → mittel', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'manual', nachricht: 'kaputt', kontext: null }), 'mittel');
});
test('bewerteSchwere: uncaught/unhandled/auth → hoch', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[uncaughtException] x' }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[unhandledRejection] x' }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[unhandled] x' }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[auth] requireAuth: x' }), 'hoch');
});
test('bewerteSchwere: Schreibmethoden → hoch, GET → mittel', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[wochen] patch: x', kontext: { methode: 'PATCH' } }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'frontend', nachricht: 'apiFetch /wochen: x', kontext: { methode: 'POST' } }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[users] list: x', kontext: { methode: 'GET' } }), 'mittel');
});
test('bewerteSchwere: Fallbacks — backend ohne Methode mittel, Frontend-JS gering', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: 'x', kontext: {} }), 'mittel');
  assert.equal(F.bewerteSchwere({ quelle: 'frontend', nachricht: 'TypeError: y is null', kontext: { url: 'u' } }), 'gering');
});
```

- [ ] **Step 2: RED bestätigen** — `node --test backend/services/fehlerberichte.test.js` → neue Tests FAIL.

- [ ] **Step 3: Implementieren**

```js
const SCHWEREGRADE = ['hoch', 'mittel', 'gering'];

// Serverseitige Schwere-Einstufung (Client-Angaben wären fälschbar).
// Reihenfolge: erste zutreffende Regel gewinnt. Siehe Spec-Tabelle.
function bewerteSchwere({ quelle, nachricht, kontext }) {
  if (quelle === 'manual') return 'mittel';
  const msg = String(nachricht || '');
  if (/^\[(uncaughtException|unhandledRejection|unhandled|auth)\]/.test(msg)) return 'hoch';
  const methode = String((kontext && typeof kontext === 'object' && kontext.methode) || '').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(methode)) return 'hoch';
  if (methode === 'GET') return 'mittel';
  return quelle === 'backend' ? 'mittel' : 'gering';
}
```

In `logError`: vor dem INSERT `const schwere = bewerteSchwere({ quelle, nachricht: msg, kontext });`
und im INSERT `Schweregrad` mit `.input('schweregrad', sql.NVarChar(10), schwere)` mitschreiben.
Der UPDATE-Zweig (Gruppierung) bleibt unverändert.

`listErrors`: Parameter `schweregrad` ergänzen —
`if (schweregrad && SCHWEREGRADE.includes(schweregrad)) { req.input('schweregrad', sql.NVarChar(10), schweregrad); bedingungen.push('Schweregrad = @schweregrad'); }`

```js
async function setSchweregrad(id, schweregrad) {
  if (!SCHWEREGRADE.includes(schweregrad)) throw new Error('Ungültiger Schweregrad');
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, Number(id))
    .input('schweregrad', sql.NVarChar(10), schweregrad)
    .query('UPDATE dbo.Fehlerberichte SET Schweregrad = @schweregrad WHERE Id = @id');
}
```

Exports ergänzen: `bewerteSchwere, setSchweregrad, SCHWEREGRADE`.

- [ ] **Step 4: GREEN bestätigen** — alle Tests (alt + neu) grün.

- [ ] **Step 5: Commit**

```bash
git add backend/services/fehlerberichte.js backend/services/fehlerberichte.test.js
git commit -m "feat(backend): Schweregrad-Regeln + Persistenz (bewerteSchwere)"
```

---

### Task 11: Route-PATCH erweitert + Reporter meldet HTTP-Methode

**Files:**
- Modify: `backend/routes/fehlerberichte.js`
- Modify: `app/js/error-reporter.js`

**Interfaces:**
- Consumes: `setSchweregrad, SCHWEREGRADE` aus dem Service (Task 10).
- Produces: `PATCH /api/dev/errors/:id` mit Body `{ schweregrad }` ODER ohne Body (= erledigt,
  wie bisher); `GET /api/dev/errors?schweregrad=hoch`-Filter; Frontend-`kontext.methode`.

- [ ] **Step 1: Route erweitern**

Import ergänzen (`setSchweregrad, SCHWEREGRADE`). PATCH-Handler:

```js
// PATCH /api/dev/errors/:id — { schweregrad } setzt die Schwere um,
// ohne Body (oder ohne schweregrad-Feld) wird wie bisher „erledigt" markiert.
router.patch('/dev/errors/:id', nurDeveloper, async (req, res) => {
  try {
    const { schweregrad } = req.body || {};
    if (schweregrad !== undefined) {
      if (!SCHWEREGRADE.includes(schweregrad)) return res.status(400).json({ error: 'Ungültiger Schweregrad.' });
      await setSchweregrad(req.params.id, schweregrad);
      return res.json({ ok: true });
    }
    await markResolved(req.params.id, req.user.name);
    res.json({ ok: true });
  } catch (e) {
    console.error('[dev/errors] patch:', e.message);
    res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
  }
});
```

GET-Handler: `schweregrad: req.query.schweregrad || undefined` an `listErrors` durchreichen.

- [ ] **Step 2: Reporter — Methode mitmelden**

In `app/js/error-reporter.js`, apiFetch-Wrapper:

```js
melde('frontend', `apiFetch ${path}: ${e.message}`, e.stack,
  { apiPfad: path, methode: ((options && options.method) || 'GET').toUpperCase() });
```

- [ ] **Step 3: Verifizieren** — `node --check` beide Dateien; `node --test backend/services/fehlerberichte.test.js app/js/error-reporter.test.js` grün.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/fehlerberichte.js app/js/error-reporter.js
git commit -m "feat(backend): Schweregrad via PATCH aenderbar + Methode im Frontend-Kontext"
```

---

### Task 12: Developer-Seite — Badge, Sortierung, Filter, Triage

**Files:**
- Modify: `app/js/fehlerberichte.js`
- Modify: `app/css/fehlerberichte.css`

**Interfaces:**
- Consumes: Zeilenfeld `Schweregrad`, `PATCH /api/dev/errors/:id` mit `{ schweregrad }`,
  `GET /api/dev/errors?schweregrad=…`.

- [ ] **Step 1: Seite erweitern**

- Sortierung client-seitig: `hoch(0) → mittel(1) → gering(2)`, innerhalb dessen nach
  `LetzterZeitpunkt` absteigend (Server liefert zeitlich sortiert; nach dem Fetch
  `rows.sort((a,b) => rang(a) - rang(b) || neuZuerst)`).
- Schwere-Badge im Zeilenkopf: `<span class="fb-sev fb-sev--${esc(r.Schweregrad)}">${esc(r.Schweregrad)}</span>`.
- Triage-Dropdown je Zeile (KEINE `form-control`-Klasse — PMSelect würde das Select
  sonst zu einem full-width-Block wrappen): `<select class="fb-sev-select" data-sev-id="${r.Id}">`
  mit den drei Optionen, aktuelle vorausgewählt; `change` →
  `apiFetch('/dev/errors/' + id, { method: 'PATCH', body: { schweregrad: e.target.value } })`,
  danach `laden()`; Fehler → `Toast.error('Fehler', 'Konnte Schweregrad nicht ändern.')`.
- Filter im Header: Dropdown „Alle Schweregrade / hoch / mittel / gering"
  (ebenfalls ohne `form-control`), Wert → Query-Param `&schweregrad=…` beim Laden.

- [ ] **Step 2: CSS ergänzen**

`.fb-sev` (Pill), Varianten: `--hoch` (Error-Tokens), `--mittel` (Gelb/Warn), `--gering`
(Grau); `.fb-sev-select`, `.fb-filter-sev`. Bestehende Token-Konvention nutzen; Dark-Theme
über vorhandene Variablen (keine hartkodierten Hex-Farben, außer via var()).

- [ ] **Step 3: Verifizieren** — `node --check app/js/fehlerberichte.js`; jede neue Klasse hat eine CSS-Regel.

- [ ] **Step 4: Commit**

```bash
git add app/js/fehlerberichte.js app/css/fehlerberichte.css
git commit -m "feat(frontend): Schweregrad-Badge, -Filter und -Triage auf der Fehlerberichte-Seite"
```
