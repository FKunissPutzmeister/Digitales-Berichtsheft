# Design: SAML-SSO-Handshake (Iteration 1)

**Datum:** 2026-06-24
**Status:** Entwurf zur Review
**Bezug:** README-Abschnitt „SSO / SAML-Anbindung" (ab Zeile 251)

## Ziel & Umfang

Erste Iteration der Produktiv-Authentifizierung: Der **SAML-2.0-Handshake**
soll end-to-end funktionieren — der Login leitet zu Microsoft (Azure AD /
Entra ID), die zurückkommende Assertion wird validiert, und die **echte
Azure-Identität** (Object-ID, E-Mail, Anzeigename) landet in der Server-Session.

**In Umfang:**
- `@node-saml/node-saml` als Service-Provider-Bibliothek einbinden
- SP-Routen `/api/auth/saml/{login,acs,logout}` im Backend
- Echte Identität aus der Assertion in die Session schreiben
- Bestehende Demo-Logins (`devAuth`/`DEV_USERS`) lokal weiter lauffähig halten
- „Mit Microsoft anmelden"-Button im Frontend auf die Login-Route verdrahten

**Nicht in Umfang (spätere Iterationen):**
- Rollen-Mapping aus dem `role`-Claim der Assertion (App-Rollen `pruefer`/`azubi`,
  gespeist aus den Entra-Gruppen `Berichtsheft-Pruefer` bzw. `Alle Azubis Aichtal`
  in einer einzigen Enterprise App) — trivial, kein DB-Lookup nötig
- DB-User-Provisionierung / Ablösung der hartcodierten `DEV_USERS` & `BERECHTIGUNGEN`
- IIS-Reverse-Proxy-Konfiguration für die Produktion
- `cookie.secure=true` (kommt beim Prod-Deploy)
- Signierte AuthnRequests / SP-Metadata-Endpunkt (optional, später)

## Ausgangslage (Ist-Stand)

- Auth läuft über `backend/middleware/auth.js` → `devAuth`: liest eine OID aus
  Header `X-Dev-OID` oder `req.session.userOid` und schlägt sie in der
  hartcodierten `DEV_USERS`-Tabelle nach.
- Sessions: `express-session` + `session-file-store` (bereits konfiguriert in
  `server.js`).
- IdP-Föderationsmetadaten liegen unter
  `backend/config/saml/azure-idp-metadata.xml` (öffentlich, kein Secret).
- `package.json` enthält **noch keine** SAML-Bibliothek.
- Frontend: `app/js/login.js` hat einen Microsoft-SSO-**Platzhalter**-Button,
  der nur einen Hinweis (`ssoHint`) einblendet.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Bibliothek | `@node-saml/node-saml` (direkt, ohne Passport) |
| SP Entity ID (Issuer) | `https://berichtsheft.putzmeister.com/api/auth/saml/metadata` |
| Lokal vs. Prod | Reine `.env`-Werte, kein `AUTH_MODE`-Schalter |
| SP-Signaturzertifikat | Für Handshake **nicht** nötig (nur IdP-Cert zur Validierung) |
| AuthnRequest-Signierung | Vorerst nein (Azure verlangt es per Default nicht) |

## IdP-Daten (aus der Metadata-XML)

| Feld | Wert |
|---|---|
| IdP Entity-ID (Issuer) | `https://sts.windows.net/b5ce0e47-3753-4f10-b705-9d0447ccf182/` |
| SSO-Endpoint (`entryPoint`) | `https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2` |
| SLO-Endpoint (`logoutUrl`) | `https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2` |
| IdP-Signaturzertifikat | `X509Certificate` aus der Metadata-XML |

## Azure-seitig registrierte URLs (laut README, bereits übergeben)

| Feld in Azure | Wert |
|---|---|
| Sign on URL | `https://berichtsheft.putzmeister.com/app/index.html` |
| Reply URL (ACS) — Prod | `https://berichtsheft.putzmeister.com/api/auth/saml/acs` |
| Reply URL (ACS) — lokal | `http://localhost:3000/api/auth/saml/acs` |
| Logout URL | `https://berichtsheft.putzmeister.com/api/auth/saml/logout` |

## Kritische Detailentscheidung: Object-ID-Claim

