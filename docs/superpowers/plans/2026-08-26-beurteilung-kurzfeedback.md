# Kurzfeedback bei kurzen Zuweisungen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zuweisungen von ≤14 Tagen bekommen statt der großen 10-Kriterien-Beurteilung automatisch ein leichtgewichtiges "Kurzfeedback" (3 Leitfragen als Freitext, keine Note, kein Kenntnisnahme-/Ausbildungsleiter-Schritt), das trotzdem in der App gespeichert, in den bestehenden Listen sichtbar und per Mail an Azubi + Ausbildungsleitung versendet wird.

**Architektur:** Die bestehende `Beurteilungen`-Tabelle wird um eine `Typ`-Spalte (`gross`/`kurz`) und 3 Freitext-Spalten erweitert — keine Parallelstruktur. Ein neuer, geteilter Pure-Function-Helfer `ermittleTyp(von, bis)` in `app/js/beurteilung-core.js` (dual-mode Browser/Node, wie `berechne`) entscheidet Client UND Server identisch anhand der Zuweisungsdauer. Backend-Service, Mail-Versand und Frontend-Rendering verzweigen an wenigen, klar markierten Stellen nach `Typ`.

**Tech Stack:** Node.js/Express, mssql (Tedious), Vanilla-JS-Frontend, `node:test`.

**Referenz:** [docs/superpowers/specs/2026-08-26-beurteilung-kurzfeedback-design.md](../specs/2026-08-26-beurteilung-kurzfeedback-design.md)

**Bewusste Scope-Grenzen (siehe Design-Spec §10 "Out of Scope" + Erkenntnisse aus der Code-Recherche):**
- Kein PDF-Export für Kurzfeedback (Button wird für `Typ='kurz'` ausgeblendet).
- Keine Signatur-Erfassung für Kurzfeedback (`abschliessenBeurteilung(id, null)`).
- Der Text im Ausbilder-eigenen Mitteilungs-Feed (`dashboard.js::buildAusbilderMitteilungen`, um Zeile 1489) bleibt generisch "Beurteilung abgeschlossen" (ohne Notenzusatz, da `b.note` für Kurzfeedback `null` ist) — kein Bug, nur nicht maximal präzise. Nicht Teil dieses Plans.
- Die "Beurteilung ausstehend"-Kachel auf `abteilungsdurchlauf.html` (vor Anlage eines Datensatzes) bleibt generisch, da `beurteilung-core.js` dort nicht geladen wird. Nur die "abgeschlossen"-Kachel auf `abteilungs-planer.html` wird Typ-spezifisch (dort ist `Typ` bereits über die Beurteilungen-Liste bekannt).
- Die Vollständigkeits-Prüfung der 3 Leitfragen läuft NUR clientseitig (Task 11),
  analog zur bestehenden 10-Kriterien-Prüfung der großen Beurteilung (die ebenfalls
  rein im Frontend liegt, `beurteilung.js:133` vor diesem Plan) — kein neuer
  Backend-Validierungspfad, der beim bestehenden Muster nicht existiert.
- Kein neuer automatisierter Test für `mailBeurteilung`/Mail-Versand — für
  `mail.js` existiert im Repo bislang keine Testdatei (nur der manuelle
  Selbsttest via `node services/mail.js`); dieser Plan bricht dieses Muster
  nicht auf, sondern verifiziert den Mailversand über Task 14 (E2E).

---

### Task 1: DB-Migration — `Typ` + Freitext-Spalten

**Files:**
- Create: `db/migrations/039_beurteilung_kurzfeedback.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 039 – Kurzfeedback für kurze Zuweisungen (<= 14 Tage)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Zweiter, leichtgewichtiger Beurteilungs-Typ: 3 Leitfragen als Freitext
-- statt der 10-Kriterien-Beurteilung, keine Note, kein Kenntnisnahme-/
-- Ausbildungsleiter-Schritt. Wiederverwendet dbo.Beurteilungen (Typ-Spalte)
-- statt einer Parallelstruktur, siehe Design-Spec
-- 2026-08-26-beurteilung-kurzfeedback-design.md. Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Beurteilungen', 'Typ') IS NULL
BEGIN
  ALTER TABLE dbo.Beurteilungen ADD
    Typ NVARCHAR(10) NOT NULL
      CONSTRAINT DF_Beurteilungen_Typ DEFAULT 'gross'
      CONSTRAINT CK_Beurteilungen_Typ CHECK (Typ IN ('gross', 'kurz')),
    KurzfeedbackEindruck         NVARCHAR(MAX) NULL,
    KurzfeedbackAuffaelligkeiten NVARCHAR(MAX) NULL,
    KurzfeedbackEmpfehlung       NVARCHAR(MAX) NULL;
  PRINT 'Spalten für Kurzfeedback auf dbo.Beurteilungen ergänzt.';
END
ELSE PRINT 'dbo.Beurteilungen hat die Spalte Typ bereits.';
```

- [ ] **Step 2: Gegen die lokale Dev-Datenbank ausführen und verifizieren**

Diese Migration kann NUR Kuniß einspielen (Dev-DB-Account hat keine DDL-Rechte).
Nach dem manuellen Einspielen verifizieren:

```sql
SELECT Typ, KurzfeedbackEindruck, KurzfeedbackAuffaelligkeiten, KurzfeedbackEmpfehlung
FROM dbo.Beurteilungen WHERE 1=0;  -- nur Spalten-Existenz prüfen, kein Datenzugriff nötig
```

Erwartet: Query läuft ohne Fehler (Spalten existieren), `Typ` hat Default `'gross'`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/039_beurteilung_kurzfeedback.sql
git commit -m "feat(beurteilung): Migration fuer Kurzfeedback-Typ + Freitextfelder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Geteilter Helfer `ermittleTyp` in `beurteilung-core.js`

**Files:**
- Modify: `app/js/beurteilung-core.js:144` (nach `noteFuerPunkte`, vor `formatPunkteGruppe`)
- Modify: `app/js/beurteilung-core.js:403` (Export-Objekt `api`)
- Test: `app/js/beurteilung-core.test.js`

- [ ] **Step 1: Failing Tests schreiben**

An das Ende von `app/js/beurteilung-core.test.js` anfügen:

```js
test('ermittleTyp: <=14 Tage (inklusive beider Enden) -> kurz, sonst gross', () => {
  assert.equal(B.ermittleTyp('2026-01-01', '2026-01-13'), 'kurz');   // 13 Tage
  assert.equal(B.ermittleTyp('2026-01-01', '2026-01-14'), 'kurz');   // 14 Tage (Grenzfall)
  assert.equal(B.ermittleTyp('2026-01-01', '2026-01-15'), 'gross');  // 15 Tage
});

test('ermittleTyp: ohne von/bis -> gross (konservativer Default)', () => {
  assert.equal(B.ermittleTyp(null, '2026-01-14'), 'gross');
  assert.equal(B.ermittleTyp('2026-01-01', null), 'gross');
  assert.equal(B.ermittleTyp(null, null), 'gross');
});
```

- [ ] **Step 2: Tests laufen lassen, sollen fehlschlagen**

Run: `node --test app/js/beurteilung-core.test.js`
Expected: FAIL — `B.ermittleTyp is not a function`

- [ ] **Step 3: `ermittleTyp` implementieren**

In `app/js/beurteilung-core.js`, direkt nach der Zeile mit `function noteFuerPunkte(p) { ... }` (Zeile 144) einfügen:

