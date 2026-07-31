# Automatische tägliche Berichtsheft-Backups — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein nächtlicher Backend-Job schreibt pro Azubi das komplette Berichtsheft als JSON nach `backend/data/backups/<YYYY-MM-DD>/` und löscht Tagesordner, die älter als 30 Tage sind.

**Architecture:** Ein neuer Service `backend/services/berichtsheftBackup.js` kapselt alles: reine Format- und Namenslogik, die Datei-Operationen (`runBackup`, `pruneOldBackups`) und dünne SQL-Adapter. `runBackup` erhält seine Datenzugriffe injiziert, wodurch der komplette Job ohne SQL-Server testbar ist. [backend/server.js](../../../backend/server.js) startet ihn per selbst-nachplanendem `setTimeout` — Muster wie der bestehende `entra-sync`/Fehler-Cleanup. Kein Frontend, keine API-Route.

**Tech Stack:** Node.js (CommonJS), `node:fs`, `node:path`, `mssql` (bestehendes `db/connection`), Tests mit `node:test` + `node:assert/strict`.

**Spec:** [docs/superpowers/specs/2026-07-31-automatische-berichtsheft-backups-design.md](../specs/2026-07-31-automatische-berichtsheft-backups-design.md)

## Global Constraints

- **Format-Treue ist die oberste Anforderung.** Das erzeugte JSON hat exakt das Format `berichtsheft-backup` **Version 1** aus [app/js/berichtsheft-export.js](../../../app/js/berichtsheft-export.js) (~Zeile 164) und muss über den bestehenden „Wiederherstellen"-Dialog einspielbar sein. Feldnamen und Werte spiegeln `normalizeWoche` / `normalizeTag` / `normalizeKommentar` aus [app/js/api.js](../../../app/js/api.js) (~Zeile 124-183).
- **Aufbewahrung:** Konstante `AUFBEWAHRUNG_TAGE = 30`. Ordner von heute−30 bleibt, heute−31 wird gelöscht.
- **Zielverzeichnis:** fest `path.join(__dirname, '..', 'data', 'backups')`, kein `.env`-Schalter.
- **Backup-Uhrzeit:** 02:00 Ortszeit, Konstante `BACKUP_STUNDE = 2`.
- **Sprache:** Kommentare, Log-Ausgaben und Manifest-Schlüssel auf Deutsch, wie im übrigen Backend. Code-Identifier gemischt-deutsch wie bestehend (`ladeWochen`, `runBackup`).
- **Tests:** co-located `backend/services/berichtsheftBackup.test.js`, ausgeführt mit `node --test` **aus dem Verzeichnis `backend/`**. Kein Test darf eine echte DB oder das echte `data/backups` anfassen — Datenzugriffe werden injiziert, Dateien landen in `fs.mkdtempSync`-Temp-Ordnern.
- **Keine neuen Abhängigkeiten** (kein `node-cron`, kein `rimraf`).
- **`'use strict';`** als erste Zeile jeder neuen Datei, wie in allen `backend/services/*.js`.

## Bekannte Grenzen (bewusst, nicht „vergessen")

- **`dbo.Tage.Stunden` wird nicht gesichert.** Der Client-Normalizer `normalizeTag` führt kein `stunden`-Feld, und `saveWoche` schickt es nicht zurück — gelebte Wahrheit ist `Wochen.Gesamtstunden`. Wir spiegeln den Client exakt, weil genau das die Dialog-Kompatibilität sichert. Wer das ändern will, muss zuerst Client-Format und Restore-Pfad anfassen.
- **Datei-Anhänge** (`VARBINARY` in der DB) sind nicht enthalten — siehe Spec, Abschnitt „Bewusst nicht enthalten".

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `backend/services/berichtsheftBackup.js` (neu) | Alles zum Backup: Format (`buildBackupPayload`), reine Helfer (`slugName`, `tagesOrdnerName`, `istTagesOrdnerName`, `msBisNaechsteUhrzeit`), Datei-Operationen (`runBackup`, `pruneOldBackups`, `runBackupWennNoetig`), SQL-Adapter (`listAzubis`, `ladeWochen`) |
| `backend/services/berichtsheftBackup.test.js` (neu) | Tests zu allem oben; Fake-Pool für die SQL-Adapter, Temp-Ordner für Datei-I/O |
| `backend/server.js` (ändern) | Job starten und nachplanen — ein Block am Ende, neben `entra-sync` |
| `app/js/api.js` (ändern) | Ein Verweis-Kommentar über `normalizeWoche` auf die Formatkopplung |
| `README.md` (ändern) | Projektstatus-Zeile + Absatz im Abschnitt „Export & Backup" |

Ein einziger Service, weil alle Teile dasselbe Format teilen und gemeinsam geändert werden — aufgeteilt wird nach Verantwortung erst, wenn ein zweiter Backup-Typ dazukommt.

---

### Task 1: Format — `buildBackupPayload`

Der Kern: DB-Zeilen → JSON im Format `berichtsheft-backup` v1. Reine Funktionen, keine I/O.

**Files:**
- Create: `backend/services/berichtsheftBackup.js`
- Create: `backend/services/berichtsheftBackup.test.js`
- Modify: `app/js/api.js` (Verweis-Kommentar über `normalizeWoche`, ~Zeile 154)

**Interfaces:**
- Consumes: nichts (erste Task)
- Produces:
  - `buildBackupPayload(azubi, wochenRows, jetzt) → object` — `azubi` ist `{ oid, name, email, beruf, berichtTyp, ausbildungsBeginn, ausbildungsEnde }`, `wochenRows` sind DB-Zeilen mit bereits geparsten `tage`/`kommentare`-Arrays (Form wie `parseWoche` in `routes/wochen.js`), `jetzt` ein `Date`. Rückgabe: `{ format:'berichtsheft-backup', version:1, exportiertAm, azubi:{…}, wochen:[…] }`.

