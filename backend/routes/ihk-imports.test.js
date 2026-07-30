'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pfadOk } = require('./ihk-imports');

const OID = '11111111-2222-3333-4444-555555555555';

test('pfadOk: GUID-Ordner + safeName-PDF ergeben einen Pfad im Archiv', () => {
  const p = pfadOk(OID, '2026-07-23T09-12-33-000Z_Ausbildungsnachweis.pdf');
  assert.ok(p);
  assert.equal(path.basename(path.dirname(p)), OID);
});

test('pfadOk: Traversal und Fremdtypen werden abgelehnt', () => {
  assert.equal(pfadOk('..', 'x.pdf'), null);
  assert.equal(pfadOk(OID, '../../.env.pdf'), null);        // Slash im Dateinamen
  assert.equal(pfadOk(OID, '..\\..\\server.js.pdf'), null); // Backslash ebenso
  assert.equal(pfadOk(OID, 'nachweis.pdf.json'), null);     // Meta-JSON nicht ausliefern
  assert.equal(pfadOk(OID, 'server.js'), null);
  assert.equal(pfadOk('nicht-ganz-guid', 'nachweis.pdf'), null);
});
