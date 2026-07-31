'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pfadOk, anzeigeName } = require('./ihk-imports');

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

test('anzeigeName: ohne Meta-JSON bleibt das Datum als Titel übrig', () => {
  assert.equal(anzeigeName(path.join(__dirname, 'gibt-es-nicht.pdf'),
    '2026-07-30T10-00-00-000Z_export.pdf'), '2026-07-30.pdf');
});
