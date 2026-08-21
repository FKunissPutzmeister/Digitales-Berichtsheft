'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilungen.js');

test('istDauerhafterAusbilderVon: true wenn die Oid in der Ausbilder-Liste des Azubis steckt', () => {
  const zeilen = [{ oid: 'A1', name: 'Ausbilder Eins' }, { oid: 'A2', name: 'Ausbilder Zwei' }];
  assert.equal(B.istDauerhafterAusbilderVon('A1', zeilen), true);
  assert.equal(B.istDauerhafterAusbilderVon('A2', zeilen), true);
});

test('istDauerhafterAusbilderVon: false wenn die Oid fehlt oder die Liste leer ist', () => {
  const zeilen = [{ oid: 'A1', name: 'Ausbilder Eins' }];
  assert.equal(B.istDauerhafterAusbilderVon('A3', zeilen), false);
  assert.equal(B.istDauerhafterAusbilderVon('A1', []), false);
  assert.equal(B.istDauerhafterAusbilderVon('A1', null), false);
  assert.equal(B.istDauerhafterAusbilderVon(null, zeilen), false);
});
