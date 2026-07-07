'use strict';
/* =====================================================================
   ZUGRIFFSLOGIK (rein, ohne DB/HTTP) — die eine Wahrheit, wer welches
   Berichtsheft sehen/korrigieren darf. Eingaben sind NORMALISIERTE
   Objekte (lowercase), entkoppelt vom DB-Schema:
     user      = { oid, email }
     woche     = { azubiOid, start, ende, korrigiertVon, kommentarAutoren[] }
     zuweisung = { azubiOid, verantwortlicherEmail, von, bis }
     kontext   = { zuweisungen: [zuweisung], stichtag }   // stichtag 'YYYY-MM-DD'
   ===================================================================== */

// Date | 'YYYY-MM-DD' | ISO → 'YYYY-MM-DD' (lexikografisch vergleichbar). null bei leer.
// VERTRAG: Date-Objekte werden in UTC interpretiert (toISOString). Das ist
// kanonisch für die DATE-Spalten aus mssql (useUTC), die als UTC-Mitternacht
// zurückkommen. Lokal konstruierte Dates NICHT hier hineingeben — als
// 'YYYY-MM-DD'-String übergeben.
function ymd(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Ist die Zuweisung am Stichtag aktiv (von ≤ stichtag ≤ bis, inklusive)?
function istAktiv(zuweisung, stichtag) {
  const t = ymd(stichtag), von = ymd(zuweisung.von), bis = ymd(zuweisung.bis);
  if (!t || !von || !bis) return false;
  return von <= t && t <= bis;
}

// Überschneidet die Woche [start,ende] den Zuweisungs-Zeitraum [von,bis]?
function wocheFaelltInZuweisung(woche, zuweisung) {
  const ws = ymd(woche.start), we = ymd(woche.ende);
  const von = ymd(zuweisung.von), bis = ymd(zuweisung.bis);
  if (!ws || !we || !von || !bis) return false;
  return ws <= bis && we >= von;
}

// Hat der Nutzer diese Woche je korrigiert (Statuswechsel ODER Kommentar)?
function hatKorrigiert(user, woche) {
  if (!user.oid) return false;
  if (woche.korrigiertVon && woche.korrigiertVon === user.oid) return true;
  return Array.isArray(woche.kommentarAutoren) && woche.kommentarAutoren.includes(user.oid);
}

// Ist der Nutzer dauerhaft (datumslos) als Ausbilder für diesen Azubi eingetragen?
// kontext.dauerAusbilderAzubiOids ist bereits auf den aktuellen Nutzer gefiltert.
function istDauerAusbilder(woche, kontext) {
  if (!woche.azubiOid) return false;
  const oids = (kontext && kontext.dauerAusbilderAzubiOids) || [];
  return oids.includes(woche.azubiOid);
}

// Darf der Nutzer die Woche AKTIV korrigieren (schreiben)?
function darfWocheKorrigieren(user, woche, kontext) {
  if (!woche.azubiOid) return false;
  if (istDauerAusbilder(woche, kontext)) return true; // dauerhaft: keine Datums-/Wochenprüfung
  if (!user.email) return false;
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    (z.verantwortlicherEmail || '').toLowerCase() === (user.email || '').toLowerCase() &&
    z.azubiOid === woche.azubiOid &&
    istAktiv(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}

// Darf der Nutzer die Woche SEHEN (eigenes Heft, aktiv verantwortlich, korrigiert)?
function darfWocheSehen(user, woche, kontext) {
  if (user.oid && woche.azubiOid && user.oid === woche.azubiOid) return true;
  if (darfWocheKorrigieren(user, woche, kontext)) return true;
  if (hatKorrigiert(user, woche)) return true;
  return false;
}

// Azubi-OIDs, für die der Nutzer verantwortlich ist (aktiv befristet ODER dauerhaft).
function aktivVerantwortlichFuer(user, kontext) {
  const set = new Set();
  const email = (user.email || '').toLowerCase();
  if (email) {
    for (const z of ((kontext && kontext.zuweisungen) || [])) {
      if ((z.verantwortlicherEmail || '').toLowerCase() === email && istAktiv(z, kontext.stichtag)) set.add(z.azubiOid);
    }
  }
  for (const oid of ((kontext && kontext.dauerAusbilderAzubiOids) || [])) {
    if (oid) set.add(oid);
  }
  return [...set];
}

// Datums-UNABHÄNGIGE Verantwortlichkeit für GENAU EINE Zuweisung.
// Wird gebraucht, weil Beurteilungen NACH Ende des Durchlaufs (bis < heute)
// entstehen – aktivVerantwortlichFuer (datumsaktiv) würde hier fälschlich abweisen.
function verantwortlichFuerZuweisung(user, zuweisung, kontext) {
  if (!zuweisung) return false;
  const dauer = (kontext && kontext.dauerAusbilderAzubiOids) || [];
  if (zuweisung.azubiOid && dauer.includes(zuweisung.azubiOid)) return true;
  const email = (user && user.email || '').toLowerCase();
  return !!email && (zuweisung.verantwortlicherEmail || '').toLowerCase() === email;
}

module.exports = {
  ymd, istAktiv, wocheFaelltInZuweisung, hatKorrigiert, istDauerAusbilder,
  darfWocheKorrigieren, darfWocheSehen, aktivVerantwortlichFuer,
  verantwortlichFuerZuweisung,
};
