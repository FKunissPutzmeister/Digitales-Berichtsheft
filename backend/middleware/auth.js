/* ===================================================================
   AUTH-MIDDLEWARE
   Lädt den Nutzer pro Request aus dbo.Users (einzige Quelle) und leitet
   die Flags ab. Ein Pfad für SAML (Session-oid) und Dev (X-Dev-OID /
   Session-userOid).
   =================================================================== */
const { getUserByOid, buildReqUser, canUseDevView } = require('../services/users');
const { logError } = require('../services/fehlerberichte');

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

    // Dev-View-Switch: Berechtigte Nutzer sehen standardmäßig die AZUBI-Ansicht
    // und heben ihre effektive Rolle per Session-Wunsch auf "developer". Der
    // Default wird bewusst auf 'azubi' gezwungen — unabhängig von der in der DB
    // hinterlegten Basisrolle (die bei diesem Nutzer bereits 'developer' sein
    // kann) — damit "Standard = Azubi" garantiert ist. Die Session speichert nur
    // den Wunsch (req.session.devView); die Berechtigung wird bei JEDEM Request
    // frisch gegen die Allowlist geprüft — der Client kann keine Elevation erzwingen.
    const eligible = canUseDevView(row.Email);
    const active = eligible && !!(req.session && req.session.devView);
    // Azubi-Default muss ein SAUBERER Azubi sein: additive Grants (KannPlanen,
    // IstAusbilder) aus der DB-Zeile nullen, sonst leaken Planer-/Verwaltungs-
    // Menüs in die Azubi-Ansicht. Im Developer-Modus deckt isDev ohnehin alles ab.
    let effectiveRow = row;
    if (eligible) {
      effectiveRow = active
        ? { ...row, Role: 'developer' }
        : { ...row, Role: 'azubi', KannPlanen: 0, IstAusbilder: 0 };
    }
    req.user = buildReqUser(effectiveRow);
    req.user.devViewEligible = eligible;
    req.user.devViewActive = active;
    next();
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[auth] requireAuth: ${e.message}`, stack: e.stack, kontext: { route: req.path } });
    res.status(500).json({ error: 'Authentifizierung fehlgeschlagen.' });
  }
}

module.exports = { requireAuth, devAuth: requireAuth, DEV_AUTH_ENABLED };
