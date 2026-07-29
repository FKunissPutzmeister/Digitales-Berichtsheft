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

// ── istTransienterVerbindungsfehler (Server-Guard, spiegelt error-reporter.js) ──
test('istTransienterVerbindungsfehler: erkennt transiente Muster', () => {
  assert.equal(F.istTransienterVerbindungsfehler('apiFetch /wochen: Failed to fetch'), true);
  assert.equal(F.istTransienterVerbindungsfehler('Load failed'), true);
  assert.equal(F.istTransienterVerbindungsfehler('NetworkError when attempting to fetch resource.'), true);
  assert.equal(F.istTransienterVerbindungsfehler('Network request failed'), true);
  assert.equal(F.istTransienterVerbindungsfehler('Zeitüberschreitung – der Server hat nicht rechtzeitig geantwortet.'), true);
});
test('istTransienterVerbindungsfehler: echte App-Fehler bleiben unberührt', () => {
  assert.equal(F.istTransienterVerbindungsfehler('apiFetch /wochen: Zugriff verweigert'), false);
  assert.equal(F.istTransienterVerbindungsfehler('TypeError: y is null'), false);
  assert.equal(F.istTransienterVerbindungsfehler(''), false);
  assert.equal(F.istTransienterVerbindungsfehler(null), false);
});

// ── parseUndValidiereBilder ────────────────────────────────────
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('parseUndValidiereBilder: gültiges PNG wird dekodiert', () => {
  const { gueltig, verworfen } = F.parseUndValidiereBilder([{ name: 'a.png', dataUrl: PNG_1PX }]);
  assert.equal(gueltig.length, 1);
  assert.equal(verworfen, 0);
  assert.equal(gueltig[0].mimeTyp, 'image/png');
  assert.ok(Buffer.isBuffer(gueltig[0].buffer));
  assert.ok(gueltig[0].groesse > 0);
});

test('parseUndValidiereBilder: Nicht-Array → leer', () => {
  assert.deepEqual(F.parseUndValidiereBilder(null), { gueltig: [], verworfen: 0 });
  assert.deepEqual(F.parseUndValidiereBilder(undefined), { gueltig: [], verworfen: 0 });
});

test('parseUndValidiereBilder: Nicht-Bild-DataURL wird verworfen', () => {
  const r = F.parseUndValidiereBilder([{ name: 'x.txt', dataUrl: 'data:text/plain;base64,aGk=' }]);
  assert.equal(r.gueltig.length, 0);
  assert.equal(r.verworfen, 1);
});

test('parseUndValidiereBilder: kaputte DataURL wird verworfen', () => {
  const r = F.parseUndValidiereBilder([{ name: 'x', dataUrl: 'kein-data-url' }, { }]);
  assert.equal(r.gueltig.length, 0);
  assert.equal(r.verworfen, 2);
});

test('parseUndValidiereBilder: max. 5 Bilder, Rest verworfen', () => {
  const viele = Array.from({ length: 7 }, () => ({ name: 'a.png', dataUrl: PNG_1PX }));
  const r = F.parseUndValidiereBilder(viele);
  assert.equal(r.gueltig.length, 5);
  assert.equal(r.verworfen, 2);
});
