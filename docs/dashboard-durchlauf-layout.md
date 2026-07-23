# Dashboard „Abteilungsdurchlauf" — zwei Layout-Varianten

Am **22.–23.07.2026** haben **Florian Kuniß** und **Florian Kern** unabhängig
voneinander dieselbe Funktion überarbeitet: die **Durchlauf-Übersicht** auf dem
Ausbilder-/Prüfer-Dashboard (welcher Azubi ist gerade in welcher Abteilung,
aktuell → nächste). Beim Merge (`0932cdc`) wurde **Kerns Layout** übernommen und
**Kuniß' funktionale Verbesserungen** eingezogen. Kuniß' Layout ist hier
dokumentiert, damit man **jederzeit leicht darauf zurück** kann.

## Aktuell aktiv: Kern-Layout (kompakt, zweispaltig)

- „Zu prüfen" oben links, **direkt darunter** die kompakte Karte
  **„Abteilungsdurchlauf"** (halbe Breite).
- Rechts die Spalte **„Mitteilungen"**.
- Neu gestaltete aktuell → nächste-Darstellung.

## Alternative: Kuniß-Layout (breite Top-Sektion)

- Durchlauf als **eigene, volle-Breite-Sektion „Durchläufe"** ganz oben, direkt
  unter der Begrüßung — **vor** „Zu prüfen".
- Titel der Karte **„Wer ist wo"** (statt „Abteilungsdurchlauf").
- Rechte Spalte hieß **„Letzte Aktivitäten"** (statt „Mitteilungen").

**Kanonische Quelle (unveränderlich in der Historie):** Commit **`a066d94`**,
Datei `app/js/dashboard.js`. Ansehen mit:

```bash
git show a066d94:app/js/dashboard.js
```

## Was aus Kuniß' Version bereits übernommen wurde (bleibt so)

Unabhängig vom Layout sind diese funktionalen Punkte im aktiven Stand drin:

- Durchlauf ist auch für **reine Planer/Admins ohne eigene Azubis** sichtbar
  (`durchlaufHtml` gate't auf `durchlaufAzubis`, nicht `meineAzubis`).
- `renderDurchlaufListe(rows, today, kannPlanen)` bekommt `kannPlanen` → Link-Label
  „Planer öffnen" vs. „Zum Abteilungsdurchlauf".
- Laden über Bulk-Endpunkte (`getAzubis`/`getAllZuweisungen`) statt N+1.

## Zurück auf Kuniß' Layout (falls gewünscht)

**Variante A — chirurgisch (nur das Layout umstellen, empfohlen):** in
`app/js/dashboard.js` …

1. Die breite Top-Sektion **wieder einfügen**, direkt nach dem
   `</section>`-Ende der `welcome-hero` und **vor** `${istKorrektor ? \`` :

   ```js
   ${durchlaufAzubis.length > 0 ? `
   <section class="rot-section">
     <h2 class="dashboard-section-title" style="font-size:var(--text-base);margin:var(--sp-5) 0 var(--sp-3)">Durchläufe</h2>
     ${renderDurchlaufListe(durchlaufRows, today, !!user.kannPlanen)}
   </section>
   ` : ''}
   ```

2. Damit die Karte nicht **doppelt** erscheint, das `${durchlaufHtml}` aus der
   Grid-Hero-Spalte (unter der „Zu prüfen"-Karte) und aus dem Else-Zweig
   (`: durchlaufHtml}`) **entfernen**.

3. Optional Bezeichnungen zurückdrehen: Karten-Titel „Abteilungsdurchlauf" →
   „Wer ist wo" (in `renderDurchlaufListe`), rechte Spalte „Mitteilungen" →
   „Letzte Aktivitäten".

**Variante B — komplette Datei zurücksetzen (schnell, aber grob):**

```bash
git checkout a066d94 -- app/js/dashboard.js
```

⚠️ Achtung: Variante B holt Kuniß' **kompletten** dashboard.js-Stand zurück und
verwirft damit auch spätere Kern-Änderungen in dieser Datei (u. a. die
Mitteilungen-Umbenennung). Für einen reinen Layout-Wechsel Variante A nehmen.

---

*Diese Notiz existiert, damit beide Seiten (und beide Claude-Instanzen) den
Layout-Entscheid kennen und ihn bei Bedarf mit minimalem Aufwand umkehren können.*
