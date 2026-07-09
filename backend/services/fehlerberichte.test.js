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
