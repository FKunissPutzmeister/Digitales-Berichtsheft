# Wochenansicht — Fertig-Kennzeichnung pro Tag (Status-Streifen) + „Alle öffnen"

**Datum:** 2026-07-29
**Feature:** Visuelle Kennzeichnung, welche Tage bereits vollständig ausgefüllt sind, plus Sammel-Toggle zum Aufklappen aller Tage
**Betroffene Seite:** [app/wochenansicht.html](../../../app/wochenansicht.html)
**Betroffene Dateien:** [app/js/wochenansicht.js](../../../app/js/wochenansicht.js), [app/css/wochenansicht.css](../../../app/css/wochenansicht.css), [app/css/variables.css](../../../app/css/variables.css), `app/css/theme-*.css`

## Problem

Azubis müssen aktuell jede Tageskarte einzeln aufklappen, um zu sehen, ob an
dem Tag schon etwas eingetragen wurde. Bei einer vollen Woche ist das
mühsam, besonders wenn man nur nachschauen will, wo noch etwas fehlt.

## Kern-Erkenntnis: Infrastruktur existiert bereits, ist aber tot

`getDayCompletion()` (wochenansicht.js ~1242) berechnet pro Tag bereits einen
Status (`complete` / `partial` / `empty` / `absent` / `we`), inklusive
Update nach jedem Autosave (`updateDayCompletion()`, ~2259). Die Zeile wird
sogar mit `data-completion="${completion}"` gerendert (~1038). Passendes CSS
für einen **Punkt** (`.tag-row__completion-dot`, inkl. Dark-Mode-Overrides)
existiert in wochenansicht.css (~1105, ~3379) — nur das `<span>`-Element
selbst fehlt im Markup, weshalb aktuell nichts sichtbar ist.

**Konsequenz:** Wir bauen keine neue Status-Logik, sondern nutzen
`getDayCompletion()`/`data-completion` weiter und ersetzen nur die
Darstellung (Punkt → Streifen) sowie die Anzahl sichtbarer Zustände.

## Entscheidungen aus dem Brainstorming

1. **Darstellung:** linker Farbstreifen an der ganzen Tag-Zeile (Variante B
   aus dem Mockup-Vergleich), kein Punkt, kein Icon, keine Hintergrund-Tönung.
2. **Nur ein farbiger Zustand:** Grün = fertig. Alles andere (leer, teilweise)
   bekommt **keine Markierung** (kein Streifen), statt mehrerer Ampel-Farben.
3. **Was zählt als „fertig" (grün):**
   - `completion === 'complete'` (alle Pflichtfelder + Eintrag(e) vorhanden)
   - `completion === 'absent'` (Abwesenheit erfasst — nichts weiter zu tun)
4. **Was bleibt unmarkiert:**
   - `'partial'` (z. B. Ort gewählt, aber Pflicht-Eintrag fehlt noch)
   - `'empty'` (nichts erfasst)
   - `'we'` (freies Wochenende — wie bisher irrelevant)
5. Kein neuer Zwischenzustand, keine neue Konfigurationsoption — bewusst
   minimal (YAGNI).

## Darstellung: Streifen

- Position: linker Rand der `.tag-row`, volle Höhe der Kopfzeile
  (`.tag-row__summary`), 4px breit, abgerundet zur Zeile passend.
- Nur gerendert, wenn `complete` oder `absent` — sonst kein Element (kein
  leerer/grauer Platzhalter-Streifen, um optisches Rauschen zu vermeiden).
- Farbe kommt aus einem Theme-Token (Details unten), keine Inline-Farbe.

## Theme-Farben

Ausgangsbasis bleibt `--color-success-mid` (`variables.css`, aktuell
`#43A856`), aber pro Theme angepasst, damit der Ton zur jeweiligen Stimmung
passt statt zu clashen (analog zum bestehenden Muster, dass `--pm-yellow`
und `--color-info-mid` bereits pro Theme überschrieben werden).

| Theme | Ton | Hex | Zusatz |
|---|---|---|---|
| Standard (hell) | unverändert | `#43A856` | — |
| Dark | heller + Glow | `#4CC26B` | `box-shadow` Glow-Ring (Muster wie bestehende Dot-Dark-Overrides) |
| Candy | Gummibärchen-Grün | `#2FD673` | — |
| Christmas | Tannengrün | `#3CA65E` | dezenter Licht-Glow |
| Halloween | Slime/Hexen-Grün | `#8BC34A` | dezenter Glow |
| CMD | heller als Terminal-Akzent | `#7CFFA0` | Terminal-Glow (Theme ist selbst schon grün-dominant) |
| Silk | Smaragd | `#34D399` | Glow im Silk-BorderGlow-Stil |
| Hyperspace | Neon-Grün | `#39FF88` | Neon-Glow |