- [ ] **Step 1: Testdatei mit Fixture und den ersten Formattests anlegen**

Create `backend/services/berichtsheftBackup.test.js`:

```js
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
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: FAIL — `Cannot find module './berichtsheftBackup.js'`

- [ ] **Step 3: Service mit den Normalizern anlegen**

Create `backend/services/berichtsheftBackup.js`:

```js
'use strict';
/* ===================================================================
   BERICHTSHEFT-BACKUP
   Nächtlicher Snapshot-Job: schreibt pro Azubi das komplette Berichtsheft
   als JSON nach data/backups/<YYYY-MM-DD>/ und räumt Tagesordner weg,
   die älter als AUFBEWAHRUNG_TAGE sind.

   ⚠ FORMATKOPPLUNG: Das erzeugte JSON hat exakt das Format
   'berichtsheft-backup' v1 aus app/js/berichtsheft-export.js, damit eine
   Datei unverändert über den "Wiederherstellen"-Dialog im Profil
   eingespielt werden kann. Die Normalisierung DB-Zeile → Client-Form
   spiegelt normalizeWoche/normalizeTag/normalizeKommentar aus
   app/js/api.js. Ändert sich das Format dort, muss es hier mitgehen —
   berichtsheftBackup.test.js nagelt die Struktur fest.
   =================================================================== */

/* Datumswerte kommen auf zwei Wegen herein: Wochen-Spalten als Date-Objekte
   vom mssql-Treiber, Tage/Kommentare als ISO-Strings aus FOR JSON PATH.
   Beide müssen auf YYYY-MM-DD enden — String(new Date()) ergäbe sonst
   "Mon Jul 27 2026 ...". */
function toDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) return isNaN(val) ? '' : val.toISOString().slice(0, 10);
  return String(val).split('T')[0];
}

function normalizeTag(t) {
  return {
    id: t.Id,
    wocheId: t.WocheId,
    datum: toDateStr(t.Datum),
    // Altbestand auf die aktuellen Dropdown-Werte mappen (wie api.js)
    anwesenheit: t.Anwesenheit === 'krank' ? 'Arbeitsunfähigkeit' : (t.Anwesenheit ?? ''),
    ort: (t.Ort === 'Zuhause' || t.Ort === 'Dienstreise') ? 'Betrieb' : (t.Ort ?? ''),
    eintrag: t.Eintrag ?? '',
    tagdauer: (t.Tagdauer === 'halbtag' ? 'halbtag' : 'ganztag'),
    betriebEintrag:      t.BetriebEintrag      ?? '',
    schuleEintrag:       t.SchuleEintrag       ?? '',
    unterweisungEintrag: t.UnterweisungEintrag ?? '',
    abwesenheitsnotiz:   t.Abwesenheitsnotiz   ?? '',
    unterweisungAktiv:   !!t.UnterweisungAktiv,
  };
}

function normalizeKommentar(k) {
  return {
    id: k.Id,
    wocheId: k.WocheId,
    userId: k.UserOid,
    text: k.Text,
    datum: toDateStr(k.Datum),
    typ: k.Typ,
    tagId: k.TagId ?? null,
  };
}

function normalizeWoche(w) {
  return {
    id: w.Id,
    azubiId: w.AzubiOid,
    kw: w.KW,
    year: w.Jahr,
    startDate: toDateStr(w.StartDatum),
    endDate: toDateStr(w.EndDatum),
    status: w.Status,
    endabnahmeDirekt: !!w.EndabnahmeDirekt,
    // Annotationsfelder des Clients: der Job läuft als System, nicht als
    // Nutzer. Konstant gesetzt, damit die Struktur formatgleich bleibt;
    // der Restore-Pfad wertet sie nicht aus.
    viewerRolle: null,
    erlaubteAktionen: [],
    gesamtstunden: w.Gesamtstunden,
    typ: w.Typ ?? null,
    wochenOrt: w.WochenOrt ?? null,
    unterweisungAktiv: !!w.UnterweisungAktiv,
    betriebEintrag:      w.BetriebEintrag      ?? '',
    schuleEintrag:       w.SchuleEintrag       ?? '',
    unterweisungEintrag: w.UnterweisungEintrag ?? '',
    korrigiertVon: w.KorrigiertVon ?? null,
    korrigiertAm:  toDateStr(w.KorrigiertAm),
    eingereichtVon: w.EingereichtVon ?? null,
    eingereichtAm:  toDateStr(w.EingereichtAm),
    tage: (w.tage || []).map(normalizeTag),
    kommentare: (w.kommentare || []).map(normalizeKommentar),
  };
}

/* azubi: { oid, name, email, beruf, berichtTyp, ausbildungsBeginn, ausbildungsEnde }
   wochenRows: DB-Zeilen mit geparsten tage/kommentare (Form wie parseWoche). */
function buildBackupPayload(azubi, wochenRows, jetzt = new Date()) {
  return {
    format: 'berichtsheft-backup',
    version: 1,
    exportiertAm: jetzt.toISOString(),
    azubi: {
      oid: azubi.oid,
      name: azubi.name || '',
      email: azubi.email || '',
      beruf: azubi.beruf || '',
      berichtTyp: azubi.berichtTyp || '',
      ausbildungsBeginn: azubi.ausbildungsBeginn || '',
      ausbildungsEnde: azubi.ausbildungsEnde || '',
    },
    wochen: (wochenRows || []).map(normalizeWoche),
  };
}

module.exports = { buildBackupPayload };
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (4 Tests)

- [ ] **Step 5: Tests für Tage und Kommentare ergänzen**

Append to `backend/services/berichtsheftBackup.test.js`:

```js
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
```

- [ ] **Step 6: Tests laufen lassen — alle grün**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (8 Tests). Falls der Tag-Key-Test fehlschlägt: `normalizeTag` im Service mit der Liste in `api.js` (~Zeile 124-140) abgleichen.

- [ ] **Step 7: Verweis-Kommentar in api.js setzen**

Modify `app/js/api.js` — direkt über `function normalizeWoche(w) {` (~Zeile 154) einfügen:

```js
/* ⚠ Formatkopplung: Diese drei Normalizer definieren das JSON-Backup-Format
   ('berichtsheft-backup' v1, siehe berichtsheft-export.js). Das serverseitige
   Nacht-Backup in backend/services/berichtsheftBackup.js baut dieselbe
   Struktur nach, damit seine Dateien über den Wiederherstellen-Dialog
   einspielbar sind. Änderungen hier dort mitziehen —
   backend/services/berichtsheftBackup.test.js schlägt sonst fehl. */
```

- [ ] **Step 8: Commit**

```bash
git add backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js app/js/api.js
git commit -m "feat(backup): Backup-Payload im Format berichtsheft-backup v1"
```

---

### Task 2: Reine Helfer — Slug, Tagesordner, Weckzeit

Kleine Funktionen ohne I/O, die Task 3-6 brauchen.

**Files:**
- Modify: `backend/services/berichtsheftBackup.js`
- Modify: `backend/services/berichtsheftBackup.test.js`

**Interfaces:**
- Consumes: nichts aus Task 1 (unabhängige Funktionen in derselben Datei)
- Produces:
  - `slugName(name) → string` — dateisystemsicherer Slug, ggf. `''`
  - `dateiName(azubi) → string` — `'<slug>_<oid>.json'` bzw. `'<oid>.json'`
  - `tagesOrdnerName(date) → string` — `'YYYY-MM-DD'` in **Ortszeit**
  - `istTagesOrdnerName(name) → boolean`
  - `msBisNaechsteUhrzeit(stunde, jetzt) → number`
  - Konstanten `AUFBEWAHRUNG_TAGE = 30`, `BACKUP_DIR`

- [ ] **Step 1: Failing Tests schreiben**

Append to `backend/services/berichtsheftBackup.test.js`:

```js
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
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: FAIL — `B.slugName is not a function`

- [ ] **Step 3: Helfer implementieren**

In `backend/services/berichtsheftBackup.js` **oben** (nach dem Datei-Header) einfügen:

```js
const fs = require('fs');
const path = require('path');

const AUFBEWAHRUNG_TAGE = 30;
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const TAGESORDNER_RE = /^\d{4}-\d{2}-\d{2}$/;

const UMLAUTE = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue' };

/* Dateisicherer Namensteil: Umlaute ausschreiben, Akzente entfernen, alles
   Übrige zu '-'. Ergebnis kann leer sein (Konto ohne Namen). */
function slugName(name) {
  return String(name || '')
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUTE[c])
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // é → e (Akzente abtrennen)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dateiName(azubi) {
  const slug = slugName(azubi && azubi.name);
  const oid = String((azubi && azubi.oid) || 'unbekannt');
  return (slug ? `${slug}_${oid}` : oid) + '.json';
}

/* Ortszeit, nicht UTC: der 02:00-Lauf soll im Ordner des lokalen
   Kalendertages landen. */