```js

  // Schwelle für den vereinfachten "Kurzfeedback"-Prozess (siehe Design-Spec
  // 2026-08-26-beurteilung-kurzfeedback-design.md): Zuweisungen bis
  // einschließlich 14 Tage bekommen statt der großen Beurteilung 3 freie
  // Leitfragen ohne Note. von/bis: Date-Objekte ODER 'YYYY-MM-DD'-Strings
  // (Backend liefert SQL-Date-Objekte, Frontend meist Strings — new Date()
  // versteht beide). Ohne von/bis konservativ 'gross' (voller Prozess).
  const MS_PRO_TAG = 24 * 60 * 60 * 1000;
  function ermittleTyp(von, bis) {
    if (!von || !bis) return 'gross';
    const tage = Math.round((new Date(bis) - new Date(von)) / MS_PRO_TAG) + 1; // inklusive
    return tage <= 14 ? 'kurz' : 'gross';
  }
```

Im Export-Objekt `api` (Zeile 403) `ermittleTyp` ergänzen:

```js
  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, formatPunkteGruppe, notenschluesselZeilen, ermittleTyp, berechne, renderForm, openKatalogModal, openNotenschluesselModal };
```

- [ ] **Step 4: Tests laufen lassen, sollen bestehen**

Run: `node --test app/js/beurteilung-core.test.js`
Expected: PASS, alle Tests inkl. der 2 neuen grün.

- [ ] **Step 5: Commit**

```bash
git add app/js/beurteilung-core.js app/js/beurteilung-core.test.js
git commit -m "feat(beurteilung): ermittleTyp-Helfer fuer Kurzfeedback-Schwelle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend-Service — Lesepfade liefern `Typ` mit

**Files:**
- Modify: `backend/services/beurteilungen.js:5` (Import), `:86-121` (`getByZuweisung`), `:116-121` (`listByAzubi`), `:352-395` (`listMeineBeurteilbaren`), `:397-402` (Exports)

- [ ] **Step 1: Import erweitern**

In `backend/services/beurteilungen.js:5`:

```js
const { berechne, ermittleTyp } = require('../../app/js/beurteilung-core.js');
```

- [ ] **Step 2: `getByZuweisung` — SELECT um `Typ` + 3 Freitextfelder erweitern**

Ersetze die Query in `getByZuweisung` (Zeilen 87-94):

```js
async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query(`SELECT Id, ZuweisungId, AzubiOid, Status, Typ, IndividuelleBeurteilung, GesamtPunkte, Note,
              KurzfeedbackEindruck, KurzfeedbackAuffaelligkeiten, KurzfeedbackEmpfehlung,
              GespraechAm, BeurteiltVon, AbgeschlossenAm, KenntnisnahmeVon, KenntnisnahmeAm,
              KorrigiertVon, KorrigiertAm, ErstelltAm, AktualisiertAm,
              BeurteilerUnterschriftExt, KenntnisnahmeUnterschriftExt,
              AusbildungsleiterBestaetigtVon, AusbildungsleiterBestaetigtAm, AusbildungsleiterUnterschriftExt
            FROM dbo.Beurteilungen WHERE ZuweisungId = @zid`);
```

(Rest der Funktion unverändert.)

- [ ] **Step 3: `listByAzubi` — `Typ` mitliefern**

Ersetze `listByAzubi` (Zeilen 116-121):

```js
async function listByAzubi(pool, azubiOid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT ZuweisungId, Status, Typ, Note, GesamtPunkte, AbgeschlossenAm FROM dbo.Beurteilungen WHERE AzubiOid = @oid');
  return r.recordset;
}
```

- [ ] **Step 4: `listMeineBeurteilbaren` — `Typ` mitliefern, Fallback auf `ermittleTyp` solange keine Beurteilung existiert**

In `listMeineBeurteilbaren` (ab Zeile 377) die Query und das Mapping ersetzen:

```js
  const result = await r.query(`
    SELECT z.Id AS ZuweisungId, z.AzubiOid, z.Abteilung, z.Von, z.Bis, u.Name AS AzubiName,
           b.Status AS BeurteilungStatus, b.Typ AS BeurteilungTyp
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
    // Solange noch keine Beurteilungen-Zeile existiert (Typ ist dann NULL aus
    // dem LEFT JOIN), aus den Zuweisungsdaten selbst ableiten — so zeigt die
    // Liste den erwarteten Prozess auch VOR der ersten Entwurf-Anlage.
    typ: row.BeurteilungTyp || ermittleTyp(row.Von, row.Bis),
  }));
```

- [ ] **Step 5: `ermittleTyp` re-exportieren**

In `module.exports` (Zeilen 397-402) `ermittleTyp` ergänzen:

```js
module.exports = {
  ladeZuweisung, darfBeurteilen, darfBeurteilungBearbeiten, ermittleAusbildungsleiter, ermittleModus, ermittleTyp,
  getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren, ausbildungsleiterBestaetigen,
};
```

- [ ] **Step 6: Syntax-Check**

Run: `node -c backend/services/beurteilungen.js`
Expected: kein Output (Datei ist syntaktisch gültig).

- [ ] **Step 7: Bestehende Tests laufen lassen (Regression)**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: PASS, alle 4 bestehenden Tests weiterhin grün (unverändertes Verhalten von `darfBeurteilungBearbeiten`).

- [ ] **Step 8: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): Typ in Beurteilungs-Lesepfaden mitliefern

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Backend-Service — `upsertEntwurf` speichert Kurzfeedback-Felder

**Files:**
- Modify: `backend/services/beurteilungen.js:144-171` (`upsertEntwurf`)

- [ ] **Step 1: `upsertEntwurf` erweitern**

Ersetze die komplette Funktion:

```js
async function upsertEntwurf(pool, {
  zuweisungId, azubiOid, typ, kriterien, individuelleBeurteilung, gespraechAm,
  kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
}) {
  // Punkte/Note nur berechnen, wenn Kriterien mitgeschickt wurden (grosse
  // Beurteilung) — beim Kurzfeedback bleiben GesamtPunkte/Note NULL, ohne
  // dass diese Funktion selbst zwischen den beiden Typen unterscheiden muss:
  // jede Seite schickt ohnehin nur ihre eigenen Felder (siehe Route).
  const calc = (kriterien && kriterien.length) ? rechne(kriterien) : { gesamt: null, note: null };
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const up = await new sql.Request(tx)
      .input('zid', sql.Int, zuweisungId)
      .input('oid', sql.NVarChar(36), azubiOid)
      .input('typ', sql.NVarChar(10), typ || 'gross')
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .input('kfEindruck', sql.NVarChar(sql.MAX), kurzfeedbackEindruck ?? null)
      .input('kfAuff', sql.NVarChar(sql.MAX), kurzfeedbackAuffaelligkeiten ?? null)
      .input('kfEmpf', sql.NVarChar(sql.MAX), kurzfeedbackEmpfehlung ?? null)
      .query(`
        MERGE dbo.Beurteilungen AS t
        USING (SELECT @zid AS ZuweisungId) AS s ON t.ZuweisungId = s.ZuweisungId
        WHEN MATCHED THEN UPDATE SET
          IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges, Note=@note, GespraechAm=@gespr,
          KurzfeedbackEindruck=@kfEindruck, KurzfeedbackAuffaelligkeiten=@kfAuff, KurzfeedbackEmpfehlung=@kfEmpf,
          AktualisiertAm=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (ZuweisungId, AzubiOid, Status, Typ, IndividuelleBeurteilung, GesamtPunkte, Note, GespraechAm,
          KurzfeedbackEindruck, KurzfeedbackAuffaelligkeiten, KurzfeedbackEmpfehlung)
          VALUES (@zid, @oid, 'entwurf', @typ, @indiv, @ges, @note, @gespr, @kfEindruck, @kfAuff, @kfEmpf)
        OUTPUT inserted.Id;
      `);
    const id = up.recordset[0].Id;
    await schreibeKriterien(tx, id, kriterien);
    await tx.commit();
    return id;
  } catch (e) { await tx.rollback(); throw e; }
}
```

