const router = require('express').Router();
const { getPool, sql } = require('../db/connection');

// GET /api/zuweisungen?azubiOid=...&ausbilderOid=...
router.get('/', async (req, res) => {
  try {
    const { azubiOid, ausbilderOid } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '1=1';

    if (azubiOid) {
      request.input('azubiOid', sql.NVarChar(36), azubiOid);
      where += ' AND AzubiOid = @azubiOid';
    }
    if (ausbilderOid) {
      request.input('ausbilderOid', sql.NVarChar(36), ausbilderOid);
      where += ' AND AusbilderOid = @ausbilderOid';
    }

    const result = await request.query(
      `SELECT * FROM dbo.Zuweisungen WHERE ${where} ORDER BY AzubiOid, Von DESC`
    );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zuweisungen
router.post('/', async (req, res) => {
  try {
    const { azubiOid, ausbilderOid, abteilung, von, bis } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('azubiOid',     sql.NVarChar(36),  azubiOid)
      .input('ausbilderOid', sql.NVarChar(36),  ausbilderOid)
      .input('abteilung',    sql.NVarChar(100), abteilung || null)
      .input('von',          sql.Date,          von)
      .input('bis',          sql.Date,          bis)
      .query(`
        INSERT INTO dbo.Zuweisungen (AzubiOid, AusbilderOid, Abteilung, Von, Bis)
        OUTPUT inserted.Id
        VALUES (@azubiOid, @ausbilderOid, @abteilung, @von, @bis)
      `);
    res.json({ id: result.recordset[0].Id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/zuweisungen/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.Zuweisungen WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
