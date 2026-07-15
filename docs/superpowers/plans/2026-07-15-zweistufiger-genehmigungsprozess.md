# Zweistufiger Genehmigungsprozess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der temporäre Prüfer (befristete Zuweisung) darf Berichte seines Zeitraums nur *erstgenehmigen*; der dauerhafte Ausbilder ist letzte Instanz und erteilt die *Endgenehmigung* (erst diese setzt `genehmigt`). Nach einer Ausbilder-Rückgabe geht die Neufassung direkt zurück zum Ausbilder (Prüfer übersprungen).

**Architecture:** Eine reine Übergangsfunktion `wochenAktionen(rolle, status, endabnahmeDirekt)` in `backend/services/zugriff.js` ist die einzige Wahrheit über erlaubte Statuswechsel. Der PATCH-Endpunkt validiert damit serverseitig; die Wochen-Endpunkte annotieren jede Woche mit `viewerRolle` + `erlaubteAktionen`, sodass Frontend (Wochenansicht + Dashboard-Posteingang) nur rendert statt Rechtelogik zu duplizieren. Ein neues BIT-Flag `EndabnahmeDirekt` auf `dbo.Wochen` löst die Mehrdeutigkeit von `freigegeben` (wartet auf Prüfer vs. wartet auf Ausbilder).

**Tech Stack:** Node.js/Express (CommonJS), mssql, Vanilla-JS-Frontend (kein Build), SQL-Server-Migrationen (manuell, idempotent). Tests der reinen Logik mit Node-eigenem `node:test` (keine neue Abhängigkeit).

## Global Constraints

- **Migrationen:** nummeriert in `db/migrations/NNN_*.sql`, **idempotent**, manuell gegen `Berichtsheft_Dev` ausgeführt (Muster: `IF EXISTS/IF NOT EXISTS` + `PRINT`). Nächste freie Nummer: **019**.
- **IDs sind GUID-Strings** (User/Azubi/Ausbilder-OID). Niemals `parseInt`. Nur `WocheId`/`Zuweisung.Id` sind Integer.
- **Statuswerte (kanonisch):** `offen`, `freigegeben`, `erstgenehmigt`, `genehmigt`, `abgelehnt`.
- **Rollen bzgl. einer Woche (Präzedenz):** `ausbilder` > `pruefer` > `azubi` > `null`.
- **Zugriffsprüfung bleibt serverseitig autoritativ:** Frontend-Flags sind nur UI; `PATCH /api/wochen/:id/status` validiert jeden Übergang neu.
- **Lokales Testen:** App + API immer über `http://localhost:3000` (Node serviert `app/` statisch). Dev-Server plain `node` ohne Auto-Reload → nach Backend-Änderung neu starten (`npm run dev` = `--watch`).
- **Deutschsprachige UI-Texte**, bestehender Code-Stil (kein Semikolon-/Format-Umbau fremder Zeilen).

---

### Task 1: Migration 019 – Schema für Erstgenehmigung

**Files:**
- Create: `db/migrations/019_erstgenehmigung.sql`

**Interfaces:**
- Produces: Spalte `dbo.Wochen.EndabnahmeDirekt BIT NOT NULL DEFAULT 0`; erweiterter `CK_Wochen_Status` inkl. `'erstgenehmigt'`; erweiterter `CK_Benachrichtigungen_Typ` inkl. `'erstgenehmigt'` (für Task 8).

- [ ] **Step 1: Migrationsdatei schreiben**

Create `db/migrations/019_erstgenehmigung.sql`:

```sql
-- ============================================================
-- Migration 019 – Zweistufiger Genehmigungsprozess
-- Ausführen gegen: Berichtsheft_Dev
--
-- 1) Neuer Zwischenstatus 'erstgenehmigt' (Prüfer hat erstgenehmigt,
--    wartet auf Endabnahme durch den dauerhaften Ausbilder).
-- 2) Routing-Flag EndabnahmeDirekt: 1 = Prüfer-Stufe übersprungen,
--    nur der Ausbilder darf noch handeln (nach Ausbilder-Rückgabe).
-- 3) Benachrichtigungstyp 'erstgenehmigt' (Hinweis an den Ausbilder,
--    dass ein Bericht auf die Endabnahme wartet).
-- Idempotent.
-- ============================================================

-- 1) Routing-Flag EndabnahmeDirekt
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Wochen') AND name = 'EndabnahmeDirekt')
BEGIN
  ALTER TABLE dbo.Wochen
    ADD EndabnahmeDirekt BIT NOT NULL
        CONSTRAINT DF_Wochen_EndabnahmeDirekt DEFAULT 0;
  PRINT 'Spalte dbo.Wochen.EndabnahmeDirekt angelegt.';
END
ELSE PRINT 'dbo.Wochen.EndabnahmeDirekt existiert bereits.';

-- 2) Status-CHECK-Constraint um 'erstgenehmigt' erweitern
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Wochen_Status'
             AND parent_object_id = OBJECT_ID('dbo.Wochen'))
BEGIN
  ALTER TABLE dbo.Wochen DROP CONSTRAINT CK_Wochen_Status;
  PRINT 'CK_Wochen_Status (alt) entfernt.';
END

ALTER TABLE dbo.Wochen ADD CONSTRAINT CK_Wochen_Status
  CHECK (Status IN ('offen', 'freigegeben', 'erstgenehmigt', 'genehmigt', 'abgelehnt'));
PRINT 'CK_Wochen_Status neu angelegt (inkl. erstgenehmigt).';

-- 3) Benachrichtigungstyp 'erstgenehmigt' erlauben (für Task 8)
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','erstgenehmigt','beurteilung_faellig','beurteilung_abgeschlossen'));
PRINT 'CK_Benachrichtigungen_Typ neu angelegt (inkl. erstgenehmigt).';
```

