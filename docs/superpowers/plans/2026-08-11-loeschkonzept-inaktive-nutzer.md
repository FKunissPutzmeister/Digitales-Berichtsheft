# Löschkonzept für inaktive Nutzer — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein nächtlicher Retention-Job löscht jedes Konto 365 Tage nach seiner Deaktivierung endgültig — eigene Daten hart, Handlungen an fremden Ausbildungsnachweisen anonymisiert bis auf den Namen.

**Architecture:** Ein Service `backend/services/retention.js` im Muster von `berichtsheftBackup.js`: reine Entscheidungslogik (Fristen, Fälligkeit) und Datenkonstanten (Phasenlisten) getrennt von I/O, alle Abhängigkeiten injizierbar. Drei Migrationen (030 Stichtagsspalten, 031 Namensspalten an Belegen, 032 Mitteilungstyp). Selbst-nachplanender `setTimeout` in `server.js` auf 03:00. Vor dem Löschen denormalisiert der Job den Namen der Person in die Belegzeilen, die sie in fremden Heften hinterlassen hat.

**Tech Stack:** Node.js (CommonJS), Express 5, `mssql` 12 gegen SQL Server, `node:test` + `node:assert/strict` für Unit-Tests, Vanilla-JS-Frontend ohne Build-Schritt.

**Spec:** [docs/superpowers/specs/2026-08-11-loeschkonzept-inaktive-nutzer-design.md](../specs/2026-08-11-loeschkonzept-inaktive-nutzer-design.md)

> **Nachtrag (2026-08-13, nach dem Abschluss-Review).** Dieser Plan ist ab hier
> ein historisches Dokument: er beschreibt, was gebaut werden *sollte*. Drei
> Dinge weichen im Endstand bewusst ab, und die Snippets unten benutzen noch die
> alten Namen:
>
> - `BEKANNTE_TABELLEN` heißt jetzt `BEKANNTE_SPALTEN`, `pruefeUnbekannteTabellen`
>   heißt `pruefeUnbekannteSpalten`. Die Selbstprüfung vergleicht
>   `Tabelle.Spalte`-Paare statt nur Tabellennamen — der Tabellenvergleich war
>   blind für eine neue personenbezogene Spalte auf einer bereits bekannten
>   Tabelle, und genau so ist `Vertretungen.ErstelltVon` durch zwölf Reviews
>   gekommen. **Ein aus diesem Plan kopiertes `R.pruefeUnbekannteTabellen()`
>   wirft heute einen `TypeError`.**
> - Phase B setzt `Zuweisungen.VerantwEmail` auf `NULL`, nicht auf `''`.
> - Migration **033** kam hinzu: `Kommentare.UserOid` und
>   `Anhaenge.HochgeladenVon` waren `NOT NULL`, wodurch Phase B mit Fehler 515
>   die gesamte Löschtransaktion zurückgerollt hätte — für genau die
>   Personengruppe, für die das Drei-Phasen-Modell gebaut wurde.
>
> Verbindlich sind der Code, [README.md](../../../README.md),
> [docs/funktionsweise.md](../../funktionsweise.md) und die
> [Abnahme-Checkliste](2026-08-11-loeschkonzept-abnahme-checkliste.md).

## Global Constraints

- **Frist:** `LOESCHFRIST_TAGE = 365`, `VORWARN_TAGE = 30` — als Konstanten im Modul, **keine** `.env`-Variable. Testbarkeit läuft über injizierte Parameter `jetzt` / `fristTage` / `vorwarnTage`.
- **Migrationen** liegen in `db/migrations/NNN_name.sql`, sind **idempotent** (`IF COL_LENGTH(...) IS NULL`, `IF OBJECT_ID(...) IS NULL`), werden **manuell** ausgeführt: `node backend/db/run-sql.js db/migrations/NNN_name.sql` (aus dem Repo-Root).
- **`run-sql.js` führt EINE Batch aus, kein `GO`.** Eine in derselben Datei neu angelegte Spalte darf **nicht** direkt danach in normalem SQL referenziert werden (Parser kennt sie noch nicht → „Invalid column name"). Für Backfills `EXEC('...')` verwenden — Präzedenz: [008:23](../../../db/migrations/008_tagdauer_statt_stunden.sql#L23), [010:52](../../../db/migrations/010_zuweisungen_verantwemail.sql#L52).
- **IDs sind GUID-Strings** (`NVARCHAR(36)`), niemals `parseInt`. Nur `WocheId`, `TagId`, `ZuweisungId`, `Beurteilungen.Id`, `Anhaenge.Id`, `Kommentare.Id` sind Integer.
- **Demo-Konten nie löschen:** Ausnahme über `Email NOT LIKE '%.demo@%'` — exakt dasselbe Muster wie [users.js:231-233](../../../backend/services/users.js#L231-L233).
- **Personennamen** werden immer erst am Anzeigeort über `displayName()` zu „Vorname Nachname" gedreht; in der DB steht „Nachname, Vorname". Neue Namensspalten speichern die **DB-Form** (roh), nicht die Anzeigeform.
- **Tests laufen ohne Datenbank.** `node --test backend/services/<datei>.test.js` aus dem Repo-Root. DB-Zugriffe werden über einen Fake-Pool oder injizierte Funktionen ersetzt — Muster: [vertretungen.test.js:14-39](../../../backend/services/vertretungen.test.js#L14-L39).
- **`node -e` findet `dotenv`/`mssql` NICHT.** Das Repo-Root hat ein `node_modules`, darin liegt nur Playwright; die Backend-Pakete stecken in `backend/node_modules`. `node backend/db/run-sql.js …` funktioniert (die Skriptdatei liegt in `backend/db/`, die Auflösung läuft von dort nach oben), ein `node -e` mit cwd = Repo-Root scheitert an `Cannot find module 'dotenv'`. Für DB-Abfragen deshalb **immer** eine Skriptdatei in den Scratchpad schreiben, absolute Requires verwenden und mit `NODE_PATH` starten:
  ```bash
  # datei: <scratchpad>/pruefung.js
  #   const REPO = 'C:/Dev/Digitales-Berichtsheft';
  #   require('dotenv').config({ path: REPO + '/backend/.env' });
  #   const { getPool } = require(REPO + '/backend/db/connection');
  NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/pruefung.js
  ```
  Zusätzlich: **verschachtelte Anführungszeichen über PowerShell vermeiden** — PowerShell zerlegt `node -e "… \"…\" …"` zu Syntaxfehlern. Solche Aufrufe über das Bash-Werkzeug ausführen.
- **`git add` nur mit expliziten Pfaden.** Im Arbeitsbaum liegt unbeteiligte WIP (`app/css/dashboard.css`, `app/css/theme-silk.css`, `tools/check-dashboard-viewports.mjs`, `tools/_diag-*.mjs`). Niemals `git add -A` oder `git add .` — jeder Commit nennt seine Dateien einzeln, so wie in den Task-Schritten angegeben.
- **Der Timer wird erst in Task 11 scharfgeschaltet.** Bis dahin existiert der Job, läuft aber nie automatisch — kein halbfertiger Löschjob darf gegen die Dev-Datenbank laufen.
- **Commit-Sprache:** deutsche Commit-Messages ohne Umlaute (Repo-Konvention), Präfixe `feat:` / `fix:` / `docs:`.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `db/migrations/030_users_loeschkonzept.sql` (neu) | `Users.InaktivSeit`, `Users.LoeschsperreBis` + Backfill |
| `db/migrations/031_belege_namensspalten.sql` (neu) | `Wochen.KorrigiertVonName`, `Kommentare.AutorName`, `Zuweisungen.VerantwName` |
| `db/migrations/032_benachrichtigungen_loeschtyp.sql` (neu) | `CK_Benachrichtigungen_Typ` um `loeschung_geplant` erweitern |
| `backend/services/retention.js` (neu) | Fristenlogik, Phasenlisten, Löschtransaktion, Datei-Aufräumung, Orchestrierung |
| `backend/services/retention.test.js` (neu) | Unit-Tests dazu, ohne DB |
| `backend/services/users.js` | Stichtag stempeln (`setUsersAktiv`, `updateUserProfile`), Sperrfeld in der Patch-Whitelist, neue Felder in `buildReqUser` |
| `backend/routes/wochen.js` | `KorrigiertVonName` beim Statuswechsel mitschreiben |
| `backend/routes/kommentare.js` | `AutorName` beim Anlegen mitschreiben |
| `backend/routes/zuweisungen.js` | `VerantwName` beim Anlegen mitschreiben |
| `backend/server.js` | Nächtlicher Timer |
| `app/js/api.js` | Neue Felder in `normalizeWoche`, `normalizeKommentar`, `normalizeZuweisung` |
| `app/js/wochenansicht.js` | Gespeicherter Name hat Vorrang (Banner, Kommentar, Rückweisungsgrund) |
| `app/js/berichtsheft-export.js` | Gespeicherter Name hat Vorrang (PDF-Gegenzeichnung) |
| `app/js/nutzerverwaltung.js` | Löschdatum anzeigen, Sperrfeld pflegen |
| `app/js/dashboard.js`, `app/js/mitteilungen.js` | Neuen Mitteilungstyp in **beide** Kataloge |

---

### Task 1: Migration 030 — Stichtag- und Sperrspalte auf `dbo.Users`

**Files:**
- Create: `db/migrations/030_users_loeschkonzept.sql`

**Interfaces:**
- Consumes: nichts.
- Produces: Spalten `dbo.Users.InaktivSeit DATETIME2 NULL` und `dbo.Users.LoeschsperreBis DATE NULL`. Alle Folge-Tasks setzen sie voraus.

- [ ] **Step 1: Migration schreiben**

Create `db/migrations/030_users_loeschkonzept.sql`:

```sql
-- ============================================================
-- Migration 030 – Löschkonzept: Stichtag und Sperre auf dbo.Users
-- Ausführen gegen: Berichtsheft_Dev
--
-- InaktivSeit ist der Stichtag der Löschfrist (365 Tage). Er wird beim
-- Übergang aktiv -> inaktiv gesetzt und beim Reaktivieren geleert; siehe
-- setUsersAktiv/updateUserProfile in backend/services/users.js.
-- Bewusst NICHT AktualisiertAm verwenden: die Spalte wird von jedem
-- Entra-Sync-Lauf und jeder manuellen Änderung angefasst.
--
-- LoeschsperreBis hält einen Einzelfall zurück (Prüfungsanfechtung,
-- Rechtsstreit). Die Sperre GREIFT, solange LoeschsperreBis >= heute.
-- Sie startet die Frist nicht neu.
--
-- Backfill: heute inaktive Konten bekommen einen FRISCHEN Stichtag, also
-- ein volles Jahr ab Migration. Ein aus AktualisiertAm abgeleiteter Wert
-- könnte zu alt sein und direkt nach dem Deployment löschen.
--
-- Der Backfill läuft über EXEC(), weil run-sql.js die Datei als EINE Batch
-- ausführt (kein GO): eine in derselben Batch neu angelegte Spalte ist dem
-- Parser noch unbekannt und ein direktes UPDATE scheiterte an
-- "Invalid column name 'InaktivSeit'". Muster wie Migration 008/010.
--
-- Idempotent (IF-Guards), no-op auf einer bereits migrierten DB.
-- ============================================================

IF COL_LENGTH('dbo.Users', 'InaktivSeit') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD InaktivSeit DATETIME2 NULL;
  PRINT 'Spalte dbo.Users.InaktivSeit angelegt.';
END
ELSE PRINT 'dbo.Users.InaktivSeit existiert bereits.';

IF COL_LENGTH('dbo.Users', 'LoeschsperreBis') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD LoeschsperreBis DATE NULL;
  PRINT 'Spalte dbo.Users.LoeschsperreBis angelegt.';
END
ELSE PRINT 'dbo.Users.LoeschsperreBis existiert bereits.';

-- Backfill der Bestandsdaten (siehe Kopfkommentar zu EXEC).
EXEC('
  UPDATE dbo.Users
     SET InaktivSeit = SYSUTCDATETIME()
   WHERE Aktiv = 0 AND InaktivSeit IS NULL;
');
PRINT 'Backfill InaktivSeit fuer bereits inaktive Konten ausgefuehrt.';

-- Der Retention-Job filtert auf Aktiv = 0 + InaktivSeit; ohne Index ein
-- Full Scan pro Nacht. Bei wenigen hundert Zeilen unkritisch, aber billig.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_Users_InaktivSeit' AND object_id = OBJECT_ID('dbo.Users'))
BEGIN
  CREATE INDEX IX_Users_InaktivSeit ON dbo.Users(Aktiv, InaktivSeit);
  PRINT 'Index IX_Users_InaktivSeit angelegt.';
END
ELSE PRINT 'Index IX_Users_InaktivSeit existiert bereits.';
```

- [ ] **Step 2: Migration ausführen**

Run (aus dem Repo-Root):

```bash
node backend/db/run-sql.js db/migrations/030_users_loeschkonzept.sql
```

Expected: Ausgabe enthält `Spalte dbo.Users.InaktivSeit angelegt.`, `Spalte dbo.Users.LoeschsperreBis angelegt.`, `Backfill InaktivSeit fuer bereits inaktive Konten ausgefuehrt.`, `Index IX_Users_InaktivSeit angelegt.` und `[run-sql] Fertig.`

- [ ] **Step 3: Idempotenz prüfen — dieselbe Migration erneut ausführen**

Run:

```bash
node backend/db/run-sql.js db/migrations/030_users_loeschkonzept.sql
```

Expected: Kein Fehler; die Ausgabe lautet jetzt `dbo.Users.InaktivSeit existiert bereits.`, `dbo.Users.LoeschsperreBis existiert bereits.`, `Index IX_Users_InaktivSeit existiert bereits.` Der Backfill-`EXEC` läuft erneut, findet aber keine Zeile mehr mit `InaktivSeit IS NULL` bei `Aktiv = 0`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/030_users_loeschkonzept.sql
git commit -m "feat(db): Migration 030 - Stichtag und Loeschsperre auf dbo.Users"
```

---

### Task 2: Stichtag in beiden Deaktivierungs-Pfaden stempeln

Es gibt **zwei** Wege, ein Konto zu deaktivieren: der Entra-Sync über `setUsersAktiv` und die Nutzerverwaltung über `updateUserProfile` (Feld `aktiv` in der Patch-Whitelist). Beide müssen den Stichtag setzen — sonst bleibt bei manueller Deaktivierung `InaktivSeit` auf `NULL` und das Konto wird nie fällig.

**Files:**
- Modify: `backend/services/users.js:80-90` (Patch-Whitelist), `:47-74` (`buildReqUser`), `:208-224` (`updateUserProfile`), `:238-246` (`setUsersAktiv`)
- Test: `backend/services/users.test.js` (bestehend, erweitern)

**Interfaces:**
- Consumes: Spalten aus Task 1.
- Produces:
  - `setUsersAktiv(oids, aktiv, poolOverride?) => Promise<number>` — dritter Parameter optional, nur für Tests.
  - `updateUserProfile(oid, fields, poolOverride?) => Promise<void>` — dritter Parameter optional, nur für Tests.
  - `buildReqUser(row)` liefert zusätzlich `inaktivSeit: string|null` (ISO) und `loeschsperreBis: string|null` (`YYYY-MM-DD`).
  - `PATCH_COLUMNS` akzeptiert das Feld `loeschsperreBis` → Spalte `LoeschsperreBis`.

- [ ] **Step 1: Failing tests schreiben**

Am Ende von `backend/services/users.test.js` anfügen. Der Import in Zeile 5 muss zusätzlich `setUsersAktiv` und `updateUserProfile` holen:

```js
/* ── Löschkonzept: Stichtag InaktivSeit ─────────────────────────
   Fake-Pool statt echter DB (Muster wie vertretungen.test.js): wir prüfen
   das erzeugte SQL, nicht das DB-Ergebnis. */
const { setUsersAktiv, updateUserProfile } = require('./users');

function fakePool() {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = {};
      const api = {
        input(name, _typ, val) { inputs[name] = val; return api; },
        query(text) { calls.push({ sql: text, inputs }); return Promise.resolve({ rowsAffected: [1] }); },
      };
      return api;
    },
  };
}

test('setUsersAktiv: Deaktivieren stempelt InaktivSeit, ohne einen bestehenden Stempel zu ueberschreiben', async () => {
  const pool = fakePool();
  await setUsersAktiv(['g1', 'g2'], false, pool);

  assert.equal(pool.calls.length, 1);
  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, 0);
  assert.equal(inputs.o0, 'g1');
  assert.equal(inputs.o1, 'g2');
  // COALESCE ist der Kern: der Entra-Sync ruft das bei jedem Lauf erneut auf.
  // Ein blindes SYSUTCDATETIME() wuerde die Frist ewig nach hinten schieben.
  assert.match(text, /COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\)/);
  assert.match(text, /Oid IN \(@o0,@o1\)/);
});

