'use strict';
/* E-Mail-Versand über Microsoft Graph (App-only) — eigene App-Registrierung in
   MAIL_TENANT_ID/MAIL_CLIENT_ID/MAIL_CLIENT_SECRET, ersatzweise die des
   Entra-Syncs (GRAPH_*). Sie braucht die Anwendungsberechtigung Mail.Send
   (mit Admin-Consent) und ein Absender-Postfach in MAIL_FROM.

   Drei Regeln, die hier nicht verhandelbar sind:
   1) Best-effort — ein Fehler beim Versand darf den auslösenden Vorgang NIE
      brechen (wie die In-App-Benachrichtigungen). Deshalb wirft hier nichts.
   2) Ohne MAIL_FROM ist der Versand komplett aus (Not-Aus).
   3) MAIL_MODUS entscheidet an EINER Stelle (zustellung/sendeMail), wer eine
      Mail wirklich bekommt — kein Anlass kann daran vorbei senden:
        aus   (Standard) nichts wird gesendet
        test  alles geht nur an MAIL_TEST_AN, Betreff "[TEST → echte Empfänger]",
              Termin-Teilnehmer durch die Testadresse ersetzt
        pilot echter Versand, aber nur an Adressen aus MAIL_NUR_AN
        live  normaler Betrieb
      Einführung: test → pilot → (mailErinnerungen --stichtag) → live.

   Selbsttest (auf dem Server, wo die .env liegt):
     node services/mail.js florian.kern@putzmeister.com
     node services/mail.js --termin florian.kern@putzmeister.com   (mit Termin)
     node services/mail.js --alle florian.kern@putzmeister.com     (alle Mailtypen) */

const { sql, getPool } = require('../db/connection');
const { getGraphToken } = require('./entraSync');
const { logError } = require('./fehlerberichte');
const { buildEinsatzIcs, einsatzUid, sequenceNow } = require('./ics');
const V = require('./mailVorlage');
const { getPhoto } = require('./userPhotos');

const MODI = ['aus', 'test', 'pilot', 'live'];
const liste = (s) => String(s || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

function mailConfig(env = process.env) {
  const from = String(env.MAIL_FROM || '').trim().toLowerCase();
  const modus = MODI.includes(String(env.MAIL_MODUS || '').trim().toLowerCase())
    ? String(env.MAIL_MODUS).trim().toLowerCase() : 'aus';
  const cfg = {
    from,
    fromName: String(env.MAIL_FROM_NAME || 'Digitales Berichtsheft').trim(),
    // Eigene App-Registrierung moeglich (hier: "Email Transmitting"), sonst die
    // des Entra-Syncs. Getrennt, damit ein Secret-Ablauf nicht beides killt.
    tenantId: env.MAIL_TENANT_ID || env.GRAPH_TENANT_ID,
    clientId: env.MAIL_CLIENT_ID || env.GRAPH_CLIENT_ID,
    clientSecret: env.MAIL_CLIENT_SECRET || env.GRAPH_CLIENT_SECRET,
    modus,
    testAn: String(env.MAIL_TEST_AN || '').trim().toLowerCase(),
    nurAn: new Set(liste(env.MAIL_NUR_AN)),
    maxProLauf: Number(env.MAIL_MAX_PRO_LAUF) > 0 ? Number(env.MAIL_MAX_PRO_LAUF) : 30,
  };
  cfg.configured = !!(cfg.from && cfg.tenantId && cfg.clientId && cfg.clientSecret)
    && modus !== 'aus' && (modus !== 'test' || !!cfg.testAn);
  return cfg;
}

/* Wer bekommt die Mail wirklich? Rein, damit die Weiche testbar ist.
   → null (nichts senden) oder { an, betreffPraefix, hinweis, teilnehmerErsatz } */
function zustellung(cfg, empfaenger) {
  const to = [...new Set((empfaenger || []).filter(Boolean).map((e) => String(e).toLowerCase()))];
  if (!cfg.configured || !to.length) return null;
  if (cfg.modus === 'test') {
    return {
      an: [cfg.testAn],
      betreffPraefix: `[TEST → ${to.join(', ')}] `,
      hinweis: `Testmodus – eigentlich an: ${to.join(', ')}`,
      teilnehmerErsatz: [cfg.testAn],
    };
  }
  if (cfg.modus === 'pilot') {
    const an = to.filter((e) => cfg.nurAn.has(e));
    const verworfen = to.filter((e) => !cfg.nurAn.has(e));
    if (verworfen.length) console.log(`[mail] pilot: nicht zugestellt an ${verworfen.join(', ')}`);
    return an.length ? { an, betreffPraefix: '', hinweis: '', teilnehmerErsatz: null } : null;
  }
  return { an: to, betreffPraefix: '', hinweis: '', teilnehmerErsatz: null };
}

// Basis-URL der Anwendung für die Links in den Mails. Ohne APP_BASE_URL aus der
// SAML-Callback-URL abgeleitet, damit hier keine zweite Pflicht-Variable entsteht.
// Eine abgeleitete localhost-Adresse taugt in einer Mail nicht (der Empfänger öffnet sie auf
// seinem Rechner) — dann, und ohne jede Angabe, zeigen die Links auf die echte Anwendung.
// Ausdrücklich gesetztes APP_BASE_URL gilt immer, auch localhost (lokaler Linktest).
const APP_PROD_URL = 'https://berichtsheft.jumbo.net';
function appUrl(env = process.env) {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/+$/, '');
  const base = String(env.SAML_CALLBACK_URL || '').replace(/\/api\/.*$/, '').replace(/\/+$/, '');
  return !base || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base) ? APP_PROD_URL : base;
}

