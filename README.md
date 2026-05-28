# Digitales Berichtsheft

Digitales Ausbildungs-Berichtsheft für Putzmeister-Auszubildende. Ersetzt das klassische Papier-Berichtsheft durch eine Web-Anwendung mit Wochenansicht, Jahresplaner, Ausbildungsstand-Tracking und Berichtsheftverwaltung.

---

## Projektstatus

| Bereich | Status |
| --- | --- |
| Frontend – alle 8 Seiten (HTML/CSS/JS) | erledigt |
| UI mit Putzmeister-Design-System (DS-Topbar, Liquid-Glass-Effekte) | erledigt |
| SAP-ESS-Zeitnachweis-Import (PDF → Wochenansicht) | erledigt |
| IHK-Berichtsheft-Import (PDF → wöchentliche Anwesenheitsdaten) | erledigt |
| Node.js-Backend (Express + mssql, REST-API, Session-Auth) | erledigt |
| Dev-Auth-Middleware (X-Dev-OID, DEV_USERS) | erledigt |
| Dev-Server-Anbindung (SQL Server Express, .env) | eingerichtet und getestet |
| **Datenbank-Schema (SQL-Migrations-Skripte)** | **ausstehend — nach Azure-AD-Klärung** |
| Azure-AD-Anbindung über MSAL | offen (Aufgabe: Kollege) |
| IIS-Reverse-Proxy zu Node.js | offen |

---

## Features

### Seiten

| Seite | Datei | Beschreibung |
| --- | --- | --- |
| Login | `app/index.html` | E-Mail-/Passwort-Formular (Putzmeister-Branding) |
| Dashboard | `app/dashboard.html` | Rollenbasiert: Azubi-Übersicht oder Ausbilder-Cockpit |
| Wochenansicht | `app/wochenansicht.html` | Tageweise Eingabe (Anwesenheit, Ort, Stunden, Eintrag) |
| Jahresansicht | `app/jahresansicht.html` | Alle Kalenderwochen eines Jahres auf einen Blick |
| Ausbildungsstand | `app/ausbildungsstand.html` | Kompetenz- und Fortschritts-Tracking |
| Azubi-Planer | `app/azubi-planer.html` | Planung und Terminübersicht |
| Berichtsheftverwaltung | `app/berichtsheftverwaltung.html` | Freigabe-Workflow für Ausbilder |
| Profil | `app/profil.html` | Profildaten + Importfunktionen |

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

---

## Tech Stack

| Komponente | Wahl |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript |
| PDF-Verarbeitung | pdf.js (vendored, client-side) |
| Backend | Node.js + Express 5 + `mssql`-Treiber |
| Auth (Entwicklung) | Session-basiert + DEV_USERS (X-Dev-OID Header) |
| Auth (Produktion) | Azure AD / Microsoft Entra ID über MSAL |
| Datenbank | SQL Server Express 2022 |
| Webserver | IIS (Reverse Proxy zu Node.js, geplant) |
| Hosting | Azure-VM (Putzmeister-intern) |
| Versionskontrolle | Git + GitHub |

---

## Repository-Struktur

