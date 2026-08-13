'use strict';
/* Fristenlogik des Retention-Jobs. Reine Funktionen, keine DB, keine echte
   Uhr — 'jetzt' ist überall ein Parameter (Muster wie pruneOldBackups in
   berichtsheftBackup.js). */
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('./retention.js');

// Mittags-UTC bewusst gewaehlt: bei 12:00Z faellt das lokale Kalenderdatum von
// UTC-12 bis UTC+11:59 auf denselben Tag wie das UTC-Datum. Ab UTC+12 nicht
// mehr - dort ist 12:00Z bereits Mitternacht des FOLGETAGS (Neuseeland +12/+13,
// Chatham +12:45, Kiritimati +14). Und weil die real vorkommenden Offsets von
// UTC-12 bis UTC+14 reichen, also 26 Stunden ueberspannen, kann KEIN fester
// Zeitpunkt universell sicher sein: 24 Stunden Kalendertag decken 26 Stunden
// Offset-Spanne nicht ab. 12:00Z ist nur die breiteste erreichbare Auswahl und
// deckt jede Zeitzone ab, in der dieses Projekt betrieben wird.
// Vorher stand hier 03:00Z, was schon in Europa/Amerika bricht: unter
// TZ=America/Los_Angeles faellt 03:00Z auf den 14. lokal (20:00 Ortszeit) -
// der istFaellig-Sperre-Test unten haette dort das falsche Ergebnis erwartet.
// GENAU DESHALB benutzen die beiden kritischen Grenztests der Sperre unten
// (sperreGreift, Ortsdatum) kein echtes Date, sondern ein duck-typed 'jetzt'
// mit absichtlich widerspruechlichen lokalen und UTC-Anteilen - nur so ist die
// Zusicherung von der Zeitzone der ausfuehrenden Maschine wirklich unabhaengig.
const JETZT = new Date('2027-06-15T12:00:00.000Z');

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

/* ── Phasenlisten ───────────────────────────────────────────────
   Die Reihenfolge ist fachlich erzwungen, nicht von der DB: es gibt fast
   keine Fremdschlüssel auf dbo.Users. Diese Tests sind die einzige Stelle,
   die eine falsche Umsortierung bemerkt. */

const idx = (liste, tabelle) => liste.findIndex(e => e.tabelle === tabelle);

test('PHASE_A: Benachrichtigungen zuerst - sie verweisen auf Wochen UND Zuweisungen', () => {
  assert.equal(idx(R.PHASE_A, 'Benachrichtigungen'), 0);
});

test('PHASE_A: Kommentare vor Tage - FK_Kommentare_Tage hat kein ON DELETE CASCADE', () => {
  assert.ok(idx(R.PHASE_A, 'Kommentare') < idx(R.PHASE_A, 'Tage'));
});

test('PHASE_A: Tage vor Wochen', () => {
  assert.ok(idx(R.PHASE_A, 'Tage') < idx(R.PHASE_A, 'Wochen'));
});

test('PHASE_A: Beurteilungen vor Zuweisungen - Beurteilungen.ZuweisungId', () => {
  assert.ok(idx(R.PHASE_A, 'Beurteilungen') < idx(R.PHASE_A, 'Zuweisungen'));
});

test('PHASE_A: Benachrichtigungen-Bedingung deckt alle VIER Wege zur Person ab', () => {
  const e = R.PHASE_A.find(x => x.tabelle === 'Benachrichtigungen');
  // Exakter Vergleich statt vier Teilstring-Regexe: 'UserOid = @oid' ist ein
  // Teilstring von 'FromUserOid = @oid', ein /UserOid = @oid/-Match wuerde also
  // auch dann noch gruen sein, wenn der erste Zweig ganz fehlt.
  // Die vier Zweige sind nicht redundant: bei 'erstgenehmigt' steht der Azubi in
  // KEINER Personenspalte (wochen.js), und Beurteilungs-Mitteilungen haben
  // FromUserOid = NULL und haengen nur ueber ZuweisungId.
  assert.equal(
    e.bedingung,
    'UserOid = @oid OR FromUserOid = @oid OR WocheId IN (@wochen) OR ZuweisungId IN (@zuw)'
  );
});

test('PHASE_A erfasst EssTag - Arbeitszeitdaten je Azubi', () => {
  const e = R.PHASE_A.find(x => x.tabelle === 'EssTag');
  assert.ok(e, 'EssTag fehlt in PHASE_A');
  assert.equal(e.bedingung, 'AzubiOid = @oid');
});

test('PHASE_A enthaelt keine Tabelle, die per ON DELETE CASCADE mitgeht', () => {
  const tabellen = R.PHASE_A.map(e => e.tabelle);
  // Anhaenge haengen an Wochen, BeurteilungKriterien an Beurteilungen.
  assert.ok(!tabellen.includes('Anhaenge'));
  assert.ok(!tabellen.includes('BeurteilungKriterien'));
});

test('PHASE_B besteht ausschliesslich aus UPDATE-Anweisungen', () => {
  for (const e of R.PHASE_B) {
    assert.match(e.anweisung, /^SET /, `${e.tabelle}: erwartet SET-Klausel`);
    assert.ok(!/DELETE/i.test(e.anweisung), `${e.tabelle}: kein DELETE in Phase B`);
  }
});

test('PHASE_B: jede Namensspalte wird per COALESCE geschrieben, nie ueberschrieben', () => {
  const mitName = R.PHASE_B.filter(e => /Name = /.test(e.anweisung));
  assert.equal(mitName.length, 3, 'erwartet drei Namensspalten');
  for (const e of mitName) {
    // Generisches Muster: prueft, dass COALESCE ueberhaupt benutzt wird und dass
    // exakt drei Spalten NAME-Zuweisungen haben. Spezifische Spaltennamen werden
    // durch einzelne Tests abgesichert (Wochen, Kommentare, Zuweisungen).
    assert.match(e.anweisung, /COALESCE\(\w+Name, @name\)/, `${e.tabelle}: COALESCE fehlt`);
  }
});

