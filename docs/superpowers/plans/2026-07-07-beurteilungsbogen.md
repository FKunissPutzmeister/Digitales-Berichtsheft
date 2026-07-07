# Beurteilungsbogen für Abteilungsdurchläufe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitize the Putzmeister "Beurteilungsbogen" so a rotation's responsible person fills it out on a dedicated page, the trainee (Azubi/DH-Student) views the finalized result from their Abteilungsdurchlauf tile, the grade auto-computes per the IHK-Notenschlüssel, and both sides get notifications (fällig / abgeschlossen); with PDF export and the criteria catalog.

**Architecture:** One evaluation row per `Zuweisung` (rotation), stored in new `Beurteilungen` + `BeurteilungKriterien` tables. A **dual-mode pure core** (`app/js/beurteilung-core.js`, browser global `window.Beurteilung` + `module.exports`) holds the criteria catalog, the points→grade table, and the calculation — used by the frontend AND `require`d by the backend so the math is single-source. A standalone, role-aware page `beurteilung.html?zuw=<id>` renders editable (responsible) or read-only (Azubi/DH). Notifications are created server-side and reference `ZuweisungId`; fälligkeit is detected lazily on app-load (no cron). PDF follows the existing client-side print-HTML pattern (`berichtsheft-export.js`).

**Tech Stack:** Express 5, `mssql` (MSSQL, DB `Berichtsheft_Dev`), vanilla JS multi-page SPA (`app/`), Node built-in test runner (`node:test` + `node:assert/strict`). No bundler; frontend files are served statically.

**Design spec:** `docs/superpowers/specs/2026-07-07-beurteilungsbogen-design.md` — the authoritative source for the full criteria-catalog stage texts (§4.4) and points→grade table (§4.3).

## Global Constraints

- **Migrations:** `db/migrations/NNN_*.sql`, **hand-run, idempotent, no runner, no tracking table.** Next number is **`015`**. Guard with `IF OBJECT_ID(...) IS NULL` / `IF COL_LENGTH(...) IS NULL`. Header comment `-- Ausführen gegen: Berichtsheft_Dev`.
- **DB access:** always `const { getPool, sql } = require('../db/connection')`; parameterize every value via `.input('name', sql.Type, value)`. OIDs = `sql.NVarChar(36)`, emails = `sql.NVarChar(255)`, dates = `sql.Date`, ids = `sql.Int`. Emails compared/stored **lowercased**.
- **Auth:** protected routers are mounted with `devAuth` in `server.js`; handlers read `req.user = { oid, name, email, role, kannPlanen, istAusbilder, istAzubi, istDhStudent, beruf, ausbildungsBeginn, ausbildungsEnde, berichtTyp, aktiv }`. `role === 'developer'` implies all capabilities.
- **Trainee = OID, responsible = email.** A responsible who never logged in has no `Users` row/OID yet — a `UserOid`-keyed notification reaches them only after their first login (self-healing via the fällig check).
- **Frontend API:** all calls go through `DB.*` in `app/js/api.js` (`apiFetch`, `credentials:'include'`); DB PascalCase is normalized to camelCase in api.js. Dates sliced via `toDateStr`.
- **Dual-mode modules:** frontend logic files that need tests end with `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }` and must NOT touch `document`/`window` at module top-level (only inside functions).
- **Grade rounding:** `Math.round(Gesamt)` (kaufmännisch) for the points→grade lookup.
- **Criteria:** exactly 10 — block A (3): `auffassungsgabe, transfervermoegen, ausdauer`; block B (3): `zusammenarbeit, interesse_initiative, zuverlaessigkeit`; block C (4): `fertigkeiten, kenntnisse, sorgfalt, lerntempo`.
- **Status values:** `'entwurf'`, `'abgeschlossen'`. **Notification types:** `'beurteilung_faellig'`, `'beurteilung_abgeschlossen'`.
- **Run tests:** from repo root `node --test <path/to/*.test.js>`. **Run app:** from `backend/` `npm run dev` → http://localhost:3000 (dev auth accepts `X-Dev-OID` header outside production).

## File Structure

**New**
- `db/migrations/015_beurteilungen.sql` — schema (2 tables + Benachrichtigungen ALTER).
- `app/js/beurteilung-core.js` — pure catalog + points→grade table + `berechne()` + `stufeFuerPunkte()` + DOM `renderForm()`/`openKatalogModal()` (dual-mode).
- `app/js/beurteilung-core.test.js` — unit tests for the pure logic.
- `backend/services/beurteilungen.js` — persistence, calc reuse, server-side notifications, fällig detection.
- `backend/routes/beurteilungen.js` — `/api/beurteilungen` endpoints.
- `app/beurteilung.html` — standalone role-aware page (own topbar, no sidebar).
- `app/js/beurteilung.js` — page controller (load, role/shell detect, edit + read-only flows, PDF).
- `app/css/beurteilung.css` — form + print styles, DH variant hook.

**Modified**
- `backend/services/zugriff.js` (+ `verantwortlichFuerZuweisung`), `backend/services/zugriff.test.js` (new tests).
- `backend/server.js` (mount route).
- `app/js/api.js` (`normalizeBeurteilung` + `DB` methods).
- `app/js/app.js` (notification icon/title/click branches + fällig call).
- `app/js/azubi-planer.js` (tile badge + click → beurteilung page, azubi & ausbilder views).
- `app/js/abteilungsdurchlauf.js` (tile badge + click, DH view).

---

### Task 1: Migration 015 — schema

**Files:**
- Create: `db/migrations/015_beurteilungen.sql`

**Interfaces:**
- Produces: tables `dbo.Beurteilungen` (cols: `Id, ZuweisungId, AzubiOid, Status, IndividuelleBeurteilung, GesamtPunkte, Note, GespraechAm, BeurteiltVon, AbgeschlossenAm, KenntnisnahmeVon, KenntnisnahmeAm, KorrigiertVon, KorrigiertAm, ErstelltAm, AktualisiertAm`), `dbo.BeurteilungKriterien` (cols: `Id, BeurteilungId, KriteriumKey, Punkte`), and new columns `dbo.Benachrichtigungen.ZuweisungId` + widened `Typ NVARCHAR(40)`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================
-- Migration 015 – Beurteilungsbogen für Abteilungsdurchläufe
-- Ausführen gegen: Berichtsheft_Dev
--
-- Eine Beurteilung je Zuweisung (Rotationszeitraum). Kriterien in
-- Kindtabelle (nur Punkte 0–100; Stufe wird abgeleitet). Idempotent.
-- ============================================================

-- 1) Beurteilungen ------------------------------------------------
IF OBJECT_ID('dbo.Beurteilungen', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Beurteilungen (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    ZuweisungId             INT           NOT NULL,          -- dbo.Zuweisungen.Id
    AzubiOid                NVARCHAR(36)  NOT NULL,          -- denormalisiert
    Status                  NVARCHAR(20)  NOT NULL CONSTRAINT DF_Beurteilungen_Status DEFAULT 'entwurf',
    IndividuelleBeurteilung NVARCHAR(MAX) NULL,
    GesamtPunkte            DECIMAL(5,2)  NULL,
    Note                    DECIMAL(2,1)  NULL,
    GespraechAm             DATE          NULL,
    BeurteiltVon            NVARCHAR(36)  NULL,
    AbgeschlossenAm         DATETIME2     NULL,
    KenntnisnahmeVon        NVARCHAR(36)  NULL,
    KenntnisnahmeAm         DATETIME2     NULL,
    KorrigiertVon           NVARCHAR(36)  NULL,
    KorrigiertAm            DATETIME2     NULL,
    ErstelltAm              DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    AktualisiertAm          DATETIME2     NULL,
    CONSTRAINT CK_Beurteilungen_Status CHECK (Status IN ('entwurf','abgeschlossen')),
    CONSTRAINT UQ_Beurteilungen_Zuweisung UNIQUE (ZuweisungId)
  );
  CREATE INDEX IX_Beurteilungen_AzubiOid ON dbo.Beurteilungen(AzubiOid);
  PRINT 'Tabelle dbo.Beurteilungen angelegt.';
END
ELSE PRINT 'dbo.Beurteilungen existiert bereits.';

-- 2) BeurteilungKriterien ----------------------------------------
IF OBJECT_ID('dbo.BeurteilungKriterien', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BeurteilungKriterien (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    BeurteilungId INT          NOT NULL,
    KriteriumKey  NVARCHAR(40) NOT NULL,
    Punkte        TINYINT      NOT NULL,   -- 0..100 (Stufe abgeleitet)
    CONSTRAINT FK_BeurtKrit_Beurteilung FOREIGN KEY (BeurteilungId)
      REFERENCES dbo.Beurteilungen(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_BeurtKrit UNIQUE (BeurteilungId, KriteriumKey)
  );
  PRINT 'Tabelle dbo.BeurteilungKriterien angelegt.';
END
ELSE PRINT 'dbo.BeurteilungKriterien existiert bereits.';

-- 3) Benachrichtigungen erweitern --------------------------------
-- 3a) Referenz auf die Zuweisung (die 'fällig'-Meldung entsteht, bevor
--     eine Beurteilungen-Zeile existiert -> Zuweisung statt Beurteilung).
IF COL_LENGTH('dbo.Benachrichtigungen', 'ZuweisungId') IS NULL
BEGIN
  ALTER TABLE dbo.Benachrichtigungen ADD ZuweisungId INT NULL;
  PRINT 'Spalte Benachrichtigungen.ZuweisungId ergänzt.';
END
ELSE PRINT 'Benachrichtigungen.ZuweisungId existiert bereits.';

-- 3b) Typ verbreitern (beurteilung_abgeschlossen = 24 Zeichen > 20).
--     Typ hat keinen CHECK-Constraint -> unkritisch.
IF COL_LENGTH('dbo.Benachrichtigungen', 'Typ') < 80   -- NVARCHAR(40) => 80 Bytes
BEGIN
  ALTER TABLE dbo.Benachrichtigungen ALTER COLUMN Typ NVARCHAR(40) NULL;
  PRINT 'Spalte Benachrichtigungen.Typ auf NVARCHAR(40) verbreitert.';
