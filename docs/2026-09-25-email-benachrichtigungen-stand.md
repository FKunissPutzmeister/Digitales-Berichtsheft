# E-Mail-Benachrichtigungen – Stand 25.09.2026 (Übergabe)

Entscheidungen, Anlässe und Design stehen in der Spec:
[superpowers/specs/2026-09-25-email-benachrichtigungen-design.md](superpowers/specs/2026-09-25-email-benachrichtigungen-design.md).
Diese Datei hält nur fest, **wo die Umsetzung steht** und was als Nächstes kommt.

## Kurzstand

- Mail.Send ist von der Entra-Administration freigegeben. Graph liefert beim Versand aus `berichtsheft@putzmeister.com` Status 202, und die Terminanfrage kommt in Outlook als echter Termin an.
- Umgesetzt sind alle 5 Anlässe, die HTML-Vorlage (2. Designrunde), der Testmodus und die täglichen Erinnerungen.
- Lokal liegen 4 Commits auf `Digitales-Berichtsheft`, noch **nicht gepusht**: `3dc4f4d` Spec, `72cb3c4` Umsetzung, `7f29c14` neues Design, `30f8d5c` Begründungs-Box.
- Alle 344 Backend-Tests sind grün (`node --test services/*.test.js` in `backend/`).
- Die Migration `048_mail_versand.sql` ist **nur in der Dev-DB** gelaufen.
- Auf dem Server ist noch nichts aktiv: Dort ist `MAIL_FROM` leer und `MAIL_MODUS` nicht gesetzt, also gilt „aus“.

## Offen – hier weitermachen

1. **Darstellung in Outlook abnehmen (Florian).** Am 25.09. gingen 6 Beispielmails an florian.kern@ raus. Zu prüfen in Outlook Desktop, im Outlook im Browser und auf dem iPhone:
   - Bleibt der Button im Dunkelmodus gelb mit dunkler Schrift? Vorher wurde er braun mit weißer Schrift.
   - Sind die Logos in den beiden **Terminanfragen** zu sehen? Das ist das bekannte Risiko. Die Rückfallebene wären Terminmails ohne Logos, dafür in `mailVersetzung` `bilder` weglassen.
   - Die neue Box „Begründung“ (`30f8d5c`) ist in diesen 6 Mails **noch nicht** drin. Nachschicken mit dem Befehl `--alle` unten.
2. **Ende-zu-Ende in der App testen** (bisher nicht gemacht). Dev-Server mit `MAIL_MODUS=test` starten, dann
   - eine Zuweisung anlegen, ändern und löschen,
   - einen Bericht zurückweisen, einzeln und als Sammel-Zurückweisung im Dashboard,
   - eine Beurteilung abschließen.

   Erwartet: Jede Person bekommt **eine** Mail, zugleich die Terminanfrage. Im Testmodus landet alles bei `MAIL_TEST_AN`, im Betreff steht `[TEST → echte Adressen]`. Die planende Person steht im Termin als optionale Teilnehmerin.
3. **Push**, danach die Migration 048 auf dem Server ausführen.
4. **Einführung auf dem Server**, genau in dieser Reihenfolge:
   1. In `.env` eintragen: `MAIL_FROM=berichtsheft@putzmeister.com`, `MAIL_MODUS=test`, `MAIL_TEST_AN=florian.kern@putzmeister.com`. Eine Woche so laufen lassen.
   2. `node services/mailErinnerungen.js` ausführen (Probelauf) und ansehen, wer welche Mail bekäme.
   3. `MAIL_MODUS=pilot` mit `MAIL_NUR_AN=<2–3 Adressen>` setzen.
   4. **`node services/mailErinnerungen.js --stichtag`** ausführen und direkt danach `MAIL_MODUS=live` setzen.

   **Ohne Stichtag gehen am ersten Morgen sofort alle Altfälle raus.** Der Probelauf auf der Dev-DB hat am 25.09. **36 Fälle** gezeigt: 33 × keine Einträge, 3 × Beurteilung offen. Die Obergrenze `MAIL_MAX_PRO_LAUF=30` hätte den Lauf abgebrochen, der Stichtag verhindert die Mails ganz.

