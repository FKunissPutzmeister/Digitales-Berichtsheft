# Digitales Berichtsheft

Digitales Ausbildungs-Berichtsheft für Putzmeister-Auszubildende und DH-Studenten.
Ersetzt das klassische Papier-Berichtsheft durch eine Web-Anwendung mit Wochen-
und Jahresansicht, Abteilungs-Durchlaufplanung, Beurteilungsbögen, Fahrgeld-
erstattung, PDF-Importen (SAP ESS / IHK) und einem zweistufigen Genehmigungs-
Workflow. Produktiv-Login über Azure AD / Microsoft Entra ID (SAML 2.0).

Ausgeliefert wird `app/` (Frontend, Vanilla JS) + `backend/` (Node.js/Express +
`mssql`). Statisches Frontend und API laufen im Dev-Betrieb auf **einem** Port.

---

## Projektstatus

| Bereich | Status |
| --- | --- |
| Frontend – 17 Seiten (HTML/CSS/JS, rollenbasiert) | ✅ erledigt |
| Putzmeister-Design-System (Design-Tokens, Liquid-Glass, mehrere Themes) | ✅ erledigt |
| Node.js-Backend (Express 5 + `mssql`, REST-API, Session-Auth) | ✅ erledigt |
| **Datenbank-Schema als nummerierte SQL-Migrations** (`db/migrations/`, 25 Skripte) | ✅ erledigt |
| Zweistufiger Genehmigungs-Workflow (Prüfer erstgenehmigt → Ausbilder endgenehmigt) | ✅ erledigt |
| Beurteilungsbögen (Erfassung + PDF-Export) | ✅ erledigt |
| Fahrgelderstattung (Formular F6344-1, Signatur, Excel-/PDF-Vorschau) | ✅ erledigt |
| Abteilungsverwaltung + Abteilungs-Planer (Durchlaufplanung, Beurteilungssignale) | ✅ erledigt |
| Nutzerverwaltung + Vertretungen | ✅ erledigt |
| SAP-ESS- und IHK-PDF-Import (client-side) | ✅ erledigt |
| Benachrichtigungen + Mitteilungen-Feed | ✅ erledigt |
| Berichtsheft-Export (JSON-Backup + PDF-Ausbildungsnachweis) | ✅ erledigt |
| Fehlerberichte (Frontend + Backend, Dev-Ansicht) | ✅ erledigt |
| MCP-Server (Bearer-API-Key-Auth) für externen Tages-Import | ✅ erledigt |
| Entra-Gruppen-Sync (Microsoft Graph, App-only) für Rollenvergabe | ✅ erledigt |
| **SSO über SAML 2.0** (App-Level, Node als Service Provider) inkl. Rollen-Mapping | ✅ E2E verifiziert / live auf Dev-Server |
| IIS-Reverse-Proxy → Node (Dev-Server, `nssm`) | ✅ eingerichtet |
| Tablet-/Mobile-Optimierung (Breakpoints, mobile Navigation) | ✅ erledigt |
| Automatisierte Tests (`node:test`, 17 Test-Dateien) | ✅ laufend gepflegt |

---

## Rollen

Die Basisrolle kommt aus der SAML-Assertion (`azubi` / `pruefer`); Sonderrollen
und Zusatz-Tags stehen in der DB und werden vom Entra-Gruppen-Sync gepflegt.

| Rolle / Flag | Bedeutung |
| --- | --- |
| `azubi` | Führt ein eigenes Berichtsheft (Wochen erfassen, freigeben) |
| `dhstudent` | Duales-Studium-Variante; eigene Landing-Page (`abteilungsdurchlauf.html`) statt Berichtsheft |
| `pruefer` | Prüft und **erstgenehmigt** Wochen; ist implizit ausbilderfähig |
| `IstAusbilder` (Flag) | **Endgenehmigt** Wochen, betreut Azubis, schreibt Beurteilungen |
| `KannPlanen` (Flag) | Darf Abteilungsdurchläufe planen (Abteilungs-Planer) |
| `admin` | Nutzer-, Abteilungs- und API-Key-Verwaltung |
| `developer` | Allowlist-Rolle; kann die eigene Ansicht per Session-Switch heben (azubi ↔ developer), sieht alle Themes |

---

## Features

