'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('./zugriff.js');
const {
  istPeriodenPruefer, rolleFuerWoche, wochenAktionen,
} = require('./zugriff');

const user = { oid: 'U1', email: 'u1@pm.com' };
const azubi = { oid: 'AZ' };

// Hilfs-Builder
const zuw = (over = {}) => ({
  azubiOid: 'AZ', verantwortlicherEmail: 'u1@pm.com',
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
  const kontext = { zuweisungen: [zuw({ verantwortlicherEmail: 'x@pm.com' })], stichtag: '2026-06-15' };
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
test('darfWocheKorrigieren: Verantwortlich-Vergleich case-insensitiv', () => {
  const kontext = { zuweisungen: [zuw({ verantwortlicherEmail: 'u1@pm.com' })], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheKorrigieren({ oid: 'U1', email: 'U1@PM.com' }, woche(), kontext), true);
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

// ── Developer/Admin: globale Lesesicht (Gesamtüberblick) ───────
test('darfWocheSehen: developer sieht jede Woche ohne Zuweisung/Historie', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' };
  assert.equal(Z.darfWocheSehen({ oid: 'DEV', email: 'd@pm.com', role: 'developer' }, woche(), kontext), true);
});
test('darfWocheSehen: admin sieht jede Woche ohne Zuweisung/Historie', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' };
  assert.equal(Z.darfWocheSehen({ oid: 'ADM', email: 'a@pm.com', role: 'admin' }, woche(), kontext), true);
});
test('darfWocheKorrigieren: developer-Rolle allein gibt KEIN Schreibrecht', () => {
  // Lesen ≠ Korrigieren: die globale Sicht ist read-only, Schreiben bleibt an
  // Zuweisung/Dauer-Ausbilder gebunden.
  const kontext = { zuweisungen: [], stichtag: '2026-12-01' };
  assert.equal(Z.darfWocheKorrigieren({ oid: 'DEV', email: 'd@pm.com', role: 'developer' }, woche(), kontext), false);
});

// ── Härtung: leere/fehlende OID darf nichts öffnen ─────────────
test('darfWocheSehen: leere/fehlende OID öffnet nichts', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15' };
  assert.equal(Z.darfWocheSehen({ oid: '' }, woche({ azubiOid: '' }), kontext), false);
  assert.equal(Z.darfWocheSehen({ oid: undefined }, woche({ azubiOid: undefined }), kontext), false);
});
test('darfWocheKorrigieren: leere OID/azubiOid öffnet nichts', () => {
  const kontext = { stichtag: '2026-06-15', zuweisungen: [
    { azubiOid: '', verantwortlicherEmail: '', von: '2026-06-01', bis: '2026-06-30' },
  ]};
  assert.equal(Z.darfWocheKorrigieren({ oid: '', email: '' }, woche({ azubiOid: '' }), kontext), false);
});
test('hatKorrigiert: leere OID öffnet nichts', () => {
  assert.equal(Z.hatKorrigiert({ oid: '' }, woche({ korrigiertVon: '' })), false);
});

// ── Dauerhafter Ausbilder-Grant (kontext.dauerAusbilderAzubiOids) ──
test('darfWocheKorrigieren: Dauer-Ausbilder unabhängig von Datum/Zuweisung', () => {
  const kontext = { zuweisungen: [], stichtag: '2030-01-01', dauerAusbilderAzubiOids: ['AZ'] };
  assert.equal(Z.darfWocheKorrigieren(user, woche({ start: '2020-01-01', ende: '2020-01-07' }), kontext), true);
});
test('darfWocheSehen: Dauer-Ausbilder sieht alte Woche (vor Zuweisung)', () => {
  const kontext = { zuweisungen: [], stichtag: '2030-01-01', dauerAusbilderAzubiOids: ['AZ'] };
  assert.equal(Z.darfWocheSehen(user, woche({ start: '2020-01-01', ende: '2020-01-07' }), kontext), true);
});
test('Dauer-Ausbilder: fremder Azubi bleibt gesperrt', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15', dauerAusbilderAzubiOids: ['AZ_ANDERS'] };
  assert.equal(Z.darfWocheSehen(user, woche({ azubiOid: 'AZ' }), kontext), false);
});
test('istDauerAusbilder: leere azubiOid öffnet nichts', () => {
  const kontext = { zuweisungen: [], stichtag: '2026-06-15', dauerAusbilderAzubiOids: [''] };
  assert.equal(Z.istDauerAusbilder(woche({ azubiOid: '' }), kontext), false);
});
// ── verantwortlichFuerZuweisung (Beurteilung: datumsunabhängig) ──
{
  const vfzUser = { oid: 'u-1', email: 'Max.Muster@pm.com' };

  test('verantwortlichFuerZuweisung: E-Mail matcht (case-insensitiv, datumsunabhängig)', () => {
    const z = { azubiOid: 'a-1', verantwortlicherEmail: 'max.muster@pm.com' };
    assert.equal(Z.verantwortlichFuerZuweisung(vfzUser, z, { dauerAusbilderAzubiOids: [] }), true);
  });

  test('verantwortlichFuerZuweisung: fremde E-Mail ohne Dauer-Zuordnung = false', () => {
    const z = { azubiOid: 'a-1', verantwortlicherEmail: 'other@pm.com' };
    assert.equal(Z.verantwortlichFuerZuweisung(vfzUser, z, { dauerAusbilderAzubiOids: [] }), false);
  });

  test('verantwortlichFuerZuweisung: dauerhafter Ausbilder des Azubis = true', () => {
    const z = { azubiOid: 'a-9', verantwortlicherEmail: 'other@pm.com' };
    assert.equal(Z.verantwortlichFuerZuweisung(vfzUser, z, { dauerAusbilderAzubiOids: ['a-9'] }), true);
  });

  test('verantwortlichFuerZuweisung: ohne email und ohne Dauer = false', () => {
    const z = { azubiOid: 'a-1', verantwortlicherEmail: '' };
    assert.equal(Z.verantwortlichFuerZuweisung({ oid: 'u-1', email: '' }, z, {}), false);
  });
}

