const router = require('express').Router();
const { getPool } = require('../db/connection');
const svc = require('../services/unterschriften');
const { logError } = require('../services/fehlerberichte');

// GET /api/unterschrift/meine -> { dataUrl, extension } | null
router.get('/meine', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await svc.holeMeine(pool, req.user.oid));
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[unterschrift] meine get: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/unterschrift/meine  { dataUrl, extension } -> Upsert
router.put('/meine', async (req, res) => {
  try {
    const pool = await getPool();
    await svc.speichereMeine(pool, req.user.oid, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    const clientError = /zu groß|Ungültige/.test(err.message);
    if (!clientError) {
      logError({ quelle: 'backend', nachricht: `[unterschrift] meine put: ${err.message}`, stack: err.stack,
        kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    }
    res.status(clientError ? 400 : 500).json({ error: err.message });
  }
});

module.exports = router;
