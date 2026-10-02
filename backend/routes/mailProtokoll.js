const router = require('express').Router();
const { listeProtokoll } = require('../services/mail');

// GET /api/dev/mails?limit=500 — Versandprotokoll für die Seite „E-Mails" (developer-only).
router.get('/dev/mails', async (req, res) => {
  if (!req.user || req.user.role !== 'developer') return res.status(403).json({ error: 'Nur für Developer.' });
  try {
    res.json(await listeProtokoll(req.query.limit));
  } catch (e) {
    console.error('[dev/mails] list:', e.message);
    res.status(500).json({ error: 'Fehler beim Laden.' });
  }
});

module.exports = router;
