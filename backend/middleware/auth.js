/* ===================================================================
   AUTH-MIDDLEWARE
   Lädt den Nutzer pro Request aus dbo.Users (einzige Quelle) und leitet
   die Flags ab. Ein Pfad für SAML (Session-oid) und Dev (X-Dev-OID /
   Session-userOid).
   =================================================================== */
const { getUserByOid, buildReqUser } = require('../services/users');

// Dev-Login (X-Dev-OID-Header, passwortloses /api/auth/login → session.userOid)
// ist NUR außerhalb der Produktion aktiv. In Produktion authentifiziert
// ausschließlich die SAML-Session — sonst könnte jeder per Header eine beliebige
// OID (inkl. Admin/Developer) vortäuschen und SSO komplett umgehen.
// ponytail: NODE_ENV-Gate; feinere Flags (DEV_AUTH=1) erst wenn ein echter Grund kommt.
const DEV_AUTH_ENABLED = process.env.NODE_ENV !== 'production';

async function requireAuth(req, res, next) {
  try {
    // SAML-Identität aus der Session hat immer Vorrang.
    let oid = req.session && req.session.user && req.session.user.oid;
    // Dev-Fallback (Header oder Dev-Login-Session) nur außerhalb der Produktion.
    if (!oid && DEV_AUTH_ENABLED) {
      oid = req.headers['x-dev-oid'] || (req.session && req.session.userOid);
    }
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

module.exports = { requireAuth, devAuth: requireAuth, DEV_AUTH_ENABLED };
