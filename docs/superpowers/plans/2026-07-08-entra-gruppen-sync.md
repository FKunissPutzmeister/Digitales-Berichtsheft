# Entra-Gruppen-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatischer, wiederkehrender Abgleich der App-Nutzer mit drei Entra-Sicherheitsgruppen (Azubis, Prüfer, DH-Studenten) inkl. Reaktivierung von Rückkehrern und Deaktivierung von Austritten.

**Architecture:** Neues Service-Modul `entraSync.js` (reine Logik getrennt von Graph-/DB-I/O) holt per Client-Credentials ein Graph-Token, liest die Gruppenmitglieder, leitet die Rolle nach Vorrang ab und schreibt über den bestehenden `upsertUser` + neue Aktiv-Lifecycle-Helfer. Ausgelöst per Timer beim Serverstart + Intervall + developer-only Button.

**Tech Stack:** Node.js 24 (globales `fetch`, kein neues npm-Paket), Express, `mssql`, node:test.

## Global Constraints

- Referenzen auf Nutzer/Gruppen immer per **OID** (`NVARCHAR(36)`, GUID-String) — niemals `parseInt`.
- **Kein neues npm-Paket**: Graph-Calls über globales `fetch` (Node 24).
- Alle SQL-Parameter parametrisiert (auch `IN`-Listen), keine String-Konkatenation von Werten.
- Rollen-Vorrang bei Mehrfach-Mitgliedschaft: **pruefer > azubi > dhstudent**.
- Deaktivierung **rollen-gebunden**: nur aktive Nutzer mit Rolle ∈ {azubi, pruefer, dhstudent}, die in **keiner** Gruppe sind. `admin`/`developer` werden vom Sync **nie** angefasst.
- Schlägt **eine** Gruppen-Abfrage (oder das Token) fehl → **ganzer Lauf abgebrochen**, keine DB-Änderung (kein Teil-Abgleich → keine fälschlichen Deaktivierungen).
- Sync-Endpoint **developer-only**.
- `Aktiv` wird vom Sync verwaltet; `upsertUser` fasst `Aktiv` beim Update nicht an.
- Fehlt Graph-Konfig → Sync deaktiviert, App startet normal (Warn-Log, wie SAML).
- Tests: reine Logik automatisiert (node:test); Graph-/DB-/HTTP-/UI-Verhalten manuell (kein HTTP/DB-Harness im Repo). Unit-Tests aus `backend/`: `node --test services/<datei>.test.js`.

---

### Task 1: Reine Sync-Logik + Konfiguration (`entraSync.js`)

**Files:**
- Create: `backend/services/entraSync.js`
- Test: `backend/services/entraSync.test.js`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces:
  - `buildGroupRoleMap(env) → { groupRoleMap: [{role, groupId}], managedRoles: string[] }` (Vorrang-Reihenfolge, nur gesetzte Gruppen)
  - `resolveMembers(groupResults) → Map<oid, {oid,name,email,role}>` (erster Treffer gewinnt = höchster Vorrang)
  - `computeDeactivations(dbManagedUsers, aktivOids) → string[]` (OIDs zum Deaktivieren)
  - `syncConfigured(env?) → { configured, tenantId, clientId, clientSecret, groupRoleMap, managedRoles, intervalHours }`

- [ ] **Step 1: Failing tests schreiben**

