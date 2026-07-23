/* ===================================================================
   API.JS – Backend-Anbindung (ersetzt data.js)
   Alle DB.*-Methoden sind async. Normalisierung DB→Frontend hier.
   =================================================================== */

// Live Server (Port 5500) braucht absoluten Pfad, da Frontend und Backend
// auf verschiedenen Ports laufen. WICHTIG: denselben Hostnamen wie die Seite
// verwenden – "localhost" und "127.0.0.1" sind für Cookies verschiedene Hosts
// (cross-site), dann würde das Session-Cookie (SameSite=Lax) nicht
// mitgeschickt und der Login scheitert. Gleicher Host (z.B. 127.0.0.1:5500 →
// 127.0.0.1:3000) ist same-site → Cookie wird gesendet.
const API_BASE = (window.location.port === '5500')
  ? `http://${window.location.hostname}:3000/api`
  : '/api';

/* ── HTTP-Hilfsfunktionen ─────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  // Timeout via AbortController: eine hängende Anfrage darf NICHT die ganze Seite
  // blockieren (sonst „lädt unendlich"). Nach Ablauf bricht der fetch ab -> Fehler,
  // den der Aufrufer behandeln kann (z. B. requireAuth -> zurück zum Login).
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options.timeout || 15000);
  try {
    const res = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Zeitüberschreitung – der Server hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
window.apiFetch = apiFetch;

/* Multipart-Upload (Datei-Anhänge). apiFetch serialisiert immer zu JSON und
   ist daher ungeeignet – hier wird FormData gesendet und KEIN Content-Type
   gesetzt, damit der Browser die multipart-Boundary selbst bestimmt. */
async function apiUpload(path, formData) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/* ── Gemeinsame Helfer für alle Seiten-Skripte ────────────────── */
/* Zentrales HTML-Escaping (api.js wird auf jeder Seite als erstes Skript
   geladen). Escapt auch Quotes, damit die Ausgabe in Attribut-Kontexten
   sicher ist. beurteilung-core.js und ihk-parser.js behalten bewusst
   eigene Kopien (Node-testbar, dürfen nicht von api.js abhängen). */
window.escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Anzeige-Name: Entra liefert "Nachname, Vorname" – hier zu "Vorname Nachname"
// drehen. Idempotent für Namen ohne Komma (bereits "Vorname Nachname").
window.displayName = raw => {
  const n = String(raw ?? '').trim();
  if (!n.includes(',')) return n;
  const [last, first] = n.split(',');
  return `${first.trim()} ${last.trim()}`.trim();
};

