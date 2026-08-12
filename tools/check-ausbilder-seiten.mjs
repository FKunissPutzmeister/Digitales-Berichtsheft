/* Prüft die Seiten, die Ausbilder und Prüfer erreichen, auf den beiden
   Bildschirmgrößen eines 11"-iPads.

   Gesucht wird, was auf dem iPad wehtut und am Desktop nicht auffällt:
   seitliches Scrollen, Inhalt der aus seinem Behälter läuft, zu kleine
   Tippziele und Seiten, die viel weiter scrollen als nötig.

   Der Überhang wird am RICHTIGEN Scroll-Container gemessen: auf Touchgeräten
   scrollt .main-wrapper, am Desktop das Dokument (docs/ios-touch-verhalten.md).
   Wer hier pauschal .main-wrapper ausliest, bekommt für Desktop-Viewports
   immer 0 und merkt nichts.

   Aufruf:  node tools/check-ausbilder-seiten.mjs [--shots=ordner] [--nur=seite]
   Setzt ein laufendes Backend auf http://localhost:3000 voraus. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:3000';

/* Kein Demo-Konto trägt „Ist Ausbilder“ UND „Kann planen“ zugleich. Die
   Rolle 'pruefer' setzt istAusbilder implizit (backend/services/users.js),
   der Verwaltungszugang bringt kannPlanen mit — zusammen decken beide die
   Seiten ab, die ein echter Ausbilder sieht. */
const KONTEN = {
  pruefer:   'matthias.lengerer.demo@putzmeister.com',
  planer:    'admin.demo@putzmeister.com',
  developer: 'dev.demo@putzmeister.com',
};

/* Lena Müller (Demo) — die Azubine mit offenen Berichten beim Demo-Prüfer. */
const AZUBI_MIT_BERICHT = '00000000-0000-0000-0000-000000000005';

/* `sprung` füllt sessionStorage, bevor die Seite lädt — dieselben Schlüssel,
   die das Dashboard beim Klick auf „Älteste prüfen“ setzt (dashboard.js).
   Ohne das misst man die Wochenansicht auf einer leeren aktuellen Woche
   statt auf dem Bericht, der tatsächlich zur Abnahme ansteht.
   `mussEnthalten` ist die Gegenprobe dazu: fehlt der Text, war die Seite
   leer und jedes „in Ordnung“ darüber wertlos. */
const SEITEN = [
  { name: 'dashboard',            pfad: 'dashboard.html',            konto: 'pruefer', warte: '.welcome-hero',
    mussEnthalten: 'Zu prüfen' },
  { name: 'wochenansicht',        pfad: 'wochenansicht.html',        konto: 'pruefer', warte: '.main-content',
    sprung: { gotoAzubiId: AZUBI_MIT_BERICHT, gotoKW: '52', gotoYear: '2026' },
    mussEnthalten: 'KW 52' },
  { name: 'jahresansicht',        pfad: 'jahresansicht.html',        konto: 'pruefer', warte: '.main-content',
    sprung: { gotoAzubiId: AZUBI_MIT_BERICHT }, mussEnthalten: 'KW' },
  { name: 'beurteilungen',        pfad: 'beurteilungen.html',        konto: 'pruefer', warte: '.main-content' },
  { name: 'mitteilungen',         pfad: 'mitteilungen.html',         konto: 'pruefer', warte: '.main-content' },
  { name: 'ausbildungsstand',     pfad: 'ausbildungsstand.html',     konto: 'pruefer', warte: '.main-content' },
  { name: 'profil',               pfad: 'profil.html',               konto: 'pruefer', warte: '.main-content',
    mussEnthalten: 'Lengerer' },
  { name: 'abteilungs-planer',    pfad: 'abteilungs-planer.html',    konto: 'planer',  warte: '.main-content' },
  { name: 'berichtsheftverwaltung', pfad: 'berichtsheftverwaltung.html', konto: 'planer', warte: '.main-content' },
  /* Nur über die Developer-Navigation erreichbar (nav-developer-only),
     inhaltlich aber Ausbildungsorganisation — deshalb mitgeprüft. */
  { name: 'abteilungsverwaltung', pfad: 'abteilungsverwaltung.html', konto: 'developer', warte: '.main-content' },
];

