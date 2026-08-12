# Ausbilder-Dashboard im iPad-Querformat

**Datum:** 2026-08-12
**Anlass:** Die technischen Azubis bekommen 11″-iPads; ihre Ausbilder und
Prüfer arbeiten am selben Dashboard. Nach der Reparatur des Azubi-Dashboards
(siehe `2026-08-11-ipad-dashboard-layout-design.md`) blieb die Ausbilder-Sicht
ungeprüft.

## Befund

Gemessen als Prüfer mit einem betreuten Azubi, helles Design, Touch-Modell aktiv.

| Bildschirm | Inhalt | Sichtbar | Überhang |
|---|---|---|---|
| Querformat 1194 × 745 | 1135 px | 745 px | **390 px** |
| Hochformat 834 × 1105 | 1172 px | 1105 px | 67 px |

Im Querformat steht das zweispaltige Cockpit einspaltig: „Zu prüfen“,
„Abteilungsdurchlauf“ und „Mitteilungen“ untereinander, jede Karte 1022 px
breit. Von der Mitteilungs-Karte (468 px hoch) sind 90 px zu sehen.

Ursache ist eine einzelne Regel in `app/css/dashboard.css`:

```css
@media (max-width: 1200px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
```

Ein iPad Pro 11″ meldet im Querformat **1194 px** — sechs Pixel unter der
Grenze. Dieselbe Fehlerklasse wie beim Azubi-Dashboard (dort 1180 px): der
Breakpoint ist nicht falsch gewählt, sondern liegt zu nah an einer realen
Gerätebreite.

Im Hochformat ist die Einspaltigkeit richtig; 834 px tragen keine zwei Spalten.

## Entscheidung 1 — Grenze auf 900 px

`.dashboard-grid` wird bis 900 px zweispaltig. Damit steht die Arbeit links
(„Zu prüfen“ über „Abteilungsdurchlauf“) und die Mitteilungen rechts.

| | vorher | nachher |
|---|---|---|
| Überhang im Querformat | 390 px | **0 px** |
| Breite Arbeitsspalte | 1022 px | 614 px |
| Breite Mitteilungen | 1022 px | 384 px |

Die Kachel „Mitteilungen“ wirkt damit nicht mehr überdimensioniert — sie ist
nicht kürzer, sondern schmal genug, um ihre Spalte auszufüllen.

**Mitgezogen werden Desktop-Fenster zwischen 900 und 1200 px**, die bisher
einspaltig waren. Gegengeprüft bei 1024 × 768: die Mitteilungen fallen auf ihre
Mindestbreite von 320 px, nichts überläuft.

**Verworfen:** die Mitteilungsliste auf eine feste Höhe deckeln. Gemessen
endet die rechte Spalte dann bei 572 px und lässt 173 px leere Fläche unter
sich — die Kachel wirkt nicht kleiner, sondern abgeschnitten. Ein Deckel lohnt
erst bei deutlich mehr Mitteilungen, dann aber über die volle Spaltenhöhe.

## Entscheidung 2 — flache Azubi-Zeile im Posteingang

Die Zeile pro Azubi in „Zu prüfen“ ist 148 px hoch, weil die Statuszeile
(„2 Berichte offen · älteste wartet seit 6 Wochen · 1 zurückgegeben“) neben
Avatar und Schaltfläche nur 247 px Platz hat und auf vier Zeilen umbricht. Sie
braucht 447 px.

Das ist **kein iPad-Problem** — es tritt überall auf, wo die Spalte schmaler
als rund 760 px ist:

| Spaltenbreite | Zeilenhöhe heute |
|---|---|
| 897 px (Fenster 1920) | 93 px |
| 661 px (Fenster 1536) | 120 px |
| 604 px (iPad hoch) | 148 px |
| 602 px (Fenster 1440) | 148 px |
| 556 px (iPad quer) | 148 px |

Die Statuszeile bekommt deshalb eine eigene Rasterzeile über die volle Breite
der Karte, sobald sie sonst umbrechen würde. Ausgelöst über eine
**Container-Abfrage** an der Kartenbreite, nicht über die Fensterbreite: die
Spaltenbreite hängt vom Raster ab, nicht vom Viewport — genau der Fehler, der
zu Entscheidung 1 geführt hat.

```
[Avatar] [Name / Beruf]                [Älteste prüfen] [⌄]
[ 2 Berichte offen · älteste wartet seit 6 Wochen · 1 zurückgegeben ]
```

Ergebnis, an allen fünf Breiten gemessen: **113 px** statt 148/120, die
Statuszeile immer einzeilig. Bei 897 px greift die Abfrage nicht; dort führt
allein die Markup-Änderung zu 84 statt 93 px.

### Markup-Änderung

`.azubi-card__status` wird direktes Kind von `.azubi-card__header`, eingehängt
**vor** `.azubi-card__cta`. Das Anhängen ans Ende wurde verworfen: in breiten
Fenstern steht die Schaltfläche dann zwischen Name und Status — sichtbar und in
der Vorlesereihenfolge.

`margin-bottom` an `.azubi-card__role` entfällt; der Abstand zur Statuszeile
kommt jetzt aus dem Raster.

`.azubi-card__count` und `.azubi-card__wait` bekommen `white-space: nowrap`.
Ohne das schrumpfen die Angaben in schmalen Spalten, statt umzubrechen, und
der Text bricht mitten in der Angabe um („2 Berichte / offen“). Ein erster
Entwurf setzte stattdessen `flex-wrap: nowrap` auf die Statuszeile — genau
falsch herum, gemessen bei 450 px Spaltenbreite.

## Nicht Teil dieser Änderung

- Andere Ausbilder-Seiten (Berichtsheftverwaltung, Beurteilungen) sind nicht
  vermessen. `app/css/dashboard.css` enthält zwei weitere 1200-px-Grenzen
  (`.signal-cols`, `.dash-weekgrid`), beide betreffen andere Bausteine.
- Das Hochformat bleibt unverändert.

## Prüfung

`node .superpowers/diag/container.mjs` misst Zeilenhöhe, Umbruch der
Statuszeile und den aufgeklappten Zustand an fünf Breiten. Für das Raster
zusätzlich `tools/check-dashboard-viewports.mjs` (misst das Azubi-Dashboard,
fängt Rückschritte am gemeinsamen CSS).

Gemessen nach der Umsetzung:

| Fenster | Spalte | Zeile | Status | Überhang |
|---|---|---|---|---|
| iPad quer 1194 × 745 | 556 px | 113 px | 1 Zeile | **0 px** |
| iPad hoch 834 × 1105 | 604 px | 113 px | 1 Zeile | 32 px (vorher 67) |
| Fenster 1024 × 768 | 450 px | 140 px | 2 Zeilen | 0 px |
| Fenster 1440 × 900 | 602 px | 113 px | 1 Zeile | 0 px |
| Fenster 1536 × 864 | 661 px | 113 px | 1 Zeile | 0 px |
| Fenster 1920 × 1080 | 897 px | 84 px | 1 Zeile | 0 px |

Bei 1024 px bleibt die Statuszeile zweizeilig: der vollen Rasterzeile stehen
dort nur 410 px zur Verfügung, die Angaben brauchen 447 px. Die Zeile ist
damit 140 statt 113 px hoch — hingenommen, weil die Zweispaltigkeit in diesem
Fenster den Überhang von rund 280 px auf null bringt.

Das Azubi-Dashboard teilt sich `dashboard.css`; `tools/check-dashboard-viewports.mjs`
läuft an allen sieben Viewports ohne Befund. Die Testsuite: 387 von 387.
