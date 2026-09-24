/* Prüft den Durchlauf-Report (Spec 2026-09-09) end-to-end:
   API-Gate, Antwort-Shape, Dialog-Verdrahtung im Abteilungs-Planer und das
   erzeugte Druckdokument (als PDF).

   Gesucht wird vor allem das, was ein Unit-Test nicht sieht:
   - ob das Rollen-Gate wirklich am Endpunkt hängt (nicht nur in der UI),
   - ob ein Beurteilungs-ENTWURF wirklich ohne Text ausgeliefert wird,
   - ob der Report-Knopf für die falsche Rolle unsichtbar bleibt,
   - ob das Popup Blätter erzeugt, die sich als A4-PDF speichern lassen,
   - und ob der technische Demo-Azubi nach der Filter-Rücknahme wieder auf
     der Plantafel steht.

   Aufruf:  node tools/check-durchlauf-report.mjs [--out=ordner]
   Setzt ein laufendes Backend auf http://localhost:3000 voraus (App immer
   über :3000 öffnen — Live Server spaltet Frontend und API).            */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:3000';

const KONTEN = {
  admin:   'admin.demo@putzmeister.com',
  planer:  'admin.demo@putzmeister.com',
  pruefer: 'matthias.lengerer.demo@putzmeister.com',
  leitung: 'ausbildungsleitung.kfm.demo@putzmeister.com',   // kaufmännisch, KannPlanen
};

/* Demo-OIDs (backend/db/seed-demo-users.sql). */
const OID = {
  kuniss: '00000000-0000-0000-0000-000000000001',   // technisch, ohne Department
  kern:   '00000000-0000-0000-0000-000000000003',   // technisch
  lena:   '00000000-0000-0000-0000-000000000005',   // kaufmännisch, hat Beurteilungen
  jana:   '00000000-0000-0000-0000-000000000007',   // DH-Student -> zählt kaufmännisch
};

const VON = '2025-08-01';
const BIS = '2026-08-31';

const args = process.argv.slice(2);
const outDir = (args.find(a => a.startsWith('--out=')) || '').split('=')[1] || null;
if (outDir) await mkdir(outDir, { recursive: true });

