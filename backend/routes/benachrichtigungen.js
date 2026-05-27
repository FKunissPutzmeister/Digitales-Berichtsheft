const router = require('express').Router();
const { getPool, sql } = require('../db/connection');

// GET /api/benachrichtigungen
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .query(`
        SELECT b.*, w.KW, w.Jahr, w.AzubiOid
        FROM dbo.Benachrichtigungen b
        LEFT JOIN dbo.Wochen w ON w.Id = b.WocheId
        WHERE b.UserOid = @userOid
        ORDER BY b.Timestamp DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/benachrichtigungen/count
router.get('/count', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .query(`
        SELECT COUNT(*) AS ungelesen FROM dbo.Benachrichtigungen
        WHERE UserOid = @userOid AND Gelesen = 0
      `);
    res.json({ ungelesen: result.recordset[0].ungelesen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/benachrichtigungen
router.post('/', async (req, res) => {
  try {
    const { userOid, typ, wocheId, fromUserOid } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('userOid',     sql.NVarChar(36), userOid)
      .input('typ',         sql.NVarChar(20), typ)
      .input('wocheId',     sql.Int,          wocheId)
      .input('fromUserOid', sql.NVarChar(36), fromUserOid)
      .query(`
        INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
        OUTPUT inserted.Id
        VALUES (@userOid, @typ, @wocheId, @fromUserOid)
      `);
    res.json({ id: result.recordset[0].Id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/benachrichtigungen/:id/gelesen
router.patch('/:id/gelesen', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',      sql.Int,          req.params.id)
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .query('UPDATE dbo.Benachrichtigungen SET Gelesen = 1 WHERE Id = @id AND UserOid = @userOid');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/benachrichtigungen/alle-gelesen
router.patch('/alle-gelesen', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .query('UPDATE dbo.Benachrichtigungen SET Gelesen = 1 WHERE UserOid = @userOid AND Gelesen = 0');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
