'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoleClaim, buildReqUser, validateUserPatch, landingPathForUser, setUsersAktiv, updateUserProfile, listManuellDeaktivierteOids, upsertUser } = require('./users');

const ROLE_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

test('parseRoleClaim liest String-Claim', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'azubi' }), 'azubi');
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'pruefer' }), 'pruefer');
});

test('parseRoleClaim nimmt bei Array die erste bekannte Rolle', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: ['pruefer', 'irgendwas'] }), 'pruefer');
});

test('parseRoleClaim gibt null ohne/bei unbekanntem Claim', () => {
  assert.equal(parseRoleClaim({}), null);
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'fremd' }), null);
  assert.equal(parseRoleClaim(null), null);
});

test('buildReqUser leitet Azubi-Flags + Profilfelder ab', () => {
  const u = buildReqUser({ Oid: 'g1', Name: 'A', Email: 'a@b.de', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Beruf: 'Mechatroniker' });
  assert.equal(u.istAzubi, true);
  assert.equal(u.istAusbilder, false);
  assert.equal(u.kannPlanen, false);
  assert.equal(u.istDhStudent, false);
  assert.equal(u.beruf, 'Mechatroniker');
  assert.equal(u.berichtTyp, 'wöchentlich'); // Default ohne BerichtTyp-Spalte
});

test('buildReqUser: Department wird durchgereicht', () => {
  const u = buildReqUser({ Oid: 'g1b', Role: 'azubi', Department: 'Kaufmännische Auszubildende' });
  assert.equal(u.department, 'Kaufmännische Auszubildende');
});

test('buildReqUser: fehlendes Department ergibt null', () => {
  const u = buildReqUser({ Oid: 'g1c', Role: 'azubi' });
  assert.equal(u.department, null);
});

test('buildReqUser: pruefer bekommt Korrektur-Zugang automatisch', () => {
  const u = buildReqUser({ Oid: 'g2', Role: 'pruefer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, false);
});

test('buildReqUser: IstAusbilder-Spalte ist additiver Grant', () => {
  const u = buildReqUser({ Oid: 'g3', Role: 'admin', KannPlanen: true, IstAusbilder: true });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.kannPlanen, true);
});

test('buildReqUser: developer bekommt Dev-Flags, aber NICHT automatisch istAzubi/istDhStudent', () => {
  const u = buildReqUser({ Oid: 'g4', Role: 'developer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.kannPlanen, true);
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, false); // Developer ist NICHT automatisch Azubi — nur mit IstAzubi-Tag
  assert.equal(u.istDhStudent, false);
});

test('buildReqUser: IstAzubi-Spalte ist additiver Azubi-Grant (z.B. Developer, der ein Heft führt)', () => {
  const u = buildReqUser({ Oid: 'g4b', Role: 'developer', KannPlanen: false, IstAusbilder: false, IstAzubi: true });
  assert.equal(u.istAzubi, true);
  assert.equal(u.istAusbilder, true); // Dev-Flags bleiben erhalten
});

test('buildReqUser: IstAusbildungsleiter-Spalte mit Bereich', () => {
  const u = buildReqUser({ Oid: 'g4c', Role: 'pruefer', KannPlanen: false, IstAusbilder: false, IstAusbildungsleiter: 1, AusbildungsleiterBereich: 'technisch' });
  assert.equal(u.istAusbildungsleiter, true);
  assert.equal(u.ausbildungsleiterBereich, 'technisch');
});

test('buildReqUser: fehlendes IstAusbildungsleiter ergibt false/null', () => {
  const u = buildReqUser({ Oid: 'g4d', Role: 'pruefer', KannPlanen: false, IstAusbilder: false, IstAusbildungsleiter: 0 });
  assert.equal(u.istAusbildungsleiter, false);
  assert.equal(u.ausbildungsleiterBereich, null);
});

test('buildReqUser(null) gibt null', () => {
  assert.equal(buildReqUser(null), null);
});

test('validateUserPatch akzeptiert erlaubte Felder/Werte', () => {
  assert.deepEqual(validateUserPatch({ role: 'pruefer', berichtTyp: 'täglich', kannPlanen: true }), { ok: true });
});

test('validateUserPatch lehnt unbekannte Rolle ab', () => {
  assert.equal(validateUserPatch({ role: 'chef' }).ok, false);
});

test('validateUserPatch lehnt unbekanntes Feld ab', () => {
  assert.equal(validateUserPatch({ gehalt: 999 }).ok, false);
});

test('validateUserPatch lehnt ungültigen berichtTyp ab', () => {
  assert.equal(validateUserPatch({ berichtTyp: 'monatlich' }).ok, false);
});

test('validateUserPatch lehnt leeren Patch ab', () => {
  assert.equal(validateUserPatch({}).ok, false);
});

test('validateUserPatch akzeptiert erlaubte ausbildungsleiterBereich-Werte', () => {
  assert.equal(validateUserPatch({ ausbildungsleiterBereich: 'technisch' }).ok, true);
  assert.equal(validateUserPatch({ ausbildungsleiterBereich: 'kaufmaennisch' }).ok, true);
});

test('validateUserPatch akzeptiert ausbildungsleiterBereich=null (Haken entfernt)', () => {
  assert.equal(validateUserPatch({ ausbildungsleiterBereich: null }).ok, true);
});

test('validateUserPatch lehnt ungültigen ausbildungsleiterBereich ab', () => {
  assert.equal(validateUserPatch({ ausbildungsleiterBereich: 'unsinn' }).ok, false);
});

test('validateUserPatch: ausbildungsleiterBereich ist optional (Feld fehlt)', () => {
  assert.equal(validateUserPatch({ istAusbildungsleiter: true }).ok, true);
});

test('buildReqUser: dhstudent positiv', () => {
  const u = buildReqUser({ Oid: 'g5', Role: 'dhstudent', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.istDhStudent, true);
  assert.equal(u.istAzubi, false);
});

test('buildReqUser: aktiv=false wird durchgereicht', () => {
  const u = buildReqUser({ Oid: 'g6', Role: 'azubi', Aktiv: false });
  assert.equal(u.aktiv, false);
});

test('buildReqUser: manuellDeaktiviert wird durchgereicht (Default false)', () => {
  assert.equal(buildReqUser({ Oid: 'g6', Role: 'azubi' }).manuellDeaktiviert, false);
  assert.equal(buildReqUser({ Oid: 'g6', Role: 'azubi', ManuellDeaktiviert: true }).manuellDeaktiviert, true);
});

test('landingPathForUser: dhstudent → Abteilungsdurchlauf, sonst Dashboard', () => {
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g5', Role: 'dhstudent' })), '/app/abteilungsdurchlauf.html');
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g1', Role: 'azubi' })), '/app/dashboard.html');
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g2', Role: 'pruefer' })), '/app/dashboard.html');
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g3', Role: 'developer' })), '/app/dashboard.html');
  assert.equal(landingPathForUser(null), '/app/dashboard.html');
});

/* ── Löschkonzept: Stichtag InaktivSeit ─────────────────────────
   Fake-Pool statt echter DB (Muster wie vertretungen.test.js): wir prüfen
   das erzeugte SQL, nicht das DB-Ergebnis. */

function fakePool() {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = {};
      const api = {
        input(name, _typ, val) { inputs[name] = val; return api; },
        query(text) { calls.push({ sql: text, inputs }); return Promise.resolve({ rowsAffected: [1], recordset: [] }); },
      };
      return api;
    },
  };
}

test('setUsersAktiv: Deaktivieren stempelt InaktivSeit, ohne einen bestehenden Stempel zu ueberschreiben', async () => {
  const pool = fakePool();
  await setUsersAktiv(['g1', 'g2'], false, pool);

  assert.equal(pool.calls.length, 1);
  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, 0);
  assert.equal(inputs.o0, 'g1');
  assert.equal(inputs.o1, 'g2');
  // COALESCE ist der Kern: der Entra-Sync ruft das bei jedem Lauf erneut auf.
  // Ein blindes SYSUTCDATETIME() wuerde die Frist ewig nach hinten schieben.
  assert.match(text, /COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\)/);
  assert.match(text, /Oid IN \(@o0,@o1\)/);
});