END
ELSE PRINT 'Benachrichtigungen.Typ ist bereits >= NVARCHAR(40).';
```

- [ ] **Step 2: Verify idempotency by re-reading the file**

Read the file back and confirm every `CREATE`/`ALTER` is inside an `IF ... IS NULL`/`IF COL_LENGTH ...` guard. (No DB connection is required to author it; it is hand-run against `Berichtsheft_Dev` by the operator. `COL_LENGTH` returns byte length → `NVARCHAR(40)` = 80.)

- [ ] **Step 3: Commit**

```bash
git add db/migrations/015_beurteilungen.sql
git commit -m "feat(beurteilung): DB-Schema (Migration 015) für Beurteilungsbögen"
```

---

### Task 2: Pure core — catalog, points→grade table, calculation (TDD)

**Files:**
- Create: `app/js/beurteilung-core.js`
- Test: `app/js/beurteilung-core.test.js`

**Interfaces:**
- Produces (on `window.Beurteilung` in the browser and via `module.exports` in Node):
  - `KRITERIEN`: `Array<{ key:string, block:'A'|'B'|'C', label:string, beschreibung:string, stufen:string[6] }>` (length 10, in form order).
  - `BLOECKE`: `{ A:{label,keys[]}, B:{...}, C:{...} }` derived from `KRITERIEN`.
  - `STUFEN`: `Array<{ stufe:1..6, min:number, max:number, verbal:string }>`.
  - `PUNKTE_ZU_NOTE`: `number[101]` (index = points 0..100 → grade e.g. `2.3`).
  - `stufeFuerPunkte(p:number): 1..6`.
  - `noteFuerPunkte(p:number): number` (grade for an integer point value; clamps 0..100).
  - `berechne(punkteByKey: Record<string,number|null>): { bloecke:{A:number,B:number,C:number}, summe:number, gesamt:number, note:number|null, vollstaendig:boolean }` — block averages use the fixed criteria count per block; `note` is `null` unless all 10 keys have a numeric value.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilung-core.js');

test('KRITERIEN hat 10 Einträge in Blöcken 3/3/4', () => {
  assert.equal(B.KRITERIEN.length, 10);
  assert.equal(B.KRITERIEN.filter(k => k.block === 'A').length, 3);
  assert.equal(B.KRITERIEN.filter(k => k.block === 'B').length, 3);
  assert.equal(B.KRITERIEN.filter(k => k.block === 'C').length, 4);
  B.KRITERIEN.forEach(k => assert.equal(k.stufen.length, 6, `${k.key} braucht 6 Stufentexte`));
});

test('stufeFuerPunkte bildet die IHK-Bänder ab', () => {
  assert.equal(B.stufeFuerPunkte(100), 1);
  assert.equal(B.stufeFuerPunkte(92), 1);
  assert.equal(B.stufeFuerPunkte(91), 2);
  assert.equal(B.stufeFuerPunkte(81), 2);
  assert.equal(B.stufeFuerPunkte(80), 3);
  assert.equal(B.stufeFuerPunkte(67), 3);
  assert.equal(B.stufeFuerPunkte(66), 4);
  assert.equal(B.stufeFuerPunkte(50), 4);
  assert.equal(B.stufeFuerPunkte(49), 5);
  assert.equal(B.stufeFuerPunkte(30), 5);
  assert.equal(B.stufeFuerPunkte(29), 6);
  assert.equal(B.stufeFuerPunkte(0), 6);
});

test('PUNKTE_ZU_NOTE hat 101 Einträge und trifft Stützstellen', () => {
  assert.equal(B.PUNKTE_ZU_NOTE.length, 101);
  assert.equal(B.noteFuerPunkte(100), 1.0);
  assert.equal(B.noteFuerPunkte(92), 1.4);
  assert.equal(B.noteFuerPunkte(85), 2.0);
  assert.equal(B.noteFuerPunkte(73), 3.0);
  assert.equal(B.noteFuerPunkte(50), 4.4);
  assert.equal(B.noteFuerPunkte(40), 5.0);
  assert.equal(B.noteFuerPunkte(29), 5.5);
  assert.equal(B.noteFuerPunkte(5), 6.0);
  assert.equal(B.noteFuerPunkte(0), 6.0);
});

test('berechne: alle 100 -> Gesamt 100, Note 1,0', () => {
  const p = {};
  B.KRITERIEN.forEach(k => { p[k.key] = 100; });
  const r = B.berechne(p);
  assert.equal(r.vollstaendig, true);
  assert.equal(r.bloecke.A, 100);
  assert.equal(r.bloecke.C, 100);
  assert.equal(r.summe, 300);
  assert.equal(r.gesamt, 100);
  assert.equal(r.note, 1.0);
});

test('berechne: Blöcke gleichgewichtet (⅓), nicht je Kriterium', () => {
  // A alle 90, B alle 90, C alle 60 -> ØA=90, ØB=90, ØC=60
  const p = {};
  B.KRITERIEN.forEach(k => { p[k.key] = (k.block === 'C') ? 60 : 90; });
  const r = B.berechne(p);
  assert.equal(r.bloecke.A, 90);
  assert.equal(r.bloecke.B, 90);
  assert.equal(r.bloecke.C, 60);
  assert.equal(r.summe, 240);
  assert.equal(r.gesamt, 80);       // 240/3
  assert.equal(r.note, B.noteFuerPunkte(80)); // 2,5
});

test('berechne: unvollständig -> note null, vollstaendig false', () => {
  const p = { auffassungsgabe: 90 };
  const r = B.berechne(p);
  assert.equal(r.vollstaendig, false);
  assert.equal(r.note, null);
});

test('berechne: kaufmännische Rundung des Gesamtwerts', () => {
  // Gesamt 82,5 -> round -> 83 -> Note 2,2
  // Konstruiere ØA=82,5 ØB=82,5 ØC=82,5 => summe 247,5 gesamt 82,5
  const p = {};
  B.KRITERIEN.forEach(k => { p[k.key] = 82; });         // alle 82 -> gesamt 82 -> Note noteFuerPunkte(82)
  // separat: prüfe Rundung direkt über noteFuerPunkte-Aufruf im berechne
  const r = B.berechne(p);
  assert.equal(r.gesamt, 82);
  assert.equal(r.note, B.noteFuerPunkte(82)); // 2,3
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test app/js/beurteilung-core.test.js`
Expected: FAIL — `Cannot find module './beurteilung-core.js'`.

- [ ] **Step 3: Implement the pure core**

Create `app/js/beurteilung-core.js`. Transcribe the six `stufen` texts per criterion **verbatim from spec §4.4** (only `auffassungsgabe` is shown fully below as the template — fill the other nine with the exact same shape and the texts from the spec):

```js
/* ===================================================================
   BEURTEILUNG-CORE.JS – Kriterienkatalog, IHK-Punkte→Note-Tabelle und
   Rechenlogik des Beurteilungsbogens. Dual-mode: Browser (window.Beurteilung)
   UND Node (module.exports, für Tests + Backend-Wiederverwendung).
   KEIN document/window-Zugriff auf Modulebene – nur in Funktionen.
   =================================================================== */
(function (root) {
  'use strict';

  // Kriterienkatalog (Reihenfolge = Bogen). stufen[0]=Stufe 1 … stufen[5]=Stufe 6.
  // Volltexte siehe docs/superpowers/specs/2026-07-07-beurteilungsbogen-design.md §4.4.
  const KRITERIEN = [
    { key: 'auffassungsgabe', block: 'A', label: 'Auffassungsgabe',
      beschreibung: 'Sicherheit und Schnelligkeit beim Erfassen von Lerninhalten und -situationen, im Begreifen von Zusammenhängen',
      stufen: [
        'Auch schwierige Sachverhalte werden schnell begriffen, Zusammenhänge klar erkannt, Einzeldaten gewichtet und zugeordnet.',
        'Schnelle Auffassungsgabe. Der Kern einer Sache wird rasch begriffen. Ist in der Lage, Wesentliches vom Unwesentlichen zu unterscheiden.',
        'Inhalt und Bedeutung eines Sachverhalts werden erfasst. Das Begriffene wird sachlich richtig eingeordnet.',
        'Anleitungen bzw. wiederholte Erklärungen sind notwendig, damit Lerninhalte und -situationen verstanden werden.',
        'Lerninhalte und -situationen werden selbst nach eingehender, wiederholter Erklärung nur unvollkommen verstanden.',
        'Lerninhalte und -situationen werden selbst nach eingehender, wiederholter Erklärung nicht verstanden.',
      ] },
    { key: 'transfervermoegen', block: 'A', label: 'Transfervermögen',
      beschreibung: 'Umsetzung vorhandener Erkenntnisse auf ähnliche Problemstellungen',
      stufen: [ /* 6 Texte aus Spec §4.4 (transfervermoegen) */ ] },
    { key: 'ausdauer', block: 'A', label: 'Ausdauer',
      beschreibung: 'Beharrlichkeit und Beständigkeit bei der Erledigung der gestellten Aufgaben und bei der Erreichung der Ausbildungsziele',
      stufen: [ /* 6 Texte aus Spec §4.4 (ausdauer) */ ] },
    { key: 'zusammenarbeit', block: 'B', label: 'Zusammenarbeit',
      beschreibung: 'Verhalten im Kontakt mit Kollegen und Vorgesetzten. Fähigkeit zur Zusammenarbeit. Hilfsbereitschaft für andere und deren Unterstützung beim Lernen und Arbeiten',
      stufen: [ /* 6 Texte aus Spec §4.4 (zusammenarbeit) */ ] },
    { key: 'interesse_initiative', block: 'B', label: 'Interesse / Initiative',
      beschreibung: 'Interesse an der Aufgabe und Initiative, Gelerntes und eigene Fähigkeiten effektiv in der Praxis einzusetzen',
      stufen: [ /* 6 Texte aus Spec §4.4 (interesse_initiative) */ ] },
    { key: 'zuverlaessigkeit', block: 'B', label: 'Zuverlässigkeit',
      beschreibung: 'Bereitschaft, Vorschriften (beispielsweise zur Arbeitssicherheit), Anweisungen und Termine gewissenhaft einzuhalten und Verantwortung zu übernehmen',
      stufen: [ /* 6 Texte aus Spec §4.4 (zuverlaessigkeit) */ ] },
    { key: 'fertigkeiten', block: 'C', label: 'Fertigkeiten',
      beschreibung: 'Verfügen über die für den Ausbildungsprozess bzw. Ausbildungsabschnitt geforderten Fertigkeiten',
      stufen: [ /* 6 Texte aus Spec §4.4 (fertigkeiten) */ ] },
    { key: 'kenntnisse', block: 'C', label: 'Kenntnisse',
      beschreibung: 'Verfügen über die für den Ausbildungsprozess bzw. Ausbildungsabschnitt geforderten Kenntnisse',
      stufen: [ /* 6 Texte aus Spec §4.4 (kenntnisse) */ ] },
    { key: 'sorgfalt', block: 'C', label: 'Sorgfalt',
      beschreibung: 'Fähigkeiten, die im jeweiligen durchzuführenden Aufgaben planmäßig und sorgfältig, den Qualitätsanforderungen entsprechend auszuführen',
      stufen: [ /* 6 Texte aus Spec §4.4 (sorgfalt) */ ] },
    { key: 'lerntempo', block: 'C', label: 'Lerntempo / Zeitaufwand',
      beschreibung: 'Zeit, die – unter Berücksichtigung des Ausbildungsstandes – für den Erwerb von Fertigkeiten und Kenntnissen bzw. zur Erledigung gestellter Aufgaben benötigt wird',
      stufen: [ /* 6 Texte aus Spec §4.4 (lerntempo) */ ] },
  ];

  const BLOCK_LABELS = { A: 'Persönliche Kompetenz', B: 'Soziale Kompetenz', C: 'Fachkompetenz' };
  const BLOECKE = { A: { label: BLOCK_LABELS.A, keys: [] }, B: { label: BLOCK_LABELS.B, keys: [] }, C: { label: BLOCK_LABELS.C, keys: [] } };
  KRITERIEN.forEach(k => BLOECKE[k.block].keys.push(k.key));

  const STUFEN = [
    { stufe: 1, min: 92, max: 100, verbal: 'sehr gut' },
    { stufe: 2, min: 81, max: 91,  verbal: 'gut' },
    { stufe: 3, min: 67, max: 80,  verbal: 'befriedigend' },
    { stufe: 4, min: 50, max: 66,  verbal: 'ausreichend' },
    { stufe: 5, min: 30, max: 49,  verbal: 'mangelhaft' },
    { stufe: 6, min: 0,  max: 29,  verbal: 'ungenügend' },
  ];

  // Index = Punkte 0..100 → Schulnote. Quelle: Spec §4.3 (verifiziert).
  const PUNKTE_ZU_NOTE = [
    6.0,6.0,6.0,6.0,6.0,6.0,5.9,5.9,5.9,5.9, // 0–9
    5.9,5.9,5.8,5.8,5.8,5.8,5.8,5.7,5.7,5.7, // 10–19
    5.7,5.7,5.7,5.6,5.6,5.6,5.6,5.6,5.6,5.5, // 20–29
    5.4,5.4,5.3,5.3,5.2,5.2,5.1,5.1,5.0,5.0, // 30–39
    5.0,4.9,4.9,4.8,4.8,4.7,4.7,4.6,4.6,4.5, // 40–49
    4.4,4.4,4.3,4.3,4.2,4.1,4.1,4.0,4.0,3.9, // 50–59
    3.9,3.8,3.7,3.7,3.6,3.6,3.5,3.4,3.3,3.3, // 60–69
    3.2,3.1,3.1,3.0,2.9,2.9,2.8,2.7,2.7,2.6, // 70–79
    2.5,2.4,2.3,2.2,2.1,2.0,2.0,1.9,1.8,1.7, // 80–89
    1.6,1.5,1.4,1.4,1.3,1.3,1.2,1.2,1.1,1.1,1.0, // 90–100
  ];

  function clampPunkte(p) { p = Math.round(Number(p) || 0); return p < 0 ? 0 : (p > 100 ? 100 : p); }
  function stufeFuerPunkte(p) { p = clampPunkte(p); for (const s of STUFEN) if (p >= s.min) return s.stufe; return 6; }
  function noteFuerPunkte(p) { return PUNKTE_ZU_NOTE[clampPunkte(p)]; }

  // punkteByKey: { key: number|null }. Block-Ø über die FESTE Kriterienzahl.
  function berechne(punkteByKey) {
    punkteByKey = punkteByKey || {};
    const bloecke = {};
    let vollstaendig = true;
    for (const b of ['A', 'B', 'C']) {
      const keys = BLOECKE[b].keys;
      let sum = 0;
      for (const key of keys) {
        const v = punkteByKey[key];
        if (v === null || v === undefined || v === '' || isNaN(Number(v))) { vollstaendig = false; }
        else sum += clampPunkte(v);
      }
      bloecke[b] = keys.length ? sum / keys.length : 0;
    }
    const summe = bloecke.A + bloecke.B + bloecke.C;
    const gesamt = summe / 3;
    const note = vollstaendig ? noteFuerPunkte(Math.round(gesamt)) : null;
    return { bloecke, summe, gesamt, note, vollstaendig };
  }

  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, berechne };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node/Tests/Backend
  root.Beurteilung = Object.assign(root.Beurteilung || {}, api);             // Browser
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Fill in the nine remaining `stufen` arrays**

Copy the six stage sentences for each of `transfervermoegen, ausdauer, zusammenarbeit, interesse_initiative, zuverlaessigkeit, fertigkeiten, kenntnisse, sorgfalt, lerntempo` **verbatim** from spec §4.4 into the corresponding `stufen: [ ... ]` arrays (order: Stufe 1 → 6).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test app/js/beurteilung-core.test.js`
Expected: PASS (all tests). If `KRITERIEN … braucht 6 Stufentexte` fails, a `stufen` array is still empty from Step 4.

