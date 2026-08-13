const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');

// GET /api/benachrichtigungen
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userOid', sql.NVarChar(36), req.user.oid)
      .query(`
        -- FromUserName kommt aus dem zweiten JOIN, weil manche Mitteilungen den
        -- Namen des Absenders IM TEXT brauchen. Bei 'loeschung_geplant' ist der
        -- Absender das Konto, das geloescht werden soll: es ist inaktiv und
        -- damit fuer Empfaenger mit KannPlanen gar nicht in der Nutzerliste
        -- sichtbar (routes/users.js) — ohne den Namen hier ist die Vorwarnung
        -- nicht zuordenbar und deshalb unbrauchbar.
        SELECT b.*, w.KW, w.Jahr, w.AzubiOid, fu.Name AS FromUserName
        FROM dbo.Benachrichtigungen b
        LEFT JOIN dbo.Wochen w ON w.Id = b.WocheId
        LEFT JOIN dbo.Users fu ON fu.Oid = b.FromUserOid
        WHERE b.UserOid = @userOid
        ORDER BY b.Timestamp DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[benachrichtigungen] list: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
    logError({ quelle: 'backend', nachricht: `[benachrichtigungen] count: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
    logError({ quelle: 'backend', nachricht: `[benachrichtigungen] create: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
    logError({ quelle: 'backend', nachricht: `[benachrichtigungen] gelesen: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
    logError({ quelle: 'backend', nachricht: `[benachrichtigungen] alle-gelesen: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
