'use strict';
/* E-Mail-Versand über Microsoft Graph (App-only) — dieselbe App-Registrierung
   wie der Entra-Sync (GRAPH_*), zusätzlich braucht sie die Anwendungsberechtigung
   Mail.Send und ein Absender-Postfach in MAIL_FROM.

   Zwei Regeln, die hier nicht verhandelbar sind:
   1) Best-effort — ein Fehler beim Versand darf den auslösenden Vorgang NIE
      brechen (wie die In-App-Benachrichtigungen). Deshalb wirft hier nichts.
   2) Ohne MAIL_FROM ist der Versand komplett aus (lokal/Dev, und als
      Not-Aus, wenn die Mails jemand stoppen muss).

   Selbsttest (auf dem Server, wo die .env liegt):
     node services/mail.js florian.kern@putzmeister.com
     node services/mail.js --termin florian.kern@putzmeister.com   (mit Termin) */

const { sql } = require('../db/connection');
const { getGraphToken } = require('./entraSync');
const { logError } = require('./fehlerberichte');
const { buildEinsatzIcs, einsatzUid, sequenceNow, anzeigeName } = require('./ics');

function mailConfig(env = process.env) {
  const from = String(env.MAIL_FROM || '').trim().toLowerCase();
  const cfg = {
    from,
    fromName: String(env.MAIL_FROM_NAME || 'Digitales Berichtsheft').trim(),
    tenantId: env.GRAPH_TENANT_ID,
    clientId: env.GRAPH_CLIENT_ID,
    clientSecret: env.GRAPH_CLIENT_SECRET,
  };
  cfg.configured = !!(cfg.from && cfg.tenantId && cfg.clientId && cfg.clientSecret);
  return cfg;
}

// Basis-URL der Anwendung für die Links in den Mails. Ohne APP_BASE_URL aus der
// SAML-Callback-URL abgeleitet, damit hier keine zweite Pflicht-Variable entsteht.
function appUrl(env = process.env) {
  const base = env.APP_BASE_URL
    || String(env.SAML_CALLBACK_URL || '').replace(/\/api\/.*$/, '')
    || 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

// RFC 2047 für Betreff/Absendername (Umlaute!).
// ponytail: kein Aufteilen langer Encoded-Words auf 75 Zeichen — Exchange
// akzeptiert die Langform. Falls je ein strenger Client mitliest: hier splitten.
function encodeHeader(s) {
  const t = String(s || '');
  return /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;
}

const b64Lines = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

function buildMime({ from, fromName, to, subject, html, ics, icsMethod = 'REQUEST' }) {
  const grenze = `bhs-${Date.now().toString(36)}`;
  const kopf = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];
  if (!ics) {
    return [...kopf, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lines(html)].join('\r\n');
  }
  // multipart/alternative mit text/calendar: so wird daraus in Outlook ein
  // echter Termin und nicht bloß ein .ics-Anhang.
  return [
    ...kopf,
    `Content-Type: multipart/alternative; boundary="${grenze}"`,
    '',
    `--${grenze}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(html),
    `--${grenze}`,
    `Content-Type: text/calendar; charset=UTF-8; method=${icsMethod}`,
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(ics),
    `--${grenze}--`,
    '',
  ].join('\r\n');
}

async function sendeMail({ to, subject, html, ics, icsMethod }) {
  const cfg = mailConfig();
  const empfaenger = [...new Set((to || []).filter(Boolean).map((e) => String(e).toLowerCase()))];
  if (!cfg.configured || !empfaenger.length) return false;
  try {
    const token = await getGraphToken(cfg);
    const mime = buildMime({ from: cfg.from, fromName: cfg.fromName, to: empfaenger, subject, html, ics, icsMethod });
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.from)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: Buffer.from(mime, 'utf8').toString('base64'),
    });
    if (r.status !== 202) {
      const text = await r.text().catch(() => '');
      // Häufigster Fall hier: 403 ErrorAccessDenied — Mail.Send fehlt oder die
      // ApplicationAccessPolicy schließt dieses Postfach aus.
      logError({ quelle: 'backend', nachricht: `[mail] sendMail HTTP ${r.status}: ${text.slice(0, 500)}` });
      return false;
    }
    return true;
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] sendMail: ${err.message}`, stack: err.stack });
    return false;
  }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dt = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : 'offen');

