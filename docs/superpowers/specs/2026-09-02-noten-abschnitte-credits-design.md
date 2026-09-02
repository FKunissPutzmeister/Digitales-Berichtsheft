# Noten & Zeugnisse — Abschnitte, Credits, Studiensemester

Fortschreibung von [2026-09-01-noten-zeugnisse-design.md](2026-09-01-noten-zeugnisse-design.md).
Alles, was dort steht und hier nicht widersprochen wird, gilt weiter — insbesondere
die Sichtbarkeitsmatrix, die Mitteilungs-Einmaligkeit und die Beleg-Behandlung.

## Problem

Die erste Fassung hängt den Zeitraum an den **Eintrag**
(`NotenEintraege.AbschnittTyp/AbschnittNr`). Der Ordner kennt ihn nicht. Daraus
folgen drei Dinge, die im Betrieb nicht tragen:

1. Ein Fach-Ordner „Englisch" gehört allen Ausbildungsjahren gleichzeitig. Die
   Gruppierung passiert *innerhalb* eines Fachs — man sieht pro Fach die Jahre,
   nicht pro Jahr die Fächer.
2. `gesamtSchnitt()` mittelt über die gesamte Ausbildung. Ein Ø über drei Jahre
   sagt weniger als drei Jahres-Ø, und er verbessert sich nie mehr sichtbar.