test('setUsersAktiv: Reaktivieren leert InaktivSeit', async () => {
  const pool = fakePool();
  await setUsersAktiv(['g1'], true, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, 1);
  // Ein CASE deckt beide Richtungen in einer Anweisung ab.
  assert.match(text, /WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('setUsersAktiv: leere Liste macht keinen DB-Aufruf', async () => {
  const pool = fakePool();
  assert.equal(await setUsersAktiv([], false, pool), 0);
  assert.equal(pool.calls.length, 0);
});

test('listManuellDeaktivierteOids: filtert auf ManuellDeaktiviert=1 innerhalb der OID-Liste', async () => {
  const pool = fakePool();
  await listManuellDeaktivierteOids(['g1', 'g2'], pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.match(text, /ManuellDeaktiviert = 1/);
  assert.match(text, /Oid IN \(@o0,@o1\)/);
  assert.equal(inputs.o0, 'g1');
  assert.equal(inputs.o1, 'g2');
});

test('listManuellDeaktivierteOids: leere Liste macht keinen DB-Aufruf', async () => {
  const pool = fakePool();
  assert.deepEqual(await listManuellDeaktivierteOids([], pool), []);
  assert.equal(pool.calls.length, 0);
});

test('updateUserProfile: manuelles Deaktivieren stempelt InaktivSeit ebenfalls', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: false }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, false);
  assert.match(text, /Aktiv = @aktiv/);
  assert.match(text, /InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('updateUserProfile: manuelles Reaktivieren leert InaktivSeit', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: true }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, true);
  assert.match(text, /InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('updateUserProfile: ohne aktiv-Feld wird InaktivSeit nicht angefasst', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { beruf: 'Mechatroniker' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /Beruf = @beruf/);
  assert.ok(!/InaktivSeit/.test(text), 'InaktivSeit darf hier nicht vorkommen');
});

test('updateUserProfile: Department-Feld wird geschrieben', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { department: 'Gewerbliche Auszubildende' }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.department, 'Gewerbliche Auszubildende');
  assert.match(text, /Department = @department/);
});

// Migration 038: manuelle Deaktivierung muss den Entra-Sync ausbremsen können
// (siehe entraSync.filterReaktivierung) — dafür braucht es dieses Flag.
test('updateUserProfile: manuelles Deaktivieren setzt ManuellDeaktiviert', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: false }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /ManuellDeaktiviert = CASE WHEN @aktiv = 0 THEN 1 ELSE 0 END/);
});

