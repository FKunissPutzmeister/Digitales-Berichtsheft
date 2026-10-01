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
const G = require('./mailGrafik');
const { KNOEPFE, knopfBild } = require('./mailKnoepfe');

const GELB = '#FFCC08'; // = Gelb im Logo (pm-logo.png gemessen), nicht das App-#FFC300
const DUNKEL = '#1A1A1A';
const TEXT = '#1A1A1A';
const FONT = "'Segoe UI',Arial,Helvetica,sans-serif";

/* Anlass = Stimmung der Mail. Je Anlass wechseln nur das Emblem, die Akzentlage
   (bei „abgesagt" grau) und die Farbe der Rubrik — siehe mailGrafik.js. */
const ANLAESSE = {
  termin:     { rubrik: GELB },
  abgesagt:   { rubrik: '#B9B7AE' },
  zurueck:    { rubrik: '#F5A04A' },
  erinnerung: { rubrik: GELB },
  offen:      { rubrik: GELB },
  erledigt:   { rubrik: GELB },
};

const assetPfad = (datei) => path.join(__dirname, '..', 'assets', 'mail', datei);

// Doppelte Auflösung, angezeigt in halber Größe (scharf auf Retina/Handy).
const BILDER = [
  { cid: 'pm-logo',    datei: 'pm-logo.png',    alt: 'Putzmeister',               breite: 150, hoehe: 79 },
  { cid: 'powered-by', datei: 'powered-by.png', alt: 'Powered by Putzmeister IT', breite: 150, hoehe: 35 },
];
let bilderCache = null;
// Ohne html: die zwei Logos. Mit html: alle Bilder, auf die die Mail verweist (Logos + Buttonbeschriftung) —
// nur die hängen an, sonst zeigt Outlook die übrigen als Anhang.
function mailBilder(html) {
  if (!bilderCache) {
    bilderCache = BILDER.map((b) => ({ ...b, inhalt: fs.readFileSync(assetPfad(b.datei)) }));
  }
  if (!html) return bilderCache;
  const knopf = KNOEPFE.map(knopfBild).filter((b) => b && html.includes(`cid:${b.cid}"`));
  return [...bilderCache.filter((b) => html.includes(`cid:${b.cid}"`)), ...knopf];
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
// Gleiches Jahr → "25.09. – 20.10.2026" (kurz genug für die Unterzeile der Info-Zeile).
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

// Kürzel für den Kreis: "Max Mustermann" → "MM", "IT" → "IT", "Konstruktion" → "K".
function kuerzel(name) {
  const w = String(name || '').split(/[\s&/,-]+/).filter((x) => /^\p{L}/u.test(x));
  if (!w.length) return '';
  if (w.length === 1) return /^\p{Lu}{2,3}$/u.test(w[0]) ? w[0] : w[0][0].toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

// Azubis werden geduzt, alle anderen gesiezt. Kein Geschlecht in dbo.Users,
// deshalb „Guten Tag Vorname Nachname" statt „Herr/Frau".
function anrede(empf) {
  if (empf.istAzubi) return `Hallo ${vorname(empf.name)},`;
  return `Guten Tag ${anzeigeName(empf.name)},`;
}

/* Aufbau (4. Runde 2026-09-28, „Familie 1 – Papier-Embleme", alles als Code):
     Band über die ganze Breite: Logo bündig an der gelben Oberkante,
     Rubrik und Titel, rechts das Emblem des Anlasses, darunter die Karte.
     Die Papierlagen sind Verläufe im Hintergrund (mailGrafik.js), verteilt
     auf ineinander geschachtelte Zellen (Outlook verwirft zu viele Ebenen
     in einer Zelle), die innerste trägt Rand und Inhalt. Die Karte
     steckt zwischen den Lagen: ihre letzte Zeile trägt dieselbe Cremelage wie
     das Band daneben. Die Fuß-Zelle setzt die Cremelage fort, davor der dunkle
     Boden. Randlos: 100 % Breite, Body und Hülle dunkel.
   Dunkelmodus: Outlook.com/neues Outlook färbt helle Flächen dunkel und dunkle
   Schrift hell, Verläufe lässt es in Ruhe. Deshalb sind Button, Kreis und alle
   Emblem-Flächen per Verlauf festgenagelt, Button und Kreis dunkel mit gelber
   Schrift (auf Gelb würde die Schrift weiß). Nur die weiße Karte wird dunkel;
   die Begründung hat deshalb keine eigene Fläche, nur eine durchscheinende
   Tönung (Verlauf mit Alpha) — die passt auf heller wie dunkler Karte.
   Outlook Desktop (Word) kennt keine Verläufe und Rundungen: dunkle
   bgcolor-Fläche, weiße Karte, Emblem als einfache Farbflächen. */
// Zellen ineinander (außen = hinten): jede füllt die äußere ganz aus, erst die
// innerste trägt den Rand (class "rand", auf dem Handy schmaler) und den Inhalt.
function schichten(zellen, inhalt) {
  const tab = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
  return zellen.reduceRight((innen, z, i) => {
    const innerste = i === zellen.length - 1;
    const td = `<td align="center" valign="top"${i === 0 ? ` bgcolor="${DUNKEL}"` : ''} class="${innerste ? 'rand ' : ''}${z.klasse}" style="padding:${innerste ? '0 24px' : '0'};${i === 0 ? `background-color:${DUNKEL};` : ''}${z.style}">${innen}</td>`;
    return i === 0 ? td : `<table ${tab} width="100%" style="width:100%"><tr>${td}</tr></table>`;
  }, inhalt);
}

function renderMail({ anlass = 'termin', kategorie, titel, anredeText, satz, info, kommentar, button, hinweis }) {
  if (!ANLAESSE[anlass]) anlass = 'termin';
  const a = ANLAESSE[anlass];
  const s = G.szene(anlass);
  const logo = bild('pm-logo');
  const powered = bild('powered-by');
  const absatz = (inhalt, abstand) =>
    `<p class="text" style="margin:0 0 ${abstand}px;font-family:${FONT};font-size:19px;line-height:30px;color:${TEXT}">${inhalt}</p>`;
  // Fläche, die Outlook im Dunkelmodus nicht umfärbt.
  const fest = (farbe) => `background-color:${farbe};background-image:linear-gradient(${farbe},${farbe})`;
  const tab = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

  const infoBlock = info && info.titel
    ? `<table ${tab} style="margin:0 0 32px"><tr>`
      + (info.kreis ? `<td valign="middle" style="padding:0 16px 0 0"><table ${tab}><tr>`
        + `<td class="kreis" width="52" height="52" align="center" valign="middle" bgcolor="${DUNKEL}" style="width:52px;height:52px;border-radius:26px;${fest(DUNKEL)};font-family:${FONT};font-size:17px;font-weight:bold;color:${GELB}">${esc(info.kreis)}</td>`
        + '</tr></table></td>' : '')
      + `<td valign="middle"><div class="text" style="font-family:${FONT};font-size:22px;font-weight:bold;line-height:28px;color:${TEXT}">${esc(info.titel)}</div>`
      + (info.unter ? `<div class="leise" style="margin-top:3px;font-family:${FONT};font-size:15px;line-height:22px;color:#6B6B66">${esc(info.unter)}</div>` : '')
      + '</td></tr></table>'
    : '';

  // Begründung wie eine Teams-Nachricht: Name (+ Datum) über der Blase, bündig mit ihrer linken Kante;
  // das Profilbild (Entra, sonst Kürzel im dunklen Kreis) links daneben, oben bündig mit der Blase.
  // Die Blase ist nur eine Alpha-Tönung per Verlauf — Outlook färbt im Dunkelmodus nichts um.
  const autorBild = kommentar && (kommentar.foto
    ? `<img src="cid:${kommentar.foto.cid}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border:0;border-radius:24px">`
    : `<table ${tab}><tr><td class="kreis" width="48" height="48" align="center" valign="middle" bgcolor="${DUNKEL}" style="width:48px;height:48px;border-radius:24px;${fest(DUNKEL)};font-family:${FONT};font-size:16px;font-weight:bold;color:${GELB}">${esc(kuerzel(kommentar.von || '?'))}</td></tr></table>`);
  const kommentarKopf = kommentar && (kommentar.von || kommentar.zeit)
    ? `<tr><td></td><td style="padding:0 0 7px;font-family:${FONT};font-size:14px;line-height:20px">`
      + (kommentar.von ? `<span class="text" style="font-weight:bold;color:${TEXT}">${esc(kommentar.von)}</span>` : '')
      + (kommentar.zeit ? `<span class="leise" style="padding-left:10px;color:#6B6B66">${esc(kommentar.zeit)}</span>` : '')
      + '</td></tr>'
    : '';
  const kommentarBlock = kommentar && kommentar.text
    ? `<table ${tab} width="100%" style="margin:6px 0 36px">${kommentarKopf}<tr>`
      + `<td valign="top" width="48" style="width:48px;padding:0 14px 0 0">${autorBild}</td>`
      + `<td valign="top"><table ${tab} width="100%"><tr><td style="padding:14px 20px 15px;border-radius:8px;background-image:linear-gradient(rgba(128,120,104,0.12),rgba(128,120,104,0.12))">`
      + `<div class="text" style="font-family:${FONT};font-size:19px;line-height:30px;color:${TEXT}">${esc(kommentar.text).replace(/\r?\n/g, '<br>')}</div>`
      + '</td></tr></table></td></tr></table>'
    : '';

  // Gelber Button, Beschriftung als Bild (schwarz bleibt schwarz, siehe mailKnoepfe.js);
  // für Texte ohne Bild der dunkle Button mit gelber Schrift, den Outlook nicht umfärbt.
  const kb = button && knopfBild(button.text);
  const knopf = !button ? '' : kb
    ? `<table ${tab}><tr><td class="knopf" bgcolor="${GELB}" style="${fest(GELB)};border-radius:6px">`
      + `<a href="${esc(button.url)}" style="display:block;padding:18px 36px;text-decoration:none"><img src="cid:${kb.cid}" width="${kb.breite}" height="${kb.hoehe}" alt="${esc(kb.alt)}" style="display:block;border:0"></a>`
      + '</td></tr></table>'
    : `<table ${tab}><tr><td class="knopf" bgcolor="${DUNKEL}" style="${fest(DUNKEL)};border-radius:6px">`
      + `<a href="${esc(button.url)}" style="display:inline-block;padding:18px 36px;font-family:${FONT};font-size:17px;line-height:22px;font-weight:bold;letter-spacing:0.2px;color:${GELB};text-decoration:none;border-radius:6px">${esc(button.text)}&nbsp;&rarr;</a>`
      + '</td></tr></table>';

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(titel)}</title>
<style>
body{margin:0!important;padding:0!important;-webkit-text-size-adjust:100%}
@media (max-width:620px){
  .rand{padding-left:12px!important;padding-right:12px!important}
  .innen{padding-left:26px!important;padding-right:26px!important}
  .kopf{padding-top:46px!important;padding-bottom:50px!important}
  .titel{font-size:28px!important;line-height:32px!important;max-width:205px!important}
  .rubrik{font-size:12px!important}
  ${s.handyCss}
  .emblem{padding-right:0!important}
}
@media (prefers-color-scheme:dark){
  .karte{background-color:#1E1E1E!important}
  .text{color:#F2F2F2!important}
  .leise{color:#A5A5A0!important}
}
</style></head>
<body bgcolor="${DUNKEL}" style="margin:0;padding:0;background-color:${DUNKEL}">
<div style="margin:0;padding:0;background-color:${DUNKEL}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(satz)}</div>
<table ${tab} width="100%" bgcolor="${DUNKEL}" style="width:100%;background-color:${DUNKEL};border-top:5px solid ${GELB}">
<tr>${schichten(s.band, `<table ${tab} width="820" style="width:100%;max-width:820px">
<tr>
<td colspan="2" valign="top" style="padding:0;line-height:0;font-size:0"><img src="cid:${logo.cid}" width="${logo.breite}" height="${logo.hoehe}" alt="${logo.alt}" style="display:block;border:0"></td>
</tr>
<tr><td class="kopf" valign="top" style="padding:58px 0 86px">
${kategorie ? `<div class="rubrik" style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:${a.rubrik}">${esc(kategorie)}</div>` : ''}
<h1 class="titel" style="margin:10px 0 0;font-family:${FONT};font-size:38px;line-height:42px;font-weight:bold;letter-spacing:-0.5px;color:#FFFFFF">${esc(titel)}</h1>
</td>
<td class="emblem" align="right" valign="bottom" style="padding:0 18px 10px 0">${G.emblem(anlass)}</td></tr>
<tr><td colspan="2" style="padding:0">
<table ${tab} class="karte" width="100%" bgcolor="#FFFFFF" style="width:100%;background-color:#FFFFFF;border-radius:14px;box-shadow:0 -24px 20px -20px rgba(12,12,10,0.6);${s.karte}">
<tr><td class="innen" style="padding:50px 54px 92px">
${absatz(esc(anredeText), 14)}
${absatz(esc(satz), 26)}
${kommentarBlock}
${infoBlock}
${knopf}
</td></tr>
</table>
</td></tr>
<tr><td colspan="2" align="center" style="padding:96px 0 34px">
<img src="cid:${powered.cid}" width="${powered.breite}" height="${powered.hoehe}" alt="${powered.alt}" style="display:block;border:0;margin:0 auto">
<div style="margin-top:12px;font-family:${FONT};font-size:12px;line-height:18px;color:#9C9A92">Automatisch versendet. Antworten werden nicht gelesen.</div>
${hinweis ? `<div style="margin-top:8px;font-family:${FONT};font-size:12px;line-height:18px;font-weight:bold;color:${GELB}">${esc(hinweis)}</div>` : ''}
</td></tr>
</table>`)}</tr></table>
</div>
</body></html>`;
}

/* ── Texte je Anlass ──────────────────────────────────────────────────────
   Jede Funktion liefert { anlass, kategorie, subject, titel, satz, info?, kommentar?, button }
   (info = { kreis?, titel, unter? }, die Zeile unter dem Satz)
   — ohne Anrede, die hängt am Empfänger (mail.js setzt sie pro Person). */

const VERSETZUNG = {
  versetzung_neu: {
    praefix: '', method: 'REQUEST', anlass: 'termin', titel: 'Neue Abteilung',
    azubi: 'deine nächste Abteilung steht fest:',
    abteilung: 'für Ihre Abteilung ist eingeplant:',
    planer: 'für die Abteilung ist eingeplant:',
  },
  versetzung_geaendert: {
    praefix: 'Aktualisiert: ', method: 'REQUEST', anlass: 'termin', titel: 'Abteilung geändert',
    azubi: 'bei deiner Abteilung hat sich etwas geändert:',
    abteilung: 'die Planung für Ihre Abteilung hat sich geändert:',
    planer: 'die Planung für die Abteilung wurde geändert:',
  },
  versetzung_entfernt: {
    praefix: 'Abgesagt: ', method: 'CANCEL', anlass: 'abgesagt', titel: 'Abteilung abgesagt',
    azubi: 'diese Abteilung fällt aus:',
    abteilung: 'die Planung für Ihre Abteilung fällt aus:',
    planer: 'die Planung für die Abteilung wurde abgesagt:',
  },
};

// "Azubi-Einsatz: Florian Kern (Fachinformatiker Systemintegration) - PEG Berechnung" (Lehrjahr ist nicht bekannt).
const terminTitel = (azubiName, abteilung, beruf) =>
  `Azubi-Einsatz: ${anzeigeName(azubiName) || 'Azubi'}${beruf ? ` (${beruf})` : ''}${abteilung ? ` - ${abteilung}` : ''}`;

// Info-Zeile zum Azubi: Kreis mit Kürzel, Name, darunter Abteilung · Zeitraum.
function personInfo(azubiName, abteilung, von, bis) {
  const name = anzeigeName(azubiName) || 'Azubi';
  return {
    kreis: kuerzel(name), titel: name,
    unter: [abteilung, (von || bis) ? zeitraum(von, bis) : ''].filter(Boolean).join(' · '),
  };
}

// rolle: 'azubi' | 'abteilung' (Verantwortliche, Vertreter) | 'planer'
function textVersetzung({ typ, rolle, azubiName, azubiBeruf, verantwName, abteilung, von, bis, basisUrl }) {
  const art = VERSETZUNG[typ];
  const info = rolle === 'azubi'
    ? { kreis: kuerzel(abteilung), titel: abteilung || '—', unter: [zeitraum(von, bis), verantwName && `bei ${anzeigeName(verantwName)}`].filter(Boolean).join(' · ') }
    : personInfo(azubiName, abteilung, von, bis);
  return {
    anlass: art.anlass, kategorie: 'Abteilungsdurchlauf',
    subject: `${art.praefix}${terminTitel(azubiName, abteilung, azubiBeruf)}`,
    titel: art.titel, satz: art[rolle], info,
    button: { text: 'Durchlaufplan ansehen', url: `${basisUrl}/app/${rolle === 'planer' ? 'abteilungs-planer' : 'abteilungsdurchlauf'}.html` },
  };
}

// typ: 'beurteilung_abgeschlossen' | 'kurzfeedback_abgeschlossen'
function textBeurteilungLiegtVor({ typ, fuerAzubi, azubiName, abteilung, von, bis, zuweisungId, basisUrl }) {
  const kurz = typ === 'kurzfeedback_abgeschlossen';
  const wort = kurz ? 'Feedback' : 'Beurteilung';
  const satz = fuerAzubi
    ? (kurz ? 'dein Feedback ist da:' : 'deine Beurteilung ist da:')
    : `${kurz ? 'das Feedback' : 'die Beurteilung'} ist abgeschlossen:`;
  return {
    anlass: 'erledigt', kategorie: wort,
    subject: fuerAzubi ? `${wort} liegt vor` : `${wort} liegt vor: ${anzeigeName(azubiName)}`,
    titel: `${wort} liegt vor`, satz,
    info: fuerAzubi
      ? (abteilung ? { kreis: kuerzel(abteilung), titel: abteilung, unter: (von || bis) ? zeitraum(von, bis) : '' } : null)
      : personInfo(azubiName, abteilung, von, bis),
    button: { text: `${wort} ansehen`, url: `${basisUrl}/app/beurteilung.html?zuw=${encodeURIComponent(zuweisungId || '')}` },
  };
}

// typ: 'gross' | 'kurz' (ermittleTyp)
function textBeurteilungOffen({ typ, azubiName, abteilung, von, bis, zuweisungId, basisUrl }) {
  const wort = typ === 'kurz' ? 'Feedback' : 'Beurteilung';
  return {
    anlass: 'offen', kategorie: wort,
    subject: `${wort} offen: ${anzeigeName(azubiName)}`,
    titel: `${wort} offen`,
    satz: `${typ === 'kurz' ? 'das Feedback' : 'die Beurteilung'} ist noch offen:`,
    info: personInfo(azubiName, abteilung, von, bis),
    button: { text: `${wort} schreiben`, url: `${basisUrl}/app/beurteilung.html?zuw=${encodeURIComponent(zuweisungId || '')}` },
  };
}

// letzterEintrag: z. B. "KW 35/2026" (wer noch nie etwas eingetragen hat, bekommt die Mail nicht).
function textKeineEintraege({ letzterEintrag, basisUrl }) {
  const [, kw, jahr] = /^KW (\d+)\/(\d+)$/.exec(letzterEintrag || '') || [];
  return {
    anlass: 'erinnerung', kategorie: 'Berichtsheft',
    subject: 'Seit drei Wochen keine Einträge',
    titel: 'Keine Einträge',
    satz: 'seit mindestens drei Wochen steht nichts in deinem Berichtsheft.',
    info: { titel: letzterEintrag, unter: 'Letzter Eintrag' },
    button: { text: 'Berichtsheft öffnen', url: `${basisUrl}/app/wochenansicht.html${kw ? `?kw=${kw}&jahr=${jahr}` : ''}` },
  };
}

// vonFoto: { inhalt, typ } aus dbo.UserPhotos (optional) → hängt als Inline-Bild „autor-foto“ an.
// am: Zeitpunkt der Begründung — das Datum steht wie in Teams neben dem Namen (deutsche Zeit).
function textBerichtZurueck({ kw, jahr, kommentar, vonName, vonFoto, am, basisUrl }) {
  const zeit = am ? new Date(am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }) : '';
  const foto = vonFoto && vonFoto.inhalt
    ? { cid: 'autor-foto', datei: /png/.test(vonFoto.typ || '') ? 'autor.png' : 'autor.jpg', typ: vonFoto.typ || 'image/jpeg', inhalt: vonFoto.inhalt }
    : null;
  return {
    anlass: 'zurueck', kategorie: 'Berichtsheft',
    subject: `Bericht KW ${kw} zurückgegeben`,
    titel: 'Bericht zurückgegeben',
    satz: `dein Bericht für KW ${kw} braucht eine Korrektur.`,
    kommentar: kommentar ? { text: kommentar, von: vonName ? anzeigeName(vonName) : '', zeit, foto } : null,
    button: { text: 'Bericht öffnen', url: `${basisUrl}/app/wochenansicht.html?kw=${kw}&jahr=${jahr}` },
  };
}

module.exports = {
  mailBilder, renderMail, anrede, vorname, kuerzel, datum, zeitraum, terminTitel, VERSETZUNG,
  textVersetzung, textBeurteilungLiegtVor, textBeurteilungOffen, textKeineEintraege, textBerichtZurueck,
};
