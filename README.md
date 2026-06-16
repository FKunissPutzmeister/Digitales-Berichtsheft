# Berichtsheft

Digitales Ausbildungs-Berichtsheft für Putzmeister-Auszubildende. Ersetzt das klassische Papier-Berichtsheft durch eine Web-Anwendung mit Wochenansicht, Jahresplaner, Ausbildungsstand-Tracking und Berichtsheftverwaltung.

---

## Projektstatus

| Bereich | Status |
| --- | --- |
| Frontend – alle 8 Seiten (HTML/CSS/JS) | ✅ erledigt |
| UI mit Putzmeister-Design-System (DS-Topbar, Liquid-Glass-Effekte) | ✅ erledigt |
| SAP-ESS-Zeitnachweis-Import (PDF → Wochenansicht) | ✅ erledigt |
| IHK-Berichtsheft-Import (PDF → wöchentliche Anwesenheitsdaten) | ✅ erledigt |
| Node.js-Backend (Express + mssql, REST-API, Session-Auth) | ✅ erledigt |
| Dev-Auth-Middleware (X-Dev-OID, DEV_USERS) | ✅ erledigt |
| Dev-Server-Anbindung (SQL Server Express, .env) | ✅ eingerichtet und getestet |
| Status-Workflow (freigeben → genehmigen / zurückgeben) | ✅ erledigt |
| Ausbilder-Kommentar-Funktion (inkl. Zurückgeben-Begründung) | ✅ erledigt |
| Benachrichtigungs-System | ✅ erledigt |
| Tablet-Optimierung (Surface Pro & iPad – Performance + Layout) | ✅ erledigt |
| Dashboard BFCache-Refresh (pageshow-Event) | ✅ erledigt |
| **Datenbank-Schema (SQL-Migrations-Skripte)** | **⏳ ausstehend — nach Azure-AD-Klärung** |
| SSO über SAML 2.0 (App-Level, Node als Service Provider) | ⏳ in Arbeit — Enterprise App + Attribut-Mapping fertig (URLs übergeben); SP-Routen im Backend offen |
| IIS-Reverse-Proxy zu Node.js | ⏳ offen |

---

## Features

### Seiten

| Seite | Datei | Beschreibung |
| --- | --- | --- |
| Login | `app/index.html` | E-Mail-/Passwort-Formular, Microsoft SSO-Platzhalter, Demo-Zugänge (eingeklappt) |
| Dashboard | `app/dashboard.html` | Rollenbasiert: Azubi-Übersicht oder Ausbilder-Cockpit mit Posteingang |
| Wochenansicht | `app/wochenansicht.html` | Tageweise Eingabe (Anwesenheit, Ort, Stunden, Eintrag); Freigabe-/Genehmigungs-Workflow |
| Jahresansicht | `app/jahresansicht.html` | Alle Kalenderwochen eines Jahres auf einen Blick |
| Ausbildungsstand | `app/ausbildungsstand.html` | Kompetenz- und Fortschritts-Tracking |
| Azubi-Planer | `app/azubi-planer.html` | Planung und Terminübersicht |
| Berichtsheftverwaltung | `app/berichtsheftverwaltung.html` | Freigabe-Übersicht für Ausbilder |
| Profil | `app/profil.html` | Profildaten + Importfunktionen |

### Freigabe-Workflow

Die Wochenansicht unterstützt einen vollständigen Status-Workflow:

| Status | Wer | Aktion |
| --- | --- | --- |
| `offen` | Azubi | Einträge erfassen, jederzeit bearbeitbar |
| `freigegeben` | Azubi → Ausbilder | Azubi gibt Woche frei; Ausbilder prüft |
| `genehmigt` | Ausbilder | Woche ist abgenommen; für Azubi schreibgeschützt |
| `abgelehnt` | Ausbilder | Woche zurückgegeben mit Begründung (Pflichtfeld); Azubi kann überarbeiten und erneut freigeben |

