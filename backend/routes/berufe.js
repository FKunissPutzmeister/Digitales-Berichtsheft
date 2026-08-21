'use strict';
/* =====================================================================
   Berufe-Katalog-Routen: /api/berufe
   GET ist für alle authentifizierten Nutzer lesbar (wird bei der
   Beurteilungs-Ermittlung des Ausbildungsleiters gebraucht); alle
   schreibenden Operationen sind developer-only (Pflege in der
   Nutzerverwaltung).
   ===================================================================== */
const router = require('express').Router();
const svc = require('../services/berufe');
const { logError } = require('../services/fehlerberichte');

function requireDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  next();
}

// GET /api/berufe
router.get('/', async (req, res) => {
  try { res.json(await svc.listBerufe()); }
  catch (e) {
    logError({ quelle: 'backend', nachricht: `[berufe] list: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /api/berufe
router.post('/', requireDeveloper, async (req, res) => {
  const check = svc.validateBeruf(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  try { res.json(await svc.createBeruf(req.body)); }
  catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Beruf existiert bereits' });
    logError({ quelle: 'backend', nachricht: `[berufe] create: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// PATCH /api/berufe/:id
router.patch('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  const check = svc.validateBeruf(req.body || {}, { partial: true });
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const row = await svc.updateBeruf(id, req.body);
    if (!row) return res.status(404).json({ error: 'Beruf nicht gefunden' });
    res.json(row);
  } catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Beruf bereits vergeben' });
    logError({ quelle: 'backend', nachricht: `[berufe] patch: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/berufe/:id
router.delete('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  try { await svc.deleteBeruf(id); res.json({ ok: true }); }
  catch (e) {
    logError({ quelle: 'backend', nachricht: `[berufe] delete: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

module.exports = router;
