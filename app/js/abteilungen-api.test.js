'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveName } = require('./abteilungen-helpers.js');

test('deriveName (frontend) spiegelt Backend-Verhalten', () => {
  assert.equal(deriveName('ruediger.breuning@putzmeister.com'), 'Ruediger Breuning');
  assert.equal(deriveName('ann-kathrin.gehr@putzmeister.com'), 'Ann-Kathrin Gehr');
  assert.equal(deriveName(''), '');
});