```
.
├── app/                          # Frontend
│   ├── css/                      # Stylesheets
│   │   ├── variables.css         # Design Tokens (Farben, Abstände, Animationen)
│   │   ├── base.css              # Globale Stile, Typografie, Resets
│   │   ├── layout.css            # App-Shell, Sidebar, Topbar
│   │   ├── components.css        # Buttons, Cards, Modals, Formulare
│   │   ├── glass.css             # Liquid-Glass-Effekte
│   │   ├── topbar-ds.css         # Putzmeister Design System Topbar
│   │   ├── dashboard.css
│   │   ├── wochenansicht.css
│   │   ├── jahresansicht.css
│   │   ├── ausbildungsstand.css
│   │   ├── azubi-planer.css
│   │   ├── berichtsheftverwaltung.css
│   │   └── profil.css
│   ├── js/                       # JavaScript-Module
│   │   ├── app.js                # Auth-Guard, Sidebar-Navigation, Toast
│   │   ├── api.js                # HTTP-Layer (API_BASE: localhost:3000/api), DB-Objekt
│   │   ├── login.js              # Login-Formular
│   │   ├── dashboard.js          # Dashboard-Rendering (Azubi / Ausbilder)
│   │   ├── wochenansicht.js      # Wochenansicht-UI und State
│   │   ├── jahresansicht.js      # Jahreskalender und Wochenauswahl
│   │   ├── ausbildungsstand.js   # Kompetenz-Tracking-UI
│   │   ├── azubi-planer.js       # Planer-Funktionalität
│   │   ├── berichtsheftverwaltung.js
│   │   ├── profil.js             # Profil und Einstellungen
│   │   ├── sidebar.js            # Sidebar-Navigation
│   │   ├── topbar-ds.js          # Design-System-Topbar
│   │   ├── theme.js              # Hell-/Dunkel-Modus (vor CSS geladen)
│   │   ├── icons.js              # SVG-Icon-Helfer
│   │   ├── zeitnachweis-parser.js  # SAP-ESS-PDF-Parser (pure, Node-testbar)
│   │   ├── zeitnachweis-upload.js  # SAP-Import-UI + pdf.js-Extraktion
│   │   ├── ihk-parser.js         # IHK-Berichtsheft-PDF-Parser (pure, Node-testbar)
│   │   ├── ihk-import.js         # IHK-Import-UI + pdf.js-Extraktion
│   │   └── vendor/
│   │       ├── pdf.min.js        # pdf.js (vendored)
│   │       └── pdf.worker.min.js
│   ├── index.html                # Login
│   ├── dashboard.html
│   ├── wochenansicht.html
│   ├── jahresansicht.html
│   ├── ausbildungsstand.html
│   ├── azubi-planer.html
│   ├── berichtsheftverwaltung.html
│   └── profil.html
├── backend/                      # Node.js-Backend
│   ├── routes/
│   │   ├── users.js              # GET /api/users, GET /api/users/:oid
│   │   ├── wochen.js             # GET /api/wochen, GET /api/wochen/:id
│   │   ├── zuweisungen.js        # GET/POST /api/zuweisungen
│   │   ├── kommentare.js         # POST /api/wochen/:id/kommentare
│   │   └── benachrichtigungen.js # GET /api/benachrichtigungen[/count]
│   ├── middleware/
│   │   └── auth.js               # devAuth-Middleware (X-Dev-OID / DEV_USERS)
│   ├── db/
│   │   └── connection.js         # mssql-Pool (Env-Vars: DB_SERVER, DB_NAME, ...)
│   ├── server.js                 # Express-App, CORS, Session, Routen-Registrierung
│   ├── .env.example              # Template für .env
│   └── package.json
├── db/
│   └── migrations/               # SQL-Migrations-Skripte (noch leer — kommt nach Azure-AD-Klärung)
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
| GET | `/api/wochen` | Wochen (Azubi: eigene; Ausbilder: alle) |
| GET | `/api/wochen/:id` | Einzelne Woche mit Tage und Kommentare |
| GET | `/api/zuweisungen` | Zuweisungen (filterbar nach azubiOid / ausbilderOid) |
| POST | `/api/zuweisungen` | Neue Zuweisung anlegen |
| POST | `/api/wochen/:id/kommentare` | Kommentar zu einer Woche hinzufügen |
| GET | `/api/benachrichtigungen` | Alle Benachrichtigungen des Users |
| GET | `/api/benachrichtigungen/count` | Anzahl ungelesener Benachrichtigungen |

---

## Lokales Setup

### Wichtig: Arbeitsort

Das Repo wird **ausschließlich lokal** unter `C:\Dev\Digitales-Berichtsheft\` betrieben — **niemals** in SharePoint, OneDrive oder einem anderen synchronisierten Cloud-Ordner.

Cloud-Sync-Mechanismen (SharePoint/OneDrive) sind mit Git inkompatibel: Sie korrumpieren den `.git`-Ordner durch Datei-Locks, erzeugen "Conflicted Copy"-Dateien statt echter Merges und kollabieren bei `node_modules`. **GitHub ist Quelle der Wahrheit und Cloud-Backup zugleich.**

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

Das Frontend (`app/`) kann direkt im Browser geöffnet oder per Live Server (VS Code Extension) bereitgestellt werden. `app/api.js` zeigt auf `http://localhost:3000/api`.

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
```

---

## Nächste Schritte

### 1. Datenbank-Schema und Migrations-Skripte

Die SQL-Datenbank existiert auf dem Dev-Server, aber das Schema (Tabellen, Constraints, Indices) wurde noch nicht als versionierte Skripte ins Repo eingecheckt.

**Ausstehend:**
- Klärung, welche Tabellen nach Azure-AD-Integration noch lokal gehalten werden müssen (User-Attribute, Ausbilder-Zuordnung, Berichtsheft-Verlauf, Freigabe-Status)
- Erstellen von `db/migrations/001_initial_schema.sql` und Folge-Skripten

**Konvention:** Schema-Änderungen IMMER als nummerierte `.sql`-Migrations-Skripte unter `db/migrations/`. Keine händischen Änderungen in SSMS ohne entsprechendes Skript.

### 2. Azure-AD-Anbindung (MSAL)

MSAL-Integration in Express zur Token-Validierung für Produktivbetrieb — Aufgabe des Kollegen. Ersetzt die `devAuth`-Middleware vollständig.

### 3. IIS-Reverse-Proxy-Konfiguration

IIS bekommt URL Rewrite + ARR: terminiert HTTPS, leitet `/api/*` an Node.js auf `localhost:3000` weiter. Statisches Frontend liefert IIS direkt aus.

### 4. IHK-Import: Tägliche PDF-Format (Folge-Feature)

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

- **Florian Kuniß** — Hauptentwickler (Frontend, Backend, Architektur, Datenbank)
- **Kollege** — Azure-AD- / MSAL-Integration (Enterprise Application)

---

## Notiz für KI-Assistenten (Claude Code, Copilot etc.)

Falls eine neue KI-Session ohne Vorkontext gestartet wird, hier die wichtigsten Informationen:

1. **Arbeitsverzeichnis:** `C:\Dev\Digitales-Berichtsheft\` (NICHT der frühere SharePoint-Pfad — obsolet)
2. **Aktiver Branch:** `Digitales-Berichtsheft`
3. **Aktueller Stand:** Frontend vollständig (8 Seiten), zwei PDF-Import-Flows fertig, Express-Backend mit 5 Routen läuft. Datenbank-Schema fehlt noch als SQL-Migrations-Skripte.
4. **Anti-Pattern:** Niemals empfehlen, Code in SharePoint/OneDrive abzulegen. Cloud-Sync ist mit Git inkompatibel.
5. **DB-Konvention:** Schema-Änderungen IMMER als nummerierte `.sql`-Skripte unter `db/migrations/`. Keine händischen Änderungen in SSMS ohne entsprechendes Skript.
6. **Backend starten:** `cd backend && npm run dev` → API läuft auf `http://localhost:3000`
7. **PDF-Parser sind Node-testbar:** `ihk-parser.js` und `zeitnachweis-parser.js` haben keine DOM/pdf.js-Abhängigkeit — mit `node -e "require('./app/js/ihk-parser.js'); ..."` testbar.
8. **Dev-Auth:** Im Entwicklungsbetrieb nutzt der Backend `devAuth`-Middleware mit DEV\_USERS (hardcoded OIDs). Header `X-Dev-OID: <oid>` oder Session-basiert. In Produktion wird MSAL das ersetzen.
