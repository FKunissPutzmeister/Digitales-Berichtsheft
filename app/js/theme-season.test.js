'use strict';
// Saison-Standard in theme.js: Halloween ist vom 19.–31.10.2026 das Standard-
// Design für Azubis/DH-Studenten/Developer, solange der Nutzer nicht selbst
// gewählt hat. theme.js läuft echt (vm) gegen ein Stub-DOM mit festem Datum.
// Wer dafür in Frage kommt, steht als themeSeasonOk='1' im localStorage
// (schreibt api.js cacheSeasonEligibility; die Rollen-Abbildung prüft der
// Browser-Durchlauf, nicht dieser Test).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, 'theme.js'), 'utf8');

// Lädt theme.js frisch (= ein Seitenaufruf) gegen einen geteilten localStorage.
function load(store, isoDate, src = SRC, hostname = 'berichtsheft.example') {
  const NOW = new Date(isoDate + 'T12:00:00').getTime();
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(NOW); }
    static now() { return NOW; }
  }
  const attrs = {};
  const html = {
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: (k) => { delete attrs[k]; },
    classList: { add() {}, remove() {}, contains: () => false },
    style: { setProperty() {} },
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, dispatchEvent() {}, location: { pathname: '/app/dashboard.html' },
  };
  window.location.hostname = hostname;
  const document = {
    documentElement: html, body: null, head: null,
    addEventListener() {}, createElement: () => ({ getContext: () => null }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  const ctx = {
    window, document, localStorage, sessionStorage: localStorage, Date: FakeDate,
    CustomEvent: function () {}, requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    performance: { now: () => 0 }, console, location: window.location,
  };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { theme: window.PMTheme, attr: () => html.getAttribute('data-theme') };
}

const IN = '2026-10-19', OUT_BEFORE = '2026-10-18', LAST = '2026-10-31', OUT_AFTER = '2026-11-01';
const azubi = () => ({ themeSeasonOk: '1' });

test('Im Fenster ist Halloween Standard für berechtigte Nutzer', () => {
  const t = load(azubi(), IN);
  assert.equal(t.attr(), 'halloween');
  assert.equal(t.theme.getCustom(), 'halloween');
});

test('Nicht berechtigte (Ausbilder/Prüfer, Admin) und unbekannte Geräte bekommen es nicht', () => {
  for (const store of [{ themeSeasonOk: '0' }, {}]) {
    assert.equal(load(store, IN).attr(), 'light', JSON.stringify(store));
  }
});

test('Zeitfenster: 19.10. und 31.10. zählen mit, 18.10. und 1.11. nicht', () => {
  assert.equal(load(azubi(), IN).attr(), 'halloween');
  assert.equal(load(azubi(), LAST).attr(), 'halloween');
  assert.equal(load(azubi(), OUT_BEFORE).attr(), 'light');
  assert.equal(load(azubi(), OUT_AFTER).attr(), 'light');
});

test('Eigene Wahl bleibt: „Standard“ im Fenster gewählt → auch nach Reload kein Halloween', () => {
  const store = azubi();
  load(store, IN).theme.setCustom(null);
  assert.equal(load(store, IN).attr(), 'light');
  assert.equal(load(store, LAST).attr(), 'light');
});

test('Sidebar-Toggle (set) und Hell/Dunkel-Wahl verlassen den Standard dauerhaft', () => {
  const a = azubi();
  load(a, IN).theme.set('dark');
  assert.equal(load(a, IN).attr(), 'light', 'set() verlässt Halloween und kehrt zum Modus zurück');
  const b = azubi();
  load(b, IN).theme.setMode('dark');
  assert.equal(load(b, IN).attr(), 'dark');
});

test('Ausdrücklich gewähltes Halloween bleibt auch nach dem Fenster; ungewähltes fällt weg', () => {
  const chosen = azubi();
  load(chosen, IN).theme.setCustom('halloween');
  assert.equal(load(chosen, OUT_AFTER).attr(), 'halloween');
  assert.equal(load(azubi(), OUT_AFTER).attr(), 'light');
});

test('Ein früher gespeichertes Custom-Design wird nicht überstimmt; ein bloßer Modus schon', () => {
  assert.equal(load({ themeSeasonOk: '1', customTheme: 'candy' }, IN).attr(), 'candy');
  assert.equal(load({ themeSeasonOk: '1', theme: 'dark' }, IN).attr(), 'halloween');
});

test('refresh(): Berechtigung erst nach /auth/me bekannt → Halloween greift nachträglich', () => {
  const store = {};
  const t = load(store, IN);
  assert.equal(t.attr(), 'light');
  store.themeSeasonOk = '1';
  t.theme.refresh();
  assert.equal(t.attr(), 'halloween');
  store.themeSeasonOk = '0';
  t.theme.refresh();
  assert.equal(t.attr(), 'light');
});

test('seasonOpen: nur Halloween, nur im Fenster', () => {
  assert.equal(load(azubi(), IN).theme.seasonOpen('halloween'), true);
  assert.equal(load(azubi(), IN).theme.seasonOpen('christmas'), false);
  assert.equal(load(azubi(), OUT_AFTER).theme.seasonOpen('halloween'), false);
});

test('Gesperrte Custom-Designs (TEMP-Schalter an) → auch kein Saison-Standard', () => {
  const locked = SRC.replace('var DISABLE_CUSTOM_THEMES_ON_LOCALHOST = false', 'var DISABLE_CUSTOM_THEMES_ON_LOCALHOST = true');
  assert.notEqual(locked, SRC, 'Schalter nicht gefunden – Test an theme.js anpassen');
  assert.equal(load(azubi(), IN, locked, 'localhost').attr(), 'light');
  assert.equal(load(azubi(), IN, locked, 'berichtsheft.example').attr(), 'halloween', 'Sperre wirkt nur auf localhost');
});

test('Stand ohne den TEMP-Schalter (Prod nimmt per Cherry-Pick nur einzelne Commits) → Standard greift trotzdem', () => {
  const prod = SRC
    .replace(/^\s*if \(CUSTOM_THEMES_LOCKED\) return( null)?;\r?\n/gm, '')
    .replace(/^\s*customDesignsLocked: CUSTOM_THEMES_LOCKED,\r?\n/m, '')
    .replace(/var CUSTOM_THEMES_LOCKED =[^;]*;/, '');
  // Übrig bleibt nur der typeof-geschützte Zugriff in seasonDefault (2 Stellen).
  assert.equal((prod.match(/CUSTOM_THEMES_LOCKED/g) || []).length, 2, 'weitere Zugriffe auf CUSTOM_THEMES_LOCKED – Test anpassen');
  assert.equal(load(azubi(), IN, prod).attr(), 'halloween');
});
