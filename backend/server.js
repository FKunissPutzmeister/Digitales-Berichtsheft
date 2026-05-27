require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const { devAuth, DEV_USERS } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: [`http://localhost:${PORT}`, 'http://localhost:5500'], credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
}));

// ── Auth-Endpunkte (kein devAuth davor) ──────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { oid } = req.body;
  if (!DEV_USERS[oid]) return res.status(400).json({ error: 'Unbekannte Dev-OID' });
  req.session.userOid = oid;
  res.json({ user: { oid, ...DEV_USERS[oid] } });
});

// Login per E-Mail (Frontend nutzt weiterhin E-Mail-Formular)
app.post('/api/auth/login-by-email', (req, res) => {
  const { email } = req.body;
  const entry = Object.entries(DEV_USERS).find(([, u]) => u.email === email);
  if (!entry) return res.status(401).json({ error: 'E-Mail nicht gefunden' });
  const [oid, u] = entry;
  req.session.userOid = oid;
  res.json({ user: { oid, ...u } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', devAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Geschützte API-Routen ─────────────────────────────────────────
const usersRouter          = require('./routes/users');
const wochenRouter         = require('./routes/wochen');
const zuweisungenRouter    = require('./routes/zuweisungen');
const kommentareRouter     = require('./routes/kommentare');
const benachrichtigungenRouter = require('./routes/benachrichtigungen');

app.use('/api/users',               devAuth, usersRouter);
app.use('/api/wochen',              devAuth, wochenRouter);
app.use('/api/zuweisungen',         devAuth, zuweisungenRouter);
app.use('/api/wochen',              devAuth, kommentareRouter);   // POST /api/wochen/:id/kommentare
app.use('/api/benachrichtigungen',  devAuth, benachrichtigungenRouter);

// ── Dev-Hilfsliste: alle verfügbaren Routen ───────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/users', (req, res) => res.json(
    Object.entries(DEV_USERS).map(([oid, u]) => ({ oid, ...u }))
  ));
}

// ── Frontend statisch ausliefern ──────────────────────────────────
app.use('/app', express.static(path.join(__dirname, '../app')));
app.get('/', (req, res) => res.redirect('/app/index.html'));

app.listen(PORT, () => {
  console.log(`Backend läuft auf http://localhost:${PORT}`);
});
