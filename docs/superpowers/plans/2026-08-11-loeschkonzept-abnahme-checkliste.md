# Löschkonzept — manuelle Abnahme

Diese Schritte verändern die Dev-Datenbank und löschen echte Zeilen. Sie sind
bewusst nicht automatisiert. Voraussetzung: Migrationen 030-032 sind gelaufen,
alle Unit-Tests grün, Server läuft über http://localhost:3000.

**Wichtig zu jedem „Lauf starten" unten:** Dies ist die geteilte Dev-Datenbank.
`ermittleKandidaten()` liefert ohne Einschränkung **jeden** fälligen Kandidaten
der ganzen Datenbank, aktuell auch die sechs echten inaktiven Konten. Der
Lauf-Helfer (siehe „Hilfsskript: Lauf starten" unten) schränkt deshalb bewusst
auf die E-Mail-Adresse des Testkontos ein — aber ein Tippfehler in dieser
Einschränkung würde beim echten (nicht-gesperrten) Lauf reale Konten
unwiderruflich löschen. Deshalb **unmittelbar vor jedem** „Lauf starten"
zusätzlich den Sicherheits-Check ausführen (Skript unten) und bestätigen, dass
in `aktuell faellig` außer dem/den eigenen Testkonto/-konten **nichts**
erscheint — insbesondere keines der sechs echten inaktiven Konten.

## A · Vollständiger Zyklus an einem Azubi-Testkonto

- [ ] Wegwerf-Konto anlegen (**keine** `.demo`-Adresse — sonst fasst der Job es nie an),
      Rolle `azubi` über die Nutzerverwaltung setzen.
- [ ] Mit dem Konto eine Woche anlegen und einreichen; als Prüfer kommentieren und
      genehmigen; eine Abteilungszuweisung anlegen; ein IHK-PDF importieren.
- [ ] Konto auf inaktiv setzen → die Tabellenzeile zeigt „Löschung am <heute + 365>".
- [ ] Stichtag vordatieren (Skript unten), Sperre auf ein Datum in der Zukunft setzen.
- [ ] **Sicherheits-Check** (Skript unten) — `aktuell faellig` darf nur dieses
      Testkonto enthalten, sonst abbrechen.
- [ ] Trockenlauf starten (Skript „Lauf starten (nur Testkonto)" unten, mit der
      E-Mail dieses Testkontos). Wegen der noch aktiven Sperre wird trotz des
      echten, nicht injizierten `loescheNutzer` niemand gelöscht.
      **Erwartet:** `gesperrt: 1`, `geloescht: 0`.
- [ ] Sperre leeren.
- [ ] **Sicherheits-Check** erneut ausführen — unverändert nur dieses Testkonto.
- [ ] Lauf erneut starten (gleiches Skript, gleiche E-Mail).
      **Erwartet:** `geloescht: 1`. Danach prüfen: `dbo.Users`-Zeile weg,
      Wochen/Tage/Kommentare/Beurteilungen/Zuweisungen weg,
      `backend/data/ihk-imports/<oid>/` weg.

## B · Der entscheidende Test: einen Prüfer löschen

Dieser Test belegt das gesamte Denormalisierungs-Konzept end-to-end. Er darf
bei der Abnahme nicht entfallen.

- [ ] Wegwerf-**Prüfer**-Konto anlegen (**keine** `.demo`-Adresse). Damit eine Woche
      eines **noch aktiven** Azubis kommentieren und genehmigen, und den Prüfer als
      Verantwortlichen einer Abteilungszuweisung dieses Azubis eintragen.
- [ ] Prüfer-Konto deaktivieren, Stichtag auf −366 Tage vordatieren.
- [ ] **Sicherheits-Check** (Skript unten) — `aktuell faellig` darf nur dieses
      Prüfer-Testkonto enthalten, sonst abbrechen.
- [ ] Lauf starten (Skript „Lauf starten (nur Testkonto)" unten, mit der E-Mail
      dieses Prüfer-Testkontos).
- [ ] Als der Azubi anmelden, die betroffene Woche öffnen (`Strg+F5`).

**Erwartet:**

- [ ] Status-Banner nennt weiterhin den Namen des gelöschten Prüfers — **nicht** den
      statisch zugeordneten Ausbilder, **nicht** „Ausbilder/in".
- [ ] Der Kommentar zeigt weiterhin seinen Namen, aber **kein** Avatar-Foto.
- [ ] Der Ansprechpartner der Abteilungszuweisung zeigt weiterhin seinen Namen.
- [ ] PDF-Export aus dem Profil des Azubis: die Gegenzeichnung nennt seinen Namen.
- [ ] In der Datenbank: `Wochen.KorrigiertVon IS NULL` bei gefülltem
      `KorrigiertVonName`; `Kommentare.UserOid IS NULL` bei gefülltem `AutorName`;
      `Zuweisungen.VerantwEmail = ''` bei gefülltem `VerantwName`.
- [ ] Die Mitteilung des Azubis „Woche genehmigt" ist **noch da**, mit
      `FromUserOid IS NULL`.

## Hilfsskript: Stichtag vordatieren

Als Datei ablegen und über das Bash-Werkzeug starten. `node -e` findet
`dotenv`/`mssql` hier nicht — im Repo-Root-`node_modules` liegt nur Playwright,
die Backend-Pakete stehen in `backend/node_modules`. Deshalb `NODE_PATH` setzen:

    const REPO = 'C:/Dev/Digitales-Berichtsheft';
    require('dotenv').config({ path: REPO + '/backend/.env' });
    const { getPool, sql } = require(REPO + '/backend/db/connection');
    const mail = process.argv[2];
    getPool().then(async (p) => {
      const r = await p.request()
        .input('e', sql.NVarChar(256), mail)
        .query(`UPDATE dbo.Users
                   SET InaktivSeit = DATEADD(DAY, -366, SYSUTCDATETIME())
                 WHERE Email = @e`);
      console.log('vordatiert, Zeilen:', r.rowsAffected[0]);
      await p.close();
    }).catch((e) => { console.error(e.message); process.exit(1); });

Aufruf:

    NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" \
      node <datei>.js "<mail-des-testkontos>"

Ohne dieses `NODE_PATH` bricht der Aufruf mit „Cannot find module 'dotenv'"
bzw. „'mssql'" ab.

## Hilfsskript: Sicherheits-Check (wer ist aktuell fällig?)

Dieser Aufruf entspricht Step 4 der Umsetzung — er ist rein lesend und
verändert nichts. Direkt vor jedem „Lauf starten" ausführen und die
Ausgabezeile `aktuell faellig` prüfen: sie darf **ausschließlich** die
E-Mail-Adresse(n) des/der aktuellen Testkontos/-konten enthalten. Diese
geteilte Dev-Datenbank hat aktuell sechs echte inaktive Konten — taucht eines
davon in dieser Liste auf, sofort abbrechen, statt den Lauf zu starten.

    const REPO = 'C:/Dev/Digitales-Berichtsheft';
    require('dotenv').config({ path: REPO + '/backend/.env' });
    const R = require(REPO + '/backend/services/retention');
    R.ermittleKandidaten().then((k) => {
      console.log('aktuell faellig:', k.filter((u) => R.istFaellig(u)).map((u) => u.email || u.oid));
      process.exit(0);
    }).catch((e) => { console.error(e.message); process.exit(1); });

Aufruf:

    NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" \
      node <datei>.js

## Hilfsskript: Lauf starten (nur Testkonto)

**Nicht** `runRetentionSerialisiert()` ohne Parameter aufrufen. Das ist der
produktive Einstiegspunkt (mit Lauf-Sperre gegen Überlappung mit dem
03:00-Timer) und verarbeitet über das eingebaute `ermittleKandidaten()`
**alle** Kandidaten der Datenbank — bei der Abnahme also auch die sechs
echten inaktiven Konten. Die Abnahme ruft deshalb bewusst `runRetention()`
direkt auf: nur diese Funktion nimmt injizierbare Abhängigkeiten an, mit denen
sich der Lauf auf das eine Testkonto einschränken lässt. Diese Einschränkung
absichtlich **nicht** wegoptimieren, auch wenn `runRetentionSerialisiert()`
„der richtige Weg für einen echten Lauf" zu sein scheint — hier ist er es
nicht.

Als Datei ablegen (Name der Testkonto-Mail als Argument) und über das
Bash-Werkzeug mit demselben `NODE_PATH` starten wie oben:

    const REPO = 'C:/Dev/Digitales-Berichtsheft';
    require('dotenv').config({ path: REPO + '/backend/.env' });
    const R = require(REPO + '/backend/services/retention');
    const mail = process.argv[2];
    if (!mail) {
      console.error('Aufruf: node <datei>.js "<mail-des-testkontos>"');
      process.exit(1);
    }

    R.runRetention({
      // Bewusst NUR das Testkonto: der Standardaufruf wuerde ueber
      // ermittleKandidaten() ALLE Kandidaten der geteilten Dev-Datenbank
      // verarbeiten, auch die sechs echten inaktiven Konten.
      listKandidaten: async () => (await R.ermittleKandidaten())
        .filter((u) => u.email === mail),
      logFehler: (e) => console.log('FEHLER:', e.nachricht),
    }).then((bericht) => {
      console.log(JSON.stringify(bericht, null, 2));
      process.exit(0);
    }).catch((e) => { console.error(e.message); process.exit(1); });

Aufruf:

    NODE_PATH="C:/Dev/Digitales-Berichtsheft/backend/node_modules" \
      node <datei>.js "<mail-des-testkontos>"

Die Ausgabe ist der vollständige Bericht (`kandidaten, vorgewarnt, geloescht,
gesperrt, anonymisiert, dateienEntfernt, fehler`) — daraus stammen die
Erwartungswerte in Abschnitt A/B oben.

## Danach

Die beiden Wegwerf-Testkonten (Azubi aus A, Prüfer aus B) sind am Ende dieser
Checkliste durch den Job selbst gelöscht — dafür ist der Test da, sie brauchen
keine Rücksetzung. Zu prüfen ist stattdessen, dass an den **echten** Demo-Konten
nichts hängen geblieben ist:

- [ ] **Demo-Konten unverändert.** Der Normalzustand aller neun Konten mit
      `.demo`-Adresse ist `Aktiv = 1`, `InaktivSeit IS NULL`,
      `LoeschsperreBis IS NULL` — der Job fasst sie nie an (`istDemoKonto` /
      `Email NOT LIKE '%.demo@%'`), unabhängig davon, ob sie gerade aktiv oder
      inaktiv sind. Prüfen:

          SELECT Email, Aktiv, InaktivSeit, LoeschsperreBis
            FROM dbo.Users WHERE Email LIKE '%.demo@%' ORDER BY Email;

      Weicht eine Zeile vom Zustand ab, den sie vor Beginn dieser Abnahme hatte
      (insbesondere wenn beim Vordatieren aus Versehen die falsche E-Mail-Adresse
      getroffen wurde), auf **diesen** vorherigen Zustand zurücksetzen — **nicht**
      pauschal `InaktivSeit = SYSUTCDATETIME()` setzen. Das würde ein aktives
      Demo-Konto fälschlich als „gerade eben deaktiviert" markieren; korrekt ist,
      exakt den Zustand wiederherzustellen, den das Konto vorher hatte (bei den
      neun aktuellen Demo-Konten: `Aktiv = 1`, `InaktivSeit = NULL`,
      `LoeschsperreBis = NULL`).
- [ ] Fehler-Posteingang auf `[retention]`-Einträge prüfen. **Achtung beim
      Nachbauen der Abfrage:** `[` und `]` sind in T-SQL-`LIKE`-Mustern
      Wildcards für eine Zeichenklasse. `Nachricht LIKE '%[retention]%'` matcht
      dadurch jede Zeile, die irgendeinen der Buchstaben r/e/t/n/i/o enthält —
      praktisch fast alles —, nicht den wörtlichen Tag `[retention]`. Richtig
      escaped (`[` → `[[]`, `]` → `[]]`):

          SELECT TOP 20 Id, Schweregrad, Nachricht FROM dbo.Fehlerberichte
           WHERE Nachricht LIKE '%[[]retention[]]%' ORDER BY Id DESC;

      Erwartet: keine Zeilen. Erscheint „Tabellen mit Personenbindung, die der
      Loeschjob NICHT kennt", muss das abgearbeitet werden, bevor der Job
      produktiv geht.
