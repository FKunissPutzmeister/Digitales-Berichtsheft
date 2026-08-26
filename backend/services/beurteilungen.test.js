'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilungen.js');

test('darfBeurteilungBearbeiten: true fuer admin/developer unabhaengig von der Zuweisung', () => {
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'admin', email: 'x@y.de' }, null), true);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'developer', email: 'x@y.de' }, { verantwortlicherEmail: 'andere@y.de' }), true);
});

test('darfBeurteilungBearbeiten: true nur bei exaktem E-Mail-Match auf die Zuweisung (case-insensitiv)', () => {
  const zuw = { verantwortlicherEmail: 'Pruefer@Firma.de' };
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'pruefer@firma.de' }, zuw), true);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'andere@firma.de' }, zuw), false);
});

test('darfBeurteilungBearbeiten: false ohne Zuweisung oder ohne E-Mail', () => {
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: 'x@y.de' }, null), false);
  assert.equal(B.darfBeurteilungBearbeiten({ role: 'pruefer', email: '' }, { verantwortlicherEmail: 'x@y.de' }), false);
});

test('darfBeurteilungBearbeiten: dauerhafter Ausbilder bekommt KEINE Bearbeiten-Rechte mehr', () => {
  // Regressionstest fuer den Kernpunkt dieses Umbaus: frueher gewaehrte
  // verantwortlichFuerZuweisung (via dauerAusbilderAzubiOids) hier Zugriff —
  // darfBeurteilungBearbeiten kennt diesen Pfad bewusst nicht.
  const zuw = { verantwortlicherEmail: 'zeitboxierter.pruefer@firma.de' };
  const dauerhafterAusbilder = { role: 'pruefer', email: 'dauerhafter.ausbilder@firma.de' };
  assert.equal(B.darfBeurteilungBearbeiten(dauerhafterAusbilder, zuw), false);
});

// node:test's test() akzeptiert async-Callbacks nativ (awaitet das Promise) —
// kein zweiter require/alias nötig, das oben bereits importierte `test` reicht.
test('ermittleModus: Typ=kurz liefert nur bearbeiten/ansicht, nie azubi/ausbildungsleiter', async () => {
  const zuwEditable = { verantwortlicherEmail: 'pruefer@firma.de' };
  const pruefer = { role: 'pruefer', email: 'pruefer@firma.de', oid: 'pruefer-oid' };
  const azubi = { role: 'azubi', email: 'azubi@firma.de', oid: 'azubi-oid' };
  const bKurz = { Typ: 'kurz', AzubiOid: 'azubi-oid', Status: 'abgeschlossen', AusbildungsleiterBestaetigtAm: null, ausbildungsleiterSchrittEntfaellt: false };

  // pool wird im kurz-Kurzschluss nie angefasst -> {} genügt als Fake.
  assert.equal(await B.ermittleModus(pruefer, zuwEditable, bKurz, {}), 'bearbeiten');
  assert.equal(await B.ermittleModus(azubi, zuwEditable, bKurz, {}), 'ansicht');
});
