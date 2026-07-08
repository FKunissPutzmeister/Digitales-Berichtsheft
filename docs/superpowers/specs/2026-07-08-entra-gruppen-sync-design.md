# Design: Automatischer Entra-Gruppen-Sync (Azubis, Prüfer, DH-Studenten)

**Datum:** 2026-07-08
**Status:** Entwurf zur Review
**Bezug:** löst die in Iteration 2 bewusst aufgeschobene automatische Nutzer-Provisionierung („Design bleibt Graph-ready", keine Leaver-Deaktivierung). Nutzt den bestehenden einen Schreibpfad `upsertUser` und ergänzt Lifecycle (Aktiv-Flag).

## Ausgangslage

Nutzer landen heute nur per **SSO-Login (JIT-Upsert)** oder **manuellem CSV-Import** (`backend/db/import-users.js`) in `dbo.Users`. Es gibt **keinen** automatischen Abgleich mit Entra-Gruppen und **keine** Deaktivierung von Austritten. Neue Mitglieder erscheinen erst beim ersten Login; Ausgetretene behalten Zugriff, bis sie manuell deaktiviert werden.

## Ziel & Umfang

Ein automatischer, wiederkehrender Abgleich der App-Nutzer mit drei Entra-Sicherheitsgruppen — für **Azubis, Prüfer und DH-Studenten** — inklusive **Reaktivierung** von Rückkehrern und **Deaktivierung** von Austritten.

**In Umfang:** Graph-Client (App-only/Client-Credentials, ohne neues npm-Paket); Sync-Service mit Rollen-Auflösung + Deaktivierungslogik; Timer beim Serverstart + Intervall; manueller „Jetzt synchronisieren"-Button (developer-only); Konfiguration per `.env`; Unit-Tests für die reinen Logik-Teile.

**Nicht in Umfang (YAGNI):** Sync von Profilfeldern (Beruf/Zeitraum bleiben admin-/CSV-gepflegt); Webhooks/Delta-Queries (Full-Pull genügt bei dieser Gruppengröße); Verwaltung der Gruppen-Zuordnung über UI (Gruppen-IDs kommen aus `.env`); Zertifikats-Auth (Client-Secret genügt vorerst).

## Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Auslösung | Einmal beim Serverstart + Timer (Default alle 6 h, `.env`-einstellbar) + manueller Button (developer-only) |
| Graph-Auth | Eigene App-Registrierung, Client-Credentials-Flow, Client-**Secret**; `fetch` (Node 24), kein neues Paket |
| Graph-Permission | Application `GroupMember.Read.All` + Admin-Consent |
| Verwaltete Rollen | `azubi`, `pruefer`, `dhstudent` — je genau eine Entra-Gruppe |
| Rollen-Vorrang bei Mehrfach-Mitgliedschaft | **pruefer > azubi > dhstudent** |
| Deaktivierung | Rollen-gebunden: aktive Nutzer mit *verwalteter* Rolle, die in **keiner** der Gruppen sind → `Aktiv=0`. `developer`/`admin` nie angefasst; admin-Rolle & Flags bleiben (Merge-Regel) |
| Reaktivierung | Aktuelle Gruppen-Mitglieder werden auf `Aktiv=1` gesetzt (Rückkehrer) |
| Fehlerverhalten | Sync-Fehler werden geloggt, brechen Serverstart nicht ab, lassen den letzten DB-Stand unangetastet |
| Fehlende Konfig | Ein `.env`-Wert fehlt → Sync deaktiviert (wie SAML), App läuft normal |

## Konfiguration (`backend/.env`, nicht im Git)

```
GRAPH_TENANT_ID=b5ce0e47-3753-4f10-b705-9d0447ccf182
GRAPH_CLIENT_ID=b0cd9609-34ba-47ba-b238-f64c6febfb9e
GRAPH_CLIENT_SECRET=<geheimer WERT des Secrets, nicht die Secret-ID>
SYNC_GROUP_PRUEFER=ff7e277c-7a5f-4134-b7f3-c9ec5cc96d71
SYNC_GROUP_AZUBI=733a70dc-6ae4-47a0-b995-408f85ef8706
SYNC_GROUP_DHSTUDENT=967f24f8-b254-4a96-93f7-dd3d9bfe250e
SYNC_INTERVAL_HOURS=6
```

Pflicht für „konfiguriert": `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` und **mindestens eine** `SYNC_GROUP_*`. `SYNC_INTERVAL_HOURS` optional (Default 6).

## Architektur

### `backend/services/entraSync.js` (neu)
Ein Modul mit klarer Trennung reiner Logik (testbar) von I/O (Graph/DB).

**Reine Funktionen (unit-getestet):**
- `buildGroupRoleMap(env)` → `[{ role, groupId }]` in Vorrang-Reihenfolge `['pruefer','azubi','dhstudent']`, nur für gesetzte `SYNC_GROUP_*`. Liefert außerdem `managedRoles` (die Rollen mit konfigurierter Gruppe).
- `resolveMembers(groupResults)` → aus `[{ role, members:[{oid,name,email}] }]` (in Vorrang-Reihenfolge) eine `Map<oid, {oid,name,email,role}>`; bei Mehrfach-Mitgliedschaft gewinnt die zuerst gelistete Rolle (= höchster Vorrang). Leere/ungültige OIDs werden verworfen.
- `computeDeactivations(dbManagedUsers, aktivOids, managedRoles)` → OIDs, die deaktiviert werden: `dbManagedUsers` (aktiv, Rolle ∈ managedRoles), deren OID nicht in `aktivOids` ist.

**I/O-Funktionen:**
- `syncConfigured()` → `{ configured:boolean, tokenConfig, groupRoleMap, intervalHours }`.
- `getGraphToken(tokenConfig)` → POST `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` (`grant_type=client_credentials`, `scope=https://graph.microsoft.com/.default`), liefert `access_token`. Einmal pro Lauf geholt.
- `fetchGroupMembers(token, groupId)` → GET `https://graph.microsoft.com/v1.0/groups/{id}/members?$select=id,displayName,mail,userPrincipalName&$top=999`, folgt `@odata.nextLink` (Paging). Nur Objekte vom Typ User (`@odata.type` endet auf `.user` bzw. `userPrincipalName` vorhanden). Mappt → `{ oid:id, name:displayName, email:(mail||userPrincipalName).toLowerCase() }`.
- `runSync()` → orchestriert: Token holen → je Gruppe Mitglieder laden → `resolveMembers` → pro Nutzer `upsertUser({oid,name,email,role, letzterLogin:false})` → `reactivateUsers(alleAktivOids)` → `computeDeactivations` → `deactivateUsers(staleOids)`. Gibt eine Zusammenfassung zurück: `{ ok, proGruppe:{role:count}, upserted, reactivated, deactivated, errors:[] }`.

### `backend/services/users.js` (erweitern)
Zwei Lifecycle-Helfer (der Sync verwaltet `Aktiv`, `upsertUser` fasst `Aktiv` beim Update bewusst nicht an):
- `listManagedUsers(roles)` → `SELECT Oid, Role FROM dbo.Users WHERE Aktiv = 1 AND Role IN (...)` (parametrisiert).
- `setUsersAktiv(oids, aktiv)` → `UPDATE dbo.Users SET Aktiv=@aktiv, AktualisiertAm=SYSUTCDATETIME() WHERE Oid IN (...)` (parametrisierte Liste; No-op bei leerer Liste). Wird für Reaktivierung (`aktiv=1`) und Deaktivierung (`aktiv=0`) genutzt.

**Merge-Regel anpassen (kritisch):** `dhstudent` in die Menge der aus Gruppen setzbaren Basisrollen aufnehmen. Bisher aktualisiert `upsertUser` die Rolle nur, wenn die aktuelle `azubi`/`pruefer`/leer ist (`WHEN t.Role IN ('azubi','pruefer') OR t.Role IS NULL`). Da `dhstudent` jetzt gruppen-verwaltet ist, muss ein Wechsel zwischen den drei verwalteten Rollen greifen → Bedingung erweitern auf `t.Role IN ('azubi','pruefer','dhstudent')`. `admin`/`developer` bleiben weiterhin geschützt (werden nie von einem Claim/Sync überschrieben). Bestehende Tests in `users.test.js` prüfen die Merge-Regel — ggf. anpassen/ergänzen (dhstudent→azubi wird gesetzt; admin/developer bleiben).

### `backend/routes/sync.js` (neu) + Mount in `server.js`
- `POST /api/sync/entra` — **developer-only** (`req.user.role !== 'developer' → 403`). Ruft `runSync()` und gibt die Zusammenfassung als JSON zurück. Mount: `app.use('/api/sync', devAuth, syncRouter)`.

### `backend/server.js` (erweitern)
Nach dem Serverstart, wenn `syncConfigured().configured`:
- `runSync()` einmalig aufrufen (in `try/catch`, Fehler nur loggen — Boot darf nicht abbrechen).
- `setInterval(runSync, intervalHours * 3600_000)` starten (ebenfalls fehlertolerant).
Fehlt die Konfig: eine Warn-Zeile loggen (wie `[saml] … NICHT konfiguriert`), sonst nichts.

### Frontend (`app/js/nutzerverwaltung.js` + `app/js/api.js`)
- `app/js/api.js`: `DB.runEntraSync()` → `POST /sync/entra`, gibt Zusammenfassung zurück.
- `nutzerverwaltung.js`: Button **„Jetzt synchronisieren"** im Seitenkopf (nur developer, Seite ist ohnehin developer-only). Klick → Button disabled + Spinner → `DB.runEntraSync()` → `Toast.success` mit Kurz-Zusammenfassung (z. B. „12 aktualisiert, 1 reaktiviert, 2 deaktiviert") → Nutzerliste neu laden (`DB.getAllUsers()` + Tabelle rendern). Fehler → `Toast.error`.

