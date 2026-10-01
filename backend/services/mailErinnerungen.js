'use strict';
/* Tägliche Erinnerungsmails (07:00, geplant in server.js):
     keine_eintraege    Azubi, dessen letzte 3 abgeschlossene KW UND die laufende
                        KW leer sind — einmal; erneut erst, wenn danach wieder
                        etwas eingetragen wurde (neuer Schlüssel). Wer noch nie
                        etwas eingetragen hat, bekommt keine (hat seine Gründe).
     beurteilung_offen  Verantwortliche/r, 14 Tage nach Einsatzende ohne
                        abgeschlossene Beurteilung — einmal je Zuweisung.

   Schutz gegen einen Mail-Schwall beim Scharfschalten:
     node services/mailErinnerungen.js              Probelauf: wer bekäme was (sendet/schreibt nichts)
     node services/mailErinnerungen.js --stichtag   alle HEUTE zutreffenden Fälle als erledigt markieren
     node services/mailErinnerungen.js --jetzt      einen echten Lauf sofort ausführen
   Und MAIL_MAX_PRO_LAUF (Standard 30): mehr offene Fälle → Lauf bricht ab,
   sendet nichts, schreibt einen Fehlerbericht.

   Sperre: dbo.MailVersand (Migration 048). Eintrag vor dem Senden, bei
   Fehlschlag wieder raus (dann nächster Tag erneut). Im Testmodus mit
   Präfix "test:", damit die echten Fälle unberührt bleiben. */

const { getPool, sql } = require('../db/connection');
const { logError } = require('./fehlerberichte');
const { ermittleTyp } = require('../../app/js/beurteilung-core.js');
const { mailConfig, mailKeineEintraege, mailBeurteilungOffen } = require('./mail');
const { anzeigeName } = require('./ics');

const TAG = 864e5;
const ymd = (d) => d.toISOString().slice(0, 10);

// Heutiger LOKALER Kalendertag als UTC-Mitternacht (so rechnen alle Datumsspalten).
function heuteUtc(jetzt = new Date()) {
  return new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()));
}
function montag(d) {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t;
}
// ISO-8601-Kalenderwoche (wie DateUtil.getKW/getKWYear im Frontend).
function isoWoche(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);   // Donnerstag der Woche
  const jahr = t.getUTCFullYear();
  const w1 = new Date(Date.UTC(jahr, 0, 4));
  return { kw: 1 + Math.round(((t - w1) / TAG - 3 + ((w1.getUTCDay() + 6) % 7)) / 7), jahr };
}
// Laufende KW + die 3 abgeschlossenen davor, neueste zuerst.
function pruefWochen(heute) {
  const m = montag(heute);
  return [0, 7, 14, 21].map((n) => {
    const mo = new Date(m.getTime() - n * TAG);
    return { ...isoWoche(mo), montag: mo };
  });
}

/* Inhaltsregel 1:1 aus app/js/jahresansicht.js (wocheHatInhalt): das beim
   Öffnen automatisch angelegte Mo–Fr-Gerüst „anwesend/Betrieb/Ganztag" ist
   KEIN Inhalt. Zusätzlich zählt jede nicht mehr offene Woche (eingereicht,
   geprüft, zurückgegeben) als Aktivität. Spalten in DB-Schreibweise. */
const leer = (html) => !html || String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim() === '';
function tagAbweichung(t) {
  if (!t) return false;
  if (t.Tagdauer === 'halbtag') return true;
  const dow = new Date(`${String(t.Datum).slice(0, 10)}T00:00:00Z`).getUTCDay();
  return (dow === 0 || dow === 6)
    ? !!t.Anwesenheit && t.Anwesenheit !== 'Wochenende'   // Wochenendtag hinzugefügt
    : !!t.Anwesenheit && t.Anwesenheit !== 'anwesend';    // Urlaub / Arbeitsunfähigkeit / …
}
const tagText = (t) => !!t && !(leer(t.Eintrag) && leer(t.BetriebEintrag)
  && leer(t.SchuleEintrag) && leer(t.UnterweisungEintrag));
const wochenText = (w) => !(leer(w.BetriebEintrag) && leer(w.SchuleEintrag) && leer(w.UnterweisungEintrag));
function hatInhalt(w, berichtTyp) {
  if (!w) return false;
  if (w.Status && w.Status !== 'offen') return true;
  const woechentlich = berichtTyp === 'wöchentlich';
  return (woechentlich && wochenText(w))
    || (w.tage || []).some((t) => tagAbweichung(t) || (!woechentlich && tagText(t)));
}