### Seiten

| Seite | Datei | Beschreibung |
| --- | --- | --- |
| Login | `app/index.html` | SAML-SSO-Button; im Dev-Betrieb passwortloser Demo-Login (.demo-Konten) |
| Dashboard | `app/dashboard.html` | Rollenbasiert: Azubi-Übersicht oder Prüfer/Ausbilder-Cockpit mit Posteingang und Durchlauf-Übersicht |
| Wochenansicht | `app/wochenansicht.html` | Tageweise Eingabe (Anwesenheit, Ort, Dauer, Eintrag); Freigabe-/Genehmigungs-Workflow, Kommentare, Anhänge |
| Jahresansicht | `app/jahresansicht.html` | Alle Kalenderwochen eines Jahres auf einen Blick |
| Ausbildungsstand | `app/ausbildungsstand.html` | Kompetenz- und Fortschritts-Tracking |
| Abteilungs-Planer | `app/abteilungs-planer.html` | Durchlaufplanung: Azubis den Abteilungen/Zeiträumen zuordnen (Board), Export |
| Abteilungsdurchlauf | `app/abteilungsdurchlauf.html` | Durchlauf-Übersicht (u. a. Landing-Page für DH-Studenten) |
| Abteilungsverwaltung | `app/abteilungsverwaltung.html` | Abteilungskatalog + Verantwortliche pflegen |
| Beurteilungen | `app/beurteilungen.html` | Liste fälliger/erledigter Beurteilungen |
| Beurteilung | `app/beurteilung.html` | Beurteilungsbogen erfassen; PDF-Export |
| Fahrgelderstattung | `app/fahrgelderstattung.html` | Antrag F6344-1 mit Stammdaten, Signatur (zeichnen/tippen/hochladen), Vorschau |
| Nutzerverwaltung | `app/nutzerverwaltung.html` | Nutzer, Rollen, Ausbilder-Zuordnung, API-Zugriff (admin) |
| Mitteilungen | `app/mitteilungen.html` | Aktivitäts-/Benachrichtigungs-Feed |
| Profil | `app/profil.html` | Profildaten, Import-Funktionen, Backup/Export, Vertretungen |
| DH-Profil | `app/dh-profil.html` | Profil-Variante für DH-Studenten |
| Berichtsheftverwaltung | `app/berichtsheftverwaltung.html` | Berichtsheft eines Azubis einsehen/verwalten |
| Fehlerberichte | `app/fehlerberichte.html` | Gesammelte Frontend-/Backend-Fehler (Dev/Admin) |

> `app/azubi-planer.html` existiert noch als Vorläufer des Abteilungs-Planers.

### Zweistufiger Genehmigungs-Workflow

| Status | Wer | Aktion |
| --- | --- | --- |
| `offen` | Azubi | Einträge erfassen, jederzeit bearbeitbar |
| `freigegeben` | Azubi → Prüfer | Azubi gibt Woche frei |
| `erstgenehmigt` | Prüfer → Ausbilder | Prüfer genehmigt erst; Endabnahme durch Ausbilder nötig |
| `genehmigt` | Ausbilder | Endgenehmigt; für Azubi schreibgeschützt |
| `abgelehnt` | Prüfer/Ausbilder | Zurückgegeben mit Begründung (Pflicht); Azubi überarbeitet und gibt erneut frei |

Ein Flag `EndabnahmeDirekt` erlaubt, die Zweistufigkeit zu überspringen
(Automat in `services/zugriff.js`). Die Begründung beim Zurückgeben wird als
Kommentar (`typ: 'abgelehnt'`) gespeichert und im Status-Banner angezeigt.

### Beurteilungen

- Beurteilungsbögen für Auszubildende und DH-Studenten (Kriterien in Blöcken,
  Punkte → Note); Kern-Logik in `beurteilung-core.js` (Node-testbar)
- Übersicht fälliger/erledigter Beurteilungen; Kenntnisnahme durch den Azubi
- PDF-Export im Putzmeister-Layout

### Fahrgelderstattung

- Antrag nach Formular **F6344-1** mit Stammdaten aus dem Profil
- Signatur per Zeichnen, Tippen oder Upload (`fahrtgeld-signatur.js`) → PNG in den Antrag eingebettet
- Vorschau als originalgetreue Formular-Replik; Feld-Längen werden Frontend
  (`maxlength`) **und** Backend (400 statt roher TDS-500) validiert

