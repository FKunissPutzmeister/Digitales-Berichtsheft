const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');

/* Fahrtgeld-Stammdaten je Azubi. Der eingeloggte User (req.user.oid) ist
   die Quelle – Azubis verwalten nur ihre eigene Konfiguration. */

// GET /api/fahrtgeld/konfig
router.get('/konfig', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('oid', sql.NVarChar(36), req.user.oid)
      .query('SELECT * FROM dbo.FahrtgeldKonfig WHERE AzubiOid = @oid');
    const row = result.recordset[0];
    if (!row) return res.json(null);
    res.json({
      name:            row.Name ?? '',
      persNr:          row.PersNr ?? '',
      kst:             row.Kst ?? '',
      vonHaltestelle:  row.VonHaltestelle ?? '',
      nachHaltestelle: row.NachHaltestelle ?? '',
      betragProTag:    row.BetragProTag ?? 0,
    });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[fahrtgeld] konfig get: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/fahrtgeld/konfig  (upsert für den eingeloggten Azubi)
router.put('/konfig', async (req, res) => {
  try {
    const { name, persNr, kst, vonHaltestelle, nachHaltestelle, betragProTag } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('oid',             sql.NVarChar(36),  req.user.oid)
      .input('name',            sql.NVarChar(120), name || null)
      .input('persNr',          sql.NVarChar(20),  persNr || null)
      .input('kst',             sql.NVarChar(20),  kst || null)
      .input('vonHaltestelle',  sql.NVarChar(120), vonHaltestelle || null)
      .input('nachHaltestelle', sql.NVarChar(120), nachHaltestelle || null)
      .input('betragProTag',    sql.Decimal(6, 2), Number(betragProTag) || 0)
      .query(`
        MERGE dbo.FahrtgeldKonfig AS target
        USING (SELECT @oid AS AzubiOid) AS source ON target.AzubiOid = source.AzubiOid
        WHEN MATCHED THEN
          UPDATE SET Name = @name, PersNr = @persNr, Kst = @kst,
                     VonHaltestelle = @vonHaltestelle, NachHaltestelle = @nachHaltestelle,
                     BetragProTag = @betragProTag, UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (AzubiOid, Name, PersNr, Kst, VonHaltestelle, NachHaltestelle, BetragProTag)
          VALUES (@oid, @name, @persNr, @kst, @vonHaltestelle, @nachHaltestelle, @betragProTag);
      `);
    res.json({ ok: true });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[fahrtgeld] konfig put: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