Hinweis: `Typ` wird NUR beim `INSERT` gesetzt, nicht beim `UPDATE` — ein bestehender
Datensatz behält seinen einmal vergebenen Typ für immer (siehe Design-Spec §8,
"kein nachträglicher Typwechsel").

- [ ] **Step 2: Syntax-Check**

Run: `node -c backend/services/beurteilungen.js`
Expected: kein Output.

- [ ] **Step 3: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): upsertEntwurf speichert Kurzfeedback-Freitext

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Backend-Service — Abschluss/Korrektur: Empfänger + Mail-Typ nach `Typ`

**Files:**
- Modify: `backend/services/beurteilungen.js` (neue Helfer + `abschliessen`, `patchNachAbschluss`)

- [ ] **Step 1: Zwei kleine Helfer ergänzen**

Direkt vor `async function abschliessen(...)` (Zeile 187) einfügen:

```js
const mailTypAbgeschlossen = (typ) => (typ === 'kurz' ? 'kurzfeedback_abgeschlossen' : 'beurteilung_abgeschlossen');
const mailTypFaellig = (typ) => (typ === 'kurz' ? 'kurzfeedback_faellig' : 'beurteilung_faellig');

// Empfänger für das "abgeschlossen"-Signal: immer der Azubi; beim
// Kurzfeedback zusätzlich die zuständige Ausbildungsleitung (rein
// informativ — anders als bei der großen Beurteilung gibt es dafür keinen
// eigenen Bestätigungsschritt, siehe Design-Spec §5).
async function ermittleAbschlussEmpfaenger(pool, b) {
  if (b.Typ !== 'kurz') return [b.AzubiOid];
  const ausbildungsleiterOid = await ermittleAusbildungsleiter(pool, b.AzubiOid);
  return [b.AzubiOid, ausbildungsleiterOid].filter(Boolean);
}
```

- [ ] **Step 2: `abschliessen` auf mehrere Empfänger + typ-abhängigen Mail-Typ umstellen**

Ersetze die komplette Funktion:

```js
async function abschliessen(pool, id, autorOid, signatur) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid, Typ FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  const empfaengerOids = await ermittleAbschlussEmpfaenger(pool, b);
  // Status-Update UND Mitteilungen atomar: schlägt ein Benachrichtigungs-
  // INSERT fehl (z.B. CHECK-Constraint), wird auch der Abschluss zurückgerollt –
  // kein stiller Zustand "abgeschlossen ohne Mitteilung".
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('von', sql.NVarChar(36), autorOid)
      .input('bild', sql.VarBinary(sql.MAX), sigBytes)
      .input('ext', sql.NVarChar(10), sigExt)
      .query(`UPDATE dbo.Beurteilungen SET Status='abgeschlossen',
                AbgeschlossenAm=SYSUTCDATETIME(), BeurteiltVon=@von,
                BeurteilerUnterschriftBild=@bild, BeurteilerUnterschriftExt=@ext,
                AktualisiertAm=SYSUTCDATETIME()
              WHERE Id=@id`);
    for (const empfOid of empfaengerOids) {
      await erzeugeBenachrichtigung(tx, {
        userOid: empfOid, typ: mailTypAbgeschlossen(b.Typ), zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
      });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  // Persönliche Standard-Unterschrift aktualisieren — best effort, AUSSERHALB
  // der Transaktion: ein Fehlschlag hier darf den bereits committeten Abschluss
  // nicht zurückrollen (rein komfortbezogen, kein Blocker).
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, autorOid, signatur); }
    catch (e) { console.error('[beurteilungen] speichereMeine (best effort):', e.message); }
  }
  // Mail NACH dem Commit und außerhalb der Transaktion: ein Versandfehler darf
  // den Abschluss nicht zurückrollen (mailBeurteilung wirft ohnehin nie).
  await mailBeurteilung(pool, empfaengerOids, mailTypAbgeschlossen(b.Typ),
    { zuweisungId: b.ZuweisungId, azubiOid: b.AzubiOid });
}
```

- [ ] **Step 3: `patchNachAbschluss` erweitern**

Empfänger werden EINMAL vor der Transaktion ermittelt (reiner Lesezugriff über
`ermittleAusbildungsleiter`, braucht einen Pool/Request — keine Transaktion) und
danach für Mitteilung UND Mail wiederverwendet. Wie in `upsertEntwurf` (siehe
Task 4, dortige Härtung) entscheidet der bereits gespeicherte `Typ` — hier
`b.Typ`, ohnehin schon geladen, also KEINE zusätzliche Abfrage nötig — welches
Feld-Set geschrieben wird, nicht welche Felder der Aufrufer zufällig mitschickt.
Ersetze die komplette Funktion:

```js
async function patchNachAbschluss(pool, id, {
  kriterien, individuelleBeurteilung, gespraechAm,
  kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
}, autorOid) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid, Typ FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  // b.Typ ist bereits geladen und für eine bestehende Zeile immer autoritativ
  // (Typ ist nach Anlage unveränderlich) — kein Vorab-Read nötig wie bei
  // upsertEntwurf, dort existierte die Zeile zum Zeitpunkt des Reads evtl. noch nicht.
  const kriterienEffektiv = b.Typ === 'gross' ? kriterien : undefined;
  const kfEindruckEffektiv = b.Typ === 'kurz' ? kurzfeedbackEindruck : undefined;
  const kfAuffEffektiv = b.Typ === 'kurz' ? kurzfeedbackAuffaelligkeiten : undefined;
  const kfEmpfEffektiv = b.Typ === 'kurz' ? kurzfeedbackEmpfehlung : undefined;
  const calc = (kriterienEffektiv && kriterienEffektiv.length) ? rechne(kriterienEffektiv) : { gesamt: null, note: null };
  const empfaengerOids = await ermittleAbschlussEmpfaenger(pool, b);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .input('kfEindruck', sql.NVarChar(sql.MAX), kfEindruckEffektiv ?? null)
      .input('kfAuff', sql.NVarChar(sql.MAX), kfAuffEffektiv ?? null)
      .input('kfEmpf', sql.NVarChar(sql.MAX), kfEmpfEffektiv ?? null)
      .input('von', sql.NVarChar(36), autorOid)
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr,
                KurzfeedbackEindruck=@kfEindruck, KurzfeedbackAuffaelligkeiten=@kfAuff, KurzfeedbackEmpfehlung=@kfEmpf,
                KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                KenntnisnahmeVon=NULL, KenntnisnahmeAm=NULL,
                KenntnisnahmeUnterschriftBild=NULL, KenntnisnahmeUnterschriftExt=NULL,
                AusbildungsleiterBestaetigtVon=NULL, AusbildungsleiterBestaetigtAm=NULL,
                AusbildungsleiterUnterschriftBild=NULL, AusbildungsleiterUnterschriftExt=NULL,
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
    await schreibeKriterien(tx, id, kriterienEffektiv);
    for (const empfOid of empfaengerOids) {
      await erzeugeBenachrichtigung(tx, {
        userOid: empfOid, typ: mailTypAbgeschlossen(b.Typ), zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
      });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  await mailBeurteilung(pool, empfaengerOids, mailTypAbgeschlossen(b.Typ),
    { zuweisungId: b.ZuweisungId, azubiOid: b.AzubiOid });
}
```

- [ ] **Step 4: Syntax-Check**

Run: `node -c backend/services/beurteilungen.js`
Expected: kein Output.

- [ ] **Step 5: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): Kurzfeedback-Empfaenger (Azubi+Ausbildungsleitung) bei Abschluss/Korrektur

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5b: DB-Migration — Benachrichtigungs-Typen für Kurzfeedback

