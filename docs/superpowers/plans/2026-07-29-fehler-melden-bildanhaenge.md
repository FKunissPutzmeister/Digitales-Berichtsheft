# Bild-/Screenshot-Anhänge für „Fehler melden" – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der manuelle „Fehler melden"-Dialog erlaubt es, Bilder und Screenshots (Datei-Auswahl + Strg+V) beizufügen; Developer sehen sie im Fehlerberichte-Viewer.

**Architecture:** Bilder gehen als base64-Data-URLs inline im bestehenden JSON-`POST /api/errors`. Sie werden client- und serverseitig validiert und als `VARBINARY(MAX)` in einer neuen Tabelle `dbo.FehlerAnhaenge` (FK → `Fehlerberichte`, `ON DELETE CASCADE`) gespeichert. Der Developer-Viewer lädt Thumbnails lazy über einen Binär-Endpunkt.

**Tech Stack:** Node/Express 5, `mssql` (`getPool`/`sql` aus `backend/db/connection`), Vanilla-JS-Frontend, `node:test` für Unit-Tests, T-SQL-Migrationen in `db/migrations/`.

## Global Constraints

- **Nur `quelle === 'manual'`** darf Bilder mitliefern. Automatische `frontend`-/`backend`-Reports enthalten nie Bilder.
- **Limits (client UND server identisch):** max. **5 Bilder**, je **≤ 4 MB** dekodiert, **kumulativ ≤ 6 MB** dekodiert. Der kumulative Deckel hält die base64-Payload unter dem globalen `express.json`-Limit von **10 MB** ([backend/server.js](../../../backend/server.js)) — dieses Limit **nicht** anfassen.
- **Nur Bilder:** akzeptiert werden ausschließlich Data-URLs mit MIME `image/*`.
- **Speicher-Fehler killt die Meldung nie:** schlägt das Speichern der Anhänge fehl, wird das nur auf der Konsole geloggt; der Textbericht bleibt gespeichert und die Route antwortet weiter mit `204`.
- **DB:** Migration idempotent (`IF NOT EXISTS`), ausgeführt gegen `Berichtsheft_Dev`. Schema-Änderungen ausschließlich als nummerierte Datei unter `db/migrations/` (siehe Memory `project_db_migration_convention`).
- **IDs:** `Fehlerberichte.Id`/`FehlerAnhaenge.Id` sind INTEGER (nicht GUID) — `sql.Int` verwenden.
- **Testlauf:** aus dem Repo-Root `node --test backend/services/fehlerberichte.test.js`.

---

### Task 1: DB-Migration `dbo.FehlerAnhaenge`

**Files:**
- Create: `db/migrations/027_fehler_anhaenge.sql`

**Interfaces:**
- Produces: Tabelle `dbo.FehlerAnhaenge (Id, FehlerId, Dateiname, MimeTyp, GroesseBytes, Inhalt, HochgeladenAm)` + Index `IX_FehlerAnhaenge_FehlerId`. Von Task 3 (Service) konsumiert.

- [ ] **Step 1: Migrationsdatei schreiben**

`db/migrations/027_fehler_anhaenge.sql`:

```sql
-- ============================================================
-- Migration 027 – dbo.FehlerAnhaenge (Bild-/Screenshot-Anhänge
-- zu manuellen Fehlermeldungen)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Spiegelt das Muster von dbo.Anhaenge (004): Inhalt als
-- VARBINARY(MAX) direkt in der DB (transaktionssicher, keine
-- Pfadverwaltung). FK auf Fehlerberichte mit ON DELETE CASCADE,
-- damit Anhänge mit dem Fehler-Cleanup (cleanupAlt) verschwinden.
-- Idempotent, no-op falls vorhanden.
-- ============================================================

IF OBJECT_ID('dbo.FehlerAnhaenge', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.FehlerAnhaenge (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    FehlerId      INT            NOT NULL,
    Dateiname     NVARCHAR(255)  NOT NULL,
    MimeTyp       NVARCHAR(100)  NULL,
    GroesseBytes  INT            NOT NULL,
    Inhalt        VARBINARY(MAX) NOT NULL,
    HochgeladenAm DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FehlerAnhaenge_Fehlerberichte FOREIGN KEY (FehlerId)
        REFERENCES dbo.Fehlerberichte(Id) ON DELETE CASCADE
  );
  PRINT 'Tabelle dbo.FehlerAnhaenge angelegt.';
END
ELSE PRINT 'dbo.FehlerAnhaenge existiert bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FehlerAnhaenge_FehlerId')
  CREATE INDEX IX_FehlerAnhaenge_FehlerId ON dbo.FehlerAnhaenge (FehlerId);

PRINT 'Migration 027 fertig.';
```

