# Berechtigungs-Fundament (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das fähigkeits- und zuweisungsgetriebene Zugriffsmodell serverseitig einführen und durchsetzen — wer welches Berichtsheft sehen/korrigieren darf — und dabei die heutigen Backend-Sicherheitslücken schließen.

**Architecture:** Reine, unit-getestete Zugriffslogik (`backend/services/zugriff.js`) entscheidet anhand normalisierter Objekte (User/Woche/Zuweisung). Dünne DB-Adapter (`backend/services/zugriffContext.js`) laden die nötigen Daten. Die Routen (`wochen`, `kommentare`, `anhaenge`) rufen beides auf und setzen die Regeln durch. Statische Fähigkeiten (`kannPlanen`, `istAusbilder`) kommen aus einer Konfig-Allowlist und werden über `/api/auth/me` ausgespielt. Eine additive Migration `009` attribuiert Statuswechsel.

**Tech Stack:** Node.js/Express 5, `mssql`, `node:test` + `node:assert/strict` (kolozierte `*.test.js`, Ausführung via `node --test`), SQL Server (`dbo`-Schema).

**Bezug:** [Spec](../specs/2026-06-16-azubi-planer-zugriff-admin-umbau-design.md). Diese Phase deckt Spec-Schritt 1 ab. Phasen 2–5 (Frontend-Gating, Planer-UI, Dashboard, Admin-Entschlackung) erhalten eigene Pläne, sobald Phase 1 gelandet ist.

**Vorbedingung Datenbank:** Migration `009` (Task 1) muss vor dem manuellen Testen der Routen-Tasks (5–8) gegen die Dev-DB `Berichtsheft_Dev` ausgeführt sein, sonst fehlt die Spalte `KorrigiertVon`.

---

### Task 1: Migration 009 — Korrektur-Attribution

**Files:**
- Create: `db/migrations/009_korrektur_attribution.sql`

- [ ] **Step 1: Migrationsdatei anlegen**

`db/migrations/009_korrektur_attribution.sql`:

```sql
-- ============================================================
-- Migration 009 – Korrektur-Attribution auf Wochen-Ebene
-- Ausführen gegen: Berichtsheft_Dev
--
-- Hintergrund: Wer eine Woche genehmigt/abgelehnt hat, wurde bisher
-- nicht festgehalten. Für die zuweisungsgetriebene Zugriffsregel
-- "ein Verantwortlicher behält Lesezugriff auf die von ihm korrigierten
-- Wochen" brauchen wir diese Spur. Kommentare tragen UserOid bereits.
-- ============================================================

ALTER TABLE dbo.Wochen ADD
  KorrigiertVon NVARCHAR(36) NULL,
  KorrigiertAm  DATETIME2    NULL;
```

- [ ] **Step 2: Migration gegen die Dev-DB ausführen (manuell)**

Über das im Projekt übliche Verfahren (z. B. `sqlcmd`/SSMS) gegen `Berichtsheft_Dev` ausführen. Verifikation:

Run (Beispiel mit sqlcmd, falls verfügbar):
```bash
sqlcmd -S "$DB_SERVER" -d Berichtsheft_Dev -Q "SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Wochen') AND name IN ('KorrigiertVon','KorrigiertAm')"
```
Expected: zwei Zeilen `KorrigiertVon`, `KorrigiertAm`.

> Falls kein DB-Zugriff aus der Ausführungsumgebung besteht: als manuellen Checkpoint markieren und den/die Nutzer:in die Migration einspielen lassen, bevor die Routen-Tasks getestet werden.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/009_korrektur_attribution.sql
git commit -m "feat(db): Migration 009 – KorrigiertVon/KorrigiertAm auf Wochen"
```

---

### Task 2: Fähigkeits-Konfig & Anreicherung von req.user

**Files:**
- Create: `backend/config/berechtigungen.js`
- Modify: `backend/middleware/auth.js`
- Modify: `backend/server.js:44-59` (Login-Antworten um Flags ergänzen)

- [ ] **Step 1: Konfig-Allowlist anlegen**

`backend/config/berechtigungen.js`:

```js
'use strict';
/* =====================================================================
   STATISCHE FÄHIGKEITEN je Nutzer (OID-basiert), Brücke bis Azure-AD-Gruppen.
     kannPlanen   → Adminverwaltung (Berichtsheftverwaltung + Azubi-Planer)
     istAusbilder → dauerhafter Zugang zur Korrektur-Ansicht (kein Lockout)
   Der "Verantwortliche" wird NICHT hier gepflegt, sondern datengetrieben
   aus den Zuweisungen abgeleitet.
   ===================================================================== */