### Abteilungs-Planer & -verwaltung

- Durchlaufplanung: Azubis Abteilungen und Zeiträumen zuordnen (Zuweisungen mit
  Verantwortlichem per E-Mail); Board-Ansicht, Export (CSV/Druck)
- Abteilungskatalog mit hinterlegten Verantwortlichen
- Signale auf dem Dashboard: Azubis ohne Zuweisung, bald ablaufende/beginnende Durchläufe

### PDF-Importe (client-side, via pdf.js)

**SAP-ESS-Zeitnachweis** — PDF-Export aus SAP ESS → tagesweise Anwesenheits-,
Ort- und Dauerdaten; Vorschau mit Konflikterkennung; kein Upload an den Server.

**IHK-Berichtsheft** — PDF aus dem IHK-Portal → wöchentliche Daten; erkennt
Betrieb/Schule/Urlaub/Feiertag/Zeitausgleich/Krank; übernimmt IHK-Status;
schützt bereits freigegebene/genehmigte Wochen und vorhandene Texteinträge.
Wichtig: nur PDFs **mit Textebene** sind parsebar (kein „Print to PDF"-Bild).
Parser (`ihk-parser.js`, `zeitnachweis-parser.js`) sind ohne DOM Node-testbar.

### Export & Backup

- JSON-Backup aller Wochen (Import mit Konflikt-/Fremdkonto-Warnung)
- PDF-„Ausbildungsnachweis" (Deckblatt + Wochenseiten) via `berichtsheft-export.js`

### Benachrichtigungen & Mitteilungen

- Ereignisse (freigegeben / erst-/endgenehmigt / zurückgegeben / Beurteilung /
  Versetzung / Vertretung) erzeugen Benachrichtigungen; Topbar zeigt ungelesene
- Mitteilungen-Seite bündelt die Aktivität als chronologischen Feed

### Themes & Design

- Design-Tokens (`variables.css`), Liquid-Glass-Effekte, Hell-/Dunkel-Modus
- Zusätzliche Themes (`theme-silk/cmd/hyperspace/candy/…`) und Saison-Themes
  (Halloween/Christmas). Custom-Themes: Azubi + Developer; Saison-Themes: Developer.

### Betrieb & Integrationen

- **MCP-Server** (`backend/mcp/`) mit Bearer-API-Key-Auth für externen Tages-Import
- **Entra-Gruppen-Sync** (Microsoft Graph, App-only): mappt Azure-Gruppen auf Rollen
- **Fehlerberichte**: Frontend- und Backend-Fehler werden persistiert (90-Tage-Cleanup)
- **Namensanzeige**: Personennamen werden überall via `displayName()` als
  „Vorname Nachname" gerendert (Backend liefert „Nachname, Vorname" roh)

### Tablet- & Mobile-Optimierung

- Breakpoints für Sidebar (256 → 220 → Icon-Only → mobil) und Dashboard-Hero
- Mobiler Menü-Button + Drawer (in `initLayout` erzeugt, falls im Seiten-Shell fehlend)
- Performance-Layer (`will-change`, `contain`, `touch-action`, passive Listener,
  `debounce` auf resize) und iPad-Viewport-Fixes (`safe-area-inset`, kein Bounce)

---

## Tech Stack

| Komponente | Wahl |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript (kein Framework) |
| CSS-Architektur | Design-Tokens, Bento-Grid, Liquid-Glass, mehrere Themes |
| Rich-Text-Editor | Quill 2 + `quill-table-better` (vendored, `app/js/vendor/`) |
| PDF | pdf.js (Import, client-side), pdf-lib (Erzeugung) |
| Excel | exceljs (vendored) für Fahrgeld-Vorschau/Export |
| Effekte | ogl (`light-rays.js`) |
| Backend | Node.js + Express 5 + `mssql`-Treiber |
| Datei-Uploads | multer (Anhänge) |
| Auth (Dev) | Session-basiert, passwortloser Demo-Login (nur `.demo`-Konten) |
| Auth (Produktion) | Azure AD / Entra ID über **SAML 2.0** — Node als Service Provider (`@node-saml/node-saml` 5) |
| Sessions | `express-session` + `session-file-store` (mit Windows-Härtung, siehe unten) |
| Datenbank | Microsoft SQL Server (Express 2022 auf dem Dev-Server) |
| Webserver (Prod) | IIS (Reverse Proxy zu Node auf `localhost:3000`) |
| Tests | Node-Test-Runner (`node:test`), co-located `*.test.js` |
| Versionskontrolle | Git + GitHub |

