const router = require('express').Router();
const { getPool } = require('../db/connection');
const { listUsers, getUserByOid, updateUserProfile, validateUserPatch, buildReqUser } = require('../services/users');
const { listFuerAzubi, listAzubisFuerAusbilder, validateZuordnung, setFuerAzubi } = require('../services/ausbilderAzubis');
const { listDelegierteAzubis } = require('../services/vertretungen');
const { getPhoto } = require('../services/userPhotos');
const { logError } = require('../services/fehlerberichte');

// GET /api/users?role=azubi | ?exclRole=azubi
router.get('/', async (req, res) => {
  try {
    const inclInactive = ['admin', 'developer'].includes(req.user.role);
    const rows = await listUsers({ role: req.query.role, exclRole: req.query.exclRole, inclInactive });
    res.json(rows.map(buildReqUser));
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] list: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// GET /api/users/me/azubis – Azubis, die dem aktuellen Nutzer DAUERHAFT als
// Ausbilder zugeordnet sind (OID-basiert). Quelle für den Azubi-Selektor
// zusätzlich zu den befristeten Zuweisungen. Steht vor '/:oid' (zwei Segmente
// kollidieren zwar nicht mit dem Ein-Segment-Param, aber der Klarheit halber).
router.get('/me/azubis', async (req, res) => {
  try {
    const pool = await getPool();
    // Eigene dauerhafte Zuordnungen + Azubis, die über eine AKTIVE Vertretung
    // sichtbar sind (dauerhaft ODER befristet des Vertretenen). Dedupe per OID.
    const eigene     = await listAzubisFuerAusbilder(req.user.oid);
    const delegierte = await listDelegierteAzubis(pool, req.user.oid);
    const byOid = new Map();
    for (const r of [...eigene, ...delegierte]) if (!byOid.has(r.Oid)) byOid.set(r.Oid, r);
    res.json([...byOid.values()].map(buildReqUser));
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] me/azubis: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// GET /api/users/:oid
router.get('/:oid', async (req, res) => {
  try {
    const row = await getUserByOid(req.params.oid);
    if (!row) return res.status(404).json({ error: 'User nicht gefunden' });
    res.json(buildReqUser(row));
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] get/:oid: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// GET /api/users/:oid/photo – Profilbild aus dem Entra-Sync (falls vorhanden).
// Kein Treffer (kein Foto in Entra hinterlegt / noch nicht synchronisiert)
// → 404; das Frontend fällt dann per onerror auf den Initialen-Avatar zurück.
router.get('/:oid/photo', async (req, res) => {
  try {
    const photo = await getPhoto(req.params.oid);
    if (!photo) return res.status(404).end();
    res.setHeader('Content-Type', photo.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(photo.Content);
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] photo: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).end();
  }
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
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] patch: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// GET /api/users/:azubiOid/ausbilder – aktuell zugewiesene Ausbilder
router.get('/:azubiOid/ausbilder', async (req, res) => {
  if (req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  try {
    res.json(await listFuerAzubi(req.params.azubiOid));
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] ausbilder list: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

// PUT /api/users/:azubiOid/ausbilder – Menge ersetzen (nur developer)
router.put('/:azubiOid/ausbilder', async (req, res) => {
  if (req.user.role !== 'developer') return res.status(403).json({ error: 'Nur Developer' });
  const oids = Array.isArray(req.body && req.body.ausbilderOids) ? req.body.ausbilderOids : null;
  if (!oids) return res.status(400).json({ error: 'ausbilderOids muss ein Array sein.' });
  try {
    const check = await validateZuordnung(req.params.azubiOid, oids);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    await setFuerAzubi(req.params.azubiOid, oids);
    res.json({ ok: true });
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[users] ausbilder set: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Fehler' });
  }
});

module.exports = router;
