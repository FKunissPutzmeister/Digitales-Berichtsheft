# Design: Iteration 2 — Persistenter User-Store + Rollen-Mapping

**Datum:** 2026-07-01
**Status:** Entwurf zur Review
**Bezug:** baut auf dem SAML-Handshake (Iteration 1, gemergt) auf; löst die dort bewusst aufgeschobene Rollen-/Identitäts-Grenze.

## Ausgangslage

Nach Iteration 1 funktioniert der SAML-Handshake: echte Azure-Identität landet in der Session (`{ oid, email, name }`). Offen:

1. **Rolle fehlt in der Session** → jeder SSO-Nutzer landet rollenlos in der Default-Ansicht. Der `role`-Claim (`azubi`/`pruefer`) kommt inzwischen in der Assertion an (`http://schemas.microsoft.com/ws/2008/06/identity/claims/role`), wird aber nicht ausgewertet.
2. **Kein persistenter User-Store.** Nutzeridentität/-profil/-rechte leben hartcodiert in `backend/middleware/auth.js` (`DEV_USERS`) und `backend/config/berechtigungen.js` (`BERECHTIGUNGEN`). Die DB speichert nur Aktivitätsdaten (Wochen, Tage, Kommentare, Zuweisungen, Fahrtgeld), alle per OID-String verschlüsselt. Reale Azure-OIDs haben daher kein Profil, keine Rechte, und die Prüfer-/Planer-Roster kennt reale Nutzer nicht.

## Ziel & Umfang

Rollen-Mapping **und** persistenter User-Store in einem Zug (bewusst zusammen gewählt), sodass reale Azure-Nutzer die richtige Ansicht mit Inhalten bekommen.

**In Umfang:** DB-`Users`-Tabelle als einzige Nutzerquelle; JIT-Upsert beim Login; Rollen-Claim → Basisrolle; feine Rechte + Profil in der DB (admin-gepflegt); CSV-Bootstrap; Demo-Seed für lokale Dev; `/api/users` + `requireAuth` auf DB umstellen; DEV_USERS/BERECHTIGUNGEN ablösen; Admin-UI zur Profil-/Rechte-Pflege; `developer`-Rolle mit Voll-Sicht.

**Nicht in Umfang (später):** automatischer Microsoft-Graph-Sync (Design bleibt Graph-ready), Self-Service-Profilbearbeitung durch Azubis, automatische Leaver-Deaktivierung (vorerst manuelles `Aktiv`-Flag), Prod-Härtung aus Iteration 1 (`cookie.secure`, IIS-Proxy, robusterer Session-Store).

## Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Nutzerquelle | JIT-Upsert beim Login (Primär) + einmaliger CSV-Bootstrap; Graph-ready für später |
| Rollenmodell | Azure liefert grobe Basisrolle (`azubi`/`pruefer`); feine Rechte in der DB |
| Profilpflege | Admin/Planer-gepflegt, CSV liefert Startwerte |
| DEV_USERS | entfällt — DB-`Users` wird einzige Quelle; Demo-User als Seed für lokale Dev |
| Sonderrollen | `admin`, `dhstudent`, `developer` werden admin-gesetzt und beim Login NICHT überschrieben |

## Datenmodell — `dbo.Users`

Einzige Nutzerquelle, per `Oid` (Azure Object-ID, GUID-String) verschlüsselt — kompatibel zu allen bestehenden Tabellen (`AzubiOid`, `AusbilderOid`, `UserOid`).

