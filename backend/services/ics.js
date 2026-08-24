'use strict';
/* Reine iCalendar-Erzeugung für die Einsatz-Termine aus dem Abteilungs-Planer
   (kein I/O, deshalb testbar ohne DB und ohne Graph). Versand: services/mail.js.

   Der Termin ist ein mehrtägiger GANZTAGS-Termin über den Zuweisungszeitraum.
   Wir schreiben NICHT in fremde Kalender (das bräuchte die Graph-Berechtigung
   Calendars.ReadWrite auf jedes Postfach), sondern schicken eine echte
   iCalendar-Einladung per Mail — Outlook legt daraus selbst den Termin an. */

// RFC 5545 3.3.11: Backslash, Semikolon, Komma und Zeilenumbrüche in TEXT-Werten
// escapen. Pflicht, nicht Kosmetik: dbo.Users.Name ist "Nachname, Vorname" — ein
// unescaptes Komma in SUMMARY trennt dort einen zweiten Parameter ab.
function icsEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 3.1: Zeilen auf 75 Oktette falten, Folgezeilen mit einem Leerzeichen.
// Schnitt nie mitten in ein UTF-8-Zeichen (Umlaute!).
function fold(line) {
  const buf = Buffer.from(line, 'utf8');
  if (buf.length <= 75) return line;
  const teile = [];
  let i = 0;
  while (i < buf.length) {
    let end = Math.min(i + (i === 0 ? 75 : 74), buf.length);
    while (end > i + 1 && end < buf.length && (buf[end] & 0xc0) === 0x80) end--;
    teile.push((i === 0 ? '' : ' ') + buf.slice(i, end).toString('utf8'));
    i = end;
  }
  return teile.join('\r\n');
}

// Date | 'YYYY-MM-DD' → 'YYYYMMDD'. mssql liefert sql.Date als Date auf
// UTC-Mitternacht, deshalb ist toISOString hier der richtige Kalendertag.
function ymdCompact(d) {
  const s = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  return s.replace(/-/g, '');
}

function plusTage(d, n) {
  const s = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const dt = new Date(`${s}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dtstamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// "Nachname, Vorname" → "Vorname Nachname" (Konvention in dbo.Users).
function anzeigeName(name) {
  const s = String(name || '').trim();
  const i = s.indexOf(',');
  return i < 0 ? s : `${s.slice(i + 1).trim()} ${s.slice(0, i).trim()}`.trim();
}

// Outlook erkennt die neuere Fassung eines Termins an einer HÖHEREN SEQUENCE.
// ponytail: Minuten seit 2026-01-01 statt eines Zählers in der DB — monoton
// steigend, das genügt. Echter Revisionszähler = Spalte an dbo.Zuweisungen.
function sequenceNow(now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60000));
}

// Eine Zuweisung → eine UID. Stabil über Anlegen/Ändern/Löschen, damit Outlook
// Aktualisierung und Absage demselben Termin zuordnet.
function einsatzUid(zuweisungId, host = 'berichtsheft.putzmeister.com') {
  return `zuweisung-${zuweisungId}@${host}`;
}

/* method: 'REQUEST' (anlegen/ändern) | 'CANCEL' (absagen).
   von/bis: Kalendertage, bis ist INKLUSIV (DTEND ist exklusiv → bis + 1 Tag). */
function buildEinsatzIcs({
  uid, sequence, method = 'REQUEST', summary, beschreibung = '',
  von, bis, organizer, attendees = [], now = new Date(),
}) {
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Putzmeister//Digitales Berichtsheft//DE',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtstamp(now)}`,
    `DTSTART;VALUE=DATE:${ymdCompact(von)}`,
    `DTEND;VALUE=DATE:${ymdCompact(plusTage(bis, 1))}`,
    `SUMMARY:${icsEscape(summary)}`,
  ];
  if (beschreibung) zeilen.push(`DESCRIPTION:${icsEscape(beschreibung)}`);
  zeilen.push(
    `ORGANIZER;CN=${icsEscape(organizer.name)}:mailto:${organizer.email}`,
    // RSVP=FALSE: das Postfach ist unbeaufsichtigt, Antworten würde niemand
    // lesen — der Termin ist eine Information, keine Anfrage.
    ...attendees.map((e) => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${e}`),
    'TRANSP:TRANSPARENT',
    'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
    'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
  );
  if (method === 'CANCEL') zeilen.push('STATUS:CANCELLED');
  zeilen.push('END:VEVENT', 'END:VCALENDAR');
  return zeilen.map(fold).join('\r\n') + '\r\n';
}

module.exports = { icsEscape, fold, ymdCompact, plusTage, anzeigeName, sequenceNow, einsatzUid, buildEinsatzIcs };