const BERECHTIGUNGEN = {
  // Admin Verwaltung (Personalabteilung): plant, korrigiert aber nicht
  '00000000-0000-0000-0000-000000000004': { kannPlanen: true,  istAusbilder: false },
  // Matthias Lengerer: Ausbilder UND plant
  '00000000-0000-0000-0000-000000000002': { kannPlanen: true,  istAusbilder: true  },
};

// Liefert immer ein vollständiges Flag-Objekt (Defaults false).
function faehigkeitenFuer(oid) {
  const b = BERECHTIGUNGEN[oid] || {};
  return { kannPlanen: !!b.kannPlanen, istAusbilder: !!b.istAusbilder };
}

module.exports = { BERECHTIGUNGEN, faehigkeitenFuer };
```

- [ ] **Step 2: devAuth reichert req.user mit Fähigkeiten an**

In `backend/middleware/auth.js` oben den Import ergänzen (nach Zeile 11/vor `const DEV_USERS`):

```js
const { faehigkeitenFuer } = require('../config/berechtigungen');
```

Und die Zuweisung von `req.user` (aktuell Zeile 35) ersetzen:

```js
  req.user = {
    oid,
    ...DEV_USERS[oid],
    ...faehigkeitenFuer(oid),
    istAzubi: DEV_USERS[oid].role === 'azubi',
  };
```

- [ ] **Step 3: Login-Antworten um Flags ergänzen**

In `backend/server.js` oben (bei den übrigen requires, ~Zeile 7) ergänzen:

```js
const { faehigkeitenFuer } = require('./config/berechtigungen');
```

`POST /api/auth/login` (Zeile 44-49) — Antwort-Zeile ersetzen:

```js
  res.json({ user: { oid, ...DEV_USERS[oid], ...faehigkeitenFuer(oid), istAzubi: DEV_USERS[oid].role === 'azubi' } });
```

`POST /api/auth/login-by-email` (Zeile 52-59) — Antwort-Zeile ersetzen:

```js
  res.json({ user: { oid, ...u, ...faehigkeitenFuer(oid), istAzubi: u.role === 'azubi' } });
```

`/api/auth/me` bleibt unverändert — es gibt `req.user` zurück, das devAuth bereits anreichert.

- [ ] **Step 4: Manuell verifizieren**

Run (Backend starten):
```bash
cd backend && node server.js
```
In zweitem Terminal:
```bash
curl -s -X POST localhost:3000/api/auth/login-by-email -H 'Content-Type: application/json' -d '{"email":"admin@putzmeister.com"}'
```
Expected: JSON enthält `"kannPlanen":true,"istAusbilder":false,"istAzubi":false`.
```bash
curl -s -X POST localhost:3000/api/auth/login-by-email -H 'Content-Type: application/json' -d '{"email":"florian.kuniss@putzmeister.com"}'
```
Expected: `"kannPlanen":false,"istAusbilder":false,"istAzubi":true`.

- [ ] **Step 5: Commit**

```bash
git add backend/config/berechtigungen.js backend/middleware/auth.js backend/server.js
git commit -m "feat(auth): kannPlanen/istAusbilder/istAzubi-Flags via Konfig-Allowlist"
```

---

### Task 3: Reine Zugriffslogik `zugriff.js` (TDD)

**Files:**
- Create: `backend/services/zugriff.js`
- Test: `backend/services/zugriff.test.js`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`backend/services/zugriff.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('./zugriff.js');

const user = { oid: 'U1' };
const azubi = { oid: 'AZ' };

// Hilfs-Builder
const zuw = (over = {}) => ({
  azubiOid: 'AZ', verantwortlicherOid: 'U1',
  von: '2026-06-01', bis: '2026-06-30', ...over,
});
const woche = (over = {}) => ({
  azubiOid: 'AZ', start: '2026-06-08', ende: '2026-06-14',
  korrigiertVon: null, kommentarAutoren: [], ...over,
});

// ── ymd ────────────────────────────────────────────────────────
test('ymd normalisiert Date und String auf YYYY-MM-DD', () => {
  assert.equal(Z.ymd(new Date('2026-06-15T12:00:00Z')), '2026-06-15');
  assert.equal(Z.ymd('2026-06-15'), '2026-06-15');
  assert.equal(Z.ymd('2026-06-15T00:00:00.000Z'), '2026-06-15');
  assert.equal(Z.ymd(null), null);
});

