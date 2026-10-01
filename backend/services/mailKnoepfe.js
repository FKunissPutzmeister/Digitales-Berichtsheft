'use strict';
/* Beschriftung der gelben Mail-Buttons als Bild.

   Das neue Outlook färbt im Dunkelmodus jede dunkle Schrift hell — auf dem gelben
   Button wird „schwarz“ so zu weiß (gemessen 29.09., auch mit [data-ogsc]-Regel).
   Bilder färbt es nicht um → die Beschriftung liegt als PNG (schwarz, transparent,
   doppelte Auflösung) in assets/mail/. Texte ohne Bild bekommen den dunklen Button.

   Neue Buttontexte: in KNOEPFE eintragen und die Bilder neu bauen (braucht Playwright):
     node services/mailKnoepfe.js --bauen */

const fs = require('node:fs');
const path = require('node:path');

const KNOEPFE = [
  'Durchlaufplan ansehen', 'Bericht öffnen', 'Berichtsheft öffnen',
  'Beurteilung ansehen', 'Beurteilung schreiben', 'Kurzfeedback ansehen', 'Kurzfeedback schreiben',
];

const slug = (text) => text.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const datei = (text) => `knopf-${slug(text)}.png`;
const ordner = path.join(__dirname, '..', 'assets', 'mail');

// Breite/Höhe aus dem PNG-Kopf (IHDR), angezeigt in halber Größe.
function knopfBild(text) {
  if (!KNOEPFE.includes(text)) return null;
  const pfad = path.join(ordner, datei(text));
  if (!fs.existsSync(pfad)) return null;
  const inhalt = fs.readFileSync(pfad);
  return { cid: `knopf-${slug(text)}`, datei: datei(text), alt: `${text} →`, breite: inhalt.readUInt32BE(16) / 2, hoehe: inhalt.readUInt32BE(20) / 2, inhalt };
}

async function bauen() {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  for (const text of KNOEPFE) {
    await p.setContent(`<body style="margin:0;background:transparent"><span id="t" style="display:inline-block;padding:0 1px;font-family:'Segoe UI',Arial,sans-serif;font-size:17px;line-height:22px;font-weight:bold;letter-spacing:0.2px;color:#1A1A1A;white-space:nowrap">${text}&nbsp;&rarr;</span></body>`);
    const el = await p.$('#t');
    await el.screenshot({ path: path.join(ordner, datei(text)), omitBackground: true });
  }
  await b.close();
}

if (require.main === module && process.argv.includes('--bauen')) bauen().then(() => console.log('ok'));

module.exports = { KNOEPFE, knopfBild };
