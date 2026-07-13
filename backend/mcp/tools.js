'use strict';
/* MCP-Tools für das Digitale Berichtsheft.
   Jedes Tool bekommt den bereits aufgelösten `user` (buildReqUser, gleiche
   effektive Rolle/RBAC wie die App) und die validierten `args`. Zugriff wird
   über dieselben Service-Funktionen geprüft wie in den HTTP-Routen
   (services/zugriff, zugriffContext) – der MCP ist kein Bypass.

   Datensparsamkeit: Tools geben nur die fachlich nötigen Felder zurück
   (die Antwort fließt in ein Cloud-LLM). */
const { getPool, sql } = require('../db/connection');
const { listUsers, buildReqUser } = require('../services/users');

// listUsers() liefert rohe dbo.Users-Zeilen → auf die normalisierte App-Form
// (oid/name/istAzubi/istDhStudent/beruf …) bringen.
async function alleNutzer() { return (await listUsers({})).map(buildReqUser); }
const { darfWocheSehen } = require('../services/zugriff');
const { ladeKorrekturKontext } = require('../services/zugriffContext');

function toISO(d) {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// Montag der ISO-Kalenderwoche (für neu angelegte Wochen beim Schreiben).
function mondayOfISOWeek(week, year) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;           // 0 = Montag
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - dayOfWeek);
  const d = new Date(week1Monday);
  d.setDate(week1Monday.getDate() + (week - 1) * 7);
  return d;
}

class ToolError extends Error {}

function parseWoche(row) {
  return {
    ...row,
    tage:       row.tageJson       ? JSON.parse(row.tageJson)       : [],
    kommentare: row.kommentareJson ? JSON.parse(row.kommentareJson) : [],
    tageJson: undefined, kommentareJson: undefined,
  };
}
function normWoche(w) {
  return {
    azubiOid: w.AzubiOid, start: w.StartDatum, ende: w.EndDatum,
    korrigiertVon: w.KorrigiertVon,
    kommentarAutoren: (w.kommentare || []).map(k => k.UserOid),
  };
}

// Ziel-Azubi auflösen. Ohne Argument = eigener Kontext. Fremde nur für
// Planer/Ausbilder; die feinkörnige Sichtbarkeit erzwingt darfWocheSehen.
async function resolveAzubiOid(user, azubiArg) {
  if (!azubiArg) return user.oid;
  const canOther = user.kannPlanen || user.istAusbilder;
  if (!canOther) throw new ToolError('Kein Zugriff auf fremde Berichtshefte – nur das eigene Heft.');
  const all = await alleNutzer();
  const byOid = all.find(u => u.oid === azubiArg);
  if (byOid) return byOid.oid;
  const q = String(azubiArg).toLowerCase();
  const matches = all.filter(u => (u.name || '').toLowerCase().includes(q));
  if (matches.length === 1) return matches[0].oid;
  if (matches.length === 0) throw new ToolError(`Keine Person gefunden für "${azubiArg}".`);
  throw new ToolError(`Mehrdeutig – ${matches.length} Treffer: ${matches.slice(0, 8).map(m => m.name).join(', ')}. Bitte genauer angeben.`);
}

async function ladeWochen(user, azubiOid) {
  const pool = await getPool();
  const rows = (await pool.request()
    .input('azubiOid', sql.NVarChar(36), azubiOid)
    .query(`
      SELECT w.*,
        (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
        (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
      FROM dbo.Wochen w WHERE w.AzubiOid = @azubiOid
      ORDER BY w.Jahr DESC, w.KW DESC`)).recordset.map(parseWoche);
  const kontext = await ladeKorrekturKontext(pool, user);
  return rows.filter(w => darfWocheSehen(user, normWoche(w), kontext));
}

