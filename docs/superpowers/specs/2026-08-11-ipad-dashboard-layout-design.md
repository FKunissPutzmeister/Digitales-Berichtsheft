# Azubi-Dashboard auf 11″-iPads — Design

**Datum:** 2026-08-11
**Status:** umgesetzt am 2026-08-11, verifiziert per `tools/check-dashboard-viewports.mjs`
**Betrifft:** `app/css/dashboard.css` (Azubi-Bento). Kein JavaScript, kein Backend.

## Anlass

Die technischen Azubis bekommen 11″-iPads. Das Azubi-Dashboard ist auf diese
Größe nicht ausgelegt: die Hero-Kachel „Aktuelle Woche" füllt den sichtbaren
Bereich fast allein, und die Mitteilungs-Kachel sitzt darunter auf halber
Breite mit einer leeren Fläche daneben.

## Befund

Das Azubi-Bento (`renderAzubiDashboard`, [app/js/dashboard.js:364-399](../../../app/js/dashboard.js#L364-L399))
enthält genau drei Kacheln:

| Kachel | Klasse | Desktop-Belegung |
|---|---|---|
| Aktuelle Woche | `.b-hero` | `span 8` × 3 Zeilen |
| Mitteilungen | `.b-mitteilungen` | `span 4` × 3 Zeilen |
| Zuletzt | `.b-recent` | `span 12` × 2 Zeilen |

Das Raster ist 12-spaltig mit `grid-auto-rows: 116px` und 16 px Abstand
([app/css/dashboard.css:1601-1607](../../../app/css/dashboard.css#L1601-L1607)).
Die Hero-Höhe ist damit hart auf 3 × 116 + 2 × 16 = **380 px** verdrahtet,
unabhängig davon, dass sie inhaltlich nur eine KW-Zahl, einen Button und den
7-Tage-Streifen trägt.

### Ursache 1 — der Tablet-Block adressiert eine Kachel, die es nicht gibt

```css
@media (max-width: 1180px) {
  .b-hero { grid-column: span 12; grid-row: span 3; }
  .b-azubi, .b-mitteilungen { grid-column: span 6; grid-row: span 3; }
  .b-recent { grid-column: span 12; }
  .b-stats { grid-column: span 6; grid-row: span 1; }
}
```

`.b-azubi` (Fortschritts-Kachel) und `.b-stats` (Sparkline) sind **totes CSS** —
beide Klassen kommen in keinem Template mehr vor, weder im Azubi- noch im
Ausbilder-Dashboard. `.b-mitteilungen` hat mit `span 6` seinen früheren Partner
verloren und steht seitdem allein auf halber Breite unter dem
über die volle Breite gezogenen Hero. Das ist der sichtbare Schaden.

Weil `.b-mitteilungen` ausschließlich im Azubi-Bento vorkommt (das
Ausbilder-Cockpit nutzt `.card--mitteilungen`), ist der Block ohne Seitenwirkung
auf andere Rollen änderbar.

### Ursache 2 — die Breakpoint-Grenze trennt zwei baugleiche Geräte

| Gerät | Querformat | Trifft `max-width: 1180px`? |
|---|---|---|
| iPad Air 11″ (M2) | 1180 × 820 | ja |
| iPad Pro 11″ (M4) | 1194 × 834 | **nein** |

14 px Unterschied ergeben zwei völlig verschiedene Layouts. Ein Test auf dem
Pro zeigt das beschriebene Problem gar nicht.

### Ursache 3 — das Hochformat fällt zwischen zwei Regeln

Die Regel, die im Hero Button und Tages-Streifen untereinander stellt, sitzt bei
`max-width: 768px` ([app/css/dashboard.css:1819](../../../app/css/dashboard.css#L1819)).
Das iPad ist im Hochformat 834 px breit — die Regel greift nicht, beide Elemente
werden nebeneinander gequetscht.

### Platzrechnung, iPad Pro 11″ quer

| Posten | Höhe |
|---|---|
| Gerät | 834 px |
| − Safari-Leisten | ≈ 90 px |
| **nutzbar** | **≈ 745 px** |
| − Topbar (`--topbar-h`) | 60 px |
| − `main-content` Padding oben (`--sp-4`) | 16 px |
| − Willkommens-Banner inkl. Abstand | ≈ 166 px |
| **für das Bento** | **≈ 503 px** |

Heute belegt das Bento 380 + 16 + 248 = **644 px**. „Zuletzt" liegt vollständig
unter der Kante.

## Entscheidung

Gewählt wurde die minimale Variante: **den Breakpoint reparieren**, statt das
Raster umzubauen. Verworfen wurden ein Zwei-Spalten-Layout mit inhaltsgetriebenen
Höhen (größerer Eingriff) und eine vollständige Umstellung des Rasters auf
`auto-fit` ohne Geräte-Breakpoints (betrifft Desktop und alle sieben Themes,
zu hohes Regressionsrisiko für ein Layout, das am Desktop funktioniert).

Die Hero-Kachel behält ihren gesamten Inhalt — KW-Zahl, Button und
Tages-Streifen — und wird nur kompakter. Der Tages-Streifen bleibt, weil die
technischen Azubis auf Tagesbasis berichten und ihn zum Sprung auf einen
einzelnen Tag brauchen.

## Zielzustand

### Breakpoint-Leiter

| Bereich | Trifft | Verhalten |
|---|---|---|
| `> 1280 px` | Desktop, große Laptops | unverändert: Hero `span 8` × 3, Mitteilungen `span 4` × 3 |
| `≤ 1280 px` | **iPad 11″ quer (beide Modelle)**, 13″-Laptops | Hero `span 7` × **2**, Mitteilungen `span 5` × 2, „Zuletzt" `span 12` × 2 |
| `≤ 900 px` | iPad hoch, kleine Tablets | Hero + Mitteilungen je `span 6` × 3; Button und Tages-Streifen im Hero stapeln |
| `≤ 720 px` | Handy | unverändert: alles einspaltig |

Die Grenze wandert von 1180 auf **1280 px**. Damit landen beide 11″-iPads im
selben Layout, und die Grenze fällt mit dem bereits vorhandenen 1280-px-Block
zusammen, der Sidebar-Breite und Hero-Typografie reduziert
([app/css/layout.css:684](../../../app/css/layout.css#L684),
[app/css/dashboard.css:1858](../../../app/css/dashboard.css#L1858)).

Neues Bento-Budget quer: 248 + 16 + 248 = **512 px** gegenüber 503 px
verfügbar — „Zuletzt" reicht bis an die Kante statt weit darunter zu liegen.

### Kachel-Innenleben im Bereich `≤ 1280 px`

Die Höhenreduktion des Heros erzwingt eine Reduktion seines Inhalts. `.bento .b-tile`
hat `overflow: hidden` ([app/css/dashboard.css:1612](../../../app/css/dashboard.css#L1612));
zu hoher Inhalt wird ohne Scrollbalken und ohne Warnung abgeschnitten.

| Element | heute (≤ 1280) | neu |
|---|---|---|
| `.b-hero__middle` Innenabstand | 24 px oben / 18 px unten | 12 px / 10 px |
| `.b-hero__kw` Schriftgröße | 64 px | 56 px |
| `.b-day` Innenabstand | 12 px oben / 10 px unten | 8 px |
| `.b-day .dnum` Schriftgröße | 20 px | 18 px |
| `.b-mitteilungen` Innenabstand | 26 / 28 px (aus `.bento .b-tile`) | 20 / 22 / 18 px |

Der Hero landet damit bei rund 200 px in einem 248-px-Fach — ausreichend Puffer,
damit Schriftgrößen-Schwankungen zwischen den Themes nicht sofort abschneiden.

Die Padding-Regel braucht den Vorsatz `.bento`: `.bento .b-tile { padding: 26px 28px; }`
([dashboard.css:1608](../../../app/css/dashboard.css#L1608)) hat die Spezifität
(0,2,0) und überstimmt ein blankes `.b-mitteilungen` (0,1,0). Aus demselben
Grund sind die `padding`-Angaben in den `.b-mitteilungen`-Regeln bei
[1878](../../../app/css/dashboard.css#L1878) und
[1917](../../../app/css/dashboard.css#L1917) toter Code — die dort stehenden
30/30/28 px waren nie wirksam. Betroffen ist nur `padding`; die
Raster-Eigenschaften setzt `.bento .b-tile` nicht.

Zusätzlich bekommt `.b-mitteilungen__list` ein `overscroll-behavior: contain`,
damit das Scrollen innerhalb der Kachel auf dem Touchgerät nicht in die
Seite durchschlägt.

### Bereich `≤ 900 px` (Hochformat)

Hero und Mitteilungen je `span 6` über 3 Zeilen, „Zuletzt" bleibt `span 12` × 2.
Der Hero braucht dort wieder die volle Höhe, weil `.b-hero__bottom` Button und
Tages-Streifen untereinander stellt. Die dafür zuständige Regel wird von
`max-width: 768px` auf `max-width: 900px` angehoben.

`.b-recent__grid` wechselt hier bereits auf 3 Spalten. Es steht heute bis
hinunter zu 720 px auf 6 Spalten; bei rund 710 px Inhaltsbreite im Hochformat
blieben je Wochen-Card nur ~100 px. Der bestehende 3-Spalten-Wechsel im
720-px-Block wird dafür nach oben auf 900 px gezogen.

### Totes CSS

`.b-azubi` und `.b-stats` werden aus beiden Media-Blöcken entfernt, in denen sie
heute stehen (1180 px und 720 px). Die zugehörigen Basis-Regeln
([app/css/dashboard.css:1871](../../../app/css/dashboard.css#L1871) ff.,
[2302](../../../app/css/dashboard.css#L2302) ff.) bleiben zunächst stehen — ihr
Rückbau ist eine eigene Aufräumarbeit und gehört nicht in eine Layout-Änderung,
zumal `.b-mitteilungen` sich den `.b-azubi`-Selektor für Hintergrund und Rahmen
noch teilt.

## Bewusst in Kauf genommen

Die Mitteilungs-Kachel bietet bei 248 px Höhe Platz für **2–3 sichtbare
Einträge**; weitere erreicht man über den internen Scroll und den
„Alle anzeigen"-Link. Das ist die Kehrseite der gewählten Variante: die Kachel
teilt sich die Grid-Zeilen mit dem Hero und kann nicht unabhängig wachsen.

Stellschraube ohne Umbau, falls sich das im Praxistest als zu knapp erweist:
`grid-auto-rows` im Bereich `≤ 1280 px` von 116 auf ~128 px. Das ergibt einen
Eintrag mehr und kostet, dass „Zuletzt" wieder ein Stück unter die Kante rutscht.

## Verifikation

Alle Höhenangaben sind gerechnet, nicht gemessen. Vor dem Abschluss wird am
laufenden Backend über Playwright geprüft:

- 1194 × 834 (iPad Pro 11″ quer) — Hauptfall
- 1180 × 820 (iPad Air 11″ quer) — muss identisch aussehen
- 834 × 1194 (Hochformat)
- 1280 × 800 (13″-Laptop) — die neue Grenze darf dort nichts brechen
- 1440 × 900 — Desktop muss unverändert sein

Je Größe in hell und dunkel, weil die Kachel-Hintergründe pro Theme eigene
Regeln haben. Zu prüfen ist insbesondere, dass im Hero nichts abgeschnitten ist
(`overflow: hidden`) und dass die Tages-Kacheln als Touch-Ziele mindestens
44 px hoch bleiben.

## Abgrenzung

Dies ist der Dashboard-Schritt. Wochen- und Jahresansicht treffen dieselben
Geräte und sollen die Breakpoint-Leiter 1280 / 900 / 720 als Muster erben,
werden aber als eigene Schritte behandelt. Ausbilder-, Prüfer- und
Verwaltungs-Dashboards sind nicht Teil dieses Designs.