Umsetzung als neuer Token `--color-status-done` (Fallback = bestehendes
`--color-success-mid`) in `variables.css`, Override je Theme in den
jeweiligen `theme-*.css`-Dateien — gleiches Muster wie bei `--pm-yellow`.

## Technische Umsetzung

- **Markup:** in `buildWochenTageKarten()`-Zeilenbau (~1036) immer ein
  `<div class="tag-row__status-stripe">` rendern; Sichtbarkeit läuft rein
  über den `data-completion`-CSS-Selektor auf der `.tag-row`. Das ist
  nötig, weil `updateDayCompletion()` nach jedem Autosave nur
  `row.dataset.completion` umschreibt, ohne den Zeilen-DOM neu zu bauen —
  das Element muss also von Anfang an im Markup stehen.
- **CSS:** `.tag-row__completion-dot` durch `.tag-row__status-stripe`
  ersetzen (Position/Größe wie im Mockup), Sichtbarkeit über
  `[data-completion="complete"] .tag-row__status-stripe,
  [data-completion="absent"] .tag-row__status-stripe { background: var(--color-status-done); }`
  — ohne diese Regel bleibt der Streifen transparent/unsichtbar.
- **JS-Update-Pfad:** `updateDayCompletion()` setzt weiterhin nur
  `row.dataset.completion`; die alte Punkt-spezifische Klassen-Umschreibung
  (`dot.className = ...`) entfällt, da die Sichtbarkeit rein per
  `data-completion`-Selektor läuft.
- Die zweite Render-Funktion (`buildWochenTageTabelle()`, „Wochen-Modus"
  ~1690) berechnet aktuell keinen Completion-Status — bleibt bewusst
  unverändert (dort gibt es keine aufklappbaren Tages-Body, das Feature
  ist nur für die Tages-Ansicht mit aufklappbaren Karten relevant).

## „Alle öffnen"-Kästchen

- **Platzierung:** in `tag-cards__header` (~1137), links vor den
  Spalten-Labels, aktuell `aria-hidden="true"` — wird für dieses Element
  interaktiv gemacht.
- **Optik:** gleiches Muster wie `.wochen-options__check` (Checkbox +
  SVG-Häkchen + Label), aus dem Wochen-Modus übernommen.
- **Verhalten:**
  - Klick expandiert alle `.tag-row` mit vorhandenem `.tag-row__body`
    (Wochenend-/freie Tage ausgenommen, wie beim bestehenden Einzel-Toggle
    `handleTagRowToggle`).
  - Label wechselt zwischen „Alle öffnen" und „Alle schließen" je nachdem,
    ob aktuell alle Tage offen sind.
  - Kein persistenter Zustand nötig (kein Speichern in der Woche/DB) — rein
    UI-seitiges Auf-/Zuklappen, wie der bestehende Einzel-Toggle auch.

## Nicht-Ziele (YAGNI)

- Keine Ampel-Logik mit mehreren Farben (bewusst auf Grün/nichts reduziert).
- Keine Änderung an `getDayCompletion()`/`validateWocheTaeglich()` — reine
  Darstellungsänderung.
- Keine Änderung am „Wochen-Modus" (`buildWochenTageTabelle`).
- Kein Merken des „Alle öffnen"-Zustands über Seitenwechsel/Reload hinweg.

## Test-Strategie

Manuell über die lokale App (Node auf `:3000`, Edge via Playwright):

1. Woche mit gemischten Tagen (vollständig, teilweise, leer, krank, Wochenende)
   öffnen — nur vollständige + kranke Tage zeigen den grünen Streifen.
2. Eintrag ergänzen bis ein Tag vollständig ist → Streifen erscheint nach
   Autosave ohne Reload (`updateDayCompletion()`-Pfad).
3. „Alle öffnen" klicken → alle Werktage klappen auf, Label wird „Alle
   schließen"; erneuter Klick klappt alle wieder zu.
4. Jedes Theme (Standard/Dark/Candy/Christmas/Halloween/CMD/Silk/Hyperspace)
   durchschalten — Streifenfarbe passt zum Theme, ausreichend Kontrast zum
   Kartenhintergrund.
