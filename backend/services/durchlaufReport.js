'use strict';
/* =====================================================================
   DURCHLAUF-REPORT — Datenbeschaffung für das Sammel-PDF.
   Design-Spec: docs/superpowers/specs/2026-09-09-durchlauf-report-design.md

   Liefert für 1..n Azubis den Abteilungsdurchlauf eines Zeitraums samt
   Beurteilungs-Kurzinfo. Das PDF selbst baut der Client
   (app/js/durchlauf-report.js) — hier entsteht nur JSON.

   ZWEI DINGE, DIE HIER BEWUSST DOPPELT ABGESICHERT SIND:

   1. SICHTBARKEIT. Der Client schneidet seine Auswahl schon mit
      GET /report/azubis, aber jede angeforderte OID wird hier NOCHMAL
      gegen azubiSicht.sichtbareAzubis geprüft. Eine Ausbildungsleitung
      darf keinen Report über einen Azubi eines fremden Bereichs ziehen,
      auch nicht mit einem selbst gebauten POST.

   2. ENTWURFSTEXTE. Nur `Status='abgeschlossen'` liefert Note und Texte —
      einmal im SQL-CASE, einmal in bereinigeBeurteilung(). Ein
      Beurteilungs-Entwurf ist eine private Notiz des Verantwortlichen;
      landete er im Report, stünde eine unfertige Bewertung schwarz auf
      weiß in einer Leitungsakte. Zwei Schichten, weil ein späterer
      Umbau der Abfrage die JS-Regel nicht mitreißen darf (und umgekehrt).

   Namen bleiben im DB-Format „Nachname, Vorname" — gedreht wird erst im
   Client (displayName), wie überall im Repo.
   ===================================================================== */
const { sql } = require('../db/connection');
const azubiSicht = require('./azubiSicht');
const { ymd } = require('./zugriff');

const MAX_AZUBIS = 200;          // ein Report, kein Datenabzug
const OID_MAXLEN = 36;           // GUID-String; NIEMALS parseInt (docs/MEMORY)
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/* ── REIN ───────────────────────────────────────────────────────────── */