test('PHASE_B: Wochen behalten den Gegenzeichner-Namen und verlieren die OID', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Wochen');
  assert.match(e.anweisung, /KorrigiertVonName = COALESCE\(KorrigiertVonName, @name\)/);
  assert.match(e.anweisung, /KorrigiertVon = NULL/);
});

test('PHASE_B: Zuweisungen verlieren die E-Mail - sonst waere die Loeschung wirkungslos', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Zuweisungen');
  // NULL, nicht '': die Spalte ist nullable, POST/PATCH schreiben fuer
  // "kein Verantwortlicher" ebenfalls NULL, und ein '' koennte ueber
  // LOWER(v.Email) = LOWER(z.VerantwEmail) an eine Users-Zeile mit leerer
  // E-Mail andocken. Exakter Vergleich der ganzen Anweisung.
  assert.equal(e.anweisung, 'SET VerantwName = COALESCE(VerantwName, @name), VerantwEmail = NULL');
});

test('PHASE_B: Kommentare behalten den Autornamen und verlieren die OID', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Kommentare');
  // Exakter Vergleich, nicht /COALESCE\(\w+Name, @name\)/: das generische Muster
  // wuerde auch eine falsche Spalte akzeptieren, solange sie auf "Name" endet.
  assert.equal(e.anweisung, 'SET AutorName = COALESCE(AutorName, @name), UserOid = NULL');
  assert.equal(e.bedingung, 'UserOid = @oid');
});

test('PHASE_B nullt Vertretungen.ErstelltVon - der Ersteller ist sonst nirgends erfasst', () => {
  // PHASE_C loescht Vertretungen nur ueber VertretenerOid/VertreterOid. Wer als
  // Planer eine Vertretung zwischen ZWEI ANDEREN Personen eingetragen hat,
  // hinterlaesst seine OID in ErstelltVon - ein dangling GUID ist ein
  // pseudonymer Personenbezug (Spec: "Ihre OIDs werden trotzdem genullt").
  const e = R.PHASE_B.find(x => x.tabelle === 'Vertretungen');
  assert.ok(e, 'Vertretungen fehlt in PHASE_B');
  assert.equal(e.anweisung, 'SET ErstelltVon = NULL');
  assert.equal(e.bedingung, 'ErstelltVon = @oid');
});

test('PHASE_B: Benachrichtigungen werden nur genullt, nicht geloescht', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Benachrichtigungen');
  // Die Zeile gehoert dem Empfaenger: ein Azubi soll seine Mitteilung
  // "Woche genehmigt" nicht verlieren, weil der Pruefer gegangen ist.
  assert.match(e.anweisung, /FromUserOid = NULL/);
});

test('PHASE_C: Users zuletzt', () => {
  assert.equal(R.PHASE_C[R.PHASE_C.length - 1].tabelle, 'Users');
});

test('PHASE_C enthaelt UserPhotos nicht - FK_UserPhotos_Users kaskadiert', () => {
  assert.ok(!R.PHASE_C.map(e => e.tabelle).includes('UserPhotos'));
});

test('PHASE_C: AbteilungVerantwortliche bindet ueber OID UND E-Mail', () => {
  const e = R.PHASE_C.find(x => x.tabelle === 'AbteilungVerantwortliche');
  // Exakter Vergleich: /Oid = @oid/ haette auch in AzubiOid, UserOid,
  // AusbilderOid etc. gematcht und verdeckt falsch geschriebene Bedingungen.
  assert.equal(e.bedingung, 'Oid = @oid OR LOWER(Email) = LOWER(@email)');
});

/* ── Selbstprüfung: SPALTEN-granular, nicht tabellen-granular ────
   Eine tabellen-granulare Prüfung ist blind für eine NEUE personenbezogene
   Spalte auf einer bereits bekannten Tabelle — genau so blieb
   Vertretungen.ErstelltVon zwölf Reviews lang unentdeckt. */

test('istBekannteSpalte deckt jede Spalte ab, die eine der drei Phasen anfasst', () => {
  // Diese Menge wird im Modul AUS den Phasenlisten abgeleitet; die Liste hier
  // ist die unabhaengige Gegenprobe, dass die Ableitung wirklich alles erwischt.
  const ausPhasen = [
    ['Benachrichtigungen', 'UserOid'], ['Benachrichtigungen', 'FromUserOid'],
    ['Wochen', 'AzubiOid'], ['Wochen', 'KorrigiertVon'],
    ['Kommentare', 'UserOid'],
    ['Zuweisungen', 'AzubiOid'], ['Zuweisungen', 'VerantwEmail'],
    ['Beurteilungen', 'AzubiOid'], ['Beurteilungen', 'BeurteiltVon'],
    ['Beurteilungen', 'KenntnisnahmeVon'], ['Beurteilungen', 'KorrigiertVon'],
    ['Anhaenge', 'HochgeladenVon'],
    ['FahrtgeldKonfig', 'AzubiOid'], ['EssTag', 'AzubiOid'],
    ['AusbilderAzubis', 'AzubiOid'], ['AusbilderAzubis', 'AusbilderOid'],
    ['AbteilungVerantwortliche', 'Oid'], ['AbteilungVerantwortliche', 'Email'],
    ['Vertretungen', 'VertretenerOid'], ['Vertretungen', 'VertreterOid'],
    ['Vertretungen', 'ErstelltVon'],
    ['McpLog', 'UserOid'], ['ApiKeys', 'UserOid'],
    ['Users', 'Oid'],
  ];
  for (const [tabelle, spalte] of ausPhasen) {
    assert.equal(R.istBekannteSpalte(tabelle, spalte), true, `${tabelle}.${spalte} fehlt`);
  }
});

test('istBekannteSpalte kennt die Spalten, die keine Phase ausdruecken kann', () => {
  // Handgepflegt, weil aus den Phasenlisten nicht ableitbar - jede mit Grund:
  assert.equal(R.istBekannteSpalte('UserPhotos', 'Oid'), true);          // Kaskaden-Kind
  assert.equal(R.istBekannteSpalte('Users', 'Email'), true);             // Zeile stirbt in PHASE_C
  assert.equal(R.istBekannteSpalte('Wochen', 'EingereichtVon'), true);   // azubi-exklusiv
});

