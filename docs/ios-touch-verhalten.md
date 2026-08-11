# iOS und Touchgeräte — was hier anders funktioniert

**Stand:** 2026-08-11. Anlass: Die technischen Azubis bekommen 11″-iPads.
Beim Test dort traten vier Fehler auf, die am Desktop **nicht reproduzierbar**
sind. Dieses Dokument hält fest, warum die Lösungen so aussehen, wie sie
aussehen — damit sie nicht versehentlich zurückgebaut werden.

## Die wichtigste Regel: es gibt zwei Scroll-Modelle

| Umgebung | Was scrollt |
|---|---|
| Desktop (Mauszeiger) | das Dokument |
| Touchgeräte (`hover: none` und `pointer: coarse`) | `.main-wrapper` |

Festgelegt in [app/css/layout.css](../app/css/layout.css) im Block
`@media (hover: none) and (pointer: coarse)`: `html` und `body` stehen dort auf
Fensterhöhe mit `overflow: hidden`, der `.main-wrapper` bekommt `overflow-y: auto`.

**Wer eine Scrollposition liest oder setzt, muss `scrollHost()` aus
[app/js/app.js](../app/js/app.js) fragen.** Die Funktion liefert den
Scroll-Container oder `null`, wenn das Dokument scrollt. `window.scrollY` und
`window.scrollTo` allein sind auf Touchgeräten wirkungslos — und zwar
stillschweigend, ohne Fehler.

Bereits angepasst: der Topbar-Schatten (`app.js`) und das Zurücksetzen beim
Seitenwechsel (`router.js`). `scrollHost()` erkennt das Modell am berechneten
`overflow-y`, nicht an einer Geräteabfrage — die CSS-Regel bleibt damit die
einzige Wahrheit.

### Warum überhaupt

WebKit auf iOS zeichnet `position: fixed`-Elemente **während** einer
Scrollgeste nicht laufend neu, sondern erst wenn die Geste endet. Alles
Fixierte wandert dadurch sichtbar mit und springt zurück: die Sidebar-Pille
ebenso wie die Hintergrund-Ebene. Mit CSS ist dem nicht beizukommen, solange
das Dokument selbst scrollt. Erst ein nicht scrollendes Dokument nimmt dem
Effekt die Grundlage.

Erwünschter Nebeneffekt: Die iOS-Browserleisten fahren nicht mehr ein und aus.
Die Fensterhöhe bleibt konstant, was alle Höhenangaben beruhigt.

## Die untere Safe Area

Alle Seiten setzen `viewport-fit=cover`. Das ist Absicht — nur so zieht der
Hintergrund bis an die Bildschirmkante. Es bedeutet aber: **Der Seiteninhalt
läuft bis unter den Home-Indikator.**

Zwei Konsequenzen, beide bereits umgesetzt:

1. **Sichtbare Elemente müssen wieder herausgeholt werden.** Die Sidebar-Pille
   zieht `env(safe-area-inset-bottom)` von ihrer Höhe ab
   ([glass.css](../app/css/glass.css), Touch-Block), der scrollende
   `.main-wrapper` trägt es als `padding-bottom`. Ohne das wird die Pille unten
   angeschnitten und der letzte Listeneintrag verschwindet unter dem Indikator.
2. **Die Fläche selbst ist nicht bemalbar.** iOS füllt den Streifen
   (gemessen **25 CSS-Pixel**) mit der `background-color` des Body. Dorthin
   reicht **kein** Element — weder `background-attachment: fixed` noch eine
   `position: fixed`-Ebene. Steuerbar ist ausschließlich die Farbe.

### Deshalb `--app-bg-base`

Steht die Body-Grundfarbe zu weit vom Hintergrundbild ab, erscheint dort ein
sichtbarer heller Balken. Genau das war der Fall: `--pm-grey-50` = `#F7F7F7`
gegen eine Bildunterkante um `#E9E6E2`.

Der Token `--app-bg-base` ([glass.css](../app/css/glass.css)) ist **nur im
hellen Theme** gesetzt; [base.css](../app/css/base.css) nutzt ihn mit Rückfall
auf `--pm-grey-50`. Alle anderen Themes definieren `--pm-grey-50` ohnehin als
ihre eigene Body-Grundfarbe und bleiben damit unverändert.

