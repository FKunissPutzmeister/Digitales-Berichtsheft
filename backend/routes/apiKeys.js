const router = require('express').Router();
const svc = require('../services/apiKeys');

// API-Schlüssel-Verwaltung ist ausschließlich für Developer (wie Nutzer-/
// Abteilungsverwaltung). Die effektive Rolle wird pro Request frisch gebaut
// (auth-Middleware) – ein Dev-Hybrid muss dafür die Developer-Ansicht aktiv haben.
function nurDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Nur für Developer.' });
  }
  next();
}

// GET /api/apikeys – alle Schlüssel (ohne Hash/Klartext) inkl. Besitzer-Infos
router.get('/', nurDeveloper, async (req, res) => {
  try { res.json(await svc.listApiKeys()); }
  catch (e) { console.error('[apikeys] list', e); res.status(500).json({ error: 'Fehler' }); }
});

// POST /api/apikeys {userOid, label} – legt einen Schlüssel an, gibt ihn EINMALIG
// im Klartext zurück (danach nur noch der Hash in der DB).
router.post('/', nurDeveloper, async (req, res) => {
  try {
    const { userOid, label } = req.body || {};
    if (!userOid) return res.status(400).json({ error: 'userOid fehlt' });
    const { id, key } = await svc.createApiKey(userOid, label);
    res.json({ id, key });
  } catch (e) { console.error('[apikeys] create', e); res.status(500).json({ error: 'Fehler' }); }
});

// PATCH /api/apikeys/:id {aktiv} – Schlüssel (de)aktivieren
router.patch('/:id', nurDeveloper, async (req, res) => {
  try {
    const ok = await svc.setApiKeyAktiv(Number(req.params.id) || 0, !!(req.body && req.body.aktiv));
    if (!ok) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('[apikeys] patch', e); res.status(500).json({ error: 'Fehler' }); }
});

// DELETE /api/apikeys/:id – Schlüssel entfernen (Widerruf)
router.delete('/:id', nurDeveloper, async (req, res) => {
  try {
    const ok = await svc.deleteApiKey(Number(req.params.id) || 0);
    if (!ok) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('[apikeys] delete', e); res.status(500).json({ error: 'Fehler' }); }
});

module.exports = router;