// ── istAktiv ───────────────────────────────────────────────────
test('istAktiv: Grenzen inklusive', () => {
  const z = zuw();
  assert.equal(Z.istAktiv(z, '2026-05-31'), false); // Tag vor von
  assert.equal(Z.istAktiv(z, '2026-06-01'), true);  // am von
  assert.equal(Z.istAktiv(z, '2026-06-15'), true);  // mittendrin
  assert.equal(Z.istAktiv(z, '2026-06-30'), true);  // am bis
  assert.equal(Z.istAktiv(z, '2026-07-01'), false); // Tag nach bis
});

// ── wocheFaelltInZuweisung ─────────────────────────────────────
test('wocheFaelltInZuweisung: Überschneidung inklusive Randwochen', () => {
  const z = zuw({ von: '2026-06-10', bis: '2026-06-20' });
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-01', ende: '2026-06-07' }), z), false); // davor
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-08', ende: '2026-06-14' }), z), true);  // ragt rein
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-15', ende: '2026-06-21' }), z), true);  // ragt raus
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-22', ende: '2026-06-28' }), z), false); // danach
});

// ── darfWocheKorrigieren ───────────────────────────────────────
test('darfWocheKorrigieren: aktiv + richtiger Azubi + Woche im Zeitraum', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), true);
});
test('darfWocheKorrigieren: falscher Verantwortlicher → false', () => {
  const kontext = { zuweisungen: [zuw({ verantwortlicherOid: 'X' })], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), false);
});
test('darfWocheKorrigieren: Zuweisung heute nicht aktiv → false', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-07-15' };
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), false);
});
test('darfWocheKorrigieren: Woche außerhalb des Zeitraums → false', () => {
  const kontext = { zuweisungen: [zuw({ von: '2026-06-01', bis: '2026-06-07' })], stichtag: '2026-06-05' };
  assert.equal(Z.darfWocheKorrigieren(user, woche({ start: '2026-06-15', ende: '2026-06-21' }), kontext), false);
});

// ── hatKorrigiert / darfWocheSehen ─────────────────────────────
test('hatKorrigiert: über KorrigiertVon oder Kommentar-Autor', () => {
  assert.equal(Z.hatKorrigiert(user, woche({ korrigiertVon: 'U1' })), true);
  assert.equal(Z.hatKorrigiert(user, woche({ kommentarAutoren: ['X', 'U1'] })), true);
  assert.equal(Z.hatKorrigiert(user, woche({ korrigiertVon: 'X', kommentarAutoren: ['Y'] })), false);
});
test('darfWocheSehen: eigenes Heft immer', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheSehen(azubi, woche(), kontext), true); // azubi.oid === woche.azubiOid
});
test('darfWocheSehen: aktiv verantwortlich', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheSehen(user, woche(), kontext), true);
});
test('darfWocheSehen: Korrektur-Historie read-only auch nach Ablauf', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' }; // keine aktive Zuweisung mehr
  assert.equal(Z.darfWocheSehen(user, woche({ korrigiertVon: 'U1' }), kontext), true);
});
test('darfWocheSehen: Lockout ohne Zuweisung/Historie → false', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' };
  assert.equal(Z.darfWocheSehen(user, woche(), kontext), false);
});

