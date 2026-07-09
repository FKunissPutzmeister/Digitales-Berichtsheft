# Fehlerberichts-System — Design

**Datum:** 2026-07-09
**Status:** freigegeben (Design), Plan folgt

## Ziel

Alle im Hintergrund entstehenden Fehler **aller Nutzer** zentral erfassen, damit
Developer schnellstmöglich debuggen können. Erfassung automatisch (Frontend +
Backend) **und** über einen manuellen Melde-Button. Einsicht über eine
Developer-Seite in der Anwendung, gestützt auf eine DB-Tabelle. Die
`console.error`-Ausgabe (von nssm in eine Datei geschrieben) bleibt als Boden
erhalten, falls die DB selbst der Fehler ist.

## Entscheidungen (mit Nutzer abgestimmt)

- **Umfang:** Frontend + Backend automatisch, plus manueller „Fehler melden"-Button.
- **Manueller Button:** im **Profil** (nicht Topbar).
- **Zugriff auf die Fehlerliste:** ausschließlich `role='developer'`.
- **Aufbewahrung:** 90 Tage, danach automatische Löschung.
- **Backend-Abdeckung:** bestehende `console.error(...)` in den Routen-Catch-Blöcken
  werden auf `logError(...)` umgestellt (Drop-in: loggt weiterhin auf Konsole **und**
  persistiert). Globaler Express-Error-Handler + Prozess-Handler ergänzen die Fälle,
  die keine Route abfängt.

## Nicht-Ziele (YAGNI)

- Keine E-Mail-/Push-Alarmierung bei Fehlern.
- Keine Aggregations-/Charting-Dashboards (nur filterbare Liste).
- Kein anonymer, unauthentifizierter Ingest-Endpunkt (Fehler auf der Login-Seite
  **vor** dem Login werden bewusst nicht erfasst — seltener Rand, dafür kein
  offener Schreib-Endpunkt).
- Kein Rate-Limiting (stattdessen Client-Dedupe + serverseitige Fingerprint-Gruppierung).

## Architektur

### 1. Datenbank — Migration `017_fehlerberichte.sql`

Nummeriert, idempotent, manuell (Konvention wie `db/migrations/NNN`), gegen
`Berichtsheft_Dev`. Tabelle `dbo.Fehlerberichte`:

| Spalte | Typ | Zweck |
|---|---|---|
| `Id` | INT IDENTITY PK | |
| `ErsterZeitpunkt` | DATETIME2 DEFAULT SYSUTCDATETIME() | erstes Auftreten dieses Fingerprints |
| `LetzterZeitpunkt` | DATETIME2 | letztes Auftreten (bei Gruppierung aktualisiert) |
| `Quelle` | NVARCHAR(20) | `frontend` / `backend` / `manual` (CHECK-Constraint) |
| `Nachricht` | NVARCHAR(MAX) | Fehlermeldung bzw. Meldetext |
| `Stack` | NVARCHAR(MAX) NULL | Stacktrace |
| `Kontext` | NVARCHAR(MAX) NULL | JSON: url, seite, userAgent, route, httpStatus … |
| `BenutzerOid` | NVARCHAR(36) NULL | betroffener Nutzer (aus Session) |
| `BenutzerName` | NVARCHAR(200) NULL | Namens-Snapshot (überlebt Nutzer-Löschung) |
| `Fingerprint` | NVARCHAR(64) | Hash aus Quelle+Nachricht+Stack-Kopf zur Gruppierung |
| `Anzahl` | INT DEFAULT 1 | Auftrittszähler |
| `Erledigt` | BIT DEFAULT 0 | Bug-Workflow |
| `ErledigtVon` | NVARCHAR(200) NULL | |
| `ErledigtAm` | DATETIME2 NULL | |

Indizes: auf `Fingerprint` (Gruppierung beim Insert), auf `LetzterZeitpunkt`
(Liste sortieren + Cleanup).

**Gruppierung:** Beim Insert wird geprüft, ob ein **unerledigter** Eintrag mit
gleichem `Fingerprint` existiert. Falls ja: `Anzahl += 1`, `LetzterZeitpunkt`
aktualisieren, ggf. Stack/Kontext des jüngsten Vorkommens übernehmen. Sonst neue
Zeile. So bleibt die Tabelle handhabbar, auch wenn ein Nutzer denselben Fehler in
einer Schleife hunderte Male auslöst.

### 2. Backend

**Service `backend/services/fehlerberichte.js`**
- `logError({ quelle, nachricht, stack, kontext, benutzerOid, benutzerName })`
  → berechnet Fingerprint, macht das Upsert (Gruppierung), ruft **immer**
  `console.error` (nssm-Datei-Boden). Fehler beim Loggen selbst werden
  verschluckt (Logging darf nie den Request killen).