- [ ] **Step 2: Migration gegen Berichtsheft_Dev ausführen**

Run (Repo-Root): `node backend/db/run-sql.js db/migrations/027_fehler_anhaenge.sql`
Expected: Ausgabe `Tabelle dbo.FehlerAnhaenge angelegt.` und `Migration 027 fertig.` (bei erneutem Lauf: `... existiert bereits.`).

- [ ] **Step 3: Commit**

```bash
git add db/migrations/027_fehler_anhaenge.sql
git commit -m "feat(fehlerberichte): Migration 027 – Tabelle FehlerAnhaenge"
```

---

### Task 2: Service — reine Validierung `parseUndValidiereBilder` (TDD)

**Files:**
- Modify: `backend/services/fehlerberichte.js`
- Test: `backend/services/fehlerberichte.test.js`

**Interfaces:**
- Produces: `parseUndValidiereBilder(bilder) → { gueltig: Array<{ name, mimeTyp, buffer:Buffer, groesse:number }>, verworfen: number }`. Reine Funktion, kein DB-Zugriff. Wird von `speichereFehlerAnhaenge` (Task 3) und der Route (Task 4) konsumiert. Konstanten `MAX_BILDER=5`, `MAX_BILD_BYTES=4*1024*1024`, `MAX_GESAMT_BYTES=6*1024*1024`.

- [ ] **Step 1: Failing Tests schreiben**

Ans Ende von `backend/services/fehlerberichte.test.js` anhängen:

```js
// ── parseUndValidiereBilder ────────────────────────────────────
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('parseUndValidiereBilder: gültiges PNG wird dekodiert', () => {
  const { gueltig, verworfen } = F.parseUndValidiereBilder([{ name: 'a.png', dataUrl: PNG_1PX }]);
  assert.equal(gueltig.length, 1);
  assert.equal(verworfen, 0);
  assert.equal(gueltig[0].mimeTyp, 'image/png');
  assert.ok(Buffer.isBuffer(gueltig[0].buffer));
  assert.ok(gueltig[0].groesse > 0);
});

test('parseUndValidiereBilder: Nicht-Array → leer', () => {
  assert.deepEqual(F.parseUndValidiereBilder(null), { gueltig: [], verworfen: 0 });
  assert.deepEqual(F.parseUndValidiereBilder(undefined), { gueltig: [], verworfen: 0 });
});

test('parseUndValidiereBilder: Nicht-Bild-DataURL wird verworfen', () => {
  const r = F.parseUndValidiereBilder([{ name: 'x.txt', dataUrl: 'data:text/plain;base64,aGk=' }]);
  assert.equal(r.gueltig.length, 0);
  assert.equal(r.verworfen, 1);
});

test('parseUndValidiereBilder: kaputte DataURL wird verworfen', () => {
  const r = F.parseUndValidiereBilder([{ name: 'x', dataUrl: 'kein-data-url' }, { }]);
  assert.equal(r.gueltig.length, 0);
  assert.equal(r.verworfen, 2);
});

test('parseUndValidiereBilder: max. 5 Bilder, Rest verworfen', () => {
  const viele = Array.from({ length: 7 }, () => ({ name: 'a.png', dataUrl: PNG_1PX }));
  const r = F.parseUndValidiereBilder(viele);
  assert.equal(r.gueltig.length, 5);
  assert.equal(r.verworfen, 2);
});
```

- [ ] **Step 2: Tests laufen lassen (müssen fehlschlagen)**

Run: `node --test backend/services/fehlerberichte.test.js`
Expected: FAIL — `F.parseUndValidiereBilder is not a function`.

- [ ] **Step 3: Funktion + Konstanten implementieren**

In `backend/services/fehlerberichte.js` nach den bestehenden Konstanten (`SCHWEREGRADE`) einfügen:

```js
// ── Bild-Anhänge (nur manuelle Meldungen) ──────────────────────
// Limits identisch zum Client (error-reporter.js). Der kumulative
// Deckel hält die base64-Payload unter dem 10-MB-express.json-Limit.
const MAX_BILDER = 5;
const MAX_BILD_BYTES = 4 * 1024 * 1024;   // je Bild, dekodiert
const MAX_GESAMT_BYTES = 6 * 1024 * 1024; // Summe, dekodiert

// Reine Prüfung/Dekodierung eingehender { name, mimeTyp, dataUrl }-Objekte.
// Kein DB-Zugriff → testbar. Ungültige/zu große Einträge werden gezählt
// (verworfen), aber nie geworfen: die Textmeldung soll immer durchgehen.
function parseUndValidiereBilder(bilder) {
  if (!Array.isArray(bilder)) return { gueltig: [], verworfen: 0 };
  const gueltig = [];
  let verworfen = 0;
  let gesamt = 0;
  for (const b of bilder) {
    if (gueltig.length >= MAX_BILDER) { verworfen++; continue; }
    const m = b && typeof b.dataUrl === 'string'
      ? /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(b.dataUrl)
      : null;
    if (!m) { verworfen++; continue; }
    const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BILD_BYTES) { verworfen++; continue; }
    if (gesamt + buffer.length > MAX_GESAMT_BYTES) { verworfen++; continue; }
    gesamt += buffer.length;
    gueltig.push({
      name: b.name ? String(b.name).slice(0, 255) : 'bild',
      mimeTyp: m[1].toLowerCase(),
      buffer,
      groesse: buffer.length,
    });
  }
  return { gueltig, verworfen };
}
```

Im `module.exports`-Objekt am Dateiende `parseUndValidiereBilder` ergänzen.

- [ ] **Step 4: Tests laufen lassen (müssen bestehen)**

Run: `node --test backend/services/fehlerberichte.test.js`
Expected: PASS (alle bestehenden + 5 neue Tests grün).

- [ ] **Step 5: Commit**

```bash
git add backend/services/fehlerberichte.js backend/services/fehlerberichte.test.js
git commit -m "feat(fehlerberichte): parseUndValidiereBilder + Tests"
```

---

### Task 3: Service — DB-Funktionen + `logError` liefert Id + Anhang-Zähler

**Files:**
- Modify: `backend/services/fehlerberichte.js`

**Interfaces:**
- Consumes: `parseUndValidiereBilder` (Task 2); Tabelle `dbo.FehlerAnhaenge` (Task 1).
- Produces:
  - `logError(...)` gibt jetzt die betroffene `Fehlerberichte.Id` zurück (Insert- und Gruppierungs-Fall), sonst `undefined`.
  - `speichereFehlerAnhaenge(fehlerId:number, bilder:Array) → Promise<number>` (Anzahl gespeicherter Bilder).
  - `listeFehlerAnhaenge(fehlerId) → Promise<Array<{ Id, Dateiname, MimeTyp, GroesseBytes, HochgeladenAm }>>`.
  - `ladeFehlerAnhang(anhangId) → Promise<{ MimeTyp, Dateiname, Inhalt:Buffer } | undefined>`.
  - `listErrors(...)` liefert pro Zeile zusätzlich `AnzahlAnhaenge:number`.

- [ ] **Step 1: `logError` so ändern, dass es die Id zurückgibt**

In `backend/services/fehlerberichte.js` den UPDATE-Block um `OUTPUT inserted.Id` erweitern und die Id zurückgeben:

```js
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
        OUTPUT inserted.Id
        WHERE Fingerprint = @fp AND Erledigt = 0
      `);
    if (upd.recordset && upd.recordset.length > 0) return upd.recordset[0].Id;
```

Den INSERT-Block ebenfalls auf `OUTPUT inserted.Id` umstellen und die Id zurückgeben:

```js
    const ins = await pool.request()
      .input('quelle', sql.NVarChar(20), quelle)
      .input('nachricht', sql.NVarChar(sql.MAX), msg)
      .input('stack', sql.NVarChar(sql.MAX), stack || null)
      .input('kontext', sql.NVarChar(sql.MAX), kontextStr)
      .input('benutzerOid', sql.NVarChar(36), benutzerOid || null)
      .input('benutzerName', sql.NVarChar(200), benutzerName || null)
      .input('fp', sql.NVarChar(64), fp)
      .input('schweregrad', sql.NVarChar(10), schwere)
      .query(`
        INSERT INTO dbo.Fehlerberichte
          (Quelle, Nachricht, Stack, Kontext, BenutzerOid, BenutzerName, Fingerprint, Schweregrad)
        OUTPUT inserted.Id
        VALUES (@quelle, @nachricht, @stack, @kontext, @benutzerOid, @benutzerName, @fp, @schweregrad)
      `);
    return ins.recordset[0].Id;
