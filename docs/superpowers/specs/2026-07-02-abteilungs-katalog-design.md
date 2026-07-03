# Abteilungs-Katalog mit hinterlegten Verantwortlichen — Design

**Datum:** 2026-07-02
**Status:** Abgestimmt (Design vom User freigegeben)

## Ziel

Das freie Textfeld „Abteilung" im Azubi-Planer wird zu einer **Auswahl aus einem
gepflegten Katalog von 31 Abteilungen** mit **hinterlegten Verantwortlichen**
(Berichtsheft-Prüfer). Beim Anlegen einer Zuweisung wählt der Planer eine
Abteilung; die Verantwortlichen-Auswahl wird automatisch auf die Prüfer dieser
Abteilung gefiltert.

## Kernentscheidung: E-Mail als durchgängiger Schlüssel

Die Verantwortlichen sind die Berichtsheft-Prüfer. Die meisten haben sich noch
**nie per SSO angemeldet** → sie existieren **nicht** in `dbo.Users` und haben
**keine OID**. `dbo.Users.Oid` ist Primärschlüssel, also können sie dort nicht
ohne OID angelegt werden.

Heute wird der Verantwortliche einer Zuweisung über `AusbilderOid` geführt und
an ~7 Stellen per `DB.getUser(oid)` in einen Namen aufgelöst
(azubi-planer, profil, wochenansicht, abteilungsdurchlauf, dh-profil, dashboard)
sowie für die Rückwärtssuche „welche Azubis betreue ich?"
(`getZuweisungenFuerAusbilder`). Mit fehlender OID läuft das alles ins Leere.

**Deshalb:** Die **E-Mail (UPN)** wird der stabile, durchgängige Schlüssel des
Verantwortlichen. Der Anzeigename kommt aus dem Katalog (bzw. wird bis zum ersten
Login aus der E-Mail abgeleitet). Die OID ist nur noch eine informative, beim
Login nachgezogene Größe — kein Schlüssel mehr.

## Datenmodell

### Neu: `dbo.Abteilungen`

| Spalte | Typ | Hinweis |
|--------|-----|---------|
| Id | INT IDENTITY PK | |
| Name | NVARCHAR(120) NOT NULL UNIQUE | inkl. `" PMM"`-Suffix bei PMM-Abteilungen |
| IstPmm | BIT NOT NULL DEFAULT 0 | nur für Gruppierung/Badge in der UI |
| Aktiv | BIT NOT NULL DEFAULT 1 | Soft-Delete; historische Zuweisungen bleiben lesbar |

### Neu: `dbo.AbteilungVerantwortliche`

| Spalte | Typ | Hinweis |
|--------|-----|---------|
| Id | INT IDENTITY PK | |
| AbteilungId | INT NOT NULL FK → Abteilungen(Id) | |
| Email | NVARCHAR(255) NOT NULL | UPN, **lowercase** gespeichert |
| Anzeigename | NVARCHAR(200) NULL | beim SSO-Login aus Azure nachgezogen |
| Oid | NVARCHAR(36) NULL | dito (informativ) |

Constraint: `UNIQUE (AbteilungId, Email)`.

### Änderung: `dbo.Zuweisungen`

- Spalte `AusbilderOid` wird durch **`VerantwEmail NVARCHAR(255)`** ersetzt
  (sauberer Neustart, da Bestand gelöscht wird — siehe unten).
- `Abteilung NVARCHAR(100)` bleibt und wird künftig mit dem **Katalog-Namen**
  gefüllt (Anzeige + Gantt-Farbzuordnung bleiben unverändert).

## Zuweisungs-Flow (Planer-Modal)

1. **Abteilung**: Freitext-`<input>` → `<select>`, befüllt aus
   `GET /api/abteilungen` (nur `Aktiv=1`), sortiert nach Name.
2. Bei Auswahl einer Abteilung → **Verantwortliche/r**-`<select>` wird auf die
   Prüfer **dieser** Abteilung gefüllt:
   - Wert (`value`) = E-Mail
   - Anzeige = `Anzeigename` bzw. aus E-Mail abgeleitet
   - Bei genau einem Prüfer: automatisch vorgewählt.
