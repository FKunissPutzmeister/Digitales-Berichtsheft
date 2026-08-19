/* Prüft das Umschalten eines Wochenendtags in der Wochenansicht.

   Hintergrund: Sa/So sind „frei" (ausgegraut, kein Ort-Feld), bis dort eine
   Anwesenheit gewählt wird. Der Zeilenaufbau ändert sich dabei strukturell,
   also wird die Woche neu gerendert. Früher hing dieses Re-Render am Server
   (GET alle Wochen → POST → GET User + Zuweisung) – das Ort-Feld erschien
   erst nach rund einer halben Sekunde. Jetzt wird die Woche lokal gepatcht,
   sofort gerendert und erst danach gespeichert. Dieser Test hält beides fest:
   die Zeile steht binnen eines Frames, UND der Hintergrund-Save landet
   trotzdem in der Datenbank.

   Beide Berichtsformate, weil es zwei getrennte Umschalt-Pfade gibt
   (Tageskarten bzw. kompakte Zeilen im Wochen-Format).

   Aufruf:  node tools/check-wochenende-toggle.mjs
   Setzt ein laufendes Backend auf http://localhost:3000 voraus sowie ein
   auflösbares playwright (wie tools/check-dashboard-viewports.mjs).
   Der Test setzt den benutzten Samstag am Ende wieder auf „Wochenende". */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const USERS = [
  { email: 'florian.kern.demo@putzmeister.com', typ: 'wöchentlich' },
  { email: 'jonas.becker.demo@putzmeister.com', typ: 'täglich' },
];

/* Ein Frame Toleranz: render() ist async, das neue Markup steht deshalb
   frühestens im nächsten Frame. Mehr als das hieße, es wird wieder auf
   Netz gewartet. */
const MAX_FRAMES = 1;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let fehler = 0;

for (const u of USERS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await ctx.request.post(`${BASE}/api/auth/login-by-email`, { data: { email: u.email } });
  if (!login.ok()) {
    console.error(`FEHLER Login fehlgeschlagen (${login.status()}). Läuft das Backend?`);
    process.exit(1);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('FEHLER JS-Fehler auf der Seite:', e.message); fehler++; });
  await page.goto(`${BASE}/app/wochenansicht.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tag-row[data-date]', { timeout: 15000 });

  const sa = await page.evaluate(() => [...document.querySelectorAll('.tag-row[data-date]')]
    .find((r) => new Date(r.dataset.date + 'T00:00:00').getDay() === 6)?.dataset.date);

  /* 1) Anwesenheit setzen und zählen, wie viele Frames vergehen, bis das
        Ort-Feld existiert und nicht mehr ausgegraut ist. Gleichzeitig prüfen,
        dass die Zeile eingeblendet wird statt zu springen: im ersten Frame muss
        das Ort-Feld noch durchsichtig sein und die Fläche noch den
        Wochenend-Ton der alten Zeile haben. */
  const sofort = await page.evaluate(async (d) => {
    const bgVorher = getComputedStyle(document.querySelector(`.tag-row[data-date="${d}"]`)).backgroundColor;
    const sel = document.querySelector(`select[data-field="anwesenheit"][data-date="${d}"]`);
    const t0 = performance.now();
    sel.value = 'anwesend';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 600; i++) {
      const ort = document.querySelector(`select[data-field="ort"][data-date="${d}"]`);
      if (ort && !ort.disabled) {
        const zeile = ort.closest('.tag-row');
        const feld = zeile.querySelector('.tag-row__field--ort');
        return {
          ms: Math.round(performance.now() - t0), frames: i, ort: ort.value,
          bgVorher, bgErsterFrame: getComputedStyle(zeile).backgroundColor,
          opacityErsterFrame: +getComputedStyle(feld).opacity,
        };
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { frames: -1, ort: null };
  }, sa);

  /* 2) Der Save läuft erst nach dem Rendern – nach Reload muss der Tag stehen. */
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tag-row[data-date]');
  const nachReload = await page.evaluate((d) => ({
    anwesenheit: document.querySelector(`select[data-field="anwesenheit"][data-date="${d}"]`)?.value,
    ort: document.querySelector(`select[data-field="ort"][data-date="${d}"]`)?.value,
    frei: !!document.querySelector(`.tag-row[data-date="${d}"].tag-row--weekend`),
  }), sa);

  /* 3) Zurück auf „Wochenende" – der Tag muss wieder frei sein (und der Test
        hinterlässt keinen aktivierten Samstag). */
  await page.evaluate((d) => {
    const sel = document.querySelector(`select[data-field="anwesenheit"][data-date="${d}"]`);
    sel.value = 'Wochenende';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, sa);
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tag-row[data-date]');
  const wiederFrei = await page.evaluate((d) =>
    !!document.querySelector(`.tag-row[data-date="${d}"].tag-row--weekend`), sa);

  const probleme = [];
  if (sofort.frames < 0) probleme.push('Ort-Feld erschien gar nicht');
  else if (sofort.frames > MAX_FRAMES) probleme.push(`Ort-Feld erst nach ${sofort.ms} ms / ${sofort.frames} Frames bedienbar (erlaubt: ${MAX_FRAMES})`);
  if (sofort.opacityErsterFrame > 0.3) probleme.push(`Ort-Feld springt hart auf (Opacity im ersten Frame ${sofort.opacityErsterFrame}) – Einblenden greift nicht`);
  if (sofort.bgErsterFrame !== sofort.bgVorher) probleme.push(`Fläche springt: ${sofort.bgVorher} → ${sofort.bgErsterFrame} statt weich zu blenden`);
  if (nachReload.anwesenheit !== 'anwesend' || nachReload.frei) probleme.push(`Hintergrund-Save nicht angekommen: ${JSON.stringify(nachReload)}`);
  if (!wiederFrei) probleme.push('Zurücksetzen auf „Wochenende" hat den Tag nicht wieder freigegeben');

  if (probleme.length) {
    fehler++;
    console.log(`FEHLER ${u.typ.padEnd(12)} ${sa}`);
    probleme.forEach((p) => console.log(`       - ${p}`));
  } else {
    console.log(`OK     ${u.typ.padEnd(12)} ${sa}  Ort bedienbar nach ${sofort.ms} ms (${sofort.frames} Frames), Ort="${sofort.ort}", blendet ein, Save persistiert`);
  }
  await ctx.close();
}

await browser.close();
process.exit(fehler ? 1 : 0);
