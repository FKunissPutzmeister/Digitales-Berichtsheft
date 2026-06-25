# SAML-SSO-Handshake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den SAML-2.0-Handshake end-to-end zum Laufen bringen — Login leitet zu Microsoft, die validierte Assertion liefert die echte Azure-Identität, und diese landet in der Server-Session.

**Architecture:** Das Express-Backend ist SAML Service Provider via `@node-saml/node-saml`. Drei Routen (`/api/auth/saml/{login,acs,logout}`) lösen den AuthnRequest aus, empfangen/validieren die Assertion und beenden die Session. Die echte Identität wird in `req.session.user` geschrieben; eine einheitliche `requireAuth`-Middleware bevorzugt diese SAML-Identität und fällt sonst auf die bestehenden `DEV_USERS` zurück, damit Demo-Logins lokal funktionsfähig bleiben.

**Tech Stack:** Node.js (CommonJS), Express 5, express-session + session-file-store, `@node-saml/node-saml`, `node:test` + `node:assert/strict`.

## Global Constraints

- **Sprache/Modulsystem:** CommonJS (`require`/`module.exports`), passend zu `backend/package.json` (`"type": "commonjs"`).
- **Tests:** ausschließlich `node:test` + `node:assert/strict`, keine neuen Test-Dependencies. Ausführen mit `node --test <datei>`.
- **Einzige neue Laufzeit-Dependency:** `@node-saml/node-saml`.
- **SP Entity ID (Issuer) — exakt:** `https://berichtsheft.putzmeister.com/api/auth/saml/metadata`
- **Lokale Callback-URL — exakt:** `http://localhost:3000/api/auth/saml/acs`
- **Object-ID-Claim:** GUID wird aus `profile['objectid']` gelesen — NICHT aus der NameID, NICHT aus dem restricted URI `…/claims/objectidentifier`.
- **Azure-Signatur:** Azure signiert die **Assertion**, nicht zwingend die Response → `wantAssertionsSigned: true`, `wantAuthnResponseSigned: false`.
- **IdP-Metadata-Datei:** `backend/config/saml/azure-idp-metadata.xml` (bereits im Repo, öffentlich).
- **Rollen-Mapping (pruefer/azubi) ist NICHT Teil dieser Iteration** — `req.session.user` enthält nur `{ oid, email, name }`.

---

### Task 1: SAML-Konfigurationsmodul

Liest die IdP-Metadata, extrahiert das/die Signaturzertifikat(e) und baut die konfigurierte `SAML`-Instanz aus Umgebungsvariablen.

**Files:**
- Create: `backend/config/saml.js`
- Create: `backend/config/saml.test.js`
- Modify: `backend/.env.example`
- Modify: `backend/.env` (lokale Werte; nicht committen falls Secrets enthalten — hier keine Secrets)
- Modify: `backend/package.json` (Dependency via npm install)

**Interfaces:**
- Produces:
  - `extractIdpCerts(xml: string): string[]` — alle eindeutigen Base64-Zertifikate aus der Metadata, whitespace-bereinigt.
  - `samlConfigured: boolean` — true, wenn alle Pflicht-Env-Variablen gesetzt sind.
  - `saml: SAML | null` — konfigurierte node-saml-Instanz oder null.

- [ ] **Step 1: Dependency installieren**

Run (im Ordner `backend/`):
```bash
npm install @node-saml/node-saml
```
Expected: `@node-saml/node-saml` erscheint unter `dependencies` in `backend/package.json`.

- [ ] **Step 2: Env-Variablen dokumentieren**

In `backend/.env.example` anhängen:
```
# ── SAML / Azure AD (Service Provider) ──────────────────────────
SAML_ENTRY_POINT=https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2
SAML_LOGOUT_URL=https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2
SAML_ISSUER=https://berichtsheft.putzmeister.com/api/auth/saml/metadata
SAML_CALLBACK_URL=http://localhost:3000/api/auth/saml/acs
SAML_IDP_METADATA_PATH=./config/saml/azure-idp-metadata.xml
```
Dieselben Zeilen auch in `backend/.env` eintragen (mit den lokalen Werten — `SAML_CALLBACK_URL` bleibt localhost).

- [ ] **Step 3: Failing test schreiben**

