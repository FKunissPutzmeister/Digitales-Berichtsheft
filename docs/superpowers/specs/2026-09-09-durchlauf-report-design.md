# Design-Spec: Durchlauf-Report (Abteilungsdurchlauf + Beurteilungen als PDF)

Stand 2026-09-09. Umgesetzt in einem Zug; Freigabe lag vor Implementierung vor.

## Zweck

Admin und Ausbildungsleitung brauchen einen ausführlichen Report über den
Abteilungsdurchlauf eines oder mehrerer Azubis samt Noten bzw. Kurzfeedbacks,
als A4-PDF im Putzmeister-Design, wahlweise für einen Zeitraum oder die ganze
Ausbildung. Vorher gab es nur den Planer-Druck (Tafel/Tabelle ohne
Beurteilungen) und den Einzel-Beurteilungsbogen.

## Entscheidungen (final)

| Thema | Entscheidung |
|---|---|
| Umfang | Ein PDF für 1..n Azubis (Sammel-Report), je Azubi ein Abschnitt auf neuer Seite |
| Detailgrad | Nur Übersicht: Stammdaten + Foto, Kennzahlen, Stationen-Tabelle. Kein Kriterienblock, keine Unterschriften |
| Inhalt je Station | Nur `abgeschlossen` zeigt Inhalt. Typ `gross`: „Note 2,3 (78/100)" + Individuelle Beurteilung ≤200 Zeichen. Typ `kurz`: Gesamteindruck ≤200 Zeichen + „Empfehlung:" ≤100 Zeichen. `entwurf` → „offen (Entwurf)" ohne Text |
| Zeitraum | Station zählt, wenn sie den Zeitraum überlappt (Regel wie `barGeom`); angezeigt wird das echte Von/Bis |
| Erzeugung | Print-HTML im Popup → Browser-Druckdialog „Als PDF speichern" (Hausmuster, keine Server-PDF) |
| Einstieg | Dritter Modus „Report" im bestehenden Druck-Dialog des Abteilungs-Planers; Button nur für `role admin/developer` oder `istAusbildungsleiter` |
| Zugang | Kein Guard-Umbau am Planer; die realen Ausbildungsleiter bekommen `KannPlanen` in der Nutzerverwaltung |
| Personenliste | Planer-Liste, **der kaufmännisch-Filter im Planer wird entfernt** (technische Azubis erscheinen wieder auf der Tafel). Im Report-Modus zusätzlich Schnitt mit der serverseitig sichtbaren Menge (Ausbildungsleiter = eigener Bereich) |
| Backend | Neuer Bulk-Endpoint mit serverseitigem Rollen-Gate; Texte nur für abgeschlossene Beurteilungen |

## Geprüfte Voraussetzungen (Codelektüre vor der Umsetzung)