**Nachtrag (Code-Review-Fund zu Task 5):** `dbo.Benachrichtigungen` trägt einen
CHECK-Constraint `CK_Benachrichtigungen_Typ` (zuletzt neu aufgesetzt in
`db/migrations/032_benachrichtigungen_loeschtyp.sql`), der die ERLAUBTEN
`Typ`-Werte auf eine feste Liste einschränkt. Diese Liste kennt
`beurteilung_faellig`/`beurteilung_abgeschlossen` bereits (Migration 016),
aber NICHT die in Task 5 neu eingeführten `kurzfeedback_faellig`/
`kurzfeedback_abgeschlossen`. Ohne diese Migration schlägt jeder
`erzeugeBenachrichtigung()`-Aufruf für ein Kurzfeedback mit einer
CHECK-Constraint-Verletzung fehl — die gesamte Kurzfeedback-Abschluss-/
Korrektur-Funktionalität aus Task 5 wäre gegen die echte DB nicht lauffähig.
Übersehen in der ursprünglichen Design-Spec und im Plan; hier nachgezogen,
BEVOR Task 6 den zweiten Aufrufer (`ermittleUndErzeugeFaellige`) fertigstellt,
der denselben Constraint träfe.

**Files:**
- Create: `db/migrations/040_benachrichtigungen_kurzfeedbacktypen.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 040 – Benachrichtigungs-Typen für Kurzfeedback
-- Ausführen gegen: Berichtsheft_Dev
--
-- CK_Benachrichtigungen_Typ (siehe Migration 032) kennt die neuen Typen
-- 'kurzfeedback_faellig'/'kurzfeedback_abgeschlossen' noch nicht — ohne diese
-- Migration schlägt jeder erzeugeBenachrichtigung()-Aufruf mit einem dieser
-- Typen (siehe Kurzfeedback-Feature, Design-Spec
-- 2026-08-26-beurteilung-kurzfeedback-design.md) mit einer CHECK-Constraint-
-- Verletzung fehl. Basiert auf Migration 032 (11 Typen). Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END
ELSE PRINT 'CK_Benachrichtigungen_Typ existierte nicht - wird erstmals eingefuehrt.';

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','erstgenehmigt',
                 'beurteilung_faellig','beurteilung_abgeschlossen',
                 'kurzfeedback_faellig','kurzfeedback_abgeschlossen',
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet',
                 'loeschung_geplant'));
PRINT 'CK_Benachrichtigungen_Typ angelegt (13 Typen, inkl. Kurzfeedback).';
```

- [ ] **Step 2: Gegen die lokale Dev-Datenbank ausführen (manuell, wie Task 1)**

Nur Kuniß kann das einspielen (keine DDL-Rechte auf dem Dev-DB-Account).
Verifikation danach:

```sql
SELECT definition FROM sys.check_constraints
WHERE name = 'CK_Benachrichtigungen_Typ' AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen');
```

Erwartet: Definition enthält `'kurzfeedback_faellig'` und `'kurzfeedback_abgeschlossen'`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/040_benachrichtigungen_kurzfeedbacktypen.sql
git commit -m "fix(beurteilung): CK_Benachrichtigungen_Typ um Kurzfeedback-Typen erweitert

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Backend-Service — `ermittleModus` (kurz) + `ermittleUndErzeugeFaellige` (typ-aware)

**Files:**
- Modify: `backend/services/beurteilungen.js:69-77` (`ermittleModus`), `:305-342` (`ermittleUndErzeugeFaellige`)
- Test: `backend/services/beurteilungen.test.js`

- [ ] **Step 1: Failing Test für `ermittleModus` schreiben**

An das Ende von `backend/services/beurteilungen.test.js` anfügen:

```js
// node:test's test() akzeptiert async-Callbacks nativ (awaitet das Promise) —
// kein zweiter require/alias nötig, das oben bereits importierte `test` reicht.
test('ermittleModus: Typ=kurz liefert nur bearbeiten/ansicht, nie azubi/ausbildungsleiter', async () => {
  const zuwEditable = { verantwortlicherEmail: 'pruefer@firma.de' };
  const pruefer = { role: 'pruefer', email: 'pruefer@firma.de', oid: 'pruefer-oid' };
  const azubi = { role: 'azubi', email: 'azubi@firma.de', oid: 'azubi-oid' };
  const bKurz = { Typ: 'kurz', AzubiOid: 'azubi-oid', Status: 'abgeschlossen', AusbildungsleiterBestaetigtAm: null, ausbildungsleiterSchrittEntfaellt: false };

  // pool wird im kurz-Kurzschluss nie angefasst -> {} genügt als Fake.
  assert.equal(await B.ermittleModus(pruefer, zuwEditable, bKurz, {}), 'bearbeiten');
  assert.equal(await B.ermittleModus(azubi, zuwEditable, bKurz, {}), 'ansicht');
});
```

- [ ] **Step 2: Test laufen lassen, soll fehlschlagen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: FAIL — `B.ermittleModus is not a function` (noch nicht exportiert) oder Assertion-Fehler (liefert `'azubi'` statt `'ansicht'`).

- [ ] **Step 3: `ermittleModus` um Kurzschluss erweitern + exportieren**

Ersetze die Funktion (Zeilen 69-77):

```js
async function ermittleModus(user, zuweisung, b, pool) {
  if (darfBeurteilungBearbeiten(user, zuweisung)) return 'bearbeiten';
  // Kurzfeedback hat keinen Kenntnisnahme- und keinen Ausbildungsleiter-
  // Schritt (siehe Design-Spec §5) — jeder Nicht-Bearbeiter sieht nur an.
  if (b.Typ === 'kurz') return 'ansicht';
  if (user.oid === b.AzubiOid) return 'azubi';
  if (b.Status === 'abgeschlossen' && !b.AusbildungsleiterBestaetigtAm && !b.ausbildungsleiterSchrittEntfaellt) {
    const ausbildungsleiterOid = await ermittleAusbildungsleiter(pool, b.AzubiOid);
    if (ausbildungsleiterOid && ausbildungsleiterOid === user.oid) return 'ausbildungsleiter';
  }
  return 'ansicht';
}
```

In `module.exports` (bereits in Task 3 um `ermittleTyp` erweitert) zusätzlich
`ermittleModus` sicherstellen — die Funktion ist bereits exportiert, hier nur die
Vollständigkeit prüfen (keine Änderung an der Export-Zeile nötig, `ermittleModus`
stand schon davor drin).

- [ ] **Step 4: Test laufen lassen, soll bestehen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: PASS, alle Tests inkl. des neuen grün.

- [ ] **Step 5: `ermittleUndErzeugeFaellige` typ-abhängig machen**

Ersetze die Funktion (Zeilen 305-342):

