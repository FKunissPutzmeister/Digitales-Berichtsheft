# Löschkonzept — manuelle Abnahme

Diese Schritte verändern die Dev-Datenbank und löschen echte Zeilen. Sie sind
bewusst nicht automatisiert. Voraussetzung: Migrationen 030-032 sind gelaufen,
alle Unit-Tests grün, Server läuft über http://localhost:3000.

## A · Vollständiger Zyklus an einem Azubi-Testkonto

- [ ] Wegwerf-Konto anlegen (**keine** `.demo`-Adresse — sonst fasst der Job es nie an),
      Rolle `azubi` über die Nutzerverwaltung setzen.
- [ ] Mit dem Konto eine Woche anlegen und einreichen; als Prüfer kommentieren und
      genehmigen; eine Abteilungszuweisung anlegen; ein IHK-PDF importieren.
- [ ] Konto auf inaktiv setzen → die Tabellenzeile zeigt „Löschung am <heute + 365>".
- [ ] Stichtag vordatieren (Skript unten), Sperre auf ein Datum in der Zukunft setzen,
      Trockenlauf ohne injiziertes `loescheNutzer` starten.
      **Erwartet:** `gesperrt: 1`, `geloescht: 0`.
- [ ] Sperre leeren, Lauf erneut starten.
      **Erwartet:** `geloescht: 1`. Danach prüfen: `dbo.Users`-Zeile weg,
      Wochen/Tage/Kommentare/Beurteilungen/Zuweisungen weg,
      `backend/data/ihk-imports/<oid>/` weg.

## B · Der entscheidende Test: einen Prüfer löschen

Dieser Test belegt das gesamte Denormalisierungs-Konzept end-to-end. Er darf
bei der Abnahme nicht entfallen.

- [ ] Wegwerf-**Prüfer**-Konto anlegen (**keine** `.demo`-Adresse). Damit eine Woche
      eines **noch aktiven** Azubis kommentieren und genehmigen, und den Prüfer als
      Verantwortlichen einer Abteilungszuweisung dieses Azubis eintragen.
- [ ] Prüfer-Konto deaktivieren, Stichtag auf −366 Tage vordatieren, Lauf starten.
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
