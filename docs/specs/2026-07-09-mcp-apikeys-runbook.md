# Runbook: MCP-Server + API-Schlüssel (Stand 2026-07-09)

Operatives Handbuch für den MCP-Zugriff aufs Digitale Berichtsheft ("Snipe-IT-Modell":
intranet-only, persönlicher API-Schlüssel, Nutzung aus lokal laufendem Claude).

## Was wurde geändert

| Datei | Zweck |
|---|---|
| `db/migrations/017_api_keys.sql` | Tabelle `dbo.ApiKeys` (idempotent) |
| `backend/db/run-sql.js` | generisches Skript zum Anwenden einer SQL-Datei |
| `backend/services/apiKeys.js` | Key erzeugen/hashen/auflösen/verwalten |
| `backend/routes/apiKeys.js` | `GET/POST/PATCH/DELETE /api/apikeys` (developer-only) |
| `backend/mcp/tools.js` | 5 MCP-Tools (RBAC über `buildReqUser` + `services/zugriff`) |
| `backend/mcp/server.js` | `POST /mcp` (Streamable HTTP, JSON-RPC 2.0, Bearer-Auth) |
| `backend/server.js` | mountet `/api/apikeys` (devAuth) und `/mcp` (eigene Bearer-Auth) |
| `app/js/api.js` | DB-Methoden `getApiKeys/createApiKey/setApiKeyAktiv/deleteApiKey` |
| `app/js/nutzerverwaltung.js` | Sektion „API-Zugriff (MCP)" |

Kein `npm install` nötig – der MCP-Endpunkt ist ohne zusätzliche Abhängigkeit umgesetzt
(nur Node-`crypto` + vorhandenes `express`/`mssql`).

## DB-Migration anwenden / zurückrollen

**Anwenden** (idempotent, gefahrlos mehrfach ausführbar):
```
cd backend
node db/run-sql.js "../db/migrations/017_api_keys.sql"
```
Erwartete Ausgabe: `dbo.ApiKeys angelegt.` bzw. beim 2. Mal `… existiert bereits`.

**Rollback** (falls nötig – entfernt ALLE Schlüssel):
```sql
-- in SSMS gegen Berichtsheft_Dev:
DROP TABLE dbo.ApiKeys;
```
Der MCP-Endpunkt liefert dann nur noch 401; die restliche App ist nicht betroffen.

## Nutzer aufnehmen & Schlüssel erzeugen (in der App)

1. Als Developer → Nutzerverwaltung → Karte **„API-Zugriff (MCP)"** → **„+ Nutzer aufnehmen"**.
2. Nutzer wählen, Bezeichnung vergeben (z.B. „Claude Desktop – Laptop"), **Schlüssel erstellen**.
3. Der Schlüssel (`pmb_…`) wird **einmalig** angezeigt → kopieren. Danach ist nur der SHA-256-Hash gespeichert; verloren = neuen erstellen.

**Widerruf:** in derselben Karte „Deaktivieren" (sofort gesperrt, reaktivierbar) oder „Löschen" (endgültig). Sperren eines Nutzers (Aktiv=0) sperrt automatisch auch seine Schlüssel.

## Client einrichten (lokal, im Intranet)

Der Server läuft unter `http://localhost:3000/mcp` (bzw. der internen App-URL).
Auth-Header: `Authorization: Bearer pmb_…`.

**Claude Code:**
```
claude mcp add --transport http berichtsheft http://localhost:3000/mcp \
  --header "Authorization: Bearer pmb_DEIN_SCHLUESSEL"
```

**Claude Desktop:** Custom Connector mit obiger URL + Header. Falls die Desktop-Version
nur stdio-Connectors erlaubt, per Bridge:
```
npx mcp-remote http://localhost:3000/mcp --header "Authorization: Bearer pmb_DEIN_SCHLUESSEL"
```

> Cloud-Connectors auf claude.ai-Web / Perplexity-Web funktionieren NICHT, weil sich deren
> Cloud nicht mit dem Intranet verbinden kann (siehe Machbarkeits-Brief). Deshalb lokale Clients.

## Tools & Rechte

| Tool | Wer | Wirkung |
|---|---|---|
| `wochen_liste` | eigen; Planer/Ausbilder auch fremd | Wochen (KW/Jahr/Status) |
| `woche_lesen` | wie oben | Volle Woche (Texte, Tage, Kommentare) |
| `woche_schreiben` | nur EIGENES Heft, nur Status offen/abgelehnt | Texte/Tageseinträge; **kein** Statuswechsel |
| `durchlauf_lesen` | eigen; Planer/Ausbilder auch fremd | Rotations-Stationen |
| `azubis_suchen` | nur Planer/Ausbilder | Namenssuche für die `azubi`-Parameter |

RBAC ist identisch zur App (`buildReqUser` + `services/zugriff`): ein Azubi-Schlüssel sieht
ausschließlich das eigene Heft; Freigeben/Genehmigen bleibt bewusst in der App.

## Fehlersuche

- **401 vom /mcp**: Schlüssel falsch/deaktiviert, Nutzer inaktiv, oder kein `Bearer`-Prefix.
- **Tool-Ergebnis mit „isError"**: fachliche Meldung (z.B. „Kein Zugriff auf fremde Berichtshefte") – erwartetes RBAC-Verhalten.
- **`woche_schreiben` verweigert**: Woche ist `freigegeben`/`genehmigt` (schreibgeschützt).
- **Datenschutz**: Tool-Antworten fließen in ein Cloud-LLM. Vor Aufnahme weiterer Nutzer (außer dem Entwickler selbst) Datenschutz/Betriebsrat einbinden.

## Verifikation (durchgeführt 2026-07-09)

Playwright/HTTP: 401 ohne Key, initialize/tools-list/tools-call ok, `azubis_suchen` liefert Treffer,
`woche_schreiben`→`woche_lesen` Roundtrip ok, RBAC (Azubi-Key: keine Suche/kein fremdes Heft),
Key nach Löschen sofort 401, UI-Karte legt an/zeigt einmalig/löscht. Dev-DB danach: 0 Schlüssel.