| Spalte | Typ | Zweck | Quelle |
|---|---|---|---|
| `Oid` | NVARCHAR(36) PK | Identität | Assertion |
| `Name` | NVARCHAR | Anzeige | Assertion (Login aktualisiert) |
| `Email` | NVARCHAR | Anzeige/Lookup | Assertion (Login aktualisiert) |
| `Role` | NVARCHAR | `azubi`\|`pruefer`\|`admin`\|`dhstudent`\|`developer` | Azure-Claim setzt nur azubi/pruefer; Rest admin-gesetzt |
| `KannPlanen` | BIT | Planer-Zugang | DB (admin) |
| `IstAusbilder` | BIT | Korrektur-Zugang | DB (admin) |
| `Beruf` | NVARCHAR | Azubi-Profil | CSV-Startwert → admin |
| `AusbildungBeginn` | DATE | Azubi-Profil | CSV-Startwert → admin |
| `AusbildungEnde` | DATE | Azubi-Profil | CSV-Startwert → admin |
| `BerichtTyp` | NVARCHAR | `woechentlich`\|`taeglich` | CSV-Startwert → admin |
| `Aktiv` | BIT | Soft-Delete/Leaver | System/admin |
| `LetzterLogin` | DATETIME2 | Verwaltung | System |
| `ErstelltAm` | DATETIME2 | Verwaltung | System |
| `AktualisiertAm` | DATETIME2 | Verwaltung | System |

Index zusätzlich auf `Email` (Dev-Login-Lookup) und `Role` (Roster-Filter).

### Merge-Regel beim Upsert (kritisch)
Der Login-Upsert aktualisiert **nur** Identität (`Name`, `Email`, `LetzterLogin`) und die **Azure-Basisrolle** — und Letztere **nur**, wenn die aktuelle `Role` bereits `azubi`/`pruefer` ist. Admin-gesetzte Felder (Rechte, Profil) und admin-gesetzte Rollen (`admin`/`dhstudent`/`developer`) werden **nie** vom Login überschrieben. Azure ist Quelle für „wer + azubi/pruefer", die DB für alles Feine.

## Auth-Fluss

### Rollen-Claim-Mapping
Aus dem Profil den Claim `http://schemas.microsoft.com/ws/2008/06/identity/claims/role` lesen (**kann String ODER Array sein**) → Basisrolle `azubi`/`pruefer`. Kein/kein bekannter Claim → keine Azure-Rolle gesetzt.

### ACS (Login)
Nach erfolgreicher Assertion → `upsertUser(...)` (siehe unten), dann Session-Regeneration (wie Iteration 1) → nur `oid` in die Session schreiben.

### Einheitliches `requireAuth` (ersetzt die bisherige Bridge)
```
oid = req.session.user?.oid (SAML) | X-Dev-OID | req.session.userOid (Dev)
 → Nutzer aus dbo.Users per PK laden
 → nicht gefunden ODER Aktiv=0 → 401
 → req.user = { oid, name, email, role, kannPlanen, istAusbilder, istAzubi, istDhStudent }
```
Rolle/Rechte werden **pro Request frisch aus der DB** gelesen (nicht in der Session eingefroren) → Admin-Änderungen wirken sofort. Ein PK-Lookup ist neben den ohnehin nötigen Daten-Queries vernachlässigbar. **Ein Code-Pfad für Dev und SAML**, weil beide nur eine `oid` liefern.

### Flag-Ableitung
- `istAzubi = role === 'azubi'`
- `istDhStudent = role === 'dhstudent'`
- `istAusbilder` (Korrektur-Zugang) = `role === 'pruefer'` **ODER** Spalte `IstAusbilder = 1` — die Azure-Rolle `pruefer` gewährt den Korrektur-Zugang **von sich aus**; die DB-Spalte ist ein *zusätzlicher* Grant für Sonderfälle (z. B. ein Admin, der auch korrigiert).
- `kannPlanen = Spalte KannPlanen = 1`
- **`developer` → alle Flags `true` + Zugriff auf alle Views.**

Ergibt exakt die `req.user`-Form, die das Frontend heute erwartet.

**Rollennamen:** Der interne Korrektur-Rollenwert heißt `pruefer` (deckungsgleich mit dem Azure-Claim). Der frühere Wert `ausbilder` aus den Demo-Daten wird auf `pruefer` vereinheitlicht; `ROLE_LABELS` bekommt einen `pruefer`-Eintrag, das Demo-Seed nutzt `pruefer`.