test('setUsersAktiv: Reaktivieren leert InaktivSeit', async () => {
  const pool = fakePool();
  await setUsersAktiv(['g1'], true, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, 1);
  // Ein CASE deckt beide Richtungen in einer Anweisung ab.
  assert.match(text, /WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('setUsersAktiv: leere Liste macht keinen DB-Aufruf', async () => {
  const pool = fakePool();
  assert.equal(await setUsersAktiv([], false, pool), 0);
  assert.equal(pool.calls.length, 0);
});

test('updateUserProfile: manuelles Deaktivieren stempelt InaktivSeit ebenfalls', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: false }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, false);
  assert.match(text, /Aktiv = @aktiv/);
  assert.match(text, /InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('updateUserProfile: ohne aktiv-Feld wird InaktivSeit nicht angefasst', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { beruf: 'Mechatroniker' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /Beruf = @beruf/);
  assert.ok(!/InaktivSeit/.test(text), 'InaktivSeit darf hier nicht vorkommen');
});

test('validateUserPatch akzeptiert loeschsperreBis', () => {
  assert.equal(validateUserPatch({ loeschsperreBis: '2027-01-01' }).ok, true);
  assert.equal(validateUserPatch({ loeschSperre: '2027-01-01' }).ok, false);
});

test('buildReqUser liefert inaktivSeit und loeschsperreBis', () => {
  const u = buildReqUser({
    Oid: 'g9', Name: 'Muster, Max', Role: 'azubi',
    InaktivSeit: '2026-01-15T02:00:00.000Z', LoeschsperreBis: '2027-03-01',
  });
  assert.equal(u.inaktivSeit, '2026-01-15T02:00:00.000Z');
  assert.equal(u.loeschsperreBis, '2027-03-01');
});

test('buildReqUser: fehlende Loeschkonzept-Spalten ergeben null', () => {
  const u = buildReqUser({ Oid: 'g10', Role: 'pruefer' });
  assert.equal(u.inaktivSeit, null);
  assert.equal(u.loeschsperreBis, null);
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/users.test.js
```

Expected: FAIL. `setUsersAktiv` erzeugt noch kein `COALESCE(InaktivSeit, ...)`, `updateUserProfile` nimmt keinen dritten Parameter, `buildReqUser` liefert `undefined` statt `null`, `validateUserPatch({loeschsperreBis})` meldet „Unbekanntes Feld".

- [ ] **Step 3: `PATCH_COLUMNS` erweitern**

In `backend/services/users.js` nach Zeile 89 (`aktiv:`) einfügen:

```js
  aktiv:            { col: 'Aktiv',            type: () => sql.Bit },
  // Löschsperre: hält ein Konto über die 365-Tage-Frist hinaus zurück
  // (Prüfungsanfechtung, Rechtsstreit). Siehe services/retention.js.
  loeschsperreBis:  { col: 'LoeschsperreBis',  type: () => sql.Date },
```

- [ ] **Step 4: `buildReqUser` erweitern**

In `backend/services/users.js` innerhalb des `return`-Objekts von `buildReqUser`, direkt nach der `ersteAnmeldung`-Zeile:

```js
    ersteAnmeldung: row.ErsteAnmeldung ? new Date(row.ErsteAnmeldung).toISOString() : null,
    // Löschkonzept (Migration 030): Stichtag der 365-Tage-Frist und eine
    // optionale Sperre. Die Nutzerverwaltung zeigt daraus das Löschdatum.
    inaktivSeit:     row.InaktivSeit ? new Date(row.InaktivSeit).toISOString() : null,
    loeschsperreBis: toDay(row.LoeschsperreBis),
```

- [ ] **Step 5: `updateUserProfile` umbauen**

`backend/services/users.js` — die Funktion vollständig ersetzen:

```js
async function updateUserProfile(oid, fields, poolOverride) {
  const check = validateUserPatch(fields);
  if (!check.ok) throw new Error(check.error);
  const pool = poolOverride || await getPool();
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
  // Manuelle Deaktivierung in der Nutzerverwaltung muss die Löschfrist genauso
  // starten wie der Entra-Sync (setUsersAktiv) — sonst bliebe InaktivSeit auf
  // NULL und das Konto würde nie fällig. Gleiche CASE/COALESCE-Semantik dort.
  if ('aktiv' in fields) {
    sets.push('InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE(InaktivSeit, SYSUTCDATETIME()) ELSE NULL END');
  }
  sets.push('AktualisiertAm = SYSUTCDATETIME()');
  await r.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE Oid = @oid`);
}
```

- [ ] **Step 6: `setUsersAktiv` umbauen**

`backend/services/users.js` — die Funktion vollständig ersetzen:

```js
// Aktiv-Flag für eine OID-Liste setzen (parametrisiert). No-op bei leerer Liste.
// poolOverride ist ausschließlich für Unit-Tests (Fake-Pool) gedacht.
async function setUsersAktiv(oids, aktiv, poolOverride) {
  if (!oids || !oids.length) return 0;
  const pool = poolOverride || await getPool();
  const r = pool.request();
  r.input('aktiv', sql.Bit, aktiv ? 1 : 0);
  const params = oids.map((oid, i) => { r.input(`o${i}`, sql.NVarChar(36), oid); return `@o${i}`; });
  // InaktivSeit ist der Stichtag der Löschfrist (Migration 030).
  // COALESCE ist wesentlich: entraSync ruft setUsersAktiv(stale, false) bei
  // JEDEM Lauf auf. Ein blindes SYSUTCDATETIME() würde die Frist alle 6 Stunden
  // nach hinten schieben und das Konto nie fällig werden lassen.
  const res = await r.query(`
    UPDATE dbo.Users
       SET Aktiv = @aktiv,
           InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE(InaktivSeit, SYSUTCDATETIME()) ELSE NULL END,
           AktualisiertAm = SYSUTCDATETIME()
     WHERE Oid IN (${params.join(',')})`);
  return res.rowsAffected[0];
}
```

- [ ] **Step 7: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/users.test.js
```

Expected: PASS, alle Tests grün (die bestehenden inklusive).

- [ ] **Step 8: Regression der Aufrufer prüfen**

Run:

```bash
node --test backend/services/entraSync.test.js backend/middleware/auth.test.js backend/routes/dev-login.test.js
```

Expected: PASS. `setUsersAktiv` und `updateUserProfile` haben nur einen **optionalen** dritten Parameter bekommen; bestehende Aufrufe in `entraSync.js:206`/`:209` und `routes/users.js` bleiben unverändert gültig.

- [ ] **Step 9: Commit**

```bash
git add backend/services/users.js backend/services/users.test.js
git commit -m "feat(users): InaktivSeit-Stichtag in beiden Deaktivierungspfaden stempeln

setUsersAktiv (Entra-Sync) und updateUserProfile (Nutzerverwaltung) setzen
den Stichtag per CASE/COALESCE: Deaktivieren stempelt einmalig, erneutes
Deaktivieren laesst den Stempel stehen, Reaktivieren leert ihn.
LoeschsperreBis kommt in die Patch-Whitelist."
```

---

### Task 3: Migration 031 + Namensspalten im Backend mitschreiben

**Files:**
- Create: `db/migrations/031_belege_namensspalten.sql`
- Modify: `backend/routes/wochen.js:292-308`, `backend/routes/kommentare.js:23-34`, `backend/routes/zuweisungen.js:20-28` und `:133-143`, `app/js/api.js:185-195` / `:208-236` / `:239-260`

**Interfaces:**
- Consumes: nichts aus Task 1/2.
- Produces:
  - Spalten `Wochen.KorrigiertVonName`, `Kommentare.AutorName`, `Zuweisungen.VerantwName` (alle `NVARCHAR(200) NULL`, DB-Form „Nachname, Vorname").
  - `nameForEmail(pool, email) => Promise<string|null>` in `backend/routes/zuweisungen.js` (modul-lokal).
  - Frontend-Felder `woche.korrigiertVonName`, `kommentar.autorName`, `zuweisung.verantwName` (letzteres mit geänderter Herkunft).

- [ ] **Step 1: Migration schreiben**

Create `db/migrations/031_belege_namensspalten.sql`:

```sql
-- ============================================================
-- Migration 031 – Namen an Belegen denormalisieren
-- Ausführen gegen: Berichtsheft_Dev
--
-- Voraussetzung für das Löschkonzept (Migration 030): Die App löst
-- Personennamen bisher bei jedem Rendern live über dbo.Users auf. Wird eine
-- Person gelöscht, zeigt der Kommentar "Unbekannt", die PDF-Gegenzeichnung
-- "Ausbilder/in" — und das Status-Banner fällt auf den STATISCH zugeordneten
-- Ausbilder zurück, behauptet also eine falsche Person habe abgenommen
-- (app/js/wochenansicht.js, renderStatusBanner). In einem Nachweisdokument
-- ist das ein Sachmangel.
--
-- Deshalb tragen die drei Belege den Namen künftig selbst. Gespeichert wird
-- die DB-Form "Nachname, Vorname"; gedreht wird erst am Anzeigeort über
-- displayName() — Repo-Konvention.
--
-- KEIN Backfill: der Retention-Job kennt die dbo.Users-Zeile in dem Moment,
-- in dem er sie löscht, und schreibt den Namen dann in genau die betroffenen
-- Zeilen (Phase B, services/retention.js). Ein Massen-UPDATE über alle
-- historischen Wochen und Kommentare wäre unnötiges Risiko. Bestandszeilen
-- bleiben NULL und werden weiter live aufgelöst.
--
-- Zuweisungen ist der gegenläufige Fall: dort steht die E-MAIL des
-- Verantwortlichen, und der Name wird daraus abgeleitet (api.js
-- normalizeZuweisung). Ohne VerantwName müsste die E-Mail stehen bleiben —
-- die Löschung wäre wirkungslos. Der Job leert sie und behält den Namen.
--
-- Idempotent (IF-Guards), no-op auf einer bereits migrierten DB.
-- ============================================================

IF COL_LENGTH('dbo.Wochen', 'KorrigiertVonName') IS NULL
BEGIN
  ALTER TABLE dbo.Wochen ADD KorrigiertVonName NVARCHAR(200) NULL;
  PRINT 'Spalte dbo.Wochen.KorrigiertVonName angelegt.';
END
ELSE PRINT 'dbo.Wochen.KorrigiertVonName existiert bereits.';

IF COL_LENGTH('dbo.Kommentare', 'AutorName') IS NULL
BEGIN
  ALTER TABLE dbo.Kommentare ADD AutorName NVARCHAR(200) NULL;
  PRINT 'Spalte dbo.Kommentare.AutorName angelegt.';
END
ELSE PRINT 'dbo.Kommentare.AutorName existiert bereits.';

IF COL_LENGTH('dbo.Zuweisungen', 'VerantwName') IS NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen ADD VerantwName NVARCHAR(200) NULL;
  PRINT 'Spalte dbo.Zuweisungen.VerantwName angelegt.';
END
ELSE PRINT 'dbo.Zuweisungen.VerantwName existiert bereits.';
```

- [ ] **Step 2: Migration ausführen und Idempotenz prüfen**

Run:

```bash
node backend/db/run-sql.js db/migrations/031_belege_namensspalten.sql
node backend/db/run-sql.js db/migrations/031_belege_namensspalten.sql
```

Expected: erster Lauf meldet dreimal „angelegt.", zweiter Lauf dreimal „existiert bereits." — beide ohne Fehler.

- [ ] **Step 3: `KorrigiertVonName` beim Statuswechsel mitschreiben**

In `backend/routes/wochen.js` den `if (treffer.korrektur)`-Block (Zeile 297-300) ersetzen:

```js
    if (treffer.korrektur) {
      request.input('korrigiertVon', sql.NVarChar(36), user.oid);
      // Name mitschreiben (Migration 031): die Gegenzeichnung im
      // Ausbildungsnachweis muss den Prüfer auch dann noch nennen, wenn sein
      // Konto später vom Retention-Job gelöscht wird. DB-Form, nicht Anzeigeform.
      request.input('korrigiertVonName', sql.NVarChar(200), user.name ?? null);
      setClause += ', KorrigiertVon = @korrigiertVon, KorrigiertVonName = @korrigiertVonName'
                 + ', KorrigiertAm = SYSUTCDATETIME()';
    }
```

- [ ] **Step 4: `AutorName` beim Anlegen eines Kommentars mitschreiben**

In `backend/routes/kommentare.js` den `pool.request()`-Aufruf (Zeile 23-34) ersetzen:

```js
    const sichererTyp = ERLAUBTE_TYPEN.includes(typ) ? typ : 'ausbilder';
    const result = await pool.request()
      .input('wocheId', sql.Int,             req.params.wocheId)
      .input('userOid', sql.NVarChar(36),    req.user.oid)
      // Name mitschreiben (Migration 031): nach dem Löschen des Kontos zeigte
      // die Kommentarliste sonst "Unbekannt". DB-Form, nicht Anzeigeform.
      .input('autorName', sql.NVarChar(200), req.user.name ?? null)
      .input('text',    sql.NVarChar(sql.MAX), text)
      .input('datum',   sql.Date,            new Date().toISOString().split('T')[0])
      .input('typ',     sql.NVarChar(20),    sichererTyp)
      .input('tagId',   sql.Int,             tagId ?? null)
      .query(`
        INSERT INTO dbo.Kommentare (WocheId, UserOid, AutorName, Text, Datum, Typ, TagId)
        OUTPUT inserted.Id
        VALUES (@wocheId, @userOid, @autorName, @text, @datum, @typ, @tagId)
      `);
```

- [ ] **Step 5: `VerantwName` beim Anlegen einer Zuweisung mitschreiben**

In `backend/routes/zuweisungen.js` direkt **nach** `oidForEmail` (also nach Zeile 28) einfügen:

```js
// Anzeigename des Verantwortlichen zum Zeitpunkt der Zuweisung, denormalisiert
// nach Zuweisungen.VerantwName (Migration 031). Nötig, weil die Zuweisung nur
// die E-Mail trägt und der Retention-Job diese beim Löschen der Person leert —
// ohne den gespeicherten Namen stünde danach überall "–".
// Kein Treffer (Verantwortlicher noch ohne SSO-Login) → null; die Anzeige
// leitet dann wie bisher aus der E-Mail ab.
async function nameForEmail(pool, email) {
  if (!email) return null;
  try {
    const r = await pool.request()
      .input('email', sql.NVarChar(255), String(email).toLowerCase())
      .query('SELECT TOP 1 Name FROM dbo.Users WHERE LOWER(Email) = @email');
    return r.recordset[0] ? r.recordset[0].Name : null;
  } catch (_) { return null; }
}
```

Dann den `INSERT`-Block (Zeile 133-143) ersetzen:

```js
    const verantwName = await nameForEmail(pool, verantwEmail);
    const result = await pool.request()
      .input('azubiOid',     sql.NVarChar(36),  azubiOid)
      .input('verantwEmail', sql.NVarChar(255), (verantwEmail || '').toLowerCase() || null)
      .input('verantwName',  sql.NVarChar(200), verantwName)
      .input('abteilung',    sql.NVarChar(100), abteilung || null)
      .input('von',          sql.Date,          von)
      .input('bis',          sql.Date,          bis)
      .query(`
        INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, VerantwName, Abteilung, Von, Bis)
        OUTPUT inserted.Id
        VALUES (@azubiOid, @verantwEmail, @verantwName, @abteilung, @von, @bis)
      `);
```

- [ ] **Step 6: Normalizer in `app/js/api.js` erweitern**

`normalizeKommentar` (Zeile 185-195) — nach `userId`:

```js
function normalizeKommentar(k) {
  return {
    id: k.Id,
    wocheId: k.WocheId,
    userId: k.UserOid,
    // Denormalisierter Autorname (Migration 031). NULL bei Altbestand →
    // die Anzeige löst dann wie bisher über userId auf.
    autorName: k.AutorName ?? null,
    text: k.Text,
    datum: toDateStr(k.Datum),
    typ: k.Typ,
    tagId: k.TagId ?? null,
  };
}
```

`normalizeWoche` (Zeile 208-236) — nach `korrigiertAm`:

```js
    korrigiertVon: w.KorrigiertVon ?? null,
    korrigiertAm:  toDateStr(w.KorrigiertAm),
    // Denormalisierter Name des Gegenzeichners (Migration 031). NULL bei
    // Altbestand → Anzeige/Export lösen dann wie bisher über korrigiertVon auf.
    korrigiertVonName: w.KorrigiertVonName ?? null,
```

`normalizeZuweisung` (Zeile 239-260) — die `verantwName`-Zeile ersetzen:

```js
    verantwEmail: email,
    // Gespeicherter Name hat Vorrang (Migration 031); erst danach die
    // Ableitung aus der E-Mail. Nach dem Löschen der Person ist die E-Mail
    // leer und nur noch der gespeicherte Name vorhanden.
    verantwName: z.VerantwName || (email ? dn(email) : ''),
```

> **Formatkopplung:** `normalizeWoche` und `normalizeKommentar` sind im Backend für die Backup-Snapshots gespiegelt ([berichtsheftBackup.js:83-142](../../../backend/services/berichtsheftBackup.js#L83-L142)). Die beiden neuen Felder gehören in Step 7 dort ebenfalls hinein.

- [ ] **Step 7: Backend-Spiegel der Normalizer nachziehen**

In `backend/services/berichtsheftBackup.js` — `normalizeKommentar` (Zeile 101-111) um `autorName: k.AutorName ?? null,` nach `userId` ergänzen, und `normalizeWoche` (Zeile 113-142) um `korrigiertVonName: w.KorrigiertVonName ?? null,` nach `korrigiertAm` ergänzen. Beide Felder exakt an derselben Position wie in `api.js`, damit die Strukturen deckungsgleich bleiben.

- [ ] **Step 8: Key-Listen im Backup-Test nachziehen**

Run zunächst:

```bash
node --test backend/services/berichtsheftBackup.test.js
```

Expected: FAIL — die hartkodierten Key-Listen kennen `autorName`/`korrigiertVonName` noch nicht. Die beiden Keys in den Listen ergänzen (die Fehlermeldung nennt die betroffenen Zeilen), dann erneut ausführen.

Expected danach: PASS.

- [ ] **Step 9: Konsumenten von `verantwName` verifizieren**

Run:

```bash
node -e "console.log('nur Lesehinweis')"
```

Prüfen (per Grep, kein Codeeingriff): Jeder Konsument von `verantwName` muss den Wert durch `displayName()` schicken, weil jetzt die DB-Form „Nachname, Vorname" ankommen kann. Erwartete Treffer, alle schon konform:

- [abteilungs-planer.js:666](../../../app/js/abteilungs-planer.js#L666) — normalisiert alle Zuweisungen einmalig
- [abteilungsdurchlauf.js:77](../../../app/js/abteilungsdurchlauf.js#L77)
- [beurteilung.js:47](../../../app/js/beurteilung.js#L47) und [:210](../../../app/js/beurteilung.js#L210)
- [wochenansicht.js:647](../../../app/js/wochenansicht.js#L647)

Findet sich ein Konsument **ohne** `displayName()`, dort ergänzen.

- [ ] **Step 10: Manuell im Browser prüfen**

Backend starten (`cd backend; node server.js`), App über **http://localhost:3000/app/dashboard.html** öffnen (nicht über Live Server — sonst laufen Frontend und API auf verschiedenen Origins), mit einem Demo-Konto anmelden. Eine Woche als Prüfer genehmigen, danach in der Datenbank prüfen:

```sql
SELECT TOP 5 Id, KorrigiertVon, KorrigiertVonName, KorrigiertAm FROM dbo.Wochen WHERE KorrigiertVon IS NOT NULL ORDER BY KorrigiertAm DESC;
```

Expected: Die gerade genehmigte Woche hat `KorrigiertVonName` gefüllt (Form „Nachname, Vorname"). Ein Kommentar anlegen und dasselbe für `dbo.Kommentare.AutorName` prüfen.

- [ ] **Step 11: Commit**

```bash
git add db/migrations/031_belege_namensspalten.sql backend/routes/wochen.js backend/routes/kommentare.js backend/routes/zuweisungen.js backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js app/js/api.js
git commit -m "feat: Namen an Belegen denormalisieren (Migration 031)

Wochen.KorrigiertVonName, Kommentare.AutorName und Zuweisungen.VerantwName
werden ab jetzt beim Schreiben mitgefuehrt. Voraussetzung dafuer, dass ein
geloeschtes Pruefer-Konto die Gegenzeichnung im Nachweis nicht entwertet.
Kein Backfill - den uebernimmt der Retention-Job beim Loeschen."
```

---

### Task 4: Leseseiten bevorzugen den gespeicherten Namen

Ohne diesen Task existieren die Spalten, werden aber nirgends gelesen — das Löschen würde die Namen weiterhin verlieren.

**Files:**
- Modify: `app/js/wochenansicht.js:1245-1249` (Banner), `:1304` (Rückweisungsgrund), `:2513-2520` (Kommentar), `app/js/berichtsheft-export.js:365`

**Interfaces:**
- Consumes: `woche.korrigiertVonName`, `kommentar.autorName` aus Task 3.
- Produces: keine neuen Signaturen.

- [ ] **Step 1: Status-Banner umstellen**

In `app/js/wochenansicht.js` die Zeilen 1245-1246 ersetzen:

```js
    // Tatsächlich handelnde Person: erst der beim Genehmigen gespeicherte Name
    // (Migration 031), dann die Live-Auflösung über die OID (Altbestand).
    // Der frühere Fallback auf azubiAusbilderName bleibt als LETZTE Stufe —
    // er ist der gefährliche Fall (statisch zugeordneter, evtl. FALSCHER
    // Ausbilder) und darf erst greifen, wenn beide Quellen leer sind.
    const korrektor = woche.korrigiertVon ? await DB.getUser(woche.korrigiertVon) : null;
    const korrektorName = displayName(woche.korrigiertVonName || (korrektor ? korrektor.name : '') || '');
```

- [ ] **Step 2: Rückweisungsgrund-Autor umstellen**

In `app/js/wochenansicht.js` die Zeilen 1304 und 1315 ersetzen. Neu (Zeile 1304):

```js
      // Gespeicherter Autorname hat Vorrang (Migration 031); nur bei
      // Altbestand noch ein Users-Abruf.
      const author = rejectionComment && !rejectionComment.autorName
        ? await DB.getUser(rejectionComment.userId)
        : null;
      const authorName = displayName(
        (rejectionComment && rejectionComment.autorName) || (author ? author.name : '') || ''
      ) || 'Ausbilder/in';
```

Und die Meta-Zeile des Zitats (Zeile 1315):

```js
                <div class="week-status-banner__quote-meta">— ${escapeHtml(authorName)}${rejectionComment.datum ? ' · ' + rejectionComment.datum : ''}</div>
```

Der bisherige Ausdruck `${author ? displayName(author.name) : 'Ausbilder/in'}` entfällt damit; `escapeHtml` kommt neu hinzu, weil der Name jetzt aus einer DB-Spalte statt aus einem bereits geprüften Objekt stammt.

- [ ] **Step 3: Kommentar-Autor umstellen**

In `app/js/wochenansicht.js` `renderComment` (Zeile 2512-2520) ersetzen:

```js
  async function renderComment(k) {
    // Gespeicherter Autorname hat Vorrang (Migration 031). Nur bei Altbestand
    // (autorName NULL) noch ein Users-Abruf — spart zugleich Requests.
    const author = k.autorName ? null : await DB.getUser(k.userId);
    const autorAnzeige = displayName(k.autorName || (author ? author.name : '') || '') || 'Unbekannt';
    const canDelete = isAusbilder && k.userId === user.id;
    return `
      <div class="comment comment--ausbilder" data-kommentar-id="${k.id}">
        <div class="comment__body">
          <div class="comment__header">
            ${renderAvatar(author || { name: k.autorName || '', oid: k.userId }, 'avatar--sm')}
            <span class="comment__name">${autorAnzeige}</span>
```

Der Rest der Funktion bleibt unverändert. Wichtig: `canDelete` prüft weiterhin `k.userId === user.id` — nach dem Löschen ist `userId` `NULL`, der Vergleich also `false`, und niemand kann den Kommentar einer gelöschten Person entfernen. Das ist gewollt: der Kommentar ist Teil des Nachweises.

- [ ] **Step 4: PDF-Gegenzeichnung umstellen**

In `app/js/berichtsheft-export.js` Zeile 365 ersetzen:

```js
    // Gespeicherter Name des Gegenzeichners hat Vorrang (Migration 031);
    // nameByOid ist die Live-Auflösung für Altbestand. bestaetigung() dreht
    // den Namen selbst über displayName().
    const b = bestaetigung(w, w.korrigiertVonName || ctx.nameByOid[w.korrigiertVon]);
```

- [ ] **Step 5: Im Browser prüfen**

Backend starten, **http://localhost:3000/app/dashboard.html** öffnen, mit `Strg+F5` neu laden (der SPA-Router liefert geänderte JS-Dateien erst nach einem Hard-Reload aus). Dann:

1. Eine bereits genehmigte Woche öffnen → Banner zeigt weiterhin „Genehmigt durch <Name>".
2. Eine Woche mit Ausbilder-Kommentar öffnen → Autorname und Avatar erscheinen wie zuvor.
3. Im Profil den PDF-Export starten → die Gegenzeichnung nennt den Prüfer.

Expected: keine sichtbare Änderung. Der Test ist, dass **nichts** kaputtgeht — Altbestand hat `NULL` in den neuen Spalten und muss über den Fallback weiter funktionieren.

- [ ] **Step 6: Browser-Konsole auf Fehler prüfen**

In den DevTools (F12) die Konsole leeren, die drei Schritte aus Step 5 wiederholen.

Expected: keine `TypeError`-Meldungen. Insbesondere darf `displayName(undefined)` nicht auftreten — deshalb steht überall `|| ''` als letzte Stufe.

- [ ] **Step 7: Commit**

```bash
git add app/js/wochenansicht.js app/js/berichtsheft-export.js
git commit -m "feat(ui): gespeicherten Belegnamen bevorzugen, Live-Auflösung als Fallback

Banner, Rueckweisungsgrund, Kommentarliste und PDF-Gegenzeichnung lesen
zuerst die denormalisierte Namensspalte. Der gefaehrliche Fallback auf den
statisch zugeordneten Ausbilder ist damit die letzte statt der zweiten Stufe."
```

---

### Task 5: `retention.js` — Fristen- und Fälligkeitslogik

**Files:**
- Create: `backend/services/retention.js`
- Test: `backend/services/retention.test.js`

**Interfaces:**
- Consumes: Felder `inaktivSeit`, `loeschsperreBis`, `email` aus `buildReqUser` (Task 2).
- Produces:
  - `LOESCHFRIST_TAGE: number` (365), `VORWARN_TAGE: number` (30)
  - `loeschDatum(user, opts?) => Date|null`
  - `istFaellig(user, opts?) => boolean`
  - `istVorwarnFaellig(user, opts?) => boolean`
  - `istDemoKonto(email) => boolean`
  - `opts` ist überall `{ jetzt?: Date, fristTage?: number, vorwarnTage?: number }`.
  - `user` ist überall `{ oid, name, email, inaktivSeit, loeschsperreBis, aktiv }`.

- [ ] **Step 1: Failing tests schreiben**

Create `backend/services/retention.test.js`:

```js
'use strict';
/* Fristenlogik des Retention-Jobs. Reine Funktionen, keine DB, keine echte
   Uhr — 'jetzt' ist überall ein Parameter (Muster wie pruneOldBackups in
   berichtsheftBackup.js). */
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./retention.js');

const JETZT = new Date('2027-06-15T03:00:00.000Z');

// Konto, dessen Frist an einem gewählten Tag abläuft.
function konto(inaktivSeit, extra = {}) {
  return {
    oid: 'g1', name: 'Muster, Max', email: 'max.muster@putzmeister.com',
    aktiv: false, inaktivSeit, loeschsperreBis: null, ...extra,
  };
}

test('LOESCHFRIST_TAGE ist 365, VORWARN_TAGE ist 30', () => {
  assert.equal(R.LOESCHFRIST_TAGE, 365);
  assert.equal(R.VORWARN_TAGE, 30);
});

test('loeschDatum: InaktivSeit plus Frist', () => {
  const d = R.loeschDatum(konto('2026-06-15T02:00:00.000Z'), { fristTage: 365 });
  assert.equal(d.toISOString().slice(0, 10), '2027-06-15');
});

test('loeschDatum: ohne InaktivSeit null', () => {
  assert.equal(R.loeschDatum(konto(null)), null);
});

test('istFaellig: genau 365 Tage sind faellig', () => {
  // Stichtag 2026-06-15 + 365 Tage = 2027-06-15 = JETZT
  assert.equal(R.istFaellig(konto('2026-06-15T02:00:00.000Z'), { jetzt: JETZT }), true);
});

test('istFaellig: 364 Tage sind noch nicht faellig', () => {
  assert.equal(R.istFaellig(konto('2026-06-16T02:00:00.000Z'), { jetzt: JETZT }), false);
});

test('istFaellig: aktives Konto ist nie faellig', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { aktiv: true });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: ohne InaktivSeit nie faellig (Altbestand ohne Stempel)', () => {
  assert.equal(R.istFaellig(konto(null), { jetzt: JETZT }), false);
});

test('istFaellig: Sperre in der Zukunft haelt zurueck', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-12-31' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: Sperre am heutigen Tag haelt noch zurueck', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-06-15' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: abgelaufene Sperre haelt nicht zurueck, Frist laeuft nicht neu', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-06-14' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), true);
});

test('istFaellig: Demo-Konto ist nie faellig', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { email: 'lena.mueller.demo@putzmeister.com' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: Konto ohne E-Mail ist faellig (kein Demo-Konto)', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { email: null });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), true);
});

test('istFaellig gilt fuer JEDE Rolle - es gibt keine Ausnahmeliste', () => {
  for (const role of ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer']) {
    const u = konto('2020-01-01T00:00:00.000Z', { role });
    assert.equal(R.istFaellig(u, { jetzt: JETZT }), true, `Rolle ${role} muesste faellig sein`);
  }
});

test('istVorwarnFaellig: 30 Tage vor Ablauf greift', () => {
  // Stichtag so, dass das Löschdatum 2027-07-01 ist → 16 Tage entfernt
  const u = konto('2026-07-01T02:00:00.000Z');
  assert.equal(R.istVorwarnFaellig(u, { jetzt: JETZT }), true);
});

test('istVorwarnFaellig: 31 Tage vor Ablauf greift noch nicht', () => {
  // Löschdatum 2027-07-16 → 31 Tage entfernt
  const u = konto('2026-07-16T02:00:00.000Z');
  assert.equal(R.istVorwarnFaellig(u, { jetzt: JETZT }), false);
});

test('istVorwarnFaellig: bereits faelliges Konto wird nicht mehr vorgewarnt', () => {
  assert.equal(R.istVorwarnFaellig(konto('2020-01-01T00:00:00.000Z'), { jetzt: JETZT }), false);
});

test('istVorwarnFaellig: gesperrtes Konto wird nicht vorgewarnt', () => {
  const u = konto('2026-07-01T02:00:00.000Z', { loeschsperreBis: '2027-12-31' });
  assert.equal(R.istVorwarnFaellig(u, { jetzt: JETZT }), false);
});

test('istDemoKonto erkennt das .demo-Suffix im Lokalteil', () => {
  // So heissen die echten Demo-Konten (backend/db/seed-demo-users.sql):
  assert.equal(R.istDemoKonto('lena.mueller.demo@putzmeister.com'), true);
  assert.equal(R.istDemoKonto('admin.demo@putzmeister.com'), true);
  assert.equal(R.istDemoKonto('LENA.MUELLER.DEMO@PUTZMEISTER.COM'), true);  // case-insensitiv
  assert.equal(R.istDemoKonto('lena.mueller@putzmeister.com'), false);
  // Eine .demo-DOMAIN ist kein Demo-Konto in diesem System — der frueher hier
  // gepruefte Fall, der alle echten Demo-Konten durchgelassen haette:
  assert.equal(R.istDemoKonto('lena.mueller@putzmeister.demo'), false);
  assert.equal(R.istDemoKonto(null), false);
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: FAIL mit `Cannot find module './retention.js'`.

- [ ] **Step 3: Minimale Implementierung**

Create `backend/services/retention.js`:

```js
'use strict';
/* =====================================================================
   RETENTION / LÖSCHKONZEPT
   Löscht jedes Konto 365 Tage nach seiner Deaktivierung endgültig.

   Aufbau wie berichtsheftBackup.js: reine Entscheidungslogik und
   Datenkonstanten getrennt von I/O, alle Abhängigkeiten injizierbar —
   dadurch ist der Job ohne SQL Server und ohne echte Uhr testbar.

   Spec: docs/superpowers/specs/2026-08-11-loeschkonzept-inaktive-nutzer-design.md
   ===================================================================== */

// Fristen bewusst als Konstanten, NICHT als .env-Variablen: die Löschfrist ist
// eine dokumentierte Compliance-Entscheidung, die in der Datenschutzinformation
// steht. Ein Wert, der auf dem Dev-Server anders sein kann als produktiv, ohne
// Spur in Git, ist bei unwiderruflichem Löschen die falsche Eigenschaft.
// Testbarkeit kommt stattdessen über die Parameter jetzt/fristTage.
const LOESCHFRIST_TAGE = 365;
const VORWARN_TAGE = 30;

const TAG_MS = 24 * 3600 * 1000;

// Demo-Konten sind vom Löschen ausgenommen — dieselbe Ausnahme wie im
// Entra-Sync (users.js listManagedUsers). Ohne sie radiert der erste
// Nachtlauf den Demo-Datenbestand.
function istDemoKonto(email) {
  // `.demo` steht im LOKALTEIL, nicht in der Domain: die Konten heißen
  // `lena.mueller.demo@putzmeister.com`. Ein `/\.demo$/`-Test würde keines
  // von ihnen erkennen. Muster deckungsgleich mit dem SQL-Guard
  // `Email NOT LIKE '%.demo@%'` in users.js.
  return /\.demo@/i.test(String(email || '').trim());
}

// Stichtag + Frist. Ohne Stempel (Altbestand, aktives Konto) → null.
function loeschDatum(user, { fristTage = LOESCHFRIST_TAGE } = {}) {
  if (!user || !user.inaktivSeit) return null;
  const start = new Date(user.inaktivSeit);
  if (isNaN(start)) return null;
  return new Date(start.getTime() + fristTage * TAG_MS);
}

// Greift die Löschsperre? Sie hält zurück, solange LoeschsperreBis >= heute.
// Vergleich auf Tagesebene, damit eine Sperre "bis 15.06." den 15. noch abdeckt.
function sperreGreift(user, jetzt) {
  if (!user || !user.loeschsperreBis) return false;
  const bis = String(user.loeschsperreBis).slice(0, 10);
  const heute = jetzt.toISOString().slice(0, 10);
  return bis >= heute;
}

function istFaellig(user, { jetzt = new Date(), fristTage = LOESCHFRIST_TAGE } = {}) {
  if (!user) return false;
  if (user.aktiv) return false;
  if (istDemoKonto(user.email)) return false;
  if (sperreGreift(user, jetzt)) return false;
  const ziel = loeschDatum(user, { fristTage });
  if (!ziel) return false;
  return ziel.getTime() <= jetzt.getTime();
}

// Im Vorwarnfenster: Löschdatum liegt in der Zukunft, aber höchstens
// vorwarnTage entfernt. Ein bereits fälliges Konto wird nicht mehr vorgewarnt —
// es wird im selben Lauf gelöscht.
function istVorwarnFaellig(user, {
  jetzt = new Date(), fristTage = LOESCHFRIST_TAGE, vorwarnTage = VORWARN_TAGE,
} = {}) {
  if (!user) return false;
  if (user.aktiv) return false;
  if (istDemoKonto(user.email)) return false;
  if (sperreGreift(user, jetzt)) return false;
  const ziel = loeschDatum(user, { fristTage });
  if (!ziel) return false;
  const restMs = ziel.getTime() - jetzt.getTime();
  return restMs > 0 && restMs <= vorwarnTage * TAG_MS;
}

module.exports = {
  LOESCHFRIST_TAGE, VORWARN_TAGE,
  istDemoKonto, loeschDatum, istFaellig, istVorwarnFaellig,
};
```

- [ ] **Step 4: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: PASS, alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add backend/services/retention.js backend/services/retention.test.js
git commit -m "feat(retention): Fristen- und Faelligkeitslogik

Reine Funktionen mit injizierbarem 'jetzt'. Keine Rollenausnahme - die
Regel ist einheitlich Aktiv=0 seit 365 Tagen, ausgenommen Demo-Konten und
Konten mit greifender Loeschsperre."
```

---

### Task 6: `retention.js` — Phasenlisten als geprüfte Datenkonstanten

Die Löschreihenfolge ist der fehleranfälligste Teil: `AzubiOid`/`UserOid` sind lose `NVARCHAR(36)` ohne Fremdschlüssel, also erzwingt die Datenbank nichts. Die Reihenfolge wird deshalb als Datenkonstante abgelegt und per Test festgenagelt.

**Files:**
- Modify: `backend/services/retention.js`
- Test: `backend/services/retention.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `PHASE_A: Array<{ tabelle: string, bedingung: string }>` — hartes Löschen eigener Daten
  - `PHASE_B: Array<{ tabelle: string, anweisung: string }>` — Anonymisieren fremder Belege
  - `PHASE_C: Array<{ tabelle: string, bedingung: string }>` — Konto und Verkehrsdaten
  - Platzhalter in den SQL-Fragmenten: `@oid`, `@name`, `@email`, `@wochen`, `@zuw`.

- [ ] **Step 1: Failing tests schreiben**

An `backend/services/retention.test.js` anfügen:

```js
/* ── Phasenlisten ───────────────────────────────────────────────
   Die Reihenfolge ist fachlich erzwungen, nicht von der DB: es gibt fast
   keine Fremdschlüssel auf dbo.Users. Diese Tests sind die einzige Stelle,
   die eine falsche Umsortierung bemerkt. */

const idx = (liste, tabelle) => liste.findIndex(e => e.tabelle === tabelle);

test('PHASE_A: Benachrichtigungen zuerst - sie verweisen auf Wochen UND Zuweisungen', () => {
  assert.equal(idx(R.PHASE_A, 'Benachrichtigungen'), 0);
});

test('PHASE_A: Kommentare vor Tage - FK_Kommentare_Tage hat kein ON DELETE CASCADE', () => {
  assert.ok(idx(R.PHASE_A, 'Kommentare') < idx(R.PHASE_A, 'Tage'));
});

test('PHASE_A: Tage vor Wochen', () => {
  assert.ok(idx(R.PHASE_A, 'Tage') < idx(R.PHASE_A, 'Wochen'));
});

test('PHASE_A: Beurteilungen vor Zuweisungen - Beurteilungen.ZuweisungId', () => {
  assert.ok(idx(R.PHASE_A, 'Beurteilungen') < idx(R.PHASE_A, 'Zuweisungen'));
});

test('PHASE_A: Benachrichtigungen-Bedingung deckt alle VIER Wege zur Person ab', () => {
  const e = R.PHASE_A.find(x => x.tabelle === 'Benachrichtigungen');
  // Bei 'erstgenehmigt' steht der Azubi in KEINER Personenspalte (UserOid =
  // Ausbilder, FromUserOid = Pruefer, WocheId = Woche des Azubis), und
  // Beurteilungs-Mitteilungen haben FromUserOid = NULL.
  assert.match(e.bedingung, /UserOid = @oid/);
  assert.match(e.bedingung, /FromUserOid = @oid/);
  assert.match(e.bedingung, /WocheId IN \(@wochen\)/);
  assert.match(e.bedingung, /ZuweisungId IN \(@zuw\)/);
});

test('PHASE_A erfasst EssTag - Arbeitszeitdaten je Azubi', () => {
  const e = R.PHASE_A.find(x => x.tabelle === 'EssTag');
  assert.ok(e, 'EssTag fehlt in PHASE_A');
  assert.equal(e.bedingung, 'AzubiOid = @oid');
});

test('PHASE_A enthaelt keine Tabelle, die per ON DELETE CASCADE mitgeht', () => {
  const tabellen = R.PHASE_A.map(e => e.tabelle);
  // Anhaenge haengen an Wochen, BeurteilungKriterien an Beurteilungen.
  assert.ok(!tabellen.includes('Anhaenge'));
  assert.ok(!tabellen.includes('BeurteilungKriterien'));
});

test('PHASE_B besteht ausschliesslich aus UPDATE-Anweisungen', () => {
  for (const e of R.PHASE_B) {
    assert.match(e.anweisung, /^SET /, `${e.tabelle}: erwartet SET-Klausel`);
    assert.ok(!/DELETE/i.test(e.anweisung), `${e.tabelle}: kein DELETE in Phase B`);
  }
});

test('PHASE_B: jede Namensspalte wird per COALESCE geschrieben, nie ueberschrieben', () => {
  const mitName = R.PHASE_B.filter(e => /Name = /.test(e.anweisung));
  assert.equal(mitName.length, 3, 'erwartet drei Namensspalten');
  for (const e of mitName) {
    assert.match(e.anweisung, /COALESCE\(\w+Name, @name\)/, `${e.tabelle}: COALESCE fehlt`);
  }
});

test('PHASE_B: Wochen behalten den Gegenzeichner-Namen und verlieren die OID', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Wochen');
  assert.match(e.anweisung, /KorrigiertVonName = COALESCE\(KorrigiertVonName, @name\)/);
  assert.match(e.anweisung, /KorrigiertVon = NULL/);
});

test('PHASE_B: Zuweisungen verlieren die E-Mail - sonst waere die Loeschung wirkungslos', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Zuweisungen');
  assert.match(e.anweisung, /VerantwName = COALESCE\(VerantwName, @name\)/);
  assert.match(e.anweisung, /VerantwEmail = ''/);
});

test('PHASE_B: Benachrichtigungen werden nur genullt, nicht geloescht', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Benachrichtigungen');
  // Die Zeile gehoert dem Empfaenger: ein Azubi soll seine Mitteilung
  // "Woche genehmigt" nicht verlieren, weil der Pruefer gegangen ist.
  assert.match(e.anweisung, /FromUserOid = NULL/);
});

test('PHASE_C: Users zuletzt', () => {
  assert.equal(R.PHASE_C[R.PHASE_C.length - 1].tabelle, 'Users');
});

test('PHASE_C enthaelt UserPhotos nicht - FK_UserPhotos_Users kaskadiert', () => {
  assert.ok(!R.PHASE_C.map(e => e.tabelle).includes('UserPhotos'));
});

test('PHASE_C: AbteilungVerantwortliche bindet ueber OID UND E-Mail', () => {
  const e = R.PHASE_C.find(x => x.tabelle === 'AbteilungVerantwortliche');
  assert.match(e.bedingung, /Oid = @oid/);
  assert.match(e.bedingung, /Email\) = LOWER\(@email\)/);
});

test('BEKANNTE_TABELLEN vereint alle drei Phasen', () => {
  for (const liste of [R.PHASE_A, R.PHASE_B, R.PHASE_C]) {
    for (const e of liste) {
      assert.ok(R.BEKANNTE_TABELLEN.has(e.tabelle), `${e.tabelle} fehlt in BEKANNTE_TABELLEN`);
    }
  }
  // Kaskaden-Kinder gehoeren dazu, damit die Selbstpruefung sie nicht meldet.
  for (const t of ['Anhaenge', 'BeurteilungKriterien', 'UserPhotos', 'Fehlerberichte']) {
    assert.ok(R.BEKANNTE_TABELLEN.has(t), `${t} fehlt in BEKANNTE_TABELLEN`);
  }
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: FAIL — `R.PHASE_A` ist `undefined`, `idx` wirft bzw. liefert `-1`.

- [ ] **Step 3: Phasenlisten implementieren**

In `backend/services/retention.js` vor `module.exports` einfügen:

```js
/* ── Löschreihenfolge ────────────────────────────────────────────
   AzubiOid/UserOid sind fast überall lose NVARCHAR(36) OHNE Fremdschlüssel auf
   dbo.Users. Die Datenbank erzwingt hier also nichts — die Reihenfolge unten
   ist die einzige Absicherung, und retention.test.js nagelt sie fest.

   Platzhalter, die loescheNutzer() ersetzt:
     @oid    OID der Person
     @name   dbo.Users.Name der Person (DB-Form "Nachname, Vorname")
     @email  dbo.Users.Email der Person (lowercase)
     @wochen SELECT Id FROM dbo.Wochen WHERE AzubiOid = @oid
     @zuw    SELECT Id FROM dbo.Zuweisungen WHERE AzubiOid = @oid

   NICHT aufgeführt, weil per ON DELETE CASCADE erledigt:
     Anhaenge (FK auf Wochen), BeurteilungKriterien (FK auf Beurteilungen),
     UserPhotos (FK auf Users). */

// PHASE A — eigene Daten, hart löschen. Kinder vor Eltern.
const PHASE_A = [
  {
    tabelle: 'Benachrichtigungen',
    // Vier Wege zur Person: bei 'erstgenehmigt' steht der Azubi in KEINER
    // Personenspalte (wochen.js:315-322), Beurteilungs-Mitteilungen haben
    // FromUserOid = NULL und hängen nur über ZuweisungId.
    // Trifft auch Mitteilungen ANDERER an dieser Woche/Zuweisung — gewollt,
    // die Referenz existiert danach nicht mehr.
    bedingung: 'UserOid = @oid OR FromUserOid = @oid OR WocheId IN (@wochen) OR ZuweisungId IN (@zuw)',
  },
  {
    tabelle: 'Kommentare',
    // MUSS vor Tage stehen: FK_Kommentare_Tage (Migration 002) hat kein
    // ON DELETE CASCADE, ein DELETE auf Tage würde daran scheitern.
    bedingung: 'WocheId IN (@wochen)',
  },
  { tabelle: 'Tage',            bedingung: 'WocheId IN (@wochen)' },
  { tabelle: 'Wochen',          bedingung: 'AzubiOid = @oid' },
  // Vor Zuweisungen: Beurteilungen.ZuweisungId zeigt darauf.
  { tabelle: 'Beurteilungen',   bedingung: 'AzubiOid = @oid' },
  { tabelle: 'Zuweisungen',     bedingung: 'AzubiOid = @oid' },
  { tabelle: 'FahrtgeldKonfig', bedingung: 'AzubiOid = @oid' },
  // Arbeitszeitdaten je Azubi (Datum, Tagestyp, Ist/Soll/Diff). Steht in keiner
  // Migration und wird von keinem Codepfad gelesen — gefunden über die
  // INFORMATION_SCHEMA-Selbstprüfung. Personenbezogen, also von der Frist erfasst.
  { tabelle: 'EssTag',          bedingung: 'AzubiOid = @oid' },
];

// PHASE B — Handlungen an FREMDEN Nachweisen: Referenz nullen, Name behalten.
// Rechtsgrundlage für den verbleibenden Namen ist dieselbe wie für das Heft
// selbst (Art. 6 Abs. 1 lit. c DSGVO i.V.m. BBiG): die Gegenzeichnung ist
// Pflichtinhalt des Ausbildungsnachweises. Der Name verschwindet, wenn das
// Heft selbst gelöscht wird.
// COALESCE, damit ein bereits beim Schreiben gefüllter Name (Migration 031)
// nicht durch den heutigen Users.Name überschrieben wird — gespeichert ist der
// Name zum Zeitpunkt der Handlung.
const PHASE_B = [
  {
    tabelle: 'Wochen',
    anweisung: 'SET KorrigiertVonName = COALESCE(KorrigiertVonName, @name), KorrigiertVon = NULL',
    bedingung: 'KorrigiertVon = @oid',
  },
  {
    tabelle: 'Kommentare',
    anweisung: 'SET AutorName = COALESCE(AutorName, @name), UserOid = NULL',
    bedingung: 'UserOid = @oid',
  },
  {
    tabelle: 'Zuweisungen',
    // Die E-Mail MUSS weg: sie ist personenbezogener als der Name, und die
    // Anzeige leitet den Namen daraus ab (api.js normalizeZuweisung) — ohne
    // dieses Leeren wäre die Löschung wirkungslos. Nebeneffekt gewollt: der
    // befristete Lesezugriff hängt an dieser E-Mail (zugriff.js), sie darf
    // keinem neuen Träger derselben Adresse Zugriff geben.
    anweisung: "SET VerantwName = COALESCE(VerantwName, @name), VerantwEmail = ''",
    bedingung: 'LOWER(VerantwEmail) = LOWER(@email)',
  },
  {
    tabelle: 'Beurteilungen',
    // Diese drei Spalten werden nirgends als Name gerendert (geprüft:
    // beurteilung.js zeigt zuweisung.verantwName) — nur die OID muss weg,
    // ein dangling GUID ist ein pseudonymer Personenbezug.
    anweisung: 'SET BeurteiltVon = NULL',
    bedingung: 'BeurteiltVon = @oid',
  },
  { tabelle: 'Beurteilungen', anweisung: 'SET KenntnisnahmeVon = NULL', bedingung: 'KenntnisnahmeVon = @oid' },
  { tabelle: 'Beurteilungen', anweisung: 'SET KorrigiertVon = NULL',    bedingung: 'KorrigiertVon = @oid' },
  { tabelle: 'Anhaenge',      anweisung: 'SET HochgeladenVon = NULL',   bedingung: 'HochgeladenVon = @oid' },
  {
    tabelle: 'Benachrichtigungen',
    // Genullt, NICHT gelöscht: die Zeile gehört dem Empfänger. Ein Azubi soll
    // seine Mitteilung "Woche genehmigt" nicht verlieren, weil der Prüfer das
    // Unternehmen verlassen hat. FromUserOid ist seit Migration 016 nullable.
    anweisung: 'SET FromUserOid = NULL',
    bedingung: 'FromUserOid = @oid',
  },
];

// PHASE C — Konto und Verkehrsdaten, hart löschen.
const PHASE_C = [
  { tabelle: 'AusbilderAzubis',          bedingung: 'AzubiOid = @oid OR AusbilderOid = @oid' },
  // Bindet über BEIDES: Oid ist erst nach dem ersten SSO-Login gefüllt,
  // Email ist NOT NULL (Migration 012). Anzeigename geht mit der Zeile.
  { tabelle: 'AbteilungVerantwortliche', bedingung: 'Oid = @oid OR LOWER(Email) = LOWER(@email)' },
  { tabelle: 'Vertretungen',             bedingung: 'VertretenerOid = @oid OR VertreterOid = @oid' },
  { tabelle: 'McpLog',                   bedingung: 'UserOid = @oid' },
  { tabelle: 'ApiKeys',                  bedingung: 'UserOid = @oid' },
  // Zuletzt. UserPhotos folgt per FK_UserPhotos_Users ON DELETE CASCADE.
  { tabelle: 'Users',                    bedingung: 'Oid = @oid' },
];

// Für die Selbstprüfung gegen INFORMATION_SCHEMA: alles, was der Job kennt.
// Kaskaden-Kinder und fremdverwaltete Tabellen gehören dazu, sonst meldet die
// Prüfung sie fälschlich als vergessen. Fehlerberichte hat eine eigene
// 90-Tage-Rotation (services/fehlerberichte.js) und ist bewusst ausgenommen.
const BEKANNTE_TABELLEN = new Set([
  ...PHASE_A.map(e => e.tabelle),
  ...PHASE_B.map(e => e.tabelle),
  ...PHASE_C.map(e => e.tabelle),
  'Anhaenge', 'BeurteilungKriterien', 'UserPhotos',
  'Fehlerberichte', 'FehlerAnhaenge',
]);
```

Und den `module.exports`-Block erweitern:

```js
module.exports = {
  LOESCHFRIST_TAGE, VORWARN_TAGE,
  istDemoKonto, loeschDatum, istFaellig, istVorwarnFaellig,
  PHASE_A, PHASE_B, PHASE_C, BEKANNTE_TABELLEN,
};
```

- [ ] **Step 4: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: PASS, alle Tests grün.

- [ ] **Step 5: Fremdschlüssel-Lage — bereits verifiziert, nur abgleichen**

Die Fremdschlüssel der Basistabellen liegen nicht im Repo (sie stammen aus der Zeit vor der Migrationsnummerierung). Der Stand der Dev-Datenbank wurde deshalb **vor** der Umsetzung erhoben; das Ergebnis ist hier festgehalten, es muss **nicht** erneut abgefragt werden:

```
AbteilungVerantwortliche.AbteilungId -> Abteilungen   [CASCADE]
BeurteilungKriterien.BeurteilungId   -> Beurteilungen [CASCADE]
FehlerAnhaenge.FehlerId              -> Fehlerberichte[CASCADE]
Kommentare.TagId                     -> Tage          [NO_ACTION]   <-- erzwingt Kommentare VOR Tage
UserPhotos.Oid                       -> Users         [CASCADE]
Anhaenge.WocheId                     -> Wochen        [CASCADE]
Benachrichtigungen.WocheId           -> Wochen        [CASCADE]
Kommentare.WocheId                   -> Wochen        [CASCADE]
Tage.WocheId                         -> Wochen        [CASCADE]
```

Daraus folgt für `PHASE_A`, und genau so steht es oben:

1. **`Kommentare` vor `Tage` ist zwingend** — `Kommentare.TagId` ist `NO_ACTION`.
2. **Explizites Löschen statt Verlassen auf Kaskaden ist richtig.** `Wochen` kaskadiert auf `Tage` *und* `Kommentare`; weil `Kommentare.TagId` gleichzeitig `NO_ACTION` auf `Tage` steht, kann ein einzelnes `DELETE FROM dbo.Wochen` je nach Kaskaden-Reihenfolge am `NO_ACTION`-Constraint scheitern. Die Kinder vorher selbst zu löschen umgeht das.
3. **`Beurteilungen.ZuweisungId` und `Benachrichtigungen.ZuweisungId` haben keinen Fremdschlüssel** — lose Referenzen. Der `ZuweisungId`-Zweig in der Benachrichtigungs-Bedingung ist deshalb nötig und wird von der Datenbank nicht ersetzt.

Verifiziert wurde außerdem: Migrationen 002, 014, 015, 024, 026, 028 und 029 sind gelaufen. **`CK_Benachrichtigungen_Typ` existiert dagegen nicht** — relevant für Task 9, dort beschrieben.

Als Spalten mit Personenbindung existieren in `dbo`: `AbteilungVerantwortliche(Email, Oid)`, `ApiKeys(UserOid)`, `AusbilderAzubis(AusbilderOid, AzubiOid)`, `Benachrichtigungen(FromUserOid, UserOid)`, `Beurteilungen(AzubiOid)`, `EssTag(AzubiOid)`, `FahrtgeldKonfig(AzubiOid)`, `Fehlerberichte(BenutzerOid)`, `Kommentare(UserOid)`, `McpLog(UserOid)`, `UserPhotos(Oid)`, `Users(Email, Oid)`, `Vertretungen(VertretenerOid, VertreterOid)`, `Wochen(AzubiOid)`, `Zuweisungen(AzubiOid)`. Alle sind in den Phasenlisten oder in `BEKANNTE_TABELLEN` abgedeckt — `Wochen`/`Zuweisungen`/`Kommentare` tragen ihre `AzubiOid`/`UserOid`-Bindung, `Tage` hängt über `WocheId`.

Nichts zu tun in diesem Step außer: prüfen, dass die Liste oben mit `PHASE_A`/`PHASE_B`/`PHASE_C`/`BEKANNTE_TABELLEN` im Code übereinstimmt. Weicht etwas ab, Code und Test korrigieren.

- [ ] **Step 6: Commit**

```bash
git add backend/services/retention.js backend/services/retention.test.js
git commit -m "feat(retention): Loeschreihenfolge als gepruefte Datenkonstanten

PHASE_A loescht eigene Daten, PHASE_B anonymisiert Belege in fremden Heften
(Name bleibt, Referenz faellt), PHASE_C entfernt Konto und Verkehrsdaten.
Die Reihenfolge ist per Test festgenagelt, weil kaum Fremdschluessel auf
dbo.Users existieren und die DB deshalb nichts erzwingt."
```

---

### Task 7: `retention.js` — Kandidaten ermitteln und Nutzer löschen

**Files:**
- Modify: `backend/services/retention.js`
- Test: `backend/services/retention.test.js`

**Interfaces:**
- Consumes: `PHASE_A`/`PHASE_B`/`PHASE_C`/`BEKANNTE_TABELLEN` (Task 6), `getPool`/`sql` aus `../db/connection`.
- Produces:
  - `ermittleKandidaten(poolOverride?) => Promise<Array<user>>` — `user` wie in Task 5
  - `baueAnweisungen(user) => Array<{ tabelle, phase, sql }>` (rein, testbar)
  - `loescheNutzer(user, { pool?, tx?, request? }) => Promise<{ tabellen: { [tabelle]: number }, phaseB: number }>` — `phaseB` ist die Summe der Zeilen, die in fremden Heften anonymisiert wurden
  - `pruefeUnbekannteTabellen(poolOverride?) => Promise<string[]>`

- [ ] **Step 1: Failing tests schreiben**

An `backend/services/retention.test.js` anfügen:

```js
/* ── SQL-Erzeugung und Löschtransaktion ─────────────────────────── */

const USER = {
  oid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Muster, Max', email: 'max.muster@putzmeister.com',
  aktiv: false, inaktivSeit: '2020-01-01T00:00:00.000Z', loeschsperreBis: null,
};

test('baueAnweisungen: Platzhalter @wochen und @zuw werden zu Subselects', () => {
  const alle = R.baueAnweisungen(USER);
  const ben = alle.find(a => a.tabelle === 'Benachrichtigungen' && a.phase === 'A');
  assert.match(ben.sql, /WocheId IN \(SELECT Id FROM dbo\.Wochen WHERE AzubiOid = @oid\)/);
  assert.match(ben.sql, /ZuweisungId IN \(SELECT Id FROM dbo\.Zuweisungen WHERE AzubiOid = @oid\)/);
});

test('baueAnweisungen: Phase A erzeugt DELETE, Phase B UPDATE, Phase C DELETE', () => {
  const alle = R.baueAnweisungen(USER);
  const a = alle.filter(x => x.phase === 'A');
  const b = alle.filter(x => x.phase === 'B');
  const c = alle.filter(x => x.phase === 'C');
  assert.ok(a.length && b.length && c.length);
  for (const x of a) assert.match(x.sql, /^DELETE FROM dbo\./);
  for (const x of b) assert.match(x.sql, /^UPDATE dbo\./);
  for (const x of c) assert.match(x.sql, /^DELETE FROM dbo\./);
});

test('baueAnweisungen: Reihenfolge ist A, dann B, dann C', () => {
  const phasen = R.baueAnweisungen(USER).map(a => a.phase);
  assert.deepEqual([...new Set(phasen)], ['A', 'B', 'C']);
  // Users ganz am Ende
  assert.equal(R.baueAnweisungen(USER).at(-1).tabelle, 'Users');
});

test('baueAnweisungen: keine Zeichenkettenverkettung von @oid - alles parametrisiert', () => {
  const boese = { ...USER, oid: "x'; DROP TABLE dbo.Users; --" };
  for (const a of R.baueAnweisungen(boese)) {
    assert.ok(!a.sql.includes('DROP TABLE'), `${a.tabelle}: OID darf nie im SQL-Text landen`);
    assert.ok(!a.sql.includes(boese.oid));
  }
});

test('loescheNutzer: fuehrt alle Anweisungen in einer Transaktion aus und zaehlt Zeilen', async () => {
  const ausgefuehrt = [];
  const tx = {
    begin: async () => { ausgefuehrt.push('BEGIN'); },
    commit: async () => { ausgefuehrt.push('COMMIT'); },
    rollback: async () => { ausgefuehrt.push('ROLLBACK'); },
  };
  const request = () => {
    const api = {
      input: () => api,
      query: (text) => {
        ausgefuehrt.push(text.split('\n')[0].trim());
        return Promise.resolve({ rowsAffected: [2] });
      },
    };
    return api;
  };

  const bericht = await R.loescheNutzer(USER, { tx, request });

  assert.equal(ausgefuehrt[0], 'BEGIN');
  assert.equal(ausgefuehrt.at(-1), 'COMMIT');
  assert.ok(!ausgefuehrt.includes('ROLLBACK'));
  // Jede Tabelle taucht mit ihrer Zeilenzahl im Bericht auf.
  assert.equal(bericht.tabellen.Users, 2);
  assert.equal(bericht.tabellen.Wochen, 4); // Phase A + Phase B je 2
  // phaseB zaehlt nur die Anonymisierungen in FREMDEN Heften.
  assert.equal(bericht.phaseB, R.PHASE_B.length * 2);
});

test('loescheNutzer: Person ohne Berichtsheft - Phase A trifft nichts, B und C laufen trotzdem', async () => {
  const ausgefuehrt = [];
  const tx = { begin: async () => {}, commit: async () => { ausgefuehrt.push('COMMIT'); }, rollback: async () => {} };
  const request = () => {
    const api = {
      input: () => api,
      // Kein eigenes Heft: DELETEs treffen 0 Zeilen, die UPDATEs aus Phase B
      // (Gegenzeichnungen in fremden Heften) sehr wohl. Genau der Fall eines
      // reinen Pruefer-Kontos - und der Grund, warum der Job NICHT nach Rolle
      // verzweigt (siehe Spec, Kern-Erkenntnis 1).
      query: (text) => Promise.resolve({ rowsAffected: [/^UPDATE/.test(text) ? 1 : 0] }),
    };
    return api;
  };

  const bericht = await R.loescheNutzer(USER, { tx, request });

  assert.ok(ausgefuehrt.includes('COMMIT'));
  assert.equal(bericht.tabellen.Tage, 0);
  assert.equal(bericht.phaseB, R.PHASE_B.length);
});

test('loescheNutzer: ein Fehler rollt die gesamte Transaktion zurueck', async () => {
  const ausgefuehrt = [];
  const tx = {
    begin: async () => { ausgefuehrt.push('BEGIN'); },
    commit: async () => { ausgefuehrt.push('COMMIT'); },
    rollback: async () => { ausgefuehrt.push('ROLLBACK'); },
  };
  let n = 0;
  const request = () => {
    const api = {
      input: () => api,
      query: () => {
        n++;
        // Mitten in Phase B abbrechen: der schlimmste Zustand waere
        // "Heft geloescht, Konto und Belege noch da".
        if (n === 9) return Promise.reject(new Error('Deadlock'));
        return Promise.resolve({ rowsAffected: [1] });
      },
    };
    return api;
  };

  await assert.rejects(() => R.loescheNutzer(USER, { tx, request }), /Deadlock/);
  assert.ok(ausgefuehrt.includes('ROLLBACK'));
  assert.ok(!ausgefuehrt.includes('COMMIT'));
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: FAIL — `R.baueAnweisungen` und `R.loescheNutzer` sind nicht definiert.

- [ ] **Step 3: `baueAnweisungen` und `loescheNutzer` implementieren**

In `backend/services/retention.js` — oben den Import ergänzen (direkt unter `'use strict';`-Block, vor den Konstanten):

```js
const { getPool, sql } = require('../db/connection');
```

Vor `module.exports` einfügen:

```js
/* ── SQL-Erzeugung ───────────────────────────────────────────────
   @oid/@name/@email bleiben PARAMETER (mssql-Bindung) — nur die beiden
   Subselect-Platzhalter werden textuell ersetzt, und die enthalten selbst
   keine Nutzerdaten. */
const SUB_WOCHEN = 'SELECT Id FROM dbo.Wochen WHERE AzubiOid = @oid';
const SUB_ZUW    = 'SELECT Id FROM dbo.Zuweisungen WHERE AzubiOid = @oid';

function fuellePlatzhalter(fragment) {
  return String(fragment)
    .replace(/@wochen\b/g, SUB_WOCHEN)
    .replace(/@zuw\b/g, SUB_ZUW);
}

// Vollständige, geordnete Liste der Anweisungen für eine Person.
// Rein: kein I/O, dadurch im Test vollständig inspizierbar.
function baueAnweisungen(_user) {
  const out = [];
  for (const e of PHASE_A) {
    out.push({ tabelle: e.tabelle, phase: 'A',
      sql: `DELETE FROM dbo.${e.tabelle} WHERE ${fuellePlatzhalter(e.bedingung)}` });
  }
  for (const e of PHASE_B) {
    out.push({ tabelle: e.tabelle, phase: 'B',
      sql: `UPDATE dbo.${e.tabelle} ${e.anweisung} WHERE ${fuellePlatzhalter(e.bedingung)}` });
  }
  for (const e of PHASE_C) {
    out.push({ tabelle: e.tabelle, phase: 'C',
      sql: `DELETE FROM dbo.${e.tabelle} WHERE ${fuellePlatzhalter(e.bedingung)}` });
  }
  return out;
}

/* Eine Person vollständig verarbeiten: Phasen A, B und C in EINER Transaktion.
   Ein Abbruch zwischen A und B wäre der schlimmste Zustand — Heft gelöscht,
   Konto und Belege noch da —, deshalb alles oder nichts.

   deps.tx/deps.request sind für Tests; produktiv wird beides aus dem Pool
   gebaut. Transaktions-Muster wie ausbilderAzubis.js setFuerAzubi. */
async function loescheNutzer(user, deps = {}) {
  const pool = deps.pool || (deps.tx ? null : await getPool());
  const tx = deps.tx || new sql.Transaction(pool);
  const request = deps.request || (() => new sql.Request(tx));

  const tabellen = {};
  let phaseB = 0;
  await tx.begin();
  try {
    for (const a of baueAnweisungen(user)) {
      const res = await request()
        .input('oid',   sql.NVarChar(36),  user.oid)
        .input('name',  sql.NVarChar(200), user.name ?? null)
        .input('email', sql.NVarChar(256), (user.email || '').toLowerCase() || null)
        .query(a.sql);
      const n = (res.rowsAffected && res.rowsAffected[0]) || 0;
      tabellen[a.tabelle] = (tabellen[a.tabelle] || 0) + n;
      // Phase B getrennt zählen: das sind die Belege in FREMDEN Heften, an
      // denen der Name der Person stehen bleibt. Im Protokoll ist damit
      // sichtbar, ob eine Person überhaupt Spuren hinterlassen hat.
      if (a.phase === 'B') phaseB += n;
    }
    await tx.commit();
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* Transaktion evtl. schon tot */ }
    throw err;
  }
  return { tabellen, phaseB };
}

/* Kandidaten: inaktive Konten mit Stichtag, ohne Demo-Adresse. Bewusst OHNE
   Rollenbedingung — die Regel ist einheitlich (siehe Spec, Kern-Erkenntnis 1).
   Rolle und Demo-Ausnahme werden anschließend in istFaellig erneut geprüft:
   diese SQL hält die Liste klein, die reine Funktion ist die per Test
   festgenagelte Stelle. */
async function ermittleKandidaten(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request()
    .input('demo', sql.NVarChar(20), '%.demo@%')
    .query(`
      SELECT Oid, Name, Email, Role, Aktiv, InaktivSeit, LoeschsperreBis
        FROM dbo.Users
       WHERE Aktiv = 0
         AND InaktivSeit IS NOT NULL
         AND (Email IS NULL OR Email NOT LIKE @demo)
       ORDER BY InaktivSeit`);
  return res.recordset.map((r) => ({
    oid: r.Oid,
    name: r.Name,
    email: r.Email,
    role: r.Role,
    aktiv: !!r.Aktiv,
    inaktivSeit: r.InaktivSeit ? new Date(r.InaktivSeit).toISOString() : null,
    loeschsperreBis: r.LoeschsperreBis ? new Date(r.LoeschsperreBis).toISOString().slice(0, 10) : null,
  }));
}

/* Selbstprüfung gegen stilles Vergessen: Spalten, die auf 'Oid' enden oder
   'Email' heißen, verraten eine Personenbindung. Steht ihre Tabelle nicht in
   BEKANNTE_TABELLEN, hat jemand eine Tabelle angelegt, ohne den Löschjob
   anzupassen — dann bleiben dort personenbezogene Daten liegen.
   Liefert die Namen der unbekannten Tabellen; der Aufrufer meldet sie. */
async function pruefeUnbekannteTabellen(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request().query(`
    SELECT DISTINCT TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo'
       AND (COLUMN_NAME LIKE '%Oid' OR COLUMN_NAME = 'Email')`);
  return res.recordset
    .map((r) => r.TABLE_NAME)
    .filter((t) => !BEKANNTE_TABELLEN.has(t));
}
```

`module.exports` erweitern:

```js
module.exports = {
  LOESCHFRIST_TAGE, VORWARN_TAGE,
  istDemoKonto, loeschDatum, istFaellig, istVorwarnFaellig,
  PHASE_A, PHASE_B, PHASE_C, BEKANNTE_TABELLEN,
  baueAnweisungen, loescheNutzer, ermittleKandidaten, pruefeUnbekannteTabellen,
};
```

- [ ] **Step 4: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: PASS. Schlägt der Test „ein Fehler rollt die gesamte Transaktion zurueck" fehl, weil `n === 9` nicht in Phase B liegt: die Anzahl der Anweisungen in Phase A ist `PHASE_A.length` (7), die 9. Anweisung liegt also in Phase B — stimmt die Zahl nach einer Reihenfolgekorrektur aus Task 6 Step 5 nicht mehr, im Test anpassen.

- [ ] **Step 5: Selbstprüfung gegen die Dev-Datenbank laufen lassen**

Skriptdatei in den Scratchpad schreiben (`node -e` findet `dotenv` nicht, siehe Global Constraints) — `<scratchpad>/pruef-tabellen.js`:

```js
const REPO = 'C:/Dev/Digitales-Berichtsheft';
require('dotenv').config({ path: REPO + '/backend/.env' });
const R = require(REPO + '/backend/services/retention');
R.pruefeUnbekannteTabellen()
  .then((t) => { console.log('Unbekannte Tabellen mit Personenbindung:', t); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
```

Run (über das Bash-Werkzeug, nicht PowerShell):

```bash
NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/pruef-tabellen.js
```

Expected: **`[]`**. Der Stand der Dev-Datenbank ist vorab erhoben, und `EssTag` — die einzige Tabelle, die hier zunächst auftauchte — steht bereits in `PHASE_A`. Erscheint trotzdem etwas: enthält die Tabelle personenbezogene Daten, gehört sie in die passende Phase; ist sie unbedenklich, in `BEKANNTE_TABELLEN` aufnehmen — mit Kommentar, warum.

- [ ] **Step 6: Commit**

```bash
git add backend/services/retention.js backend/services/retention.test.js
git commit -m "feat(retention): Kandidatenermittlung, Loeschtransaktion, Selbstpruefung

Alle drei Phasen laufen in EINER Transaktion pro Person - ein Abbruch
zwischen A und B waere der schlimmste Zustand. OID/Name/E-Mail bleiben
gebundene Parameter. pruefeUnbekannteTabellen meldet Tabellen mit
Personenbindung, die der Job noch nicht kennt."
```

---

### Task 8: `retention.js` — Waisen-Ordner der IHK-Importe entfernen

`backend/data/ihk-imports/<oid>/` enthält vollständige IHK-Nachweis-PDFs und hat **gar keine Rotation** ([ihk-imports.js:7-15](../../../backend/routes/ihk-imports.js#L7-L15)). Ohne diesen Schritt löscht der Job die Datenbank und lässt das PDF liegen.

**Files:**
- Modify: `backend/services/retention.js`
- Test: `backend/services/retention.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `IHK_IMPORT_DIR: string`
  - `raeumeWaisenDateien({ dir?, existierendeOids }) => { entfernt: string[], probleme: string[] }`
  - `existierendeOids` ist ein `Set<string>`.

- [ ] **Step 1: Failing tests schreiben**

An `backend/services/retention.test.js` anfügen — zunächst oben die Imports ergänzen:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
```

Dann die Tests:

```js
/* ── Waisen-Ordner der IHK-Importe ──────────────────────────────
   Zustandslos: gelöscht wird jeder Ordner, dessen OID keine Users-Zeile mehr
   hat. Dadurch selbstheilend — ein fehlgeschlagenes rmSync greift der nächste
   Lauf wieder auf, ohne Merkzettel. */

function tempDirMit(ordner) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  for (const name of ordner) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'nachweis.pdf'), 'x');
  }
  return dir;
}

const OID_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const OID_B = 'bbbbbbbb-1111-2222-3333-444444444444';

test('raeumeWaisenDateien: loescht Ordner ohne Users-Zeile, laesst den anderen stehen', () => {
  const dir = tempDirMit([OID_A, OID_B]);
  const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set([OID_B]) });

  assert.deepEqual(res.entfernt, [OID_A]);
  assert.deepEqual(res.probleme, []);
  assert.equal(fs.existsSync(path.join(dir, OID_A)), false);
  assert.equal(fs.existsSync(path.join(dir, OID_B)), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('raeumeWaisenDateien: OID-Vergleich ist case-insensitiv', () => {
  const dir = tempDirMit([OID_A.toUpperCase()]);
  const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set([OID_A]) });

  assert.deepEqual(res.entfernt, [], 'Grossschreibung darf nicht als Waise gelten');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('raeumeWaisenDateien: ignoriert Namen, die keine GUID sind', () => {
  const dir = tempDirMit(['nicht-eine-guid', '_temp']);
  const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set() });

  assert.deepEqual(res.entfernt, [], 'Fremde Ordner bleiben unangetastet');
  assert.equal(fs.existsSync(path.join(dir, 'nicht-eine-guid')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('raeumeWaisenDateien: fehlendes Verzeichnis ist kein Fehler', () => {
  const res = R.raeumeWaisenDateien({ dir: path.join(os.tmpdir(), 'gibt-es-nicht-12345'), existierendeOids: new Set() });
  assert.deepEqual(res.entfernt, []);
  assert.deepEqual(res.probleme, []);
});

test('raeumeWaisenDateien: Einzelfehler stoppt die Schleife nicht', () => {
  const dir = tempDirMit([OID_A, OID_B]);
  const echtesRm = fs.rmSync;
  let ersterVersuch = true;
  fs.rmSync = (p, o) => {
    if (ersterVersuch && String(p).includes(OID_A)) { ersterVersuch = false; throw new Error('EPERM'); }
    return echtesRm(p, o);
  };
  try {
    const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set() });
    assert.deepEqual(res.entfernt, [OID_B], 'der zweite Ordner muss trotzdem weg sein');
    assert.equal(res.probleme.length, 1);
    assert.match(res.probleme[0], /EPERM/);
  } finally {
    fs.rmSync = echtesRm;
    echtesRm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: FAIL — `R.raeumeWaisenDateien` ist nicht definiert.

- [ ] **Step 3: Implementieren**

In `backend/services/retention.js` die Imports oben ergänzen:

```js
const fs = require('node:fs');
const path = require('node:path');
```

Vor `module.exports` einfügen:

```js
/* ── Dateien: IHK-Import-Archiv ──────────────────────────────────
   backend/data/ihk-imports/<oid>/ enthält vollständige IHK-Nachweis-PDFs und
   hat KEINE Rotation (routes/ihk-imports.js). Ohne diesen Schritt löscht der
   Job die Datenbank und lässt das PDF liegen.

   Bewusst zustandslos: gelöscht wird jeder Ordner, dessen OID keine
   dbo.Users-Zeile mehr hat. Damit ist der Schritt selbstheilend — schlägt ein
   rmSync fehl (offenes Handle, Virenscanner; bei pruneOldBackups real
   aufgetreten), greift der nächste Lauf denselben Ordner wieder auf, ohne dass
   irgendwo ein Merkzettel geführt werden muss. Nebeneffekt: bestehender
   Waisen-Altbestand wird mit aufgeräumt. */
const IHK_IMPORT_DIR = path.join(__dirname, '..', 'data', 'ihk-imports');
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function raeumeWaisenDateien({ dir = IHK_IMPORT_DIR, existierendeOids } = {}) {
  const entfernt = [];
  const probleme = [];
  if (!fs.existsSync(dir)) return { entfernt, probleme };

  // Vergleich case-insensitiv: Graph liefert OIDs lowercase, ein von Hand
  // angelegter Ordner kann anders geschrieben sein.
  const bekannt = new Set([...(existierendeOids || [])].map((o) => String(o).toLowerCase()));

  for (const name of fs.readdirSync(dir)) {
    // Alles, was nicht wie eine OID aussieht, bleibt unangetastet — Schutz
    // gegen versehentliches Löschen fremder Daten (wie bei pruneOldBackups).
    if (!GUID_RE.test(name)) continue;
    if (bekannt.has(name.toLowerCase())) continue;
    const p = path.join(dir, name);
    try {
      if (!fs.statSync(p).isDirectory()) continue;
      fs.rmSync(p, { recursive: true, force: true });
      entfernt.push(name);
    } catch (err) {
      probleme.push(`${name}: ${err.message}`);   // weiter mit dem nächsten
    }
  }
  return { entfernt, probleme };
}
```

`module.exports` erweitern:

```js
  IHK_IMPORT_DIR, raeumeWaisenDateien,
```

- [ ] **Step 4: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: PASS, alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add backend/services/retention.js backend/services/retention.test.js
git commit -m "feat(retention): Waisen-Ordner der IHK-Importe zustandslos aufraeumen

Geloescht wird jeder ihk-imports-Ordner ohne Users-Zeile. Selbstheilend:
ein fehlgeschlagenes rmSync greift der naechste Lauf wieder auf. Raeumt
bestehenden Waisen-Altbestand mit auf."
```

---

### Task 9: Migration 032 + Vorwarn-Mitteilung + beide Mitteilungs-Kataloge

**Files:**
- Create: `db/migrations/032_benachrichtigungen_loeschtyp.sql`
- Modify: `backend/services/retention.js`, `app/js/dashboard.js:1469-1479`, `app/js/mitteilungen.js:102-112`
- Test: `backend/services/retention.test.js`

**Interfaces:**
- Consumes: `istVorwarnFaellig`, `loeschDatum` (Task 5).
- Produces:
  - `VORWARN_TYP = 'loeschung_geplant'`
  - `ermittleVorwarnEmpfaenger(poolOverride?) => Promise<string[]>` (OIDs)
  - `sendeVorwarnung(user, { pool?, empfaenger }) => Promise<boolean>` — `false`, wenn schon eine Mitteilung existiert

- [ ] **Step 1: Migration schreiben**

Create `db/migrations/032_benachrichtigungen_loeschtyp.sql`:

```sql
-- ============================================================
-- Migration 032 – Benachrichtigungs-Typ für die Löschvorwarnung
-- Ausführen gegen: Berichtsheft_Dev
--
-- Der Retention-Job (services/retention.js) warnt 30 Tage vor dem
-- endgültigen Löschen eines Kontos. Dafür ein neuer Typ im
-- CHECK-Constraint.
--
-- BEFUND VOR DER UMSETZUNG: In der Dev-Datenbank existiert
-- CK_Benachrichtigungen_Typ ÜBERHAUPT NICHT — Migration 022 ist dort nie
-- gelaufen. Deshalb konnte der Typ 'erstgenehmigt' (routes/wochen.js:318)
-- bisher geschrieben werden, obwohl Migration 022 ihn nicht kennt; er steht
-- in den Daten. Diese Migration FÜHRT den Constraint also erstmals EIN,
-- statt ihn zu erweitern. Bewusste Entscheidung: damit wird wirksam, was
-- Migration 022 dokumentiert, und ein künftiger Tippfehler im Typ fällt hart
-- auf, statt im best-effort-catch (catch (_) {} in routes/zuweisungen.js)
-- still zu verschwinden.
--
-- Die Liste unten deckt alle 10 tatsächlich in dbo.Benachrichtigungen
-- vorkommenden Typen ab (geprüft), das ALTER TABLE validiert den Bestand
-- also erfolgreich.
--
-- FOLGE: Solange kein Constraint existiert, funktioniert die Vorwarnung auch
-- ohne diese Migration. Sie ist trotzdem Voraussetzung fürs Scharfschalten —
-- sonst bricht die Vorwarnung, sobald jemand Migration 022 nachträglich
-- ausführt (deren Liste kennt 'loeschung_geplant' nicht).
--
-- WocheId und ZuweisungId bleiben bei diesem Typ NULL. Der betroffene
-- Nutzer steht in FromUserOid; sein Konto ist inaktiv und für die
-- Empfänger (KannPlanen) nicht in der Nutzerliste sichtbar, deshalb muss
-- der Name aus FromUserOid aufgelöst werden.
--
-- Basiert auf Migration 022 (inkl. Vertretungs-Typen). Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','erstgenehmigt',
                 'beurteilung_faellig','beurteilung_abgeschlossen',
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet',
                 'loeschung_geplant'));
PRINT 'CK_Benachrichtigungen_Typ neu angelegt (inkl. loeschung_geplant).';
```

> **Bestand bereits geprüft** — nicht erneut abfragen. In `dbo.Benachrichtigungen` kommen genau diese 10 Typen vor:
> `abgelehnt, beurteilung_abgeschlossen, beurteilung_faellig, erstgenehmigt, genehmigt, versetzung_entfernt, versetzung_geaendert, versetzung_neu, vertretung_beendet, vertretung_neu`
>
> Alle 10 stehen in der `CHECK`-Liste oben, `loeschung_geplant` ist der elfte. `ALTER TABLE … ADD CONSTRAINT` validiert den Bestand (Standard: `WITH CHECK`) und geht damit durch. Schlägt es trotzdem fehl, nennt die Fehlermeldung den verletzenden Wert — diesen Typ dann in die Liste aufnehmen, **nicht** `WITH NOCHECK` verwenden.

- [ ] **Step 2: Migration ausführen und Idempotenz prüfen**

Run:

```bash
node backend/db/run-sql.js db/migrations/032_benachrichtigungen_loeschtyp.sql
node backend/db/run-sql.js db/migrations/032_benachrichtigungen_loeschtyp.sql
```

Expected: beide Läufe ohne Fehler; zweiter Lauf meldet zusätzlich `CK_Benachrichtigungen_Typ (alt) entfernt.`

- [ ] **Step 3: Failing tests schreiben**

An `backend/services/retention.test.js` anfügen:

```js
/* ── Vorwarnung ─────────────────────────────────────────────────── */

test('VORWARN_TYP ist der Wert aus dem CHECK-Constraint', () => {
  assert.equal(R.VORWARN_TYP, 'loeschung_geplant');
});

test('sendeVorwarnung: schreibt je Empfaenger eine Mitteilung mit dem Betroffenen als Absender', async () => {
  const inserts = [];
  const pool = {
    request() {
      const inputs = {};
      const api = {
        input(n, _t, v) { inputs[n] = v; return api; },
        query(text) {
          if (/SELECT COUNT/i.test(text)) return Promise.resolve({ recordset: [{ n: 0 }] });
          inserts.push(inputs);
          return Promise.resolve({ rowsAffected: [1] });
        },
      };
      return api;
    },
  };

  const ok = await R.sendeVorwarnung(USER, { pool, empfaenger: ['p1', 'p2'] });

  assert.equal(ok, true);
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].typ, 'loeschung_geplant');
  // Der Betroffene ist der ABSENDER: die Empfaenger sehen sein inaktives Konto
  // nicht in der Nutzerliste, der Name muss aus FromUserOid kommen.
  assert.equal(inserts[0].fromOid, USER.oid);
  assert.deepEqual(inserts.map(i => i.userOid), ['p1', 'p2']);
});

test('sendeVorwarnung: idempotent - bereits vorhandene Mitteilung verhindert ein zweites Senden', async () => {
  let inserts = 0;
  const pool = {
    request() {
      const api = {
        input: () => api,
        query(text) {
          if (/SELECT COUNT/i.test(text)) return Promise.resolve({ recordset: [{ n: 1 }] });
          inserts++;
          return Promise.resolve({ rowsAffected: [1] });
        },
      };
      return api;
    },
  };

  const ok = await R.sendeVorwarnung(USER, { pool, empfaenger: ['p1'] });

  assert.equal(ok, false);
  assert.equal(inserts, 0, 'sonst kaeme die Meldung 30 Naechte hintereinander');
});

test('sendeVorwarnung: ohne Empfaenger kein Insert', async () => {
  let inserts = 0;
  const pool = { request() { const api = { input: () => api, query(t) { if (/SELECT COUNT/i.test(t)) return Promise.resolve({ recordset: [{ n: 0 }] }); inserts++; return Promise.resolve({ rowsAffected: [1] }); } }; return api; } };
  assert.equal(await R.sendeVorwarnung(USER, { pool, empfaenger: [] }), false);
  assert.equal(inserts, 0);
});
```

- [ ] **Step 4: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: FAIL — `R.VORWARN_TYP` und `R.sendeVorwarnung` sind nicht definiert.

- [ ] **Step 5: Implementieren**

In `backend/services/retention.js` vor `module.exports` einfügen:

```js
/* ── Vorwarnung ──────────────────────────────────────────────────
   Muss vor dem ersten Scharfschalten per Migration 032 im CHECK-Constraint
   stehen — sonst scheitert das INSERT still. */
const VORWARN_TYP = 'loeschung_geplant';

// Empfänger: Ausbildungsleitung (KannPlanen) plus Developer. Nur aktive Konten.
async function ermittleVorwarnEmpfaenger(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request().query(`
    SELECT Oid FROM dbo.Users
     WHERE Aktiv = 1 AND (KannPlanen = 1 OR Role = 'developer')`);
  return res.recordset.map((r) => r.Oid);
}

/* Eine Vorwarnung je Empfänger. Idempotent über die Existenzprüfung: der Job
   läuft jede Nacht, das Vorwarnfenster ist 30 Tage breit — ohne die Prüfung
   käme die Meldung 30 Nächte hintereinander.
   Der betroffene Nutzer steht in FromUserOid: sein Konto ist inaktiv und für
   Empfänger mit KannPlanen nicht in der Nutzerliste sichtbar, der Name muss
   also aus dieser Referenz aufgelöst werden.
   Rückgabe: true, wenn tatsächlich gesendet wurde. */
async function sendeVorwarnung(user, { pool: poolOverride, empfaenger } = {}) {
  const ziele = (empfaenger || []).filter(Boolean);
  if (!ziele.length) return false;
  const pool = poolOverride || await getPool();

  const vorhanden = await pool.request()
    .input('typ',     sql.NVarChar(40), VORWARN_TYP)
    .input('fromOid', sql.NVarChar(36), user.oid)
    .query('SELECT COUNT(*) AS n FROM dbo.Benachrichtigungen WHERE Typ = @typ AND FromUserOid = @fromOid');
  if (vorhanden.recordset[0].n > 0) return false;

  for (const userOid of ziele) {
    await pool.request()
      .input('userOid', sql.NVarChar(36), userOid)
      .input('typ',     sql.NVarChar(40), VORWARN_TYP)
      .input('fromOid', sql.NVarChar(36), user.oid)
      .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
              VALUES (@userOid, @typ, NULL, @fromOid)`);
  }
  return true;
}
```

`module.exports` erweitern:

```js
  VORWARN_TYP, ermittleVorwarnEmpfaenger, sendeVorwarnung,
```

- [ ] **Step 6: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: PASS.

- [ ] **Step 7: Mitteilungstyp in den Dashboard-Katalog eintragen**

In `app/js/dashboard.js` in `VERWALTUNG_MT_TYPEN` (nach Zeile 1478) ergänzen:

```js
  beurteilung_abgeschlossen: { type: 'success', titel: 'Beurteilung abgeschlossen',
                               href: b => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
  // Retention-Job: ein Konto wird in höchstens 30 Tagen endgültig gelöscht.
  // Der Betroffene steht in FromUserOid — sein Konto ist inaktiv und in der
  // Nutzerliste nicht sichtbar, deshalb gehört der Name in den Titel.
  loeschung_geplant:         { type: 'yellow',  titel: 'Konto wird bald gelöscht',
                               href: () => 'nutzerverwaltung.html' },
```

- [ ] **Step 8: Mitteilungstyp in den Katalog der Mitteilungsseite eintragen**

In `app/js/mitteilungen.js` in `VERWALTUNG_TYPEN` (nach Zeile 111) ergänzen:

```js
    beurteilung_abgeschlossen: { tone: 'ok',      label: 'Beurteilung', titel: 'Beurteilung abgeschlossen',
                                 href: b => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
    // Spiegelt VERWALTUNG_MT_TYPEN in dashboard.js — fehlt der Typ hier,
    // rendert die Mitteilung auf dieser Seite leer, ohne Fehlermeldung.
    loeschung_geplant:         { tone: 'warn',    label: 'Löschung',    titel: 'Konto wird bald gelöscht',
                                 href: () => 'nutzerverwaltung.html' },
```

Beide Kataloge leiten ihren `typeKey` per `b.type.split('_')[0]` ab — bei `loeschung_geplant` ergibt das `loeschung`. Prüfen, ob für diesen Key eine CSS-Klasse oder ein Icon fehlt; falls die Kachel dadurch ohne Symbol rendert, den bestehenden `versetzung`-Stil als Vorlage nehmen.

- [ ] **Step 9: Im Browser prüfen**

Eine Test-Mitteilung setzen (OID eines aktiven Developer-Kontos als Empfänger, ein beliebiges inaktives Konto als Absender). Skriptdatei `<scratchpad>/test-mitteilung.js`:

```js
const REPO = 'C:/Dev/Digitales-Berichtsheft';
require('dotenv').config({ path: REPO + '/backend/.env' });
const { getPool, sql } = require(REPO + '/backend/db/connection');

getPool().then(async (p) => {
  const empf = (await p.request().query(
    "SELECT TOP 1 Oid FROM dbo.Users WHERE Aktiv=1 AND Role='developer'")).recordset[0];
  const von = (await p.request().query(
    'SELECT TOP 1 Oid, Name FROM dbo.Users WHERE Aktiv=0')).recordset[0];
  if (!empf || !von) { console.error('kein Developer- oder inaktives Konto gefunden'); process.exit(1); }
  const r = await p.request()
    .input('u', sql.NVarChar(36), empf.Oid)
    .input('f', sql.NVarChar(36), von.Oid)
    .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
            OUTPUT inserted.Id VALUES (@u, 'loeschung_geplant', NULL, @f)`);
  console.log('Testmitteilung Id', r.recordset[0].Id, 'fuer', empf.Oid, 'ueber', von.Name);
  console.log('WIEDER ENTFERNEN MIT: DELETE FROM dbo.Benachrichtigungen WHERE Id =', r.recordset[0].Id);
  await p.close();
}).catch((e) => { console.error(e.message); process.exit(1); });
```

Run (über das Bash-Werkzeug):

```bash
NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/test-mitteilung.js
```

Schlägt das `INSERT` mit einer CHECK-Constraint-Verletzung fehl, ist Migration 032 nicht gelaufen — Step 2 nachholen.

Backend starten, **http://localhost:3000/app/dashboard.html** mit `Strg+F5` laden, als Developer anmelden.

Expected: Die Mitteilungs-Kachel zeigt „Konto wird bald gelöscht" mit dem Namen des Betroffenen. Dasselbe auf `mitteilungen.html` prüfen. Danach die Testmitteilung wieder entfernen.

- [ ] **Step 10: Commit**

```bash
git add db/migrations/032_benachrichtigungen_loeschtyp.sql backend/services/retention.js backend/services/retention.test.js app/js/dashboard.js app/js/mitteilungen.js
git commit -m "feat(retention): Vorwarn-Mitteilung 30 Tage vor der Loeschung

