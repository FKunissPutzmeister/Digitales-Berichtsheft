const router = require('express').Router();
const { listUsers, getUserByOid, updateUserProfile, validateUserPatch, buildReqUser } = require('../services/users');

// GET /api/users?role=azubi | ?exclRole=azubi
router.get('/', async (req, res) => {
  try {
    const inclInactive = ['admin', 'developer'].includes(req.user.role);
    const rows = await listUsers({ role: req.query.role, exclRole: req.query.exclRole, inclInactive });
    res.json(rows.map(buildReqUser));
  } catch (e) { console.error('[users] list:', e); res.status(500).json({ error: 'Fehler' }); }
});

// GET /api/users/:oid
router.get('/:oid', async (req, res) => {
  try {
    const row = await getUserByOid(req.params.oid);
    if (!row) return res.status(404).json({ error: 'User nicht gefunden' });
    res.json(buildReqUser(row));
  } catch (e) { console.error('[users] get/:oid:', e); res.status(500).json({ error: 'Fehler' }); }
});

// PATCH /api/users/:oid  – nur developer
router.patch('/:oid', async (req, res) => {
  if (req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Nur Developer' });
  }
  const check = validateUserPatch(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    await updateUserProfile(req.params.oid, req.body);
    const row = await getUserByOid(req.params.oid);
    if (!row) return res.status(404).json({ error: 'User nicht gefunden' });
    res.json(buildReqUser(row));
  } catch (e) { console.error('[users] patch:', e); res.status(500).json({ error: 'Fehler' }); }
});

module.exports = router;
