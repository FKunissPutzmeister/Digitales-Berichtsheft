const router = require('express').Router();
const { logError, listErrors, markResolved } = require('../services/fehlerberichte');

// Nur Server setzt 'backend'. Der Client darf ausschließlich diese Quellen melden.
const CLIENT_QUELLEN = new Set(['frontend', 'manual']);

function nurDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Nur für Developer.' });
  }
  next();
}

// POST /api/errors — Ingest für Frontend-Handler + manuellen Melde-Button.
// Identität kommt aus der Session (req.user), NICHT aus dem Body → nicht fälschbar.
router.post('/errors', async (req, res) => {
  try {
    const { quelle, nachricht, stack, kontext } = req.body || {};
    if (!CLIENT_QUELLEN.has(quelle)) return res.status(400).json({ error: 'Ungültige Quelle.' });
    if (!nachricht || typeof nachricht !== 'string') return res.status(400).json({ error: 'Nachricht fehlt.' });
    await logError({
      quelle,
      nachricht,
      stack: typeof stack === 'string' ? stack : null,
      kontext: kontext && typeof kontext === 'object' ? kontext : null,
      benutzerOid: req.user && req.user.oid,
      benutzerName: req.user && req.user.name,
    });
    res.status(204).end();
  } catch (e) {
    // Kein logError hier — sonst Endlosschleife, wenn genau das scheitert.
    console.error('[errors] Ingest fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Konnte Fehler nicht speichern.' });
  }
});

// GET /api/dev/errors — Liste (developer-only). Query: quelle, erledigt, benutzerOid, seit, limit.
router.get('/dev/errors', nurDeveloper, async (req, res) => {
  try {
    const { quelle, erledigt, benutzerOid, seit, limit } = req.query;
    const rows = await listErrors({
      quelle: quelle || undefined,
      erledigt: erledigt === undefined ? undefined : erledigt === 'true' || erledigt === '1',
      benutzerOid: benutzerOid || undefined,
      seit: seit || undefined,
      limit: limit || undefined,
    });
    res.json(rows);
  } catch (e) {
    console.error('[dev/errors] list:', e.message);
    res.status(500).json({ error: 'Fehler beim Laden.' });
  }
});

// PATCH /api/dev/errors/:id — als erledigt markieren (developer-only).
router.patch('/dev/errors/:id', nurDeveloper, async (req, res) => {
  try {
    await markResolved(req.params.id, req.user.name);
    res.json({ ok: true });
  } catch (e) {
    console.error('[dev/errors] patch:', e.message);
    res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
  }
});

module.exports = router;
