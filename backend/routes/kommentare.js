const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { darfWocheKorrigieren } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');

const ERLAUBTE_TYPEN = ['ausbilder', 'abgelehnt'];

// POST /api/wochen/:wocheId/kommentare  (nur aktiv Verantwortliche/r)
router.post('/:wocheId/kommentare', async (req, res) => {
  try {
    const { text, typ, tagId } = req.body;
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, req.params.wocheId);
    if (!woche) return res.status(404).json({ error: 'Woche nicht gefunden' });

    const kontext = await ladeKorrekturKontext(pool, req.user.email);
    if (!darfWocheKorrigieren(req.user, woche, kontext)) {
      return res.status(403).json({ error: 'Keine Berechtigung, diese Woche zu kommentieren.' });
    }

    const sichererTyp = ERLAUBTE_TYPEN.includes(typ) ? typ : 'ausbilder';
    const result = await pool.request()
      .input('wocheId', sql.Int,             req.params.wocheId)
      .input('userOid', sql.NVarChar(36),    req.user.oid)
      .input('text',    sql.NVarChar(sql.MAX), text)
      .input('datum',   sql.Date,            new Date().toISOString().split('T')[0])
      .input('typ',     sql.NVarChar(20),    sichererTyp)
      .input('tagId',   sql.Int,             tagId ?? null)
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