## Datenfluss (ein Sync-Lauf)

1. Token holen (Client-Credentials).
2. Für jede konfigurierte Gruppe: Mitglieder (Users) laden.
3. `resolveMembers` → OID→{identität, rolle} nach Vorrang pruefer>azubi>dhstudent.
4. Pro Mitglied `upsertUser` (Identität + Rolle). Merge-Regel (angepasst) setzt die Rolle für neue Nutzer und für Wechsel zwischen den verwalteten Rollen (`azubi`/`pruefer`/`dhstudent`); `admin`/`developer` bleiben unverändert.
5. `setUsersAktiv(alleMitglieder, 1)` — Rückkehrer reaktivieren.
6. `listManagedUsers(managedRoles)` → `computeDeactivations` gegen die Mitglieder-OIDs → `setUsersAktiv(stale, 0)`.
7. Zusammenfassung zurückgeben/loggen.

## Fehlerbehandlung

- Token- oder Graph-HTTP-Fehler: `runSync` fängt, loggt (`[entra-sync] …`), gibt `{ ok:false, errors:[…] }` zurück; **keine** DB-Änderung bei Fehler *vor* dem Abgleich. Schlägt eine einzelne Gruppen-Abfrage fehl, wird der gesamte Lauf abgebrochen (kein Teil-Abgleich → sonst fälschliche Deaktivierungen).
- Manueller Button: zeigt bei `ok:false` `Toast.error` mit der ersten Fehlermeldung.
- Serverstart: Sync-Fehler werden geloggt, App startet trotzdem.

