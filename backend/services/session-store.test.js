'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hardenWrites } = require('./session-store.js');

// Hilfs-Store: `set`/`touch` scheitern die ersten `failTimes` Aufrufe mit dem
// gegebenen Code, danach Erfolg. Zählt die Aufrufe.
function makeStore({ failTimes = 0, code = 'EPERM' } = {}) {
  const calls = { set: 0, touch: 0 };
  const impl = (name) => (id, sess, cb) => {
    calls[name] += 1;
    if (calls[name] <= failTimes) {
      const e = new Error(`${code}: rename …`); e.code = code; return cb(e);
    }
    cb(null, { ok: name });
  };
  return { store: { set: impl('set'), touch: impl('touch') }, calls };
}

test('hardenWrites: touch wird bei EPERM wiederholt und läuft dann durch', async () => {
  const { store, calls } = makeStore({ failTimes: 2 });
  hardenWrites(store, { delayMs: 1 });
  const err = await new Promise((res) => store.touch('sid', {}, res));
  assert.equal(err, null);
  assert.equal(calls.touch, 3, 'zwei Fehlversuche + ein Erfolg');
});

test('hardenWrites: touch schluckt endgültigen Fehler (best effort)', async () => {
  const { store, calls } = makeStore({ failTimes: 99 });
  hardenWrites(store, { retries: 3, delayMs: 1 });
  const err = await new Promise((res) => store.touch('sid', {}, res));
  assert.equal(err, null, 'touch-Fehler darf NICHT an express-session gehen');
  assert.equal(calls.touch, 4, 'Erstversuch + 3 Retries');
});

test('hardenWrites: set wird wiederholt und läuft bei Erfolg durch', async () => {
  const { store, calls } = makeStore({ failTimes: 1 });
  hardenWrites(store, { delayMs: 1 });
  const out = await new Promise((res) => store.set('sid', {}, (e, r) => res({ e, r })));
  assert.equal(out.e, null);
  assert.deepEqual(out.r, { ok: 'set' });
  assert.equal(calls.set, 2);
});

test('hardenWrites: set reicht endgültigen Fehler DURCH (nicht schlucken)', async () => {
  const { store } = makeStore({ failTimes: 99 });
  hardenWrites(store, { retries: 2, delayMs: 1 });
  const err = await new Promise((res) => store.set('sid', {}, res));
  assert.ok(err, 'echter Speicherfehler muss sichtbar bleiben');
  assert.equal(err.code, 'EPERM');
});

test('hardenWrites: nicht-transienter Fehler wird nicht wiederholt', async () => {
  const { store, calls } = makeStore({ failTimes: 99, code: 'EINVAL' });
  hardenWrites(store, { retries: 5, delayMs: 1 });
  await new Promise((res) => store.touch('sid', {}, res));
  assert.equal(calls.touch, 1, 'EINVAL ist kein Lock-Konflikt → kein Retry');
});

// Hilfs-Store im Speicher, dessen touch wie session-file-store arbeitet: erst
// lesen, dann (hier: erst nach `release()`) die gelesenen Daten zurückschreiben.
function makeRacyStore() {
  const data = new Map();
  let release;
  const gate = new Promise((r) => { release = r; });
  const store = {
    set(id, sess, cb) { data.set(id, sess); cb(null); },
    touch(id, sess, cb) {
      const original = data.get(id) || {};
      gate.then(() => { data.set(id, original); cb(null); });
    },
    destroy(id, cb) { data.delete(id); cb(null); },
  };
  return { store, data, release };
}

test('hardenWrites: touch, der vor dem Logout gelesen hat, weckt die Session nicht wieder auf', async () => {
  const { store, data, release } = makeRacyStore();
  hardenWrites(store, { delayMs: 1 });
  store.set('sid', { userOid: 'admin' }, () => {});

  const touched = new Promise((res) => store.touch('sid', {}, res)); // liest noch mit Anmeldung
  await new Promise((res) => store.destroy('sid', res));             // Logout
  release();                                                         // touch schreibt zurück
  await touched;

  assert.equal(data.has('sid'), false, 'abgemeldete Session darf nicht wieder auftauchen');
});

test('hardenWrites: ohne set/touch unverändert', () => {
  const store = { get() {} };
  assert.equal(hardenWrites(store), store);
});
