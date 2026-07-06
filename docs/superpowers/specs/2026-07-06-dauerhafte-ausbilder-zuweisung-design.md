# Design: Dauerhafte Ausbilder-Zuweisung

**Datum:** 2026-07-06
**Status:** Entwurf zur Review
**Bezug:** ergänzt das Zugriffsmodell (befristete `dbo.Zuweisungen`, [zugriff.js](../../../backend/services/zugriff.js)) um einen unbefristeten Ausbilder↔Azubi-Grant, verwaltet in der Nutzerverwaltung.

## Ausgangslage

Heute entscheidet ausschließlich die Tabelle `dbo.Zuweisungen` `{ AzubiOid, VerantwEmail, Abteilung, Von, Bis }`, wer welches Berichtsheft sehen/korrigieren darf. Die Prüfung ([zugriff.js](../../../backend/services/zugriff.js)) verlangt für **Sehen und Korrigieren** eine am Stichtag aktive Zuweisung (`Von ≤ heute ≤ Bis`) und Wochen-Überschneidung.

Zwei Probleme für den Anwendungsfall „Ausbilder":

1. **Kein dauerhafter Zugriff.** Jeder Zugriff ist datumsgebunden. Die Rolle `pruefer`/das Flag `IstAusbilder` gewähren nur die *Fähigkeit* zu korrigieren, nicht den *Umfang* (welche Azubis) — der kommt zu 100 % aus datierten Zuweisungen.
2. **`Zuweisungen` hat Doppelfunktion.** Sie modelliert im Azubi-Planer die Abteilungs-Zeitleiste mit Nicht-Überlappungs-Invariante (409-Check in [zuweisungen.js](../../../backend/routes/zuweisungen.js)) **und** dient als Zugriffs-Grant. Ein dauerhafter Eintrag (offenes Ende) würde mit jeder befristeten Periode kollidieren. (Zusatzbefund: `istAktiv` behandelt `Bis = NULL` als *inaktiv*, während der Insert-Overlap-Check `NULL` als unbegrenzt zählt — Inkonsistenz, die eine Wiederverwendung zusätzlich belasten würde.)

## Ziel & Umfang

Ein Azubi soll **mehreren** Ausbildern **dauerhaft** (datumslos, komplette Historie) zugewiesen werden können. Der dauerhafte Ausbilder darf das Berichtsheft **sehen und korrigieren** — gleiche Rechte wie ein befristeter Verantwortlicher, nur ohne Zeitgrenze. Verwaltet wird die Zuordnung in der **Nutzerverwaltung** am Azubi-Datensatz.

**In Umfang:** neue n:m-Tabelle `dbo.AusbilderAzubis`; additiver Zugriffs-Pfad in `zugriff.js`/`zugriffContext.js`; API zum Lesen/Setzen der Ausbilder eines Azubis (developer-only); UI-Block im bestehenden Nutzerverwaltung-Modal; Migration; Unit-/API-Tests.

