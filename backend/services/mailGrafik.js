'use strict';
/* Papierschnitt-Szene und Embleme der Mails als reines CSS/HTML — keine Bilder.

   Was das neue Outlook (OWA-Engine) kann, gemessen an Testmails vom 28.09.:
   - Hintergrundbilder: per cid: nie, per data: nur kleine → nur Verläufe.
   - linear-/radial-gradient: ja, und der Dunkelmodus lässt sie in Ruhe.
   - Zu viele Ebenen in EINEM Stil verwirft es ganz (70 Ebenen: weg, 18: da).
     Deshalb höchstens MAX_EBENEN je Zelle; die Szene liegt auf verschachtelten
     Zellen, die einander genau überdecken (außen = hinten, innen = vorn).
   - border-radius mit mehreren Werten wird zu EINEM Wert → nur einheitliche
     Rundung; Sonderformen (Eselsohr, Kerbe, Glas) entstehen aus Verläufen.
   - Harte Farbstopps zeichnet es ohne Kantenglättung → jede Kante ~1 px weich.
   mailVorlage.test.js prüft die Grenzen für alle Anlässe. */

const BREITE = 2400;
const MITTE = BREITE / 2;
const MAX_EBENEN = 16;
const LEER = 'font-size:0;line-height:0';
const TAB = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const r1 = (x) => Math.round(x * 10) / 10;
// Stopp für eine ~1,2 px weiche Kante am Rand einer Ellipse/eines Kreises mit Radius r.
const weich = (r) => r1(100 - 120 / r);
// Stopps um 50 % für eine ~1,2 px weiche Diagonale (Verlauf „to <Ecke>" in einer b×h-Fläche,
// Länge der Verlaufslinie = 2bh/√(b²+h²)).
const diagonal = (b, h) => {
  const halb = 60 / ((2 * b * h) / Math.hypot(b, h));
  return [r1(50 - halb), r1(50 + halb)];
};

// Ebene = ein Verlauf mit eigener Größe, Position, Wiederholung (Koordinaten in px).
const ebene = (bild, x, y, b, h, wdh = 'no-repeat') => ({ bild, groesse: `${b}px ${h}px`, pos: `${x}px ${y}px`, wdh });
function css(ebenen) {
  if (ebenen.length > MAX_EBENEN) throw new Error(`${ebenen.length} Hintergrund-Ebenen in einer Zelle (max. ${MAX_EBENEN})`);
  return [
    `background-image:${ebenen.map((e) => e.bild).join(',')}`,
    `background-size:${ebenen.map((e) => e.groesse).join(',')}`,
    `background-position:${ebenen.map((e) => e.pos).join(',')}`,
    `background-repeat:${ebenen.map((e) => e.wdh || 'no-repeat').join(',')}`,
  ].join(';');
}
// Fläche, die Outlook im Dunkelmodus nicht umfärbt.
const fest = (farbe, verlauf = `linear-gradient(${farbe},${farbe})`) => `background-color:${farbe};background-image:${verlauf}`;

/* ── Szene ───────────────────────────────────────────────────────────────
   Eine Lage = Hügelkette aus Ellipsen, deren Mitte auf der Unterkante ihrer
   Kachel liegt. Je Ellipse: Fläche, heller Papierrand 1,5 px höher (dahinter,
   zeigt sich nur an der Außenkante), weicher Schatten-Hof (ganz hinten). Alle
   Kacheln 2400 px breit und horizontal mittig — so fluchten die Kacheln
   verschiedener Zellen (Band, letzte Kartenzeile, Fuß) bei jeder Breite. */
