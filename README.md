# Digitales Berichtsheft

Digitales Ausbildungs-Berichtsheft für Putzmeister-Auszubildende. Ersetzt das klassische Papier-Berichtsheft durch eine Web-Anwendung mit Wochenansicht, Jahresplaner, Ausbildungsstand-Tracking und Berichtsheftverwaltung.

---

## Projektstatus

| Bereich | Status |
| --- | --- |
| Frontend (HTML/CSS/JS) | weitgehend implementiert |
| UI mit Putzmeister-Design-System (DS-Topbar, Liquid-Glass-Effekte) | erledigt |
| Dev-Server-Anbindung (SQL Server) | eingerichtet und getestet |
| **Datenbank-Schema (SQL Tables)** | **als nächstes — neu zu konzipieren wegen Azure AD** |
| Node.js-Backend-Skeleton | offen |
| Azure-AD-Anbindung über MSAL | offen (durch Kollegen) |
| IIS-Reverse-Proxy zu Node.js | offen |

---

## Nächste Schritte

### 1. Datenbank-Struktur neu konzipieren (Azure-AD-bedingt)

Die ursprüngliche Datenbank-Planung wird **deutlich überarbeitet**, weil durch die Azure-AD-Integration viele User- und Auth-bezogene Tabellen entfallen — Identity-Daten (Name, E-Mail, Rolle, Abteilung etc.) kommen direkt aus der Enterprise Application und müssen nicht mehr lokal in der SQL-DB gehalten werden.

**Was neu zu klären ist:**
- Welche Tabellen bleiben übrig nach Azure-AD-Abzug?
- Welche User-Attribute braucht das Berichtsheft trotzdem lokal (z.B. Ausbilder-Zuordnung, Berichtsheft-Verlauf)?
- Datenmodell für Berichte, Wochen, Jahre, Ausbildungsstand, Berichtsfreigaben

Nach der Konzeption werden die Tabellen als **versionierte SQL-Migrations-Skripte** unter `db/migrations/` ins Repo gelegt (`001_initial_schema.sql`, `002_*.sql`, ...). Niemals händische Schema-Änderungen in SSMS ohne entsprechendes Skript.

### 2. Node.js-Backend-Skeleton

Express-basiertes Backend mit:
- `mssql`-Treiber für SQL-Server-Anbindung
- MSAL-Bibliothek für Azure-AD-Token-Validierung (Aufgabe des Kollegen)
- REST-API als Schnittstelle für die Frontend-Pages

### 3. IIS-Reverse-Proxy-Konfiguration

IIS auf dem Dev-Server (`azrweurwebdev`) bekommt URL Rewrite + Application Request Routing (ARR), terminiert HTTPS und leitet `/api/*` an Node.js auf `localhost:3000` weiter. Statisches Frontend liefert IIS direkt aus.

---

## Tech Stack

| Komponente | Wahl |
| --- | --- |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend (geplant) | Node.js + Express + `mssql`-Treiber |
| Authentifizierung | Azure AD / Microsoft Entra ID (Enterprise Application) über MSAL |
| Datenbank | SQL Server Express 2022 |
| Webserver | IIS (Reverse Proxy zu Node.js) |
| Hosting | Azure-VM (Putzmeister-intern) |
| Versionskontrolle | Git + GitHub |

---

## Repository-Struktur

```
.
├── app/                          # Frontend-Code
│   ├── css/                      # Stylesheets (inkl. glass.css, topbar-ds.css)
│   ├── js/                       # JavaScript-Module (Dashboard, Wochenansicht, etc.)
│   └── *.html                    # Einzelne Seiten
├── Corporate Design/             # Putzmeister-Designvorgaben (Referenz)
├── IHK Aktuelles Berichtsheft/   # IHK-Bezugsdokumente (Referenz)
├── db/migrations/                # SQL-Migrations-Skripte (kommt noch)
├── backend/                      # Node.js-Backend (kommt noch)
└── README.md
```

---

## Lokales Setup & Arbeitsumgebung

### Wichtig: Arbeitsort

