# Dedizierte Prüfer-Sicht + Beurteilungen-Reiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reine (rein befristete) Prüfer bekommen eine reduzierte, eigene Sicht (kein Jahresansicht-/Abteilungsdurchlauf-Zugriff, Wochenansicht fenstergebunden mit 6-Wochen-Nachlauffrist, eigenes Dashboard); zusätzlich bekommen Beurteilungen einen eigenen, rollenweit nutzbaren Sidebar-Reiter.

**Architecture:** Ein neues serverseitiges Flag `istReinerPruefer` (requireAuth) unterscheidet befristete Prüfer ohne dauerhafte `AusbilderAzubis`-Zuordnung von vollwertigen Ausbildern. Eine neue reine Funktion `istZugreifbar` in `zugriff.js` verlängert den Zugriffsschalter für befristete Prüfer um eine 6-Wochen-Nachlauffrist, ohne das sichtbare Wochenfenster selbst zu verändern. Ein neuer Endpunkt `GET /api/zuweisungen/meine-pruefungen` speist sowohl das neue Prüfer-Dashboard als auch die Wochenansicht-Fenstergrenzen. Ein neuer Endpunkt `GET /api/beurteilungen/meine` speist einen neuen, eigenständigen Sidebar-Reiter „Beurteilungen".

**Tech Stack:** Node.js/Express-Backend (mssql), Vanilla-JS-SPA-Frontend (kein Framework), node:test für Unit-Tests.

## Global Constraints

- Bestehende reine Funktion `istAktiv` in `backend/services/zugriff.js` bleibt unverändert (Name/Verhalten) — sie wird nur an ihrer einzigen Aufrufstelle (`istPeriodenPruefer`) durch die neue Funktion `istZugreifbar` ersetzt.
- `wocheFaelltInZuweisung` (das sichtbare Wochenfenster Von–Bis) bleibt unverändert — die 6-Wochen-Regel betrifft ausschließlich den Zugriffsschalter, nicht das Fenster selbst.
- Nachlauffrist ist eine feste Konstante `NACHLAUF_TAGE = 42` (6 Wochen), nicht konfigurierbar.
- Die bestehende `istAusbilder`-Capability (`backend/services/users.js` `buildReqUser`) bleibt unverändert — sie steuert weiterhin die Eligibility für dauerhafte `AusbilderAzubis`-Zuordnungen (`validateZuordnung`) und darf nicht an `istReinerPruefer` gekoppelt werden.
- Keine Änderung an `verantwortlichFuerZuweisung`/`darfBeurteilen` (Beurteilungs-Zugriffsrecht bleibt datumsunabhängig).
- Keine neuen DB-Migrationen/Spalten nötig.
- Deutsche Bezeichner/Kommentare/UI-Texte, wie im übrigen Repo.
- Tests laufen mit `node --test <pfad-zur-datei>` (kein npm-Testskript im Projekt definiert).

---

### Task 1: `istZugreifbar` — 6-Wochen-Nachlauffrist in der reinen Zugriffslogik

**Files:**
- Modify: `backend/services/zugriff.js:24-64`
- Modify: `backend/services/zugriff.test.js:30-38,58-61`

**Interfaces:**
- Produces: `istZugreifbar(zuweisung, stichtag): boolean`, `NACHLAUF_TAGE: number` (beide neu exportiert aus `zugriff.js`). `istPeriodenPruefer` nutzt intern `istZugreifbar` statt `istAktiv`.

- [ ] **Step 1: Fehlschlagenden Test für `istZugreifbar` schreiben**

In `backend/services/zugriff.test.js`, direkt NACH dem bestehenden `istAktiv`-Testblock (nach Zeile 38, vor dem `wocheFaelltInZuweisung`-Kommentar), einfügen:

```js
// ── istZugreifbar (6-Wochen-Nachlauffrist) ─────────────────────
test('istZugreifbar: verhält sich wie istAktiv innerhalb Von-Bis', () => {
  const z = zuw(); // von 2026-06-01, bis 2026-06-30
  assert.equal(Z.istZugreifbar(z, '2026-05-31'), false); // Tag vor von
  assert.equal(Z.istZugreifbar(z, '2026-06-01'), true);
  assert.equal(Z.istZugreifbar(z, '2026-06-30'), true);
});
test('istZugreifbar: bleibt bis 42 Tage nach Bis zugreifbar, danach nicht mehr', () => {
  const z = zuw(); // bis 2026-06-30
  assert.equal(Z.istZugreifbar(z, '2026-07-01'), true);  // 1 Tag danach
  assert.equal(Z.istZugreifbar(z, '2026-08-11'), true);  // genau 42 Tage danach
  assert.equal(Z.istZugreifbar(z, '2026-08-12'), false); // 43 Tage danach
});
test('istZugreifbar: fehlende Von/Bis-Werte → false', () => {
  assert.equal(Z.istZugreifbar({ von: '2026-06-01', bis: null }, '2026-06-15'), false);
  assert.equal(Z.istZugreifbar({ von: null, bis: '2026-06-30' }, '2026-06-15'), false);
});
```

Außerdem die bestehende Erwartung in Zeile 58-61 anpassen — mit der neuen 42-Tage-Nachlauffrist ist ein Stichtag 15 Tage nach `bis` jetzt weiterhin zugreifbar, beschreibt also nicht mehr "nicht aktiv". Den Stichtag auf einen Tag WEIT NACH der Nachlauffrist verschieben, damit der Test weiterhin "wirklich abgelaufen" prüft:

```js
test('darfWocheKorrigieren: Zuweisung auch nach Nachlauffrist nicht mehr zugreifbar → false', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-08-15' }; // 46 Tage nach Bis (2026-06-30)
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), false);
});
```//Ersetzt die alte Zeile 58-61 (`'darfWocheKorrigieren: Zuweisung heute nicht aktiv → false'`) 1:1.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `node --test backend/services/zugriff.test.js`
Expected: FAIL — `Z.istZugreifbar is not a function`

- [ ] **Step 3: `istZugreifbar` implementieren, `istPeriodenPruefer` umstellen**

In `backend/services/zugriff.js`, nach der bestehenden `istAktiv`-Funktion (nach Zeile 28), einfügen:

```js
// 6 Wochen Nachlauffrist: wie lange nach Ablauf einer Zuweisung (bis) der
// zugehörige Prüfer noch auf das Wochenfenster SEINER Zuweisung zugreifen darf
// (siehe istPeriodenPruefer). Das Wochenfenster selbst (wocheFaelltInZuweisung)
// bleibt davon unberührt — nur der Zugriffsschalter verlängert sich.
const NACHLAUF_TAGE = 42;

// Ist die Zuweisung am Stichtag noch ZUGREIFBAR (von ≤ stichtag ≤ bis + Nachlauffrist)?
// Ersetzt istAktiv innerhalb von istPeriodenPruefer; istAktiv selbst bleibt
// unverändert (wird von nichts anderem verwendet).
function istZugreifbar(zuweisung, stichtag) {
  const t = ymd(stichtag), von = ymd(zuweisung.von), bis = ymd(zuweisung.bis);
  if (!t || !von || !bis) return false;
  if (t < von) return false;
  const grenze = new Date(bis + 'T00:00:00Z');
  grenze.setUTCDate(grenze.getUTCDate() + NACHLAUF_TAGE);
  return t <= grenze.toISOString().slice(0, 10);
}
```