Migration 032 erweitert CK_Benachrichtigungen_Typ um loeschung_geplant
(und nimmt das bisher fehlende erstgenehmigt mit auf). Die Vorwarnung geht
an KannPlanen und developer, ist ueber eine Existenzpruefung idempotent und
traegt den Betroffenen in FromUserOid, weil sein inaktives Konto in der
Nutzerliste nicht sichtbar ist."
```

---

### Task 10: Nutzerverwaltung — Löschdatum anzeigen, Sperre pflegen

Der Notausgang muss existieren, **bevor** der Job scharfgeschaltet wird.

**Files:**
- Modify: `app/js/nutzerverwaltung.js:96-113` (Formular), `:136-150` (Öffnen), `:199-208` (Speichern), `:244-267` (Zeile)

**Interfaces:**
- Consumes: `user.inaktivSeit`, `user.loeschsperreBis` (Task 2), Patch-Feld `loeschsperreBis` (Task 2).
- Produces: keine neuen Signaturen.

- [ ] **Step 1: Sperrfeld ins Formular aufnehmen**

In `app/js/nutzerverwaltung.js` nach dem `nv-form__checks`-Block (nach Zeile 113) einfügen:

```html
            <div class="form-group">
              <label class="form-label" for="nvLoeschsperre">
                Löschung zurückhalten bis
                <span class="form-hint">· leer = normale Frist (365 Tage nach Deaktivierung)</span>
              </label>
              <input class="form-control" type="date" id="nvLoeschsperre" name="loeschsperreBis">
              <p class="form-hint" id="nvLoeschHinweis"></p>
            </div>
