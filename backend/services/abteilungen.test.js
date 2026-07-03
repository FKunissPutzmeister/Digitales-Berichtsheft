'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveName, normalizeEmail, validateAbteilung, validateVerantwEmail } = require('./abteilungen');

test('deriveName: lokaler Teil, Punkte -> Leerzeichen, Bindestriche bleiben', () => {
  assert.equal(deriveName('ruediger.breuning@putzmeister.com'), 'Ruediger Breuning');
  assert.equal(deriveName('ann-kathrin.gehr@putzmeister.com'), 'Ann-Kathrin Gehr');
  assert.equal(deriveName('hanns-carl.riethmueller@x'), 'Hanns-Carl Riethmueller');
  assert.equal(deriveName('it@putzmeister.com'), 'It');
});

test('deriveName: leer/undefined -> leerer String', () => {
  assert.equal(deriveName(''), '');
  assert.equal(deriveName(undefined), '');
  assert.equal(deriveName(null), '');
});

test('normalizeEmail: trimmt + lowercased', () => {
  assert.equal(normalizeEmail('  Korhan.DEMIRBILEK@Putzmeister.com '), 'korhan.demirbilek@putzmeister.com');
  assert.equal(normalizeEmail(undefined), '');
});

test('validateAbteilung: Name Pflicht, <=120, IstPmm/Aktiv bool', () => {
  assert.equal(validateAbteilung({ name: 'Einkauf' }).ok, true);
  assert.equal(validateAbteilung({ name: '' }).ok, false);
  assert.equal(validateAbteilung({ name: 'x'.repeat(121) }).ok, false);
  assert.equal(validateAbteilung({ name: 'A', istPmm: 'ja' }).ok, false);
  assert.equal(validateAbteilung({}).ok, false);
});

test('validateAbteilung partial: Name optional, aber leerer Patch invalid', () => {
  assert.equal(validateAbteilung({ aktiv: false }, { partial: true }).ok, true);
  assert.equal(validateAbteilung({}, { partial: true }).ok, false);
  assert.equal(validateAbteilung({ unbekannt: 1 }, { partial: true }).ok, false);
});

test('validateVerantwEmail: nicht-leer + enthält @', () => {
  assert.equal(validateVerantwEmail('max.muster@putzmeister.com').ok, true);
  assert.equal(validateVerantwEmail('keinemail').ok, false);
  assert.equal(validateVerantwEmail('').ok, false);
});
