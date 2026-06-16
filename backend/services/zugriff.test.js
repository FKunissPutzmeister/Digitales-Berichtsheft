'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('./zugriff.js');

const user = { oid: 'U1' };
const azubi = { oid: 'AZ' };

// Hilfs-Builder
const zuw = (over = {}) => ({
  azubiOid: 'AZ', verantwortlicherOid: 'U1',
  von: '2026-06-01', bis: '2026-06-30', ...over,
});
const woche = (over = {}) => ({
  azubiOid: 'AZ', start: '2026-06-08', ende: '2026-06-14',
  korrigiertVon: null, kommentarAutoren: [], ...over,
});

// ── ymd ────────────────────────────────────────────────────────
test('ymd normalisiert Date und String auf YYYY-MM-DD', () => {
  assert.equal(Z.ymd(new Date('2026-06-15T12:00:00Z')), '2026-06-15');
  assert.equal(Z.ymd('2026-06-15'), '2026-06-15');
  assert.equal(Z.ymd('2026-06-15T00:00:00.000Z'), '2026-06-15');
  assert.equal(Z.ymd(null), null);
});

// ── istAktiv ───────────────────────────────────────────────────
test('istAktiv: Grenzen inklusive', () => {
  const z = zuw();
  assert.equal(Z.istAktiv(z, '2026-05-31'), false); // Tag vor von
  assert.equal(Z.istAktiv(z, '2026-06-01'), true);  // am von
  assert.equal(Z.istAktiv(z, '2026-06-15'), true);  // mittendrin
  assert.equal(Z.istAktiv(z, '2026-06-30'), true);  // am bis
  assert.equal(Z.istAktiv(z, '2026-07-01'), false); // Tag nach bis
});

// ── wocheFaelltInZuweisung ─────────────────────────────────────
test('wocheFaelltInZuweisung: Überschneidung inklusive Randwochen', () => {
  const z = zuw({ von: '2026-06-10', bis: '2026-06-20' });
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-01', ende: '2026-06-07' }), z), false); // davor
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-08', ende: '2026-06-14' }), z), true);  // ragt rein
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-15', ende: '2026-06-21' }), z), true);  // ragt raus
  assert.equal(Z.wocheFaelltInZuweisung(woche({ start: '2026-06-22', ende: '2026-06-28' }), z), false); // danach
});

// ── darfWocheKorrigieren ───────────────────────────────────────
test('darfWocheKorrigieren: aktiv + richtiger Azubi + Woche im Zeitraum', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), true);
});
test('darfWocheKorrigieren: falscher Verantwortlicher → false', () => {
  const kontext = { zuweisungen: [zuw({ verantwortlicherOid: 'X' })], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), false);
});
test('darfWocheKorrigieren: Zuweisung heute nicht aktiv → false', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-07-15' };
  assert.equal(Z.darfWocheKorrigieren(user, woche(), kontext), false);
});
test('darfWocheKorrigieren: Woche außerhalb des Zeitraums → false', () => {
  const kontext = { zuweisungen: [zuw({ von: '2026-06-01', bis: '2026-06-07' })], stichtag: '2026-06-05' };
  assert.equal(Z.darfWocheKorrigieren(user, woche({ start: '2026-06-15', ende: '2026-06-21' }), kontext), false);
});

// ── hatKorrigiert / darfWocheSehen ─────────────────────────────
test('hatKorrigiert: über KorrigiertVon oder Kommentar-Autor', () => {
  assert.equal(Z.hatKorrigiert(user, woche({ korrigiertVon: 'U1' })), true);
  assert.equal(Z.hatKorrigiert(user, woche({ kommentarAutoren: ['X', 'U1'] })), true);
  assert.equal(Z.hatKorrigiert(user, woche({ korrigiertVon: 'X', kommentarAutoren: ['Y'] })), false);
});
test('darfWocheSehen: eigenes Heft immer', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheSehen(azubi, woche(), kontext), true); // azubi.oid === woche.azubiOid
});
test('darfWocheSehen: aktiv verantwortlich', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheSehen(user, woche(), kontext), true);
});
test('darfWocheSehen: Korrektur-Historie read-only auch nach Ablauf', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' }; // keine aktive Zuweisung mehr
  assert.equal(Z.darfWocheSehen(user, woche({ korrigiertVon: 'U1' }), kontext), true);
});
test('darfWocheSehen: Lockout ohne Zuweisung/Historie → false', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' };
  assert.equal(Z.darfWocheSehen(user, woche(), kontext), false);
});

// ── aktivVerantwortlichFuer ────────────────────────────────────
test('aktivVerantwortlichFuer: nur aktive, dedupliziert', () => {
  const kontext = { stichtag: '2026-06-15', zuweisungen: [
    zuw({ azubiOid: 'AZ' }),
    zuw({ azubiOid: 'AZ2', von: '2026-01-01', bis: '2026-02-01' }), // abgelaufen
    zuw({ azubiOid: 'AZ' }), // Dublette
  ]};
  assert.deepEqual(Z.aktivVerantwortlichFuer(user, kontext).sort(), ['AZ']);
});
