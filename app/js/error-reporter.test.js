'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// error-reporter.js exportiert die reine Dedupe-Funktion unter module.exports,
// wenn es in Node läuft (Browser: hängt sie an window). Siehe Step 3.
const { sollMelden, istBenignesBrowserrauschen, sollStatusMelden } = require('./error-reporter.js');

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

// ── istBenignesBrowserrauschen ─────────────────────────────────
test('istBenignesBrowserrauschen: ResizeObserver-Hinweise sind kein Bug', () => {
  assert.equal(istBenignesBrowserrauschen('ResizeObserver loop completed with undelivered notifications.'), true);
  assert.equal(istBenignesBrowserrauschen('ResizeObserver loop limit exceeded'), true);
});
test('istBenignesBrowserrauschen: echte Fehler bleiben meldepflichtig', () => {
  assert.equal(istBenignesBrowserrauschen('errBox is not defined'), false);
  assert.equal(istBenignesBrowserrauschen('Cannot read properties of null (reading \'index\')'), false);
  assert.equal(istBenignesBrowserrauschen(''), false);
  assert.equal(istBenignesBrowserrauschen(undefined), false);
});

// ── sollStatusMelden ───────────────────────────────────────────
test('sollStatusMelden: 401 und 409 sind erwartete Fachergebnisse', () => {
  assert.equal(sollStatusMelden(401), false);
  assert.equal(sollStatusMelden(409), false);
});
test('sollStatusMelden: vom Aufrufer deklarierte Status werden nicht gemeldet', () => {
  assert.equal(sollStatusMelden(403, [403, 404]), false);
  assert.equal(sollStatusMelden(404, [403, 404]), false);
  assert.equal(sollStatusMelden(500, [403, 404]), true);
});
test('sollStatusMelden: unerwartete Status und Fehler ohne Status melden', () => {
  assert.equal(sollStatusMelden(403), true);
  assert.equal(sollStatusMelden(500), true);
  assert.equal(sollStatusMelden(undefined), true);   // z. B. TypeError im Aufrufer
});