---

## Repository-Struktur

```
.
├── app/                          # Frontend (Vanilla JS)
│   ├── css/                      # variables/base/layout/components/glass + je Seite + theme-*
│   ├── js/
│   │   ├── app.js                # Auth-Guard, Layout/Sidebar, mobiler Menü-Button, Toast, debounce
│   │   ├── api.js                # HTTP-Layer + DB-Objekt (alle async)
│   │   ├── router.js             # SPA-artige Navigation
│   │   ├── dashboard.js          # Azubi- und Prüfer/Ausbilder-Dashboard
│   │   ├── wochenansicht.js      # Wochen-UI, Status-Workflow, Kommentare, Anhänge
│   │   ├── beurteilung*.js        # Beurteilungsbogen (core = Node-testbar) + Liste
│   │   ├── fahrgelderstattung.js / fahrtgeld-core.js / fahrtgeld-signatur.js
│   │   ├── abteilungs-planer.js / abteilungsdurchlauf.js / abteilungsverwaltung.js
│   │   ├── nutzerverwaltung.js / mitteilungen.js / profil.js / dh-profil.js
│   │   ├── berichtsheft-export.js # JSON-Backup + PDF-Ausbildungsnachweis
│   │   ├── ihk-parser.js / ihk-import.js / zeitnachweis-parser.js / zeitnachweis-upload.js
│   │   ├── error-reporter.js / fehlerberichte.js
│   │   ├── theme.js / react-theme-layer.js / light-rays.js / icons.js / topbar-ds.js
│   │   └── vendor/               # quill(+table-better), pdf.js, pdf-lib, exceljs, ogl
│   └── *.html                    # 17 Seiten (siehe Feature-Tabelle)
├── backend/
│   ├── routes/                   # users, wochen, zuweisungen, vertretungen, abteilungen,
│   │   │                         #   kommentare, anhaenge, benachrichtigungen, fahrtgeld,
│   │   │                         #   beurteilungen, ihk-imports, sync, apiKeys, fehlerberichte,
│   │   │                         #   saml, dev-login
│   ├── services/                 # Fach-/DB-Logik: users, zugriff, abteilungen, beurteilungen,
│   │   │                         #   ausbilderAzubis, vertretungen, entraSync, apiKeys,
│   │   │                         #   userPhotos, fehlerberichte, session-store
│   ├── middleware/auth.js        # devAuth / requireAuth (+ devView-Elevation)
│   ├── config/
│   │   ├── saml.js               # node-saml-Konfiguration (Load-Time-Snapshot)
│   │   └── saml/azure-idp-metadata.xml   # öffentlicher IdP-Signaturschlüssel (kein Secret)
│   ├── mcp/                       # MCP-Server (server.js, tools.js) mit API-Key-Auth
│   ├── db/
│   │   ├── connection.js, run-sql.js
│   │   └── *.sql, import-users.js, seed-*.sql / seed-*.js
│   ├── server.js                 # App-Bootstrap, Session, Routen-Mounting, statisches Frontend
│   └── .env.example
├── db/
│   └── migrations/               # 001…025 nummerierte, idempotente SQL-Migrations
├── docs/
│   ├── dashboard-durchlauf-layout.md
│   └── superpowers/{specs,plans,prompts}/
├── CLAUDE.md                     # Hinweise für KI-Assistenten
└── README.md
```

---

## Backend — API-Übersicht

Alle `/api/*`-Routen (außer Auth/SAML) laufen hinter `devAuth`/`requireAuth`.
Der MCP-Endpunkt `/mcp` nutzt eigene Bearer-API-Key-Auth.