test('istBekannteSpalte: bewusst ausgenommene Tabellen gelten komplett als bekannt', () => {
  // Eigene 90-Tage-Rotation (services/fehlerberichte.js).
  assert.equal(R.istBekannteSpalte('Fehlerberichte', 'BenutzerOid'), true);
  assert.equal(R.istBekannteSpalte('Fehlerberichte', 'ErledigtVon'), true);
  assert.equal(R.istBekannteSpalte('FehlerAnhaenge', 'IrgendwasOid'), true);
});

test('istBekannteSpalte: eine NEUE Spalte auf einer BEKANNTEN Tabelle ist unbekannt', () => {
  // Der eigentliche Zweck der Umstellung. Tabellen-granular waeren beide hier
  // faelschlich "bekannt", weil Vertretungen/Wochen in den Phasen stehen.
  assert.equal(R.istBekannteSpalte('Vertretungen', 'GeplantVon'), false);
  assert.equal(R.istBekannteSpalte('Wochen', 'GeprueftVonOid'), false);
  // Und eine ganz neue Tabelle natuerlich auch.
  assert.equal(R.istBekannteSpalte('NeueTabelle', 'AzubiOid'), false);
});

test('istBekannteSpalte vergleicht Gross-/Kleinschreibung nicht mit', () => {
  // SQL Server ist bei Bezeichnern nicht case-sensitiv; INFORMATION_SCHEMA
  // liefert die Schreibweise aus dem CREATE TABLE.
  assert.equal(R.istBekannteSpalte('wochen', 'korrigiertvon'), true);
  assert.equal(R.istBekannteSpalte('WOCHEN', 'KORRIGIERTVON'), true);
});

test('istBekannteSpalte: kein Teilstring-Treffer zwischen aehnlichen Spalten', () => {
  // UserOid steckt in FromUserOid, Oid in AzubiOid. Der Vergleich muss exakt
  // sein - McpLog fuehrt nur UserOid, kein FromUserOid.
  assert.equal(R.istBekannteSpalte('McpLog', 'FromUserOid'), false);
  assert.equal(R.istBekannteSpalte('ApiKeys', 'AzubiOid'), false);
});

function schemaPool(zeilen) {
  return { request: () => ({ query: async () => ({ recordset: zeilen }) }) };
}

test('pruefeUnbekannteSpalten meldet Tabelle.Spalte, nicht bloss die Tabelle', async () => {
  const treffer = await R.pruefeUnbekannteSpalten(schemaPool([
    { TABLE_NAME: 'Wochen',       COLUMN_NAME: 'KorrigiertVon' },
    { TABLE_NAME: 'Vertretungen', COLUMN_NAME: 'GeplantVon' },
    { TABLE_NAME: 'NeueTabelle',  COLUMN_NAME: 'AzubiOid' },
  ]));
  assert.deepEqual(treffer, ['Vertretungen.GeplantVon', 'NeueTabelle.AzubiOid']);
});

test('pruefeUnbekannteSpalten: vollstaendig bekanntes Schema ergibt eine leere Liste', async () => {
  const treffer = await R.pruefeUnbekannteSpalten(schemaPool([
    { TABLE_NAME: 'Users',        COLUMN_NAME: 'Oid' },
    { TABLE_NAME: 'Users',        COLUMN_NAME: 'Email' },
    { TABLE_NAME: 'UserPhotos',   COLUMN_NAME: 'Oid' },
    { TABLE_NAME: 'Wochen',       COLUMN_NAME: 'EingereichtVon' },
    { TABLE_NAME: 'Fehlerberichte', COLUMN_NAME: 'ErledigtVon' },
  ]));
  assert.deepEqual(treffer, []);
});

/* ── SQL-Erzeugung und Löschtransaktion ─────────────────────────── */

const USER = {
  oid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Muster, Max', email: 'max.muster@putzmeister.com',
  aktiv: false, inaktivSeit: '2020-01-01T00:00:00.000Z', loeschsperreBis: null,
};

test('baueAnweisungen: Platzhalter @wochen und @zuw werden zu Subselects', () => {
  const alle = R.baueAnweisungen(USER);
  const ben = alle.find(a => a.tabelle === 'Benachrichtigungen' && a.phase === 'A');
  assert.match(ben.sql, /WocheId IN \(SELECT Id FROM dbo\.Wochen WHERE AzubiOid = @oid\)/);
  assert.match(ben.sql, /ZuweisungId IN \(SELECT Id FROM dbo\.Zuweisungen WHERE AzubiOid = @oid\)/);
});

test('baueAnweisungen: Phase A erzeugt DELETE, Phase B UPDATE, Phase C DELETE', () => {
  const alle = R.baueAnweisungen(USER);
  const a = alle.filter(x => x.phase === 'A');
  const b = alle.filter(x => x.phase === 'B');
  const c = alle.filter(x => x.phase === 'C');
  assert.ok(a.length && b.length && c.length);
  for (const x of a) assert.match(x.sql, /^DELETE FROM dbo\./);
  for (const x of b) assert.match(x.sql, /^UPDATE dbo\./);
  for (const x of c) assert.match(x.sql, /^DELETE FROM dbo\./);
});

test('baueAnweisungen: Reihenfolge ist A, dann B, dann C', () => {
  const phasen = R.baueAnweisungen(USER).map(a => a.phase);
  assert.deepEqual([...new Set(phasen)], ['A', 'B', 'C']);
  // Users ganz am Ende
  assert.equal(R.baueAnweisungen(USER).at(-1).tabelle, 'Users');
});

test('baueAnweisungen: keine Zeichenkettenverkettung von @oid - alles parametrisiert', () => {
  const boese = { ...USER, oid: "x'; DROP TABLE dbo.Users; --" };
  for (const a of R.baueAnweisungen(boese)) {
    assert.ok(!a.sql.includes('DROP TABLE'), `${a.tabelle}: OID darf nie im SQL-Text landen`);
    assert.ok(!a.sql.includes(boese.oid));
  }
});

