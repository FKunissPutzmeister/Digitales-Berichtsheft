'use strict';
/* =====================================================================
   ZUGRIFFSLOGIK (rein, ohne DB/HTTP) — die eine Wahrheit, wer welches
   Berichtsheft sehen/korrigieren darf. Eingaben sind NORMALISIERTE
   Objekte (lowercase), entkoppelt vom DB-Schema:
     user      = { oid }
     woche     = { azubiOid, start, ende, korrigiertVon, kommentarAutoren[] }
     zuweisung = { azubiOid, verantwortlicherOid, von, bis }
     kontext   = { zuweisungen: [zuweisung], stichtag }   // stichtag 'YYYY-MM-DD'
   ===================================================================== */

// Date | 'YYYY-MM-DD' | ISO → 'YYYY-MM-DD' (lexikografisch vergleichbar). null bei leer.
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
  if (woche.korrigiertVon && woche.korrigiertVon === user.oid) return true;
  return Array.isArray(woche.kommentarAutoren) && woche.kommentarAutoren.includes(user.oid);
}

// Darf der Nutzer die Woche AKTIV korrigieren (schreiben)?
function darfWocheKorrigieren(user, woche, kontext) {
  const zuweisungen = (kontext && kontext.zuweisungen) || [];
  return zuweisungen.some(z =>
    z.verantwortlicherOid === user.oid &&
    z.azubiOid === woche.azubiOid &&
    istAktiv(z, kontext.stichtag) &&
    wocheFaelltInZuweisung(woche, z)
  );
}

// Darf der Nutzer die Woche SEHEN (eigenes Heft, aktiv verantwortlich, korrigiert)?
function darfWocheSehen(user, woche, kontext) {
  if (user.oid === woche.azubiOid) return true;
  if (darfWocheKorrigieren(user, woche, kontext)) return true;
  if (hatKorrigiert(user, woche)) return true;
  return false;
}

// Azubi-OIDs, für die der Nutzer am Stichtag aktiv verantwortlich ist.
function aktivVerantwortlichFuer(user, kontext) {
  const set = new Set();
  for (const z of ((kontext && kontext.zuweisungen) || [])) {
    if (z.verantwortlicherOid === user.oid && istAktiv(z, kontext.stichtag)) set.add(z.azubiOid);
  }
  return [...set];
}

module.exports = {
  ymd, istAktiv, wocheFaelltInZuweisung, hatKorrigiert,
  darfWocheKorrigieren, darfWocheSehen, aktivVerantwortlichFuer,
};
