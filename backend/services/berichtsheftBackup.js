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
   app/js/api.js.

   Wichtig zur Reichweite der Absicherung: berichtsheftBackup.test.js
   nagelt NUR diese Backend-Seite fest (Key-Listen sind im Test
   hartcodiert, api.js wird dort nie geladen). Ein neues Feld in
   app/js/api.js lässt den Test also GRÜN — die Kopplung hält allein
   über diesen und den gegenüberliegenden Kommentar in api.js. Eine
   Formatänderung muss deshalb bewusst auf beiden Seiten (und in der
   Key-Liste des Tests) nachgezogen werden.
   =================================================================== */

const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../db/connection');
const { buildReqUser } = require('./users');

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
    // Waise: kein Users-Treffer (LEFT JOIN leer) → durchgängig leere Stammdaten.
    // Früher Return statt Bedingung pro Feld, weil buildReqUser().berichtTyp
    // NIE falsy ist (users.js setzt 'wöchentlich' als Default) — ein '||' auf
    // dem Rückgabewert würde den Default fälschlich durchreichen.
    if (!row.Oid) {
      return {
        oid: row.WocheAzubiOid,
        name: '', email: '', beruf: '', berichtTyp: '',
        ausbildungsBeginn: '', ausbildungsEnde: '',
      };
    }
    const u = buildReqUser(row);
    return {
      oid: u.oid,
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

/* Löscht Tagesordner, deren Datum älter als keepDays ist. Bei Namen im
   Format YYYY-MM-DD ist der lexikografische Vergleich identisch mit dem
   chronologischen — deshalb reicht ein String-Vergleich, ohne Parsing.
   Alles, was nicht wie ein Tagesordner heißt (oder keiner ist), bleibt
   unangetastet: Schutz gegen versehentliches Löschen fremder Daten.

   Einzelfehler stoppen die Rotation NICHT: unter Windows kann ein offenes
   Handle oder der Virenscanner ein einzelnes rmSync mit EPERM/EBUSY kippen.
   Früher brach die Schleife dann ab und ab diesem Ordner wurde nie wieder
   aufgeräumt. Jetzt werden Fehler gesammelt und am Ende gebündelt geworfen;
   die bis dahin gelöschten Tage hängen als err.geloescht am Fehler, damit
   der Aufrufer sie trotzdem ins Manifest schreiben kann. */
function pruneOldBackups(keepDays = AUFBEWAHRUNG_TAGE, { dir = BACKUP_DIR, jetzt = new Date() } = {}) {
  if (!Number.isFinite(keepDays) || keepDays < 0) throw new Error(`pruneOldBackups: ungültige Aufbewahrung "${keepDays}"`);
  if (!fs.existsSync(dir)) return [];

  const grenze = new Date(jetzt);
  grenze.setDate(grenze.getDate() - keepDays);
  const grenzName = tagesOrdnerName(grenze);

  const geloescht = [];
  const probleme = [];
  for (const name of fs.readdirSync(dir)) {
    if (!istTagesOrdnerName(name)) continue;
    if (name >= grenzName) continue;                       // jung genug
    const p = path.join(dir, name);
    try {
      if (!fs.statSync(p).isDirectory()) continue;         // Datei mit Datumsnamen
      fs.rmSync(p, { recursive: true, force: true });
      geloescht.push(name);
    } catch (err) {
      probleme.push(`${name}: ${err.message}`);            // weiter mit dem nächsten Tag
    }
  }

  if (probleme.length) {
    const err = new Error(`pruneOldBackups: ${probleme.length} Tagesordner nicht löschbar `
      + `(${probleme.join('; ')})`);
    err.geloescht = geloescht;   // Teilerfolg nicht verlieren
    throw err;
  }
  return geloescht;
}

/* Schreibt für jeden Azubi mit mindestens einer Woche einen JSON-Snapshot in
   data/backups/<tag>/ und daneben ein _manifest.json mit den Zählern.
   Alle Datenzugriffe sind injizierbar — dadurch ist der komplette Job ohne
   SQL-Server testbar (siehe berichtsheftBackup.test.js).
   Fehler eines einzelnen Azubis brechen den Lauf NICHT ab: sie landen im
   Manifest und im Fehler-Posteingang, der Rest wird gesichert.

   Öffentlicher Einstieg ist runBackup() — es serialisiert die Läufe (siehe
   dort). fuehreBackupAus enthält die eigentliche Arbeit. */
async function fuehreBackupAus(deps = {}) {
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
  // Der Tagesordner wird erst angelegt, wenn wirklich etwas hineingeschrieben
  // wird. Sonst bliebe bei einem Totalausfall (listAzubis wirft, DB weg) ein
  // leerer Ordner ohne Manifest zurück — der für einen Admin wie ein
  // erfolgreicher Lauf aussieht.
  let tagDirAngelegt = false;
  const tagDirSicherstellen = () => {
    if (tagDirAngelegt) return tagDir;
    fs.mkdirSync(tagDir, { recursive: true });
    tagDirAngelegt = true;
    return tagDir;
  };

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
      fs.writeFileSync(path.join(tagDirSicherstellen(), dateiName(azubi)),
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

  // Rotation ist nachrangig: scheitert sie, sind die Snapshots trotzdem gültig.
  try {
    bericht.geloeschteTage = pruneOldBackups(aufbewahrungTage, { dir, jetzt });
  } catch (err) {
    // Teilerfolg mitnehmen: einzelne gesperrte Ordner dürfen die übrigen
    // Löschungen nicht aus dem Manifest tilgen (siehe pruneOldBackups).
    bericht.geloeschteTage = Array.isArray(err.geloescht) ? err.geloescht : [];
    bericht.fehler.push({ oid: null, name: '(rotation)', fehler: err.message });
    logFehler({
      quelle: 'backend',
      nachricht: `[backup] Rotation: ${err.message}`,
      stack: err.stack,
    });
  }

  bericht.dauerMs = Date.now() - startMs;
  fs.writeFileSync(path.join(tagDirSicherstellen(), '_manifest.json'),
    JSON.stringify(bericht, null, 2), 'utf8');
  return bericht;
}

/* Lauf-Sperre: Start-Lauf und 02:00-Timer sind unabhängig voneinander. Startet
   der Dienst kurz vor 02:00 (oder zieht sich der Start-Lauf darüber hinaus),
   liefen sonst zwei Backups gleichzeitig in denselben Tagesordner und das
   Manifest des langsameren überschrieb das des schnelleren. Ein zweiter Aufruf
   bekommt deshalb die bereits laufende Promise zurück, statt parallel zu
   starten — der Bericht ist dann der des laufenden Durchgangs. */
let laufenderBackup = null;

function runBackup(deps = {}) {
  if (laufenderBackup) return laufenderBackup;
  laufenderBackup = fuehreBackupAus(deps)
    .finally(() => { laufenderBackup = null; });
  return laufenderBackup;
}

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

module.exports = {
  AUFBEWAHRUNG_TAGE, BACKUP_DIR,
  buildBackupPayload,
  slugName, dateiName, tagesOrdnerName, istTagesOrdnerName, msBisNaechsteUhrzeit,
  listAzubis, ladeWochen,
  pruneOldBackups,
  runBackup,
  runBackupWennNoetig,
};
