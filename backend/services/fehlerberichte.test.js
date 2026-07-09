'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fehlerberichte.js');

test('berechneFingerprint: gleiche Eingabe → gleicher Hash', () => {
  const a = F.berechneFingerprint({ quelle: 'frontend', nachricht: 'Boom', stack: 'at x.js:1\nat y.js:2' });
  const b = F.berechneFingerprint({ quelle: 'frontend', nachricht: 'Boom', stack: 'at x.js:1\nat y.js:2' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('berechneFingerprint: andere Quelle → anderer Hash', () => {
  const a = F.berechneFingerprint({ quelle: 'frontend', nachricht: 'Boom', stack: '' });
  const b = F.berechneFingerprint({ quelle: 'backend',  nachricht: 'Boom', stack: '' });
  assert.notEqual(a, b);
});

test('berechneFingerprint: ignoriert Stack unterhalb der ersten 3 Zeilen', () => {
  const a = F.berechneFingerprint({ quelle: 'backend', nachricht: 'E', stack: 'l1\nl2\nl3\nl4-anders' });
  const b = F.berechneFingerprint({ quelle: 'backend', nachricht: 'E', stack: 'l1\nl2\nl3\nl4-abweichend' });
  assert.equal(a, b);
});

test('berechneFingerprint: fehlender Stack ist erlaubt', () => {
  const a = F.berechneFingerprint({ quelle: 'manual', nachricht: 'Text', stack: undefined });
  assert.match(a, /^[0-9a-f]{64}$/);
});

// ── bewerteSchwere ─────────────────────────────────────────────
test('bewerteSchwere: manual → mittel', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'manual', nachricht: 'kaputt', kontext: null }), 'mittel');
});
test('bewerteSchwere: uncaught/unhandled/auth → hoch', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[uncaughtException] x' }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[unhandledRejection] x' }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[unhandled] x' }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[auth] requireAuth: x' }), 'hoch');
});
test('bewerteSchwere: Schreibmethoden → hoch, GET → mittel', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[wochen] patch: x', kontext: { methode: 'PATCH' } }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'frontend', nachricht: 'apiFetch /wochen: x', kontext: { methode: 'POST' } }), 'hoch');
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: '[users] list: x', kontext: { methode: 'GET' } }), 'mittel');
});
test('bewerteSchwere: Fallbacks — backend ohne Methode mittel, Frontend-JS gering', () => {
  assert.equal(F.bewerteSchwere({ quelle: 'backend', nachricht: 'x', kontext: {} }), 'mittel');
  assert.equal(F.bewerteSchwere({ quelle: 'frontend', nachricht: 'TypeError: y is null', kontext: { url: 'u' } }), 'gering');
});
