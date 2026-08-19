'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};                   // ihk-import.js liest window.escapeHtml beim Laden
const I = require('./ihk-import.js');

// Wochen-Ort: kommt aus den Tagen UND den Texten. Eine Woche mit Schultagen und
// sonst Urlaub hat im IHK-PDF oft keinen Schul-Text – der Ort muss trotzdem
// „Schule" sein, sonst fehlt in der Wochenansicht die Schul-Kachel.
const wocheOrt = (tage, texte = {}) => {
  const woche = { tage: [] };
  I._applyWeekly(woche, { tage, ...texte });
  return woche.wochenOrt;
};
const tag = (datum, ort, anwesenheit = 'anwesend') => ({ datum, ort, anwesenheit });

test('Schultage + Urlaub, kein Schul-Text → Ort schule', () => {
  assert.equal(wocheOrt([
    tag('2026-06-22', 'Schule'), tag('2026-06-23', 'Schule'),
    tag('2026-06-24', '', 'Urlaub'),
  ]), 'schule');
});

test('Betriebs- und Schultage → Ort betrieb_schule', () => {
  assert.equal(wocheOrt([tag('2026-06-22', 'Betrieb'), tag('2026-06-23', 'Schule')]),
    'betrieb_schule');
  assert.equal(wocheOrt([tag('2026-06-22', 'Betrieb/Schule')]), 'betrieb_schule');
});

test('nur Betriebstage → Ort betrieb', () => {
  assert.equal(wocheOrt([tag('2026-06-22', 'Betrieb')]), 'betrieb');
});

test('Schul-Text ohne Schultag zählt weiter als Schule', () => {
  assert.equal(wocheOrt([tag('2026-06-22', 'Betrieb')], { schuleText: '<p>Mathe</p>' }),
    'betrieb_schule');
});
