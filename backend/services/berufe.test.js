'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./berufe.js');

test('bereichFuerBeruf: findet den Bereich case-insensitiv exakt', () => {
  const katalog = [
    { beruf: 'Industriemechaniker', bereich: 'technisch' },
    { beruf: 'Industriekaufmann/-frau', bereich: 'kaufmaennisch' },
  ];
  assert.equal(B.bereichFuerBeruf('Industriemechaniker', katalog), 'technisch');
  assert.equal(B.bereichFuerBeruf('industriemechaniker', katalog), 'technisch');
  assert.equal(B.bereichFuerBeruf('  Industriemechaniker  ', katalog), 'technisch');
});

test('bereichFuerBeruf: null ohne Katalog-Treffer, ohne Beruf oder ohne Katalog', () => {
  const katalog = [{ beruf: 'Mechatroniker', bereich: 'technisch' }];
  assert.equal(B.bereichFuerBeruf('Unbekannter Beruf', katalog), null);
  assert.equal(B.bereichFuerBeruf(null, katalog), null);
  assert.equal(B.bereichFuerBeruf('', katalog), null);
  assert.equal(B.bereichFuerBeruf('Mechatroniker', []), null);
  assert.equal(B.bereichFuerBeruf('Mechatroniker', null), null);
});

test('validateBeruf: Pflichtfelder beim Anlegen', () => {
  assert.equal(B.validateBeruf({}).ok, false);
  assert.equal(B.validateBeruf({ beruf: '', bereich: 'technisch' }).ok, false);
  assert.equal(B.validateBeruf({ beruf: 'Lackierer', bereich: 'unsinn' }).ok, false);
  assert.equal(B.validateBeruf({ beruf: 'Lackierer', bereich: 'technisch' }).ok, true);
  assert.equal(B.validateBeruf({ beruf: 'x'.repeat(201), bereich: 'technisch' }).ok, false);
});

test('validateBeruf: partial erlaubt Teilupdate', () => {
  assert.equal(B.validateBeruf({ bereich: 'kaufmaennisch' }, { partial: true }).ok, true);
  assert.equal(B.validateBeruf({ unbekannt: 1 }, { partial: true }).ok, false);
});
