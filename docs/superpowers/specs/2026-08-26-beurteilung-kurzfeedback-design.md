# Beurteilungsprozess: Kurzfeedback für kurze Zuweisungen — Design

**Datum:** 2026-08-26
**Repo/Branch:** FKunissPutzmeister/Digitales-Berichtsheft · `Digitales-Berichtsheft`
**Status:** Entwurf zur Review

---

## 1. Kontext & Ziel

Die bestehende „große Beurteilung“ ([app/beurteilung.html](../../../app/beurteilung.html) +
[app/js/beurteilung-core.js](../../../app/js/beurteilung-core.js), Backend in
[backend/routes/beurteilungen.js](../../../backend/routes/beurteilungen.js) +
[backend/services/beurteilungen.js](../../../backend/services/beurteilungen.js))
bewertet einen Abteilungsdurchlauf anhand von 10 Kriterien in 3 Blöcken, berechnet
daraus Punkte und eine Note, und durchläuft einen dreistufigen Workflow
(Beurteiler abschließt → Azubi-Kenntnisnahme → Ausbildungsleiter-Bestätigung).

Für sehr kurze Zuweisungen (bis ca. 2 Wochen — Schnuppertage, kurze
Kennenlern-Durchläufe) lässt sich der Großteil dieser 10 Kriterien nicht
belastbar einschätzen. Aktuell schreibt der Prüfer in solchen Fällen manuell
und außerhalb der App ein kurzes Feedback per E-Mail — nicht in der App
abgebildet, keine Historie, keine Fälligkeits-Erinnerung.

**Ziel:** Ein zweiter, deutlich leichtgewichtigerer Beurteilungs-Typ
„Kurzfeedback“, der bei kurzen Zuweisungen automatisch statt der großen
Beurteilung fällig wird: 3 Leitfragen als Freitext, keine Note, kein
Kriterienkatalog, kein Kenntnisnahme-/Bestätigungs-Schritt — aber trotzdem in
der App erfasst, versendet und nachvollziehbar.

---

## 2. Getroffene Entscheidungen

| Aspekt | Entscheidung |
|---|---|
| Trigger | Automatisch anhand Zuweisungsdauer: `Bis - Von` ≤ 14 Tage → Kurzfeedback, sonst große Beurteilung. Kein manuelles Override in v1. |
| Inhalt | 3 feste Leitfragen als Freitext (kein Kriterienkatalog-Bezug, keine Punkte/Note): Eindruck, Auffälligkeiten, Empfehlung. |
| Datenmodell | Bestehende `Beurteilungen`-Tabelle wiederverwenden (`Typ`-Spalte), keine Parallelstruktur. |
| Workflow | Nur `entwurf` → `abgeschlossen`. Kein Kenntnisnahme-, kein Ausbildungsleiter-Schritt. |
| Mail-Empfänger | Azubi + ermittelte Ausbildungsleitung, beide rein informativ, keine Aktion erwartet. |
| Sichtbarkeit | Erscheint in derselben Beurteilungs-Liste (`app/beurteilungen.html`) wie große Beurteilungen, mit eigenem Badge statt Notenanzeige. |

---

## 3. Trigger & Dauer-Berechnung

`ermittleUndErzeugeFaellige()` in
[backend/services/beurteilungen.js:306-342](../../../backend/services/beurteilungen.js)
prüft heute nur `z.Bis < @heute`. Erweiterung um eine Dauer-Berechnung pro
fälliger Zuweisung:

```js
function ermittleTyp(zuweisung) {
  const tage = Math.round((zuweisung.Bis - zuweisung.Von) / MS_PRO_TAG) + 1; // inklusive
  return tage <= 14 ? 'kurz' : 'gross';
}
```

Der ermittelte `Typ` fließt beim Anlegen der `beurteilung_faellig`-Mitteilung/-Mail
mit ein (Linktext/Betreff kann sich unterscheiden, z.B. „Kurzfeedback fällig“ statt
„Beurteilung fällig“), damit der Prüfer vorab weiß, welcher Prozess ihn erwartet.

Grenzfall: exakt 14 Tage (2 volle Wochen) zählt noch als „kurz“.

---

## 4. Datenmodell

Migration `db/migrations/039_beurteilung_kurzfeedback.sql` (nächste freie Nummer
nach `038_users_manuell_deaktiviert.sql`), idempotent nach bestehender Konvention:

```sql
ALTER TABLE dbo.Beurteilungen
  ADD Typ NVARCHAR(10) NOT NULL CONSTRAINT DF_Beurteilungen_Typ DEFAULT 'gross'
      CONSTRAINT CK_Beurteilungen_Typ CHECK (Typ IN ('gross', 'kurz')),
      KurzfeedbackEindruck NVARCHAR(MAX) NULL,
      KurzfeedbackAuffaelligkeiten NVARCHAR(MAX) NULL,
      KurzfeedbackEmpfehlung NVARCHAR(MAX) NULL;
```