```js
async function ermittleUndErzeugeFaellige(pool, user) {
  const email = String(user.email || '').toLowerCase();
  if (!email) return [];
  const delegiert = await aktiveVertreteneEmails(pool, user.oid);
  const emails = [...new Set([email, ...delegiert])];
  const req = pool.request().input('heute', sql.Date, heuteYmd());
  const params = emails.map((e, i) => { req.input(`e${i}`, sql.NVarChar(255), e); return `@e${i}`; });
  const r = await req
    .query(`
      SELECT z.Id AS ZuweisungId, z.Abteilung, z.Von, z.Bis, z.AzubiOid
      FROM dbo.Zuweisungen z
      LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id AND b.Status = 'abgeschlossen'
      WHERE z.VerantwEmail IN (${params.join(',')}) AND z.Bis IS NOT NULL AND z.Bis < @heute AND b.Id IS NULL
      ORDER BY z.Bis DESC`);
  for (const z of r.recordset) {
    const benachrichtigungTyp = mailTypFaellig(ermittleTyp(z.Von, z.Bis));
    const exists = await pool.request()
      .input('userOid', sql.NVarChar(36), user.oid)
      .input('typ', sql.NVarChar(40), benachrichtigungTyp)
      .input('zid', sql.Int, z.ZuweisungId)
      .query(`SELECT TOP 1 Id FROM dbo.Benachrichtigungen
              WHERE UserOid=@userOid AND Typ=@typ AND ZuweisungId=@zid`);
    if (!exists.recordset.length) {
      await erzeugeBenachrichtigung(pool, {
        userOid: user.oid, typ: benachrichtigungTyp, zuweisungId: z.ZuweisungId, fromUserOid: null,
      });
      // Genau einmal je (Person, Zuweisung, Typ) — der exists-Check oben ist auch die
      // Sperre gegen wiederholte Erinnerungs-Mails bei jedem Login.
      await mailBeurteilung(pool, [user.oid], benachrichtigungTyp, {
        zuweisungId: z.ZuweisungId, azubiOid: z.AzubiOid, abteilung: z.Abteilung, von: z.Von, bis: z.Bis,
      });
    }
  }
  return r.recordset.map(z => ({
    zuweisungId: z.ZuweisungId, abteilung: z.Abteilung, von: z.Von, bis: z.Bis, azubiOid: z.AzubiOid,
    typ: ermittleTyp(z.Von, z.Bis),
  }));
}
```

- [ ] **Step 6: Syntax-Check + volle Test-Suite**

Run: `node -c backend/services/beurteilungen.js && node --test backend/services/beurteilungen.test.js`
Expected: kein Syntaxfehler, alle Tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/services/beurteilungen.js backend/services/beurteilungen.test.js
git commit -m "feat(beurteilung): ermittleModus/ermittleUndErzeugeFaellige kennen Kurzfeedback-Typ

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Backend-Route — Kurzfeedback-Felder durchreichen

**Files:**
- Modify: `backend/routes/beurteilungen.js:89-105` (`POST /`), `:137-148` (`PATCH /:id`)

- [ ] **Step 1: `POST /` erweitern**

Ersetze den Router-Handler:

```js
router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      zuweisungId, kriterien, individuelleBeurteilung, gespraechAm,
      kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
    } = req.body;
    const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
    if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    if (!svc.darfBeurteilungBearbeiten(req.user, zuw)) return res.status(403).json({ error: 'Kein Beurteilungsrecht.' });
    const id = await svc.upsertEntwurf(pool, {
      zuweisungId: zuw.id, azubiOid: zuw.azubiOid, typ: svc.ermittleTyp(zuw.von, zuw.bis),
      kriterien, individuelleBeurteilung, gespraechAm,
      kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
    });
    res.json({ id });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] create: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: `PATCH /:id` erweitern**

Ersetze den Router-Handler:

```js
router.patch('/:id', async (req, res) => {
  try {
    const ctx = await ladeUndAutorisiere(req, res); if (!ctx) return;
    const {
      kriterien, individuelleBeurteilung, gespraechAm,
      kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
    } = req.body;
    await svc.patchNachAbschluss(ctx.pool, ctx.b.Id, {
      kriterien, individuelleBeurteilung, gespraechAm,
      kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
    }, req.user.oid);
    res.json({ ok: true });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] patch: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Syntax-Check**

Run: `node -c backend/routes/beurteilungen.js`
Expected: kein Output.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/beurteilungen.js
git commit -m "feat(beurteilung): Route reicht Kurzfeedback-Felder + Typ-Ermittlung durch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Mail — typ-abhängige Titel

**Files:**
- Modify: `backend/services/mail.js:179-201` (`mailBeurteilung`)

- [ ] **Step 1: `mailBeurteilung` auf Typ-Map umstellen**

Ersetze die Funktion:

```js
const BEURTEILUNG_MAIL_TITEL = {
  beurteilung_faellig:        'Beurteilung fällig',
  beurteilung_abgeschlossen:  'Neue Beurteilung liegt vor',
  kurzfeedback_faellig:       'Kurzfeedback fällig',
  kurzfeedback_abgeschlossen: 'Neues Kurzfeedback liegt vor',
};

/* Beurteilungs-Reminder. typ: 'beurteilung_abgeschlossen'/'kurzfeedback_abgeschlossen'
   (an Azubi bzw. Azubi+Ausbildungsleitung) oder 'beurteilung_faellig'/
   'kurzfeedback_faellig' (an die beurteilende Person).
   ctx: { zuweisungId, azubiOid?, abteilung?, von?, bis? } */
async function mailBeurteilung(pool, oids, typ, ctx = {}) {
  if (!mailConfig().configured) return false;
  try {
    const users = await ladeEmpfaenger(pool, [...(oids || []), ctx.azubiOid]);
    const to = (oids || []).map((o) => users.get(o) && users.get(o).email).filter(Boolean);
    if (!to.length) return false;
    const azubi = anzeigeName(users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).name : '');
    const titel = BEURTEILUNG_MAIL_TITEL[typ] || 'Beurteilung';
    const html = huelle(titel, [
      azubi ? ['Azubi', azubi] : null,
      ctx.abteilung ? ['Abteilung', ctx.abteilung] : null,
      (ctx.von || ctx.bis) ? ['Einsatz', `${dt(ctx.von)} – ${dt(ctx.bis)}`] : null,
    ], `${appUrl()}/app/beurteilung.html?zuw=${encodeURIComponent(ctx.zuweisungId || '')}`);
    return await sendeMail({ to, subject: azubi ? `${titel}: ${azubi}` : titel, html });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailBeurteilung ${typ}: ${err.message}`, stack: err.stack });
    return false;
  }
}
```

- [ ] **Step 2: Syntax-Check**

Run: `node -c backend/services/mail.js`
Expected: kein Output.

- [ ] **Step 3: Commit**

```bash
git add backend/services/mail.js
git commit -m "feat(beurteilung): Mail-Titel je Kurzfeedback-/Beurteilungstyp

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: In-App-Mitteilungen — neue Typen in beiden Render-Maps

**Files:**
- Modify: `app/js/dashboard.js:1519-1536` (`VERWALTUNG_MT_TYPEN`)
- Modify: `app/js/mitteilungen.js:104-121` (`VERWALTUNG_TYPEN`)

Ohne diesen Task rendern die neuen Benachrichtigungstypen `kurzfeedback_faellig`/
`kurzfeedback_abgeschlossen` auf beiden Seiten **lautlos leer** (siehe Kommentar
in `mitteilungen.js:114-115`) — kein Absturz, aber eine unsichtbare Mitteilung.

- [ ] **Step 1: `dashboard.js` — `VERWALTUNG_MT_TYPEN` erweitern**

Nach dem Eintrag `beurteilung_abgeschlossen` (Zeile 1527-1528) einfügen:

```js
  kurzfeedback_faellig:       { type: 'error',   titel: 'Kurzfeedback fällig',
                               href: b => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
  kurzfeedback_abgeschlossen: { type: 'success', titel: 'Kurzfeedback abgeschlossen',
                               href: b => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
```

- [ ] **Step 2: `mitteilungen.js` — `VERWALTUNG_TYPEN` erweitern**

Nach dem Eintrag `beurteilung_abgeschlossen` (Zeile 112-113) einfügen. `label`
bewusst `'Kurzfeedback'` statt `'Beurteilung'` (Korrektur aus dem Code-Review zu
diesem Task): `mitteilungen.js` leitet aus dem `Typ`-Präfix einen eigenen
`typeKey` ab (`'kurzfeedback'` vs. `'beurteilung'`) und baut daraus u.a. den
Filter-Dropdown — zwei verschiedene `typeKey`s mit demselben `label`-Text hätten
zwei nicht unterscheidbare "Beurteilung"-Einträge im Filter erzeugt, die
unterschiedliche Ergebnismengen filtern:

```js
    kurzfeedback_faellig:      { tone: 'er',      label: 'Kurzfeedback', titel: 'Kurzfeedback fällig',
                                 href: b => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
    kurzfeedback_abgeschlossen: { tone: 'ok',     label: 'Kurzfeedback', titel: 'Kurzfeedback abgeschlossen',
                                 href: b => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
```

- [ ] **Step 3: `dh-mitteilungen.js` — dritte, bisher übersehene Render-Map ergänzen**

**Nachtrag (Code-Review-Fund):** Es gibt eine DRITTE Stelle mit demselben
"unbekannter Typ rendert lautlos leer"-Verhalten: die Glocke in der
DH-Studenten-Topbar (`app/js/dh-mitteilungen.js`, eigene `TYPEN`-Map, unabhängig
von den beiden obigen). DH-Studenten haben eigene Abteilungsdurchläufe, die
ebenfalls kurz genug für Kurzfeedback sein können (`ermittleTyp` unterscheidet
nicht nach Rolle) — ohne diese Ergänzung bekäme ein DH-Student bei einem kurzen
Durchlauf ein unsichtbares `kurzfeedback_abgeschlossen`-Signal. NUR
`kurzfeedback_abgeschlossen` nötig — DH-Studenten sind nie die beurteilende
Person, `kurzfeedback_faellig` erreicht sie nie (siehe bestehender Kommentar in
der Datei: nur `beurteilung_abgeschlossen` ist für sie relevant, kein
`beurteilung_faellig`-Eintrag existiert dort).

Nach dem Eintrag `beurteilung_abgeschlossen` in der `TYPEN`-Konstante einfügen:

```js
    kurzfeedback_abgeschlossen: { tone: 'ok',   label: 'Kurzfeedback', titel: 'Neues Kurzfeedback liegt vor',
                                 href: (b) => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
```

- [ ] **Step 4: Syntax-Check**

Run: `node -c app/js/dashboard.js && node -c app/js/mitteilungen.js && node -c app/js/dh-mitteilungen.js`
Expected: kein Output.

- [ ] **Step 5: Commit**

```bash
git add app/js/dashboard.js app/js/mitteilungen.js app/js/dh-mitteilungen.js
git commit -m "feat(beurteilung): Kurzfeedback-Mitteilungstypen in allen drei Render-Maps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Azubi-eigene Mitteilungs-Feeds (weiterer Nachtrag, schwerwiegender als die DH-Lücke)**

**Nachtrag (zweiter Code-Review-Fund zu diesem Task):** Neben den 3 Render-Maps
gibt es zwei weitere, UNABHÄNGIGE Stellen mit fest verdrahteten
`if (b.type === 'beurteilung_abgeschlossen' || b.type === 'beurteilung_faellig')`-
Sonderfällen — nicht map-basiert, sondern inline in der Azubi-eigenen
Mitteilungs-Darstellung. Ohne diese Ergänzung bekäme JEDER Azubi bei JEDEM
abgeschlossenen Kurzfeedback (nicht nur DH-Studenten, nicht nur ein Rand­fall)
eine **falsch beschriftete** Mitteilung ("KW undefined/undefined
zurückgewiesen" statt "Neues Kurzfeedback liegt vor") mit falschem Icon und
falschem Link (`wochenansicht.html` statt `beurteilung.html`) — schwerwiegender
als das stille Leerbleiben, das die vorigen Schritte behoben haben.

**`app/js/dashboard.js`** — den Bedingungsblock um Zeile 302 (Azubi-Dashboard,
Mitteilungszentrale-Kachel) ersetzen:

```js
    if (b.type === 'beurteilung_abgeschlossen' || b.type === 'beurteilung_faellig'
        || b.type === 'kurzfeedback_abgeschlossen' || b.type === 'kurzfeedback_faellig') {
      const faellig = b.type === 'beurteilung_faellig' || b.type === 'kurzfeedback_faellig';
      const istKurz = b.type.startsWith('kurzfeedback_');
      const btitle = istKurz
        ? (faellig ? 'Kurzfeedback fällig' : 'Neues Kurzfeedback liegt vor')
        : (faellig ? 'Beurteilung fällig' : 'Neue Beurteilung liegt vor');
      return `
          <a class="b-mitteilung${mtNeu(b) ? ' b-mitteilung--unread' : ''}" href="beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}"
             data-notif-id="${b.id}" data-zuw="${b.zuweisungId || ''}">
            <span class="b-mitteilung__icon b-mitteilung__icon--${faellig ? 'er' : 'ok'}">${faellig ? MT_ICON_ER : MT_ICON_OK}</span>
            <span class="b-mitteilung__body">
              <span class="b-mitteilung__title">${btitle}</span>
              <span class="b-mitteilung__meta">${mtRelTime(b.timestamp)}</span>
            </span>
            ${mtNeu(b) ? '<span class="b-mitteilung__dot" aria-hidden="true"></span>' : ''}
          </a>`;
    }
```

**`app/js/mitteilungen.js`** — den Bedingungsblock in `buildAzubiItems()` um
Zeile 156 ersetzen:

```js
      if (b.type === 'beurteilung_abgeschlossen' || b.type === 'beurteilung_faellig'
          || b.type === 'kurzfeedback_abgeschlossen' || b.type === 'kurzfeedback_faellig') {
        const faellig = b.type === 'beurteilung_faellig' || b.type === 'kurzfeedback_faellig';
        const istKurz = b.type.startsWith('kurzfeedback_');
        return {
          key: `n${b.id}`,
          ts: b.timestamp || 0,
          tone: faellig ? 'info' : 'ok',
          typeKey: istKurz ? 'kurzfeedback' : 'beurteilung',
          typeLabel: istKurz ? 'Kurzfeedback' : 'Beurteilung',
          title: istKurz
            ? (faellig ? 'Kurzfeedback fällig' : 'Neues Kurzfeedback liegt vor')
            : (faellig ? 'Beurteilung fällig' : 'Neue Beurteilung liegt vor'),
          meta: relTime(b.timestamp),
          notifId: b.id,
          href: `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}`,
          nav: null,
        };
      }
```

- [ ] **Step 7: Syntax-Check + Commit**

```bash
node -c app/js/dashboard.js && node -c app/js/mitteilungen.js
```

```bash
git add app/js/dashboard.js app/js/mitteilungen.js
git commit -m "fix(beurteilung): Kurzfeedback in Azubi-eigenen Mitteilungs-Feeds korrekt beschriftet

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: `api.js` — `Typ` + Kurzfeedback-Felder ans Frontend durchreichen

**Files:**
- Modify: `app/js/api.js:367-393` (`normalizeBeurteilung`), `:934-943` (`getBeurteilungenFuerAzubi`)

- [ ] **Step 1: `normalizeBeurteilung` erweitern**

Ergänze im Rückgabeobjekt (nach `individuelleBeurteilung`, Zeile 374):

```js
    typ: b.Typ || 'gross',
    kurzfeedbackEindruck: b.KurzfeedbackEindruck ?? '',
    kurzfeedbackAuffaelligkeiten: b.KurzfeedbackAuffaelligkeiten ?? '',
    kurzfeedbackEmpfehlung: b.KurzfeedbackEmpfehlung ?? '',
```

- [ ] **Step 2: `getBeurteilungenFuerAzubi` erweitern**

Ersetze die Funktion (Zeilen 934-943):

```js
  async getBeurteilungenFuerAzubi(azubiOid) {
    const data = await apiFetch(`/beurteilungen?azubiOid=${encodeURIComponent(azubiOid)}`,
      { erwartet: [403, 404] });
    return data.map(b => ({
      zuweisungId: b.ZuweisungId, status: b.Status, typ: b.Typ || 'gross',
      note: b.Note != null ? Number(b.Note) : null,
      gesamtPunkte: b.GesamtPunkte != null ? Number(b.GesamtPunkte) : null,
      abgeschlossenAm: b.AbgeschlossenAm ?? null,
    }));
  },
```