```

- [ ] **Step 2: Werte beim Öffnen setzen**

In `openModal` nach Zeile 150 (`nvAktiv`) einfügen:

```js
    document.getElementById('nvAktiv').checked       = u.aktiv !== false;
    document.getElementById('nvLoeschsperre').value  = u.loeschsperreBis || '';
    // Löschdatum aus dem Stichtag ableiten (365 Tage, wie services/retention.js).
    const hinweis = document.getElementById('nvLoeschHinweis');
    if (u.aktiv !== false || !u.inaktivSeit) {
      hinweis.textContent = u.aktiv !== false
        ? 'Aktives Konto — die Frist läuft erst ab einer Deaktivierung.'
        : 'Kein Stichtag hinterlegt — dieses Konto wird nicht automatisch gelöscht.';
    } else {
      const ziel = new Date(new Date(u.inaktivSeit).getTime() + 365 * 24 * 3600 * 1000);
      hinweis.textContent = `Inaktiv seit ${DateUtil.formatDate(u.inaktivSeit)} · '
        + 'endgültige Löschung am ${DateUtil.formatDate(ziel.toISOString())}`;
    }
```

> Der Zeilenumbruch im Template oben ist ein Fehler-Magnet — die Zuweisung in **einer** Zeile schreiben:
> ```js
>       hinweis.textContent = `Inaktiv seit ${DateUtil.formatDate(u.inaktivSeit)} · endgültige Löschung am ${DateUtil.formatDate(ziel.toISOString())}`;
> ```

- [ ] **Step 3: Feld beim Speichern mitsenden**

In `handleSave` das `fields`-Objekt (Zeile 199-208) ergänzen:

```js
      aktiv:            document.getElementById('nvAktiv').checked,
      // Leerer Wert = keine Sperre. null statt '' senden, damit die Spalte
      // wirklich geleert wird (sql.Date verträgt '' nicht).
      loeschsperreBis:  document.getElementById('nvLoeschsperre').value || null,
