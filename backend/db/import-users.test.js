'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsersCsv } = require('./import-users');

test('parseUsersCsv liest Zeilen in Objekte', () => {
  const csv = 'oid,email,name,role,beruf,beginn,ende,berichtTyp\n' +
              '43ccffad,florian.kuniss@pm.com,Kuniß Florian,azubi,Mechatroniker,2024-09-01,2027-08-31,wöchentlich';
  const rows = parseUsersCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].oid, '43ccffad');
  assert.equal(rows[0].role, 'azubi');
  assert.equal(rows[0].berichtTyp, 'wöchentlich');
});

test('parseUsersCsv ignoriert Leerzeilen und trimmt', () => {
  const csv = 'oid,email,name,role\n a1 , x@pm.com , Max , azubi \n\n';
  const rows = parseUsersCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].oid, 'a1');
  assert.equal(rows[0].name, 'Max');
});
