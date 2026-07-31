'use strict';
/* Nagelt das Backup-Format fest. Der Job schreibt Dateien, die über den
   "Wiederherstellen"-Dialog im Profil einspielbar sein müssen — ändert sich
   das Client-Format (app/js/api.js normalizeWoche/-Tag/-Kommentar), MUSS
   dieser Test rot werden. Keine echte DB, keine echten Verzeichnisse. */
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./berichtsheftBackup.js');

const AZUBI = {
  oid: '00000000-0000-0000-0000-000000000001',
  name: 'Kuniß, Florian',
  email: 'florian.kuniss.demo@putzmeister.com',
  beruf: 'Mechatroniker',
  berichtTyp: 'wöchentlich',
  ausbildungsBeginn: '2024-09-01',
  ausbildungsEnde: '2027-08-31',
};

// Wochen-Spalten kommen vom mssql-Treiber als Date-Objekte.
function wocheRow(over = {}) {
  return {
    Id: 12,
    AzubiOid: '00000000-0000-0000-0000-000000000001',
    KW: 31,
    Jahr: 2026,
    StartDatum: new Date('2026-07-27T00:00:00Z'),
    EndDatum: new Date('2026-08-02T00:00:00Z'),
    Status: 'genehmigt',
    EndabnahmeDirekt: 0,
    Gesamtstunden: 38.5,
    Typ: null,
    WochenOrt: null,
    UnterweisungAktiv: 0,
    BetriebEintrag: null,
    SchuleEintrag: 'Blockschule',
    UnterweisungEintrag: null,
    KorrigiertVon: null,
    KorrigiertAm: null,
    EingereichtVon: '00000000-0000-0000-0000-000000000001',
    EingereichtAm: new Date('2026-08-03T09:15:00Z'),
    tage: [],
    kommentare: [],
    ...over,
  };
}

// Tage/Kommentare kommen aus FOR JSON PATH — also als ISO-STRINGS.
function tagRow(over = {}) {
  return {
    Id: 100, WocheId: 12, Datum: '2026-07-27T00:00:00',
    Anwesenheit: 'anwesend', Ort: 'Betrieb', Eintrag: 'Montagsarbeit',
    Tagdauer: 'ganztag', BetriebEintrag: null, SchuleEintrag: null,
    UnterweisungEintrag: null, Abwesenheitsnotiz: null, UnterweisungAktiv: 0,
    ...over,
  };
}

const JETZT = new Date('2026-07-31T02:00:00Z');

test('buildBackupPayload: Hülle und Azubi-Block wie im manuellen Backup', () => {
  const p = B.buildBackupPayload(AZUBI, [wocheRow()], JETZT);
  assert.equal(p.format, 'berichtsheft-backup');
  assert.equal(p.version, 1);
  assert.equal(p.exportiertAm, '2026-07-31T02:00:00.000Z');
  assert.deepEqual(p.azubi, {
    oid: '00000000-0000-0000-0000-000000000001',
    name: 'Kuniß, Florian',
    email: 'florian.kuniss.demo@putzmeister.com',
    beruf: 'Mechatroniker',
    berichtTyp: 'wöchentlich',
    ausbildungsBeginn: '2024-09-01',
    ausbildungsEnde: '2027-08-31',
  });
  assert.equal(p.wochen.length, 1);
});

test('buildBackupPayload: fehlende Azubi-Stammdaten werden zu leeren Strings', () => {
  const p = B.buildBackupPayload({ oid: 'X' }, [], JETZT);
  assert.deepEqual(p.azubi, {
    oid: 'X', name: '', email: '', beruf: '',
    berichtTyp: '', ausbildungsBeginn: '', ausbildungsEnde: '',
  });
  assert.deepEqual(p.wochen, []);
});

test('buildBackupPayload: Wochen-Keys entsprechen exakt normalizeWoche (api.js)', () => {
  const [w] = B.buildBackupPayload(AZUBI, [wocheRow()], JETZT).wochen;
  assert.deepEqual(Object.keys(w).sort(), [
    'azubiId', 'betriebEintrag', 'endDate', 'endabnahmeDirekt', 'eingereichtAm',
    'eingereichtVon', 'erlaubteAktionen', 'gesamtstunden', 'id', 'kommentare',
    'korrigiertAm', 'korrigiertVon', 'kw', 'schuleEintrag', 'startDate',
    'status', 'tage', 'typ', 'unterweisungAktiv', 'unterweisungEintrag',
    'viewerRolle', 'wochenOrt', 'year',
  ].sort());
});

