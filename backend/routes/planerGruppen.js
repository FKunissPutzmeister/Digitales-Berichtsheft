const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');

/* Eigene Gruppen der Plantafel (dbo.PlanerGruppen, Migration 035).
   Gemeinsam gepflegt: wer planen darf, sieht und aendert alle Gruppen — die
   Plantafel selbst haengt am gleichen Recht. Kein Besitzer-Gate, ErstelltVon
   dient nur der Nachvollziehbarkeit. */
function nurPlaner(req, res, next) {
  if (!req.user || !req.user.kannPlanen) {
    return res.status(403).json({ error: 'Kein Planungsrecht.' });
  }
  next();
}
router.use(nurPlaner);

const NAME_MAX = 60;                       // = NVARCHAR(60) in Migration 035

function saubererName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}
// Oids kommen aus der Auswahl im Dialog; hier nur gegen Muell absichern
// (Laenge = Spaltenbreite) und doppelte Eintraege wegwerfen, sonst laeuft der
// zweite INSERT in den Primaerschluessel (GruppeId, AzubiOid).
function saubereOids(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(o => String(o ?? '').trim()).filter(o => o && o.length <= 36))];
}

function istNamensDublette(err) {
  return /UX_PlanerGruppen_Name|duplicate key|UNIQUE KEY/i.test(err.message || '');
}

function fehler(req, res, err, wo) {
  logError({
    quelle: 'backend', nachricht: `[planer-gruppen] ${wo}: ${err.message}`, stack: err.stack,
    kontext: { route: req.path, methode: req.method },
    benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name,
  });
  res.status(500).json({ error: 'Fehler' });
}

// Mitglieder in der offenen Transaktion neu setzen (erst leeren, dann fuellen).
// DELETE+INSERT ist hier unbedenklich: auf dbo.PlanerGruppenMitglieder zeigt
// keine dritte Tabelle (anders als bei dbo.Tage, wo genau das an einem FK
// scheiterte und durch MERGE ersetzt wurde).
async function setzeMitglieder(tx, gruppeId, oids) {
  await new sql.Request(tx)
    .input('id', sql.Int, gruppeId)
    .query('DELETE FROM dbo.PlanerGruppenMitglieder WHERE GruppeId = @id');
  for (const oid of oids) {
    await new sql.Request(tx)
      .input('id', sql.Int, gruppeId)
      .input('oid', sql.NVarChar(36), oid)
      .query('INSERT INTO dbo.PlanerGruppenMitglieder (GruppeId, AzubiOid) VALUES (@id, @oid)');
  }
}

// GET /api/planer-gruppen → [{ id, name, erstelltAm, mitglieder:[oid] }]
// Zwei Abfragen statt eines JOINs mit Zeilen-Duplikaten; zusammengesetzt wird
// im Speicher (es sind wenige Gruppen mit wenigen Mitgliedern).
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const [gruppen, mitglieder] = await Promise.all([
      pool.request().query('SELECT Id, Name, ErstelltAm FROM dbo.PlanerGruppen ORDER BY Name'),
      pool.request().query('SELECT GruppeId, AzubiOid FROM dbo.PlanerGruppenMitglieder'),
    ]);
    const byId = new Map(gruppen.recordset.map(r => [r.Id, { id: r.Id, name: r.Name, erstelltAm: r.ErstelltAm, mitglieder: [] }]));
    mitglieder.recordset.forEach(r => { const g = byId.get(r.GruppeId); if (g) g.mitglieder.push(r.AzubiOid); });
    res.json([...byId.values()]);
  } catch (err) { fehler(req, res, err, 'list'); }
});

/* Gruppen-Reihenfolge der Plantafel (dbo.PlanerGruppenSortierung, Migration
   036) – PRO NUTZER, anders als die Gruppen selbst. Muss VOR den /:id-Routen
   stehen, sonst faengt PUT /:id das "sortierung" als Id ab. */
const ORDER_MAX_KEYS = 60;                 // mehr Gruppen gibt es auf der Tafel nicht
const ORDER_MAX_JSON = 2000;               // = NVARCHAR(2000) in Migration 036

function saubereReihenfolge(raw) {
  if (!Array.isArray(raw)) return null;
  const keys = [...new Set(raw.map(k => String(k ?? '').trim()).filter(k => k && k.length <= 100))]
    .slice(0, ORDER_MAX_KEYS);
  const json = JSON.stringify(keys);
  return json.length > ORDER_MAX_JSON ? null : { keys, json };
}