Create `backend/services/entraSync.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./entraSync.js');

const ENV = {
  GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's',
  SYNC_GROUP_PRUEFER: 'gp', SYNC_GROUP_AZUBI: 'ga', SYNC_GROUP_DHSTUDENT: 'gd',
};

test('buildGroupRoleMap: nur gesetzte Gruppen, Vorrang pruefer>azubi>dhstudent', () => {
  const { groupRoleMap, managedRoles } = S.buildGroupRoleMap(ENV);
  assert.deepEqual(groupRoleMap, [
    { role: 'pruefer', groupId: 'gp' },
    { role: 'azubi', groupId: 'ga' },
    { role: 'dhstudent', groupId: 'gd' },
  ]);
  assert.deepEqual(managedRoles, ['pruefer', 'azubi', 'dhstudent']);
});

test('buildGroupRoleMap: fehlende Gruppen werden ausgelassen', () => {
  const { groupRoleMap, managedRoles } = S.buildGroupRoleMap({ SYNC_GROUP_AZUBI: 'ga' });
  assert.deepEqual(groupRoleMap, [{ role: 'azubi', groupId: 'ga' }]);
  assert.deepEqual(managedRoles, ['azubi']);
});

test('resolveMembers: pruefer gewinnt bei Doppelmitgliedschaft', () => {
  const m = S.resolveMembers([
    { role: 'pruefer', members: [{ oid: 'A', name: 'Ann', email: 'a@x' }] },
    { role: 'azubi',   members: [{ oid: 'A', name: 'Ann', email: 'a@x' }, { oid: 'B', name: 'Bo', email: 'b@x' }] },
  ]);
  assert.equal(m.get('A').role, 'pruefer');
  assert.equal(m.get('B').role, 'azubi');
  assert.equal(m.size, 2);
});

test('resolveMembers: leere/fehlende OID wird verworfen', () => {
  const m = S.resolveMembers([{ role: 'azubi', members: [{ oid: '', name: 'X' }, { oid: '  ', name: 'Y' }, { oid: 'C' }] }]);
  assert.deepEqual([...m.keys()], ['C']);
});

test('computeDeactivations: managed-Nutzer nicht in aktivOids → deaktivieren', () => {
  const db = [{ oid: 'A', role: 'azubi' }, { oid: 'B', role: 'pruefer' }, { oid: 'C', role: 'dhstudent' }];
  assert.deepEqual(S.computeDeactivations(db, ['A', 'C']).sort(), ['B']);
});

test('computeDeactivations: leere Eingaben → leer', () => {
  assert.deepEqual(S.computeDeactivations([], ['A']), []);
  assert.deepEqual(S.computeDeactivations([{ oid: 'A', role: 'azubi' }], []), ['A']);
});

test('syncConfigured: vollständig → configured true, Default-Intervall 6', () => {
  const c = S.syncConfigured(ENV);
  assert.equal(c.configured, true);
  assert.equal(c.intervalHours, 6);
});

test('syncConfigured: fehlendes Secret → configured false', () => {
  const c = S.syncConfigured({ ...ENV, GRAPH_CLIENT_SECRET: '' });
  assert.equal(c.configured, false);
});

test('syncConfigured: keine Gruppe gesetzt → configured false', () => {
  const c = S.syncConfigured({ GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's' });
  assert.equal(c.configured, false);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run (aus `backend/`): `node --test services/entraSync.test.js`
Expected: FAIL — `Cannot find module './entraSync.js'` bzw. Funktionen undefiniert.

- [ ] **Step 3: `entraSync.js` mit reiner Logik anlegen**

Create `backend/services/entraSync.js`:

```javascript
'use strict';
/* Automatischer Entra-Gruppen-Sync (Client-Credentials/App-only).
   Reine Logik (testbar) getrennt von Graph-/DB-I/O. I/O-Teil folgt in Task 3. */

// Vorrang: höchster zuerst. Gruppen-OIDs kommen aus diesen .env-Variablen.
const ROLE_PRECEDENCE = ['pruefer', 'azubi', 'dhstudent'];
const GROUP_ENV = {
  pruefer:   'SYNC_GROUP_PRUEFER',
  azubi:     'SYNC_GROUP_AZUBI',
  dhstudent: 'SYNC_GROUP_DHSTUDENT',
};

// env → Gruppen→Rollen in Vorrang-Reihenfolge (nur gesetzte) + Liste der verwalteten Rollen.
function buildGroupRoleMap(env) {
  const groupRoleMap = [];
  for (const role of ROLE_PRECEDENCE) {
    const groupId = String(env[GROUP_ENV[role]] || '').trim();
    if (groupId) groupRoleMap.push({ role, groupId });
  }
  return { groupRoleMap, managedRoles: groupRoleMap.map((g) => g.role) };
}

