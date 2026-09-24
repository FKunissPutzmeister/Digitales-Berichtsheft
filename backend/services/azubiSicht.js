'use strict';
/* =====================================================================
   AZUBI-SICHT — wen darf ein Ausbilder/eine Ausbildungsleitung sehen?

   Herausgelöst aus services/noten.js (2026-09-09), weil es jetzt ZWEI
   Konsumenten gibt: die Noten-/Zeugnis-Ansicht (routes/noten.js) und den
   Durchlauf-Report (services/durchlaufReport.js, routes/beurteilungen.js).
   noten.js re-exportiert die beiden Loader weiter unverändert — der
   dortige Aufruf und die Signaturen bleiben, wie sie waren.

   DIE REGEL, DIE HIER BEWUSST ANDERS IST ALS BEI WOCHEN/BEURTEILUNGEN:
   Eine BEFRISTETE Abteilungs-Zuweisung (dbo.Zuweisungen, per E-Mail) gibt
   KEINEN Zugriff. Wer einen Azubi sechs Wochen in seiner Abteilung hat,
   bekommt deswegen keinen Einblick in dessen Berufsschulzeugnis und auch
   keinen Gesamtreport über dessen ganzen Durchlauf. Sichtbarkeit kommt
   nur aus dbo.AusbilderAzubis (dauerhaft, per OID) — um die aktiven
   Vertretungen erweitert — plus dem Bereich einer Ausbildungsleitung.
   Aus demselben Grund darf vertretungen.listDelegierteAzubis hier nicht
   benutzt werden: die unioniert AusbilderAzubis MIT Zuweisungen.VerantwEmail
   und würde die ausgeschlossene Quelle über eine Vertretung zurückholen.
   ===================================================================== */
const { sql } = require('../db/connection');
const departmentSvc = require('./department');
const vertretungenSvc = require('./vertretungen');

/* ── REIN ───────────────────────────────────────────────────────────── */

// Darf @user den Durchlauf-Report ziehen? Admin/Developer immer; eine
// Ausbildungsleitung nur MIT gesetztem Bereich — ohne Bereich wäre die
// serverseitige Schnittmenge leer, ein Report über niemanden. Ein normaler
// Prüfer/Ausbilder bekommt den Sammel-Report bewusst nicht: er ist ein
// Führungsinstrument über den ganzen Durchlauf, kein Arbeitsmittel für die
// eigene Station (dafür gibt es den Beurteilungsbogen).
function istReportBerechtigt(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'developer') return true;
  return !!(user.istAusbildungsleiter && user.ausbildungsleiterBereich);
}

/* ── UNREIN: Loader ─────────────────────────────────────────────────── */

// Azubi-OIDs, die @user über DAUERHAFTE Zuordnungen sieht: die eigenen
// (AusbilderAzubis) plus die der Personen, die er aktuell vertritt.
// Bewusst zwei Schritte statt listDelegierteAzubis (siehe Kopfkommentar).
async function dauerAzubiOids(pool, user) {
  if (!user || !user.oid) return [];
  const vertretene = await vertretungenSvc.aktiveVertreteneOids(pool, user.oid);
  const oids = [user.oid, ...vertretene];
  const platzhalter = oids.map((_, i) => `@a${i}`).join(',');
  const req = pool.request();
  oids.forEach((o, i) => req.input(`a${i}`, sql.NVarChar(36), o));
  const r = await req.query(
    `SELECT DISTINCT AzubiOid FROM dbo.AusbilderAzubis WHERE AusbilderOid IN (${platzhalter})`);
  return r.recordset.map(x => x.AzubiOid);
}

// Quelle für GET /api/noten/azubis und GET /api/beurteilungen/report/azubis.
// Bewusst NICHT der /me/azubis-Selektor (routes/users.js): der enthält
// befristete Zuweisungs-Azubis, die hier 403 bekämen, und keine DH-Studenten.
// AusbildungBeginn/AusbildungEnde kommen mit, weil der Durchlauf-Report den
// Ausbildungsrahmen in den Stammdaten druckt (Spalten ohne „s", users.js).
async function sichtbareAzubis(pool, user) {
  if (!user) return [];
  const privilegiert = user.role === 'developer' || user.role === 'admin';
  if (privilegiert) {
    const r = await pool.request().query(
      `SELECT Oid, Name, Email, Role, Department, Beruf, AusbildungBeginn, AusbildungEnde
       FROM dbo.Users
       WHERE Aktiv = 1 AND Role IN ('azubi','dhstudent') ORDER BY Name`);
    return r.recordset;
  }

  const oids = new Set(await dauerAzubiOids(pool, user));

  // Ausbildungsleitung: alle aktiven Azubis/DH-Studenten des eigenen
  // Bereichs. Die Department-Zuordnung passiert in JS (bereichAusDepartment
  // ist substring-basiert), nicht in SQL.
  if (user.istAusbildungsleiter && user.ausbildungsleiterBereich) {
    const r = await pool.request().query(
      `SELECT Oid, Department FROM dbo.Users
       WHERE Aktiv = 1 AND Role IN ('azubi','dhstudent')`);
    for (const row of r.recordset) {
      if (departmentSvc.bereichAusDepartment(row.Department) === user.ausbildungsleiterBereich) {
        oids.add(row.Oid);
      }
    }
  }

  if (!oids.size) return [];
  const liste = [...oids];
  const platzhalter = liste.map((_, i) => `@o${i}`).join(',');
  const req = pool.request();
  liste.forEach((o, i) => req.input(`o${i}`, sql.NVarChar(36), o));
  const r = await req.query(
    `SELECT Oid, Name, Email, Role, Department, Beruf, AusbildungBeginn, AusbildungEnde
     FROM dbo.Users
     WHERE Aktiv = 1 AND Oid IN (${platzhalter}) ORDER BY Name`);
  return r.recordset;
}

module.exports = { istReportBerechtigt, dauerAzubiOids, sichtbareAzubis };