(`getMeineBeurteilungen` braucht KEINE Änderung — sie reicht die bereits
camelCase gemappte Antwort von `GET /beurteilungen/meine`, inkl. des in Task 3
ergänzten `typ`-Felds, unverändert durch.)

- [ ] **Step 3: Syntax-Check**

Run: `node -c app/js/api.js`
Expected: kein Output.

- [ ] **Step 4: Commit**

```bash
git add app/js/api.js
git commit -m "feat(beurteilung): api.js reicht Typ + Kurzfeedback-Felder durch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: `beurteilung.js` — Kurzfeedback-Formular + Aktionsleiste

**Files:**
- Modify: `app/js/beurteilung.js:5-70` (`DOMContentLoaded`), `:105-216` (`renderActions`)
- Create (im selben File, neue Funktion): `renderKurzfeedbackForm`

- [ ] **Step 1: Kurzfeedback-Fragen + Render-Funktion ergänzen**

An das Ende von `app/js/beurteilung.js` anfügen (nach `exportBeurteilungPdf`):

```js

// Rendert die 3 Leitfragen des Kurzfeedback-Prozesses (Zuweisungen <= 14
// Tage, siehe Design-Spec 2026-08-26-beurteilung-kurzfeedback-design.md).
// Bewusst KEIN Bezug zu beurteilung-core.js/KRITERIEN — reiner Freitext ohne
// Berechnung, daher direkt hier statt im geteilten Kernmodul.
const KURZFEEDBACK_FRAGEN = [
  { key: 'eindruck', label: 'Wie hat sich der Azubi eingebracht (Motivation, Auftreten)?' },
  { key: 'auffaelligkeiten', label: 'Besondere Auffälligkeiten – positiv oder negativ?' },
  { key: 'empfehlung', label: 'Empfehlung für den weiteren Ausbildungsverlauf?' },
];

function renderKurzfeedbackForm(container, opts) {
  const o = opts || {};
  const editable = !!o.editable;
  const dis = editable ? '' : 'disabled';
  const esc = window.escapeHtml;
  const kopf = o.kopf || {};

  container.innerHTML = `
    <div class="beurt beurt--kurz">
      <div class="beurt__kopf">
        <div><span class="beurt__label">Name</span><div class="beurt__val">${esc(kopf.name)}</div></div>
        <div><span class="beurt__label">Abteilung</span><div class="beurt__val">${esc(kopf.abteilung)}</div></div>
        <div><span class="beurt__label">Zeitraum</span><div class="beurt__val">${esc(kopf.zeitraum)}</div></div>
        <div><span class="beurt__label">Beurteilende/-r</span><div class="beurt__val">${esc(kopf.beurteilende)}</div></div>
      </div>
      ${KURZFEEDBACK_FRAGEN.map(f => `
        <div class="beurt-indiv">
          <label class="beurt__label" for="kf_${f.key}">${esc(f.label)}</label>
          <textarea id="kf_${f.key}" class="form-control" rows="4" ${dis}>${esc(o[f.key] || '')}</textarea>
        </div>`).join('')}
    </div>`;

  return {
    getState() {
      return {
        kurzfeedbackEindruck: document.getElementById('kf_eindruck')?.value || '',
        kurzfeedbackAuffaelligkeiten: document.getElementById('kf_auffaelligkeiten')?.value || '',
        kurzfeedbackEmpfehlung: document.getElementById('kf_empfehlung')?.value || '',
      };
    },
  };
}
```

- [ ] **Step 2: `DOMContentLoaded` — Typ ermitteln + Formular verzweigen**

Ersetze in `app/js/beurteilung.js` den Block ab `const statusAbg = ...` bis
`renderActions({ user, zuweisung, beurteilung, azubi, editable, form, back });`
(Zeilen 53-69):

```js
  const statusAbg = beurteilung?.status === 'abgeschlossen';
  const statusLabel = statusAbg ? 'Abgeschlossen' : (beurteilung ? 'Entwurf' : (editable ? 'Neu' : 'Offen'));
  const statusBadge = statusAbg ? 'badge--genehmigt' : (beurteilung ? 'badge--yellow' : 'badge--grey');
  // Typ ist ab dem ersten gespeicherten Entwurf serverseitig fix (beurteilung.typ);
  // vor der ersten Anlage wird er clientseitig aus der Zuweisungsdauer abgeleitet
  // (identische Regel wie das Backend — siehe ermittleTyp in beurteilung-core.js).
  const typ = beurteilung?.typ || window.Beurteilung.ermittleTyp(zuweisung.von, zuweisung.bis);
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${typ === 'kurz' ? 'Kurzfeedback' : 'Beurteilungsbogen'}</h1>
      <span class="badge ${statusBadge}">${statusLabel}</span>
    </div>
    <div id="beurtFormHost"></div>
    <div class="beurt-actions" id="beurtActions"></div>`;

  const form = typ === 'kurz'
    ? renderKurzfeedbackForm(document.getElementById('beurtFormHost'), {
        kopf, editable,
        eindruck: beurteilung?.kurzfeedbackEindruck || '',
        auffaelligkeiten: beurteilung?.kurzfeedbackAuffaelligkeiten || '',
        empfehlung: beurteilung?.kurzfeedbackEmpfehlung || '',
      })
    : window.Beurteilung.renderForm(document.getElementById('beurtFormHost'), {
        kopf, punkteByKey, individuell: beurteilung?.individuelleBeurteilung || '',
        gespraechAm: beurteilung?.gespraechAm || '', editable,
      });

  renderActions({ user, zuweisung, beurteilung, azubi, editable, form, typ, back });
```

- [ ] **Step 3: `renderActions` — Typ aus `ctx` lesen**

Ändere die Destrukturierung am Anfang von `renderActions` (Zeile 106):

```js
function renderActions(ctx) {
  const { zuweisung, beurteilung, editable, form, user, back, typ } = ctx;
```

- [ ] **Step 4: `renderActions` — `bearbeiten`-Zweig für Kurzfeedback**

Direkt nach `const abgeschlossen = status === 'abgeschlossen';` (im `if (modus === 'bearbeiten')`-Block,
ursprünglich Zeile 117) einen früher greifenden Kurzfeedback-Zweig einfügen — danach folgt
der bestehende Code für die große Beurteilung unverändert:

```js
  if (modus === 'bearbeiten') {
    const abgeschlossen = status === 'abgeschlossen';

    if (typ === 'kurz') {
      host.innerHTML = `
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
        if (!st.kurzfeedbackEindruck.trim() || !st.kurzfeedbackAuffaelligkeiten.trim() || !st.kurzfeedbackEmpfehlung.trim()) {
          Toast.error('Unvollständig', 'Bitte alle drei Fragen beantworten.');
          return;
        }
        try {
          id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
          if (abgeschlossen) {
            await DB.patchBeurteilung(id, st);
            Toast.success('Aktualisiert', 'Kurzfeedback wurde aktualisiert (Azubi wird informiert).');
          } else {
            // Kein Signatur-Dialog beim Kurzfeedback (siehe Design-Spec §10, Out of Scope).
            await DB.abschliessenBeurteilung(id, null);
            Toast.success('Abgeschlossen', 'Kurzfeedback abgeschlossen. Der Azubi wurde benachrichtigt.');
          }
          setTimeout(back, 800);
        } catch (e) { Toast.error('Fehler', e.message); }
      });
      return;
    }

    host.innerHTML = `
      <button class="btn btn-ghost" id="beurtPdf">Als PDF</button>
      <button class="btn btn-secondary" id="beurtSave">Entwurf speichern</button>
      <button class="btn btn-primary" id="beurtFinish">${abgeschlossen ? 'Änderungen speichern' : 'Abschließen'}</button>`;