Das Repo wird **ausschließlich lokal** unter `C:\Dev\Digitales-Berichtsheft\` betrieben — **niemals** in SharePoint, OneDrive oder einem anderen synchronisierten Cloud-Ordner.

Begründung: Cloud-Sync-Mechanismen (SharePoint/OneDrive) sind mit Git inkompatibel. Sie korrumpieren den `.git`-Ordner durch Datei-Locks während Sync, erstellen "Conflicted Copy"-Dateien statt echter Merges und kollabieren bei der Synchronisation von `node_modules` (hunderttausende kleine Dateien). **GitHub ist gleichzeitig die Quelle der Wahrheit und das Cloud-Backup** — kein zweiter Sync-Mechanismus nötig.

SharePoint/OneDrive ist nur für **Spec-Dokumente, Notizen und Mockups** (Word, Excel, PDF, PNG) das richtige Werkzeug. Code gehört ausschließlich ins Git-Repo.

### Erst-Setup auf neuem Rechner

```powershell
mkdir C:\Dev
cd C:\Dev
git clone https://github.com/FKunissPutzmeister/Digitales-Berichtsheft.git
cd Digitales-Berichtsheft
```

---

## Dev-Server

- **Hostname:** `azrweurwebdev` (Azure-VM, intern)
- **Webserver:** IIS (vorinstalliert)
- **SQL Server:** Express 2022, Instanz `SQLEXPRESS2024`, fester TCP-Port 1433
- **Zugriff:** Nur über Putzmeister-Firmennetz / VPN; RDP-Zugang für Admins

### SSMS-Verbindung

| Feld | Wert |
| --- | --- |
| Servername | `azrweurwebdev\SQLEXPRESS2024` |
| Authentifizierung | Windows-Authentifizierung |
| Verschlüsseln | Obligatorisch |
| Serverzertifikat vertrauen | aktivieren (selbst-signiertes Dev-Cert) |

### Geplanter Connection-String für Node.js (`mssql`)

```javascript
{
  server: 'azrweurwebdev\\SQLEXPRESS2024',
  database: 'Berichtsheft_Dev',
  options: {
    trustedConnection: true,
    trustServerCertificate: true
  }
}
```

---

## Git-Workflow

### Tägliche Routine

```powershell
# Morgens: aktuellen Stand vom Team holen
git pull

# Während der Arbeit: regelmäßig committen
git add .
git commit -m "Beschreibung der Änderung"

# Abends / vor längeren Pausen: zu GitHub pushen
git push
```

### Feature-Branches (für größere Änderungen)

```powershell
git checkout -b feature/<feature-name>   # Neuer Branch
# ... arbeiten, committen ...
git push origin feature/<feature-name>   # Branch zu GitHub
# Dann auf GitHub einen Pull Request öffnen, reviewen, mergen
```

### Aktive Branches

- `Digitales-Berichtsheft` — Haupt-Entwicklungsbranch (de-facto "live" für das Team)
- `main` — Standard-Branch, aktuell nicht aktiv genutzt

---

## Team

- **Florian Kuniß** — Hauptentwickler (Frontend, Datenbank, Architektur)
- **Kollege** — Azure-AD- / MSAL-Integration (Enterprise Application)

---

## Notiz für KI-Assistenten (Claude Code, Copilot etc.)

Falls eine neue KI-Session ohne Vorkontext gestartet wird, hier die wichtigsten Informationen zum Wiedereinstieg:

1. **Arbeitsverzeichnis:** `C:\Dev\Digitales-Berichtsheft\` (NICHT der frühere SharePoint-Pfad unter `Putzmeister Holding GmbH\...\Shared Projects\`, der ist obsolet und nur noch als Archiv vorhanden)
2. **Aktiver Branch:** `Digitales-Berichtsheft`
3. **Aktueller Stand:** Frontend ist weitgehend fertig, SQL-Verbindung zum Dev-Server steht. **Datenbank-Schema muss aufgrund Azure-AD-Integration komplett neu konzipiert werden** — alte Planung in `mögliche Datenbankstruktur.docx` (SharePoint) ist nicht mehr maßgeblich.
4. **Anti-Pattern:** Niemals empfehlen, Code in SharePoint/OneDrive abzulegen. Wurde bereits durchdiskutiert; Cloud-Sync ist mit Git inkompatibel.
5. **Datenbank-Konvention:** Schema-Änderungen IMMER als nummerierte `.sql`-Migrations-Skripte unter `db/migrations/` ins Repo. Keine händischen Änderungen in SSMS ohne entsprechendes Skript.
6. **Backend-Stack (Plan):** Node.js + Express + `mssql` + MSAL, IIS als Reverse Proxy.
7. **Connection-String für SQL Server:** `azrweurwebdev\SQLEXPRESS2024` (Windows-Auth, Trust Server Certificate).
