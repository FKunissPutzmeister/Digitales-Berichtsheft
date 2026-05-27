/* ===================================================================
   DATA.JS – Mock-Daten & localStorage-Zugriff
   =================================================================== */

const DB_KEY = 'pm_berichtsheft';
/* Schema-Version für Demo-Daten. Bei jeder Erhöhung wird die in
   localStorage abgelegte DB beim nächsten Load einmalig komplett neu
   geseedet — sonst überleben veraltete Demo-Identitäten (Name, Email,
   Beruf) Code-Änderungen, weil die alte Migration-Logik bestehende
   Seed-User nicht überschrieben hat.
   ──
   Bump-Historie:
   • 1 (implizit): Erst-Stand mit "Florian Kuniß"
   • 2: Azubi-Demo umbenannt zu "Florian Kern" (Fachinformatiker für
     Systemintegration, 1. Lehrjahr, 2025–2028). Zweiter Ausbilder-
     "Florian Kern" zu "Markus Berger" umbenannt, um Login-Kollision
     auf florian.kern@putzmeister.com zu vermeiden. */
const SCHEMA_VERSION = 2;

const DEFAULT_DATA = {
  users: [
    {
      id: 1,
      name: 'Florian Kern',
      email: 'florian.kern@putzmeister.com',
      password: 'azubi123',
      role: 'azubi',
      initials: 'FK',
      berichtTyp: 'täglich',
      beruf: 'Fachinformatiker für Systemintegration',
      berufsbildnummer: '701702000000',
      azubiNr: '2468103',
      ihkNr: '175',
      ihkName: 'Industrie- und Handelskammer Region Stuttgart',
      ausbildungsBeginn: '2025-09-01',
      ausbildungsEnde: '2028-08-31',
      unternehmen: 'Putzmeister Holding GmbH',
      abteilung: 'IT Infrastruktur',
    },
    {
      id: 2,
      name: 'Matthias Lengerer',
      email: 'matthias.fauser@putzmeister.com',
      password: 'ausbilder123',
      role: 'ausbilder',
      initials: 'ML',
      beruf: null,
      unternehmen: 'Putzmeister Holding GmbH',
      abteilung: 'Software Entwicklung',
    },
    {
      id: 3,
      // Zweiter Ausbilder-Account. Frühere Email kollidiert mit dem Azubi-
      // Demo (id 1, Florian Kern) → daher hier auf einen anderen Namen
      // ausgewichen, damit beide Demos eigenständig einloggbar bleiben.
      name: 'Markus Berger',
      email: 'markus.berger@putzmeister.com',
      password: 'ausbilder123',
      role: 'ausbilder',
      initials: 'MB',
      unternehmen: 'Putzmeister Holding GmbH',
      abteilung: 'IT Infrastruktur',
    },
    {
      id: 4,
      name: 'Admin Verwaltung',
      email: 'admin@putzmeister.com',
      password: 'admin123',
      role: 'admin',
      initials: 'AD',
      unternehmen: 'Putzmeister Holding GmbH',
      abteilung: 'Ausbildungsabteilung',
    },
    {
      id: 5,
      name: 'Lena Müller',
      email: 'lena.mueller@putzmeister.com',
      password: 'azubi123',
      role: 'azubi',
      initials: 'LM',
      berichtTyp: 'wöchentlich',
      beruf: 'Industriekauffrau',
      berufsbildnummer: '621101000000',
      azubiNr: '2470012',
      ihkNr: '175',
      ihkName: 'Industrie- und Handelskammer Region Stuttgart',
      ausbildungsBeginn: '2024-09-01',
      ausbildungsEnde: '2027-08-31',
      unternehmen: 'Putzmeister Holding GmbH',
      abteilung: 'Kaufmännische Abteilung',
    },
    {
      id: 6,
      name: 'Jonas Becker',
      email: 'jonas.becker@putzmeister.com',
      password: 'azubi123',
      role: 'azubi',
      initials: 'JB',
      berichtTyp: 'täglich',
      beruf: 'Mechatroniker',
      berufsbildnummer: '421101000000',
      azubiNr: '2468211',
      ihkNr: '175',
      ihkName: 'Industrie- und Handelskammer Region Stuttgart',
      ausbildungsBeginn: '2023-09-01',
      ausbildungsEnde: '2026-08-31',
      unternehmen: 'Putzmeister Holding GmbH',
      abteilung: 'Produktion',
    }
  ],

  /* ── Zuweisungen: Azubi ↔ Ausbilder (zeitlich) ── */
  zuweisungen: [
    { id: 1, azubiId: 1, ausbilderId: 2, von: '2023-09-01', bis: '2025-02-28', abteilung: 'Software Entwicklung' },
    { id: 2, azubiId: 1, ausbilderId: 3, von: '2025-03-01', bis: '2025-05-31', abteilung: 'IT Infrastruktur' },
    { id: 3, azubiId: 1, ausbilderId: 2, von: '2025-06-01', bis: '2026-08-31', abteilung: 'Software Entwicklung' },
    { id: 4, azubiId: 5, ausbilderId: 2, von: '2024-09-01', bis: '2027-08-31', abteilung: 'Kaufmännische Abteilung' },
    { id: 5, azubiId: 6, ausbilderId: 3, von: '2023-09-01', bis: '2026-08-31', abteilung: 'Produktion' },
  ],

  /* ── Wocheneinträge ── */
  wochen: [
    {
      id: 101,
      azubiId: 1,
      kw: 15, year: 2026,
      startDate: '2026-04-06', endDate: '2026-04-12',
      status: 'genehmigt',
      gesamtstunden: 39,
      kommentare: [
        { id: 1, userId: 2, text: 'Gute Dokumentation diese Woche!', datum: '2026-04-14', typ: 'ausbilder' }
      ],
      tage: [
        { datum: '2026-04-06', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Entwicklung des REST-API Endpunkts für die Benutzerverwaltung. Implementierung der JWT-Authentifizierung.', stunden: 8 },
        { datum: '2026-04-07', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Frontend-Entwicklung: React Komponenten für das Dashboard überarbeitet. State-Management mit Zustand implementiert.', stunden: 8 },
        { datum: '2026-04-08', anwesenheit: 'anwesend', ort: 'Schule', eintrag: 'Berufsschultag: Netzwerktechnik – Subnetting und Routing-Protokolle besprochen.', stunden: 6 },
        { datum: '2026-04-09', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Unit-Tests für die API-Endpunkte geschrieben. Code-Review mit Ausbilder durchgeführt.', stunden: 8 },
        { datum: '2026-04-10', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Dokumentation aktualisiert. Deployment auf Staging-Umgebung vorbereitet.', stunden: 9 },
        { datum: '2026-04-11', anwesenheit: 'Wochenende', ort: '', eintrag: '', stunden: 0 },
        { datum: '2026-04-12', anwesenheit: 'Wochenende', ort: '', eintrag: '', stunden: 0 },
      ]
    },
    {
      id: 102,
      azubiId: 1,
      kw: 16, year: 2026,
      startDate: '2026-04-13', endDate: '2026-04-19',
      status: 'genehmigt',
      gesamtstunden: 38,
      kommentare: [],
      tage: [
        { datum: '2026-04-13', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Sprint Planning für Q2. Aufgabenverteilung und Priorisierung im Team.', stunden: 8 },
        { datum: '2026-04-14', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Datenbankoptimierung: Indizes gesetzt, Slow-Queries analysiert und behoben.', stunden: 8 },
        { datum: '2026-04-15', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'API-Integration mit externem Dienst implementiert. OAuth2.0 Authentifizierungsflow.', stunden: 8 },
        { datum: '2026-04-16', anwesenheit: 'anwesend', ort: 'Schule', eintrag: 'Berufsschule: Projektmanagement – Agile Methoden, Scrum und Kanban.', stunden: 6 },
        { datum: '2026-04-17', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: 'Bugfixing und Code-Review. CI/CD-Pipeline angepasst.', stunden: 8 },
        { datum: '2026-04-18', anwesenheit: 'Wochenende', ort: '', eintrag: '', stunden: 0 },
        { datum: '2026-04-19', anwesenheit: 'Wochenende', ort: '', eintrag: '', stunden: 0 },
      ]
    },
    {
      id: 103,
      azubiId: 1,
      kw: 17, year: 2026,
      startDate: '2026-04-20', endDate: '2026-04-26',
      status: 'offen',
      gesamtstunden: 9,
      kommentare: [],
      tage: [
        { datum: '2026-04-20', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: '', stunden: 3 },
        { datum: '2026-04-21', anwesenheit: 'Feiertag', ort: '', eintrag: '', stunden: 0 },
        { datum: '2026-04-22', anwesenheit: 'Urlaub', ort: '', eintrag: '', stunden: 0 },
        { datum: '2026-04-23', anwesenheit: 'anwesend', ort: 'Betrieb', eintrag: '', stunden: 6 },
        { datum: '2026-04-24', anwesenheit: 'sonstige Abwesenheit', ort: '', eintrag: '', stunden: 0 },
        { datum: '2026-04-25', anwesenheit: 'Wochenende', ort: '', eintrag: '', stunden: 0 },
        { datum: '2026-04-26', anwesenheit: 'Wochenende', ort: '', eintrag: '', stunden: 0 },
      ]
    },
    {
      id: 104,
      azubiId: 1,
      kw: 16, year: 2025,
      startDate: '2025-04-14', endDate: '2025-04-20',
      status: 'genehmigt',
      gesamtstunden: 40,
      kommentare: [],
      tage: []
    }
  ],

  /* ── Benachrichtigungen ──
     Pro User eine Liste mit gelesen/ungelesen-Flag. Wird vom Ausbilder
     beim Genehmigen/Ablehnen einer Woche erzeugt und beim Azubi
     angezeigt (Topbar-Glocke). */
  benachrichtigungen: [],

  /* ── aktuell eingeloggter User ── */
  currentUserId: null,
};

/* ── Datenbank-Zugriff ── */
const DB = {
  _data: null,

  load() {
    let stored = null;
    try {
      const raw = localStorage.getItem(DB_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch { /* gleich Re-Seed */ }

    // Wenn keine Daten ODER veraltetes Schema → komplett neu seeden.
    // Verhindert, dass alte Demo-Identitäten (z.B. "Florian Kuniß")
    // den Login der neuen Demo-User blockieren. Wenn die App produktiv
    // genutzt wird, sollten User-Daten serverseitig gehalten werden —
    // localStorage ist hier nur Mock-Persistenz.
    const storedVersion = stored && typeof stored.schemaVersion === 'number'
      ? stored.schemaVersion
      : 0;
    if (!stored || storedVersion < SCHEMA_VERSION) {
      this._data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      this._data.schemaVersion = SCHEMA_VERSION;
      try { localStorage.setItem(DB_KEY, JSON.stringify(this._data)); } catch {}
      return this._data;
    }
    this._data = stored;

    // Zusatz-Migrationen für Daten innerhalb derselben Schema-Version
    // (neue optionale Felder, fehlende Hilfslisten etc.).
    if (!Array.isArray(this._data.users)) this._data.users = [];
    DEFAULT_DATA.users.forEach(def => {
      const existing = this._data.users.find(u => u.id === def.id);
      if (!existing) {
        this._data.users.push({ ...def });
      } else if (existing.berichtTyp === undefined && def.berichtTyp) {
        existing.berichtTyp = def.berichtTyp;
      }
    });
    if (!Array.isArray(this._data.benachrichtigungen)) {
      this._data.benachrichtigungen = [];
    }
    return this._data;
  },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this._data));
  },

  reset() {
    this._data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    this._data.schemaVersion = SCHEMA_VERSION;
    this.save();
  },

  get data() {
    if (!this._data) this.load();
    return this._data;
  },

  /* Nutzer */
  getUser(id) {
    return this.data.users.find(u => u.id === id) || null;
  },
  getUserByEmail(email) {
    return this.data.users.find(u => u.email === email) || null;
  },
  getCurrentUser() {
    if (!this.data.currentUserId) return null;
    return this.getUser(this.data.currentUserId);
  },
  getAzubis() {
    return this.data.users.filter(u => u.role === 'azubi');
  },
  getAusbilder() {
    return this.data.users.filter(u => u.role === 'ausbilder');
  },
  login(email, password) {
    const user = this.getUserByEmail(email);
    if (!user || user.password !== password) return null;
    this.data.currentUserId = user.id;
    this.save();
    return user;
  },
  logout() {
    this.data.currentUserId = null;
    this.save();
  },

  /* Zuweisungen */
  getZuweisungenFuerAzubi(azubiId) {
    return this.data.zuweisungen.filter(z => z.azubiId === azubiId);
  },
  getZuweisungenFuerAusbilder(ausbilderId) {
    return this.data.zuweisungen.filter(z => z.ausbilderId === ausbilderId);
  },
  getAktuellerAusbilder(azubiId) {
    const heute = new Date().toISOString().split('T')[0];
    return this.data.zuweisungen.find(
      z => z.azubiId === azubiId && z.von <= heute && z.bis >= heute
    ) || null;
  },
  addZuweisung(zuweisung) {
    const id = Math.max(0, ...this.data.zuweisungen.map(z => z.id)) + 1;
    this.data.zuweisungen.push({ id, ...zuweisung });
    this.save();
    return id;
  },
  deleteZuweisung(id) {
    this.data.zuweisungen = this.data.zuweisungen.filter(z => z.id !== id);
    this.save();
  },
  setBerichtTyp(userId, typ) {
    const u = this.getUser(userId);
    if (u) { u.berichtTyp = typ; this.save(); }
  },

  /* Wochen */
  getWoche(azubiId, kw, year) {
    return this.data.wochen.find(w => w.azubiId === azubiId && w.kw === kw && w.year === year) || null;
  },
  getWochenFuerAzubi(azubiId) {
    return this.data.wochen.filter(w => w.azubiId === azubiId);
  },
  saveWoche(woche) {
    const idx = this.data.wochen.findIndex(
      w => w.azubiId === woche.azubiId && w.kw === woche.kw && w.year === woche.year
    );
    if (idx >= 0) {
      this.data.wochen[idx] = { ...this.data.wochen[idx], ...woche };
    } else {
      const id = Math.max(0, ...this.data.wochen.map(w => w.id)) + 1;
      this.data.wochen.push({ id, ...woche });
    }
    this.save();
  },
  addKommentar(wocheId, kommentar) {
    const woche = this.data.wochen.find(w => w.id === wocheId);
    if (!woche) return;
    const id = Math.max(0, ...(woche.kommentare || []).map(k => k.id)) + 1;
    if (!woche.kommentare) woche.kommentare = [];
    woche.kommentare.push({ id, ...kommentar });
    this.save();
  },
  setWocheStatus(wocheId, status) {
    const woche = this.data.wochen.find(w => w.id === wocheId);
    if (woche) { woche.status = status; this.save(); }
  },

  /* Benachrichtigungen
     Schema:
       { id, userId, type: 'genehmigt'|'abgelehnt', wocheId, azubiId,
         kw, year, fromUserId, timestamp, gelesen } */
  getBenachrichtigungenFuerUser(userId) {
    return (this.data.benachrichtigungen || [])
      .filter(b => b.userId === userId)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  },
  getUngeleseneBenachrichtigungenCount(userId) {
    return (this.data.benachrichtigungen || [])
      .filter(b => b.userId === userId && !b.gelesen).length;
  },
  addBenachrichtigung(notif) {
    if (!Array.isArray(this.data.benachrichtigungen)) this.data.benachrichtigungen = [];
    const id = Math.max(0, ...this.data.benachrichtigungen.map(b => b.id || 0)) + 1;
    this.data.benachrichtigungen.push({
      id,
      timestamp: Date.now(),
      gelesen: false,
      ...notif,
    });
    this.save();
    return id;
  },
  markBenachrichtigungGelesen(id) {
    const b = (this.data.benachrichtigungen || []).find(b => b.id === id);
    if (b && !b.gelesen) { b.gelesen = true; this.save(); }
  },
  markAlleBenachrichtigungenGelesen(userId) {
    let changed = false;
    (this.data.benachrichtigungen || []).forEach(b => {
      if (b.userId === userId && !b.gelesen) { b.gelesen = true; changed = true; }
    });
    if (changed) this.save();
  },
};

/* ── Datum-Hilfsfunktionen ── */
const DateUtil = {
  getKW(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  },

  getKWYear(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    return d.getUTCFullYear();
  },

  getMondayOfKW(kw, year) {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - jan4Day + 1 + (kw - 1) * 7);
    return monday;
  },

  formatDate(dateStr, opts = {}) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', ...opts });
  },

  formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  },

  isToday(dateStr) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return dateStr === today;
  },

  isWeekend(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  },

  toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  WEEKDAYS: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  MONTHS: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
           'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  MONTHS_SHORT: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
};

/* Globale Initialisierung */
DB.load();
