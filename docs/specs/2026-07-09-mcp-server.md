# Spec: MCP-Server für das Digitale Berichtsheft („Snipe-IT-Modell")

Stand: 2026-07-09 · Product Owner: Florian Kern · Status: Richtung freigegeben

## Modell (analog Snipe-IT)

Der MCP-Server läuft **im Intranet** (keine öffentliche Exponierung, kein IT-Antrag). Zugriff erfolgt mit einem **persönlichen API-Key** aus lokal laufenden Clients: Claude Code (direkt, HTTP-MCP) und Claude Desktop (stdio-Bridge, z. B. `mcp-remote`, mit Key als Header). claude.ai-Web-Connectors und Perplexity-Web erfordern eine öffentliche URL → **Phase 2** (nur falls IT je Exponierung stellt; Perplexity-Desktop-Lokal-Support wird geprüft).

## Zugriffsverwaltung (PO-Vorgabe)

Neue Sektion **„API-Zugriff"** in der Nutzerverwaltung (developer-only): Developer nimmt Nutzer auf → pro Nutzer wird ein persönlicher Key generiert (**einmalig im Klartext angezeigt**, danach nur Hash), widerrufbar (Aktiv-Toggle/Löschen). Nur aufgenommene Nutzer können den MCP verwenden.

**Migration 017 — `dbo.ApiKeys`:** Id INT IDENTITY PK · UserOid NVARCHAR(36) → Users · KeyHash NVARCHAR(64) (SHA-256) · Label NVARCHAR(100) · Aktiv BIT default 1 · ErstelltAm DATETIME2 · ZuletztGenutzt DATETIME2 NULL. Key-Format `pmb_<32 zufällige Bytes base64url>`.

## Architektur

- Eigenes Verzeichnis `mcp/` im Repo, Node + offizielles `@modelcontextprotocol/sdk`, **Streamable HTTP** (kein SSE-Neubau), gemountet als eigener Prozess ODER Route am bestehenden Express (Entscheidung bei Umsetzung; Präferenz: Route `/mcp` am bestehenden Server = ein Deployment).
- Auth-Middleware: `Authorization: Bearer pmb_…` → Hash-Lookup in ApiKeys (Aktiv=1, User Aktiv=1) → `buildReqUser` → **identische RBAC wie die App** (effektive Rolle, nie `!istAzubi`). `ZuletztGenutzt` wird aktualisiert.
- Tools rufen die bestehende Service-/Routen-Logik auf (kein Duplikat der Businessregeln), Antworten datensparsam (nur nötige Felder).

## Tools (kuratiert, v1)

| Tool | Wer | Wirkung |
|---|---|---|
| `wochen_liste(jahr?, status?)` | eigener Kontext; Planer/Ausbilder optional `azubi` | Wochen mit Status |
| `woche_lesen(kw, jahr, azubi?)` | wie oben | Volle Woche (Texte, Tage, Kommentare) |
| `woche_schreiben(kw, jahr, betrieb?, schule?, unterweisung?, tage?)` | nur eigenes Heft, nur Status offen/abgelehnt | Einträge schreiben. **Kein Statuswechsel/Freigeben/Genehmigen via MCP** |
| `durchlauf_lesen(azubi?)` | eigener bzw. berechtigter Kontext | Stationen mit Zeiträumen |
| `azubis_suchen(query)` | nur kannPlanen/istAusbilder | Namenssuche für die azubi-Parameter |

## Risiken / Hinweise

Tool-Antworten fließen in Cloud-LLMs (Anthropic/Perplexity). Rollout ist per Nutzerverwaltung gated — Start: nur Florian (eigene Daten). Vor Aufnahme weiterer Nutzer: Datenschutz/Betriebsrat kurz einbinden. Schreiben ist auf Wochentexte des eigenen Hefts begrenzt; IHK-relevante Statusübergänge bleiben in der App.

## Verifikation

(1) Tool-Aufrufe mit gültigem Key liefern nur rollenkonforme Daten (Azubi-Key sieht fremde OIDs nicht); (2) inaktiver Key/gesperrter User → 401; (3) `woche_schreiben` verweigert fremde Hefte und freigegebene/genehmigte Wochen; (4) Anbindung real getestet in Claude Code gegen `http://localhost:3000/mcp`.
