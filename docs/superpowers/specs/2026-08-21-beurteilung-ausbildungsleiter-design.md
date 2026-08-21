# Ausbildungsleiter statt Ausbilder im Beurteilungsbogen — Design-Spec

**Datum:** 2026-08-21
**Status:** Entwurf
**Ersetzt/korrigiert:** Teile von
[2026-08-20-beurteilung-unterschriften-design.md](2026-08-20-beurteilung-unterschriften-design.md)
(dritter Signatur-Schritt) — die dort beschriebene Rolle „dauerhafter
Ausbilder" war ein Denkfehler und wird hier durch die tatsächlich gemeinte
Rolle „Ausbildungsleiter" ersetzt.

---

## Problem

Die erste Umsetzung des Signatur-Prozesses (Commits `901a581`..`60641de` auf
`feature/beurteilung-unterschriften`) hat den dritten Bestätigungsschritt an
`dbo.AusbilderAzubis` gekoppelt — die dauerhafte Betreuungs-Zuordnung
Azubi↔Ausbilder, die für ganz andere Zwecke existiert (z. B. „Betreute
Azubis" im Dashboard). Das ist fachlich falsch:

- **Der Ausbilder ist nicht der Ausbildungsleiter.** Ausbildungsleiter sind
  aktuell genau zwei konkrete Personen: Marco Rossi (technische Berufe —
  Industriemechaniker, Mechatroniker, Lackierer) und Anika Kailer (alle
  übrigen Berufe inkl. IT und kaufmännisch, sowie DH-Studenten).
- **Nur der Beurteiler (Prüfer) darf bearbeiten.** Aktuell bekommt der
  dauerhafte Ausbilder über `verantwortlichFuerZuweisung` (datumsunabhängig,
  `backend/services/zugriff.js:189-195`) ebenfalls Bearbeiten-Rechte an der
  Beurteilung — das ist nicht gewollt. Nur wer die Beurteilung tatsächlich
  ausfüllt (der zeitlich zugewiesene Prüfer, oder admin/developer), darf
  „Entwurf speichern", „Abschließen" und „Änderungen speichern" (Korrektur
  nach Abschluss) nutzen.
- **Azubi und Ausbildungsleiter dürfen nur bestätigen + drucken.** Keine
  Bearbeiten-Möglichkeit.
- **Der dauerhafte Ausbilder darf die Beurteilung nur ansehen** (+ drucken),
  keine Aktion.

Diese Spec beschreibt den Umbau des in der ersten Runde gebauten Prozesses
auf das korrekte Rollenmodell. Die technische Basis (Signatur-Dialog,
persönliches Unterschrift-Profil, Bild-Endpunkt, PDF-Einbettung) bleibt
unverändert nutzbar — nur die Frage „wer darf was" und „wer ist der dritte
Unterzeichner" wird neu beantwortet.

## Ziel

- Ausbildungsleiter ist ein Nutzer-Tag (`IstAusbildungsleiter`), keine
  Zuweisung — zwei mögliche Bereiche: `technisch` / `kaufmaennisch`.
- Welcher Bereich zu welchem Azubi gehört, ergibt sich aus einem **Berufs-
  Katalog** (`dbo.Berufe`), gepflegt in der Nutzerverwaltung — keine
  Code-Kopplung an Berufsbezeichnungen.
- Genau vier Nutzungsmodi auf dem Beurteilungsbogen, vom Server explizit
  bestimmt (nicht mehr vom Frontend geraten): Beurteiler (bearbeiten),
  Azubi (Kenntnisnahme), Ausbildungsleiter (bestätigen), sonstige Leser
  (nur ansehen/drucken).
- Personalunion (Beurteiler = zuständiger Ausbildungsleiter) lässt den
  dritten Schritt weiterhin entfallen — jetzt korrekt an der tatsächlichen
  Identität gemessen, nicht mehr an der AusbilderAzubis-Zuordnung.

## Entscheidungen aus der Klärung

- **Beruf→Bereich-Zuordnung:** eigener Datenbank-Katalog (`dbo.Berufe`),
  nicht im Code hartkodiert — Änderungen an Berufsbezeichnungen brauchen
  kein Deployment.