3. Speichern sendet `{ azubiOid, verantwEmail, abteilung: <Katalog-Name>, von, bis }`.
4. KPI „Verantwortliche aktiv" und der Verantwortlichen-Filter keyen auf
   **E-Mail** statt OID.

## Anzeige-Auflösung (Frontend)

- `normalizeZuweisung` liefert künftig `verantwEmail` und `verantwName`
  (statt `ausbilderId`). Der Name kommt server-seitig aus
  `COALESCE(AbteilungVerantwortliche.Anzeigename, NULL)`; ist er NULL, leitet das
  Frontend ihn aus der E-Mail ab.
- Die ~7 Aufrufstellen `DB.getUser(z.ausbilderId)` werden auf `z.verantwName`
  (mit E-Mail-Fallback) umgestellt.
- Rückwärtssuche `getZuweisungenFuerAusbilder(oid)` →
  `getZuweisungenFuerVerantw(email)` (der eingeloggte Nutzer kennt seine E-Mail
  aus der Session).

### Namensableitung (Fallback bis zum ersten Login)

`deriveName('ruediger.breuning@putzmeister.com')` → `"Ruediger Breuning"`:
lokaler Teil vor `@`, Punkte/Bindestriche → Leerzeichen, jedes Wort kapitalisiert.
Umlaut-Kodierungen (ue/ae/oe) bleiben roh, bis Azure beim Login den echten Namen
liefert und ihn im Katalog nachträgt.

## Login-Backfill

In `upsertUser` (backend/services/users.js), nach dem User-Upsert:

```sql
UPDATE dbo.AbteilungVerantwortliche
   SET Anzeigename = @name, Oid = @oid
 WHERE Email = @email
```

Match per **lowercase** E-Mail. So bekommt der Katalog den echten Azure-Namen,
sobald ein Prüfer sich erstmals anmeldet.

## Pflege-UI (developer-only, neuer Reiter)

Eigene Seite im Stil der Nutzerverwaltung (`page-header` + `card` + Tabelle +
Modal, `Icon(...)`, `Toast`, `initPage`):

- Liste aller Abteilungen: Name, PMM-Badge, Anzahl Verantwortliche, Aktiv-Status,
  Suche.
- Abteilung anlegen/bearbeiten: Name, IstPmm, Aktiv.
- Verantwortliche je Abteilung verwalten: per **E-Mail** hinzufügen / entfernen.
- Nav-Eintrag in der „Verwaltung"-Sektion der Sidebar, `nav-developer-only`.