// GET /api/planer-gruppen/sortierung → { reihenfolge: [key] }
router.get('/sortierung', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('oid', sql.NVarChar(36), req.user.oid || '')
      .query('SELECT Reihenfolge FROM dbo.PlanerGruppenSortierung WHERE BenutzerOid = @oid');
    let keys = [];
    if (r.recordset.length) {
      // Kaputtes JSON darf die Tafel nicht am Laden hindern – dann eben unsortiert.
      try { const v = JSON.parse(r.recordset[0].Reihenfolge); if (Array.isArray(v)) keys = v; } catch { /* egal */ }
    }
    res.json({ reihenfolge: keys });
  } catch (err) { fehler(req, res, err, 'sortierung-get'); }
});

// PUT /api/planer-gruppen/sortierung { reihenfolge: [key] }
router.put('/sortierung', async (req, res) => {
  const clean = saubereReihenfolge(req.body && req.body.reihenfolge);
  if (!clean) return res.status(400).json({ error: 'Ungültige Reihenfolge.' });
  try {
    const pool = await getPool();
    await pool.request()
      .input('oid', sql.NVarChar(36), req.user.oid || '')
      .input('json', sql.NVarChar(2000), clean.json)
      .query(`MERGE dbo.PlanerGruppenSortierung AS z
              USING (SELECT @oid AS BenutzerOid) AS q ON z.BenutzerOid = q.BenutzerOid
              WHEN MATCHED THEN UPDATE SET Reihenfolge = @json, GeaendertAm = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (BenutzerOid, Reihenfolge) VALUES (@oid, @json);`);
    res.json({ ok: true });
  } catch (err) { fehler(req, res, err, 'sortierung-put'); }
});

// POST /api/planer-gruppen { name, mitglieder?[] } → { id }
router.post('/', async (req, res) => {
  const name = saubererName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'Bitte einen Namen angeben.' });
  const oids = saubereOids(req.body && req.body.mitglieder);
  let tx;
  try {
    const pool = await getPool();
    tx = new sql.Transaction(pool);
    await tx.begin();
    const ins = await new sql.Request(tx)
      .input('name', sql.NVarChar(NAME_MAX), name)
      .input('von', sql.NVarChar(36), req.user.oid || null)
      .query(`INSERT INTO dbo.PlanerGruppen (Name, ErstelltVon)
              VALUES (@name, @von); SELECT SCOPE_IDENTITY() AS Id;`);
    const id = Number(ins.recordset[0].Id);
    await setzeMitglieder(tx, id, oids);
    await tx.commit();
    res.json({ id, name, mitglieder: oids });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    if (istNamensDublette(err)) return res.status(409).json({ error: 'Eine Gruppe mit diesem Namen gibt es schon.' });
    fehler(req, res, err, 'create');
  }
});

// PUT /api/planer-gruppen/:id { name?, mitglieder? }
// Umbenennen und/oder Mitgliederliste ersetzen. mitglieder ist absichtlich die
// VOLLE Liste (kein Hinzufuegen/Entfernen einzelner Oids): der Dialog kennt
// den Zielzustand, damit gibt es keine Reihenfolge-Abhaengigkeit.
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Unbekannte Gruppe.' });
  const hatName = req.body && req.body.name !== undefined;
  const hatMitglieder = req.body && req.body.mitglieder !== undefined;
  const name = hatName ? saubererName(req.body.name) : null;
  if (hatName && !name) return res.status(400).json({ error: 'Bitte einen Namen angeben.' });
  let tx;
  try {
    const pool = await getPool();
    tx = new sql.Transaction(pool);
    await tx.begin();
    if (hatName) {
      const upd = await new sql.Request(tx)
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar(NAME_MAX), name)
        .query('UPDATE dbo.PlanerGruppen SET Name = @name WHERE Id = @id');
      if (!upd.rowsAffected[0]) { await tx.rollback(); return res.status(404).json({ error: 'Gruppe nicht gefunden.' }); }
    }
    if (hatMitglieder) await setzeMitglieder(tx, id, saubereOids(req.body.mitglieder));
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    if (istNamensDublette(err)) return res.status(409).json({ error: 'Eine Gruppe mit diesem Namen gibt es schon.' });
    fehler(req, res, err, 'update');
  }
});

// DELETE /api/planer-gruppen/:id — Mitgliedschaften gehen per ON DELETE CASCADE mit.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Unbekannte Gruppe.' });
  try {
    const pool = await getPool();
    const del = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.PlanerGruppen WHERE Id = @id');
    if (!del.rowsAffected[0]) return res.status(404).json({ error: 'Gruppe nicht gefunden.' });
    res.json({ ok: true });
  } catch (err) { fehler(req, res, err, 'delete'); }
});

module.exports = router;