- `listErrors({ quelle, erledigt, benutzerOid, seit, limit })` → Liste für die UI.
- `markResolved(id, erledigtVon)` → setzt `Erledigt/ErledigtVon/ErledigtAm`.
- `cleanupAlt(tage = 90)` → löscht Einträge älter als N Tage.

**Route `backend/routes/fehlerberichte.js`**
- `POST /api/errors` (unter `devAuth`) — Ingest für Frontend-Handler + manuellen
  Button. Nimmt `{ quelle, nachricht, stack, kontext }` an, hängt `req.user`
  (Oid + Name) serverseitig an — der Client kann die Identität nicht fälschen.
  `quelle` wird gegen die erlaubten Werte validiert; nur `frontend`/`manual` sind
  vom Client zulässig (`backend` setzt nur der Server).
- `GET /api/dev/errors` (developer-only) — filter-/sortierbare Liste.
- `PATCH /api/dev/errors/:id` (developer-only) — als erledigt markieren.

Developer-Gate: Prüfung `req.user.role === 'developer'` (403 sonst), analog zu den
bestehenden developer-only Flächen (abteilungsverwaltung).

**Globale Erfassung in `backend/server.js`**
- Express-Error-Handler `app.use((err, req, res, next) => …)` **nach** allen Routen:
  `logError({ quelle:'backend', … , kontext:{ route:req.path, methode:req.method }})`,
  dann `500`.
- `process.on('unhandledRejection')` und `process.on('uncaughtException')` →
  `logError` (best effort, kein Prozess-Abbruch-Verhalten ändern).
- Täglicher Cleanup: `setInterval(() => cleanupAlt(90), 24h)` (Muster wie
  `entra-sync`), plus ein Lauf beim Start.

**Umstellung bestehender Catch-Blöcke**
- In allen Request-Kontext-Catches mit `console.error('[tag]', e)` → `logError`
  (Quelle `backend`, `nachricht` inkl. Tag, `req.user`, `kontext` mit Route).
  Betroffen: `routes/abteilungen.js`, `routes/users.js`, `routes/wochen.js`,
  `routes/kommentare.js`, `routes/anhaenge.js`, `routes/benachrichtigungen.js`
  (aktuell nur `res.status(500)…err.message`, wird ergänzt), `routes/fahrtgeld.js`,
  `routes/beurteilungen.js`, `routes/zuweisungen.js`, `routes/sync.js`,
  `middleware/auth.js`, `server.js` (`/api/dev/users`).
- **Nicht** umgestellt (kein Request-Kontext / bewusst Konsole): CLI
  `db/import-users.js`, Startup-/Konfig-Logs in `config/saml.js`, die
  `entra-sync`-Läufe (Service-Kontext — optional als Quelle `backend` ohne User,
  aber niedrige Prio; im Plan als Kür markiert).

### 3. Frontend

**Modul `app/js/error-reporter.js`** — direkt nach `api.js` auf allen Shell-Seiten
eingebunden (api.js stellt `apiFetch`/API_BASE bereit; Reihenfolge wie beim
zentralen `escapeHtml`):
- `window.addEventListener('error', …)` — unbehandelte JS-Fehler (Message, Stack,
  Quelle/Zeile).
- `window.addEventListener('unhandledrejection', …)` — abgelehnte Promises.
- Einklinken in den `apiFetch`-Fehlerpfad (fehlgeschlagene API-Calls mit Pfad +
  HTTP-Status) — ohne Endlosschleife, wenn `/api/errors` selbst scheitert
  (Selbst-Ausschluss).
- **Client-Dedupe:** gleicher Fehler (Message+Stack) wird innerhalb eines kurzen
  Fensters nur einmal gesendet, um Fluten zu vermeiden.
- Sendet an `POST /api/errors` mit `quelle:'frontend'` und Kontext (url, seite,
  userAgent). Meldet still (kein UI-Popup für den Nutzer).

**Manueller Melde-Button im Profil** (`app/js/profil.js` + evtl. `dh-profil.js`):
- Ein Abschnitt/Button „Fehler melden" → kleines Modal mit Textfeld (Beschreibung)
  → `POST /api/errors` mit `quelle:'manual'`, `nachricht` = Text, `kontext` mit
  aktueller Seite. Für **alle** Nutzer sichtbar. Kurze Erfolgs-Rückmeldung.

**Developer-Seite `app/fehlerberichte.html` + `app/js/fehlerberichte.js`**
- In der Sidebar developer-gated (Muster wie `abteilungsverwaltung`:
  Nav-Eintrag + Seiten-Guard `role==='developer'`, sonst Redirect).
- Filterbare Tabelle: Zeit, Quelle, Nutzer, erledigt/offen; Sortierung nach
  `LetzterZeitpunkt`. Zeigt `Anzahl` je gruppiertem Fehler.