```

(Der restliche `bearbeiten`-Zweig — Event-Listener für `beurtSave`/`beurtFinish`/`beurtPdf`
der großen Beurteilung — bleibt unverändert direkt darunter stehen.)

- [ ] **Step 5: `renderActions` — `ansicht`-Zweig ohne PDF-Button für Kurzfeedback**

Ersetze den letzten Block der Funktion (bisher Zeilen 213-215):

```js
  // modus === 'ansicht' (u.a. der dauerhafte Ausbilder, oder Azubi/
  // Ausbildungsleitung beim Kurzfeedback): nur Drucken — außer beim
  // Kurzfeedback, das hat keinen PDF-Export (siehe Design-Spec §10).
  if (typ === 'kurz') { host.innerHTML = ''; return; }
  host.innerHTML = `<button class="btn btn-ghost" id="beurtPdf">Als PDF</button>`;
  document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
}
```

- [ ] **Step 6: Syntax-Check**

Run: `node -c app/js/beurteilung.js`
Expected: kein Output.

- [ ] **Step 7: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): Kurzfeedback-Formular + vereinfachte Aktionsleiste

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: `beurteilungen-liste.js` — Kurzfeedback-Badge

**Files:**
- Modify: `app/js/beurteilungen-liste.js:44-52` (`renderListe`)

- [ ] **Step 1: Zweites Badge für `typ === 'kurz'` ergänzen**

Ersetze den `listWrap.innerHTML`-Block:

```js
    listWrap.innerHTML = `${hinweis}<div class="durchlauf-list">${gefiltert.map(b => `
      <div class="durchlauf-card durchlauf-card--clickable" data-zuw="${b.zuweisungId}" role="button" tabindex="0">
        <span class="badge ${b.status === 'abgeschlossen' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
          ${b.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Offen'}
        </span>
        ${b.typ === 'kurz' ? `<span class="badge badge--freigegeben durchlauf-card__badge">Kurzfeedback</span>` : ''}
        <div class="durchlauf-card__abt">${escapeHtml(displayName(b.azubiName))}${b.abteilung ? ' · ' + escapeHtml(b.abteilung) : ''}</div>
        <div class="durchlauf-card__zeit">${DateUtil.formatDate(b.von)} – ${DateUtil.formatDate(b.bis)}</div>
      </div>
    `).join('')}</div>`;
```

(`badge--freigegeben` wird bewusst wiederverwendet statt einer neuen Badge-Klasse —
sie hat bereits Dark-Mode- und Custom-Theme-Overrides in allen Theme-Dateien, eine
neue Klasse bräuchte diese erst noch je Theme, siehe `project_custom_themes_miss_dark_overrides`.)

- [ ] **Step 2: Syntax-Check**

Run: `node -c app/js/beurteilungen-liste.js`
Expected: kein Output.

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilungen-liste.js
git commit -m "feat(beurteilung): Kurzfeedback-Badge in der Beurteilungen-Liste

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: `abteilungs-planer.js` — Kurzfeedback-Variante der Abschluss-Kachel

**Files:**
- Modify: `app/js/abteilungs-planer.js:97-107` (`dlbBeurtBlock`)

- [ ] **Step 1: Kurzfeedback-Zweig vor der Noten-Anzeige einfügen**

Ersetze den Block:

```js
  if (b && b.status === 'abgeschlossen') {
    if (b.typ === 'kurz') {
      return `
        <div class="dlb-beurt dlb-beurt--done">${DLB_ICO.check} Kurzfeedback abgeschlossen</div>
        <a class="btn btn-outline btn-sm dlb-beurt-open" href="beurteilung.html?zuw=${z.id}">Öffnen</a>`;
    }
    const note = b.note != null ? b.note.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–';
    const pkt = b.gesamtPunkte != null ? Math.round(b.gesamtPunkte) : null;
    return `
      <div class="dlb-beurt dlb-beurt--done">${DLB_ICO.check} Beurteilung abgeschlossen</div>
      <div class="dlb-note">
        <div class="dlb-note__grade"><span class="dlb-note__val">${note}</span><span class="dlb-note__cap">Gesamtnote</span></div>
        ${pkt != null ? `<div class="dlb-note__grade"><span class="dlb-note__pts">${pkt}</span><span class="dlb-note__cap">von 100 Punkten</span></div>` : ''}
      </div>
      ${b.individuelleBeurteilung ? `<div class="dlb-note__text">„${escHtml(b.individuelleBeurteilung)}"</div>` : ''}
      <a class="btn btn-outline btn-sm dlb-beurt-open" href="beurteilung.html?zuw=${z.id}">Öffnen</a>`;
  }
```

- [ ] **Step 2: Syntax-Check**

Run: `node -c app/js/abteilungs-planer.js`
Expected: kein Output.

- [ ] **Step 3: Commit**

```bash
git add app/js/abteilungs-planer.js
git commit -m "feat(beurteilung): Kurzfeedback-Kachel ohne Noten-Anzeige im Abteilungs-Planer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Manuelle End-to-End-Verifikation

**Files:** keine Code-Änderung — Verifikation über den laufenden lokalen Server.

- [ ] **Step 1: Backend starten**

Run: `cd backend && npm run dev` (Port 3000, `--watch`)
Expected: Server läuft, keine Startfehler in der Konsole.

- [ ] **Step 2: Migration lokal einspielen (falls noch nicht geschehen)**

Die Datei aus Task 1 (`db/migrations/039_beurteilung_kurzfeedback.sql`) muss vor
diesem Test bereits gegen die lokale Dev-DB gelaufen sein (siehe Hinweis dort:
nur mit DDL-Rechten möglich).

- [ ] **Step 3: Mit `webapp-testing`-Toolkit gegen `http://localhost:3000` prüfen**

Als Prüfer/Ausbilder (passwortloser Demo-Login, `.demo`-Konto) einloggen und:

1. Eine Zuweisung mit `Bis - Von <= 14 Tage` und bereits vergangenem `Bis`-Datum
   aufrufen (`beurteilung.html?zuw=<id>`) — erwartet: Seitentitel "Kurzfeedback",
   3 Textfelder statt der 10-Kriterien-Tabelle, kein "Als PDF"-Button.
2. Alle 3 Felder befüllen, "Entwurf speichern" klicken — erwartet: Toast
   "Gespeichert", kein Fehler in der Browser-Konsole.
3. "Abschließen" klicken — erwartet: Toast "Kurzfeedback abgeschlossen. Der
   Azubi wurde benachrichtigt.", KEIN Signatur-Dialog erscheint.
4. Zur Liste `beurteilungen.html` navigieren — erwartet: der Eintrag zeigt
   sowohl "Abgeschlossen" als auch das Badge "Kurzfeedback".
5. Als der betroffene Azubi einloggen, `abteilungs-planer.html` (Detailansicht
   der Abteilung) öffnen — erwartet: Kachel zeigt "Kurzfeedback abgeschlossen"
   OHNE Gesamtnote-/Punkte-Anzeige.
6. Eine reguläre, lange Zuweisung (>14 Tage) parallel prüfen — erwartet:
   unverändertes Verhalten der großen Beurteilung (10 Kriterien, Note,
   Kenntnisnahme-Button für den Azubi, PDF-Export funktioniert weiterhin).

- [ ] **Step 4: Ergebnis festhalten**

Bei Abweichungen: zurück zum jeweiligen Task, Code korrigieren, Schritt 3 wiederholen.
Kein Commit in diesem Task (reine Verifikation).