- **Keine Zuordnung pro Azubi:** explizit verworfen (zu feingranular,
  unnötige Pflege pro Person). Die Zuordnung läuft über die Berufsebene.
- **Personalunion:** Schritt entfällt, wenn Beurteiler = zuständiger
  Ausbildungsleiter.
- **Scope der Bearbeiten-Einschränkung:** nur der Beurteilungsbogen.
  Wochenberichte/Korrektur-Rechte des dauerhaften Ausbilders bleiben
  unverändert (`verantwortlichFuerZuweisung` in `zugriff.js` wird nicht
  angefasst).
- **Pflege-UI:** Berufe-Katalog wird in die bestehende Nutzerverwaltungs-
  Seite integriert (kein neuer Menüpunkt/Reiter).

## Scope

### 1. Datenmodell — Migration 036 (neu, da 035 bereits eingespielt ist)

```sql
-- 1) Umbenennung der in Migration 035 falsch benannten Spalten
IF COL_LENGTH('dbo.Beurteilungen','AusbilderBestaetigtVon') IS NOT NULL
   AND COL_LENGTH('dbo.Beurteilungen','AusbildungsleiterBestaetigtVon') IS NULL
BEGIN
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderBestaetigtVon', 'AusbildungsleiterBestaetigtVon', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderBestaetigtAm', 'AusbildungsleiterBestaetigtAm', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderUnterschriftBild', 'AusbildungsleiterUnterschriftBild', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderUnterschriftExt', 'AusbildungsleiterUnterschriftExt', 'COLUMN';
  PRINT 'Beurteilungen-Spalten von Ausbilder* auf Ausbildungsleiter* umbenannt.';
END
ELSE PRINT 'Umbenennung bereits erfolgt oder Ausgangsspalten fehlen.';

-- 2) Berufs-Katalog
IF OBJECT_ID('dbo.Berufe', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Berufe (
    Id      INT IDENTITY(1,1) PRIMARY KEY,
    Beruf   NVARCHAR(200) NOT NULL,
    Bereich NVARCHAR(20)  NOT NULL
      CONSTRAINT CK_Berufe_Bereich CHECK (Bereich IN ('technisch','kaufmaennisch')),
    CONSTRAINT UQ_Berufe_Beruf UNIQUE (Beruf)
  );
  INSERT INTO dbo.Berufe (Beruf, Bereich) VALUES
    ('Industriemechaniker', 'technisch'),
    ('Mechatroniker', 'technisch'),
    ('Lackierer', 'technisch');
  PRINT 'Tabelle dbo.Berufe angelegt und mit bekannten technischen Berufen vorbelegt.';
END
ELSE PRINT 'dbo.Berufe existiert bereits.';

-- 3) Ausbildungsleiter-Tag auf Users
IF COL_LENGTH('dbo.Users','IstAusbildungsleiter') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD
    IstAusbildungsleiter    BIT          NOT NULL CONSTRAINT DF_Users_IstAusbildungsleiter DEFAULT 0,
    AusbildungsleiterBereich NVARCHAR(20) NULL
      CONSTRAINT CK_Users_AusbildungsleiterBereich CHECK (AusbildungsleiterBereich IN ('technisch','kaufmaennisch'));
  PRINT 'Spalten IstAusbildungsleiter/AusbildungsleiterBereich auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Ausbildungsleiter-Spalten bereits.';
```

Kein Seed für die zwei konkreten Personen (Rossi/Kailer) in der Migration —
das sind reale Nutzer-Accounts, deren Tag über die Nutzerverwaltung gesetzt
wird (Migration legt nur den Katalog + die Spalten an).

**Nicht mehr Teil dieser Spec:** die in der Design-Vorgänger-Spec diskutierte
`istDauerhafterAusbilder`/`ausbilderSchrittEntfaellt`-Logik auf Basis von
`dbo.AusbilderAzubis` — diese Funktionen bleiben zwar im Code bestehen
(Task-2-Änderungen werden nicht zurückgerollt), bekommen aber eine neue,
engere Aufgabe: nur noch „darf ansehen", nicht mehr „ist der dritte
Unterzeichner".

### 2. Backend — Berechtigungen

