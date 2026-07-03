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
      // Fähigkeits-Cache mitleeren (Logout / fehlgeschlagene Auth), damit beim
      // nächsten Login kein veraltetes Gating pre-paint durchschlägt.
      ['capKannPlanen', 'capIstAusbilder', 'capIstAzubi', 'capKorrektur'].forEach(k => localStorage.removeItem(k));
      ['data-kann-planen', 'data-ist-ausbilder', 'data-ist-azubi', 'data-korrektur'].forEach(a => document.documentElement.removeAttribute(a));
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

  /* Zuweisungen */
  async getAllZuweisungen() {
    const data = await apiFetch('/zuweisungen');
    return data.map(normalizeZuweisung);
  },

  async getZuweisungenFuerAzubi(azubiId) {
    const data = await apiFetch(`/zuweisungen?azubiOid=${azubiId}`);
    return data.map(normalizeZuweisung);
  },

  async getZuweisungenFuerVerantw(email) {
    const data = await apiFetch(`/zuweisungen?verantwEmail=${encodeURIComponent(email)}`);
    return data.map(normalizeZuweisung);
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
    const zuw = await this.getZuweisungenFuerVerantw(me.email);
    zuw.sort((a, b) => {
      const aAktiv = a.von <= heute && a.bis >= heute;
      const bAktiv = b.von <= heute && b.bis >= heute;
      if (aAktiv !== bAktiv) return aAktiv ? -1 : 1;
      return (b.von || '').localeCompare(a.von || '');
    });
    const ids = [...new Set(zuw.map(z => z.azubiId))];
    const users = await Promise.all(ids.map(id => this.getUser(id)));
    return users.filter(Boolean);
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

  async deleteZuweisung(id) {
    await apiFetch(`/zuweisungen/${id}`, { method: 'DELETE' });
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
    const readonly = !!woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt');
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

      if (woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt')) {
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