Dann `istPeriodenPruefer` (aktuell Zeile 55-64) ändern — `istAktiv(z, kontext.stichtag)` durch `istZugreifbar(z, kontext.stichtag)` ersetzen:

```js
function istPeriodenPruefer(user, woche, kontext) {
  if (!woche.azubiOid || !user.email) return false;
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    (z.verantwortlicherEmail || '').toLowerCase() === (user.email || '').toLowerCase() &&
    z.azubiOid === woche.azubiOid &&
    istZugreifbar(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}
```

Zuletzt `module.exports` (Zeile 131-136) um die zwei neuen Namen ergänzen:

```js
module.exports = {
  ymd, istAktiv, istZugreifbar, NACHLAUF_TAGE, wocheFaelltInZuweisung, hatKorrigiert, istDauerAusbilder,
  darfWocheKorrigieren, darfWocheSehen,
  verantwortlichFuerZuweisung,
  istPeriodenPruefer, rolleFuerWoche, wochenAktionen,
};
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `node --test backend/services/zugriff.test.js`
Expected: PASS (alle Tests inkl. der neuen und der angepassten)

- [ ] **Step 5: Commit**

```bash
git add backend/services/zugriff.js backend/services/zugriff.test.js
git commit -m "feat(zugriff): 6-Wochen-Nachlauffrist für befristete Prüfer (istZugreifbar)"
```

---

### Task 2: `hatDauerhafteZuordnung` — Prüfung auf dauerhafte Ausbilder-Zuordnung

**Files:**
- Modify: `backend/services/ausbilderAzubis.js:1-76`

**Interfaces:**
- Consumes: `getPool, sql` aus `../db/connection` (bereits importiert).
- Produces: `hatDauerhafteZuordnung(ausbilderOid): Promise<boolean>` (neu exportiert), verwendet in Task 3.

- [ ] **Step 1: Funktion ergänzen**

In `backend/services/ausbilderAzubis.js`, nach `listAzubisFuerAusbilder` (nach Zeile 37, vor `validateZuordnung`), einfügen:

```js
// Hat der Nutzer irgendeine dauerhafte Zuordnung als Ausbilder? Bestimmt in
// requireAuth, ob ein Prüfer als "rein befristet" (reduzierte Sicht) oder als
// vollwertiger Ausbilder gilt.
async function hatDauerhafteZuordnung(ausbilderOid) {
  const pool = await getPool();
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), ausbilderOid)
    .query('SELECT TOP 1 1 AS x FROM dbo.AusbilderAzubis WHERE AusbilderOid = @oid');
  return r.recordset.length > 0;
}
```

Und `module.exports` (Zeile 75) erweitern:

```js
module.exports = { listFuerAzubi, listAzubisFuerAusbilder, validateZuordnung, setFuerAzubi, hatDauerhafteZuordnung };
```

Kein dedizierter Unit-Test (reiner DB-Passthrough, wie die übrigen Funktionen in dieser Datei — konsistent mit bestehender Konvention, keine der anderen Funktionen hier hat einen eigenen Test). Wird über Task 3 (Stub) und die manuelle Verifikation in Task 13 abgedeckt.

- [ ] **Step 2: Commit**

```bash
git add backend/services/ausbilderAzubis.js
git commit -m "feat(ausbilderAzubis): hatDauerhafteZuordnung für Reiner-Pruefer-Erkennung"
```

---

### Task 3: `istReinerPruefer`-Flag in `requireAuth`

**Files:**
- Modify: `backend/middleware/auth.js:1-58`
- Modify: `backend/middleware/auth.test.js`

**Interfaces:**
- Consumes: `hatDauerhafteZuordnung` aus Task 2.
- Produces: `req.user.istReinerPruefer: boolean` — konsumiert vom Frontend über `GET /api/auth/me` (`server.js:96-98` gibt `req.user` direkt zurück, keine Änderung dort nötig) und in Task 5.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `backend/middleware/auth.test.js`, nach Zeile 9 (`usersMod.getUserByOid = ...`), den Stub für die neue Abhängigkeit ergänzen:

```js
const ausbilderAzubisMod = require('../services/ausbilderAzubis');
let HAT_DAUERHAFT = false;
ausbilderAzubisMod.hatDauerhafteZuordnung = async () => HAT_DAUERHAFT;
```

(Muss VOR `const { requireAuth } = require('./auth');` in Zeile 11 stehen, damit `auth.js` beim Require bereits den gestubbten Export bekommt — gleiches Muster wie der bestehende `usersMod.getUserByOid`-Stub.)

Am Ende der Datei (nach dem bestehenden `'inaktiver Nutzer → 401'`-Test, Zeile 46-53) ergänzen:

```js
test('reiner Prüfer (keine Dauer-Zuordnung, kein manuelles Flag) → istReinerPruefer=true', async () => {
  STUB = { Oid: 'pr-1', Role: 'pruefer', KannPlanen: false, IstAusbilder: false, Aktiv: true };
  HAT_DAUERHAFT = false;
  const req = { headers: { 'x-dev-oid': 'pr-1' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.istReinerPruefer, true);
});

test('Prüfer MIT dauerhafter Zuordnung → istReinerPruefer=false', async () => {
  STUB = { Oid: 'pr-2', Role: 'pruefer', KannPlanen: false, IstAusbilder: false, Aktiv: true };
  HAT_DAUERHAFT = true;
  const req = { headers: { 'x-dev-oid': 'pr-2' }, session: {} };
  const res = makeRes();
  await requireAuth(req, res, () => {});
  assert.equal(req.user.istReinerPruefer, false);
});

test('Prüfer mit manuellem IstAusbilder-Flag → istReinerPruefer=false', async () => {
  STUB = { Oid: 'pr-3', Role: 'pruefer', KannPlanen: false, IstAusbilder: true, Aktiv: true };
  HAT_DAUERHAFT = false;
  const req = { headers: { 'x-dev-oid': 'pr-3' }, session: {} };
  const res = makeRes();
  await requireAuth(req, res, () => {});
  assert.equal(req.user.istReinerPruefer, false);
});

test('Azubi → istReinerPruefer bleibt false', async () => {
  STUB = { Oid: 'az-1', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Aktiv: true };
  HAT_DAUERHAFT = false;
  const req = { headers: { 'x-dev-oid': 'az-1' }, session: {} };
  const res = makeRes();
  await requireAuth(req, res, () => {});
  assert.equal(req.user.istReinerPruefer, false);
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `node --test backend/middleware/auth.test.js`
Expected: FAIL — `req.user.istReinerPruefer` ist `undefined`, nicht `true`/`false`

- [ ] **Step 3: `requireAuth` erweitern**

In `backend/middleware/auth.js`, Zeile 7, den Import erweitern:

```js
const { getUserByOid, buildReqUser, canUseDevView } = require('../services/users');
const { hatDauerhafteZuordnung } = require('../services/ausbilderAzubis');
```

Dann nach Zeile 49 (`req.user.devViewActive = active;`), vor `next();` (Zeile 50), einfügen:

```js
    // "Reiner Prüfer": Rolle pruefer, ausschließlich befristete Zuweisungen
    // (kein manuelles IstAusbilder-Flag, keine AusbilderAzubis-Zeile als
    // Ausbilder). Steuert die reduzierte Sicht im Frontend (Dashboard,
    // Navigation, Wochenansicht-Fenster) — die istAusbilder-Capability oben
    // bleibt bewusst unverändert (Eligibility für dauerhafte Zuordnungen).
    req.user.istReinerPruefer = false;
    if (req.user.role === 'pruefer' && !row.IstAusbilder) {
      req.user.istReinerPruefer = !(await hatDauerhafteZuordnung(req.user.oid));
    }
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `node --test backend/middleware/auth.test.js`
Expected: PASS (alle 8 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/auth.js backend/middleware/auth.test.js
git commit -m "feat(auth): istReinerPruefer-Flag für rein befristete Prüfer"
```

---

### Task 4: `ladeZuweisungen` liefert Id + Abteilung mit

**Files:**
- Modify: `backend/services/zugriffContext.js:11-21`

**Interfaces:**
- Produces: Jedes Element von `kontext.zuweisungen` trägt zusätzlich `id` und `abteilung` (additiv — bestehende Konsumenten lesen nur `azubiOid`/`verantwortlicherEmail`/`von`/`bis` und sind unberührt).
- Consumes (nachgelagert, Task 5): `id`, `abteilung`.

- [ ] **Step 1: Query + Mapping erweitern**

In `backend/services/zugriffContext.js`, Funktion `ladeZuweisungen` (Zeile 11-21) ersetzen:

```js
async function ladeZuweisungen(pool, verantwEmail, alsEmail) {
  const rz = await pool.request()
    .input('email', sql.NVarChar(255), verantwEmail)
    .query('SELECT Id, AzubiOid, VerantwEmail, Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE VerantwEmail = @email');
  return rz.recordset.map(z => ({
    id: z.Id,
    azubiOid: z.AzubiOid,
    verantwortlicherEmail: alsEmail,
    abteilung: z.Abteilung,
    von: z.Von,
    bis: z.Bis,
  }));
}
```

Keine weiteren Änderungen an `ladeKorrekturKontext` nötig — die zusätzlichen Felder laufen einfach durch.

- [ ] **Step 2: Commit**

```bash
git add backend/services/zugriffContext.js
git commit -m "feat(zugriffContext): Id+Abteilung an geladenen Zuweisungen mitliefern"
```

---

### Task 5: Endpunkt `GET /api/zuweisungen/meine-pruefungen`

**Files:**
- Modify: `backend/routes/zuweisungen.js:1-4,246-250`

**Interfaces:**
- Consumes: `ladeKorrekturKontext` (`../services/zugriffContext`), `istZugreifbar, ymd, NACHLAUF_TAGE` (`../services/zugriff`, Task 1+4).
- Produces: `GET /api/zuweisungen/meine-pruefungen` → `Array<{ azubiOid, azubiName, abteilung, von, bis, status: 'laeuft'|'nachlauf', nachlaufBis }>`, sortiert nach `von` aufsteigend. Konsumiert vom Frontend in Task 7 (`DB.getMeinePruefungen`).

- [ ] **Step 1: Imports ergänzen**

In `backend/routes/zuweisungen.js`, Zeile 1-4, ergänzen:

```js
const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');
const { mitVertretern } = require('../services/vertretungen');
const { ladeKorrekturKontext } = require('../services/zugriffContext');
const { istZugreifbar, ymd, NACHLAUF_TAGE } = require('../services/zugriff');
```

- [ ] **Step 2: Route registrieren**

Direkt VOR `router.get('/:id', ...)` (aktuell Zeile 250, muss vor dem `:id`-Wildcard stehen, sonst matcht Express `/meine-pruefungen` fälschlich als `:id`) einfügen:

```js
// GET /api/zuweisungen/meine-pruefungen
// Für Prüfer: die eigenen (inkl. per Vertretung geerbten) befristeten
// Zuweisungen, je Azubi nur die zeitlich aktuellste (höchstes Von), gefiltert
// auf den noch bestehenden Zugriff (Von…Bis + 6 Wochen Nachlauf). Speist das
// Prüfer-Dashboard und die Wochenansicht-Fenstergrenzen.
router.get('/meine-pruefungen', async (req, res) => {
  try {
    const pool = await getPool();
    const kontext = await ladeKorrekturKontext(pool, req.user);

    const neuesteJeAzubi = new Map();
    for (const z of kontext.zuweisungen) {
      const bisher = neuesteJeAzubi.get(z.azubiOid);
      if (!bisher || ymd(z.von) > ymd(bisher.von)) neuesteJeAzubi.set(z.azubiOid, z);
    }
    const zugreifbare = [...neuesteJeAzubi.values()].filter(z => istZugreifbar(z, kontext.stichtag));
    if (!zugreifbare.length) return res.json([]);

    const r = pool.request();
    const params = zugreifbare.map((z, i) => { r.input(`o${i}`, sql.NVarChar(36), z.azubiOid); return `@o${i}`; });
    const namen = await r.query(`SELECT Oid, Name FROM dbo.Users WHERE Oid IN (${params.join(',')})`);
    const nameByOid = new Map(namen.recordset.map(n => [n.Oid, n.Name]));

    const liste = zugreifbare.map(z => {
      const bis = ymd(z.bis);
      const nachlaufDatum = new Date(bis + 'T00:00:00Z');
      nachlaufDatum.setUTCDate(nachlaufDatum.getUTCDate() + NACHLAUF_TAGE);
      return {
        azubiOid: z.azubiOid,
        azubiName: nameByOid.get(z.azubiOid) || '',
        abteilung: z.abteilung || null,
        von: ymd(z.von),
        bis,
        status: kontext.stichtag <= bis ? 'laeuft' : 'nachlauf',
        nachlaufBis: nachlaufDatum.toISOString().slice(0, 10),
      };
    }).sort((a, b) => (a.von < b.von ? -1 : 1));

    res.json(liste);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] meine-pruefungen: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

```

- [ ] **Step 3: Manuell verifizieren**

Kein dedizierter Route-Test (Konvention dieses Repos: nur reine Service-Logik hat `.test.js`-Dateien, keine Express-Routen). Verifikation erfolgt in Task 13 gegen die laufende Dev-Instanz, z.B.:

```bash
cd backend && node -e "
require('dotenv').config({path:'.env'});
const {getPool}=require('./db/connection');
(async()=>{
  const p=await getPool();
  const r=await p.request().query(\"SELECT TOP 3 * FROM dbo.Zuweisungen WHERE VerantwEmail='test.pruefer.demo@putzmeister.com'\");
  console.log(JSON.stringify(r.recordset));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
"
```

Bestätigt, dass für den in dieser Session bereits angelegten Demo-Prüfer (`test.pruefer.demo@putzmeister.com`, siehe `backend/db/seed-demo-users.sql`) passende Zuweisungs-Testdaten existieren bzw. angelegt werden können, bevor der Endpunkt live gegen den Dev-Login getestet wird.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/zuweisungen.js
git commit -m "feat(zuweisungen): Endpunkt meine-pruefungen für Prüfer-Dashboard + Wochenfenster"
```

---

### Task 6: Endpunkt `GET /api/beurteilungen/meine`

**Files:**
- Modify: `backend/services/beurteilungen.js:1-9,214-217`
- Modify: `backend/routes/beurteilungen.js:1-6,145-146`

**Interfaces:**
- Produces: `listMeineBeurteilbaren(pool, user): Promise<Array<{zuweisungId, azubiOid, azubiName, abteilung, von, bis, status: 'offen'|'abgeschlossen'}>>` (neu exportiert aus `beurteilungen.js`); Route `GET /api/beurteilungen/meine`. Konsumiert vom Frontend in Task 7 (`DB.getMeineBeurteilungen`).

- [ ] **Step 1: Service-Funktion ergänzen**

In `backend/services/beurteilungen.js`, nach `ermittleUndErzeugeFaellige` (nach Zeile 212, vor `module.exports`), einfügen:

```js
// Flache Liste aller Zuweisungen, die der Nutzer beurteilen darf (befristet
// per E-Mail + dauerhaft per AusbilderAzubis, inkl. Vertretungen — via
// ladeKorrekturKontext), mit Beurteilungsstatus. Speist den eigenen
// "Beurteilungen"-Reiter (Ausbilder/Prüfer/Admin/Developer — NICHT Azubi,
// der bleibt beim bestehenden Weg über die Durchlauf-Kacheln).
async function listMeineBeurteilbaren(pool, user) {
  if (user.istAzubi || user.istDhStudent) return [];
  const global = user.role === 'developer' || user.role === 'admin';

  let where = '1=1';
  const r = pool.request();
  if (!global) {
    const kontext = await ladeKorrekturKontext(pool, user);
    const emails = [...new Set(kontext.zuweisungen.map(z => z.verantwortlicherEmail).filter(Boolean))];
    const dauerOids = kontext.dauerAusbilderAzubiOids || [];
    if (!emails.length && !dauerOids.length) return [];
    const emailParams = emails.map((e, i) => { r.input(`e${i}`, sql.NVarChar(255), e); return `@e${i}`; });
    const oidParams = dauerOids.map((o, i) => { r.input(`o${i}`, sql.NVarChar(36), o); return `@o${i}`; });
    const clauses = [];
    if (emailParams.length) clauses.push(`z.VerantwEmail IN (${emailParams.join(',')})`);
    if (oidParams.length) clauses.push(`z.AzubiOid IN (${oidParams.join(',')})`);
    where = clauses.join(' OR ');
  }

  const result = await r.query(`
    SELECT z.Id AS ZuweisungId, z.AzubiOid, z.Abteilung, z.Von, z.Bis, u.Name AS AzubiName,
           b.Status AS BeurteilungStatus
    FROM dbo.Zuweisungen z
    JOIN dbo.Users u ON u.Oid = z.AzubiOid
    LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id
    WHERE ${where}
    ORDER BY z.Bis DESC, z.Von DESC
  `);
  return result.recordset.map(row => ({
    zuweisungId: row.ZuweisungId,
    azubiOid: row.AzubiOid,
    azubiName: row.AzubiName,
    abteilung: row.Abteilung,
    von: ymd(row.Von),
    bis: ymd(row.Bis),
    status: row.BeurteilungStatus === 'abgeschlossen' ? 'abgeschlossen' : 'offen',
  }));
}
```

Import von `ymd` ergänzen (Zeile 6, wo bereits `verantwortlichFuerZuweisung` aus `./zugriff` importiert wird):

```js
const { verantwortlichFuerZuweisung, ymd } = require('./zugriff');
```

`module.exports` (Zeile 214-217) erweitern:

```js
module.exports = {
  ladeZuweisung, darfBeurteilen, getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren,
};
```

- [ ] **Step 2: Route ergänzen**

In `backend/routes/beurteilungen.js`, nach dem `GET /faellig`-Handler (nach Zeile 66, vor `POST /`), einfügen:

```js
// GET /api/beurteilungen/meine — flache Liste aller Zuweisungen, die der
// aufrufende Nutzer beurteilen darf, mit Status offen/abgeschlossen. Speist
// den eigenen Beurteilungen-Reiter (nicht für Azubis).
router.get('/meine', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await svc.listMeineBeurteilbaren(pool, req.user));
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] meine: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

```

- [ ] **Step 3: Commit**

```bash
git add backend/services/beurteilungen.js backend/routes/beurteilungen.js
git commit -m "feat(beurteilungen): Endpunkt meine für den neuen Beurteilungen-Reiter"
```

---

### Task 7: Frontend-API-Wrapper

**Files:**
- Modify: `app/js/api.js:417-421,745-747`

**Interfaces:**
- Consumes: `apiFetch` (bereits in `api.js` definiert).
- Produces: `DB.getMeinePruefungen(): Promise<Array<{azubiOid, azubiName, abteilung, von, bis, status, nachlaufBis}>>`, `DB.getMeineBeurteilungen(): Promise<Array<{zuweisungId, azubiOid, azubiName, abteilung, von, bis, status}>>`. Konsumiert in Task 10-12.

- [ ] **Step 1: `getMeinePruefungen` ergänzen**

In `app/js/api.js`, direkt nach `getZuweisungenFuerVerantw` (nach Zeile 420, vor `getAktuellerAusbilder`), einfügen:

```js
  // Für rein befristete Prüfer: die eigenen aktuell zugreifbaren Zuweisungen
  // (inkl. 6-Wochen-Nachlauf), je Azubi nur die aktuellste. Speist das
  // Prüfer-Dashboard und die Wochenansicht-Fenstergrenzen.
  async getMeinePruefungen() {
    return await apiFetch('/zuweisungen/meine-pruefungen');
  },
```

- [ ] **Step 2: `getMeineBeurteilungen` ergänzen**

Nach `getFaelligeBeurteilungen` (nach Zeile 747, vor `saveBeurteilungEntwurf`), einfügen:

```js
  // Flache Liste aller Zuweisungen, die der Nutzer beurteilen darf, für den
  // eigenen Beurteilungen-Reiter (nicht für Azubis).
  async getMeineBeurteilungen() {
    return await apiFetch('/beurteilungen/meine');
  },
```

- [ ] **Step 3: Commit**

```bash
git add app/js/api.js
git commit -m "feat(api): DB-Wrapper für meine-pruefungen + meine-beurteilungen"
```

---

### Task 8: Sidebar-Navigation — Beurteilungen-Reiter, Jahresansicht/Durchlauf für reine Prüfer ausblenden

**Files:**
- Modify: `app/js/sidebar.js:32-50`
- Modify: `app/js/app.js:18-56,183-190`

**Interfaces:**
- Consumes: `req.user.istReinerPruefer` (Task 3, über `GET /api/auth/me` → `DB.fetchCurrentUser()` → `user.istReinerPruefer`).
- Produces: neue CSS-Gating-Klassen `nav-jahresansicht-only`, `nav-beurteilungen-only`; `caps.istReinerPruefer` in `applyCapabilities`.

- [ ] **Step 1: Sidebar-Markup anpassen**

In `app/js/sidebar.js`, Zeile 32-50, ersetzen durch:

```html
      <span class="sidebar__section-label nav-berichtsheft-only">Berichtsheft</span>
      <a href="wochenansicht.html" class="sidebar__link nav-berichtsheft-only" id="nav-wochenansicht">
        <span class="sidebar__link-icon">${Icon('wochenansicht')}</span>
        <span class="sidebar__link-label">Wochenansicht</span>
      </a>
      <a href="jahresansicht.html" class="sidebar__link nav-jahresansicht-only" id="nav-jahresansicht">
        <span class="sidebar__link-icon">${Icon('jahresansicht')}</span>
        <span class="sidebar__link-label">Jahresansicht</span>
      </a>
      <a href="beurteilungen.html" class="sidebar__link nav-beurteilungen-only" id="nav-beurteilungen" style="display:none">
        <span class="sidebar__link-icon">${Icon('cap')}</span>
        <span class="sidebar__link-label">Beurteilungen</span>
      </a>

      <span class="sidebar__section-label nav-durchlauf">Sonstiges</span>
      <a href="fahrgelderstattung.html" class="sidebar__link nav-azubi-only" id="nav-fahrgelderstattung">
        <span class="sidebar__link-icon">${Icon('document')}</span>
        <span class="sidebar__link-label">Fahrgelderstattung</span>
      </a>
      <a href="abteilungs-planer.html?mein=1" class="sidebar__link nav-durchlauf" id="nav-abteilungsplan">
        <span class="sidebar__link-icon">${Icon('planer')}</span>
        <span class="sidebar__link-label">Abteilungsdurchlauf</span>
      </a>
```

(Einzige inhaltliche Änderung: `nav-jahresansicht-only` statt `nav-berichtsheft-only` bei Jahresansicht, plus der neue `beurteilungen`-Link. Wochenansicht/Fahrgelderstattung/Abteilungsdurchlauf unverändert.)

- [ ] **Step 2: `applyCapabilities` erweitern**

In `app/js/app.js`, Funktion `applyCapabilities` (Zeile 18-56): die Zeile für `.nav-durchlauf` (44-46) ersetzen und zwei neue Blöcke danach ergänzen:

```js
  document.querySelectorAll('.nav-durchlauf').forEach(el => {
    el.style.display = (caps.istAzubi || (caps.istAusbilder && !caps.istReinerPruefer)) ? '' : 'none';
  });
  document.querySelectorAll('.nav-jahresansicht-only').forEach(el => {
    el.style.display = ((caps.istAzubi || caps.korrektur) && !caps.istReinerPruefer) ? '' : 'none';
  });
  document.querySelectorAll('.nav-beurteilungen-only').forEach(el => {
    el.style.display = (caps.istAusbilder || caps.role === 'admin') ? '' : 'none';
  });
```

- [ ] **Step 3: `caps`-Objekt in `initLayout` um `istReinerPruefer` erweitern**

In `app/js/app.js`, `initLayout` (Zeile 183-190), ersetzen durch:

```js
  applyCapabilities({
    kannPlanen:   !!user.kannPlanen,
    istAusbilder: !!user.istAusbilder,
    istAzubi:     !!user.istAzubi,
    istDhStudent: !!user.istDhStudent,
    korrektur:    istKorrektor,
    istReinerPruefer: !!user.istReinerPruefer,
    role:         user.role,
  });
```

Und in `setupDevViewSwitch` (Zeile 83-91, derselbe Objekt-Shape für den Toggle-Handler) ebenfalls ergänzen:

```js
      const u = await DB.fetchCurrentUser();
      if (u) applyCapabilities({
        kannPlanen:   !!u.kannPlanen,
        istAusbilder: !!u.istAusbilder,
        istAzubi:     !!u.istAzubi,
        istDhStudent: !!u.istDhStudent,
        korrektur:    !!u.istAusbilder,
        istReinerPruefer: !!u.istReinerPruefer,
        role:         u.role,
      });
```

- [ ] **Step 4: Commit**

```bash
git add app/js/sidebar.js app/js/app.js
git commit -m "feat(nav): Beurteilungen-Reiter, Jahresansicht/Durchlauf für reine Prüfer ausblenden"
```

---

### Task 9: Serverseitige Dispatch-Guards + Hover-Feedback auf Durchlauf-Kacheln

**Files:**
- Modify: `app/js/abteilungs-planer.js:251-260`
- Modify: `app/js/jahresansicht.js:4-6`
- Modify: `app/css/abteilungs-planer.css:623-625`

**Interfaces:**
- Consumes: `user.istReinerPruefer` (Task 3).

Nav-Ausblenden (Task 8) verhindert nur den Link — ein reiner Prüfer, der `abteilungs-planer.html?mein=1` oder `jahresansicht.html` direkt aufruft, würde ohne diese Guards trotzdem die volle Ansicht sehen (beide dispatchen aktuell rein über `user.istAusbilder`, das für JEDEN Prüfer weiterhin `true` ist).

- [ ] **Step 1: Guard in `abteilungs-planer.js`**

Zeile 251-260 ersetzen durch:

```js
  if (!user.kannPlanen) {
    if (user.istAzubi) {
      await renderAzubiDurchlauf(user);       // read-only: eigener Abteilungsdurchlauf
    } else if (user.istReinerPruefer) {
      window.location.href = 'dashboard.html'; // Abteilungsdurchlauf ist für reine Prüfer komplett unsichtbar
    } else if (user.istAusbilder) {
      await renderAusbilderDurchlauf(user);   // read-only: Durchlauf der betreuten Azubis
    } else {
      window.location.href = 'dashboard.html';
    }
    return;
  }
```

- [ ] **Step 2: Guard in `jahresansicht.js`**

Zeile 4-6 ersetzen durch:

```js
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-jahresansicht', [{ label: 'Jahresansicht', href: 'jahresansicht.html' }]);
  if (!user) return;
  if (user.istReinerPruefer) { window.location.href = 'dashboard.html'; return; }
```

- [ ] **Step 3: Hover-Feedback für klickbare Durchlauf-Kacheln**

In `app/css/abteilungs-planer.css`, nach Zeile 623 (`.durchlauf-card__verantw { ... }`), einfügen:

```css
.durchlauf-card--clickable {
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}
.durchlauf-card--clickable:hover,
.durchlauf-card--clickable:focus-visible {
  border-color: var(--pm-yellow);
  box-shadow: 0 4px 14px rgba(0, 0, 0, .08);
  transform: translateY(-2px);
  outline: none;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/js/abteilungs-planer.js app/js/jahresansicht.js app/css/abteilungs-planer.css
git commit -m "fix(nav): Jahresansicht/Abteilungsdurchlauf für reine Prüfer serverseitig sperren + Kachel-Hover"
```

---

### Task 10: Dashboard „Meine Prüfzeiträume" für reine Prüfer

**Files:**
- Modify: `app/js/dashboard.js:20-25,52-56`

**Interfaces:**
- Consumes: `DB.getMeinePruefungen()` (Task 7), `user.istReinerPruefer` (Task 3).
- Produces: `renderReinerPrueferDashboard(user)` (neue Funktion).

- [ ] **Step 1: Dispatch erweitern**

In `app/js/dashboard.js`, Zeile 20-26 (der `try`-Block inkl. schließender `} catch (err) {`-Zeile) ersetzen:

```js
  try {
    if (user.istAzubi) {
      await renderAzubiDashboard(user);
    } else if (user.istReinerPruefer) {
      await renderReinerPrueferDashboard(user);
    } else {
      await renderAusbilderDashboard(user);
    }
  } catch (err) {
```

Und im `pageshow`-Handler (Zeile 52-56) analog:

```js
      if (user.istAzubi) {
        await renderAzubiDashboard(user);
      } else if (user.istReinerPruefer) {
        await renderReinerPrueferDashboard(user);
      } else {
        await renderAusbilderDashboard(user);
      }
```

- [ ] **Step 2: Neue Render-Funktion ergänzen**

Direkt VOR `/* ── Ausbilder-Cockpit ── */` (vor Zeile 534) einfügen:

```js
/* ── Reiner-Prüfer-Dashboard: befristete Zuweisungen statt "Meine Azubis" ── */
async function renderReinerPrueferDashboard(user) {
  const main = document.getElementById('mainContent');
  const pruefungen = await DB.getMeinePruefungen();
  const STATUS_LABEL = p => p.status === 'laeuft'
    ? 'Läuft'
    : `Nachlauf bis ${DateUtil.formatDate(p.nachlaufBis)}`;

  main.innerHTML = `
    <div class="welcome-banner welcome-banner--ausbilder">
      <div class="welcome-banner__content">
        <p class="welcome-banner__greeting">${getGreeting()}, ${firstName(user.name)} 👋</p>
        <h1 class="welcome-banner__title">Meine Prüfzeiträume</h1>
        <p class="welcome-banner__info">${pruefungen.length} ${pruefungen.length === 1 ? 'Zuweisung' : 'Zuweisungen'}</p>
      </div>
    </div>
    ${pruefungen.length ? `
      <div class="durchlauf-list">
        ${pruefungen.map(p => `
          <div class="durchlauf-card">
            <span class="badge ${p.status === 'laeuft' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
              ${STATUS_LABEL(p)}
            </span>
            <div class="durchlauf-card__abt">${escapeHtml(p.azubiName)}${p.abteilung ? ' · ' + escapeHtml(p.abteilung) : ''}</div>
            <div class="durchlauf-card__zeit">${DateUtil.formatDate(p.von)} – ${DateUtil.formatDate(p.bis)}</div>
            <div class="durchlauf-card__verantw">
              <a href="wochenansicht.html" class="dash-pruefung-link" data-goto-azubi="${escapeHtml(p.azubiOid)}">Wochenansicht öffnen</a>
              &nbsp;·&nbsp;
              <a href="beurteilungen.html">Beurteilung</a>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="durchlauf-empty">Aktuell keine aktive Zuweisung.</div>`}
  `;
  main.querySelectorAll('.dash-pruefung-link').forEach(a => {
    a.addEventListener('click', () => sessionStorage.setItem('gotoAzubiId', a.dataset.gotoAzubi));
  });
}

```

- [ ] **Step 3: Commit**

```bash
git add app/js/dashboard.js
git commit -m "feat(dashboard): eigene Ansicht 'Meine Prüfzeiträume' für reine Prüfer"
```

---

### Task 11: Wochenansicht — fenstergebundene Navigation für reine Prüfer

**Files:**
- Modify: `app/js/wochenansicht.js:245-265,384-404,511-527,765-768,2154-2161`

**Interfaces:**
- Consumes: `DB.getMeinePruefungen()` (Task 7), `user.istReinerPruefer` (Task 3).
- Produces: `pruefungsFenster` (Map<azubiOid, Fenster>, Modulzustand innerhalb des `DOMContentLoaded`-Closures).

- [ ] **Step 1: Azubi-/Fenster-Auswahl für reine Prüfer**

Nach Zeile 245 (`let viewAzubiId = user.istAzubi ? user.id : null;`) eine neue Variable einfügen:

```js
  // Reiner Prüfer: Map<azubiOid, {von,bis,azubiName,abteilung,status,nachlaufBis}>
  // der noch zugreifbaren Zuweisungen. Bestimmt sowohl die Azubi-Auswahl als
  // auch das navigierbare Wochenfenster (siehe render() und renderAzubiSelector unten).
  let pruefungsFenster = null;
```

Zeile 249-265 (Block `if (savedAzubiId && isAusbilder) { ... } else if (isAusbilder) { ... }`) ersetzen durch:

```js
  if (savedAzubiId && isAusbilder) {
    // Expliziter Sprung aus Jahresansicht/Dashboard hat Vorrang.
    viewAzubiId = savedAzubiId;
    sessionStorage.removeItem('gotoAzubiId');
  } else if (user.istReinerPruefer) {
    pruefungsFenster = new Map((await DB.getMeinePruefungen()).map(p => [String(p.azubiOid), p]));
    const persisted = getPersistedAzubiId();
    if (persisted && pruefungsFenster.has(String(persisted))) {
      viewAzubiId = persisted;
    } else {
      viewAzubiId = pruefungsFenster.size ? [...pruefungsFenster.keys()][0] : null;
    }
  } else if (isAusbilder) {
    // Zuletzt gewählten Azubi wiederherstellen (pro Gerät, s. get/setPersistedAzubiId
    // in app.js), damit die Auswahl über Reload und Navigation hinweg bleibt.
    // Fällt auf den ersten auswählbaren Azubi zurück, wenn nichts Gültiges
    // gespeichert ist (z. B. ein Azubi, für den keine Zuweisung mehr besteht).
    const selectable = await DB.getSelectableAzubis();
    const persisted = getPersistedAzubiId();
    if (persisted && selectable.some(a => String(a.id) === String(persisted))) {
      viewAzubiId = persisted;
    } else if (!viewAzubiId || !selectable.some(a => String(a.id) === String(viewAzubiId))) {
      viewAzubiId = selectable[0]?.id || viewAzubiId;
    }
  }

  // Reiner Prüfer: IMMER auf die erste Woche der Zuweisung springen (unabhängig
  // vom heutigen Datum oder einer per Notification mitgegebenen KW/Jahr) und die
  // Fenster-Map nachladen, falls sie oben noch nicht befüllt wurde (z. B. weil
  // savedAzubiId den Sprung ausgelöst hat).
  if (user.istReinerPruefer) {
    if (!pruefungsFenster) pruefungsFenster = new Map((await DB.getMeinePruefungen()).map(p => [String(p.azubiOid), p]));
    const fenster = viewAzubiId ? pruefungsFenster.get(String(viewAzubiId)) : null;
    if (fenster) {
      const vonDatum = new Date(fenster.von + 'T00:00:00');
      currentKW = DateUtil.getKW(vonDatum);
      currentYear = DateUtil.getKWYear(vonDatum);
    }
  }
```

- [ ] **Step 2: Navigationsgrenzen in `render()` berechnen**

Nach Zeile 404 (`sunday.setDate(monday.getDate() + 6);`) einfügen:

```js
    // Reiner Prüfer: Navigationsgrenzen aus dem geladenen Fenster (Von–Bis der
    // aktuellsten Zuweisung zu diesem Azubi). Fehlt ein Fenster (z. B. Zuweisung
    // inzwischen über die Nachlauffrist hinaus abgelaufen), bleibt die Navigation
    // gesperrt (beide Buttons disabled).
    const fenster = user.istReinerPruefer ? pruefungsFenster?.get(String(azubiId)) : null;
    const vonMonday = fenster
      ? DateUtil.getMondayOfKW(DateUtil.getKW(new Date(fenster.von + 'T00:00:00')), DateUtil.getKWYear(new Date(fenster.von + 'T00:00:00')))
      : null;
    const bisMonday = fenster
      ? DateUtil.getMondayOfKW(DateUtil.getKW(new Date(fenster.bis + 'T00:00:00')), DateUtil.getKWYear(new Date(fenster.bis + 'T00:00:00')))
      : null;
    const prevWeekDisabled = user.istReinerPruefer && (!fenster || monday <= vonMonday);
    const nextWeekDisabled = user.istReinerPruefer && (!fenster || monday >= bisMonday);
```

- [ ] **Step 3: Buttons im Template sperren / „Diese Woche" ausblenden**

Zeile 512-515 (NUR der `<button id="thisWeekBtn">`-Block selbst — die umschließenden `<div class="week-toolbar__right">` in Zeile 511 und `<div class="week-kw-block"...>` in Zeile 516 bleiben unverändert stehen) ersetzen durch:

```js
          ${user.istReinerPruefer ? '' : `
          <button class="btn btn-ghost week-today-btn${currentKW === todayKW && currentYear === todayYear ? ' is-hidden' : ''}" id="thisWeekBtn" type="button">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:15px;height:15px"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Diese Woche
          </button>
          `}
```

Zeile 517 und 524 (`prevWeekBtn`/`nextWeekBtn`) ergänzen um das `disabled`-Attribut:

```js
            <button class="week-kw-block__nav" id="prevWeekBtn" aria-label="Vorherige Woche"${prevWeekDisabled ? ' disabled' : ''}>
```
```js
            <button class="week-kw-block__nav" id="nextWeekBtn" aria-label="Nächste Woche"${nextWeekDisabled ? ' disabled' : ''}>
```

- [ ] **Step 4: `renderAzubiSelector` auf das Prüfer-Fenster umstellen**

Zeile 765-768 ersetzen durch:

```js
  async function renderAzubiSelector(currentId) {
    const azubis = user.istReinerPruefer
      ? [...(pruefungsFenster ? pruefungsFenster.values() : [])].map(p => ({ id: p.azubiOid, name: p.azubiName }))
      : await DB.getSelectableAzubis();
    return renderAzubiSelect(azubis, currentId);
  }
```

- [ ] **Step 5: Beim Azubi-Wechsel wieder auf die Von-Woche springen**

Zeile 2154-2161 (`azubiSelectEl`-Change-Handler) ersetzen durch:

```js
    const azubiSelectEl = document.getElementById('azubiSelect');
    if (azubiSelectEl) {
      azubiSelectEl.addEventListener('change', () => {
        viewAzubiId = azubiSelectEl.value;
        setPersistedAzubiId(viewAzubiId);
        if (user.istReinerPruefer) {
          const fenster = pruefungsFenster?.get(String(viewAzubiId));
          if (fenster) {
            const vonDatum = new Date(fenster.von + 'T00:00:00');
            currentKW = DateUtil.getKW(vonDatum);
            currentYear = DateUtil.getKWYear(vonDatum);
          }
        }
        render();
      });
    }
```

- [ ] **Step 6: Commit**

```bash
git add app/js/wochenansicht.js
git commit -m "feat(wochenansicht): fenstergebundene Navigation für reine Prüfer"
```

---

### Task 12: Neue Seite „Beurteilungen"

**Files:**
- Create: `app/beurteilungen.html`
- Create: `app/js/beurteilungen-liste.js`

**Interfaces:**
- Consumes: `DB.getMeineBeurteilungen()` (Task 7), `initPage` (`app/js/sidebar.js`), `escapeHtml`/`DateUtil` (global Helfer, wie in allen anderen Seiten verfügbar).

- [ ] **Step 1: HTML-Shell anlegen**

`app/beurteilungen.html` (Kopie der Struktur von `app/fahrgelderstattung.html`, Titel/Scripts angepasst):

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="preload" href="../Corporate Design/Fonts/librefranklin-bold.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="../Corporate Design/Fonts/librefranklin-light.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="../Corporate Design/Fonts/OpenSans-Variable.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="js/api.js" as="script">
  <link rel="preload" href="js/app.js" as="script">
  <title>Beurteilungen – Berichtsheft | Putzmeister</title>
  <script src="js/theme.js"></script>
  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/glass.css">
  <link rel="stylesheet" href="css/abteilungs-planer.css"> <!-- .durchlauf-card/-list/-empty -->
  <link rel="stylesheet" href="css/theme-hyperspace.css">
  <link rel="stylesheet" href="css/theme-cmd.css">
  <link rel="stylesheet" href="css/theme-candy.css">
  <link rel="stylesheet" href="css/theme-iceland.css">
  <link rel="stylesheet" href="css/theme-silk.css">
  <link rel="stylesheet" href="css/theme-halloween.css">
  <link rel="stylesheet" href="css/theme-christmas.css">
  <link rel="stylesheet" href="css/themes.css">
</head>
<body>
<div class="app-shell">
  <aside class="sidebar" id="sidebar"></aside>
  <div class="sidebar-overlay" id="sidebarOverlay"></div>
  <div class="main-wrapper">
    <header class="topbar" id="topbar"></header>
    <main class="main-content" id="mainContent"></main>
  </div>
</div>
<script src="js/abteilungen-helpers.js"></script>
<script src="js/api.js"></script>
<script src="js/error-reporter.js"></script>
<script src="js/icons.js"></script>
<script src="js/topbar-ds.js"></script>
<script src="js/app.js"></script>
<script src="js/sidebar.js"></script>
<script src="js/router.js"></script>
<script src="js/react-theme-layer.js"></script>
<script src="js/beurteilungen-liste.js"></script>
</body>
</html>
```

- [ ] **Step 2: JS ergänzen**

`app/js/beurteilungen-liste.js`:

```js
/* ===================================================================
   BEURTEILUNGEN-LISTE.JS
   Eigenständiger Reiter: flache Liste aller Zuweisungen, die der Nutzer
   beurteilen darf (Ausbilder/Prüfer/Admin/Developer — nicht Azubi).
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-beurteilungen', [{ label: 'Beurteilungen', href: 'beurteilungen.html' }]);
  if (!user) return;
  document.body.dataset.page = 'beurteilungen-liste';

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-header"><div class="page-header__left">
      <h1 class="page-title">Beurteilungen</h1>
    </div></div>
    <div id="beurtListWrap"></div>`;
  const wrap = document.getElementById('beurtListWrap');

  try {
    const liste = await DB.getMeineBeurteilungen();
    if (!liste.length) {
      wrap.innerHTML = `<div class="durchlauf-empty">Keine Beurteilungen vorhanden.</div>`;
      return;
    }
    wrap.innerHTML = `<div class="durchlauf-list">${liste.map(b => `
      <div class="durchlauf-card durchlauf-card--clickable" data-zuw="${b.zuweisungId}" role="button" tabindex="0">
        <span class="badge ${b.status === 'abgeschlossen' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
          ${b.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Offen'}
        </span>
        <div class="durchlauf-card__abt">${escapeHtml(b.azubiName)}${b.abteilung ? ' · ' + escapeHtml(b.abteilung) : ''}</div>
        <div class="durchlauf-card__zeit">${DateUtil.formatDate(b.von)} – ${DateUtil.formatDate(b.bis)}</div>
      </div>
    `).join('')}</div>`;

    wrap.querySelectorAll('.durchlauf-card--clickable').forEach(el => {
      const go = () => { window.location.href = `beurteilung.html?zuw=${el.dataset.zuw}`; };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  } catch (err) {
    wrap.innerHTML = `<div class="durchlauf-empty">Beurteilungen konnten nicht geladen werden.</div>`;
    if (window.Toast && typeof Toast.error === 'function') Toast.error('Fehler', 'Beurteilungen konnten nicht geladen werden.');
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add app/beurteilungen.html app/js/beurteilungen-liste.js
git commit -m "feat(beurteilungen): eigenständige Listen-Seite für den neuen Sidebar-Reiter"
```

---

### Task 13: End-to-End-Verifikation

**Files:** keine (nur manuelles Testen gegen die laufende Dev-Instanz)

- [ ] **Step 1: Backend-Tests komplett laufen lassen**

Run: `node --test backend/services/zugriff.test.js backend/middleware/auth.test.js backend/services/users.test.js`
Expected: PASS (alle Dateien, keine Regressionen in den unveränderten Tests)

- [ ] **Step 2: Testdaten für den Demo-Prüfer anlegen**

Der in dieser Session bereits angelegte Demo-Prüfer `test.pruefer.demo@putzmeister.com` (siehe `backend/db/seed-demo-users.sql`) braucht befristete Zuweisungen mit unterschiedlichen Zeitfenstern, um alle Spec-Szenarien durchzuspielen. Gegen die Dev-DB (`backend/.env`, Server `azrweurwebdev\SQLEXPRESS2024`, DB `Berichtsheft`) ausführen:

```bash
cd backend && node -e "
require('dotenv').config({path:'.env'});
const {getPool, sql}=require('./db/connection');
(async()=>{
  const p=await getPool();
  const azubi=(await p.request().query(\"SELECT TOP 1 Oid FROM dbo.Users WHERE Role='azubi' AND Email LIKE '%.demo@%'\")).recordset[0];
  if(!azubi){ console.error('Kein Demo-Azubi gefunden'); process.exit(1); }
  const heute = new Date();
  const vor3Wochen = new Date(heute); vor3Wochen.setDate(vor3Wochen.getDate() - 21);
  const vor7Wochen = new Date(heute); vor7Wochen.setDate(vor7Wochen.getDate() - 49);
  const iso = d => d.toISOString().slice(0,10);
  await p.request()
    .input('azubiOid', sql.NVarChar(36), azubi.Oid)
    .input('email', sql.NVarChar(255), 'test.pruefer.demo@putzmeister.com')
    .input('von', sql.Date, iso(vor3Wochen))
    .input('bis', sql.Date, iso(heute))
    .query(\"INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, Abteilung, Von, Bis) VALUES (@azubiOid, @email, 'IT', @von, @bis)\");
  console.log('Test-Zuweisung angelegt für Azubi', azubi.Oid);
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1);});
"
```

- [ ] **Step 3: Dev-Server starten und als Test-Prüfer einloggen**

```bash
cd backend && npm run dev
```

Im Browser `http://localhost:3000` öffnen, per Dev-Login (passwortlos) mit `test.pruefer.demo@putzmeister.com` anmelden.

- [ ] **Step 4: Alle Spec-Szenarien durchspielen**

Gegen `docs/superpowers/specs/2026-07-16-reiner-pruefer-sicht-design.md` (Abschnitt „Testfälle / Verifikation") prüfen:

1. Sidebar zeigt kein Jahresansicht-/Abteilungsdurchlauf-Menü; Dashboard zeigt „Meine Prüfzeiträume".
2. Wochenansicht startet auf der Von-Woche der Zuweisung; Zurück-Button vor Von deaktiviert, Vor-Button nach Bis deaktiviert.
3. Direkter Aufruf von `abteilungs-planer.html?mein=1` und `jahresansicht.html` per URL leitet auf `dashboard.html` um.
4. Beurteilungen-Reiter sichtbar, führt zur neuen Listen-Seite mit dem angelegten Azubi.
5. Abteilungsdurchlauf-Kacheln (mit einem Ausbilder-Demo-Konto eingeloggt) zeigen jetzt sichtbares Hover-Feedback.

- [ ] **Step 5: 6-Wochen-Nachlauf + Ablauf testen**

Die in Step 2 angelegte Zuweisung per SQL auf `Bis` = vor 45 Tagen ändern (`UPDATE dbo.Zuweisungen SET Bis = '<Datum>' WHERE VerantwEmail='test.pruefer.demo@putzmeister.com'`) und erneut in der App als Test-Prüfer prüfen: Dashboard zeigt „Nachlauf bis …"; anschließend `Bis` auf vor 50 Tagen setzen (über die Nachlauffrist hinaus) und bestätigen, dass der Azubi komplett aus Dashboard/Wochenansicht-Auswahl verschwindet.

- [ ] **Step 6: Aufräumen der Testdaten**

Die in Step 2/5 angelegte Test-Zuweisung wieder entfernen (sofern nicht ohnehin für weitere manuelle Tests gebraucht):

```bash
cd backend && node -e "
require('dotenv').config({path:'.env'});
const {getPool}=require('./db/connection');
(async()=>{
  const p=await getPool();
  await p.request().query(\"DELETE FROM dbo.Zuweisungen WHERE VerantwEmail='test.pruefer.demo@putzmeister.com'\");
  console.log('Test-Zuweisung entfernt.');
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1);});
"
```

Kein Commit in diesem Task (rein manuelle Verifikation).
