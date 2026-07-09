'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bestEffortTouch } = require('./session-store.js');

test('bestEffortTouch: schluckt Fehler des Touch-Callbacks (kein Weiterreichen)', () => {
  const store = {
    touch(id, sess, cb) { cb(new Error("EPERM: operation not permitted, rename '…json.123' -> '…json'")); },
  };
  bestEffortTouch(store);
  let received = 'nicht-aufgerufen';
  store.touch('sid', {}, (err) => { received = err; });
  assert.equal(received, null, 'Touch-Fehler darf nicht an express-session durchgereicht werden');
});

test('bestEffortTouch: reicht Erfolg (Ergebnis) durch', () => {
  const store = {
    touch(id, sess, cb) { cb(null, { ok: true }); },
  };
  bestEffortTouch(store);
  let out;
  store.touch('sid', {}, (err, result) => { out = { err, result }; });
  assert.equal(out.err, null);
  assert.deepEqual(out.result, { ok: true });
});

test('bestEffortTouch: ohne touch-Methode unverändert', () => {
  const store = { set() {} };
  const same = bestEffortTouch(store);
  assert.equal(same, store);
  assert.equal(typeof store.touch, 'undefined');
});