// RFC 2047 für Betreff/Absendername (Umlaute!).
// ponytail: kein Aufteilen langer Encoded-Words auf 75 Zeichen — Exchange
// akzeptiert die Langform. Falls je ein strenger Client mitliest: hier splitten.
function encodeHeader(s) {
  const t = String(s || '');
  return /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;
}

const b64Lines = (buf) => Buffer.from(buf).toString('base64').replace(/(.{76})/g, '$1\r\n');

/* Aufbau:
     ohne Termin: multipart/related [ html, bilder ]
     mit Termin:  multipart/alternative [ multipart/related [ html, bilder ], text/calendar ]
   So wird die Mail in Outlook zur echten Terminanfrage (nicht bloß .ics-Anhang)
   und trägt trotzdem die eingebetteten Logos. Ohne bilder: nacktes text/html. */
function buildMime({ from, fromName, to, subject, html, ics, icsMethod = 'REQUEST', bilder = [] }) {
  const stamm = `bhs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const kopf = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];
  const htmlTeil = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lines(Buffer.from(html, 'utf8'))];
  const inhalt = bilder.length
    ? [
      `Content-Type: multipart/related; type="text/html"; boundary="${stamm}-r"`,
      '',
      `--${stamm}-r`, ...htmlTeil,
      ...bilder.flatMap((b) => [
        `--${stamm}-r`,
        `Content-Type: ${b.typ || 'image/png'}; name="${b.datei}"`,
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${b.cid}>`,
        `Content-Disposition: inline; filename="${b.datei}"`,
        '',
        b64Lines(b.inhalt),
      ]),
      `--${stamm}-r--`,
    ]
    : htmlTeil;
  if (!ics) return [...kopf, ...inhalt, ''].join('\r\n');
  return [
    ...kopf,
    `Content-Type: multipart/alternative; boundary="${stamm}-a"`,
    '',
    `--${stamm}-a`,
    ...inhalt,
    `--${stamm}-a`,
    `Content-Type: text/calendar; charset=UTF-8; method=${icsMethod}`,
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(Buffer.from(ics, 'utf8')),
    `--${stamm}-a--`,
    '',
  ].join('\r\n');
}

/* Eine Mail absenden. text = Ergebnis einer text*-Funktion aus mailVorlage,
   empf = { name, istAzubi } für die Anrede. termin (optional) = Argumente für
   buildEinsatzIcs ohne organizer — der Teilnehmer-Ersatz im Testmodus passiert
   hier, deshalb wird das ICS erst hier gebaut. */
