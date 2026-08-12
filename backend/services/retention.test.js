'use strict';
/* Fristenlogik des Retention-Jobs. Reine Funktionen, keine DB, keine echte
   Uhr — 'jetzt' ist überall ein Parameter (Muster wie pruneOldBackups in
   berichtsheftBackup.js). */
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./retention.js');

const JETZT = new Date('2027-06-15T03:00:00.000Z');

// Konto, dessen Frist an einem gewählten Tag abläuft.
function konto(inaktivSeit, extra = {}) {
  return {
    oid: 'g1', name: 'Muster, Max', email: 'max.muster@putzmeister.com',
    aktiv: false, inaktivSeit, loeschsperreBis: null, ...extra,
  };
}

test('LOESCHFRIST_TAGE ist 365, VORWARN_TAGE ist 30', () => {
  assert.equal(R.LOESCHFRIST_TAGE, 365);
  assert.equal(R.VORWARN_TAGE, 30);
});

test('loeschDatum: InaktivSeit plus Frist', () => {
  const d = R.loeschDatum(konto('2026-06-15T02:00:00.000Z'), { fristTage: 365 });
  assert.equal(d.toISOString().slice(0, 10), '2027-06-15');
});

test('loeschDatum: ohne InaktivSeit null', () => {
  assert.equal(R.loeschDatum(konto(null)), null);
});

test('istFaellig: genau 365 Tage sind faellig', () => {
  // Stichtag 2026-06-15 + 365 Tage = 2027-06-15 = JETZT
  assert.equal(R.istFaellig(konto('2026-06-15T02:00:00.000Z'), { jetzt: JETZT }), true);
});

test('istFaellig: 364 Tage sind noch nicht faellig', () => {
  assert.equal(R.istFaellig(konto('2026-06-16T02:00:00.000Z'), { jetzt: JETZT }), false);
});

test('istFaellig: aktives Konto ist nie faellig', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { aktiv: true });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: ohne InaktivSeit nie faellig (Altbestand ohne Stempel)', () => {
  assert.equal(R.istFaellig(konto(null), { jetzt: JETZT }), false);
});

test('istFaellig: Sperre in der Zukunft haelt zurueck', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-12-31' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: Sperre am heutigen Tag haelt noch zurueck', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-06-15' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: abgelaufene Sperre haelt nicht zurueck, Frist laeuft nicht neu', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-06-14' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), true);
});

test('istFaellig: Demo-Konto ist nie faellig', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { email: 'lena.mueller.demo@putzmeister.com' });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), false);
});

test('istFaellig: Konto ohne E-Mail ist faellig (kein Demo-Konto)', () => {
  const u = konto('2020-01-01T00:00:00.000Z', { email: null });
  assert.equal(R.istFaellig(u, { jetzt: JETZT }), true);
});

test('istFaellig gilt fuer JEDE Rolle - es gibt keine Ausnahmeliste', () => {
  for (const role of ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer']) {
    const u = konto('2020-01-01T00:00:00.000Z', { role });
    assert.equal(R.istFaellig(u, { jetzt: JETZT }), true, `Rolle ${role} muesste faellig sein`);
  }
});

test('istVorwarnFaellig: 30 Tage vor Ablauf greift', () => {
  // Stichtag so, dass das Löschdatum 2027-07-01 ist → 16 Tage entfernt
  const u = konto('2026-07-01T02:00:00.000Z');
  assert.equal(R.istVorwarnFaellig(u, { jetzt: JETZT }), true);
});

test('istVorwarnFaellig: 31 Tage vor Ablauf greift noch nicht', () => {
  // Löschdatum 2027-07-16 → 31 Tage entfernt
  const u = konto('2026-07-16T02:00:00.000Z');
  assert.equal(R.istVorwarnFaellig(u, { jetzt: JETZT }), false);
});

test('istVorwarnFaellig: bereits faelliges Konto wird nicht mehr vorgewarnt', () => {
  assert.equal(R.istVorwarnFaellig(konto('2020-01-01T00:00:00.000Z'), { jetzt: JETZT }), false);
});

test('istVorwarnFaellig: gesperrtes Konto wird nicht vorgewarnt', () => {
  const u = konto('2026-07-01T02:00:00.000Z', { loeschsperreBis: '2027-12-31' });
  assert.equal(R.istVorwarnFaellig(u, { jetzt: JETZT }), false);
});

test('istDemoKonto erkennt das .demo-Suffix im Lokalteil', () => {
  // So heissen die echten Demo-Konten (backend/db/seed-demo-users.sql):
  assert.equal(R.istDemoKonto('lena.mueller.demo@putzmeister.com'), true);
  assert.equal(R.istDemoKonto('admin.demo@putzmeister.com'), true);
  assert.equal(R.istDemoKonto('LENA.MUELLER.DEMO@PUTZMEISTER.COM'), true);  // case-insensitiv
  assert.equal(R.istDemoKonto('lena.mueller@putzmeister.com'), false);
  // Eine .demo-DOMAIN ist kein Demo-Konto in diesem System — der frueher hier
  // gepruefte Fall, der alle echten Demo-Konten durchgelassen haette:
  assert.equal(R.istDemoKonto('lena.mueller@putzmeister.demo'), false);
  assert.equal(R.istDemoKonto(null), false);
});
