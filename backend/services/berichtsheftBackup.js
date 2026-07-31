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

module.exports = {
  AUFBEWAHRUNG_TAGE, BACKUP_DIR,
  buildBackupPayload,
  slugName, dateiName, tagesOrdnerName, istTagesOrdnerName, msBisNaechsteUhrzeit,
  listAzubis, ladeWochen,
};
