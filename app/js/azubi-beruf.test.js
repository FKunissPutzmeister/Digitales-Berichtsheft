'use strict';
/* Beruf-Filter der Azubi-Auswahl: Zuordnung Freitext-Beruf → Gruppe, wann der
   Filter überhaupt erscheint und welcher Filter gerade gilt. Nur node:test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const AB = require('./azubi-beruf.js');

const az = (id, beruf) => ({ id, name: 'Azubi ' + id, beruf });
const technisch = [
  az('a', 'Industriemechaniker'),
  az('b', 'Mechatroniker'),
  az('c', 'Mechatroniker'),
  az('d', 'Technischer Auszubildender'),
];

test('gruppeVon erkennt die Berufe samt Varianten aus Entra', () => {
  assert.equal(AB.gruppeVon('Industriemechaniker'), 'industriemechaniker');
  assert.equal(AB.gruppeVon('Industriemechanikerin'), 'industriemechaniker');
  assert.equal(AB.gruppeVon('industriemechaniker/-in'), 'industriemechaniker');
  assert.equal(AB.gruppeVon('Industrial mechanic'), 'industriemechaniker');
  assert.equal(AB.gruppeVon('Mechatroniker'), 'mechatroniker');
  assert.equal(AB.gruppeVon('Mechatronikerin'), 'mechatroniker');
  assert.equal(AB.gruppeVon('Technical apprentice'), 'sonstige');
  assert.equal(AB.gruppeVon('Industriekaufmann'), 'sonstige');
  assert.equal(AB.gruppeVon(null), 'sonstige');
  assert.equal(AB.gruppeVon(''), 'sonstige');
});

test('filterOptionen: nur wenn beide technischen Berufe vorkommen', () => {
  assert.equal(AB.filterOptionen([]), null);
  assert.equal(AB.filterOptionen(null), null);
  assert.equal(AB.filterOptionen([az('a', 'Industriemechaniker'), az('d', 'Industriekauffrau')]), null);
  assert.equal(AB.filterOptionen([az('b', 'Mechatroniker'), az('c', 'Mechatroniker')]), null);
  assert.deepEqual(
    AB.filterOptionen(technisch).map(o => o.key),
    ['alle', 'industriemechaniker', 'mechatroniker', 'sonstige']);
});

test('filterOptionen: "Sonstige" nur, solange es solche Azubis gibt', () => {
  const sauber = technisch.filter(a => a.id !== 'd');
  assert.deepEqual(AB.filterOptionen(sauber).map(o => o.key),
    ['alle', 'industriemechaniker', 'mechatroniker']);
});

test('filtere liefert die Gruppe, "alle" oder unbekannt = komplette Liste', () => {
  assert.deepEqual(AB.filtere(technisch, 'mechatroniker').map(a => a.id), ['b', 'c']);
  assert.deepEqual(AB.filtere(technisch, 'sonstige').map(a => a.id), ['d']);
  assert.deepEqual(AB.filtere(technisch, 'alle').map(a => a.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(AB.filtere(technisch, null).map(a => a.id), ['a', 'b', 'c', 'd']);
});

test('wirksamerFilter: kein Filter, wo keiner angeboten wird', () => {
  assert.equal(AB.wirksamerFilter([az('x', 'Industriekaufmann')], 'mechatroniker', 'x'), null);
});

test('wirksamerFilter: gespeicherter Wunsch gilt, wenn der Azubi dazu passt', () => {
  assert.equal(AB.wirksamerFilter(technisch, 'mechatroniker', 'c'), 'mechatroniker');
  assert.equal(AB.wirksamerFilter(technisch, 'alle', 'c'), 'alle');
});

test('wirksamerFilter: ohne/ungültigen Wunsch → "alle"', () => {
  assert.equal(AB.wirksamerFilter(technisch, null, 'a'), 'alle');
  assert.equal(AB.wirksamerFilter(technisch, 'quatsch', 'a'), 'alle');
  // "sonstige" ist nur gültig, solange die Liste solche Azubis hat
  const sauber = technisch.filter(a => a.id !== 'd');
  assert.equal(AB.wirksamerFilter(sauber, 'sonstige', 'a'), 'alle');
});

test('wirksamerFilter: Azubi außerhalb des Wunschs → dessen Gruppe (Direktlink)', () => {
  assert.equal(AB.wirksamerFilter(technisch, 'mechatroniker', 'a'), 'industriemechaniker');
  assert.equal(AB.wirksamerFilter(technisch, 'industriemechaniker', 'd'), 'sonstige');
});

test('wirksamerFilter: unbekannter aktueller Azubi lässt den Wunsch stehen', () => {
  assert.equal(AB.wirksamerFilter(technisch, 'mechatroniker', 'gibtsnicht'), 'mechatroniker');
  assert.equal(AB.wirksamerFilter(technisch, 'mechatroniker', null), 'mechatroniker');
});

test('IDs werden als String verglichen (GUIDs, aber auch Zahlen robust)', () => {
  const liste = [az(1, 'Industriemechaniker'), az(2, 'Mechatroniker')];
  assert.equal(AB.wirksamerFilter(liste, 'mechatroniker', '1'), 'industriemechaniker');
});
