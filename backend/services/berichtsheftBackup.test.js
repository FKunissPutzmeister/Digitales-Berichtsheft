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

test('slugName: Umlaute, Akzente und Sonderzeichen werden dateisicher', () => {
  assert.equal(B.slugName('Kuniß, Florian'), 'kuniss-florian');
  assert.equal(B.slugName('Müller, Lena-Sophie'), 'mueller-lena-sophie');
  assert.equal(B.slugName('Hofer, Jana Ödön'), 'hofer-jana-oedoen');
  assert.equal(B.slugName('José Ávila'), 'jose-avila');
  assert.equal(B.slugName('  ...  '), '');
  assert.equal(B.slugName(null), '');
});

test('dateiName: Slug plus OID, bei fehlendem Namen nur die OID', () => {
  assert.equal(B.dateiName({ oid: 'ABC-1', name: 'Kuniß, Florian' }),
    'kuniss-florian_ABC-1.json');
  assert.equal(B.dateiName({ oid: 'ABC-2', name: '' }), 'ABC-2.json');
  assert.equal(B.dateiName({ oid: 'ABC-3' }), 'ABC-3.json');
  // Ein Slug beginnt nie mit '_' — daher keine Kollision mit _manifest.json
  assert.ok(!B.dateiName({ oid: 'X', name: '_manifest' }).startsWith('_'));
});

test('tagesOrdnerName: YYYY-MM-DD in Ortszeit, istTagesOrdnerName erkennt es', () => {
  assert.equal(B.tagesOrdnerName(new Date(2026, 6, 31, 2, 0, 0)), '2026-07-31');
  assert.equal(B.tagesOrdnerName(new Date(2026, 0, 5, 23, 59, 0)), '2026-01-05');
  assert.ok(B.istTagesOrdnerName('2026-07-31'));
  assert.ok(!B.istTagesOrdnerName('_manifest.json'));
  assert.ok(!B.istTagesOrdnerName('notizen'));
  assert.ok(!B.istTagesOrdnerName('2026-7-1'));
});

test('msBisNaechsteUhrzeit: heute wenn noch nicht erreicht, sonst morgen', () => {
  const std = 3600 * 1000;
  // 00:30 → 02:00 heute = 1,5 h
  assert.equal(B.msBisNaechsteUhrzeit(2, new Date(2026, 6, 31, 0, 30, 0)), 1.5 * std);
  // 02:00 genau → nächster Lauf morgen (nie 0, sonst Endlos-Timer)
  assert.equal(B.msBisNaechsteUhrzeit(2, new Date(2026, 6, 31, 2, 0, 0)), 24 * std);
  // 09:00 → 02:00 am Folgetag = 17 h
  assert.equal(B.msBisNaechsteUhrzeit(2, new Date(2026, 6, 31, 9, 0, 0)), 17 * std);
});

/* Fake-Pool im Muster von vertretungen.test.js: liefert je nach SQL-Text ein
   Recordset. Keine echte DB. */
function fakePool(handler) {
  return {
    request() {
      const inputs = {};
      const api = {
        input(name, _type, val) { inputs[name] = val; return api; },
        query: async (sqlText) => ({ recordset: handler(sqlText, inputs) || [] }),
      };
      return api;
    },
  };
}

test('listAzubis: OIDs kommen aus Wochen, Stammdaten aus Users', async () => {
  const pool = fakePool((sqlText) => {
    assert.match(sqlText, /FROM dbo\.Wochen/i);
    return [
      { WocheAzubiOid: 'OID-1', Oid: 'OID-1', Name: 'Kuniß, Florian',
        Email: 'f@x.demo', Role: 'azubi', Beruf: 'Mechatroniker',
        BerichtTyp: 'wöchentlich', AusbildungBeginn: new Date('2024-09-01T00:00:00Z'),
        AusbildungEnde: new Date('2027-08-31T00:00:00Z'), Aktiv: true },
      // Datenrest ohne Nutzerkonto: alle u.*-Spalten sind NULL
      { WocheAzubiOid: 'OID-WAISE', Oid: null, Name: null, Email: null, Role: null },
    ];
  });

  const azubis = await B.listAzubis(pool);
  assert.equal(azubis.length, 2);
  assert.equal(azubis[0].oid, 'OID-1');
  assert.equal(azubis[0].name, 'Kuniß, Florian');
  assert.equal(azubis[0].beruf, 'Mechatroniker');
  assert.equal(azubis[0].ausbildungsBeginn, '2024-09-01');
  // Waise: OID aus der Wochen-Tabelle, Stammdaten leer statt Absturz
  assert.equal(azubis[1].oid, 'OID-WAISE');
  assert.equal(azubis[1].name, '');
});

test('ladeWochen: filtert auf den Azubi und parst tage/kommentare aus JSON', async () => {
  let genutzteInputs = null;
  const pool = fakePool((sqlText, inputs) => {
    genutzteInputs = inputs;
    assert.match(sqlText, /WHERE w\.AzubiOid = @azubiOid/i);
    assert.match(sqlText, /FOR JSON PATH/i);
    return [{
      Id: 12, AzubiOid: 'OID-1', KW: 31, Jahr: 2026, Status: 'offen',
      tageJson: '[{"Id":100,"WocheId":12,"Datum":"2026-07-27T00:00:00","Anwesenheit":"anwesend"}]',
      kommentareJson: null,
    }];
  });

  const wochen = await B.ladeWochen('OID-1', pool);
  assert.equal(genutzteInputs.azubiOid, 'OID-1');
  assert.equal(wochen.length, 1);
  assert.equal(wochen[0].tage.length, 1);
  assert.equal(wochen[0].tage[0].Id, 100);
  assert.deepEqual(wochen[0].kommentare, []);       // NULL → leeres Array
  // Die Roh-JSON-Felder gehören nicht in den Payload
  assert.equal(wochen[0].tageJson, undefined);
  assert.equal(wochen[0].kommentareJson, undefined);
});

test('ladeWochen-Ergebnis passt direkt in buildBackupPayload', async () => {
  const pool = fakePool(() => [{
    Id: 12, AzubiOid: 'OID-1', KW: 31, Jahr: 2026,
    StartDatum: new Date('2026-07-27T00:00:00Z'), Status: 'offen',
    tageJson: '[{"Id":100,"WocheId":12,"Datum":"2026-07-27T00:00:00","Anwesenheit":"krank"}]',
    kommentareJson: null,
  }]);
  const wochen = await B.ladeWochen('OID-1', pool);
  const p = B.buildBackupPayload({ oid: 'OID-1', name: 'A B' }, wochen, JETZT);
  assert.equal(p.wochen[0].startDate, '2026-07-27');
  assert.equal(p.wochen[0].tage[0].anwesenheit, 'Arbeitsunfähigkeit');
});