Beim Zurückgeben öffnet sich ein Modal zur Eingabe der Begründung. Die Begründung wird als Kommentar mit `typ: 'abgelehnt'` gespeichert und im Status-Banner des Azubis angezeigt.

### Ausbilder-Cockpit (Dashboard)

- **Posteingang** — alle freigegeben Berichte, älteste zuerst; Wartezeit-Anzeige (dringend ab 2 Wochen)
- **Filter-Bar** — Suche nach Name / KW, Filter nach Wartedauer, Sortierung
- **Bulk-Aktionen** — mehrere Berichte gleichzeitig genehmigen / zurückgeben
- **Meine Azubis** — Übersicht mit offenen / freigegebenen / genehmigten Zahlen pro Azubi
- **BFCache-Refresh** — kehrt der Ausbilder per Zurück-Schaltfläche zur Dashboard-Seite zurück, werden die Daten automatisch neu geladen

### Kommentar-Funktion (Ausbilder)

- Ausbilder können jederzeit Wochen-Kommentare hinzufügen
- Kommentare sind tagesgebunden (optional) oder wochenweit
- Kommentare mit `typ: 'genehmigt'` entstehen über das Genehmigen-Modal (Tages-Feedback)
- Kommentare mit `typ: 'abgelehnt'` entstehen über das neue Zurückgeben-Modal (Begründung Pflicht)
- Eigene Kommentare können vom Ausbilder gelöscht werden

### Benachrichtigungs-System

- Azubi erhält Benachrichtigung, wenn eine Woche genehmigt oder zurückgegeben wird
- Ausbilder erhält Benachrichtigung, wenn eine Woche freigegeben wird
- Topbar zeigt Badge mit ungelesener Anzahl

### PDF-Importfunktionen (Profil-Seite)

**SAP-ESS-Zeitnachweis-Import**
- PDF-Export aus SAP ESS → tagesweise Anwesenheits-, Ort- und Stundendaten
- Drag-&-Drop oder Dateiauswahl im Browser
- Vorschau mit Konflikterkennung (überschreiben / bestehende schützen)
- Reiner Client-Side-Import via pdf.js (kein Upload an Server)

**IHK-Berichtsheft-Import**
- PDF-Export aus dem IHK-Ausbildungsnachweis-Portal → wöchentliche Daten
- Eine Seite im PDF = eine Ausbildungswoche
- Erkennt: Betrieb, Schule, Betrieb/Schule, Urlaub, Feiertag, Zeitausgleich, Krank
- Übernimmt IHK-Status (offen / freigegeben / genehmigt / abgelehnt)
- Schützt bereits freigegebene/genehmigte Wochen vor Überschreiben
- Erhält vorhandene Texteinträge (`eintrag`-Felder)

### Tablet-Optimierung (Surface Pro & iPad)

Zielgruppe: Keyboard + Touchpad/Maus. Kein Offline-/PWA-Support, keine Touch-Gesten.

**Performance-Layer**
- `will-change: transform` auf Sidebar, Modals, Toasts
- `contain: layout style` auf Wochenkacheln und Stat-Cards (isoliert Reflows)
- `touch-action: manipulation` auf allen interaktiven Elementen (entfernt 300ms Tap-Delay)
- Passive Event-Listener für `scroll`, `touchstart`, `touchmove`, `wheel`
- `debounce(fn, 150)` auf allen `resize`-Handlern

**Viewport & Device-Fixes**
- `viewport-fit=cover` in allen HTML-Seiten
- `env(safe-area-inset-*)` auf Sidebar und Topbar (iPad Notch/Dynamic Island)
- `-webkit-text-size-adjust: 100%` verhindert automatische Font-Inflation
- `overscroll-behavior: none` auf `.main-content` (kein iOS-Bounce)

**Layout-Breakpoints**

