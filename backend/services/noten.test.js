'use strict';
// Tests für backend/services/noten.js — nur die REINEN Funktionen, kein DB.
// Design-Spec: docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
// Aufruf: node --test backend/services/noten.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('./noten');

const AZ = 'azubi-oid-1';
const AZ2 = 'azubi-oid-2';

// Minimale req.user-Formen (vgl. buildReqUser in services/users.js).
const azubi = { oid: AZ, role: 'azubi', istAzubi: true };
const dhStudent = { oid: AZ, role: 'dhstudent', istDhStudent: true };
const ausbilder = { oid: 'ausb-1', role: 'pruefer', istAusbilder: true };
const leiterKfm = { oid: 'leit-k', role: 'pruefer', istAusbildungsleiter: true, ausbildungsleiterBereich: 'kaufmaennisch' };
const leiterTech = { oid: 'leit-t', role: 'pruefer', istAusbildungsleiter: true, ausbildungsleiterBereich: 'technisch' };
const developer = { oid: 'dev-1', role: 'developer', istAusbilder: true };
const admin = { oid: 'adm-1', role: 'admin' };

const LEER = { dauerAzubiOids: [], azubiBereich: null };
const kontext = (o) => Object.assign({}, LEER, o);

// ── Lesen ───────────────────────────────────────────────────────────
test('der Eigentümer sieht seine eigenen Noten', () => {
  assert.equal(N.darfNotenSehen(azubi, AZ, LEER), true);
  assert.equal(N.darfNotenSehen(dhStudent, AZ, LEER), true);
});

test('ein dauerhaft zugeordneter Ausbilder sieht, bearbeitet aber nicht', () => {
  const k = kontext({ dauerAzubiOids: [AZ] });
  assert.equal(N.darfNotenSehen(ausbilder, AZ, k), true);
  assert.equal(N.darfNotenBearbeiten(ausbilder, AZ), false);
  // Ein anderer Azubi bleibt tabu.
  assert.equal(N.darfNotenSehen(ausbilder, AZ2, k), false);
});

test('eine BEFRISTETE Abteilungs-Zuweisung gibt keinen Zugriff', () => {
  // Regressionsnagel. Bei Wochen und Beurteilungen ist die befristete
  // Zuweisung eine gleichwertige Zugriffsquelle (services/zugriffContext.js);
  // hier ausdrücklich NICHT — Schulnoten gehören nicht zum Abteilungs-
  // einsatz. Selbst wenn jemand später einen zuweisungs-behafteten Kontext
  // durchreicht, darf sich nichts ändern.
  const k = kontext({ zuweisungen: [{ azubiOid: AZ, verantwEmail: 'a@b.c' }] });
  assert.equal(N.darfNotenSehen(ausbilder, AZ, k), false);
  assert.equal(N.darfNotenBearbeiten(ausbilder, AZ), false);
});

test('die Ausbildungsleitung sieht nur den eigenen Bereich', () => {
  assert.equal(N.darfNotenSehen(leiterKfm, AZ, kontext({ azubiBereich: 'kaufmaennisch' })), true);
  assert.equal(N.darfNotenSehen(leiterKfm, AZ, kontext({ azubiBereich: 'technisch' })), false);
  assert.equal(N.darfNotenSehen(leiterTech, AZ, kontext({ azubiBereich: 'technisch' })), true);
  // Kein Department-Treffer beim Azubi -> kein Bereich -> kein Zugriff.
  assert.equal(N.darfNotenSehen(leiterKfm, AZ, kontext({ azubiBereich: null })), false);
});

test('das Ausbildungsleiter-Tag allein genügt nicht, der Bereich muss passen', () => {
  const ohneTag = { oid: 'x', role: 'pruefer', istAusbildungsleiter: false, ausbildungsleiterBereich: 'kaufmaennisch' };
  assert.equal(N.darfNotenSehen(ohneTag, AZ, kontext({ azubiBereich: 'kaufmaennisch' })), false);
  const ohneBereich = { oid: 'y', role: 'pruefer', istAusbildungsleiter: true, ausbildungsleiterBereich: null };
  assert.equal(N.darfNotenSehen(ohneBereich, AZ, kontext({ azubiBereich: null })), false);
});