async function sendeMail({ to, empf, text, termin }) {
  const cfg = mailConfig();
  const z = zustellung(cfg, to);
  if (!z) return false;
  const betreff = `${z.betreffPraefix}${text.subject}`;
  const protokoll = (erfolg, fehler) => protokolliere({
    an: z.an.join(', '), empfOid: empf && empf.oid, empfName: empf && empf.name, betreff, anlass: text.titel, modus: cfg.modus, erfolg, fehler,
  });
  try {
    const html = V.renderMail({ ...text, anredeText: V.anrede(empf || {}), hinweis: z.hinweis });
    const ics = termin ? buildEinsatzIcs({
      ...termin,
      attendees: z.teilnehmerErsatz || termin.attendees,
      organizer: { name: cfg.fromName, email: cfg.from },
    }) : null;
    const mime = buildMime({
      from: cfg.from, fromName: cfg.fromName, to: z.an, subject: betreff,
      html, ics, icsMethod: termin ? termin.method : undefined, bilder: [...V.mailBilder(html), ...(text.kommentar && text.kommentar.foto ? [text.kommentar.foto] : [])],
    });
    const token = await getGraphToken(cfg);
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.from)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: Buffer.from(mime, 'utf8').toString('base64'),
    });
    if (r.status !== 202) {
      const body = await r.text().catch(() => '');
      // Häufigster Fall hier: 403 ErrorAccessDenied — Mail.Send fehlt oder die
      // ApplicationAccessPolicy schließt dieses Postfach aus.
      logError({ quelle: 'backend', nachricht: `[mail] sendMail HTTP ${r.status}: ${body.slice(0, 500)}` });
      await protokoll(false, `HTTP ${r.status}: ${body.slice(0, 300)}`);
      return false;
    }
    await protokoll(true);
    return true;
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] sendMail: ${err.message}`, stack: err.stack });
    await protokoll(false, err.message);
    return false;
  }
}

/* Versandprotokoll für die Seite „E-Mails" (Migration 049). Best-effort: ohne
   Tabelle oder bei DB-Fehler bleibt der Versand unberührt. Einträge bleiben dauerhaft. */
async function protokolliere({ an, empfOid, empfName, betreff, anlass, modus, erfolg, fehler }) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('an', sql.NVarChar(500), String(an).slice(0, 500))
      .input('oid', sql.NVarChar(36), empfOid || null)
      .input('name', sql.NVarChar(200), empfName || null)
      .input('betreff', sql.NVarChar(400), String(betreff).slice(0, 400))
      .input('anlass', sql.NVarChar(100), anlass || null)
      .input('modus', sql.NVarChar(10), modus)
      .input('erfolg', sql.Bit, erfolg)
      .input('fehler', sql.NVarChar(500), fehler ? String(fehler).slice(0, 500) : null)
      .query(`INSERT INTO dbo.MailProtokoll (An, EmpfOid, EmpfName, Betreff, Anlass, Modus, Erfolg, Fehler)
              VALUES (@an, @oid, @name, @betreff, @anlass, @modus, @erfolg, @fehler)`);
  } catch (err) {
    console.error('[mail] Protokoll:', err.message);
  }
}

async function listeProtokoll(limit = 500) {
  const pool = await getPool();
  return (await pool.request().input('n', sql.Int, Math.min(Number(limit) || 500, 2000))
    .query('SELECT TOP (@n) * FROM dbo.MailProtokoll ORDER BY Zeitpunkt DESC, Id DESC')).recordset;
}

// Empfänger (Oid → Oid/Name/E-Mail/istAzubi/Beruf), nur aktive Nutzer.
async function ladeEmpfaenger(pool, oids) {
  const ids = [...new Set((oids || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const req = pool.request();
  const params = ids.map((o, i) => { req.input(`o${i}`, sql.NVarChar(36), o); return `@o${i}`; });
  const r = await req.query(`SELECT Oid, Name, Email, Role, IstAzubi, Beruf FROM dbo.Users
                             WHERE Oid IN (${params.join(',')}) AND Aktiv = 1`);
  // istAzubi wie buildReqUser (services/users.js): Basisrolle ODER Zusatz-Tag.
  return new Map(r.recordset.map((u) => [u.Oid, {
    oid: u.Oid, name: u.Name, email: u.Email, istAzubi: u.Role === 'azubi' || !!u.IstAzubi, beruf: u.Beruf,
  }]));
}

/* Abteilungs-Termin an alle Beteiligten — JEDE Person bekommt EINE eigene Mail
   (du/Sie), die zugleich die Terminanfrage ist. Alle Mails tragen dieselbe
   UID/SEQUENCE und die volle Teilnehmerliste, damit Outlook sie einem Termin
   zuordnet. oids = Empfänger der In-App-Mitteilung (Azubi, Verantwortliche,
   Vertreter, ohne Auslöser); die planende Person kommt optional dazu.
   ctx: { zuweisungId, azubiOid, verantwOid, planerOid, abteilung, von, bis } */
async function mailVersetzung(pool, oids, typ, ctx) {
  if (!mailConfig().configured || !V.VERSETZUNG[typ]) return false;
  try {
    const pflicht = [...new Set((oids || []).filter(Boolean))];
    const optional = ctx.planerOid && !pflicht.includes(ctx.planerOid) ? [ctx.planerOid] : [];
    const users = await ladeEmpfaenger(pool, [...pflicht, ...optional, ctx.azubiOid, ctx.verantwOid]);
    const mitMail = (o) => users.get(o) && users.get(o).email;
    const empfaenger = [...pflicht, ...optional].filter(mitMail);
    if (!empfaenger.length) return false;

    const azubiName = users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).name : '';
    const azubiBeruf = users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).beruf : '';
    const verantwName = users.get(ctx.verantwOid) ? users.get(ctx.verantwOid).name : '';
    const art = V.VERSETZUNG[typ];
    // Termin nur mit festem Ende — ein offener Zeitraum hat kein DTEND.
    const termin = (ctx.von && ctx.bis) ? {
      uid: einsatzUid(ctx.zuweisungId), sequence: sequenceNow(), method: art.method,
      summary: V.terminTitel(azubiName, ctx.abteilung, azubiBeruf), beschreibung: `Zeitraum ${V.zeitraum(ctx.von, ctx.bis)}`,
      von: ctx.von, bis: ctx.bis,
      attendees: [
        ...pflicht.filter(mitMail).map((o) => ({ email: users.get(o).email, optional: false })),
        ...optional.filter(mitMail).map((o) => ({ email: users.get(o).email, optional: true })),
      ],
    } : null;

    let ok = false;
    for (const oid of empfaenger) {
      const rolle = oid === ctx.azubiOid ? 'azubi' : (optional.includes(oid) ? 'planer' : 'abteilung');
      const text = V.textVersetzung({
        typ, rolle, azubiName, azubiBeruf, verantwName, abteilung: ctx.abteilung, von: ctx.von, bis: ctx.bis, basisUrl: appUrl(),
      });
      ok = (await sendeMail({ to: [users.get(oid).email], empf: users.get(oid), text, termin })) || ok;
    }
    return ok;
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailVersetzung ${typ}: ${err.message}`, stack: err.stack });
    return false;
  }
}