```

- [ ] **Step 4: Löschdatum in der Tabellenzeile anzeigen**

In `renderRow` den `aktivBadge` (Zeile 246-248) ersetzen:

```js
    // Bei inaktiven Konten das Löschdatum direkt an das Badge hängen: die
    // Zeile ist der einzige Ort, an dem ein Developer die Fälligkeit sieht,
    // ohne das Modal zu öffnen.
    let aktivBadge;
    if (u.aktiv !== false) {
      aktivBadge = `<span class="badge badge--genehmigt">aktiv</span>`;
    } else if (u.loeschsperreBis) {
      aktivBadge = `<span class="badge badge--grey">inaktiv</span>`
                 + `<div class="nv-table__email">Löschung zurückgehalten bis ${esc(DateUtil.formatDate(u.loeschsperreBis))}</div>`;
    } else if (u.inaktivSeit) {
      const ziel = new Date(new Date(u.inaktivSeit).getTime() + 365 * 24 * 3600 * 1000);
      aktivBadge = `<span class="badge badge--grey">inaktiv</span>`
                 + `<div class="nv-table__email">Löschung am ${esc(DateUtil.formatDate(ziel.toISOString()))}</div>`;
    } else {
      aktivBadge = `<span class="badge badge--grey">inaktiv</span>`;
    }