**`backend/services/beurteilungen.js`:**
- Neue, enge Funktion `darfBeurteilungBearbeiten(user, zuweisung)`: `true`
  für admin/developer ODER exakten E-Mail-Match auf
  `zuweisung.verantwortlicherEmail` (die zeitlich befristete
  Prüfer-Zuweisung) — **kein** Rückgriff auf `dauerAusbilderAzubiOids`.
  Ersetzt `darfBeurteilen` an allen bearbeitenden Stellen (Entwurf
  speichern, Abschließen, Korrektur nach Abschluss).
- Bestehendes `darfBeurteilen` (breiter, inkl. dauerhaftem Ausbilder) bleibt
  unter diesem Namen bestehen, wird aber nur noch für **Ansichtsrechte**
  verwendet (Bild-Endpunkt, Lese-Route) — Doku-Kommentar entsprechend
  anpassen.
- Neuer Service `backend/services/berufe.js` (CRUD, 1:1 nach dem Muster von
  `backend/services/abteilungen.js`): `listBerufe`, `createBeruf`,
  `updateBeruf`, `deleteBeruf`, plus `bereichFuerBeruf(pool, beruf)` (Lookup,
  `NULL` wenn kein Katalog-Eintrag).
- Neue Funktion `ermittleAusbildungsleiter(pool, azubiOid)`: lädt den Azubi
  (`Beruf`), ruft `bereichFuerBeruf`, sucht Nutzer mit
  `IstAusbildungsleiter=1 AND AusbildungsleiterBereich=<Bereich>` → gibt
  dessen `Oid` zurück oder `null` (kein Katalog-Treffer ODER kein Nutzer mit
  passendem Bereich getaggt — beide Fälle gleich behandelt: dritter Schritt
  entfällt lautlos, siehe Randfall unten).