const VIEWPORTS = [
  { name: 'quer', width: 1194, height: 745 },
  { name: 'hoch', width: 834,  height: 1105 },
];

const args     = process.argv.slice(2);
const shotsDir = (args.find(a => a.startsWith('--shots=')) || '').split('=')[1] || null;
const nur      = (args.find(a => a.startsWith('--nur=')) || '').split('=')[1] || null;
if (shotsDir) await mkdir(shotsDir, { recursive: true });

/* Läuft im Browser. */
function messen() {
  const wrapper = document.querySelector('.main-wrapper');
  const ov = wrapper ? getComputedStyle(wrapper).overflowY : null;
  const host = (ov === 'auto' || ov === 'scroll') ? wrapper : document.documentElement;

  const vw = document.documentElement.clientWidth;
  const nutzbar = host === document.documentElement ? document.documentElement.clientHeight
                                                    : host.clientHeight;

  /* Seitliches Scrollen — auf dem iPad die unangenehmste Sorte Fehler,
     weil der Finger dabei ungewollt die Seite verschiebt. */
  const quer = Math.max(0, host.scrollWidth - host.clientWidth,
                        document.documentElement.scrollWidth - vw);

  /* Wer ragt über den rechten Rand hinaus? Nur der äußerste Übeltäter je
     Element-Kette interessiert, deshalb kein Kind eines schon gemeldeten. */
  const zuBreit = [];
  for (const el of document.querySelectorAll('.main-content *, .dlb-root *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    const raus = Math.round(r.right - vw);
    if (raus > 2 && !zuBreit.some(z => z.el.contains(el))) {
      zuBreit.push({ el, klasse: (el.className || el.tagName).toString().split(' ')[0], raus,
                     breite: Math.round(r.width) });
    }
  }

  /* Inhalt, der aus seinem Behälter läuft. Bewusst scrollende Bereiche
     (overflow auto/scroll) zählen nicht. */
  const kappung = [];
  for (const box of document.querySelectorAll('.card, .b-tile, .panel')) {
    const cs = getComputedStyle(box);
    if (cs.overflowY !== 'hidden' && cs.overflowX !== 'hidden') continue;
    const br = box.getBoundingClientRect();
    let max = 0, wer = null;
    /* Steckt das Kind in einem bewusst scrollenden Bereich INNERHALB der
       Karte, zählt sein Überstand nicht. Geprüft am berechneten overflow,
       nicht an einer Klassenliste: eine feste Liste übersah .rot__list
       (max-height 330 px, 44 Zeilen) und meldete 5793 px Kappung, wo die
       Karte völlig in Ordnung war. */
    const imScrollbereich = (kind) => {
      for (let e = kind.parentElement; e && e !== box; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (/(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflowX)) return true;
      }
      return false;
    };
    for (const kind of box.querySelectorAll('*')) {
      if (!kind.getClientRects().length) continue;
      if (imScrollbereich(kind)) continue;
      const kr = kind.getBoundingClientRect();
      const raus = Math.max(kr.bottom - br.bottom, kr.right - br.right);
      if (raus > max) { max = raus; wer = (kind.className || kind.tagName).toString().split(' ')[0]; }
    }
    if (max > 2) kappung.push({ box: (box.className || '').toString().split(' ')[0],
                                px: Math.round(max), wer });
  }

  /* Tippziele unter 40 px — Apples Richtwert sind 44 px. */
  let klein = 0;
  const kleineBeispiele = [];
  for (const el of document.querySelectorAll('button, a.btn, .btn, input[type="checkbox"], select, .sidebar__link')) {
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 24) {
      klein++;
      if (kleineBeispiele.length < 3) {
        kleineBeispiele.push(`${(el.className || el.tagName).toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
  }

  return {
    modell: host === document.documentElement ? 'dokument' : 'wrapper',
    hoehe: host.scrollHeight, sichtbar: nutzbar,
    ueberhang: Math.max(0, host.scrollHeight - nutzbar),
    quer,
    zuBreit: zuBreit.slice(0, 4).map(z => ({ klasse: z.klasse, raus: z.raus, breite: z.breite })),
    kappung: kappung.slice(0, 4),
    klein, kleineBeispiele,
    titel: document.title,
    text: (document.querySelector('.main-content, .dlb-root')?.textContent || '').replace(/\s+/g, ' '),
    leer: !document.querySelector('.main-content, .dlb-root')
       || (document.querySelector('.main-content, .dlb-root').textContent || '').trim().length < 40,
  };
}

const browser = await chromium.launch({ channel: 'msedge' });
let befunde = 0;

for (const seite of SEITEN) {
  if (nur && seite.name !== nur) continue;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1, hasTouch: true, isMobile: true,
    });
    const login = await ctx.request.post(`${BASE}/api/auth/login-by-email`,
      { data: { email: KONTEN[seite.konto] } });
    if (!login.ok()) {
      console.log(`FEHLER ${seite.name}: Login fehlgeschlagen (${login.status()})`);
      befunde++; await ctx.close(); continue;
    }

    const page = await ctx.newPage();
    const konsole = [];
    page.on('pageerror', e => konsole.push(String(e.message).split('\n')[0]));
    if (seite.sprung) {
      await page.addInitScript(s => {
        for (const [k, v] of Object.entries(s)) sessionStorage.setItem(k, v);
      }, seite.sprung);
    }

    let ladeFehler = null;
    for (let versuch = 1; versuch <= 2; versuch++) {
      try {
        await page.goto(`${BASE}/app/${seite.pfad}`, { waitUntil: 'networkidle' });
        await page.waitForSelector(seite.warte, { timeout: 15000 });
        await page.waitForTimeout(1200);
        ladeFehler = null; break;
      } catch (e) { ladeFehler = e; }
    }
    if (ladeFehler) {
      console.log(`FEHLER ${seite.name.padEnd(22)} ${vp.name}  nicht ladbar: ${ladeFehler.name}`);
      befunde++; await ctx.close(); continue;
    }

    const ziel = new URL(page.url()).pathname.split('/').pop();
    const m = await page.evaluate(messen);
    const probleme = [];

    if (ziel !== seite.pfad) probleme.push(`umgeleitet nach ${ziel}`);
    if (m.leer)              probleme.push('Inhalt praktisch leer');
    /* Ohne diese Gegenprobe ist jedes „OK“ wertlos: eine Seite, die nichts
       anzeigt, überläuft auch nirgends. */
    if (seite.mussEnthalten && !m.text.includes(seite.mussEnthalten)) {
      probleme.push(`erwarteter Inhalt "${seite.mussEnthalten}" fehlt — gemessen wurde ein leerer Zustand`);
    }
    if (m.quer > 2)          probleme.push(`scrollt ${m.quer} px zur Seite`);
    for (const z of m.zuBreit) probleme.push(`.${z.klasse} ragt ${z.raus} px über den rechten Rand (${z.breite} px breit)`);
    for (const k of m.kappung) probleme.push(`.${k.box} schneidet ${k.px} px ab (${k.wer})`);
    for (const e of konsole)   probleme.push(`JS-Fehler: ${e}`);

    const status = probleme.length ? 'BEFUND' : 'OK    ';
    console.log(`${status} ${seite.name.padEnd(22)} ${vp.name}  ` +
                `${String(m.hoehe).padStart(5)} px Inhalt / ${m.sichtbar} sichtbar → ` +
                `${String(m.ueberhang).padStart(4)} px Überhang  ` +
                `${m.klein} kleine Tippziele`);
    for (const p of probleme) console.log(`       → ${p}`);
    if (probleme.length) befunde++;

    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${seite.name}-${vp.name}.png` });
    await ctx.close();
  }
}

await browser.close();
console.log(befunde ? `\n${befunde} Seite(n)/Viewport(s) mit Befund.` : '\nAlle Seiten in Ordnung.');
process.exit(befunde ? 1 : 0);
