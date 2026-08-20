# Digitale Unterschriften im Beurteilungsbogen — Design-Spec

**Datum:** 2026-08-20
**Status:** Entwurf

---

## Problem

Der Beurteilungsbogen kennt heute zwei Prozessschritte: Abschließen (durch wen
auch immer gerade `darfBeurteilen()` ist — befristeter Prüfer *oder* dauerhafter
Ausbilder, je nach `verantwortlichFuerZuweisung`,
[backend/services/beurteilungen.js:25](../../../backend/services/beurteilungen.js#L25))
und Kenntnisnahme (Azubi,
[backend/routes/beurteilungen.js:144](../../../backend/routes/beurteilungen.js#L144)).
Der PDF-Export sieht dabei schon **3** Unterschriftslinien vor — Beurteilende/-r,
Ausbildungsleiter/-in, Auszubildende/-r
([app/js/beurteilung.js:229-233](../../../app/js/beurteilung.js#L229-L233)) —,
aber es gibt weder einen eigenständigen Ausbilder-Bestätigungsschritt noch
werden die Unterschriften jemals digital erfasst; die Zeilen bleiben auf dem
Ausdruck leer und werden physisch unterschrieben.

Es soll künftig einen digitalen Signatur-Prozess mit drei Beteiligten geben:
Beurteiler (bei Abschluss), Azubi (bei Kenntnisnahme) und zusätzlich der
dauerhafte Ausbilder (neuer, eigenständiger Bestätigungsschritt). Dies ist der
erste Baustein eines Prozesses, der später auch bei der Fahrgelderstattung
greifen soll — die Signatur-Erfassung wird deshalb von Anfang an geteilt
gebaut, auch wenn Fahrtgeld selbst in dieser Runde nicht verändert wird.

## Ziel

- Beim Abschließen kann der Beurteiler eine Unterschrift hinterlegen.
- Bei der Kenntnisnahme kann der Azubi eine Unterschrift hinterlegen.
- Neuer dritter Schritt: der dauerhafte Ausbilder des Azubis bestätigt die
  Beurteilung eigenständig und hinterlegt dabei ebenfalls eine Unterschrift.
- Alle drei Unterschriften erscheinen im PDF-Export an der jeweils passenden
  Stelle statt der bisherigen leeren Linie.
- Eine einmal erstellte Unterschrift wird pro Nutzer serverseitig hinterlegt
  und beim nächsten Signieren vorgeschlagen (geräteübergreifend, Basis für die
  spätere Fahrtgeld-Wiederverwendung).

## Entscheidungen aus der Klärung

- **Speicherform:** persönliches Server-Profil je Nutzer (nicht nur
  pro-Vorgang) — Grundlage für spätere Fahrtgeld-Wiederverwendung.
- **Personalunion:** ist der Beurteiler bereits der dauerhafte Ausbilder,
  entfällt der dritte Schritt vollständig (keine doppelte Unterschrift
  derselben Person).
- **Reihenfolge:** Azubi-Kenntnisnahme und Ausbilder-Bestätigung sind
  unabhängig voneinander — keine Wartepflicht aufeinander, beide nur
  abhängig davon, dass die Beurteilung abgeschlossen ist.
- **Korrektur nach Abschluss:** setzt Azubi- und Ausbilder-Unterschrift
  (inkl. der zugehörigen Kenntnisnahme-/Bestätigungs-Zeitstempel) zurück, da
  sich der unterschriebene Inhalt geändert hat. Die Beurteiler-Unterschrift
  bleibt (Korrektur macht i. d. R. dieselbe Person).

## Scope

### 1. Datenmodell — neue Migration `035_beurteilung_unterschriften.sql`

**`dbo.Unterschriften`** (persönliches Profil-Merkmal, eine Zeile je Nutzer):

```sql
CREATE TABLE dbo.Unterschriften (
  Oid            NVARCHAR(36)  NOT NULL PRIMARY KEY,
  Bild           VARBINARY(MAX) NOT NULL,
  Extension      NVARCHAR(10)  NOT NULL,
  AktualisiertAm DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
```

**`dbo.Beurteilungen`** — sieben neue, alle NULL-fähige Spalten:

| Spalte | Typ | Zweck |
|---|---|---|
| `BeurteilerUnterschriftBild` / `...Ext` | `VARBINARY(MAX)` / `NVARCHAR(10)` | Unterschrift bei Abschluss |
| `KenntnisnahmeUnterschriftBild` / `...Ext` | `VARBINARY(MAX)` / `NVARCHAR(10)` | Unterschrift bei Azubi-Kenntnisnahme (ergänzt bestehendes `KenntnisnahmeVon`/`Am`) |
| `AusbilderBestaetigtVon` | `NVARCHAR(36)` | neu — analog `BeurteiltVon` |
| `AusbilderBestaetigtAm` | `DATETIME2` | neu |
| `AusbilderUnterschriftBild` / `...Ext` | `VARBINARY(MAX)` / `NVARCHAR(10)` | Unterschrift bei Ausbilder-Bestätigung |

Kein neuer `Status`-Wert, kein Änderung an `CK_Beurteilungen_Status` — die
beiden neuen Bestätigungen bleiben unabhängige Flags, keine Status-Kette.
Migration idempotent nach Projektkonvention (`IF COL_LENGTH(...) IS NULL`).

### 2. Backend

**Neuer Service `backend/services/unterschriften.js`:**
- `holeMeine(pool, oid)` → `{ dataUrl, extension } | null`
- `speichereMeine(pool, oid, { bytes, extension })` → Upsert

**Neue Route `backend/routes/unterschrift.js`** (gemountet unter `/api/unterschrift`):
- `GET /meine`
- `PUT /meine` — Body `{ dataUrl, extension }`

**`backend/services/beurteilungen.js` — Erweiterungen:**
- `abschliessen(pool, id, autorOid, signatur)`: schreibt zusätzlich
  `BeurteilerUnterschriftBild/Ext`, ruft `unterschriften.speichereMeine` im
  selben Zug auf (best effort, kein Blocker für den Abschluss selbst).
- `kenntnisnahme(pool, id, azubiOid, signatur)`: gleiches Prinzip für
  `KenntnisnahmeUnterschriftBild/Ext`.
- Neu: `ausbilderBestaetigen(pool, id, ausbilderOid, signatur)` — analog
  `abschliessen`, schreibt `AusbilderBestaetigtVon/Am` +
  `AusbilderUnterschriftBild/Ext`.
- Neu: `istDauerhafterAusbilder(pool, user, azubiOid)` — `true` für
  admin/developer, sonst `azubiOid` in
  `ausbilderAzubis.listFuerAzubi(azubiOid)` mit `oid === user.oid`.
- `getByZuweisung`: liefert zusätzlich `ausbilderSchrittEntfaellt` — `true`,
  wenn `BeurteiltVon` selbst ein dauerhafter Ausbilder dieses Azubis ist
  (gleiche Prüfung wie oben, angewendet auf `BeurteiltVon` statt den
  aktuellen Aufrufer).
- `patchNachAbschluss`: setzt zusätzlich `KenntnisnahmeVon/Am/Bild/Ext` und
  `AusbilderBestaetigtVon/Am` + `AusbilderUnterschriftBild/Ext` auf `NULL`.

**`backend/routes/beurteilungen.js` — Erweiterungen:**
- `PATCH /:id/abschliessen` — Body um optionales `signatur:{dataUrl,extension}`
  erweitert.
- `PATCH /:id/kenntnisnahme` — gleiche Erweiterung.
- Neu: `PATCH /:id/ausbilder-bestaetigung` — Body `{ signatur }`; Autorisierung
  über `svc.istDauerhafterAusbilder` (eigenständig, **nicht** über
  `ladeUndAutorisiere`/`darfBeurteilen`, da das die befristete
  Zuweisungs-Verantwortlichkeit prüft — eine andere Berechtigung als "ist
  dauerhafter Ausbilder dieses Azubis").
- `GET /` (Einzelabruf über `zuweisungId`): Response um
  `ausbilderSchrittEntfaellt` sowie ein Flag `darfAusbilderBestaetigen`
  (= `istDauerhafterAusbilder(...) && !ausbilderSchrittEntfaellt &&
  status === 'abgeschlossen' && !AusbilderBestaetigtAm`) ergänzt, damit das
  Frontend den dritten Button ohne eigene Zusatzabfrage rendern kann.

Bytes/DataURL-Konvertierung serverseitig (Base64 → `Buffer`) in
`unterschriften.js`, wiederverwendet von den drei Aufrufstellen.

### 3. Frontend

**Geteilte Signatur-Komponente:**
- `app/js/fahrtgeld-signatur.js` → umbenannt zu `app/js/signatur-dialog.js`
  (reiner Rename, `window.SignaturDialog` unverändert; Script-Referenz in
  `app/fahrgelderstattung.html` angepasst). Keine Verhaltensänderung an
  Fahrtgeld.
- `signatur-dialog.js` bekommt eine neue optionale `open()`-Option
  `bestehende: {dataUrl, extension} | null`: ist eine vorhanden, zeigt der
  Dialog zusätzlich eine "Vorschau + Übernehmen"-Ansicht vor den drei
  bisherigen Tabs (Zeichnen/Tippen/Hochladen bleiben als "Neu erstellen"
  erreichbar).
- Eingebunden zusätzlich in `app/beurteilung.html`.

**`app/js/api.js`:**
- `getMeineUnterschrift()`, `setMeineUnterschrift(sig)` (dünne Wrapper).
- `abschliessenBeurteilung(id, signatur)`, `kenntnisnahmeBeurteilung(id, signatur)`
  um den zweiten Parameter erweitert (optional, Body-Feld `signatur`).
- Neu: `ausbilderBestaetigenBeurteilung(id, signatur)`.

**`app/js/beurteilung.js` — `renderActions()`:**
- *Abschließen* (Beurteiler-Zweig, `editable`): vor dem eigentlichen
  Abschließen öffnet sich `SignaturDialog.open({ bestehende, onSave })`
  (Pflicht — ohne gespeicherte Signatur bricht der Abschluss ab, Toast-Hinweis).
- *Kenntnisnahme* (Azubi-Zweig): gleiches Prinzip vor
  `kenntnisnahmeBeurteilung`.
- Neu: im Read-Modus, wenn `darfAusbilderBestaetigen` aus der API-Antwort
  gesetzt ist, zusätzlicher Button „Als Ausbilder bestätigen" (analog zum
  Kenntnisnahme-Button, eigener Signatur-Dialog davor).
- Ist `ausbilderSchrittEntfaellt` gesetzt, erscheint kein dritter Button und
  kein Hinweis — der Zustand ist für den Betrachter identisch zu "bereits
  bestätigt".

**PDF-Export (`exportBeurteilungPdf`):** die drei `.sign div`-Blanko-Zeilen
werden dort, wo eine Signatur vorliegt, um ein eingebettetes `<img
src="data:image/...">` (aus den geladenen Bild-Bytes) plus Name/Datum
ergänzt; ohne Signatur bleibt die Zeile wie bisher eine leere Linie. Bei
Personalunion (`ausbilderSchrittEntfaellt`) bleibt die
Ausbildungsleiter-Zeile bewusst leer, auch wenn die Beurteiler-Zeile gefüllt
ist — kein doppelter Abdruck derselben Unterschrift.

## Nicht im Scope

- Kein "Meine Unterschrift"-Verwaltungsbereich im Profil (ansehen/löschen
  unabhängig von einer Signieraktion) — Verwaltung passiert ausschließlich im
  Moment des Signierens (Vorschau + "Neu erstellen"-Option im Dialog selbst).
- Keine Änderungen am eigentlichen Fahrtgeld-Prozess — nur der Datei-Rename
  der geteilten Komponente.
- Keine Reihenfolge-Erzwingung zwischen Azubi-Kenntnisnahme und
  Ausbilder-Bestätigung (siehe Entscheidung oben).
- Kein Wasserzeichen/keine kryptographische Signatur-Verifikation — die
  Unterschrift ist ein eingebettetes Bild wie beim bestehenden
  Fahrtgeld-Muster, kein rechtssicheres E-Signatur-Verfahren.

## Risiken / Randfälle

- **Migration 034 noch nicht eingespielt:** unabhängig von dieser Spec,
  betrifft ein anderes Feature — hier nur der Hinweis, dass die
  Dev-DB-Migrationsreihenfolge (033 → 034 → 035) eingehalten werden muss.
- **`ausbilderSchrittEntfaellt`-Berechnung ist zeitpunktbezogen:** basiert auf
  der *aktuellen* `AusbilderAzubis`-Zuordnung, nicht auf der Zuordnung zum
  Zeitpunkt des Abschlusses. Wechselt der dauerhafte Ausbilder eines Azubis
  später, kann sich die Anzeige (Schritt entfällt/erforderlich) rückwirkend
  ändern. Akzeptiert als UX-Komfortfunktion, keine rechtliche Aussage.
- **Kein Rollback der `dbo.Unterschriften`-Aktualisierung bei fehlgeschlagenem
  Abschluss:** `speichereMeine` läuft best effort außerhalb der
  Abschluss-Transaktion — ein fehlgeschlagener Abschluss darf die persönliche
  Standard-Unterschrift trotzdem aktualisiert lassen (unkritisch, da rein
  komfortbezogen).
- **Große Uploads:** wie beim bestehenden Fahrtgeld-Dialog serverseitig auf
  eine Obergrenze prüfen (Route lehnt zu große `dataUrl`-Payloads mit 413/400
  ab), analog zur bestehenden 2-MB-Clientprüfung in `signatur-dialog.js`.

## Verifikation

Manuell im Browser (Demo-Konten, drei Rollen nötig: Prüfer/Ausbilder,
Azubi, ein *zweiter*, dauerhafter Ausbilder-Account für denselben Azubi):

1. Beurteilung als Prüfer abschließen → Signatur-Dialog erscheint, ohne
   Unterschrift kein Abschluss möglich.
2. Als Azubi einloggen, Kenntnisnahme bestätigen → eigener Signatur-Dialog.
3. Als dauerhafter Ausbilder (nicht identisch mit dem Prüfer) einloggen →
   dritter Button "Als Ausbilder bestätigen" sichtbar, unabhängig davon ob
   der Azubi schon bestätigt hat.
4. PDF exportieren → alle vorhandenen Unterschriften erscheinen an der
   richtigen Stelle.
5. Testfall Personalunion: Beurteilung mit dem dauerhaften Ausbilder selbst
   abschließen → kein dritter Button, PDF zeigt nur 2 gefüllte Zeilen.
6. Korrektur nach Abschluss auslösen → Azubi- und Ausbilder-Unterschrift
   verschwinden aus PDF/Ansicht, Beurteiler-Unterschrift bleibt.