function huelle(titel, zeilen, link) {
  const liste = zeilen.filter(Boolean)
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td style="padding:2px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join('');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">
<p style="font-size:16px;margin:0 0 12px"><strong>${esc(titel)}</strong></p>
<table style="border-collapse:collapse;margin:0 0 16px">${liste}</table>
${link ? `<p style="margin:0 0 16px"><a href="${link}">Im Berichtsheft öffnen</a></p>` : ''}
<p style="color:#888;font-size:12px;margin:0">Automatisch erzeugt vom Digitalen Berichtsheft. Antworten an diese Adresse werden nicht gelesen.</p>
</div>`;
}

// Empfänger (Oid → E-Mail/Name), nur aktive Nutzer.
async function ladeEmpfaenger(pool, oids) {
  const ids = [...new Set((oids || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const req = pool.request();
  const params = ids.map((o, i) => { req.input(`o${i}`, sql.NVarChar(36), o); return `@o${i}`; });
  const r = await req.query(`SELECT Oid, Name, Email FROM dbo.Users WHERE Oid IN (${params.join(',')}) AND Aktiv = 1`);
  return new Map(r.recordset.map((u) => [u.Oid, { name: u.Name, email: u.Email }]));
}

const VERSETZUNG = {
  versetzung_neu:       { praefix: '',                method: 'REQUEST', titel: 'Neue Abteilung geplant' },
  versetzung_geaendert: { praefix: 'Aktualisiert: ',  method: 'REQUEST', titel: 'Einsatz geändert' },
  versetzung_entfernt:  { praefix: 'Abgesagt: ',      method: 'CANCEL',  titel: 'Einsatz entfernt' },
};

/* Mail zu einer Zuweisung an die schon ermittelten Empfänger-Oids (dieselbe
   Menge wie die In-App-Mitteilung, inkl. Vertreter, ohne den Auslöser).
   ctx: { zuweisungId, azubiOid, abteilung, von, bis } */
async function mailVersetzung(pool, oids, typ, ctx) {
  const cfg = mailConfig();
  if (!cfg.configured) return false;
  const art = VERSETZUNG[typ];
  if (!art) return false;
  try {
    const users = await ladeEmpfaenger(pool, [...(oids || []), ctx.azubiOid]);
    const to = (oids || []).map((o) => users.get(o) && users.get(o).email).filter(Boolean);
    if (!to.length) return false;

    const azubi = anzeigeName(users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).name : '') || 'Azubi';
    const summary = ['Azubi Einsatz', azubi, ctx.abteilung].filter(Boolean).join(' | ');
    const html = huelle(art.titel, [
      ['Azubi', azubi],
      ['Abteilung', ctx.abteilung || '—'],
      ['Zeitraum', `${dt(ctx.von)} – ${dt(ctx.bis)}`],
    ], `${appUrl()}/app/abteilungsdurchlauf.html`);

    // Termin nur mit festem Ende — ein offener Einsatz hat kein DTEND.
    const ics = (ctx.von && ctx.bis)
      ? buildEinsatzIcs({
        uid: einsatzUid(ctx.zuweisungId), sequence: sequenceNow(), method: art.method,
        summary, beschreibung: `Zeitraum ${dt(ctx.von)} – ${dt(ctx.bis)}`,
        von: ctx.von, bis: ctx.bis,
        organizer: { name: cfg.fromName, email: cfg.from }, attendees: to,
      })
      : null;
    return await sendeMail({ to, subject: `${art.praefix}${summary}`, html, ics, icsMethod: art.method });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailVersetzung ${typ}: ${err.message}`, stack: err.stack });
    return false;
  }
}

/* Beurteilungs-Reminder. typ: 'beurteilung_abgeschlossen' (an den Azubi) oder
   'beurteilung_faellig' (an die beurteilende Person).
   ctx: { zuweisungId, azubiOid?, abteilung?, von?, bis? } */
async function mailBeurteilung(pool, oids, typ, ctx = {}) {
  if (!mailConfig().configured) return false;
  const faellig = typ === 'beurteilung_faellig';
  try {
    const users = await ladeEmpfaenger(pool, [...(oids || []), ctx.azubiOid]);
    const to = (oids || []).map((o) => users.get(o) && users.get(o).email).filter(Boolean);
    if (!to.length) return false;
    const azubi = anzeigeName(users.get(ctx.azubiOid) ? users.get(ctx.azubiOid).name : '');
    const titel = faellig ? 'Beurteilung fällig' : 'Neue Beurteilung liegt vor';
    const html = huelle(titel, [
      azubi ? ['Azubi', azubi] : null,
      ctx.abteilung ? ['Abteilung', ctx.abteilung] : null,
      (ctx.von || ctx.bis) ? ['Einsatz', `${dt(ctx.von)} – ${dt(ctx.bis)}`] : null,
    ], `${appUrl()}/app/beurteilung.html?zuw=${encodeURIComponent(ctx.zuweisungId || '')}`);
    return await sendeMail({ to, subject: azubi ? `${titel}: ${azubi}` : titel, html });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[mail] mailBeurteilung ${typ}: ${err.message}`, stack: err.stack });
    return false;
  }
}

module.exports = { mailConfig, appUrl, encodeHeader, buildMime, sendeMail, mailVersetzung, mailBeurteilung };

// Selbsttest: prüft Token, Mail.Send und (mit --termin) die Termin-Einladung.
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const args = process.argv.slice(2);
  const mitTermin = args.includes('--termin');
  const to = args.filter((a) => a.includes('@'));
  const cfg = mailConfig();
  if (!to.length) {
    console.error('Aufruf: node services/mail.js [--termin] empfaenger@putzmeister.com');
    process.exit(1);
  }
  if (!cfg.configured) {
    console.error(`Versand nicht konfiguriert. MAIL_FROM=${cfg.from || '(leer)'} GRAPH_CLIENT_ID=${cfg.clientId ? 'gesetzt' : '(leer)'}`);
    process.exit(1);
  }
  const heute = new Date().toISOString().slice(0, 10);
  const bis = new Date(Date.now() + 13 * 864e5).toISOString().slice(0, 10);
  const ics = mitTermin ? buildEinsatzIcs({
    uid: einsatzUid(`test-${Date.now()}`), sequence: 0, summary: 'Azubi Einsatz | Test Testperson | IT',
    von: heute, bis, organizer: { name: cfg.fromName, email: cfg.from }, attendees: to,
  }) : null;
  sendeMail({
    to, subject: `Testmail Digitales Berichtsheft${mitTermin ? ' (mit Termin)' : ''}`,
    html: huelle('Testmail', [['Absender', cfg.from], ['Termin angehängt', mitTermin ? 'ja' : 'nein']], appUrl()),
    ics, icsMethod: 'REQUEST',
  }).then((ok) => {
    console.log(ok ? `Gesendet an ${to.join(', ')}` : 'Fehlgeschlagen — Details in dbo.Fehlerberichte bzw. im Server-Log.');
    process.exit(ok ? 0 : 1);
  });
}