// Echtes Kalenderdatum? Die Regex allein lässt 2026-13-01 durch.
function istTag(s) {
  if (typeof s !== 'string' || !ISO_TAG.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Body-Prüfung für POST /api/beurteilungen/report.
// Rückgabe: {ok:true, azubiOids, von, bis} | {ok:false, fehler}
function pruefeAnfrage(body) {
  const b = body || {};
  const rohe = b.azubiOids;
  if (!Array.isArray(rohe) || !rohe.length) {
    return { ok: false, fehler: 'azubiOids muss eine nicht-leere Liste sein.' };
  }
  const gesehen = new Set();
  const azubiOids = [];
  for (const roh of rohe) {
    if (typeof roh !== 'string') return { ok: false, fehler: 'azubiOids darf nur Zeichenketten enthalten.' };
    const oid = roh.trim();
    if (!oid || oid.length > OID_MAXLEN) return { ok: false, fehler: 'Ungültige Azubi-Kennung.' };
    if (gesehen.has(oid)) continue;
    gesehen.add(oid);
    azubiOids.push(oid);
  }
  if (!azubiOids.length) return { ok: false, fehler: 'azubiOids muss eine nicht-leere Liste sein.' };
  if (azubiOids.length > MAX_AZUBIS) {
    return { ok: false, fehler: `Zu viele Personen (maximal ${MAX_AZUBIS}).` };
  }
  if (!istTag(b.von) || !istTag(b.bis)) {
    return { ok: false, fehler: 'von und bis müssen Datumsangaben im Format YYYY-MM-DD sein.' };
  }
  if (b.von > b.bis) return { ok: false, fehler: '„Bis" liegt vor „Von".' };
  return { ok: true, azubiOids, von: b.von, bis: b.bis };
}

// Eine Zeile aus dem LEFT JOIN auf dbo.Beurteilungen → Report-Objekt.
// Ohne Beurteilung: null. Nicht abgeschlossen: nur id/status/typ.
function bereinigeBeurteilung(row) {
  const r = row || {};
  if (r.BeurteilungId == null) return null;
  const status = r.Status || null;
  const fertig = status === 'abgeschlossen';
  const zahl = v => (v == null ? null : Number(v));
  return {
    id: r.BeurteilungId,
    status,
    typ: r.Typ || 'gross',
    note: fertig ? zahl(r.Note) : null,
    gesamtPunkte: fertig ? zahl(r.GesamtPunkte) : null,
    abgeschlossenAm: fertig ? (ymd(r.AbgeschlossenAm) || null) : null,
    individuelleBeurteilung: fertig ? (r.IndividuelleBeurteilung ?? null) : null,
    kurzfeedbackEindruck: fertig ? (r.KurzfeedbackEindruck ?? null) : null,
    kurzfeedbackEmpfehlung: fertig ? (r.KurzfeedbackEmpfehlung ?? null) : null,
  };
}

// Eine Zuweisungszeile → Station. mssql liefert DATE-Spalten als Date-Objekt,
// der Report rechnet aber mit 'YYYY-MM-DD' (Stringvergleiche im Builder).
function formeStation(row) {
  return {
    id: row.Id,
    abteilung: row.Abteilung ?? null,
    von: ymd(row.Von),
    bis: row.Bis ? ymd(row.Bis) : null,
    verantwName: row.VerantwName ?? null,
    verantwEmail: row.VerantwEmail ?? null,
    beurteilung: bereinigeBeurteilung(row),
  };
}

/* ── UNREIN: Loader ─────────────────────────────────────────────────── */

// Eine Abfrage für alle angeforderten Azubis (kein N+1). Der Zeitraumfilter
// ist die Überlappungsregel: die Station zählt, wenn sie in den Zeitraum
// hineinragt — offenes Bis (laufende Abteilung) inklusive.
const SQL_STATIONEN = platzhalter => `
     SELECT z.Id, z.AzubiOid, z.Abteilung, z.Von, z.Bis, z.VerantwEmail,
            COALESCE(z.VerantwName, u.Name) AS VerantwName,
            b.Id AS BeurteilungId, b.Status, b.Typ, b.AbgeschlossenAm,
            CASE WHEN b.Status='abgeschlossen' THEN b.Note END AS Note,
            CASE WHEN b.Status='abgeschlossen' THEN b.GesamtPunkte END AS GesamtPunkte,
            CASE WHEN b.Status='abgeschlossen' THEN b.IndividuelleBeurteilung END AS IndividuelleBeurteilung,
            CASE WHEN b.Status='abgeschlossen' THEN b.KurzfeedbackEindruck END AS KurzfeedbackEindruck,
            CASE WHEN b.Status='abgeschlossen' THEN b.KurzfeedbackEmpfehlung END AS KurzfeedbackEmpfehlung
     FROM dbo.Zuweisungen z
     LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id
     LEFT JOIN dbo.Users u ON LOWER(u.Email) = LOWER(z.VerantwEmail)
     WHERE z.AzubiOid IN (${platzhalter}) AND z.Von <= @bis AND (z.Bis IS NULL OR z.Bis >= @von)
     ORDER BY z.AzubiOid, z.Von, z.Id`;

async function ladeReport(pool, user, { azubiOids, von, bis }) {
  const sichtbar = await azubiSicht.sichtbareAzubis(pool, user);
  const nachOid = new Map(sichtbar.map(r => [r.Oid, r]));
  const unzulaessig = azubiOids.filter(o => !nachOid.has(o));
  if (unzulaessig.length) {
    const err = new Error('Kein Zugriff auf mindestens eine Person.');
    err.status = 403;
    err.unzulaessig = unzulaessig;
    throw err;
  }

  const req = pool.request();
  azubiOids.forEach((o, i) => req.input(`o${i}`, sql.NVarChar(OID_MAXLEN), o));
  req.input('von', sql.Date, von);
  req.input('bis', sql.Date, bis);
  const r = await req.query(SQL_STATIONEN(azubiOids.map((_, i) => `@o${i}`).join(',')));

  const stationenJeOid = new Map(azubiOids.map(o => [o, []]));
  for (const row of r.recordset) {
    const liste = stationenJeOid.get(row.AzubiOid);
    if (liste) liste.push(formeStation(row));
  }

  // Reihenfolge = die von sichtbareAzubis (ORDER BY Name), damit ein
  // Sammel-Report alphabetisch sortiert aus der Presse kommt.
  const azubis = sichtbar
    .filter(rw => stationenJeOid.has(rw.Oid))
    .map(rw => ({
      oid: rw.Oid,
      name: rw.Name ?? null,
      email: rw.Email ?? null,
      role: rw.Role ?? null,
      beruf: rw.Beruf ?? null,
      department: rw.Department ?? null,
      ausbildungsBeginn: rw.AusbildungBeginn ? ymd(rw.AusbildungBeginn) : null,
      ausbildungsEnde: rw.AusbildungEnde ? ymd(rw.AusbildungEnde) : null,
      stationen: stationenJeOid.get(rw.Oid),
    }));

  return {
    von, bis, stand: ymd(new Date()),
    erstelltVon: { oid: (user && user.oid) || null, name: (user && user.name) || null },
    azubis,
  };
}

module.exports = {
  MAX_AZUBIS,
  pruefeAnfrage, bereinigeBeurteilung, formeStation, ladeReport,
};
