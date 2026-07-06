# Dauerhafte Ausbilder-Zuweisung – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Azubi kann in der Nutzerverwaltung einem oder mehreren Ausbildern *dauerhaft* (datumslos) zugewiesen werden; diese Ausbilder dürfen sein Berichtsheft über die komplette Historie sehen und korrigieren.

**Architecture:** Neue n:m-Tabelle `dbo.AusbilderAzubis` (getrennt von den befristeten `dbo.Zuweisungen`). Die reine Zugriffslogik in [zugriff.js](../../../backend/services/zugriff.js) bekommt einen zweiten, datumslosen Grant-Pfad; der DB-Adapter [zugriffContext.js](../../../backend/services/zugriffContext.js) lädt die dauerhaften Zuordnungen des angemeldeten Nutzers in den Kontext. Verwaltet wird alles developer-only über neue Endpunkte in [users.js](../../../backend/routes/users.js) und einen Block im bestehenden Nutzerverwaltung-Modal.

**Tech Stack:** Node.js/Express, `mssql`, node:test + node:assert/strict (pure Unit-Tests), Vanilla-JS-Frontend.

## Global Constraints

- Referenz auf Ausbilder & Azubi immer per **OID** (`NVARCHAR(36)`, GUID-String) — niemals `parseInt`.
- Migrationen: nummeriert unter `db/migrations/NNN_*.sql`, **idempotent** (IF-Guards), werden **manuell** gegen die DB ausgeführt.
- `zugriff.js` bleibt **rein** (kein DB/HTTP-Zugriff); alle DB-Zugriffe liegen in `zugriffContext.js` bzw. Services.
- Automatisierte Tests gibt es im Repo nur als **pure Unit-Tests** (`node:test`). DB-/HTTP-/UI-Verhalten wird **manuell** verifiziert (curl / Browser) — es existiert kein HTTP/DB-Test-Harness und es wird keiner eingeführt (YAGNI).
- Ausführung der Unit-Tests aus `backend/`: `node --test services/zugriff.test.js`.
- „Ausbilderfähig" = normalisiert `buildReqUser(row).istAusbilder === true` (Rolle `pruefer`, `IstAusbilder=1` oder `developer`).

---

### Task 1: DB-Migration `dbo.AusbilderAzubis`

**Files:**
- Create: `db/migrations/011_ausbilder_azubis.sql`

**Interfaces:**
- Produces: Tabelle `dbo.AusbilderAzubis (Id, AzubiOid, AusbilderOid, ErstelltAm)` mit `UNIQUE (AzubiOid, AusbilderOid)` und Indizes auf `AusbilderOid` und `AzubiOid`.

- [ ] **Step 1: Migrationsdatei anlegen**

Create `db/migrations/011_ausbilder_azubis.sql`:

```sql
-- ============================================================
-- Migration 011 – dbo.AusbilderAzubis (dauerhafte Ausbilder<->Azubi-Zuordnung)
-- Ausführen gegen: Berichtsheft_Dev
--
-- n:m, datumslos. Getrennt von dbo.Zuweisungen (die die befristete
-- Abteilungs-Zeitleiste + befristeten Verantwortlichen-Grant modelliert).
-- Referenz per OID (dbo.Users.Oid). Idempotent.
-- ============================================================
IF OBJECT_ID('dbo.AusbilderAzubis', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AusbilderAzubis (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    AzubiOid     NVARCHAR(36)  NOT NULL,   -- dbo.Users.Oid (Rolle azubi)
    AusbilderOid NVARCHAR(36)  NOT NULL,   -- dbo.Users.Oid (ausbilderfähig)
    ErstelltAm   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_AusbilderAzubis UNIQUE (AzubiOid, AusbilderOid)
  );
  CREATE INDEX IX_AusbilderAzubis_AusbilderOid ON dbo.AusbilderAzubis(AusbilderOid);
  CREATE INDEX IX_AusbilderAzubis_AzubiOid     ON dbo.AusbilderAzubis(AzubiOid);
  PRINT 'Tabelle dbo.AusbilderAzubis angelegt.';
END
ELSE PRINT 'dbo.AusbilderAzubis existiert bereits.';
```

