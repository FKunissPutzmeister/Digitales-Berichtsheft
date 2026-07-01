require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { devAuth } = require('./middleware/auth');
const { getUserByEmail, getUserByOid } = require('./services/users');

const app = express();
const PORT = process.env.PORT || 3000;

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
  store: new FileStore({
    path: SESSION_DIR,
    ttl: 60 * 60 * 24 * 7,   // 7 Tage (in Sekunden)
    // Windows: das atomare Rename beim Session-Schreiben kollidiert sporadisch
    // mit Datei-Locks (Virenscanner/paralleler Zugriff) → EPERM. Mit retries:0
    // ging dadurch die frisch gesetzte Session verloren ("Nicht angemeldet"
    // bei Folge-Requests). Ein paar Retries machen den Login zuverlässig.
    retries: 5,
    retryDelay: 60,
    logFn: () => {},         // Store-Logs unterdrücken (sonst sehr spammy)
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 },  // 7 Tage
}));

// ── Auth-Endpunkte (kein devAuth davor) ──────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { oid } = req.body;
  const row = await getUserByOid(oid);
  if (!row || !row.Aktiv) return res.status(400).json({ error: 'Unbekannte/inaktive OID' });
  req.session.userOid = oid;
  res.json({ user: require('./services/users').buildReqUser(row) });
});

app.post('/api/auth/login-by-email', async (req, res) => {
  const { email } = req.body;
  const row = await getUserByEmail((email || '').trim().toLowerCase());
  if (!row || !row.Aktiv) return res.status(401).json({ error: 'E-Mail nicht gefunden' });
  req.session.userOid = row.Oid;
  res.json({ user: require('./services/users').buildReqUser(row) });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

// ── SAML-SSO-Routen (kein requireAuth davor) ─────────────────────
const samlRouter = require('./routes/saml');
app.use('/api/auth/saml', samlRouter);

app.get('/api/auth/me', devAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Geschützte API-Routen ─────────────────────────────────────────
const usersRouter          = require('./routes/users');
const wochenRouter         = require('./routes/wochen');
const zuweisungenRouter    = require('./routes/zuweisungen');
const kommentareRouter     = require('./routes/kommentare');
const anhaengeRouter       = require('./routes/anhaenge');
const benachrichtigungenRouter = require('./routes/benachrichtigungen');
const fahrtgeldRouter      = require('./routes/fahrtgeld');

app.use('/api/users',               devAuth, usersRouter);
app.use('/api/wochen',              devAuth, wochenRouter);
app.use('/api/zuweisungen',         devAuth, zuweisungenRouter);
app.use('/api/wochen',              devAuth, kommentareRouter);   // POST /api/wochen/:id/kommentare
app.use('/api/wochen',              devAuth, anhaengeRouter);     // /api/wochen/:id/anhaenge, /api/wochen/anhaenge/:id
app.use('/api/benachrichtigungen',  devAuth, benachrichtigungenRouter);
app.use('/api/fahrtgeld',           devAuth, fahrtgeldRouter);

// ── Dev-Hilfsliste: alle verfügbaren Routen ───────────────────────
if (process.env.NODE_ENV !== 'production') {
  const { listUsers } = require('./services/users');
  app.get('/api/dev/users', async (req, res) => res.json(await listUsers({})));
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
app.use(express.static(ROOT));
app.get('/', (req, res) => res.redirect('/app/index.html'));

app.listen(PORT, () => {
  console.log(`Backend + Frontend laufen auf http://localhost:${PORT}`);
  console.log(`→ App:  http://localhost:${PORT}/  (öffnet /app/index.html)`);
  console.log(`→ API:  http://localhost:${PORT}/api/...`);
});
