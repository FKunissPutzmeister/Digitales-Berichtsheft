'use strict';
/* =====================================================================
   SAML-SP-Routen: /api/auth/saml/{login,acs,logout,status}
   Bei fehlender Konfiguration (samlConfigured=false) → 503.
   ===================================================================== */
const router = require('express').Router();
// Konfiguration wird einmalig beim Start ausgewertet; samlConfigured ist ein Load-Time-Snapshot (beabsichtigt).
const { saml, samlConfigured } = require('../config/saml');

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

function guard(req, res, next) {
  if (!samlConfigured) return res.status(503).json({ error: 'SAML ist nicht konfiguriert.' });
  next();
}

// Frontend fragt, ob der Microsoft-Button aktiv sein soll.
router.get('/status', (req, res) => res.json({ configured: samlConfigured }));

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
    const user = profileToUser(profile);
    if (!user.oid) throw new Error('Assertion ohne objectid-Claim');
    // Session-Fixation vermeiden: nach erfolgreicher Assertion neue Session-ID.
    req.session.regenerate((err) => {
      if (err) {
        console.error('[saml] session.regenerate:', err);
        return res.redirect(`${LOGIN_PAGE}?error=sso`);
      }
      req.session.user = user;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[saml] session.save:', saveErr);
          return res.redirect(`${LOGIN_PAGE}?error=sso`);
        }
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