async function ladeZuweisungKurz(pool, zuweisungId) {
  if (!zuweisungId) return null;
  const r = await pool.request().input('id', sql.Int, zuweisungId)
    .query('SELECT Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE Id = @id');
  return r.recordset[0] || null;
}

/* „Beurteilung/Feedback liegt vor" an Azubi (+ Ausbildungsleitung).
   typ: 'beurteilung_abgeschlossen' | 'kurzfeedback_abgeschlossen'
   ctx: { zuweisungId, azubiOid } */
async function mailBeurteilung(pool, oids, typ, ctx = {}) {
  if (!mailConfig().configured) return false;
  try {
    const users = await ladeEmpfaenger(pool, [...(oids || []), ctx.azubiOid]);
    const z = await ladeZuweisungKurz(pool, ctx.zuweisungId);
    const azubiName = users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).name : '';
    let ok = false;
    for (const oid of [...new Set(oids || [])]) {
      const u = users.get(oid);
      if (!u || !u.email) continue;
      const text = V.textBeurteilungLiegtVor({
        typ, fuerAzubi: oid === ctx.azubiOid, azubiName,
        abteilung: z && z.Abteilung, von: z && z.Von, bis: z && z.Bis,
        zuweisungId: ctx.zuweisungId, basisUrl: appUrl(),
      });
      ok = (await sendeMail({ to: [u.email], empf: u, text })) || ok;
    }
    return ok;
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailBeurteilung ${typ}: ${err.message}`, stack: err.stack });
    return false;
  }
}

/* Erinnerung „Beurteilung/Feedback offen" (täglicher Job, services/mailErinnerungen.js).
   ctx: { zuweisungId, azubiOid, abteilung, von, bis, typ: 'gross'|'kurz' } */
async function mailBeurteilungOffen(pool, verantwOid, ctx) {
  if (!mailConfig().configured) return false;
  try {
    const users = await ladeEmpfaenger(pool, [verantwOid, ctx.azubiOid]);
    const u = users.get(verantwOid);
    if (!u || !u.email) return false;
    const text = V.textBeurteilungOffen({
      ...ctx, azubiName: users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).name : '', basisUrl: appUrl(),
    });
    return await sendeMail({ to: [u.email], empf: u, text });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailBeurteilungOffen: ${err.message}`, stack: err.stack });
    return false;
  }
}

