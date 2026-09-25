# Design: E-Mail-Benachrichtigungen (2026-09-25)

## Context
Mail.Send ist seit 2026-09-25 freigeschaltet: Test mit Status 202, die Einladung kommt als echter Outlook-Termin an.
Mit Florian festgelegt: welche Mail wann an wen geht, als kurze HTML-Mail im Putzmeister-Look
(Banner-Logo oben, „Powered by Putzmeister IT“ unten). Repo: `C:\dev\digitales Berichtsheft\Digitales-Berichtsheft`,
Branch `Digitales-Berichtsheft`.

## Anlässe (entschieden)
| # | Anlass | An | Wann | Button |
|---|---|---|---|---|
| 1 | Abteilung neu / geändert / abgesagt | Pflicht: Azubi, Verantwortlicher, aktive Vertreter. Optional: die Person, die plant | sofort, **eine** Mail je Person, die zugleich Terminanfrage ist (nur mit Enddatum, sonst Mail ohne Termin) | Durchlaufplan ansehen |
| 2 | Keine Einträge | Azubi | Täglicher Job: die letzten 3 abgeschlossenen KW sind alle leer → **einmal**. Erneut erst, wenn danach wieder etwas eingetragen wurde | Berichtsheft öffnen |
| 3 | Beurteilung / Kurzfeedback fehlt | Verantwortlicher | Täglicher Job, **einmal**, ab `Bis + 14 Tage`. Die Mitteilung in der App bleibt wie heute sofort | Beurteilung schreiben |
| 4 | Beurteilung / Kurzfeedback liegt vor | Azubi (+ Ausbildungsleitung wie heute) | sofort | Beurteilung ansehen |
| 5 | Wochenbericht zurückgegeben | Azubi, mit Kommentar | sofort. Dazu die fehlende Mitteilung `abgelehnt` in der App ergänzen | Bericht öffnen |

Ohne Mail bleiben: Einreichung, Erst-/Endgenehmigung, Vertretung, Noten, Löschvorwarnung.

