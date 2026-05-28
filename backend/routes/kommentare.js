const router = require('express').Router();
const { getPool, sql } = require('../db/connection');

// POST /api/wochen/:wocheId/kommentare
router.post('/:wocheId/kommentare', async (req, res) => {
  try {
    const { text, typ, tagId } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('wocheId', sql.Int,          req.params.wocheId)
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .input('text',    sql.NVarChar(sql.MAX), text)
      .input('datum',   sql.Date,         new Date().toISOString().split('T')[0])
      .input('typ',     sql.NVarChar(20), typ || 'ausbilder')
      .input('tagId',   sql.Int,          tagId ?? null)
      .query(`
        INSERT INTO dbo.Kommentare (WocheId, UserOid, Text, Datum, Typ, TagId)
        OUTPUT inserted.Id
        VALUES (@wocheId, @userOid, @text, @datum, @typ, @tagId)
      `);
    res.json({ id: result.recordset[0].Id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/wochen/kommentare/:id  (nur eigene Kommentare)
router.delete('/kommentare/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',      sql.Int,          req.params.id)
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .query('DELETE FROM dbo.Kommentare WHERE Id = @id AND UserOid = @userOid');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