test('loescheNutzer: fuehrt alle Anweisungen in einer Transaktion aus und zaehlt Zeilen', async () => {
  const ausgefuehrt = [];
  const tx = {
    begin: async () => { ausgefuehrt.push('BEGIN'); },
    commit: async () => { ausgefuehrt.push('COMMIT'); },
    rollback: async () => { ausgefuehrt.push('ROLLBACK'); },
  };
  const request = () => {
    const api = {
      input: () => api,
      query: (text) => {
        ausgefuehrt.push(text.split('\n')[0].trim());
        return Promise.resolve({ rowsAffected: [2] });
      },
    };
    return api;
  };

  const bericht = await R.loescheNutzer(USER, { tx, request });

  assert.equal(ausgefuehrt[0], 'BEGIN');
  assert.equal(ausgefuehrt.at(-1), 'COMMIT');
  assert.ok(!ausgefuehrt.includes('ROLLBACK'));
  // Jede Tabelle taucht mit ihrer Zeilenzahl im Bericht auf.
  assert.equal(bericht.tabellen.Users, 2);
  assert.equal(bericht.tabellen.Wochen, 4); // Phase A + Phase B je 2
  // phaseB zaehlt nur die Anonymisierungen in FREMDEN Heften.
  assert.equal(bericht.phaseB, R.PHASE_B.length * 2);
});

test('loescheNutzer: Person ohne Berichtsheft - Phase A trifft nichts, B und C laufen trotzdem', async () => {
  const ausgefuehrt = [];
  const tx = { begin: async () => {}, commit: async () => { ausgefuehrt.push('COMMIT'); }, rollback: async () => {} };
  const request = () => {
    const api = {
      input: () => api,
      // Kein eigenes Heft: DELETEs treffen 0 Zeilen, die UPDATEs aus Phase B
      // (Gegenzeichnungen in fremden Heften) sehr wohl. Genau der Fall eines
      // reinen Pruefer-Kontos - und der Grund, warum der Job NICHT nach Rolle
      // verzweigt (siehe Spec, Kern-Erkenntnis 1).
      query: (text) => Promise.resolve({ rowsAffected: [/^UPDATE/.test(text) ? 1 : 0] }),
    };
    return api;
  };

  const bericht = await R.loescheNutzer(USER, { tx, request });

  assert.ok(ausgefuehrt.includes('COMMIT'));
  assert.equal(bericht.tabellen.Tage, 0);
  assert.equal(bericht.phaseB, R.PHASE_B.length);
});

test('loescheNutzer: ein Fehler rollt die gesamte Transaktion zurueck', async () => {
  const ausgefuehrt = [];
  const tx = {
    begin: async () => { ausgefuehrt.push('BEGIN'); },
    commit: async () => { ausgefuehrt.push('COMMIT'); },
    rollback: async () => { ausgefuehrt.push('ROLLBACK'); },
  };
  let n = 0;
  const request = () => {
    const api = {
      input: () => api,
      query: () => {
        n++;
        // Mitten in Phase B abbrechen: der schlimmste Zustand waere
        // "Heft geloescht, Konto und Belege noch da".
        if (n === 9) return Promise.reject(new Error('Deadlock'));
        return Promise.resolve({ rowsAffected: [1] });
      },
    };
    return api;
  };

  await assert.rejects(() => R.loescheNutzer(USER, { tx, request }), /Deadlock/);
  assert.ok(ausgefuehrt.includes('ROLLBACK'));
  assert.ok(!ausgefuehrt.includes('COMMIT'));
});

/* Eigener Wachposten am unwiderruflichen Einstiegspunkt. ermittleKandidaten
   filtert, aber loescheNutzer loescht bisher jedes Objekt, das man ihm gibt —
   und die Abnahme-Checkliste laesst einen Operator eine listKandidaten-Filter-
   zeile HANDSCHREIBEN, eine Zeile ueber einer echten Loeschung. Bewusst nur
   diese zwei Bedingungen: eine Sperre laeuft irgendwann legitim ab, und die
   Frist erneut zu pruefen waere die Aufgabe von istFaellig doppelt. */
test('loescheNutzer: ein AKTIVES Konto wird abgewiesen, nicht geloescht', async () => {
  let queries = 0;
  const tx = { begin: async () => { queries++; }, commit: async () => {}, rollback: async () => {} };
  const request = () => { const api = { input: () => api, query: () => { queries++; return Promise.resolve({ rowsAffected: [1] }); } }; return api; };

  await assert.rejects(
    () => R.loescheNutzer({ ...USER, aktiv: true }, { tx, request }),
    /aktiv/i,
  );
  assert.equal(queries, 0, 'die Transaktion darf nicht einmal beginnen');
});

test('loescheNutzer: ein Demo-Konto wird abgewiesen, nicht geloescht', async () => {
  let queries = 0;
  const tx = { begin: async () => { queries++; }, commit: async () => {}, rollback: async () => {} };
  const request = () => { const api = { input: () => api, query: () => { queries++; return Promise.resolve({ rowsAffected: [1] }); } }; return api; };

  await assert.rejects(
    () => R.loescheNutzer({ ...USER, email: 'lena.mueller.demo@putzmeister.com' }, { tx, request }),
    /Demo/i,
  );
  assert.equal(queries, 0, 'die Transaktion darf nicht einmal beginnen');
});

test('loescheNutzer: ein gesperrtes Konto wird NICHT abgewiesen - die Sperre laeuft ab', async () => {
  // Absichtlich keine Sperr-/Fristpruefung hier: eine abgelaufene Sperre macht
  // das Konto legitim loeschbar, und die Frist prueft istFaellig.
  const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  const request = () => { const api = { input: () => api, query: () => Promise.resolve({ rowsAffected: [0] }) }; return api; };

  const bericht = await R.loescheNutzer({ ...USER, loeschsperreBis: '2099-12-31' }, { tx, request });
  assert.equal(bericht.phaseB, 0);
});

