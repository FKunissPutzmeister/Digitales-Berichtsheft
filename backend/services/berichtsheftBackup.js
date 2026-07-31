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