```

(Der bestehende `catch`-Block bleibt; er gibt implizit `undefined` zurück — genau das Verhalten, das die Route für „keine Id" erwartet.)

- [ ] **Step 2: DB-Funktionen für Anhänge ergänzen**

Nach `logError` einfügen:

```js
// Speichert validierte Bilder zu einem Fehlerbericht. Rein additiv – prüft
// per parseUndValidiereBilder erneut (Defense-in-Depth). Gibt die Anzahl
// tatsächlich gespeicherter Bilder zurück.
async function speichereFehlerAnhaenge(fehlerId, bilder) {
  const { gueltig } = parseUndValidiereBilder(bilder);
  if (!gueltig.length) return 0;
  const pool = await getPool();
  for (const bild of gueltig) {
    await pool.request()
      .input('fehlerId', sql.Int, Number(fehlerId))
      .input('dateiname', sql.NVarChar(255), bild.name)
      .input('mimeTyp', sql.NVarChar(100), bild.mimeTyp)
      .input('groesse', sql.Int, bild.groesse)
      .input('inhalt', sql.VarBinary(sql.MAX), bild.buffer)
      .query(`
        INSERT INTO dbo.FehlerAnhaenge (FehlerId, Dateiname, MimeTyp, GroesseBytes, Inhalt)
        VALUES (@fehlerId, @dateiname, @mimeTyp, @groesse, @inhalt)
      `);
  }
  return gueltig.length;
}

// Metadaten aller Anhänge eines Fehlers (ohne Binärdaten).
async function listeFehlerAnhaenge(fehlerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fehlerId', sql.Int, Number(fehlerId))
    .query(`
      SELECT Id, Dateiname, MimeTyp, GroesseBytes, HochgeladenAm
      FROM dbo.FehlerAnhaenge
      WHERE FehlerId = @fehlerId
      ORDER BY HochgeladenAm ASC, Id ASC
    `);
  return result.recordset;
}

// Ein einzelner Anhang inkl. Binärdaten (für den Binär-Endpunkt).
async function ladeFehlerAnhang(anhangId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, Number(anhangId))
    .query('SELECT MimeTyp, Dateiname, Inhalt FROM dbo.FehlerAnhaenge WHERE Id = @id');
  return result.recordset[0];
}
```

- [ ] **Step 3: `listErrors` um `AnzahlAnhaenge` erweitern**

Die finale Query in `listErrors` so anpassen (Tabelle aliasen, Subquery ergänzen):

```js
  const result = await req.query(`
    SELECT TOP (${top}) fb.*,
      (SELECT COUNT(*) FROM dbo.FehlerAnhaenge fa WHERE fa.FehlerId = fb.Id) AS AnzahlAnhaenge
    FROM dbo.Fehlerberichte fb
    ${where}
    ORDER BY fb.LetzterZeitpunkt DESC
  `);
```

(Die `${where}`-Bedingungen referenzieren unqualifizierte Spalten wie `Quelle = @quelle`; bei nur einer Basistabelle bleiben sie eindeutig — keine Änderung an der WHERE-Erzeugung nötig.)

- [ ] **Step 4: Exporte ergänzen**

Das `module.exports`-Objekt um die neuen Funktionen erweitern:

```js
module.exports = { berechneFingerprint, logError, listErrors, markResolved, cleanupAlt, bewerteSchwere, setSchweregrad, istTransienterVerbindungsfehler, SCHWEREGRADE, parseUndValidiereBilder, speichereFehlerAnhaenge, listeFehlerAnhaenge, ladeFehlerAnhang };
```

- [ ] **Step 5: Bestehende Tests laufen lassen (Regression)**

Run: `node --test backend/services/fehlerberichte.test.js`
Expected: PASS (Task-2-Tests bleiben grün; DB-Funktionen werden hier nicht getestet, sie brauchen eine echte DB → manuelle Verifikation in Task 6).

- [ ] **Step 6: Commit**

```bash
git add backend/services/fehlerberichte.js
git commit -m "feat(fehlerberichte): logError liefert Id, Anhang-DB-Funktionen, AnzahlAnhaenge"
```

---

### Task 4: Route — `POST /errors` nimmt Bilder an + Developer-Endpunkte

**Files:**
- Modify: `backend/routes/fehlerberichte.js`

**Interfaces:**
- Consumes: `logError` (liefert Id), `speichereFehlerAnhaenge`, `listeFehlerAnhaenge`, `ladeFehlerAnhang` (Task 3); `nurDeveloper` (bereits in der Datei).
- Produces: HTTP-Verhalten — `POST /api/errors` speichert Bilder bei `quelle==='manual'`; `GET /api/dev/errors/:id/anhaenge` (Metadaten-Liste); `GET /api/dev/errors/anhaenge/:anhangId` (Binärdaten). Von Task 5 (Viewer) konsumiert.

- [ ] **Step 1: Imports erweitern**

Die Zeile-2-Destrukturierung in `backend/routes/fehlerberichte.js` ergänzen:

```js
const { logError, listErrors, markResolved, setSchweregrad, SCHWEREGRADE,
  speichereFehlerAnhaenge, listeFehlerAnhaenge, ladeFehlerAnhang } = require('../services/fehlerberichte');