function tagesOrdnerName(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function istTagesOrdnerName(name) {
  return TAGESORDNER_RE.test(name);
}

/* Millisekunden bis zur nächsten <stunde>:00 Ortszeit. Ist die Uhrzeit
   erreicht oder vorbei, wird der Folgetag genommen — so liefert die
   Funktion nie 0 und der nachplanende Timer kann nicht heißlaufen. */
function msBisNaechsteUhrzeit(stunde, jetzt = new Date()) {
  const ziel = new Date(jetzt);
  ziel.setHours(stunde, 0, 0, 0);
  if (ziel.getTime() <= jetzt.getTime()) ziel.setDate(ziel.getDate() + 1);
  return ziel.getTime() - jetzt.getTime();
}
```

Und `module.exports` erweitern:

```js
module.exports = {
  AUFBEWAHRUNG_TAGE, BACKUP_DIR,
  buildBackupPayload,
  slugName, dateiName, tagesOrdnerName, istTagesOrdnerName, msBisNaechsteUhrzeit,
};
```

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (12 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js
git commit -m "feat(backup): Helfer fuer Dateinamen, Tagesordner und Weckzeit"
```

---

### Task 3: `runBackup` — Snapshots und Manifest schreiben

**Files:**
- Modify: `backend/services/berichtsheftBackup.js`
- Modify: `backend/services/berichtsheftBackup.test.js`

**Interfaces:**
- Consumes: `buildBackupPayload`, `dateiName`, `tagesOrdnerName` (Task 1+2)
- Produces:
  - `runBackup(deps) → Promise<bericht>` mit `deps = { listAzubis, ladeWochen, jetzt, dir, aufbewahrungTage, logFehler }` (alle optional; Defaults sind die SQL-Adapter aus Task 5, `new Date()`, `BACKUP_DIR`, `AUFBEWAHRUNG_TAGE`, no-op).
    `bericht = { erzeugtAm, dauerMs, azubis, dateien, uebersprungen, geloeschteTage, fehler:[{oid,name,fehler}] }`

- [ ] **Step 1: Failing Tests schreiben**

Append to `backend/services/berichtsheftBackup.test.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const pathMod = require('node:path');

function tempDir() {
  return fs.mkdtempSync(pathMod.join(os.tmpdir(), 'bh-backup-'));
}
function leseJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
// Zwei Azubis, einer davon ohne Wochen.
function fakeDeps(dir, over = {}) {
  return {
    dir,
    jetzt: new Date(2026, 6, 31, 2, 0, 0),
    listAzubis: async () => [
      { ...AZUBI },
      { oid: 'OID-LEER', name: 'Leer, Lisa', email: 'l@x.demo' },
    ],
    ladeWochen: async (oid) => (oid === AZUBI.oid ? [wocheRow({ tage: [tagRow()] })] : []),
    ...over,
  };
}

test('runBackup: schreibt pro Azubi mit Wochen eine Datei in den Tagesordner', async () => {
  const dir = tempDir();
  const bericht = await B.runBackup(fakeDeps(dir));
  const tagDir = pathMod.join(dir, '2026-07-31');
  const dateien = fs.readdirSync(tagDir).sort();

  assert.deepEqual(dateien, ['_manifest.json', 'kuniss-florian_' + AZUBI.oid + '.json']);
  assert.equal(bericht.azubis, 2);
  assert.equal(bericht.dateien, 1);
  assert.equal(bericht.uebersprungen, 1);      // Azubi ohne Wochen
  assert.deepEqual(bericht.fehler, []);

  const inhalt = leseJson(pathMod.join(tagDir, 'kuniss-florian_' + AZUBI.oid + '.json'));
  assert.equal(inhalt.format, 'berichtsheft-backup');
  assert.equal(inhalt.wochen.length, 1);
  assert.equal(inhalt.wochen[0].tage.length, 1);
});

test('runBackup: schreibt ein Manifest mit den Zaehlern', async () => {
  const dir = tempDir();
  await B.runBackup(fakeDeps(dir));
  const m = leseJson(pathMod.join(dir, '2026-07-31', '_manifest.json'));
  assert.equal(m.azubis, 2);
  assert.equal(m.dateien, 1);
  assert.equal(m.uebersprungen, 1);
  assert.deepEqual(m.fehler, []);
  assert.deepEqual(m.geloeschteTage, []);
  assert.equal(typeof m.dauerMs, 'number');
  assert.equal(m.erzeugtAm, new Date(2026, 6, 31, 2, 0, 0).toISOString());
});

test('runBackup: zweiter Lauf am selben Tag ueberschreibt statt zu duplizieren', async () => {
  const dir = tempDir();
  await B.runBackup(fakeDeps(dir));
  await B.runBackup(fakeDeps(dir, {
    ladeWochen: async (oid) => (oid === AZUBI.oid
      ? [wocheRow({ SchuleEintrag: 'ZWEITER LAUF' })] : []),
  }));
  const tagDir = pathMod.join(dir, '2026-07-31');
  assert.equal(fs.readdirSync(tagDir).length, 2);   // Datei + Manifest
  const inhalt = leseJson(pathMod.join(tagDir, 'kuniss-florian_' + AZUBI.oid + '.json'));
  assert.equal(inhalt.wochen[0].schuleEintrag, 'ZWEITER LAUF');
});

test('runBackup: ein kaputter Azubi kippt den Lauf nicht', async () => {
  const dir = tempDir();
  const bericht = await B.runBackup(fakeDeps(dir, {
    listAzubis: async () => [
      { ...AZUBI },
      { oid: 'OID-BOOM', name: 'Boom, Bert' },
      { oid: 'OID-OK', name: 'Ok, Olga' },
    ],
    ladeWochen: async (oid) => {
      if (oid === 'OID-BOOM') throw new Error('Timeout bei Wochen-Abfrage');
      return [wocheRow()];
    },
  }));
  assert.equal(bericht.dateien, 2);
  assert.equal(bericht.fehler.length, 1);
  assert.equal(bericht.fehler[0].oid, 'OID-BOOM');
  assert.match(bericht.fehler[0].fehler, /Timeout/);
  // Manifest hält den Fehler ebenfalls fest
  const m = leseJson(pathMod.join(dir, '2026-07-31', '_manifest.json'));
  assert.equal(m.fehler.length, 1);
});

test('runBackup: meldet Azubi-Fehler an logFehler', async () => {
  const dir = tempDir();
  const gemeldet = [];
  await B.runBackup(fakeDeps(dir, {
    listAzubis: async () => [{ oid: 'OID-BOOM', name: 'Boom, Bert' }],
    ladeWochen: async () => { throw new Error('DB weg'); },
    logFehler: (e) => gemeldet.push(e),
  }));
  assert.equal(gemeldet.length, 1);
  assert.equal(gemeldet[0].quelle, 'backend');
  assert.match(gemeldet[0].nachricht, /\[backup\].*OID-BOOM/);
});

test('runBackup: legt fehlende Verzeichnisse selbst an', async () => {
  const dir = pathMod.join(tempDir(), 'tief', 'verschachtelt');
  await B.runBackup(fakeDeps(dir));
  assert.ok(fs.existsSync(pathMod.join(dir, '2026-07-31', '_manifest.json')));
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: FAIL — `B.runBackup is not a function`

- [ ] **Step 3: `runBackup` implementieren**

In `backend/services/berichtsheftBackup.js` vor `module.exports` einfügen:

```js
/* Schreibt für jeden Azubi mit mindestens einer Woche einen JSON-Snapshot in
   data/backups/<tag>/ und daneben ein _manifest.json mit den Zählern.
   Alle Datenzugriffe sind injizierbar — dadurch ist der komplette Job ohne
   SQL-Server testbar (siehe berichtsheftBackup.test.js).
   Fehler eines einzelnen Azubis brechen den Lauf NICHT ab: sie landen im
   Manifest und im Fehler-Posteingang, der Rest wird gesichert. */
async function runBackup(deps = {}) {
  const {
    listAzubis: ladeAzubisFn = listAzubis,
    ladeWochen: ladeWochenFn = ladeWochen,
    jetzt = new Date(),
    dir = BACKUP_DIR,
    aufbewahrungTage = AUFBEWAHRUNG_TAGE,
    logFehler = () => {},
  } = deps;

  const startMs = Date.now();
  const tagDir = path.join(dir, tagesOrdnerName(jetzt));
  fs.mkdirSync(tagDir, { recursive: true });

  const bericht = {
    erzeugtAm: jetzt.toISOString(),
    dauerMs: 0,
    azubis: 0,
    dateien: 0,
    uebersprungen: 0,
    geloeschteTage: [],
    fehler: [],
  };

  const azubis = (await ladeAzubisFn()) || [];
  bericht.azubis = azubis.length;

  for (const azubi of azubis) {
    try {
      const wochen = (await ladeWochenFn(azubi.oid)) || [];
      if (!wochen.length) { bericht.uebersprungen++; continue; }
      const payload = buildBackupPayload(azubi, wochen, jetzt);
      fs.writeFileSync(path.join(tagDir, dateiName(azubi)),
        JSON.stringify(payload, null, 2), 'utf8');
      bericht.dateien++;
    } catch (err) {
      bericht.fehler.push({ oid: azubi.oid, name: azubi.name || '', fehler: err.message });
      logFehler({
        quelle: 'backend',
        nachricht: `[backup] ${azubi.oid}: ${err.message}`,
        stack: err.stack,
      });
    }
  }

  bericht.dauerMs = Date.now() - startMs;
  fs.writeFileSync(path.join(tagDir, '_manifest.json'),
    JSON.stringify(bericht, null, 2), 'utf8');
  return bericht;
}
```

`module.exports` um `runBackup` erweitern. Da `listAzubis`/`ladeWochen` erst in Task 5 entstehen, für jetzt zwei Platzhalter-Funktionen **oberhalb** von `runBackup` anlegen (werden in Task 5 durch die echten SQL-Adapter ersetzt):

```js
// Werden in Task 5 durch die echten SQL-Adapter ersetzt.
async function listAzubis() { throw new Error('listAzubis: SQL-Adapter fehlt noch'); }
async function ladeWochen() { throw new Error('ladeWochen: SQL-Adapter fehlt noch'); }
```

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (18 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js
git commit -m "feat(backup): runBackup schreibt Snapshots und Manifest"
```

---

### Task 4: `pruneOldBackups` — Rotation nach 30 Tagen

**Files:**
- Modify: `backend/services/berichtsheftBackup.js`
- Modify: `backend/services/berichtsheftBackup.test.js`

**Interfaces:**
- Consumes: `tagesOrdnerName`, `istTagesOrdnerName`, `AUFBEWAHRUNG_TAGE` (Task 2), `runBackup` (Task 3)
- Produces:
  - `pruneOldBackups(keepDays, { dir, jetzt }) → string[]` — Namen der gelöschten Tagesordner
  - `runBackup` füllt danach `bericht.geloeschteTage`

- [ ] **Step 1: Failing Tests schreiben**

Append to `backend/services/berichtsheftBackup.test.js`:

```js
function legeTagesordnerAn(dir, namen) {
  namen.forEach((n) => {
    fs.mkdirSync(pathMod.join(dir, n), { recursive: true });
    fs.writeFileSync(pathMod.join(dir, n, '_manifest.json'), '{}', 'utf8');
  });
}

test('pruneOldBackups: loescht genau die Ordner jenseits der Aufbewahrung', () => {
  const dir = tempDir();
  // Stichtag 2026-07-31, Aufbewahrung 30 Tage → Grenze 2026-07-01
  legeTagesordnerAn(dir, ['2026-07-31', '2026-07-02', '2026-07-01', '2026-06-30', '2026-05-15']);
  const geloescht = B.pruneOldBackups(30, { dir, jetzt: new Date(2026, 6, 31) });

  assert.deepEqual(geloescht.sort(), ['2026-05-15', '2026-06-30']);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['2026-07-01', '2026-07-02', '2026-07-31']);
});

test('pruneOldBackups: heute-30 bleibt, heute-31 faellt weg', () => {
  const dir = tempDir();
  legeTagesordnerAn(dir, ['2026-07-01', '2026-06-30']);
  B.pruneOldBackups(30, { dir, jetzt: new Date(2026, 6, 31) });
  assert.deepEqual(fs.readdirSync(dir), ['2026-07-01']);
});

test('pruneOldBackups: fremde Namen bleiben unangetastet', () => {
  const dir = tempDir();
  legeTagesordnerAn(dir, ['2026-05-15']);
  fs.mkdirSync(pathMod.join(dir, 'notizen'), { recursive: true });
  fs.writeFileSync(pathMod.join(dir, 'LIESMICH.txt'), 'wichtig', 'utf8');
  fs.writeFileSync(pathMod.join(dir, '2026-05-14'), 'kein Ordner', 'utf8');

  const geloescht = B.pruneOldBackups(30, { dir, jetzt: new Date(2026, 6, 31) });

  assert.deepEqual(geloescht, ['2026-05-15']);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['2026-05-14', 'LIESMICH.txt', 'notizen']);
});

test('pruneOldBackups: fehlendes Verzeichnis ist kein Fehler', () => {
  const geloescht = B.pruneOldBackups(30, {
    dir: pathMod.join(tempDir(), 'gibtsnicht'), jetzt: new Date(2026, 6, 31),
  });
  assert.deepEqual(geloescht, []);
});

test('runBackup: raeumt alte Tagesordner mit auf und protokolliert das', async () => {
  const dir = tempDir();
  legeTagesordnerAn(dir, ['2026-05-15']);
  const bericht = await B.runBackup(fakeDeps(dir));
  assert.deepEqual(bericht.geloeschteTage, ['2026-05-15']);
  assert.ok(!fs.existsSync(pathMod.join(dir, '2026-05-15')));
  const m = leseJson(pathMod.join(dir, '2026-07-31', '_manifest.json'));
  assert.deepEqual(m.geloeschteTage, ['2026-05-15']);
});

test('runBackup: eine gescheiterte Rotation macht den Lauf nicht ungueltig', async () => {
  const dir = tempDir();
  // NaN als Aufbewahrung laesst pruneOldBackups werfen — der Fehlerpfad, ohne
  // dass wir Dateirechte manipulieren muessen.
  const bericht = await B.runBackup({ ...fakeDeps(dir), aufbewahrungTage: Number.NaN });

  // Snapshot wurde trotzdem geschrieben ...
  assert.equal(bericht.dateien, 1);
  assert.ok(fs.existsSync(pathMod.join(dir, '2026-07-31',
    'kuniss-florian_' + AZUBI.oid + '.json')));
  // ... und der Rotationsfehler ist protokolliert, nicht verschluckt.
  assert.equal(bericht.fehler.length, 1);
  assert.equal(bericht.fehler[0].name, '(rotation)');
  assert.deepEqual(bericht.geloeschteTage, []);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: FAIL — `B.pruneOldBackups is not a function`

- [ ] **Step 3: Rotation implementieren**

In `backend/services/berichtsheftBackup.js` **vor** `runBackup` einfügen:

```js
/* Löscht Tagesordner, deren Datum älter als keepDays ist. Bei Namen im
   Format YYYY-MM-DD ist der lexikografische Vergleich identisch mit dem
   chronologischen — deshalb reicht ein String-Vergleich, ohne Parsing.
   Alles, was nicht wie ein Tagesordner heißt (oder keiner ist), bleibt
   unangetastet: Schutz gegen versehentliches Löschen fremder Daten. */
function pruneOldBackups(keepDays = AUFBEWAHRUNG_TAGE, { dir = BACKUP_DIR, jetzt = new Date() } = {}) {
  if (!Number.isFinite(keepDays)) throw new Error(`pruneOldBackups: ungültige Aufbewahrung "${keepDays}"`);
  if (!fs.existsSync(dir)) return [];

  const grenze = new Date(jetzt);
  grenze.setDate(grenze.getDate() - keepDays);
  const grenzName = tagesOrdnerName(grenze);

  const geloescht = [];
  for (const name of fs.readdirSync(dir)) {
    if (!istTagesOrdnerName(name)) continue;
    if (name >= grenzName) continue;                       // jung genug
    const p = path.join(dir, name);
    if (!fs.statSync(p).isDirectory()) continue;           // Datei mit Datumsnamen
    fs.rmSync(p, { recursive: true, force: true });
    geloescht.push(name);
  }
  return geloescht;
}
```

In `runBackup` direkt **vor** `bericht.dauerMs = …` einfügen:

```js
  // Rotation ist nachrangig: scheitert sie, sind die Snapshots trotzdem gültig.
  try {
    bericht.geloeschteTage = pruneOldBackups(aufbewahrungTage, { dir, jetzt });
  } catch (err) {
    bericht.fehler.push({ oid: null, name: '(rotation)', fehler: err.message });
    logFehler({
      quelle: 'backend',
      nachricht: `[backup] Rotation: ${err.message}`,
      stack: err.stack,
    });
  }
```

`module.exports` um `pruneOldBackups` erweitern.

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (24 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js
git commit -m "feat(backup): Rotation loescht Tagesordner aelter als 30 Tage"
```

---

### Task 5: SQL-Adapter — `listAzubis` und `ladeWochen`

**Files:**
- Modify: `backend/services/berichtsheftBackup.js`
- Modify: `backend/services/berichtsheftBackup.test.js`

**Interfaces:**
- Consumes: `getPool`/`sql` aus `../db/connection`, `buildReqUser` aus `./users`
- Produces:
  - `listAzubis(pool?) → Promise<azubi[]>` — alle OIDs aus `dbo.Wochen` mit Stammdaten
  - `ladeWochen(azubiOid, pool?) → Promise<row[]>` — Wochen mit geparsten `tage`/`kommentare`

Beide nehmen optional einen `pool` — nur damit die Tests einen Fake einsetzen können (Muster wie `services/zugriffContext.js`, getestet in `vertretungen.test.js`).

- [ ] **Step 1: Failing Tests mit Fake-Pool schreiben**

Append to `backend/services/berichtsheftBackup.test.js`:

```js
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
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: FAIL — `listAzubis: SQL-Adapter fehlt noch` (die Platzhalter aus Task 3)

- [ ] **Step 3: Platzhalter durch echte Adapter ersetzen**

In `backend/services/berichtsheftBackup.js` die beiden Platzhalter aus Task 3 löschen und stattdessen einfügen (Requires oben bei `fs`/`path` ergänzen):

```js
const { getPool, sql } = require('../db/connection');
const { buildReqUser } = require('./users');
```

```js
/* Gesichert wird über dbo.Wochen, NICHT über die Nutzerliste: so sind
   DH-Studenten und inaktive/ehemalige Konten automatisch dabei — genau die,
   deren abgeschlossene Hefte im Ernstfall gebraucht werden. Ein Datenrest
   ohne Nutzerkonto (LEFT JOIN ohne Treffer) wird trotzdem gesichert, dann
   mit leeren Stammdaten. */
async function listAzubis(pool) {
  const p = pool || await getPool();
  const res = await p.request().query(`
    SELECT u.*, w.AzubiOid AS WocheAzubiOid
    FROM (SELECT DISTINCT AzubiOid FROM dbo.Wochen) w
    LEFT JOIN dbo.Users u ON u.Oid = w.AzubiOid
  `);
  return res.recordset.map((row) => {
    const u = buildReqUser(row) || {};
    return {
      oid: row.Oid || row.WocheAzubiOid,
      name: u.name || '',
      email: u.email || '',
      beruf: u.beruf || '',
      berichtTyp: u.berichtTyp || '',
      ausbildungsBeginn: u.ausbildungsBeginn || '',
      ausbildungsEnde: u.ausbildungsEnde || '',
    };
  });
}

/* Dieselbe Abfrage wie routes/wochen.js GET / — aber ohne Zugriffsfilter und
   ohne annotiereWoche: der Job läuft als System, nicht als Nutzer. */
async function ladeWochen(azubiOid, pool) {
  const p = pool || await getPool();
  const res = await p.request()
    .input('azubiOid', sql.NVarChar(36), azubiOid)
    .query(`
      SELECT w.*,
        (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
        (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
      FROM dbo.Wochen w
      WHERE w.AzubiOid = @azubiOid
      ORDER BY w.Jahr DESC, w.KW DESC
    `);
  return res.recordset.map((row) => {
    const woche = {
      ...row,
      tage: row.tageJson ? JSON.parse(row.tageJson) : [],
      kommentare: row.kommentareJson ? JSON.parse(row.kommentareJson) : [],
    };
    delete woche.tageJson;
    delete woche.kommentareJson;
    return woche;
  });
}
```

`module.exports` um `listAzubis, ladeWochen` erweitern.

**Wichtig:** `sql.NVarChar` wird nur von der echten `mssql`-Bibliothek gebraucht; im Fake-Pool ignoriert `input()` den Typ. Der Require von `../db/connection` baut noch keine Verbindung auf (erst `getPool()` tut das) — die Tests bleiben also DB-frei.

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (27 Tests)

- [ ] **Step 5: Gesamte Backend-Testsuite laufen lassen (keine Regressionen)**

Run (aus `backend/`): `node --test`
Expected: alle bestehenden Test-Dateien weiter grün

- [ ] **Step 6: Commit**

```bash
git add backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js
git commit -m "feat(backup): SQL-Adapter fuer Azubi-Liste und Wochen"
```

---

### Task 6: Nacht-Job starten + Dokumentation

**Files:**
- Modify: `backend/services/berichtsheftBackup.js` (`runBackupWennNoetig`)
- Modify: `backend/services/berichtsheftBackup.test.js`
- Modify: `backend/server.js` (Block am Ende, nach dem `entra-sync`-Block)
- Modify: `README.md`

**Interfaces:**
- Consumes: `runBackup` (Task 3), `tagesOrdnerName`, `msBisNaechsteUhrzeit`, `BACKUP_DIR`, `AUFBEWAHRUNG_TAGE` (Task 2)
- Produces: `runBackupWennNoetig(deps) → Promise<bericht|null>` — `null`, wenn für den Tag schon ein `_manifest.json` existiert

**Warum `runBackupWennNoetig`?** Der Start-Lauf soll nach einem Deployment sofort einen Stand erzeugen. Im Entwicklungsbetrieb läuft der Server aber mit `node --watch` und startet bei jeder Code-Änderung neu — ein bedingungsloser Start-Lauf würde die DB dutzende Male am Tag durchziehen. Existiert das Manifest des Tages schon, wird der Start-Lauf übersprungen; der 02:00-Lauf läuft immer.

- [ ] **Step 1: Failing Test schreiben**

Append to `backend/services/berichtsheftBackup.test.js`:

```js
test('runBackupWennNoetig: erster Aufruf sichert, zweiter am selben Tag nicht', async () => {
  const dir = tempDir();
  const ersteR = await B.runBackupWennNoetig(fakeDeps(dir));
  assert.ok(ersteR, 'erster Lauf muss einen Bericht liefern');
  assert.equal(ersteR.dateien, 1);

  const zweiteR = await B.runBackupWennNoetig(fakeDeps(dir));
  assert.equal(zweiteR, null, 'zweiter Lauf am selben Tag wird uebersprungen');
});

test('runBackupWennNoetig: neuer Tag sichert wieder', async () => {
  const dir = tempDir();
  await B.runBackupWennNoetig(fakeDeps(dir));
  const morgen = await B.runBackupWennNoetig(fakeDeps(dir, {
    jetzt: new Date(2026, 7, 1, 2, 0, 0),
  }));
  assert.ok(morgen);
  assert.ok(fs.existsSync(pathMod.join(dir, '2026-08-01', '_manifest.json')));
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: FAIL — `B.runBackupWennNoetig is not a function`

- [ ] **Step 3: `runBackupWennNoetig` implementieren**

In `backend/services/berichtsheftBackup.js` nach `runBackup` einfügen:

```js
/* Start-Lauf-Variante: überspringt den Lauf, wenn für den Tag bereits ein
   Manifest existiert. Nötig, weil der Dev-Server mit `node --watch` bei
   jeder Code-Änderung neu startet — ein bedingungsloser Start-Lauf würde
   die DB dutzende Male am Tag durchziehen. */
async function runBackupWennNoetig(deps = {}) {
  const { jetzt = new Date(), dir = BACKUP_DIR } = deps;
  const manifest = path.join(dir, tagesOrdnerName(jetzt), '_manifest.json');
  if (fs.existsSync(manifest)) return null;
  return runBackup(deps);
}
```

`module.exports` um `runBackupWennNoetig` erweitern.

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run (aus `backend/`): `node --test services/berichtsheftBackup.test.js`
Expected: PASS (29 Tests)

- [ ] **Step 5: Job in server.js starten**

Modify `backend/server.js` — direkt **nach** dem `entra-sync`-Block (endet mit dem `else { console.warn('[entra-sync] NICHT konfiguriert …') }`) anfügen:

```js
// ── Nächtliche Berichtsheft-Backups ──────────────────────────────
// Schreibt pro Azubi einen JSON-Snapshot nach data/backups/<tag>/ und räumt
// Ordner älter als AUFBEWAHRUNG_TAGE weg. Selbst-nachplanender setTimeout
// statt setInterval(24h): trifft dauerhaft 02:00 Ortszeit, auch über
// Neustarts und Sommerzeitwechsel hinweg.
const {
  runBackup: runBerichtsheftBackup,
  runBackupWennNoetig: runBerichtsheftBackupWennNoetig,
  msBisNaechsteUhrzeit,
  AUFBEWAHRUNG_TAGE: BACKUP_AUFBEWAHRUNG,
} = require('./services/berichtsheftBackup');
const BACKUP_STUNDE = 2;

function protokolliereBackup(bericht) {
  if (!bericht) return;   // Start-Lauf übersprungen (heute schon gesichert)
  console.log(`[backup] ${bericht.dateien} Dateien, ${bericht.uebersprungen} übersprungen, `
    + `${bericht.fehler.length} Fehler, ${bericht.geloeschteTage.length} alte Tage entfernt.`);
}
function meldeBackupFehler(err) {
  console.error('[backup] Lauf fehlgeschlagen:', err.message);
  logFehler({ quelle: 'backend', nachricht: `[backup] Lauf: ${err.message}`, stack: err.stack });
}
function planeBackup() {
  setTimeout(() => {
    runBerichtsheftBackup({ logFehler })
      .then(protokolliereBackup)
      .catch(meldeBackupFehler)
      .finally(planeBackup);   // Kette hält auch nach einem Fehlschlag
  }, msBisNaechsteUhrzeit(BACKUP_STUNDE));
}

runBerichtsheftBackupWennNoetig({ logFehler }).then(protokolliereBackup).catch(meldeBackupFehler);
planeBackup();
console.log(`[backup] aktiv — täglich ${BACKUP_STUNDE}:00 Uhr, Aufbewahrung ${BACKUP_AUFBEWAHRUNG} Tage.`);
```

- [ ] **Step 6: Server starten und den Start-Lauf prüfen**

Run (aus `backend/`): `node server.js`
Expected in der Konsole: `[backup] aktiv — täglich 2:00 Uhr, Aufbewahrung 30 Tage.` und eine `[backup] N Dateien, …`-Zeile.

Danach prüfen (aus dem Repo-Root):

```bash
ls backend/data/backups/            # Tagesordner mit heutigem Datum
cat backend/data/backups/$(date +%F)/_manifest.json
```

Erwartung: Manifest mit `dateien > 0` und `fehler: []`. Server stoppen (`Strg+C`), erneut starten: die `[backup] N Dateien`-Zeile darf **nicht** wieder erscheinen (Start-Lauf übersprungen).

- [ ] **Step 7: Wiederherstellung end-to-end belegen**

1. Server läuft, App unter `http://localhost:3000/app/profil.html?tab=import` öffnen (Demo-Login `florian.kuniss.demo@putzmeister.com`).
2. Eine Snapshot-Datei dieses Azubis aus `backend/data/backups/<heute>/` auswählen.
3. Im Abschnitt **Backup** auf „Wiederherstellen…" klicken und die Datei laden.
4. Erwartung: Die Vorschau erkennt die Datei (kein „Die Datei ist kein Berichtsheft-Backup."), nennt das Backup-Datum und listet die Wochen als „neu"/„überschreiben"/„geschützt" auf.

Schlägt das fehl, ist die Formatkopplung verletzt — `analyzeBackup` in [app/js/berichtsheft-export.js](../../../app/js/berichtsheft-export.js) (~Zeile 180) gegen `buildBackupPayload` abgleichen.

- [ ] **Step 8: README ergänzen**

Modify `README.md`:

In der Projektstatus-Tabelle nach der Zeile „Berichtsheft-Export (JSON-Backup + PDF-Ausbildungsnachweis)" einfügen:

```markdown
| Automatische tägliche Berichtsheft-Backups (server-seitig, JSON) | ✅ erledigt |
```

Im Abschnitt „Export & Backup" nach der PDF-Zeile anfügen:

```markdown
- **Automatische Nacht-Backups (server-seitig):** Ein Job schreibt täglich um
  02:00 pro Azubi einen JSON-Snapshot nach `backend/data/backups/<YYYY-MM-DD>/`
  (Format `berichtsheft-backup` v1, daher über den „Wiederherstellen"-Dialog
  im Profil einspielbar) und löscht Tagesordner älter als 30 Tage. Ein
  `_manifest.json` je Tag protokolliert Anzahl und Fehler. Ohne UI — der
  Zugriff läuft über das Verzeichnis auf dem Server. Datei-Anhänge sind nicht
  enthalten (liegen als `VARBINARY` in der DB). Siehe
  `backend/services/berichtsheftBackup.js`.
```

- [ ] **Step 9: Gesamte Testsuite + Commit**

Run (aus `backend/`): `node --test`
Expected: alles grün

```bash
git add backend/services/berichtsheftBackup.js backend/services/berichtsheftBackup.test.js backend/server.js README.md
git commit -m "feat(backup): naechtlicher Backup-Job in server.js verdrahtet"
```

---

## Abschluss-Prüfung

- [ ] `node --test` aus `backend/` — alles grün (29 neue Tests plus Bestand)
- [ ] `backend/data/backups/<heute>/` enthält Snapshots und ein `_manifest.json`
- [ ] Eine Snapshot-Datei wurde über den „Wiederherstellen"-Dialog erfolgreich eingelesen (Task 6, Step 7)
- [ ] `git status` sauber; `backend/data/` erscheint dank [.gitignore](../../../.gitignore) nicht als Änderung