// unten: Mitte liegt so weit unter der Kachel (dieselbe Kette in einer kürzeren Kachel, s. karte).
function lage(h, { flaeche, rand, schatten = 0, hof = 18 }, huegel, unten = 0) {
  const f = [], r = [], s = [];
  const y = h + unten;
  for (const [dx, oben, rx] of huegel) {
    const ry = y - oben, x = MITTE + dx, k = weich(ry);
    f.push(`radial-gradient(ellipse ${rx}px ${ry}px at ${x}px ${y}px,${flaeche} ${k}%,${rgba(flaeche, 0)} 100%)`);
    if (rand) r.push(`radial-gradient(ellipse ${rx}px ${ry}px at ${x}px ${y - 1.5}px,${rand} ${k}%,${rgba(rand, 0)} 100%)`);
    if (schatten) s.push(`radial-gradient(ellipse ${rx + hof}px ${ry + hof}px at ${x}px ${y}px,rgba(0,0,0,${schatten}) ${r1((ry / (ry + hof)) * 100)}%,rgba(0,0,0,0) 100%)`);
  }
  return [...f, ...r, ...s];
}
const kachel = (verlaeufe, h, pos, handy = pos) => verlaeufe.map((bild) => ({ bild, groesse: `${BREITE}px ${h}px`, pos, handy }));

const KOPF_H = 380;    // Band-Kachel: Oberkante bis unter den Kartenkopf (Karte beginnt bei ~278)
// Unten: Fuß (Powered-by, Hinweiszeile) liegt in derselben Zelle wie Kopf und Karte — eine Zeilengrenze
// mitten in der Cremefläche zeichnet das neue Outlook als graue Naht. Die Kachel hängt an der Unterkante;
// die Karte endet FUSS_H darüber (Fuß-Innenabstand + Logo + Zeile, fest in renderMail).
const FUSS_H = 195;
const UNTEN_H = 200 + FUSS_H; // Kartenunterkante bei y = 200
const HANDY_HOCH = 30; // auf dem Handy sitzt die Karte ~30 px höher
const HUEGELGRAU = '#8F8D85';

const STIL = {
  l1: { flaeche: '#232220', rand: '#2C2B28' },
  l2: { flaeche: '#2A2926', rand: '#35332F' },
  l3: { flaeche: '#33312D', rand: '#45423C', schatten: 0.35, hof: 14 },
  gelb: { flaeche: '#FFCF1A', rand: '#FFE88A', schatten: 0.45, hof: 18 },
  grau: { flaeche: '#86847D', rand: '#9C9A93', schatten: 0.45, hof: 18 },
  huegel: { flaeche: HUEGELGRAU, rand: '#AAA79E', schatten: 0.45, hof: 18 },
  creme: { flaeche: '#DBD8CE', rand: '#F4F2EC', schatten: 0.26, hof: 14 },
  boden: { flaeche: '#1A1A1A', rand: '#302F2B', schatten: 0.3, hof: 14 },
};
// [dx zur Mitte, Oberkante y, rx] — jede Kette deckt ihre Kachel-Unterkante lückenlos.
// Creme und Boden: je ein flacher Bogen, Mitte auf der Unterkante; die Karte liegt vor der Creme
// (Kante ~50 px über der Kartenunterkante), der Boden beginnt 54 px darunter.
const HUEGEL = {
  l1: [[-800, 178, 460], [-100, 196, 440], [600, 166, 460], [1200, 190, 400]],
  l2: [[-900, 214, 440], [-250, 226, 420], [400, 206, 440], [1000, 220, 420]],
  l3: [[-850, 248, 420], [-300, 238, 400], [300, 244, 420], [900, 236, 420]],
  akzent: [[-800, 290, 420], [-330, 302, 340], [250, 250, 380], [760, 262, 360], [1150, 282, 300]],
  huegel: [[-900, 326, 380], [-470, 334, 320], [0, 342, 340], [470, 318, 320], [900, 330, 380]],
  creme: [[0, 146, 2400]],
  boden: [[0, 254, 1700]],
};
// Lichtschein hinter dem Emblem, je Anlass (abgesagt: keiner).
const GLANZ = { termin: ['#FFCC08', 0.08], erinnerung: ['#FFCC08', 0.1], offen: ['#FFCC08', 0.1], erledigt: ['#FFCC08', 0.2], zurueck: ['#EF8A2B', 0.13] };