```

- [ ] **Step 2: `POST /errors` um Bild-Handling erweitern**

Den Handler-Rumpf so anpassen (Body um `bilder` erweitern; `logError`-Rückgabe nutzen; Bilder danach speichern, ohne die Antwort zu gefährden):

```js
router.post('/errors', async (req, res) => {
  try {
    const { quelle, nachricht, stack, kontext, bilder } = req.body || {};
    if (!CLIENT_QUELLEN.has(quelle)) return res.status(400).json({ error: 'Ungültige Quelle.' });
    if (!nachricht || typeof nachricht !== 'string') return res.status(400).json({ error: 'Nachricht fehlt.' });
    const fehlerId = await logError({
      quelle,
      nachricht,
      stack: typeof stack === 'string' ? stack : null,
      kontext: kontext && typeof kontext === 'object' ? kontext : null,
      benutzerOid: req.user && req.user.oid,
      benutzerName: req.user && req.user.name,
    });
    // Bilder nur bei manuellen Meldungen und nur, wenn ein Zielsatz existiert.
    // Fehler beim Speichern dürfen die Meldung nicht kippen (204 bleibt).
    if (quelle === 'manual' && fehlerId && Array.isArray(bilder) && bilder.length) {
      try { await speichereFehlerAnhaenge(fehlerId, bilder); }
      catch (e) { console.error('[errors] Anhänge speichern fehlgeschlagen:', e.message); }
    }
    res.status(204).end();
  } catch (e) {
    console.error('[errors] Ingest fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Konnte Fehler nicht speichern.' });
  }
});
```

- [ ] **Step 3: Developer-Endpunkte für Anhänge ergänzen**

Vor `module.exports = router;` einfügen:

```js
// GET /api/dev/errors/:id/anhaenge — Metadaten der Anhänge (developer-only).
router.get('/dev/errors/:id/anhaenge', nurDeveloper, async (req, res) => {
  try {
    res.json(await listeFehlerAnhaenge(req.params.id));
  } catch (e) {
    console.error('[dev/errors] anhaenge list:', e.message);
    res.status(500).json({ error: 'Fehler beim Laden.' });
  }
});

