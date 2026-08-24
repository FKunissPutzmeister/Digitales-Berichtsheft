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

// ── istZugreifbar (6-Wochen-Nachlauffrist) ─────────────────────
test('istZugreifbar: verhält sich wie istAktiv innerhalb Von-Bis', () => {
  const z = zuw(); // von 2026-06-01, bis 2026-06-30
  assert.equal(Z.istZugreifbar(z, '2026-05-31'), false); // Tag vor von
  assert.equal(Z.istZugreifbar(z, '2026-06-01'), true);
  assert.equal(Z.istZugreifbar(z, '2026-06-30'), true);
});
test('istZugreifbar: bleibt bis 42 Tage nach Bis zugreifbar, danach nicht mehr', () => {
  const z = zuw(); // bis 2026-06-30
  assert.equal(Z.istZugreifbar(z, '2026-07-01'), true);  // 1 Tag danach
  assert.equal(Z.istZugreifbar(z, '2026-08-11'), true);  // genau 42 Tage danach
  assert.equal(Z.istZugreifbar(z, '2026-08-12'), false); // 43 Tage danach
});
test('istZugreifbar: fehlende Von/Bis-Werte → false', () => {
  assert.equal(Z.istZugreifbar({ von: '2026-06-01', bis: null }, '2026-06-15'), false);
  assert.equal(Z.istZugreifbar({ von: null, bis: '2026-06-30' }, '2026-06-15'), false);
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
test('darfWocheKorrigieren: Zuweisung auch nach Nachlauffrist nicht mehr zugreifbar → false', () => {
  const kontext = { zuweisungen: [zuw()], stichtag: '2026-08-15' }; // 46 Tage nach Bis (2026-06-30)
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

// ── schreibGate (Schreibschutz von POST /api/wochen) ───────────
// Kernregeln: normales Speichern setzt NIE den Status und fasst keine Woche in
// Abnahme an; ?migration=1 (IHK-Import, JSON-Restore) darf einen fremden Status
// mitbringen, aber nicht über eine in DIESER App erteilte Abnahme schreiben.
const { schreibGate } = Z;

test('schreibGate: neue Woche startet auf offen', () => {
  assert.deepStrictEqual(schreibGate(null, {}), { ok: true, status: 'offen' });
});

test('schreibGate: normales Speichern übernimmt NIE einen Status aus dem Body', () => {
  assert.deepStrictEqual(schreibGate(null, { wunschStatus: 'genehmigt' }), { ok: true, status: 'offen' });
  assert.deepStrictEqual(schreibGate({ status: 'offen' }, { wunschStatus: 'genehmigt' }), { ok: true, status: 'offen' });
  assert.deepStrictEqual(schreibGate({ status: 'abgelehnt' }, { wunschStatus: 'erstgenehmigt' }), { ok: true, status: 'abgelehnt' });
});

test('schreibGate: Woche in Abnahme ist beim normalen Speichern schreibgeschützt', () => {
  for (const status of ['freigegeben', 'erstgenehmigt', 'genehmigt']) {
    const g = schreibGate({ status }, {});
    assert.equal(g.ok, false, `${status} muss blocken`);
    assert.match(g.grund, /schreibgeschützt/);
  }
});

test('schreibGate: offen und abgelehnt bleiben bearbeitbar', () => {
  assert.equal(schreibGate({ status: 'offen' }, {}).ok, true);
  assert.equal(schreibGate({ status: 'abgelehnt' }, {}).ok, true);
});

test('schreibGate: Migration legt eine neue Woche als genehmigt an (IHK-Import)', () => {
  assert.deepStrictEqual(schreibGate(null, { migration: true, wunschStatus: 'genehmigt' }),
    { ok: true, status: 'genehmigt' });
});

test('schreibGate: Migration überschreibt eine importierte genehmigte Woche erneut', () => {
  // Kein KorrigiertVon ⇒ die Abnahme stammt nicht aus dieser App.
  assert.deepStrictEqual(
    schreibGate({ status: 'genehmigt', korrigiertVon: null }, { migration: true, wunschStatus: 'genehmigt' }),
    { ok: true, status: 'genehmigt' });
});

test('schreibGate: Migration schreibt NICHT über eine hier erteilte Abnahme', () => {
  for (const status of ['freigegeben', 'erstgenehmigt', 'genehmigt']) {
    const g = schreibGate({ status, korrigiertVon: 'U1' }, { migration: true, wunschStatus: 'offen' });
    assert.equal(g.ok, false, `${status} + KorrigiertVon muss blocken`);
    assert.match(g.grund, /bereits geprüft/);
  }
});

test('schreibGate: Migration schreibt NICHT ueber eine Abnahme, die nur noch den Namen traegt', () => {
  // Der Retention-Job nullt KorrigiertVon und behaelt KorrigiertVonName
  // (PHASE_B, services/retention.js). Ohne diesen zweiten Marker verlaeuft der
  // Schreibschutz einer in DIESER App gegengezeichneten Woche ins Leere, sobald
  // der Pruefer geloescht ist: ein noch aktiver Azubi koennte dieselbe IHK-PDF
  // erneut importieren und Inhalt UND Status der Woche ueberschreiben.
  for (const status of ['freigegeben', 'erstgenehmigt', 'genehmigt']) {
    const g = schreibGate(
      { status, korrigiertVon: null, korrigiertVonName: 'Muster, Max' },
      { migration: true, wunschStatus: 'offen' },
    );
    assert.equal(g.ok, false, `${status} + KorrigiertVonName muss blocken`);
    assert.match(g.grund, /bereits geprüft/);
  }
});

test('schreibGate: Migration ueberschreibt eine importierte Woche ohne beide Marker', () => {
  // Gegenprobe zum Test darueber: fehlen BEIDE Marker, stammt die Abnahme aus
  // der IHK-Plattform und ein erneuter Import darf sie geradeziehen.
  assert.deepStrictEqual(
    schreibGate({ status: 'genehmigt', korrigiertVon: null, korrigiertVonName: null },
      { migration: true, wunschStatus: 'genehmigt' }),
    { ok: true, status: 'genehmigt' });
});

test('schreibGate: Migration weist einen unbekannten Status ab', () => {
  const g = schreibGate(null, { migration: true, wunschStatus: 'irgendwas' });
  assert.equal(g.ok, false);
  assert.match(g.grund, /Unbekannter Status/);
});

test('schreibGate: Migration ohne Status behält den bestehenden bzw. offen', () => {
  assert.equal(schreibGate(null, { migration: true }).status, 'offen');
  assert.equal(schreibGate({ status: 'abgelehnt' }, { migration: true }).status, 'abgelehnt');
});

test('Azubi kommt über den Status-Automaten nie an eine Genehmigung', () => {
  const ziele = ['offen', 'freigegeben', 'erstgenehmigt', 'genehmigt', 'abgelehnt']
    .flatMap(s => wochenAktionen('azubi', s, 0).map(a => a.zielStatus));
  assert.deepStrictEqual([...new Set(ziele)].sort(), ['freigegeben', 'offen']);
});

// ── Rücknahme eines Statuswechsels (Migration 037 + RUECKNAHME_TAGE) ──
// letzte = { statusVorher, endabnahmeDirektVorher, korrigiertAm, jetzt }
const JETZT = '2026-08-24T10:00:00Z';
function tageVorher(n) {
  return new Date(Date.parse(JETZT) - n * 86400000).toISOString();
}
function ruecknahmen(rolle, status, flag, letzte) {
  return wochenAktionen(rolle, status, flag, { jetzt: JETZT, ...letzte })
    .filter(a => a.aktion === 'zuruecknehmen')
    .map(a => `${a.zielStatus}:${a.endabnahmeDirekt}`);
}

test('Ausbilder nimmt die Endabnahme innerhalb der Frist zurück – auf den echten Vorstatus', () => {
  assert.deepStrictEqual(ruecknahmen('ausbilder', 'genehmigt', 0,
    { statusVorher: 'erstgenehmigt', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(3) }),
    ['erstgenehmigt:0']);
});

test('Nach 4 Wochen ist die Genehmigung endgültig', () => {
  assert.deepStrictEqual(ruecknahmen('ausbilder', 'genehmigt', 0,
    { statusVorher: 'erstgenehmigt', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(29) }), []);
  assert.deepStrictEqual(ruecknahmen('ausbilder', 'genehmigt', 0,
    { statusVorher: 'erstgenehmigt', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(27) }),
    ['erstgenehmigt:0']);
});

test('Rücknahme stellt EndabnahmeDirekt wieder her (zweimal zurückgegebene Woche)', () => {
  assert.deepStrictEqual(ruecknahmen('ausbilder', 'abgelehnt', 1,
    { statusVorher: 'freigegeben', endabnahmeDirektVorher: 1, korrigiertAm: tageVorher(1) }),
    ['freigegeben:1']);
});

test('Prüfer kommt nicht an die Wechsel des Ausbilders', () => {
  assert.deepStrictEqual(ruecknahmen('pruefer', 'genehmigt', 0,
    { statusVorher: 'erstgenehmigt', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(1) }), []);
  // 'abgelehnt' mit Flag 1 = vom Ausbilder zurückgegeben
  assert.deepStrictEqual(ruecknahmen('pruefer', 'abgelehnt', 1,
    { statusVorher: 'freigegeben', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(1) }), []);
  // eigene Erstgenehmigung dagegen schon
  assert.deepStrictEqual(ruecknahmen('pruefer', 'erstgenehmigt', 0,
    { statusVorher: 'freigegeben', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(1) }),
    ['freigegeben:0']);
});

test('Ohne gespeicherten Vorstatus (Altbestand) gibt es keine Rücknahme', () => {
  assert.deepStrictEqual(ruecknahmen('ausbilder', 'genehmigt', 0,
    { statusVorher: null, endabnahmeDirektVorher: null, korrigiertAm: tageVorher(1) }), []);
  assert.deepStrictEqual(wochenAktionen('ausbilder', 'genehmigt', 0), []);
});

test('Azubi bekommt nie eine Rücknahme angeboten', () => {
  assert.deepStrictEqual(ruecknahmen('azubi', 'abgelehnt', 0,
    { statusVorher: 'freigegeben', endabnahmeDirektVorher: 0, korrigiertAm: tageVorher(1) }), []);
});
