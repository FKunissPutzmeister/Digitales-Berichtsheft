const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const svc = require('../services/beurteilungen');
const unterschriftenSvc = require('../services/unterschriften');
const { ladeKorrekturKontext } = require('../services/zugriffContext');
const { logError } = require('../services/fehlerberichte');

// GET /api/beurteilungen?zuweisungId=..  | ?azubiOid=..
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { zuweisungId, azubiOid } = req.query;

    if (azubiOid) {
      // Azubi sieht nur die EIGENE Liste (nur Abgeschlossene). Verantwortliche nur
      // für BETREUTE Azubis (befristet per E-Mail ODER dauerhaft, datumsunabhängig);
      // dev/admin alle.
      const eigen = req.user.oid === azubiOid;
      const istPrivilegiert = req.user.role === 'developer' || req.user.role === 'admin';
      let darf = eigen || istPrivilegiert;
      if (!darf) {
        const kontext = await ladeKorrekturKontext(pool, req.user);
        const betreut = new Set([
          ...kontext.zuweisungen.map(z => z.azubiOid),
          ...(kontext.dauerAusbilderAzubiOids || []),
        ]);
        darf = betreut.has(azubiOid);
      }
      if (!darf) return res.status(403).json({ error: 'Kein Zugriff.' });
      let list = await svc.listByAzubi(pool, azubiOid);
      if (eigen && !istPrivilegiert) {
        list = list.filter(b => b.Status === 'abgeschlossen'); // Azubi sieht nur Abgeschlossene
      }
      return res.json(list);
    }

    if (zuweisungId) {
      const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
      if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
      const darfAnsehen = await svc.darfBeurteilen(req.user, zuw, pool); // breit: inkl. dauerhaftem Ausbilder
      const istAzubiOwner = req.user.oid === zuw.azubiOid;
      if (!darfAnsehen && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
      const b = await svc.getByZuweisung(pool, Number(zuweisungId));
      // Azubi sieht die Beurteilung erst, wenn abgeschlossen.
      if (istAzubiOwner && !darfAnsehen && (!b || b.Status !== 'abgeschlossen')) return res.json(null);
      if (b) {
        b.modus = await svc.ermittleModus(req.user, zuw, b, pool);
      }
      return res.json(b);
    }

    return res.status(400).json({ error: 'zuweisungId oder azubiOid erforderlich.' });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] list: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/beurteilungen/faellig  -> beendete Durchläufe ohne Abschluss (+ legt Mitteilungen an)
router.get('/faellig', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await svc.ermittleUndErzeugeFaellige(pool, req.user));
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] faellig: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/beurteilungen/meine[?azubiOid=...] — flache Liste aller
// Zuweisungen, die der aufrufende Nutzer beurteilen darf, mit Status
// offen/abgeschlossen. Speist den eigenen Beurteilungen-Reiter (nicht für
// Azubis). Optionaler azubiOid-Filter für den Azubi-Selector (Admin/Developer
// + dauerhafte Ausbilder).
router.get('/meine', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await svc.listMeineBeurteilbaren(pool, req.user, req.query.azubiOid));
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] meine: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/beurteilungen  { zuweisungId, kriterien:[{kriteriumKey,punkte}], individuelleBeurteilung, gespraechAm }
router.post('/', async (req, res) => {
  try {
    const pool = await getPool();
    const { zuweisungId, kriterien, individuelleBeurteilung, gespraechAm } = req.body;
    const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
    if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    if (!svc.darfBeurteilungBearbeiten(req.user, zuw)) return res.status(403).json({ error: 'Kein Beurteilungsrecht.' });
    const id = await svc.upsertEntwurf(pool, {
      zuweisungId: zuw.id, azubiOid: zuw.azubiOid, kriterien, individuelleBeurteilung, gespraechAm,
    });
    res.json({ id });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] create: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// Gemeinsame Autorisierung für PATCH auf :id (nur der zeitlich zugewiesene
// Prüfer bzw. admin/developer — NICHT der dauerhafte Ausbilder, siehe
// Design-Spec 2026-08-21).
async function ladeUndAutorisiere(req, res) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, Number(req.params.id) || 0)
    .query('SELECT b.Id, b.ZuweisungId, b.AzubiOid FROM dbo.Beurteilungen b WHERE b.Id = @id');
  const b = r.recordset[0];
  if (!b) { res.status(404).json({ error: 'Beurteilung nicht gefunden.' }); return null; }
  const zuw = await svc.ladeZuweisung(pool, b.ZuweisungId);
  if (!svc.darfBeurteilungBearbeiten(req.user, zuw)) { res.status(403).json({ error: 'Kein Beurteilungsrecht.' }); return null; }
  return { pool, b, zuw };
}

