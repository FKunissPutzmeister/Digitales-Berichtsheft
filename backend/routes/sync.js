'use strict';
const router = require('express').Router();
const { runSync } = require('../services/entraSync');

// POST /api/sync/entra — manueller Sofort-Sync (nur developer).
router.post('/entra', async (req, res) => {
  if (req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  const result = await runSync();
  res.status(result.ok ? 200 : 502).json(result);
});

module.exports = router;