// Initialen aus dem Anzeige-Namen: Vorname- + Nachname-Initiale, z. B. "FK".
window.getInitials = name => {
  const parts = displayName(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

// Avatar-Innenleben (Initialen + optionales Echtfoto): kein JS-State nötig –
// hat der User kein per Entra-Sync hinterlegtes Foto (404) oder schlägt das
// Laden fehl, entfernt sich das <img> per onerror selbst und die darunter
// liegenden Initialen werden sichtbar (Layering per CSS, siehe .avatar img).
function avatarInnerHTML(user) {
  const initials = (user && (user.initials || getInitials(user.name))) || '?';
  const oid = user && (user.oid || user.id);
  if (!oid) return initials;
  return `${initials}<img src="/api/users/${oid}/photo" alt="" loading="lazy" onerror="this.remove()">`;
}

// Fertiges Avatar-Markup, z.B. renderAvatar(user, 'avatar--sm').
window.renderAvatar = (user, extraClass = '') => {
  const cls = `avatar${extraClass ? ' ' + extraClass : ''}`;
  return `<span class="${cls}">${avatarInnerHTML(user)}</span>`;
};

// Für bestehende, statische Avatar-Elemente im HTML (Sidebar/Topbar/Profil-Header).
window.applyAvatar = (el, user) => {
  if (el) el.innerHTML = avatarInnerHTML(user);
};

/* ── Normalisierung: DB PascalCase → Frontend camelCase ───────── */
function toDateStr(val) {
  if (!val) return '';
  return String(val).split('T')[0];
}

function normalizeUser(oid, u) {
  const initials = u.initials || getInitials(u.name);
  const berichtTyp = u.berichtTyp || 'wöchentlich';
  return { ...u, id: oid, oid, initials, berichtTyp };
}

function normalizeTag(t) {
  return {
    id: t.Id,
    wocheId: t.WocheId,
    datum: toDateStr(t.Datum),
    anwesenheit: t.Anwesenheit ?? '',
    ort: t.Ort ?? '',
    eintrag: t.Eintrag ?? '',
    tagdauer: (t.Tagdauer === 'halbtag' ? 'halbtag' : 'ganztag'),
    betriebEintrag:      t.BetriebEintrag      ?? '',
    schuleEintrag:       t.SchuleEintrag       ?? '',
    unterweisungEintrag: t.UnterweisungEintrag ?? '',
  };
}

function normalizeKommentar(k) {
  return {
    id: k.Id,
    wocheId: k.WocheId,
    userId: k.UserOid,
    text: k.Text,
    datum: toDateStr(k.Datum),
    typ: k.Typ,
    tagId: k.TagId ?? null,
  };
}

function normalizeWoche(w) {
  return {
    id: w.Id,
    azubiId: w.AzubiOid,
    kw: w.KW,
    year: w.Jahr,
    startDate: toDateStr(w.StartDatum),
    endDate: toDateStr(w.EndDatum),
    status: w.Status,
    endabnahmeDirekt: !!w.EndabnahmeDirekt,
    viewerRolle: w.viewerRolle ?? null,
    erlaubteAktionen: Array.isArray(w.erlaubteAktionen) ? w.erlaubteAktionen : [],
    gesamtstunden: w.Gesamtstunden,
    typ: w.Typ ?? null,
    wochenOrt: w.WochenOrt ?? null,
    unterweisungAktiv: !!w.UnterweisungAktiv,
    betriebEintrag:      w.BetriebEintrag      ?? '',
    schuleEintrag:       w.SchuleEintrag       ?? '',
    unterweisungEintrag: w.UnterweisungEintrag ?? '',
    // Korrektur-Attribution (für den elektronischen Bestätigungsblock im Export).
    // Kommt über SELECT w.* bereits aus dem Backend, hier nur durchgereicht.
    korrigiertVon: w.KorrigiertVon ?? null,
    korrigiertAm:  toDateStr(w.KorrigiertAm),
    tage: (w.tage || []).map(normalizeTag),
    kommentare: (w.kommentare || []).map(normalizeKommentar),
  };
}

function normalizeZuweisung(z) {
  const email = z.VerantwEmail ?? '';
  // Defensiv: falls abteilungen-helpers.js auf einer Seite fehlt, nicht crashen.
  const dn = (typeof deriveName === 'function') ? deriveName : (e) => e;
  return {
    id: z.Id,
    azubiId: z.AzubiOid,
    verantwEmail: email,
    verantwName: email ? dn(email) : '',
    abteilung: z.Abteilung ?? '',
    von: toDateStr(z.Von),
    bis: toDateStr(z.Bis),
    // Aus dem JOIN in GET /api/zuweisungen (optional – bei Einzelabruf leer).
    azubiName: z.AzubiName ?? '',
    azubiBeruf: z.AzubiBeruf ?? '',
  };
}

function normalizeAnhang(a) {
  return {
    id: a.Id,
    wocheId: a.WocheId,
    dateiname: a.Dateiname,
    mimeTyp: a.MimeTyp ?? '',
    groesseBytes: a.GroesseBytes ?? 0,
    hochgeladenVon: a.HochgeladenVon,
    hochgeladenAm: a.HochgeladenAm ?? null,
  };
}

function normalizeBenachrichtigung(b) {
  return {
    id: b.Id,
    userId: b.UserOid,
    type: b.Typ,
    wocheId: b.WocheId,
    zuweisungId: b.ZuweisungId ?? null,
    kw: b.KW,
    year: b.Jahr,
    azubiId: b.AzubiOid,
    fromUserId: b.FromUserOid,
    timestamp: b.Timestamp ? new Date(b.Timestamp).getTime() : null,
    gelesen: !!b.Gelesen,
  };
}

function normalizeBeurteilung(b) {
  if (!b) return null;
  return {
    id: b.Id,
    zuweisungId: b.ZuweisungId,
    azubiId: b.AzubiOid,
    status: b.Status,
    individuelleBeurteilung: b.IndividuelleBeurteilung ?? '',
    gesamtPunkte: b.GesamtPunkte != null ? Number(b.GesamtPunkte) : null,
    note: b.Note != null ? Number(b.Note) : null,
    gespraechAm: toDateStr(b.GespraechAm),
    beurteiltVon: b.BeurteiltVon ?? null,
    abgeschlossenAm: b.AbgeschlossenAm ?? null,
    kenntnisnahmeVon: b.KenntnisnahmeVon ?? null,
    kenntnisnahmeAm: b.KenntnisnahmeAm ?? null,
    korrigiertVon: b.KorrigiertVon ?? null,
    korrigiertAm: b.KorrigiertAm ?? null,
    kriterien: (b.kriterien || []).map(k => ({ kriteriumKey: k.kriteriumKey, punkte: k.punkte })),
  };
}

/* ── Aktuell eingeloggter User (nach initPage gesetzt) ────────── */
let _currentUser = null;

/* Rollen-Cache: schreibt die Rolle in localStorage UND spiegelt sie auf
   <html data-role="…">. theme.js liest dieselbe Quelle synchron beim
   nächsten Page-Load und kann damit rollen-spezifische Nav-Items schon
   vor dem ersten Paint korrekt ein-/ausblenden – verhindert den Flash,
   bei dem „Verwaltung" für Azubis kurz sichtbar wird. */
function cacheUserRole(role) {
  try {
    if (role) {
      localStorage.setItem('userRole', role);
      document.documentElement.setAttribute('data-role', role);
    } else {
      localStorage.removeItem('userRole');
      document.documentElement.removeAttribute('data-role');
      // Fähigkeits-Cache mitleeren (Logout / fehlgeschlagene Auth), damit beim
      // nächsten Login kein veraltetes Gating pre-paint durchschlägt.
      ['capKannPlanen', 'capIstAusbilder', 'capIstAzubi', 'capKorrektur'].forEach(k => localStorage.removeItem(k));
      ['data-kann-planen', 'data-ist-ausbilder', 'data-ist-azubi', 'data-korrektur'].forEach(a => document.documentElement.removeAttribute(a));
    }
  } catch (e) { /* localStorage kann in Privacy-Modi blockieren */ }
}

/* ── DateUtil ─────────────────────────────────────────────────── */
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

/* localStorage-Schlüssel der Nutzer-Einstellung „Automatisches Ausfüllen
   vorschlagen" (Aktivitäts-Autocomplete in der Wochenansicht). Gemeinsam
   genutzt von profil.js (Schalter) und wochenansicht.js (Auswertung), damit
   der Key nicht auseinanderdriftet. Fehlt der Wert → Feature AN (Default). */
const ACTIVITY_SUGGESTIONS_KEY = 'pmActivitySuggestions';

/* localStorage-Schlüssel der Nutzer-Einstellung „Unterweisung standardmäßig
   aktiv": bei '1' starten NEUE (noch nicht gespeicherte) Wochen mit angehakter
   „mit Unterweisung"-Option. Gemeinsam genutzt von profil.js (Schalter) und
   wochenansicht.js (Auswertung). Fehlt der Wert → AUS (Default). */
const UNTERWEISUNG_DEFAULT_KEY = 'pmUnterweisungDefault';

/* ── DB-Objekt (async, gleiche Schnittstelle wie data.js) ─────── */
const DB = {

  /* Auth */
  getCurrentUser() {
    return _currentUser;
  },

  async fetchCurrentUser() {
    try {
      const data = await apiFetch('/auth/me');
      _currentUser = normalizeUser(data.user.oid, data.user);
      cacheUserRole(_currentUser.role);
      return _currentUser;
    } catch {
      _currentUser = null;
      cacheUserRole(null);
      return null;
    }
  },

  async login(email) {
    const data = await apiFetch('/auth/login-by-email', {
      method: 'POST',
      body: { email: email.trim().toLowerCase() },
    });
    _currentUser = normalizeUser(data.user.oid, data.user);
    cacheUserRole(_currentUser.role);
    return _currentUser;
  },

  async logout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    _currentUser = null;
    cacheUserRole(null);
  },

  // Dev-View-Switch (nur für berechtigte Nutzer, serverseitig geprüft).
  async setDevView(on) {
    return await apiFetch('/auth/dev-view', { method: 'POST', body: { on: !!on } });
  },

  /* Benutzer */
  async getAzubis() {
    const data = await apiFetch('/users?role=azubi');
    return data.map(u => normalizeUser(u.oid, u));
  },

  // DH-Studenten (eigene Rolle, führen kein Berichtsheft). Aktuell nur vom
  // Abteilungs-Planer genutzt, der Azubis + DH-Studenten gemischt plant.
  async getDhStudenten() {
    const data = await apiFetch('/users?role=dhstudent');
    return data.map(u => normalizeUser(u.oid, u));
  },

  async getAusbilder() {
    const data = await apiFetch('/users?role=pruefer');
    return data.map(u => normalizeUser(u.oid, u));
  },

  // Verantwortliche/r einer Zuweisung = jeder Nicht-Azubi-Nutzer (Ausbilder,
  // Personalabteilung, Abteilungs-Verantwortliche …), nicht nur Ausbilder.
  async getVerantwortliche() {
    const data = await apiFetch('/users?exclRole=azubi');
    return data.map(u => normalizeUser(u.oid, u));
  },

  async getUser(oid) {
    if (!oid) return null;
    try {
      const data = await apiFetch(`/users/${oid}`);
      return normalizeUser(data.oid, data);
    } catch {
      return null;
    }
  },

  async getAllUsers() {
    const data = await apiFetch('/users');
    return data.map(u => normalizeUser(u.oid, u));
  },

  async updateUser(oid, fields) {
    const data = await apiFetch(`/users/${oid}`, { method: 'PATCH', body: fields });
    return normalizeUser(data.oid, data);
  },

  async getAusbilderFuerAzubi(oid) {
    return await apiFetch(`/users/${oid}/ausbilder`);
  },
  async setAusbilderFuerAzubi(oid, ausbilderOids) {
    await apiFetch(`/users/${oid}/ausbilder`, { method: 'PUT', body: { ausbilderOids } });
  },

  async runEntraSync() {
    // Langläufer (Fotos + Ausbilder-Zuordnung über Graph für alle aktiven
    // Nutzer): der generische 15s-Timeout von apiFetch reicht dafür nicht.
    return await apiFetch('/sync/entra', { method: 'POST', timeout: 120000 });
  },

  /* Zuweisungen */
  async getAllZuweisungen() {
    const data = await apiFetch('/zuweisungen');
    return data.map(normalizeZuweisung);
  },

  async getZuweisungenFuerAzubi(azubiId) {
    const data = await apiFetch(`/zuweisungen?azubiOid=${azubiId}`);
    return data.map(normalizeZuweisung);
  },

  async getZuweisung(id) {
    const data = await apiFetch(`/zuweisungen/${encodeURIComponent(id)}`);
    return normalizeZuweisung(data);
  },

  async getZuweisungenFuerVerantw(email) {
    const data = await apiFetch(`/zuweisungen?verantwEmail=${encodeURIComponent(email)}`);
    return data.map(normalizeZuweisung);
  },

  // Für rein befristete Prüfer: die eigenen aktuell zugreifbaren Zuweisungen
  // (inkl. 6-Wochen-Nachlauf), je Azubi nur die aktuellste. Speist das
  // Prüfer-Dashboard und die Wochenansicht-Fenstergrenzen.
  async getMeinePruefungen() {
    return await apiFetch('/zuweisungen/meine-pruefungen');
  },

  async getMeinePruefungenKommend() {
    return await apiFetch('/zuweisungen/meine-pruefungen-kommend');
  },

  async getAktuellerAusbilder(azubiId) {
    const zuweisungen = await this.getZuweisungenFuerAzubi(azubiId);
    const heute = new Date().toISOString().split('T')[0];
    return zuweisungen.find(z => z.von <= heute && z.bis >= heute) || null;
  },

  // Azubis, für die der aktuelle Nutzer Verantwortliche/r ist (aktuelle ODER
  // frühere Zuweisungen). Quelle für den Azubi-Selektor der Wochenansicht –
  // ersetzt das frühere "alle Azubis". Aktuelle Zuweisungen zuerst.
  async getBetreuteAzubis() {
    const me = this.getCurrentUser();
    if (!me) return [];
    const heute = new Date().toISOString().split('T')[0];
    // (1) Befristete Zuweisungen (Verantwortliche/r per E-Mail, aktuelle zuerst).
    const zuw = await this.getZuweisungenFuerVerantw(me.email);
    zuw.sort((a, b) => {
      const aAktiv = a.von <= heute && a.bis >= heute;
      const bAktiv = b.von <= heute && b.bis >= heute;
      if (aAktiv !== bAktiv) return aAktiv ? -1 : 1;
      return (b.von || '').localeCompare(a.von || '');
    });
    const ids = [...new Set(zuw.map(z => z.azubiId))];
    const byId = new Map();
    for (const u of (await Promise.all(ids.map(id => this.getUser(id)))).filter(Boolean)) {
      byId.set(u.oid, u);
    }
    // (2) Dauerhafte Ausbilder-Zuordnung (AusbilderAzubis, OID-basiert). Robust,
    // unabhängig von der verantwEmail der Zuweisungen – deckt u.a. .demo-Accounts
    // ab, deren namensabgeleitete Zuweisungs-Mail nie zur Login-Mail passt.
    for (const u of await this.getDauerhafteAzubis()) {
      if (!byId.has(u.oid)) byId.set(u.oid, u);
    }
    return [...byId.values()];
  },

  // Dauerhaft zugeordnete Azubis des aktuellen Nutzers (AusbilderAzubis,
  // OID-basiert). Gemeinsame Quelle für getBetreuteAzubis (Selektoren) und das
  // Ausbilder-Dashboard. Fehlt der Endpoint (altes Backend) → leere Liste.
  async getDauerhafteAzubis() {
    try {
      const data = await apiFetch('/users/me/azubis');
      return data.map(u => normalizeUser(u.oid, u));
    } catch (e) { return []; }
  },

  // Azubi-Quelle für die Selektoren (Wochen-/Jahresansicht) – EINE gemeinsame,
  // rollenbewusste Logik, damit beide Ansichten konsistent sind:
  //   admin/developer → alle Azubis (Gesamtüberblick),
  //   sonst (prüfer/ausbilder) → nur zugewiesene (betreute) Azubis.
  async getSelectableAzubis() {
    const me = this.getCurrentUser();
    if (me && (me.role === 'admin' || me.role === 'developer')) {
      return await this.getAzubis();
    }
    return await this.getBetreuteAzubis();
  },

  async addZuweisung(zuweisung) {
    const data = await apiFetch('/zuweisungen', { method: 'POST', body: {
      azubiOid:     zuweisung.azubiId,
      verantwEmail: zuweisung.verantwEmail,
      abteilung:    zuweisung.abteilung,
      von:          zuweisung.von,
      bis:          zuweisung.bis,
    }});
    return data.id;
  },

  async updateZuweisung(id, fields) {
    await apiFetch(`/zuweisungen/${id}`, { method: 'PATCH', body: fields });
  },

  async deleteZuweisung(id) {
    await apiFetch(`/zuweisungen/${id}`, { method: 'DELETE' });
  },

  /* Vertretungen (Self-Service-Delegation) – meine vergebenen + erhaltenen */
  async getVertretungen() {
    try { return await apiFetch('/vertretungen'); }
    catch (e) { return []; }
  },
  async addVertretung({ vertreterOid, von, bis }) {
    return await apiFetch('/vertretungen', { method: 'POST', body: {
      vertreterOid, von: von || null, bis: bis || null,
    }});
  },
  async deleteVertretung(id) {
    await apiFetch(`/vertretungen/${id}`, { method: 'DELETE' });
  },

  /* Abteilungs-Katalog */
  async getAbteilungen({ all = false } = {}) {
    return await apiFetch(`/abteilungen${all ? '?all=1' : ''}`);
  },
  async createAbteilung(fields) { return await apiFetch('/abteilungen', { method: 'POST', body: fields }); },
  async updateAbteilung(id, fields) { return await apiFetch(`/abteilungen/${id}`, { method: 'PATCH', body: fields }); },
  async deleteAbteilung(id) { await apiFetch(`/abteilungen/${id}`, { method: 'DELETE' }); },
  async addVerantwortliche(abteilungId, email) {
    return await apiFetch(`/abteilungen/${abteilungId}/verantwortliche`, { method: 'POST', body: { email } });
  },
  async removeVerantwortliche(abteilungId, verantwId) {
    await apiFetch(`/abteilungen/${abteilungId}/verantwortliche/${verantwId}`, { method: 'DELETE' });
  },

  /* API-Schlüssel (MCP-Zugriff, developer-only) */
  async getApiKeys() { return await apiFetch('/apikeys'); },
  async createApiKey(userOid, label) {
    // Antwort enthält den Klartext-Key EINMALIG ({ id, key }).
    return await apiFetch('/apikeys', { method: 'POST', body: { userOid, label } });
  },
  async setApiKeyAktiv(id, aktiv) { await apiFetch(`/apikeys/${id}`, { method: 'PATCH', body: { aktiv } }); },
  async deleteApiKey(id) { await apiFetch(`/apikeys/${id}`, { method: 'DELETE' }); },

  /* Wochen */
  async getWochenFuerAzubi(azubiId) {
    const data = await apiFetch(`/wochen?azubiOid=${azubiId}`);
    return data.map(normalizeWoche);
  },

  async getWoche(azubiId, kw, year) {
    const wochen = await this.getWochenFuerAzubi(azubiId);
    return wochen.find(w => w.kw === kw && w.year === year) || null;
  },

  async saveWoche(woche) {
    await apiFetch('/wochen', { method: 'POST', body: {
      azubiOid:            woche.azubiId,
      kw:                  woche.kw,
      jahr:                woche.year,
      startDatum:          woche.startDate,
      endDatum:            woche.endDate,
      status:              woche.status,
      gesamtstunden:       woche.gesamtstunden,
      tage:                woche.tage,
      typ:                 woche.typ           || null,
      wochenOrt:           woche.wochenOrt     || null,
      unterweisungAktiv:   woche.unterweisungAktiv   || false,
      betriebEintrag:      woche.betriebEintrag      || null,
      schuleEintrag:       woche.schuleEintrag       || null,
      unterweisungEintrag: woche.unterweisungEintrag || null,
    }});
  },

  async setWocheStatus(wocheId, status) {
    await apiFetch(`/wochen/${wocheId}/status`, { method: 'PATCH', body: { status } });
  },

  /* ── Zeitnachweis-Import (ESS) ──
     Spiegelt die Logik aus data.js, aber async gegen das Backend.

     getTagInfoSync: Bearbeitungs-Status eines einzelnen Tages für die
     Import-Vorschau – gehört der Tag zu einer schreibgeschützten Woche
     (freigegeben/genehmigt) und ist er bereits inhaltlich belegt?
     `wochen` kann vorab geladen übergeben werden, damit die Vorschau
     nicht pro Zeile erneut das Backend abfragt. */
  getTagInfoSync(wochen, datum) {
    const d  = new Date(datum + 'T00:00:00');
    const kw = DateUtil.getKW(d);
    const yr = DateUtil.getKWYear(d);
    const woche = wochen.find(w => w.kw === kw && w.year === yr) || null;
    const readonly = !!woche && (woche.status === 'freigegeben' || woche.status === 'erstgenehmigt' || woche.status === 'genehmigt');
    const tag = woche?.tage?.find(t => t.datum === datum) || null;
    const belegt = !!tag
      && tag.anwesenheit && tag.anwesenheit !== '' && tag.anwesenheit !== 'Wochenende';
    return { kw, year: yr, exists: !!woche, readonly, belegt, status: woche?.status || null };
  },

  /* Übernimmt die ausgewählten Zeitnachweis-Tage ins Berichtsheft.
     - Gruppiert nach ISO-Kalenderwoche, legt fehlende Wochen an.
     - Schreibgeschützte Wochen (freigegeben/genehmigt) werden übersprungen
       (vom Ausbilder abgenommen → unveränderlich).
     - Setzt NUR anwesenheit/ort/stunden; alle Texteinträge (eintrag,
       betriebEintrag, schuleEintrag, unterweisungEintrag) bleiben erhalten.
       Wichtig, weil das Backend beim Speichern alle Tage einer Woche neu
       schreibt – wir geben deshalb die vollständige, gemergte Tagesliste
       zurück.
     `tage`: [{ datum, anwesenheit, ort, stunden }] (bereits gefiltert). */
  async applyZeitnachweis(azubiId, tage) {
    const summary = { uebernommen: 0, uebersprungenReadonly: 0, betroffeneWochen: [] };

    // Bestehende Wochen einmal laden (vollständige Tage inkl. Texteinträge).
    const wochen = await this.getWochenFuerAzubi(azubiId);

    // Importtage nach ISO-Woche gruppieren.
    const groups = {};
    (tage || []).forEach(t => {
      if (!t.datum) return;
      const d  = new Date(t.datum + 'T00:00:00');
      const kw = DateUtil.getKW(d);
      const yr = DateUtil.getKWYear(d);
      const key = yr + '-' + kw;
      if (!groups[key]) groups[key] = { kw, year: yr, tage: [] };
      groups[key].tage.push(t);
    });

    for (const g of Object.values(groups)) {
      let woche = wochen.find(w => w.kw === g.kw && w.year === g.year) || null;

      if (woche && (woche.status === 'freigegeben' || woche.status === 'erstgenehmigt' || woche.status === 'genehmigt')) {
        summary.uebersprungenReadonly += g.tage.length;
        continue;
      }

      if (!woche) {
        const monday = DateUtil.getMondayOfKW(g.kw, g.year);
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        woche = {
          azubiId, kw: g.kw, year: g.year,
          startDate: DateUtil.toISODate(monday),
          endDate:   DateUtil.toISODate(sunday),
          status: 'offen', gesamtstunden: 0, tage: [], kommentare: [],
        };
      }
      if (!Array.isArray(woche.tage)) woche.tage = [];

      g.tage.forEach(t => {
        let tag = woche.tage.find(x => x.datum === t.datum);
        if (!tag) {
          tag = { datum: t.datum, anwesenheit: '', ort: '', eintrag: '', tagdauer: 'ganztag' };
          woche.tage.push(tag);
        }
        // Nur Anwesenheit/Ort überschreiben – Texteinträge unangetastet.
        // Der ESS-Import kennt keine Halbtage → Anwesenheitstage sind ganztags.
        tag.anwesenheit = t.anwesenheit;
        tag.ort         = t.ort || '';
        if (t.anwesenheit === 'anwesend' && !tag.tagdauer) tag.tagdauer = 'ganztag';
        summary.uebernommen++;
      });

      await this.saveWoche(woche);
      summary.betroffeneWochen.push({ kw: g.kw, year: g.year });
    }

    return summary;
  },

  async addKommentar(wocheId, kommentar) {
    await apiFetch(`/wochen/${wocheId}/kommentare`, { method: 'POST', body: kommentar });
  },

  async deleteKommentar(kommentarId) {
    await apiFetch(`/wochen/kommentare/${kommentarId}`, { method: 'DELETE' });
  },

  /* Datei-Anhänge (Wochen-Ebene) */
  async getAnhaenge(wocheId) {
    if (!wocheId) return [];
    const data = await apiFetch(`/wochen/${wocheId}/anhaenge`);
    return data.map(normalizeAnhang);
  },

  async uploadAnhang(wocheId, file) {
    const fd = new FormData();
    fd.append('datei', file);
    return normalizeAnhang(await apiUpload(`/wochen/${wocheId}/anhaenge`, fd));
  },

  async deleteAnhang(id) {
    await apiFetch(`/wochen/anhaenge/${id}`, { method: 'DELETE' });
  },

  anhangDownloadUrl(id) {
    return `${API_BASE}/wochen/anhaenge/${id}/download`;
  },

  /* Importierte IHK-PDF serverseitig archivieren (Original-Nachweis zur
     späteren Fehlerprüfung). meta = { wochen:[{kw,year,status}], warnungen, modus }. */
  async saveIhkImportDatei(file, meta) {
    const fd = new FormData();
    fd.append('datei', file);
    if (meta) fd.append('meta', JSON.stringify(meta));
    return apiUpload('/ihk-imports', fd);
  },

  /* Fahrtgelderstattung – Stammdaten des eingeloggten Azubis */
  async getFahrtgeldKonfig() {
    return apiFetch('/fahrtgeld/konfig');
  },

  async saveFahrtgeldKonfig(konfig) {
    await apiFetch('/fahrtgeld/konfig', { method: 'PUT', body: {
      name:            konfig.name,
      persNr:          konfig.persNr,
      kst:             konfig.kst,
      vonHaltestelle:  konfig.vonHaltestelle,
      nachHaltestelle: konfig.nachHaltestelle,
      betragProTag:    konfig.betragProTag,
    }});
  },

  /* Benachrichtigungen */
  async getBenachrichtigungenFuerUser() {
    const data = await apiFetch('/benachrichtigungen');
    return data.map(normalizeBenachrichtigung);
  },

  async getUngeleseneBenachrichtigungenCount() {
    const data = await apiFetch('/benachrichtigungen/count');
    return data.ungelesen || 0;
  },

  async addBenachrichtigung(notif) {
    await apiFetch('/benachrichtigungen', { method: 'POST', body: {
      userOid:     notif.userId,
      typ:         notif.type,
      wocheId:     notif.wocheId,
      fromUserOid: notif.fromUserId,
    }});
  },

  async markBenachrichtigungGelesen(id) {
    await apiFetch(`/benachrichtigungen/${id}/gelesen`, { method: 'PATCH' });
  },

  async markAlleBenachrichtigungenGelesen() {
    await apiFetch('/benachrichtigungen/alle-gelesen', { method: 'PATCH' });
  },

  /* Beurteilungen */
  async getBeurteilung(zuweisungId) {
    const data = await apiFetch(`/beurteilungen?zuweisungId=${encodeURIComponent(zuweisungId)}`);
    return normalizeBeurteilung(data);
  },
  async getBeurteilungenFuerAzubi(azubiOid) {
    const data = await apiFetch(`/beurteilungen?azubiOid=${encodeURIComponent(azubiOid)}`);
    return data.map(b => ({
      zuweisungId: b.ZuweisungId, status: b.Status,
      note: b.Note != null ? Number(b.Note) : null,
      gesamtPunkte: b.GesamtPunkte != null ? Number(b.GesamtPunkte) : null,
      abgeschlossenAm: b.AbgeschlossenAm ?? null,
    }));
  },
  async getFaelligeBeurteilungen() {
    try { return await apiFetch('/beurteilungen/faellig'); } catch (e) { return []; }
  },
  // Flache Liste aller Zuweisungen, die der Nutzer beurteilen darf, für den
  // eigenen Beurteilungen-Reiter (nicht für Azubis).
  async getMeineBeurteilungen(azubiOid) {
    const q = azubiOid ? `?azubiOid=${encodeURIComponent(azubiOid)}` : '';
    return await apiFetch('/beurteilungen/meine' + q);
  },
  async saveBeurteilungEntwurf(payload) {
    const data = await apiFetch('/beurteilungen', { method: 'POST', body: payload });
    return data.id;
  },
  async abschliessenBeurteilung(id) {
    await apiFetch(`/beurteilungen/${id}/abschliessen`, { method: 'PATCH' });
  },
  async patchBeurteilung(id, payload) {
    await apiFetch(`/beurteilungen/${id}`, { method: 'PATCH', body: payload });
  },
  async kenntnisnahmeBeurteilung(id) {
    await apiFetch(`/beurteilungen/${id}/kenntnisnahme`, { method: 'PATCH' });
  },
};
