# Christmas-Theme: Panel-Glas — Befund und Verbesserungsvorschläge

Datum: 2026-08-26
Gemessen an: `http://localhost:3000/app/dashboard.html`, eingeloggt als
`florian.kern.demo@putzmeister.com`, `customTheme=christmas`, `perfLite=0`,
Viewport 1920×1030, Chromium via Playwright.

---

## Kurzfassung

Drei gemeldete Symptome — abgeschnittene Kante links und rechts, „nur dark
frosted statt echtem Liquid Glass", kurz aufblitzender alter Designstand beim
Seitenwechsel — haben **eine gemeinsame Ursache**, und die liegt nicht im
Christmas-Theme, sondern in `layout.css`:

```css
/* layout.css:575 */
.main-wrapper { view-transition-name: main-wrapper; }
/* layout.css:20 */
.sidebar      { view-transition-name: sidebar; }
```

Ein Element mit `view-transition-name != none` ist per Spezifikation

1. Containing Block für `position: fixed`/`absolute`-Nachkommen,
2. Stacking Context **und**
3. **Backdrop Root**.

Punkt 3 heißt: der Backdrop **jedes** `backdrop-filter` unterhalb von
`.main-wrapper` ist leer. Das betrifft nicht Christmas, sondern **jedes Theme
und jede Seite** — jedes Glas im Seiteninhalt der App ist seit dieser Zeile
wirkungslos.

Dabei wird `startViewTransition()` **nirgends** aufgerufen, und eine
`@view-transition`-Regel existiert nicht. `base.css:252` schreibt es selbst
hin: „Läuft browserübergreifend **ohne** View Transitions API." Die beiden
Deklarationen sind Reste eines verworfenen Ansatzes. Sie kosten das komplette
Glas der App und leisten nichts.

---

## Befunde im Detail

### B-1 · `view-transition-name` macht `.main-wrapper` zum Backdrop Root

**Beweis (Bisektion).** Ein Testelement mit `backdrop-filter: invert(1)` wurde
in sechs Ebenen der Kette gehängt und geprüft, ob es invertiert:

| Wirt | invertiert? |
|---|---|
| `body` | ja |
| `.app-shell` | ja |
| `.main-wrapper` | **nein** |
| `.main-content` | nein |
| `.bento` | nein |
| `.b-hero` | nein |

Der Bruch sitzt exakt an `.main-wrapper`. Nach `view-transition-name: none`
invertiert dasselbe Testelement sofort, und die Kacheln sind im selben Moment
echtes Milchglas (Screenshot `VT-after.png` / `VT-glass-A.png`).

### B-2 · Die abgeschnittene Kante links und rechts

`theme-christmas.css:502` legt ein zweites, **deckendes** Szenenbild an:

```css
[data-theme="christmas"] #pm-xm-glassbg {
  position: fixed; inset: 0; z-index: 0;
  background: center center / cover no-repeat url("../assets/backgrounds/Christmas Background.png");
}
```

`theme.js` hängt es in `#mainContent`. Weil `.main-wrapper` (B-1) Containing
Block für `fixed` ist, löst `inset: 0` **nicht** gegen den Viewport auf:

| Ebene | Rect | Filter |
|---|---|---|
| echte Szene `.pm-xm-bg` | `0,0 → 1920×1030` | `brightness(1.06) saturate(1.04)` |
| Duplikat `#pm-xm-glassbg` | `280,0 → 1624×1030` | keiner |

`background-size: cover` skaliert das Bild damit auf 1624 statt 1920 px
Breite → anderer Zoom, anderer Ausschnitt, anderer Ton. Das Duplikat ist
deckend und übermalt die echte Szene innerhalb seines Rechtecks. Ergebnis:
harte Vertikalkante bei **x = 280** (zwischen Sidenav und Panel) und bei
**x = 1904**, wo rechts 16 px echte Szene stehen bleiben. Genau die beiden
gemeldeten Kanten.

