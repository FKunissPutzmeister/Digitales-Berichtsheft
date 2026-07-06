'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsersCsv, splitCsvLine, mapEntraRow, parseArgs, toRecords } = require('./import-users');

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

test('parseUsersCsv strippt BOM und respektiert quotierte Kommas', () => {
  const csv = '﻿id,displayName,department\n' +
              'a1,"Müller, Max","Montage, Halle 3"';
  const rows = parseUsersCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'a1'); // BOM nicht am Header-Key kleben
  assert.equal(rows[0].displayName, 'Müller, Max');
  assert.equal(rows[0].department, 'Montage, Halle 3');
});

test('splitCsvLine löst verdoppelte Anführungszeichen auf', () => {
  assert.deepEqual(splitCsvLine('a,"sagt ""hallo""",b'), ['a', 'sagt "hallo"', 'b']);
});

test('mapEntraRow mappt Entra-Spalten und setzt fixe Rolle', () => {
  const row = { id: 'OID-1', displayName: 'Max Mustermann', userPrincipalName: 'Max.Mustermann@PM.com' };
  const rec = mapEntraRow(row, 'azubi');
  assert.equal(rec.oid, 'OID-1');
  assert.equal(rec.name, 'Max Mustermann');
  assert.equal(rec.email, 'max.mustermann@pm.com'); // lowercased
  assert.equal(rec.role, 'azubi');
});

test('mapEntraRow bevorzugt mail vor userPrincipalName und ist case-insensitiv', () => {
  const row = { Id: 'OID-2', 'Display Name': 'Erika', mail: 'erika@pm.com', userPrincipalName: 'upn@pm.com' };
  const rec = mapEntraRow(row, 'pruefer');
  assert.equal(rec.oid, 'OID-2');
  assert.equal(rec.name, 'Erika');
  assert.equal(rec.email, 'erika@pm.com');
});

test('parseArgs erkennt --entra und --role', () => {
  assert.deepEqual(parseArgs(['--entra', '--role=azubi', 'x.csv']),
    { flags: { entra: true, role: 'azubi' }, file: 'x.csv' });
  assert.deepEqual(parseArgs(['own.csv']),
    { flags: { entra: false, role: null }, file: 'own.csv' });
});

test('toRecords: Entra-Modus vs. klassischer Modus', () => {
  const entra = toRecords([{ id: 'o1', displayName: 'A', mail: 'A@pm.com' }],
    { entra: true, role: 'azubi' });
  assert.equal(entra[0].role, 'azubi');
  assert.equal(entra[0].email, 'a@pm.com');

  const classic = toRecords([{ oid: 'o2', name: 'B', email: 'B@pm.com', role: 'pruefer', beginn: '2024-09-01' }],
    { entra: false, role: null });
  assert.equal(classic[0].role, 'pruefer');
  assert.equal(classic[0].email, 'b@pm.com');
  assert.equal(classic[0].ausbildungBeginn, '2024-09-01');
});