`backend/config/saml.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractIdpCerts } = require('./saml');

const META = fs.readFileSync(
  path.join(__dirname, 'saml', 'azure-idp-metadata.xml'), 'utf8'
);

test('extractIdpCerts liefert mindestens ein Base64-Zertifikat', () => {
  const certs = extractIdpCerts(META);
  assert.ok(Array.isArray(certs));
  assert.ok(certs.length >= 1);
});

test('extractIdpCerts liefert sauberes Base64 ohne Whitespace/Tags', () => {
  const certs = extractIdpCerts(META);
  for (const c of certs) {
    assert.doesNotMatch(c, /\s/);                 // kein Whitespace
    assert.doesNotMatch(c, /</);                  // keine XML-Tags
    assert.match(c, /^[A-Za-z0-9+/=]+$/);         // reines Base64
    assert.ok(c.length > 100);                    // plausibel lang
  }
});

test('extractIdpCerts dedupliziert identische Zertifikate', () => {
  const certs = extractIdpCerts(META);
  assert.equal(certs.length, new Set(certs).size);
});
```

- [ ] **Step 4: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/config/saml.test.js`
Expected: FAIL — `extractIdpCerts is not a function` (Modul/Funktion existiert noch nicht).

- [ ] **Step 5: Modul implementieren**

`backend/config/saml.js`:
```js
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
```

- [ ] **Step 6: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/config/saml.test.js`
Expected: PASS (3 Tests grün).

- [ ] **Step 7: Commit**

```bash
git add backend/config/saml.js backend/config/saml.test.js backend/.env.example backend/package.json backend/package-lock.json
git commit -m "feat(saml): SP-Konfigmodul + IdP-Cert-Extraktion aus Metadata"
```

---

### Task 2: requireAuth-Bridge (SAML-Session vor DEV_USERS)

Erweitert die Auth-Middleware: echte SAML-Identität aus `req.session.user` hat Vorrang, sonst Fallback auf den bestehenden `DEV_USERS`-Pfad. `devAuth` bleibt als Alias erhalten, damit `server.js` unverändert weiterläuft.

**Files:**
- Modify: `backend/middleware/auth.js`
- Create: `backend/middleware/auth.test.js`

**Interfaces:**
- Consumes: `faehigkeitenFuer(oid)` aus `../config/berechtigungen`.
- Produces:
  - `requireAuth(req, res, next)` — setzt `req.user`.
  - `devAuth` — Alias auf `requireAuth` (Rückwärtskompatibilität für `server.js`).
  - `DEV_USERS` — unverändert exportiert.
  - `req.user`-Form bei SAML: `{ oid, email, name, kannPlanen, istAusbilder, istAzubi: false }`.

- [ ] **Step 1: Failing test schreiben**

`backend/middleware/auth.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, DEV_USERS } = require('./auth');

function makeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('SAML-Session-User hat Vorrang und wird durchgereicht', () => {
  const req = { headers: {}, session: { user: { oid: 'real-guid-123', email: 'a@b.de', name: 'A B' } } };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.oid, 'real-guid-123');
  assert.equal(req.user.email, 'a@b.de');
  assert.equal(req.user.istAzubi, false);
  assert.equal(typeof req.user.kannPlanen, 'boolean');
});

test('Ohne SAML-Session: Fallback auf DEV_USERS via X-Dev-OID', () => {
  const devOid = Object.keys(DEV_USERS)[0];
  const req = { headers: { 'x-dev-oid': devOid }, session: {} };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.oid, devOid);
  assert.equal(req.user.name, DEV_USERS[devOid].name);
});

test('Weder SAML noch Dev-User: 401', () => {
  const req = { headers: {}, session: {} };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/middleware/auth.test.js`
Expected: FAIL — `requireAuth is not a function` (noch nicht exportiert).

- [ ] **Step 3: Middleware umbauen**

In `backend/middleware/auth.js` die Funktion `devAuth` durch `requireAuth` ersetzen und den Export anpassen. Der `DEV_USERS`-Block bleibt unverändert. Neue Funktion + Export:
```js
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
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/middleware/auth.test.js`
Expected: PASS (3 Tests grün).

- [ ] **Step 5: Bestehende Tests/Server-Start gegenchecken**

Run: `node --test backend/config/saml.test.js backend/middleware/auth.test.js`
Expected: alle PASS. (Server-Start wird in Task 4 geprüft.)

- [ ] **Step 6: Commit**

```bash
git add backend/middleware/auth.js backend/middleware/auth.test.js
git commit -m "feat(saml): requireAuth-Bridge — SAML-Session vor DEV_USERS, devAuth-Alias"
```

---

### Task 3: SAML-Routen + Claim-Mapping

Die drei SP-Routen plus ein Status-Endpunkt fürs Frontend. Die reine Claim→User-Abbildung wird als testbare Funktion ausgelagert.

**Files:**
- Create: `backend/routes/saml.js`
- Create: `backend/routes/saml.test.js`