## Sicherheitsaspekte

- `GRAPH_CLIENT_SECRET` nur in `.env` (nicht im Git), wie DB-Passwort/SAML.
- Minimale Graph-Rechte: nur `GroupMember.Read.All` (lesen).
- Sync-Endpoint developer-only.
- Getrennte App-Registrierung von der SAML-SSO-App (Least Privilege, unabhängige Secret-Rotation).
- Secret-**Ablauf** beachten: läuft es ab, schlägt der Token-Abruf fehl → Sync stoppt (Login/SSO unberührt, da eigene App).

## Test / Verifikation

**Unit (`backend/services/entraSync.test.js`, node:test):**
- `buildGroupRoleMap`: nur gesetzte Gruppen, korrekte Vorrang-Reihenfolge, `managedRoles` korrekt.
- `resolveMembers`: Vorrang pruefer>azubi>dhstudent bei Doppelmitgliedschaft; leere/fehlende OID verworfen; Identitätsfelder korrekt gemappt.
- `computeDeactivations`: nur aktive Nutzer mit verwalteter Rolle, die nicht in `aktivOids` sind; developer/admin (nicht in `managedRoles`) nie enthalten; leere Eingaben → leere Ausgabe.

**Manuell (E2E, kein HTTP/DB-Test-Harness im Repo):**
- Mit gesetzter `.env`: „Jetzt synchronisieren" → Zusammenfassung plausibel; ein aus der Gruppe entfernter Test-Azubi wird `Aktiv=0`; ein wieder hinzugefügter wird reaktiviert; developer/admin bleiben aktiv; ein Admin in der Prüfer-Gruppe behält Rolle `admin`.
- Ohne Graph-Konfig: Serverstart ok, Warn-Log, Button liefert „nicht konfiguriert".

## Offene Abhängigkeiten / manuelle Schritte

- Azure: App-Registrierung + `GroupMember.Read.All` + Admin-Consent + Client-Secret (**Wert** kopieren).
- DH-Studenten-Gruppe in Entra existiert und ist befüllt.
- `.env` auf dem Zielsystem mit den sechs Werten + Dienst-Neustart.
- Die zwei Admins mit Korrektur-Aufgabe: einmalig `IstAusbilder=1` in der Nutzerverwaltung setzen (der Sync vergibt keine Flags).
