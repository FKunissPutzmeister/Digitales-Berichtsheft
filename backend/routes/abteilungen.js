'use strict';
/* =====================================================================
   Abteilungs-Katalog-Routen: /api/abteilungen
   GET ist für alle authentifizierten Nutzer lesbar (Planer-Dropdown);
   alle schreibenden Operationen sind developer-only.
   ===================================================================== */
const router = require('express').Router();
const svc = require('../services/abteilungen');
const { logError } = require('../services/fehlerberichte');

function requireDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  next();
}

// GET /api/abteilungen[?all=1]  (all=1 nur developer -> inkl. inaktive)
router.get('/', async (req, res) => {
  try {
    const inclInactive = req.query.all === '1' && req.user.role === 'developer';
    res.json(await svc.listAbteilungen({ inclInactive }));
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[abteilungen] list: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /api/abteilungen
router.post('/', requireDeveloper, async (req, res) => {
  const check = svc.validateAbteilung(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    res.json(await svc.createAbteilung(req.body));
  } catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Abteilung existiert bereits' });
    logError({ quelle: 'backend', nachricht: `[abteilungen] create: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// PATCH /api/abteilungen/:id
router.patch('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  const check = svc.validateAbteilung(req.body || {}, { partial: true });
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const row = await svc.updateAbteilung(id, req.body);
    if (!row) return res.status(404).json({ error: 'Abteilung nicht gefunden' });
    res.json(row);
  } catch (e) {
    if (e.number === 2601 || e.number === 2627) return res.status(409).json({ error: 'Name bereits vergeben' });
    logError({ quelle: 'backend', nachricht: `[abteilungen] patch: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/abteilungen/:id
router.delete('/:id', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  try { await svc.deleteAbteilung(id); res.json({ ok: true }); }
  catch (e) {
    logError({ quelle: 'backend', nachricht: `[abteilungen] delete: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /api/abteilungen/:id/verantwortliche  { email }
router.post('/:id/verantwortliche', requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungültige Id' });
  const check = svc.validateVerantwEmail((req.body || {}).email);
  if (!check.ok) return res.status(400).json({ error: check.error });
  try { res.json(await svc.addVerantwortliche(id, req.body.email)); }
  catch (e) {
    if (e.code === 'DUP') return res.status(409).json({ error: e.message });
    logError({ quelle: 'backend', nachricht: `[abteilungen] addVerantw: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// DELETE /api/abteilungen/:id/verantwortliche/:vid
router.delete('/:id/verantwortliche/:vid', requireDeveloper, async (req, res) => {
  const vid = Number(req.params.vid);
  if (!Number.isInteger(vid)) return res.status(400).json({ error: 'Ungültige Id' });
  try { await svc.removeVerantwortliche(vid); res.json({ ok: true }); }
  catch (e) {
    logError({ quelle: 'backend', nachricht: `[abteilungen] removeVerantw: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

module.exports = router;