// GET /api/dev/errors/anhaenge/:anhangId — Binärdaten eines Anhangs (developer-only).
router.get('/dev/errors/anhaenge/:anhangId', nurDeveloper, async (req, res) => {
  try {
    const a = await ladeFehlerAnhang(req.params.anhangId);
    if (!a) return res.status(404).json({ error: 'Anhang nicht gefunden.' });
    res.setHeader('Content-Type', a.MimeTyp || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.send(a.Inhalt); // VARBINARY → Buffer
  } catch (e) {
    console.error('[dev/errors] anhang:', e.message);
    res.status(500).json({ error: 'Fehler beim Laden.' });
  }
});
```

(Routing-Hinweis: `/dev/errors/anhaenge/:anhangId` kollidiert nicht mit `/dev/errors/:id/anhaenge` — letzteres verlangt das feste Segment `anhaenge` an dritter Stelle, ersteres hat es an zweiter.)

- [ ] **Step 4: Syntax-Smoke-Check**

Run (Repo-Root): `node -e "require('./backend/routes/fehlerberichte.js'); console.log('ok')"`
Expected: Ausgabe `ok` (kein Syntax-/Require-Fehler).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/fehlerberichte.js
git commit -m "feat(fehlerberichte): POST /errors nimmt Bilder an + Anhang-Endpunkte"
```

---

### Task 5: Frontend — Modal mit Bild-Anhang (Datei + Paste + Thumbnails)

**Files:**
- Modify: `app/js/error-reporter.js`
- Modify: `app/css/layout.css` (Thumbnail-Styles)

**Interfaces:**
- Consumes: `POST /api/errors` mit optionalem Feld `bilder: [{ name, mimeTyp, dataUrl }]` (Task 4).
- Produces: erweitertes `melde(quelle, nachricht, stack, extra, bilder)` (5. Parameter optional, abwärtskompatibel).

- [ ] **Step 1: `melde` um optionalen `bilder`-Parameter erweitern**

In `app/js/error-reporter.js` die Signatur und den Body erweitern:

```js
  function melde(quelle, nachricht, stack, extra, bilder) {
    if (sendet) return;
    if (quelle !== 'manual' && istTransienterVerbindungsfehler(nachricht)) return;
    const key = `${quelle}|${nachricht}|${String(stack || '').split('\n').slice(0, 2).join('|')}`;
    if (!sollMelden(key, Date.now(), gesehen, FENSTER_MS)) return;
    sendet = true;
    try {
      fetch(API_BASE + '/errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          quelle,
          nachricht: String(nachricht || '').slice(0, 4000),
          stack: stack ? String(stack).slice(0, 8000) : null,
          kontext: Object.assign({ url: location.href, seite: document.body?.dataset?.page || null,
            userAgent: navigator.userAgent }, extra || {}),
        }, (Array.isArray(bilder) && bilder.length) ? { bilder } : {})),
      }).catch(() => {}).finally(() => { sendet = false; });
    } catch (e) { sendet = false; }
  }
```

- [ ] **Step 2: Bild-Helfer + Limits im IIFE ergänzen**

Oberhalb von `baueFehlerMeldenModal` einfügen (Client-Limits identisch zum Server):

```js
  // ── Bild-Anhänge im Melde-Modal ─────────────────────────────────
  const FM_MAX_BILDER = 5;
  const FM_MAX_BILD_BYTES = 4 * 1024 * 1024;   // je Bild, dekodiert
  const FM_MAX_GESAMT_BYTES = 6 * 1024 * 1024; // Summe, dekodiert
  const FM_MAX_KANTE = 1600;                   // längste Kante nach Skalierung

  function fmHinweis(msg) {
    if (typeof Toast !== 'undefined' && typeof Toast.error === 'function') Toast.error('Hinweis', msg);
    else alert(msg);
  }
  function fmEsc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmDataUrlBytes(dataUrl) {
    const komma = dataUrl.indexOf(',');
    const b64 = komma >= 0 ? dataUrl.slice(komma + 1) : dataUrl;
    return Math.floor(b64.length * 3 / 4);
  }
  function fmDateiZuDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  // Skaliert nur, wenn die längste Kante FM_MAX_KANTE übersteigt. PNG behält
  // seinen Typ (Transparenz), alles andere wird als JPEG (kleiner) ausgegeben.
  function fmSkaliere(dataUrl, mimeTyp) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = Math.max(img.width, img.height);
        if (max <= FM_MAX_KANTE) { resolve(dataUrl); return; }
        const faktor = FM_MAX_KANTE / max;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * faktor);
        canvas.height = Math.round(img.height * faktor);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const ziel = mimeTyp === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(ziel, 0.85));
      };
      img.onerror = () => resolve(dataUrl); // Fallback: Original behalten
      img.src = dataUrl;
    });
  }
```

- [ ] **Step 3: Modal-HTML um die Anhang-Zone erweitern**

Im Template von `baueFehlerMeldenModal` den `modal__body` so ersetzen, dass unter dem Textfeld die Bild-Zone erscheint:

```js
        <div class="modal__body">
          <p class="form-hint" style="margin:0 0 var(--sp-3)">Beschreibe kurz, was nicht funktioniert hat.</p>
          <div class="form-group">
            <textarea class="form-control" id="fmText" rows="5" maxlength="4000" placeholder="Was ist passiert?"></textarea>
          </div>
          <div class="form-group">
            <p class="form-hint" style="margin:0 0 var(--sp-2)">Bilder / Screenshots (optional) — Screenshot mit Strg+V einfügen oder Datei wählen, max. 5.</p>
            <input type="file" id="fmFile" accept="image/*" multiple hidden>
            <button class="btn btn-outline btn-sm" type="button" id="fmFileBtn">Bild auswählen</button>
            <div id="fmThumbs" class="fm-thumbs"></div>
          </div>
        </div>
```

- [ ] **Step 4: State, Thumbnails, Datei-/Paste-Handler + Senden verdrahten**

Innerhalb von `baueFehlerMeldenModal` (nach `document.body.appendChild(overlay);`, vor `return overlay;`) einfügen — und den bestehenden `#fmSendBtn`-Listener durch die neue Variante ersetzen:

```js
    let bilder = [];

    function zeichneThumbnails() {
      const box = overlay.querySelector('#fmThumbs');
      box.innerHTML = bilder.map((b, i) =>
        `<div class="fm-thumb"><img src="${b.dataUrl}" alt="${fmEsc(b.name)}">`
        + `<button type="button" class="fm-thumb__del" data-del="${i}" aria-label="Entfernen">✕</button></div>`).join('');
      box.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
        bilder.splice(Number(btn.dataset.del), 1);
        zeichneThumbnails();
      }));
    }

    async function fuegeDateiHinzu(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) { fmHinweis('Nur Bilder können angehängt werden.'); return; }
      if (bilder.length >= FM_MAX_BILDER) { fmHinweis(`Maximal ${FM_MAX_BILDER} Bilder.`); return; }
      let dataUrl;
      try {
        const roh = await fmDateiZuDataUrl(file);
        dataUrl = await fmSkaliere(roh, file.type);
      } catch (e) { fmHinweis('Bild konnte nicht verarbeitet werden.'); return; }
      const groesse = fmDataUrlBytes(dataUrl);
      if (groesse > FM_MAX_BILD_BYTES) { fmHinweis('Bild ist auch nach Verkleinern zu groß (max. 4 MB).'); return; }
      const gesamt = bilder.reduce((s, b) => s + fmDataUrlBytes(b.dataUrl), 0);
      if (gesamt + groesse > FM_MAX_GESAMT_BYTES) { fmHinweis('Gesamtgröße der Bilder zu groß (max. 6 MB).'); return; }
      const mimeTyp = dataUrl.slice(5, dataUrl.indexOf(';'));
      bilder.push({ name: file.name || 'screenshot.png', mimeTyp, dataUrl });
      zeichneThumbnails();
    }

    overlay.querySelector('#fmFileBtn').addEventListener('click', () => overlay.querySelector('#fmFile').click());
    overlay.querySelector('#fmFile').addEventListener('change', (e) => {
      Array.from(e.target.files || []).forEach(fuegeDateiHinzu);
      e.target.value = ''; // gleiche Datei erneut wählbar
    });
    overlay.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) fuegeDateiHinzu(file);
        }
      }
    });

    overlay.querySelector('#fmSendBtn').addEventListener('click', () => {
      const feld = overlay.querySelector('#fmText');
      const text = feld.value.trim();
      if (!text) return;
      melde('manual', text, null, { gemeldetVon: 'profil' },
        bilder.map(b => ({ name: b.name, mimeTyp: b.mimeTyp, dataUrl: b.dataUrl })));
      feld.value = '';
      bilder = [];
      zeichneThumbnails();
      fmModalOffen();
      if (typeof Toast !== 'undefined' && typeof Toast.success === 'function') {
        Toast.success('Danke!', 'Deine Meldung wurde übermittelt.');
      }
    });
```

**Wichtig:** Der bisherige `overlay.querySelector('#fmSendBtn').addEventListener(...)`-Block (mit dem alten 4-Argument-`melde`-Aufruf) wird durch obigen ersetzt — nicht zusätzlich stehen lassen, sonst doppelte Listener.

- [ ] **Step 5: Thumbnail-CSS in `layout.css` ergänzen**

Ans Ende von `app/css/layout.css` anfügen:

```css
/* Fehler-melden-Modal: Bild-Anhang-Vorschau */
.fm-thumbs { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
.fm-thumb { position: relative; width: 72px; height: 72px; border-radius: var(--radius-sm, 6px); overflow: hidden; border: 1px solid var(--pm-grey-300, #ccc); }
.fm-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fm-thumb__del { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; line-height: 16px; padding: 0;
  border: none; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; cursor: pointer; }
.fm-thumb__del:hover { background: rgba(0,0,0,.85); }
```

- [ ] **Step 6: Commit**

```bash
git add app/js/error-reporter.js app/css/layout.css
git commit -m "feat(error-reporter): Bilder/Screenshots im Melde-Modal anhaengen"
```

---

### Task 6: Viewer — Anhänge im Fehlerberichte-Dashboard anzeigen + End-to-End-Verifikation

**Files:**
- Modify: `app/js/fehlerberichte.js`
- Modify: `app/css/layout.css` (Viewer-Anhang-Styles)

**Interfaces:**
- Consumes: `r.AnzahlAnhaenge` aus `listErrors` (Task 3); `GET /dev/errors/:id/anhaenge` und Binär-URL `/api/dev/errors/anhaenge/:id` (Task 4).

- [ ] **Step 1: Anhang-`<details>` in `zeile(r)` ergänzen**

In `app/js/fehlerberichte.js` in der Funktion `zeile(r)` nach der Kontext-Zeile (vor dem schließenden `</div>`) einfügen:

```js
        ${r.AnzahlAnhaenge > 0 ? `<details class="fb-row__anh"><summary>Anhänge (${r.AnzahlAnhaenge})</summary><div class="fb-anh" data-anh-id="${r.Id}"></div></details>` : ''}
```

- [ ] **Step 2: Lazy-Load der Thumbnails in `render(rows)` verdrahten**

In `render(rows)` nach den bestehenden `main.querySelectorAll('[data-sev-id]')...`-Listenern einfügen:

```js
    main.querySelectorAll('.fb-row__anh').forEach(det => {
      det.addEventListener('toggle', async () => {
        if (!det.open) return;
        const box = det.querySelector('.fb-anh');
        if (box.dataset.geladen) return;
        box.dataset.geladen = '1';
        try {
          const list = await apiFetch(`/dev/errors/${box.dataset.anhId}/anhaenge`);
          box.innerHTML = list.length
            ? list.map(a => `<a href="/api/dev/errors/anhaenge/${a.Id}" target="_blank" rel="noopener" class="fb-anh__item" title="${esc(a.Dateiname)}"><img src="/api/dev/errors/anhaenge/${a.Id}" alt="${esc(a.Dateiname)}" loading="lazy"></a>`).join('')
            : '<span class="fb-anh__leer">—</span>';
        } catch (e) {
          box.dataset.geladen = '';
          box.innerHTML = '<span class="fb-anh__leer">Laden fehlgeschlagen.</span>';
        }
      });
    });
```

(Hinweis: Die Binär-URL ist bewusst absolut mit `/api`-Präfix, weil sie in `<img src>`/`href` steht — passend zum Single-Origin-Betrieb über `:3000`, siehe Memory `project_local_dev_single_origin`. `apiFetch` wird nur für die Metadaten-Liste genutzt, da es das `/api`-Präfix selbst setzt.)

- [ ] **Step 3: Viewer-CSS in `layout.css` ergänzen**

Ans Ende von `app/css/layout.css` anfügen:

```css
/* Fehlerberichte-Viewer: Anhang-Thumbnails */
.fb-anh { display: flex; flex-wrap: wrap; gap: var(--sp-2); padding: var(--sp-2) 0; }
.fb-anh__item { display: block; width: 96px; height: 96px; border-radius: var(--radius-sm, 6px); overflow: hidden; border: 1px solid var(--pm-grey-300, #ccc); }
.fb-anh__item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fb-anh__leer { color: var(--pm-grey-500, #888); font-size: .9em; }
```

- [ ] **Step 4: End-to-End-Verifikation im Browser**

Backend starten und mit Demo-Login prüfen (siehe Memory `reference_local_app_testing` / `reference_e2e_test_harness`; Server neu starten, damit die neue Route greift — Memory `reference_dev_server_restart_after_code_change`):

1. `npm run dev` in `backend/` (Port 3000), App über `http://localhost:3000` öffnen.
2. Als normaler Nutzer „Fehler melden" öffnen, Text eingeben, (a) eine Bilddatei wählen **und** (b) einen Screenshot mit Strg+V einfügen → zwei Thumbnails erscheinen, ✕ entfernt eines → Senden → Erfolg-Toast.
3. Als **Developer** die Fehlerberichte-Seite öffnen → beim neuen Eintrag „Anhänge (N)" aufklappen → Thumbnail(s) laden → Klick öffnet das Bild in voller Größe.
4. Negativtest: >5 Bilder bzw. sehr großes Bild → Hinweis-Toast, Meldung geht dennoch mit gültigen Bildern raus.

Expected: Bilder werden gespeichert und developer-seitig angezeigt; ungültige Eingaben werden abgefangen, ohne die Meldung zu verlieren.

- [ ] **Step 5: Commit**

```bash
git add app/js/fehlerberichte.js app/css/layout.css
git commit -m "feat(fehlerberichte-viewer): Anhaenge als Thumbnails anzeigen"
```

---

## Self-Review

- **Spec coverage:** Migration/Tabelle → Task 1; Eingabe-UX (Datei+Paste+Thumbnails+Skalierung+Limits) → Task 5; Transport/base64 → Task 4/5; Backend-Validierung + `logError`-Id + Speichern → Task 2/3/4; Developer-Endpunkte → Task 4; Viewer-Anzeige → Task 6; „Bild-Fehler killt Meldung nie" → Task 4 Step 2; Fingerprint-Randfall → durch `speichereFehlerAnhaenge(fehlerId, …)` gegen die (ggf. gruppierte) Zeile abgedeckt; Tests → Task 2. Alle Spec-Punkte abgedeckt.
- **Neu ggü. Spec (konsistente Verfeinerung):** kumulativer 6-MB-Deckel, damit die base64-Payload unter dem globalen 10-MB-`express.json`-Limit bleibt — in den Global Constraints dokumentiert.
- **Type-Konsistenz:** `logError → Id:number`; `parseUndValidiereBilder → {gueltig:[{name,mimeTyp,buffer,groesse}],verworfen}`; `speichereFehlerAnhaenge(fehlerId,bilder)→number`; `listeFehlerAnhaenge→[{Id,Dateiname,MimeTyp,GroesseBytes,HochgeladenAm}]`; `ladeFehlerAnhang→{MimeTyp,Dateiname,Inhalt}`; Frontend-Feld `bilder:[{name,mimeTyp,dataUrl}]` — durchgängig gleich benannt.