- `Note`, `GesamtPunkte`, `BeurteilungKriterien`-Zeilen bleiben bei `Typ='kurz'`
  leer/ungenutzt — keine Änderung an deren NULL-Fähigkeit nötig, `Note`/
  `GesamtPunkte` sind laut `015_beurteilungen.sql` bereits nullable.
- `KenntnisnahmeVon/Am`, `Ausbildungsleiter*`-Spalten bleiben bei `Typ='kurz'`
  dauerhaft `NULL` — kein Schema-Zwang nötig, nur Anwendungslogik (Abschnitt 5)
  ruft die entsprechenden Endpunkte für diesen Typ nie auf.
- `ZuweisungId` bleibt `UNIQUE` — weiterhin genau ein Datensatz (große
  Beurteilung **oder** Kurzfeedback) pro Zuweisung.

---

## 5. Backend — Service & Routen

`backend/services/beurteilungen.js`:

- `upsertEntwurf()` / `abschliessen()` erweitert um die 3 neuen Felder;
  Validierung: bei `Typ='kurz'` müssen die 3 Leitfragen-Felder beim Abschließen
  nicht-leer sein (analog zur bestehenden Validierung der 10 Kriterien bei
  `Typ='gross'`), Punkte/Note-Berechnung (`berechne()` aus
  `app/js/beurteilung-core.js`) wird für `Typ='kurz'` übersprungen.
- `ermittleModus()` liefert bei `Typ='kurz'` nur zwei sinnvolle Modi:
  `bearbeiten` (für den Verantwortlichen) und `ansicht` (für alle mit
  Leserecht) — `azubi`- und `ausbildungsleiter`-Modus entfallen, da es dort
  nichts zu bestätigen gibt.
- **Keine Änderung** an `kenntnisnahme()` / `ausbildungsleiterBestaetigen()`
  selbst — diese Routen werden für `Typ='kurz'`-Datensätze schlicht nie vom
  Frontend aufgerufen (kein UI-Element dafür, siehe Abschnitt 7). Optional:
  serverseitige Guard-Klausel, die `400` liefert, falls doch aufgerufen —
  günstige Absicherung gegen Frontend-Bugs, kein funktionaler Bedarf.
- `mailBeurteilung()` in `backend/services/mail.js` bekommt einen dritten
  Mitteilungs-/Mailtyp `kurzfeedback_abgeschlossen`, ausgelöst in
  `abschliessen()` analog zu `beurteilung_abgeschlossen`, aber mit zwei
  Empfängern statt einem (Azubi + `ermittleAusbildungsleiter()`-Ergebnis,
  bereits vorhanden aus dem Ausbildungsleiter-Feature). Kein Rückkanal, keine
  Aktion in der Mail verlangt.
- `patchNachAbschluss()` (Korrektur nach Abschluss): Für `Typ='kurz'` entfällt
  das Zurücksetzen von `KenntnisnahmeVon/Am` und `AusbildungsleiterBestaetigt*`
  (sind ohnehin `NULL`) — Korrektur ist unkritischer als bei der großen
  Beurteilung, da niemand etwas erneut bestätigen muss. Erneuter Mailversand
  bei Korrektur wie gehabt.

`backend/routes/beurteilungen.js`: keine neuen Routen. `POST /` und
`PATCH /:id/abschliessen` transportieren zusätzlich die 3 Freitext-Felder statt
der Kriterien-Punkte, je nach `Typ` im Payload.

`db/migrations/016_benachrichtigungen_beurteilungstypen.sql`-Nachfolger:
`Benachrichtigungen.Typ` (`NVARCHAR(40)`) ist bereits breit genug für
`kurzfeedback_abgeschlossen` und `kurzfeedback_faellig` — keine weitere
Schema-Änderung nötig.

---

## 6. Berechnung/Validierung — bewusst kein Bezug zu `beurteilung-core.js`

Die 3 Leitfragen sind reine Freitext-Felder ohne Berechnungslogik. Es gibt
**keine** neue Funktion analog zu `berechne()` — der ganze Sinn des
Kurzfeedbacks ist, dass hier nichts berechnet oder in Stufen gepresst wird.
`beurteilung-core.js` bleibt für `Typ='gross'` unverändert; für `Typ='kurz'`
rendert `beurteilung.js` direkt drei Textareas ohne Umweg über das Kernmodul.

---

## 7. Frontend

`app/js/beurteilung.js` lädt wie bisher die Beurteilung per `zuw`-Query-Param
und verzweigt jetzt zusätzlich nach `Typ`:

- `Typ='gross'`: unverändertes Verhalten (bestehender Bogen,
  `beurteilung-core.js::renderForm()`).
