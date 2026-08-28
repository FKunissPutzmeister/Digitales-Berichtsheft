/* Prüft den Status „Entwurf" in der Jahresansicht: eine Woche, in der schon
   etwas steht, die aber noch nicht eingereicht ist, muss golden markiert sein –
   und nicht wie eine leere Woche aussehen (früher war beides grau „offen").

   Gegengerechnet wird gegen die Rohdaten aus DB.getWochenFuerAzubi, nicht
   gegen die Klassen, die die Seite selbst gesetzt hat: Tageszelle und
   Wochenpunkt müssen beide zum Inhalt der Woche passen.

   Wichtig ist der Formatunterschied: im wöchentlichen (kaufmännischen)
   Format gibt es nur einen Eintrag pro Woche – dort müssen ALLE Werktage der
   Woche denselben Zustand zeigen. Einzelne Entwurfs-Tage sind nur im
   täglichen Format richtig.

   Aufruf:  node tools/check-jahresansicht-entwurf.mjs
   Setzt ein laufendes Backend auf http://localhost:3000 voraus sowie ein
   auflösbares playwright (wie tools/check-dashboard-viewports.mjs). */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const USERS = [
  { email: 'florian.kern.demo@putzmeister.com', typ: 'wöchentlich' },
  { email: 'jonas.becker.demo@putzmeister.com', typ: 'täglich' },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let fehler = 0;

for (const u of USERS) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const login = await ctx.request.post(`${BASE}/api/auth/login-by-email`, { data: { email: u.email } });
  if (!login.ok()) {
    console.error(`FEHLER Login fehlgeschlagen (${login.status()}). Läuft das Backend?`);
    process.exit(1);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('FEHLER JS-Fehler auf der Seite:', e.message); fehler++; });
  await page.goto(`${BASE}/app/jahresansicht.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.day-cell', { timeout: 15000 });

  const r = await page.evaluate(async () => {
    const leer = (h) => !h || h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim() === '';
    // Mo–Fr „anwesend / Betrieb / Ganztag" ist das automatisch angelegte
    // Geruest – kein Inhalt. Nur Abweichungen davon zaehlen.
    const abweichung = (t) => {
      if (!t) return false;
      if (t.tagdauer === 'halbtag') return true;
      const dow = new Date(t.datum + 'T00:00:00').getDay();
      return (dow === 0 || dow === 6)
        ? !!t.anwesenheit && t.anwesenheit !== 'Wochenende'
        : !!t.anwesenheit && t.anwesenheit !== 'anwesend';
    };
    const tagText = (t) => !!t && !(leer(t.eintrag) && leer(t.betriebEintrag)
      && leer(t.schuleEintrag) && leer(t.unterweisungEintrag));
    const azubiId = document.getElementById('azubiSelect')?.value || DB.getCurrentUser().id;
    const wochen = await DB.getWochenFuerAzubi(azubiId);
    const berichtTyp = (await DB.getUser(azubiId))?.berichtTyp || 'täglich';
    const tagInhalt = (t) => abweichung(t) || (berichtTyp !== 'wöchentlich' && tagText(t));
    const probleme = [];
    let entwuerfe = 0;

    for (const w of wochen) {
      const wochenText = !leer(w.betriebEintrag) || !leer(w.schuleEintrag) || !leer(w.unterweisungEintrag);
      const inhalt = (berichtTyp === 'wöchentlich' && wochenText) || (w.tage || []).some(tagInhalt);
      const erwartet = (w.status === 'offen' && inhalt) ? 'entwurf' : w.status;
      if (erwartet === 'entwurf') entwuerfe++;

      const monday = DateUtil.getMondayOfKW(w.kw, w.year);
      // Monatsuebergreifende KW steht in zwei Monatskacheln.
      const rows = [...document.querySelectorAll(`.week-row[data-kw="${w.kw}"][data-year="${w.year}"]`)];
      if (!rows.length) continue;                    // Woche liegt nicht im angezeigten Jahr
      for (const row of rows) {
        const dot = row.querySelector('.week-status-dot');
        if (!dot?.classList.contains('week-status-dot--' + erwartet)) {
          probleme.push(`KW ${w.kw}/${w.year}: Punkt ist "${dot?.className}", erwartet "${erwartet}"`);
        }
        if (w.status !== 'offen') continue;          // eingereicht/abgenommen: Wochenstatus gilt

        // Zellen stehen in Reihenfolge Mo..So hinter der KW-Spalte.
        const cells = [...row.querySelectorAll('.day-cell')];
        cells.forEach((cell, i) => {
          if (cell.classList.contains('empty') || cell.classList.contains('weekend')) return;
          const d = new Date(monday); d.setDate(monday.getDate() + i);
          const iso = DateUtil.toISODate(d);
          const tag = (w.tage || []).find((t) => t.datum === iso);
          const soll = berichtTyp === 'wöchentlich'
            ? inhalt                                  // Wochen-Eintrag gilt fuer alle Tage
            : tagInhalt(tag);
          const ist  = cell.classList.contains('status-entwurf');
          if (soll !== ist) {
            probleme.push(`${iso}: Zelle ${ist ? 'ist' : 'ist nicht'} Entwurf, Inhalt sagt ${soll ? 'ja' : 'nein'}`);
          }
        });
      }
    }
    return { probleme, entwuerfe, wochen: wochen.length };
  });

  if (r.probleme.length) {
    fehler += r.probleme.length;
    console.log(`FEHLER ${u.email} (${u.typ}):`);
    r.probleme.slice(0, 10).forEach((p) => console.log('   ' + p));
  } else {
    console.log(`OK ${u.email} (${u.typ}): ${r.entwuerfe} Entwurfs-Wochen von ${r.wochen} korrekt markiert`);
  }
  await ctx.close();
}

await browser.close();
if (fehler) { console.log(`\n${fehler} Problem(e).`); process.exit(1); }
console.log('\nAlles gut.');