// groupResults: [{role, members:[{oid,name,email}]}] in Vorrang-Reihenfolge.
// → Map<oid,{oid,name,email,role}>; erster Treffer gewinnt (= höchster Vorrang).
function resolveMembers(groupResults) {
  const out = new Map();
  for (const { role, members } of (groupResults || [])) {
    for (const m of (members || [])) {
      const oid = String(m.oid || '').trim();
      if (!oid || out.has(oid)) continue;
      out.set(oid, { oid, name: m.name ?? null, email: m.email ?? null, role });
    }
  }
  return out;
}

// dbManagedUsers: [{oid, role}] (bereits gefiltert: aktiv + Rolle verwaltet).
// aktivOids: aktuelle Mitglieder. → OIDs, die deaktiviert werden.
function computeDeactivations(dbManagedUsers, aktivOids) {
  const active = new Set(aktivOids || []);
  return (dbManagedUsers || []).filter((u) => !active.has(u.oid)).map((u) => u.oid);
}

function syncConfigured(env = process.env) {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = env;
  const { groupRoleMap, managedRoles } = buildGroupRoleMap(env);
  const n = Number(env.SYNC_INTERVAL_HOURS);
  const intervalHours = n > 0 ? n : 6;
  const configured = !!(GRAPH_TENANT_ID && GRAPH_CLIENT_ID && GRAPH_CLIENT_SECRET && groupRoleMap.length);
  return {
    configured,
    tenantId: GRAPH_TENANT_ID, clientId: GRAPH_CLIENT_ID, clientSecret: GRAPH_CLIENT_SECRET,
    groupRoleMap, managedRoles, intervalHours,
  };
}

module.exports = { buildGroupRoleMap, resolveMembers, computeDeactivations, syncConfigured };
```

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run (aus `backend/`): `node --test services/entraSync.test.js`
Expected: PASS (9/9).

- [ ] **Step 5: `.env.example` dokumentieren**

In `backend/.env.example` ans Ende anfügen:

```
# ── Entra-Gruppen-Sync (Microsoft Graph, App-only) ───────────────
# Eigene App-Registrierung (NICHT die SAML-App), Anwendungsberechtigung
# GroupMember.Read.All + Admin-Consent. Fehlt ein Pflichtwert → Sync aus.
GRAPH_TENANT_ID=b5ce0e47-3753-4f10-b705-9d0447ccf182
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
SYNC_GROUP_PRUEFER=
SYNC_GROUP_AZUBI=
SYNC_GROUP_DHSTUDENT=
SYNC_INTERVAL_HOURS=6
```

- [ ] **Step 6: Commit**

```bash
git add backend/services/entraSync.js backend/services/entraSync.test.js backend/.env.example
git commit -m "feat(entra-sync): reine Sync-Logik (Gruppen-Mapping, Rollen-Vorrang, Deaktivierung) + Konfig"
```

---

### Task 2: Aktiv-Lifecycle-Helfer + Merge-Regel (`users.js`)

**Files:**
- Modify: `backend/services/users.js`

**Interfaces:**
- Produces:
  - `listManagedUsers(roles) → Promise<[{oid, role}]>` (aktive Nutzer mit Rolle ∈ roles)
  - `setUsersAktiv(oids, aktiv) → Promise<number>` (bulk Aktiv setzen, No-op bei leerer Liste)
- Consumes: `getPool`, `sql` aus `../db/connection` (bereits importiert in users.js).

- [ ] **Step 1: Merge-Regel um `dhstudent` erweitern**

In `backend/services/users.js`, in der `MERGE`-Anweisung von `upsertUser`, die Zeile
```javascript
                   WHEN t.Role IN ('azubi','pruefer') OR t.Role IS NULL THEN @role
```
ersetzen durch
```javascript
                   WHEN t.Role IN ('azubi','pruefer','dhstudent') OR t.Role IS NULL THEN @role