| Prüfpunkt | Ergebnis |
|---|---|
| `noten.test.js` | testet nur `darfNotenSehen`/`darfNotenBearbeiten` mit reinen Kontext-Objekten — **kein** Fake-Pool für `sichtbareAzubis`/`dauerAzubiOids`. Die Extraktion ist damit ungetestet, solange `azubiSicht.test.js` fehlt → dieser Test ist Pflicht. |
| `routes/noten.js:266` | ruft `notenSvc.sichtbareAzubis(pool, req.user)` → Re-Export in `noten.js` ist Pflicht. |
| Routenreihenfolge `beurteilungen.js` | Es gibt **kein** `POST /:id` → `POST /report` kollidiert mit nichts; `GET /report/azubis` kollidiert nicht mit `GET /:id/unterschrift/:rolle` (andere Segmentzahl). Einbau nach `/meine`. |
| Mount | `server.js` `app.use('/api/beurteilungen', devAuth, beurteilungenRouter)` — existiert, kein Server-Eingriff. |
| Spalten | `dbo.Zuweisungen`: `Id, AzubiOid, VerantwEmail, VerantwName, Abteilung, Von, Bis`. `dbo.Beurteilungen`: `Status, Typ, Note, GesamtPunkte, IndividuelleBeurteilung, KurzfeedbackEindruck, KurzfeedbackEmpfehlung, AbgeschlossenAm`. `dbo.Users`: `AusbildungBeginn`/`AusbildungEnde` (ohne „s"). **Keine Migration nötig.** |
| `ymd` | aus `services/zugriff.js` exportiert → wiederverwendbar. |
| `berufeKatalog` im Planer | wird nur an drei Stellen im kaufmännisch-Filter benutzt → Rücknahme ist lokal. |
| `.pt-seg` | `planer-board.css` ist `inline-flex` mit `button + button{border-left}` → dritter Button ohne CSS-Änderung. |
| Foto-Endpoint | `GET /api/users/:oid/photo` → 404 ohne Foto. Fetch im Opener mit `credentials:'include'`. |
| `Toast`/`Modal`/`DB` | in `durchlauf-report.js` nur **innerhalb** von `erstellen()` referenziert, damit `require()` unter `node --test` nicht bricht. Zusätzlich lokale `displayName`/`getInitials`-Kopien. |

## 1. Backend

### 1.1 `backend/services/azubiSicht.js` (neu)
- `dauerAzubiOids` und `sichtbareAzubis` aus `noten.js` unverändert hierher
  verschoben; `noten.js` importiert und re-exportiert sie weiter.
- Die beiden `SELECT … FROM dbo.Users` in `sichtbareAzubis` um
  `AusbildungBeginn, AusbildungEnde` erweitert.
- Neu und rein: `istReportBerechtigt(user)` = `role ∈ {admin, developer}` ODER
  (`istAusbildungsleiter && ausbildungsleiterBereich`).

### 1.2 `backend/services/durchlaufReport.js` (neu)
- `pruefeAnfrage(body)` → `{ok, fehler?, azubiOids, von, bis}`: 1..200 OIDs
  (dedupliziert, ≤36 Zeichen, GUID-Strings — **kein** parseInt), `von`/`bis`
  strikt `YYYY-MM-DD`, `von <= bis`.
- `bereinigeBeurteilung(row)` → `null` ohne Beurteilung; sonst
  `{id,status,typ,note,gesamtPunkte,abgeschlossenAm,individuelleBeurteilung,
  kurzfeedbackEindruck,kurzfeedbackEmpfehlung}` — alles außer `id/status/typ`
  auf `null`, wenn `status !== 'abgeschlossen'` (zweite Absicherung zum
  SQL-`CASE`).
- `formeStation(row)` → `{id, abteilung, von, bis|null, verantwName,
  verantwEmail, beurteilung}`, Datumsfelder über `ymd` aus `services/zugriff.js`.
- `ladeReport(pool, user, {azubiOids, von, bis})`: Schnitt gegen
  `azubiSicht.sichtbareAzubis`, sonst `throw` mit `status:403` +
  `unzulaessig:[…]`; **eine** Abfrage mit `@o0..@oN` (`sql.NVarChar(36)`),
  `@von`/`@bis` als `sql.Date`, inkl. `(z.Bis IS NULL OR z.Bis >= @von)` und
  `COALESCE(z.VerantwName, u.Name)`. Namen bleiben im DB-Format
  „Nachname, Vorname"; der Client dreht mit `displayName`.

### 1.3 Routen `backend/routes/beurteilungen.js`
- `GET /api/beurteilungen/report/azubis` → Gate `istReportBerechtigt`, sonst
  403; liefert `sichtbareAzubis` als `{oid,name,role,department,beruf}`.
- `POST /api/beurteilungen/report` Body `{azubiOids, von, bis}` (POST wegen
  „Alle" = viele GUIDs). Gate → 403; `pruefeAnfrage` → 400; 403 aus
  `ladeReport` → `{error, unzulaessig}`; sonst 500 über `logError`.

## 2. Frontend-API (`app/js/api.js`)
`getReportAzubis()` und `getDurchlaufReport(azubiOids, von, bis)`, beide mit
`erwartet: [403]` — das Rollen-Gate ist ein legitimes Fachergebnis und gehört
nicht in den Fehler-Posteingang.

## 3. Planer
- Kaufmännisch-Filter entfernt: die Tafel zeigt wieder alle aktiven Azubis +
  DH-Studenten. `DB.getBerufe()` fällt aus dem `Promise.all`.
- `ptPrint`-Handler gibt `reportErlaubt` und `erstelltVon` an
  `PlanerPrint.open` mit.
- `planer-print.js`: dritter Segment-Button, `personenFuerModus()` (im
  Report-Modus Schnitt mit `/report/azubis`), `dlgZeichnen()` nach **jedem**
  Moduswechsel (fehlte vorher), `ppGo`-Zweig für `report` mit synchronem
  `window.open`.

## 4. `app/js/durchlauf-report.js` (neu)
IIFE mit `window.DurchlaufReport` + `module.exports`, eigene
`esc`/`fmtDe`/`displayName`/`initialen`, Konstanten `LOGO_REL`/`FONT_REL`.
Reine Funktionen: `ueberlappt`, `kuerzen`, `fmtNote`, `fmtSchnitt`,
`berechneKennzahlen`, `beurteilungZelle`, `renderReportHtml`.
Print-Template nach Vorlage `berichtsheft-export.js`: `@font-face` CD-Fonts,
Logo als Data-URI, `.sheet` 210 mm, `@page{size:A4;margin:0}`, CD-Fußleiste als
`<tfoot class="pm-footer">` (#FFC300 / #53565A), Toolbar mit Druckbutton,
Auto-Print nur im Top-Fenster nach `document.fonts.ready`. **Alle Farben und
Fonts hart im Template**, keine CSS-Variablen der App.
`erstellen(win, opts)`: Platzhalter ins Popup → `DB.getDurchlaufReport` →
parallel Logo + Fotos (`/api/users/:oid/photo`, Batches von 8, 404 → Initialen)
→ ctx bauen → `win.document.open/write/close` → Toast.

## Risiken und wie sie abgedeckt sind

- **Leitung darf nicht alle Planer-Personen sehen:** Client schneidet mit
  `/report/azubis`, Server prüft jede OID erneut (403). Beide Ebenen nötig.
- **Popup-Blocker:** `window.open` synchron im Klick, Befüllen nach `await`.
- **Fotos/Fonts im Popup:** Data-URIs aus dem Opener; `document.fonts.ready`
  vor `print()`.
- **`VerantwName` NULL** bei Alt-Zeilen → `COALESCE` mit `Users.Name`, im
  Client E-Mail-Fallback.
- **`Note` NULL** trotz abgeschlossen → „Note –", aus dem Durchschnitt
  ausgeschlossen.
- **Planer-Tafel wird länger** durch die Filter-Rücknahme (alle technischen
  Azubis) — Gruppierung und Sortierung bleiben unverändert.
