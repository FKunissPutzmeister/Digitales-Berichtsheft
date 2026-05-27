const router = require('express').Router();
const { DEV_USERS } = require('../middleware/auth');

// GET /api/users?role=azubi|ausbilder
router.get('/', (req, res) => {
  const { role } = req.query;
  const users = Object.entries(DEV_USERS)
    .filter(([, u]) => !role || u.role === role)
    .map(([oid, u]) => ({ oid, ...u }));
  res.json(users);
});

// GET /api/users/:oid
router.get('/:oid', (req, res) => {
  const u = DEV_USERS[req.params.oid];
  if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
  res.json({ oid: req.params.oid, ...u });
});

module.exports = router;
