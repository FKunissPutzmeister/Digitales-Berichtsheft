'use strict';
/* =====================================================================
   SAML-Service-Provider-Konfiguration.
   Baut aus den IdP-Metadaten + .env-Werten eine node-saml-Instanz.
   Liefert samlConfigured=false (und saml=null), wenn Pflichtwerte fehlen
   — die Routen antworten dann mit 503 statt zu crashen.
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { SAML } = require('@node-saml/node-saml');

// Alle <X509Certificate>-Inhalte aus der Federation-Metadata ziehen,
// whitespace-bereinigen und deduplizieren. Mehrere = Zertifikats-Rollover;
// node-saml akzeptiert ein Array und probiert jedes durch.
function extractIdpCerts(xml) {
  const re = /<(?:ds:)?X509Certificate>([\s\S]*?)<\/(?:ds:)?X509Certificate>/g;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const cert = m[1].replace(/\s+/g, '');
    if (cert) out.push(cert);
  }
  return [...new Set(out)];
}

function buildSaml() {
  const {
    SAML_ENTRY_POINT, SAML_LOGOUT_URL, SAML_ISSUER,
    SAML_CALLBACK_URL, SAML_IDP_METADATA_PATH,
  } = process.env;

  const required = [SAML_ENTRY_POINT, SAML_ISSUER, SAML_CALLBACK_URL, SAML_IDP_METADATA_PATH];
  if (required.some((v) => !v)) {
    return { saml: null, samlConfigured: false };
  }

  const metaPath = path.isAbsolute(SAML_IDP_METADATA_PATH)
    ? SAML_IDP_METADATA_PATH
    : path.join(__dirname, '..', SAML_IDP_METADATA_PATH);

  let idpCert;
  try {
    idpCert = extractIdpCerts(fs.readFileSync(metaPath, 'utf8'));
  } catch (e) {
    console.warn('[saml] Metadata nicht lesbar:', e.message);
    return { saml: null, samlConfigured: false };
  }
  if (idpCert.length === 0) {
    console.warn('[saml] Kein X509Certificate in der Metadata gefunden.');
    return { saml: null, samlConfigured: false };
  }

  const saml = new SAML({
    entryPoint: SAML_ENTRY_POINT,
    logoutUrl: SAML_LOGOUT_URL || SAML_ENTRY_POINT,
    issuer: SAML_ISSUER,
    callbackUrl: SAML_CALLBACK_URL,
    audience: SAML_ISSUER,
    idpCert,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
  });

  return { saml, samlConfigured: true };
}

const { saml, samlConfigured } = buildSaml();
if (!samlConfigured) {
  console.warn('[saml] SAML ist NICHT konfiguriert — SSO-Routen liefern 503.');
}

module.exports = { saml, samlConfigured, extractIdpCerts };
