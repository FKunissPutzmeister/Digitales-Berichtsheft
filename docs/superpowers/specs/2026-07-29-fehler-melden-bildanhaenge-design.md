# Design: Bild-/Screenshot-Anhänge für „Fehler melden"

**Datum:** 2026-07-29
**Status:** Genehmigt (Brainstorming)

## Ziel

Der manuelle „Fehler melden"-Dialog soll erlauben, Bilder und Screenshots
beizufügen, damit Meldungen (die heute nur aus Freitext bestehen) für Developer
diagnostisch aussagekräftiger werden.

## Kontext (Ist-Zustand)

- **Frontend:** [app/js/error-reporter.js](../../../app/js/error-reporter.js)
  definiert den Melde-Button + Modal (`baueFehlerMeldenModal`, aktuell nur ein
  `<textarea>`). Beim Senden ruft es `melde('manual', text, null, { … })`, was
  ein JSON-`POST` an `/api/errors` schickt.
- **Backend-Route:** [backend/routes/fehlerberichte.js](../../../backend/routes/fehlerberichte.js)
  validiert die Quelle (`frontend` | `manual`) und ruft `logError`.
- **Backend-Service:** [backend/services/fehlerberichte.js](../../../backend/services/fehlerberichte.js)
  persistiert in `dbo.Fehlerberichte`, gruppiert per Fingerprint
  (`quelle|nachricht|stackKopf`) auf einen offenen Eintrag (Anzahl++).
- **Viewer (developer-only):** [app/js/fehlerberichte.js](../../../app/js/fehlerberichte.js)
  rendert Nachricht, Stack, Kontext.
- **Bestehendes Anhang-Muster:** `dbo.Anhaenge`
  ([db/migrations/004_anhaenge.sql](../../../db/migrations/004_anhaenge.sql))
  speichert Dateien als `VARBINARY(MAX)` direkt in der DB mit
  `FK … ON DELETE CASCADE`.
- Express-Body-Limit ist bereits `10mb`
  ([backend/server.js](../../../backend/server.js), `express.json`).

## Entscheidungen

- **Eingabe-UX:** Datei-Auswahl **und** Einfügen per Strg+V (Screenshot aus der
  Zwischenablage), mehrere Bilder mit Vorschau-Thumbnails.
- **Speicherung:** neue Tabelle `dbo.FehlerAnhaenge` mit `VARBINARY(MAX)`,
  gespiegelt am `Anhaenge`-Muster (in-DB, transaktionssicher, keine
  Pfadverwaltung). FK auf `Fehlerberichte` mit `ON DELETE CASCADE`.
- **Transport:** base64-Data-URLs inline im bestehenden JSON-Body von
  `POST /api/errors` (kein Multipart nötig; Body-Limit 10mb reicht bei den
  Client-Limits unten).

## Architektur & Komponenten

### 1. Datenbank — Migration `db/migrations/027_fehler_anhaenge.sql`

Neue Tabelle, idempotent (`IF NOT EXISTS`), ausgeführt gegen `Berichtsheft_Dev`:

```
dbo.FehlerAnhaenge (
  Id            INT IDENTITY PK,
  FehlerId      INT NOT NULL,              -- FK → Fehlerberichte(Id) ON DELETE CASCADE
  Dateiname     NVARCHAR(255) NOT NULL,
  MimeTyp       NVARCHAR(100) NULL,
  GroesseBytes  INT NOT NULL,
  Inhalt        VARBINARY(MAX) NOT NULL,
  HochgeladenAm DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
)
```

Index `IX_FehlerAnhaenge_FehlerId ON (FehlerId)`.

### 2. Frontend — Modal in `error-reporter.js`

- Neue „Bilder anhängen"-Zone im Modal-Body:
  - Datei-Button: `<input type="file" accept="image/*" multiple>`.
  - Paste: `paste`-Event auf dem Modal fängt Bilder aus der Zwischenablage
    (`clipboardData.items`, `type` beginnt mit `image/`).
  - Vorschau: Thumbnail-Liste mit ✕-Button je Bild zum Entfernen.
- Bilder werden als Data-URL (base64) gelesen. Große Bilder werden per Canvas
  auf max. **1600 px** längste Kante herunterskaliert (JPEG/PNG je nach
  Ursprungstyp), um die Payload klein zu halten.
- **Client-Limits:** max. **5 Bilder**, je **≤ 4 MB** nach Skalierung, nur
  `image/*`. Überschreitung → Toast-Hinweis, Bild wird nicht übernommen.
- Beim Senden trägt der Aufruf ein neues Feld
  `bilder: [{ name, mimeTyp, dataUrl }]` in den Body. Signatur von `melde`
  wird um einen optionalen `bilder`-Parameter erweitert; nur der manuelle
  Modal-Pfad füllt ihn. Automatische `frontend`-Reports senden **nie** Bilder.

