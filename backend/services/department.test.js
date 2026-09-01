'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./department.js');

test('bereichAusDepartment: gewerblich -> technisch, kaufm -> kaufmaennisch', () => {
  assert.equal(D.bereichAusDepartment('Gewerbliche Auszubildende'), 'technisch');
  assert.equal(D.bereichAusDepartment('Kaufmännische Auszubildende'), 'kaufmaennisch');
});

test('bereichAusDepartment: DH-Studenten zaehlen zur kaufmaennischen Ausbildungsleitung', () => {
  assert.equal(D.bereichAusDepartment('DH-Studenten'), 'kaufmaennisch');
  assert.equal(D.bereichAusDepartment('DH Studenten'), 'kaufmaennisch');
});

test('bereichAusDepartment: case-insensitiv', () => {
  assert.equal(D.bereichAusDepartment('gewerbliche auszubildende'), 'technisch');
  assert.equal(D.bereichAusDepartment('KAUFMÄNNISCHE AUSZUBILDENDE'), 'kaufmaennisch');
});

test('bereichAusDepartment: unbekannt/leer/null -> null', () => {
  assert.equal(D.bereichAusDepartment('Sonstiges'), null);
  assert.equal(D.bereichAusDepartment(''), null);
  assert.equal(D.bereichAusDepartment(null), null);
  assert.equal(D.bereichAusDepartment(undefined), null);
});