let befunde = 0;
const ok   = (t, extra = '') => console.log(`OK     ${t}${extra ? `  ${extra}` : ''}`);
const fail = (t, warum) => { console.log(`BEFUND ${t}\n       → ${warum}`); befunde++; };
const info = t => console.log(`  ·    ${t}`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function alsKonto(email, viewport) {
  const ctx = await browser.newContext(viewport ? { viewport, deviceScaleFactor: 1 } : {});
  const login = await ctx.request.post(`${BASE}/api/auth/login-by-email`, { data: { email } });
  if (!login.ok()) throw new Error(`Login ${email} fehlgeschlagen (${login.status()})`);
  return ctx;
}

/* ════════════════ 1) API: Rollen-Gate ════════════════ */

{
  const ctx = await alsKonto(KONTEN.pruefer);
  const r = await ctx.request.post(`${BASE}/api/beurteilungen/report`,
    { data: { azubiOids: [OID.lena], von: VON, bis: BIS } });
  if (r.status() === 403) ok('Gate: normaler Prüfer bekommt 403 auf POST /report');
  else fail('Gate: normaler Prüfer', `erwartet 403, bekommen ${r.status()}`);

  const l = await ctx.request.get(`${BASE}/api/beurteilungen/report/azubis`);
  if (l.status() === 403) ok('Gate: normaler Prüfer bekommt 403 auf GET /report/azubis');
  else fail('Gate: /report/azubis für Prüfer', `erwartet 403, bekommen ${l.status()}`);
  await ctx.close();
}

/* ════════════════ 2) API: admin, Shape und Entwurfsschutz ════════════════ */

{
  const ctx = await alsKonto(KONTEN.admin);
  const alle = Object.values(OID);
  const r = await ctx.request.post(`${BASE}/api/beurteilungen/report`,
    { data: { azubiOids: alle, von: VON, bis: BIS } });
  if (!r.ok()) {
    fail('admin: POST /report', `Status ${r.status()} — ${(await r.text()).slice(0, 200)}`);
  } else {
    const data = await r.json();
    if (data.von === VON && data.bis === BIS && /^\d{4}-\d{2}-\d{2}$/.test(data.stand || '')) {
      ok('admin: Antwort trägt Zeitraum und Stand');
    } else fail('admin: Kopfdaten', JSON.stringify({ von: data.von, bis: data.bis, stand: data.stand }));

    if (Array.isArray(data.azubis) && data.azubis.length) {
      ok('admin: Azubis geliefert', `${data.azubis.length} Personen`);
    } else fail('admin: Azubis', 'leere Liste — der Report hätte keinen Inhalt');

    const stationen = data.azubis.flatMap(a => a.stationen || []);
    info(`${stationen.length} Stationen im Zeitraum`);

    // Stammdaten, die auf dem Blatt landen.
    /* Namen kommen ROH aus der DB — gedreht wird erst im Client
       (displayName, idempotent). Die Demo-Konten sind als „Vorname
       Nachname" geseedet, echte Entra-Konten als „Nachname, Vorname";
       geprüft wird deshalb nur, dass überhaupt ein Name mitkommt, nicht
       eine bestimmte Schreibweise. */
    const lena = data.azubis.find(a => a.oid === OID.lena);
    if (lena && lena.name) ok('Stammdaten: Name mitgeliefert', lena.name);
    else fail('Stammdaten', 'Name fehlt in der Antwort');
    if (lena && lena.ausbildungsBeginn && lena.ausbildungsEnde) ok('Ausbildungsrahmen vorhanden', `${lena.ausbildungsBeginn} – ${lena.ausbildungsEnde}`);
    else fail('Ausbildungsrahmen', 'AusbildungBeginn/Ende fehlen in der Antwort');

    // DER Kernpunkt: ein Entwurf darf keine Note und keinen Text tragen.
    const entwuerfe = stationen.filter(s => s.beurteilung && s.beurteilung.status !== 'abgeschlossen');
    if (!entwuerfe.length) {
      fail('Entwurfsschutz', 'kein Entwurf in den Demo-Daten — der Fall bleibt ungeprüft');
    } else {
      const leck = entwuerfe.filter(s => s.beurteilung.note != null
        || s.beurteilung.gesamtPunkte != null
        || s.beurteilung.individuelleBeurteilung
        || s.beurteilung.kurzfeedbackEindruck
        || s.beurteilung.kurzfeedbackEmpfehlung);
      if (leck.length) fail('Entwurfsschutz', `${leck.length} Entwurf/Entwürfe liefern Note oder Text mit`);
      else ok('Entwurfsschutz: Entwürfe kommen ohne Note und ohne Text', `${entwuerfe.length} geprüft`);
    }

    const fertig = stationen.filter(s => s.beurteilung && s.beurteilung.status === 'abgeschlossen');
    if (fertig.some(s => s.beurteilung.typ === 'gross' && s.beurteilung.note != null)) ok('abgeschlossene gross-Beurteilung mit Note vorhanden');
    else fail('Testdaten', 'keine abgeschlossene gross-Beurteilung mit Note — Notenspalte bleibt ungeprüft');
    if (fertig.some(s => s.beurteilung.typ === 'kurz' && s.beurteilung.kurzfeedbackEindruck)) ok('abgeschlossenes Kurzfeedback vorhanden');
    else fail('Testdaten', 'kein abgeschlossenes Kurzfeedback — kurz-Zweig bleibt ungeprüft');
  }

  // Body-Validierung
  const schlecht = await ctx.request.post(`${BASE}/api/beurteilungen/report`,
    { data: { azubiOids: [OID.lena], von: '2026-08-31', bis: '2026-01-01' } });
  if (schlecht.status() === 400) ok('Validierung: Bis vor Von wird mit 400 abgewiesen');
  else fail('Validierung', `erwartet 400, bekommen ${schlecht.status()}`);
  await ctx.close();
}

/* ════════════════ 3) API: Ausbildungsleitung sieht nur den eigenen Bereich ════════════════ */

{
  let ctx;
  try { ctx = await alsKonto(KONTEN.leitung); }
  catch (e) { fail('Leitung: Login', `${e.message} — Seed backend/db/seed-demo-users.sql eingespielt?`); }
  if (ctx) {
    const l = await ctx.request.get(`${BASE}/api/beurteilungen/report/azubis`);
    if (l.ok()) {
      const oids = (await l.json()).map(r => r.oid);
      if (oids.includes(OID.lena) && oids.includes(OID.jana)) ok('Leitung sieht ihren Bereich (kaufm. + DH)', `${oids.length} Personen`);
      else fail('Leitung: eigener Bereich', `Lena/Jana fehlen in ${JSON.stringify(oids)}`);
      if (!oids.includes(OID.kuniss)) ok('Leitung sieht den technischen Azubi NICHT');
      else fail('Leitung: Bereichsgrenze', 'technischer Azubi steht in /report/azubis');
    } else fail('Leitung: /report/azubis', `Status ${l.status()}`);

    const r = await ctx.request.post(`${BASE}/api/beurteilungen/report`,
      { data: { azubiOids: [OID.kuniss], von: VON, bis: BIS } });
    if (r.status() === 403) {
      const body = await r.json();
      if (Array.isArray(body.unzulaessig) && body.unzulaessig.includes(OID.kuniss)) {
        ok('Leitung: fremde Person → 403 mit unzulaessig');
      } else fail('Leitung: 403-Body', `unzulaessig fehlt: ${JSON.stringify(body)}`);
    } else fail('Leitung: fremde Person', `erwartet 403, bekommen ${r.status()}`);

    const eigen = await ctx.request.post(`${BASE}/api/beurteilungen/report`,
      { data: { azubiOids: [OID.lena, OID.jana], von: VON, bis: BIS } });
    if (eigen.ok()) ok('Leitung: eigener Bereich → 200');
    else fail('Leitung: eigener Bereich', `Status ${eigen.status()}`);
    await ctx.close();
  }
}

/* ════════════════ 4) UI: Plantafel + Dialog + Popup + PDF ════════════════ */

{
  const ctx = await alsKonto(KONTEN.planer, { width: 1900, height: 1000 });
  const page = await ctx.newPage();
  const jsFehler = [];
  page.on('pageerror', e => jsFehler.push(String(e.message).split('\n')[0]));
  // Auto-Print im Popup ruhigstellen — window.print() blockiert headless.
  await ctx.addInitScript(() => { window.print = () => {}; });

  await page.goto(`${BASE}/app/abteilungs-planer.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pt-row, .pt-toolbar', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Filter-Rücknahme: der technische Demo-Azubi steht wieder auf der Tafel.
  const tafelText = await page.evaluate(() => document.querySelector('.main-content')?.textContent || '');
  if (tafelText.includes('Florian Kuniß')) ok('Plantafel zeigt den technischen Demo-Azubi wieder');
  else fail('Filter-Rücknahme', 'Florian Kuniß fehlt auf der Plantafel');

  // Dialog öffnen und Report-Modus prüfen.
  await page.click('#ptPrint');
  await page.waitForSelector('#ptPrintModal .modal', { state: 'visible', timeout: 10000 });
  const reportSichtbar = await page.isVisible('#ppMode [data-mode="report"]');
  if (reportSichtbar) ok('Dialog: Report-Knopf für die Verwaltung sichtbar');
  else fail('Dialog: Report-Knopf', 'für admin unsichtbar');

  if (outDir) await page.screenshot({ path: `${outDir}/dialog-tafel-1900.png` });

  await page.click('#ppMode [data-mode="report"]');
  await page.waitForTimeout(900);
  const goLabel = await page.textContent('#ppGo');
  if ((goLabel || '').includes('Report')) ok('Dialog: Aktionsknopf heißt jetzt „Report erstellen"');
  else fail('Dialog: Aktionslabel', `unerwartet "${goLabel}"`);

  // Zeitraum auf die ganze Demo-Spanne setzen, damit alle Stationen zählen.
  await page.fill('#ppVon', VON);
  await page.fill('#ppBis', BIS);
  await page.dispatchEvent('#ppVon', 'change');
  await page.dispatchEvent('#ppBis', 'change');
  /* Nur die vier Demo-Azubis wählen. „Alle" wären auf der Dev-Tafel ~50
     Personen — ein PDF, das niemand mehr durchsieht, und der Lauf würde
     Minuten dauern. Die Mengenlogik selbst ist im Unit-Test abgedeckt. */
  await page.click('#ppNone');
  for (const oid of Object.values(OID)) {
    const cb = page.locator(`#ppList input[data-id="${oid}"]`);
    if (await cb.count()) await cb.check();
    else info(`Hinweis: ${oid} steht nicht in der Dialogliste`);
  }
  await page.waitForTimeout(300);
  const count = await page.textContent('#ppCount');
  info(`Auswahl im Report-Modus: ${count}`);

  if (outDir) await page.screenshot({ path: `${outDir}/dialog-report-1900.png` });

  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 20000 }),
    page.click('#ppGo'),
  ]);
  await popup.waitForSelector('.sheet', { timeout: 30000 });
  await popup.waitForTimeout(1200);

  const blaetter = await popup.locator('.sheet').count();
  if (blaetter > 1) ok('Popup: je Person ein Blatt', `${blaetter} Blätter`);
  else fail('Popup: Blätter', `nur ${blaetter} Blatt — Seitenumbruch je Person nicht prüfbar`);

  const dokCheck = await popup.evaluate(() => ({
    titel: document.title,
    kopf: !!document.querySelector('table.dr-tab thead'),
    fuss: !!document.querySelector('tfoot.pm-footer'),
    ersteBlattFirst: !!document.querySelector('.sheet.sheet--first'),
    avatare: document.querySelectorAll('.dr-avatar').length,
    fotos: document.querySelectorAll('.dr-avatar img').length,
    logo: !!document.querySelector('img.logo'),
    text: document.body.textContent.replace(/\s+/g, ' '),
  }));
  if (dokCheck.kopf) ok('Popup: echtes <thead> (Kopf wiederholt sich je Druckseite)');
  else fail('Popup: Tabellenkopf', 'kein <thead> gefunden');
  if (dokCheck.fuss) ok('Popup: CD-Fußleiste als <tfoot> angelegt');
  else fail('Popup: Fußleiste', 'kein tfoot.pm-footer');
  if (dokCheck.ersteBlattFirst) ok('Popup: erstes Blatt ist sheet--first (kein Leerblatt vorweg)');
  else fail('Popup: sheet--first', 'fehlt');
  if (dokCheck.logo) ok('Popup: CD-Logo eingebettet');
  else fail('Popup: Logo', 'img.logo fehlt (Data-URI nicht geladen?)');
  info(`${dokCheck.avatare} Avatare, davon ${dokCheck.fotos} mit Foto`);

  if (dokCheck.text.includes('ENTWURFSTEXT')) fail('Popup: Entwurfsschutz', 'Entwurfstext steht im Druckdokument');
  else ok('Popup: kein Entwurfstext im Dokument');
  if (dokCheck.text.includes('offen (Entwurf)')) ok('Popup: Entwurf als „offen (Entwurf)" gekennzeichnet');
  else info('Hinweis: kein „offen (Entwurf)" im Dokument (Zeitraum/Testdaten prüfen)');
  if (/Note \d,\d/.test(dokCheck.text)) ok('Popup: Note im deutschen Format');
  else fail('Popup: Note', 'kein „Note x,y" gefunden');
  if (dokCheck.text.includes('Empfehlung:')) ok('Popup: Kurzfeedback mit „Empfehlung:"');
  else fail('Popup: Kurzfeedback', 'kein „Empfehlung:" gefunden');

  if (outDir) {
    await popup.screenshot({ path: `${outDir}/report-popup.png`, fullPage: true });
    await popup.pdf({ path: `${outDir}/durchlauf-report.pdf`, format: 'A4', printBackground: true });
    info(`PDF geschrieben: ${outDir}/durchlauf-report.pdf`);
  }
  for (const e of jsFehler) fail('JS-Fehler auf der Planer-Seite', e);
  await ctx.close();
}

