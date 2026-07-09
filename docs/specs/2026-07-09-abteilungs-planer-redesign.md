# Spec: Abteilungs-Planer Redesign (Timeline-first)

Stand: 2026-07-09 · Product Owner: Florian Kern · Status: Struktur freigegeben, visuelle Variante wird per Mockup-Auswahl bestimmt

## Ziel

Die Planer-Seite (`app/abteilungs-planer.html`, Voll-Planer für `kannPlanen`) wird zur **einen Plantafel als Arbeitsfläche**: schnell, dicht, strukturiert. Hauptnutzerin ist HR (täglich, ~40–60 Personen). Die Read-only-Sichten (Azubi `?mein=1`, Ausbilder) bleiben unverändert.

## Nicht-Ziele (explizit PO-entschieden)

- **Keine KPI-/Statistik-Kacheln** (die bestehende 4er-Reihe entfällt ersatzlos).
- **Keine Audit-/Fehler-/Aktivitäts-Logs.**
- Keine Kapazitätsplanung je Abteilung, keine Matching-Algorithmen, keine Virtualisierung (Phase 2+, falls je nötig).
- Kein FK-Umbau `Zuweisungen.Abteilung` (bleibt Freitext; Farbzuordnung über Katalog-Namensabgleich, Phase 2: Migration auf `AbteilungId`).

## Backend

1. **`GET /api/zuweisungen`**: `LEFT JOIN dbo.Users` → liefert `AzubiName`, `AzubiBeruf` mit. **Neues Rollen-Gate** (heute: jeder Eingeloggte sieht alles):
   - `kannPlanen` → alle Zuweisungen
   - `istAzubi`/`istDhStudent` (ohne kannPlanen) → nur eigene (`AzubiOid = req.user.oid`)
   - `istAusbilder` (ohne kannPlanen) → betreute Azubis (AusbilderAzubis) + Zuweisungen mit eigener `VerantwEmail`
   - `?azubiOid=`-Filter bleibt, wird gegen das Gate geschnitten.
2. **`PATCH /api/zuweisungen/:id`** (neu, `nurPlaner`): Felder abteilung, verantwEmail, von, bis; Überschneidungs-Check wie POST, aber **exklusive der eigenen Id**; 404 bei unbekannter Id.
3. **Versetzungs-Benachrichtigungen**: POST/PATCH/DELETE erzeugen In-App-Benachrichtigung an Azubi + Verantwortlichen (bestehende `Benachrichtigungen`-Infrastruktur; neue Typen per Migration 018, CHECK-Constraint erweitern).
4. **Index** `IX_Zuweisungen_AzubiOid_Von ON dbo.Zuweisungen(AzubiOid, Von)` (Migration, nach PO-Freigabe der Schema-Änderungen erteilt am 2026-07-09 im Chat — „passt" steht noch aus, vor Ausführung bestätigen).
5. `DELETE /api/zuweisungen/:id`: 404 statt `ok:true` bei nicht existenter Id (Nebenbefund-Fix).

## Frontend (Voll-Planer, `abteilungs-planer.js` Neubau der Planer-Closure)

**Datenfluss:** Ein `Promise.all` beim Init: users(azubi) + users(dhstudent) + abteilungen + zuweisungen (Batch). Danach nur noch In-Memory-State (Maps: azubiById, zuweisungenByAzubi, abteilungFarbe). Mutationen patchen den State + rendern nur betroffene Zeile/Panel — **kein Voll-Refetch, kein Voll-Rerender**. Beurteilungen werden **lazy pro Person** beim Öffnen des Detail-Panels geladen. Ziel: ~6 Requests beim Load (heute ~190+).

**Zone 1 — Kopfleiste:** Sofortsuche (filtert Zeilen live) · Filter (Beruf, Jahrgang, Abteilung, Verantwortliche, „ohne aktuelle Zuweisung", „Inaktive anzeigen" default aus) · **Ausbildungsjahr-Presets** ‹ AJ 2025/26 › (Sep–Aug) + freies Blättern · Zoom Monat/Quartal/Jahr (day-px-Stufen) · „Heute" · „Drucken" · „+ Zuweisung". **Filter wirken auf die Plantafel** (heute divergieren Liste und Gantt).

**Zone 2 — Plantafel:** Zeilen gruppiert nach Lehrjahr (aus `ausbildungsBeginn`) + Gruppe „DH-Studenten", kollabierbar. Sticky Namensspalte (Nachname, Vorname · Beruf · aktuelle Abteilung), sticky Zeitkopf, Heute-Linie. Balken: **stabile Abteilungsfarbe** (Katalog-Id/Name → Palette-Index, nicht Array-Reihenfolge), Label immer sichtbar, Tooltip. Lücken = dezente Schraffur. Doppelbelegung = rote Markierung (warnen, nie blockieren). `Bis=NULL`-Altbestand = „offen"-Balken mit Fade-Kante bis Zeilenende (heute: unsichtbar wegen `width:NaN%`).

**Bearbeiten:**
- Drag (verschieben) + Resize (Enden aufziehen) mit **Wochen-Snapping**, optimistisches Update, **Undo-Toast** (kein Bestätigungsdialog). Muss mit dem bestehenden Drag-to-Pan (`abteilungen-helpers.js`) koexistieren: Drag auf Balken = Bearbeiten, Drag auf freier Fläche = Pan.
- Doppelklick auf Balken bzw. ✎ im Panel → **Edit-Dialog** (exakte Daten, Abteilung, Verantwortlicher; nutzt das bestehende Zuweisungs-Modal, erweitert um Edit-Modus).
- Klick auf Person/Balken → **Slide-in-Detail-Panel**: Stationen chronologisch mit Beurteilungs-Badge (offen/Entwurf/abgeschlossen, Logik aus Read-only-Sicht wiederverwenden), ✎/✕ je Station, „+ Zuweisung", „Durchlauf kopieren", „Drucken".

**Durchlauf kopieren:** Quelle = Person; Dialog wählt Zielpersonen (Mehrfach) + Datums-Offset (Default: Differenz der `ausbildungsBeginn`); legt Stationen per bestehendem POST an (Schleife); 409-Konflikte werden pro Station gesammelt und als Zusammenfassung gemeldet, Rest wird angelegt.

**Druck/PDF:** Print-Stylesheet (kein PDF-Lib-Einsatz). Zwei Sichten: pro Person (Stationenliste + Mini-Timeline) und pro Abteilung (alle Personen, die im gewählten Zeitraum in Abteilung X sind). Auslösung über „Drucken"-Buttons → dedizierter Print-DOM + `window.print()`.

**Zusätzlich (alle Seiten):** `initNotifications` lädt initial nur den Ungelesen-Zähler; Items erst bei Klick auf die Glocke (entschärft N+1 auf jedem Seitenload).

## Verifikation

Playwright: (1) Load-Request-Zählung ≤ 10; (2) Filter wirken auf Zeilen; (3) Drag verschiebt Balken mit Snap + Undo funktioniert; (4) Edit-Dialog PATCHt; (5) Kopieren legt Stationen bei Zielperson an; (6) Azubi-Session sieht via API nur eigene Zuweisungen (Gate); (7) `?mein=1`- und Ausbilder-Sicht unverändert; (8) keine pageerrors; (9) Druck-DOM enthält erwartete Stationen.
