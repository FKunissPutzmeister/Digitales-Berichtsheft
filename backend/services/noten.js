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
// Sichtbarkeitsregel (dauerAzubiOids/sichtbareAzubis) liegt seit 2026-09-09 in
// services/azubiSicht.js — es gibt zwei Konsumenten: die Noten-Ansicht und den
// Durchlauf-Report. Hier nur noch benutzt und unverändert re-exportiert, damit
// routes/noten.js unangetastet bleibt.
const azubiSicht = require('./azubiSicht');
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
  kontext.dauerAzubiOids = await azubiSicht.dauerAzubiOids(pool, user);
  if (azubiOid && user.istAusbildungsleiter && user.ausbildungsleiterBereich) {
    const bereich = await bereichVonAzubi(pool, azubiOid);
    kontext.azubiBereich = bereich === undefined ? null : bereich;
  }
  return kontext;
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
  ladeNotenKontext, bereichVonAzubi, empfaengerFuerMitteilung,
  // Re-Exporte aus azubiSicht.js: routes/noten.js ruft weiter
  // notenSvc.sichtbareAzubis(pool, req.user) auf, die Regel selbst liegt
  // jetzt aber an einer Stelle für beide Konsumenten (Noten + Report).
  dauerAzubiOids: azubiSicht.dauerAzubiOids,
  sichtbareAzubis: azubiSicht.sichtbareAzubis,
};
