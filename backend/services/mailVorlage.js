'use strict';
/* HTML-Vorlage und Texte aller Mails (rein, kein I/O außer dem einmaligen
   Lesen der zwei Logos). Versand: services/mail.js.

   Outlook Desktop rendert mit der Word-Engine: deshalb Tabellen-Layout,
   nur Inline-Styles, keine Webfonts (Segoe UI/Arial als Ersatz), Button als
   Tabellenzelle mit bgcolor. Die Logos hängen als Inline-Anhang (cid:) an der
   Mail — externe Bilder blockiert Outlook, und der Server ist von außen nicht
   erreichbar. Design abgestimmt mit Florian am 2026-09-25, siehe
   docs/superpowers/specs/2026-09-25-email-benachrichtigungen-design.md. */

const fs = require('node:fs');
const path = require('node:path');
const { anzeigeName } = require('./ics');

const GELB = '#FFC300';
const TEXT = '#1A1A1A';
const FONT = "'Segoe UI',Arial,Helvetica,sans-serif";

// Doppelte Auflösung, angezeigt in halber Größe (scharf auf Retina/Handy).
const BILDER = [
  { cid: 'pm-logo',    datei: 'pm-logo.png',    alt: 'Putzmeister',               breite: 120, hoehe: 64 },
  { cid: 'powered-by', datei: 'powered-by.png', alt: 'Powered by Putzmeister IT', breite: 100, hoehe: 23 },
];
let bilderCache = null;
function mailBilder() {
  if (!bilderCache) {
    bilderCache = BILDER.map((b) => ({
      ...b, inhalt: fs.readFileSync(path.join(__dirname, '..', 'assets', 'mail', b.datei)),
    }));
  }
  return bilderCache;
}
const bild = (cid) => BILDER.find((b) => b.cid === cid);

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Kalendertag → "06.10.2026". mssql liefert sql.Date als UTC-Mitternacht,
// Request-Bodies 'YYYY-MM-DD' — beides ist in UTC der richtige Tag.
function datum(d) {
  if (!d) return 'offen';
  const t = new Date(typeof d === 'string' ? `${d.slice(0, 10)}T00:00:00Z` : d);
  return isNaN(t) ? 'offen' : t.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
// Gleiches Jahr → "25.09. – 20.10.2026" (passt in eine Fakten-Kachel ohne Umbruch).
function zeitraum(von, bis) {
  const a = datum(von);
  const b = datum(bis);
  return a.length === 10 && b.length === 10 && a.slice(6) === b.slice(6) ? `${a.slice(0, 6)} – ${b}` : `${a} – ${b}`;
}

// dbo.Users.Name ist "Nachname, Vorname".
function vorname(name) {
  const s = String(name || '').trim();
  const i = s.indexOf(',');
  return i < 0 ? s.split(/\s+/)[0] : s.slice(i + 1).trim();
}

// Azubis werden geduzt, alle anderen gesiezt. Kein Geschlecht in dbo.Users,
// deshalb „Guten Tag Vorname Nachname" statt „Herr/Frau".
function anrede(empf) {
  if (empf.istAzubi) return `Hallo ${vorname(empf.name)},`;
  return `Guten Tag ${anzeigeName(empf.name)},`;
}

/* Aufbau (abgestimmt mit Florian, 2. Runde 2026-09-25):
     dunkles Band über die GANZE Breite (Verlauf + gelber Schein), darin das
     Banner-Logo bündig an der gelben Oberkante, Rubrik und großer Titel —
     die Karte beginnt noch im Band und läuft in den hellen Bereich hinein,
     Fakten als Kacheln nebeneinander, dunkler Fuß mit Powered-by.
   Dunkelmodus: Band und Fuß sind ohnehin dunkel (Logos in Weiß). Apple Mail
   & Co. nehmen die prefers-color-scheme-Regeln; Outlook.com/neues Outlook
   färbt selbst um — dort hält background-image das Button-Gelb und
   [data-ogsc] die dunkle Button-Schrift. Outlook Desktop ignoriert Verlauf
   und Rundungen und zeigt die bgcolor-Flächen. */
function renderMail({ kategorie, titel, anredeText, satz, zeilen = [], kommentar, button, hinweis }) {
  const logo = bild('pm-logo');
  const powered = bild('powered-by');
  const absatz = (inhalt, abstand) =>
    `<p class="text" style="margin:0 0 ${abstand}px;font-family:${FONT};font-size:16px;line-height:1.6;color:${TEXT}">${inhalt}</p>`;

  const fakten = zeilen.filter(Boolean);
  const faktenBlock = fakten.length
    ? `<table role="presentation" class="fakten" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F6F6F4" style="background:#F6F6F4;border-radius:10px;margin:0 0 32px"><tr>`
      + fakten.map(([k, v], i) => `<td class="fakt${i === 0 ? ' fakt-erst' : ''}" valign="top" width="${Math.floor(100 / fakten.length)}%" style="padding:18px 20px;${i ? 'border-left:1px solid #E4E4E0;' : ''}">`
        + `<div class="leise" style="font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8A8A85">${esc(k)}</div>`
        + `<div class="text" style="font-family:${FONT};font-size:16px;font-weight:bold;line-height:1.4;color:${TEXT};margin-top:6px">${esc(v)}</div></td>`).join('')
      + '</tr></table>'
    : '';

  const kommentarBlock = kommentar && kommentar.text
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tr>`
      + `<td class="zitat" bgcolor="#FFF8E0" style="background:#FFF8E0;border:1px solid #F2DF9B;border-radius:10px;padding:16px 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${TEXT}">`
      + `<div class="leise" style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8A7A3C;margin-bottom:6px">Begründung</div>`
      + `${esc(kommentar.text).replace(/\r?\n/g, '<br>')}`
      + (kommentar.von ? `<div class="leise" style="margin-top:8px;font-size:13px;color:#8A8A85">${esc(kommentar.von)}</div>` : '')
      + '</td></tr></table>'
    : '';

  const knopf = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>`
      + `<td class="knopf" bgcolor="${GELB}" style="background-color:${GELB};background-image:linear-gradient(${GELB},${GELB});border-radius:8px">`
      + `<a class="knopf-text" href="${esc(button.url)}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:bold;color:${TEXT};text-decoration:none;border-radius:8px">${esc(button.text)}&nbsp;&rarr;</a>`
      + '</td></tr></table>'
    : '';

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(titel)}</title>
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
@media (max-width:620px){
  .rand{padding-left:12px!important;padding-right:12px!important}
  .innen{padding-left:24px!important;padding-right:24px!important}
  .titel{font-size:26px!important}
  .fakt{display:block!important;width:auto!important;border-left:0!important;border-top:1px solid #E4E4E0!important}
  .fakt-erst{border-top:0!important}
}
@media (prefers-color-scheme:dark){
  .mitte{background:#121212!important}
  .karte{background:#1E1E1E!important}
  .text{color:#F2F2F2!important}
  .leise{color:#A5A5A0!important}
  .fakten{background:#2A2A28!important}
  .fakt{border-color:#3A3A37!important}
  .zitat{background:#2E2A1C!important;color:#F2F2F2!important}
}
[data-ogsc] .knopf-text{color:${TEXT}!important}
[data-ogsb] .knopf{background-color:${GELB}!important}
</style></head>
<body style="margin:0;padding:0;background:#1A1A1A">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(satz)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1A1A1A" style="background-color:#1A1A1A;background-image:radial-gradient(circle at 88% 0%,rgba(255,195,0,0.30) 0%,rgba(255,195,0,0) 42%),linear-gradient(160deg,#343432 0%,#1A1A1A 65%);border-top:4px solid ${GELB}">
<tr><td align="center" class="rand" style="padding:0 24px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px">
<tr>
<td valign="top" style="padding:0;line-height:0;font-size:0"><img src="cid:${logo.cid}" width="${logo.breite}" height="${logo.hoehe}" alt="${logo.alt}" style="display:block;border:0"></td>
<td align="right" valign="middle" style="font-family:${FONT};font-size:13px;color:#BDBDB8">Digitales Berichtsheft</td>
</tr>
<tr><td colspan="2" style="padding:44px 0 0">
${kategorie ? `<div style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${GELB}">${esc(kategorie)}</div>` : ''}
<h1 class="titel" style="margin:10px 0 0;font-family:'Libre Franklin',${FONT};font-size:32px;line-height:1.2;font-weight:bold;color:#FFFFFF">${esc(titel)}</h1>
</td></tr>
<tr><td colspan="2" style="padding:32px 0 0;line-height:0;font-size:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="karte" bgcolor="#FFFFFF" height="32" style="background:#FFFFFF;border-radius:14px 14px 0 0;height:32px;line-height:32px;font-size:0">&nbsp;</td></tr></table>
</td></tr>
</table>
</td></tr></table>
<table role="presentation" class="mitte" width="100%" cellpadding="0" cellspacing="0" bgcolor="#EDEDEA" style="background:#EDEDEA">
<tr><td align="center" class="rand" style="padding:0 24px 48px">
<table role="presentation" class="karte" width="640" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:640px;background:#FFFFFF;border-radius:0 0 14px 14px">
<tr><td class="innen" style="padding:0 44px 44px">
${absatz(esc(anredeText), 14)}
${absatz(esc(satz), 28)}
${kommentarBlock}
${faktenBlock}
${knopf}
</td></tr>
</table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1A1A1A" style="background:#1A1A1A">
<tr><td align="center" style="padding:32px 24px 36px">
<img src="cid:${powered.cid}" width="${powered.breite}" height="${powered.hoehe}" alt="${powered.alt}" style="display:block;border:0;margin:0 auto">
<div style="margin-top:14px;font-family:${FONT};font-size:12px;line-height:1.5;color:#8F8F8A">Automatisch versendet. Antworten werden nicht gelesen.</div>
${hinweis ? `<div style="margin-top:8px;font-family:${FONT};font-size:12px;font-weight:bold;color:${GELB}">${esc(hinweis)}</div>` : ''}
</td></tr></table>
</body></html>`;
}

/* ── Texte je Anlass ──────────────────────────────────────────────────────
   Jede Funktion liefert { kategorie, subject, titel, satz, zeilen, kommentar?, button }
   — ohne Anrede, die hängt am Empfänger (mail.js setzt sie pro Person). */

const VERSETZUNG = {
  versetzung_neu: {
    praefix: '', method: 'REQUEST', titel: 'Neue Abteilung',
    azubi: 'deine nächste Abteilung steht fest.',
    abteilung: 'Ihre Abteilung bekommt einen Azubi.',
    planer: 'Sie haben eine Abteilung eingeplant.',
  },
  versetzung_geaendert: {
    praefix: 'Aktualisiert: ', method: 'REQUEST', titel: 'Abteilung geändert',
    azubi: 'deine Abteilung wurde geändert.',
    abteilung: 'die Planung für Ihre Abteilung wurde geändert.',
    planer: 'Sie haben eine Abteilung umgeplant.',
  },
  versetzung_entfernt: {
    praefix: 'Abgesagt: ', method: 'CANCEL', titel: 'Abteilung abgesagt',
    azubi: 'diese Abteilung wurde abgesagt.',
    abteilung: 'die Planung für Ihre Abteilung wurde abgesagt.',
    planer: 'Sie haben eine Abteilung abgesagt.',
  },
};

const terminTitel = (azubiName, abteilung) =>
  ['Abteilungsdurchlauf', anzeigeName(azubiName) || 'Azubi', abteilung].filter(Boolean).join(' | ');

// rolle: 'azubi' | 'abteilung' (Verantwortliche, Vertreter) | 'planer'
function textVersetzung({ typ, rolle, azubiName, verantwName, abteilung, von, bis, basisUrl }) {
  const art = VERSETZUNG[typ];
  const zeilen = rolle === 'azubi'
    ? [['Abteilung', abteilung || '—'], ['Zeitraum', zeitraum(von, bis)], verantwName ? ['Verantwortlich', anzeigeName(verantwName)] : null]
    : [['Azubi', anzeigeName(azubiName) || '—'], ['Abteilung', abteilung || '—'], ['Zeitraum', zeitraum(von, bis)]];
  return {
    kategorie: 'Abteilungsdurchlauf',
    subject: `${art.praefix}${terminTitel(azubiName, abteilung)}`,
    titel: art.titel, satz: art[rolle], zeilen,
    button: { text: 'Durchlaufplan ansehen', url: `${basisUrl}/app/${rolle === 'planer' ? 'abteilungs-planer' : 'abteilungsdurchlauf'}.html` },
  };
}

// typ: 'beurteilung_abgeschlossen' | 'kurzfeedback_abgeschlossen'
function textBeurteilungLiegtVor({ typ, fuerAzubi, azubiName, abteilung, von, bis, zuweisungId, basisUrl }) {
  const kurz = typ === 'kurzfeedback_abgeschlossen';
  const wort = kurz ? 'Kurzfeedback' : 'Beurteilung';
  const satz = fuerAzubi
    ? (kurz ? 'dein Kurzfeedback ist da.' : 'deine Beurteilung ist da.')
    : `${kurz ? 'das Kurzfeedback' : 'die Beurteilung'} für ${anzeigeName(azubiName)} liegt vor.`;
  return {
    kategorie: wort,
    subject: fuerAzubi ? `${wort} liegt vor` : `${wort} liegt vor: ${anzeigeName(azubiName)}`,
    titel: `${wort} liegt vor`, satz,
    zeilen: [fuerAzubi ? null : ['Azubi', anzeigeName(azubiName)], abteilung ? ['Abteilung', abteilung] : null,
      (von || bis) ? ['Zeitraum', zeitraum(von, bis)] : null],
    button: { text: `${wort} ansehen`, url: `${basisUrl}/app/beurteilung.html?zuw=${encodeURIComponent(zuweisungId || '')}` },
  };
}

// typ: 'gross' | 'kurz' (ermittleTyp)
function textBeurteilungOffen({ typ, azubiName, abteilung, von, bis, zuweisungId, basisUrl }) {
  const wort = typ === 'kurz' ? 'Kurzfeedback' : 'Beurteilung';
  return {
    kategorie: wort,
    subject: `${wort} offen: ${anzeigeName(azubiName)}`,
    titel: `${wort} offen`,
    satz: `${typ === 'kurz' ? 'das Kurzfeedback' : 'die Beurteilung'} für ${anzeigeName(azubiName)} ist noch offen.`,
    zeilen: [['Azubi', anzeigeName(azubiName)], ['Abteilung', abteilung || '—'], ['Zeitraum', zeitraum(von, bis)]],
    button: { text: `${wort} schreiben`, url: `${basisUrl}/app/beurteilung.html?zuw=${encodeURIComponent(zuweisungId || '')}` },
  };
}

// letzterEintrag: z. B. "KW 35/2026", leer = noch nie etwas eingetragen.
function textKeineEintraege({ letzterEintrag, basisUrl }) {
  return {
    kategorie: 'Berichtsheft',
    subject: 'Dein Berichtsheft ist leer',
    titel: 'Keine Einträge',
    satz: 'seit drei Wochen ist dein Berichtsheft leer.',
    zeilen: [['Letzter Eintrag', letzterEintrag || 'noch keiner']],
    button: { text: 'Berichtsheft öffnen', url: `${basisUrl}/app/wochenansicht.html` },
  };
}

function textBerichtZurueck({ kw, jahr, kommentar, vonName, basisUrl }) {
  return {
    kategorie: 'Berichtsheft',
    subject: `Bericht KW ${kw} zurückgegeben`,
    titel: 'Bericht zurückgegeben',
    satz: `dein Bericht für KW ${kw} braucht eine Korrektur.`,
    kommentar: kommentar ? { text: kommentar, von: vonName ? anzeigeName(vonName) : '' } : null,
    zeilen: [],
    button: { text: 'Bericht öffnen', url: `${basisUrl}/app/wochenansicht.html?kw=${kw}&jahr=${jahr}` },
  };
}

module.exports = {
  mailBilder, renderMail, anrede, vorname, datum, zeitraum, terminTitel, VERSETZUNG,
  textVersetzung, textBeurteilungLiegtVor, textBeurteilungOffen, textKeineEintraege, textBerichtZurueck,
};