### Dev-Logins
`POST /api/auth/login-by-email` und `/login` schlagen die OID/E-Mail künftig in `dbo.Users` nach statt in DEV_USERS.

## Nutzerquelle: ein Schreibpfad

Genau **eine** Funktion `upsertUser(data)` schreibt in `dbo.Users` (INSERT-or-UPDATE nach Merge-Regel). Aufgerufen von:
- **Login-JIT** (`upsertUserFromAssertion(profile)` → mappt Claims → ruft `upsertUser`),
- **CSV-Import** (liest CSV-Zeilen → `upsertUser`),
- **späterer Graph-Sync** (gleiche Signatur — kein Umbau).

Dadurch ist „woher kommen Nutzer" eine austauschbare Quelle, kein paralleler Code-Weg.

## Bootstrap, Migration, Seed

- **Migration:** `CREATE TABLE dbo.Users` (+ Indizes) als Skript unter `backend/db/`.
- **CSV-Bootstrap:** Import-Skript (`backend/db/import-users.*`) liest eine vom Kollegen gelieferte CSV (oid, email, name, role, beruf, beginn, ende, berichtTyp) → `upsertUser`. Idempotent.
- **Demo-Seed:** die bisherigen 7 DEV_USERS (inkl. Jana Hofer) als Seed-Skript in `Users` einspielen (mit Rollen/Rechten/Profilen), damit lokale Dev-Logins weiter laufen. Florian + Kollege bekommen `Role='developer'`.

## Frontend

- Rolle→Ansicht läuft größtenteils bereits über die von `requireAuth` gelieferten Flags — kein großer Umbau.
- `ROLE_LABELS` um `pruefer` + `developer` ergänzen; die Gates (`requireRole(...)`, `istDhStudent`-Weiche in `app.js`) müssen `developer` überall durchlassen.
- **Admin-UI (Profil-/Rechte-Pflege):** in der bestehenden Verwaltung (Berichtsheftverwaltung/Azubi-Planer) ein Formular zum Bearbeiten von `Beruf`, `AusbildungBeginn/Ende`, `BerichtTyp`, `Role`, `KannPlanen`, `IstAusbilder`, `Aktiv`. Backend: `PATCH /api/users/:oid` (nur `admin`/`developer`).
- Azubi-Self-View: unverändert (lädt eigene Wochen über die OID).

## Fehlerbehandlung

- `requireAuth`: unbekannte/inaktive OID → 401 (kein Absturz).
- `upsertUser`: DB-Fehler werden geloggt; ein fehlgeschlagener Login-Upsert führt zu `?error=sso` (kein halber Login).
- `PATCH /api/users/:oid`: nur für `admin`/`developer`; Validierung von `role`/`berichtTyp` gegen die erlaubten Werte.

## Test / Verifikation

- **Unit:** Upsert-Merge-Regel (admin-Felder + Sonderrollen bleiben erhalten, Identität/Basisrolle wird aktualisiert), Rollen-Claim-Parsing (String **und** Array), `requireAuth`-Flag-Ableitung je Rolle (inkl. `developer` = alle Flags), CSV-Parsing, `/api/users`-DB-Query, `PATCH`-Validierung/Autorisierung.
- **Manuell (E2E):** Login als Azubi → Azubi-Ansicht mit eigenen (ggf. leeren) Wochen; `developer`-OID → alle Ansichten erreichbar; Admin ändert Rolle → wirkt beim nächsten Request.

## Offene Abhängigkeiten

- CSV der Gruppenmitglieder (oid/email/name, optional Profilfelder) vom Azure-Kollegen für den Bootstrap.
- DB-Schreibrechte des App-DB-Users auf die neue Tabelle (Migration ausführen).