### 3. Backend — Route + Service

- `POST /api/errors`:
  - Nimmt optional `bilder` entgegen, **nur** wenn `quelle === 'manual'`
    (sonst ignorieren/ablehnen).
  - Serverseitige Validierung: Array mit ≤ 5 Einträgen; jeder Eintrag mit
    `dataUrl`, deren MIME mit `image/` beginnt; dekodierte Größe ≤ 4 MB.
    Ungültige Einträge werden verworfen (Meldung selbst wird trotzdem
    gespeichert — Text ist das Wichtigste).
- `logError` gibt künftig die betroffene Zeilen-`Id` zurück — sowohl im
  Insert-Fall als auch im Gruppierungs-(UPDATE-)Fall (per `OUTPUT`/erneutem
  `SELECT` des Fingerprints). Die Route ruft danach
  `speichereFehlerAnhaenge(fehlerId, bilder)` im Service auf, das die
  base64-Daten zu `Buffer` dekodiert und als `VARBINARY` einfügt.
- Zwei neue **developer-only** Endpunkte (bestehende `nurDeveloper`-Middleware):
  - `GET /api/dev/errors/:id/anhaenge` → JSON-Liste
    (`Id, Dateiname, MimeTyp, GroesseBytes`), **ohne** Binärdaten.
  - `GET /api/dev/errors/anhaenge/:anhangId` → Binärdaten mit korrektem
    `Content-Type` (aus `MimeTyp`) und `Content-Disposition: inline`.

### 4. Viewer — `fehlerberichte.js`

- Pro Fehler-Zeile eine zusätzliche `<details>`-Sektion „Anhänge (N)", die die
  Anhang-Metadaten lädt und Thumbnails via
  `<img src="/api/dev/errors/anhaenge/:id" loading="lazy">` rendert.
- Klick auf ein Thumbnail öffnet das Bild in voller Größe (neuer Tab oder
  Lightbox-Overlay).
- Zeigt die Sektion nur, wenn Anhänge existieren. Die Anhang-Zahl kann als
  Feld in der Listen-Antwort (`AnzahlAnhaenge`) mitgeliefert werden, um
  N leere Detail-Requests zu vermeiden.

## Datenfluss

1. Nutzer öffnet Modal, tippt Text, fügt Bild(er) per Datei/Paste hinzu.
2. Client skaliert/validiert Bilder → Data-URLs.
3. `POST /api/errors` mit `{ quelle:'manual', nachricht, kontext, bilder }`.
4. Route validiert, `logError` liefert `fehlerId`,
   `speichereFehlerAnhaenge` schreibt VARBINARY-Zeilen.
5. Developer öffnet Fehlerberichte-Seite → Liste zeigt „Anhänge (N)" →
   Thumbnails werden per Binär-Endpunkt lazy geladen.

## Fehlerbehandlung

- Bild-Speicherung darf die Meldung **nie** killen: schlägt
  `speichereFehlerAnhaenge` fehl, wird das geloggt (Konsole), aber der
  Fehlerbericht bleibt gespeichert und die Route antwortet weiter mit `204`.
- Ungültige/zu große Bilder werden client- **und** serverseitig gefiltert
  (Defense-in-Depth, analog zur bestehenden `istTransienterVerbindungsfehler`-
  Filterung).

## Randfall: Fingerprint-Gruppierung manueller Meldungen

Manuelle Meldungen gruppieren per Fingerprint `manual|text|` (Stack leer). Bei
**identischem Text** hängt ein neues Bild an die bestehende offene Gruppe an
(die UPDATE-Zeile). Das ist selten und akzeptabel; es geht nichts verloren, die
Bilder sammeln sich am selben Eintrag. Keine Sonderbehandlung.

## Tests

- **Service-Unit-Test** (`fehlerberichte.test.js`, bestehende Datei): Validierung
  der `bilder` (Anzahl-/Größen-/MIME-Grenzen) als reine Funktion, plus dass
  `logError` eine `Id` zurückgibt. Reine, DB-freie Prüfungen wie bisher.
- **Manuelle Verifikation** im Browser (siehe Memory `reference_local_app_testing`):
  Modal, Paste-Screenshot, mehrere Bilder, Senden, Anzeige im Developer-Viewer.

## Nicht im Scope (YAGNI)

- Kein Bild-Anhang für automatische `frontend`-/`backend`-Reports.
- Kein Multipart-Upload, keine Dateiablage im Dateisystem, kein CDN.
- Keine Bildbearbeitung außer Herunterskalieren.