test('updateUserProfile: manuelles Reaktivieren löscht ManuellDeaktiviert wieder', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: true }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, true);
  assert.match(text, /ManuellDeaktiviert = CASE WHEN @aktiv = 0 THEN 1 ELSE 0 END/);
});

test('validateUserPatch akzeptiert loeschsperreBis', () => {
  assert.equal(validateUserPatch({ loeschsperreBis: '2027-01-01' }).ok, true);
  assert.equal(validateUserPatch({ loeschSperre: '2027-01-01' }).ok, false);
});

test('buildReqUser: manuellUeberschriebeneFelder wird als Array durchgereicht', () => {
  assert.deepEqual(buildReqUser({ Oid: 'g11', Role: 'pruefer' }).manuellUeberschriebeneFelder, []);
  assert.deepEqual(
    buildReqUser({ Oid: 'g11', Role: 'pruefer', ManuellUeberschriebeneFelder: 'Role,Beruf' }).manuellUeberschriebeneFelder,
    ['Role', 'Beruf'],
  );
});

/* ── Migration 041: manuelle Nutzerverwaltungs-Korrekturen überstehen
   Login-JIT/Entra-Sync (Marco.Rossi/Patrick.Veit-Fall, 2026-09-01) ── */

test('updateUserProfile: Role-Patch merkt die Spalte in ManuellUeberschriebeneFelder vor', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { role: 'pruefer' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /Role = @role/);
  assert.match(text, /ManuellUeberschriebeneFelder = CASE WHEN CHARINDEX\(',Role,'/);
});

test('updateUserProfile: mehrere Sync-Felder in einem Patch werden beide vorgemerkt', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { role: 'pruefer', beruf: 'Mechatroniker' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /CHARINDEX\(',Role,'/);
  assert.match(text, /CHARINDEX\(',Beruf,'/);
});

test('updateUserProfile: Department-Patch merkt die Spalte in ManuellUeberschriebeneFelder vor', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { department: 'Kaufmännische Auszubildende' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /CHARINDEX\(',Department,'/);
});

test('updateUserProfile: nicht-sync-fähige Felder (istAzubi) landen NICHT in ManuellUeberschriebeneFelder', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { istAzubi: true }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /IstAzubi = @istAzubi/);
  assert.ok(!/ManuellUeberschriebeneFelder/.test(text));
});

test('updateUserProfile: aktiv-Patch (eigenes Flag ManuellDeaktiviert) landet NICHT in ManuellUeberschriebeneFelder', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: false }, pool);

  const { sql: text } = pool.calls[0];
  assert.ok(!/ManuellUeberschriebeneFelder/.test(text));
});

test('upsertUser: MERGE schützt manuell überschriebene Spalten vor der Azure-Basisrolle', async () => {
  const pool = fakePool();
  await upsertUser({ oid: 'g1', role: 'azubi', beruf: 'Fachinformatiker', department: 'Kaufmännische Auszubildende', letzterLogin: false }, pool);

  const merge = pool.calls.find((c) => /MERGE dbo\.Users/.test(c.sql));
  assert.ok(merge, 'MERGE-Query nicht gefunden');
  assert.match(merge.sql, /CHARINDEX\(',Role,', ',' \+ t\.ManuellUeberschriebeneFelder \+ ','\) > 0 THEN t\.Role/);
  assert.match(merge.sql, /CHARINDEX\(',Beruf,', ',' \+ t\.ManuellUeberschriebeneFelder \+ ','\) > 0 THEN t\.Beruf/);
  assert.match(merge.sql, /CHARINDEX\(',Department,', ',' \+ t\.ManuellUeberschriebeneFelder \+ ','\) > 0 THEN t\.Department/);
  assert.equal(merge.inputs.role, 'azubi');
  assert.equal(merge.inputs.department, 'Kaufmännische Auszubildende');
});

test('buildReqUser liefert inaktivSeit und loeschsperreBis', () => {
  const u = buildReqUser({
    Oid: 'g9', Name: 'Muster, Max', Role: 'azubi',
    InaktivSeit: '2026-01-15T02:00:00.000Z', LoeschsperreBis: '2027-03-01',
  });
  assert.equal(u.inaktivSeit, '2026-01-15T02:00:00.000Z');
  assert.equal(u.loeschsperreBis, '2027-03-01');
});

test('buildReqUser: fehlende Loeschkonzept-Spalten ergeben null', () => {
  const u = buildReqUser({ Oid: 'g10', Role: 'pruefer' });
  assert.equal(u.inaktivSeit, null);
  assert.equal(u.loeschsperreBis, null);
});
