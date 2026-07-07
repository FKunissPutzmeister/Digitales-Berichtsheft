/* ===================================================================
   DEV-LOGIN (passwortlos!) — NUR außerhalb der Produktion gemountet.
   Zusätzliche Leitplanke: auch in Dev-Umgebungen sind nur isolierte
   Demo-Konten (….demo@putzmeister.com) passwortlos anmeldbar. Ein
   Azubi kann sich so selbst auf einem offen laufenden Dev-Server
   keine echte Ausbilder-/Admin-Identität verschaffen.
   =================================================================== */
const { getUserByOid, getUserByEmail, buildReqUser } = require('../services/users');

// Geprüft wird die in der DB GESPEICHERTE Adresse des gefundenen Kontos,
// nicht die Eingabe — das Konto selbst muss als Demo markiert sein.
const DEMO_EMAIL_RE = /\.demo@putzmeister\.com$/i;
function isDemoEmail(email) {
  return DEMO_EMAIL_RE.test(String(email || '').trim());
}

async function loginByOid(req, res) {
  try {
    const { oid } = req.body;
    const row = await getUserByOid(oid);
    if (!row || !row.Aktiv) return res.status(400).json({ error: 'Unbekannte/inaktive OID' });
    if (!isDemoEmail(row.Email)) return res.status(403).json({ error: 'Nur Demo-Konten können sich ohne SSO anmelden.' });
    req.session.userOid = row.Oid;
    res.json({ user: buildReqUser(row) });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).json({ error: 'Login fehlgeschlagen.' });
  }
}

async function loginByEmail(req, res) {
  try {
    const { email } = req.body;
    const row = await getUserByEmail((email || '').trim().toLowerCase());
    if (!row || !row.Aktiv) return res.status(401).json({ error: 'E-Mail nicht gefunden' });
    if (!isDemoEmail(row.Email)) return res.status(403).json({ error: 'Nur Demo-Konten können sich ohne SSO anmelden.' });
    req.session.userOid = row.Oid;
    res.json({ user: buildReqUser(row) });
  } catch (e) {
    console.error('[auth/login-by-email]', e);
    res.status(500).json({ error: 'Login fehlgeschlagen.' });
  }
}

module.exports = { isDemoEmail, loginByOid, loginByEmail };
