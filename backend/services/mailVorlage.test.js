'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('./mailVorlage');

test('Anrede: Azubi geduzt mit Vorname, alle anderen gesiezt mit vollem Namen', () => {
  assert.equal(V.anrede({ name: 'Mustermann, Max', istAzubi: true }), 'Hallo Max,');
  assert.equal(V.anrede({ name: 'Kern, Florian', istAzubi: false }), 'Guten Tag Florian Kern,');
});

test('renderMail: Logos per cid, Text escaped, Hinweis nur wenn gesetzt', () => {
  const html = V.renderMail({
    titel: 'Neue Abteilung', anredeText: 'Hallo Max,', satz: 'a <b>b</b>',
    info: { kreis: 'IT', titel: 'IT & Co', unter: '25.09.' }, button: { text: 'Durchlaufplan ansehen', url: 'https://x/app/a.html?x=1&y=2' },
  });
  assert.match(html, /src="cid:pm-logo"/);
  assert.match(html, /src="cid:powered-by"/);
  assert.match(html, /a &lt;b&gt;b&lt;\/b&gt;/);
  assert.match(html, /IT &amp; Co/);
  assert.match(html, /href="https:\/\/x\/app\/a\.html\?x=1&amp;y=2"/);
  assert.doesNotMatch(html, /Testmodus/);
  assert.match(V.renderMail({ titel: 't', anredeText: 'a', satz: 's', hinweis: 'Testmodus – eigentlich an: a@b' }), /Testmodus/);
});

test('Datum im deutschen Format, UTC-Kalendertag', () => {
  assert.equal(V.datum('2026-10-06'), '06.10.2026');
  assert.equal(V.datum(new Date(Date.UTC(2026, 9, 31))), '31.10.2026');
  assert.equal(V.datum(null), 'offen');
  assert.equal(V.zeitraum('2026-09-25', '2026-10-20'), '25.09. – 20.10.2026');
  assert.equal(V.zeitraum('2026-12-14', '2027-01-08'), '14.12.2026 – 08.01.2027');
  assert.equal(V.zeitraum('2026-12-14', null), '14.12.2026 – offen');
});

test('Abteilungsmail: Text je Rolle, Button „Durchlaufplan ansehen", Termintitel ohne „Einsatz"', () => {
  const basis = { typ: 'versetzung_neu', azubiName: 'Mustermann, Max', verantwName: 'Kern, Florian', abteilung: 'IT', von: '2026-10-06', bis: '2026-10-31', basisUrl: 'https://bh' };
  const azubi = V.textVersetzung({ ...basis, rolle: 'azubi' });
  assert.equal(azubi.satz, 'deine nächste Abteilung steht fest:');
  assert.deepEqual(azubi.info, { kreis: 'IT', titel: 'IT', unter: '06.10. – 31.10.2026 · bei Florian Kern' });
  assert.equal(azubi.button.text, 'Durchlaufplan ansehen');
  assert.equal(azubi.subject, 'Abteilungsdurchlauf | Max Mustermann | IT');
  assert.doesNotMatch(JSON.stringify(azubi), /Einsatz/);
  const abt = V.textVersetzung({ ...basis, rolle: 'abteilung' });
  assert.equal(abt.satz, 'Verstärkung für Ihr Team:');
  assert.deepEqual(abt.info, { kreis: 'MM', titel: 'Max Mustermann', unter: 'IT · 06.10. – 31.10.2026' });
  assert.match(V.textVersetzung({ ...basis, rolle: 'planer' }).button.url, /abteilungs-planer\.html$/);
  assert.match(V.textVersetzung({ ...basis, typ: 'versetzung_entfernt', rolle: 'azubi' }).subject, /^Abgesagt: /);
});

test('Kürzel für den Kreis', () => {
  assert.equal(V.kuerzel('Max Mustermann'), 'MM');
  assert.equal(V.kuerzel('IT'), 'IT');
  assert.equal(V.kuerzel('Konstruktion'), 'K');
  assert.equal(V.kuerzel('Einkauf & Logistik'), 'EL');
  assert.equal(V.kuerzel('Anna-Lena Özdemir'), 'AÖ');
  assert.equal(V.kuerzel(''), '');
});