3. Für DH-Studenten sind „Semester 1..8" die falsche Achse. Ihr Notenspiegel
   (DUALIS) ist nach **Sommer- und Wintersemester mit Jahreszahl** gegliedert
   („SoSe 2026"), und die Zeilen darin tragen neben der Note zwei Größen, die
   das Modell nicht kennt: **Credits** und **Status**. Punkte tragen sie nicht.

## Ziel

Der Zeitraum wird die **oberste** Ebene. Darunter die Fächer, darunter die
Prüfungen. Jeder Zeitraum rechnet für sich: Azubis einen Noten-Ø, DH-Studenten
einen Noten-Ø **und** eine Credit-Summe. Einen Durchschnitt über alles gibt es
nicht mehr.

## Entscheidungen aus der Klärung

| Thema | Entscheidung |
|---|---|
| Ort des Zeitraums | Eigene Tabelle `dbo.NotenAbschnitte`; `NotenOrdner.AbschnittId` zeigt darauf. Ein leerer Abschnitt darf existieren — „SoSe 2026" ist nichts, was sich aus vorhandenen Noten ableiten ließe |
| Achse je Rolle | Azubi: `ausbildungsjahr` 1–4. DH-Student: `sose`/`wise` + Jahr. Die Rolle bestimmt, was im Dialog wählbar ist |
| Fach je Abschnitt | Ein Ordner gehört **genau einem** Abschnitt. „Maschinendynamik" im SoSe und im WiSe sind zwei Ordner |
| Credits | **Am Eintrag**, nicht am Ordner. Ein Fach kann mehrere getrennt bewertete Leistungen tragen; die Verantwortung, Credits nicht doppelt einzutragen, liegt beim Studenten |
| Noten-Ø | **Einfacher Mittelwert** über alle Einträge mit Zahlennote, nicht credit-gewichtet. Bewusst gleich gerechnet wie im Azubi-Teil |
| Credit-Summe | Nur Einträge mit `Status = 'bestanden'` (die Regel, die im DUALIS-Screenshot die 33,0 statt 45,0 erklärt) |
| „bestanden" ohne Note | **Kein Notenwert**, sondern `Status='bestanden'` bei leerer `Note`. Angezeigt als „b" wie in DUALIS |
| Gesamt-Ø | Entfällt samt Kopf-Kachel. Jeder Abschnittskopf trägt seine Zahlen selbst |
| Ausbilder-Übersicht | Spalte „Gesamt-Ø" wird „Ø aktueller Abschnitt"; neue Spalte „Abschnitte" (Anzahl). Credits nur in der Detailansicht — bei Azubis wäre die Spalte immer leer |
| IHK-Punkte | Bleiben für Azubis an Zwischen-/Abschlussprüfung |
| DHBW-Punkte | Verschwinden aus der Oberfläche. `MaxPunkte`, die Constraints aus Migration 045 und `DHBW_SKALEN` bleiben **stillgelegt** liegen — mit Kommentar, damit sie niemand für aktiv hält |
| Notenbereich | Azubi 1,0–6,0 (Schulnoten), DH-Student 1,0–5,0 (DHBW) |

## Semesterbezeichnung und Sortierung

`Typ` + `Nr` tragen beide Achsen ohne zweite Spalte:

| `Typ` | `Nr` | Label |
|---|---|---|
| `ausbildungsjahr` | 1–4 | „2. Ausbildungsjahr" |
| `sose` | 2026 | „SoSe 2026" |
| `wise` | 2025 (Startjahr) | „WiSe 2025/26" |

Sortierschlüssel = `Nr × 2 + (sose ? 0 : 1)`. Damit liegt WiSe 2025/26 korrekt
**zwischen** SoSe 2025 und SoSe 2026 — eine reine Sortierung nach `Nr` täte das
nicht. Ausbildungsjahre sortieren über denselben Schlüssel unter sich richtig,
weil ein Azubi nie Semester hat und umgekehrt.

Auswahl im Dialog: **ein** Dropdown konkreter Semester („SoSe 2026",
„WiSe 2025/26"), wie die Semesterwahl im DUALIS-Notenspiegel — nicht Halbjahr
und Jahr getrennt. Zwei gekoppelte Selects müssten bei jeder Änderung die
Jahresliste neu aufbauen und PMSelect erneut anwenden.

Das Jahresfenster ist **rollierend**: `aktuellesJahr − 3` bis
`aktuellesJahr + 1` (`SEMESTER_RUECKBLICK` / `SEMESTER_VORLAUF` in
`noten-core.js`). Drei Jahre zurück decken eine ganze Bachelor-Zeit ab, das
kommende Semester ist für die Vorplanung dabei. Absichtlich relativ und nicht
„ab 2023 fest": ein fester Startpunkt ließe die Liste jedes Jahr um zwei
Einträge wachsen. Damit muss **niemand jährlich Semester nachtragen** — die
Liste wird bei jedem Öffnen des Dialogs gerechnet, nicht gespeichert.

Nicht zu verwechseln mit `SEMESTER_JAHR_MIN/MAX` (2015–2100): das sind die
Plausibilitätsgrenzen des Validators und von `CK_NotenAbschnitte_Nr`, also
nur „ist das überhaupt eine denkbare Jahreszahl". Kein Bezug auf
`AusbildungBeginn` — Zeugnisse und Anerkennungen können älter als der Vertrag
sein (dieselbe Begründung wie beim Eintragsdatum in der ersten Fassung).

## Eintragsformular je Rolle

| Feld | Azubi | DH-Student |
|---|---|---|
| Titel, Art, Datum, Bemerkung, Belege | ✓ | ✓ |
| Note | 1,0–6,0 | 1,0–5,0 |
| „nur bestanden (b)" | – | ✓ |
| Credits | – | ✓ (0–60, eine Nachkommastelle) |
| Status | – | `bestanden` / `nicht_bestanden` / `offen` |
| IHK-Punkte | nur Zwischen-/Abschlussprüfung | – |
| Maximalpunktzahl (DHBW) | – | – |

Im Formular schaltet ein Radio-Paar zwischen „Note eintragen" und „nur
bestanden". Damit bleibt `Note` eine reine Zahl; kein Feld muss zwei Typen
tragen, und kein Parser muss „b" von „6" unterscheiden.

## Scope

### 1 — Migration 046 (`db/migrations/046_noten_abschnitte_credits.sql`)

**dbo.NotenAbschnitte** — `Id`, `AzubiOid NVARCHAR(36) NOT NULL`,
`Typ NVARCHAR(15) NOT NULL` (CHECK `'ausbildungsjahr'|'sose'|'wise'`),
`Nr SMALLINT NOT NULL`, `ErstelltAm`; `UQ_NotenAbschnitte_AzubiTypNr
(AzubiOid, Typ, Nr)`, `IX_NotenAbschnitte_AzubiOid`, und ein CHECK, der die
beiden Wertebereiche trennt:
`(Typ='ausbildungsjahr' AND Nr BETWEEN 1 AND 4) OR (Typ IN ('sose','wise') AND Nr BETWEEN 2015 AND 2100)`.

**dbo.NotenOrdner** — `+ AbschnittId INT NULL`, FK → `NotenAbschnitte`
`ON DELETE CASCADE`. `UQ_NotenOrdner_AzubiName` wird ersetzt durch
`UQ_NotenOrdner_AbschnittName (AzubiOid, AbschnittId, Name)`: dasselbe Fach darf
in zwei Abschnitten liegen, im gleichen Abschnitt nicht zweimal.

`AbschnittId` bleibt **nullable**. Ein Ordner ohne Abschnitt landet in einer
Gruppe „Ohne Zuordnung" — dieselbe Auffanggruppe, die die Anzeige heute schon
für Einträge ohne Abschnitt hat. Eine NOT-NULL-Spalte wäre nur mit einem
Zwangs-Abschnitt für Altdaten zu haben.

**dbo.NotenEintraege** — `+ Credits DECIMAL(4,1) NULL` (CHECK 0–60),
`+ Status NVARCHAR(15) NULL` (CHECK `'bestanden'|'nicht_bestanden'|'offen'`);
`- AbschnittTyp`, `- AbschnittNr` samt ihrer beiden CHECKs.

**Datenwanderung vor dem Drop:** aus den vorhandenen
`(AzubiOid, AbschnittTyp, AbschnittNr)` der Einträge werden Abschnitte gebildet;
für jede Kombination aus Ordnername und Abschnitt, in der Einträge liegen, wird
ein Ordner sichergestellt und die Einträge werden dorthin umgehängt. Ordner ohne
Einträge behalten `AbschnittId = NULL`.

**`EXEC('…')` ist hier Pflicht.** `run-sql.js` schickt die Datei als **einen**
Batch; SQL Server bindet den gesamten Batch, bevor die erste Anweisung läuft.
Jede Anweisung, die `AbschnittId`, `Credits` oder `Status` referenziert, muss
deshalb in `EXEC()` — sonst scheitert die Datei mit `Invalid column name`,
**bevor irgendetwas passiert**, und hinterlässt ein unverändertes Schema, das
wie ein Erfolg aussieht. Genau daran ist Migration 045 einmal still gescheitert.

### 2 — `app/js/noten-core.js`

Neu bzw. geändert:
- `ABSCHNITT_TYPEN = ['ausbildungsjahr', 'sose', 'wise']`, `AJ_NR_MAX = 4`,
  `SEMESTER_JAHR_MIN/MAX`
- `abschnittTypenFuerRolle(rolle)` → `['ausbildungsjahr']` bzw. `['sose','wise']`
- `abschnittGueltig(typ, nr)` mit getrennten Wertebereichen
- `abschnittLabel(typ, nr)` inkl. „WiSe 2025/26"
- `abschnittSortKey(typ, nr)` und `sortiereAbschnitte()`
- `STATUS_WERTE`, `statusLabel()`, `CREDITS_MAX`, `parseCredits()`, `formatCredits()`
- `NOTE_MAX_FUER_ROLLE(rolle)` (6,0 bzw. 5,0)
- `istBestandenOhneNote(eintrag)` → Anzeige „b"
- `abschnittSchnitt(ordner)` — einfacher Mittelwert über alle Einträge der
  Ordner mit `zaehltInSchnitt !== false`
- `creditSumme(ordner)` — nur `status === 'bestanden'`
- `gruppiereNachAbschnitt(eintraege)` **entfällt**, ersetzt durch
  `gruppiereOrdnerNachAbschnitt(abschnitte, ordner)`
- `gesamtSchnitt(ordner)` **entfällt**
- `pruefeEintrag(daten, rolle)` — rollenabhängig: Credits/Status nur für
  `dhstudent`, Punkte nur für Azubi-Prüfungen, Notenobergrenze je Rolle
- `pruefeAbschnitt(typ, nr, rolle)`

`zusammenfuehreEintrag` bleibt, verliert `abschnittTyp`/`abschnittNr` und
bekommt `credits`/`status`.

### 3 — `app/js/noten-core.test.js`

Zusätzlich zu den bestehenden Tests:
- **Der DUALIS-Screenshot als Fixture**: sieben Module (8,0 „b" bestanden ·
  5,0 1,5 · 12,0 ohne Status · 5,0 1,8 · 5,0 1,6 · 5,0 1,5 · 5,0 2,7) müssen
  `creditSumme === 33` und `abschnittSchnitt === 1.82` ergeben. Nagelt beide
  aus dem Original abgelesenen Regeln fest.
- `abschnittSortKey`: SoSe 2025 < WiSe 2025/26 < SoSe 2026
- `abschnittLabel('wise', 2025) === 'WiSe 2025/26'`
- `abschnittGueltig('ausbildungsjahr', 2026) === false` und
  `abschnittGueltig('sose', 3) === false` — die Wertebereiche dürfen sich nicht
  vertauschen lassen
- `pruefeEintrag` weist Credits bei Rolle `azubi` ab und Punkte bei `dhstudent`
- Note 5,5 ist für `azubi` gültig, für `dhstudent` nicht

### 4 — `backend/routes/noten.js`

Neue Endpunkte:

| Methode & Pfad | Body | Status |
|---|---|---|
| `POST /noten/abschnitte` | `{typ, nr}` | 201 · 400 · 403 · 409 |
| `DELETE /noten/abschnitte/:id` | `?kaskade=1` | 200 · 403 · 404 · **409** `{ordner, eintraege, belege}` |
| `PATCH /noten/ordner/:id` | zusätzlich `abschnittId` (Fach verschieben) | 200 · 400 · 409 |

`POST /noten/ordner` verlangt jetzt `abschnittId`. `GET /noten` liefert
`{azubiOid, darfBearbeiten, abschnitte:[…], ordner:[…]}` — der Gesamt-Ø
fällt aus der Antwort. Das `/azubis`-Aggregat liefert `anzahlAbschnitte`,
`abschnittAktuell` und `schnittAktuell` statt `gesamtSchnitt`.

**Abweichung vom ersten Entwurf, bewusst:** Abschnitte und Ordner kommen
**flach** heraus, nicht ineinander verschachtelt. Gruppiert wird im
Frontend mit `gruppiereOrdnerNachAbschnitt()`. Eine Verschachtelung in der
Route hätte die Gruppierung samt Ø- und Credit-Rechnung ein zweites Mal
nötig gemacht — zwei Implementierungen derselben Regel, die auseinander
laufen können. Das `/azubis`-Aggregat ist die einzige Stelle, die
serverseitig rechnet, und benutzt dafür `core.abschnittSortKey()`, statt
die Sortierung in SQL nachzubauen.

### 5 — `backend/services/retention.js`

`PHASE_A` bekommt **vor** `NotenOrdner` eine Zeile
`{ tabelle: 'NotenAbschnitte', bedingung: 'AzubiOid = @oid' }`. Der
`NotenOrdner`-Eintrag bleibt: er räumt die Ordner mit `AbschnittId = NULL` ab,
die keine Kaskade erreicht.

Der Kommentarblock in Migration 043 („NotenOrdner.AzubiOid ist die EINZIGE
Personenspalte dieses Features") wird korrigiert — er ist ab 046 falsch.
`BEKANNTE_SPALTEN` leitet sich aus den Phasen-Fragmenten ab, braucht also
keinen eigenen Eintrag.

### 6 — `app/js/api.js`

`addNotenAbschnitt`, `deleteNotenAbschnitt`; `addNotenOrdner` bekommt
`abschnittId`; `patchNotenOrdner` kann `abschnittId` mitschicken.

### 7 — `app/js/noten-ui.js`, `app/css/noten.css`

Abschnitts-Ebene als äußere Gruppe mit Kopfzeile (Label · Ø · Σ Credits ·
Aktionen „Fach hinzufügen"/„löschen"), darunter die Fach-Ordner wie bisher.
Kopfbereich: Kachel entfällt, links „Ausbildungsjahr hinzufügen" bzw.
„Semester hinzufügen". Eintragsdialog rollenabhängig (Radio Note/„bestanden",
Credits, Status; Punkte nur beim Azubi).

## Nicht im Scope

- Credit-gewichtete Endnote über das ganze Studium
- Modulnummern („T3MB9059") und die DUALIS-Spalte „Prüfungen" (Einzelversuche)
- Import aus DUALIS
- Abschnitte für Ausbilder anlegbar machen (schreiben darf nur der Eigentümer)
- Umbenennen/Verschieben von Abschnitten (nur anlegen und löschen)

## Risiken / Randfälle

1. **Migration 045-Falle wiederholt sich** — jede Referenz auf eine in derselben
   Datei angelegte Spalte in `EXEC()`. Prüfung: Migration zweimal einspielen,
   danach `SELECT` auf die drei neuen Spalten.
2. **Kaskadenkette wird vierstufig** (Abschnitte → Ordner → Einträge → Belege).
   Eine lineare Kette ist erlaubt; ein zweiter Kaskadenpfad auf dieselbe Tabelle
   wäre es nicht. Beim Anlegen des FK prüfen, dass SQL Server nicht meckert.
3. **Löschjob übersieht Abschnitte**, wenn die PHASE_A-Zeile fehlt. Test:
   `pruefeUnbekannteSpalten()` muss `[]` liefern, und ein simulierter Lauf muss
   die Abschnitte treffen.
4. **`UQ` mit NULL** — SQL Server behandelt NULLs in UNIQUE als gleich, also
   gibt es pro (Azubi, Name) nur *einen* Ordner ohne Abschnitt. Für die
   Auffanggruppe genügt das; im Code nicht auf mehrere setzen.
5. **Doppelte Credits** — bewusst nicht technisch verhindert (Credits am
   Eintrag). Der Dialog weist darauf hin, wenn im selben Ordner schon ein
   Eintrag mit Credits liegt.
6. **„b" und Ø** — ein Eintrag mit `Status='bestanden'` und leerer Note darf den
   Ø nicht als 0 oder 1,0 verfälschen. `notenVon()` filtert `null` schon; der
   Test aus dem Screenshot-Fixture deckt genau das ab.
7. **Status `offen` mit Credits** — Credits zählen erst bei `bestanden`. Ein
   Modul „noch nicht gesetzt" trägt seine 12,0 also sichtbar, aber nicht in der
   Summe. In der Zeile kenntlich machen, sonst sieht die Summe falsch aus.
8. **Rollenwechsel** — ein Azubi, der DH-Student wird, hat Ausbildungsjahre und
   Semester gleichzeitig. Die Anzeige sortiert beide über denselben Schlüssel
   und trennt sie nicht künstlich; anlegen darf er nur die zur aktuellen Rolle.
9. **Stillgelegte DHBW-Tabelle** — `DHBW_SKALEN` und `MaxPunkte` bleiben im
   Code. Ohne Kommentar hält sie beim nächsten Lesen jemand für aktiv und baut
   darauf auf.
10. **`noten-core.js` wächst** — die Datei hat schon die DHBW-Tabellen. Wenn sie
    mit den Abschnitts- und Credit-Funktionen unübersichtlich wird, wandern die
    stillgelegten DHBW-Konstanten in eine eigene Datei.

## Verifikation

1. `node --test app/js/noten-core.test.js backend/services/noten.test.js backend/services/retention.test.js`
2. Migration 046 **zweimal** einspielen; beim zweiten Lauf melden alle
   `PRINT`-Zeilen „existiert bereits". Danach `pruefeUnbekannteSpalten()` → `[]`.
3. Als Azubi: zwei Ausbildungsjahre anlegen, in jedem ein Fach, Noten eintragen
   → Ø je Jahr stimmt gegen die Handrechnung, kein Gesamt-Ø sichtbar.
4. Als DH-Student: „SoSe 2026" und „WiSe 2025/26" anlegen → Sortierung
   chronologisch. Den Screenshot-Datensatz eintragen (sieben Module) → Kopfzeile
   zeigt **Ø 1,8** und **33,0 Credits**.
5. „nur bestanden" wählen → Zeile zeigt „b", Ø ändert sich nicht, Credits
   zählen mit.
6. Status auf `offen` stellen → Credits verschwinden aus der Summe, bleiben in
   der Zeile sichtbar.
7. Abschnitt mit Inhalt löschen → 409 mit korrekten Zahlen, danach mit
   `?kaskade=1` → Ordner, Einträge und Belege sind weg.
8. Rollenmatrix wie in der ersten Fassung, zusätzlich: Ausbilder-`POST`
   auf `/noten/abschnitte` → 403.
9. iPad (11″): Abschnittsköpfe brechen nicht, kein horizontaler Seiten-Scroll.
