'use strict';
/* =====================================================================
   ZUGRIFFSLOGIK (rein, ohne DB/HTTP) — die eine Wahrheit, wer welches
   Berichtsheft sehen/korrigieren darf. Eingaben sind NORMALISIERTE
   Objekte (lowercase), entkoppelt vom DB-Schema:
     user      = { oid, email }
     woche     = { azubiOid, start, ende, korrigiertVon, kommentarAutoren[] }
     zuweisung = { id, azubiOid, verantwortlicherEmail, abteilung, von, bis }
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

// 6 Wochen Nachlauffrist: wie lange nach Ablauf einer Zuweisung (bis) der
// zugehörige Prüfer noch auf das Wochenfenster SEINER Zuweisung zugreifen darf
// (siehe istPeriodenPruefer). Das Wochenfenster selbst (wocheFaelltInZuweisung)
// bleibt davon unberührt — nur der Zugriffsschalter verlängert sich.
const NACHLAUF_TAGE = 42;

// Ist die Zuweisung am Stichtag noch ZUGREIFBAR (von ≤ stichtag ≤ bis + Nachlauffrist)?
// Ersetzt istAktiv innerhalb von istPeriodenPruefer; istAktiv selbst bleibt
// unverändert (wird von nichts anderem verwendet).
function istZugreifbar(zuweisung, stichtag) {
  const t = ymd(stichtag), von = ymd(zuweisung.von), bis = ymd(zuweisung.bis);
  if (!t || !von || !bis) return false;
  if (t < von) return false;
  const grenze = new Date(bis + 'T00:00:00Z');
  grenze.setUTCDate(grenze.getUTCDate() + NACHLAUF_TAGE);
  return t <= grenze.toISOString().slice(0, 10);
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

// Periodengebundener Prüfer: befristete Zuweisung (per E-Mail), am Stichtag
// zugreifbar UND die Woche fällt in den Zuweisungszeitraum.
function istPeriodenPruefer(user, woche, kontext) {
  if (!woche.azubiOid || !user.email) return false;
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    (z.verantwortlicherEmail || '').toLowerCase() === (user.email || '').toLowerCase() &&
    z.azubiOid === woche.azubiOid &&
    istZugreifbar(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}

// Rolle des Nutzers bzgl. EINER Woche. Präzedenz: Ausbilder > Prüfer > Azubi.
function rolleFuerWoche(user, woche, kontext) {
  if (istDauerAusbilder(woche, kontext)) return 'ausbilder';
  if (istPeriodenPruefer(user, woche, kontext)) return 'pruefer';
  if (user && user.oid && woche.azubiOid && user.oid === woche.azubiOid) return 'azubi';
  return null;
}

// Darf der Nutzer die Woche AKTIV korrigieren (schreiben)? (Lese-/Zugriffsgate.)
function darfWocheKorrigieren(user, woche, kontext) {
  if (!woche.azubiOid) return false;
  if (istDauerAusbilder(woche, kontext)) return true; // dauerhaft: keine Datums-/Wochenprüfung
  return istPeriodenPruefer(user, woche, kontext);
}

// Zweistufiger Genehmigungs-Automat: erlaubte Aktionen für (rolle, status, flag).
// endabnahmeDirekt=1 ⇒ Prüfer-Stufe übersprungen (nur Ausbilder handelt noch).
// Jede Aktion trägt ihren Ziel-Status, das Flag DANACH und ob es eine
// Korrektur (KorrigiertVon/Am stempeln) ist.
function wochenAktionen(rolle, status, endabnahmeDirekt) {
  const flag = endabnahmeDirekt ? 1 : 0;
  const out = [];
  if (rolle === 'azubi') {
    if (status === 'offen' || status === 'abgelehnt')
      out.push({ aktion: 'einreichen', zielStatus: 'freigegeben', endabnahmeDirekt: flag, korrektur: false });
    if (status === 'freigegeben')
      out.push({ aktion: 'zurueckziehen', zielStatus: 'offen', endabnahmeDirekt: flag, korrektur: false });
  } else if (rolle === 'pruefer') {
    if (status === 'freigegeben' && flag === 0) {
      out.push({ aktion: 'erstgenehmigen', zielStatus: 'erstgenehmigt', endabnahmeDirekt: 0, korrektur: true });
      out.push({ aktion: 'zurueckgeben',   zielStatus: 'abgelehnt',     endabnahmeDirekt: 0, korrektur: true });
    }
  } else if (rolle === 'ausbilder') {
    if (status === 'freigegeben' || status === 'erstgenehmigt') {
      out.push({ aktion: 'endgenehmigen', zielStatus: 'genehmigt', endabnahmeDirekt: 0, korrektur: true });
      out.push({ aktion: 'zurueckgeben',  zielStatus: 'abgelehnt', endabnahmeDirekt: 1, korrektur: true });
    }
  }
  return out;
}

// Darf der Nutzer die Woche SEHEN (eigenes Heft, aktiv verantwortlich, korrigiert)?
function darfWocheSehen(user, woche, kontext) {
  // admin/developer: globale Lesesicht (Gesamtüberblick über alle Azubis).
  // Entspricht der Frontend-Selektorlogik getSelectableAzubis (admin/developer
  // → alle Azubis). BEWUSST nur Lesen: darfWocheKorrigieren prüft die Rolle
  // NICHT, Schreiben bleibt an Zuweisung/Dauer-Ausbilder gebunden.
  if (user && (user.role === 'developer' || user.role === 'admin')) return true;
  if (user.oid && woche.azubiOid && user.oid === woche.azubiOid) return true;
  if (darfWocheKorrigieren(user, woche, kontext)) return true;
  if (hatKorrigiert(user, woche)) return true;
  return false;
}

// Datums-UNABHÄNGIGE Verantwortlichkeit für GENAU EINE Zuweisung.
// Wird gebraucht, weil Beurteilungen NACH Ende des Durchlaufs (bis < heute)
// entstehen – eine datumsaktive Prüfung würde hier fälschlich abweisen.
function verantwortlichFuerZuweisung(user, zuweisung, kontext) {
  if (!zuweisung) return false;
  const dauer = (kontext && kontext.dauerAusbilderAzubiOids) || [];
  if (zuweisung.azubiOid && dauer.includes(zuweisung.azubiOid)) return true;
  const email = (user && user.email || '').toLowerCase();
  return !!email && (zuweisung.verantwortlicherEmail || '').toLowerCase() === email;
}

module.exports = {
  ymd, istAktiv, istZugreifbar, NACHLAUF_TAGE, wocheFaelltInZuweisung, hatKorrigiert, istDauerAusbilder,
  darfWocheKorrigieren, darfWocheSehen,
  verantwortlichFuerZuweisung,
  istPeriodenPruefer, rolleFuerWoche, wochenAktionen,
};