const WOCHE_SPALTEN = `w.Id, w.AzubiOid, w.KW, w.Jahr, w.Status, w.BetriebEintrag, w.SchuleEintrag, w.UnterweisungEintrag,
  (SELECT t.Datum, t.Anwesenheit, t.Tagdauer, t.Eintrag, t.BetriebEintrag, t.SchuleEintrag, t.UnterweisungEintrag
     FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson`;
const parseWoche = (r) => ({ ...r, tage: r.tageJson ? JSON.parse(r.tageJson) : [] });

async function faelleKeineEintraege(pool, heute) {
  const wochen = pruefWochen(heute);
  const aelteste = wochen[wochen.length - 1];
  const azubis = (await pool.request()
    .input('beginn', sql.Date, ymd(aelteste.montag))
    .input('heute', sql.Date, ymd(heute))
    .query(`SELECT Oid, Name, BerichtTyp FROM dbo.Users
            WHERE Aktiv = 1 AND Email IS NOT NULL AND Role <> 'dhstudent'
              AND (Role = 'azubi' OR IstAzubi = 1)
              AND (AusbildungBeginn IS NULL OR AusbildungBeginn <= @beginn)
              AND (AusbildungEnde IS NULL OR AusbildungEnde >= @heute)`)).recordset;
  if (!azubis.length) return [];

  const req = pool.request();
  const bed = wochen.map((w, i) => {
    req.input(`k${i}`, sql.TinyInt, w.kw).input(`j${i}`, sql.SmallInt, w.jahr);
    return `(w.KW = @k${i} AND w.Jahr = @j${i})`;
  }).join(' OR ');
  const imFenster = (await req.query(`SELECT ${WOCHE_SPALTEN} FROM dbo.Wochen w WHERE ${bed}`)).recordset.map(parseWoche);

  const faelle = [];
  for (const a of azubis) {
    if (imFenster.some((w) => w.AzubiOid === a.Oid && hatInhalt(w, a.BerichtTyp))) continue;
    // Nur für die (wenigen) Inaktiven: letzte Woche mit Inhalt vor dem Fenster.
    // Sie macht den Schlüssel — neue Aktivität = neue Erinnerung möglich.
    const aeltere = (await pool.request()
      .input('o', sql.NVarChar(36), a.Oid)
      .input('k', sql.TinyInt, aelteste.kw).input('j', sql.SmallInt, aelteste.jahr)
      .query(`SELECT ${WOCHE_SPALTEN} FROM dbo.Wochen w
              WHERE w.AzubiOid = @o AND (w.Jahr < @j OR (w.Jahr = @j AND w.KW < @k))
              ORDER BY w.Jahr DESC, w.KW DESC`)).recordset.map(parseWoche);
    const letzte = aeltere.find((w) => hatInhalt(w, a.BerichtTyp));
    if (!letzte) continue;   // noch nie etwas eingetragen → keine Erinnerung
    const letzterEintrag = `KW ${letzte.KW}/${letzte.Jahr}`;
    faelle.push({
      anlass: 'keine_eintraege',
      schluessel: `keine_eintraege:${a.Oid}:${letzte.Jahr}-${letzte.KW}`,
      beschreibung: `${anzeigeName(a.Name)} (letzter Eintrag ${letzterEintrag})`,
      senden: () => mailKeineEintraege(pool, a.Oid, letzterEintrag),
    });
  }
  return faelle;
}

async function faelleBeurteilungOffen(pool, heute) {
  const grenze = new Date(heute.getTime() - 14 * TAG);
  const rows = (await pool.request().input('grenze', sql.Date, ymd(grenze)).query(`
    SELECT z.Id, z.AzubiOid, z.Abteilung, z.Von, z.Bis, v.Oid AS VerantwOid, v.Name AS VerantwName, a.Name AS AzubiName
    FROM dbo.Zuweisungen z
    JOIN dbo.Users v ON LOWER(v.Email) = LOWER(z.VerantwEmail) AND v.Aktiv = 1
    JOIN dbo.Users a ON a.Oid = z.AzubiOid AND a.Aktiv = 1
    WHERE z.Bis IS NOT NULL AND z.Bis <= @grenze
      AND NOT EXISTS (SELECT 1 FROM dbo.Beurteilungen b WHERE b.ZuweisungId = z.Id AND b.Status = 'abgeschlossen')`)).recordset;
  return rows.map((z) => {
    const typ = ermittleTyp(z.Von, z.Bis);
    return {
      anlass: 'beurteilung_offen',
      schluessel: `beurteilung_offen:${z.Id}:${typ}`,
      beschreibung: `${anzeigeName(z.VerantwName)} → ${typ === 'kurz' ? 'Feedback' : 'Beurteilung'} ${anzeigeName(z.AzubiName)}, ${z.Abteilung || '—'}, Ende ${ymd(new Date(z.Bis))}`,
      senden: () => mailBeurteilungOffen(pool, z.VerantwOid, {
        zuweisungId: z.Id, azubiOid: z.AzubiOid, abteilung: z.Abteilung, von: z.Von, bis: z.Bis, typ,
      }),
    };
  });
}