// ── aktivVerantwortlichFuer ────────────────────────────────────
test('aktivVerantwortlichFuer: nur aktive, dedupliziert', () => {
  const kontext = { stichtag: '2026-06-15', zuweisungen: [
    zuw({ azubiOid: 'AZ' }),
    zuw({ azubiOid: 'AZ2', von: '2026-01-01', bis: '2026-02-01' }), // abgelaufen
    zuw({ azubiOid: 'AZ' }), // Dublette
  ]};
  assert.deepEqual(Z.aktivVerantwortlichFuer(user, kontext).sort(), ['AZ']);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test backend/services/zugriff.test.js`
Expected: FAIL — `Cannot find module './zugriff.js'`.

- [ ] **Step 3: Minimal-Implementierung schreiben**

`backend/services/zugriff.js`:

```js
'use strict';
/* =====================================================================
   ZUGRIFFSLOGIK (rein, ohne DB/HTTP) — die eine Wahrheit, wer welches
   Berichtsheft sehen/korrigieren darf. Eingaben sind NORMALISIERTE
   Objekte (lowercase), entkoppelt vom DB-Schema:
     user      = { oid }
     woche     = { azubiOid, start, ende, korrigiertVon, kommentarAutoren[] }
     zuweisung = { azubiOid, verantwortlicherOid, von, bis }
     kontext   = { zuweisungen: [zuweisung], stichtag }   // stichtag 'YYYY-MM-DD'
   ===================================================================== */

// Date | 'YYYY-MM-DD' | ISO → 'YYYY-MM-DD' (lexikografisch vergleichbar). null bei leer.
function ymd(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Ist die Zuweisung am Stichtag aktiv (von ≤ stichtag ≤ bis, inklusive)?
function istAktiv(zuweisung, stichtag) {
  const t = ymd(stichtag), von = ymd(zuweisung.von), bis = ymd(zuweisung.bis);
  if (!t || !von || !bis) return false;
  return von <= t && t <= bis;
}

// Überschneidet die Woche [start,ende] den Zuweisungs-Zeitraum [von,bis]?
function wocheFaelltInZuweisung(woche, zuweisung) {
  const ws = ymd(woche.start), we = ymd(woche.ende);
  const von = ymd(zuweisung.von), bis = ymd(zuweisung.bis);
  if (!ws || !we || !von || !bis) return false;
  return ws <= bis && we >= von;
}

// Hat der Nutzer diese Woche je korrigiert (Statuswechsel ODER Kommentar)?
function hatKorrigiert(user, woche) {
  if (woche.korrigiertVon && woche.korrigiertVon === user.oid) return true;
  return Array.isArray(woche.kommentarAutoren) && woche.kommentarAutoren.includes(user.oid);
}

// Darf der Nutzer die Woche AKTIV korrigieren (schreiben)?
function darfWocheKorrigieren(user, woche, kontext) {
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    z.verantwortlicherOid === user.oid &&
    z.azubiOid === woche.azubiOid &&
    istAktiv(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}

// Darf der Nutzer die Woche SEHEN (eigenes Heft, aktiv verantwortlich, korrigiert)?
function darfWocheSehen(user, woche, kontext) {
  if (user.oid === woche.azubiOid) return true;
  if (darfWocheKorrigieren(user, woche, kontext)) return true;
  if (hatKorrigiert(user, woche)) return true;
  return false;
}

// Azubi-OIDs, für die der Nutzer am Stichtag aktiv verantwortlich ist.
function aktivVerantwortlichFuer(user, kontext) {
  const set = new Set();
  for (const z of ((kontext && kontext.zuweisungen) || [])) {
    if (z.verantwortlicherOid === user.oid && istAktiv(z, kontext.stichtag)) set.add(z.azubiOid);
  }
  return [...set];
}

module.exports = {
  ymd, istAktiv, wocheFaelltInZuweisung, hatKorrigiert,
  darfWocheKorrigieren, darfWocheSehen, aktivVerantwortlichFuer,
};
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `node --test backend/services/zugriff.test.js`
Expected: PASS — alle Tests grün (`# pass`, `# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add backend/services/zugriff.js backend/services/zugriff.test.js
git commit -m "feat(zugriff): reine, getestete Zugriffslogik (sehen/korrigieren)"
```

---

### Task 4: DB-Adapter `zugriffContext.js`

**Files:**
- Create: `backend/services/zugriffContext.js`

- [ ] **Step 1: Lader implementieren**

`backend/services/zugriffContext.js`:

```js
'use strict';
/* Unreine DB-Adapter für die Zugriffsprüfung: laden die normalisierten
   Eingaben, die backend/services/zugriff.js (rein) erwartet. */
const { sql } = require('../db/connection');

// Zuweisungen, in denen `userOid` Verantwortliche/r ist, + heutiger Stichtag.
async function ladeKorrekturKontext(pool, userOid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), userOid)
    .query('SELECT AzubiOid, AusbilderOid, Von, Bis FROM dbo.Zuweisungen WHERE AusbilderOid = @oid');
  const zuweisungen = r.recordset.map(z => ({
    azubiOid: z.AzubiOid,
    verantwortlicherOid: z.AusbilderOid,
    von: z.Von,
    bis: z.Bis,
  }));
  const stichtag = new Date().toISOString().slice(0, 10);
  return { zuweisungen, stichtag };
}

// Eine Woche normalisiert (inkl. Korrektur-Spuren) für die Zugriffsprüfung.
async function ladeWocheFuerZugriff(pool, wocheId) {
  const r = await pool.request()
    .input('id', sql.Int, wocheId)
    .query(`
      SELECT w.AzubiOid, w.StartDatum, w.EndDatum, w.Status, w.KorrigiertVon,
        (SELECT k.UserOid FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS autorenJson
      FROM dbo.Wochen w WHERE w.Id = @id
    `);
  const row = r.recordset[0];
  if (!row) return null;
  const autoren = row.autorenJson ? JSON.parse(row.autorenJson).map(a => a.UserOid) : [];
  return {
    id: Number(wocheId),
    azubiOid: row.AzubiOid,
    start: row.StartDatum,
    ende: row.EndDatum,
    status: row.Status,
    korrigiertVon: row.KorrigiertVon,
    kommentarAutoren: autoren,
  };
}

module.exports = { ladeKorrekturKontext, ladeWocheFuerZugriff };
```

- [ ] **Step 2: Lädt ohne Syntaxfehler (Smoke-Check)**

Run: `node -e "require('./backend/services/zugriffContext.js'); console.log('ok')"`
Expected: Ausgabe `ok` (keine Exception).

- [ ] **Step 3: Commit**

```bash
git add backend/services/zugriffContext.js
git commit -m "feat(zugriff): DB-Adapter für Korrektur-Kontext und Wochen-Laden"
```

---

### Task 5: GET /api/wochen serverseitig filtern

**Files:**
- Modify: `backend/routes/wochen.js:1-37` (Imports + GET-Handler), `:153-161` (Helfer)

- [ ] **Step 1: Imports + Normalisierungshelfer ergänzen**

In `backend/routes/wochen.js` direkt nach Zeile 2 (`const { getPool, sql } = ...`) ergänzen:

```js
const { darfWocheSehen } = require('../services/zugriff');
const { ladeKorrekturKontext } = require('../services/zugriffContext');
```

Und am Dateiende, vor `module.exports`, einen Helfer ergänzen (neben `parseWoche`):

```js
// parseWoche-Zeile → normalisierte Woche für die Zugriffsprüfung.
function normWoche(w) {
  return {
    azubiOid: w.AzubiOid,
    start: w.StartDatum,
    ende: w.EndDatum,
    korrigiertVon: w.KorrigiertVon,
    kommentarAutoren: (w.kommentare || []).map(k => k.UserOid),
  };
}
```

- [ ] **Step 2: GET-Handler ersetzen**

Den kompletten `router.get('/', ...)`-Handler (aktuell Zeile 5-37) ersetzen durch:

```js
// GET /api/wochen?azubiOid=...  – liefert nur Wochen, die der Nutzer sehen darf
router.get('/', async (req, res) => {
  try {
    const { azubiOid } = req.query;
    const user = req.user;
    const pool = await getPool();

    const request = pool.request();
    let whereClause = '';
    if (azubiOid) {
      request.input('azubiOid', sql.NVarChar(36), azubiOid);
      whereClause = 'WHERE w.AzubiOid = @azubiOid';
    }
    const wochen = await request.query(`
      SELECT w.*,
        (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
        (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
      FROM dbo.Wochen w
      ${whereClause}
      ORDER BY w.Jahr DESC, w.KW DESC
    `);
    const rows = wochen.recordset.map(parseWoche);

    // Zugriffsfilter: eigenes Heft, aktive Zuweisung (in-Periode) oder Korrektur-Historie.
    const kontext = await ladeKorrekturKontext(pool, user.oid);
    const sichtbar = rows.filter(w => darfWocheSehen(user, normWoche(w), kontext));
    res.json(sichtbar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Manuell verifizieren — Azubi sieht nur eigenes Heft**

Run (Backend läuft, `node server.js`):
```bash
# Als Azubi Florian Kuniß (oid ...0001) einloggen
curl -s -c /tmp/c1.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"oid":"00000000-0000-0000-0000-000000000001"}' >/dev/null
# Wochen OHNE azubiOid abrufen → früher ALLE, jetzt nur eigene
curl -s -b /tmp/c1.txt localhost:3000/api/wochen | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log('AzubiOids:',[...new Set(a.map(w=>w.AzubiOid))])})"
```
Expected: nur `00000000-0000-0000-0000-000000000001` (keine fremden AzubiOids). Vor dem Fix: mehrere OIDs.

- [ ] **Step 4: Manuell verifizieren — Verantwortliche/r sieht nur in-Periode + Historie**

Mit einer Test-Zuweisung (Verantwortlicher = ein eingeloggter Test-User, aktiver Zeitraum) prüfen, dass `GET /api/wochen?azubiOid=<zugewiesener Azubi>` nur Wochen liefert, die in den Zeitraum fallen, plus Wochen mit eigener Korrektur-Spur; außerhalb → leer. (Bei fehlenden Testdaten als manuellen Browser-Check in Phase-2-Verifikation vormerken.)

- [ ] **Step 5: Commit**

```bash
git add backend/routes/wochen.js
git commit -m "feat(wochen): GET serverseitig auf sichtbare Wochen filtern (schließt Lücke)"
```

---

### Task 6: PATCH /api/wochen/:id/status absichern + KorrigiertVon setzen

**Files:**
- Modify: `backend/routes/wochen.js:138-151`

- [ ] **Step 1: Imports anpassen**

In `backend/routes/wochen.js` die **beiden** Import-Zeilen aus Task 5 (Step 1) ersetzen durch:

```js
const { darfWocheSehen, darfWocheKorrigieren } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');
```

- [ ] **Step 2: PATCH-Handler ersetzen**

Den kompletten `router.patch('/:id/status', ...)`-Handler (Zeile 138-151) ersetzen durch:

```js
// PATCH /api/wochen/:id/status
// Azubi (eigenes Heft): 'offen'/'freigegeben'. Korrektor (aktiv verantwortlich):
// 'genehmigt'/'abgelehnt' → setzt KorrigiertVon/KorrigiertAm.
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, req.params.id);
    if (!woche) return res.status(404).json({ error: 'Woche nicht gefunden' });

    const user = req.user;
    const istEigenes = woche.azubiOid === user.oid;
    const kontext = await ladeKorrekturKontext(pool, user.oid);
    const istKorrektor = darfWocheKorrigieren(user, woche, kontext);

    const AZUBI_STATUS = ['offen', 'freigegeben'];
    const KORREKTOR_STATUS = ['genehmigt', 'abgelehnt'];

    let setzeKorrektur = false;
    if (istEigenes && AZUBI_STATUS.includes(status)) {
      // Azubi gibt eigenes Heft frei oder nimmt zurück – keine Attribution.
    } else if (istKorrektor && KORREKTOR_STATUS.includes(status)) {
      setzeKorrektur = true;
    } else {
      return res.status(403).json({ error: 'Keine Berechtigung, diesen Status zu setzen.' });
    }

    const request = pool.request()
      .input('id',     sql.Int,          req.params.id)
      .input('status', sql.NVarChar(20), status);
    let setClause = 'Status = @status';
    if (setzeKorrektur) {
      request.input('korrigiertVon', sql.NVarChar(36), user.oid);
      setClause += ', KorrigiertVon = @korrigiertVon, KorrigiertAm = SYSUTCDATETIME()';
    }
    await request.query(`UPDATE dbo.Wochen SET ${setClause} WHERE Id = @id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Manuell verifizieren — Fremder darf nicht genehmigen**

Run (Backend läuft):
```bash
# Als Azubi einloggen und versuchen, IRGENDEINE Woche zu 'genehmigt' zu setzen
curl -s -c /tmp/c1.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"oid":"00000000-0000-0000-0000-000000000001"}' >/dev/null
# Eigene Woche-ID des Azubis ermitteln:
curl -s -b /tmp/c1.txt localhost:3000/api/wochen | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log('erste WocheId:',a[0] && a[0].Id)})"
# Mit einer fremden/nicht zugewiesenen Woche-ID genehmigen versuchen (z.B. 999999):
curl -s -b /tmp/c1.txt -X PATCH localhost:3000/api/wochen/999999/status -H 'Content-Type: application/json' -d '{"status":"genehmigt"}'
```
Expected: `404` (Woche nicht gefunden) bzw. bei existierender fremder Woche `403` „Keine Berechtigung, diesen Status zu setzen." Azubi darf eigene Woche aber auf `freigegeben` setzen (separat testen → `{"ok":true}`).

- [ ] **Step 4: Commit**

```bash
git add backend/routes/wochen.js
git commit -m "feat(wochen): PATCH status autorisieren + KorrigiertVon/-Am attribuieren"
```

---

### Task 7: POST Kommentare absichern + typ-Allowlist

**Files:**
- Modify: `backend/routes/kommentare.js:1-25`

- [ ] **Step 1: Imports + Typ-Allowlist ergänzen**

In `backend/routes/kommentare.js` nach Zeile 2 ergänzen:

```js
const { darfWocheKorrigieren } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');

const ERLAUBTE_TYPEN = ['ausbilder', 'abgelehnt'];
```

- [ ] **Step 2: POST-Handler ersetzen**

Den `router.post('/:wocheId/kommentare', ...)`-Handler (Zeile 5-25) ersetzen durch:

```js
// POST /api/wochen/:wocheId/kommentare  (nur aktiv Verantwortliche/r)
router.post('/:wocheId/kommentare', async (req, res) => {
  try {
    const { text, typ, tagId } = req.body;
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, req.params.wocheId);
    if (!woche) return res.status(404).json({ error: 'Woche nicht gefunden' });

    const kontext = await ladeKorrekturKontext(pool, req.user.oid);
    if (!darfWocheKorrigieren(req.user, woche, kontext)) {
      return res.status(403).json({ error: 'Keine Berechtigung, diese Woche zu kommentieren.' });
    }

    const sichererTyp = ERLAUBTE_TYPEN.includes(typ) ? typ : 'ausbilder';
    const result = await pool.request()
      .input('wocheId', sql.Int,             req.params.wocheId)
      .input('userOid', sql.NVarChar(36),    req.user.oid)
      .input('text',    sql.NVarChar(sql.MAX), text)
      .input('datum',   sql.Date,            new Date().toISOString().split('T')[0])
      .input('typ',     sql.NVarChar(20),    sichererTyp)
      .input('tagId',   sql.Int,             tagId ?? null)
      .query(`
        INSERT INTO dbo.Kommentare (WocheId, UserOid, Text, Datum, Typ, TagId)
        OUTPUT inserted.Id
        VALUES (@wocheId, @userOid, @text, @datum, @typ, @tagId)
      `);
    res.json({ id: result.recordset[0].Id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Manuell verifizieren — Azubi darf fremde Woche nicht kommentieren**

Run (Backend läuft, als Azubi eingeloggt wie in Task 6):
```bash
curl -s -b /tmp/c1.txt -X POST localhost:3000/api/wochen/999999/kommentare -H 'Content-Type: application/json' -d '{"text":"Test"}'
```
Expected: `404` bzw. bei existierender fremder Woche `403` „Keine Berechtigung, diese Woche zu kommentieren."

- [ ] **Step 4: Commit**

```bash
git add backend/routes/kommentare.js
git commit -m "feat(kommentare): POST autorisieren + typ-Allowlist statt Body-Vertrauen"
```

---

### Task 8: Anhänge — pruefeBearbeitbar auf Zugriffslogik umstellen

**Files:**
- Modify: `backend/routes/anhaenge.js:1-3` (Imports), `:37-52` (pruefeBearbeitbar)

- [ ] **Step 1: Imports ergänzen**

In `backend/routes/anhaenge.js` nach Zeile 3 ergänzen:

```js
const { darfWocheKorrigieren } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');
```

- [ ] **Step 2: pruefeBearbeitbar ersetzen**

Die Funktion `pruefeBearbeitbar` (Zeile 39-52) ersetzen durch:

```js
// Prüft, ob der aktuelle User die Woche bearbeiten darf: Eigentümer (Azubi)
// ODER aktiv verantwortlich – UND Woche nicht schreibgeschützt.
async function pruefeBearbeitbar(pool, wocheId, user) {
  const woche = await ladeWocheFuerZugriff(pool, wocheId);
  if (!woche) return { status: 404, error: 'Woche nicht gefunden' };
  if (woche.status === 'freigegeben' || woche.status === 'genehmigt') {
    return { status: 403, error: 'Woche ist schreibgeschützt' };
  }
  if (woche.azubiOid === user.oid) return { ok: true };
  const kontext = await ladeKorrekturKontext(pool, user.oid);
  if (darfWocheKorrigieren(user, woche, kontext)) return { ok: true };
  return { status: 403, error: 'Keine Berechtigung für diese Woche' };
}
```

- [ ] **Step 3: Manuell verifizieren — kein `role==='admin'`-Schlupfloch mehr**

Run (Backend läuft): Upload/Delete eines Anhangs an einer fremden, nicht zugewiesenen Woche als nicht-verantwortlicher Nutzer → `403`. Eigentümer (Azubi) an eigener, nicht schreibgeschützter Woche → erlaubt. (Bei fehlenden Testdaten als Browser-Check in Phase 2 vormerken.)

- [ ] **Step 4: Commit**

```bash
git add backend/routes/anhaenge.js
git commit -m "feat(anhaenge): Bearbeitbarkeit über zugriff.js statt role==='admin'"
```

---

### Task 9: Zuweisungs-Schreibrouten auf `kannPlanen` beschränken

**Files:**
- Modify: `backend/routes/zuweisungen.js:30-63` (POST + DELETE)

- [ ] **Step 1: Gate-Helfer ergänzen**

In `backend/routes/zuweisungen.js` nach Zeile 2 ergänzen:

```js
// Nur Nutzer mit Planungsrecht dürfen Zuweisungen anlegen/löschen.
function nurPlaner(req, res, next) {
  if (!req.user || !req.user.kannPlanen) {
    return res.status(403).json({ error: 'Kein Planungsrecht.' });
  }
  next();
}
```

- [ ] **Step 2: Middleware auf POST und DELETE setzen**

Die Handler-Signaturen anpassen:

`router.post('/', ...)` (Zeile 31) → `router.post('/', nurPlaner, async (req, res) => {`
`router.delete('/:id', ...)` (Zeile 53) → `router.delete('/:id', nurPlaner, async (req, res) => {`

(GET bleibt offen — Lesen der Zuweisungen treibt u. a. die Zugriffsprüfung anderer Nutzer.)

- [ ] **Step 3: Manuell verifizieren**

Run (Backend läuft):
```bash
# Azubi (kein Planungsrecht) versucht, eine Zuweisung anzulegen
curl -s -c /tmp/c1.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"oid":"00000000-0000-0000-0000-000000000001"}' >/dev/null
curl -s -b /tmp/c1.txt -X POST localhost:3000/api/zuweisungen -H 'Content-Type: application/json' -d '{"azubiOid":"x","ausbilderOid":"y","von":"2026-01-01","bis":"2026-02-01"}'
```
Expected: `403` „Kein Planungsrecht."
```bash
# Personalabteilung (kannPlanen) darf
curl -s -c /tmp/c4.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"oid":"00000000-0000-0000-0000-000000000004"}' >/dev/null
curl -s -b /tmp/c4.txt -X POST localhost:3000/api/zuweisungen -H 'Content-Type: application/json' -d '{"azubiOid":"00000000-0000-0000-0000-000000000001","ausbilderOid":"00000000-0000-0000-0000-000000000002","abteilung":"Test","von":"2026-06-01","bis":"2026-06-30"}'
```
Expected: `{"id":<n>}`. (Test-Zuweisung danach via `DELETE /api/zuweisungen/<n>` aufräumen.)

- [ ] **Step 4: Commit**

```bash
git add backend/routes/zuweisungen.js
git commit -m "feat(zuweisungen): POST/DELETE nur mit Planungsrecht (kannPlanen)"
```

---

### Task 10: Gesamt-Verifikation Phase 1

**Files:** keine Änderung — nur Verifikation.

- [ ] **Step 1: Unit-Tests grün**

Run: `node --test backend/services/zugriff.test.js`
Expected: alle Tests PASS, `# fail 0`.

- [ ] **Step 2: Backend startet sauber**

Run: `cd backend && node server.js`
Expected: „Backend + Frontend laufen auf http://localhost:3000" ohne Stacktrace.

- [ ] **Step 3: Personas-Smoke-Test (curl)**

- Azubi (`...0001`): `GET /api/wochen` → nur eigene AzubiOid (Task 5/Step 3).
- Personalabteilung (`...0004`, `kannPlanen`, keine Zuweisung): `GET /api/wochen` → leeres Array (sieht keine fremden Hefte).
- Ausbilder (`...0002`): `GET /api/wochen` → nur Wochen aktiver Zuweisungs-Azubis + selbst korrigierte.

Run (Personalabteilung):
```bash
curl -s -c /tmp/c4.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"oid":"00000000-0000-0000-0000-000000000004"}' >/dev/null
curl -s -b /tmp/c4.txt localhost:3000/api/wochen
```
Expected: `[]` (sofern dieser User in keiner Zuweisung Verantwortlicher ist und keine Woche korrigiert hat).

- [ ] **Step 4: Abschluss-Notiz**

Phase 1 abgeschlossen: Fähigkeits-Flags fließen über `/api/auth/me`; alle Schreib-/Lesepfade für Wochen, Kommentare, Status und Anhänge sind serverseitig autorisiert; Korrektur wird attribuiert. Bereit für Phase 2 (Frontend-Gating + Korrektur-Eingrenzung), die gegen diesen realen Stand geplant wird.

---

## Nächste Phasen (separate Pläne, nach Phase 1)

- **Phase 2 – Frontend-Gating + Korrektur-Eingrenzung:** Menü/Seiten-Gating auf `kannPlanen`/`istAusbilder`/korrektur-berechtigt; Azubi-Selektor-Fix ([wochenansicht.js:440](../../../app/js/wochenansicht.js#L440)); Posteingang/Wochenansicht nach neuen Regeln filtern; Flags im Frontend cachen.
- **Phase 3 – Planer als Verantwortlichen-Tool:** Verantwortliche/r = alle Nicht-Azubi-Nutzer; Sticky-Gantt, Lücken-Markierung, Filter/Gruppierung, Dichte, Zeitnavigation.
- **Phase 4 – Komponierbares Dashboard:** Sektionen je Fähigkeit; Planer-Signalkarten (ohne Zuweisung / bald ablaufend / bald beginnend).
- **Phase 5 – Admin-Bereich entschlacken:** Korrektur aus dem reinen Planer-Kontext entfernen; Verwaltung = Berichtsheftverwaltung + Planer.
