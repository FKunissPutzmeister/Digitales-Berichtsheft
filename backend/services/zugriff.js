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

// Frist für die Rücknahme eines Statuswechsels: 4 Wochen ab dem Korrektur-
// Stempel (KorrigiertAm). Danach ist die Abnahme endgültig — eine Genehmigung,
// die einen Monat steht, wird nicht mehr per Fehlklick-Korrektur aufgemacht.
const RUECKNAHME_TAGE = 28;

// Liegt der Korrektur-Stempel noch innerhalb der Rücknahmefrist?
// jetzt: optional (Tests); Default = aktuelle Zeit.
function innerhalbRuecknahmefrist(korrigiertAm, jetzt) {
  if (!korrigiertAm) return false;
  const stempel = new Date(korrigiertAm).getTime();
  if (!Number.isFinite(stempel)) return false;
  const t = (jetzt ? new Date(jetzt) : new Date()).getTime();
  return t - stempel <= RUECKNAHME_TAGE * 86400000;
}

// Zweistufiger Genehmigungs-Automat: erlaubte Aktionen für (rolle, status, flag).
// endabnahmeDirekt=1 ⇒ Prüfer-Stufe übersprungen (nur Ausbilder handelt noch).
// Jede Aktion trägt ihren Ziel-Status, das Flag DANACH und ob es eine
// Korrektur (KorrigiertVon/Am stempeln) ist.
//
// letzte = { statusVorher, endabnahmeDirektVorher, korrigiertAm, jetzt } —
// der Zustand VOR dem letzten Korrektur-Wechsel (Migration 037). Nur damit
// entsteht die Aktion 'zuruecknehmen'; fehlt er, ist nichts zurückzunehmen.
function wochenAktionen(rolle, status, endabnahmeDirekt, letzte) {
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

  // Rücknahme des letzten Statuswechsels (zu früh genehmigt / falsch
  // zurückgegeben). GENAU EIN Schritt zurück: Ziel ist der gespeicherte
  // Vorstatus, danach sind die Vorher-Spalten leer — keine Undo-Kette.
  // Jede Stufe darf nur ihre EIGENEN Wechsel aufmachen: ein Prüfer kommt
  // damit nie an die Endabnahme des Ausbilders ('genehmigt', und 'abgelehnt'
  // mit Flag 1 = vom Ausbilder zurückgegeben).
  if (letzte && letzte.statusVorher && innerhalbRuecknahmefrist(letzte.korrigiertAm, letzte.jetzt)) {
    const eigenerWechsel =
      (rolle === 'pruefer'   && (status === 'erstgenehmigt' || (status === 'abgelehnt' && flag === 0))) ||
      (rolle === 'ausbilder' && (status === 'genehmigt'     ||  status === 'abgelehnt'));
    if (eigenerWechsel) {
      out.push({
        aktion: 'zuruecknehmen',
        zielStatus: letzte.statusVorher,
        endabnahmeDirekt: letzte.endabnahmeDirektVorher ? 1 : 0,
        korrektur: false,
      });
    }
  }
  return out;
}

// Alle gültigen Wochen-Status (deckungsgleich mit CK_Wochen_Status, Migration 019).
// Serverseitige Wahrheit: ein Status aus einem Request muss hier drinstehen.
const WOCHEN_STATUS = ['offen', 'freigegeben', 'erstgenehmigt', 'genehmigt', 'abgelehnt'];

// Status, in denen die Woche in der Abnahme ist und ihr Inhalt nicht mehr
// verändert werden darf (IHK-Kriterium „nach Freigabe unveränderbar").
const GESPERRTE_STATUS = ['freigegeben', 'erstgenehmigt', 'genehmigt'];

// Darf INHALT (Wochentexte + Tage) geschrieben werden, und welchen Status trägt
// die Woche danach? Die eine Wahrheit für POST /api/wochen.
//
//   vorhanden = null | { status, korrigiertVon, korrigiertVonName }
//                     – aktueller DB-Zustand. BEIDE Korrektur-Marker gehören
//                       dazu: der Retention-Job nullt KorrigiertVon und behält
//                       nur KorrigiertVonName (retention.js PHASE_B).
//   migration = true  – Datenübernahme (IHK-PDF-Import, JSON-Restore). Nur die
//                       bringt einen FREMDEN Status mit; normales Speichern darf
//                       den Status NIE setzen (sonst genehmigt sich der Azubi selbst).
//   wunschStatus – Status aus dem Body; ausschließlich im Migrationsfall relevant.
//
// → { ok: true, status } | { ok: false, grund }
function schreibGate(vorhanden, { migration = false, wunschStatus } = {}) {
  const alt = vorhanden ? vorhanden.status : null;
  const gesperrt = GESPERRTE_STATUS.includes(alt);

  if (gesperrt && !migration) {
    return { ok: false, grund: `Woche ist ${alt} und damit schreibgeschützt. Sie muss zuerst zurückgewiesen werden.` };
  }
  // Eine Migration darf über einen importierten Status hinwegschreiben (erneuter
  // Import derselben PDF), aber NIEMALS über eine in DIESER App erteilte Abnahme.
  // Die trägt einen Korrektur-Stempel (PATCH /:id/status, korrektur:true);
  // importierte Wochen tragen keinen.
  //
  // ZWEI Marker, weil der Retention-Job KorrigiertVon nullt und ausschließlich
  // den denormalisierten KorrigiertVonName stehen lässt (retention.js PHASE_B).
  // Nur die OID zu prüfen hieße: sobald der gegenzeichnende Prüfer nach 365
  // Tagen gelöscht ist, dürfte ein noch aktiver Azubi dieselbe IHK-PDF erneut
  // importieren und Inhalt UND Status der gegengezeichneten Woche überschreiben.
  if (gesperrt && (vorhanden.korrigiertVon || vorhanden.korrigiertVonName)) {
    return { ok: false, grund: `Woche wurde in dieser App bereits geprüft (${alt}) und kann nicht per Import überschrieben werden.` };
  }
  if (!migration) return { ok: true, status: alt || 'offen' };
  if (wunschStatus && !WOCHEN_STATUS.includes(wunschStatus)) {
    return { ok: false, grund: `Unbekannter Status '${wunschStatus}'.` };
  }
  return { ok: true, status: wunschStatus || alt || 'offen' };
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
  RUECKNAHME_TAGE, innerhalbRuecknahmefrist,
  WOCHEN_STATUS, GESPERRTE_STATUS, schreibGate,
};