Die Object-ID wird in der Assertion bewusst unter dem **Custom-Claim-Namen
`objectid`** ausgeliefert — **nicht** unter dem restricted URI
`http://schemas.microsoft.com/identity/claims/objectidentifier` (Azure lehnt
diesen als Custom-Claim-Name ab: „This claim type is restricted").

→ Im Backend wird die GUID aus `profile['objectid']` gelesen, **nicht** aus der
NameID. Die NameID (E-Mail/UPN) dient nur als menschenlesbarer Identifier.

## Architektur & Komponenten

### `backend/config/saml.js` (neu)
- Liest beim Start die Metadata-XML (Pfad aus `SAML_IDP_METADATA_PATH`) und
  extrahiert das `<X509Certificate>` (das erste/IDPSSODescriptor-Signing-Cert).
- Baut eine konfigurierte `SAML`-Instanz mit:
  `entryPoint`, `logoutUrl`, `idpCert`, `issuer` (SP Entity ID), `callbackUrl`,
  `wantAssertionsSigned: true`.
- Exportiert die Instanz sowie ein Flag `samlConfigured` (false, wenn
  Pflicht-Env-Variablen fehlen).
- Keine externe XML-Parser-Abhängigkeit nötig — das Cert wird per gezieltem
  Auslesen aus der bekannten Azure-Metadata-Struktur gewonnen.

### `backend/routes/saml.js` (neu)
- `GET /api/auth/saml/login`
  → `saml.getAuthorizeUrl()` → `302` Redirect zu Microsoft.
- `POST /api/auth/saml/acs`
  → `saml.validatePostResponse(req.body)` → bei Erfolg:
  `req.session.user = { oid: profile['objectid'], email, name }` →
  Redirect auf `/app/dashboard.html`.
  Bei Validierungsfehler → Redirect `/app/index.html?error=sso`, Detail
  server-seitig geloggt.
- `GET|POST /api/auth/saml/logout`
  → Session zerstören, Redirect auf Login (IdP-SLO optional, später).
- Wenn `!samlConfigured`: alle drei Routen liefern `503` mit klarer Meldung.

### `backend/server.js` (Änderung)
- SAML-Router **vor** den `devAuth`-geschützten API-Routen mounten.
- Für die ACS-Route `express.urlencoded({ extended: false })` ergänzen —
  Azure POSTet `application/x-www-form-urlencoded`; aktuell ist nur
  `express.json()` aktiv, sonst schlägt das Parsen der `SAMLResponse` **still**
  fehl.

### `backend/middleware/auth.js` (Änderung)
- `devAuth` → einheitlicher `requireAuth`:
  1. Wenn `req.session.user` (echte SAML-Identität) existiert → diese nutzen,
     angereichert mit `faehigkeitenFuer(oid)` (liefert für unbekannte OIDs
     sauber `false`-Defaults) und `istAzubi`-Ableitung.
  2. Sonst Fallback auf bisherigen Pfad: `X-Dev-OID` / `req.session.userOid`
     → `DEV_USERS`.
- Demo-Logins (`/api/auth/login*`) und Header-Auth bleiben unverändert
  funktionsfähig.

### `app/js/login.js` (Änderung)
- Microsoft-Button: wenn SAML verfügbar → `window.location = '/api/auth/saml/login'`;
  sonst weiterhin nur `ssoHint` einblenden.
- `?error=sso` in der URL → Fehlermeldung anzeigen.

### `.env` / `.env.example` (Änderung)
Neue Variablen:
```
SAML_ENTRY_POINT=https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2
SAML_LOGOUT_URL=https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2
SAML_ISSUER=https://berichtsheft.putzmeister.com/api/auth/saml/metadata
SAML_CALLBACK_URL=http://localhost:3000/api/auth/saml/acs
SAML_IDP_METADATA_PATH=./config/saml/azure-idp-metadata.xml
```
(Lokal `SAML_CALLBACK_URL=localhost`, in Prod der echte Host — einziger
Unterschied zwischen den Umgebungen.)

## Datenfluss (SP-initiiert)

```
Browser → GET /api/auth/saml/login
        → 302 → login.microsoftonline.com/.../saml2  (AuthnRequest)
        → Microsoft-Anmeldung
        → Browser POSTet SAMLResponse an /api/auth/saml/acs
        → validatePostResponse() prüft Signatur (IdP-Cert), Audience, Gültigkeit
        → req.session.user = { oid, email, name }
        → 302 → /app/dashboard.html
        → /api/auth/me liefert echte Identität (über requireAuth)
```

Für den lokalen Test ist **kein Inbound von Azure** nötig — der Browser POSTet
die Assertion selbst an `localhost`.

## Fehlerbehandlung

- ACS-Validierungsfehler (Signatur/Audience/abgelaufen) → Redirect
  `/app/index.html?error=sso`, kein `500`; Detail in Server-Log.
- Fehlende SAML-Config beim Start → Warn-Log; SAML-Routen liefern `503`.
- Bestehende Demo-/Header-Auth bleibt als Rückfallebene erhalten.

## Test / Verifikation

- Backend starten (`node server.js`), Login-Seite öffnen, „Mit Microsoft
  anmelden" → Redirect zu Microsoft → nach Anmeldung zurück → `/api/auth/me`
  zeigt echte OID/E-Mail.
- Negativfall: manipulierte/abgelaufene Response → Redirect mit `?error=sso`.
- Regression: Demo-Logins funktionieren unverändert.
- (Echte Anmeldung setzt voraus, dass der Azure-Kollege den anmeldenden Nutzer
  der Enterprise App zugewiesen und die localhost-Reply-URL aktiv hat — fehlende
  Berechtigungen zeigen sich hier als konkreter Azure-Fehler.)

## Offene Abhängigkeiten (Azure-Seite)

- Nutzer-Zuweisung zur Enterprise App.
- Bestätigung, dass `http://localhost:3000/api/auth/saml/acs` als Reply-URL
  aktiv ist (für lokalen Test).
- Bestätigung des `objectid`-Custom-Claims im Attribut-Mapping.