### Auth & SSO

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| POST | `/api/auth/login`, `/api/auth/login-by-email` | Dev-Login (nur außerhalb Produktion, nur `.demo`-Konten) |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/me` | Eingeloggten User zurückgeben |
| POST | `/api/auth/dev-view` | Ansicht heben/senken (Allowlist-Nutzer) |
| GET/POST | `/api/auth/saml/{status,login,acs,logout}` | SAML-Service-Provider-Flow |

### Fachliche Routen (Basis-Pfad → Zweck)

| Basis-Pfad | Router | Zweck |
| --- | --- | --- |
| `/api/users` | `users.js` | Nutzer, `/me/azubis`, Foto, Ausbilder-Zuordnung |
| `/api/wochen` | `wochen.js`, `kommentare.js`, `anhaenge.js` | Wochen (Upsert), Status, Kommentare, Anhänge |
| `/api/zuweisungen` | `zuweisungen.js` | Durchlauf-Zuweisungen, `/meine-pruefungen[-kommend]` |
| `/api/vertretungen` | `vertretungen.js` | Vertretungsregelungen |
| `/api/abteilungen` | `abteilungen.js` | Abteilungskatalog + Verantwortliche |
| `/api/beurteilungen` | `beurteilungen.js` | Beurteilungen, `/faellig`, `/meine`, abschließen, Kenntnisnahme |
| `/api/fahrtgeld` | `fahrtgeld.js` | Fahrgeld-Konfiguration (GET/PUT, validiert) |
| `/api/benachrichtigungen` | `benachrichtigungen.js` | Benachrichtigungen (Liste, Count, gelesen) |
| `/api/ihk-imports` | `ihk-imports.js` | Server-seitiger Tages-Import (auch via MCP) |
| `/api/sync` | `sync.js` | Entra-Gruppen-Sync anstoßen |
| `/api/apikeys` | `apiKeys.js` | API-Keys für MCP/externe Clients |
| `/api/errors`, `/api/dev/errors` | `fehlerberichte.js` | Fehler melden / einsehen |
| `/mcp` | `mcp/server.js` | MCP-Tools (Bearer-API-Key) |

---

## SSO / SAML-Anbindung (Azure AD / Microsoft Entra ID)

Der Produktiv-Login läuft über **SAML 2.0** als **App-Level**-Integration: das
Node/Express-Backend ist selbst der SAML **Service Provider (SP)** und empfängt/
validiert die Assertion (`@node-saml/node-saml`). **Kein MSAL/OIDC.** Nutzer
werden über die Azure-Object-ID (`oid`, GUID) identifiziert; im Dev-Betrieb
ersetzt die `devAuth`-Middleware den SSO-Flow (passwortloser `.demo`-Login).

**Produktions-Host:** `https://berichtsheft.putzmeister.com`

### Azure-Konfiguration (Enterprise App → Basic SAML Configuration)

| Feld | Wert |
| --- | --- |
| Identifier (Entity ID) | `DigitalesBerichtsheft` (schlichter String, identisch mit `SAML_ISSUER`) |
| Reply URL (ACS) — Prod / lokal | `…/api/auth/saml/acs` bzw. `http://localhost:3000/api/auth/saml/acs` |
| Logout URL | `…/api/auth/saml/logout` |
| Tenant-ID | `b5ce0e47-3753-4f10-b705-9d0447ccf182` |
| IdP-Metadata | `backend/config/saml/azure-idp-metadata.xml` (öffentlich, kein Secret) |
| Signaturzertifikat | gültig bis **2029-06-16** (vor Ablauf rotieren) |

### Attribut-Mapping

| Claim in der Assertion | Verwendung |
| --- | --- |
| `objectid` (Custom-Claim, **nicht** `…/objectidentifier`) | Primärschlüssel → `oid` |
| `emailaddress` / `displayname` | E-Mail / Anzeigename |
| `.../claims/role` (`azubi` / `pruefer`) | Basisrolle → `parseRoleClaim` |
| `Beruf` (optional, aus jobTitle) | Ausbildungsberuf |

Wichtig: `disableRequestedAuthnContext: true` in `backend/config/saml.js` ist
Pflicht (sonst `AADSTS75011`, weil per X509/Zertifikat + MFA authentifiziert wird).

### Status (E2E verifiziert)

