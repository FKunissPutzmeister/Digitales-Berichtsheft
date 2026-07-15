const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');
const { listeFuerNutzer, validiereVertreter, anlegen, beenden } = require('../services/vertretungen');

// Nur betreuende Personen (kein Azubi/DH-Student) dürfen Vertreter benennen.
function nurBetreuend(req, res, next) {
  if (!req.user || req.user.istAzubi || req.user.istDhStudent) {
    return res.status(403).json({ error: 'Nur betreuende Personen können eine Vertretung einrichten.' });
  }
  next();
}

// Best-effort In-App-Mitteilung an den Vertreter. Fehler (u.a. CHECK-Constraint
// vor Migration 021) dürfen den Vorgang NIE brechen. WocheId bleibt NULL.
async function benachrichtigeVertreter(pool, vertreterOid, typ, fromOid) {
  if (!vertreterOid || vertreterOid === fromOid) return;
  try {
    await pool.request()
      .input('userOid', sql.NVarChar(36), vertreterOid)
      .input('typ',     sql.NVarChar(40), typ)
      .input('fromOid', sql.NVarChar(36), fromOid || null)
      .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
              VALUES (@userOid, @typ, NULL, @fromOid)`);
  } catch (_) { /* best-effort */ }
}

// GET /api/vertretungen – meine Vertretungen (vergeben + erhalten)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await listeFuerNutzer(pool, req.user.oid));
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[vertretungen] list: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /api/vertretungen – eigene Vertretung anlegen { vertreterOid, von?, bis? }
router.post('/', nurBetreuend, async (req, res) => {
  try {
    const { vertreterOid, von, bis } = req.body || {};
    const check = await validiereVertreter(vertreterOid, req.user.oid);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    if (von && bis && bis < von) return res.status(400).json({ error: 'Das Bis-Datum liegt vor dem Von-Datum.' });

    const pool = await getPool();
    let id;
    try {
      id = await anlegen(pool, { vertretenerOid: req.user.oid, vertreterOid, von: von || null, bis: bis || null, erstelltVon: req.user.oid });
    } catch (e) {
      // UNIQUE (VertretenerOid, VertreterOid) verletzt → schon vergeben.
      if (/UQ_Vertretungen|UNIQUE|duplicate/i.test(e.message)) {
        return res.status(409).json({ error: 'Diese Person ist bereits als dein Vertreter eingetragen.' });
      }
      throw e;
    }
    await benachrichtigeVertreter(pool, vertreterOid, 'vertretung_neu', req.user.oid);
    res.json({ id });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[vertretungen] create: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/vertretungen/:id – eigene Vertretung beenden
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const row = await beenden(pool, Number(req.params.id) || 0, req.user.oid);
    if (!row) return res.status(404).json({ error: 'Vertretung nicht gefunden.' });
    await benachrichtigeVertreter(pool, row.VertreterOid, 'vertretung_beendet', req.user.oid);
    res.json({ ok: true });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[vertretungen] delete: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

module.exports = router;