- Detail: aufklappbarer Stacktrace + Kontext-JSON.
- „Erledigt"-Button → `PATCH /api/dev/errors/:id`.
- Alle Ausgaben über das zentrale `escapeHtml` (Stacktraces/Meldetexte sind
  potenziell nutzerkontrolliert → XSS-Schutz in der Developer-Ansicht).

## Datenschutz

Stacktraces, API-Payload-Kontext und freie Meldetexte können Azubi-PII enthalten.
Deshalb: Einsicht strikt `role='developer'`, Auslieferung nur über die geschützte
API, 90-Tage-Auto-Löschung, keine Weitergabe/kein Export außerhalb der App.

## Testbarkeit

- `services/fehlerberichte.js`: Fingerprint-Berechnung und die Gruppierungs-/
  Cleanup-Logik als reine, Node-testbare Funktionen (Muster wie `zugriff.js` rein
  vs. `zugriffContext.js` DB-Adapter) — DB-Zugriff getrennt.
- Frontend-Dedupe-Logik als kleine reine Funktion, unit-testbar
  (`error-reporter.test.js`, Muster wie `activity-suggestions.test.js`).

## Betroffene/neue Dateien (Überblick)

**Neu:** `db/migrations/017_fehlerberichte.sql`,
`backend/services/fehlerberichte.js` (+ Test), `backend/routes/fehlerberichte.js`,
`app/js/error-reporter.js` (+ Test), `app/fehlerberichte.html`,
`app/js/fehlerberichte.js`, `app/css/fehlerberichte.css`.

**Geändert:** `backend/server.js` (Route mounten, globaler Handler, Prozess-Handler,
Cleanup-Interval), die o.g. Routen/Middleware (Catch → `logError`),
`app/js/sidebar.js` (Nav-Eintrag developer-gated), alle Shell-`app/*.html`
(`error-reporter.js` einbinden), `app/js/profil.js` (+ ggf. `dh-profil.js`)
für den Melde-Button.

---

## Erweiterung (2026-07-09): Schweregrad

Jeder Fehler bekommt einen Schweregrad `hoch` / `mittel` / `gering`, damit
Developer nach Wichtigkeit triagieren können (Beispiel des Nutzers: Genehmigung
oder Absenden funktioniert gar nicht → hoch; Kleinigkeiten → gering).

**Entscheidungen (mit Nutzer abgestimmt):** Einstufung erfolgt **serverseitig
regelbasiert** (Client-Angaben sind fälschbar/inkonsistent); Developer können
die Schwere auf der Fehlerberichte-Seite **nachträglich ändern**; manuelle
Meldungen starten mit **mittel**.

**Regeln (`bewerteSchwere({ quelle, nachricht, kontext })`, rein & testbar):**

| Regel (erste trifft) | Schwere |
|---|---|
| `quelle = 'manual'` | mittel |
| Nachricht beginnt mit `[uncaughtException]`, `[unhandledRejection]`, `[unhandled]` oder `[auth]` | hoch |
| `kontext.methode` ∈ POST/PATCH/PUT/DELETE (fehlgeschlagene Schreib-Aktion: Absenden, Genehmigen, Speichern …) | hoch |
| `kontext.methode = 'GET'` (Lese-Fehler: Liste/Ansicht lädt nicht) | mittel |
| sonst: `quelle = 'backend'` ohne Methode | mittel |
| sonst (Frontend-JS-Fehler ohne API-Bezug) | gering |

**Umsetzung:**
- Migration `018_fehlerberichte_schweregrad.sql`: Spalte `Schweregrad NVARCHAR(10)
  NOT NULL DEFAULT 'mittel'` + CHECK (`hoch`/`mittel`/`gering`), idempotent.
- Service: `bewerteSchwere` (rein, TDD), `logError` schreibt den berechneten Wert;
  bei Fingerprint-Gruppierung bleibt der bestehende Wert stehen (manuelle
  Developer-Korrektur wird von Wiederholungen nicht überschrieben).
  `listErrors` filtert optional nach `schweregrad`; `setSchweregrad(id, wert)`.
- Route: `PATCH /api/dev/errors/:id` akzeptiert zusätzlich `{ schweregrad }`
  (validiert gegen die drei Werte, developer-only wie bisher).
- Frontend-Reporter: `apiFetch`-Fehler melden zusätzlich `kontext.methode`
  (aus `options.method`, Default GET), damit die Regel greifen kann.
- Developer-Seite: farbiges Schwere-Badge, Sortierung hoch → mittel → gering
  (innerhalb dessen nach `LetzterZeitpunkt`), Filter-Dropdown, Schwere je
  Eintrag per Dropdown änderbar.