test('buildBackupPayload: Wochenfelder werden korrekt umbenannt und normalisiert', () => {
  const [w] = B.buildBackupPayload(AZUBI, [wocheRow()], JETZT).wochen;
  assert.equal(w.id, 12);
  assert.equal(w.azubiId, '00000000-0000-0000-0000-000000000001');
  assert.equal(w.kw, 31);
  assert.equal(w.year, 2026);
  assert.equal(w.startDate, '2026-07-27');
  assert.equal(w.endDate, '2026-08-02');
  assert.equal(w.status, 'genehmigt');
  assert.equal(w.endabnahmeDirekt, false);       // 0 → false
  assert.equal(w.gesamtstunden, 38.5);
  assert.equal(w.betriebEintrag, '');            // null → ''
  assert.equal(w.schuleEintrag, 'Blockschule');
  assert.equal(w.eingereichtAm, '2026-08-03');
  assert.equal(w.korrigiertAm, '');              // null → ''
  assert.equal(w.viewerRolle, null);             // Annotation: konstant
  assert.deepEqual(w.erlaubteAktionen, []);      // Annotation: konstant
});

test('buildBackupPayload: Tag-Keys entsprechen exakt normalizeTag (api.js)', () => {
  const rows = [wocheRow({ tage: [tagRow()] })];
  const [t] = B.buildBackupPayload(AZUBI, rows, JETZT).wochen[0].tage;
  assert.deepEqual(Object.keys(t).sort(), [
    'abwesenheitsnotiz', 'anwesenheit', 'betriebEintrag', 'datum', 'eintrag',
    'id', 'ort', 'schuleEintrag', 'tagdauer', 'unterweisungAktiv',
    'unterweisungEintrag', 'wocheId',
  ].sort());
  assert.equal(t.datum, '2026-07-27');   // ISO-String aus FOR JSON PATH
  assert.equal(t.eintrag, 'Montagsarbeit');
  assert.equal(t.abwesenheitsnotiz, '');  // null → ''
  assert.equal(t.unterweisungAktiv, false);
});

test('buildBackupPayload: Altbestand-Werte werden gemappt', () => {
  const rows = [wocheRow({ tage: [
    tagRow({ Id: 1, Anwesenheit: 'krank',    Ort: 'Zuhause' }),
    tagRow({ Id: 2, Anwesenheit: 'anwesend', Ort: 'Dienstreise' }),
    tagRow({ Id: 3, Anwesenheit: null,       Ort: null, Tagdauer: 'halbtag' }),
    tagRow({ Id: 4, Anwesenheit: 'Urlaub',   Ort: 'Schule', Tagdauer: null }),
  ] })];
  const tage = B.buildBackupPayload(AZUBI, rows, JETZT).wochen[0].tage;
  assert.equal(tage[0].anwesenheit, 'Arbeitsunfähigkeit');
  assert.equal(tage[0].ort, 'Betrieb');
  assert.equal(tage[1].ort, 'Betrieb');
  assert.equal(tage[2].anwesenheit, '');
  assert.equal(tage[2].ort, '');
  assert.equal(tage[2].tagdauer, 'halbtag');
  assert.equal(tage[3].anwesenheit, 'Urlaub');
  assert.equal(tage[3].ort, 'Schule');
  assert.equal(tage[3].tagdauer, 'ganztag');   // null → Default
});

test('buildBackupPayload: Kommentare werden auf die Client-Form gebracht', () => {
  const rows = [wocheRow({ kommentare: [
    { Id: 7, WocheId: 12, UserOid: 'OID-P', Text: 'Bitte ergänzen',
      Datum: '2026-08-04T10:00:00', Typ: 'korrektur', TagId: 100 },
    { Id: 8, WocheId: 12, UserOid: 'OID-P', Text: 'Passt',
      Datum: '2026-08-05T08:30:00', Typ: 'hinweis' },
  ] })];
  const ks = B.buildBackupPayload(AZUBI, rows, JETZT).wochen[0].kommentare;
  assert.deepEqual(Object.keys(ks[0]).sort(),
    ['datum', 'id', 'tagId', 'text', 'typ', 'userId', 'wocheId'].sort());
  assert.equal(ks[0].userId, 'OID-P');
  assert.equal(ks[0].datum, '2026-08-04');
  assert.equal(ks[0].tagId, 100);
  assert.equal(ks[1].tagId, null);   // fehlendes TagId → null
});

test('buildBackupPayload: fehlende/kaputte Datumswerte werden zu leeren Strings', () => {
  const rows = [wocheRow({ StartDatum: null, EndDatum: new Date('kaputt') })];
  const [w] = B.buildBackupPayload(AZUBI, rows, JETZT).wochen;
  assert.equal(w.startDate, '');
  assert.equal(w.endDate, '');
});