/* ════════════════ 5) UI-Gegenprobe: Planer ohne Report-Recht ════════════════ */

{
  // test.pruefer.demo hat KannPlanen=0 und käme nicht auf die Tafel; die
  // Gegenprobe läuft deshalb über den Dialog-Kontext selbst: reportErlaubt
  // wird aus der Rolle gebildet, und PlanerPrint blendet den Knopf danach ein.
  const ctx = await alsKonto(KONTEN.planer, { width: 1900, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/abteilungs-planer.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pt-toolbar', { timeout: 20000 });
  const versteckt = await page.evaluate(() => {
    // Dialog mit reportErlaubt:false öffnen — genau der Zustand eines
    // Planers ohne Leitungs-Tag.
    window.PlanerPrint.open({
      personen: [], von: '2026-01-01', bis: '2026-12-31', ajLabel: 'AJ',
      stand: '2026-09-09', reportErlaubt: false, erstelltVon: 'Test',
    });
    const b = document.querySelector('#ppMode [data-mode="report"]');
    return !!(b && b.hidden);
  });
  if (versteckt) ok('Gegenprobe: ohne Report-Recht bleibt der Knopf versteckt');
  else fail('Gegenprobe', 'Report-Knopf ist auch ohne Recht sichtbar');
  await ctx.close();
}

await browser.close();
console.log(befunde ? `\n${befunde} Befund(e).` : '\nAlles in Ordnung.');
process.exit(befunde ? 1 : 0);