- [ ] **Step 2: Migration manuell gegen Berichtsheft_Dev ausführen**

Über SSMS / `sqlcmd` das Skript ausführen. Erwartete `PRINT`-Ausgaben ohne Fehler.

- [ ] **Step 3: Schema verifizieren**

Ausführen und Ergebnis prüfen:
```sql
SELECT name, is_nullable FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Wochen') AND name = 'EndabnahmeDirekt';
SELECT definition FROM sys.check_constraints WHERE name = 'CK_Wochen_Status';
```
Erwartet: Spalte `EndabnahmeDirekt` vorhanden; Constraint-Definition enthält `erstgenehmigt`.

- [ ] **Step 4: Idempotenz prüfen** – Skript ein zweites Mal ausführen. Erwartet: „…existiert bereits." / Constraints sauber neu angelegt, keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/019_erstgenehmigung.sql
git commit -m "feat(db): Migration 019 – Status erstgenehmigt + Flag EndabnahmeDirekt"
```

---

### Task 2: Reine Übergangslogik + Unit-Tests (TDD)

**Files:**
- Modify: `backend/services/zugriff.js`
- Create: `backend/services/zugriff.test.js`

**Interfaces:**
- Consumes: bestehende `istAktiv`, `wocheFaelltInZuweisung`, `istDauerAusbilder` aus derselben Datei.
- Produces:
  - `istPeriodenPruefer(user, woche, kontext) → boolean`
  - `rolleFuerWoche(user, woche, kontext) → 'ausbilder'|'pruefer'|'azubi'|null`
  - `wochenAktionen(rolle, status, endabnahmeDirekt) → Array<{ aktion, zielStatus, endabnahmeDirekt, korrektur }>`
    mit `aktion ∈ {'einreichen','zurueckziehen','erstgenehmigen','endgenehmigen','zurueckgeben'}`.

- [ ] **Step 1: Failing test schreiben**

Create `backend/services/zugriff.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  istPeriodenPruefer, rolleFuerWoche, wochenAktionen,
} = require('./zugriff');

const KONTEXT = {
  stichtag: '2026-07-15',
  dauerAusbilderAzubiOids: ['azubi-dauer'],
  zuweisungen: [{
    azubiOid: 'azubi-pruef', verantwortlicherEmail: 'pruefer@x.de',
    von: '2026-07-01', bis: '2026-07-31',
  }],
};
const wochePruef = { azubiOid: 'azubi-pruef', start: '2026-07-13', ende: '2026-07-19' };

test('istPeriodenPruefer: aktive Zuweisung in Periode', () => {
  assert.strictEqual(istPeriodenPruefer({ email: 'pruefer@x.de' }, wochePruef, KONTEXT), true);
});
test('istPeriodenPruefer: falsche E-Mail', () => {
  assert.strictEqual(istPeriodenPruefer({ email: 'wer@x.de' }, wochePruef, KONTEXT), false);
});
test('rolleFuerWoche: Ausbilder schlägt Prüfer', () => {
  const w = { azubiOid: 'azubi-dauer', start: '2026-07-13', ende: '2026-07-19' };
  assert.strictEqual(rolleFuerWoche({ oid: 'x', email: 'pruefer@x.de' }, w, KONTEXT), 'ausbilder');
});
test('rolleFuerWoche: nur Prüfer', () => {
  assert.strictEqual(rolleFuerWoche({ oid: 'x', email: 'pruefer@x.de' }, wochePruef, KONTEXT), 'pruefer');
});
test('rolleFuerWoche: Eigentümer = azubi', () => {
  const w = { azubiOid: 'ich', start: '2026-07-13', ende: '2026-07-19' };
  assert.strictEqual(rolleFuerWoche({ oid: 'ich', email: 'a@x.de' }, w, KONTEXT), 'azubi');
});
test('rolleFuerWoche: fremd = null', () => {
  const w = { azubiOid: 'fremd', start: '2026-07-13', ende: '2026-07-19' };
  assert.strictEqual(rolleFuerWoche({ oid: 'ich', email: 'a@x.de' }, w, KONTEXT), null);
});

function aktionenSet(rolle, status, flag) {
  return wochenAktionen(rolle, status, flag).map(a => `${a.aktion}:${a.zielStatus}:${a.endabnahmeDirekt}`).sort();
}