```

- [ ] **Step 5: Im Browser prüfen**

Ein inaktives Testkonto mit künstlichem Stichtag versehen. Skriptdatei `<scratchpad>/stichtag-setzen.js`:

```js
const REPO = 'C:/Dev/Digitales-Berichtsheft';
require('dotenv').config({ path: REPO + '/backend/.env' });
const { getPool } = require(REPO + '/backend/db/connection');

getPool().then(async (p) => {
  // Bewusst ein .demo-Konto: es wird vom Job nie gelöscht, taugt aber zur
  // Anzeigeprüfung. 350 Tage → Löschdatum in ~15 Tagen.
  const r = await p.request().query(`
    UPDATE TOP (1) dbo.Users
       SET InaktivSeit = DATEADD(DAY, -350, SYSUTCDATETIME())
     WHERE Aktiv = 0 AND Email LIKE '%.demo@%'`);
  console.log('geaenderte Zeilen:', r.rowsAffected[0]);
  const z = await p.request().query(`
    SELECT Name, Email, InaktivSeit, LoeschsperreBis FROM dbo.Users
     WHERE Aktiv = 0 AND Email LIKE '%.demo@%' ORDER BY InaktivSeit`);
  console.table(z.recordset);
  await p.close();
}).catch((e) => { console.error(e.message); process.exit(1); });
```

Run (über das Bash-Werkzeug):

```bash
NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/stichtag-setzen.js
```

Expected: `geaenderte Zeilen: 1` und eine Tabelle, in der genau ein Demo-Konto ein `InaktivSeit` trägt.

Backend starten, **http://localhost:3000/app/nutzerverwaltung.html** mit `Strg+F5` laden, als Developer anmelden.

Expected:
1. Die Zeile des Testkontos zeigt unter dem `inaktiv`-Badge „Löschung am <Datum in ~15 Tagen>".
2. „Bearbeiten" öffnen → der Hinweis unter dem Datumsfeld nennt Stichtag und Löschdatum.
3. Ein Datum in der Zukunft eintragen, speichern, Seite neu laden → die Zeile zeigt „Löschung zurückgehalten bis <Datum>".
4. Das Feld leeren, speichern, neu laden → wieder „Löschung am <Datum>". Damit ist bestätigt, dass `null` die Spalte wirklich leert.

- [ ] **Step 6: Browser-Konsole prüfen**

Expected: keine Fehler. Insbesondere darf `DateUtil.formatDate` keinen `Invalid Date` produzieren — bei `inaktivSeit === null` greift der else-Zweig ohne Datumsrechnung.

- [ ] **Step 7: Commit**

```bash
git add app/js/nutzerverwaltung.js
git commit -m "feat(nutzerverwaltung): Loeschdatum anzeigen und Loeschsperre pflegen

