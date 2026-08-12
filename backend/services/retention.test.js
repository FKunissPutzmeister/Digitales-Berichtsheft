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
  assert.match(e.anweisung, /VerantwName = COALESCE\(VerantwName, @name\)/);
  assert.match(e.anweisung, /VerantwEmail = ''/);
});

test('PHASE_B: Kommentare behalten den Autornamen und verlieren die OID', () => {
  const e = R.PHASE_B.find(x => x.tabelle === 'Kommentare');
  // Exakter Vergleich, nicht /COALESCE\(\w+Name, @name\)/: das generische Muster
  // wuerde auch eine falsche Spalte akzeptieren, solange sie auf "Name" endet.
  assert.equal(e.anweisung, 'SET AutorName = COALESCE(AutorName, @name), UserOid = NULL');
  assert.equal(e.bedingung, 'UserOid = @oid');
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

test('BEKANNTE_TABELLEN vereint alle drei Phasen', () => {
  for (const liste of [R.PHASE_A, R.PHASE_B, R.PHASE_C]) {
    for (const e of liste) {
      assert.ok(R.BEKANNTE_TABELLEN.has(e.tabelle), `${e.tabelle} fehlt in BEKANNTE_TABELLEN`);
    }
  }
  // Kaskaden-Kinder gehoeren dazu, damit die Selbstpruefung sie nicht meldet.
  for (const t of ['Anhaenge', 'BeurteilungKriterien', 'UserPhotos', 'Fehlerberichte']) {
    assert.ok(R.BEKANNTE_TABELLEN.has(t), `${t} fehlt in BEKANNTE_TABELLEN`);
  }
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