**Interfaces:**
- Consumes: `saml`, `samlConfigured` aus `../config/saml`.
- Produces:
  - `profileToUser(profile: object): { oid, email, name }` — defensiv über mehrere Claim-Namen.
  - Express-Router mit Routen `GET /login`, `POST /acs`, `GET|POST /logout`, `GET /status`.
  - Setzt bei Erfolg `req.session.user = { oid, email, name }` (konsumiert von `requireAuth` aus Task 2).

- [ ] **Step 1: Failing test schreiben (nur reine Logik)**

`backend/routes/saml.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { profileToUser } = require('./saml');

test('profileToUser liest oid aus dem objectid-Claim', () => {
  const u = profileToUser({ objectid: 'guid-xyz', email: 'max@pm.com', displayname: 'Max M' });
  assert.equal(u.oid, 'guid-xyz');
  assert.equal(u.email, 'max@pm.com');
  assert.equal(u.name, 'Max M');
});

test('profileToUser fällt für E-Mail auf NameID und Claim-URI zurück', () => {
  const u = profileToUser({
    objectid: 'g1',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'uri@pm.com',
    nameID: 'nameid@pm.com',
  });
  assert.equal(u.email, 'uri@pm.com');
});

test('profileToUser nutzt E-Mail als Name-Fallback', () => {
  const u = profileToUser({ objectid: 'g2', email: 'only@pm.com' });
  assert.equal(u.name, 'only@pm.com');
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `node --test backend/routes/saml.test.js`
Expected: FAIL — `profileToUser is not a function`.

- [ ] **Step 3: Router implementieren**

`backend/routes/saml.js`:
```js
'use strict';
/* =====================================================================
   SAML-SP-Routen: /api/auth/saml/{login,acs,logout,status}
   Bei fehlender Konfiguration (samlConfigured=false) → 503.
   ===================================================================== */
const router = require('express').Router();
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
    req.session.user = user;
    res.redirect(DASHBOARD);
  } catch (e) {
    console.error('[saml] ACS-Validierung fehlgeschlagen:', e.message);
    res.redirect(`${LOGIN_PAGE}?error=sso`);
  }
});

// Logout: lokale Session beenden. (IdP-SLO optional, spätere Iteration.)
function logout(req, res) {
  req.session.destroy(() => res.redirect(LOGIN_PAGE));
}
router.get('/logout', logout);
router.post('/logout', logout);

module.exports = router;
module.exports.profileToUser = profileToUser;
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `node --test backend/routes/saml.test.js`
Expected: PASS (3 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/saml.js backend/routes/saml.test.js
git commit -m "feat(saml): SP-Routen login/acs/logout/status + Claim-Mapping"
```

---

### Task 4: Server-Verdrahtung

SAML-Router mounten und den Body-Parser für die ACS-POST-Route ergänzen. **Kritisch:** Azure POSTet `application/x-www-form-urlencoded`; ohne `express.urlencoded()` bleibt `req.body` leer und die Validierung schlägt still fehl.

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: Router aus `./routes/saml`.

- [ ] **Step 1: urlencoded-Parser ergänzen**

In `backend/server.js` direkt nach `app.use(express.json());` einfügen:
```js
// Azure POSTet die SAMLResponse als application/x-www-form-urlencoded.
// Ohne diesen Parser bliebe req.body leer → ACS-Validierung schlägt still fehl.
app.use(express.urlencoded({ extended: false }));
```

- [ ] **Step 2: SAML-Router mounten**

In `backend/server.js` im Auth-Block (nach der `/api/auth/logout`-Route, vor `app.get('/api/auth/me', …)`) einfügen:
```js
// ── SAML-SSO-Routen (kein requireAuth davor) ─────────────────────
app.use('/api/auth/saml', require('./routes/saml'));
```

- [ ] **Step 3: Server starten und Smoke-Test (ohne SAML-Konfig)**

Vorübergehend ohne gesetzte `SAML_*`-Variablen starten (z.B. in einer Shell ohne `.env`-SAML-Block) ODER mit Konfig — beides ist ein gültiger Pfad:

Run: `cd backend && node server.js` (in separater Shell)
Dann:
```bash
curl -i http://localhost:3000/api/auth/saml/status
```
Expected (konfiguriert): `{"configured":true}` · Expected (nicht konfiguriert): `{"configured":false}`.

```bash
curl -i http://localhost:3000/api/auth/saml/login
```
Expected (konfiguriert): `302` mit `Location: https://login.microsoftonline.com/b5ce0e47-…/saml2?SAMLRequest=…`
Expected (nicht konfiguriert): `503 {"error":"SAML ist nicht konfiguriert."}`

- [ ] **Step 4: Regression — Demo-Login funktioniert weiter**

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"oid":"00000000-0000-0000-0000-000000000001"}'
curl -i -b cookies.txt http://localhost:3000/api/auth/me
```
Expected: `/me` liefert `{"user":{"oid":"00000000-…001","name":"Florian Kuniß",…}}` (Bridge-Fallback intakt). Danach Server stoppen.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat(saml): Router mounten + urlencoded-Parser für ACS-POST"
```

