# IHK-Berichtsheft-Import — Design-Spec

**Datum:** 2026-05-27
**Status:** Genehmigt

---

## Überblick

Import-Funktion für den PDF-Export des IHK-Ausbildungsnachweis-Portals. Der Nutzer lädt ein PDF hoch; die App extrahiert alle Wochen mit Anwesenheiten, Ort und Stunden und schreibt sie direkt ins Berichtsheft.

**Scope dieser Version:** wöchentliche Berichtsform (IT-Azubis, kaufmännisch). Tägliche Berichtsform (Einträge `eintrag` aus Schule-/Betrieb-/Unterweisung-Textblöcken) ist bewusst ausgeklammert — dafür fehlen noch Beispiel-PDFs.

---

## Architektur

Vier neue/geänderte Dateien, exakt parallel zur bestehenden SAP-Import-Struktur:

| Datei | Aufgabe |
|---|---|
| `app/js/ihk-parser.js` | Reine Parse-Logik, kein DOM. Input: Text aller PDF-Seiten. Output: `{wochen, warnungen}`. |
| `app/js/ihk-import.js` | UI-Glue: Drag-Drop, pdf.js-Extraktion, Preview-Modal, DB-Schreibzugriff. |
| `app/profil.html` | Zwei neue `<script>`-Tags. |
| `app/js/profil.js` | `IhkImport.renderSection(user)` und `IhkImport.bind(user)` analog zu `ZeitnachweisUpload`. |

Kein neuer Backend-Code. Import nutzt `DB.getWoche` + `DB.saveWoche`.

---

## Parser (`ihk-parser.js`)

### Eingang

Text aller PDF-Seiten, durch `extractText()` (pdf.js, identisch zu `zeitnachweis-upload.js`) extrahiert. Jede Seite entspricht einer Woche.

### Ausgabe

```js
{
  wochen: [
    {
      kw: Number,
      year: Number,
      startDate: String,   // ISO: "YYYY-MM-DD"
      endDate: String,     // ISO: "YYYY-MM-DD"
      status: String,      // 'offen' | 'freigegeben' | 'genehmigt' | 'abgelehnt'
      tage: [
        {
          datum: String,        // ISO: "YYYY-MM-DD"
          wochentag: String,    // 'Mo' | 'Di' | 'Mi' | 'Do' | 'Fr'
          anwesenheit: String,
          ort: String,
          stunden: Number       // Dezimal, z. B. 7.8
        }
      ]
    }
  ],
  warnungen: String[]
}
```

### Parsing-Ablauf (State-Machine je Seite)

1. `Ausbildungswoche DD.MM.YYYY bis DD.MM.YYYY` → KW + Jahr ableiten, `startDate`/`endDate` setzen.
2. `Status: …` → IHK-Status-Text extrahieren (Mapping unten).
3. Tages-Zeilen: `Mo | 06.01.2025 | Betrieb | anwesend 07:48` → Regex-Match.
4. Samstag/Sonntag-Zeilen → überspringen (beide PDF-Varianten: 5-Tage und 7-Tage).
5. Ab `Qualifikationen:` bis Seitenende → ignorieren.
6. Mehrere Zeilen gleichen Datums (Betrieb + Schule am selben Tag) → Merge-Schritt nach Sammlung.

### Tagestyp-Mapping

| IHK-Zeile(n) | `anwesenheit` | `ort` | `stunden` |
|---|---|---|---|
| `Betrieb \| anwesend HH:MM` (allein) | `'anwesend'` | `'Betrieb'` | HH:MM → Dezimal |
| `Schule \| anwesend HH:MM` (allein) | `'anwesend'` | `'Schule'` | HH:MM → Dezimal |
| `Betrieb` + `Schule` gleicher Tag | `'anwesend'` | `'Betrieb/Schule'` | Stunden summiert |
| `Urlaub \| abwesend` | `'Urlaub'` | `''` | 0 |
| `Feiertag \| abwesend` | `'Feiertag'` | `''` | 0 |
| `Sonstige Abwesenheit \| abwesend` | `'sonstige Abwesenheit'` | `''` | 0 |
| `Zeitausgleich \| abwesend` | `'sonstige Abwesenheit'` | `''` | 0 |
| `krank` / `arbeitsunf…\| abwesend` | `'krank'` | `''` | 0 |