// Grenzen des neuen Outlook (Testmails 28.09., siehe mailGrafik.js): sonst verwirft es Stile oder Formen.
test('Outlook-Grenzen: ≤ 16 Hintergrund-Ebenen je Stil, einheitliche Rundung, keine Bilder/calc im CSS', () => {
  const ebenen = (wert) => { let tiefe = 0, n = 1; for (const z of wert) { if (z === '(') tiefe++; else if (z === ')') tiefe--; else if (z === ',' && !tiefe) n++; } return n; };
  for (const anlass of ['termin', 'abgesagt', 'zurueck', 'erinnerung', 'offen', 'erledigt']) {
    const html = V.renderMail({ anlass, kategorie: 'k', titel: 't', anredeText: 'a', satz: 's', kommentar: { text: 'x', von: 'y' }, button: { text: 'b', url: 'https://x' } });
    const stile = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(stile.length > 20);
    for (const stil of stile) {
      const bild = /background-image:([^;]*)/.exec(stil);
      if (bild) assert.ok(ebenen(bild[1]) <= 16, `${anlass}: ${ebenen(bild[1])} Ebenen`);
      const rund = /border-radius:([^;]*)/.exec(stil);
      if (rund) assert.match(rund[1].trim(), /^\d+px$/, `${anlass}: border-radius ${rund[1]}`);
      assert.doesNotMatch(stil, /url\(|calc\(/, anlass);
      assert.ok(stil.length < 4000, `${anlass}: Stil ${stil.length} Zeichen`);
    }
  }
});

test('Bericht zurückgegeben: Kommentar und Direktlink auf die Woche', () => {
  const t = V.textBerichtZurueck({ kw: 39, jahr: 2026, kommentar: 'Mittwoch fehlt', vonName: 'Kern, Florian', basisUrl: 'https://bh' });
  assert.equal(t.kommentar.von, 'Florian Kern');
  assert.equal(t.button.url, 'https://bh/app/wochenansicht.html?kw=39&jahr=2026');
  // ohne Profilbild: Kürzel im Kreis; mit Profilbild: Inline-Bild autor-foto
  assert.match(V.renderMail({ ...t, anredeText: 'a' }), />FK<\/td>/);
  const mitFoto = V.textBerichtZurueck({ kw: 39, jahr: 2026, kommentar: 'x', vonName: 'Kern, Florian', vonFoto: { inhalt: Buffer.from('jpg'), typ: 'image/jpeg' }, basisUrl: 'https://bh' });
  assert.equal(mitFoto.kommentar.foto.cid, 'autor-foto');
  assert.equal(V.textBerichtZurueck({ kw: 39, jahr: 2026, kommentar: 'x', am: new Date('2026-09-29T08:27:00Z'), basisUrl: 'https://bh' }).kommentar.zeit, '29.09.2026');
  assert.match(V.renderMail({ ...mitFoto, anredeText: 'a' }), /src="cid:autor-foto"/);
});

test('Keine Einträge: Button öffnet die Woche des letzten Eintrags', () => {
  assert.equal(V.textKeineEintraege({ letzterEintrag: 'KW 35/2026', basisUrl: 'https://bh' }).button.url, 'https://bh/app/wochenansicht.html?kw=35&jahr=2026');
  assert.equal(V.textKeineEintraege({ letzterEintrag: '', basisUrl: 'https://bh' }).button.url, 'https://bh/app/wochenansicht.html');
});

test('Logos liegen im Repo und werden gelesen', () => {
  const bilder = V.mailBilder();
  assert.deepEqual(bilder.map((b) => b.cid), ['pm-logo', 'powered-by']);
  bilder.forEach((b) => assert.ok(b.inhalt.length > 1000));
});

// Neues Outlook färbt dunkle Schrift im Dunkelmodus hell → Beschriftung des gelben Buttons als Bild.
test('Button: Beschriftung als Bild, nur benutzte Bilder hängen an, unbekannter Text → dunkler Button', () => {
  const { KNOEPFE, knopfBild } = require('./mailKnoepfe');
  KNOEPFE.forEach((t) => assert.ok(knopfBild(t), `Bild fehlt: ${t}`));
  const html = V.renderMail({ titel: 't', anredeText: 'a', satz: 's', button: { text: 'Bericht öffnen', url: 'https://x' } });
  assert.match(html, /src="cid:knopf-bericht-oeffnen"/);
  assert.deepEqual(V.mailBilder(html).map((b) => b.cid), ['pm-logo', 'powered-by', 'knopf-bericht-oeffnen']);
  const fremd = V.renderMail({ titel: 't', anredeText: 'a', satz: 's', button: { text: 'Irgendwas', url: 'https://x' } });
  assert.doesNotMatch(fremd, /cid:knopf-/);
  assert.match(fremd, /Irgendwas&nbsp;&rarr;/);
});

test('Anlass je Mail: Szene als Code (keine Hintergrundbilder), Emblem, Rubrikfarbe', () => {
  const basis = { azubiName: 'Mustermann, Max', abteilung: 'IT', von: '2026-10-06', bis: '2026-10-31', basisUrl: 'https://bh' };
  assert.equal(V.textVersetzung({ ...basis, typ: 'versetzung_neu', rolle: 'azubi' }).anlass, 'termin');
  assert.equal(V.textVersetzung({ ...basis, typ: 'versetzung_entfernt', rolle: 'abteilung' }).anlass, 'abgesagt');
  assert.equal(V.textBerichtZurueck({ kw: 39, jahr: 2026, basisUrl: 'https://bh' }).anlass, 'zurueck');
  assert.equal(V.textKeineEintraege({ basisUrl: 'https://bh' }).anlass, 'erinnerung');
  assert.equal(V.textBeurteilungOffen({ ...basis, typ: 'gross' }).anlass, 'offen');
  assert.equal(V.textBeurteilungLiegtVor({ ...basis, typ: 'beurteilung_abgeschlossen', fuerAzubi: true }).anlass, 'erledigt');
  const mail = (anlass) => V.renderMail({ anlass, kategorie: 'Berichtsheft', titel: 't', anredeText: 'a', satz: 's' });
  const zurueck = mail('zurueck');
  // Das neue Outlook zeigt Hintergrundbilder nicht (cid:) bzw. nur kleine (data:) — nur Verläufe.
  assert.doesNotMatch(zurueck, /url\(/);
  assert.match(zurueck, /radial-gradient\(ellipse/);
  assert.match(zurueck, /color:#F5A04A">Berichtsheft</);
  assert.ok(zurueck.length < 60000);
  assert.match(mail('erledigt'), /&#10003;/); // Siegel mit Haken
  assert.match(mail('abgesagt'), /#86847D/); // graue Akzentlage statt Gelb
  assert.doesNotMatch(mail('abgesagt'), /#FFCF1A/);
  assert.equal(mail('gibtsnicht'), mail('termin'));
});