- [ ] **Step 6: Commit**

```bash
git add app/js/beurteilung-core.js app/js/beurteilung-core.test.js
git commit -m "feat(beurteilung): reines Kern-Modul (Katalog, Punkte→Note, Berechnung) + Tests"
```

---

### Task 3: Access helper `verantwortlichFuerZuweisung` (TDD)

**Files:**
- Modify: `backend/services/zugriff.js`
- Test: `backend/services/zugriff.test.js` (new)

**Interfaces:**
- Consumes: normalized `zuweisung = { azubiOid, verantwortlicherEmail }` and `kontext = { dauerAusbilderAzubiOids: string[] }` (same shapes `ladeKorrekturKontext` already produces).
- Produces: `verantwortlichFuerZuweisung(user, zuweisung, kontext): boolean` — email match (date-INdependent) OR permanent Ausbilder for that azubi. Exported from `zugriff.js`.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('./zugriff.js');

const user = { oid: 'u-1', email: 'Max.Muster@pm.com' };

test('verantwortlichFuerZuweisung: E-Mail matcht (case-insensitiv, datumsunabhängig)', () => {
  const zuw = { azubiOid: 'a-1', verantwortlicherEmail: 'max.muster@pm.com' };
  assert.equal(Z.verantwortlichFuerZuweisung(user, zuw, { dauerAusbilderAzubiOids: [] }), true);
});

test('verantwortlichFuerZuweisung: fremde E-Mail ohne Dauer-Zuordnung = false', () => {
  const zuw = { azubiOid: 'a-1', verantwortlicherEmail: 'other@pm.com' };
  assert.equal(Z.verantwortlichFuerZuweisung(user, zuw, { dauerAusbilderAzubiOids: [] }), false);
});

test('verantwortlichFuerZuweisung: dauerhafter Ausbilder des Azubis = true', () => {
  const zuw = { azubiOid: 'a-9', verantwortlicherEmail: 'other@pm.com' };
  assert.equal(Z.verantwortlichFuerZuweisung(user, zuw, { dauerAusbilderAzubiOids: ['a-9'] }), true);
});

test('verantwortlichFuerZuweisung: ohne email und ohne Dauer = false', () => {
  const zuw = { azubiOid: 'a-1', verantwortlicherEmail: '' };
  assert.equal(Z.verantwortlichFuerZuweisung({ oid: 'u-1', email: '' }, zuw, {}), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test backend/services/zugriff.test.js`
Expected: FAIL — `Z.verantwortlichFuerZuweisung is not a function`.

- [ ] **Step 3: Add the function and export it**

In `backend/services/zugriff.js`, add before `module.exports`:

```js
// Datums-UNABHÄNGIGE Verantwortlichkeit für GENAU EINE Zuweisung.
// Wird gebraucht, weil Beurteilungen NACH Ende des Durchlaufs (bis < heute)
// entstehen – aktivVerantwortlichFuer (datumsaktiv) würde hier fälschlich abweisen.
function verantwortlichFuerZuweisung(user, zuweisung, kontext) {
  if (!zuweisung) return false;
  const dauer = (kontext && kontext.dauerAusbilderAzubiOids) || [];
  if (zuweisung.azubiOid && dauer.includes(zuweisung.azubiOid)) return true;
  const email = (user && user.email || '').toLowerCase();
  return !!email && (zuweisung.verantwortlicherEmail || '').toLowerCase() === email;
}
```

Then add `verantwortlichFuerZuweisung` to the `module.exports` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test backend/services/zugriff.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/zugriff.js backend/services/zugriff.test.js
git commit -m "feat(beurteilung): datumsunabhängige Verantwortlichkeitsprüfung + Tests"
```

---

### Task 4: Backend service `beurteilungen.js`

**Files:**
- Create: `backend/services/beurteilungen.js`

**Interfaces:**
- Consumes: `getPool, sql` from `../db/connection`; `berechne` from `../../app/js/beurteilung-core.js`; `ladeKorrekturKontext` from `./zugriffContext`; `verantwortlichFuerZuweisung` from `./zugriff`; `getUserByOid` from `./users`.
- Produces (all async unless noted):
  - `ladeZuweisung(pool, zuweisungId) → { id, azubiOid, verantwortlicherEmail, abteilung, von, bis } | null`
  - `darfBeurteilen(user, zuweisung, pool) → boolean` (uses `verantwortlichFuerZuweisung` + developer/admin)
  - `getByZuweisung(pool, zuweisungId) → beurteilungObjekt | null` (incl. `kriterien:[{kriteriumKey,punkte}]`)
  - `listByAzubi(pool, azubiOid) → Array<{zuweisungId,status,note,gesamtPunkte,abgeschlossenAm}>`
  - `upsertEntwurf(pool, { zuweisungId, azubiOid, kriterien, individuelleBeurteilung, gespraechAm, autorOid }) → id`
  - `abschliessen(pool, id, autorOid) → void` (sets status, creates azubi notification)
  - `patchNachAbschluss(pool, id, { kriterien, individuelleBeurteilung, gespraechAm }, autorOid) → void` (re-notifies azubi)
  - `kenntnisnahme(pool, id, azubiOid) → void`
  - `ermittleUndErzeugeFaellige(pool, user) → Array<{zuweisungId,abteilung,von,bis,azubiOid}>`

- [ ] **Step 1: Implement the service**

```js
'use strict';
/* Persistenz + Logik für Beurteilungsbögen. Rechenkern wird aus dem
   Frontend-Kernmodul WIEDERVERWENDET (eine Wahrheit für die Mathematik). */
const { getPool, sql } = require('../db/connection');
const { berechne } = require('../../app/js/beurteilung-core.js');
const { ladeKorrekturKontext } = require('./zugriffContext');
const { verantwortlichFuerZuweisung } = require('./zugriff');

const heuteYmd = () => new Date().toISOString().slice(0, 10);

async function ladeZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('id', sql.Int, zuweisungId)
    .query('SELECT Id, AzubiOid, VerantwEmail, Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE Id = @id');
  const z = r.recordset[0];
  if (!z) return null;
  return {
    id: z.Id, azubiOid: z.AzubiOid, verantwortlicherEmail: z.VerantwEmail,
    abteilung: z.Abteilung, von: z.Von, bis: z.Bis,
  };
}

// Darf der Nutzer die Beurteilung dieser Zuweisung bearbeiten?
async function darfBeurteilen(user, zuweisung, pool) {
  if (!zuweisung) return false;
  if (user.role === 'developer' || user.role === 'admin') return true;
  const kontext = await ladeKorrekturKontext(pool, user);
  return verantwortlichFuerZuweisung(user, zuweisung, kontext);
}

async function ladeKriterien(pool, beurteilungId) {
  const r = await pool.request()
    .input('bid', sql.Int, beurteilungId)
    .query('SELECT KriteriumKey, Punkte FROM dbo.BeurteilungKriterien WHERE BeurteilungId = @bid');
  return r.recordset.map(x => ({ kriteriumKey: x.KriteriumKey, punkte: x.Punkte }));
}

async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query('SELECT * FROM dbo.Beurteilungen WHERE ZuweisungId = @zid');
  const b = r.recordset[0];
  if (!b) return null;
  b.kriterien = await ladeKriterien(pool, b.Id);
  return b;
}

async function listByAzubi(pool, azubiOid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT ZuweisungId, Status, Note, GesamtPunkte, AbgeschlossenAm FROM dbo.Beurteilungen WHERE AzubiOid = @oid');
  return r.recordset;
}

// Rechnet Gesamt/Note aus kriterien = [{kriteriumKey,punkte}].
function rechne(kriterien) {
  const byKey = {};
  (kriterien || []).forEach(k => { byKey[k.kriteriumKey] = k.punkte; });
  return berechne(byKey);
}

// Kriterien für eine Beurteilung neu setzen (delete-then-insert, wie Tage/Wochen).
async function schreibeKriterien(tx, beurteilungId, kriterien) {
  await new sql.Request(tx).input('bid', sql.Int, beurteilungId)
    .query('DELETE FROM dbo.BeurteilungKriterien WHERE BeurteilungId = @bid');
  for (const k of (kriterien || [])) {
    if (k.punkte === null || k.punkte === undefined || k.punkte === '') continue;
    await new sql.Request(tx)
      .input('bid', sql.Int, beurteilungId)
      .input('key', sql.NVarChar(40), k.kriteriumKey)
      .input('pkt', sql.TinyInt, Math.max(0, Math.min(100, Math.round(Number(k.punkte)))))
      .query('INSERT INTO dbo.BeurteilungKriterien (BeurteilungId, KriteriumKey, Punkte) VALUES (@bid,@key,@pkt)');
  }
}

async function upsertEntwurf(pool, { zuweisungId, azubiOid, kriterien, individuelleBeurteilung, gespraechAm }) {
  const calc = rechne(kriterien);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const up = await new sql.Request(tx)
      .input('zid', sql.Int, zuweisungId)
      .input('oid', sql.NVarChar(36), azubiOid)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .query(`
        MERGE dbo.Beurteilungen AS t
        USING (SELECT @zid AS ZuweisungId) AS s ON t.ZuweisungId = s.ZuweisungId
        WHEN MATCHED THEN UPDATE SET
          IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges, Note=@note,
          GespraechAm=@gespr, AktualisiertAm=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (ZuweisungId, AzubiOid, Status, IndividuelleBeurteilung, GesamtPunkte, Note, GespraechAm)
          VALUES (@zid, @oid, 'entwurf', @indiv, @ges, @note, @gespr)
        OUTPUT inserted.Id;
      `);
    const id = up.recordset[0].Id;
    await schreibeKriterien(tx, id, kriterien);
    await tx.commit();
    return id;
  } catch (e) { await tx.rollback(); throw e; }
}

// Serverseitige Mitteilung (inkl. ZuweisungId; kein offener Client-POST).
async function erzeugeBenachrichtigung(pool, { userOid, typ, zuweisungId, fromUserOid }) {
  if (!userOid) return; // Empfänger ohne OID (nie eingeloggt) -> später self-healing
  await pool.request()
    .input('userOid', sql.NVarChar(36), userOid)
    .input('typ', sql.NVarChar(40), typ)
    .input('zid', sql.Int, zuweisungId)
    .input('from', sql.NVarChar(36), fromUserOid || null)
    .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, ZuweisungId, FromUserOid)
            VALUES (@userOid,@typ,@zid,@from)`);
}

async function abschliessen(pool, id, autorOid) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  await pool.request()
    .input('id', sql.Int, id)
    .input('von', sql.NVarChar(36), autorOid)
    .query(`UPDATE dbo.Beurteilungen SET Status='abgeschlossen',
              AbgeschlossenAm=SYSUTCDATETIME(), BeurteiltVon=@von, AktualisiertAm=SYSUTCDATETIME()
            WHERE Id=@id`);
  await erzeugeBenachrichtigung(pool, {
    userOid: b.AzubiOid, typ: 'beurteilung_abgeschlossen', zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
  });
}