## Design und Ton
- Weiß, 3px gelbe Linie oben. `pm-logo-cd-grey.png` als Banner, bündig an der Oberkante, links; rechts klein „Digitales Berichtsheft“.
- Titel, dann Anrede als eigene Zeile, ein Satz, Details als Zeilen mit Trennlinie, gelber Button (#FFC300, dunkle Schrift).
- Fuß grau: „Automatisch versendet. Antworten werden nicht gelesen.“ und `powered-by-it.png` (aus `C:\dev\Vertragsmanagement\app\assets\logo\`, ins Repo kopieren).
- Kurz, ohne Bedienhinweise. „Abteilung“ statt „Einsatz“, auch im Betreff und im Termintitel (`Abteilungsdurchlauf | Max Mustermann | IT`).
- Azubis: „Hallo Vorname,“ (du). Alle anderen: „Guten Tag Vorname Nachname,“ (Sie).
- Sätze: Azubi, neue Abteilung: „deine nächste Abteilung steht fest.“ · Verantwortlicher: „Ihre Abteilung bekommt einen Azubi.“ · Keine Einträge: „seit drei Wochen ist dein Berichtsheft leer.“ · Beurteilung fehlt: „die Beurteilung für X ist noch offen.“ · liegt vor: „deine Beurteilung aus der IT ist da.“ · zurückgegeben: „dein Bericht für KW 39 braucht eine Korrektur.“ + Kommentar.

## Umsetzung
1. **Vorlage** `backend/services/mailVorlage.js` (neu): `renderMail({ titel, empfaenger, satz, zeilen, kommentar, button })`, dazu `anrede(user)`.
   Layout mit Tabellen und Inline-Styles (Outlook/Word-Engine), Button als Tabellenzelle mit Hintergrundfarbe, Bilder über `cid:pm-logo` und `cid:powered-by`.
   Bilder in doppelter Auflösung unter `backend/assets/mail/`. Die bisherige `huelle()` in `mail.js` fällt weg.
2. **MIME** `buildMime` in `backend/services/mail.js`: HTML und Bilder als `multipart/related`. Mit Termin: `multipart/alternative[ multipart/related[html, bilder], text/calendar ]`.
   **Risiko:** Bilder in einer Terminanfrage zuerst in Outlook Desktop, OWA und Mobile prüfen. Rückfallebene: Terminmails ohne Logos.
3. **ICS** `backend/services/ics.js` `buildEinsatzIcs`: Teilnehmer auch als `{ email, optional }`, optional wird zu `ROLE=OPT-PARTICIPANT`.
4. **Abteilungsmail** `mailVersetzung`: an jeden Empfänger einzeln senden (wegen du/Sie), immer mit derselben UID/SEQUENCE und der vollen Teilnehmerliste.
   Die planende Person (`req.user.oid` in `routes/zuweisungen.js`) kommt als optionaler Teilnehmer dazu und bekommt die Mail auch.
   Die In-App-Mitteilungen in `benachrichtige()` bleiben, wie sie sind.
   `ladeEmpfaenger` liefert zusätzlich, ob jemand Azubi ist. Dafür die Rollenlogik aus `services/users.js` wiederverwenden.
5. **Erinnerungen** `backend/services/mailErinnerungen.js` (neu), täglich um 07:00 per `setTimeout`, nach dem Muster in `backend/server.js` (Backup/Retention):
   - `pruefeKeineEintraege`: aktive Azubis, deren Ausbildung seit mindestens 3 Wochen läuft und deren letzte 3 abgeschlossene KW keinen Inhalt haben.
     Die Inhaltsregel ist heute nur im Frontend (`wocheHatInhalt` in `app/js/jahresansicht.js:40-65`) und muss 1:1 ins Backend.
     Die Wochenendtag- und Abwesenheitsregel gilt dabei mit.
   - `pruefeBeurteilungOffen`: Zuweisungen mit `Bis <= heute − 14` ohne abgeschlossene Beurteilung. Der Typ (Beurteilung oder Kurzfeedback) kommt über `ermittleTyp`.
   - Den Sofort-Mailversand in `ermittleUndErzeugeFaellige` (`services/beurteilungen.js:411`) entfernen. Die Mitteilung in der App bleibt.
6. **Sperre gegen Doppelmails:** Migration `db/migrations/048_mail_versand.sql` legt `dbo.MailVersand (Anlass, Schluessel UNIQUE, GesendetAm)` an.
   Vor dem Senden wird ein Eintrag geschrieben; scheitert er an UNIQUE, wird nicht gesendet.
   Schlüssel: `keine_eintraege:{oid}:{letzte KW mit Inhalt | nie}` (neue Aktivität ergibt einen neuen Schlüssel, also wieder genau eine Mail) und `beurteilung_offen:{zuweisungId}:{typ}`.
7. **Bericht zurückgegeben** in `routes/wochen.js` (Aktion `zurueckgeben`, ~Z. 331): eine Mitteilung `abgelehnt` schreiben und `mailBerichtZurueck` aufrufen. Der Kommentar ist der neueste Kommentar zur Woche.
8. Alle Mails laufen weiter nach dem Prinzip „best effort“: Sie werfen keinen Fehler, sondern landen über `logError` in `dbo.Fehlerberichte`.
   `MAIL_FROM` leer bleibt der Not-Aus. Danach `graphify update .`
9. Vor dem Umsetzen die Spec nach `docs/superpowers/specs/2026-09-25-email-benachrichtigungen-design.md` schreiben und committen.

## Test- und Einführungsverfahren (kein Mail-Schwall beim Scharfschalten)
Env `MAIL_MODUS` in `mailConfig()`. Die Weiche sitzt zentral in `sendeMail`, damit kein Anlass an ihr vorbei senden kann:
- `aus`: nichts wird gesendet. Das ist der Standard und gilt auch, solange `MAIL_FROM` leer ist.
- `test`: **jede** Mail geht nur an `MAIL_TEST_AN` (z. B. florian.kern@…). Im Betreff steht vorn `[TEST → echte@adresse]`, der echte Empfänger zusätzlich im Fuß.
  Im ICS werden die Teilnehmer durch die Testadresse ersetzt, damit keine echte Terminanfrage rausgeht.
  In `dbo.MailVersand` wird im Testmodus nichts vermerkt, sonst wären die Fälle später im Live-Betrieb „schon erledigt“.
- `pilot`: echter Versand, aber nur an Adressen in `MAIL_NUR_AN` (Liste). Alle anderen werden verworfen und protokolliert.
- `live`: normaler Betrieb.

Schutz der Erinnerungsjobs (Anlässe 2 und 3):
- `node services/mailErinnerungen.js --probelauf`: zeigt, wer heute welche Mail bekäme, mit Anzahl je Anlass. Es wird nichts gesendet und nichts geschrieben.
  So sehen wir vor dem Scharfschalten, wie viele Mails es wären.
- `node services/mailErinnerungen.js --stichtag`: trägt alle Fälle, die **heute schon** zutreffen, als erledigt in `dbo.MailVersand` ein, ohne zu senden.
  Einmal direkt vor `live` ausführen, dann melden sich nur Fälle, die ab dann neu entstehen.
- Obergrenze `MAIL_MAX_PRO_LAUF` (Standard 30): Über der Grenze bricht der Lauf ab, sendet nichts und schreibt einen Fehlerbericht.

Ablauf:
1. `test` lokal: `--alle` schickt alle 5 Typen an Florian, Design in Outlook, OWA und iOS abnehmen.
2. `test` auf dem Server: eine Woche echte Vorgänge, alles landet bei Florian.
3. `--probelauf` ansehen.
4. `pilot` mit 2–3 Personen.
5. `--stichtag`, dann `live`.

## Prüfen
- `node --test backend/services/*.test.js`: Vorlage (Escaping, `cid:`, du/Sie), MIME-Struktur (related/alternative/calendar), ICS mit `OPT-PARTICIPANT`, Inhaltsregel Backend gegen die Fälle aus dem Frontend, Doppelsperre (zweiter Claim sendet nicht).
- Den Selbsttest erweitern: `node services/mail.js --alle florian.kern@putzmeister.com` schickt alle 5 Mailtypen mit Beispieldaten.
  Mit `MAIL_FROM=berichtsheft@putzmeister.com` in der Umgebung ausführen und in Outlook Desktop, OWA und iOS ansehen: Banner bündig, Logos ohne „Bilder herunterladen“, Terminanfrage mit Logos, Annehmen funktioniert, Absage entfernt den Termin.
- Die Jobs einmal von Hand gegen die Dev-DB laufen lassen, zweiter Lauf = keine Mail.