function szene(anlass) {
  const kopf = (v) => kachel(v, KOPF_H, 'center top', `center -${HANDY_HOCH}px`);
  const glanz = GLANZ[anlass];
  const band = [ // außen (ganz hinten) → innen (ganz vorn)
    [
      ...(glanz ? kopf([`radial-gradient(ellipse 260px 180px at ${MITTE + 322}px 175px,${rgba(glanz[0], glanz[1])} 0%,${rgba(glanz[0], 0)} 100%)`]) : []),
      { bild: 'linear-gradient(#262523,#1A1A19)', groesse: `100% ${KOPF_H - 6}px`, pos: '0 0', handy: `0 -${HANDY_HOCH}px` },
      { bild: `linear-gradient(${HUEGELGRAU},${HUEGELGRAU})`, groesse: '100% 100%', pos: '0 0' },
    ],
    kopf([...lage(KOPF_H, STIL.l2, HUEGEL.l2), ...lage(KOPF_H, STIL.l1, HUEGEL.l1)]),
    kopf(lage(KOPF_H, STIL.l3, HUEGEL.l3)),
    kopf(lage(KOPF_H, anlass === 'abgesagt' ? STIL.grau : STIL.gelb, HUEGEL.akzent)),
    kopf(lage(KOPF_H, STIL.huegel, HUEGEL.huegel)),
    kachel([...lage(UNTEN_H, STIL.boden, HUEGEL.boden), ...lage(UNTEN_H, STIL.creme, HUEGEL.creme)], UNTEN_H, 'center bottom'),
  ];
  const handy = band.map((z, i) => ({ i, pos: z.map((e) => e.handy || e.pos) }))
    .filter(({ i, pos }) => pos.some((p, j) => p !== band[i][j].pos));
  return {
    band: band.map((z, i) => ({ klasse: `s${i}`, style: css(z) })),
    handyCss: handy.map(({ i, pos }) => `.s${i}{background-position:${pos.join(',')}!important}`).join('\n  '),
    // Creme vor dem unteren Kartenrand: dieselbe Kette als Kartenhintergrund über der Kartenfarbe —
    // keine eigene Kartenzeile, also keine Zellgrenze, die Outlook als Naht zeichnet.
    karte: css(kachel(lage(200, STIL.creme, HUEGEL.creme, FUSS_H), 200, 'center bottom')),
  };
}

/* ── Embleme ─────────────────────────────────────────────────────────────
   Jedes Emblem: wenige verschachtelte Zellen (einheitliche Rundung), die Details
   als Ebenen darin. Flächen per Verlauf → im Dunkelmodus unverändert. */
const zelle = (style, inhalt = '&nbsp;', attr = '') => `<td${attr} style="${inhalt === '&nbsp;' ? `${LEER};` : ''}${style}">${inhalt}</td>`;
const tabelle = (zeilen, breite) => `<table ${TAB}${breite ? ` width="${breite}"` : ''}>${zeilen}</table>`;
const zeile = (...zellen) => `<tr>${zellen.join('')}</tr>`;

function bodenSchatten(b) {
  return zeile(zelle(`height:18px;${css([
    { bild: `radial-gradient(ellipse ${Math.round(b * 0.3)}px 4px at 50% 45%,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0) 100%)`, groesse: '100% 100%', pos: '0 0' },
    { bild: `radial-gradient(ellipse ${Math.round(b * 0.46)}px 9px at 50% 50%,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0) 100%)`, groesse: '100% 100%', pos: '0 0' },
  ])}`, '&nbsp;', ' height="18"'));
}

// Metall (Ringe, Pfosten): zylindrisch schattiert.
const METALL = 'linear-gradient(90deg,#1F1E1C 0%,#5F5C55 42%,#8E8A81 58%,#2B2A27 100%)';

