const router = require('express').Router();
const { getPool, sql } = require('../db/connection');

// POST /api/wochen/:wocheId/kommentare
router.post('/:wocheId/kommentare', async (req, res) => {
  try {
    const { text, typ } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('wocheId', sql.Int,          req.params.wocheId)
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .input('text',    sql.NVarChar(sql.MAX), text)
      .input('datum',   sql.Date,         new Date().toISOString().split('T')[0])
      .input('typ',     sql.NVarChar(20), typ || 'ausbilder')
      .query(`
        INSERT INTO dbo.Kommentare (WocheId, UserOid, Text, Datum, Typ)
        OUTPUT inserted.Id
        VALUES (@wocheId, @userOid, @text, @datum, @typ)
      `);
    res.json({ id: result.recordset[0].Id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