```
(Damit greifen Rollenwechsel zwischen den drei gruppen-verwalteten Rollen; `admin`/`developer` bleiben geschützt.)

- [ ] **Step 2: Lifecycle-Helfer einfügen**

In `backend/services/users.js` vor `module.exports` einfügen:

```javascript
// Aktive Nutzer mit einer der verwalteten Rollen (für den Deaktivierungs-Abgleich).
async function listManagedUsers(roles) {
  if (!roles || !roles.length) return [];
  const pool = await getPool();
  const r = pool.request();
  const params = roles.map((role, i) => { r.input(`r${i}`, sql.NVarChar(20), role); return `@r${i}`; });
  const res = await r.query(`SELECT Oid, Role FROM dbo.Users WHERE Aktiv = 1 AND Role IN (${params.join(',')})`);
  return res.recordset.map((x) => ({ oid: x.Oid, role: x.Role }));
}

// Aktiv-Flag für eine OID-Liste setzen (parametrisiert). No-op bei leerer Liste.
async function setUsersAktiv(oids, aktiv) {
  if (!oids || !oids.length) return 0;
  const pool = await getPool();
  const r = pool.request();
  r.input('aktiv', sql.Bit, aktiv ? 1 : 0);
  const params = oids.map((oid, i) => { r.input(`o${i}`, sql.NVarChar(36), oid); return `@o${i}`; });
  const res = await r.query(`UPDATE dbo.Users SET Aktiv = @aktiv, AktualisiertAm = SYSUTCDATETIME() WHERE Oid IN (${params.join(',')})`);
  return res.rowsAffected[0];
}
```

- [ ] **Step 3: Exporte ergänzen**

Im `module.exports`-Objekt von `users.js` `listManagedUsers` und `setUsersAktiv` ergänzen (an die bestehende Liste anhängen, z. B. nach `updateUserProfile`):

```javascript
  upsertUser, getUserByOid, getUserByEmail, listUsers, updateUserProfile,
  listManagedUsers, setUsersAktiv,
```
(Die übrigen bestehenden Exporte unverändert lassen.)

- [ ] **Step 4: Modul-Load + Regressionstests**

Run (aus `backend/`): `node -e "const u=require('./services/users'); console.log(typeof u.listManagedUsers, typeof u.setUsersAktiv)"`
Expected: `function function`

Run (aus `backend/`): `node --test services/users.test.js`
Expected: PASS (bestehende Tests unverändert grün — `buildReqUser` ist von der Merge-Regel unberührt).

- [ ] **Step 5: Commit**

```bash
git add backend/services/users.js
git commit -m "feat(users): Aktiv-Lifecycle-Helfer + dhstudent in Merge-Regel (fuer Gruppen-Sync)"
```

---

### Task 3: Graph-I/O + Orchestrierung (`runSync`)

**Files:**
- Modify: `backend/services/entraSync.js`

**Interfaces:**
- Consumes: `buildGroupRoleMap`/`resolveMembers`/`computeDeactivations`/`syncConfigured` (Task 1); `upsertUser`, `listManagedUsers`, `setUsersAktiv` aus `./users` (Task 2).
- Produces:
  - `getGraphToken({tenantId, clientId, clientSecret}) → Promise<string>`
  - `fetchGroupMembers(token, groupId) → Promise<[{oid,name,email}]>`
  - `runSync(env?) → Promise<{ ok, proGruppe, upserted, reactivated, deactivated, errors }>`

- [ ] **Step 1: I/O + Orchestrierung ergänzen**

In `backend/services/entraSync.js` **oberhalb** der `module.exports`-Zeile einfügen:

```javascript
const { upsertUser, listManagedUsers, setUsersAktiv } = require('./users');