**Zeitkonvertierung:** `HH:MM` → Dezimal: `hours + minutes/60`, auf 2 Nachkommastellen gerundet.

### IHK-Status-Mapping

Abgleich per case-insensitivem Teilstring-Match auf den extrahierten Status-Text:

| IHK-Text enthält | App `status` |
|---|---|
| `genehmigt` | `'genehmigt'` |
| `freigegeben` \| `eingereicht` \| `vom azubi` | `'freigegeben'` |
| `abgelehnt` \| `zurückgegeben` | `'abgelehnt'` |
| (sonst: offen, ausstehend, …) | `'offen'` |

---

## UI (`ihk-import.js`)

### Widget auf Profil-Seite

- Aufklappbereich (`<details class="profil-section">`) mit Titel "IHK-Berichtsheft importieren"
- Erscheint nur für `user.role === 'azubi'`
- Positioniert unterhalb des SAP-Zeitnachweis-Imports
- Kurzer Erklärtext, Drag-Drop-Zone, "PDF hochladen"-Button
- Hinweis: "Datei bleibt lokal auf Ihrem Rechner"

### Preview-Modal (Wochen-Ebene)

Tabelle mit einer Zeile pro erkannter Woche:

| Checkbox | KW | Zeitraum | IHK-Status | Erkannte Tage | Hinweis |
|---|---|---|---|---|---|
| ✓ | KW 02 · 2025 | 06.01 – 10.01 | Genehmigt | 5 | — |
| ✓ | KW 03 · 2025 | 13.01 – 17.01 | Offen | 4 | ⚠ 1 Tag nicht eindeutig |

**Checkbox-Regeln:**
- Bereits `'freigegeben'` oder `'genehmigt'` in der App: Checkbox disabled + Label "bereits eingereicht/genehmigt"
- Alle anderen Wochen: standardmäßig aktiviert (immer überschreiben)

**Warnungen:** Zeilen die nicht erkannt wurden, erscheinen als Inline-Hinweis in der Wochenzeile.

**Bestätigen-Button:** "N Wochen übernehmen" (disabled wenn 0 ausgewählt).

### Erfolgs-Bildschirm

- Anzahl übernommener Wochen
- Auflistung der aktualisierten KWs
- "Zur Wochenansicht"-Button (navigiert zur ersten importierten Woche via `sessionStorage.setItem('gotoKW', …)`)

---

## Datenfluss

```
PDF hochladen
 → pdf.js: Text je Seite extrahieren (eine Seite = eine Woche)
 → IhkParser.parse(pages[]) → {wochen, warnungen}
 → Preview-Modal mit Wochen-Tabelle anzeigen
 → Nutzer bestätigt Auswahl
 → Je ausgewählter Woche:
     woche = await DB.getWoche(userId, kw, year) || neues Objekt
     woche.status = parsedStatus
     woche.tage = parsedTage (ohne Sa/So)
     woche.gesamtstunden = Summe aller stunden
     await DB.saveWoche(woche)
 → Erfolgs-Screen
```

**Konflikt-Handling:** Immer überschreiben. Ausnahme: Wochen mit Status `'freigegeben'` oder `'genehmigt'` in der App können nicht überschrieben werden (Checkbox disabled).

---

## Nicht im Scope (dieser Version)

- Texteinträge (`eintrag` pro Tag) aus Schule-/Betrieb-/Unterweisung-Blöcken — wird nachträglich ergänzt, sobald Beispiel-PDFs mit täglicher Berichtsform vorliegen.
- Tägliche Berichtsform (`berichtTyp === 'täglich'`).
- Qualifikationen-Abschnitt aus dem PDF.
- Persönliche Daten (Azubi, Ausbilder) aus dem PDF.