// ─────────────────────────── Tools ───────────────────────────
const TOOLS = [
  {
    name: 'wochen_liste',
    description: 'Listet die Wochen(-berichte) eines Azubis mit Kalenderwoche, Jahr und Status. Ohne "azubi" das eigene Heft; Planer/Ausbilder können ein fremdes Heft per Name oder OID abfragen.',
    inputSchema: {
      type: 'object',
      properties: {
        jahr: { type: 'integer', description: 'Nur dieses Jahr (optional).' },
        status: { type: 'string', enum: ['offen', 'freigegeben', 'genehmigt', 'abgelehnt'], description: 'Nur dieser Status (optional).' },
        azubi: { type: 'string', description: 'Name oder OID des Azubis (nur für Planer/Ausbilder).' },
      },
    },
    async run(user, args) {
      const azubiOid = await resolveAzubiOid(user, args.azubi);
      let wochen = await ladeWochen(user, azubiOid);
      if (args.jahr) wochen = wochen.filter(w => w.Jahr === args.jahr);
      if (args.status) wochen = wochen.filter(w => w.Status === args.status);
      return wochen.map(w => ({ kw: w.KW, jahr: w.Jahr, status: w.Status, von: toISO(w.StartDatum), bis: toISO(w.EndDatum) }));
    },
  },
  {
    name: 'woche_lesen',
    description: 'Liest einen Wochenbericht vollständig (Texte für Betrieb/Schule/Unterweisung, Tageseinträge, Kommentare).',
    inputSchema: {
      type: 'object',
      required: ['kw', 'jahr'],
      properties: {
        kw: { type: 'integer', description: 'Kalenderwoche 1–53.' },
        jahr: { type: 'integer' },
        azubi: { type: 'string', description: 'Name oder OID (nur für Planer/Ausbilder).' },
      },
    },
    async run(user, args) {
      const azubiOid = await resolveAzubiOid(user, args.azubi);
      const w = (await ladeWochen(user, azubiOid)).find(x => x.KW === args.kw && x.Jahr === args.jahr);
      if (!w) throw new ToolError(`Keine sichtbare Woche KW ${args.kw}/${args.jahr}.`);
      return {
        kw: w.KW, jahr: w.Jahr, status: w.Status, typ: w.Typ,
        betrieb: w.BetriebEintrag || '', schule: w.SchuleEintrag || '', unterweisung: w.UnterweisungEintrag || '',
        tage: (w.tage || []).map(t => ({
          datum: toISO(t.Datum), anwesenheit: t.Anwesenheit || '', ort: t.Ort || '',
          betrieb: t.BetriebEintrag || '', schule: t.SchuleEintrag || '', unterweisung: t.UnterweisungEintrag || '',
        })),
        kommentare: (w.kommentare || []).map(k => ({ text: k.Text, typ: k.Typ })),
      };
    },
  },
  {
    name: 'woche_schreiben',
    description: 'Schreibt Text-Einträge in eine Woche des EIGENEN Berichtshefts (Betrieb/Schule/Unterweisung auf Wochenebene und/oder je Tag). Nur solange die Woche NICHT freigegeben/genehmigt ist. Setzt keinen Status (Freigeben passiert bewusst nur in der App). Nur angegebene Felder werden geändert.',
    inputSchema: {
      type: 'object',
      required: ['kw', 'jahr'],
      properties: {
        kw: { type: 'integer' }, jahr: { type: 'integer' },
        betrieb: { type: 'string', description: 'Wochentext Betrieb.' },
        schule: { type: 'string', description: 'Wochentext Schule.' },
        unterweisung: { type: 'string', description: 'Wochentext Unterweisung.' },
        tage: {
          type: 'array', description: 'Tageseinträge (upsert je Datum).',
          items: {
            type: 'object', required: ['datum'],
            properties: {
              datum: { type: 'string', description: 'YYYY-MM-DD.' },
              betrieb: { type: 'string' }, schule: { type: 'string' }, unterweisung: { type: 'string' },
              anwesenheit: { type: 'string' }, ort: { type: 'string' },
            },
          },
        },
      },
    },
    async run(user, args) {
      const azubiOid = user.oid;                          // ausschließlich eigenes Heft
      const pool = await getPool();
      const existing = (await pool.request()
        .input('a', sql.NVarChar(36), azubiOid).input('kw', sql.TinyInt, args.kw).input('j', sql.SmallInt, args.jahr)
        .query('SELECT * FROM dbo.Wochen WHERE AzubiOid=@a AND KW=@kw AND Jahr=@j')).recordset[0];
      if (existing && (existing.Status === 'freigegeben' || existing.Status === 'genehmigt')) {
        throw new ToolError(`Woche KW ${args.kw}/${args.jahr} ist ${existing.Status} und schreibgeschützt.`);
      }
      let wocheId = existing ? existing.Id : null;
      if (!wocheId) {
        const monday = mondayOfISOWeek(args.kw, args.jahr);
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        const ins = await pool.request()
          .input('a', sql.NVarChar(36), azubiOid).input('kw', sql.TinyInt, args.kw).input('j', sql.SmallInt, args.jahr)
          .input('start', sql.Date, toISO(monday)).input('end', sql.Date, toISO(sunday))
          .input('typ', sql.NVarChar(20), user.berichtTyp || null)
          .query(`INSERT INTO dbo.Wochen (AzubiOid, KW, Jahr, StartDatum, EndDatum, Status, Gesamtstunden, Typ)
                  OUTPUT inserted.Id VALUES (@a,@kw,@j,@start,@end,'offen',0,@typ)`);
        wocheId = ins.recordset[0].Id;
      }
      // Wochentexte (nur angegebene Felder)
      const sets = [], rq = pool.request().input('id', sql.Int, wocheId);
      if (args.betrieb != null)      { sets.push('BetriebEintrag=@b');      rq.input('b', sql.NVarChar(sql.MAX), args.betrieb); }
      if (args.schule != null)       { sets.push('SchuleEintrag=@s');       rq.input('s', sql.NVarChar(sql.MAX), args.schule); }
      if (args.unterweisung != null) { sets.push('UnterweisungEintrag=@u'); rq.input('u', sql.NVarChar(sql.MAX), args.unterweisung); }
      if (sets.length) await rq.query(`UPDATE dbo.Wochen SET ${sets.join(', ')} WHERE Id=@id`);
      // Tage (upsert je Datum – vorhandene bleiben, nur angegebene werden gesetzt)
      let tageGeschrieben = 0;
      for (const t of (args.tage || [])) {
        if (!t.datum) continue;
        await pool.request()
          .input('wid', sql.Int, wocheId).input('d', sql.Date, t.datum)
          .input('anw', sql.NVarChar(30), t.anwesenheit ?? null).input('ort', sql.NVarChar(30), t.ort ?? null)
          .input('b', sql.NVarChar(sql.MAX), t.betrieb ?? null)
          .input('s', sql.NVarChar(sql.MAX), t.schule ?? null)
          .input('u', sql.NVarChar(sql.MAX), t.unterweisung ?? null)
          .query(`
            MERGE dbo.Tage AS tgt
            USING (SELECT @wid AS WocheId, @d AS Datum) AS src
              ON tgt.WocheId=src.WocheId AND tgt.Datum=src.Datum
            WHEN MATCHED THEN UPDATE SET
              Anwesenheit=COALESCE(@anw,Anwesenheit), Ort=COALESCE(@ort,Ort),
              BetriebEintrag=COALESCE(@b,BetriebEintrag), SchuleEintrag=COALESCE(@s,SchuleEintrag),
              UnterweisungEintrag=COALESCE(@u,UnterweisungEintrag)
            WHEN NOT MATCHED THEN
              INSERT (WocheId, Datum, Anwesenheit, Ort, Tagdauer, BetriebEintrag, SchuleEintrag, UnterweisungEintrag)
              VALUES (@wid, @d, @anw, @ort, 'ganztag', @b, @s, @u);`);
        tageGeschrieben++;
      }
      return { ok: true, kw: args.kw, jahr: args.jahr, wocheId, tageGeschrieben,
               hinweis: 'Gespeichert im Status „offen". Zum Einreichen die Woche in der App freigeben.' };
    },
  },
  {
    name: 'durchlauf_lesen',
    description: 'Liest den Abteilungsdurchlauf (Rotations-Stationen) eines Azubis: Abteilung, Zeitraum, Verantwortliche/r. Ohne "azubi" der eigene Durchlauf.',
    inputSchema: {
      type: 'object',
      properties: { azubi: { type: 'string', description: 'Name oder OID (nur für Planer/Ausbilder).' } },
    },
    async run(user, args) {
      // Gleiches Gate wie GET /api/zuweisungen: eigener Kontext immer; fremde
      // nur Planer/Ausbilder. Wir lesen direkt und begrenzen auf den Ziel-Azubi.
      const azubiOid = await resolveAzubiOid(user, args.azubi);
      const pool = await getPool();
      const rows = (await pool.request().input('a', sql.NVarChar(36), azubiOid)
        .query(`SELECT z.*, u.Name AS AzubiName FROM dbo.Zuweisungen z
                LEFT JOIN dbo.Users u ON u.Oid=z.AzubiOid
                WHERE z.AzubiOid=@a ORDER BY z.Von`)).recordset;
      return rows.map(z => ({
        abteilung: z.Abteilung || '', von: toISO(z.Von), bis: z.Bis ? toISO(z.Bis) : 'offen',
        verantwortlich: z.VerantwEmail || '',
      }));
    },
  },
  {
    name: 'azubis_suchen',
    description: 'Sucht Azubis/DH-Studenten nach Namen (für die "azubi"-Parameter der anderen Tools). Nur für Planer/Ausbilder.',
    inputSchema: {
      type: 'object', required: ['query'],
      properties: { query: { type: 'string', description: 'Namensteil.' } },
    },
    async run(user, args) {
      if (!(user.kannPlanen || user.istAusbilder)) throw new ToolError('Nur Planer/Ausbilder dürfen Azubis suchen.');
      const q = String(args.query || '').toLowerCase();
      const all = await alleNutzer();
      return all
        .filter(u => (u.istAzubi || u.istDhStudent) && (u.name || '').toLowerCase().includes(q))
        .slice(0, 20)
        .map(u => ({ oid: u.oid, name: u.name, beruf: u.beruf || '' }));
    },
  },
];

module.exports = { TOOLS, ToolError };