test('loescheNutzer: boesartige OID erreicht die DB nur als gebundener Parameter, nie im SQL-Text', async () => {
  const boese = { ...USER, oid: "x'; DROP TABLE dbo.Users; --" };
  const gebundeneOids = [];
  const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {} };
  const request = () => {
    const api = {
      input: (name, _type, wert) => {
        if (name === 'oid') gebundeneOids.push(wert);
        return api;
      },
      query: (text) => {
        // Die Ende-zu-Ende-Garantie: was baueAnweisungen() strukturell schon
        // zusichert, muss auch durch loescheNutzer() hindurch stimmen - hier
        // wird tatsaechlich der SQL-Text inspiziert, der an .query() geht.
        assert.ok(!text.includes(boese.oid), 'OID darf nie im SQL-Text landen');
        assert.ok(!text.includes('DROP TABLE'), 'DROP TABLE darf nie im SQL-Text landen');
        return Promise.resolve({ rowsAffected: [0] });
      },
    };
    return api;
  };

  await R.loescheNutzer(boese, { tx, request });

  // Die OID ist tatsaechlich geflossen - nur eben ausschliesslich gebunden.
  assert.ok(gebundeneOids.length > 0);
  for (const wert of gebundeneOids) assert.equal(wert, boese.oid);
});

test('ermittleKandidaten: bildet DB-Zeilen praezise auf das user-Format ab', async () => {
  const mitSperre = {
    Oid: 'g1', Name: 'Muster, Max', Email: 'max.muster@putzmeister.com', Role: 'azubi',
    Aktiv: 0,
    InaktivSeit: new Date('2026-01-15T09:30:00.000Z'),
    LoeschsperreBis: new Date('2027-03-01T00:00:00.000Z'),
  };
  const ohneStempel = {
    Oid: 'g2', Name: 'Ohne, Sperre', Email: null, Role: 'pruefer',
    Aktiv: 0, InaktivSeit: null, LoeschsperreBis: null,
  };
  const pool = {
    request: () => {
      const api = { input: () => api, query: async () => ({ recordset: [mitSperre, ohneStempel] }) };
      return api;
    },
  };

  const kandidaten = await R.ermittleKandidaten(pool);

  assert.equal(kandidaten.length, 2);
  const [a, b] = kandidaten;
  assert.equal(a.oid, 'g1');
  assert.equal(a.name, 'Muster, Max');
  assert.equal(a.email, 'max.muster@putzmeister.com');
  assert.equal(a.role, 'azubi');
  assert.equal(a.aktiv, false); // Aktiv: 0 (SQL BIT) -> echtes boolean false, nicht 0
  assert.equal(a.inaktivSeit, '2026-01-15T09:30:00.000Z');
  // Bloss ein Datum, keine Uhrzeit - LoeschsperreBis ist DATE in der DB.
  assert.equal(a.loeschsperreBis, '2027-03-01');
  // NULL in InaktivSeit/LoeschsperreBis muss zu null werden - nicht zum
  // 1.1.1970 (new Date(null) ergibt Epoch, kein Fehler) und nicht zu
  // 'Invalid Date' oder undefined.
  assert.equal(b.email, null);
  assert.equal(b.inaktivSeit, null);
  assert.equal(b.loeschsperreBis, null);
});

/* ── Waisen-Ordner der IHK-Importe ──────────────────────────────
   Zustandslos: gelöscht wird jeder Ordner, dessen OID keine Users-Zeile mehr
   hat. Dadurch selbstheilend — ein fehlgeschlagenes rmSync greift der nächste
   Lauf wieder auf, ohne Merkzettel. */

function tempDirMit(ordner) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-test-'));
  for (const name of ordner) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'nachweis.pdf'), 'x');
  }
  return dir;
}

const OID_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const OID_B = 'bbbbbbbb-1111-2222-3333-444444444444';