function kalender({ kopf, papier, feld, marke }) {
  const KB = 140, KH = 38;
  const ringX = [38, 102];
  const kappe = `radial-gradient(circle 5px at 5px 5px,#5C5952 ${weich(5)}%,rgba(92,89,82,0) 100%)`;
  // Ring: oberes Stück über dem Blatt (äußere Zelle), unteres Stück auf dem Kopf, das in ein Loch taucht.
  const ringeOben = ringX.flatMap((x) => [ebene(METALL, x - 5, 5, 10, 7), ebene(kappe, x - 5, 0, 10, 10)]);
  const blatt = [
    ...ringX.flatMap((x) => [ebene(METALL, x - 5, 0, 10, 12), ebene(kappe, x - 5, 7, 10, 10)]),
    ...ringX.map((x) => ebene(`radial-gradient(ellipse 7px 3.5px at 7px 4px,#2E2C28 ${weich(3.5)}%,rgba(46,44,40,0) 100%)`, x - 7, 11, 14, 8)),
    ebene('linear-gradient(rgba(255,255,255,0.65),rgba(255,255,255,0))', 0, 0, KB, 5),
    ebene('linear-gradient(rgba(0,0,0,0),rgba(0,0,0,0.16))', 0, KH - 6, KB, 6),
    ebene(`linear-gradient(${kopf[0]},${kopf[1]})`, 0, 0, KB, KH),
    ebene(`linear-gradient(${papier[0]},${papier[1]})`, 0, 0, KB, 132),
  ];
  // Tagesraster 5×4: Felder 16×12, Fugen 6 px in Papierfarbe (zwei Streifenmuster über der Feldfarbe).
  const raster = [
    ...marke,
    ebene(`linear-gradient(rgba(0,0,0,0) 12px,${papier[2]} 12px)`, 0, 0, 104, 18, 'repeat-y'),
    ebene(`linear-gradient(90deg,rgba(0,0,0,0) 16px,${papier[2]} 16px)`, 0, 0, 22, 66, 'repeat-x'),
    ebene(`linear-gradient(${feld},${feld})`, 0, 0, 104, 66),
  ];
  const vorne = zelle(`padding:48px 18px 18px 18px;border-radius:14px;background-color:${papier[1]};${css(blatt)}`,
    tabelle(zeile(zelle(`width:104px;height:66px;${css(raster)}`, '&nbsp;', ' width="104" height="66"'))));
  const stapel = zelle(`padding:0 7px 7px 0;border-radius:16px;${fest('#CFCABD', 'linear-gradient(#D9D5C9,#BBB6A8)')};box-shadow:0 22px 26px -14px rgba(0,0,0,0.7)`,
    tabelle(zeile(zelle(`padding:0 4px 4px 0;border-radius:15px;${fest('#E6E3DA')}`, tabelle(zeile(vorne))))));
  return tabelle(zeile(zelle(`padding:12px 0 0 0;${css(ringeOben)}`, tabelle(zeile(stapel))))
    + bodenSchatten(151), 151);
}

const linie = (b, farbe = '#DCD7CB', h = 5, unten = 8) =>
  `<div style="width:${b}px;height:${h}px;margin:0 0 ${unten}px 0;border-radius:3px;${fest(farbe)};${LEER}">&nbsp;</div>`;

// Blatt mit Eselsohr; Inhalt je Anlass (Korrektur bzw. Siegel), optional ein Fähnchen dahinter.
function dokument(inhalt, faehnchen = []) {
  const B = 112, H = 136, E = 26, ex = B - E, rechts = faehnchen.length ? 22 : 0;
  const HINTEN = '#D9D4C7'; // Blatt dahinter, sichtbar in der abgeknickten Ecke
  const [d0, d1] = diagonal(E, E);
  const blatt = [
    // Eselsohr: umgeklappte Ecke (zur Spitze hin dunkler), ihr Schatten, die fehlende Ecke
    ebene(`linear-gradient(to bottom left,rgba(241,237,228,0) ${d0}%,#F2EEE5 ${d1}%,#D5CFC1 100%)`, ex, 0, E, E),
    ebene(`linear-gradient(to bottom left,rgba(0,0,0,0) ${d0}%,rgba(0,0,0,0.17) ${d1}%,rgba(0,0,0,0.05) 100%)`, ex - 3, 3, E, E),
    ebene(`linear-gradient(to bottom left,${HINTEN} ${d0}%,${rgba(HINTEN, 0)} ${d1}%)`, ex, 0, E, E),
    ebene('linear-gradient(#FCFBF7,#ECE9E0)', 0, 0, B, H),
  ];
  const vorne = zelle(`height:${H - 40}px;padding:22px 18px 18px 16px;border-radius:9px;background-color:#ECE9E0;${css(blatt)}`, inhalt);
  const stapel = zelle(`padding:0 6px 6px 0;border-radius:10px;${fest('#CFCABD', 'linear-gradient(#DAD5C8,#C0BAAB)')};box-shadow:0 20px 24px -12px rgba(0,0,0,0.65)`,
    tabelle(zeile(vorne), B));
  return tabelle(zeile(zelle(`padding:0 ${rechts}px 0 0;${rechts ? css(faehnchen) : ''}`, tabelle(zeile(stapel))))
    + bodenSchatten(B + 6 + rechts), B + 6 + rechts);
}

