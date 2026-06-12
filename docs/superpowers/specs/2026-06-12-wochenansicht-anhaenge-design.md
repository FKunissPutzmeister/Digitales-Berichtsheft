# Wochenansicht – Datei-Anhänge: Design-Spec

**Datum:** 2026-06-12
**Scope:** Datei-Anhänge auf **Wochen-Ebene** in der Wochenansicht (`app/wochenansicht.html`)
**Ansatz:** Voll-Stack – neue SQL-Server-Tabelle, multer-Upload-Route, Frontend-Anbindung

---

## Ziel

Der bereits vorhandene Büroklammer-Button in der Wochenansicht
([wochenansicht.js:1121](../../../app/js/wochenansicht.js#L1121), `wochen-options__actions`)
ist aktuell funktionslos (`tabindex="-1"`, keine `id`, kein Handler). Er soll Dateien
hochladen können, die zur **gesamten Berichtswoche** gehören. Anhänge werden unter den
Wochen-Optionen aufgelistet und können heruntergeladen sowie (durch den Azubi) gelöscht werden.

**Nicht im Scope:**
- Tages-bezogene Anhänge (nur Wochen-Ebene)
- Anhänge im IHK-Druck-/PDF-Export (Liste wird in `@media print` ausgeblendet)
- Vorschau/Thumbnails im Browser (nur Download)
- Virenscan / serverseitige Inhaltsprüfung über die MIME-/Größen-Validierung hinaus

---

## Entscheidungen (mit Nutzer abgestimmt)

1. **Bezug:** pro Woche (passt zum vorhandenen Button)
2. **Speicherort:** SQL Server, `VARBINARY(MAX)` in neuer Tabelle `dbo.Anhaenge`
3. **Transport:** `multipart/form-data` mit `multer` (memoryStorage) – nicht Base64
4. **Berechtigungen:**
   - **Azubi (Eigentümer):** hochladen, herunterladen, löschen – aber **nur** solange die Woche
     bearbeitbar ist (`status` = `offen` oder `abgelehnt`)
   - **Ausbilder/Admin:** herunterladen & ansehen, **kein** Hochladen/Löschen
5. **Constraints:** max. **10 MB** pro Datei; mehrere Dateien pro Woche;
   erlaubte Typen: PDF, JPG/JPEG, PNG, GIF, WEBP, DOCX, XLSX, PPTX, TXT

---

## Abschnitt 1: Datenmodell – Migration `004_anhaenge.sql`

Neue Tabelle, analog zu den bestehenden Migrationen in `db/migrations/`.
Ausführen gegen: `Berichtsheft_Dev`.

| Spalte | Typ | Constraints | Zweck |
|---|---|---|---|
| `Id` | `INT IDENTITY(1,1)` | PK | Primärschlüssel |
| `WocheId` | `INT` | `NOT NULL`, FK → `dbo.Wochen(Id)` `ON DELETE CASCADE` | Bezug zur Woche |
| `Dateiname` | `NVARCHAR(255)` | `NOT NULL` | Originaler Dateiname |
| `MimeTyp` | `NVARCHAR(100)` | `NULL` | z. B. `application/pdf` |
| `GroesseBytes` | `INT` | `NOT NULL` | für Anzeige & Validierung |
| `Inhalt` | `VARBINARY(MAX)` | `NOT NULL` | die Datei selbst |
| `HochgeladenVon` | `NVARCHAR(36)` | `NOT NULL` | User-OID (GUID) des Uploaders |
| `HochgeladenAm` | `DATETIME2` | `NOT NULL` DEFAULT `SYSUTCDATETIME()` | Zeitstempel |

`ON DELETE CASCADE` sorgt dafür, dass Anhänge automatisch verschwinden, wenn eine Woche
gelöscht wird. Index auf `WocheId` für schnelles Auflisten.

```sql
CREATE TABLE dbo.Anhaenge (
  Id             INT IDENTITY(1,1) PRIMARY KEY,
  WocheId        INT           NOT NULL,
  Dateiname      NVARCHAR(255) NOT NULL,
  MimeTyp        NVARCHAR(100) NULL,
  GroesseBytes   INT           NOT NULL,
  Inhalt         VARBINARY(MAX) NOT NULL,
  HochgeladenVon NVARCHAR(36)  NOT NULL,
  HochgeladenAm  DATETIME2     NOT NULL CONSTRAINT DF_Anhaenge_HochgeladenAm DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Anhaenge_Wochen FOREIGN KEY (WocheId)
    REFERENCES dbo.Wochen(Id) ON DELETE CASCADE
);
CREATE INDEX IX_Anhaenge_WocheId ON dbo.Anhaenge(WocheId);
```

---

## Abschnitt 2: Backend – `backend/routes/anhaenge.js`

Neuer Router, gemountet unter `/api/wochen` (genau wie `kommentare.js`).
Reihenfolge in `server.js`: **nach** `wochenRouter` und `kommentareRouter` einhängen.
Die Pfad-Segmente kollidieren nicht mit `wochenRouter` (`GET /:id` matcht nur einen Segment).

**Neue Dependency:** `multer` (memoryStorage, `limits.fileSize = 10 MB`) – nur pro Route
als Middleware, kein globaler Effekt.

| Methode & Pfad | Zweck | Berechtigung |
|---|---|---|
| `GET /:wocheId/anhaenge` | Liste der **Metadaten** (ohne `Inhalt`) | authentifiziert |
| `POST /:wocheId/anhaenge` | Upload (multer `single('datei')`), Insert | Eigentümer/Admin **und** Woche bearbeitbar |
| `GET /anhaenge/:id/download` | streamt Bytes mit `Content-Disposition: attachment` | authentifiziert |
| `DELETE /anhaenge/:id` | löscht Anhang | Eigentümer/Admin **und** Woche bearbeitbar |

**Server-seitige Validierung beim Upload (`POST`):**
1. Datei vorhanden? Sonst `400`.
2. `req.file.size <= 10 MB` (multer-Limit fängt das primär ab → `413`/`400`).
3. `req.file.mimetype` in der erlaubten Whitelist? Sonst `400` mit klarer Meldung.
4. Woche laden (`SELECT AzubiOid, Status FROM dbo.Wochen WHERE Id = @wocheId`):
   - existiert nicht → `404`
   - `Status` ∈ {`freigegeben`, `genehmigt`} → `403` (schreibgeschützt)
   - `AzubiOid != req.user.oid` **und** `req.user.role != 'admin'` → `403`
5. Insert `VALUES (@wocheId, @dateiname, @mimeTyp, @groesse, @inhalt, @userOid, default)`,
   `OUTPUT inserted.Id`. Antwort: Metadaten des neuen Anhangs.

**Download (`GET .../download`):**
`SELECT Dateiname, MimeTyp, Inhalt FROM dbo.Anhaenge WHERE Id = @id`. Header setzen
(`Content-Type`, `Content-Disposition: attachment; filename*=UTF-8''<encoded>`),
`res.send(recordset[0].Inhalt)` (Buffer).

**Delete:** dieselbe Eigentümer-/Status-Prüfung wie Upload (über Join auf `dbo.Wochen`),
dann `DELETE FROM dbo.Anhaenge WHERE Id = @id`.

Fehlerbehandlung wie in den bestehenden Routen: `try/catch` → `res.status(500).json({ error: err.message })`.

---

## Abschnitt 3: Frontend – Datenanbindung (`app/js/api.js`)

`apiFetch` serialisiert immer zu JSON und ist daher für Datei-Uploads ungeeignet. Daher:

- **Neuer Helper `apiUpload(path, formData)`** – `fetch` mit `credentials: 'include'`,
  **ohne** `Content-Type`-Header (der Browser setzt die `multipart`-Boundary selbst),
  Body = `FormData`. Fehlerbehandlung wie `apiFetch`.
- **`DB.getAnhaenge(wocheId)`** → `apiFetch('/wochen/' + wocheId + '/anhaenge')`, normalisiert
  PascalCase → camelCase (`id`, `dateiname`, `mimeTyp`, `groesseBytes`, `hochgeladenVon`, `hochgeladenAm`).
- **`DB.uploadAnhang(wocheId, file)`** → baut `FormData` mit `datei` = `file`,
  ruft `apiUpload('/wochen/' + wocheId + '/anhaenge', fd)`.
- **`DB.deleteAnhang(id)`** → `apiFetch('/wochen/anhaenge/' + id, { method: 'DELETE' })`.
- **`DB.anhangDownloadUrl(id)`** → liefert `API_BASE + '/wochen/anhaenge/' + id + '/download'`
  (für `<a href>` / `download`-Link).

---

## Abschnitt 4: Frontend – UI & Wiring (`app/js/wochenansicht.js`)

### 4a. Button aktivieren
Der vorhandene Büroklammer-Button erhält eine `id` (`wochenAnhangBtn`) und wird fokussierbar
(`tabindex="-1"` entfernen). Daneben ein verstecktes
`<input type="file" id="wochenAnhangInput" multiple hidden accept="...">`.
Im Readonly-Zustand wird der Button **ausgeblendet** (Ausbilder oder Woche freigegeben/genehmigt).

### 4b. Anhang-Liste
Unter der `wochen-options`-Leiste (innerhalb von `renderWochenKacheln`) wird ein Container
`#wochenAnhaengeListe` gerendert. Pro Anhang eine Zeile/Chip mit:
- Datei-Icon (abhängig vom MIME-Typ, einfache Unterscheidung Bild/PDF/sonstige)
- Dateiname (Download-Link → `DB.anhangDownloadUrl(id)`)
- Größe (formatiert, z. B. „1,2 MB")
- Löschen-Button (✕) – **nur** wenn nicht readonly

Eine Render-Hilfsfunktion `renderAnhaengeListe(anhaenge, readonly)` erzeugt das Markup;
`refreshAnhaenge(wocheId)` lädt neu und ersetzt den Container-Inhalt.

### 4c. Upload-Flow
1. Klick auf `#wochenAnhangBtn` → `#wochenAnhangInput.click()`.
2. `change`-Event → für jede gewählte Datei:
   - **Client-Validierung:** Größe ≤ 10 MB und Typ in Whitelist; sonst `Toast.error(...)` und überspringen.
   - **Woche-Id sicherstellen:** Existiert noch keine `woche.id` (neue, ungespeicherte Woche),
     erst `await autoSaveWoche()` ausführen, dann `woche` neu laden, um die `Id` zu erhalten.
     *(Begründung: Anhänge brauchen eine `WocheId`; neue Wochen entstehen erst beim ersten Speichern.)*
   - `await DB.uploadAnhang(woche.id, file)`.
3. Nach allen Uploads: `await refreshAnhaenge(woche.id)` + `Toast.success(...)`. Input-Wert zurücksetzen.

### 4d. Delete-Flow
Klick auf Löschen → optionaler Bestätigungs-Toast/Confirm → `await DB.deleteAnhang(id)` →
`refreshAnhaenge(woche.id)`.

### 4e. Einbindung in den Render-Zyklus
- `renderWochenKacheln` rendert den (zunächst leeren) Listen-Container.
- Nach dem Render in `bindWochenEvents` (bzw. dort, wo die Wochen-Events gebunden werden):
  `refreshAnhaenge(woche?.id)` aufrufen (falls `woche?.id` vorhanden) und Button/Input-Events binden.

---

## Abschnitt 5: Styling (`app/css/wochenansicht.css`)

- `.wochen-anhaenge` – Container (Abstand, ggf. dezente Trennlinie zur Options-Leiste)
- `.wochen-anhang` – einzelne Zeile/Chip (Flex, Icon + Name + Größe + Löschen)
- Hover-/Fokus-Zustände konsistent mit bestehenden `wochen-options__icon-btn`
- `@media print { .wochen-anhaenge { display: none; } }` – Anhänge erscheinen nicht im IHK-Ausdruck
- Readonly: Löschen-Button nicht gerendert (kein separater CSS-Zustand nötig)

---

## Datenfluss (Zusammenfassung)

```
[Azubi wählt Datei]
   → wochenansicht.js: Client-Validierung (Größe/Typ)
   → ggf. autoSaveWoche()  (Woche.Id sicherstellen)
   → DB.uploadAnhang(wocheId, file)        [api.js: apiUpload, FormData]
   → POST /api/wochen/:wocheId/anhaenge     [multer → Buffer]
   → anhaenge.js: Validierung + Eigentümer/Status-Check
   → INSERT dbo.Anhaenge (VARBINARY)
   → refreshAnhaenge(wocheId) → GET .../anhaenge → Liste neu rendern

[Download]  <a href="/api/wochen/anhaenge/:id/download"> → res.send(Buffer)
[Löschen]   DELETE /api/wochen/anhaenge/:id → refreshAnhaenge
```

---

## Offene Punkte / Annahmen

- **Authz-Tiefe bei Download/Liste:** wie im bestehenden App-Stand wird hier nur „authentifiziert"
  verlangt (kein feingranularer Azubi↔Ausbilder-Abgleich), konsistent mit `GET /api/wochen`.
  Upload/Delete sind dagegen streng auf Eigentümer + bearbeitbaren Status beschränkt.
- **Migration manuell:** Wie die bisherigen Migrationen wird `004_anhaenge.sql` per Hand gegen
  `Berichtsheft_Dev` ausgeführt (kein automatischer Migrations-Runner im Projekt).
- **`multer` muss via `npm install multer` in `backend/` ergänzt werden.**
