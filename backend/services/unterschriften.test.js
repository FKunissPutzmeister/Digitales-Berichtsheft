'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('./unterschriften.js');

test('dataUrlToBuffer dekodiert eine PNG-DataURL zu einem Buffer', () => {
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const buf = U.dataUrlToBuffer(`data:image/png;base64,${png1x1}`);
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString('base64'), png1x1);
});

test('dataUrlToBuffer liefert null bei ungültigem Format', () => {
  assert.equal(U.dataUrlToBuffer('nicht-data-url'), null);
  assert.equal(U.dataUrlToBuffer(''), null);
  assert.equal(U.dataUrlToBuffer(null), null);
});

test('bufferToDataUrl baut die DataURL mit passendem MIME-Typ', () => {
  const buf = Buffer.from([1, 2, 3]);
  assert.equal(U.bufferToDataUrl(buf, 'png'), `data:image/png;base64,${buf.toString('base64')}`);
  assert.equal(U.bufferToDataUrl(buf, 'jpeg'), `data:image/jpeg;base64,${buf.toString('base64')}`);
  assert.equal(U.bufferToDataUrl(buf, 'jpg'), `data:image/jpeg;base64,${buf.toString('base64')}`);
});

test('bufferToDataUrl liefert null ohne Buffer', () => {
  assert.equal(U.bufferToDataUrl(null, 'png'), null);
});

test('pruefeGroesse wirft ab 2 MB, akzeptiert darunter und null', () => {
  assert.doesNotThrow(() => U.pruefeGroesse(Buffer.alloc(1024)));
  assert.doesNotThrow(() => U.pruefeGroesse(null));
  assert.throws(() => U.pruefeGroesse(Buffer.alloc(U.MAX_BYTES + 1)), /zu groß/);
});

function fakePool(queryResult) {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = {};
      const api = {
        input(name, _typ, val) { inputs[name] = val; return api; },
        query(text) {
          calls.push({ sql: text, inputs });
          return Promise.resolve(queryResult || { recordset: [] });
        },
      };
      return api;
    },
  };
}

test('holeMeine: liefert dataUrl+extension wenn eine Zeile existiert', async () => {
  const bild = Buffer.from([9, 9, 9]);
  const pool = fakePool({ recordset: [{ Bild: bild, Extension: 'png' }] });
  const result = await U.holeMeine(pool, 'OID-1');
  assert.deepEqual(result, { dataUrl: U.bufferToDataUrl(bild, 'png'), extension: 'png' });
  assert.equal(pool.calls[0].inputs.oid, 'OID-1');
  assert.match(pool.calls[0].sql, /SELECT Bild, Extension FROM dbo\.Unterschriften WHERE Oid = @oid/);
});

test('holeMeine: liefert null wenn keine Zeile existiert', async () => {
  const pool = fakePool({ recordset: [] });
  assert.equal(await U.holeMeine(pool, 'OID-X'), null);
});

test('speichereMeine: schreibt Bild+Extension per MERGE', async () => {
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const pool = fakePool();
  await U.speichereMeine(pool, 'OID-1', { dataUrl: `data:image/png;base64,${png1x1}`, extension: 'png' });
  assert.equal(pool.calls[0].inputs.oid, 'OID-1');
  assert.equal(pool.calls[0].inputs.ext, 'png');
  assert.ok(Buffer.isBuffer(pool.calls[0].inputs.bild));
  assert.match(pool.calls[0].sql, /MERGE dbo\.Unterschriften/);
});

test('speichereMeine: wirft bei ungueltiger dataUrl, OHNE die DB anzufassen', async () => {
  const pool = fakePool();
  await assert.rejects(() => U.speichereMeine(pool, 'OID-1', { dataUrl: 'kaputt', extension: 'png' }), /Ungültige/);
  assert.equal(pool.calls.length, 0);
});

test('speichereMeine: wirft bei zu grosser Unterschrift, OHNE die DB anzufassen', async () => {
  const riesig = 'A'.repeat(3 * 1024 * 1024);
  const pool = fakePool();
  await assert.rejects(() => U.speichereMeine(pool, 'OID-1', { dataUrl: `data:image/png;base64,${riesig}`, extension: 'png' }), /zu groß/);
  assert.equal(pool.calls.length, 0);
});

test('istValidierungsfehler erkennt Groessen- und Formatfehler, sonst nicht', () => {
  assert.equal(U.istValidierungsfehler(new Error('Unterschrift zu groß (max. 2 MB).')), true);
  assert.equal(U.istValidierungsfehler(new Error('Ungültige Unterschrift.')), true);
  assert.equal(U.istValidierungsfehler(new Error('Datenbank nicht erreichbar')), false);
});