**Wird das Hintergrundbild eines Themes getauscht, muss `--app-bg-base`
mitgezogen werden.** Ein erster Entwurf setzte den Token im `:root`-Block und
färbte dadurch auch Dark und CMD hell — aufgefallen nur, weil die Farbe pro
Theme ausgelesen statt angenommen wurde.

## Der Hintergrund liegt auf einer eigenen Ebene

`html::before` in [glass.css](../app/css/glass.css) malt die drei
Hintergrund-Ebenen als echtes `position: fixed`-Element. Grund:
`background-attachment: fixed` ist auf iOS seit jeher fehlerhaft, ein
fixiertes *Element* dagegen korrekt.

- Die Ebene liegt am Wurzelelement, damit sie **hinter** den Ambient-Lichtern
  (`body::before`/`::after`, `z-index: 0`) und hinter dem Inhalt
  (`.app-shell`, `z-index: 1`) sitzt und deren Wirkung nicht überdeckt.
- Sie nutzt dieselben Variablen wie die Body-Regel und folgt damit jedem Theme
  automatisch — kein Theme überschreibt die Regel selbst, alle setzen nur
  `--app-bg-image` und Geschwister.
- Die Login-Seite schaltet sie in [login.css](../app/css/login.css) wieder ab
  (dort nach `glass.css` geladen). Bewusst ohne `:has()` — eine tragende Regel
  soll nicht an der Unterstützung eines Selektors hängen.

## Breite ist nicht gleich Touch

Ein iPad ist **834 px** im Hoch- und **1194 px** im Querformat. Jede Regel, die
„Mobilgerät" über `max-width: 768px` definiert, verfehlt es. Das ist hier
zweimal passiert: bei der Stapel-Regel im Dashboard-Hero (jetzt 900 px) und
beim Hintergrund-Fallback.

Meint eine Regel wirklich *Touch* und nicht *schmal*, ist der Zeigertyp die
richtige Bedingung: `@media (hover: none) and (pointer: coarse)`.

## Viewport-Einheiten

| Einheit | Bedeutung auf iOS | wofür hier |
|---|---|---|
| `vh` | Höhe mit **eingeklappten** Leisten — größer als sichtbar | nur als Rückfall |
| `dvh` | folgt dem aktuellen Zustand, ändert sich **während** der Geste | Seitenhöhe (`.app-shell`, `.main-wrapper`) |
| `svh` | Höhe mit **ausgefahrenen** Leisten, konstant | schwebende Elemente, die ruhig stehen sollen (Sidebar-Pille) |

## Testen: was nicht geht und was hilft

**Headless-Chromium reproduziert keinen dieser Fehler.** Weder das
Leistenverhalten noch die Safe Area noch das Nachlaufen fixierter Elemente.
Alle vier Symptome waren am Desktop unsichtbar — vier Reparaturversuche gingen
deshalb ins Leere, bevor Evidenz vom Gerät vorlag.

**Screenshots vom iPad kommen am einfachsten über die App selbst:**
Profil → „Fehler melden" → Bild anhängen. Auslesen als Developer über
`/api/dev/errors` und `/api/dev/errors/anhaenge/:id`. Zum Nachmessen von Farben
und Kanten lohnt es, den Screenshot per Canvas pixelweise auszulesen statt ihn
zu deuten — die Diagnose „Balken ist exakt `#F7F7F7`" hat den Fall entschieden,
nachdem zwei plausible Hypothesen daneben lagen.

**Was sich am Desktop prüfen lässt:** `tools/check-dashboard-viewports.mjs`
misst Kachelgeometrie, Überlauf und Scrollweg an sieben Viewports in allen
Themes. Es fängt Layout-Regressionen, aber keine iOS-Eigenheiten.

## Zusammenfassung der betroffenen Stellen

| Datei | Was dort iOS-spezifisch ist |
|---|---|
| [app/css/layout.css](../app/css/layout.css) | Scroll-Modell für Touch, `100dvh` neben `100vh` |
| [app/css/glass.css](../app/css/glass.css) | Hintergrund-Ebene `html::before`, Sidebar-Höhe über `svh` + Safe Area, `--app-bg-base` |
| [app/css/base.css](../app/css/base.css) | Body-Grundfarbe über `--app-bg-base` |
| [app/css/login.css](../app/css/login.css) | schaltet die Hintergrund-Ebene ab |
| [app/js/app.js](../app/js/app.js) | `scrollHost()`, Topbar-Schatten |
| [app/js/router.js](../app/js/router.js) | Scroll-Reset in beiden Modellen |