function korrektur() {
  const welle = `<div style="width:60px;height:6px;${LEER};background-image:radial-gradient(circle at 50% 0,rgba(239,138,43,0) 2.6px,#EF8A2B 3.2px,#EF8A2B 4.6px,rgba(239,138,43,0) 5.2px);background-size:9px 6px;background-repeat:repeat-x">&nbsp;</div>`;
  const marke = tabelle(zeile(
    zelle('padding:0 7px 0 0', `<div style="width:3px;height:15px;border-radius:2px;${fest('#EF8A2B')};${LEER}">&nbsp;</div>`),
    zelle('', welle),
  ));
  // Fähnchen hinter dem Blatt, schaut rechts heraus.
  return dokument(linie(50, '#B9B3A5', 7, 13) + linie(78) + linie(70) + `<div style="margin:0 0 8px 0">${marke}</div>` + linie(76) + linie(56, '#DCD7CB', 5, 0), [
    ebene(`radial-gradient(circle 9px at 9px 9px,#F59A45 ${weich(9)}%,rgba(245,154,69,0) 100%)`, 122, 50, 18, 18),
    ebene('linear-gradient(#F7A553,#D9731A)', 100, 50, 31, 18),
  ]);
}

// Bogen mit Siegel unten rechts: gelber Ring, darin eine dunkle Scheibe (Zeichen gelb auf dunkel —
// bleibt im Dunkelmodus lesbar). zeichen = Inhalt der Scheibe, zeilen = Linien über dem Siegel.
function bogenMitSiegel(zeichen, zeilen, links = linie(22) + linie(16, '#DCD7CB', 5, 0)) {
  const scheibe = zelle(`width:52px;height:52px;border-radius:26px;background-color:#FFCC08;background-image:radial-gradient(circle at 34% 28%,#FFEA8F 0%,#FFCC08 50%,#DDA600 100%);box-shadow:0 4px 8px -3px rgba(0,0,0,0.4)`,
    tabelle(zeile(zeichen)), ' width="52" height="52" align="center" valign="middle"');
  const unten = tabelle(zeile(
    zelle('padding:0 0 4px 0', links, ' valign="bottom"'),
    zelle('', tabelle(zeile(scheibe)), ' align="right"'),
  ), 78);
  return dokument(zeilen + unten);
}
const DUNKLE_SCHEIBE = `width:38px;height:38px;border-radius:19px;background-color:#1F1E1C`;
const SCHEIBE_GRUND = 'radial-gradient(circle at 40% 30%,#3A3834 0%,#1A1A18 100%)';

// Beurteilung liegt vor: Bogen mit Haken.
function beurteilung() {
  const haken = zelle(`${DUNKLE_SCHEIBE};background-image:${SCHEIBE_GRUND};font-family:'Segoe UI Symbol','Segoe UI',Arial,sans-serif;font-size:23px;line-height:38px;font-weight:bold;color:#FFCC08;text-align:center`,
    '&#10003;&#65038;', ' width="38" height="38" align="center" valign="middle"');
  return bogenMitSiegel(haken, linie(50, '#B9B3A5', 7, 13) + linie(78) + linie(66, '#DCD7CB', 5, 6));
}