Inaktive Konten zeigen in der Zeile ihr Loeschdatum bzw. eine greifende
Sperre; im Bearbeiten-Modal laesst sich LoeschsperreBis setzen und leeren.
Der Notausgang existiert damit, bevor der Job scharfgeschaltet wird."
```

---

### Task 11: `runRetention` orchestrieren und Timer scharfschalten

**Files:**
- Modify: `backend/services/retention.js`, `backend/server.js:232-268`
- Test: `backend/services/retention.test.js`

**Interfaces:**
- Consumes: alles aus den Tasks 5-9.
- Produces:
  - `runRetention(deps?) => Promise<bericht>` mit `bericht = { kandidaten, vorgewarnt, geloescht, gesperrt, anonymisiert, dateienEntfernt, fehler: Array<{oid,name,fehler}> }`
  - `deps = { listKandidaten?, loescheNutzer?, sendeVorwarnung?, empfaenger?, raeumeDateien?, pruefeTabellen?, jetzt?, fristTage?, vorwarnTage?, dir?, logFehler? }`

- [ ] **Step 1: Failing tests schreiben**

An `backend/services/retention.test.js` anfügen:

```js
/* ── Orchestrierung ─────────────────────────────────────────────── */

// Drei Konten: fällig, im Vorwarnfenster, gesperrt.
function kandidatenSatz() {
  return [
    { ...USER, oid: 'faellig',  inaktivSeit: '2026-06-15T02:00:00.000Z' },
    { ...USER, oid: 'vorwarn',  inaktivSeit: '2026-07-01T02:00:00.000Z' },
    { ...USER, oid: 'gesperrt', inaktivSeit: '2026-06-15T02:00:00.000Z', loeschsperreBis: '2027-12-31' },
  ];
}

function deps(over = {}) {
  return {
    jetzt: JETZT,
    listKandidaten: async () => kandidatenSatz(),
    loescheNutzer: async () => ({ tabellen: { Users: 1 }, phaseB: 3 }),
    sendeVorwarnung: async () => true,
    empfaenger: async () => ['p1'],
    raeumeDateien: () => ({ entfernt: ['x'], probleme: [] }),
    pruefeTabellen: async () => [],
    logFehler: () => {},
    ...over,
  };
}

test('runRetention: loescht Faellige, warnt im Fenster vor, laesst Gesperrte stehen', async () => {
  const geloescht = [];
  const gewarnt = [];
  const b = await R.runRetention(deps({
    loescheNutzer: async (u) => { geloescht.push(u.oid); return { tabellen: { Users: 1 }, phaseB: 5 }; },
    sendeVorwarnung: async (u) => { gewarnt.push(u.oid); return true; },
  }));

  assert.deepEqual(geloescht, ['faellig']);
  assert.deepEqual(gewarnt, ['vorwarn']);
  assert.equal(b.kandidaten, 3);
  assert.equal(b.geloescht, 1);
  assert.equal(b.vorgewarnt, 1);
  assert.equal(b.gesperrt, 1);
  assert.equal(b.anonymisiert, 5);
  assert.deepEqual(b.fehler, []);
});

test('runRetention: ein werfendes loescheNutzer stoppt den Lauf nicht', async () => {
  const versucht = [];
  const b = await R.runRetention(deps({
    listKandidaten: async () => [
      { ...USER, oid: 'a', inaktivSeit: '2026-06-15T02:00:00.000Z' },
      { ...USER, oid: 'b', inaktivSeit: '2026-06-15T02:00:00.000Z' },
    ],
    loescheNutzer: async (u) => {
      versucht.push(u.oid);
      if (u.oid === 'a') throw new Error('Deadlock');
      return { tabellen: { Users: 1 }, phaseB: 0 };
    },
    alleOids: async () => ['a', 'b'],
  }));

  assert.deepEqual(versucht, ['a', 'b'], 'b muss trotz Fehler bei a versucht werden');
  assert.equal(b.geloescht, 1);
  assert.equal(b.fehler.length, 1);
  assert.equal(b.fehler[0].oid, 'a');
});

test('runRetention: werfendes listKandidaten loescht nichts (fail closed)', async () => {
  let geloescht = 0;
  const b = await R.runRetention(deps({
    listKandidaten: async () => { throw new Error('DB weg'); },
    loescheNutzer: async () => { geloescht++; return { tabellen: {}, phaseB: 0 }; },
  }));

  assert.equal(geloescht, 0);
  assert.equal(b.geloescht, 0);
  assert.equal(b.kandidaten, 0);
  assert.equal(b.fehler.length, 1);
  assert.match(b.fehler[0].fehler, /DB weg/);
});

test('runRetention: unbekannte Tabelle wird als Fehler gemeldet, der Lauf laeuft weiter', async () => {
  const gemeldet = [];
  const b = await R.runRetention(deps({
    pruefeTabellen: async () => ['NeueTabelle'],
    logFehler: (e) => gemeldet.push(e.nachricht),
  }));

  assert.equal(b.geloescht, 1, 'die Faelligen werden trotzdem geloescht');
  assert.equal(gemeldet.length, 1);
  assert.match(gemeldet[0], /NeueTabelle/);
});