Das Duplikat existiert nur als Notlösung für B-1 („die fixe FX-Szene liegt
außerhalb des Backdrop-Roots der Karten"). Mit B-1 behoben ist es überflüssig
und kann gelöscht werden.

### B-3 · Die Panels sind kein Glas, sondern ein getöntes Loch

Zusätzlich zu B-1 gibt es zwei weitere Backdrop Roots direkt an den Kacheln:

**Bleibende Transforms.** `@keyframes fadeIn` (`base.css:185`) und `vt-in`
(`base.css:264`) animieren `transform: translateY(8px) → translateY(0)` und
laufen mit `fill-mode: both`. Der Endwert bleibt dauerhaft als
`matrix(1,0,0,1,0,0)` stehen. Gemessen:

| Element | Quelle | `transform` |
|---|---|---|
| `.main-content` | `layout.css:671` | `matrix(1,0,0,1,0,0)` |
| `.b-hero`, `.b-mitteilungen`, `.b-recent` | `base.css:210` `.animate-fade-in` | `matrix(1,0,0,1,0,0)` |

**`isolation: isolate`** — ebenfalls Backdrop Root, und zwar genau auf den
Kacheln, die ein Glas-Backing tragen sollen:

| Selektor | Quelle |
|---|---|
| `.welcome-hero` | `dashboard.css:2551` |
| `.review-inbox`, `.card.rot`, `.card--mitteilungen` | `dashboard.css:2853` |
| `.stat-card` | `glass.css:439` |

Dort steht es jeweils nur, um ein dekoratives `::after`-Sheen zu kapseln — das
erledigt das vorhandene `overflow: hidden` schon.

**Beweis.** `backdrop-filter: blur(60px)` in die Kachel gezwungen → Bäume,
Schneeflocken und Hüttenfenster bleiben **völlig scharf**
(`D-blur60-in-card.png`). Danach die Transforms entfernt → derselbe Blur
mattiert sofort vollständig (`E-blur60-root-killed.png`).
Gegenprobe mit `invert(1)`: keine Änderung, solange ein Root in der Kette
sitzt.

Was man heute als „dark frosted" sieht, ist deshalb kein Material, sondern
der flache Tint `rgba(14,26,46,0.34)` aus `.pm-xm-glass-blur` plus das
Ergebnis der GlassSurface-Displacement über einem **leeren** Backdrop. Weder
der Blur noch die Refraktion tun etwas.

### B-4 · Der kurz aufblitzende alte Designstand

`theme-christmas.css:443–485` hält bewusst einen `!important`-Fallback für den
Fall, dass das Skript nicht lädt: deckende Navy-Gradienten
(`rgba(20,30,52,0.86)`), 1 px weißer Rand, Inset-Highlight. Dieser Fallback
ist der **Default**; das Glas kommt erst, wenn `PMChristmasGlass` die Klasse
`.pm-xm-glass-card` setzt — hinter einem MutationObserver mit 90 ms Debounce
und dem asynchronen Nachladen von `glass-surface.js`.

Dazu kommt `[data-page-enter] .main-wrapper { animation: vt-in 300ms both }`
(`base.css:268`): der Wrapper blendet aus `opacity: 0` ein, während die
Kacheln noch im deckenden Fallback stehen. Man sieht also erst den alten
Stand einblenden, dann den Sprung auf transparent.

Der Fallback isoliert gerendert (`C-fallback-fouc.png`) ist genau das
gemeldete Bild, inklusive der weißen Kanten-Fahne an `.b-recent` und
`.b-mitteilungen` (`--tile-edge` ist in Christmas nicht überschrieben →
Default `rgba(255,255,255,0.9)`).

### B-5 · Nebenbefunde

* **App-weite Reichweite.** Der Kommentar in `theme-christmas.css:739`
  begründet, dass die Panel-Deckkraft von 0.56 auf 0.84 angehoben wurde, weil
  0.56 „zu durchsichtig" war. Der eigentliche Grund war B-1: der Frost hat nie
  funktioniert, also musste die Deckkraft die Lesbarkeit allein tragen. Nach
  dem Fix sind 0.84 zu viel — dasselbe gilt für das Silk-Theme.
* **`data-frostblur` funktioniert.** Die lokale Erweiterung in
  `glass-surface.js` (`blur(N) url(#filter)` in einer Filter-Kette) greift.
  Die heutige Doppelebene `.pm-xm-glass-blur` + `.pm-xm-glass` ist damit
  unnötig; ein Backing reicht.
* **`perf-lite` ist korrekt und bleibt.** `glass.css:746` schaltet auf
  Software-Renderern (RDP, VM, WARP/SwiftShader) alle `backdrop-filter` ab —
  richtig so, gemessene 27 statt 61 FPS. Wichtig für die Umsetzung: dieser
  Pfad braucht weiterhin deckende, lesbare Flächen. Er darf nicht mit dem
  Glas-Design verwechselt werden. In Headless-Chromium ist er standardmäßig
  aktiv; alle Messungen hier liefen deshalb mit `localStorage.perfLite='0'`.
* **Kein Layout-Shift.** Der Fix aus B-1/B-3 wurde auf der echten Seite
  gegengemessen: Rects von `.welcome-hero`, `.b-hero`, `.b-mitteilungen`,
  `.b-recent`, `.sidebar`, `.main-wrapper`, `.main-content`, `.bento`
  identisch vor und nach dem Fix.

---

## Vorgeschlagene Behebung

Reihenfolge ist die Wirkungsreihenfolge, nicht die Aufwandsreihenfolge.

**F-1 — `view-transition-name` entfernen** (`layout.css:20`, `:575`).
Toter Code; hebt das Glas der ganzen App wieder an.

**F-2 — keine bleibenden Transforms.** In `@keyframes fadeIn` und `vt-in` das
`to`-Keyframe auf `transform: none` statt `translateY(0)` setzen. Mit
`fill-mode: both` bleibt dann `none` stehen statt einer Identitätsmatrix. Die
Animation selbst bleibt unverändert erhalten.
Rest-Effekt: während der 220–300 ms Einblendung ist der Transform aktiv, das
Glas dort also kurz flach. Wo das auffällt, gehört die Bewegung auf die
**Kinder** der Kachel, nicht auf die Kachel.

**F-3 — `isolation: isolate` von den Glas-Wirten nehmen**
(`dashboard.css:2551`, `:2853`, `glass.css:439`). `overflow: hidden` ist dort
schon vorhanden und leistet, was gemeint war.

**F-4 — `#pm-xm-glassbg` und die Doppelebene löschen.** Nach F-1 sieht das
Backing die echte Szene. Ein Backing mit `data-frostblur` genügt; die Naht
verschwindet mit dem Duplikat.

**F-5 — Kein FOUC.** Das Glas muss der CSS-**Default** sein, nicht das
Ergebnis eines Skripts: Kachel transparent + `backdrop-filter` direkt am
Selektor. Das GlassSurface-Backing ist dann nur noch additive Verfeinerung
(Refraktion), kein Umschalter von deckend auf transparent. Der
`!important`-Fallback-Block entfällt; `perf-lite` bleibt der einzige
Deckend-Pfad.

**F-6 — Material neu einstellen.** Nach F-1 wirken die heutigen Werte anders
als bisher. Betroffen sind alle Flächen, die im Christmas-Theme transluzent
sind:

| Gruppe | Selektoren | heute |
|---|---|---|
| Bento-Kacheln | `.welcome-hero`, `.b-hero`, `.b-mitteilungen`, `.b-recent` | Tint 0.34 + Blur 14 |
| Panels/Karten/Menüs | `.card`, `.stat-card`, `.profil-section`, `.verwaltung-panel`, `.week-toolbar`, `.pm-select__menu`, `.dropdown__menu` | Tint 0.84 + Blur 14 |
| neutrale Buttons | `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.pm-select__trigger` | Tint 0.42 + Blur 11 |
| Primär-Buttons | `.btn-primary`, `.b-btn-primary` | Rot-Glas + Blur 11 |

Die Wochenansicht-`tag-row`s sind bewusst nicht transluzent und bleiben außen
vor.

---

## Die eigentliche Designfrage

Der Fix allein liefert echtes Glas, löst aber nicht das Motiv-Problem: die
**untere Bildhälfte ist heller Schnee**. Weißer Text darüber ist ohne
zusätzlichen Schutz nicht lesbar — im Screenshot nach dem reinen Fix
(`SHIFT-fix-only.png`) ist „17.08. – 23.08. Genehmigt" in der `.b-recent`-
Kachel kaum zu entziffern, während dieselbe Schrift über dem dunklen
Nachthimmel in `.b-hero` klar steht.

Drei Wege, im Lab umschaltbar:

| | Variante A · Milchglas | Variante B · Scharf + Scrim | Variante C · Szene gedimmt |
|---|---|---|---|
| Frost-Blur | 26 px | 3 px | 15 px |
| Tint | `rgba(12,22,40,0.40)` | `rgba(12,22,40,0.12)` | `rgba(12,22,40,0.24)` |
| Refraktion | −80 | −120 | −95 |
| Textschutz | keiner nötig | Gradient-Fahnen oben/unten, Mitte klar | keiner nötig |
| Szene | unangetastet | unangetastet | nach unten abgedunkelt (0.42) |
| Charakter | ruhig, klassisch iOS-26; Szene in der Kachel verwaschen | maximaler Durchblick, sichtbare Brechung; Szene bleibt Hauptdarsteller | Kacheln leicht, Bild insgesamt ruhiger — aber der helle Schnee verliert an Leuchtkraft |

Die Werte sind Startpunkte, keine Festlegung. Im Lab hängen sie an Reglern
(Frost-Blur, Tint, Refraktion, Glaskante, Scrim, Szene-Dimmung) und werden als
kopierbarer CSS-Block ausgegeben.

---

## Artefakte

**Lab (klickbar, im Browser):**
`http://localhost:3000/mockups/christmas-glass-lab.html`
Datei: `C:\dev\digitales Berichtsheft\Digitales-Berichtsheft\mockups\christmas-glass-lab.html`

Kein Nachbau von Hand: Markup und Stylesheets stammen aus der echten Seite
(DOM-Dump der eingeloggten `dashboard.html` und `profil.html`, `<link>`s auf
die echten `/app/css/*.css`). Gegengemessen — `.b-hero` liegt im Lab bei
`304,192 1045×380`, in der echten App bei `304,192 1045×380`.
Enthält: Ansicht Dashboard/Panels, Varianten IST/A/B/C, sechs Regler, zwei
Schalter, die die Bugs sichtbar machen (Naht-Duplikat, FOUC-Fallback), und die
Ausgabe der aktuellen Werte. Das Bedienfeld ist an der Kopfzeile verschiebbar
und klappt per Klick zu.
Einschränkung: der Schneefall-Canvas ist statisch, weil `theme.js` bewusst
nicht geladen wird (es würde die heutige Glas-Dekoration mitbringen). Die
Lampen- und Kugel-Glows sind reines CSS und laufen.

**Screenshots** in
`C:\Users\KernF\AppData\Local\Temp\claude\c--dev-digitales-Berichtsheft\3d7e2f83-5ecf-4e6b-96ac-8a1e74528917\scratchpad\`

| Datei | Inhalt |
|---|---|
| `R0-dashboard-ist.png` | echte Seite heute, mit beiden Nähten |
| `A-seam-left.png`, `V-ist-seam.png` | Naht bei x = 280 im Detail |
| `C-fallback-fouc.png` | der FOUC-Zustand isoliert |
| `D-blur60-in-card.png` | erzwungener `blur(60px)` wirkt nicht |
| `E-blur60-root-killed.png` | derselbe Blur nach Entfernen des Roots |
| `Y-bisect.png` | Bisektion: Bruch an `.main-wrapper` |
| `VT-after.png` | `invert(1)` greift nach `view-transition-name: none` |
| `SHIFT-fix-only.png` | echte Seite, nur der Fix, Material unverändert |
| `LIVE-A.png`, `LIVE-B.png`, `LIVE-C.png` | die drei Varianten auf der echten Seite |
| `V-A.png`, `V-B.png`, `V-C.png` | die drei Varianten im Lab |
| `V-panels-A.png`, `V-panels-C.png` | Panels-Ansicht (Profil) |

**Verifikations-Skripte** (Playwright, CJS über `NODE_PATH` auf den
npx-Cache) liegen im selben Ordner: `bisect.js`, `proof-vt.js`,
`check-shift.js`, `live-variants.js`, `assemble.js`, `shoot-lab.js`.

---

## Offen

* Variante festlegen (A, B, C oder eigene Reglerwerte).
* F-1 bis F-3 greifen app-weit in alle Themes. Silk und der Standard-Modus
  sehen danach anders aus, weil ihr Glas erstmals wirklich blurrt — beide
  müssen im selben Durchgang nachgezogen werden.
* Perf messen: nach F-1 laufen erstmals echte `backdrop-filter` über einem
  großen Foto. FPS auf einem GPU-Rechner gegenprüfen, `perf-lite` bleibt der
  Ausweg für alles ohne GPU.

---

# Runde 2 — nach der ersten Sichtung

Gewählte Richtung: Variante B mit deinen Werten — `frostblur 2`,
`distortion -45`, `tint 0.00`, `rim 0.18`, `scrim 0.78`, `dim 0.00`.
Drei Rückmeldungen, drei Befunde.

## B-6 · Der dunkle Rand ist das SVG-Displacement selbst

Nicht abschaltbar, weil er kein eingestellter Wert ist, sondern ein Artefakt:
`feDisplacementMap` verschiebt im Randbereich Pixel, die es sich von
**außerhalb** der Kachel holt. Dort ist der Backdrop transparent-schwarz —
also wird Schwarz nach innen gezogen. Die Bandbreite entspricht dem
neutralen Innenrechteck der Map (`edge = min(w,h) · data-border · 0.5`, bei
`data-border 0.07` und 380 px Höhe ≈ 13 px) plus dem Map-Blur (`data-blur`,
Default 22) — zusammen die beobachteten ~35 px.

Bisektion (`E*-edge-left.png`):

| Zustand | dunkler Saum |
|---|---|
| IST (`distortion -45`, `data-blur 22`) | ja, ~35 px |
| ohne `box-shadow` des Rims | ja — also nicht der Rim |
| ohne Scrim | ja — also nicht der Scrim |
| **reines `blur(2px)`, kein SVG-Filter** | **nein** |
| weichere Map (`data-blur 40`, `displace 0`) | ja, nur weicher |

Drei Wege, im Lab als Segment „Kanten-Brechung":

* **aus** (Default) — kein SVG-Filter. Das Glas kommt aus `blur` + explizitem
  Kanten-Stack: helles Highlight oben, 1 px Rim rundum, feine dunkle
  Unterkante, weicher Außenschatten. Bei `frostblur 2` ist die Brechung
  ohnehin kaum sichtbar, das Artefakt dagegen deutlich — der Tausch kostet
  nichts.
* **Kantenband** — `data-border 0.018`, `data-blur 6`: Brechung nur als
  wenige Pixel breiter Saum direkt an der Kante. Liest sich als Glasdicke,
  nicht als Schleier. Guter Kompromiss, wenn echte Refraktion gewünscht ist.
* **voll** — der Skill-Default, zum Vergleichen.

## B-7 · Christmas ist ein dunkles Theme, aber nicht `data-theme="dark"`

Das ist die Wurzel der falschen Schriftfarben. `dashboard.css` enthält 75
`[data-theme="dark"]`-Überschreibungen. Christmas läuft unter
`data-theme="christmas"`, greift also keine davon ab und erbt die
**Hell**-Werte. `theme-christmas.css` spiegelt viele von Hand nach — aber
nicht alle. Gezählt: **21 Blöcke in `dashboard.css`, deren Basis-Selektor in
`theme-christmas.css` überhaupt nicht vorkommt.**

Auf diesem Dashboard sichtbar:

| Quelle | Folge |
|---|---|
| `dashboard.css:2028` `.b-mitteilungen__more { color: rgba(14,17,22,0.55) }` | „Alle 8 anzeigen" dunkelgrau auf hellem Bild |
| `dashboard.css:2073` `.b-mitteilung:hover` | Hover fällt auf den Hell-Wert zurück |
| `dashboard.css:2077` `.b-mitteilungen__empty` | Leerzustand unlesbar |
| `dashboard.css:2332` `.b-wkcard--day .b-wkcard__kw small` | tägliches Berichtsheft |

Weitere betroffene Flächen außerhalb des Azubi-Dashboards:
`.review-inbox`, `.card.rot`, `.card--mitteilungen` (Ausbilder-Dashboard),
`.azubi-card__body`, `.rot-row:hover`, `.rot-stop--cur/--next/--empty`,
`.rot__search` (Abteilungsdurchlauf), `.dash-error-card*`,
`.review-filter-bar`, `.activity-more:hover`.

`dashboard.css:2066` zeigt, wie es gemeint war — dort stehen `dark`,
`hyperspace`, `halloween` und `cmd` in **einer** Selektorliste. Christmas
fehlt einfach. Zwei Behebungswege:

1. **Christmas in die bestehenden Listen aufnehmen.** Mechanisch, 21 Stellen,
   kein Konzeptwechsel — aber das nächste dunkle Theme wiederholt den Fehler.
2. **Ein Flag statt einer Theme-Liste.** `theme.js` setzt `html[data-dark]`,
   sobald das effektive Theme dunkel ist (dark, hyperspace, cmd, halloween,
   christmas, Silk-Dark); die Overrides hängen an `html[data-dark]` statt an
   einer Aufzählung. Einmaliger Sweep über 75 Blöcke in `dashboard.css` plus
   die gleichen Muster in den anderen CSS-Dateien, danach ist die Fehlerklasse
   strukturell weg.

Empfehlung: 2, weil genau dieser Fehler schon zweimal aufgetreten ist
(Halloween/CMD wurden nachträglich in Listen ergänzt).

## B-8 · Inhalts-Flächen mit `rgba(255,255,255,0.04)`

Drei Elemente tragen eine Fläche, die für einen **deckenden** Kachelgrund
gedacht war und auf klarem Glas nichts ist:

| Element | heute | Quelle |
|---|---|---|
| `.b-wkcard` (Wochen-Kacheln) | `rgba(255,255,255,0.04)` | `theme-christmas.css:416` |
| `.b-day` (Tages-Pillen) | `rgba(255,255,255,0.05)` | `theme-christmas.css:430` |
| `.b-mitteilung` (Mitteilungs-Zeilen) | `rgba(14,17,22,0.04)` | `dashboard.css:2034`, Dark-Override greift nicht (B-7) |

Deine Vorgabe für die Wochen-Kacheln — „dürfen ruhig präsent sein" — gilt für
alle drei: sie tragen Inhalt, also bekommen sie eine eigene Fläche. Bei den
Wochen-Kacheln bleibt der vorhandene Status-Wash über `--sig` erhalten, nur
auf dunklem Grund statt auf Transparenz. Damit löst sich auch die Hierarchie
sauber auf: die Kachel ist Rahmen, die Karten sind Inhalt.

Zwei Nebenfunde an derselben Kachel:

* **Olivgelber Rahmen an Mitteilungen.** `dashboard.css:2059`
  `.b-mitteilung--unread { border-color: rgba(255,195,0,0.30) }` — Putzmeister-
  Gelb hart kodiert statt `var(--pm-yellow)`. In Christmas ist der Akzent Rot
  (`#C8102E`), deshalb las sich der Rahmen als fremdes Oliv. Über den Token
  geführt folgt er jedem Theme.
* **Liste wird mitten im Text abgeschnitten.** `.b-mitteilungen__list` läuft
  über die Kachel hinaus; die Scrollbar ist in den Glaskarten ausgeblendet
  (`theme-christmas.css:567`), also wird die vierte Zeile halbiert und „Alle 8
  anzeigen" liegt darüber. Auf dem alten deckenden Grund fiel das kaum auf.
  Behoben mit einem `mask-image`-Ausblender am unteren Listenrand.

## B-9 · Umsetzungsfalle: `position: relative` auf Kachel-Kindern

`theme-christmas.css:530` setzt
`.pm-xm-glass-card > *:not(.pm-xm-glass):not(.pm-xm-glass-blur) { position: relative }`,
um Inhalt über die Glas-Backings zu heben. Eine neue Scrim-Ebene fällt in
diese Regel, wird dadurch `relative` und nimmt am Flex-Layout teil — bei
`.welcome-hero` (`display:flex`, `justify-content:space-between`) wandert
„Guten Morgen, Florian" in die Mitte. Die Scrim-Klasse muss also in die
`:not()`-Liste. Gegengemessen: mit der Ergänzung liegt `.welcome-hero__name`
wieder bei `x = 344` wie vorher.

## Stand

Lab neu gebaut, gleiche URL — Segment „Kanten-Brechung" (aus/Kantenband/voll)
und drei Lesbarkeits-Schalter (Inhalts-Kacheln präsent, Status-Farben
aufhellen, Textschutz-Schatten) sind neu, Variante B ist Default.
Dasselbe Rezept auf der echten Seite: `FINAL-live.png`,
`FINAL-live-hero.png`, `FINAL-live-recent.png`, `FINAL-live-edge.png`.
Kein Layout-Shift.

Offen: Entscheidung zwischen „Brechung aus" und „Kantenband", und zwischen den
beiden Wegen aus B-7.

---

# Runde 3 — die dunklen Ränder oben und unten

Gewählt: Kanten-Brechung **Kantenband**
(`data-distortion -45`, `data-border 0.018`, `data-blur 6`, `data-displace 0.3`).
Rückmeldung: oberer und unterer Rand weiterhin zu dunkel.

## B-10 · Es war nicht die Brechung, es war der Scrim

Gemessen wurde ein vertikales Luminanzprofil durch die Hero-Kachel (pro
Bildzeile der Mittelwert über x; `edge-profile.js`, Bilder `P-*.png`).
Kennzahl: Helligkeit der obersten 40 px relativ zur Kachelmitte.

| Zustand | oben/mitte | unten/mitte |
|---|---|---|
| Kantenband **+ Scrim 0.78** | **0.33** | 0.38 |
| Kantenband, Scrim 0 | 0.68 | 0.88 |
| Brechung ganz aus, Scrim 0 | 0.69 | 0.88 |
| Kantenband + `feComposite over SourceGraphic` | 0.70 | 0.88 |
| Kantenband + Map-Grund auf G=128 | 0.70 | 0.88 |

Zwei Dinge fallen auf:

1. **Brechung an oder aus macht 1.6 % Unterschied** (0.68 vs 0.69). Der dunkle
   obere und untere Rand kam also praktisch vollständig vom Scrim, dem
   kachelweiten Textschutz-Gradienten — der lief über 46 % der Kachelhöhe und
   drückte die Oberkante auf ein Drittel der Kachelhelligkeit.
2. Der Rest (0.68 statt 1.0) ist **die Szene selbst**: oben Nachthimmel und
   Bergflanke, in der Mitte der helle Horizont, unten der beleuchtete See.
   Kein Artefakt, sondern das Motiv.

Die beiden geprüften Filter-Kandidaten (`feComposite over SourceGraphic` am
Ende der Kette, bzw. den Map-Grund von Schwarz auf G=128 heben, damit im
Randband keine y-Verschiebung entsteht) bringen entsprechend nichts mehr —
mit `data-border 0.018` ist das Displacement-Artefakt schon auf wenige Pixel
geschrumpft. Notiert, weil sie für den Fall „volle Brechung" der richtige
Hebel wären.

## B-11 · Vier Textschutz-Formen, gemessen

Nicht der Scrim selbst ist das Problem, sondern seine **Fläche**. Vier Formen
im direkten Vergleich, jeweils mit WCAG-Kontrastmessung über zwölf
Textelemente (`contrast.js` / `shoot-shapes.js`):

| Form | Helligkeit oben | Durchfaller |
|---|---|---|
| **breit** (kachelweites Band, 46 % der Höhe) | 0.34 | 4 |
| **schmal** (px-verankert, 72 px oben / 60 px unten) | 0.43 | 5 |
| **Halo** (nur gestapelte `text-shadow`, keine Fläche) | 0.66 | 5 |
| **aus** | 0.66 | 5 |
| **Träger** (kleine Fläche an der Textzeile) | **0.68** | **0** |

Der Träger dominiert alles: so hell wie ohne Scrim und trotzdem kein einziger
Durchfaller. Das breite Band ist sogar in beiden Achsen schlechter — dunkler
**und** mit vier Durchfallern, weil ein Gradient über die halbe Kachel an der
Textzeile selbst nur noch schwach ankommt.

Messmethode, damit die Zahlen belastbar sind: Textfarbe auf `transparent`
setzen und den `text-shadow` **stehen lassen**, dann den Element-Rect
screenshotten und dessen mittlere Luminanz als Hintergrund nehmen.
`visibility: hidden` versteckt auch den Träger und liefert deshalb zu
pessimistische Werte (das hat in einem Zwischenlauf vier Scheinfehler erzeugt).

## Das Rezept

**Kleine Labels bekommen eine kleine Fläche.** `.b-hero__kw small`,
`.b-recent__head > div`, `.b-azubi__head .eyebrow`, `.b-mitteilungen__more`,
`.welcome-hero__body`:

```css
padding: 5px 11px;  margin: -5px -11px;  border-radius: 11px;
background: rgba(6,13,26,0.80);
backdrop-filter: blur(10px) saturate(1.1);
```

Das negative `margin` gleicht das `padding` aus, der optische Kasten bleibt an
derselben Stelle. Auf `.b-recent__head > a` bewusst **kein** Träger — der Link
liegt schon bei 8.4:1, ein Kasten wäre reine Zutat.

**Große Displayzahlen bekommen keinen Träger, sondern einen Halo.**
`.b-hero__kw-num`, `.welcome-hero__kw-num`:

```css
text-shadow: 0 2px 3px rgba(2,6,14,.90), 0 0 14px rgba(2,6,14,.85),
             0 0 34px rgba(2,6,14,.70), 0 0 60px rgba(2,6,14,.50);
```

Damit erreicht `.b-hero__kw-num` 8.4:1 — ein Träger wäre dort ein dunkler
Klotz. Umgekehrt gilt es nicht: Halo allein bringt einem 11-px-Label fast
nichts (2.4–3.0:1), es braucht die Fläche. Die Regel ist also nach
Schriftgröße getrennt, nicht global.

**Warum es keine Farb-Lösung gibt.** Über einem hellen Foto kann helle Schrift
den Kontrast nicht durch Farbe gewinnen: die Hintergrundluminanz bleibt hoch,
egal wie weiß man die Schrift macht. Zwei Elemente belegen das — sie fielen in
**jeder** Scrim-Stufe durch, bevor sie einen Träger bekamen:

| Element | Scrim 0 | 0.3 | 0.78 | mit Träger |
|---|---|---|---|---|
| `.b-recent__head .sub` | 1.84 | — | 3.86 | **4.89** |
| `.welcome-hero__sub` | 3.70 | — | 4.24 | **8.05** |

Zwei weitere Werte waren reine Farbfehler und ließen sich direkt heben:
`.b-day .dnum` erbte `rgba(255,255,255,0.85)` und lag bei 2.89 (Soll 3.0) →
auf `#fff`; die Tages-Pille von `0.62` auf `0.82` Deckkraft.

## B-12 · Layout-Fallen des Trägers

Beide gegengemessen, danach 0 px Verschiebung an
`.welcome-hero__name`, `.b-hero__kw-num`, `.b-recent__head h3`, `.bento`:

* `display: inline-block` auf `.b-hero__kw small` reißt das Label aus der
  eigenen Zeile und schiebt „KW 35" daneben → `display: block; width: fit-content`.
* `small` als Block bildet eine eigene Zeilenbox, wodurch `.b-hero__kw-num`
  4 px hochrutscht. Nur dort `margin-bottom: -1px` statt `-5px` — bei
  `.welcome-hero__body` würde dieselbe Korrektur die Flex-Zentrierung um 2 px
  kippen.
* `.b-mitteilungen__more` ist `display: flex` und läuft als Träger über die
  volle Kachelbreite → `width: fit-content; margin-inline: auto`.
* `.b-recent__head` hat `margin-bottom: 16px`; das negative Träger-Margin
  zieht die Zeile hoch → auf `21px` ausgleichen.

## Stand

Lab neu gebaut, gleiche URL. Neu: Segment **Scrim-Form**
(breit / Träger / Halo / aus), Träger ist Default; Kanten-Brechung steht auf
Kantenband. Screenshots `S-traeger-full.png`, `S-breit-full.png`.

Dasselbe Rezept auf der echten Seite: `TRAEGER-live.png`,
`TRAEGER-live-hero.png`, `TRAEGER-live-recent.png`, `TRAEGER-live-edge.png`.
Kontrast: 12 von 12 Textelementen bestanden. Layout: kein Shift.

---

# Runde 4 — der Mittelweg

Rückmeldung zu Runde 3: die Träger-Kästen sehen schlecht aus, das breite Band
war optisch besser, gewünscht ist ein Mittelweg — „nicht zu dunkel an den
Rändern, aber ein bisschen Kontrast darf schon da sein".

## Träger verworfen, obwohl er messtechnisch führte

Der Träger gewinnt jede Messung (0 Durchfaller bei voller Randhelligkeit) und
verliert die Gestaltung. **Entscheidung: verworfen, nicht wieder vorschlagen.**
Er bleibt im Lab als Vergleichsschalter stehen, ist aber nicht Default.

## B-13 · Kontur statt Fläche

Damit stand die Frage neu: die vier problematischen Labels sitzen direkt auf
der Szene und brauchen lokal dunkleren Grund — aber ohne Kasten und ohne
Kachelband. Antwort: **die Kontur an der Glyphe selbst.**

Ein einzelner weicher `text-shadow` bringt bei 11 px fast nichts (gemessen
2.1–3.2:1, unabhängig von der Scrim-Stärke), weil sein Radius im Verhältnis
zur Glyphe zu groß ist — die Verdunkelung landet **neben** der Glyphe, nicht
an ihrer Kante, und genau dort wird Kontrast beurteilt. Zwei Ringe aus 1-px-
und 2-px-Schatten bilden dagegen einen echten Umriss:

```css
text-shadow:
   1px 0 0 rgb(3,8,16),        -1px 0 0 rgb(3,8,16),
   0 1px 0 rgb(3,8,16),         0 -1px 0 rgb(3,8,16),
   1px 1px 0 rgb(3,8,16),      -1px 1px 0 rgb(3,8,16),
   1px -1px 0 rgb(3,8,16),     -1px -1px 0 rgb(3,8,16),
   2px 0 0 rgba(3,8,16,.75),   -2px 0 0 rgba(3,8,16,.75),
   0 2px 0 rgba(3,8,16,.75),    0 -2px 0 rgba(3,8,16,.75),
   2px 2px 0 rgba(3,8,16,.55), -2px 2px 0 rgba(3,8,16,.55),
   2px -2px 0 rgba(3,8,16,.55),-2px -2px 0 rgba(3,8,16,.55),
   0 0 8px rgba(3,8,16,.80), 0 0 18px rgba(3,8,16,.55);
```

`-webkit-text-stroke` wäre die saubere Variante, frisst bei 11 px aber die
Strichstärke der Glyphe (der Strich liegt mittig auf der Kontur), und
`paint-order: stroke fill` ist für HTML-Text nicht überall verfügbar.

Wirkung der Kontur, gemessen: `breit 0.78` fällt von 4 Durchfallern auf **0**,
`ohne Scrim` von 5 auf 3.

## B-14 · Die Kompromisskurve

Neue Scrim-Form **sanft**: niedrige Spitze (0.55 statt 0.92), deutlich
längerer Auslauf, unten schwächer als oben. Der Knick bei 26 % war das, was
„breit" als Bandrand lesbar machte.

Rand-Helligkeit oben relativ zur Kachelmitte / WCAG-Durchfaller von zwölf
Textelementen, jeweils **mit** Kontur:

| Textschutz | Rand oben | Rand unten | Durchfaller |
|---|---|---|---|
| breit 0.78 (Runde 2, „zu dunkel") | 0.35 | 0.37 | 0 |
| sanft 0.80 | 0.51 | 0.71 | 2 |
| **sanft 0.60 — gesetzt** | **0.55** | **0.75** | **2** |
| sanft 0.45 | 0.59 | 0.77 | 2 |
| aus | 0.68 | 0.87 | 3 |

`sanft 0.60` liegt fast genau in der Mitte zwischen dem alten Band (0.35) und
gar keinem Schutz (0.68) — der gewünschte Mittelweg, in Zahlen.

Die zwei Restfälle sind `.b-hero__kw small` („AKTUELLE WOCHE", 11 px) und
`.welcome-hero__sub` („Mittwoch, 26. August", 13 px) bei 3.2–3.5 gegen 4.5.
Bewusst akzeptiert: reine Sekundärlabels, und der Weg zu voller AA-Konformität
wäre eine Typografieänderung (≥14 px bold senkt die Schwelle auf 3.0, dann
bestehen beide) — die gehört nicht in einen Theme-Fix.

Alles andere aus Runde 2 und 3 bleibt: Halo an den großen Displayzahlen
(`.b-hero__kw-num` 8.4:1), Inhalts-Kacheln präsent, Statusfarben aufgehellt,
Tagesziffer auf `#fff`, Tages-Pille 0.82, Mitteilungs-Liste unten ausgeblendet,
`--unread`-Rand über `var(--pm-yellow)`.

## Stand

Lab, gleiche URL: Scrim-Form **breit / sanft / Träger / Halo / aus**, Default
`sanft` bei 0.60, Kanten-Brechung `Kantenband`.
Echte Seite: `SANFT-live.png`, `SANFT-live-hero.png`, `SANFT-live-recent.png`,
`SANFT-live-edge.png` — kein Layout-Shift.

---

# Umsetzung (26.08.2026) — in `app/`, nicht mehr im Lab

Abgestimmte Werte: Brechung `Kantenband` mit `data-distortion="-105"`,
Frost-Blur 2 px, Tint `rgba(12,22,40,0.00)`, Rim 0.18, Scrim `sanft` 0.60,
Szene-Dimmung 0, Wochenkacheln präsent, Statusfarben aufgehellt,
Textschatten an.

## Geänderte Dateien

**`app/css/layout.css`** — `view-transition-name` auf `.sidebar` (Z. 20) und
`.main-wrapper` (Z. 575) entfernt. Toter Code (kein `startViewTransition()`
in der App), aber jede der beiden Zeilen machte ihr Element zum Backdrop Root
und damit jeden `backdrop-filter` im Seiteninhalt wirkungslos — app-weit, in
jedem Theme. Kommentar an beiden Stellen erklärt, warum sie nicht zurückkommen
dürfen.

**`app/css/base.css`** — `@keyframes fadeIn` und `vt-in` animieren nur noch
`opacity`. Vorher: `to { transform: translateY(0) }` plus
`animation-fill-mode: both` ⇒ dauerhaft eine `matrix(1,0,0,1,0,0)` auf
`.main-content` UND auf den Kacheln selbst (`.animate-fade-in` sitzt laut
`dashboard.js:345/372/393` direkt auf `.b-mitteilungen/.b-hero/.b-recent`).
Ein transformfreies `to` hätte das Glas immerhin während der 240–300 ms noch
gekappt — bei `vt-in` auf `.main-wrapper` wäre das bei jeder Navigation ein
synchrones Aufpoppen der ganzen Seite gewesen. Die 8 px Versatz sind den Preis
nicht wert. `slideInLeft`, `revealUp`, `toastIn` bleiben unberührt
(`reveal-up` wird nirgends verwendet).

**`app/css/dashboard.css`** — `isolation: isolate` von `.welcome-hero`
entfernt; `overflow: hidden` leistet die Kapselung der Deko-Pseudos allein.
`.review-inbox/.card.rot/.card--mitteilungen` und `.stat-card` behalten es:
sie hosten kein Glas, und der minimale Diff ist hier der sichere.

**`app/css/theme-christmas.css`** — der Block „Finaler Material-Layer" +
„ECHTES LIQUID GLASS" (140 Zeilen) ist durch einen Regelsatz ersetzt. Drei
Ebenen pro Kachel: Kachel = nur Träger (transparent, randlos), `::before` =
Scrim (z 1), `.pm-xm-glass` = Frost + Glaskante + Refraktion (z 0), Inhalt
z 2. Dazu die Inhalts-Flächen, Schriftfarben, Kontur und Halo aus Runde 2–4.
`#pm-xm-glassbg` ist gelöscht (war die Naht), `.pm-xm-glass-blur` entfällt.

**`app/js/theme.js`** — `PMChristmasGlass` legt nur noch **ein** Backing an
statt zwei und kennt keinen Bild-Layer mehr (`ensureBg`/`GBID` weg). Die
Doppelebene existierte, weil `blur()` und `url(#svg)` nicht in einem
`backdrop-filter` zusammengehen — mit `data-frostblur` (schon in
`app/js/vendor/glass-surface.js`) tun sie es doch:
`blur(2px) url(#glass-filter-N) saturate(1.18)`.

## Warum das den FOUC beendet

Der kurz aufblitzende alte Stand war die Zweiteilung selbst: das CSS trug
einen deckenden Navy-Verlauf als Fallback, das Glas kam per Script. Jetzt
trägt das CSS den vollen Look. Gemessen im Vollbild während des Ladens
(`X-0-*-0glas.png`, noch kein einziges Backing): Szene + Scrim + präsente
Inhalts-Kacheln, also praktisch der Endzustand — es fehlen nur 2 px Frost,
Rim und Kantenband. Kein Designwechsel mehr, nur Schärfe.

## Abnahme

`verify-xm.js` auf der echten eingeloggten Seite:

| Prüfung | Ergebnis |
|---|---|
| `#pm-xm-glassbg` / `.pm-xm-glass-blur` | beide weg |
| Backings / dekorierte Karten | 4 / 4 |
| Filterkette | `blur(2px) url("#glass-filter-2") saturate(1.18)` |
| Kachel selbst | Hintergrund `none`, Rand `0px`, Scrim auf `::before` z 1 |
| Backdrop Roots (`.main-wrapper`, `.main-content`, `#mainContent`) | keine, in allen 6 Themes |
| Geometrie vs. abgestimmter Lauf | 4/4 identisch, kein Layout-Shift |
| Randhelligkeit Hero oben | 0.543 (Ziel 0.55) |
| WCAG | 9/11 bestehen; `.b-hero__kw small` 3.24/4.5 bewusst akzeptiert |
| JS-Fehler | keine |

`.b-day--past/.b-day--weekend .dnum` von 0.35 auf 0.42 gehoben — lag mit
2.96:1 knapp unter AA-Groß (3.0), besteht jetzt und bleibt klar dunkler als
die aktiven Tage.

`verify-themes.js` über 6 Themes × 3 Seiten (18 Screenshots `T-*.png`): keine
JS-Fehler, kein Layout-Bruch. Pro Seite haben jetzt 0–7 Flächen einen echt
wirksamen `backdrop-filter` — vorher waren es null. Sichtbarer Gewinn
besonders in Halloween (Kacheln zeigen die Szene) und Silk.

**Kein echter Fehler, aber notiert:** geclippte Screenshots *während* des
Ladens (`V-nav-*.png`) zeigen ein verzerrtes Spiegelbild. Im Vollbild zum
selben Zeitpunkt ist nichts davon zu sehen, und `enhance()` wird laut
`probe-warp2.js` immer mit der endgültigen Kachelgröße aufgerufen
(Map == Rect, 4/4). Also ein Capture-Artefakt von `clip` über einer noch
kompositierenden `backdrop-filter`-Fläche — beim Messen von Glas nie mit
`clip` mitten im Ladevorgang arbeiten.

---

# Nachtrag: warum es beim User trotzdem falsch aussah

Der User schickte einen Screenshot seines Dashboards: Kacheln praktisch
unsichtbar, Szene messerscharf dahinter, leere Mitteilungs-Kachel als Loch
über der Baum-Ecke. Weit weg vom abgestimmten Lab.

## Der Fehler war meine Messmethode, nicht die Umsetzung

Lab und App im **identischen** Rendering gegenübergestellt (`diff-lab-app.js`,
gleicher Browser, gleicher Viewport, gleiche Skalierung): die berechneten Stile
aller drei Ebenen stimmen überein, die Hero-Ausschnitte sind deckungsgleich
(`D-lab-hero.png` / `D-app-hero.png`). Der Nachbau ist also korrekt — nur
rendert der Browser des Users einen anderen Pfad.

Bewiesen mit echtem Edge (`gpu-off.js`): mit abgeschalteter Grafik­beschleunigung
meldet WebGL `SwiftShader`, `detectSoftwareGL()` in `theme.js` liefert `true`,
`html.perf-lite` wird gesetzt, und `glass.css:746` nullt mit `!important` **jeden**
`backdrop-filter` — auch den Inline-Style des Glas-Backings. Ergebnis
(`G-gpuoff-full.png`) ist genau sein Bild. Ausgeschlossen: `EnableTransparency`
ist auf 1, die GPU ist eine gesunde Intel mit D3D11-Treiber, und
WebGL-Kontext-Erschöpfung durch viele Tabs kippt die Erkennung nicht
(`webgl-exhaust.js`, 40 Kontexte über 5 Tabs).

Vier konkrete Fehler:

1. **Ich habe in JEDER Messung `perfLite='0'` erzwungen.** Nötig, weil
   Headless-Chromium per SwiftShader rendert — aber damit kam jede Zahl und
   jeder Screenshot aus einem Zustand, den ein Rechner ohne Beschleunigung nie
   erreicht. Den anderen Pfad habe ich nie angesehen.
2. **Das Lab kann diesen Zustand strukturell nicht zeigen**, weil es `theme.js`
   absichtlich nicht lädt und `html.perf-lite` deshalb nie gesetzt wird. Ich
   habe es als „1:1 originaltreu" verkauft; für genau diese Frage war es blind.
3. **Ich habe den deckenden Fallback gelöscht und nur eine seiner zwei
   Aufgaben gezählt.** Der `!important`-Navy-Block war der FOUC *und* der
   Fallback für „kein Blur verfügbar". Ohne ihn stand der Pfad ohne Blur nackt
   da — vorher immerhin lesbare Kacheln, danach ein unsichtbares Loch. Diesen
   Pfad habe ich also verschlechtert.
4. **Ich habe nur das Azubi-Dashboard mit vollen Daten gemessen**, und dort
   liegt der Hero über dem ruhigen Teil der Szene. Beim User ist die
   Mitteilungs-Kachel leer und liegt über dem Baum — dem hellsten, unruhigsten
   Bereich. Eine völlig transparente Fläche hat dort nichts, worauf sie stehen
   kann. Leerzustand und Ausbilder-Variante hatte ich nie geprüft.

## Behoben

**Fallback ohne Blur** (`theme-christmas.css`): die Kachel-Hintergründe hängen
jetzt an `--xm-tile-tint-top/-bot`, standardmäßig `transparent`. Gesetzt werden
sie unter `html.perf-lite` und unter `@supports not (backdrop-filter)` auf
`rgba(11,20,36,0.66)` → `rgba(8,15,28,0.74)`. Bewusst transluzent statt deckend
wie früher: die Szene bleibt sichtbar, nur beruhigt. Scrim und Glaskante bleiben
in beiden Pfaden gleich. Dazu die helle Vendor-Fläche von
`.glass-surface--fallback` (Safari/Firefox) neutralisiert — dort bleibt der
CSS-Frost, nur die SVG-Brechung fehlt.

**Leerzustand:** `.b-mitteilungen__empty` fehlte in der Dark-Spiegelung von
`dashboard.css:2081` (dark/hyperspace/halloween/cmd, Christmas nicht) → stand
als dunkles Grau auf hellem Foto. Jetzt weiß mit Kontur.

**Abnahme beider Pfade** (`verify-both.js`, Mitteilungen künstlich geleert):

| | Glas (perfLite=0) | Ohne Blur (perfLite=1) |
|---|---|---|
| Glas-Backdrop | `blur(2px) url(#…) saturate(1.18)` | `none` |
| Kachel-Hintergrund | transparent | Tönung 0.66 → 0.74 |
| WCAG-Durchfaller | 1 (`.b-hero__kw small`, bekannt) | **keine** |
| JS-Fehler | keine | keine |

**Lab nachgerüstet:** neuer Schalter **„Ohne Blur (perf-lite)"**. Er setzt
`html.perf-lite` — `glass.css` ist im Lab verlinkt, die Klasse wirkt also
identisch zur App (`lab-check.js` bestätigt: Backdrop `none`, Tönung aktiv).
Damit kann das Lab diesen Zustand nicht mehr verschweigen.

## Offene Entscheidung für den User

Sein Rechner läuft im Pfad ohne Blur. Prüfen mit einer Zeile in der
DevTools-Konsole auf dem Dashboard:

```js
document.documentElement.classList.contains('perf-lite')
```

`true` → das echte Glas ist abgeschaltet. Ursache dann fast sicher
`edge://settings/system` → „Grafikbeschleunigung verwenden, wenn verfügbar".
Mit Beschleunigung erscheint das im Lab abgestimmte Glas; ohne bleibt der
Fallback, der jetzt wenigstens als Design gemeint ist.

## Der eigentliche Blocker: perf-lite hat das Glas erschlagen

Nicht das Material, sondern ein globaler Kill-Switch. `glass.css:746` nullt
unter `html.perf-lite` **jeden** `backdrop-filter` mit `!important` — auch den
Inline-Style des Glas-Backings. Das Lab lädt `theme.js` nicht, bekommt die
Klasse also nie und zeigt immer Glas. Genau daran lag die Diskrepanz.

`theme.js` unterscheidet jetzt, WARUM gespart wird, und setzt zusätzlich
`html.perf-lite-gpu`, wenn die Sparfassung allein aus `detectSoftwareGL()`
kommt. Das ist eine Vermutung über Performance, keine Nutzerentscheidung —
der Profil-Schalter `perfLite='1'` und `prefers-reduced-transparency` bekommen
die Zusatzklasse NICHT und bleiben verbindlich.

`theme-christmas.css` holt darunter die volle Kette zurück:

```css
html.perf-lite.perf-lite-gpu[data-theme="christmas"] .pm-xm-glass {
  backdrop-filter: blur(2px) var(--filter-id, ) saturate(1.18) !important;
}
```

`--filter-id` setzt `glass-surface.js` als Inline-Custom-Property auf das
Backing (`url(#glass-filter-N)`); der leere `var()`-Fallback hält die
Deklaration gültig, solange das Bundle noch lädt. Damit steht dieselbe Kette
wie im Lab: Frost, Kantenband-Brechung, Sättigung. Die Tönung greift nur noch
im echten Aus-Fall (`:not(.perf-lite-gpu)`).

Abnahme (`verify-drei.js`), drei Zustände auf der echten Seite:

| Fall | Klassen | Glas-Backdrop | Kachel |
|---|---|---|---|
| auto (Rechner ohne Beschleunigung) | `perf-lite perf-lite-gpu` | `blur(2px) url(#…) saturate(1.18)` | transparent |
| Profil-Schalter `perfLite='1'` | `perf-lite` | `none` | Tönung 0.66 → 0.74 |
| `perfLite='0'` | keine | `blur(2px) url(#…) saturate(1.18)` | transparent |

Pixelvergleich des Hero gegen das Lab: mittlere Abweichung **8.32** im
auto-Fall und **8.33** im Fall ohne perf-lite — identisch. Der Rest ist
Inhalt (Schneeflocken-Phase, Lichterkette, andere Daten im statischen
DOM-Dump), nicht Material. Keine JS-Fehler in allen drei Fällen.

Preis: auf Rechnern ohne Beschleunigung kostet der Blur Bildrate (gemessen
27 statt 61 FPS, damals app-weit über alle Themes). Christmas ist bewusst die
Ausnahme — dort ist das Glas der Punkt. Wer es ruhiger will, hat weiter den
Profil-Schalter.

---

# Warum die Übertragung dreimal danebenging: der Werte-Auszug war unvollständig

Der User schickte zwei Screenshots, App und Lab. Der Vergleich der Regler im
Lab-Panel gegen meine Umsetzung:

| | Lab (Screenshot) | meine Umsetzung |
|---|---|---|
| Scrim-Form | **Halo** (kein Kachelband) | sanft (Band oben/unten) |
| Szene dimmen | **0.20** | 0.00 (fehlte ganz) |
| Glaskante | **0.08** | 0.18 |
| Sättigung | keine | `saturate(1.18)` |

Der Grund ist eine Lücke im Lab selbst: **`labCss` gab `state.shape` nie aus.**
Der kopierbare Auszug nannte Brechung, Blur, Tint, Rim, Scrim, Dim und die drei
Schalter — aber nicht, ob das Textschutz-Band auf der Kachel liegt („sanft")
oder nur ein Halo an der Schrift („Halo"). Genau dieser Schalter macht den
Unterschied zwischen „dunklere Ränder" und „saubere Fläche". Ich habe nach der
gepasteten Liste gebaut, in der er fehlte, und die dunklen Ränder damit
dreimal reproduziert statt entfernt. `rim` und `dim` waren zusätzlich stale
(0.18/0.00 im Text, 0.08/0.20 im Panel).

Behoben: der Auszug führt die Scrim-Form jetzt als **zweite Zeile**, mit
Klartext dahinter („kein Kachelband, nur Text-Halo").

## Übertragen

- **Kein Scrim-Band mehr.** Das `::before` der Kacheln nullt nur noch die
  dekorativen Dark-Vignetten aus `dashboard.css`.
- **Szenen-Dimmung 0.20** als erste Hintergrund-Ebene auf `.pm-xm-bg`
  (`0.036 → 0.110 → 0.200`, nach unten stärker, weil unten heller Schnee ist).
  Sie steckt in derselben Regel wie das Bild, liegt also darüber und bleibt
  trotzdem im Backdrop der Kacheln — der Blur sieht sie mit. Sie ist der
  Grund, warum die feine Glaskante überhaupt trägt.
- **Glaskante 0.08** statt 0.18 (Lab-Formel: oben 1.9×, rundum 1× → 0.152/0.08).
- **Textschutz = Halo an der Schrift**, 1:1 die Lab-Werte; die zweiringige
  Kontur ist raus (maß sich besser, sieht härter aus).
- **`saturate(1.18)` entfernt**, auch `data-saturation` in `theme.js` — das Lab
  setzt keins, die Kette ist `blur(2px) url(#filter)`.

## Abnahme

Lab in genau den Screenshot-Zustand gefahren und Eigenschaft für Eigenschaft
gegen die App verglichen (`match-halo.js`): Kachel-Hintergrund, Rand,
`::before`, Glas-Backdrop, Glas-Schatten, Halo an `.b-recent__head h3`, Halo an
`.b-hero__kw-num`, Szenenträger und Szenen-Hintergrund — **alle zeichengleich**.
Einziger Unterschied ist die laufende Nummer der Filter-ID
(`#glass-filter-35` vs `#glass-filter-2`), also eine Instanz-Zählung, kein Wert.

Pixelvergleich des Hero: mittlere Abweichung **7.81** (vorher 19.88 mit
doppelter Dimmung). Der Rest ist Inhalt — Schneeflocken-Phase, Lichterketten-
Takt und andere Wochendaten im statischen DOM-Dump. Keine JS-Fehler.

---

# Systematische Fehlersuche (27.08.2026): warum Glas fehlte UND was es kostet

Nach vier gescheiterten Anläufen: kein weiterer Fix, sondern Ursachensuche.

## Befund 1 — die Erkennung war falsch, nicht das Material

`detectSoftwareGL()` in `theme.js` enthielt:

```js
if (!gl) return true;   // kein WebGL → mit hoher Wahrscheinlichkeit Software
```

**Damit wurde eine WebGL-Frage benutzt, um eine Compositing-Frage zu
entscheiden.** Das sind verschiedene Subsysteme. Ist WebGL per Richtlinie oder
Treiber-Blockliste abgeschaltet, während die GPU normal kompositiert, setzt die
App `html.perf-lite` und `glass.css` nullt jeden `backdrop-filter` — Glas
app-weit tot, aus Sorge um eine Bildrate, die nie ein Problem war.

Reproduziert mit echtem Edge und `--disable-webgl`; alle vier Beobachtungen
des Users traten gleichzeitig auf: perf-lite AKTIV, Referenz 61 fps, im
Prüfstand echtes Glas, in der App `backdrop-filter: none`.

Fix: `if (!gl) return false`. Hat ein Rechner wirklich keine GPU, liefert
Chromium WebGL über SwiftShader — dann steht es im Renderer-Namen und wird
erkannt. Ein *fehlender* Kontext ist fast immer eine Blockade. Im Zweifel
nicht sparen. Verifiziert über drei Pfade:

| Start | perf-lite | erwartet |
|---|---|---|
| `--disable-webgl` | aus | aus ✓ |
| `--disable-gpu` (echt Software) | an | an ✓ |
| normal | aus | aus ✓ |

Nebenbei korrigiert: der Kommentar behauptete einen „Profil-Schalter" für
`perfLite`. Den gibt es nicht — der Wert wird in der ganzen App nur *gelesen*.

## Befund 2 — die Kantenbrechung kostet 44 fps

Zwölf **abwechselnde** Läufe auf dem echten Dashboard (Abwechseln, damit
langsame Drift sich herausrechnet):

| | fps |
|---|---|
| Glas AN | 14–19, Mittel **16.9** |
| Glas AUS | **61**, jedes Mal |

Isoliert, welcher Teil zahlt:

| Zustand | fps |
|---|---|
| Glas wie heute (Frost + SVG-Brechung) | 14 |
| Szenen-Animation aus | 15 — **kein** Unterschied |
| nur SVG-Brechung, kein Frost | 15 |
| **nur Frost `blur(2px)`** | **61** |
| Glas aus | 61 |

Der Frost ist gratis, die SVG-Brechung ist der ganze Preis — und **nicht**,
weil der Hintergrund animiert.

Die Kosten skalieren mit der **gefilterten Fläche**:

| Fläche | fps |
|---|---|
| 100 % (984 000 px, 4 Kacheln) | 11–17 |
| 25 % | 33 |
| 6 % | 57 |
| 124 000 px (1 kleine Kachel im Prüfstand) | 61 |

**Clippen und Maskieren helfen nicht:** Ring per `clip-path` 13 fps, per
`mask` 14 fps — genau wie volle Fläche. Chromium filtert die ganze Fläche und
schneidet erst danach zu. Nur ein *kleineres Element* senkt die Kosten.

## Zwei eigene Messfehler, die hier dokumentiert bleiben

1. Ein Lauf zeigte „alle Varianten 61 fps". Ursache: mein Zurücksetzen löschte
   den **Inline**-Style des Vendors — `glass-surface.js` setzt die Filterkette
   inline. Damit war die Brechung gar nicht aktiv. Wer den Vendor-Filter
   messen will, darf `el.style.backdropFilter` nicht anfassen.
2. Ein Bildvergleich „Vendor gegen nur Frost" ergab 0 Unterschied. Der
   Ausschnitt lag im Kachel**inneren** — dort wirkt nur der Frost. Das
   Kantenband sitzt in den äußersten Pixeln; ein Vergleich muss die Kante
   treffen.

Und einmal drückte ein hängender Backend-Prozess (`node --watch` in einer
Reload-Schleife) die Bildrate: erst nach dessen Neustart waren die Zahlen
stabil. Vor jeder Perf-Messung prüfen, dass sonst nichts läuft.

## Stand der Entscheidung

Der User hat im Prüfstand geurteilt: **A ist Glas, C ist keins.** C war aber
ein *statisches* Bild — ohne lebenden Blur. Die Variante „lebender
`blur(2px)`, keine Brechung" war nie zu sehen und kostet nichts. Sie steht
jetzt als Kandidat **E** direkt neben A im Prüfstand.

Wenn A und E ununterscheidbar sind, ist die Sache entschieden: 61 statt 17 fps
bei gleichem Look. Wenn nicht, bleibt als Weg zur exakten A-Optik nur, die
Brechung auf schmale Kanten-Streifen zu verkleinern (Fläche ≈ 157 000 px statt
984 000 → nach der Kurve ~50 fps) — mit offener Frage, ob ein Streifen dieselbe
Bandoptik ergibt wie eine ganze Kachel.

---

# Runde 5 (01.09.2026) — der letzte Backdrop Root: der `fill-mode`

Ausgangslage: alles aus Runde 1–4 war umgesetzt und gepusht, das Glas war
trotzdem tot. Screenshot des Christmas-Dashboards vor dieser Runde: die
Kacheln zeigen die Szene **messerscharf**, nur ein Haarlinien-Rand verrät
sie. `html.perf-lite` war aus, `.pm-xm-frost` trug
`backdrop-filter: blur(18px) saturate(1.15)`, `.pm-xm-glass` trug inline
`url(#glass-filter-2)` — die Verdrahtung war vollständig und wirkungslos.

## B-15 · Eine GEFÜLLTE Animation ist selbst ein Backdrop Root

Bisektion mit `backdrop-filter: invert(1)` (sechs Testelemente gleichzeitig,
je eines pro Ebene, ein Screenshot — Bild `BISEKT.png`):

| Wirt | invertiert? |
|---|---|
| `body` | ja |
| `.app-shell` | ja |
| `.main-wrapper` | ja |
| `.main-content` | **nein** |
| `.bento` | nein |
| `.b-hero` | nein |

`view-transition-name`, `transform`, `filter`, `opacity`, `isolation`,
`mix-blend-mode`, `mask`, `clip-path`, `contain`, `will-change`,
`content-visibility`, `container-type`, `perspective` — auf `#mainContent`
alles auf Default. Die einzige Auffälligkeit im Computed Style:

```
animationName: "fadeIn"
```

`layout.css` (damals Z. 676): `.main-content { animation: fadeIn var(--t-normal) both; }`

**Der `fill-mode: both` ist das Problem, nicht das Keyframe.** Runde 1 hat aus
`fadeIn` und `vt-in` den `transform` entfernt und damit die *eine* Hälfte
behoben. Die andere Hälfte: eine Animation mit `both` (oder `forwards`) bleibt
nach ihrem Ende **dauerhaft am Element angewandt** — `getAnimations().length`
ist 1, nicht 0. Chromium hält das Element deshalb weiter als eigene
Compositing-Ebene und damit als Backdrop Root, **obwohl der Endwert
`opacity: 1`** ist. Das Glas war also nicht 220 ms tot, sondern für immer.

Drei Stellen im Glas-Pfad hatten `both`:

| Stelle | Selektor | wirkt auf |
|---|---|---|
| `layout.css:676` | `.main-content` | jede Seite, immer |
| `base.css:219` | `.animate-fade-in` | die Dashboard-Kacheln selbst (`dashboard.js`) |
| `base.css:281` | `[data-page-enter] .main-wrapper` | nach jeder Navigation; `theme.js:1926` setzt das Attribut und nimmt es nie zurück |

**Jede der ersten beiden killt das Glas allein.** Gegengemessen mit echten
Dateiänderungen und je einem Ladevorgang (Bilder `X-nur-mainContent-both`,
`Y-nur-kachel-both`): beide zeigen die scharfe Szene. Es waren also zwei
unabhängige Roots, nicht einer.

**Behebung:** `both` → `backwards` an allen drei Stellen. `backwards` füllt nur
die Phase *vor* dem Lauf; ohne `animation-delay` ist die null lang, der
Ruhewert bleibt `opacity: 1` (Default), und nach dem Lauf räumt der Browser
die Animation weg (`getAnimations()` = leer). Die Einblendung selbst bleibt
unverändert. Preis: während der 220 ms bzw. 300 ms ist das Glas flach — die
Kachel blendet in dieser Zeit ohnehin von `opacity: 0` auf, deshalb sichtbar
nur als Nachschärfen am Ende. Ein Root während der Animation ist bei einer
Opacity-Einblendung physikalisch nicht vermeidbar.

### Zwei Messfallen dieser Runde

1. **`fill-mode` zur Laufzeit umschalten reproduziert den Fehler nicht.** Per
   Stylesheet `animation-fill-mode: both !important` nachträglich zu setzen
   ergibt zwar `getAnimations().length === 1`, aber das Glas bleibt sichtbar.
   Die Compositing-Entscheidung fällt beim Laden. Wer diesen Fehler messen
   will, muss die Datei ändern und neu laden.
2. **Ein Testelement mit `position: fixed` löst seinen Backdrop anders auf**
   als der echte, absolut positionierte Frost: es rutscht an einem Root im
   Vorfahrenpfad vorbei. Umgekehrt meldete ein absolut positioniertes
   Testelement mit `z-index: 9999` „wirkt", während der Frost bei `z-index: 0`
   in derselben Kachel tot war. **Ground Truth ist das Bild der Kachel, nicht
   die Sonde.** Der Wächter unten prüft deshalb per Bildvergleich.

## B-16 · Kosten, erstmals mit wirksamem Glas gemessen

Drei abwechselnde Läufe, je 3 s rAF-Zählung, Christmas-Dashboard,
1920×1030, Edge headless, Szene animiert (Schnee + Lichterkette):

| Zustand | fps | Mittel |
|---|---|---|
| **A** — Frost `blur(18px)` + SVG-Kantenband | 12.5 / 11.9 / 10.8 | **11.7** |
| **E** — nur Frost, keine Brechung | 99.7 / 99.9 / 99.1 | **99.6** |
| ohne Glas | 99.8 / 99.7 / 99.7 | 99.7 |

Das bestätigt Runde 4 (dort 16.9 gegen 61) mit größerem Abstand: **der Frost
ist gratis, die SVG-Brechung kostet den gesamten Puffer.** Der Unterschied
E ↔ „ohne Glas" liegt im Rauschen.

## B-17 · A gegen E — jetzt zum ersten Mal in der echten App vergleichbar

Verglichen an der linken oberen Ecke von `.b-recent`, 3× Bildskalierung,
Schnee aus, Lichterkette angehalten (`AE-A-ecke.png`, `AE-E-ecke.png`):

* **A** zieht das warme Hüttenlicht der Szene als gebogenes Band um die
  Rundung. Die Kante liest sich als Materialstärke — eine Scheibe mit Fase.
* **E** hat an derselben Stelle eine gleichmäßige Frostfläche plus die
  1-px-Glaskante. Ruhiger, flacher, kein Bandlicht.

Der Unterschied ist real und liegt genau in den äußeren ~3 px
(`data-border 0.018` → `min(w,h)·0.009`). Im Kachelinneren sind A und E
identisch. **Entscheidung liegt beim User** — 11.7 gegen 99.6 fps für ein
3-px-Band. Der Weg zu A-Optik bei brauchbarer Bildrate bleibt der aus
Runde 4: die Brechung auf schmale Kanten-*Elemente* verkleinern (nicht
clippen, das hilft nicht). Das ist keine Parameteränderung, sondern ein
Umbau der Map-Erzeugung im Vendor.

## Nebenbefund · Doppelfilter im Safari/Firefox-Fallback

`glass-surface.css:39-45` gibt `.glass-surface--fallback` ein eigenes
`backdrop-filter: blur(12px) saturate(1.8) brightness(1.2)`. Der
Christmas-Override neutralisierte nur `background` und `border` — der
Vendor-Blur kam also **zusätzlich** zum 18-px-Frost darunter. In Safari und
Firefox war die Kachel damit heller und milchiger als gemeint. Jetzt auf
`backdrop-filter: none !important` gesetzt; der Frost trägt allein, nur die
Brechung fehlt dort weiterhin (kein SVG im `backdrop-filter`).

## Wächter · `tools/check-glas-backdrop.mjs`

Der Fehler ist im Code-Review unsichtbar (drei Runden Prosa-Kommentare haben
ihn nicht verhindert) und im Bild eindeutig. Deshalb jetzt ein Check mit drei
Aussagen:

1. **Verdrahtung** — jede der vier Kacheln hat `.pm-xm-frost` mit `blur(...)`
   und `.pm-xm-glass` mit `url(...)`.
2. **Kein Backdrop Root im Vorfahrenpfad** — `filter`, `opacity < 1`,
   `isolation`, `mix-blend-mode`, `transform`, `mask`, `will-change` **und
   `getAnimations().length > 0`** (genau das fängt diese Runde).
3. **Wirkungsnachweis** — dieselbe Kachel zweimal aufgenommen, einmal mit und
   einmal mit per Stylesheet abgeschaltetem Glas; die mittlere Pixelabweichung
   muss > 3 sein. Gemessen: **8.97** mit Fix, **0.01** mit zurückgebautem
   Fehler. Nicht am Inline-Style des Vendors drehen (Messfehler aus Runde 4).

Beide Richtungen geprüft: grün mit dem Fix, rot mit jeder der beiden
zurückgebauten Stellen.

## Abnahme

* Christmas-Dashboard: echtes Milchglas, Szene weichgezeichnet, Hüttenlicht
  und Baumfarben scheinen durch, Glaskante sichtbar.
* Nach interner Navigation (Dashboard → Wochenansicht → Dashboard) ist das
  Glas weiter aktiv, `[data-page-enter]` hinterlässt keine haftende Animation
  mehr.
* Regressions-Sweep über 15 Theme/Seiten-Kombinationen (christmas, silk,
  light, dark, papier, candy, cmd, halloween × dashboard/wochenansicht/
  jahresansicht/profil): keine JS-Fehler. Vorher/Nachher-Paare derselben
  Seiten geprüft — die Flächen-Deckkraft ändert sich nicht, nur die Schärfe
  dahinter, Lesbarkeit dadurch eher besser. Die Befunde des Sweeps
  (abgeschnittener vierter Mitteilungs-Eintrag in light/dark/silk/papier,
  „SEP" auf dunklem Hero, fehlendes Papierheft-Thumbnail, Spaltenköpfe
  „Anwesenheit/Ort/ArbZ" ohne Träger) stehen in beiden Zuständen gleich und
  sind **nicht** Folge dieser Änderung.

## Stand

Das Glas ist in der App wirksam — app-weit, in jedem Theme, nicht nur bei
Christmas. Offen bleibt allein die Wahl **A oder E** (11.7 gegen 99.6 fps).

---

# Runde 6 (01.09.2026) — Material zurück auf den Prüfstand-Stand

Ansage des Users nach Runde 5: **kein Milchglas, kein Ersatzmaterial.** Das
Glas ist im Prüfstand definiert, die Panels der App sollen genau dieses Glas
tragen; das Bisherige wird verworfen. Performance ist dabei zunächst
ausdrücklich irrelevant.

Damit fällt die Sonderfassung, die in Runde 2 aus „mit 2 px ist die Kachel
unsichtbar" entstanden war: eine eigene CSS-Frost-Ebene mit `blur(18px)
saturate(1.15)` unter der Brechung. Diese Diagnose ist im Rückblick auch nicht
haltbar — sie wurde gestellt, als **kein** `backdrop-filter` in der App wirkte
(B-15). Mit totem Backdrop sieht `blur(2px)` genauso aus wie `blur(18px)`:
nach nichts.

## Was getauscht wurde

| | vorher (Runde 2–5) | jetzt = Prüfstand Kandidat A |
|---|---|---|
| Ebenen pro Kachel | 2 (`.pm-xm-frost` CSS + `.pm-xm-glass` Vendor) | **1** (`.pm-xm-glass`) |
| Filterkette | `blur(18px) saturate(1.15)` **und** `url(#glass-filter-N)` | **`blur(2px) url(#glass-filter-N)`** — eine Deklaration |
| `data-frostblur` | nicht gesetzt (Frost lag im CSS) | **2** |
| `saturate` | 1.15 auf dem Frost | **keins** |
| Glaskante (Rim) | 0.14 → `0.266 / 0.14` | **0.08** → `0.152 / 0.08` |
| Tint | keiner | keiner |
| Brechung | distortion −105, border 0.018, map-blur 6, displace 0.3 | unverändert |
| Szenen-Dimmung | 0.20 | unverändert |
| Textschutz | Halo | unverändert |
| Safari/Firefox-Fallback | `backdrop-filter: none` (Frost kam aus CSS) | **`blur(2px)`** — der Prüfstand-Frost ohne die SVG-Stufe |

Geänderte Dateien: `app/js/theme.js` (`PMChristmasGlass.addBacking` legt keine
Frost-Ebene mehr an, setzt `data-frostblur="2"`), `app/css/theme-christmas.css`
(`.pm-xm-frost`-Regel entfernt, Rim auf 0.08, Fallback-Filter, Inhalts-Selektor
ohne `:not(.pm-xm-frost)`).

## Nachweis: identisch, nicht nur ähnlich

Gemessen an derselben Stelle in beiden Dokumenten:

| | Prüfstand `#glasA` | App `.b-recent .pm-xm-glass` |
|---|---|---|
| `backdrop-filter` (inline) | `blur(2px) url("#glass-filter-1")` | `blur(2px) url("#glass-filter-4")` |
| `box-shadow` | `rgba(255,255,255,.152) 0 1px 0 inset, rgba(255,255,255,.08) 0 0 0 1px inset, rgba(0,0,0,.28) 0 -1px 0 inset, rgba(0,0,0,.55) 0 18px 48px -14px` | identisch |

Eckvergleich bei 3× Bildskalierung (`PS-A-ecke.png` gegen `APP-A-ecke.png`):
beide zeigen dasselbe Material — das Szenenlicht wird an der Rundung als Band
mitgezogen, darüber der feine helle Rim, das Kachelinnere praktisch klar.
Restunterschied ist rein geometrisch: die Bandbreite ist `min(w,h)·0.009`,
also 1.9 px auf der 591×210-Prüfstandkachel und 2.2–3.4 px auf den echten
Kacheln.

## Die Kosten sind echt, nicht ein Headless-Artefakt

Runde 5 hatte headless gemessen. Nachgemessen im **echten Browserfenster**
(Edge, GPU: `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11)`), drei
abwechselnde Läufe à 3 s:

| Zustand | fps | Mittel |
|---|---|---|
| A — `blur(2px) url(#…)` | 15.2 / 27.3 / 15.5 | **19.3** |
| E — nur `blur(2px)` | 97.1 / 98.0 / 99.8 | **98.3** |
| ohne Glas | 79.1 / 99.7 / 99.7 | 92.8 |
| A, Schnee ausgeblendet | 24.3 / 14.7 / 15.2 | **18.1** |

Zwei Dinge stehen damit fest: die Bildrate bricht **nicht** wegen der
animierten Szene ein (A ohne Schnee ist genauso langsam), und headless hat
nicht gelogen. Der Preis liegt in der SVG-Kette selbst — vier Elemente ×
(`feImage`-Map + 3× `feDisplacementMap` + 3× `feColorMatrix` + 2× `feBlend` +
`feGaussianBlur`) über zusammen ~1 Mio. Pixel, neu gerechnet bei jeder
Backdrop-Invalidierung. Nächster Ansatzpunkt, falls die Bildrate doch stört:
die Map als vorgerendertes Bitmap statt `feImage` auf eine data-URI-SVG, oder
die Brechung auf schmale Kanten-Elemente verkleinern (Fläche, nicht Clip).

## Reichweite: die vier Dashboard-Panels

Das Prüfstand-Material sitzt auf `.welcome-hero`, `.b-hero`,
`.b-mitteilungen`, `.b-recent`. Diese Kacheln sind dafür gebaut: ihr Inhalt
liegt auf eigenen deckenden Flächen (`.b-wkcard`, `.b-day`, `.b-mitteilung`)
und die Labels tragen Halos.

**Probe auf die übrigen Panels** (`.card`, `.profil-section`,
`.verwaltung-panel`, `.week-toolbar`) mit demselben Material, zur Laufzeit
aufgesetzt (`PROBE-profil.png`, `PROBE-wochenansicht.png`): dort löst das
klare Glas die Beschriftung auf — „EINGABEHILFEN", „AUSBILDUNGSBEGINN" und die
Erklärzeilen verschwinden im hellen Bildteil. Diese Seiten behalten deshalb
vorerst die getönte Fassung (`rgba(20,30,50,0.84)` + `blur(14px)`). Sie auf
das Prüfstand-Material zu heben ist kein CSS-Tausch, sondern verlangt
dasselbe Inhalts-Rezept wie das Dashboard: deckende Flächen unter dem Text
plus Halos. Offene Entscheidung.

Ebenfalls unverändert: `.b-azubi` auf dem Ausbilder-Dashboard bleibt mattes
Material (eine Karte pro Azubi = N Filter), und die Ausbilder-Panels
(`.review-inbox`, `.card--mitteilungen`) bleiben deckend.

## Wächter angepasst

`tools/check-glas-backdrop.mjs` prüft jetzt statt „Frost-Ebene + Brechung"
die eine Kette: `/^blur\(2px\)\s+url\(/` auf `.pm-xm-glass` jeder Kachel.
Backdrop-Root-Prüfung und Bildvergleich unverändert; grün (Abweichung 6.89).

---

# Runde 7 (01.09.2026) — die Map ist der Preis, nicht die Brechung

Auftrag: das Material aus Runde 6 behalten, die Kosten senken. Ergebnis:
**14,5 → 48,5 fps** bei unveränderter Optik, durch eine Änderung an einer
einzigen Stelle im Vendor.

## B-18 · Warum die Kette so teuer ist

Chromium wertet einen `backdrop-filter` **pro gezeichnetem Frame** aus, nicht
pro Backdrop-Änderung: `skia_renderer.cc` macht ein
`saveLayer(ScaledBackdropLayer(...))`, das Ergebnis lebt nur zwischen
`saveLayer` und `restore` — **es gibt keinen persistenten Cache**. Dazu kommt:
`cc/paint/filter_operations.cc` `HasFilterThatMovesPixels()` liefert für
REFERENCE-Filter (also jedes `url(#…)`) true, und der Damage-Tracker bläht die
Damage dann auf den ganzen Pass auf.

Gegengemessen, und es widerlegt die naheliegende Vermutung „die Deko ist
schuld":

| | fps |
|---|---|
| Schnee aus | 14,3 |
| Laternen + Birnen aus (samt Kindern) | ~13 |
| Hero-Blink aus | 12,6 |
| alle drei zusammen aus | 12,8 |
| **jede Animation der Seite eingefroren** | **99,8** |

Keine einzelne Animation ist der Auslöser. Jeder produzierte Frame kostet den
vollen Preis, egal wer ihn auslöst — Sidebar-Lichterkette, Geschenk-Avatar,
Musik-Button, Hover, Scrollen. Das Theme hat 17 Dauer-Animationen, die Seite
ist also praktisch immer im teuren Zustand.

Der teure Teil der Kette ist die **Verschiebungs-Map**. `feImage` mit einer
`data:image/svg+xml`-URL ist in Blink ein *Paint-Record*
(`svg_image.cc` → `PopulatePaintRecordForCurrentFrameForContainer`), keine
dekodierte Bitmap — die Grafik wird bei jeder Auswertung neu rasterisiert,
**samt des `filter:blur(6px)`, das in der Map steckt**, und die Kette benutzt
die Map dreimal.

## B-19 · Es ist die Texturgröße, nicht das Format

Erste Vermutung war „PNG statt SVG". Falsch. Abwechselnd in EINER Seite
gemessen (siehe B-20), `.b-recent` + drei weitere Kacheln:

| Map | fps |
|---|---|
| SVG-data-URI (wie bisher) | 14,8 |
| Bitmap in voller Auflösung | **15,5 — kein Gewinn** |
| Bitmap 1/2 | 50,0 |
| Bitmap 1/4 | 70–99 |

Gegenprobe ohne Canvas: die Map-SVG mit kleiner *Eigengröße*
(`width`/`height` bei gleichem `viewBox`) bringt nichts — 14,5 / 12,8 / 13,5 /
13,6 fps für Skalen 1 / ½ / ¼ / ⅛. Blink rastert eine SVG immer in
Zielauflösung. Eine kleinere Textur bekommt man nur über den Canvas.

**Optik gegen die SVG-Map, im selben Seitenaufbau gemessen** (Kachelinneres
und 16-px-Randzone getrennt, weil ein Ganz-Kachel-Mittel den schmalen
Bandfehler um Faktor 12 verdünnt):

| Map | innen | Randzone | Sichtprüfung bei 5× |
|---|---|---|---|
| 1/2 | 0,13 (max 23) | 1,47 (max 42) | **nicht zu unterscheiden** |
| 1/4 | 0,16 (max 35) | 2,80 (max 76) | linkes Kantenband sichtbar weicher |

Gesetzt: **1/2**, als `MAP_SCALE` in `app/js/vendor/glass-surface.js`.
`{ alpha: false }` am Canvas-Kontext und ein zweistufiges Verkleinern
(erst voll rastern, dann skalieren) ändern nichts bzw. verschlechtern die
Randzone — beide geprüft und verworfen.

## B-20 · Messfalle, die drei Zwischenergebnisse ruiniert hat

**fps über getrennte Seitenaufbauten zu vergleichen ist wertlos.** Derselbe
unveränderte Stand lieferte in einem Lauf 15,3 und zwanzig Minuten später
74,2 fps. Alle Zwischenergebnisse dieser Runde, die auf solchen Vergleichen
beruhten, waren falsch — unter anderem die zuerst gemeldeten „51 fps durch
PNG-Map".

Richtig ist nur: **eine Seite laden, alle Varianten vorbereiten, dann
abwechselnd das `href` umschalten und je 2,5 s messen.** Damit liegt die
Streuung bei ±0,2 fps (Endabnahme: alt 14,4/14,5/14,6/14,5/14,5 gegen neu
48,5/48,3/48,5/48,7/47,9).

Für den Bildvergleich gilt dasselbe: Aufnahmen aus verschiedenen Läufen
desselben Codes sind zwar byte-identisch (Rauschboden exakt 0, dreimal
geprüft), aber ein Vergleich *alter Code gegen neuer Code* über getrennte
Läufe zeigte 2,2/255 im Kachelinneren, während derselbe Vergleich innerhalb
einer Seite 0,13 ergibt. Im Zweifel: alles in einer Seite.

## Geändert

**`app/js/vendor/glass-surface.js`**
* `dmapBitmap()` — rastert die Map einmal in ein Canvas (Zielgröße
  = Kachelgröße × devicePixelRatio × `MAP_SCALE`) und liefert eine
  PNG-data-URI. Cache über Größe + Parameter, die vier Kacheln teilen sich
  gleiche Einträge. Fällt der Canvas aus (gesperrt o. ä.), bleibt die SVG-Map
  stehen.
* `MAP_SCALE = 0.5` mit den Messwerten im Kommentar.
* `refresh()` — **Größen-Guard**: gleiche gerundete Größe und gleiches DPR
  ⇒ kein Neubau. Vorher baute jeder ResizeObserver-Callback die Map neu
  (Font-Load, Scrollbar, Sidebar-Animation, Subpixel), beim Fenster-Resize
  einmal pro Frame und Kachel. Fängt nebenbei den Doppelbau beim Start ab und
  das 0×0-Feuern beim Ausbau (`dmap(0,0)` erzeugte negative Rechteckbreiten).
* Zweistufiges Setzen: erst die SVG-Map (gilt sofort), dann der Tausch gegen
  die Bitmap. Ohne den Zwischenschritt rechnet der Filter bis zum Bild-Decode
  mit einer leeren Map und verschiebt die ganze Fläche um ~52 px.
* `el.__glassOff()` — Abbau-Haken für ResizeObserver und IntersectionObserver.

**`app/js/theme.js`** — `PMChristmasGlass.stop()` ruft `__glassOff()`, bevor es
das Backing entfernt. Vorher leakten pro SPA-Navigation und pro Theme-Wechsel
vier ResizeObserver und vier IntersectionObserver.

## Abnahme

* Endabnahme abwechselnd in einer Seite: **14,5 → 48,5 fps** (Median aus je
  fünf Messungen, Streuung ±0,2).
* Optik: Kachelinneres 0,13/255, Randzone 1,47/255, bei 5× Zoom keine
  Unterschiede in der Bandstruktur an der Kante.
* Map-Größen zur Kontrolle: DPR 1 → 788×80 … 788×124 (18–27 kB je Kachel),
  DPR 2 → 1576×160 … 1576×248 (52–84 kB).
* `tools/check-glas-backdrop.mjs` grün.

## Was geprüft und verworfen wurde

* **Deko-Animationen abschalten** — bringt nichts (siehe B-18).
* **SVG-Map mit kleiner Eigengröße** — bringt nichts (B-19).
* **Bitmap in voller Auflösung** — bringt nichts, kostet aber Optik.
* **Map 1/4** — 70–99 fps, aber das Kantenband wird sichtbar weicher.
* **`clip-path` / `mask` zur Flächenreduktion** — schon in Runde 4 widerlegt.
* **`will-change`, `contain: paint`, `translateZ(0)`** — kein Gewinn, und
  `will-change` auf filter/opacity/mask/mix-blend-mode bei einem Vorfahren
  verschiebt den Backdrop-Root und tötet das Glas.
* **Nur das Kantenband brechen** — nicht optikneutral: das Neutralisier-Rechteck
  der Map hat Alpha 0,93, das Kachelinnere ist also um bis zu ±3,7 px
  mitverschoben. Zweimal unabhängig nachgemessen (Innenflächen-Abweichung
  4,44 gegen 0,47).

## Offen

Wenn 48 fps nicht reicht, sind die nächsten Stufen: Chromatik von drei
Displacement-Pässen auf einen (mit Map-Bitmap zusammen ~95 fps, ändert den
Farbsaum an der Kante — Entscheidung des Users), oder `filter` auf einer
Szenen-Kopie statt `backdrop-filter` (~100 fps, friert Schnee und
Laternen-Flackern hinter dem Glas ein).


---

# Runde 8 (01.09.2026) — jede Blende ist ein Backdrop Root

Befund des Users: beim Wechsel von einer anderen Seite aufs Dashboard stehen
die Panels zuerst ganz transparent da, das Glas poppt erst kurz danach hinein.

Ursache sind DREI unabhaengige Stellen, nicht eine. Alle drei nach demselben
Muster wie B-14: eine laufende opacity-Animation macht das Element zum Backdrop
Root, und die Christmas-Szene (`#pmThemeFX`) liegt als Geschwister der
`.app-shell` AUSSERHALB davon — das Glas darunter sieht dann nur seine eigene
leere Flaeche.

| # | Stelle | Dauer tot |
|---|---|---|
| 1 | `router.js` setzt bei jeder SPA-Navigation `wrapper.style.animation = 'vt-in 300ms … both'` — inline, an `.main-wrapper` | 300 ms |
| 2 | `.main-content { animation: fadeIn }` und `[data-page-enter] .main-wrapper` — der Full-Load-Weg | 220 / 300 ms |
| 3 | **die Kachel selbst**: die vier Panels tragen `.animate-fade-in` (`opacity 0 -> 1`, 220 ms) | 220 ms |

Nummer 3 ist die dominante: sie feuert bei JEDEM Render, auch ohne Navigation.
In Runde 5 war nur die CSS-Seite von 1 und 2 auf `backwards` gestellt worden —
das hat die DAUERHAFT haftende Animation beseitigt, nicht aber die Zeit, in der
sie laeuft.

Dazu kam eine vierte, harmlosere Luecke: der MutationObserver in
`PMChristmasGlass` haengte die Glasebene mit 90 ms Debounce an, der bei jeder
weiteren Mutation neu startete. Gemessen: Karten bei 3600 ms, Glas erst bei
3866 ms — **266 ms nackte Panels**.

## Behoben

* **`app/js/router.js`** — `const fxSzene = !!document.getElementById('pmThemeFX')`;
  Exit- und Enter-Blende laufen nur noch ohne FX-Szene. Betrifft die vier
  Themes mit Vollbild-Szene (cmd, candy, halloween, christmas); silk und papier
  haben kein `#pmThemeFX` und behalten die Blende unveraendert (gegengemessen:
  26 Frames mit laufender Wrapper-Animation im Standard-Theme, 0 in Christmas).
* **`app/css/base.css`** — `body:has(#pmThemeFX) .main-wrapper, … .main-content
  { animation: none }` fuer den Full-Load-Weg, gleiche Bedingung.
* **`app/css/theme-christmas.css`** — die Kachel-Blende wandert vom Panel auf
  seinen Inhalt: `.pm-xm-glass-card { animation: none }` +
  `.pm-xm-glass-card > * { animation: fadeIn var(--t-normal) backwards }`.
  Die Kachel selbst ist unter Christmas ohnehin unsichtbar (transparent, kein
  Rand, kein Schatten), die Blende sieht also identisch aus — nur laeuft sie
  jetzt auf der Glasebene MIT, statt sie abzuschalten.
* **`app/js/theme.js`** — Observer-Debounce 90 ms -> rAF-Vorderflanke. Der
  Callback laeuft noch vor dem Paint des Frames, in dem die Karten landen.

## Warum die Blende auf der Glasebene selbst funktioniert

Die eigene `opacity` eines Elements wird NACH seinem `backdrop-filter`
angewendet — sie schaltet ihn nicht ab, sie komponiert das Ergebnis. Gemessen
an `.b-recent` (mittlere Abweichung gegen dieselbe Kachel ohne Filter):

| Zustand | Beitrag des Glases |
|---|---|
| Glas bei `opacity: 1` | 6,92 Stufen |
| Glas bei `opacity: 0.5` | 3,46 Stufen |

Exakt die Haelfte — also eine echte Ueberblendung vom rohen Foto aufs Glas,
kein Abschalten. Ein Vorfahr mit `opacity < 1` tut genau das Gegenteil.

## Abnahme

* Zeitstrahl ueber eine echte SPA-Navigation, pro Frame Karte/Glas/Vorfahren-
  Walk: **0 Frames mit einem Backdrop Root im Vorfahrenpfad** (vorher 14),
  Glas steht einen Frame nach den Karten (vorher 266 ms).
* Keine der vier Kacheln hat animierte Nachfahren — das `> *` ueberschreibt
  also keine fremde Animation (im Browser gegengeprueft).
* SPA-Navigation in Christmas und im Standard-Theme fehlerfrei, Blende im
  Standard-Theme unveraendert.
* `tools/check-glas-backdrop.mjs` gruen.


---

# Nachtrag 01.09.2026 — Frost 2 -> 3

Der User: das Foto lenkt durch die Kachel zu stark ab. Im Lab nachgestellt und
auf **3 px** gesetzt (`data-frostblur` in `app/js/theme.js`, dazu der
Fallback-Frost in `theme-christmas.css`). Damit weicht das Material erstmals
vom Pruefstand-Kandidaten A ab; alles andere (Brechung -105, Border 0.018,
Map-Blur 6, Glaskante 0.08, Szenen-Dimmung 0.20, kein saturate) bleibt.

`tools/check-glas-backdrop.mjs` liest den Sollwert jetzt aus `theme.js`, statt
ihn zweitzupflegen — er ist schon zweimal gewandert.

**Das Lab dafuer ist neu** (`mockups/christmas-glass-lab.html`, Fassung 2): kein
DOM-Dump mehr, sondern die echte Seite im iframe plus ein injiziertes
Stylesheet. Regler fuer Frost, Toenung, Saettigung, Kontrast, Glaskante,
Szenen-Dimmung und die Foto-Filter; die Reglerwerte laufen ueber `!important`,
weil der IntersectionObserver im Vendor die inline `backdrop-filter` sonst
zurueckschreibt.
