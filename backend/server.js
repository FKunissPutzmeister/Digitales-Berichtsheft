require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { devAuth, DEV_USERS } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: 'http://localhost:5500', credentials: true }));
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

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', devAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Geschützte API-Routen ─────────────────────────────────────────
const wochenRouter         = require('./routes/wochen');
const zuweisungenRouter    = require('./routes/zuweisungen');
const kommentareRouter     = require('./routes/kommentare');
const benachrichtigungenRouter = require('./routes/benachrichtigungen');

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

app.listen(PORT, () => {
  console.log(`Backend läuft auf http://localhost:${PORT}`);
});
