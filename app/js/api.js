/* ===================================================================
   API.JS – Backend-Anbindung (ersetzt data.js)
   Alle DB.*-Methoden sind async. Normalisierung DB→Frontend hier.
   =================================================================== */

const API_BASE = 'http://localhost:3000/api';

/* ── HTTP-Hilfsfunktionen ─────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

/* ── Normalisierung: DB PascalCase → Frontend camelCase ───────── */
function toDateStr(val) {
  if (!val) return '';
  return String(val).split('T')[0];
}

function normalizeUser(oid, u) {
  const initials = u.initials || (u.name || '').split(' ').map(n => n[0]).join('').toUpperCase();
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
    stunden: t.Stunden ?? 0,
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
    gesamtstunden: w.Gesamtstunden,
    typ: w.Typ ?? null,
    wochenOrt: w.WochenOrt ?? null,
    unterweisungAktiv: !!w.UnterweisungAktiv,
    betriebEintrag:      w.BetriebEintrag      ?? '',
    schuleEintrag:       w.SchuleEintrag       ?? '',
    unterweisungEintrag: w.UnterweisungEintrag ?? '',
    tage: (w.tage || []).map(normalizeTag),
    kommentare: (w.kommentare || []).map(normalizeKommentar),
  };
}

function normalizeZuweisung(z) {
  return {
    id: z.Id,
    azubiId: z.AzubiOid,
    ausbilderId: z.AusbilderOid,
    abteilung: z.Abteilung ?? '',
    von: toDateStr(z.Von),
    bis: toDateStr(z.Bis),
  };
}

function normalizeBenachrichtigung(b) {
  return {
    id: b.Id,
    userId: b.UserOid,
    type: b.Typ,
    wocheId: b.WocheId,
    kw: b.KW,
    year: b.Jahr,
    azubiId: b.AzubiOid,
    fromUserId: b.FromUserOid,
    timestamp: b.Timestamp ? new Date(b.Timestamp).getTime() : null,
    gelesen: !!b.Gelesen,
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
    }
  } catch (e) { /* localStorage kann in Privacy-Modi blockieren */ }
}

/* ── DateUtil (identisch zu data.js) ─────────────────────────── */
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

  /* Benutzer */
  async getAzubis() {
    const data = await apiFetch('/users?role=azubi');
    return data.map(u => normalizeUser(u.oid, u));
  },

  async getAusbilder() {
    const data = await apiFetch('/users?role=ausbilder');
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

  /* Zuweisungen */
  async getAllZuweisungen() {
    const data = await apiFetch('/zuweisungen');
    return data.map(normalizeZuweisung);
  },

  async getZuweisungenFuerAzubi(azubiId) {
    const data = await apiFetch(`/zuweisungen?azubiOid=${azubiId}`);
    return data.map(normalizeZuweisung);
  },

  async getZuweisungenFuerAusbilder(ausbilderId) {
    const data = await apiFetch(`/zuweisungen?ausbilderOid=${ausbilderId}`);
    return data.map(normalizeZuweisung);
  },

  async getAktuellerAusbilder(azubiId) {
    const zuweisungen = await this.getZuweisungenFuerAzubi(azubiId);
    const heute = new Date().toISOString().split('T')[0];
    return zuweisungen.find(z => z.von <= heute && z.bis >= heute) || null;
  },

  async addZuweisung(zuweisung) {
    const data = await apiFetch('/zuweisungen', { method: 'POST', body: {
      azubiOid:     zuweisung.azubiId,
      ausbilderOid: zuweisung.ausbilderId,
      abteilung:    zuweisung.abteilung,
      von:          zuweisung.von,
      bis:          zuweisung.bis,
    }});
    return data.id;
  },

  async deleteZuweisung(id) {
    await apiFetch(`/zuweisungen/${id}`, { method: 'DELETE' });
  },

  async setBerichtTyp(userId, typ) {
    localStorage.setItem(`berichtTyp_${userId}`, typ);
  },

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

  async addKommentar(wocheId, kommentar) {
    await apiFetch(`/wochen/${wocheId}/kommentare`, { method: 'POST', body: kommentar });
  },

  async deleteKommentar(kommentarId) {
    await apiFetch(`/wochen/kommentare/${kommentarId}`, { method: 'DELETE' });
  },

  /* Benachrichtigungen */
  async getBenachrichtigungenFuerUser() {
    const data = await apiFetch('/benachrichtigungen');
    return data.map(normalizeBenachrichtigung);
  },

  async getUngeleseneBenachrichtigungenCount() {
    const data = await apiFetch('/benachrichtigungen/count');
    return data.ungelesen;
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
};