- [ ] **Step 2: Idempotenz-Review**

Lies die Datei erneut und prüfe: äußerer `IF OBJECT_ID(...) IS NULL`-Guard umschließt CREATE TABLE **und** beide `CREATE INDEX` (kein Fehler beim Zweitlauf). Kein `DROP`, kein `DELETE`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/011_ausbilder_azubis.sql
git commit -m "feat(db): Migration 011 – Tabelle dbo.AusbilderAzubis (dauerhafte Zuordnung)"
```

---

### Task 2: Reine Zugriffslogik – dauerhafter Grant in `zugriff.js`

**Files:**
- Modify: `backend/services/zugriff.js`
- Test: `backend/services/zugriff.test.js`

**Interfaces:**
- Consumes: `kontext` erhält ein zusätzliches Feld `dauerAusbilderAzubiOids: string[]` (Liste von Azubi-OIDs, für die der aktuelle Nutzer dauerhafter Ausbilder ist). Fehlt das Feld, wird es als `[]` behandelt (Rückwärtskompatibilität).
- Produces: neuer Export `istDauerAusbilder(woche, kontext)`. `darfWocheKorrigieren`, `darfWocheSehen` und `aktivVerantwortlichFuer` berücksichtigen den dauerhaften Grant.

- [ ] **Step 1: Failing Tests schreiben**

In `backend/services/zugriff.test.js` ans Ende einfügen:

```javascript
// ── Dauerhafter Ausbilder-Grant (kontext.dauerAusbilderAzubiOids) ──
test('darfWocheKorrigieren: Dauer-Ausbilder unabhängig von Datum/Zuweisung', () => {
  const kontext = { zuweisungen: [], stichtag: '2030-01-01', dauerAusbilderAzubiOids: ['AZ'] };
  assert.equal(Z.darfWocheKorrigieren(user, woche({ start: '2020-01-01', ende: '2020-01-07' }), kontext), true);
});
test('darfWocheSehen: Dauer-Ausbilder sieht alte Woche (vor Zuweisung)', () => {
  const kontext = { zuweisungen: [], stichtag: '2030-01-01', dauerAusbilderAzubiOids: ['AZ'] };
  assert.equal(Z.darfWocheSehen(user, woche({ start: '2020-01-01', ende: '2020-01-07' }), kontext), true);
});
test('Dauer-Ausbilder: fremder Azubi bleibt gesperrt', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15', dauerAusbilderAzubiOids: ['AZ_ANDERS'] };
  assert.equal(Z.darfWocheSehen(user, woche({ azubiOid: 'AZ' }), kontext), false);
});
test('istDauerAusbilder: leere azubiOid öffnet nichts', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15', dauerAusbilderAzubiOids: [''] };
  assert.equal(Z.istDauerAusbilder(woche({ azubiOid: '' }), kontext), false);
});
test('aktivVerantwortlichFuer: dauer + befristet, dedupliziert', () => {
  const kontext = { stichtag: '2026-06-15',
    zuweisungen: [zuw({ azubiOid: 'AZ' })],
    dauerAusbilderAzubiOids: ['AZ', 'AZ3'] };
  assert.deepEqual(Z.aktivVerantwortlichFuer(user, kontext).sort(), ['AZ', 'AZ3']);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run (aus `backend/`): `node --test services/zugriff.test.js`
Expected: FAIL — `Z.istDauerAusbilder is not a function` bzw. Assertions rot (dauerhafter Pfad noch nicht implementiert).

- [ ] **Step 3: Implementierung in `zugriff.js`**

Neuen Helfer nach `hatKorrigiert` (vor `darfWocheKorrigieren`) einfügen:

```javascript
// Ist der Nutzer dauerhaft (datumslos) als Ausbilder für diesen Azubi eingetragen?
// kontext.dauerAusbilderAzubiOids ist bereits auf den aktuellen Nutzer gefiltert.
function istDauerAusbilder(woche, kontext) {
  if (!woche.azubiOid) return false;
  const oids = (kontext && kontext.dauerAusbilderAzubiOids) || [];
  return oids.includes(woche.azubiOid);
}
```

`darfWocheKorrigieren` ersetzen durch (dauerhafter Grant zuerst, ohne Datumsprüfung):

```javascript
// Darf der Nutzer die Woche AKTIV korrigieren (schreiben)?
function darfWocheKorrigieren(user, woche, kontext) {
  if (!woche.azubiOid) return false;
  if (istDauerAusbilder(woche, kontext)) return true; // dauerhaft: keine Datums-/Wochenprüfung
  if (!user.email) return false;
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    (z.verantwortlicherEmail || '').toLowerCase() === (user.email || '').toLowerCase() &&
    z.azubiOid === woche.azubiOid &&
    istAktiv(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}
```

`aktivVerantwortlichFuer` ersetzen durch (dauerhafte OIDs immer mit aufnehmen):

```javascript
// Azubi-OIDs, für die der Nutzer verantwortlich ist (aktiv befristet ODER dauerhaft).
function aktivVerantwortlichFuer(user, kontext) {
  const set = new Set();
  const email = (user.email || '').toLowerCase();
  if (email) {
    for (const z of ((kontext && kontext.zuweisungen) || [])) {
      if ((z.verantwortlicherEmail || '').toLowerCase() === email && istAktiv(z, kontext.stichtag)) set.add(z.azubiOid);
    }
  }
  for (const oid of ((kontext && kontext.dauerAusbilderAzubiOids) || [])) {
    if (oid) set.add(oid);
  }
  return [...set];
}
```

`darfWocheSehen` bleibt unverändert (ruft `darfWocheKorrigieren` auf → dauerhaftes Sehen ergibt sich automatisch).

Den `module.exports`-Block um `istDauerAusbilder` erweitern:

```javascript
module.exports = {
  ymd, istAktiv, wocheFaelltInZuweisung, hatKorrigiert, istDauerAusbilder,
  darfWocheKorrigieren, darfWocheSehen, aktivVerantwortlichFuer,
};
```

- [ ] **Step 4: Tests laufen lassen – müssen grün sein**

Run (aus `backend/`): `node --test services/zugriff.test.js`
Expected: PASS — alle neuen **und** bestehenden Tests grün (bestehende Tests übergeben keinen `dauerAusbilderAzubiOids` → als `[]` behandelt, Verhalten unverändert).

- [ ] **Step 5: Commit**

```bash
git add backend/services/zugriff.js backend/services/zugriff.test.js
git commit -m "feat(zugriff): datumsloser Dauer-Ausbilder-Grant in Zugriffslogik"
```

---

### Task 3: Kontext laden + Aufrufstellen umstellen (`zugriffContext.js`)

**Files:**
- Modify: `backend/services/zugriffContext.js`
- Modify: `backend/routes/wochen.js` (Zeilen 30, 53, 78, 168)
- Modify: `backend/routes/anhaenge.js` (Zeilen 48, 59, 126)
- Modify: `backend/routes/kommentare.js` (Zeile 16)

**Interfaces:**
- Consumes: `dbo.AusbilderAzubis` (Task 1).
- Produces: `ladeKorrekturKontext(pool, user)` — **neue Signatur** (User-Objekt `{ oid, email }` statt E-Mail-String); Rückgabe `{ zuweisungen, stichtag, dauerAusbilderAzubiOids }`.

- [ ] **Step 1: `ladeKorrekturKontext` erweitern**

In `backend/services/zugriffContext.js` die Funktion ersetzen:

```javascript
// Zuweisungen (befristet, per E-Mail) + dauerhafte Ausbilder-Zuordnungen (per OID)
// des Nutzers + heutiger Stichtag (UTC-Kalendertag).
async function ladeKorrekturKontext(pool, user) {
  const email = String((user && user.email) || '').trim().toLowerCase();
  const oid   = String((user && user.oid)   || '').trim();

  const rz = await pool.request()
    .input('email', sql.NVarChar(255), email)
    .query('SELECT AzubiOid, VerantwEmail, Von, Bis FROM dbo.Zuweisungen WHERE VerantwEmail = @email');
  const zuweisungen = rz.recordset.map(z => ({
    azubiOid: z.AzubiOid,
    verantwortlicherEmail: z.VerantwEmail,
    von: z.Von,
    bis: z.Bis,
  }));

  const rd = await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .query('SELECT AzubiOid FROM dbo.AusbilderAzubis WHERE AusbilderOid = @oid');
  const dauerAusbilderAzubiOids = rd.recordset.map(r => r.AzubiOid);

  const stichtag = new Date().toISOString().slice(0, 10);
  return { zuweisungen, stichtag, dauerAusbilderAzubiOids };
}
```

(Leere `oid` → `WHERE AusbilderOid = ''` liefert keine Zeilen → `[]`, fail-closed.)

- [ ] **Step 2: Aufrufstellen umstellen (E-Mail-Arg → User-Objekt)**

Alle Aufrufe von `ladeKorrekturKontext` erhalten künftig das User-Objekt (hat `.oid` **und** `.email`). Genau diese ersetzen:

`backend/routes/wochen.js`:
- Zeile 30: `ladeKorrekturKontext(pool, user.email)` → `ladeKorrekturKontext(pool, user)` (dort `const user = req.user;`)
- Zeile 53: `ladeKorrekturKontext(pool, req.user.email)` → `ladeKorrekturKontext(pool, req.user)`
- Zeile 78: `ladeKorrekturKontext(pool, req.user.email)` → `ladeKorrekturKontext(pool, req.user)`
- Zeile 168: `ladeKorrekturKontext(pool, user.email)` → `ladeKorrekturKontext(pool, user)` (dort `const user = req.user;`)

`backend/routes/anhaenge.js`:
- Zeile 48: `ladeKorrekturKontext(pool, user.email)` → `ladeKorrekturKontext(pool, user)` (`user` = Parameter von `pruefeBearbeitbar`, erhält `req.user`)
- Zeile 59: `ladeKorrekturKontext(pool, req.user.email)` → `ladeKorrekturKontext(pool, req.user)`
- Zeile 126: `ladeKorrekturKontext(pool, req.user.email)` → `ladeKorrekturKontext(pool, req.user)`

`backend/routes/kommentare.js`:
- Zeile 16: `ladeKorrekturKontext(pool, req.user.email)` → `ladeKorrekturKontext(pool, req.user)`

- [ ] **Step 3: Verifizieren, dass keine `.email`-Aufrufe übrig sind**

Run (aus Repo-Root): `grep -rn "ladeKorrekturKontext(pool, " backend/routes`
Expected: Jede Trefferzeile endet auf `, user)` oder `, req.user)` — **keine** `.email` mehr.

- [ ] **Step 4: Regressionslauf reine Logik**

Run (aus `backend/`): `node --test services/zugriff.test.js`
Expected: PASS (unverändert grün — reine Logik ist von der Signaturänderung unberührt).

- [ ] **Step 5: Manuelle Verifikation (Server startet, ACS/Kontext ok)**

Run (aus `backend/`): `node -e "require('./services/zugriffContext'); require('./routes/wochen'); require('./routes/anhaenge'); require('./routes/kommentare'); console.log('module load OK')"`
Expected: Ausgabe `module load OK` (keine Syntax-/Require-Fehler).

- [ ] **Step 6: Commit**

```bash
git add backend/services/zugriffContext.js backend/routes/wochen.js backend/routes/anhaenge.js backend/routes/kommentare.js
git commit -m "feat(zugriff): dauerhafte Ausbilder-Zuordnungen in den Korrektur-Kontext laden"
```

---

### Task 4: Service + API zum Verwalten der Zuordnung

**Files:**
- Create: `backend/services/ausbilderAzubis.js`
- Modify: `backend/routes/users.js`

**Interfaces:**
- Consumes: `dbo.AusbilderAzubis` (Task 1); `getUserByOid`, `buildReqUser` aus [services/users.js](../../../backend/services/users.js); `getPool`, `sql` aus [db/connection.js](../../../backend/db/connection.js).
- Produces:
  - `listFuerAzubi(azubiOid) → Promise<[{ oid, name, email }]>`
  - `setFuerAzubi(azubiOid, ausbilderOids) → Promise<void>` (transaktionales Ersetzen)
  - `validateZuordnung(azubiOid, ausbilderOids) → Promise<{ ok, status?, error? }>`
  - Routen: `GET /api/users/:azubiOid/ausbilder`, `PUT /api/users/:azubiOid/ausbilder`.

- [ ] **Step 1: Service anlegen**

Create `backend/services/ausbilderAzubis.js`:

```javascript
'use strict';
/* Dauerhafte Ausbilder<->Azubi-Zuordnung (dbo.AusbilderAzubis).
   Getrennt vom befristeten Zuweisungs-/Zugriffskontext. */
const { getPool, sql } = require('../db/connection');
const { getUserByOid, buildReqUser } = require('./users');

// Aktuell zugewiesene Ausbilder eines Azubis (für das Modal).
async function listFuerAzubi(azubiOid) {
  const pool = await getPool();
  const r = await pool.request()
    .input('azubiOid', sql.NVarChar(36), azubiOid)
    .query(`
      SELECT u.Oid AS oid, u.Name AS name, u.Email AS email
      FROM dbo.AusbilderAzubis aa
      JOIN dbo.Users u ON u.Oid = aa.AusbilderOid
      WHERE aa.AzubiOid = @azubiOid
      ORDER BY u.Name
    `);
  return r.recordset;
}

// Prüft: Ziel ist Azubi, alle OIDs sind ausbilderfähig. Keine DB-Schreibzugriffe.
async function validateZuordnung(azubiOid, ausbilderOids) {
  const azubi = await getUserByOid(azubiOid);
  if (!azubi) return { ok: false, status: 404, error: 'Azubi nicht gefunden.' };
  if (buildReqUser(azubi).role !== 'azubi') return { ok: false, status: 400, error: 'Ziel-Nutzer ist kein Azubi.' };
  for (const oid of ausbilderOids) {
    const row = await getUserByOid(oid);
    if (!row || !buildReqUser(row).istAusbilder) {
      return { ok: false, status: 400, error: `Nutzer ${oid} ist kein Ausbilder.` };
    }
  }
  return { ok: true };
}

// Ersetzt die Ausbilder-Menge eines Azubis transaktional (DELETE + INSERT).
async function setFuerAzubi(azubiOid, ausbilderOids) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('azubiOid', sql.NVarChar(36), azubiOid)
      .query('DELETE FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid');
    for (const oid of ausbilderOids) {
      await new sql.Request(tx)
        .input('azubiOid', sql.NVarChar(36), azubiOid)
        .input('ausbilderOid', sql.NVarChar(36), oid)
        .query('INSERT INTO dbo.AusbilderAzubis (AzubiOid, AusbilderOid) VALUES (@azubiOid, @ausbilderOid)');
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

module.exports = { listFuerAzubi, validateZuordnung, setFuerAzubi };
```

- [ ] **Step 2: Routen in `users.js` ergänzen**

In `backend/routes/users.js` den Require-Block oben erweitern:

```javascript
const { listFuerAzubi, validateZuordnung, setFuerAzubi } = require('../services/ausbilderAzubis');
```

Und **vor** `module.exports = router;` einfügen:

```javascript
// GET /api/users/:azubiOid/ausbilder – aktuell zugewiesene Ausbilder
router.get('/:azubiOid/ausbilder', async (req, res) => {
  try {
    res.json(await listFuerAzubi(req.params.azubiOid));
  } catch (e) { console.error('[users] ausbilder list:', e); res.status(500).json({ error: 'Fehler' }); }
});

// PUT /api/users/:azubiOid/ausbilder – Menge ersetzen (nur developer)
router.put('/:azubiOid/ausbilder', async (req, res) => {
  if (req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  const oids = Array.isArray(req.body && req.body.ausbilderOids) ? req.body.ausbilderOids : null;
  if (!oids) return res.status(400).json({ error: 'ausbilderOids muss ein Array sein.' });
  try {
    const check = await validateZuordnung(req.params.azubiOid, oids);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    await setFuerAzubi(req.params.azubiOid, oids);
    res.json({ ok: true });
  } catch (e) { console.error('[users] ausbilder set:', e); res.status(500).json({ error: 'Fehler' }); }
});
```

(Die zweisegmentige Route `/:azubiOid/ausbilder` kollidiert nicht mit `/:oid` — Express matcht nur gleiche Segmentzahl.)

- [ ] **Step 3: Module-Load-Check**

Run (aus `backend/`): `node -e "require('./services/ausbilderAzubis'); require('./routes/users'); console.log('module load OK')"`
Expected: `module load OK`.

- [ ] **Step 4: Manuelle API-Verifikation (Dev-Server läuft, developer eingeloggt)**

Nach Migration 011 + Neustart, mit einer developer-Session (Cookie), aus der Shell:
- `PUT /api/users/<azubiOid>/ausbilder` mit `{"ausbilderOids":["<ausbilderOid>"]}` → `200 {"ok":true}`.
- `GET /api/users/<azubiOid>/ausbilder` → enthält den Ausbilder.
- `PUT` mit einer nicht-ausbilderfähigen OID → `400`.
- `PUT` als nicht-developer → `403`.
Expected: Statuscodes wie beschrieben. (Kein automatisierter Test — kein HTTP-Harness im Repo.)

- [ ] **Step 5: Commit**

```bash
git add backend/services/ausbilderAzubis.js backend/routes/users.js
git commit -m "feat(api): GET/PUT /users/:azubiOid/ausbilder (developer-only, validiert)"
```

---

### Task 5: Frontend – Ausbilder-Block im Nutzerverwaltung-Modal

**Files:**
- Modify: `app/js/api.js`
- Modify: `app/js/nutzerverwaltung.js`

**Interfaces:**
- Consumes: `GET/PUT /api/users/:azubiOid/ausbilder` (Task 4); bestehende `apiFetch`, `DB`, `esc`, `Toast`.
- Produces: `DB.getAusbilderFuerAzubi(oid)`, `DB.setAusbilderFuerAzubi(oid, ausbilderOids)`; Modal zeigt/verwaltet dauerhafte Ausbilder nur bei Rolle `azubi`.

- [ ] **Step 1: DB-Helfer in `api.js`**

In `app/js/api.js` im `DB`-Objekt (z. B. direkt nach `updateUser`) einfügen:

```javascript
  async getAusbilderFuerAzubi(oid) {
    return await apiFetch(`/users/${oid}/ausbilder`);
  },
  async setAusbilderFuerAzubi(oid, ausbilderOids) {
    await apiFetch(`/users/${oid}/ausbilder`, { method: 'PUT', body: { ausbilderOids } });
  },
```

- [ ] **Step 2: Modal-Block ins HTML (`nutzerverwaltung.js`, `buildModal`)**

In der `overlay.innerHTML`-Vorlage direkt **nach** dem `nv-form__checks`-Block (nach dem schließenden `</div>` der drei Checkboxen, vor `</form>`) einfügen:

```javascript
            <div class="form-group" id="nvAusbilderBlock" hidden>
              <label class="form-label">Dauerhafte Ausbilder <span class="form-hint">· sehen &amp; korrigieren alle Wochen</span></label>
              <div class="nv-ausbilder-list" id="nvAusbilderList"></div>
            </div>
```

- [ ] **Step 3: Block in `openModal` befüllen (nur bei Azubi)**

`openModal` ist `function openModal(u)`. Am Ende von `openModal` (nach dem Setzen der bestehenden Felder, vor dem Öffnen des Modals) einfügen:

```javascript
    /* Dauerhafte Ausbilder nur bei Azubis */
    const ausbilderBlock = document.getElementById('nvAusbilderBlock');
    const ausbilderList  = document.getElementById('nvAusbilderList');
    if (u.role === 'azubi') {
      ausbilderBlock.hidden = false;
      ausbilderList.innerHTML = '<p class="form-hint">Lädt…</p>';
      const kandidaten = users.filter(x => x.istAusbilder);
      DB.getAusbilderFuerAzubi(u.oid).then(zugewiesen => {
        const aktiv = new Set((zugewiesen || []).map(a => a.oid));
        ausbilderList.innerHTML = kandidaten.length
          ? kandidaten.map(k => `
              <label class="nv-form__check-label">
                <input type="checkbox" class="nv-ausbilder-cb" value="${esc(k.oid)}" ${aktiv.has(k.oid) ? 'checked' : ''}>
                ${esc(k.name)} <span class="nv-table__email">${esc(k.email)}</span>
              </label>`).join('')
          : '<p class="form-hint">Keine ausbilderfähigen Nutzer vorhanden.</p>';
      }).catch(e => { ausbilderList.innerHTML = `<p style="color:var(--color-error)">Fehler: ${esc(e.message)}</p>`; });
    } else {
      ausbilderBlock.hidden = true;
      ausbilderList.innerHTML = '';
    }
```

- [ ] **Step 4: Speichern in `handleSave` erweitern**

In `handleSave`, nach dem erfolgreichen `DB.updateUser(...)` (innerhalb des `try`, direkt nach der Zeile `const updated = await DB.updateUser(editingUser.oid, fields);`) einfügen:

```javascript
      /* Dauerhafte Ausbilder nur bei Azubis mitschreiben */
      if (editingUser.role === 'azubi') {
        const oids = [...document.querySelectorAll('.nv-ausbilder-cb:checked')].map(cb => cb.value);
        await DB.setAusbilderFuerAzubi(editingUser.oid, oids);
      }
```

- [ ] **Step 5: Manuelle Browser-Verifikation**

Backend lokal starten (`node server.js`, Port 3000) + Edge (per Playwright/manuell), als `developer` einloggen → Nutzerverwaltung → einen Azubi „Bearbeiten":
- Block „Dauerhafte Ausbilder" erscheint, listet ausbilderfähige Nutzer, Häkchen spiegeln den DB-Stand.
- Bei einem Prüfer/Admin ist der Block **nicht** sichtbar.
- Ausbilder anhaken → Speichern → Modal erneut öffnen → Häkchen bleibt (persistiert).
Expected: alle drei Punkte erfüllt; `Toast.success('Gespeichert')`.

- [ ] **Step 6: Commit**

```bash
git add app/js/api.js app/js/nutzerverwaltung.js
git commit -m "feat(nutzerverwaltung): dauerhafte Ausbilder je Azubi zuweisen"
```

---

## Self-Review

**Spec-Coverage:**
- Datenmodell `dbo.AusbilderAzubis` (OID, keine Von/Bis, UNIQUE) → Task 1 ✓
- Zugriffslogik: additiver Pfad, sehen+korrigieren, alle Wochen datumslos, Koexistenz → Task 2 ✓
- Kontext lädt dauerhafte Zuordnungen (`AusbilderOid = user.oid`) → Task 3 ✓
- API `GET`/`PUT /users/:azubiOid/ausbilder`, developer-only, Validierung (Azubi-Ziel, ausbilderfähig) → Task 4 ✓
- Frontend-Block nur bei Azubi, Kandidaten aus `users`, Vorbelegung, Speichern → Task 5 ✓
- Migration nummeriert/idempotent/manuell → Task 1 ✓
- Tests: Unit (zugriff.js) automatisiert; DB/HTTP/UI manuell → Tasks 2–5 ✓
- YAGNI (keine Ausbilder-Perspektive, keine Benachrichtigungen/Audit) → nicht enthalten ✓

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code; manuelle Verifikationsschritte sind bewusst und begründet (kein HTTP/DB-Harness im Repo), keine „add validation"-Leerstellen.

**Typ-Konsistenz:** `dauerAusbilderAzubiOids` durchgängig `string[]`; `istDauerAusbilder(woche, kontext)`, `listFuerAzubi`, `setFuerAzubi`, `validateZuordnung` mit identischen Namen/Signaturen in Definition und Aufruf; API-Pfade identisch zwischen Backend (Task 4) und `DB`-Helfern (Task 5); `buildReqUser(row).istAusbilder`/`.role` wie in [users.js](../../../backend/services/users.js) definiert.