// PATCH /api/beurteilungen/:id/abschliessen
router.patch('/:id/abschliessen', async (req, res) => {
  try {
    const ctx = await ladeUndAutorisiere(req, res); if (!ctx) return;
    await svc.abschliessen(ctx.pool, ctx.b.Id, req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (unterschriftenSvc.istValidierungsfehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] abschliessen: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/beurteilungen/:id   (Korrektur nach Abschluss)
router.patch('/:id', async (req, res) => {
  try {
    const ctx = await ladeUndAutorisiere(req, res); if (!ctx) return;
    const { kriterien, individuelleBeurteilung, gespraechAm } = req.body;
    await svc.patchNachAbschluss(ctx.pool, ctx.b.Id, { kriterien, individuelleBeurteilung, gespraechAm }, req.user.oid);
    res.json({ ok: true });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] patch: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/beurteilungen/:id/kenntnisnahme  (nur der Azubi selbst)
router.patch('/:id/kenntnisnahme', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
    const row = r.recordset[0];
    if (!row) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    if (row.AzubiOid !== req.user.oid) return res.status(403).json({ error: 'Nur der Azubi kann bestätigen.' });
    await svc.kenntnisnahme(pool, Number(req.params.id), req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (unterschriftenSvc.istValidierungsfehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] kenntnisnahme: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/beurteilungen/:id/ausbildungsleiter-bestaetigung
// (nur der Nutzer, den ermittleAusbildungsleiter fuer diesen Azubi liefert)
router.patch('/:id/ausbildungsleiter-bestaetigung', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT Id, AzubiOid, BeurteiltVon, Status, AusbildungsleiterBestaetigtAm FROM dbo.Beurteilungen WHERE Id=@id');
    const b = r.recordset[0];
    if (!b) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    const ausbildungsleiterOid = await svc.ermittleAusbildungsleiter(pool, b.AzubiOid);
    if (!ausbildungsleiterOid || ausbildungsleiterOid !== req.user.oid) {
      return res.status(403).json({ error: 'Nur der zuständige Ausbildungsleiter kann bestätigen.' });
    }
    if (b.Status !== 'abgeschlossen') return res.status(400).json({ error: 'Beurteilung ist noch nicht abgeschlossen.' });
    if (b.BeurteiltVon && b.BeurteiltVon === ausbildungsleiterOid) {
      return res.status(400).json({ error: 'Dieser Bestätigungsschritt ist für diese Beurteilung nicht erforderlich.' });
    }
    await svc.ausbildungsleiterBestaetigen(pool, b.Id, req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (unterschriftenSvc.istValidierungsfehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] ausbildungsleiter-bestaetigung: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

const ROLLE_SPALTEN = {
  beurteiler:      { bild: 'BeurteilerUnterschriftBild', ext: 'BeurteilerUnterschriftExt' },
  azubi:           { bild: 'KenntnisnahmeUnterschriftBild', ext: 'KenntnisnahmeUnterschriftExt' },
  ausbildungsleiter: { bild: 'AusbildungsleiterUnterschriftBild', ext: 'AusbildungsleiterUnterschriftExt' },
};

// GET /api/beurteilungen/:id/unterschrift/:rolle  – streamt das Bild (image/png|jpeg)
// Zugriff wie beim Lesen der Beurteilung: verantwortlich ODER Azubi-Eigentümer.
router.get('/:id/unterschrift/:rolle', async (req, res) => {
  try {
    const spalten = ROLLE_SPALTEN[req.params.rolle];
    if (!spalten) return res.status(400).json({ error: 'Unbekannte Rolle.' });
    const pool = await getPool();
    const meta = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT ZuweisungId, AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
    const row = meta.recordset[0];
    if (!row) return res.status(404).end();
    const zuw = await svc.ladeZuweisung(pool, row.ZuweisungId);
    const darfBearbeiten = await svc.darfBeurteilen(req.user, zuw, pool);
    const istAzubiOwner = req.user.oid === row.AzubiOid;
    if (!darfBearbeiten && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
    const bild = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query(`SELECT ${spalten.bild} AS Bild, ${spalten.ext} AS Ext FROM dbo.Beurteilungen WHERE Id=@id`);
    const b = bild.recordset[0];
    if (!b || !b.Bild) return res.status(404).end();
    res.setHeader('Content-Type', `image/${b.Ext === 'jpeg' ? 'jpeg' : 'png'}`);
    res.send(b.Bild);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] unterschrift: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