---

### Task 5: Frontend — Microsoft-Login-Button verdrahten

Der bisherige Platzhalter-Button löst echtes SSO aus, sobald das Backend SAML meldet; sonst bleibt der bisherige Hinweis. `?error=sso` aus einem fehlgeschlagenen Handshake wird angezeigt.

**Files:**
- Modify: `app/js/login.js`

**Interfaces:**
- Consumes: `GET /api/auth/saml/status` → `{ configured }`; `GET /api/auth/saml/login` (Redirect).

- [ ] **Step 1: Button-Logik ersetzen**

In `app/js/login.js` den bestehenden Block (Zeilen ~27-32, der nur `ssoHint` einblendet) ersetzen durch:
```js
  // Microsoft-SSO: aktiv, sobald das Backend SAML konfiguriert meldet.
  const msBtn = document.getElementById('msLoginBtn');
  const ssoHint = document.getElementById('ssoHint');
  if (msBtn) {
    let samlReady = false;
    try {
      const base = (window.location.port === '5500')
        ? `http://${window.location.hostname}:3000/api` : '/api';
      const r = await fetch(`${base}/auth/saml/status`, { credentials: 'include' });
      samlReady = r.ok && (await r.json()).configured === true;
    } catch { samlReady = false; }

    msBtn.addEventListener('click', () => {
      if (samlReady) {
        const base = (window.location.port === '5500')
          ? `http://${window.location.hostname}:3000/api` : '/api';
        window.location.href = `${base}/auth/saml/login`;
      } else {
        ssoHint?.classList.add('visible');
      }
    });
  }
```

- [ ] **Step 2: SSO-Fehler aus der URL anzeigen**

In `app/js/login.js` am Ende des `DOMContentLoaded`-Handlers (nach den Demo-Login-Bindings) einfügen:
```js
  // Fehlgeschlagener SAML-Handshake leitet mit ?error=sso zurück.
  if (new URLSearchParams(window.location.search).get('error') === 'sso') {
    showError('Microsoft-Anmeldung fehlgeschlagen. Bitte erneut versuchen oder Demo-Zugang nutzen.');
  }
```

- [ ] **Step 3: Manuelle Verifikation im Browser**

Backend mit gesetzten `SAML_*`-Variablen starten (`cd backend && node server.js`). Im Browser `http://localhost:3000/app/index.html` öffnen.
- „Mit Microsoft anmelden" klicken → Weiterleitung zu `login.microsoftonline.com`.
- Mit einem der Enterprise-App zugewiesenen Konto anmelden → Rücksprung auf `/app/dashboard.html`.
- `http://localhost:3000/api/auth/me` öffnen → JSON zeigt die **echte** `oid` (GUID) und E-Mail aus der Assertion.

Bekannte externe Voraussetzungen (Azure-Seite), die hier sichtbar werden, falls offen: der Test-Nutzer muss der Enterprise App zugewiesen sein, und `http://localhost:3000/api/auth/saml/acs` muss als Reply-URL aktiv sein. Fehler erscheinen als konkrete Azure-Meldung bzw. als `?error=sso`-Rücksprung (Detail im Server-Log).

- [ ] **Step 4: Commit**

```bash
git add app/js/login.js
git commit -m "feat(saml): Microsoft-Login-Button an SSO verdrahten + Fehleranzeige"
```

---

## Hinweise zur Produktion (nicht Teil dieser Iteration, hier nur dokumentiert)

- `SAML_CALLBACK_URL` auf `https://berichtsheft.putzmeister.com/api/auth/saml/acs` setzen.
- `cookie.secure=true` in der Session-Konfig (`backend/server.js`).
- IIS-Reverse-Proxy muss `POST /api/auth/saml/acs` an Node (`localhost:3000`) durchreichen.
- Identifier (Entity ID) in Azure muss exakt `https://berichtsheft.putzmeister.com/api/auth/saml/metadata` sein.
- Rollen-Mapping (`role`-Claim → pruefer/azubi) als nächste Iteration.
