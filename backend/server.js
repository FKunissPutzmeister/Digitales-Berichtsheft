require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { bestEffortTouch } = require('./services/session-store');
const { devAuth, DEV_AUTH_ENABLED } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// SESSION_SECRET signiert die Session-Cookies. Fehlt er in Produktion, wäre die
// Session mit dem öffentlich bekannten Dev-Default fälschbar → harter Abbruch.
if (IS_PROD && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET muss in Produktion gesetzt sein.');
}
// Hinter dem IIS-Reverse-Proxy: X-Forwarded-Proto vertrauen, damit secure-Cookies
// über die HTTPS-Terminierung von IIS korrekt gesetzt werden.
if (IS_PROD) app.set('trust proxy', 1);

/* Browser behandelt "localhost" und "127.0.0.1" als unterschiedliche
   Origins. Beide explizit erlauben, sonst scheitert der Login wenn
   das Frontend per Live Server (Port 5500) oder über 127.0.0.1 statt
   localhost geladen wird. */
app.use(cors({
  origin: [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));
app.use(express.json());
// Azure POSTet die SAMLResponse als application/x-www-form-urlencoded.
// Ohne diesen Parser bliebe req.body leer → ACS-Validierung schlägt still fehl.
app.use(express.urlencoded({ extended: false }));

// Sessions auf der Platte ablegen statt im RAM. So überleben Logins einen
// Backend-Restart – wichtig für `node --watch` im Dev-Modus, damit nicht
// jeder Code-Change alle Devs ausloggt.
// WICHTIG: Verzeichnis liegt im OS-Temp, NICHT im Projekt. Sonst sieht der
// VS-Code-Live-Server die Session-Schreibvorgänge (pro Request) als Datei-
// änderung und lädt die Seite im Dauertakt neu (Flackern/Spam-Refresh).
const SESSION_DIR = path.join(os.tmpdir(), 'berichtsheft-sessions');
app.use(session({
  // bestEffortTouch: der per-Request TTL-Bump (store.touch) schreibt die
  // Session-Datei komplett neu (atomares Rename). Unter Windows kollidieren
  // parallele Renames auf dieselbe Datei sporadisch mit EPERM; da der
  // Schreibpfad von session-file-store KEINE Retries hat, würde express-session
  // den Fehler an den globalen Handler durchreichen (spammt den Fehlerbericht
  // bei jedem Reiterwechsel). Ein fehlgeschlagener TTL-Bump ist harmlos → wir
  // schlucken ihn. Echte Schreibfehler (set) bleiben sichtbar. Siehe
  // services/session-store.js.
  store: bestEffortTouch(new FileStore({
    path: SESSION_DIR,
    ttl: 60 * 60 * 24 * 7,   // 7 Tage (in Sekunden)
    // Windows: das atomare Rename beim Session-Schreiben kollidiert sporadisch
    // mit Datei-Locks (Virenscanner/paralleler Zugriff) → EPERM. Die retries
    // greifen nur beim LESEN (get) — sie machten das Login zuverlässig, weil
    // der Folge-Request die frisch geschriebene Session zuverlässig liest
    // (mit retries:0 ging sie sonst verloren: "Nicht angemeldet").
    retries: 5,
    retryDelay: 60,
    logFn: () => {},         // Store-Logs unterdrücken (sonst sehr spammy)
  })),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // kein JS-Zugriff auf das Session-Cookie (XSS-Diebstahl-Schutz)
    sameSite: 'lax',         // Cookie nicht bei Cross-Site-POSTs mitsenden (CSRF-Dämpfung)
    secure: IS_PROD,         // in Produktion nur über HTTPS (setzt IIS-HTTPS + trust proxy voraus)
    maxAge: 1000 * 60 * 60 * 24 * 7,  // 7 Tage
  },
}));

// ── Dev-Auth-Endpunkte (passwortlos!) — NUR außerhalb der Produktion ──────
// In Produktion authentifiziert ausschließlich SAML-SSO; diese Endpunkte
// würden sonst jedem ohne Credentials eine beliebige Identität geben.
// Zusätzlich lassen die Handler nur .demo-Konten zu (siehe routes/dev-login).
if (DEV_AUTH_ENABLED) {
  const { loginByOid, loginByEmail } = require('./routes/dev-login');
  app.post('/api/auth/login', loginByOid);
  app.post('/api/auth/login-by-email', loginByEmail);
}

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

// ── SAML-SSO-Routen (kein requireAuth davor) ─────────────────────
const samlRouter = require('./routes/saml');
app.use('/api/auth/saml', samlRouter);

app.get('/api/auth/me', devAuth, (req, res) => {
  res.json({ user: req.user });
});

// Dev-View-Switch umlegen. Nur für Allowlist-Nutzer (req.user.devViewEligible,
// serverseitig in requireAuth gesetzt). Speichert lediglich den Wunsch in der
// Session; die eigentliche Elevation passiert bei jedem Request in requireAuth.
app.post('/api/auth/dev-view', devAuth, (req, res) => {
  if (!req.user.devViewEligible) return res.status(403).json({ error: 'Nicht berechtigt.' });
  req.session.devView = !!(req.body && req.body.on);
  res.json({ devViewActive: req.session.devView });
});

// ── Geschützte API-Routen ─────────────────────────────────────────
const usersRouter          = require('./routes/users');
const wochenRouter         = require('./routes/wochen');
const zuweisungenRouter    = require('./routes/zuweisungen');
const abteilungenRouter    = require('./routes/abteilungen');
const kommentareRouter     = require('./routes/kommentare');
const anhaengeRouter       = require('./routes/anhaenge');
const benachrichtigungenRouter = require('./routes/benachrichtigungen');
const fahrtgeldRouter      = require('./routes/fahrtgeld');
const beurteilungenRouter  = require('./routes/beurteilungen');
const syncRouter           = require('./routes/sync');
const apiKeysRouter        = require('./routes/apiKeys');
const mcpRouter            = require('./mcp/server');
const fehlerRouter         = require('./routes/fehlerberichte');
const { logError: logFehler, cleanupAlt: cleanupFehler } = require('./services/fehlerberichte');

app.use('/api/users',               devAuth, usersRouter);
app.use('/api/wochen',              devAuth, wochenRouter);
app.use('/api/zuweisungen',         devAuth, zuweisungenRouter);
app.use('/api/abteilungen',         devAuth, abteilungenRouter);
app.use('/api/wochen',              devAuth, kommentareRouter);   // POST /api/wochen/:id/kommentare
app.use('/api/wochen',              devAuth, anhaengeRouter);     // /api/wochen/:id/anhaenge, /api/wochen/anhaenge/:id
app.use('/api/benachrichtigungen',  devAuth, benachrichtigungenRouter);
app.use('/api/fahrtgeld',           devAuth, fahrtgeldRouter);
app.use('/api/beurteilungen',       devAuth, beurteilungenRouter);
app.use('/api/sync',                devAuth, syncRouter);
app.use('/api/apikeys',             devAuth, apiKeysRouter);
app.use('/api',                     devAuth, fehlerRouter);   // /api/errors, /api/dev/errors
// MCP-Endpunkt: KEIN devAuth (eigene Bearer-API-Key-Auth in mcp/server.js).
app.use('/mcp',                     mcpRouter);

// ── Dev-Hilfsliste: alle verfügbaren Routen ───────────────────────
if (process.env.NODE_ENV !== 'production') {
  const { listUsers } = require('./services/users');
  app.get('/api/dev/users', async (req, res) => {
    try {
      res.json(await listUsers({}));
    } catch (e) {
      console.error('[dev/users]', e);
      res.status(500).json({ error: 'Fehler' });
    }
  });
}

// ── Statisches Frontend ausliefern ───────────────────────────────
// Dev-Komfort: App + API auf einem Port, damit http://localhost:PORT/
// direkt die App zeigt (in Produktion übernimmt das IIS). Es wird das
// Repo-Root statisch ausgeliefert (wie der .dev-server.js auf Port 5500),
// damit die App ihre Assets unter "../Corporate Design/..." findet.
// Sensible Pfade (backend/ mit .env, .git, node_modules) werden geblockt.
const ROOT = path.join(__dirname, '..');
app.use((req, res, next) => {
  const p = decodeURIComponent(req.path).replace(/\\/g, '/').toLowerCase();
  if (p === '/backend' || p.startsWith('/backend/') ||
      p === '/.git'    || p.startsWith('/.git/') ||
      p.startsWith('/node_modules')) {
    return res.status(404).send('Not found');
  }
  next();
});
// 'no-cache': der Browser darf Assets zwischenspeichern, MUSS aber bei jedem
// Laden per ETag revalidieren (304 wenn unverändert, 200 wenn geändert). So sind
// gepullte JS/CSS-Änderungen sofort für alle sichtbar – ohne Versions-Strings
// von Hand zu pflegen (ersetzt einen manuellen Cache-Buster).
app.use(express.static(ROOT, {
  setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get('/', (req, res) => res.redirect('/app/index.html'));

// Globaler Fehler-Handler: fängt alles ab, was eine Route per next(err) oder
// als geworfener Fehler durchreicht. Persistiert + antwortet 500.
app.use((err, req, res, next) => {
  logFehler({
    quelle: 'backend',
    nachricht: `[unhandled] ${err && err.message ? err.message : String(err)}`,
    stack: err && err.stack,
    kontext: { route: req.path, methode: req.method },
    benutzerOid: req.user && req.user.oid,
    benutzerName: req.user && req.user.name,
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

app.listen(PORT, () => {
  console.log(`Backend + Frontend laufen auf http://localhost:${PORT}`);
  console.log(`→ App:  http://localhost:${PORT}/  (öffnet /app/index.html)`);
  console.log(`→ API:  http://localhost:${PORT}/api/...`);
});

// Letzte Fangnetze: unbehandelte Rejections/Exceptions protokollieren.
process.on('unhandledRejection', (reason) => {
  logFehler({ quelle: 'backend', nachricht: `[unhandledRejection] ${reason && reason.message ? reason.message : String(reason)}`,
    stack: reason && reason.stack });
});
process.on('uncaughtException', (err) => {
  logFehler({ quelle: 'backend', nachricht: `[uncaughtException] ${err.message}`, stack: err.stack });
});

// Täglicher Cleanup: Einträge älter als 90 Tage entfernen (Muster wie entra-sync).
cleanupFehler(90).then(n => n && console.log(`[fehler-cleanup] ${n} alte Einträge entfernt.`))
  .catch(e => console.error('[fehler-cleanup] Start:', e.message));
setInterval(() => {
  cleanupFehler(90).then(n => n && console.log(`[fehler-cleanup] ${n} alte Einträge entfernt.`))
    .catch(e => console.error('[fehler-cleanup]', e.message));
}, 24 * 3600 * 1000);

// ── Automatischer Entra-Gruppen-Sync ─────────────────────────────
const { syncConfigured: entraConfigured, runSync: entraRunSync } = require('./services/entraSync');
const entraCfg = entraConfigured();
if (entraCfg.configured) {
  entraRunSync().catch((e) => console.error('[entra-sync] Start-Lauf:', e.message));
  setInterval(() => { entraRunSync().catch((e) => console.error('[entra-sync]', e.message)); },
    entraCfg.intervalHours * 3600 * 1000);
  console.log(`[entra-sync] aktiv — Intervall ${entraCfg.intervalHours} h.`);
} else {
  console.warn('[entra-sync] NICHT konfiguriert — Gruppen-Sync deaktiviert.');
}