async function patchNachAbschluss(pool, id, { kriterien, individuelleBeurteilung, gespraechAm }, autorOid) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  const calc = rechne(kriterien);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .input('von', sql.NVarChar(36), autorOid)
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr, KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
    await schreibeKriterien(tx, id, kriterien);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  await erzeugeBenachrichtigung(pool, {
    userOid: b.AzubiOid, typ: 'beurteilung_abgeschlossen', zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
  });
}

async function kenntnisnahme(pool, id, azubiOid) {
  await pool.request()
    .input('id', sql.Int, id)
    .input('oid', sql.NVarChar(36), azubiOid)
    .query(`UPDATE dbo.Beurteilungen SET KenntnisnahmeVon=@oid, KenntnisnahmeAm=SYSUTCDATETIME(),
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id AND AzubiOid=@oid`);
}

// Beendete Durchläufe des Nutzers ohne abgeschlossene Beurteilung -> Mitteilung anlegen (idempotent).
async function ermittleUndErzeugeFaellige(pool, user) {
  const email = String(user.email || '').toLowerCase();
  if (!email) return [];
  const r = await pool.request()
    .input('email', sql.NVarChar(255), email)
    .input('heute', sql.Date, heuteYmd())
    .query(`
      SELECT z.Id AS ZuweisungId, z.Abteilung, z.Von, z.Bis, z.AzubiOid
      FROM dbo.Zuweisungen z
      LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id AND b.Status = 'abgeschlossen'
      WHERE z.VerantwEmail = @email AND z.Bis IS NOT NULL AND z.Bis < @heute AND b.Id IS NULL
      ORDER BY z.Bis DESC`);
  for (const z of r.recordset) {
    const exists = await pool.request()
      .input('userOid', sql.NVarChar(36), user.oid)
      .input('zid', sql.Int, z.ZuweisungId)
      .query(`SELECT TOP 1 Id FROM dbo.Benachrichtigungen
              WHERE UserOid=@userOid AND Typ='beurteilung_faellig' AND ZuweisungId=@zid`);
    if (!exists.recordset.length) {
      await erzeugeBenachrichtigung(pool, {
        userOid: user.oid, typ: 'beurteilung_faellig', zuweisungId: z.ZuweisungId, fromUserOid: null,
      });
    }
  }
  return r.recordset.map(z => ({
    zuweisungId: z.ZuweisungId, abteilung: z.Abteilung, von: z.Von, bis: z.Bis, azubiOid: z.AzubiOid,
  }));
}

module.exports = {
  ladeZuweisung, darfBeurteilen, getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
};
```

- [ ] **Step 2: Smoke-test the `require` graph loads (no DOM crash from the dual-mode core)**

Run: `node -e "require('./backend/services/beurteilungen.js'); console.log('ok')"`
Expected: prints `ok`. If it throws `document is not defined`, the core touches DOM at module scope — fix Task 2 (DOM only inside functions).

- [ ] **Step 3: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): Backend-Service (Persistenz, Berechnung, Mitteilungen, Fälligkeit)"
```

---

### Task 5: Backend route `/api/beurteilungen` + mount

**Files:**
- Create: `backend/routes/beurteilungen.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: the Task 4 service; `getPool` from `../db/connection`.
- Produces HTTP: `GET /api/beurteilungen?zuweisungId=`, `GET /api/beurteilungen?azubiOid=`, `GET /api/beurteilungen/faellig`, `POST /api/beurteilungen`, `PATCH /api/beurteilungen/:id/abschliessen`, `PATCH /api/beurteilungen/:id`, `PATCH /api/beurteilungen/:id/kenntnisnahme`.

- [ ] **Step 1: Implement the router**

```js
const router = require('express').Router();
const { getPool } = require('../db/connection');
const svc = require('../services/beurteilungen');