| Viewport | Sidebar | Dashboard-Hero |
| --- | --- | --- |
| > 1280px | volle Breite (256px) — unverändert | KW-Zahl 96px, Wochenmini 50px |
| 1024–1280px | kompakt (220px) | KW-Zahl 64px, Wochenmini fluid (`1fr`) |
| 768–1024px | Icon-Only (68px) | — |
| < 768px | versteckt / Mobile | — |

**Quill-Toolbar** scrollt horizontal statt umzubrechen (`overflow-x: auto`).

---

## Tech Stack

| Komponente | Wahl |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript |
| CSS-Architektur | Design-Tokens (`variables.css`), 12-Spalten-Bento-Grid, Liquid-Glass-Effekte |
| PDF-Verarbeitung | pdf.js (vendored, client-side) |
| Rich-Text-Editor | Quill 1.3.7 (CDN) |
| Backend | Node.js + Express 5 + `mssql`-Treiber |
| Auth (Entwicklung) | Session-basiert + DEV_USERS (X-Dev-OID Header) |
| Auth (Produktion) | Azure AD / Microsoft Entra ID über **SAML 2.0** — App-Level Service Provider (`@node-saml/node-saml`) |
| Datenbank | SQL Server Express 2022 |
| Webserver | IIS (Reverse Proxy zu Node.js, geplant) |
| Hosting | Azure-VM (Putzmeister-intern) |
| Versionskontrolle | Git + GitHub |

---

## Repository-Struktur

```
.
├── app/                          # Frontend
│   ├── css/
│   │   ├── variables.css         # Design-Tokens (Farben, Abstände, Animationen)
│   │   ├── base.css              # Globale Stile, Typografie, Resets, text-size-adjust
│   │   ├── layout.css            # App-Shell, Sidebar, Topbar (Tablet-Breakpoints)
│   │   ├── components.css        # Buttons, Cards, Modals, Formulare, touch-action
│   │   ├── glass.css             # Liquid-Glass-Effekte
│   │   ├── topbar-ds.css         # Putzmeister Design System Topbar
│   │   ├── login.css             # Login-Seite
│   │   ├── dashboard.css         # Dashboard + Bento-Grid (inkl. Tablet-Breakpoint)
│   │   ├── wochenansicht.css     # Wochenansicht, Zeit-Spinner, Animationen
│   │   ├── jahresansicht.css
│   │   ├── ausbildungsstand.css
│   │   ├── azubi-planer.css
│   │   ├── berichtsheftverwaltung.css
│   │   ├── profil.css
│   │   └── quill-editor.css      # Quill-Toolbar (overflow-x scroll)
│   ├── js/
│   │   ├── app.js                # Auth-Guard, Sidebar, Toast, debounce-Utility
│   │   ├── api.js                # HTTP-Layer (API_BASE), DB-Objekt (alle async)
│   │   ├── login.js
│   │   ├── dashboard.js          # Azubi- und Ausbilder-Dashboard, BFCache-Refresh
│   │   ├── wochenansicht.js      # Wochenansicht-UI, Status-Workflow, Kommentare
│   │   ├── jahresansicht.js
│   │   ├── ausbildungsstand.js
│   │   ├── azubi-planer.js
│   │   ├── berichtsheftverwaltung.js
│   │   ├── profil.js
│   │   ├── sidebar.js            # Passive scroll-Listener
│   │   ├── topbar-ds.js
│   │   ├── theme.js              # Hell-/Dunkel-Modus (vor CSS geladen)
│   │   ├── icons.js
│   │   ├── zeitnachweis-parser.js
│   │   ├── zeitnachweis-upload.js
│   │   ├── ihk-parser.js
│   │   ├── ihk-import.js
│   │   └── vendor/
│   │       ├── pdf.min.js
│   │       └── pdf.worker.min.js
│   ├── index.html
│   ├── dashboard.html
│   ├── wochenansicht.html        # inkl. rejectModal (Zurückgeben-Begründung)
│   ├── jahresansicht.html
│   ├── ausbildungsstand.html
│   ├── azubi-planer.html
│   ├── berichtsheftverwaltung.html
│   └── profil.html
├── backend/
│   ├── routes/
│   │   ├── users.js
│   │   ├── wochen.js             # GET, POST (upsert), PATCH /:id/status
│   │   ├── zuweisungen.js
│   │   ├── kommentare.js         # POST (add), DELETE (eigene)
│   │   └── benachrichtigungen.js
│   ├── middleware/
│   │   └── auth.js
│   ├── db/
│   │   └── connection.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
├── db/
│   └── migrations/               # SQL-Migrations-Skripte (ausstehend)
├── docs/
│   └── superpowers/
│       ├── specs/                # Design-Spezifikationen
│       └── plans/                # Implementierungspläne
└── README.md
```

