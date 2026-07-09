'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// error-reporter.js exportiert die reine Dedupe-Funktion unter module.exports,
// wenn es in Node läuft (Browser: hängt sie an window). Siehe Step 3.
const { sollMelden } = require('./error-reporter.js');

test('sollMelden: erstes Vorkommen wird gemeldet', () => {
  const map = new Map();
  assert.equal(sollMelden('k1', 1000, map, 5000), true);
});

test('sollMelden: Wiederholung im Fenster wird unterdrückt', () => {
  const map = new Map();
  sollMelden('k1', 1000, map, 5000);
  assert.equal(sollMelden('k1', 2000, map, 5000), false);
});

test('sollMelden: nach Ablauf des Fensters wieder gemeldet', () => {
  const map = new Map();
  sollMelden('k1', 1000, map, 5000);
  assert.equal(sollMelden('k1', 7000, map, 5000), true);
});
