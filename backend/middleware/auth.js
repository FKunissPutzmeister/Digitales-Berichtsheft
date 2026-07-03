/* ===================================================================
   AUTH-MIDDLEWARE
   Lädt den Nutzer pro Request aus dbo.Users (einzige Quelle) und leitet
   die Flags ab. Ein Pfad für SAML (Session-oid) und Dev (X-Dev-OID /
   Session-userOid).
   =================================================================== */
const { getUserByOid, buildReqUser } = require('../services/users');

async function requireAuth(req, res, next) {
  try {
    const oid = (req.session && req.session.user && req.session.user.oid)
      || req.headers['x-dev-oid']
      || (req.session && req.session.userOid);
    if (!oid) return res.status(401).json({ error: 'Nicht angemeldet.' });
    const row = await getUserByOid(oid);
    if (!row || !row.Aktiv) return res.status(401).json({ error: 'Kein aktiver Nutzer.' });
    req.user = buildReqUser(row);
    next();
  } catch (e) {
    console.error('[auth] requireAuth:', e);
    res.status(500).json({ error: 'Authentifizierung fehlgeschlagen.' });
  }
}

module.exports = { requireAuth, devAuth: requireAuth };
