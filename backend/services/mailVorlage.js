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
const GRAU = '#666666';
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
const zeitraum = (von, bis) => `${datum(von)} – ${datum(bis)}`;

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

function renderMail({ titel, anredeText, satz, zeilen = [], kommentar, button, hinweis }) {
  const p = (inhalt, abstand = 12) =>
    `<p style="margin:0 0 ${abstand}px;font-family:${FONT};font-size:15px;line-height:1.6;color:${TEXT}">${inhalt}</p>`;
  const tabelle = zeilen.filter(Boolean).map(([k, v], i, alle) => {
    const linie = i < alle.length - 1 ? 'border-bottom:1px solid #eeeeee;' : '';
    return `<tr><td style="${linie}padding:9px 0;font-family:${FONT};font-size:14px;color:${GRAU}">${esc(k)}</td>`
      + `<td align="right" style="${linie}padding:9px 0;font-family:${FONT};font-size:14px;font-weight:bold;color:${TEXT}">${esc(v)}</td></tr>`;
  }).join('');
  const kommentarBlock = kommentar && kommentar.text
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>`
      + `<td style="border-left:3px solid ${GELB};background:#fafafa;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:${TEXT}">`
      + `${esc(kommentar.text).replace(/\r?\n/g, '<br>')}`
      + (kommentar.von ? `<br><span style="color:${GRAU};font-size:12px">${esc(kommentar.von)}</span>` : '')
      + '</td></tr></table>'
    : '';
  const logo = bild('pm-logo');
  const powered = bild('powered-by');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(titel)}</title></head>
<body style="margin:0;padding:0;background:#f3f3f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-top:3px solid ${GELB}">
<tr><td style="padding:0 32px;border-bottom:1px solid #eeeeee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="padding:0;line-height:0;font-size:0"><img src="cid:${logo.cid}" width="${logo.breite}" height="${logo.hoehe}" alt="${logo.alt}" style="display:block;border:0"></td>
<td align="right" valign="middle" style="font-family:${FONT};font-size:12px;color:#999999">Digitales Berichtsheft</td>
</tr></table>
</td></tr>
<tr><td style="padding:28px 32px 4px">
<h1 style="margin:0 0 18px;font-family:'Libre Franklin',${FONT};font-size:22px;font-weight:bold;color:${TEXT}">${esc(titel)}</h1>
${p(esc(anredeText))}
${p(esc(satz), 20)}
${kommentarBlock}
${tabelle ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">${tabelle}</table>` : ''}
</td></tr>
${button ? `<tr><td style="padding:0 32px 32px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${GELB}" style="background:${GELB};border-radius:4px">
<a href="${esc(button.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;font-weight:bold;color:${TEXT};text-decoration:none">${esc(button.text)}</a>
</td></tr></table>
</td></tr>` : ''}
<tr><td style="background:#fafafa;border-top:1px solid #eeeeee;padding:16px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${FONT};font-size:12px;line-height:1.5;color:#999999">Automatisch versendet. Antworten werden nicht gelesen.${hinweis ? `<br><strong style="color:#B71C1C">${esc(hinweis)}</strong>` : ''}</td>
<td align="right" valign="middle" style="padding-left:16px;line-height:0;font-size:0"><img src="cid:${powered.cid}" width="${powered.breite}" height="${powered.hoehe}" alt="${powered.alt}" style="display:block;border:0"></td>
</tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ── Texte je Anlass ──────────────────────────────────────────────────────
   Jede Funktion liefert { subject, titel, satz, zeilen, kommentar?, button }
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
    subject: 'Dein Berichtsheft ist leer',
    titel: 'Keine Einträge',
    satz: 'seit drei Wochen ist dein Berichtsheft leer.',
    zeilen: [['Letzter Eintrag', letzterEintrag || 'noch keiner']],
    button: { text: 'Berichtsheft öffnen', url: `${basisUrl}/app/wochenansicht.html` },
  };
}

function textBerichtZurueck({ kw, jahr, kommentar, vonName, basisUrl }) {
  return {
    subject: `Bericht KW ${kw} zurückgegeben`,
    titel: 'Bericht zurückgegeben',
    satz: `dein Bericht für KW ${kw} braucht eine Korrektur.`,
    kommentar: kommentar ? { text: kommentar, von: vonName ? anzeigeName(vonName) : '' } : null,
    zeilen: [['Woche', `KW ${kw}/${jahr}`]],
    button: { text: 'Bericht öffnen', url: `${basisUrl}/app/wochenansicht.html?kw=${kw}&jahr=${jahr}` },
  };
}

module.exports = {
  mailBilder, renderMail, anrede, vorname, datum, zeitraum, terminTitel, VERSETZUNG,
  textVersetzung, textBeurteilungLiegtVor, textBeurteilungOffen, textKeineEintraege, textBerichtZurueck,
};