test('azubi offen → einreichen', () => {
  assert.deepStrictEqual(aktionenSet('azubi', 'offen', 0), ['einreichen:freigegeben:0']);
});
test('azubi abgelehnt behält Flag beim Einreichen', () => {
  assert.deepStrictEqual(aktionenSet('azubi', 'abgelehnt', 1), ['einreichen:freigegeben:1']);
});
test('azubi freigegeben → zurueckziehen', () => {
  assert.deepStrictEqual(aktionenSet('azubi', 'freigegeben', 0), ['zurueckziehen:offen:0']);
});
test('pruefer freigegeben Flag0 → erstgenehmigen + zurueckgeben', () => {
  assert.deepStrictEqual(aktionenSet('pruefer', 'freigegeben', 0),
    ['erstgenehmigen:erstgenehmigt:0', 'zurueckgeben:abgelehnt:0']);
});
test('pruefer freigegeben Flag1 → gesperrt', () => {
  assert.deepStrictEqual(aktionenSet('pruefer', 'freigegeben', 1), []);
});
test('pruefer erstgenehmigt → nichts', () => {
  assert.deepStrictEqual(aktionenSet('pruefer', 'erstgenehmigt', 0), []);
});
test('ausbilder freigegeben Flag0 → Bypass genehmigen + zurueckgeben(Flag1)', () => {
  assert.deepStrictEqual(aktionenSet('ausbilder', 'freigegeben', 0),
    ['endgenehmigen:genehmigt:0', 'zurueckgeben:abgelehnt:1']);
});
test('ausbilder erstgenehmigt → endgenehmigen + zurueckgeben(Flag1)', () => {
  assert.deepStrictEqual(aktionenSet('ausbilder', 'erstgenehmigt', 0),
    ['endgenehmigen:genehmigt:0', 'zurueckgeben:abgelehnt:1']);
});
test('ausbilder freigegeben Flag1 → endgenehmigen möglich', () => {
  assert.deepStrictEqual(aktionenSet('ausbilder', 'freigegeben', 1),
    ['endgenehmigen:genehmigt:0', 'zurueckgeben:abgelehnt:1']);
});
test('null-Rolle → nichts', () => {
  assert.deepStrictEqual(aktionenSet(null, 'freigegeben', 0), []);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test services/zugriff.test.js` (im Verzeichnis `backend/`)
Expected: FAIL – `istPeriodenPruefer`/`rolleFuerWoche`/`wochenAktionen` sind nicht exportiert (`TypeError: ... is not a function`).

- [ ] **Step 3: Implementierung in `backend/services/zugriff.js`**

`istPeriodenPruefer` **vor** `darfWocheKorrigieren` einfügen und `darfWocheKorrigieren` darauf umstellen (verhaltensgleich). Ersetze den Block `backend/services/zugriff.js:54-65`:

```js
// Periodengebundener Prüfer: befristete Zuweisung (per E-Mail), am Stichtag
// aktiv UND die Woche fällt in den Zuweisungszeitraum.
function istPeriodenPruefer(user, woche, kontext) {
  if (!woche.azubiOid || !user.email) return false;
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    (z.verantwortlicherEmail || '').toLowerCase() === (user.email || '').toLowerCase() &&
    z.azubiOid === woche.azubiOid &&
    istAktiv(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}

// Rolle des Nutzers bzgl. EINER Woche. Präzedenz: Ausbilder > Prüfer > Azubi.
function rolleFuerWoche(user, woche, kontext) {
  if (istDauerAusbilder(woche, kontext)) return 'ausbilder';
  if (istPeriodenPruefer(user, woche, kontext)) return 'pruefer';
  if (user && user.oid && woche.azubiOid && user.oid === woche.azubiOid) return 'azubi';
  return null;
}

// Darf der Nutzer die Woche AKTIV korrigieren (schreiben)? (Lese-/Zugriffsgate.)
function darfWocheKorrigieren(user, woche, kontext) {
  if (!woche.azubiOid) return false;
  if (istDauerAusbilder(woche, kontext)) return true; // dauerhaft: keine Datums-/Wochenprüfung
  return istPeriodenPruefer(user, woche, kontext);
}

// Zweistufiger Genehmigungs-Automat: erlaubte Aktionen für (rolle, status, flag).
// endabnahmeDirekt=1 ⇒ Prüfer-Stufe übersprungen (nur Ausbilder handelt noch).
// Jede Aktion trägt ihren Ziel-Status, das Flag DANACH und ob es eine
// Korrektur (KorrigiertVon/Am stempeln) ist.
function wochenAktionen(rolle, status, endabnahmeDirekt) {
  const flag = endabnahmeDirekt ? 1 : 0;
  const out = [];
  if (rolle === 'azubi') {
    if (status === 'offen' || status === 'abgelehnt')
      out.push({ aktion: 'einreichen', zielStatus: 'freigegeben', endabnahmeDirekt: flag, korrektur: false });
    if (status === 'freigegeben')
      out.push({ aktion: 'zurueckziehen', zielStatus: 'offen', endabnahmeDirekt: flag, korrektur: false });
  } else if (rolle === 'pruefer') {
    if (status === 'freigegeben' && flag === 0) {
      out.push({ aktion: 'erstgenehmigen', zielStatus: 'erstgenehmigt', endabnahmeDirekt: 0, korrektur: true });
      out.push({ aktion: 'zurueckgeben',   zielStatus: 'abgelehnt',     endabnahmeDirekt: 0, korrektur: true });
    }
  } else if (rolle === 'ausbilder') {
    if (status === 'freigegeben' || status === 'erstgenehmigt') {
      out.push({ aktion: 'endgenehmigen', zielStatus: 'genehmigt', endabnahmeDirekt: 0, korrektur: true });
      out.push({ aktion: 'zurueckgeben',  zielStatus: 'abgelehnt', endabnahmeDirekt: 1, korrektur: true });
    }
  }
  return out;
}
```

Im `module.exports` (Ende der Datei) ergänzen: `istPeriodenPruefer, rolleFuerWoche, wochenAktionen`.

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `node --test services/zugriff.test.js`
Expected: PASS – alle Tests grün (`# pass 16`).

- [ ] **Step 5: Commit**

```bash
git add backend/services/zugriff.js backend/services/zugriff.test.js
git commit -m "feat(zugriff): reine Uebergangslogik wochenAktionen + rolleFuerWoche (+Tests)"
```

---

### Task 3: PATCH-Status-Endpunkt auf den Automaten umstellen

**Files:**
- Modify: `backend/routes/wochen.js:166-205` (Handler)
- Modify: `backend/services/zugriffContext.js:32-52` (`ladeWocheFuerZugriff` um `endabnahmeDirekt` erweitern)

**Interfaces:**
- Consumes: `rolleFuerWoche`, `wochenAktionen` aus Task 2; `woche.status`, `woche.endabnahmeDirekt` aus `ladeWocheFuerZugriff`.
- Produces: `PATCH /api/wochen/:id/status` validiert (rolle, status, ziel) und setzt `Status`, `EndabnahmeDirekt`, optional `KorrigiertVon/Am`.

- [ ] **Step 1: `ladeWocheFuerZugriff` um das Flag erweitern**

In `backend/services/zugriffContext.js` im SELECT (`ladeWocheFuerZugriff`, Zeile 36) `w.EndabnahmeDirekt` ergänzen und im Rückgabeobjekt durchreichen:

```js
      SELECT w.AzubiOid, w.StartDatum, w.EndDatum, w.Status, w.KorrigiertVon, w.EndabnahmeDirekt,
        (SELECT k.UserOid FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS autorenJson
      FROM dbo.Wochen w WHERE w.Id = @id
```
und im `return { ... }`:
```js
    status: row.Status,
    endabnahmeDirekt: row.EndabnahmeDirekt ? 1 : 0,
    korrigiertVon: row.KorrigiertVon,
```

- [ ] **Step 2: Handler ersetzen**

`backend/routes/wochen.js` – Import (Zeile 3) um die neuen Funktionen ergänzen:
```js
const { darfWocheSehen, darfWocheKorrigieren, rolleFuerWoche, wochenAktionen } = require('../services/zugriff');
```
Den Rumpf von `router.patch('/:id/status', ...)` (Zeilen 173-199, ab `const user = req.user;` bis vor `res.json({ ok: true });`) ersetzen durch:

```js
    const user = req.user;
    const kontext = await ladeKorrekturKontext(pool, user);
    const rolle = rolleFuerWoche(user, woche, kontext);
    const treffer = wochenAktionen(rolle, woche.status, woche.endabnahmeDirekt)
      .find(a => a.zielStatus === status);
    if (!treffer) {
      return res.status(403).json({ error: 'Keine Berechtigung, diesen Status zu setzen.' });
    }

    const request = pool.request()
      .input('id',     sql.Int,          req.params.id)
      .input('status', sql.NVarChar(20), status)
      .input('flag',   sql.Bit,          treffer.endabnahmeDirekt);
    let setClause = 'Status = @status, EndabnahmeDirekt = @flag';
    if (treffer.korrektur) {
      request.input('korrigiertVon', sql.NVarChar(36), user.oid);
      setClause += ', KorrigiertVon = @korrigiertVon, KorrigiertAm = SYSUTCDATETIME()';
    }
    await request.query(`UPDATE dbo.Wochen SET ${setClause} WHERE Id = @id`);
    res.json({ ok: true });
```

Den Kommentarblock über der Route (Zeilen 163-165) anpassen:
```js
// PATCH /api/wochen/:id/status
// Übergang wird über rolleFuerWoche + wochenAktionen (services/zugriff.js)
// validiert. Prüfer: freigegeben→erstgenehmigt|abgelehnt. Ausbilder:
// freigegeben|erstgenehmigt→genehmigt|abgelehnt (Rückgabe setzt EndabnahmeDirekt=1).
// Azubi: offen↔freigegeben. Korrektur-Aktionen stempeln KorrigiertVon/Am.
```

- [ ] **Step 3: Dev-Server neu starten**

Run: `npm run dev` (im `backend/`), oder laufenden `node`-Prozess auf :3000 neu starten.
Expected: Start ohne Fehler.

- [ ] **Step 4: Manuell verifizieren (Happy-Path zweistufig)**

Über `http://localhost:3000` mit Demo-Konten (Azubi mit aktiver Prüfer-Zuweisung):
1. Als Azubi eine Woche freigeben → Status `freigegeben`.
2. Als Prüfer erstgenehmigen (via UI in Task 5, oder direkt per PATCH-Test):
   `curl -X PATCH .../api/wochen/<id>/status -d '{"status":"erstgenehmigt"}'` als Prüfer → `{ok:true}`, DB-Status `erstgenehmigt`, `EndabnahmeDirekt=0`.
3. Prüfer versucht `genehmigt` → **403** (Prüfer darf nicht final genehmigen).
4. Als Ausbilder `genehmigt` auf die `erstgenehmigt`-Woche → `{ok:true}`, Status `genehmigt`.

DB-Kontrolle: `SELECT Status, EndabnahmeDirekt, KorrigiertVon FROM dbo.Wochen WHERE Id=<id>;`

- [ ] **Step 5: Manuell verifizieren (Ausbilder-Rückgabe überspringt Prüfer)**

1. Frische freigegebene Woche → Ausbilder `abgelehnt` → DB: `Status='abgelehnt'`, `EndabnahmeDirekt=1`.
2. Azubi `freigegeben` (neu einreichen) → `EndabnahmeDirekt` bleibt `1`.
3. Prüfer versucht `erstgenehmigt` → **403** (Flag 1 sperrt Prüfer).
4. Ausbilder `genehmigt` → OK, Status `genehmigt`.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/wochen.js backend/services/zugriffContext.js
git commit -m "feat(wochen): Status-Endpunkt ueber zweistufigen Automaten validieren"
```

---

### Task 4: Wochen-Payload annotieren + Frontend-Normalisierung

**Files:**
- Modify: `backend/routes/wochen.js` (GET `/` und GET `/:id`)
- Modify: `app/js/api.js:111-133` (`normalizeWoche`)

**Interfaces:**
- Consumes: `rolleFuerWoche`, `wochenAktionen` (Task 2); parseWoche-Rohzeile (PascalCase-Spalten inkl. `Status`, `EndabnahmeDirekt`).
- Produces: jede Woche im JSON hat `viewerRolle: 'azubi'|'pruefer'|'ausbilder'|null` und `erlaubteAktionen: string[]`; Frontend-Wochenobjekt hat zusätzlich `endabnahmeDirekt`, `viewerRolle`, `erlaubteAktionen`.

- [ ] **Step 1: Annotations-Helfer + Einbau in GET `/`**

In `backend/routes/wochen.js` eine kleine Helferfunktion ergänzen (z.B. direkt vor `parseWoche`, Zeile 207):

```js
// Reichert eine parseWoche-Zeile mit der Betrachter-Sicht an:
// viewerRolle + erlaubteAktionen (Aktions-Slugs) für das aktuelle Frontend.
function annotiereWoche(row, user, kontext) {
  const rolle = rolleFuerWoche(user, normWoche(row), kontext);
  row.viewerRolle = rolle;
  row.erlaubteAktionen = wochenAktionen(rolle, row.Status, row.EndabnahmeDirekt).map(a => a.aktion);
  return row;
}
```

In GET `/` (Zeilen 31-33) das Ergebnis annotieren:
```js
    const kontext = await ladeKorrekturKontext(pool, user);
    const sichtbar = rows
      .filter(w => darfWocheSehen(user, normWoche(w), kontext))
      .map(w => annotiereWoche(w, user, kontext));
    res.json(sichtbar);
```

- [ ] **Step 2: GET `/:id` annotieren**

In GET `/:id` (nach der `darfWocheSehen`-Prüfung, vor `res.json(woche)`, Zeile 60):
```js
    annotiereWoche(woche, req.user, kontext);
    res.json(woche);
```

- [ ] **Step 3: `normalizeWoche` erweitern**

In `app/js/api.js` innerhalb `normalizeWoche` (nach `status: w.Status,`, Zeile 119) ergänzen:
```js
    endabnahmeDirekt: !!w.EndabnahmeDirekt,
    viewerRolle: w.viewerRolle ?? null,
    erlaubteAktionen: Array.isArray(w.erlaubteAktionen) ? w.erlaubteAktionen : [],
```

- [ ] **Step 4: Dev-Server neu starten & verifizieren**

Run: Backend neu starten. Dann als Prüfer eingeloggt:
`curl .../api/wochen?azubiOid=<azubi> -H 'Cookie: ...'`
Expected: freigegebene Woche des Prüf-Zeitraums enthält `"viewerRolle":"pruefer"` und `"erlaubteAktionen":["erstgenehmigen","zurueckgeben"]`. Als Ausbilder: `"viewerRolle":"ausbilder"`, `["endgenehmigen","zurueckgeben"]`.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/wochen.js app/js/api.js
git commit -m "feat(wochen): Payload mit viewerRolle + erlaubteAktionen annotieren"
```

---

### Task 5: Wochenansicht – Buttons, Ziel-Status, Banner, Readonly

**Files:**
- Modify: `app/js/wochenansicht.js` (Zeilen 406-414 Flags; 478-482 Buttons; 977-994 Banner; 2192-2197 Öffnen; 2256-2272 Bestätigen)

**Interfaces:**
- Consumes: `woche.erlaubteAktionen`, `woche.viewerRolle` (Task 4); `DB.setWocheStatus` (unverändert).
- Produces: Prüfer sieht **Erstgenehmigen**/**Zurückgeben**, Ausbilder **Genehmigen**/**Zurückgeben**; neues `erstgenehmigt`-Banner; korrekter Ziel-Status je Rolle.

- [ ] **Step 1: Sichtbarkeits-Flags umstellen**

`app/js/wochenansicht.js:406-414` ersetzen:
```js
    const aktionen = (woche && woche.erlaubteAktionen) || [];
    const canErstgenehmigen = aktionen.includes('erstgenehmigen');
    const canEndgenehmigen  = aktionen.includes('endgenehmigen');
    const canApprove = canErstgenehmigen || canEndgenehmigen;
    const canReject  = aktionen.includes('zurueckgeben');
    const isReadonly = (isAusbilder && !viewingSelf())
      || (woche && (woche.status === 'freigegeben' || woche.status === 'erstgenehmigt' || woche.status === 'genehmigt'));
    // Freigabe-Button: Woche bearbeitbar (nicht angelegt / offen / nach Rückgabe).
    const canRelease = user.istAzubi
      && (!woche || woche.status === 'offen' || woche.status === 'abgelehnt');
    const canWithdraw = user.istAzubi && woche?.status === 'freigegeben';
```

- [ ] **Step 2: Buttons rendern (Label je Rolle, getrennte Reject-Sichtbarkeit)**

`app/js/wochenansicht.js:478-482` ersetzen:
```js
          ${canApprove ? `
            <button class="btn btn-success btn-lg" id="approveBtn">${canErstgenehmigen ? 'Erstgenehmigen' : 'Genehmigen'}</button>
          ` : ''}
          ${canReject ? `
            <button class="btn btn-danger" id="rejectBtn">Zurückgeben</button>
          ` : ''}
          ${!canRelease && !canApprove && !canReject && woche ? `<span class="badge badge--${woche.status}">${getStatusLabel(woche.status)}</span>` : ''}
```

- [ ] **Step 3: `erstgenehmigt`-Banner ergänzen**

In `renderStatusBanner` (nach dem `genehmigt`-Block, vor dem `freigegeben`-Block, ~Zeile 976) einfügen:
```js
    if (woche.status === 'erstgenehmigt') {
      const isAzubi = currentUser.istAzubi;
      return `
        <div class="week-status-banner week-status-banner--erstgenehmigt">
          <div class="week-status-banner__icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="week-status-banner__body">
            <div class="week-status-banner__title">Erstgenehmigt – wartet auf Endabnahme</div>
            <p class="week-status-banner__text">
              ${isAzubi
                ? `Ein Prüfer hat diese Woche erstgenehmigt. Die endgültige Genehmigung erfolgt durch deine Ausbilder/in.`
                : `Vom Prüfer erstgenehmigt. Bitte als Endabnahme über <strong>Genehmigen</strong> oder <strong>Zurückgeben</strong> entscheiden.`}
            </p>
          </div>
        </div>
      `;
    }
```

- [ ] **Step 4: Approve-Modal-Text + Ziel-Status setzen**

`approveBtn`-Handler (`app/js/wochenansicht.js:2192-2194`) so ändern, dass Modal-Text zur Rolle passt:
```js
    document.getElementById('approveBtn')?.addEventListener('click', () => {
      const erst = (currentWoche?.erlaubteAktionen || []).includes('erstgenehmigen');
      document.querySelector('#approveModal .modal__title').textContent = erst ? 'Woche erstgenehmigen' : 'Woche genehmigen';
      document.getElementById('approveConfirmBtn').textContent = erst ? 'Erstgenehmigen' : 'Genehmigen';
      Modal.open('approveModal');
    });
```

`approveConfirmBtn`-Handler (`app/js/wochenansicht.js:2256-2272`) ersetzen – Ziel-Status je Rolle, passende Toast:
```js
    document.getElementById('approveConfirmBtn')?.addEventListener('click', async () => {
      const woche = currentWoche;
      if (!woche) return;
      const erst = (woche.erlaubteAktionen || []).includes('erstgenehmigen');
      const target = erst ? 'erstgenehmigt' : 'genehmigt';
      await DB.setWocheStatus(woche.id, target);
      if (!erst) {
        await DB.addBenachrichtigung({
          userId: woche.azubiId, type: 'genehmigt', wocheId: woche.id,
          azubiId: woche.azubiId, kw: woche.kw, year: woche.year, fromUserId: user.id,
        });
      }
      Modal.closeAll();
      if (erst) Toast.success('Erstgenehmigt', `KW ${currentKW} wurde erstgenehmigt und zur Endabnahme weitergeleitet.`);
      else      Toast.success('Genehmigt', `KW ${currentKW} wurde genehmigt.`);
      render();
    });
```
(Der `rejectConfirmBtn`-Handler bleibt unverändert – `DB.setWocheStatus(woche.id,'abgelehnt')` funktioniert für Prüfer wie Ausbilder; der Backend-Automat setzt das Flag korrekt.)

- [ ] **Step 5: Manuell verifizieren**

Backend läuft; Browser `http://localhost:3000` (**Strg+F5** – SPA lädt JS/CSS erst nach Hard-Reload):
1. Als Prüfer eine `freigegeben`-Woche öffnen → Button **Erstgenehmigen** + **Zurückgeben**. Erstgenehmigen → Banner „Erstgenehmigt – wartet auf Endabnahme".
2. Als Ausbilder dieselbe Woche → Button **Genehmigen** + **Zurückgeben**. Genehmigen → Banner „genehmigt".
3. Als Azubi die `erstgenehmigt`-Woche → schreibgeschützt, Banner mit Azubi-Text, kein Bearbeiten-Button.

- [ ] **Step 6: Commit**

```bash
git add app/js/wochenansicht.js
git commit -m "feat(wochenansicht): Erst-/Endgenehmigung – Buttons, Banner, Ziel-Status"
```

---

### Task 6: Status-Label + CSS für `erstgenehmigt`

**Files:**
- Modify: `app/js/app.js:528-536` (`getStatusLabel`)
- Modify: `app/css/variables.css` (Status-Farbvariablen, light + dark)
- Modify: `app/css/components.css` (`.badge--erstgenehmigt`, dark-Override)
- Modify: `app/css/wochenansicht.css` (`.week-status-banner--erstgenehmigt`)

**Interfaces:**
- Consumes: bestehende `--status-*`-Variablen und `.week-status-banner--*`-Muster.
- Produces: sichtbares Label „Erstgenehmigt" + eigenes Farbschema (Violett), das über CSS-Variablen auch in Custom-Themes fällt (Fallback auf `:root`).

- [ ] **Step 1: `getStatusLabel` erweitern**

`app/js/app.js:529-534` – Map-Eintrag ergänzen:
```js
  const map = {
    offen: 'Offen',
    freigegeben: 'Freigegeben',
    erstgenehmigt: 'Erstgenehmigt',
    genehmigt: 'Genehmigt',
    abgelehnt: 'Abgelehnt',
  };
```

- [ ] **Step 2: Status-Farbvariablen (Violett) in `variables.css`**

Im `:root`-Block direkt nach `--status-genehmigt-bg: #E8F5EB;` (Zeile 76):
```css
  --status-erstgenehmigt:    #6D28D9;
  --status-erstgenehmigt-bg: #EDE6FB;
```
Im Dark-Block direkt nach `--status-genehmigt-bg: rgba(67, 168, 86, 0.18);` (Zeile 229):
```css
  --status-erstgenehmigt-bg: rgba(124, 58, 237, 0.22);
```

- [ ] **Step 3: Badge in `components.css`**

Nach `.badge--genehmigt` (Zeile 305):
```css
.badge--erstgenehmigt { background: var(--status-erstgenehmigt-bg); color: var(--status-erstgenehmigt); }
```
Im Dark-Block nach `[data-theme="dark"] .badge--genehmigt` (Zeile 1066):
```css
[data-theme="dark"] .badge--erstgenehmigt { color: #B794F6; }
```

- [ ] **Step 4: Banner in `wochenansicht.css`**

Bestehende `.week-status-banner--genehmigt`-Regel als Vorlage suchen und eine analoge `--erstgenehmigt`-Variante mit den neuen Variablen ergänzen (gleiche Struktur, `border-color`/`--sig` auf `var(--status-erstgenehmigt)`, Hintergrund `var(--status-erstgenehmigt-bg)`).

Run vorab zum Auffinden der exakten Vorlage:
`grep -n "week-status-banner--genehmigt" app/css/wochenansicht.css`
und die gefundene Regel 1:1 nach `--erstgenehmigt` kopieren mit den `erstgenehmigt`-Variablen.

- [ ] **Step 5: Manuell verifizieren**

Hard-Reload. `erstgenehmigt`-Woche als Azubi → violettes Banner; Badge `Erstgenehmigt` violett im Light- und Dark-Theme (Theme umschalten).

- [ ] **Step 6: Commit**

```bash
git add app/js/app.js app/css/variables.css app/css/components.css app/css/wochenansicht.css
git commit -m "feat(ui): Statuslabel + Farbschema fuer erstgenehmigt (light/dark)"
```

---

### Task 7: Dashboard-Posteingang & Statistiken

**Files:**
- Modify: `app/js/dashboard.js` (Zeilen 96, 132, 211-214, 546-547, 560; Approve-Ziel in 1152 und 1146-1161)

**Interfaces:**
- Consumes: `woche.erlaubteAktionen`, `woche.viewerRolle`, `woche.status` (Task 4).
- Produces: Posteingang zeigt genau die Wochen, auf die der Betrachter reagieren kann (freigegeben *und* erstgenehmigt); Genehmigen setzt je Rolle den richtigen Ziel-Status; Azubi-Wochenübersicht behandelt `erstgenehmigt` wie „abgegeben".

- [ ] **Step 1: Posteingangs-Queue über `erlaubteAktionen` bilden**

`app/js/dashboard.js:546-548` ersetzen:
```js
  const queue = allWochen
    .filter(w => (w.erlaubteAktionen || []).some(a => a === 'erstgenehmigen' || a === 'endgenehmigen'))
    .sort((a, b) => (a.year - b.year) || (a.kw - b.kw));
```

- [ ] **Step 2: `zuPruefen`-Zähler über `erlaubteAktionen`**

`app/js/dashboard.js:560` ersetzen:
```js
      zuPruefen: wochen.filter(w => (w.erlaubteAktionen || []).some(a => a === 'erstgenehmigen' || a === 'endgenehmigen')).length,
```

- [ ] **Step 3: Einzel- & Bulk-Genehmigen mit rollenrichtigem Ziel-Status**

Bulk-Approve (`app/js/dashboard.js:1150-1157`) – Ziel je Woche bestimmen:
```js
    for (const wocheId of ids) {
      const w = queueById.get(wocheId);
      const erst = (w?.erlaubteAktionen || []).includes('erstgenehmigen');
      await DB.setWocheStatus(wocheId, erst ? 'erstgenehmigt' : 'genehmigt');
      if (w && !erst) await DB.addBenachrichtigung({
        userId: w.azubiId, type: 'genehmigt',
        wocheId, azubiId: w.azubiId, kw: w.kw, year: w.year,
        fromUserId: currentUser.id,
      });
    }
```
(Falls es einen Einzel-Genehmigen-Pfad außerhalb des Bulk gibt, der `setWocheStatus(id,'genehmigt')` ruft, analog auf `erst`-Prüfung umstellen. Vorab prüfen: `grep -n "setWocheStatus" app/js/dashboard.js`.)

- [ ] **Step 4: Azubi-Wochenübersicht: `erstgenehmigt` einbeziehen**

- `weekState` (Zeile 96): `if (w.status === 'freigegeben' || w.status === 'erstgenehmigt' || w.status === 'genehmigt') return 'abgegeben';`
- `wkcardKind` (nach Zeile 132): `if (w.status === 'erstgenehmigt') return 'fr';`
- Tagesraster (Zeile 212): nach dem `freigegeben`-Zweig ergänzen:
  `else if (woche.status === 'erstgenehmigt') { kind = 'fr'; lbl = 'Erstgenehmigt'; }`

- [ ] **Step 5: Manuell verifizieren**

Hard-Reload, als Ausbilder mit Prüfer-Kollegen-Szenario:
1. Posteingang enthält eine vom Prüfer erstgenehmigte Woche (Status `erstgenehmigt`) → Ausbilder kann sie dort genehmigen → `genehmigt`.
2. Als Prüfer: Posteingang enthält `freigegeben`-Wochen des Zeitraums; Bulk-Genehmigen setzt sie auf `erstgenehmigt` (nicht `genehmigt`), keine 403 in der Netzwerkkonsole.
3. Als Azubi: Dashboard-Wochenchip einer `erstgenehmigt`-Woche zeigt „Abgegeben" (nicht „Entwurf").

- [ ] **Step 6: Commit**

```bash
git add app/js/dashboard.js
git commit -m "feat(dashboard): Posteingang/Statistik fuer zweistufige Genehmigung"
```

---

### Task 8: Benachrichtigung an den Ausbilder bei Erstgenehmigung (optional)

**Files:**
- Modify: `backend/routes/wochen.js` (im PATCH-Handler, nach erfolgreichem Update)

**Interfaces:**
- Consumes: `treffer.zielStatus === 'erstgenehmigt'`; `dbo.AusbilderAzubis` (AzubiOid→AusbilderOid); `CK_Benachrichtigungen_Typ` inkl. `'erstgenehmigt'` (Task 1).
- Produces: bei Übergang nach `erstgenehmigt` erhält jeder dauerhafte Ausbilder des Azubis eine Benachrichtigung (Typ `erstgenehmigt`).

- [ ] **Step 1: Notification-Insert nach dem Update ergänzen**

Im PATCH-Handler (`backend/routes/wochen.js`), unmittelbar nach `await request.query(...)` und vor `res.json({ ok: true });`:
```js
    if (treffer.zielStatus === 'erstgenehmigt') {
      // Dauerhafte Ausbilder des Azubis über anstehende Endabnahme informieren.
      const rd = await pool.request()
        .input('azubiOid', sql.NVarChar(36), woche.azubiOid)
        .query('SELECT AusbilderOid FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid');
      for (const r of rd.recordset) {
        await pool.request()
          .input('userOid',     sql.NVarChar(36), r.AusbilderOid)
          .input('typ',         sql.NVarChar(20), 'erstgenehmigt')
          .input('wocheId',     sql.Int,          req.params.id)
          .input('fromUserOid', sql.NVarChar(36), user.oid)
          .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
                  VALUES (@userOid, @typ, @wocheId, @fromUserOid)`);
      }
    }
