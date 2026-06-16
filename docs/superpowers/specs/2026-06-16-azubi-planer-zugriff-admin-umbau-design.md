# Azubi-Planer als zentrale Steuerung + zuweisungsgetriebener Berichtsheft-Zugriff — Design-Spec

**Datum:** 2026-06-16
**Status:** Entwurf

---

## Überblick

Die Anwendung wird von einem rollengetriebenen (`azubi`/`ausbilder`/`admin`) auf ein **fähigkeits- und zuweisungsgetriebenes** Zugriffsmodell umgestellt. Drei verzahnte Ziele:

1. **Azubi-Planer & Adminverwaltung werden auf ausgewählte Nutzer beschränkt** — künftig voraussichtlich 2 Personen (eine reine Personalabteilung, eine zusätzlich Ausbilderin), nicht mehr jeder Ausbilder.
2. **Die Adminverwaltung wird entschlackt** — dort werden **keine** Berichtshefte mehr korrigiert/genehmigt, sondern nur noch **Berichtsheftverwaltung** und **Azubi-Planer** angeboten. Das Admin-Dashboard wird auf den Planer ausgerichtet (offene/bald ablaufende/bald beginnende Zuweisungen).
3. **Der Azubi-Planer wird zur zentralen Steuerung**: Azubis bekommen für Zeiträume Abteilungen zugeteilt, jede Zuteilung hat eine/n **Verantwortliche/n** (nicht zwingend Ausbilder). Wer aktuell verantwortlich ist, darf in diesem Zeitraum das Berichtsheft des Azubis korrigieren/genehmigen.

**Der Glücksfall:** Das Zielmodell existiert im Datenmodell fast vollständig. Die Tabelle `Zuweisungen` (`AzubiOid`, `AusbilderOid`, `Abteilung`, `Von`, `Bis`) bildet bereits „Azubi bekommt für Zeitraum Abteilung mit Verantwortlichem" ab, und `getMeineAzubis()` filtert Sichtbarkeit schon nach aktiver Zuweisung. Der Umbau **entkoppelt** den Verantwortlichen von der Ausbilder-Rolle und **erzwingt** die Zugriffsregeln serverseitig — statt sie nur im Frontend zu verstecken.

---

## Ist-Zustand (mit Belegen)