async function eintragen(pool, anlass, schluessel, art) {
  try {
    await pool.request()
      .input('a', sql.NVarChar(40), anlass).input('s', sql.NVarChar(200), schluessel).input('art', sql.NVarChar(10), art)
      .query('INSERT INTO dbo.MailVersand (Anlass, Schluessel, Art) VALUES (@a, @s, @art)');
    return true;
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return false;   // schon erledigt
    throw err;
  }
}
const austragen = (pool, schluessel) => pool.request()
  .input('s', sql.NVarChar(200), schluessel).query('DELETE FROM dbo.MailVersand WHERE Schluessel = @s');

/* art: 'senden' | 'probelauf' | 'stichtag'. Liefert einen Bericht, wirft nur
   bei DB-Fehlern (der Aufrufer in server.js loggt das). */
async function runErinnerungen({ art = 'senden', pool, jetzt = new Date() } = {}) {
  pool = pool || await getPool();
  const cfg = mailConfig();
  const heute = heuteUtc(jetzt);
  const faelle = [...await faelleKeineEintraege(pool, heute), ...await faelleBeurteilungOffen(pool, heute)];
  // Probelauf und Stichtag betreffen immer die ECHTEN Schlüssel; nur ein
  // Sende-Lauf im Testmodus führt eigene "test:"-Schlüssel.
  const praefix = art === 'senden' && cfg.modus === 'test' ? 'test:' : '';
  // ponytail: ganze Tabelle lesen statt IN-Liste (2100-Parameter-Grenze);
  // wenige hundert Zeilen pro Jahr. Bei Wachstum nach Anlass/Präfix filtern.
  const erledigt = new Set((await pool.request().query('SELECT Schluessel FROM dbo.MailVersand')).recordset.map((r) => r.Schluessel));
  const offen = faelle.filter((f) => !erledigt.has(praefix + f.schluessel));

  const bericht = {
    art, modus: cfg.modus, faelle: faelle.length, offen: offen.length,
    jeAnlass: offen.reduce((m, f) => ({ ...m, [f.anlass]: (m[f.anlass] || 0) + 1 }), {}),
    gesendet: 0, fehlgeschlagen: 0, markiert: 0, abgebrochen: false,
  };
  if (art === 'probelauf') return { ...bericht, liste: offen.map((f) => `${f.anlass}: ${f.beschreibung}`) };
  if (art === 'stichtag') {
    for (const f of offen) if (await eintragen(pool, f.anlass, f.schluessel, 'stichtag')) bericht.markiert++;
    return bericht;
  }
  if (!cfg.configured) return bericht;   // Versand aus: nichts beanspruchen, später normal nachholen
  if (offen.length > cfg.maxProLauf) {
    bericht.abgebrochen = true;
    logError({ quelle: 'backend', nachricht: `[mail-erinnerungen] ${offen.length} offene Fälle > MAIL_MAX_PRO_LAUF=${cfg.maxProLauf} — `
      + 'nichts gesendet. Prüfen mit "node services/mailErinnerungen.js", ggf. --stichtag.', kontext: bericht.jeAnlass });
    return bericht;
  }
  for (const f of offen) {
    if (!await eintragen(pool, f.anlass, praefix + f.schluessel, 'gesendet')) continue;
    if (await f.senden()) bericht.gesendet++;
    else { bericht.fehlgeschlagen++; await austragen(pool, praefix + f.schluessel); }
  }
  return bericht;
}

module.exports = { runErinnerungen, hatInhalt, isoWoche, pruefWochen, heuteUtc };

if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const art = process.argv.includes('--stichtag') ? 'stichtag' : process.argv.includes('--jetzt') ? 'senden' : 'probelauf';
  (async () => {
    const pool = await getPool();
    const b = await runErinnerungen({ art, pool });
    if (b.liste) b.liste.forEach((z) => console.log(`  ${z}`));
    const { liste, ...rest } = b;
    console.log(JSON.stringify(rest, null, 2));
    await pool.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