// ── Zweistufiger Genehmigungs-Automat: istPeriodenPruefer / rolleFuerWoche / wochenAktionen ──
const KONTEXT = {
  stichtag: '2026-07-15',
  dauerAusbilderAzubiOids: ['azubi-dauer'],
  zuweisungen: [{
    azubiOid: 'azubi-pruef', verantwortlicherEmail: 'pruefer@x.de',
    von: '2026-07-01', bis: '2026-07-31',
  }],
};
const wochePruef = { azubiOid: 'azubi-pruef', start: '2026-07-13', ende: '2026-07-19' };

test('istPeriodenPruefer: aktive Zuweisung in Periode', () => {
  assert.strictEqual(istPeriodenPruefer({ email: 'pruefer@x.de' }, wochePruef, KONTEXT), true);
});
test('istPeriodenPruefer: falsche E-Mail', () => {
  assert.strictEqual(istPeriodenPruefer({ email: 'wer@x.de' }, wochePruef, KONTEXT), false);
});
test('rolleFuerWoche: Ausbilder schlägt Prüfer', () => {
  const w = { azubiOid: 'azubi-dauer', start: '2026-07-13', ende: '2026-07-19' };
  assert.strictEqual(rolleFuerWoche({ oid: 'x', email: 'pruefer@x.de' }, w, KONTEXT), 'ausbilder');
});
test('rolleFuerWoche: nur Prüfer', () => {
  assert.strictEqual(rolleFuerWoche({ oid: 'x', email: 'pruefer@x.de' }, wochePruef, KONTEXT), 'pruefer');
});
test('rolleFuerWoche: Eigentümer = azubi', () => {
  const w = { azubiOid: 'ich', start: '2026-07-13', ende: '2026-07-19' };
  assert.strictEqual(rolleFuerWoche({ oid: 'ich', email: 'a@x.de' }, w, KONTEXT), 'azubi');
});
test('rolleFuerWoche: fremd = null', () => {
  const w = { azubiOid: 'fremd', start: '2026-07-13', ende: '2026-07-19' };
  assert.strictEqual(rolleFuerWoche({ oid: 'ich', email: 'a@x.de' }, w, KONTEXT), null);
});

function aktionenSet(rolle, status, flag) {
  return wochenAktionen(rolle, status, flag).map(a => `${a.aktion}:${a.zielStatus}:${a.endabnahmeDirekt}`).sort();
}

test('azubi offen → einreichen', () => {
  assert.deepStrictEqual(aktionenSet('azubi', 'offen', 0), ['einreichen:freigegeben:0']);
});
test('azubi abgelehnt behält Flag beim Einreichen', () => {
  assert.deepStrictEqual(aktionenSet('azubi', 'abgelehnt', 1), ['einreichen:freigegeben:1']);
});
test('azubi freigegeben → zurueckziehen', () => {
  assert.deepStrictEqual(aktionenSet('azubi', 'freigegeben', 0), ['zurueckziehen:offen:0']);
});
test('pruefer freigegeben Flag0 → erstgenehmigen + zurueckgeben', () => {
  assert.deepStrictEqual(aktionenSet('pruefer', 'freigegeben', 0),
    ['erstgenehmigen:erstgenehmigt:0', 'zurueckgeben:abgelehnt:0']);
});
test('pruefer freigegeben Flag1 → gesperrt', () => {
  assert.deepStrictEqual(aktionenSet('pruefer', 'freigegeben', 1), []);
});
test('pruefer erstgenehmigt → nichts', () => {
  assert.deepStrictEqual(aktionenSet('pruefer', 'erstgenehmigt', 0), []);
});
test('ausbilder freigegeben Flag0 → Bypass genehmigen + zurueckgeben(Flag1)', () => {
  assert.deepStrictEqual(aktionenSet('ausbilder', 'freigegeben', 0),
    ['endgenehmigen:genehmigt:0', 'zurueckgeben:abgelehnt:1']);
});
test('ausbilder erstgenehmigt → endgenehmigen + zurueckgeben(Flag1)', () => {
  assert.deepStrictEqual(aktionenSet('ausbilder', 'erstgenehmigt', 0),
    ['endgenehmigen:genehmigt:0', 'zurueckgeben:abgelehnt:1']);
});
test('ausbilder freigegeben Flag1 → endgenehmigen möglich', () => {
  assert.deepStrictEqual(aktionenSet('ausbilder', 'freigegeben', 1),
    ['endgenehmigen:genehmigt:0', 'zurueckgeben:abgelehnt:1']);
});
test('null-Rolle → nichts', () => {
  assert.deepStrictEqual(aktionenSet(null, 'freigegeben', 0), []);
});