test('developer und admin lesen immer, ein Prüfer ohne Zuordnung nie', () => {
  assert.equal(N.darfNotenSehen(developer, AZ, LEER), true);
  assert.equal(N.darfNotenSehen(admin, AZ, LEER), true);
  assert.equal(N.darfNotenSehen(ausbilder, AZ, LEER), false);
});

test('ohne Nutzer oder ohne Azubi ist nichts erlaubt', () => {
  assert.equal(N.darfNotenSehen(null, AZ, LEER), false);
  assert.equal(N.darfNotenSehen(undefined, AZ, LEER), false);
  assert.equal(N.darfNotenSehen(azubi, null, LEER), false);
  assert.equal(N.darfNotenSehen(azubi, '', LEER), false);
  assert.equal(N.darfNotenBearbeiten(null, AZ), false);
  assert.equal(N.darfNotenBearbeiten(azubi, null), false);
});

test('darfNotenSehen kommt ohne Kontext-Objekt aus', () => {
  // Die Route lädt den Kontext erst, wenn der Eigentümer-Kurzschluss nicht
  // greift — ein fehlender Kontext darf nicht werfen.
  assert.equal(N.darfNotenSehen(azubi, AZ), true);
  assert.equal(N.darfNotenSehen(ausbilder, AZ), false);
});

// ── Schreiben ───────────────────────────────────────────────────────
test('schreiben darf ausschließlich der Eigentümer', () => {
  assert.equal(N.darfNotenBearbeiten(azubi, AZ), true);
  assert.equal(N.darfNotenBearbeiten(dhStudent, AZ), true);
  assert.equal(N.darfNotenBearbeiten(azubi, AZ2), false);
});

test('auch developer und admin schreiben NICHT', () => {
  // Strenger als darfWocheSehen (services/zugriff.js), wo admin/developer
  // global lesen dürfen: die Noten sind eine Selbstauskunft. Der Developer
  // testet über backend/routes/dev-login.js als echter Azubi.
  assert.equal(N.darfNotenSehen(developer, AZ, LEER), true);
  assert.equal(N.darfNotenBearbeiten(developer, AZ), false);
  assert.equal(N.darfNotenBearbeiten(admin, AZ), false);
  assert.equal(N.darfNotenBearbeiten({ ...developer, oid: AZ }, AZ), false);
});

test('ein Prüfer schreibt auch am eigenen Datensatz nicht', () => {
  assert.equal(N.darfNotenBearbeiten({ ...ausbilder, oid: AZ }, AZ), false);
});

test('ein Developer MIT Azubi-Tag darf sein eigenes Heft pflegen', () => {
  // istAzubi ist ein additives Tag (services/users.js:67) - wer selbst ein
  // Berichtsheft führt, führt auch seine Noten.
  const devAzubi = { oid: AZ, role: 'developer', istAzubi: true };
  assert.equal(N.darfNotenBearbeiten(devAzubi, AZ), true);
});

// ── Mitteilungs-Arten ───────────────────────────────────────────────
test('ARTEN_MIT_MITTEILUNG ist dieselbe Wahrheit wie noten-core', () => {
  const core = require('../../app/js/noten-core.js');
  assert.deepEqual([...N.ARTEN_MIT_MITTEILUNG].sort(), [...core.ARTEN_MIT_MITTEILUNG].sort());
  assert.equal(N.ARTEN_MIT_MITTEILUNG.has('zeugnis'), true);
  assert.equal(N.ARTEN_MIT_MITTEILUNG.has('klassenarbeit'), false);
});

test('BENACHRICHTIGUNG_TYP passt zur Migration 044', () => {
  assert.equal(N.BENACHRICHTIGUNG_TYP, 'noten_eintrag_neu');
});