test('runRetention: Dateiaufraeumung bekommt die OIDs der VERBLEIBENDEN Nutzer', async () => {
  let gesehen = null;
  await R.runRetention(deps({
    raeumeDateien: ({ existierendeOids }) => { gesehen = existierendeOids; return { entfernt: [], probleme: [] }; },
  }));

  // 'faellig' ist gelöscht, darf also NICHT als existierend gelten —
  // sonst bliebe sein IHK-PDF liegen.
  assert.equal(gesehen.has('faellig'), false);
  assert.equal(gesehen.has('vorwarn'), true);
  assert.equal(gesehen.has('gesperrt'), true);
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: FAIL — `R.runRetention` ist nicht definiert.

- [ ] **Step 3: `runRetention` implementieren**

In `backend/services/retention.js` vor `module.exports` einfügen:

```js
/* ── Ein vollständiger Lauf ──────────────────────────────────────
   Reihenfolge: Kandidaten lesen → vorwarnen → löschen → Dateien → Selbstprüfung.
   Fail closed: scheitert das Lesen der Kandidatenliste, wird NICHTS gelöscht
   (wie entraSync bei Token-/Gruppenfehlern). Ein Fehler bei EINEM Nutzer rollt
   nur dessen Transaktion zurück und stoppt den Lauf nicht (wie fuehreBackupAus).
   Alle Abhängigkeiten injizierbar → ohne DB und ohne echte Uhr testbar. */
async function runRetention(deps = {}) {
  const {
    listKandidaten = ermittleKandidaten,
    loescheNutzer: loescheFn = loescheNutzer,
    sendeVorwarnung: warnFn = sendeVorwarnung,
    empfaenger: empfaengerFn = ermittleVorwarnEmpfaenger,
    raeumeDateien = raeumeWaisenDateien,
    pruefeTabellen = pruefeUnbekannteTabellen,
    jetzt = new Date(),
    fristTage = LOESCHFRIST_TAGE,
    vorwarnTage = VORWARN_TAGE,
    dir = IHK_IMPORT_DIR,
    logFehler = () => {},
  } = deps;

  const bericht = {
    kandidaten: 0, vorgewarnt: 0, geloescht: 0, gesperrt: 0,
    anonymisiert: 0, dateienEntfernt: 0, fehler: [],
  };

  let kandidaten;
  try {
    kandidaten = (await listKandidaten()) || [];
  } catch (err) {
    // Ohne verlässliche Liste wird nicht gelöscht.
    bericht.fehler.push({ oid: null, name: '(kandidaten)', fehler: err.message });
    logFehler({ quelle: 'backend', nachricht: `[retention] Kandidaten: ${err.message}`, stack: err.stack });
    return bericht;
  }
  bericht.kandidaten = kandidaten.length;

  const opts = { jetzt, fristTage, vorwarnTage };
  const verbleibend = new Set(kandidaten.map((u) => u.oid));

  // Vorwarnen
  const zuWarnen = kandidaten.filter((u) => istVorwarnFaellig(u, opts));
  if (zuWarnen.length) {
    let empfaenger = [];
    try { empfaenger = (await empfaengerFn()) || []; }
    catch (err) {
      bericht.fehler.push({ oid: null, name: '(empfaenger)', fehler: err.message });
      logFehler({ quelle: 'backend', nachricht: `[retention] Empfaenger: ${err.message}`, stack: err.stack });
    }
    for (const u of zuWarnen) {
      try { if (await warnFn(u, { empfaenger })) bericht.vorgewarnt++; }
      catch (err) {
        bericht.fehler.push({ oid: u.oid, name: u.name || '', fehler: err.message });
        logFehler({ quelle: 'backend', nachricht: `[retention] Vorwarnung ${u.oid}: ${err.message}`, stack: err.stack });
      }
    }
  }

  // Löschen
  for (const u of kandidaten) {
    if (!istFaellig(u, opts)) {
      // Nur als "gesperrt" zählen, was ohne Sperre fällig WÄRE — sonst zählte
      // jedes Konto mit Restlaufzeit mit.
      if (u.loeschsperreBis && istFaellig({ ...u, loeschsperreBis: null }, opts)) bericht.gesperrt++;
      continue;
    }
    try {
      const zeilen = await loescheFn(u);
      bericht.geloescht++;
      verbleibend.delete(u.oid);
      // Nur Phase B: Belege in FREMDEN Heften, an denen der Name stehen bleibt.
      bericht.anonymisiert += (zeilen && zeilen.phaseB) || 0;
    } catch (err) {
      bericht.fehler.push({ oid: u.oid, name: u.name || '', fehler: err.message });
      logFehler({ quelle: 'backend', nachricht: `[retention] Loeschen ${u.oid}: ${err.message}`, stack: err.stack });
    }
  }

  // Dateien: alle OIDs, die es noch gibt — die eben gelöschten sind raus.
  // Muss ALLE Nutzer kennen, nicht nur die Kandidaten, sonst gelten aktive
  // Konten als Waisen und ihre IHK-PDFs würden gelöscht.
  try {
    const alle = await alleUserOids(deps);
    for (const oid of verbleibend) alle.add(oid);
    const res = raeumeDateien({ dir, existierendeOids: alle });
    bericht.dateienEntfernt = res.entfernt.length;
    for (const p of res.probleme) {
      bericht.fehler.push({ oid: null, name: '(dateien)', fehler: p });
      logFehler({ quelle: 'backend', nachricht: `[retention] Datei: ${p}` });
    }
  } catch (err) {
    bericht.fehler.push({ oid: null, name: '(dateien)', fehler: err.message });
    logFehler({ quelle: 'backend', nachricht: `[retention] Dateien: ${err.message}`, stack: err.stack });
  }

  // Selbstprüfung: nachrangig, darf den Lauf nicht kippen.
  try {
    const unbekannt = await pruefeTabellen();
    if (unbekannt.length) {
      logFehler({
        quelle: 'backend',
        nachricht: `[retention] Tabellen mit Personenbindung, die der Loeschjob NICHT kennt: ${unbekannt.join(', ')} — personenbezogene Daten bleiben dort liegen.`,
        schweregrad: 'hoch',
      });
    }
  } catch (err) {
    logFehler({ quelle: 'backend', nachricht: `[retention] Selbstpruefung: ${err.message}`, stack: err.stack });
  }

  return bericht;
}

// OIDs aller noch existierenden Nutzer (für die Waisen-Erkennung).
// Injizierbar über deps.alleOids, damit runRetention ohne DB testbar bleibt.
async function alleUserOids(deps = {}) {
  if (deps.alleOids) return new Set(await deps.alleOids());
  const pool = await getPool();
  const res = await pool.request().query('SELECT Oid FROM dbo.Users');
  return new Set(res.recordset.map((r) => r.Oid));
}

/* Lauf-Sperre wie bei runBackup: der 03:00-Timer und ein evtl. manueller
   Aufruf dürfen sich nicht überlappen — zwei parallele Läufe würden dieselben
   Kandidaten doppelt verarbeiten. */
let laufenderLauf = null;

function runRetentionSerialisiert(deps = {}) {
  if (laufenderLauf) return laufenderLauf;
  laufenderLauf = runRetention(deps).finally(() => { laufenderLauf = null; });
  return laufenderLauf;
}
```

`module.exports` erweitern:

```js
  runRetention, runRetentionSerialisiert,
```

- [ ] **Step 4: Tests anpassen — `alleOids` injizieren**

Die Tests aus Step 1 rufen `runRetention` ohne DB auf; `alleUserOids` würde `getPool()` versuchen. In der `deps()`-Hilfsfunktion in `retention.test.js` ergänzen:

```js
    alleOids: async () => ['faellig', 'vorwarn', 'gesperrt'],
```

- [ ] **Step 5: Tests ausführen und Erfolg bestätigen**

Run:

```bash
node --test backend/services/retention.test.js
```

Expected: PASS, alle Tests grün.

- [ ] **Step 6: Vollständigen Testlauf über das Backend**

Run:

```bash
node --test backend/services/retention.test.js backend/services/users.test.js backend/services/entraSync.test.js backend/services/berichtsheftBackup.test.js backend/services/vertretungen.test.js backend/services/zugriff.test.js backend/services/abteilungen.test.js backend/middleware/auth.test.js backend/routes/dev-login.test.js backend/config/saml.test.js backend/db/import-users.test.js
```

Expected: PASS über alle Dateien.

- [ ] **Step 7: Trockenlauf gegen die Dev-Datenbank**

Ein Lauf mit **injizierter** Löschfunktion, der nichts anfasst und nur berichtet. Skriptdatei `<scratchpad>/trockenlauf.js`:

```js
const REPO = 'C:/Dev/Digitales-Berichtsheft';
require('dotenv').config({ path: REPO + '/backend/.env' });
const R = require(REPO + '/backend/services/retention');

R.runRetention({
  loescheNutzer: async (u) => {
    console.log('WUERDE LOESCHEN:', u.oid, u.name, '| inaktiv seit', u.inaktivSeit);
    return { tabellen: {}, phaseB: 0 };
  },
  sendeVorwarnung: async (u) => {
    console.log('WUERDE WARNEN:', u.oid, u.name, '| inaktiv seit', u.inaktivSeit);
    return true;
  },
  raeumeDateien: ({ existierendeOids }) => {
    console.log('bekannte OIDs:', existierendeOids.size);
    return { entfernt: [], probleme: [] };   // Dateien bleiben unangetastet
  },
  logFehler: (e) => console.log('FEHLER:', e.nachricht),
}).then((b) => { console.log(JSON.stringify(b, null, 2)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
```

Run (über das Bash-Werkzeug):

```bash
NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/trockenlauf.js
```

Expected: Ein Bericht ohne Einträge unter `fehler`. Nach Migration 030 haben alle inaktiven Konten einen frischen Stichtag, `geloescht` und `vorgewarnt` müssen daher **0** sein. Erscheint hier ein „WUERDE LOESCHEN", stimmt der Backfill nicht — nicht weitermachen, bevor das geklärt ist.

- [ ] **Step 8: Timer in `server.js` scharfschalten**

In `backend/server.js` nach dem Backup-Block (nach Zeile 268) anfügen:

```js
// ── Nächtliches Löschkonzept (Retention) ─────────────────────────
// Löscht Konten 365 Tage nach ihrer Deaktivierung endgültig und warnt 30 Tage
// vorher. Eine Stunde nach dem Backup, damit ein frischer Snapshot vorliegt.
// Selbst-nachplanender setTimeout wie beim Backup: trifft dauerhaft 03:00
// Ortszeit, ohne über Neustarts oder Sommerzeitwechsel wegzudriften.
//
// BEWUSST KEIN Start-Lauf: der Dev-Server läuft mit `node --watch` und würde
// bei jeder Code-Änderung löschen. Anders als beim Backup ist das hier
// unwiderruflich.
const {
  runRetentionSerialisiert,
  LOESCHFRIST_TAGE,
  VORWARN_TAGE,
} = require('./services/retention');
const RETENTION_STUNDE = 3;

function protokolliereRetention(bericht) {
  if (!bericht) return;
  console.log(`[retention] ${bericht.kandidaten} Kandidaten, ${bericht.geloescht} geloescht, `
    + `${bericht.vorgewarnt} vorgewarnt, ${bericht.gesperrt} zurueckgehalten, `
    + `${bericht.dateienEntfernt} Ordner entfernt, ${bericht.fehler.length} Fehler.`);
}
function meldeRetentionFehler(err) {
  console.error('[retention] Lauf fehlgeschlagen:', err.message);
  logFehler({ quelle: 'backend', nachricht: `[retention] Lauf: ${err.message}`, stack: err.stack });
}
function planeRetention() {
  setTimeout(() => {
    runRetentionSerialisiert({ logFehler })
      .then(protokolliereRetention)
      .catch(meldeRetentionFehler)
      .finally(planeRetention);   // Kette hält auch nach einem Fehlschlag
  }, msBisNaechsteUhrzeit(RETENTION_STUNDE));
}

planeRetention();
console.log(`[retention] aktiv — taeglich ${RETENTION_STUNDE}:00 Uhr, `
  + `Loeschfrist ${LOESCHFRIST_TAGE} Tage, Vorwarnung ${VORWARN_TAGE} Tage vorher.`);
```

`msBisNaechsteUhrzeit` ist bereits oben aus `berichtsheftBackup` importiert (Zeile 243) — nicht erneut importieren.

- [ ] **Step 9: Server starten und Startmeldung prüfen**

Run:

```bash
cd backend; node server.js
```

Expected in der Konsole: `[retention] aktiv — taeglich 3:00 Uhr, Loeschfrist 365 Tage, Vorwarnung 30 Tage vorher.` Kein `[retention]`-Lauf-Protokoll beim Start (es gibt bewusst keinen Start-Lauf). Server danach beenden.

- [ ] **Step 10: Commit**

```bash
git add backend/services/retention.js backend/services/retention.test.js backend/server.js
git commit -m "feat(retention): Lauf orchestrieren und Timer auf 03:00 scharfschalten

runRetention warnt vor, loescht, raeumt Dateien auf und meldet unbekannte
Tabellen. Fail closed: ohne Kandidatenliste wird nichts geloescht; ein
Fehler bei einem Nutzer stoppt den Lauf nicht. Kein Start-Lauf, weil der
Dev-Server mit --watch sonst bei jeder Code-Aenderung loeschen wuerde."
```

---

### Task 12: Dokumentation und manuelle Abnahme

**Files:**
- Modify: `docs/funktionsweise.md:367-375` und `:429-430`, `README.md`

**Interfaces:**
- Consumes: alles Vorherige.
- Produces: keine.

- [ ] **Step 1: `funktionsweise.md` Abschnitt 11 korrigieren**

Den Absatz „Was passiert, wenn ein Azubi ausgelernt ist?" (Zeile 367-375) ersetzen:

```markdown
**Was passiert, wenn ein Azubi ausgelernt ist?**
Das Feld „Ausbildungsende" ist reine Information; kein Job wertet es aus.
Wirksam wird der Austritt aus der Entra-Gruppe: Beim nächsten Abgleich wird das
Konto **inaktiv**, eine Anmeldung ist nicht mehr möglich, und ab diesem Tag
läuft eine Frist von **365 Tagen**. Danach löscht ein nächtlicher Job das Konto
und alle daran hängenden Daten endgültig — Wochen, Tage, Kommentare,
Beurteilungen, Anhänge, Profilfoto und die importierten IHK-PDFs. Dieselbe Regel
gilt für **alle** Rollen, auch für Prüfer und Ausbilder.

Erhalten bleibt allein der **Name** an Belegen in *fremden* Heften: die
Gegenzeichnung einer Woche, ein Ausbilder-Kommentar, das Ansprechpartner-Feld
einer Abteilungszuweisung. Ohne das wäre der Ausbildungsnachweis eines noch
aktiven Azubis entwertet, sobald sein damaliger Prüfer das Unternehmen verlässt.
Dieser Name verschwindet, wenn das Heft selbst gelöscht wird.

30 Tage vor der Löschung erhalten Ausbildungsleitung und Entwickler eine
Mitteilung. Ein Einzelfall lässt sich in der Nutzerverwaltung über „Löschung
zurückhalten bis" aufschieben (laufende Prüfungsanfechtung, Rechtsstreit).

Praktischer Rat unverändert: den PDF-Ausbildungsnachweis **vor** dem Austritt
erzeugen — danach kann der Azubi ihn nicht mehr selbst exportieren, und nach
Ablauf der Frist existieren die Daten nicht mehr.
```

- [ ] **Step 2: `funktionsweise.md` Abschnitt 12 korrigieren**

Den Aufzählungspunkt „**Kein Lösch-/Archivkonzept** …" (Zeile 429-430) ersetzen:

```markdown
- **Kein Archiv.** Gelöscht heißt gelöscht — es gibt keine Langzeitkopie. Der
  nächtliche JSON-Snapshot in `backend/data/backups/` verfällt nach 30 Tagen und
  ist kein Archiv. Eine Datenschutz-Informationsseite fehlt in der Anwendung
  weiterhin.
```

- [ ] **Step 3: `README.md` ergänzen**

In der Feature-Tabelle nach der Zeile „Automatische tägliche Berichtsheft-Backups …" (Zeile 30) ergänzen:

```markdown
| Löschkonzept (Retention-Job, 365 Tage ab Deaktivierung) | ✅ erledigt |
```

Und im Abschnitt „Betrieb & Integrationen" (Zeile 163-169) nach dem Fehlerberichte-Punkt einfügen:

```markdown
- **Löschkonzept (Retention):** Ein Job löscht täglich um 03:00 jedes Konto
  endgültig, das seit **365 Tagen** inaktiv ist — unabhängig von der Rolle, samt
  Wochen, Tagen, Kommentaren, Beurteilungen, Zuweisungen, Profilfoto und dem
  IHK-Import-Archiv unter `backend/data/ihk-imports/<oid>/`. Erhalten bleibt nur
  der **Name** an Belegen in fremden Heften (Gegenzeichnung, Kommentar-Autor,
  Ansprechpartner) — ohne ihn wäre der Ausbildungsnachweis eines noch aktiven
  Azubis entwertet, sobald sein damaliger Prüfer ausscheidet. 30 Tage vorher
  geht eine Mitteilung an Ausbildungsleitung und Entwickler; Einzelfälle lassen
  sich in der Nutzerverwaltung über „Löschung zurückhalten bis" aufschieben.
  Demo-Konten (`.demo`) sind ausgenommen. Kein Start-Lauf beim Serverstart
  (`node --watch` würde sonst bei jeder Code-Änderung löschen), keine Archiv-
  Kopie. Voraussetzung: Migrationen 030-032. Siehe
  `backend/services/retention.js` und
  `docs/superpowers/specs/2026-08-11-loeschkonzept-inaktive-nutzer-design.md`.
```

- [ ] **Step 4: Demo-Ausnahme prüfen — nur lesend**

Skriptdatei `<scratchpad>/demo-ausnahme.js`:

```js
const REPO = 'C:/Dev/Digitales-Berichtsheft';
require('dotenv').config({ path: REPO + '/backend/.env' });
const R = require(REPO + '/backend/services/retention');

R.ermittleKandidaten().then(async (k) => {
  console.log('Kandidaten:', k.length);
  console.log('darunter Demo-Konten:', k.filter((u) => R.istDemoKonto(u.email)).length);
  console.log('aktuell faellig:', k.filter((u) => R.istFaellig(u)).map((u) => u.email || u.oid));
  console.log('im Vorwarnfenster:', k.filter((u) => R.istVorwarnFaellig(u)).map((u) => u.email || u.oid));
  process.exit(0);
}).catch((e) => { console.error(e.message); process.exit(1); });
```

Run (über das Bash-Werkzeug):

```bash
NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/demo-ausnahme.js
```

Expected: `darunter Demo-Konten: 0` — sie werden bereits in der SQL-Bedingung ausgeschlossen. `aktuell faellig` muss **leer** sein: Migration 030 hat allen inaktiven Konten einen frischen Stichtag gegeben, es kann also noch niemand fällig sein. Ist die Liste nicht leer, **nicht weitermachen** und den Befund melden.

- [ ] **Step 5: Abnahme-Checkliste für Kuniß schreiben**

Die vollständige Abnahme verändert die geteilte Dev-Datenbank (Konten vordatieren, ein Wegwerf-Konto tatsächlich löschen) und wird deshalb **nicht** automatisiert ausgeführt, sondern als Checkliste übergeben.

Create `docs/superpowers/plans/2026-08-11-loeschkonzept-abnahme-checkliste.md`:

```markdown
# Löschkonzept — manuelle Abnahme

Diese Schritte verändern die Dev-Datenbank und löschen echte Zeilen. Sie sind
bewusst nicht automatisiert. Voraussetzung: Migrationen 030-032 sind gelaufen,
alle Unit-Tests grün, Server läuft über http://localhost:3000.

## A · Vollständiger Zyklus an einem Azubi-Testkonto

- [ ] Wegwerf-Konto anlegen (**keine** `.demo`-Adresse — sonst fasst der Job es nie an),
      Rolle `azubi` über die Nutzerverwaltung setzen.
- [ ] Mit dem Konto eine Woche anlegen und einreichen; als Prüfer kommentieren und
      genehmigen; eine Abteilungszuweisung anlegen; ein IHK-PDF importieren.
- [ ] Konto auf inaktiv setzen → die Tabellenzeile zeigt „Löschung am <heute + 365>".
- [ ] Stichtag vordatieren (Skript unten), Sperre auf ein Datum in der Zukunft setzen,
      Trockenlauf ohne injiziertes `loescheNutzer` starten.
      **Erwartet:** `gesperrt: 1`, `geloescht: 0`.
- [ ] Sperre leeren, Lauf erneut starten.
      **Erwartet:** `geloescht: 1`. Danach prüfen: `dbo.Users`-Zeile weg,
      Wochen/Tage/Kommentare/Beurteilungen/Zuweisungen weg,
      `backend/data/ihk-imports/<oid>/` weg.

## B · Der entscheidende Test: einen Prüfer löschen

Dieser Test belegt das gesamte Denormalisierungs-Konzept.

- [ ] Wegwerf-**Prüfer**-Konto anlegen. Damit eine Woche eines **noch aktiven** Azubis
      kommentieren und genehmigen, und den Prüfer als Verantwortlichen einer
      Abteilungszuweisung dieses Azubis eintragen.
- [ ] Prüfer-Konto deaktivieren, Stichtag auf −366 Tage vordatieren, Lauf starten.
- [ ] Als der Azubi anmelden, die betroffene Woche öffnen (`Strg+F5`).

**Erwartet:**

- [ ] Status-Banner nennt weiterhin den Namen des gelöschten Prüfers — **nicht** den
      statisch zugeordneten Ausbilder, **nicht** „Ausbilder/in".
- [ ] Der Kommentar zeigt weiterhin seinen Namen, aber **kein** Avatar-Foto.
- [ ] Der Ansprechpartner der Abteilungszuweisung zeigt weiterhin seinen Namen.
- [ ] PDF-Export aus dem Profil: die Gegenzeichnung nennt seinen Namen.
- [ ] In der Datenbank: `Wochen.KorrigiertVon IS NULL` bei gefülltem
      `KorrigiertVonName`; `Kommentare.UserOid IS NULL` bei gefülltem `AutorName`;
      `Zuweisungen.VerantwEmail = ''` bei gefülltem `VerantwName`.
- [ ] Die Mitteilung des Azubis „Woche genehmigt" ist **noch da**, mit
      `FromUserOid IS NULL`.

## Hilfsskript: Stichtag vordatieren

Als Datei ablegen und über das Bash-Werkzeug starten (`node -e` findet `dotenv`
nicht — die Backend-Pakete liegen in `backend/node_modules`):

    const REPO = 'C:/Dev/Digitales-Berichtsheft';
    require('dotenv').config({ path: REPO + '/backend/.env' });
    const { getPool, sql } = require(REPO + '/backend/db/connection');
    const mail = process.argv[2];
    getPool().then(async (p) => {
      const r = await p.request()
        .input('e', sql.NVarChar(256), mail)
        .query(`UPDATE dbo.Users
                   SET InaktivSeit = DATEADD(DAY, -366, SYSUTCDATETIME())
                 WHERE Email = @e`);
      console.log('vordatiert, Zeilen:', r.rowsAffected[0]);
      await p.close();
    }).catch((e) => { console.error(e.message); process.exit(1); });

    NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" \
      node <datei>.js "<mail-des-testkontos>"

## Danach

- [ ] Vordatierte Demo-Konten zurücksetzen: `UPDATE dbo.Users SET InaktivSeit = SYSUTCDATETIME() WHERE Aktiv = 0 AND Email LIKE '%.demo@%'`
- [ ] Fehler-Posteingang auf `[retention]`-Einträge prüfen.
```

- [ ] **Step 6: Fehler-Posteingang prüfen — nur lesend**

Skriptdatei `<scratchpad>/retention-fehler.js`:

```js
const REPO = 'C:/Dev/Digitales-Berichtsheft';
require('dotenv').config({ path: REPO + '/backend/.env' });
const { getPool } = require(REPO + '/backend/db/connection');

getPool().then(async (p) => {
  const r = await p.request().query(`
    SELECT TOP 20 Id, Schweregrad, Nachricht FROM dbo.Fehlerberichte
     WHERE Nachricht LIKE '%[retention]%' ORDER BY Id DESC`);
  console.log(r.recordset.length ? r.recordset : '(keine retention-Eintraege)');
  await p.close();
}).catch((e) => { console.error(e.message); process.exit(1); });
```

Run (über das Bash-Werkzeug):

```bash
NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" node <scratchpad>/retention-fehler.js
```

Expected: `(keine retention-Eintraege)`. Erscheint „Tabellen mit Personenbindung, die der Loeschjob NICHT kennt", muss das abgearbeitet werden, bevor der Job produktiv geht.

- [ ] **Step 7: Commit**

```bash
git add docs/funktionsweise.md README.md docs/superpowers/plans/2026-08-11-loeschkonzept-abnahme-checkliste.md
git commit -m "docs: Loeschkonzept in funktionsweise.md und README beschreiben

Abschnitt 11 und die bekannten Grenzen sind nach der Umsetzung falsch:
es gibt jetzt eine Frist von 365 Tagen ab Deaktivierung, fuer alle Rollen,
mit Vorwarnung und Loeschsperre. Der verbleibende Name am Beleg ist
ausdruecklich benannt."
```

---

## Vor der Umsetzung geklärt

Diese drei Punkte waren beim Schreiben des Plans offen und sind gegen die Dev-Datenbank erhoben worden. Die Ergebnisse sind in den Tasks eingearbeitet:

1. **Fremdschlüssel-Lage** — erhoben, siehe Task 6 Step 5. Der Plan war in allen entscheidenden Punkten richtig: `Kommentare.TagId → Tage` ist `NO_ACTION` (Kommentare **müssen** vor Tage), `Beurteilungen.ZuweisungId` und `Benachrichtigungen.ZuweisungId` haben keinen Fremdschlüssel (der `ZuweisungId`-Zweig ist nötig).
2. **`CK_Benachrichtigungen_Typ` existiert in der Dev-Datenbank nicht** — Migration 022 ist dort nie gelaufen, deshalb konnte `erstgenehmigt` geschrieben werden. Migration 032 **führt** den Constraint ein, statt ihn zu erweitern; entschieden am 2026-08-11. Die Behauptung „ohne 032 scheitert die Vorwarnung still" gilt für diese Datenbank **nicht** — 032 ist Vorsorge für den Fall, dass 022 nachträglich läuft.
3. **`dbo.EssTag`** — eine Tabelle mit `AzubiOid` und Arbeitszeitdaten (Datum, Tagestyp, Ist/Soll/Diff), angelegt am 2026-06-15, von keinem Codepfad im Repo referenziert. Über die `INFORMATION_SCHEMA`-Selbstprüfung gefunden und auf Entscheidung vom 2026-08-11 in `PHASE_A` aufgenommen.

## Offene Punkte für den Reviewer

1. **Frist auf dem Dev-Server**: Für Tests wird `InaktivSeit` vordatiert, nicht die Frist verkürzt. Wer die Konstante zum Testen ändert, muss sie zurücksetzen — sie ist die dokumentierte Compliance-Entscheidung.
2. **Manuelle Abnahme läuft nicht automatisiert** (Task 12, Step 5): Sie verändert die geteilte Dev-Datenbank und löscht echte Zeilen. Sie wird als Checkliste übergeben. Der Prüfer-Löschtest aus Abschnitt B dieser Checkliste ist die einzige Verifikation, die das Denormalisierungs-Konzept end-to-end belegt — er darf nicht entfallen.
