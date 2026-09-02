'use strict';
/* =====================================================================
   NOTEN & ZEUGNISSE — Sichtbarkeit und Datenzugriff.
   Design-Spec: docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md

   Azubis und DH-Studenten legen ihre SCHULnoten samt Belegen selbst ab;
   Ausbilder und Ausbildungsleitung lesen nur.

   ZWEI REGELN, DIE HIER BEWUSST ANDERS SIND ALS IM REST DES REPOS —
   bitte nicht "vereinheitlichen":

   1. Eine BEFRISTETE Abteilungs-Zuweisung (dbo.Zuweisungen, per E-Mail)
      gibt KEINEN Zugriff. Bei Wochen und Beurteilungen ist sie eine
      gleichwertige Zugriffsquelle (services/zugriffContext.js), hier
      nicht: wer einen Azubi sechs Wochen in seiner Abteilung hat,
      bekommt deswegen keinen Einblick in dessen Berufsschulzeugnis.
      Deshalb liegt diese Logik NICHT in services/zugriff.js — dort
      nehmen alle Exporte woche/zuweisung, und ladeKorrekturKontext()
      liefert die Zuweisungen als erste Zutat.
      Aus demselben Grund darf vertretungen.listDelegierteAzubis hier
      nicht benutzt werden: die unioniert AusbilderAzubis MIT
      Zuweisungen.VerantwEmail (vertretungen.js:70-88) und würde die
      ausgeschlossene Quelle über eine Vertretung zurückholen.

   2. SCHREIBEN darf ausschließlich der Eigentümer — auch admin und
      developer nicht. Die Noten sind eine Selbstauskunft; ein fremder
      Schreibzugriff würde sie entwerten. Der Developer testet über
      backend/routes/dev-login.js als echter Azubi.

   DH-Studenten haben strukturell keine Zeile in dbo.AusbilderAzubis
   (entraSync.js filtert auf istAzubi, ausbilderAzubis.validateZuordnung
   weist sie ab). Das bleibt so — ihre Noten sieht die kaufmännische
   Ausbildungsleitung (department.js), kein einzelner Ausbilder.
   ===================================================================== */
const { sql } = require('../db/connection');
const departmentSvc = require('./department');
const vertretungenSvc = require('./vertretungen');
// Eine Wahrheit für Arten und Validierung, gemeinsam mit dem Frontend
// (Präzedenz: app/js/beurteilung-core.js wird backendseitig requirt).
const core = require('../../app/js/noten-core.js');

const ARTEN_MIT_MITTEILUNG = core.ARTEN_MIT_MITTEILUNG;
const BENACHRICHTIGUNG_TYP = 'noten_eintrag_neu'; // CK_Benachrichtigungen_Typ, Migration 044

/* ── REIN: Entscheidungslogik (getestet in noten.test.js) ───────────── */

// kontext = { dauerAzubiOids: string[], azubiBereich: 'technisch'|'kaufmaennisch'|null }
// Beachte: kontext.zuweisungen wird bewusst NICHT gelesen (siehe Regel 1).
function darfNotenSehen(user, azubiOid, kontext) {
  if (!user || !azubiOid) return false;
  if (user.oid === azubiOid) return true;
  if (user.role === 'developer' || user.role === 'admin') return true;
  const k = kontext || {};
  if (Array.isArray(k.dauerAzubiOids) && k.dauerAzubiOids.includes(azubiOid)) return true;
  if (user.istAusbildungsleiter && user.ausbildungsleiterBereich
      && k.azubiBereich === user.ausbildungsleiterBereich) return true;
  return false;
}

// Braucht keinen Kontext: Schreiben ist Eigentümer-Sache. istAzubi ist ein
// additives Tag (users.js) — ein Developer, der selbst ein Berichtsheft
// führt, pflegt auch seine Noten.
function darfNotenBearbeiten(user, azubiOid) {
  if (!user || !azubiOid) return false;
  if (user.oid !== azubiOid) return false;
  return !!(user.istAzubi || user.istDhStudent);
}

/* ── UNREIN: Loader ─────────────────────────────────────────────────── */

// Azubi-OIDs, die @user über DAUERHAFTE Zuordnungen sieht: die eigenen
// (AusbilderAzubis) plus die der Personen, die er aktuell vertritt.
// Bewusst zwei Schritte statt listDelegierteAzubis (siehe Regel 1).
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

async function bereichVonAzubi(pool, azubiOid) {
  const r = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT Department FROM dbo.Users WHERE Oid = @oid');
  if (!r.recordset.length) return undefined; // Azubi gibt es nicht -> 404
  return departmentSvc.bereichAusDepartment(r.recordset[0].Department ?? null);
}

// Ein Aufruf pro Request. azubiOid ist optional — der Bereich wird nur
// geladen, wenn er die Entscheidung überhaupt beeinflussen kann.
async function ladeNotenKontext(pool, user, azubiOid) {
  const kontext = { dauerAzubiOids: [], azubiBereich: null };
  if (!user) return kontext;
  kontext.dauerAzubiOids = await dauerAzubiOids(pool, user);
  if (azubiOid && user.istAusbildungsleiter && user.ausbildungsleiterBereich) {
    const bereich = await bereichVonAzubi(pool, azubiOid);
    kontext.azubiBereich = bereich === undefined ? null : bereich;
  }
  return kontext;
}

// Quelle für GET /api/noten/azubis. Bewusst NICHT der /me/azubis-Selektor
// (routes/users.js): der enthält befristete Zuweisungs-Azubis, die hier 403
// bekämen, und keine DH-Studenten.
async function sichtbareAzubis(pool, user) {
  if (!user) return [];
  const privilegiert = user.role === 'developer' || user.role === 'admin';
  if (privilegiert) {
    const r = await pool.request().query(
      `SELECT Oid, Name, Email, Role, Department, Beruf FROM dbo.Users
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
    `SELECT Oid, Name, Email, Role, Department, Beruf FROM dbo.Users
     WHERE Aktiv = 1 AND Oid IN (${platzhalter}) ORDER BY Name`);
  return r.recordset;
}

// Empfänger der Mitteilung: dauerhaft zugeordnete Ausbilder (um ihre
// aktiven Vertreter erweitert) plus die Ausbildungsleitung des Bereichs.
// Der Azubi selbst wird nie benachrichtigt.
async function empfaengerFuerMitteilung(pool, azubiOid) {
  const r = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT AusbilderOid FROM dbo.AusbilderAzubis WHERE AzubiOid = @oid');
  const ausbilder = r.recordset.map(x => x.AusbilderOid).filter(Boolean);
  const menge = new Set(await vertretungenSvc.mitVertretern(pool, ausbilder));

  const bereich = await bereichVonAzubi(pool, azubiOid);
  if (bereich) {
    const l = await pool.request().input('bereich', sql.NVarChar(20), bereich)
      .query(`SELECT Oid FROM dbo.Users
              WHERE IstAusbildungsleiter = 1 AND AusbildungsleiterBereich = @bereich AND Aktiv = 1`);
    l.recordset.forEach(x => menge.add(x.Oid));
  }

  menge.delete(azubiOid);
  return [...menge];
}

module.exports = {
  ARTEN_MIT_MITTEILUNG, BENACHRICHTIGUNG_TYP,
  darfNotenSehen, darfNotenBearbeiten,
  ladeNotenKontext, dauerAzubiOids, bereichVonAzubi,
  sichtbareAzubis, empfaengerFuerMitteilung,
};