### Endpoints (alle developer-only, wie `PATCH /api/users`)

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/api/abteilungen` | Katalog inkl. Verantwortliche (für Planer + Pflege-UI) |
| POST | `/api/abteilungen` | Abteilung anlegen |
| PATCH | `/api/abteilungen/:id` | Name/IstPmm/Aktiv ändern |
| DELETE | `/api/abteilungen/:id` | Abteilung entfernen (bzw. Aktiv=0) |
| POST | `/api/abteilungen/:id/verantwortliche` | Verantwortliche/n (E-Mail) hinzufügen |
| DELETE | `/api/abteilungen/:id/verantwortliche/:vid` | Verantwortliche/n entfernen |

`GET /api/abteilungen` ist für **alle Planer** lesbar (das Dropdown im Planer
braucht es); die schreibenden Endpoints sind developer-only.

## Bestandsdaten & Seed

- **`DELETE FROM dbo.Zuweisungen`** (vom User bestätigt) → sauberer Start ohne
  frei getippte Alt-Abteilungen; kein Freitext-Fallback.
- **Seed-SQL** legt die 31 Abteilungen + alle Verantwortlichen-E-Mails an.

### Katalog (31 Abteilungen)

Reguläre Abteilungen (23):

| Abteilung | Verantwortliche (E-Mail-Präfix) |
|-----------|-------------|
| Lehrwerkstatt | Marco.Rossi |
| Montage | Marco.Rossi |
| Empfang | Sandra.Pereira, Katja.Riester, Thomas.Look |
| Telefonzentrale | Sandra.Pereira, Katja.Riester, Thomas.Look |
| Posteingang und -Verteilung | Thomas.Look, Elena-Geanina.Rusu |
| Qualitätssicherung | Karlheinz.Roedler, Korhan.DEMIRBILEK |
| Wareneingangskontrolle | Karlheinz.Roedler, Korhan.DEMIRBILEK |
| Werkzeuglager | michael.haefner, Matthias.Bulling, Barbara.Rapp |
| Fertigungssteuerung | Timo.Lechler, Barbara.Rapp |
| Produktmanagement | Patrick.Hildenbrand, Christian.Plavac |
| Einkauf | Frank.Wenzel, Sebastian.Grieb, Christian.Weyermann, Nadine.Koller |
| Disposition | Jacqueline.Schnizler, Maik.Flammer |
| Finanz- und Rechnungswesen | Clemens.Thrum |
| Finance and Risk Management | Hanns-Carl.Riethmueller |
| Personalwesen | Anika.Kailer, linda.ebner, Kai.Knillmann |
| Entgeltabrechnung | Anika.Kailer, linda.ebner, Kai.Knillmann |
| Service EMEA | nadine.lechler, Frank.Riderer |
| Sales Planning | Stefanie.Kuhn, Torsten.Werner |
| Machines CT | Alessandra.Giamouridis, Joey-Melina.Janicsek, Eva.Kernchen |
| Parts CT | Alessandra.Giamouridis, Joey-Melina.Janicsek, Eva.Kernchen |
| Logistik Management | Marian.Deregowski, Stephan.Frank, Tanja.Broeder |
| Marketing PMH | Ann-Kathrin.Gehr, Julia.Haag, Michael.Walder |
| IT | Matthias.Lengerer |

PMM-Abteilungen (8, `IstPmm=1`):

| Abteilung | Verantwortliche/r |
|-----------|-------------------|
| Wareneingang PMM | Ruediger.Breuning |
| Versand PMM | Ruediger.Breuning |
| Einkauf PMM | Marcus.Anderson |
| Dispo PMM | Marcus.Anderson |
| FST PMM | Thomas.Ruecker |
| APS PMM | simone.schuett |
| Vertrieb PMM | markus.hybl |
| QS PMM | markus.hybl |

Alle E-Mails: `<präfix>@putzmeister.com`, lowercase gespeichert.

## Constraint: DDL-Account nötig

Die neuen Tabellen + Seed brauchen — wie schon `dbo.Users` — einen
**DDL-fähigen DB-Account**; der Laufzeit-User `Berichtsheft_dev1` hat keine
CREATE-TABLE-Rechte. Das SQL (Migration + Seed + `DELETE FROM dbo.Zuweisungen`)
wird dem User zum Ausführen übergeben.

## Testing

- Backend-Unit-Tests (`node:test`) für: `deriveName`, den Abteilungs-Service
  (Katalog-CRUD-Logik, Verantwortliche add/remove, E-Mail-Lowercasing), das
  Login-Backfill, die Endpoint-Autorisierung (developer-only).
- Frontend: manuelle Verifikation (Planer-Dropdown filtert korrekt, Pflege-UI
  legt an/entfernt, Name-Fallback greift) nach DB-Migration.

## Explizit nicht enthalten (YAGNI)

- Kein Microsoft-Graph-Vorabimport der Verantwortlichen (E-Mail-Seed reicht).
- Keine Migration alter Freitext-Zuweisungen (Bestand wird gelöscht).
- Kein Freitext-Fallback im Abteilungs-Dropdown.
- Mehrere Verantwortliche pro **einzelner** Zuweisung sind nicht vorgesehen
  (der Katalog hält mehrere je Abteilung; die Zuweisung genau einen).
