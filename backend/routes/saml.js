'use strict';
/* =====================================================================
   SAML-SP-Routen: /api/auth/saml/{login,acs,logout,status}
   Bei fehlender Konfiguration (samlConfigured=false) → 503.
   ===================================================================== */
const router = require('express').Router();
// Konfiguration wird einmalig beim Start ausgewertet; samlConfigured ist ein Load-Time-Snapshot (beabsichtigt).
const { saml, samlConfigured } = require('../config/saml');
const { parseRoleClaim, upsertUser } = require('../services/users');
const { DEV_AUTH_ENABLED } = require('../middleware/auth');

const DASHBOARD = '/app/dashboard.html';
const LOGIN_PAGE = '/app/index.html';

// Assertion-Profil → unsere User-Form. objectid ist der Custom-Claim mit der
// Azure-Object-ID (GUID); E-Mail/Name defensiv über mehrere Claim-Namen.
function profileToUser(profile) {
  const p = profile || {};
  const oid = p['objectid'];
  const email =
    p['email'] ||
    p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
    p.nameID;
  const name =
    p['displayname'] ||
    p['http://schemas.microsoft.com/identity/claims/displayname'] ||
    p['name'] ||
    email;
  return { oid, email, name };
}

// Ausbildungsberuf aus dem (optionalen) Azure-Claim. Wird nur mitgesendet,
// wenn in der Enterprise App ein Attribut→Claim-Mapping (aus user.jobtitle /
// "Position") hinterlegt ist — sonst null (dann bleibt der DB-Wert unverändert).
// Claim-Name ist case-sensitiv: Azure liefert ihn als "Beruf" (großes B); wir
// akzeptieren defensiv beide Schreibweisen + jobTitle-Fallbacks. Präfix
// "Auszubildende(r) " wird entfernt: "Auszubildender Mechatroniker" → "Mechatroniker".
function parseBerufClaim(profile) {
  const p = profile || {};
  const raw = p['beruf'] || p['Beruf'] || p['jobTitle'] || p['jobtitle'] || null;
  if (!raw) return null;
  const s = String(raw).replace(/^auszubildende[r]?\s+/i, '').trim();
  return s || null;
}

// Assertion → Datensatz für upsertUser (Identität + Azure-Basisrolle + Beruf).
function assertionToUserData(profile) {
  return {
    ...profileToUser(profile),
    role: parseRoleClaim(profile),
    beruf: parseBerufClaim(profile),
  };
}

function guard(req, res, next) {
  if (!samlConfigured) return res.status(503).json({ error: 'SAML ist nicht konfiguriert.' });
  next();
}

// Frontend fragt, ob der Microsoft-Button aktiv sein soll — und ob es den
// passwortlosen Demo-Login gibt (in Produktion nicht gemountet; die
// Login-Seite blendet den Demo-Block dann komplett aus).
router.get('/status', (req, res) => res.json({ configured: samlConfigured, demoLogin: DEV_AUTH_ENABLED }));

// SP-initiierter Login → Redirect zum Azure-Login.
router.get('/login', guard, async (req, res) => {
  try {
    const url = await saml.getAuthorizeUrlAsync('', null, {});
    res.redirect(url);
  } catch (e) {
    console.error('[saml] getAuthorizeUrl:', e);
    res.redirect(`${LOGIN_PAGE}?error=sso`);
  }
});

// Assertion Consumer Service: Azure POSTet die SAMLResponse hierher.
router.post('/acs', guard, async (req, res) => {
  try {
    const { profile } = await saml.validatePostResponseAsync(req.body);
    const data = assertionToUserData(profile);
    if (!data.oid) throw new Error('Assertion ohne objectid-Claim');
    await upsertUser({ ...data, letzterLogin: true });
    req.session.regenerate((err) => {
      if (err) { console.error('[saml] session.regenerate:', err); return res.redirect(`${LOGIN_PAGE}?error=sso`); }
      req.session.user = { oid: data.oid };
      req.session.save((saveErr) => {
        if (saveErr) { console.error('[saml] session.save:', saveErr); return res.redirect(`${LOGIN_PAGE}?error=sso`); }
        res.redirect(DASHBOARD);
      });
    });
  } catch (e) {
    console.error('[saml] ACS-Validierung fehlgeschlagen:', e.message);
    res.redirect(`${LOGIN_PAGE}?error=sso`);
  }
});

// Logout: lokale Session beenden. (IdP-SLO optional, spätere Iteration.)
function logout(req, res) {
  req.session.destroy((err) => {
    if (err) console.error('[saml] session.destroy:', err);
    res.redirect(LOGIN_PAGE);
  });
}
router.get('/logout', logout);
router.post('/logout', logout);

module.exports = router;
module.exports.profileToUser = profileToUser;
module.exports.assertionToUserData = assertionToUserData;