// GET /api/beurteilungen?zuweisungId=..  | ?azubiOid=..
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { zuweisungId, azubiOid } = req.query;

    if (azubiOid) {
      // Azubi darf nur die EIGENE Liste sehen; Verantwortliche/dev jede.
      const eigen = req.user.oid === azubiOid;
      const darf = eigen || req.user.istAusbilder || req.user.kannPlanen
                 || req.user.role === 'developer' || req.user.role === 'admin';
      if (!darf) return res.status(403).json({ error: 'Kein Zugriff.' });
      let list = await svc.listByAzubi(pool, azubiOid);
      if (eigen && !req.user.istAusbilder && req.user.role !== 'developer' && req.user.role !== 'admin') {
        list = list.filter(b => b.Status === 'abgeschlossen'); // Azubi sieht nur Abgeschlossene
      }
      return res.json(list);
    }

    if (zuweisungId) {
      const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
      if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
      const darfBearbeiten = await svc.darfBeurteilen(req.user, zuw, pool);
      const istAzubiOwner = req.user.oid === zuw.azubiOid;
      if (!darfBearbeiten && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
      const b = await svc.getByZuweisung(pool, Number(zuweisungId));
      // Azubi sieht die Beurteilung erst, wenn abgeschlossen.
      if (istAzubiOwner && !darfBearbeiten && (!b || b.Status !== 'abgeschlossen')) return res.json(null);
      return res.json(b);
    }

    return res.status(400).json({ error: 'zuweisungId oder azubiOid erforderlich.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/beurteilungen/faellig  -> beendete Durchläufe ohne Abschluss (+ legt Mitteilungen an)
router.get('/faellig', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await svc.ermittleUndErzeugeFaellige(pool, req.user));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/beurteilungen  { zuweisungId, kriterien:[{kriteriumKey,punkte}], individuelleBeurteilung, gespraechAm }
router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { zuweisungId, kriterien, individuelleBeurteilung, gespraechAm } = req.body;
    const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
    if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    if (!(await svc.darfBeurteilen(req.user, zuw, pool))) return res.status(403).json({ error: 'Kein Beurteilungsrecht.' });
    const id = await svc.upsertEntwurf(pool, {
      zuweisungId: zuw.id, azubiOid: zuw.azubiOid, kriterien, individuelleBeurteilung, gespraechAm,
    });
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Gemeinsame Autorisierung für PATCH auf :id (Verantwortliche/dev).
async function ladeUndAutorisiere(req, res) {
  const pool = await getPool();
  const cur = await pool.request();
  const r = await cur.query(`SELECT b.Id, b.ZuweisungId, b.AzubiOid FROM dbo.Beurteilungen b WHERE b.Id = ${Number(req.params.id) || 0}`);
  const b = r.recordset[0];
  if (!b) { res.status(404).json({ error: 'Beurteilung nicht gefunden.' }); return null; }
  const zuw = await svc.ladeZuweisung(pool, b.ZuweisungId);
  if (!(await svc.darfBeurteilen(req.user, zuw, pool))) { res.status(403).json({ error: 'Kein Beurteilungsrecht.' }); return null; }
  return { pool, b, zuw };
}

// PATCH /api/beurteilungen/:id/abschliessen
router.patch('/:id/abschliessen', async (req, res) => {
  try {
    const ctx = await ladeUndAutorisiere(req, res); if (!ctx) return;
    await svc.abschliessen(ctx.pool, ctx.b.Id, req.user.oid);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/beurteilungen/:id   (Korrektur nach Abschluss)
router.patch('/:id', async (req, res) => {
  try {
    const ctx = await ladeUndAutorisiere(req, res); if (!ctx) return;
    const { kriterien, individuelleBeurteilung, gespraechAm } = req.body;
    await svc.patchNachAbschluss(ctx.pool, ctx.b.Id, { kriterien, individuelleBeurteilung, gespraechAm }, req.user.oid);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/beurteilungen/:id/kenntnisnahme  (nur der Azubi selbst)
router.patch('/:id/kenntnisnahme', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', require('../db/connection').sql.Int, Number(req.params.id))
      .query('SELECT AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
    const row = r.recordset[0];
    if (!row) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    if (row.AzubiOid !== req.user.oid) return res.status(403).json({ error: 'Nur der Azubi kann bestätigen.' });
    await svc.kenntnisnahme(pool, Number(req.params.id), req.user.oid);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `backend/server.js`**

Find the block of `app.use('/api/...', devAuth, ...Router)` lines. Add the require near the other route requires and this line alongside the others:

```js
const beurteilungenRouter = require('./routes/beurteilungen');
// ... in the mount block:
app.use('/api/beurteilungen', devAuth, beurteilungenRouter);
```

- [ ] **Step 3: Start the server and smoke-test the endpoints**

Run (from `backend/`): `npm run dev` (leave running). Pick an existing responsible user's OID from `dbo.Users` (call it `<OID>`) and an existing `zuweisungId` with `Bis < today` (call it `<ZID>`).

PowerShell:
```powershell
$h = @{ 'X-Dev-OID' = '<OID>' }
Invoke-RestMethod -Uri 'http://localhost:3000/api/beurteilungen/faellig' -Headers $h
Invoke-RestMethod -Uri 'http://localhost:3000/api/beurteilungen?zuweisungId=<ZID>' -Headers $h
```
Expected: `/faellig` returns a JSON array (possibly containing `<ZID>`); `?zuweisungId=<ZID>` returns `null` (no evaluation yet) — no 500. Verify a `beurteilung_faellig` row now exists: re-calling `/faellig` must NOT create a duplicate (query `SELECT COUNT(*) FROM dbo.Benachrichtigungen WHERE Typ='beurteilung_faellig' AND ZuweisungId=<ZID>` stays at 1).

- [ ] **Step 4: Commit**

```bash
git add backend/routes/beurteilungen.js backend/server.js
git commit -m "feat(beurteilung): /api/beurteilungen Endpunkte + Route-Mount"
```

---

### Task 6: API client methods in `api.js`

**Files:**
- Modify: `app/js/api.js`

**Interfaces:**
- Produces on `DB`: `getBeurteilung(zuweisungId) → obj|null`, `getBeurteilungenFuerAzubi(azubiOid) → [{zuweisungId,status,note,gesamtPunkte,abgeschlossenAm}]`, `getFaelligeBeurteilungen() → [...]`, `saveBeurteilungEntwurf(payload) → id`, `abschliessenBeurteilung(id)`, `patchBeurteilung(id,payload)`, `kenntnisnahmeBeurteilung(id)`. Plus `normalizeBeurteilung(b)`.

- [ ] **Step 1: Add the normalizer** (after `normalizeBenachrichtigung`, ~line 164)

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
  };
}
```

- [ ] **Step 2: Add DB methods** (inside the `DB` object, before the closing `}` after the Benachrichtigungen block ~line 628)

```js
  /* Beurteilungen */
  async getBeurteilung(zuweisungId) {
    const data = await apiFetch(`/beurteilungen?zuweisungId=${encodeURIComponent(zuweisungId)}`);
    return normalizeBeurteilung(data);
  },
  async getBeurteilungenFuerAzubi(azubiOid) {
    const data = await apiFetch(`/beurteilungen?azubiOid=${encodeURIComponent(azubiOid)}`);
    return data.map(b => ({
      zuweisungId: b.ZuweisungId, status: b.Status,
      note: b.Note != null ? Number(b.Note) : null,
      gesamtPunkte: b.GesamtPunkte != null ? Number(b.GesamtPunkte) : null,
      abgeschlossenAm: b.AbgeschlossenAm ?? null,
    }));
  },
  async getFaelligeBeurteilungen() {
    try { return await apiFetch('/beurteilungen/faellig'); } catch (e) { return []; }
  },
  async saveBeurteilungEntwurf(payload) {
    const data = await apiFetch('/beurteilungen', { method: 'POST', body: payload });
    return data.id;
  },
  async abschliessenBeurteilung(id) {
    await apiFetch(`/beurteilungen/${id}/abschliessen`, { method: 'PATCH' });
  },
  async patchBeurteilung(id, payload) {
    await apiFetch(`/beurteilungen/${id}`, { method: 'PATCH', body: payload });
  },
  async kenntnisnahmeBeurteilung(id) {
    await apiFetch(`/beurteilungen/${id}/kenntnisnahme`, { method: 'PATCH' });
  },
```

- [ ] **Step 3: Browser smoke-test**

With `npm run dev` running, open http://localhost:3000, log in (dev-login) as a responsible `.demo` user, open DevTools console:
```js
await DB.getFaelligeBeurteilungen()
```
Expected: resolves to an array (no throw). Confirms the client↔route wiring.

- [ ] **Step 4: Commit**

```bash
git add app/js/api.js
git commit -m "feat(beurteilung): api.js DB-Methoden + Normalizer"
```

---

### Task 7: `renderForm` + criteria-catalog modal in the core (DOM)

**Files:**
- Modify: `app/js/beurteilung-core.js`

**Interfaces:**
- Consumes: the pure exports from Task 2 (via closure within the same file).
- Produces on `window.Beurteilung`: `renderForm(container, { kopf, punkteByKey, individuell, gespraechAm, editable }) → { getState():{kriterien,individuelleBeurteilung,gespraechAm}, refresh() }` and `openKatalogModal()`. `renderForm` draws the header, the A/B/C grid (6 stage radios + a points input per criterion, bidirectionally coupled), the live footer (block Ø / Summe / Gesamt / Note), the free-text field and the `GespraechAm` date; in read-only mode inputs are disabled.

- [ ] **Step 1: Add DOM helpers inside the IIFE** (before the `const api = {...}` line)

```js
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmtNote(n) { return n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  // Zeichnet EIN Kriterium (Zeile): 6 Stufen-Radios + Punkte-Feld, gekoppelt.
  function kriteriumRowHtml(k, punkte, editable) {
    const dis = editable ? '' : 'disabled';
    const st = STUFEN.map(s =>
      `<label class="beurt-stufe" title="${esc(s.verbal)} (${s.max}–${s.min})">
         <input type="radio" name="stufe_${k.key}" value="${s.stufe}" ${dis}>
         <span>${s.stufe}</span></label>`).join('');
    return `
      <tr class="beurt-row" data-key="${k.key}">
        <th class="beurt-row__krit"><span class="beurt-row__label">${esc(k.label)}</span></th>
        <td class="beurt-row__stufen">${st}</td>
        <td class="beurt-row__pkt">
          <input type="number" min="0" max="100" step="1" class="beurt-pkt-input"
                 data-key="${k.key}" value="${(punkte ?? '') === '' ? '' : esc(punkte)}" ${dis} aria-label="Punkte ${esc(k.label)}">
        </td>
      </tr>`;
  }

  function blockHtml(block, punkteByKey, editable) {
    const rows = BLOECKE[block].keys.map(key => {
      const k = KRITERIEN.find(x => x.key === key);
      return kriteriumRowHtml(k, punkteByKey[key], editable);
    }).join('');
    return `
      <tbody class="beurt-block" data-block="${block}">
        <tr class="beurt-block__head"><th colspan="3">${block} · ${esc(BLOCK_LABELS[block])}</th></tr>
        ${rows}
        <tr class="beurt-block__sum"><th colspan="2">Summe Punkte : Anzahl Kriterien (${BLOECKE[block].keys.length})</th>
            <td class="beurt-block__avg" data-block-avg="${block}">0,0</td></tr>
      </tbody>`;
  }
```

- [ ] **Step 2: Add `renderForm` and `openKatalogModal`**

```js
  function renderForm(container, opts) {
    const o = opts || {};
    const editable = !!o.editable;
    const punkteByKey = Object.assign({}, o.punkteByKey || {});
    const kopf = o.kopf || {};
    const dis = editable ? '' : 'disabled';

    container.innerHTML = `
      <div class="beurt">
        <div class="beurt__kopf">
          <div><span class="beurt__label">Name, Vorname</span><div class="beurt__val">${esc(kopf.name)}</div></div>
          <div><span class="beurt__label">Abteilung</span><div class="beurt__val">${esc(kopf.abteilung)}</div></div>
          <div><span class="beurt__label">Zeitraum</span><div class="beurt__val">${esc(kopf.zeitraum)}</div></div>
          <div><span class="beurt__label">Beurteilende/-r</span><div class="beurt__val">${esc(kopf.beurteilende)}</div></div>
          <div><span class="beurt__label">Ausbildungs-/Studienberuf</span><div class="beurt__val">${esc(kopf.beruf)}</div></div>
          <button type="button" class="btn btn--ghost beurt__katalog-btn" id="beurtKatalogBtn">Kriterienkatalog</button>
        </div>
        <table class="beurt-table">
          <thead><tr><th>Beurteilungskriterien</th>
            <th>Beurteilungsstufen<br><span class="beurt-th-sub">1&nbsp;=&nbsp;100–92 … 6&nbsp;=&nbsp;29–0</span></th>
            <th>Punkte</th></tr></thead>
          ${blockHtml('A', punkteByKey, editable)}
          ${blockHtml('B', punkteByKey, editable)}
          ${blockHtml('C', punkteByKey, editable)}
        </table>
        <div class="beurt-fuss">
          <div><span>Summe (ØA + ØB + ØC)</span><b data-fuss="summe">0,0</b></div>
          <div><span>Beurteilungspunkte ÷ 3 = Gesamt</span><b data-fuss="gesamt">0,0</b></div>
          <div class="beurt-fuss__note"><span>Note</span><b data-fuss="note">–</b></div>
        </div>
        <div class="beurt-indiv">
          <label class="beurt__label" for="beurtIndiv">Individuelle Beurteilung</label>
          <textarea id="beurtIndiv" rows="6" ${dis}>${esc(o.individuell || '')}</textarea>
        </div>
        <div class="beurt-gespraech">
          <label class="beurt__label" for="beurtGespraech">Beurteilungsgespräch geführt am</label>
          <input type="date" id="beurtGespraech" value="${esc(o.gespraechAm || '')}" ${dis}>
        </div>
      </div>`;

    // Initiale Stufen-Markierung aus vorhandenen Punkten.
    KRITERIEN.forEach(k => {
      const p = punkteByKey[k.key];
      if (p !== '' && p != null && !isNaN(Number(p))) markStufe(k.key, stufeFuerPunkte(p));
    });

    function markStufe(key, stufe) {
      container.querySelectorAll(`input[name="stufe_${key}"]`).forEach(r => { r.checked = (Number(r.value) === stufe); });
    }
    function currentPunkte() {
      const map = {};
      container.querySelectorAll('.beurt-pkt-input').forEach(inp => {
        const v = inp.value === '' ? null : clampPunkte(inp.value);
        map[inp.dataset.key] = v;
      });
      return map;
    }
    function refresh() {
      const map = currentPunkte();
      const r = berechne(map);
      for (const b of ['A', 'B', 'C']) {
        const el = container.querySelector(`[data-block-avg="${b}"]`); if (el) el.textContent = fmt1(r.bloecke[b]);
      }
      container.querySelector('[data-fuss="summe"]').textContent = fmt1(r.summe);
      container.querySelector('[data-fuss="gesamt"]').textContent = fmt1(r.gesamt);
      container.querySelector('[data-fuss="note"]').textContent = fmtNote(r.note);
    }

    if (editable) {
      // Punkte-Eingabe -> Stufe automatisch markieren + neu rechnen.
      container.querySelectorAll('.beurt-pkt-input').forEach(inp => {
        inp.addEventListener('input', () => {
          if (inp.value !== '') { inp.value = String(clampPunkte(inp.value)); markStufe(inp.dataset.key, stufeFuerPunkte(inp.value)); }
          refresh();
        });
      });
      // Stufe klicken -> Punkte in den Bandbereich ziehen (nur wenn außerhalb), dann rechnen.
      container.querySelectorAll('.beurt-stufe input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
          const key = radio.name.slice('stufe_'.length);
          const stufe = Number(radio.value);
          const band = STUFEN.find(s => s.stufe === stufe);
          const inp = container.querySelector(`.beurt-pkt-input[data-key="${key}"]`);
          const cur = inp.value === '' ? null : clampPunkte(inp.value);
          if (cur == null || cur < band.min || cur > band.max) inp.value = String(band.max); // Bandobergrenze als Default
          refresh();
        });
      });
    }
    refresh();

    document.getElementById('beurtKatalogBtn')?.addEventListener('click', openKatalogModal);

    return {
      refresh,
      getState() {
        return {
          kriterien: KRITERIEN.map(k => ({ kriteriumKey: k.key, punkte: currentPunkte()[k.key] }))
                              .filter(x => x.punkte != null),
          individuelleBeurteilung: (document.getElementById('beurtIndiv')?.value || ''),
          gespraechAm: (document.getElementById('beurtGespraech')?.value || ''),
        };
      },
    };
  }

  function openKatalogModal() {
    let ov = document.getElementById('beurtKatalogModal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'beurtKatalogModal';
      ov.className = 'modal-overlay';
      const blocks = ['A', 'B', 'C'].map(b => `
        <h3>${b} · ${esc(BLOCK_LABELS[b])}</h3>
        ${BLOECKE[b].keys.map(key => {
          const k = KRITERIEN.find(x => x.key === key);
          return `<div class="katalog-krit"><b>${esc(k.label)}</b><div class="katalog-krit__desc">${esc(k.beschreibung)}</div>
            <ol class="katalog-krit__stufen">${k.stufen.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
        }).join('')}`).join('');
      ov.innerHTML = `<div class="modal modal--lg"><div class="modal__head"><h2>Kriterienkatalog</h2>
        <button class="modal__close" type="button" data-modal-close aria-label="Schließen">×</button></div>
        <div class="modal__body beurt-katalog">${blocks}</div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-modal-close]')) ov.classList.remove('open'); });
    }
    ov.classList.add('open');
  }
```

- [ ] **Step 3: Export the DOM functions**

Add `renderForm` and `openKatalogModal` to the `const api = {...}` object.

- [ ] **Step 4: Re-run the pure tests (guard against regressions)**

Run: `node --test app/js/beurteilung-core.test.js`
Expected: PASS (DOM functions are not exercised by the node tests; adding them must not break the pure exports or the `require` at Step 2 of Task 4).

- [ ] **Step 5: Commit**

```bash
git add app/js/beurteilung-core.js
git commit -m "feat(beurteilung): Formular-Rendering + Kriterienkatalog-Modal im Kernmodul"
```

---

### Task 8: Standalone page `beurteilung.html` + controller + CSS (edit + read-only)

**Files:**
- Create: `app/beurteilung.html`, `app/js/beurteilung.js`, `app/css/beurteilung.css`

**Interfaces:**
- Consumes: `DB.*` (Task 6), `window.Beurteilung.renderForm/openKatalogModal` (Task 7), `DateUtil`, `Toast`, `PMTheme`.
- Produces: a working page at `beurteilung.html?zuw=<id>` that resolves role (edit vs read-only), renders the form, and (edit) saves a draft.

- [ ] **Step 1: Create `app/beurteilung.html`** (standalone shell, modeled on `abteilungsdurchlauf.html`)

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Beurteilung – Putzmeister</title>
  <script src="js/theme.js"></script>
  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/glass.css">
  <link rel="stylesheet" href="css/abteilungsdurchlauf.css">
  <link rel="stylesheet" href="css/beurteilung.css">
  <link rel="stylesheet" href="css/theme-hyperspace.css">
  <link rel="stylesheet" href="css/theme-cmd.css">
  <link rel="stylesheet" href="css/theme-candy.css">
  <link rel="stylesheet" href="css/theme-iceland.css">
  <link rel="stylesheet" href="css/theme-silk.css">
  <link rel="stylesheet" href="css/theme-halloween.css">
  <link rel="stylesheet" href="css/theme-christmas.css">
  <link rel="stylesheet" href="css/themes.css">
</head>
<body class="dh-page beurt-page">
<header class="dh-topbar">
  <a class="dh-topbar__brand" id="beurtBack" href="#" aria-label="Zurück">
    <img src="../Corporate Design/Digital Logo_png/Social Logo/200 x 200 px.png" alt="Putzmeister" class="dh-topbar__logo" onerror="this.style.display='none'">
    <span class="dh-topbar__brand-text">Beurteilung</span>
  </a>
  <div class="dh-topbar__spacer"></div>
  <button class="dh-topbar__theme" id="dhThemeToggle" type="button" aria-label="Hell-/Dunkel-Modus umschalten" title="Hell / Dunkel">
    <svg class="dh-theme-sun" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <svg class="dh-theme-moon" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/></svg>
  </button>
</header>
<main class="dh-main" id="mainContent"><div class="beurt-loading">Beurteilung wird geladen …</div></main>
<script src="js/abteilungen-helpers.js"></script>
<script src="js/api.js"></script>
<script src="js/icons.js"></script>
<script src="js/app.js"></script>
<script src="js/beurteilung-core.js"></script>
<script src="js/beurteilung.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `app/js/beurteilung.js`** (controller — load, resolve mode, render, save draft; abschließen/kenntnisnahme/PDF wired in Tasks 9–10)

```js
/* ===================================================================
   BEURTEILUNG.JS – Controller der Beurteilungsseite (beurteilung.html).
   Rollen-/Shell-bewusst: Verantwortliche bearbeiten, Azubi/DH lesen.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await DB.fetchCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }

  document.getElementById('dhThemeToggle')?.addEventListener('click', () => {
    if (window.PMTheme) window.PMTheme.set(window.PMTheme.get() === 'dark' ? 'light' : 'dark');
  });

  // DH-Studenten in eigener Optik (Body-Marker fürs CSS).
  if (user.istDhStudent) document.body.classList.add('beurt-page--dh');

  const zuw = new URLSearchParams(location.search).get('zuw');
  const back = () => {
    if (document.referrer && history.length > 1) history.back();
    else window.location.href = user.istDhStudent ? 'abteilungsdurchlauf.html' : 'azubi-planer.html';
  };
  document.getElementById('beurtBack')?.addEventListener('click', e => { e.preventDefault(); back(); });

  const main = document.getElementById('mainContent');
  if (!zuw) { main.innerHTML = `<div class="beurt-empty">Keine Zuweisung angegeben.</div>`; return; }

  let data;
  try { data = await loadContext(zuw); }
  catch (err) { main.innerHTML = `<div class="beurt-empty">${err.message || 'Beurteilung konnte nicht geladen werden.'}</div>`; return; }

  const { zuweisung, beurteilung, azubi, editable } = data;

  if (!editable && !beurteilung) {
    main.innerHTML = `<div class="beurt-empty">Für diesen Zeitraum liegt noch keine abgeschlossene Beurteilung vor.</div>`;
    return;
  }

  const kopf = {
    name: azubi ? azubi.name : '',
    abteilung: zuweisung.abteilung || '',
    zeitraum: `${DateUtil.formatDate(zuweisung.von)} – ${DateUtil.formatDate(zuweisung.bis)}`,
    beurteilende: zuweisung.verantwName || '',
    beruf: azubi ? (azubi.beruf || azubi.studiengang || '') : '',
  };
  const punkteByKey = {};
  (beurteilung?.kriterien || []).forEach(k => { punkteByKey[k.kriteriumKey] = k.punkte; });

  main.innerHTML = `
    <div class="page-header"><h1 class="page-title">Beurteilungsbogen</h1>
      <span class="badge ${beurteilung?.status === 'abgeschlossen' ? 'badge--genehmigt' : 'badge--grey'}">
        ${beurteilung?.status === 'abgeschlossen' ? 'Abgeschlossen' : (beurteilung ? 'Entwurf' : 'Neu')}</span></div>
    <div id="beurtFormHost"></div>
    <div class="beurt-actions" id="beurtActions"></div>`;

  const form = window.Beurteilung.renderForm(document.getElementById('beurtFormHost'), {
    kopf, punkteByKey, individuell: beurteilung?.individuelleBeurteilung || '',
    gespraechAm: beurteilung?.gespraechAm || '', editable,
  });

  renderActions({ user, zuweisung, beurteilung, azubi, editable, form }); // defined in Tasks 9–10
});

// Lädt Zuweisung (via Azubi-Liste), bestehende Beurteilung, Azubi-User und leitet den Modus ab.
async function loadContext(zuweisungId) {
  const beurteilung = await DB.getBeurteilung(zuweisungId);      // null erlaubt
  // Zuweisung selbst: aus der Azubi-/Verantwortlichen-Liste beziehen – wir kennen den Azubi erst über die Beurteilung
  // ODER über die Zuweisungsliste. Robust: Zuweisung über den dedizierten Endpoint der Beurteilung mitliefern.
  const zuweisung = await resolveZuweisung(zuweisungId, beurteilung);
  if (!zuweisung) throw new Error('Zuweisung nicht gefunden.');
  const me = DB.getCurrentUser();
  const azubi = await DB.getUser(zuweisung.azubiId);
  // editable, wenn ich verantwortlich bin (E-Mail-Match) ODER developer/admin – der Server prüft es endgültig.
  const email = (me.email || '').toLowerCase();
  const editable = me.role === 'developer' || me.role === 'admin'
    || (!!zuweisung.verantwEmail && zuweisung.verantwEmail.toLowerCase() === email)
    || (me.istAusbilder && !me.istAzubi && me.oid !== zuweisung.azubiId);
  return { zuweisung, beurteilung, azubi, editable: !!editable && me.oid !== zuweisung.azubiId };
}

// Zuweisung robust auflösen: bevorzugt über die Azubi-Zuweisungen des aktuellen Users bzw. der betreuten Azubis.
async function resolveZuweisung(zuweisungId, beurteilung) {
  const me = DB.getCurrentUser();
  const azubiId = beurteilung?.azubiId || me.oid;
  const listen = [];
  try { listen.push(await DB.getZuweisungenFuerAzubi(azubiId)); } catch (e) {}
  if (me.email) { try { listen.push(await DB.getZuweisungenFuerVerantw(me.email)); } catch (e) {} }
  const alle = [].concat(...listen);
  return alle.find(z => String(z.id) === String(zuweisungId)) || null;
}
```

> Note on `editable`: the client value is a UX hint only — every write endpoint re-authorizes server-side (Task 5 `darfBeurteilen`). The Azubi-owner is always read-only (`me.oid !== zuweisung.azubiId`).

- [ ] **Step 3: Create `app/css/beurteilung.css`** (functional styling using existing tokens; visual polish verified in Step 5)

```css
/* Beurteilungsbogen – Formular + Print. Nutzt Design-Tokens (variables.css). */
.beurt-page .dh-main { max-width: 1000px; margin: 0 auto; padding: var(--sp-5, 24px); }
.beurt-loading, .beurt-empty { padding: var(--sp-6, 32px); text-align: center; color: var(--pm-grey-500, #888); }
.beurt__kopf { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-3, 12px); margin-bottom: var(--sp-4, 16px); }
.beurt__label { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--pm-grey-500, #888); }
.beurt__val { font-weight: 600; }
.beurt__katalog-btn { grid-column: 1 / -1; justify-self: start; }
.beurt-table { width: 100%; border-collapse: collapse; margin: var(--sp-3,12px) 0; }
.beurt-table th, .beurt-table td { border: 1px solid var(--pm-grey-300, #d5d5d5); padding: 6px 8px; text-align: left; vertical-align: middle; }
.beurt-th-sub { font-weight: 400; font-size: 10px; color: var(--pm-grey-500,#888); }
.beurt-block__head th { background: var(--pm-grey-100, #f0f0f0); font-weight: 700; }
.beurt-block__sum td, .beurt-block__sum th { background: var(--pm-grey-50, #f7f7f7); font-weight: 700; }
.beurt-row__stufen { white-space: nowrap; }
.beurt-stufe { display: inline-flex; flex-direction: column; align-items: center; margin-right: 8px; font-size: 11px; cursor: pointer; }
.beurt-pkt-input { width: 64px; padding: 4px 6px; }
.beurt-fuss { display: flex; flex-wrap: wrap; gap: var(--sp-4,16px); justify-content: flex-end; margin: var(--sp-3,12px) 0; }
.beurt-fuss > div { display: flex; gap: 8px; align-items: baseline; }
.beurt-fuss__note b { font-size: 20px; color: var(--pm-yellow-700, #b58900); }
.beurt-indiv textarea { width: 100%; }
.beurt-actions { display: flex; gap: var(--sp-3,12px); flex-wrap: wrap; margin-top: var(--sp-4,16px); }
.beurt-katalog { max-height: 70vh; overflow-y: auto; }
.katalog-krit { margin-bottom: var(--sp-3,12px); }
.katalog-krit__desc { font-style: italic; color: var(--pm-grey-500,#888); margin: 2px 0 4px; }
/* DH-Variante: leicht andere Optik (kompakter Kopf) */
.beurt-page--dh .beurt__kopf { grid-template-columns: 1fr; }
```

- [ ] **Step 4: Run the app and verify edit + read-only rendering**

Run `npm run dev`. As a responsible `.demo` user, open `http://localhost:3000/beurteilung.html?zuw=<ZID>` for an ended rotation you own. Verify: header auto-fills (name/Abteilung/Zeitraum/Beurteilende/Beruf), the A/B/C grid shows 10 criteria, typing a points value auto-selects the matching stage and updates block Ø / Summe / Gesamt / Note live, "Kriterienkatalog" opens the modal with all 10 criteria × 6 stage texts. Then log in as the **Azubi owner** and open the same URL: fields are disabled and (until finalized) the "noch keine abgeschlossene Beurteilung" message shows.

- [ ] **Step 5: Verify with the webapp-testing skill / browser automation**

Use the `webapp-testing` skill (or Playwright MCP) to load the page as the responsible user, type points into all 10 criteria, and assert the footer "Note" equals `window.Beurteilung.berechne(<those points>).note` formatted `de-DE`. Fix any coupling/calc wiring mismatch.

- [ ] **Step 6: Commit**

```bash
git add app/beurteilung.html app/js/beurteilung.js app/css/beurteilung.css
git commit -m "feat(beurteilung): eigenständige Seite (Edit + Read-only) + Styles"
```

---

### Task 9: Save draft, finalize, corrections, and Kenntnisnahme actions

**Files:**
- Modify: `app/js/beurteilung.js`

**Interfaces:**
- Consumes: `form.getState()`, `DB.saveBeurteilungEntwurf/abschliessenBeurteilung/patchBeurteilung/kenntnisnahmeBeurteilung`, `Toast`.
- Produces: `renderActions(ctx)` (referenced in Task 8 Step 2) rendering the correct buttons per role/status and wiring their handlers.

- [ ] **Step 1: Implement `renderActions`** (append to `app/js/beurteilung.js`)

```js
function renderActions(ctx) {
  const { zuweisung, beurteilung, editable, form, user } = ctx;
  const host = document.getElementById('beurtActions');
  if (!host) return;
  let id = beurteilung?.id || null;
  const status = beurteilung?.status || (editable ? 'neu' : null);

  if (editable) {
    const abgeschlossen = status === 'abgeschlossen';
    host.innerHTML = `
      <button class="btn btn--secondary" id="beurtSave">Entwurf speichern</button>
      <button class="btn btn--primary" id="beurtFinish">${abgeschlossen ? 'Änderungen speichern' : 'Abschließen'}</button>
      <button class="btn btn--ghost" id="beurtPdf">Als PDF</button>`;

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
      try {
        if (abgeschlossen) {
          await DB.patchBeurteilung(id, st);
          Toast.success('Aktualisiert', 'Beurteilung wurde aktualisiert (Azubi wird informiert).');
        } else {
          if (!id) id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
          await DB.abschliessenBeurteilung(id);
          Toast.success('Abgeschlossen', 'Beurteilung abgeschlossen. Der Azubi wurde benachrichtigt.');
        }
        setTimeout(() => location.reload(), 800);
      } catch (e) { Toast.error('Fehler', e.message); }
    });

    document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx)); // Task 10
    return;
  }

  // Read-only (Azubi/DH): Kenntnisnahme + PDF.
  const bestaetigt = !!beurteilung?.kenntnisnahmeAm;
  host.innerHTML = `
    <button class="btn btn--primary" id="beurtAck" ${bestaetigt ? 'disabled' : ''}>
      ${bestaetigt ? 'Kenntnisnahme bestätigt' : 'Kenntnisnahme bestätigen'}</button>
    <button class="btn btn--ghost" id="beurtPdf">Als PDF</button>`;
  document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
  if (!bestaetigt) {
    document.getElementById('beurtAck').addEventListener('click', async () => {
      try {
        await DB.kenntnisnahmeBeurteilung(beurteilung.id);
        Toast.success('Bestätigt', 'Kenntnisnahme wurde vermerkt.');
        setTimeout(() => location.reload(), 800);
      } catch (e) { Toast.error('Fehler', e.message); }
    });
  }
}
```

- [ ] **Step 2: Add the "Berichte des Zeitraums" link** (in `renderActions`, edit branch — append to the `host.innerHTML` button list)

Add this button to the edit-branch `host.innerHTML` (after `beurtPdf`):
```html
      <button class="btn btn--ghost" id="beurtBerichte">Berichte des Zeitraums ansehen/korrigieren</button>
```
And wire it (after the `beurtPdf` handler in the edit branch):
```js
    document.getElementById('beurtBerichte').addEventListener('click', () => {
      // Verantwortliche landen in der Wochenansicht beim betreffenden Azubi.
      sessionStorage.setItem('gotoAzubiId', String(zuweisung.azubiId));
      const von = new Date(zuweisung.von + 'T00:00:00');
      if (!isNaN(von)) {
        const kw = DateUtil.getKW ? DateUtil.getKW(von) : null;
        if (kw) { sessionStorage.setItem('gotoKW', String(kw)); sessionStorage.setItem('gotoYear', String(von.getFullYear())); }
      }
      window.location.href = 'wochenansicht.html';
    });
```

- [ ] **Step 3: Verify the finalize flow end-to-end (browser)**

As the responsible user on `beurteilung.html?zuw=<ZID>`: fill all 10 criteria → "Entwurf speichern" (Toast success) → reload shows status **Entwurf** with values persisted → "Abschließen" → reload shows status **Abgeschlossen**. Then as the Azubi owner open the same URL: form is read-only with the values, "Kenntnisnahme bestätigen" works and disables after reload. Verify a `beurteilung_abgeschlossen` notification row exists for the azubi (`SELECT * FROM dbo.Benachrichtigungen WHERE Typ='beurteilung_abgeschlossen' AND ZuweisungId=<ZID>`).

- [ ] **Step 4: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): Entwurf/Abschließen/Korrektur/Kenntnisnahme + Berichte-Link"
```

---

### Task 10: PDF export (print-HTML, mirrors the paper form)

**Files:**
- Modify: `app/js/beurteilung.js`

**Interfaces:**
- Consumes: `window.Beurteilung.KRITERIEN/BLOECKE/BLOCK_LABELS/STUFEN/berechne/stufeFuerPunkte`, `form.getState()` (edit) or the stored `beurteilung` (read-only), `DateUtil`, `Toast`.
- Produces: `exportBeurteilungPdf(ctx)` — opens a print-ready A4 popup and calls `window.print()`, following `berichtsheft-export.js`.

- [ ] **Step 1: Implement `exportBeurteilungPdf`** (append to `app/js/beurteilung.js`)

```js
function exportBeurteilungPdf(ctx) {
  const { zuweisung, beurteilung, azubi, form } = ctx;
  const B = window.Beurteilung;

  // Punkte: im Edit-Modus der Live-Stand, sonst der gespeicherte.
  const punkteByKey = {};
  if (form) { form.getState().kriterien.forEach(k => { punkteByKey[k.kriteriumKey] = k.punkte; }); }
  else { (beurteilung?.kriterien || []).forEach(k => { punkteByKey[k.kriteriumKey] = k.punkte; }); }
  const indiv = form ? form.getState().individuelleBeurteilung : (beurteilung?.individuelleBeurteilung || '');
  const gespraech = form ? form.getState().gespraechAm : (beurteilung?.gespraechAm || '');
  const r = B.berechne(punkteByKey);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const f1 = n => (Math.round(n * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const rowsFor = block => B.BLOECKE[block].keys.map(key => {
    const k = B.KRITERIEN.find(x => x.key === key);
    const p = punkteByKey[key];
    const stufe = (p == null || p === '') ? null : B.stufeFuerPunkte(p);
    const cells = B.STUFEN.map(s => `<td class="mark">${stufe === s.stufe ? '✕' : ''}</td>`).join('');
    return `<tr><th class="krit">${esc(k.label)}</th>${cells}<td class="pkt">${p ?? ''}</td></tr>`;
  }).join('');
  const blockSum = block => f1(r.bloecke[block]);

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Beurteilung – ${esc(azubi?.name || '')}</title><style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family:'Open Sans','Segoe UI',Arial,sans-serif; color:#1A1A1A; font-size:10.5pt; background:#5b5b5b; margin:0; }
  .toolbar { position:sticky; top:0; background:#1A1A1A; color:#fff; padding:10px 16px; }
  .toolbar button { background:#FFC300; border:0; border-radius:8px; padding:8px 16px; font-weight:700; cursor:pointer; }
  .sheet { width:210mm; min-height:297mm; background:#fff; margin:14px auto; padding:14mm; box-shadow:0 6px 24px rgba(0,0,0,.35); }
  h1 { font-size:15pt; margin:0 0 4mm; }
  table { border-collapse:collapse; width:100%; }
  .stamm td { padding:1.5mm 3mm; font-size:9.5pt; border:1px solid #999; }
  .grid th, .grid td { border:1px solid #999; padding:1.5mm 2mm; font-size:8.5pt; vertical-align:middle; }
  .grid .krit { text-align:left; width:34%; }
  .grid .mark { text-align:center; width:8%; font-weight:700; }
  .grid .blk th { background:#efefef; text-align:left; }
  .grid .sum td, .grid .sum th { background:#f6f6f6; font-weight:700; }
  .fuss { margin-top:4mm; text-align:right; }
  .fuss .note { font-size:14pt; font-weight:700; }
  .indiv { border:1px solid #999; padding:3mm; margin-top:4mm; min-height:30mm; white-space:pre-wrap; }
  .sign { display:flex; justify-content:space-between; margin-top:16mm; gap:8mm; }
  .sign div { flex:1; border-top:1px solid #333; padding-top:2mm; font-size:8pt; text-align:center; }
  @media print { @page { size:A4; margin:0; } body { background:#fff; } .toolbar { display:none; } .sheet { margin:0; box-shadow:none; } }
</style></head><body>
  <div class="toolbar"><button type="button" onclick="window.print()">Als PDF speichern / Drucken</button></div>
  <section class="sheet">
    <h1>Beurteilungsbogen für Auszubildende und DH-Studenten</h1>
    <table class="stamm"><tr><td><b>Name, Vorname:</b> ${esc(azubi?.name || '')}</td><td><b>Abteilung:</b> ${esc(zuweisung.abteilung || '')}</td></tr>
      <tr><td><b>Zeitraum:</b> ${esc(DateUtil.formatDate(zuweisung.von))} – ${esc(DateUtil.formatDate(zuweisung.bis))}</td>
          <td><b>Beurteilende/-r:</b> ${esc(zuweisung.verantwName || '')}</td></tr>
      <tr><td colspan="2"><b>Ausbildungs-/Studienberuf:</b> ${esc(azubi?.beruf || azubi?.studiengang || '')}</td></tr></table>
    <table class="grid" style="margin-top:4mm">
      <thead><tr><th>Beurteilungskriterien</th>${B.STUFEN.map(s => `<th>${s.stufe}<br><small>${s.max}–${s.min}</small></th>`).join('')}<th>Punkte</th></tr></thead>
      <tbody>
        <tr class="blk"><th colspan="8">A · ${esc(B.BLOCK_LABELS.A)}</th></tr>${rowsFor('A')}
        <tr class="sum"><th colspan="7">Summe : Anzahl Kriterien (${B.BLOECKE.A.keys.length})</th><td>${blockSum('A')}</td></tr>
        <tr class="blk"><th colspan="8">B · ${esc(B.BLOCK_LABELS.B)}</th></tr>${rowsFor('B')}
        <tr class="sum"><th colspan="7">Summe : Anzahl Kriterien (${B.BLOECKE.B.keys.length})</th><td>${blockSum('B')}</td></tr>
        <tr class="blk"><th colspan="8">C · ${esc(B.BLOCK_LABELS.C)}</th></tr>${rowsFor('C')}
        <tr class="sum"><th colspan="7">Summe : Anzahl Kriterien (${B.BLOECKE.C.keys.length})</th><td>${blockSum('C')}</td></tr>
      </tbody>
    </table>
    <div class="fuss">
      <div>Summe (ØA+ØB+ØC): <b>${f1(r.summe)}</b></div>
      <div>Beurteilungspunkte ÷ 3 = Gesamt: <b>${f1(r.gesamt)}</b></div>
      <div class="note">Note: ${r.note == null ? '–' : r.note.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
    </div>
    <div><b>Individuelle Beurteilung:</b><div class="indiv">${esc(indiv)}</div></div>
    <div class="sign">
      <div>Unterschrift des/r Beurteilenden</div>
      <div>Unterschrift des/r Ausbildungsleiters/-in</div>
      <div>Unterschrift des/r Auszubildenden</div>
    </div>
    <p style="margin-top:6mm;font-size:8.5pt">Beurteilungsgespräch durchgeführt und Kopie erhalten am:
      ${gespraech ? esc(DateUtil.formatDate(gespraech)) : '________________'}</p>
  </section>
  <script>if (window.self===window.top){window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},300);});}<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { Toast.error('Pop-up blockiert', 'Bitte Pop-ups erlauben und erneut versuchen.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}
```

- [ ] **Step 2: Verify the PDF (browser)**

On `beurteilung.html?zuw=<ZID>` with all 10 criteria filled, click "Als PDF". A new tab opens showing the A4 sheet: header data, A/B/C grid with an `✕` in the correct stage column per criterion, block sums, Summe/Gesamt/Note matching the on-page footer, individual text, signature lines, and the "Gespräch … am" line. The print dialog auto-opens.

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): PDF-Export im Print-HTML-Muster"
```

---

### Task 11: Tile badges + click → beurteilung page (azubi-planer & DH)

**Files:**
- Modify: `app/js/azubi-planer.js`, `app/js/abteilungsdurchlauf.js`

**Interfaces:**
- Consumes: `DB.getBeurteilungenFuerAzubi(azubiOid)`.
- Produces: rotation tiles link to `beurteilung.html?zuw=<z.id>` and show a status badge; entry point for all three roles.

- [ ] **Step 1: `azubi-planer.js` — make `durchlaufBodyHtml` badge-aware and clickable**

Replace the `durchlaufBodyHtml(azubiId)` function (currently ~lines 118–138) with:

```js
async function durchlaufBodyHtml(azubiId) {
  const heute = DateUtil.toISODate(new Date());
  const planYear = new Date().getFullYear();
  const zuw = (await DB.getZuweisungenFuerAzubi(azubiId))
    .slice().sort((a, b) => (a.von || '').localeCompare(b.von || ''));
  let beurtByZuw = {};
  try {
    (await DB.getBeurteilungenFuerAzubi(azubiId)).forEach(b => { beurtByZuw[b.zuweisungId] = b; });
  } catch (e) { /* Endpoint evtl. nicht verfügbar -> ohne Badges weiter */ }

  const card = z => {
    const s = durchlaufStatus(z, heute);
    const b = beurtByZuw[z.id];
    const beendet = z.bis && z.bis < heute;
    let beurtBadge = '', klickbar = false;
    if (b && b.status === 'abgeschlossen') { beurtBadge = `<span class="badge badge--genehmigt durchlauf-card__beurt">Beurteilung ✓</span>`; klickbar = true; }
    else if (beendet && (b && b.status === 'entwurf')) { beurtBadge = `<span class="badge badge--freigegeben durchlauf-card__beurt">Entwurf</span>`; klickbar = true; }
    else if (beendet) { beurtBadge = `<span class="badge badge--grey durchlauf-card__beurt">Beurteilung offen</span>`; klickbar = true; }
    return `
    <div class="durchlauf-card${s.label === 'Aktuell' ? ' durchlauf-card--current' : ''}${klickbar ? ' durchlauf-card--clickable' : ''}"
         ${klickbar ? `data-zuw="${z.id}" role="button" tabindex="0"` : ''}>
      <span class="badge ${s.badge} durchlauf-card__badge">${s.label}</span>
      <div class="durchlauf-card__abt">${escHtml(z.abteilung) || '–'}</div>
      <div class="durchlauf-card__zeit">${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}</div>
      <div class="durchlauf-card__verantw">Ansprechpartner: <strong>${escHtml(z.verantwName || '–')}</strong></div>
      ${beurtBadge}
    </div>`;
  };
  return `
    ${zuw.length ? azubiTimelineHtml(zuw, planYear) : ''}
    ${zuw.length
      ? `<div class="durchlauf-list">${zuw.map(card).join('')}</div>`
      : `<div class="durchlauf-empty">Aktuell keine Abteilung zugewiesen.</div>`}`;
}

// Kachel-Klick -> Beurteilungsseite (Delegation; einmal pro Render aufrufen).
function wireBeurteilungKacheln(root) {
  (root || document).querySelectorAll('.durchlauf-card--clickable').forEach(el => {
    const go = () => { window.location.href = `beurteilung.html?zuw=${el.dataset.zuw}`; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}
```

- [ ] **Step 2: Call `wireBeurteilungKacheln` after each durchlauf render**

In `renderAzubiDurchlauf`, after `scrollDurchlaufToToday();` (inside the `try`), add: `wireBeurteilungKacheln(main);`
In `renderAusbilderDurchlauf`'s inner `renderFor`, after `scrollDurchlaufToToday();`, add: `wireBeurteilungKacheln(main);`

- [ ] **Step 3: DH page `abteilungsdurchlauf.js` — same badge + click**

In `abteilungsdurchlauf.js`, load the evaluations once (after `const zuw = ...` in the DOMContentLoaded try, ~line 54):
```js
    let beurtByZuw = {};
    try { (await DB.getBeurteilungenFuerAzubi(user.id)).forEach(b => { beurtByZuw[b.zuweisungId] = b; }); } catch (e) {}
```
Replace `cardHtml(r)` (lines ~203–211) so a finalized evaluation makes the card clickable with a badge:
```js
  function cardHtml(r) {
    const b = beurtByZuw[r.z.id];
    const abgeschlossen = b && b.status === 'abgeschlossen';
    return `
      <div class="durchlauf-card${r.status.key === 'aktuell' ? ' durchlauf-card--current' : ''}${abgeschlossen ? ' durchlauf-card--clickable' : ''}"
           ${abgeschlossen ? `data-zuw="${r.z.id}" role="button" tabindex="0"` : ''}>
        <span class="badge ${r.status.badge} durchlauf-card__badge">${r.status.label}</span>
        <div class="durchlauf-card__abt">${esc(r.z.abteilung) || '–'}</div>
        <div class="durchlauf-card__zeit">${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}</div>
        <div class="durchlauf-card__verantw">Ansprechpartner: <strong>${esc(r.verantw)}</strong></div>
        ${abgeschlossen ? `<span class="badge badge--genehmigt durchlauf-card__beurt">Beurteilung ansehen</span>` : ''}
      </div>`;
  }
```
After the `main.innerHTML = ...` assignment (after the render), add:
```js
    main.querySelectorAll('.durchlauf-card--clickable').forEach(el => {
      el.addEventListener('click', () => { window.location.href = `beurteilung.html?zuw=${el.dataset.zuw}`; });
    });
```

- [ ] **Step 4: Add the minimal card CSS** (append to `app/css/beurteilung.css`)

```css
.durchlauf-card--clickable { cursor: pointer; }
.durchlauf-card--clickable:hover { box-shadow: 0 4px 16px rgba(0,0,0,.12); }
.durchlauf-card__beurt { display: inline-block; margin-top: 8px; }
```

- [ ] **Step 5: Verify (browser)**

As an Azubi with an ended, finalized rotation: open the Abteilungsdurchlauf tab → the tile shows "Beurteilung ✓" and clicking it opens the read-only page. As the responsible user in the Ausbilder durchlauf: an ended un-evaluated rotation shows "Beurteilung offen" and click opens the editable page. As a DH-student: same for finalized evaluations.

- [ ] **Step 6: Commit**

```bash
git add app/js/azubi-planer.js app/js/abteilungsdurchlauf.js app/css/beurteilung.css
git commit -m "feat(beurteilung): Kachel-Badges + Klick zur Beurteilungsseite (Azubi/Ausbilder/DH)"
```

---

### Task 12: Notifications — new types + fällig check on load

**Files:**
- Modify: `app/js/app.js`

**Interfaces:**
- Consumes: `DB.getFaelligeBeurteilungen()`, `DB.getZuweisungenFuerAzubi`/normalized notification `{type, zuweisungId?, azubiId, ...}`.
- Produces: notification items for `beurteilung_faellig`/`beurteilung_abgeschlossen` render with correct icon/title and deep-link to `beurteilung.html?zuw=<zuweisungId>`; a one-shot fällig check runs on load for responsibles.

- [ ] **Step 1: Carry `ZuweisungId` through the notification normalizer**

In `app/js/api.js` `normalizeBenachrichtigung` (Task 6 area), add `zuweisungId: b.ZuweisungId ?? null,` to the returned object. (The `GET /api/benachrichtigungen` already does `SELECT b.*`, so `ZuweisungId` is present.)

- [ ] **Step 2: Add icon + title + click branches in `initNotifications`** (`app/js/app.js`)

In the `ICON` map (~line 283) add:
```js
    beurteilung_faellig: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    beurteilung_abgeschlossen: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
```

In `renderItem` (~line 288), replace the fixed `isApproved`-based title/icon logic with type-aware branches. Insert at the top of `renderItem` (before the existing `const isApproved` line), and use `beurtTitle`/iconType when set:
```js
    if (b.type === 'beurteilung_faellig' || b.type === 'beurteilung_abgeschlossen') {
      const faellig = b.type === 'beurteilung_faellig';
      const title = faellig ? 'Beurteilung fällig' : 'Neue Beurteilung liegt vor';
      const meta = relativeTime(b.timestamp);
      return `
        <button type="button" class="notif-item${b.gelesen ? '' : ' notif-item--unread'}" data-id="${b.id}" data-zuw="${b.zuweisungId || ''}" data-nav="beurteilung">
          <span class="notif-item__icon notif-item__icon--${faellig ? 'error' : 'success'}">${ICON[b.type]}</span>
          <span class="notif-item__body"><span class="notif-item__title">${title}</span><span class="notif-item__meta">${meta}</span></span>
          ${b.gelesen ? '' : '<span class="notif-item__dot" aria-label="ungelesen"></span>'}
        </button>`;
    }
```

In the click handler (~line 349), branch on the new nav target before the wochenansicht navigation:
```js
        if (el.dataset.nav === 'beurteilung') {
          const zuw = el.dataset.zuw;
          if (zuw) { window.location.href = `beurteilung.html?zuw=${zuw}`; return; }
        }
```

- [ ] **Step 3: Run the fällig check on load** (inside `initNotifications`, just before the final `await render();`)

```js
  // Für Verantwortliche: fällige Beurteilungen ermitteln (legt serverseitig Mitteilungen an).
  if (user && (user.istAusbilder || user.kannPlanen)) {
    try { await DB.getFaelligeBeurteilungen(); } catch (e) { /* nicht blockierend */ }
  }
```

- [ ] **Step 4: Verify (browser)**

As a responsible user with an ended un-evaluated rotation: reload any sidebar page → the bell shows an unread "Beurteilung fällig" item; clicking it opens `beurteilung.html?zuw=…` in edit mode. After finalizing, log in as the Azubi → the bell shows "Neue Beurteilung liegt vor"; clicking opens the read-only page. Confirm no "KW undefined" text appears.

- [ ] **Step 5: Commit**

```bash
git add app/js/app.js app/js/api.js
git commit -m "feat(beurteilung): Mitteilungen (fällig/abgeschlossen) + Fälligkeitsprüfung beim Load"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- §3 Datenmodell → Task 1. §4.1/4.2 Berechnung + §4.3 Tabelle → Task 2. §4.4 Katalog → Task 2 (data) + Task 7 (modal). §5.1 Endpoints → Task 5. §5.2 Zugriffs-Sonderfall → Task 3 (+ used in Task 4/5). §5.3 Fälligkeit → Task 4 (`ermittleUndErzeugeFaellige`) + Task 12 (on-load call). §6.1 Seite → Task 8; §6.1 „Berichte ansehen/korrigieren" → Task 9 Step 2. §6.2 Kernmodul → Tasks 2+7. §6.3 Kachel-Anbindung + §6.4 Zustände → Task 11. §6.5 api.js → Task 6. §7 Mitteilungen → Task 12. §8 PDF → Task 10. Kenntnisnahme (§2) → Tasks 5+9. **No gaps.**
- **Verification approach:** pure logic (calc, access) is TDD'd with `node --test`; DB/route and all UI are verified by documented manual/browser steps (this codebase has no HTTP/DB integration-test harness — only `node:test` unit tests — so route/UI tasks use runnable smoke tests instead of fabricated unit tests).

**2. Placeholder scan:** The only intentional "fill from spec" is Task 2 Step 4 (the nine `stufen` arrays) — this is a deliberate transcription step from the committed sibling spec §4.4 (avoids duplicating ~60 verbatim sentences in two docs), with the full shape shown via `auffassungsgabe` and an explicit per-key instruction. All code steps contain complete, runnable code. No "TBD/add error handling/similar to".

**3. Type consistency:** `berechne(punkteByKey)` returns `{bloecke,summe,gesamt,note,vollstaendig}` — consumed consistently in Tasks 7/10. Notification ref is `ZuweisungId`/`zuweisungId` end-to-end (migration → service insert → `SELECT b.*` → normalizer → click `data-zuw`). Service method names (`upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige, ladeZuweisung, darfBeurteilen, getByZuweisung, listByAzubi`) match their route callers. `DB` method names match `beurteilung.js` callers. Criteria keys identical across Task 1 (free-text), Task 2 (`KRITERIEN`), and storage.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-beurteilungsbogen.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