---

## Backend — API-Übersicht

### Auth-Endpunkte (öffentlich)

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| POST | `/api/auth/login` | Session-Login (OID + Passwort) |
| POST | `/api/auth/login-by-email` | Login per E-Mail (DEV\_USERS) |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/me` | Eingeloggten User zurückgeben |

### Geschützte Endpunkte (erfordern Auth)

| Methode | Pfad | Beschreibung |
| --- | --- | --- |
| GET | `/api/users` | Alle User (filterbar: `?role=azubi\|ausbilder`) |
| GET | `/api/users/:oid` | Einzelner User nach OID |
| GET | `/api/wochen` | Wochen eines Azubis (`?azubiOid=...`) oder alle |
| GET | `/api/wochen/:id` | Einzelne Woche inkl. Tage und Kommentare |
| POST | `/api/wochen` | Woche anlegen / aktualisieren (Upsert) |
| PATCH | `/api/wochen/:id/status` | Status einer Woche setzen (`offen`, `freigegeben`, `genehmigt`, `abgelehnt`) |
| POST | `/api/wochen/:wocheId/kommentare` | Kommentar zu einer Woche hinzufügen |
| DELETE | `/api/wochen/kommentare/:id` | Eigenen Kommentar löschen |
| GET | `/api/zuweisungen` | Zuweisungen (filterbar nach `azubiOid` / `ausbilderOid`) |
| POST | `/api/zuweisungen` | Neue Zuweisung anlegen |
| DELETE | `/api/zuweisungen/:id` | Zuweisung löschen |
| GET | `/api/benachrichtigungen` | Alle Benachrichtigungen des eingeloggten Users |
| GET | `/api/benachrichtigungen/count` | Anzahl ungelesener Benachrichtigungen |
| PATCH | `/api/benachrichtigungen/:id/gelesen` | Einzelne Benachrichtigung als gelesen markieren |
| PATCH | `/api/benachrichtigungen/alle-gelesen` | Alle Benachrichtigungen als gelesen markieren |

---

## SSO / SAML-Anbindung (Azure AD / Microsoft Entra ID)

**Entscheidung:** Der Produktiv-Login läuft über **SAML 2.0** als **App-Level**-Integration — das Node/Express-Backend ist selbst der SAML **Service Provider (SP)** und empfängt/validiert die Assertion (geplant mit `@node-saml/node-saml`). **Kein MSAL/OIDC.** Die `devAuth`-Middleware (DEV_USERS) wird im Produktivbetrieb dadurch ersetzt; das Datenmodell bleibt unverändert, da User bereits über die Azure-AD-Object-ID (`oid`, GUID) identifiziert werden.

**Produktions-Host:** `https://berichtsheft.putzmeister.com`

### An den Kollegen übergebene URLs (Enterprise App → Basic SAML Configuration)

| Feld in Azure (Entra) | Wert |
| --- | --- |
| Sign on URL | `https://berichtsheft.putzmeister.com/app/index.html` |
| Reply URL (ACS) — Produktion | `https://berichtsheft.putzmeister.com/api/auth/saml/acs` |
| Reply URL (ACS) — lokal/Test | `http://localhost:3000/api/auth/saml/acs` |
| Logout URL | `https://berichtsheft.putzmeister.com/api/auth/saml/logout` |

