'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilungen.js');

test('darfBeurteilungBearbeiten: true fuer admin/developer unabhaengig von der Zuweisung', () => {
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'admin', email: 'x@y.de' }, null), true);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'developer', email: 'x@y.de' }, { verantwortlicherEmail: 'andere@y.de' }), true);
});

test('darfBeurteilungBearbeiten: true nur bei exaktem E-Mail-Match auf die Zuweisung (case-insensitiv)', () => {
  const zuw = { verantwortlicherEmail: 'Pruefer@Firma.de' };
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'pruefer@firma.de' }, zuw), true);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'andere@firma.de' }, zuw), false);
});

test('darfBeurteilungBearbeiten: false ohne Zuweisung oder ohne E-Mail', () => {
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'x@y.de' }, null), false);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: '' }, { verantwortlicherEmail: 'x@y.de' }), false);
});

test('darfBeurteilungBearbeiten: dauerhafter Ausbilder bekommt KEINE Bearbeiten-Rechte mehr', () => {
  // Regressionstest fuer den Kernpunkt dieses Umbaus: frueher gewaehrte
  // verantwortlichFuerZuweisung (via dauerAusbilderAzubiOids) hier Zugriff —
  // darfBeurteilungBearbeiten kennt diesen Pfad bewusst nicht.
  const zuw = { verantwortlicherEmail: 'zeitboxierter.pruefer@firma.de' };
  const dauerhafterAusbilder = { role: 'pruefer', email: 'dauerhafter.ausbilder@firma.de' };
  assert.equal(B.darfBeurteilungBearbeiten(dauerhafterAusbilder, zuw), false);
});
