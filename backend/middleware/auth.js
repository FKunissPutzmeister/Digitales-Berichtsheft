/* ===================================================================
   AUTH MIDDLEWARE
   Prüft zuerst auf echte SAML-Identität in req.session.user (gesetzt
   durch den SAML-SSO-Handshake). Fallback: DEV_USERS via X-Dev-OID
   Header oder Session-OID für lokale Entwicklung.

   Dev-User wählen: Header X-Dev-OID mitschicken, z.B.:
     X-Dev-OID: 00000000-0000-0000-0000-000000000001

   Oder: POST /api/auth/login mit { "oid": "..." } aufrufen,
   dann wird die OID in der Session gespeichert.
   =================================================================== */

const { faehigkeitenFuer } = require('../config/berechtigungen');

const DEV_USERS = {
  '00000000-0000-0000-0000-000000000001': { name: 'Florian Kuniß',       role: 'azubi',     email: 'florian.kuniss@putzmeister.com',
    beruf: 'Mechatroniker', ausbildungsBeginn: '2024-09-01', ausbildungsEnde: '2027-08-31' },
  '00000000-0000-0000-0000-000000000002': { name: 'Matthias Lengerer',   role: 'ausbilder', email: 'matthias.fauser@putzmeister.com' },
  '00000000-0000-0000-0000-000000000003': { name: 'Florian Kern',        role: 'azubi',     email: 'florian.kern@putzmeister.com',
    beruf: 'Fachinformatiker für Systemintegration',
    ausbildungsBeginn: '2025-09-01', ausbildungsEnde: '2028-08-31' },
  '00000000-0000-0000-0000-000000000004': { name: 'Admin Verwaltung',    role: 'admin',     email: 'admin@putzmeister.com' },
  '00000000-0000-0000-0000-000000000005': { name: 'Lena Müller',         role: 'azubi',     email: 'lena.mueller@putzmeister.com',
    beruf: 'Industriekauffrau', ausbildungsBeginn: '2024-09-01', ausbildungsEnde: '2027-08-31' },
  '00000000-0000-0000-0000-000000000006': { name: 'Jonas Becker',        role: 'azubi',     email: 'jonas.becker@putzmeister.com',  berichtTyp: 'täglich',
    beruf: 'Mechatroniker', ausbildungsBeginn: '2023-09-01', ausbildungsEnde: '2026-08-31' },
};

function requireAuth(req, res, next) {
  // 1. Echte SAML-Identität in der Session? → Vorrang.
  const s = req.session && req.session.user;
  if (s && s.oid) {
    req.user = {
      ...s,
      ...faehigkeitenFuer(s.oid),
      istAzubi: false,   // Rollen-Mapping folgt in späterer Iteration
    };
    return next();
  }

  // 2. Fallback: Dev-User (Header oder Session-OID) gegen DEV_USERS.
  const oid = req.headers['x-dev-oid'] || (req.session && req.session.userOid);
  if (!oid || !DEV_USERS[oid]) {
    return res.status(401).json({ error: 'Nicht angemeldet. X-Dev-OID Header, /api/auth/login oder SSO verwenden.' });
  }

  req.user = {
    oid,
    ...DEV_USERS[oid],
    ...faehigkeitenFuer(oid),
    istAzubi: DEV_USERS[oid].role === 'azubi',
  };
  next();
}

module.exports = { requireAuth, devAuth: requireAuth, DEV_USERS };