- `Typ='kurz'`: neue, deutlich kürzere Render-Funktion
  `renderKurzfeedbackForm()` direkt in `beurteilung.js` — 3 Textareas mit den
  Leitfragen als Label, „Entwurf speichern“/„Abschließen“-Buttons wie gehabt,
  aber **keine** Buttons für Kenntnisnahme oder Ausbildungsleiter-Bestätigung,
  keine Signatur-Erfassung (Signaturen sind an den 3-Stufen-Workflow der
  großen Beurteilung gebunden und für ein reines Freitext-Feedback ohne
  Gegenzeichnung nicht sinnvoll).
- Read-only-Ansicht (`ansicht`-Modus) zeigt die 3 beantworteten Fragen als
  reinen Text, kein Kriterien-Tabellen-Layout.

`app/beurteilungen.html` (Liste): Zeile pro Beurteilung bekommt statt
Noten-Spalte bei `Typ='kurz'` ein Badge „Kurzfeedback“ (Farbe/Stil analog zu
bestehenden Status-Badges, kein neuer Badge-Mechanismus). Sortierung/Filter
der Liste bleibt unverändert, beide Typen erscheinen gemeinsam
chronologisch.

Kachel-Einstieg (`app/js/azubi-planer.js`, `app/js/abteilungsdurchlauf.js`):
Badge-Text auf der Durchlauf-Kachel wird dynamisch aus dem ermittelten `Typ`
abgeleitet („Kurzfeedback ausstehend“/„…Entwurf“/„…abgeschlossen“ statt
„Beurteilung …“), Klickziel bleibt `beurteilung.html?zuw=<id>`.

---

## 8. Fehlerbehandlung & Randfälle

- **Zuweisung wird nachträglich verlängert** (Bis-Datum ändert sich, bevor die
  Beurteilung angelegt wurde): `ermittleTyp()` läuft bei jedem Aufruf von
  `ermittleUndErzeugeFaellige()` neu — solange noch kein `Beurteilungen`-Datensatz
  existiert, passt sich der Typ automatisch an die aktuelle Dauer an. Nach
  Anlage eines Entwurfs bleibt `Typ` fix (kein nachträglicher Typwechsel in v1).
- **Kurzfeedback für eine Zuweisung, die dann doch länger dauert (Bis
  verschoben, nachdem Kurzfeedback schon abgeschlossen wurde):** kein
  automatischer Rückbau — bewusst Out of Scope (seltener Fall, manuelle
  Korrektur durch Neuanlage möglich, aber nicht Teil dieses Designs).
- **Ausbildungsleitung nicht ermittelbar** (`ermittleAusbildungsleiter()`
  liefert `null`, z.B. Beruf ohne Bereichs-Zuordnung): Mail geht nur an den
  Azubi, kein Hard-Error — analog zum bestehenden Verhalten der großen
  Beurteilung (`ausbildungsleiterSchrittEntfaellt`).
- **Validierung leerer Leitfragen:** `abschliessen()` lehnt ab, wenn eines der
  3 Felder leer ist (Fehlermeldung analog zur bestehenden
  Kriterien-Vollständigkeitsprüfung) — verhindert inhaltsleere „Abschlüsse“
  wie bei der großen Beurteilung auch für Kenntnisnahme-freien Fluss.

---

## 9. Tests

- Neue Fälle in vorhandenen Backend-Tests für `beurteilungen`-Service:
  `ermittleTyp()` an Tages-Grenzwerten (13, 14, 15 Tage), `abschliessen()` mit
  `Typ='kurz'` validiert die 3 Textfelder statt der Kriterien, überspringt
  `berechne()`.
  - Testname-Konvention beachten: aufsteigend testen wie zuletzt korrigiert
    (siehe Commit `70ccddf`), nicht absteigend.
- Mail-Versand-Test: `mailBeurteilung('kurzfeedback_abgeschlossen', …)` mit
  zwei Empfängern (Azubi + Ausbildungsleitung).
- Frontend: manueller/E2E-Check (`webapp-testing`-Toolkit), dass
  `beurteilung.html?zuw=<id>` bei kurzer Zuweisung die 3-Fragen-Ansicht statt
  des vollen Bogens rendert, und dass die Liste in `beurteilungen.html` das
  Kurzfeedback-Badge korrekt zeigt.

---

## 10. Out of Scope

- Kein manuelles Override des Typs (Prüfer kann in v1 nicht zwischen den
  beiden Prozessen wechseln, auch wenn die Zuweisung die Schwelle nur knapp
  verfehlt/unterschreitet).
- Keine PDF-Export-/Druckansicht für Kurzfeedback (existiert für die große
  Beurteilung ohnehin nicht im aktuellen Stand, daher keine Erweiterung nötig).
- Keine Signatur-Erfassung für Kurzfeedback.
- Kein nachträglicher Typwechsel eines bestehenden Datensatzes.
- Keine Änderung der Schwelle (14 Tage) über Konfiguration/UI — Wert ist in
  v1 hart im Code hinterlegt.
