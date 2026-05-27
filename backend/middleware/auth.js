/* ===================================================================
   DEV-AUTH MIDDLEWARE
   Simuliert Azure AD Token-Validierung für lokale Entwicklung.
   Austausch gegen MSAL-Middleware wenn Azure AD bereit ist.

   Dev-User wählen: Header X-Dev-OID mitschicken, z.B.:
     X-Dev-OID: 00000000-0000-0000-0000-000000000001

   Oder: POST /api/auth/login mit { "oid": "..." } aufrufen,
   dann wird die OID in der Session gespeichert.
   =================================================================== */

const DEV_USERS = {
  '00000000-0000-0000-0000-000000000001': { name: 'Florian Kuniß',       role: 'azubi',     email: 'florian.kuniss@putzmeister.com' },
  '00000000-0000-0000-0000-000000000002': { name: 'Matthias Lengerer',   role: 'ausbilder', email: 'matthias.fauser@putzmeister.com' },
  '00000000-0000-0000-0000-000000000003': { name: 'Florian Kern',        role: 'azubi',     email: 'florian.kern@putzmeister.com' },
  '00000000-0000-0000-0000-000000000005': { name: 'Lena Müller',         role: 'azubi',     email: 'lena.mueller@putzmeister.com' },
  '00000000-0000-0000-0000-000000000006': { name: 'Jonas Becker',        role: 'azubi',     email: 'jonas.becker@putzmeister.com',  berichtTyp: 'täglich' },
};

function devAuth(req, res, next) {
  // OID aus Header oder Session lesen
  const oid = req.headers['x-dev-oid'] || req.session?.userOid;

  if (!oid || !DEV_USERS[oid]) {
    return res.status(401).json({ error: 'Nicht angemeldet. X-Dev-OID Header oder /api/auth/login verwenden.' });
  }

  req.user = { oid, ...DEV_USERS[oid] };
  next();
}

module.exports = { devAuth, DEV_USERS };