// Erinnerung „Keine Einträge" an den Azubi (täglicher Job). letzterEintrag: z. B. "KW 35/2026".
async function mailKeineEintraege(pool, azubiOid, letzterEintrag) {
  if (!mailConfig().configured) return false;
  try {
    const u = (await ladeEmpfaenger(pool, [azubiOid])).get(azubiOid);
    if (!u || !u.email) return false;
    return await sendeMail({ to: [u.email], empf: u, text: V.textKeineEintraege({ letzterEintrag, basisUrl: appUrl() }) });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailKeineEintraege: ${err.message}`, stack: err.stack });
    return false;
  }
}

/* „Bericht zurückgegeben" an den Azubi — ausgelöst beim Speichern der
   Begründung (Kommentar Typ 'abgelehnt', routes/kommentare.js), weil erst
   dann der Text feststeht. */
// vonOid: für das Profilbild neben dem Namen (Entra-Sync, dbo.UserPhotos) — fehlt es, zeigt die Mail das Kürzel.
async function mailBerichtZurueck(pool, wocheId, kommentar, vonName, vonOid) {
  if (!mailConfig().configured) return false;
  try {
    const w = (await pool.request().input('id', sql.Int, wocheId)
      .query('SELECT AzubiOid, KW, Jahr FROM dbo.Wochen WHERE Id = @id')).recordset[0];
    if (!w) return false;
    const u = (await ladeEmpfaenger(pool, [w.AzubiOid])).get(w.AzubiOid);
    if (!u || !u.email) return false;
    const foto = vonOid ? await getPhoto(vonOid).catch(() => null) : null;
    const text = V.textBerichtZurueck({ kw: w.KW, jahr: w.Jahr, kommentar, vonName, vonFoto: foto && { inhalt: foto.Content, typ: foto.ContentType }, am: new Date(), basisUrl: appUrl() });
    return await sendeMail({ to: [u.email], empf: u, text });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailBerichtZurueck: ${err.message}`, stack: err.stack });
    return false;
  }
}

module.exports = {
  mailConfig, zustellung, appUrl, encodeHeader, buildMime, sendeMail, listeProtokoll,
  mailVersetzung, mailBeurteilung, mailBeurteilungOffen, mailKeineEintraege, mailBerichtZurueck,
};