// App-only-Token per Client-Credentials.
async function getGraphToken({ tenantId, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`Token-Abruf fehlgeschlagen: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('Token-Antwort ohne access_token');
  return j.access_token;
}

// Gruppen-Mitglieder (nur User) inkl. Paging. Wirft bei HTTP-Fehler.
async function fetchGroupMembers(token, groupId) {
  let url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`;
  const out = [];
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Gruppe ${groupId}: HTTP ${r.status}`);
    const j = await r.json();
    for (const m of (j.value || [])) {
      const isUser = String(m['@odata.type'] || '').toLowerCase().endsWith('.user') || !!m.userPrincipalName;
      if (!isUser) continue;
      const email = String(m.mail || m.userPrincipalName || '').trim().toLowerCase();
      out.push({ oid: m.id, name: m.displayName ?? null, email: email || null });
    }
    url = j['@odata.nextLink'] || null;
  }
  return out;
}

// Ein vollständiger Sync-Lauf. Bricht bei Token-/Gruppenfehler komplett ab
// (kein Teil-Abgleich → keine fälschlichen Deaktivierungen).
async function runSync(env = process.env) {
  const cfg = syncConfigured(env);
  if (!cfg.configured) return { ok: false, proGruppe: {}, upserted: 0, reactivated: 0, deactivated: 0, errors: ['Entra-Sync nicht konfiguriert'] };
  try {
    const token = await getGraphToken(cfg);
    const groupResults = [];
    for (const { role, groupId } of cfg.groupRoleMap) {
      groupResults.push({ role, members: await fetchGroupMembers(token, groupId) });
    }
    const resolved = resolveMembers(groupResults);
    const members = [...resolved.values()];
    for (const u of members) {
      await upsertUser({ oid: u.oid, name: u.name, email: u.email, role: u.role, letzterLogin: false });
    }
    const aktivOids = members.map((u) => u.oid);
    await setUsersAktiv(aktivOids, true);
    const dbManaged = await listManagedUsers(cfg.managedRoles);
    const stale = computeDeactivations(dbManaged, aktivOids);
    await setUsersAktiv(stale, false);
    const proGruppe = Object.fromEntries(groupResults.map((g) => [g.role, g.members.length]));
    console.log('[entra-sync] Lauf ok:', JSON.stringify(proGruppe), `upserted=${members.length} deactivated=${stale.length}`);
    return { ok: true, proGruppe, upserted: members.length, reactivated: aktivOids.length, deactivated: stale.length, errors: [] };
  } catch (e) {
    console.error('[entra-sync] Lauf fehlgeschlagen:', e.message);
    return { ok: false, proGruppe: {}, upserted: 0, reactivated: 0, deactivated: 0, errors: [e.message] };
  }
}
```

- [ ] **Step 2: `module.exports` erweitern**

Die `module.exports`-Zeile in `entraSync.js` ersetzen durch:

```javascript
module.exports = { buildGroupRoleMap, resolveMembers, computeDeactivations, syncConfigured, getGraphToken, fetchGroupMembers, runSync };
```

- [ ] **Step 3: Reine Tests weiterhin grün + Modul-Load**

Run (aus `backend/`): `node --test services/entraSync.test.js`
Expected: PASS (9/9 unverändert — reine Funktionen unberührt).

Run (aus `backend/`): `node -e "const s=require('./services/entraSync'); console.log(typeof s.runSync, typeof s.getGraphToken)"`
Expected: `function function`

- [ ] **Step 4: Commit**

```bash
git add backend/services/entraSync.js
git commit -m "feat(entra-sync): Graph-Token + Mitglieder-Abruf + runSync-Orchestrierung"
```

---

### Task 4: Route + Serverstart-Bootstrap

**Files:**
- Create: `backend/routes/sync.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `runSync`, `syncConfigured` aus `../services/entraSync` (Task 3); `devAuth` (bereits in server.js).
- Produces: `POST /api/sync/entra` (developer-only) → Sync-Zusammenfassung; Timer-Bootstrap beim Serverstart.

- [ ] **Step 1: Route anlegen**

Create `backend/routes/sync.js`:

```javascript
'use strict';
const router = require('express').Router();
const { runSync } = require('../services/entraSync');

// POST /api/sync/entra — manueller Sofort-Sync (nur developer).
router.post('/entra', async (req, res) => {
  if (req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  const result = await runSync();
  res.status(result.ok ? 200 : 502).json(result);
});

module.exports = router;
```

- [ ] **Step 2: Route in `server.js` mounten**

In `backend/server.js` bei den anderen Router-Requires (nach `const fahrtgeldRouter = require('./routes/fahrtgeld');`) ergänzen:

```javascript
const syncRouter = require('./routes/sync');
```

Und bei den `app.use('/api/...', devAuth, ...)`-Mounts (nach der `fahrtgeld`-Zeile) ergänzen:

```javascript
app.use('/api/sync', devAuth, syncRouter);
```

- [ ] **Step 3: Timer-Bootstrap nach `app.listen`**

In `backend/server.js` **nach** dem `app.listen(PORT, () => { ... });`-Block (nach Zeile ~163) anfügen:

```javascript
// ── Automatischer Entra-Gruppen-Sync ─────────────────────────────
const { syncConfigured: entraConfigured, runSync: entraRunSync } = require('./services/entraSync');
const entraCfg = entraConfigured();
if (entraCfg.configured) {
  entraRunSync().catch((e) => console.error('[entra-sync] Start-Lauf:', e.message));
  setInterval(() => { entraRunSync().catch((e) => console.error('[entra-sync]', e.message)); },
    entraCfg.intervalHours * 3600 * 1000);
  console.log(`[entra-sync] aktiv — Intervall ${entraCfg.intervalHours} h.`);
} else {
  console.warn('[entra-sync] NICHT konfiguriert — Gruppen-Sync deaktiviert.');
}
```

- [ ] **Step 4: Modul-Load + Server-Boot ohne Graph-Konfig**

Run (aus `backend/`): `node -e "require('./routes/sync'); console.log('route OK')"`
Expected: `route OK`

Run (aus `backend/`): `node --check server.js && echo "server syntax OK"`
Expected: `server syntax OK`

(Optional, falls DB erreichbar) Server kurz starten: `[entra-sync] NICHT konfiguriert …` erscheint (ohne gesetzte Graph-`.env`) und der Server läuft normal.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/sync.js backend/server.js
git commit -m "feat(entra-sync): developer-only Endpoint /api/sync/entra + Timer beim Serverstart"
```

---

### Task 5: Frontend — „Jetzt synchronisieren"-Button

**Files:**
- Modify: `app/js/api.js`
- Modify: `app/js/nutzerverwaltung.js`

**Interfaces:**
- Consumes: `POST /api/sync/entra` (Task 4); bestehende `apiFetch`, `DB`, `Toast`, `renderPage`, `DB.getAllUsers`, `normalizeUser`.
- Produces: `DB.runEntraSync()`; Button im Seitenkopf der Nutzerverwaltung.

- [ ] **Step 1: DB-Helfer in `api.js`**

In `app/js/api.js` im `DB`-Objekt (z. B. direkt nach `setAusbilderFuerAzubi`) einfügen:

```javascript
  async runEntraSync() {
    return await apiFetch('/sync/entra', { method: 'POST' });
  },
```

- [ ] **Step 2: Button in den Seitenkopf (`nutzerverwaltung.js`)**

In `app/js/nutzerverwaltung.js`, im `main.innerHTML`-Template den `page-header__left`-Block um einen Button rechts ergänzen. Ersetze
```javascript
      <div class="page-header__left">
        <h1 class="page-title">Nutzerverwaltung</h1>
        <p class="page-subtitle">Rollen, Rechte und Profildaten aller Nutzer verwalten</p>
      </div>
```
durch
```javascript
      <div class="page-header__left">
        <h1 class="page-title">Nutzerverwaltung</h1>
        <p class="page-subtitle">Rollen, Rechte und Profildaten aller Nutzer verwalten</p>
      </div>
      <div class="page-header__right">
        <button class="btn btn-outline" type="button" id="nvSyncBtn">Jetzt synchronisieren</button>
      </div>
```

- [ ] **Step 3: Button verdrahten**

In `app/js/nutzerverwaltung.js`, am Ende des `DOMContentLoaded`-Handlers (nach dem Verdrahten der Suche `document.getElementById('nvSearch').addEventListener(...)`) einfügen:

```javascript
  /* Manueller Entra-Sync (developer-only Seite) */
  document.getElementById('nvSyncBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('nvSyncBtn');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Synchronisiere…';
    try {
      const r = await DB.runEntraSync();
      if (r.ok) {
        Toast.success(`Sync ok: ${r.upserted} aktualisiert, ${r.deactivated} deaktiviert`);
        users = await DB.getAllUsers();
        renderPage(users);
      } else {
        Toast.error('Sync fehlgeschlagen: ' + (r.errors?.[0] || 'unbekannt'));
      }
    } catch (e) {
      Toast.error('Sync fehlgeschlagen: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
```

- [ ] **Step 4: Syntax-Check**

Run (aus Repo-Root): `node --check app/js/api.js && node --check app/js/nutzerverwaltung.js && echo OK`
Expected: `OK`

- [ ] **Step 5: Manuelle Browser-Verifikation** (kein UI-Harness im Repo)

Mit gesetzter Graph-`.env` + Neustart, als `developer` in der Nutzerverwaltung:
- Button „Jetzt synchronisieren" klicken → Toast mit Zusammenfassung; Liste lädt neu.
- Ein aus der Azubi-Gruppe entfernter Test-Nutzer erscheint danach als inaktiv; ein wieder hinzugefügter wird reaktiviert; `developer`/`admin` bleiben aktiv.
Ohne Graph-`.env`: Button liefert Toast „nicht konfiguriert".

- [ ] **Step 6: Commit**

```bash
git add app/js/api.js app/js/nutzerverwaltung.js
git commit -m "feat(nutzerverwaltung): Button 'Jetzt synchronisieren' fuer Entra-Sync"
```

---

## Self-Review

**Spec-Coverage:**
- Graph-Client (Client-Credentials, fetch, kein Paket) → Task 3 ✓
- Reine Logik (Mapping, Vorrang pruefer>azubi>dhstudent, Deaktivierung) → Task 1 ✓
- Rollen-gebundene Deaktivierung + Reaktivierung → Task 3 (runSync) + Task 2 (Helfer) ✓
- Merge-Regel um dhstudent → Task 2 ✓
- Timer beim Serverstart + Intervall + developer-only Button → Task 4 (Bootstrap+Route) + Task 5 (UI) ✓
- Konfiguration `.env` + „fehlt → deaktiviert" → Task 1 (syncConfigured) + Task 4 (Bootstrap-Warnung) + `.env.example` (Task 1) ✓
- Fehlerstrategie „ganzer Lauf abbrechen" → Task 3 (try/catch um Token+alle Gruppen) ✓
- developer/admin nie angefasst → Task 1 (computeDeactivations nur über managedRoles-gefilterte dbManaged) + Task 2 (Merge schützt admin/developer) ✓
- Tests: reine Logik automatisiert, I/O/DB/UI manuell → Tasks 1–5 ✓

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code; manuelle Verifikationsschritte sind bewusst und begründet.

**Typ-Konsistenz:** `groupRoleMap`/`managedRoles`/`resolveMembers`(Map)/`computeDeactivations`(string[])/`syncConfigured`-Felder durchgängig gleich zwischen Task 1-Definition und Task 3-Aufruf; `listManagedUsers → [{oid,role}]` passt zu `computeDeactivations(dbManagedUsers,…)`; `setUsersAktiv(oids, aktiv)` identisch in Task 2/3; API-Pfad `/sync/entra` identisch zwischen Route (Task 4) und `DB.runEntraSync` (Task 5); `runSync`-Rückgabe (`ok/upserted/deactivated/errors`) identisch zwischen Task 3, Route (Task 4) und UI (Task 5).