- `ausbildungsleiterSchrittEntfaellt` (ersetzt `ausbilderSchrittEntfaellt`):
  `true`, wenn `BeurteiltVon` identisch mit dem Ergebnis von
  `ermittleAusbildungsleiter` ist, ODER wenn `ermittleAusbildungsleiter`
  `null` liefert (kein Ausbildungsleiter ermittelbar → Schritt kann nicht
  stattfinden, wird wie „entfällt" behandelt, keine Fehlermeldung).
- `ausbilderBestaetigen` → umbenannt zu `ausbildungsleiterBestaetigen`;
  Autorisierung darin/davor: `ermittleAusbildungsleiter(...) === req.user.oid`
  (statt `istDauerhafterAusbilder`).
- Neuer Server-seitiger `modus`-Wert im GET-Response (ersetzt die bisherigen
  Einzel-Flags `darfAusbilderBestaetigen`/`editable`-Vermischung): eines von
  `'bearbeiten' | 'azubi' | 'ausbildungsleiter' | 'ansicht'`, eindeutig vom
  Server bestimmt:
  1. `darfBeurteilungBearbeiten` → `'bearbeiten'`
  2. sonst Azubi-Eigentümer → `'azubi'`
  3. sonst `ermittleAusbildungsleiter(...) === user.oid` UND Beurteilung
     abgeschlossen UND noch nicht bestätigt UND Personalunion-Schritt NICHT
     entfallen (`!ausbildungsleiterSchrittEntfaellt`) → `'ausbildungsleiter'`
     (der Entfällt-Check ist nötig, weil sonst ein Beurteiler, dessen
     E-Mail nach dem Abschluss von der Zuweisung abweicht — z. B. durch
     eine nachträgliche Korrektur —, sich selbst ein zweites Mal als
     Ausbildungsleiter bestätigen könnte; beim Review der Umsetzung
     entdeckt, siehe Plan-Task 7)
  4. sonst (aber `darfBeurteilen`-Ansichtsrecht erfüllt) → `'ansicht'`
  5. sonst 403 (kein Zugriff)

**`backend/routes/beurteilungen.js`:**
- `ladeUndAutorisiere` (aktuell für Abschließen/Korrektur genutzt) auf
  `darfBeurteilungBearbeiten` umgestellt.
- `PATCH /:id/ausbilder-bestaetigung` → Pfad und Handler umbenannt zu
  `PATCH /:id/ausbildungsleiter-bestaetigung`, Autorisierung über
  `ermittleAusbildungsleiter` statt `istDauerhafterAusbilder`.
- `GET /` (zuweisungId-Zweig) liefert den neuen `modus`-Wert statt der
  bisherigen `darfAusbilderBestaetigen`/`ausbilderSchrittEntfaellt`-Flags
  (letzteres bleibt zusätzlich für die PDF-Zeilen-Logik erhalten, nur
  umbenannt).
- Bild-Endpunkt (`GET /:id/unterschrift/:rolle`) bleibt inhaltlich
  unverändert (Ansichtsrecht via `darfBeurteilen`), `rolle`-Wert
  `'ausbilder'` → `'ausbildungsleiter'`.
- Neue Routen für den Berufe-Katalog: `GET /api/berufe` (jeder
  authentifizierte Nutzer, wie bei Abteilungen), `POST/PATCH/DELETE
  /api/berufe/:id` (developer-only) — eigene Datei
  `backend/routes/berufe.js`, 1:1 nach `backend/routes/abteilungen.js`.

**`backend/services/users.js`:**
- `PATCH_COLUMNS` um `istAusbildungsleiter` (`IstAusbildungsleiter`, Bit)
  und `ausbildungsleiterBereich` (`AusbildungsleiterBereich`,
  NVarChar(20)) ergänzen. Lese-Mapping (`buildReqUser`/Normalisierung)
  entsprechend erweitern, damit beide Felder auch beim GET zurückkommen.

### 3. Frontend

**`app/js/beurteilung.js` — `renderActions()` komplett auf den
Server-`modus` umgestellt** (ersetzt die bisherige, fehleranfällige
Kombination aus lokal berechnetem `editable` + `darfAusbilderBestaetigen`):

- `'bearbeiten'`: bestehende Buttons (Entwurf speichern / Abschließen bzw.
  Änderungen speichern / Als PDF) — **ohne** den in der ersten Runde
  fälschlich hier eingehängten Ausbildungsleiter-Button.
- `'azubi'`: bestehender Kenntnisnahme-Button + Als PDF (unverändert).
- `'ausbildungsleiter'` (neu, eigener Zweig): „Als Ausbildungsleiter
  bestätigen"-Button (gleicher Signatur-Dialog-Ablauf wie bisher) + Als
  PDF — sonst keine Buttons.
- `'ansicht'` (neu, eigener Zweig): nur „Als PDF", keine Buttons.

**`app/js/api.js`:** `ausbilderBestaetigenBeurteilung` →
`ausbildungsleiterBestaetigenBeurteilung` (PATCH-Pfad angepasst),
`beurteilungUnterschriftUrl`-Rolle `'ausbilder'` → `'ausbildungsleiter'`,
neue `getBerufe`/`createBeruf`/`updateBeruf`/`deleteBeruf`-Wrapper.

**`app/js/beurteilung.js` — PDF-Export:** `rolle`-Werte und Feldnamen
(`hatAusbilderUnterschrift` → `hatAusbildungsleiterUnterschrift`,
`ausbilderSchrittEntfaellt` → `ausbildungsleiterSchrittEntfaellt`)
konsistent umbenannt, Label „Unterschrift des/r Ausbildungsleiters/-in"
bleibt unverändert (war inhaltlich schon immer richtig — nur die
internen Bezeichner waren falsch).

**`app/js/nutzerverwaltung.js` — zwei Ergänzungen auf derselben Seite:**
1. Im bestehenden Bearbeiten-Modal: neue Checkbox „Ist Ausbildungsleiter"
   neben „Ist Ausbilder", plus ein Bereich-Dropdown
   (technisch/kaufmännisch), das per `change`-Listener nur bei aktivierter
   Checkbox sichtbar ist (gleiches Ein-/Ausblend-Muster wie das
   bestehende `nvAusbilderBlock`).
2. Neuer zweiter Abschnitt „Berufe" auf derselben Seite (eigene Card
   unterhalb der Nutzerliste, kein neuer Menüpunkt): Liste aller
   Katalog-Einträge (Beruf/Bereich) + ein Modal zum Anlegen/Bearbeiten,
   1:1 nach dem Muster von `abteilungsverwaltung.js`. Vorschläge für den
   Beruf-Namen beim Anlegen aus den bereits vorhandenen, unterschiedlichen
   `Beruf`-Werten der Nutzer (wie der bestehende Filter im
   Abteilungsplaner) — reine UX-Hilfe, kein Zwang.