**Nicht in Umfang (YAGNI):** Verwaltung aus der Ausbilder-Perspektive („diesem Ausbilder Azubis zuordnen"); Benachrichtigungen bei Zuordnungsänderung; Historie/Audit der Zuordnungen; Änderung der bestehenden befristeten `Zuweisungen`.

## Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Kardinalität | n:m — ein Azubi kann mehrere dauerhafte Ausbilder haben |
| Rechte | Sehen **und** Korrigieren (wie befristeter Verantwortlicher) |
| Zeitumfang | Alle Wochen, komplette Historie, unbefristet (keine Datumsprüfung) |
| Modellierung | Eigene Tabelle, **getrennt** von `Zuweisungen` (Option ①) |
| Referenzschlüssel | Ausbilder per **OID** (aus `dbo.Users` gewählt; = `req.user.oid` beim SSO-Login) |
| Verwaltung | Nutzerverwaltung, Azubi-Datensatz; **developer-only** (wie restliche Nutzerverwaltung) |
| Auswählbar als Ausbilder | User mit Ausbilder-Fähigkeit: `role='pruefer'`, `IstAusbilder=1` oder `role='developer'` |

## Datenmodell — `dbo.AusbilderAzubis`

```sql
CREATE TABLE dbo.AusbilderAzubis (
  Id           INT IDENTITY PRIMARY KEY,
  AzubiOid     NVARCHAR(36)  NOT NULL,   -- dbo.Users.Oid (Rolle azubi)
  AusbilderOid NVARCHAR(36)  NOT NULL,   -- dbo.Users.Oid (ausbilderfähig)
  ErstelltAm   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_AusbilderAzubis UNIQUE (AzubiOid, AusbilderOid)
);
CREATE INDEX IX_AusbilderAzubis_AusbilderOid ON dbo.AusbilderAzubis(AusbilderOid);
CREATE INDEX IX_AusbilderAzubis_AzubiOid     ON dbo.AusbilderAzubis(AzubiOid);
```

- Keine `Von`/`Bis`-Spalten — „dauerhaft" ist bewusst datumslos.
- Referenz per OID (nicht E-Mail): robuster als das E-Mail-Matching der befristeten `Zuweisungen`; beim SSO-Login ist `req.user.oid` genau dieser Schlüssel.
- Der `AusbilderOid`-Index bedient die Kontext-Query (Zugriffsprüfung je Request), der `AzubiOid`-Index das Lesen der Liste im Modal.
- **Migration:** `db/migrations/011_ausbilder_azubis.sql`, idempotent (`IF OBJECT_ID('dbo.AusbilderAzubis','U') IS NULL`), gemäß Migrations-Konvention (nummeriert, manuell ausgeführt).

## Zugriffslogik

Der dauerhafte Grant ist ein **zweiter, gleichrangiger Pfad** neben den Zuweisungen. Bestehende Logik bleibt unberührt.

### `zugriffContext.js` (unreiner DB-Adapter)
`ladeKorrekturKontext(pool, userEmail, userOid)` lädt zusätzlich:
```sql
SELECT AzubiOid FROM dbo.AusbilderAzubis WHERE AusbilderOid = @userOid
```
und liefert es als Set `dauerAusbilderAzubiOids` im `kontext`. (Signatur bekommt `userOid`; Aufrufer in [anhaenge.js](../../../backend/routes/anhaenge.js), [wochen.js](../../../backend/routes/wochen.js) o. ä. übergeben `req.user.oid` zusätzlich zu `req.user.email`.)

Der `kontext` ist damit: `{ zuweisungen, stichtag, dauerAusbilderAzubiOids }`.

### `zugriff.js` (rein, DB-frei)
Neuer reiner Helfer + Einhängen in die bestehenden Funktionen:

- `istDauerAusbilder(woche, kontext)` → `true`, wenn `woche.azubiOid` in `kontext.dauerAusbilderAzubiOids`.
- `darfWocheKorrigieren(user, woche, kontext)` → zusätzlich `true`, wenn `istDauerAusbilder(woche, kontext)` — **ohne** `istAktiv`/`wocheFaelltInZuweisung`.
- `darfWocheSehen(user, woche, kontext)` → erbt das über `darfWocheKorrigieren` (bereits verkettet).
- `aktivVerantwortlichFuer(user, kontext)` → Ergebnis-Set zusätzlich um alle `dauerAusbilderAzubiOids` erweitert, sodass dauerhaft betreute Azubis in der Liste des Ausbilders erscheinen.

**Prinzip:** Zwei Zuweisungsquellen (befristet per E-Mail, dauerhaft per OID) fließen in **eine** zentrale Entscheidung. Kein paralleler Entscheidungsweg.

## API

Alle Endpunkte in [backend/routes/users.js](../../../backend/routes/users.js), abgesichert mit demselben developer-only-Guard wie `PATCH /api/users/:oid`.

- `GET /api/users/:azubiOid/ausbilder`
  → `200 [{ oid, name, email }]` — aktuell zugewiesene Ausbilder.
- `PUT /api/users/:azubiOid/ausbilder` Body `{ ausbilderOids: string[] }`
  → ersetzt die Menge (fügt neue ein, entfernt weggelassene; idempotent). `200 { ok: true }`.

**Validierung (serverseitig, hart):**
- Ziel-User (`:azubiOid`) muss existieren und Rolle `azubi` haben → sonst `400`.
- Jede `ausbilderOid` muss existieren und ausbilderfähig sein (`role='pruefer'`, `IstAusbilder=1` oder `role='developer'`) → sonst `400`.
- Nicht-developer → `403`.

## Frontend

Erweiterung des bestehenden Bearbeiten-Modals in [app/js/nutzerverwaltung.js](../../../app/js/nutzerverwaltung.js) (Seite ist bereits developer-only).

- Neuer Modal-Block „Dauerhafte Ausbilder", **nur sichtbar, wenn der bearbeitete Nutzer Rolle `azubi` hat.**
- Inhalt: Checkbox-Liste aller ausbilderfähigen Nutzer (Name + E-Mail), gefiltert aus dem bereits geladenen `users`-Array (kein Extra-Call für die Kandidaten). Vorbelegung der Häkchen aus `GET /api/users/:azubiOid/ausbilder` beim Öffnen.
- `handleSave` sendet zusätzlich zum bestehenden `PATCH` ein `PUT …/ausbilder` mit den angehakten OIDs. Bei Nicht-Azubis bleibt der Block verborgen und der Call entfällt.
- Neue `DB`-Helfer in [app/js/api.js](../../../app/js/api.js): `getAusbilderFuerAzubi(oid)`, `setAusbilderFuerAzubi(oid, ausbilderOids)`.
- XSS-Schutz via bestehender `esc()`-Funktion für Namen/E-Mails.

Die UI-Sichtbarkeit ist Komfort; die eigentliche Berechtigungs-/Rollenprüfung liegt serverseitig.

## Fehlerbehandlung

- API-Validierung → `400`/`403` mit klarer Meldung; Frontend zeigt `Toast.error`.
- `PUT`-Ersetzen läuft in einer Transaktion (DELETE der Weggelassenen + INSERT der Neuen), damit kein Zwischenzustand entsteht; `UNIQUE`-Constraint schützt vor Doppel-Inserts.
- Kontext-Query-Fehler werden geloggt; im Zweifel kein Zugriff (fail-closed), wie die bestehende Zugriffsprüfung.

## Test / Verifikation

**Unit ([zugriff.test.js](../../../backend/services/zugriff.test.js) erweitern):**
- Dauer-Ausbilder darf sehen **und** korrigieren bei einer Woche **weit außerhalb** jedes `Von/Bis` (beweist: datumslos, komplette Historie).
- Ohne Eintrag in `dauerAusbilderAzubiOids` → kein Zugriff.
- Koexistenz: befristete `Zuweisung` + dauerhafter Grant für denselben Azubi stören sich nicht; `aktivVerantwortlichFuer` enthält den Azubi über beide Quellen ohne Duplikat.

**API:**
- `PUT …/ausbilder` nur developer (`403` sonst).
- `400` bei nicht-ausbilderfähiger OID bzw. Nicht-Azubi-Ziel.
- Ersetzen-Semantik: Hinzufügen + Entfernen in einem Aufruf; erneuter identischer Aufruf ist no-op (idempotent).

**Manuell (E2E):** In der Nutzerverwaltung einem Azubi einen Ausbilder zuweisen → Ausbilder-Login (SSO) sieht den Azubi in seiner Liste und kann eine alte Woche (vor der Zuweisung) öffnen und korrigieren.

## Offene Abhängigkeiten

- Migration `011` auf der Ziel-DB (Dev-Server) ausführen — analog zum bekannten „Code deployt, Schema nicht"-Muster.
- Ausbilder müssen als ausbilderfähige `dbo.Users` existieren (Rolle `pruefer`/`IstAusbilder`), damit sie im Modal auswählbar sind.