### Rollen rein im Backend-Code, nicht in der DB
Rollen leben im `DEV_USERS`-Objekt ([backend/middleware/auth.js:13-25](../../../backend/middleware/auth.js#L13-L25)) als einzelnes `role`-Feld (`azubi`/`ausbilder`/`admin`); perspektivisch Azure AD. Es gibt **keine** Users-Tabelle. `devAuth` setzt `req.user = { oid, ...DEV_USERS[oid] }` ([auth.js:27-37](../../../backend/middleware/auth.js#L27-L37)).

### Backend-Autorisierung quasi nicht vorhanden
Einzige echte Rollenprüfung: `pruefeBearbeitbar()` in [anhaenge.js:39-52](../../../backend/routes/anhaenge.js#L39-L52) (`user.role !== 'admin'`). Lücken:
- `GET /api/wochen` ohne `azubiOid` liefert **alle** Wochen ohne Rollenprüfung ([wochen.js:5-37](../../../backend/routes/wochen.js#L5-L37)).
- `PATCH /api/wochen/:id/status` ändert Status **ohne** jede Berechtigung ([wochen.js:138-151](../../../backend/routes/wochen.js#L138-L151)).
- `POST /api/wochen/:id/kommentare` nimmt `typ` aus dem Body, **ohne** zu prüfen, wer kommentiert ([kommentare.js:5-25](../../../backend/routes/kommentare.js#L5-L25)).
- `POST/DELETE /api/zuweisungen` **ohne** Rollenprüfung ([zuweisungen.js:31-63](../../../backend/routes/zuweisungen.js#L31-L63)).

### Frontend-Gating = nur Kosmetik
`.nav-ausbilder-only` (Berichtsheftverwaltung, Azubi-Planer) wird per `role` ein-/ausgeblendet ([sidebar.js:43-51](../../../app/js/sidebar.js#L43-L51), [app.js:102-110](../../../app/js/app.js#L102-L110)); Rolle gecacht in `localStorage` + `data-role` ([api.js:149-159](../../../app/js/api.js#L149-L159), [theme.js:1076-1081](../../../app/js/theme.js#L1076-L1081)). Der Planer macht einen Hard-Redirect für Nicht-Ausbilder ([azubi-planer.js:13-16](../../../app/js/azubi-planer.js#L13-L16)).

### Korrektur-Flow heute
Korrektur passiert im **Ausbilder-Dashboard-Posteingang** ([dashboard.js:755-928](../../../app/js/dashboard.js#L755-L928), Bulk-Aktionen [dashboard.js:1199-1330](../../../app/js/dashboard.js#L1199-L1330)) und in der **Wochenansicht** (Genehmigen [wochenansicht.js:1957-1982](../../../app/js/wochenansicht.js#L1957-L1982), Ablehnen [wochenansicht.js:1987-2008](../../../app/js/wochenansicht.js#L1987-L2008)). Sichtbare Azubis: `getMeineAzubis()` filtert nach aktiver Zuweisung ([dashboard.js:1105-1114](../../../app/js/dashboard.js#L1105-L1114)). **Bug:** Der Azubi-Selektor der Wochenansicht zeigt **alle** Azubis statt nur der zugewiesenen ([wochenansicht.js:440](../../../app/js/wochenansicht.js#L440)).

### Datenmodell
Tabellen: `Wochen` (Status `offen`/`freigegeben`/`genehmigt`/`abgelehnt`, [003_status_freigegeben.sql:19](../../../db/migrations/003_status_freigegeben.sql#L19)), `Tage`, `Kommentare` (mit `UserOid`, `TagId`), `Benachrichtigungen`, `Zuweisungen`, `Anhaenge`. Status-Update speichert **nicht**, wer es war. DB-Zugriff: parametrisierte `mssql`-Queries über `backend/db/connection.js`.

---

## Fachliches Modell & Begriffe

- **Fähigkeit (Capability):** statische, aus Konfig abgeleitete Eigenschaft eines Nutzers.
  - `kannPlanen` — darf Adminverwaltung (Berichtsheftverwaltung + Azubi-Planer) nutzen.
  - `istAusbilder` — behält dauerhaft Zugang zur Korrektur-/Ausbilder-Ansicht (kein Lockout).
  - `istAzubi` — hat ein Azubi-Profil (eigenes Berichtsheft). Abgeleitet wie bisher.
- **Verantwortliche/r:** der in einer Zuweisung hinterlegte Nutzer (`Zuweisungen.AusbilderOid`, semantisch umgedeutet). Muss **kein** Ausbilder sein; wählbar ist **jeder Nicht-Azubi-Nutzer**.
- **Aktive Zuweisung:** Zuweisung mit `Von ≤ heute ≤ Bis`.
- **Korrektur-Historie:** eine Woche, die ein Nutzer je kommentiert **oder** deren Status er gesetzt hat (genehmigt/abgelehnt).

Beispiel-Personas: Personalabteilung = `kannPlanen`. Ausbilderin = `kannPlanen` **und** `istAusbilder`. Abteilungsleiter mit befristeter Betreuung = keine Fähigkeit, nur über aktive Zuweisung berechtigt.

---

## Zugriffsmodell (der Kern)

Für eine Berichtsheft-Woche `W` (eines Azubis, mit Datumsbereich) und einen Nutzer `U`:

**Eine Woche `W` fällt in eine Zuweisung `Z`**, wenn `[W.start, W.ende]` den Zeitraum `[Z.Von, Z.Bis]` überschneidet.

1. **Sehen + Korrigieren (aktiv verantwortlich):** Es gibt eine Zuweisung `Z` mit `Z.Verantwortlicher = U`, `Z` ist aktiv (`Von ≤ heute ≤ Bis`) **und** `W` fällt in `Z`.
2. **Nur Sehen (read-only, Korrektur-Historie):** `U` hat `W` je korrigiert (Kommentar verfasst **oder** Status gesetzt) — auch nachdem `Z` abgelaufen ist. Erneutes Ändern ist **nicht** erlaubt.
3. **Lockout:** Hat `U` keine aktive Zuweisung **und** ist kein Ausbilder → es werden **keine** fremden Berichtshefte angezeigt, ausschließlich die aus Regel 2.
4. **Ausbilder kein Lockout:** Bei `istAusbilder` bleiben Korrektur-Ansicht/Menü dauerhaft erreichbar (kein Redirect ins Leere), auch ohne aktive Zuweisung. Die sichtbare **Menge** ist dieselbe wie für eine/n Verantwortliche/n (aktive Zuweisungs-Azubis in-Periode + eigene Korrektur-Historie) — es gibt **keine** Sonder-Sicht „alle Azubis aller Zeiten".
5. **Eigenes Heft:** `istAzubi` sieht/bearbeitet das eigene Berichtsheft wie bisher.

Dieselbe Logik wird im **Backend durchgesetzt** und steuert im **Frontend** die Anzeige — eine Quelle, zwei Konsumenten.

---

## Scope

**Im Scope:**
- Fähigkeits-Konfig (`kannPlanen`, `istAusbilder`) via Allowlist; Ausspielen über `/api/auth/me`.
- Zentrale Backend-Autorisierung (`zugriff.js`), durchgesetzt auf Wochen-, Kommentar-, Status-, Anhang- und Zuweisungs-Routen; schließt zugleich die bestehenden Sicherheitslücken.
- Migration `009`: Korrektur-Attribution (`KorrigiertVon`/`KorrigiertAm`).
- Frontend-Gating auf Fähigkeiten; Azubi-Selektor-Fix; Wochenansicht/Posteingang nach neuen Regeln gefiltert.
- Azubi-Planer: Verantwortliche/r = alle Nicht-Azubi-Nutzer; UI-Ertüchtigung für 30–60 Azubis (Sticky-Gantt, Lücken-Markierung, Filter/Gruppierung, Dichte-Umschalter, Zeitnavigation).
- Komponierbares Dashboard mit Planer-Signalkarten (ohne Zuweisung / bald ablaufend / bald beginnend).
- Adminverwaltung entschlackt: keine Korrektur im reinen Planer-Kontext.

**Nicht im Scope (YAGNI):**
- Volle Nutzerverwaltung/RBAC-Tabellen + UI in der DB (Flags via Konfig, da User noch nicht in der DB liegen).
- Echtes Azure-AD-Gruppen-Mapping (Allowlist ist dafür vorbereitet).
- Drag-to-create von Zuweisungen direkt auf der Timeline (optionales späteres Extra).
- DB-Rename `AusbilderOid → VerantwortlicherOid` (nur semantische Umdeutung + UI-Label, kein riskantes Spalten-Rename).

**Optional (separat entscheidbar):** verwaltete Abteilungs-Liste statt Freitext (Migration `010`), inkl. Standard-Verantwortliche/r je Abteilung. Kernmodell funktioniert ohne.

---

## Architektur / geänderte & neue Dateien

| Datei | Änderung |
|---|---|
| `backend/config/berechtigungen.js` *(neu)* | Allowlist `OID/E-Mail → { kannPlanen, istAusbilder }`, optional via ENV überschreibbar. |
| `backend/middleware/auth.js` | `req.user` um `kannPlanen`/`istAusbilder` aus Konfig anreichern; `DEV_USERS` um Beispiel-Personas erweitern. |
| `backend/server.js` | `/api/auth/me` liefert Fähigkeits-Flags mit. |
| `backend/services/zugriff.js` *(neu)* | `darfWocheSehen(user, woche)`, `darfWocheKorrigieren(user, woche)`, `sichtbareAzubis(user, stichtag)`, `azubisOhneAktuelleZuweisung(stichtag)` u. a. |
| `backend/routes/wochen.js` | `GET` serverseitig nach `sichtbareAzubis`/`darfWocheSehen` filtern; `PATCH .../status` nur mit `darfWocheKorrigieren`, setzt `KorrigiertVon`/`KorrigiertAm`. |
| `backend/routes/kommentare.js` | `POST` nur mit `darfWocheKorrigieren`; `typ` serverseitig aus Nutzer ableiten statt aus Body übernehmen. |
| `backend/routes/anhaenge.js` | `pruefeBearbeitbar` auf `darfWocheKorrigieren` umstellen (statt `role==='admin'`). |
| `backend/routes/zuweisungen.js` | `POST`/`DELETE` nur mit `kannPlanen`; ggf. neue Lese-Endpunkte für Planer-Signale. |
| `db/migrations/009_korrektur_attribution.sql` *(neu)* | `Wochen.KorrigiertVon` (NVARCHAR(36) NULL), `Wochen.KorrigiertAm` (DATETIME2 NULL). |
| `app/js/api.js` | `me`/User um Flags erweitern; `cacheUserRole` → Fähigkeits-Cache; Verantwortlichen-Liste (Nicht-Azubis); Planer-Signal-Helfer spiegeln Backend. |
| `app/js/sidebar.js`, `app/js/app.js` | Menü-Gating auf Fähigkeiten (`kannPlanen` für Verwaltung; Berichtsheft-Menü für Azubi **oder** korrektur-berechtigt). |
| `app/js/azubi-planer.js` + `.css` | Verantwortliche/r = Nicht-Azubi-Nutzer; Sticky-Gantt, Lücken-Markierung, Filter/Gruppierung, Dichte, Zeitnavigation. |
| `app/js/dashboard.js` | Komposition aus Fähigkeits-Sektionen; Planer-Signalkarten; Korrektur-Sektion nach neuen Regeln. |
| `app/js/wochenansicht.js` | Azubi-Selektor auf erlaubte Azubis ([:440](../../../app/js/wochenansicht.js#L440)); Korrektur-/Readonly-Logik an Zugriffsmodell ausrichten ([:154-162](../../../app/js/wochenansicht.js#L154-L162)). |
| `app/js/berichtsheftverwaltung.js` | Gating auf `kannPlanen` statt `ausbilder/admin` ([:19](../../../app/js/berichtsheftverwaltung.js#L19)). |

---

## Detaildesign

### A) Fähigkeits-Konfig & `/api/auth/me`

`berechtigungen.js` exportiert ein Mapping (Schlüssel = OID, optional E-Mail) auf `{ kannPlanen, istAusbilder }`. `auth.js` reichert `req.user` damit an (Default: beide `false`). Bestehendes `role` bleibt vorerst als Fallback bestehen (z. B. `role==='azubi'` → `istAzubi`), wird aber nicht mehr für Verwaltungs-/Korrektur-Gating genutzt. `/api/auth/me` gibt die Flags aus; das Frontend cacht sie analog zur heutigen Rolle (inkl. Pre-Paint-Lesung gegen „Flash").

### B) `zugriff.js` — die eine Wahrheit

Reine, testbare Funktionen (keine HTTP-/DOM-Abhängigkeit):
- `wocheFaelltInZuweisung(woche, z)` — Datumsüberschneidung.
- `aktiveZuweisungen(user, stichtag)` — Zuweisungen mit `Verantwortlicher=user` und `Von ≤ stichtag ≤ Bis`.
- `darfWocheSehen(user, woche, kontext)` / `darfWocheKorrigieren(...)` — Regeln 1–5.
- `sichtbareAzubis(user, stichtag)` — Azubi-OIDs aus aktiven Zuweisungen + Korrektur-Historie.
- `azubisOhneAktuelleZuweisung(stichtag)`, `baldAblaufend(tage)`, `baldBeginnend(tage)` — für Dashboard-Signalkarten **und** Planer-Filter (ein Datenpfad).

Backend ruft diese in den Routen auf; Frontend nutzt eine spiegelgleiche, schlanke Variante für die Anzeige (die echte Durchsetzung bleibt der Server).

### C) Migration 009 — Korrektur-Attribution

Additiv, abwärtskompatibel:
```sql
ALTER TABLE dbo.Wochen ADD KorrigiertVon NVARCHAR(36) NULL;
ALTER TABLE dbo.Wochen ADD KorrigiertAm  DATETIME2   NULL;
```
`PATCH /api/wochen/:id/status` setzt beide bei genehmigt/abgelehnt (`req.user.oid`, `SYSUTCDATETIME()`). Damit ist Regel 2 (Korrektur-Historie) auch für reine Statuswechsel ohne Kommentar belastbar. Kommentare tragen `UserOid` bereits.

### D) Frontend-Gating (Fähigkeiten)

| Menübereich | Sichtbar wenn |
|---|---|
| Übersicht → Dashboard | immer (Inhalt kapazitätsabhängig) |
| Berichtsheft → Wochen-/Jahresansicht | `istAzubi` **oder** korrektur-berechtigt (aktive Zuweisung · `istAusbilder` · Korrektur-Historie) |
| Verwaltung → Berichtsheftverwaltung + Azubi-Planer | `kannPlanen` |

Der Planer-Hard-Redirect ([azubi-planer.js:13-16](../../../app/js/azubi-planer.js#L13-L16)) prüft künftig `kannPlanen`.

### E) Komponierbares Dashboard

Statt `if (role===...)`-Verzweigung werden Sektionen je Fähigkeit zusammengesetzt (Vereinigung):
- **Azubi-Sektion** (`istAzubi`): unverändert.
- **Korrektur-Sektion** (korrektur-berechtigt): Posteingang + „Meine aktuellen Azubis", streng nach `sichtbareAzubis` + in-Periode gefiltert.
- **Planer-Sektion** (`kannPlanen`): drei Signalkarten — 🔴 Azubis ohne aktuelle Zuweisung, 🟠 bald ablaufend (≤ 14 Tage, ohne Anschluss), 🔵 bald beginnend; jede Karte springt in den Planer mit vorgewähltem Filter.

Personalabteilung → nur Planer-Sektion. Ausbilderin → Planer + Korrektur. Azubi → nur Azubi-Sektion.

### F) Azubi-Planer für 30–60 Azubis

Bestehendes 3-Zonen-Layout (KPIs · Gantt · Tabelle) bleibt, ertüchtigt um:
1. **Sticky** Monats-Kopfzeile + Azubi-Namensspalte beim Scrollen.
2. **Lücken-Markierung:** Zeiträume ohne Zuweisung deutlich (gestrichelt/leer + rot) — selber Datenpfad wie Dashboard-Signal.
3. **Filter & Gruppierung:** Name-Suche + Filter nach Verantwortliche/r, Abteilung, Lehrjahr, Schnellfilter „nur ohne aktuelle Zuweisung"; Gruppierung nach Lehrjahr oder Verantwortliche/r.
4. **Dichte-Umschalter** (Kompakt-Modus).
5. **Zeitnavigation** über die ganze Ausbildung (zurück/vor/„Heute") statt fixem Einzeljahr.
6. **Zuweisung anlegen:** Modal bleibt; Verantwortliche/r-Auswahl = alle Nicht-Azubi-Nutzer (Such-Dropdown); Klick auf Azubi-Zeile prefilled Azubi + Datum.
7. **Farbcodierung** umschaltbar nach Abteilung oder Verantwortliche/r, mit Legende.

### G) Korrektur-Oberfläche eingegrenzt

Korrektur bleibt in Posteingang (Dashboard) + Wochenansicht, aber: Azubi-Selektor auf erlaubte Azubis reduziert; Readonly-/Genehmigen-Logik aus `darfWocheKorrigieren` abgeleitet; alle Schreibaktionen serverseitig abgesichert.

---

## Datenfluss

```
Login → /api/auth/me → { ...user, kannPlanen, istAusbilder }  → Frontend-Cache (Pre-Paint)
Dashboard/Planer  → DB.getZuweisungen + zugriff-Helfer → Signalkarten / Gantt / sichtbare Azubis
Korrektur (Status/Kommentar/Anhang)
   → Backend prüft darfWocheKorrigieren(user, woche)
        ja  → Aktion + KorrigiertVon/KorrigiertAm
        nein→ 403
GET /api/wochen → serverseitig auf sichtbareAzubis/darfWocheSehen gefiltert
```

---

## Einführung in Schritten

1. **Berechtigungs-Fundament** — Konfig-Allowlist, `/api/auth/me`-Flags, `zugriff.js`, Backend-Gates, Migration 009.
2. **Frontend-Gating + Korrektur-Eingrenzung** — Menü auf Fähigkeiten, Azubi-Selektor-Fix, Wochenansicht/Posteingang filtern.
3. **Planer als Verantwortlichen-Tool** — Dropdown auf Nicht-Azubi-Nutzer, Gantt-Ertüchtigung.
4. **Komponierbares Dashboard** — Sektionen je Fähigkeit, Planer-Signalkarten.
5. **Admin-Bereich entschlacken** — Korrektur aus dem reinen Planer-Kontext entfernen.

Jeder Schritt ist für sich lauffähig und abwärtskompatibel (additive Migration, Fallback auf `role`).

---

## Verifikation

- **Unit/Logik:** `zugriff.js` als Tabellentests (analog [ihk-parser.test.js](../../../app/js/ihk-parser.test.js)) — alle Regeln 1–5, inkl. Zeitgrenzen (Tag vor/am/nach `Von`/`Bis`), Wochen-Überschneidung, Korrektur-Historie.
- **Manuell/Browser** (lokales Backend `node server.js`, Port 3000; Edge via npx-Playwright) — vier Personas:
  - **Personalabteilung** (`kannPlanen`): sieht Planer + Verwaltung, **keine** Korrektur-Oberfläche; Planer-Signalkarten stimmen.
  - **Ausbilderin** (`kannPlanen` + `istAusbilder`): sieht Planer **und** Korrektur; Menü/Ansicht bleibt auch ohne aktive Zuweisung.
  - **Reiner Verantwortlicher** (keine Fähigkeit): vor Zuweisung nichts; während Zuweisung Korrektur nur der in-Periode-Wochen des zugewiesenen Azubis; nach Ablauf nur read-only der selbst korrigierten Wochen.
  - **Azubi**: eigenes Heft unverändert; kann fremde Wochen weder per UI noch per Direktaufruf ziehen (Backend-403).

---

## Risiken & Gegenmaßnahmen

- **„Korrigiert hat" ohne Spur** → Migration 009 attribuiert Statuswechsel; Kommentare tragen `UserOid` schon. Ohne 009 wäre Regel 2 für kommentarlose Genehmigungen lückenhaft.
- **Frontend-/Backend-Regel-Drift** → Regeln zentral in `zugriff.js`; Frontend nur Anzeige, Server ist die Durchsetzung. Bestehende Lücken (alle Wochen ziehbar, beliebige Status-/Kommentar-Schreibzugriffe) werden dabei geschlossen.
- **Wochengrenze vs. Zuweisungsgrenze** (eine Mo–So-Woche ragt teils über `Von`/`Bis`) → Überschneidungs-Regel macht solche Randwochen für die/den Verantwortliche/n sichtbar; bewusst inklusiv, um Lücken an Übergängen zu vermeiden.
- **Performance Gantt bei 60 Zeilen** → 60×~12 Spalten ist für DOM unkritisch; Render effizient halten, Virtualisierung nur falls real nötig.
- **User noch nicht in DB** → Allowlist per Konfig ist Brücke bis Azure AD; Schlüssel über OID **und** E-Mail erlaubt späteres Gruppen-Mapping ohne Strukturbruch.
- **Bestandsdaten** → bestehende Zuweisungen bleiben gültig (`AusbilderOid` = Verantwortliche/r); keine Datenmigration nötig.