Die Pfade unter `/api/auth/saml/...` sind frei gewählt und kein Azure-Standard — sie müssen zur Laufzeit **exakt** mit den im Backend implementierten Routen übereinstimmen.

### IdP-Daten von Azure (aus der Federation Metadata)

Die vom Kollegen gelieferte Metadata liegt unter `backend/config/saml/azure-idp-metadata.xml` — **öffentlich, kein Secret** (enthält nur den öffentlichen Signaturschlüssel), darf also ins Repo. Die für `node-saml` relevanten Werte:

| Wert | Inhalt |
| --- | --- |
| Tenant-ID | `b5ce0e47-3753-4f10-b705-9d0447ccf182` |
| IdP Entity-ID (Issuer) | `https://sts.windows.net/b5ce0e47-3753-4f10-b705-9d0447ccf182/` |
| SSO-Endpoint (`entryPoint`) | `https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2` |
| SLO-Endpoint (`logoutUrl`) | `https://login.microsoftonline.com/b5ce0e47-3753-4f10-b705-9d0447ccf182/saml2` |
| Signaturzertifikat | gültig 2026-06-16 → **2029-06-16** (vor Ablauf rotieren, sonst bricht die Signaturprüfung) |
| Angebotene Claims | u. a. `objectidentifier` ✅, `emailaddress`, `displayname`, `name`, `givenname`, `surname`, `groups`, `role` |

### Attribut-Mapping (mit Azure abgestimmt)

Die Enterprise App liefert in der Assertion:

| Claim (Name in der Assertion) | Azure-Quelle | Verwendung in der App |
| --- | --- | --- |
| `objectid` | `user.objectid` | **Primärschlüssel** → unsere `oid` (GUID) |
| `…/claims/emailaddress` | `user.mail` | E-Mail |
| `…/claims/displayname` | `user.displayname` | Anzeigename |
| Name ID | E-Mail / UPN | nur lesbarer Identifier; die Zuordnung läuft über `objectid` |