// Schlichte Uhr im Siegel: zwei Zeiger (12 und 3) mit runden Enden, Drehpunkt genau in der Scheibenmitte.
// Zeiger und Kappen haben dasselbe Profil (4 px Kachel, 0,6 px weiche Kante) → Enden und Gelenk
// gehen nahtlos ineinander über, nichts steht über.
function uhr() {
  const GELB = '#FFCC08', G0 = 'rgba(255,204,8,0)', c = 19, MINUTE = 12, STUNDE = 9;
  const profil = (richtung) => `linear-gradient(${richtung}${G0} 0,${GELB} 0.6px,${GELB} 3.4px,${G0} 4px)`;
  const kappe = (x, y) => ebene(`radial-gradient(circle 2px at 2px 2px,${GELB} 70%,${G0} 100%)`, x - 2, y - 2, 4, 4);
  return zelle(`${DUNKLE_SCHEIBE};${css([
    kappe(c, c),                                              // Gelenk
    kappe(c, c - MINUTE),                                     // Ende Minutenzeiger
    kappe(c + STUNDE, c),                                     // Ende Stundenzeiger
    ebene(profil('90deg,'), c - 2, c - MINUTE, 4, MINUTE),    // Zeiger → 12
    ebene(profil(''), c, c - 2, STUNDE, 4),                   // Zeiger → 3
    ebene(SCHEIBE_GRUND, 0, 0, 38, 38),
  ])}`, '&nbsp;', ' width="38" height="38"');
}

// Beurteilung offen: Bogen mit Uhr im Siegel.
function offen() {
  return bogenMitSiegel(uhr(), linie(50, '#B9B3A5', 7, 13) + linie(78) + linie(40, '#DCD7CB', 5, 6));
}

// Keine Einträge: Bericht mit leeren Zeilen und Uhr im Siegel.
function erinnerung() {
  // leere Zeilen: nur blasse Punkte, wo sonst Text stünde
  const leer = (b, unten = 8) => `<div style="width:${b}px;height:4px;margin:0 0 ${unten}px 0;${LEER};background-image:radial-gradient(circle 1.6px at 2px 2px,#D2CCBF ${weich(1.6)}%,rgba(210,204,191,0) 100%);background-size:8px 4px;background-repeat:repeat-x">&nbsp;</div>`;
  return bogenMitSiegel(uhr(), linie(50, '#B9B3A5', 7, 14) + leer(78, 10) + leer(70, 10), leer(22, 7) + leer(16, 0));
}

const EMBLEME = {
  termin: () => kalender({
    kopf: ['#FFDA3D', '#F2BD00'], papier: ['#FBFAF6', '#EEEBE3', '#F3F1EB'], feld: '#E5E2D9',
    marke: [ebene('linear-gradient(#FFD93A,#F0BA00)', 44, 18, 16, 12)],
  }),
  abgesagt: () => kalender({
    kopf: ['#A3A19A', '#86847D'], papier: ['#F1F0EC', '#E2E0DA', '#E9E8E3'], feld: '#D8D6CF',
    marke: [
      ebene('linear-gradient(to top right,rgba(110,108,102,0) 37%,#6E6C66 43%,#6E6C66 57%,rgba(110,108,102,0) 63%)', 44, 18, 16, 12),
      ebene('linear-gradient(to top left,rgba(110,108,102,0) 37%,#6E6C66 43%,#6E6C66 57%,rgba(110,108,102,0) 63%)', 44, 18, 16, 12),
      ebene('linear-gradient(#C9C6BE,#C9C6BE)', 44, 18, 16, 12),
    ],
  }),
  zurueck: korrektur,
  erinnerung,
  offen,
  erledigt: beurteilung,
};
const emblem = (anlass) => (EMBLEME[anlass] || EMBLEME.termin)();

module.exports = { szene, emblem, FUSS_H, MAX_EBENEN };