// Selbsttest: prüft Token, Mail.Send, Vorlage und (mit --termin/--alle) die Termin-Einladung.
// Läuft ohne DB; der Modus kommt aus der .env (MAIL_MODUS=test schickt an MAIL_TEST_AN).
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const args = process.argv.slice(2);
  const to = args.filter((a) => a.includes('@'));
  const cfg = mailConfig();
  if (!to.length) {
    console.error('Aufruf: node services/mail.js [--termin|--alle] empfaenger@putzmeister.com');
    process.exit(1);
  }
  if (!cfg.configured) {
    console.error(`Versand nicht konfiguriert. MAIL_MODUS=${cfg.modus} MAIL_FROM=${cfg.from || '(leer)'} `
      + `MAIL_TEST_AN=${cfg.testAn || '(leer)'} CLIENT_ID=${cfg.clientId ? 'gesetzt' : '(leer)'}`);
    process.exit(1);
  }
  const heute = new Date().toISOString().slice(0, 10);
  const bis = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);
  const basisUrl = appUrl();
  const azubi = { name: 'Mustermann, Max', istAzubi: true, beruf: 'Fachinformatiker Systemintegration' };
  const ausbilder = { name: 'Kern, Florian', istAzubi: false };
  const termin = {
    uid: einsatzUid(`test-${Date.now()}`), sequence: 0, method: 'REQUEST',
    summary: V.terminTitel(azubi.name, 'IT', azubi.beruf), von: heute, bis,
    attendees: to.map((email) => ({ email, optional: false })),
  };
  const faelle = args.includes('--alle') ? [
    { empf: azubi, termin, text: V.textVersetzung({ typ: 'versetzung_neu', rolle: 'azubi', azubiName: azubi.name, azubiBeruf: azubi.beruf, verantwName: ausbilder.name, abteilung: 'IT', von: heute, bis, basisUrl }) },
    { empf: ausbilder, termin, text: V.textVersetzung({ typ: 'versetzung_neu', rolle: 'abteilung', azubiName: azubi.name, azubiBeruf: azubi.beruf, abteilung: 'IT', von: heute, bis, basisUrl }) },
    { empf: azubi, text: V.textKeineEintraege({ letzterEintrag: 'KW 35/2026', basisUrl }) },
    { empf: ausbilder, text: V.textBeurteilungOffen({ typ: 'gross', azubiName: azubi.name, abteilung: 'IT', von: heute, bis, zuweisungId: 0, basisUrl }) },
    { empf: azubi, text: V.textBeurteilungLiegtVor({ typ: 'beurteilung_abgeschlossen', fuerAzubi: true, azubiName: azubi.name, abteilung: 'IT', von: heute, bis, zuweisungId: 0, basisUrl }) },
    { empf: azubi, text: V.textBerichtZurueck({ kw: 39, jahr: 2026, kommentar: 'Bitte die Tätigkeiten am Mittwoch genauer beschreiben.', vonName: ausbilder.name, am: new Date(), basisUrl }) },
    // zuletzt: sagt den Testtermin von oben wieder ab (räumt den Kalender auf)
    { empf: ausbilder, termin: { ...termin, sequence: 1, method: 'CANCEL' }, text: V.textVersetzung({ typ: 'versetzung_entfernt', rolle: 'abteilung', azubiName: azubi.name, azubiBeruf: azubi.beruf, abteilung: 'IT', von: heute, bis, basisUrl }) },
  ] : [
    { empf: azubi, termin: args.includes('--termin') ? termin : null, text: V.textVersetzung({ typ: 'versetzung_neu', rolle: 'azubi', azubiName: azubi.name, azubiBeruf: azubi.beruf, verantwName: ausbilder.name, abteilung: 'IT', von: heute, bis, basisUrl }) },
  ];
  (async () => {
    let fehler = 0;
    for (const f of faelle) {
      const ok = await sendeMail({ to, ...f });
      console.log(`${ok ? 'Gesendet' : 'FEHLGESCHLAGEN'}: ${f.text.subject}`);
      if (!ok) fehler++;
    }
    console.log(`Modus ${cfg.modus}. ${fehler ? 'Details in dbo.Fehlerberichte bzw. im Server-Log.' : ''}`);
    process.exit(fehler ? 1 : 0);
  })();
}