**Wichtig:** Die Object-ID wird bewusst unter dem eigenen Claim-Namen **`objectid`** ausgeliefert — **nicht** unter `http://schemas.microsoft.com/identity/claims/objectidentifier`. Dieser URI gehört zu Azures *restricted claim set* und kann nicht als Custom-Claim-Name verwendet werden (Fehlermeldung „This claim type is restricted"). Im Backend wird die GUID daher aus `profile['objectid']` gelesen — nicht aus der NameID.

### Noch offen / zu beachten

- **Identifier (Entity ID):** in Azure Pflichtfeld, noch festzulegen — empfohlen `https://berichtsheft.putzmeister.com` bzw. `…/api/auth/saml/metadata`. Muss später **identisch** in der `node-saml`-Config stehen.
- **SP-Routen im Backend ausstehend:** `/api/auth/saml/login` (AuthnRequest auslösen), `/api/auth/saml/acs` (Assertion empfangen, Claim `objectid` → `oid` mappen, Session setzen), `/api/auth/saml/logout` (Single Logout).
- **Login-Button:** „Mit Microsoft anmelden" in `app/index.html` ist noch Platzhalter (`login.js`, zeigt nur `ssoHint`) — wird später auf `/api/auth/saml/login` verdrahtet.
- **Session-Cookie:** in Produktion `cookie.secure` auf `true` setzen (aktuell `false` in `backend/server.js`), sonst geht das Session-Cookie nach dem HTTPS-Redirect verloren.
- **IIS-Reverse-Proxy:** muss `/api/auth/saml/acs` (POST von Azure) ebenfalls an Node auf `localhost:3000` durchreichen.

---

## Lokales Setup

### Wichtig: Arbeitsort

Das Repo wird **ausschließlich lokal** unter `C:\Dev\Digitales-Berichtsheft\` betrieben — **niemals** in SharePoint, OneDrive oder einem anderen synchronisierten Cloud-Ordner.

Cloud-Sync-Mechanismen sind mit Git inkompatibel: Sie korrumpieren den `.git`-Ordner durch Datei-Locks, erzeugen "Conflicted Copy"-Dateien statt echter Merges und kollabieren bei `node_modules`. **GitHub ist Quelle der Wahrheit und Cloud-Backup zugleich.**

### Erst-Setup auf neuem Rechner

```powershell
mkdir C:\Dev
cd C:\Dev
git clone https://github.com/FKunissPutzmeister/Digitales-Berichtsheft.git
cd Digitales-Berichtsheft
cd backend
npm install
copy .env.example .env   # .env mit DB-Zugangsdaten befüllen
```

### Backend starten

```powershell
cd backend
npm run dev   # node --watch server.js (auto-reload bei Änderungen)
# oder:
npm start     # node server.js
```

Der API-Server läuft dann auf `http://localhost:3000`.

### Frontend öffnen

Das Frontend (`app/`) kann direkt im Browser geöffnet oder per Live Server (VS Code Extension) bereitgestellt werden. `api.js` erkennt Port 5500 automatisch und zeigt dann auf `http://localhost:3000/api`.

---

## Dev-Server

- **Hostname:** `azrweurwebdev` (Azure-VM, intern)
- **Webserver:** IIS (vorinstalliert)
- **SQL Server:** Express 2022, Instanz `SQLEXPRESS2024`, fester TCP-Port 1433
- **Zugriff:** Nur über Putzmeister-Firmennetz / VPN; RDP für Admins

### SSMS-Verbindung

| Feld | Wert |
| --- | --- |
| Servername | `azrweurwebdev\SQLEXPRESS2024` |
| Authentifizierung | Windows-Authentifizierung |
| Verschlüsseln | Obligatorisch |
| Serverzertifikat vertrauen | aktivieren (selbst-signiertes Dev-Cert) |

### `.env`-Konfiguration (`backend/.env`)

```ini
DB_SERVER=azrweurwebdev\SQLEXPRESS2024
DB_NAME=Berichtsheft_Dev
DB_USER=<sql-user>
DB_PASSWORD=<sql-passwort>
SESSION_SECRET=<langer-zufälliger-string>
PORT=3000
```

---

## Nächste Schritte

### 1. Datenbank-Schema und Migrations-Skripte

Die SQL-Datenbank existiert auf dem Dev-Server, aber das Schema (Tabellen, Constraints, Indices) wurde noch nicht als versionierte Skripte ins Repo eingecheckt.

**Ausstehend:**
- Klärung, welche Tabellen nach Azure-AD-Integration noch lokal gehalten werden müssen
- Erstellen von `db/migrations/001_initial_schema.sql` und Folge-Skripten

**Konvention:** Schema-Änderungen IMMER als nummerierte `.sql`-Migrations-Skripte unter `db/migrations/`. Keine händischen Änderungen in SSMS ohne entsprechendes Skript.

### 2. Azure-AD-Anbindung (SAML, App-Level)

Produktiv-Login über **SAML 2.0**; das Express-Backend ist der Service Provider (`@node-saml/node-saml`) und ersetzt die `devAuth`-Middleware vollständig. Die Enterprise App richtet der Kollege ein — die URLs wurden bereits übergeben (Details im Abschnitt „SSO / SAML-Anbindung"). **Offen auf unserer Seite:** SP-Routen `/api/auth/saml/{login,acs,logout}` im Backend, Entity-ID festlegen, `cookie.secure=true` für Produktion.

### 3. IIS-Reverse-Proxy-Konfiguration

IIS bekommt URL Rewrite + ARR: terminiert HTTPS, leitet `/api/*` an Node.js auf `localhost:3000` weiter. Statisches Frontend liefert IIS direkt aus.

### 4. IHK-Import: Tägliches PDF-Format (Folge-Feature)

Technische Azubis schreiben auf täglicher Basis. Das zugehörige IHK-PDF-Format unterscheidet sich vom wöchentlichen. Umsetzung, sobald ein Beispiel-PDF vorliegt.

---

## Git-Workflow

### Tägliche Routine

```powershell
git pull                          # Morgens: aktuellen Stand holen
git add <dateien>
git commit -m "Beschreibung"
git push                          # Abends / vor längeren Pausen
```

### Aktive Branches

- `Digitales-Berichtsheft` — Haupt-Entwicklungsbranch (de-facto „live" für das Team)
- `main` — Standard-Branch, aktuell nicht aktiv genutzt

---

## Team

- **Florian Kuniß** — 1. Entwickler (Frontend, Backend, Datenbank, Azure-AD-Anbindung)
- **Florian Kern** — 2. Entwickler (Frontend, Architektur, Designoptimierung)

---

## Notiz für KI-Assistenten (Claude Code, Copilot etc.)

Falls eine neue KI-Session ohne Vorkontext gestartet wird, hier die wichtigsten Informationen:

1. **Arbeitsverzeichnis:** `C:\Dev\Digitales-Berichtsheft\` (NICHT der frühere SharePoint-Pfad — obsolet)
2. **Aktiver Branch:** `Digitales-Berichtsheft`
3. **Aktueller Stand:** Frontend vollständig (8 Seiten), zwei PDF-Import-Flows, Express-Backend mit 6 Routen, vollständiger Status-Workflow, Ausbilder-Kommentar-Funktion, Benachrichtigungen, Tablet-Optimierung. Datenbank-Schema fehlt noch als SQL-Migrations-Skripte.
4. **Anti-Pattern:** Niemals empfehlen, Code in SharePoint/OneDrive abzulegen. Cloud-Sync ist mit Git inkompatibel.
5. **DB-Konvention:** Schema-Änderungen IMMER als nummerierte `.sql`-Skripte unter `db/migrations/`. Keine händischen Änderungen in SSMS ohne entsprechendes Skript.
6. **Backend starten:** `cd backend && npm run dev` → API läuft auf `http://localhost:3000`
7. **PDF-Parser sind Node-testbar:** `ihk-parser.js` und `zeitnachweis-parser.js` haben keine DOM/pdf.js-Abhängigkeit.
8. **Dev-Auth / SSO:** Im Entwicklungsbetrieb nutzt das Backend `devAuth`-Middleware mit DEV\_USERS (hardcoded OIDs). In Produktion ersetzt **SAML 2.0 (App-Level, `@node-saml/node-saml`)** das — Entscheidung: **kein MSAL/OIDC, sondern SAML**. Details + die an den Kollegen übergebenen Azure-URLs (Sign on / Reply / Logout) stehen im Abschnitt „SSO / SAML-Anbindung".
9. **Status-Workflow:** `offen` → `freigegeben` (Azubi) → `genehmigt` oder `abgelehnt` (Ausbilder). Beim Zurückgeben muss eine Begründung eingegeben werden — sie wird als Kommentar mit `typ: 'abgelehnt'` gespeichert.
10. **Tablet-Breakpoints:** 1280px (Sidebar 220px, Hero-KW 64px), 1024px (Icon-Only), 768px (Mobile). Implementiert in `layout.css` und `dashboard.css`.
11. **Dashboard-Refresh:** `pageshow`-Event mit `event.persisted`-Prüfung in `dashboard.js` — sorgt für frische Daten beim Zurücknavigieren aus der Wochenansicht (BFCache).
12. **Animation-Clipping:** `.time-spinner__unit` hat kein `overflow: hidden` mehr — Eck-Radius auf `:first-child`/`:last-child` stattdessen, damit die Bump-Animation nicht abgeschnitten wird.