SP-Handshake und **Rollen-Mapping** sind implementiert und live getestet: echter
Login → Microsoft → Assertion → `upsertUser` → Session, mit rollengerechter
Landing-Page (`landingPathForUser`: DH-Studenten → `abteilungsdurchlauf.html`,
sonst `dashboard.html`). Die Feinvergabe von Rollen läuft über den
**Entra-Gruppen-Sync** (Microsoft Graph, App-only).

### Session-Härtung (Windows)

`session-file-store` hat nur beim Lesen (`get`) Retries. Unter Windows kollidiert
das atomare Rename beim Schreiben sporadisch mit Datei-Locks (`EPERM`), was den
per-Request-TTL-Bump (`touch`) als `[unhandled]` in die Fehlerberichte spammte.
`hardenWrites` (`services/session-store.js`) ergänzt Retries für `set`/`touch`
und schluckt einen endgültigen `touch`-Fehler (harmloser TTL-Bump); `set`-Fehler
bleiben sichtbar. Für Produktion ist ein DB-gestützter Store zu erwägen.

---

## Datenbank & Migrations

Das Schema wird **ausschließlich** über nummerierte, idempotente SQL-Skripte
unter `db/migrations/` gepflegt (`001…025`). Keine händischen Änderungen in SSMS
ohne entsprechendes Skript.

```powershell
# Migration/Skript gegen die konfigurierte DB ausführen:
node backend/db/run-sql.js db/migrations/025_mcp_log.sql
# Demo-Daten seeden (Beispiel):
node backend/db/run-sql.js backend/db/seed-dhstudent-demo.sql
```

Demo-Nutzer verwenden isolierte `.demo`-E-Mails, damit der Entra-Import (E-Mail-
Merge) keine echten Konten kapert.

---

## Lokales Setup

### Wichtig: Arbeitsort

Das Repo wird **ausschließlich lokal** unter `C:\Dev\Digitales-Berichtsheft\`
betrieben — **niemals** in SharePoint/OneDrive oder einem anderen synchronisierten
Cloud-Ordner (Datei-Locks korrumpieren `.git`, erzeugen „Conflicted Copy"-Dateien
und kollabieren bei `node_modules`). **GitHub ist Quelle der Wahrheit und Backup.**

### Erst-Setup

```powershell
mkdir C:\Dev; cd C:\Dev
git clone https://github.com/FKunissPutzmeister/Digitales-Berichtsheft.git
cd Digitales-Berichtsheft\backend
npm install
copy .env.example .env   # .env mit DB-/SAML-/Graph-Werten befüllen
```

### Backend + Frontend starten

```powershell
cd backend
npm run dev   # node --watch server.js (Auto-Reload)
# oder: npm start   # node server.js
```

`server.js` liefert das Frontend statisch aus **und** stellt die API bereit —
die App immer über **`http://localhost:3000/`** öffnen (öffnet `/app/index.html`).
Ein separater Live Server (Port 5500) spaltet Frontend/API und führt zu
404/401-Verwirrung; nur im Notfall nutzen (`api.js` erkennt Port 5500 und zeigt
dann auf `http://localhost:3000/api`).

### Tests

```powershell
cd backend
node --test                       # alle Backend-Tests
node --test services/users.test.js  # einzelne Datei
```

### `.env`-Konfiguration (`backend/.env`)

```ini
PORT=3000
DB_SERVER=azrweurwebdev\SQLEXPRESS2024
DB_NAME=Berichtsheft
DB_USER=<sql-user>
DB_PASSWORD=<sql-passwort>
SESSION_SECRET=<langer-zufälliger-string>   # in Produktion Pflicht

# SAML / Azure AD (Service Provider)
SAML_ENTRY_POINT=https://login.microsoftonline.com/<tenant>/saml2
SAML_LOGOUT_URL=https://login.microsoftonline.com/<tenant>/saml2
SAML_ISSUER=DigitalesBerichtsheft
SAML_CALLBACK_URL=http://localhost:3000/api/auth/saml/acs
SAML_IDP_METADATA_PATH=./config/saml/azure-idp-metadata.xml

# Entra-Gruppen-Sync (Microsoft Graph, App-only) — fehlt ein Pflichtwert → Sync aus
GRAPH_TENANT_ID=<tenant>
GRAPH_CLIENT_ID=<app-id>
GRAPH_CLIENT_SECRET=<secret>
SYNC_GROUP_PRUEFER=<gruppen-oid>
SYNC_GROUP_AZUBI=<gruppen-oid>
SYNC_GROUP_DHSTUDENT=<gruppen-oid>
SYNC_INTERVAL_HOURS=6
```