test('raeumeWaisenDateien: loescht Ordner ohne Users-Zeile, laesst den anderen stehen', () => {
  const dir = tempDirMit([OID_A, OID_B]);
  const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set([OID_B]) });

  assert.deepEqual(res.entfernt, [OID_A]);
  assert.deepEqual(res.probleme, []);
  assert.equal(fs.existsSync(path.join(dir, OID_A)), false);
  assert.equal(fs.existsSync(path.join(dir, OID_B)), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('raeumeWaisenDateien: OID-Vergleich ist case-insensitiv', () => {
  const dir = tempDirMit([OID_A.toUpperCase()]);
  const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set([OID_A]) });

  assert.deepEqual(res.entfernt, [], 'Grossschreibung darf nicht als Waise gelten');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('raeumeWaisenDateien: ignoriert Namen, die keine GUID sind', () => {
  const dir = tempDirMit(['nicht-eine-guid', '_temp']);
  const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set() });

  assert.deepEqual(res.entfernt, [], 'Fremde Ordner bleiben unangetastet');
  assert.equal(fs.existsSync(path.join(dir, 'nicht-eine-guid')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('raeumeWaisenDateien: fehlendes Verzeichnis ist kein Fehler', () => {
  const res = R.raeumeWaisenDateien({ dir: path.join(os.tmpdir(), 'gibt-es-nicht-12345'), existierendeOids: new Set() });
  assert.deepEqual(res.entfernt, []);
  assert.deepEqual(res.probleme, []);
});

test('raeumeWaisenDateien: Einzelfehler stoppt die Schleife nicht', () => {
  const dir = tempDirMit([OID_A, OID_B]);
  const echtesRm = fs.rmSync;
  let ersterVersuch = true;
  fs.rmSync = (p, o) => {
    if (ersterVersuch && String(p).includes(OID_A)) { ersterVersuch = false; throw new Error('EPERM'); }
    return echtesRm(p, o);
  };
  try {
    const res = R.raeumeWaisenDateien({ dir, existierendeOids: new Set() });
    assert.deepEqual(res.entfernt, [OID_B], 'der zweite Ordner muss trotzdem weg sein');
    assert.equal(res.probleme.length, 1);
    assert.match(res.probleme[0], /EPERM/);
  } finally {
    fs.rmSync = echtesRm;
    echtesRm(dir, { recursive: true, force: true });
  }
});

/* ── Vorwarnung ─────────────────────────────────────────────────── */

test('VORWARN_TYP ist der Wert aus dem CHECK-Constraint', () => {
  assert.equal(R.VORWARN_TYP, 'loeschung_geplant');
});

test('sendeVorwarnung: schreibt je Empfaenger eine Mitteilung mit dem Betroffenen als Absender', async () => {
  const inserts = [];
  const pool = {
    request() {
      const inputs = {};
      const api = {
        input(n, _t, v) { inputs[n] = v; return api; },
        query(text) {
          if (/SELECT COUNT/i.test(text)) return Promise.resolve({ recordset: [{ n: 0 }] });
          inserts.push(inputs);
          return Promise.resolve({ rowsAffected: [1] });
        },
      };
      return api;
    },
  };

  const ok = await R.sendeVorwarnung(USER, { pool, empfaenger: ['p1', 'p2'] });

  assert.equal(ok, true);
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].typ, 'loeschung_geplant');
  // Der Betroffene ist der ABSENDER: die Empfaenger sehen sein inaktives Konto
  // nicht in der Nutzerliste, der Name muss aus FromUserOid kommen.
  assert.equal(inserts[0].fromOid, USER.oid);
  assert.deepEqual(inserts.map(i => i.userOid), ['p1', 'p2']);
});

/* Pool-Attrappe, die die Existenzpruefung EMPFAENGERGENAU beantwortet: genau
   so verhaelt sich die Datenbank, sobald der Schluessel den Empfaenger
   enthaelt. 'bereitsGewarnt' sind die Empfaenger, fuer die schon eine
   Mitteilung dieses Typs zu diesem Absender existiert. */
function vorwarnPool(bereitsGewarnt = []) {
  const inserts = [];
  const pool = {
    request() {
      const inputs = {};
      const api = {
        input(n, _t, v) { inputs[n] = v; return api; },
        query(text) {
          if (/SELECT COUNT/i.test(text)) {
            const n = bereitsGewarnt.includes(inputs.userOid) ? 1 : 0;
            return Promise.resolve({ recordset: [{ n }] });
          }
          inserts.push(inputs);
          return Promise.resolve({ rowsAffected: [1] });
        },
      };
      return api;
    },
  };
  return { pool, inserts };
}

test('sendeVorwarnung: idempotent je EMPFAENGER - kein zweites Senden an denselben', async () => {
  const { pool, inserts } = vorwarnPool(['p1']);

  const ok = await R.sendeVorwarnung(USER, { pool, empfaenger: ['p1'] });

  assert.equal(ok, false);
  assert.equal(inserts.length, 0, 'sonst kaeme die Meldung 30 Naechte hintereinander');
});

test('sendeVorwarnung: ein NEUER Empfaenger wird gewarnt, obwohl andere es schon sind', async () => {
  // Der Schluessel der Existenzpruefung enthielt nur Typ + Absender. Damit
  // unterdrueckte die Zeile der ERSTEN Nacht die Warnung fuer ALLE Empfaenger:
  // wer waehrend der 30 Tage KannPlanen oder die Rolle developer bekommt, wurde
  // nie gewarnt.
  const { pool, inserts } = vorwarnPool(['p1']);

  const ok = await R.sendeVorwarnung(USER, { pool, empfaenger: ['p1', 'p2'] });

  assert.equal(ok, true);
  assert.deepEqual(inserts.map((i) => i.userOid), ['p2']);
  assert.equal(inserts[0].typ, 'loeschung_geplant');
  assert.equal(inserts[0].fromOid, USER.oid);
});

test('sendeVorwarnung: die Existenzpruefung bindet Typ, Absender UND Empfaenger', async () => {
  const gefragt = [];
  const pool = {
    request() {
      const inputs = {};
      const api = {
        input(n, _t, v) { inputs[n] = v; return api; },
        query(text) {
          if (/SELECT COUNT/i.test(text)) {
            gefragt.push({ text, inputs: { ...inputs } });
            return Promise.resolve({ recordset: [{ n: 0 }] });
          }
          return Promise.resolve({ rowsAffected: [1] });
        },
      };
      return api;
    },
  };

  await R.sendeVorwarnung(USER, { pool, empfaenger: ['p1', 'p2'] });

  // Je Empfaenger eine eigene Pruefung — nicht eine fuer alle.
  assert.equal(gefragt.length, 2);
  assert.deepEqual(gefragt.map((g) => g.inputs.userOid), ['p1', 'p2']);
  // Exakter Vergleich der WHERE-Klausel: 'FromUserOid' enthaelt 'UserOid' als
  // Teilstring, ein /UserOid = @userOid/-Match waere also auch dann gruen, wenn
  // der Empfaenger im Schluessel gar nicht vorkommt.
  assert.equal(
    gefragt[0].text.replace(/\s+/g, ' ').trim(),
    'SELECT COUNT(*) AS n FROM dbo.Benachrichtigungen '
      + 'WHERE Typ = @typ AND FromUserOid = @fromOid AND UserOid = @userOid'
  );
});

test('sendeVorwarnung: ohne Empfaenger kein Insert', async () => {
  let inserts = 0;
  const pool = { request() { const api = { input: () => api, query(t) { if (/SELECT COUNT/i.test(t)) return Promise.resolve({ recordset: [{ n: 0 }] }); inserts++; return Promise.resolve({ rowsAffected: [1] }); } }; return api; } };
  assert.equal(await R.sendeVorwarnung(USER, { pool, empfaenger: [] }), false);
  assert.equal(inserts, 0);
});

/* ── sperreGreift: Vergleich auf Ortsdatum, nicht auf UTC-Datum ──────────
   Die Sperre ist im Spec auf das Ortsdatum ("heute" am Serverstandort)
   definiert, genauso wie die Frontend-Korrektur in app/js/api.js
   DateUtil.toISODate (lokale Getter, kein toISOString()). Ein Vergleich mit
   jetzt.toISOString() nimmt bei bestimmten Uhrzeiten den falschen Kalendertag.

   Ein echtes Date koennte das nur auf Maschinen zeigen, deren TZ-Offset im
   fraglichen Fenster tatsaechlich vom UTC-Datum abweicht - auf UTC selbst und
   auf jedem negativen Offset waeren alter (UTC-) und neuer (Orts-)Code
   identisch, der Test also blind (Fix-Runde 1, Punkt 2). Deshalb hier ein
   Kunst-"jetzt": lokale Datumsteile und toISOString()/getTime() weichen
   ABSICHTLICH voneinander ab. sperreGreift liest nur die lokalen Getter,
   istFaellig zusaetzlich getTime() fuer den Faelligkeits-Vergleich - beide
   werden bedient, aber mit bewusst widersprüchlichen Werten. Damit prueft der
   Test die Ortsdatum-Semantik auf JEDER Maschine, nicht nur auf manchen. */
function jetztMitLokal(lokalJahr, lokalMonat, lokalTag, utcIso) {
  return {
    getFullYear: () => lokalJahr,
    getMonth:    () => lokalMonat - 1,
    getDate:     () => lokalTag,
    getTime:     () => new Date(utcIso).getTime(),
    toISOString: () => utcIso,
  };
}

// Lokal 16.06., UTC-Anteil bewusst 15.06. (23:30Z) - genau das Fenster, in dem
// eine UTC-Berechnung den falschen Tag naehme. inaktivSeit liegt weit in der
// Vergangenheit, damit der Faelligkeits-Vergleich (ziel <= jetzt.getTime())
// nie die Ursache eines Fehlschlags sein kann - hier geht es ausschliesslich
// um sperreGreift.
test('istFaellig: Sperre auf dem lokalen "heute" haelt noch zurueck - unabhaengig von der Zeitzone', () => {
  const jetzt = jetztMitLokal(2027, 6, 16, '2027-06-15T23:30:00.000Z');
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-06-16' });
  assert.equal(R.istFaellig(u, { jetzt }), false);
});

test('istFaellig: Sperre auf dem lokalen Vortag haelt NICHT mehr zurueck - unabhaengig von der Zeitzone', () => {
  const jetzt = jetztMitLokal(2027, 6, 16, '2027-06-15T23:30:00.000Z');
  const u = konto('2020-01-01T00:00:00.000Z', { loeschsperreBis: '2027-06-15' });
  // Unter der alten UTC-Berechnung waere das UTC-Datum von jetzt ('2027-06-15')
  // identisch mit dieser Sperre - sie wuerde faelschlich noch greifen. Dieser
  // Test faellt also durch, sobald sperreGreift wieder auf toISOString()
  // zurueckgestellt wird, unabhaengig von der Maschine, auf der er laeuft.
  assert.equal(R.istFaellig(u, { jetzt }), true);
});

/* ── Orchestrierung ─────────────────────────────────────────────── */

// Drei Konten: fällig, im Vorwarnfenster, gesperrt.
function kandidatenSatz() {
  return [
    { ...USER, oid: 'faellig',  inaktivSeit: '2026-06-15T02:00:00.000Z' },
    { ...USER, oid: 'vorwarn',  inaktivSeit: '2026-07-01T02:00:00.000Z' },
    { ...USER, oid: 'gesperrt', inaktivSeit: '2026-06-15T02:00:00.000Z', loeschsperreBis: '2027-12-31' },
  ];
}

function deps(over = {}) {
  return {
    jetzt: JETZT,
    listKandidaten: async () => kandidatenSatz(),
    loescheNutzer: async () => ({ tabellen: { Users: 1 }, phaseB: 3 }),
    sendeVorwarnung: async () => true,
    empfaenger: async () => ['p1'],
    raeumeDateien: () => ({ entfernt: ['x'], probleme: [] }),
    pruefeSpalten: async () => [],
    logFehler: () => {},
    // Ohne diese Injektion würde alleUserOids() versuchen, den echten Pool zu
    // holen (getPool()) - runRetention wäre in Tests nicht ohne DB lauffähig.
    alleOids: async () => ['faellig', 'vorwarn', 'gesperrt'],
    ...over,
  };
}

test('runRetention: loescht Faellige, warnt im Fenster vor, laesst Gesperrte stehen', async () => {
  const geloescht = [];
  const gewarnt = [];
  const b = await R.runRetention(deps({
    loescheNutzer: async (u) => { geloescht.push(u.oid); return { tabellen: { Users: 1 }, phaseB: 5 }; },
    sendeVorwarnung: async (u) => { gewarnt.push(u.oid); return true; },
  }));

  assert.deepEqual(geloescht, ['faellig']);
  assert.deepEqual(gewarnt, ['vorwarn']);
  assert.equal(b.kandidaten, 3);
  assert.equal(b.geloescht, 1);
  assert.equal(b.vorgewarnt, 1);
  assert.equal(b.gesperrt, 1);
  assert.equal(b.anonymisiert, 5);
  assert.deepEqual(b.fehler, []);
});

test('runRetention: ein werfendes loescheNutzer stoppt den Lauf nicht', async () => {
  const versucht = [];
  const b = await R.runRetention(deps({
    listKandidaten: async () => [
      { ...USER, oid: 'a', inaktivSeit: '2026-06-15T02:00:00.000Z' },
      { ...USER, oid: 'b', inaktivSeit: '2026-06-15T02:00:00.000Z' },
    ],
    loescheNutzer: async (u) => {
      versucht.push(u.oid);
      if (u.oid === 'a') throw new Error('Deadlock');
      return { tabellen: { Users: 1 }, phaseB: 0 };
    },
    alleOids: async () => ['a', 'b'],
  }));

  assert.deepEqual(versucht, ['a', 'b'], 'b muss trotz Fehler bei a versucht werden');
  assert.equal(b.geloescht, 1);
  assert.equal(b.fehler.length, 1);
  assert.equal(b.fehler[0].oid, 'a');
});

test('runRetention: werfendes listKandidaten loescht nichts (fail closed)', async () => {
  let geloescht = 0;
  const b = await R.runRetention(deps({
    listKandidaten: async () => { throw new Error('DB weg'); },
    loescheNutzer: async () => { geloescht++; return { tabellen: {}, phaseB: 0 }; },
  }));

  assert.equal(geloescht, 0);
  assert.equal(b.geloescht, 0);
  assert.equal(b.kandidaten, 0);
  assert.equal(b.fehler.length, 1);
  // assert.equal statt assert.match: err.message ist hier ein exakt bekannter
  // literaler String ('DB weg'), kein Muster - assert.equal ist die staerkere,
  // zutreffende Zusicherung (siehe Projektregel zu assert.match vs. assert.equal).
  assert.equal(b.fehler[0].fehler, 'DB weg');
});

test('runRetention: unbekannte Spalte wird als Fehler gemeldet, der Lauf laeuft weiter', async () => {
  const gemeldet = [];
  const b = await R.runRetention(deps({
    pruefeSpalten: async () => ['Vertretungen.GeplantVon'],
    logFehler: (e) => gemeldet.push(e.nachricht),
  }));

  assert.equal(b.geloescht, 1, 'die Faelligen werden trotzdem geloescht');
  assert.equal(gemeldet.length, 1);
  // assert.equal statt assert.match: die Meldung ist eine vollstaendig bekannte,
  // fest formulierte Zeichenkette - kein Muster, ein Wert.
  assert.equal(
    gemeldet[0],
    '[retention] Spalten mit Personenbindung, die der Loeschjob NICHT kennt: Vertretungen.GeplantVon — personenbezogene Daten bleiben dort liegen.'
  );
});

test('runRetention: Dateiaufraeumung bekommt die OIDs der VERBLEIBENDEN Nutzer', async () => {
  let gesehen = null;
  await R.runRetention(deps({
    raeumeDateien: ({ existierendeOids }) => { gesehen = existierendeOids; return { entfernt: [], probleme: [] }; },
  }));

  // 'faellig' ist gelöscht, darf also NICHT als existierend gelten —
  // sonst bliebe sein IHK-PDF liegen.
  assert.equal(gesehen.has('faellig'), false);
  assert.equal(gesehen.has('vorwarn'), true);
  assert.equal(gesehen.has('gesperrt'), true);
});

test('runRetention: leere OID-Menge ueberspringt die Dateiaufraeumung komplett', async () => {
  // Der Katastrophenfall: dbo.Users liefert erfolgreich NULL Zeilen (falscher
  // DB_NAME in .env nach einem Deployment, leere/wiederhergestellte Datenbank).
  // Dann gilt JEDER ihk-imports-Ordner als Waise - und das sind vollstaendige
  // IHK-Nachweis-PDFs aktiver Azubis, ohne Archiv und ohne Rotation. Das
  // umgebende try/catch faengt nur eine WERFENDE Abfrage, nicht diese.
  let aufgerufen = 0;
  const gemeldet = [];
  const b = await R.runRetention(deps({
    listKandidaten: async () => [],
    alleOids: async () => [],
    raeumeDateien: () => { aufgerufen++; return { entfernt: ['darf-nicht-passieren'], probleme: [] }; },
    logFehler: (e) => gemeldet.push(e),
  }));

  assert.equal(aufgerufen, 0, 'raeumeWaisenDateien darf gar nicht laufen');
  assert.equal(b.dateienEntfernt, 0);
  assert.equal(b.fehler.length, 1, 'der uebersprungene Schritt gehoert in den Bericht');
  assert.equal(b.fehler[0].name, '(dateien)');
  assert.equal(gemeldet.length, 1);
  assert.equal(gemeldet[0].schweregrad, 'hoch');
  assert.match(gemeldet[0].nachricht, /uebersprungen/);
});

test('runRetention: eine einzige verbleibende OID reicht als Plausibilitaet', async () => {
  // Kein Schwellwert oberhalb von Null: die realen Ausfallmodi liefern exakt
  // null Zeilen. Ein "mindestens N"-Wert waere eine Zahl ohne Grundlage, die
  // auf einer kleinen oder frisch aufgesetzten Installation gegen die Nutzer
  // arbeitet - und die Aufraeumung dort dauerhaft stilllegt.
  let gesehen = null;
  const b = await R.runRetention(deps({
    listKandidaten: async () => [],
    alleOids: async () => ['ein-einziger-nutzer'],
    raeumeDateien: ({ existierendeOids }) => { gesehen = existierendeOids; return { entfernt: [], probleme: [] }; },
  }));

  assert.equal(gesehen.size, 1);
  assert.deepEqual(b.fehler, []);
});

/* ── Lauf-Sperre ────────────────────────────────────────────────────────
   Pendant zu 'runBackup: zwei gleichzeitige Laeufe erzeugen nur einen
   Durchlauf' in berichtsheftBackup.test.js. Fuer einen unwiderruflichen
   Loeschjob ist "zwei Laeufe kollidierten" kein Defekt, der in Produktion
   entdeckt werden soll - der 03:00-Timer und ein evtl. manueller Aufruf
   duerfen sich nicht ueberlappen, sonst verarbeiten beide Laeufe dieselben
   Kandidaten doppelt (doppelte Loeschversuche, doppelte Vorwarnungen). */
test('runRetentionSerialisiert: zwei gleichzeitige Laeufe erzeugen nur einen Durchlauf', async () => {
  let aufrufe = 0;
  const d = deps({
    listKandidaten: async () => {
      aufrufe++;
      await new Promise((r) => setTimeout(r, 20));   // Lauf ueberlappen lassen
      return kandidatenSatz();
    },
  });

  const [a, b] = await Promise.all([
    R.runRetentionSerialisiert(d),
    R.runRetentionSerialisiert(d),
  ]);

  assert.equal(aufrufe, 1, 'der zweite Aufruf darf keinen zweiten Lauf starten');
  assert.equal(a, b, 'beide Aufrufe bekommen denselben Bericht');
  assert.equal(a.kandidaten, 3, 'der eine tatsaechliche Lauf verarbeitet die volle Kandidatenliste');

  // Nach dem Lauf ist die Sperre wieder frei - ein dritter Aufruf startet
  // einen neuen, eigenstaendigen Lauf.
  const c = await R.runRetentionSerialisiert(d);
  assert.equal(aufrufe, 2);
  assert.notEqual(c, a);
});
