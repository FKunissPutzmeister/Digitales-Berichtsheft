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
    zeilen: [['Abteilung', 'IT & Co'], null], button: { text: 'Durchlaufplan ansehen', url: 'https://x/app/a.html?x=1&y=2' },
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
  assert.equal(azubi.satz, 'deine nächste Abteilung steht fest.');
  assert.deepEqual(azubi.zeilen.find((z) => z && z[0] === 'Verantwortlich'), ['Verantwortlich', 'Florian Kern']);
  assert.equal(azubi.button.text, 'Durchlaufplan ansehen');
  assert.equal(azubi.subject, 'Abteilungsdurchlauf | Max Mustermann | IT');
  assert.doesNotMatch(JSON.stringify(azubi), /Einsatz/);
  assert.equal(V.textVersetzung({ ...basis, rolle: 'abteilung' }).satz, 'Ihre Abteilung bekommt einen Azubi.');
  assert.match(V.textVersetzung({ ...basis, rolle: 'planer' }).button.url, /abteilungs-planer\.html$/);
  assert.match(V.textVersetzung({ ...basis, typ: 'versetzung_entfernt', rolle: 'azubi' }).subject, /^Abgesagt: /);
});

test('Bericht zurückgegeben: Kommentar und Direktlink auf die Woche', () => {
  const t = V.textBerichtZurueck({ kw: 39, jahr: 2026, kommentar: 'Mittwoch fehlt', vonName: 'Kern, Florian', basisUrl: 'https://bh' });
  assert.equal(t.kommentar.von, 'Florian Kern');
  assert.equal(t.button.url, 'https://bh/app/wochenansicht.html?kw=39&jahr=2026');
});

test('Logos liegen im Repo und werden gelesen', () => {
  const bilder = V.mailBilder();
  assert.deepEqual(bilder.map((b) => b.cid), ['pm-logo', 'powered-by']);
  bilder.forEach((b) => assert.ok(b.inhalt.length > 1000));
});