`NODE_ENV=production` aktiviert `cookie.secure`, `trust proxy` und deaktiviert
den Dev-Login; ohne `SESSION_SECRET` bricht der Start dann bewusst ab.

---

## Dev-Server (Produktions-nahe Umgebung)

- **Host:** `azrweurwebdev` (Azure-VM, intern; nur über Firmennetz/VPN)
- **Webserver:** IIS mit URL Rewrite + ARR → Reverse Proxy auf Node (`localhost:3000`)
- **Node-Prozess:** als Windows-Dienst via `nssm` (überlebt Neustarts)
- **SQL Server:** Express 2022, Instanz `SQLEXPRESS2024`, TCP 1433, Windows-Auth

ARR-Hinweise für SSO: `reverseRewriteHostInResponseHeaders=False` und in IIS
„Anonyme Authentifizierung / Clientzertifikate ignorieren" — sonst schlägt der
SAML-ACS-POST fehl. `.env` auf dem Server manuell pflegen und den Dienst neu starten.

---

## Git-Workflow

```powershell
git pull                          # Morgens: aktuellen Stand holen
git add <dateien>
git commit -m "Beschreibung"
git push                          # Abends / vor Pausen
```

Hinweis: CSS/JS-Änderungen erscheinen dank `Cache-Control: no-cache` (ETag-
Revalidierung) sofort — bei SPA-Navigation ggf. `Strg+F5`.

### Branches

- `Digitales-Berichtsheft` — Haupt-Entwicklungsbranch (de-facto „live" für das Team)
- `main` — Standard-Branch, aktuell nicht aktiv genutzt

---

## Team

- **Florian Kuniß** — Entwickler (Frontend, Backend, Datenbank, Azure-AD-Anbindung)
- **Florian Kern** — Entwickler (Frontend, Architektur, Designoptimierung)

---

## Notiz für KI-Assistenten (Claude Code, Copilot etc.)

1. **Arbeitsverzeichnis:** `C:\Dev\Digitales-Berichtsheft\` (kein SharePoint/OneDrive).
2. **Aktiver Branch:** `Digitales-Berichtsheft`.
3. **App starten:** `cd backend && npm run dev` → App **und** API auf `http://localhost:3000/`.
   Immer über :3000 öffnen (nicht Live Server :5500). Plain `node`, kein Auto-Reload
   außer `--watch` → bei neuer Route ggf. Server neu starten.
4. **DB-Konvention:** Schema-Änderungen NUR als nummerierte `.sql` unter `db/migrations/`
   (idempotent), ausführen mit `node backend/db/run-sql.js <datei>`.
5. **IDs sind GUIDs:** User/Azubi/Ausbilder-IDs sind GUID-Strings — nie `parseInt`
   (nur Woche/Zuweisung/Benachrichtigung sind Integer).
6. **Namensanzeige:** Personennamen überall via `displayName()` als „Vorname Nachname";
   Backend liefert „Nachname, Vorname" roh (Fahrtgeld-Formular ist bewusste Ausnahme).
7. **Auth:** Dev = passwortloser `.demo`-Login; Produktion = SAML 2.0 (App-Level,
   `@node-saml/node-saml`) — kein MSAL/OIDC. Rollen: `azubi`/`pruefer` aus dem Claim,
   Sonderrollen/Flags aus der DB (Entra-Gruppen-Sync).
8. **Genehmigung:** zweistufig — Prüfer `erstgenehmigt` → Ausbilder `genehmigt`
   (Flag `EndabnahmeDirekt` überspringt). Readonly-Guards sind über mehrere Dateien
   verstreut (wochenansicht/api/ihk-import/dashboard) — bei neuem Sperr-Status alle prüfen.
9. **PDF-Parser sind Node-testbar** (`ihk-parser.js`, `zeitnachweis-parser.js`);
   viele Backend-Module haben co-located `*.test.js` (`node --test`).
10. **Dashboard-Durchlauf-Layout:** vor Änderungen `docs/dashboard-durchlauf-layout.md`
    lesen (zwei abgestimmte Varianten dokumentiert).