## Befehle

In `backend/` ausführen. Der Modus kommt aus der `.env` oder wird für einen Test vorher gesetzt, z. B. `$env:MAIL_MODUS='test'`:

```
node services/mail.js --alle florian.kern@putzmeister.com     # alle 6 Mailtypen mit Beispieldaten
node services/mail.js --termin florian.kern@putzmeister.com   # nur eine Terminanfrage
node services/mailErinnerungen.js                              # Probelauf (sendet/schreibt nichts)
node services/mailErinnerungen.js --stichtag                   # bestehende Fälle ohne Mail abhaken
node services/mailErinnerungen.js --jetzt                      # echten Erinnerungslauf sofort starten
node db/run-sql.js ../db/migrations/048_mail_versand.sql       # Migration
```

Die Vorlage lässt sich ohne Versand ansehen: `renderMail` aus `services/mailVorlage.js` rendern, die `cid:`-Verweise durch `data:`-URIs aus `mailBilder()` ersetzen und das Ergebnis mit Playwright screenshotten.

## Wo was liegt

| Datei | Inhalt |
|---|---|
| `backend/services/mail.js` | Konfiguration, **Modus-Weiche `zustellung()`** (einzige Stelle, die entscheidet, wer eine Mail bekommt), MIME, `sendeMail`, die Mail-Funktionen je Anlass, Selbsttest |
| `backend/services/mailVorlage.js` | HTML-Vorlage `renderMail`, Anrede (du/Sie), alle Texte je Anlass |
| `backend/services/mailErinnerungen.js` | Täglicher Job: Inhaltsregel (Kopie von `wocheHatInhalt` im Frontend), Fälle suchen, Sperre, Probelauf, Stichtag, Obergrenze |
| `backend/assets/mail/` | `pm-logo.png`, `powered-by.png`: weiße Varianten in doppelter Auflösung |
| `backend/services/ics.js` | Termin, jetzt mit optionalen Teilnehmern (`OPT-PARTICIPANT`) |
| `db/migrations/048_mail_versand.sql` | `dbo.MailVersand`, verhindert doppelte Erinnerungen |
| `backend/server.js` | Job täglich um 07:00, ohne Start-Lauf |
| `backend/routes/zuweisungen.js` | Abteilungsmail, wartet nicht auf den Versand, planende Person als `planerOid` |
| `backend/routes/kommentare.js` | Mail „Bericht zurückgegeben“ beim Speichern der Begründung (Typ `abgelehnt`) |
| `app/js/dashboard.js` | Sammel-Zurückweisung: erst der Status, dann die Begründung |
| `app/js/wochenansicht.js` | `?kw=&jahr=` für den Link in der Mail |

## Bekannte Grenzen (bewusst, nicht vergessen)

- **Verantwortlichen umhängen:** Die bisherige verantwortliche Person bekommt eine Aktualisierung statt einer Absage. Der Termin bleibt dann in ihrem Kalender stehen. Das war schon vorher so.
- **Beurteilung nach Abschluss korrigiert:** Dann geht die Mail „liegt vor“ erneut raus. Das war ebenfalls schon vorher so.
- **Erinnerung „keine Einträge“:** Sie geht auch an Azubis ohne `AusbildungBeginn`. DH-Studenten sind ausgenommen. Die Inhaltsregel im Backend muss mit dem Frontend (`app/js/jahresansicht.js`) gleich bleiben. Wer die eine ändert, muss die andere mitziehen.
- **Einträge in `dbo.MailVersand`:** Der Schlüssel enthält die Oid des Azubis. Der Löschjob (`retention.js`) räumt diese Einträge nicht mit auf. Das sind kleine Datenmengen, sollte aber bei Gelegenheit ergänzt werden.
- **Outlook Desktop (Word-Engine):** Farbverlauf und Rundungen fallen weg, das Layout bleibt. Das ist gewollt.
- **Im Testmodus** tragen die Erinnerungsjobs Schlüssel mit dem Präfix `test:` ein. Die echten Fälle bleiben dadurch offen.