```

- [ ] **Step 2: Frontend-Benachrichtigungstext ergänzen**

Vorab prüfen, wo Benachrichtigungstypen zu Texten gemappt werden:
`grep -rn "'genehmigt'" app/js/*.js | grep -i benachrichtig` bzw. die Render-Stelle der Glocken-Liste. Dort einen Fall `erstgenehmigt` → z.B. „Ein Bericht wurde erstgenehmigt und wartet auf deine Endabnahme." ergänzen. Falls der Renderer bei unbekanntem Typ neutral fällt, ist dies rein kosmetisch.

- [ ] **Step 3: Manuell verifizieren**

Prüfer erstgenehmigt eine Woche → als Ausbilder einloggen → Glocke zeigt neue Benachrichtigung mit Verweis auf die Woche. Keine CHECK-Constraint-Fehler im Backend-Log.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/wochen.js app/js
git commit -m "feat(benachrichtigungen): Ausbilder-Hinweis bei Erstgenehmigung"
```

---

## Self-Review

**Spec-Abdeckung:**
- Prüfer nur Erstgenehmigung → Task 2 (`wochenAktionen` pruefer-Zweig) + Task 3 (403 bei `genehmigt`). ✔
- Ausbilder Endabnahme setzt `genehmigt` → Task 2/3. ✔
- Ausbilder-Rückgabe überspringt Prüfer (Flag) → Task 1 (Spalte) + Task 2 (Flag-Lebenszyklus) + Task 3 (Verifikation Step 5). ✔
- Ausbilder-Bypass → Task 2 (`ausbilder`+`freigegeben`→`genehmigt`). ✔
- Prüfer darf zurückgeben; Prüfer-Rückgabe → erneut Prüfer → Task 2 (Flag bleibt 0). ✔
- Statusname „Erstgenehmigt" → Task 5/6. ✔
- Kein Prüfer im Zeitraum → einstufig (rolle=`ausbilder`, `freigegeben`→`genehmigt`). ✔
- UI Prüfer/Ausbilder-Buttons + Banner + Payload-Annotation → Task 4/5. ✔
- Zweite Genehmigungsfläche (Dashboard-Posteingang) → Task 7 (im Spec-Frontend-Abschnitt nicht genannt, aber zwingend, da der Backend-Automat den Prüfer sonst mit 403 blockiert). ✔
- Ausbilder-Benachrichtigung bei Erstgenehmigung → Task 8. ✔

**Placeholder-Scan:** Keine TBD/TODO. Task 6 Step 4 verweist auf eine per `grep` zu findende Vorlagenregel (CSS-Datei groß, exakte Zeile variiert) – bewusst als Suchbefehl statt geratener Zeilennummer. Task 7 Step 3 und Task 8 Step 2 enthalten je einen `grep`-Vorabcheck für optionale Zusatzpfade.

**Typkonsistenz:** `wochenAktionen`/`rolleFuerWoche`/`istPeriodenPruefer` einheitlich benannt und exportiert (Task 2), konsumiert in Task 3/4. Feldnamen `viewerRolle`/`erlaubteAktionen`/`endabnahmeDirekt` durchgängig (Backend-Annotation → `normalizeWoche` → Wochenansicht/Dashboard). Aktions-Slugs (`erstgenehmigen`/`endgenehmigen`/`zurueckgeben`/`einreichen`/`zurueckziehen`) identisch in Kern, Payload und Frontend. ✔