## Nicht im Scope

- Keine Änderung an `verantwortlichFuerZuweisung`/`zugriff.js` — Wochen-
  bericht-Korrekturrechte des dauerhaften Ausbilders bleiben unverändert.
- Keine Migration/Bereinigung bereits existierender Testdaten in den
  umbenannten Spalten (Dev-DB, keine Produktionsdaten betroffen).
- Kein Lösch-Schutz/Historisierung für `dbo.Berufe`-Einträge, die noch von
  aktiven Azubis referenziert werden — Löschen eines Katalog-Eintrags
  entfernt lediglich die Klassifizierung (betroffene Azubis fallen danach
  unter „kein Katalog-Treffer", dritter Schritt entfällt lautlos für sie,
  bis der Eintrag neu angelegt wird).
- Keine Mehrfach-Ausbildungsleiter je Bereich vorgesehen (Spec geht von
  genau einem aktiven Nutzer je Bereich aus); sind versehentlich mehrere
  getaggt, gewinnt schlicht, wer zuerst in der SQL-Sortierung erscheint —
  akzeptiertes Risiko, da organisatorisch nicht vorgesehen.

## Risiken / Randfälle

- **Kein Katalog-Treffer für einen Beruf:** dritter Schritt entfällt
  lautlos (kein Fehler, kein Button) — Admin muss den Beruf nachtragen,
  damit der Ausbildungsleiter-Schritt für künftige Fälle wieder greift.
  Rückwirkend für bereits abgeschlossene Beurteilungen ändert ein
  nachträglicher Katalog-Eintrag nichts (Modus wird bei jedem Aufruf neu
  berechnet, aber niemand wird nachträglich benachrichtigt).
- **Kein Nutzer mit passendem `AusbildungsleiterBereich` getaggt:** gleiche
  Behandlung wie „kein Katalog-Treffer" — Schritt entfällt lautlos.
- **Umbenennung der Spalten via `sp_rename`:** verändert keine Daten, nur
  Namen — unkritisch, da Dev-DB noch keine echten Signaturen enthält.
- **Bestehende Instanzen der alten Bezeichner** (`ausbilderBestaetigen`,
  `istDauerhafterAusbilder` als „ist der dritte Unterzeichner"-Prüfung)
  werden vollständig ersetzt, nicht nur ergänzt — sonst zwei parallele,
  widersprüchliche Vorstellungen von „wer ist der Ausbilder" im Code.

## Verifikation

Manuell im Browser (Demo-Konten): mind. ein Prüfer (befristete Zuweisung),
ein Azubi, ein Nutzer mit dauerhafter `AusbilderAzubis`-Zuordnung zu diesem
Azubi (ANDERE Person als der Prüfer), und ein Nutzer mit
`IstAusbildungsleiter=1` + passendem `AusbildungsleiterBereich` für den
Beruf dieses Azubis (in der Nutzerverwaltung vorher gesetzt, Beruf vorher
im neuen Berufe-Katalog eingetragen).

1. Prüfer sieht Bearbeiten-Buttons, schließt mit Unterschrift ab.
2. Azubi sieht nur „Kenntnisnahme bestätigen" + Drucken.
3. Der dauerhafte Ausbilder (nicht Ausbildungsleiter) sieht die Beurteilung
   nur lesend, ausschließlich „Als PDF" — keine Buttons, kein
   Bearbeiten-Zugriff auch nicht über direkten API-Call (403).
4. Der als Ausbildungsleiter getaggte Nutzer sieht „Als Ausbildungsleiter
   bestätigen" + Drucken, bestätigt mit Unterschrift.
5. Personalunion-Testfall: Prüfer und Ausbildungsleiter sind dieselbe
   Person → kein dritter Button, PDF zeigt nur zwei Zeilen.
6. Berufe-Verwaltung in der Nutzerverwaltung: Beruf anlegen/bearbeiten,
   Nutzer als Ausbildungsleiter taggen — Änderung wirkt beim nächsten
   Laden der Beurteilung ohne Deployment.
