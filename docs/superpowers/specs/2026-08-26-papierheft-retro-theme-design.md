# Custom-Theme „Papierheft-Retro" — Design

**Datum:** 2026-08-26
**Repo/Branch:** FKunissPutzmeister/Digitales-Berichtsheft · `Digitales-Berichtsheft`
**Status:** Entwurf zur Review
**Theme-ID:** `papier`

---

## 1. Kontext & Ziel

Sechstes Custom-Design neben `hyperspace`, `cmd`, `candy`, `silk`, `halloween`,
`christmas` (Liste in [app/js/theme.js:29](../../../app/js/theme.js)). Motiv:
ein altes, vergilbtes Pergament-Manuskript ("altes Testament"-Look) statt eines
modernen UI — mit echter Federspitze als Cursor, handgezogenen statt digital
glatten Formen, und einem Eck-Umblättern beim Wochenwechsel.

Anders als bei den Saison-Themes (Halloween/Christmas, aktuell developer-only)
soll `papier` wie `candy`/`silk` regulär für Azubi + Developer wählbar sein
(Rollen-Gating unverändert nach bestehendem Muster in `profil.js`).

Bewusst **volle Umsetzung**, kein reduzierter Ansatz: eigene
`theme-papier.css` in der Größenordnung der bestehenden Custom-Themes
(600–1600 Zeilen), plus die unten beschriebenen JS-Bausteine (Cursor-Filter,
Curl-Canvas, Klick-Feedback).

Dieses Dokument hält die **Design-Entscheidungen** fest (Look, Farben,
Fonts, Interaktionen). Die technische Umsetzung (genaue Dateien, Reihenfolge,
Canvas-Curl-Algorithmus im Detail) folgt als separater Implementierungsplan.

---

## 2. Getroffene Entscheidungen (Übersicht)

| Aspekt | Entscheidung |
|---|---|
| Grundfläche | Sepia-Pergament, kein Karo/Linien, ausgefranste Kante, Alterungsflecken |
| Überschriften-Font | UnifrakturMaguntia (Blackletter) |
| Fließtext/Tabellen-Font | EB Garamond |
| Akzent-Tinte | Indigo `#2C3A5C` |
| Normale Buttons | Federstrich-Unterstreichung, kein Kasten |
| Primär/Destruktiv-Buttons | Sichtbarer, handgezeichneter Rahmen (ungleiche Ecken) |
| Destruktiv-Farbe | Rot-Tinte `#7A2A1C` |
| Cursor | Goldene Federspitze (Kite-Form, Luftloch + Mittelschlitz) |
| Klick-Feedback | Dezenter Tintenklecks, nur bei wichtigen Aktionen |
| Umblättern | Eck-Curl oben rechts, Canvas-basiert, **nur** Wochenwechsel im Wochenblatt |
| Favicon | Unverändert (Markenkonstante) |
| In-App-Logo | Putzmeister-Marke, 2-Farben-Remap + dezenter Hand-Wackel-Filter |
| Sidebar-Icons | Gravur-Stil, dünne unregelmäßige Linien |
| Dashboard-Karten | Lose, leicht schräg gestapelt statt exaktem Raster |
| Dark Mode | Keiner — `color-scheme: light` fest, wie `candy` |
| Sound | Keiner |
| Rollen-Gating | Wie `candy`/`silk`: Azubi + Developer |

---

## 3. Grundfläche (Paper)

Sepia-Pergament ohne Karo/Linien:

- Basis-Gradient `#E9D9B3` → `#E3D1A5`
- Alterungsflecken (Foxing) über mehrere `radial-gradient`-Layer,
  `rgba(120,80,30, 0.08–0.12)`, unregelmäßig positioniert
- Innenschatten für Tiefe: `inset 0 0 60px rgba(90,60,20,0.28)`
- Ausgefranste Kante über `clip-path: polygon(...)` mit leicht unregelmäßigen
  Randpunkten (kein glattes Rechteck)
- Rahmenfarbe: `#B9A06A`
- Wochen-/Abschnittsüberschriften bekommen eine große Initiale im
  Manuskript-Stil (erster Buchstabe vergrößert, eigene Farbe/Font,
  vgl. illuminierte Handschriften) — Zusatz-Baustein, kein Ersatz für die
  Fläche selbst

Gilt als Body-/Card-/Modal-Fläche analog zu `--pm-white`/`--pm-grey-50` in
den bestehenden Themes.

---

## 4. Typografie

| Ebene | Font | Verwendung |
|---|---|---|
| Überschriften (h1–h3, Wochen-Titel) | `UnifrakturMaguntia` (Google Fonts) | Bewusst starker "altes Manuskript"-Kontrast |
| Fließtext, Formulare, Tabellen | `EB Garamond` (Google Fonts, `ital,wght@0,400;0,600;1,400`) | Muss bei Fachbegriffen/Zahlen (Tagesstunden, Berufsbezeichnungen) lesbar bleiben — getestet gegen Tabellen-Mockup mit echten Beispielwerten |

Beide Fonts per `@import`/`<link>` wie in den anderen Custom-Themes üblich,
mit System-Serif-Fallback-Stack für den Fall verzögerten/ausbleibenden
Font-Ladens.

---

## 5. Tinte, Buttons, Status-Farben

**Akzent-Tinte (Primär/Links):** Indigo `#2C3A5C`

**Normale/sekundäre Buttons — Federstrich statt Kasten:**

| Zustand | Darstellung |
|---|---|
| Normal | Text in Tinte, `border-bottom: 1px solid` (heller Ton) |
| Hover | Unterstrich verdickt sich, dezenter "nachziehender" Verlauf am unteren Rand |
| Fokus (Tastatur) | Zusätzlich `outline: 1px dotted`, `outline-offset: 4px` |
| Deaktiviert | Blasserer Ton, `border-bottom: dashed` |
| Sekundär/leise | Kleinere Schrift, `border-bottom: dotted` |

**Primär- und destruktive Aktionen — sichtbarer, handgezeichneter Rahmen:**

Bewusster Bruch mit dem Federstrich-Muster für Aktionen mit Konsequenz
(„Woche freigeben", „Eintrag löschen"): `border` in Akzentfarbe, aber
`border-radius` mit vier **ungleichen** Werten (z. B.
`3px 7px 4px 8px / 6px 4px 8px 3px`) statt eines glatten Rechtecks, damit es
handgezeichnet statt digital wirkt. Primär in Indigo, Destruktiv in Rot-Tinte
`#7A2A1C`.

**Status-Chips:**

| Status | Ton |
|---|---|
| Genehmigt | Gedämpftes Waldgrün, `rgba(60,110,60,…)` Fläche, Rand `#5C8A5C`, Text `#2F5C2F` |
| Abgelehnt | Wachssiegel-Rot, `rgba(122,42,28,…)` Fläche, Rand `#A8543F`, Text `#7A2A1C` |
| Offen | Ocker/Braun, `rgba(90,70,30,…)` Fläche, Rand `#9A8355`, Text `#5A4A1E` |

---

## 6. Cursor & Klick-Feedback

**Cursor:** Goldene Federspitze als System-Cursor über der gesamten
Theme-Oberfläche (`cursor: url(...) <hotspot-x> <hotspot-y>, text` bzw.
`auto` je nach Element-Typ).

- Form: Kite/Bandzugfeder, `path: M17 3 L27 13 L18 30 L16 30 L7 13 Z`
  (34×34-Canvas)
- Farbe: Gold `#C9A227`, Kontur `#7A5C12`
- Erkennungsmerkmale (bewusst hinzugefügt, damit die Feder auch in
  Cursor-Größe lesbar ist): Luftloch (`circle cx17 cy13 r2`, Kontur
  `#4A3610`) + Mittelschlitz (`line x17 y15→y27`, gleiche Konturfarbe)
- Hotspot an der Spitze: `(17, 30)`

**Klick-Feedback:** Dezenter Tintenklecks (radialer Fleck, kurze
Fade-Animation) **nur bei wichtigen Aktionen** (z. B. Freigabe, Häkchen
setzen) — nicht bei jedem Klick, um bei häufiger Dateneingabe nicht zu
nerven. Welche Aktionen genau als "wichtig" gelten, wird im
Implementierungsplan anhand der tatsächlichen UI-Aktionen festgelegt.

---

## 7. Umblättern (Page-Turn)

**Bewegung:** Eck-Curl, startet oben rechts, Knick wandert diagonal zur
unteren linken Ecke — wie eine reale Buchseite, die an der oberen rechten
Ecke gefasst und umgeschlagen wird. Zurückblättern spielt dieselbe Animation
umgekehrt ab.

**Technik:** Eine reine CSS-`clip-path`-Näherung wurde geprüft und verworfen
(Ergebnis wirkt wie Ausblenden, nicht wie Biegen — keine gekrümmte
Oberfläche, keine mitlaufende Schattierung). Umsetzung stattdessen über
**Canvas mit echtem Curl-Algorithmus** (Seite als Bild in Streifen zerlegt,
pro Frame gekrümmt gezeichnet, mit Lichtkante) — passt zum bestehenden
Aufwandsniveau: das Halloween-Theme nutzt bereits eine Canvas-FX-Engine
(`PMHalloweenFog` in [app/js/theme.js](../../../app/js/theme.js), siehe
Kommentarblock in [app/css/theme-halloween.css:9-25](../../../app/css/theme-halloween.css)).
Exakte Krümmung/Schattierung wird im Implementierungsplan mit echtem
iPad-Test verfeinert (Performance-Risiko bei Canvas-Animationen auf Touch-
Geräten, siehe bestehende iOS-Eigenheiten).

**Scope:** Ausschließlich beim Wochenwechsel **innerhalb** des Wochenblatts
(Vor/Zurück). Kein genereller Seitenübergang zwischen Dashboard, Profil,
Wochenansicht usw. — geringerer Aufwand, konsistent zum Buch-Motiv (man
blättert im Heft, man wechselt nicht das Buch beim Seitenwechsel der App).

---

## 8. Logo & Icons

**Browser-Favicon** (`assets/logo/favicon.png`, `<link rel="icon">` im
`<head>` jeder Seite): bleibt **unverändert** über alle Themes hinweg —
Markenkonstante, wird nie getauscht (Recherche bestätigt: kein bestehendes
Theme tauscht das Favicon).

**In-App-Logo** (Sidebar/Login/Topbar-Marke, `.sidebar__logo-mark` /
`.login-card__mark` / `.dh-topbar__logo`): folgt dem bestehenden Muster aus
`theme-candy.css:870-879` (`content: url(...)` tauscht nur unter
`[data-theme="papier"]` das `<img>`-Bitmap, 2-Farben-Remap der Marke — keine
neue Form).

- Neues Asset `assets/logo-papier.png`: Hintergrund transparent (Pergament
  scheint durch statt Farbfläche), Marke in tiefer Tinte `#3D2C14`
- Zusätzlich ein CSS-`filter` mit `feTurbulence` + `feDisplacementMap`
  (`baseFrequency 0.018 0.028`, `scale 4`) für einen dezenten
  Hand-Wackel-Effekt auf der Kontur
- Zweite, leicht versetzte/gedrehte Kopie bei 30 % Opazität
  (`translate(1px,-0.8px) rotate(-0.3deg)`, eigener Filter mit `scale 5`)
  simuliert eine nachgezogene Skizzenlinie
- Form/Silhouette bleibt vollständig erhalten — nur Farbe + Kontur-Textur
  ändern sich

**Sidebar-Icons:** Gravur-Stil — dünne (1–1.3px), leicht unregelmäßige
Linien statt der aktuellen modernen Flat-Icons, in `#5A4A1E`.

---

## 9. Dashboard

Karten wirken als lose, einzelne Pergamentblätter statt eines exakten
Rasters: leichte, zufällige Rotation je Karte (`rotate(-1.2deg)` bis
`rotate(0.8deg)`), Schlagschatten (`2px 3px 6px rgba(0,0,0,0.15)`), keine
gleichmäßigen Abstände wie im Standard-Grid.

---

## 10. Scope-Entscheidungen / Out of Scope

- **Kein Dark Mode:** `html[data-theme="papier"] { color-scheme: light; }`
  fest, analog `theme-candy.css:36`. Kein Toggle, keine
  `[data-theme="dark"]`-Spiegelung nötig.
- **Kein Sound/Musik-Layer:** anders als andere Custom-Themes (die
  Hintergrundmusik-Feature in `theme.js` unterstützen) bekommt `papier`
  keinen Audio-Layer.
- **Kein genereller Seiten-Übergang:** Umblättern ausschließlich beim
  Wochenwechsel (siehe §7).
- **Rollen-Gating:** wie `candy`/`silk` — Azubi + Developer, kein
  Saison-Theme-Sonderfall.

---

## 11. Nächste Schritte

Dieses Dokument beschreibt Look & Verhalten. Vor der Umsetzung: Aufteilung
in einen Implementierungsplan (`writing-plans`-Skill), der u. a. festlegt:

- Reihenfolge/Struktur von `app/css/theme-papier.css` (Token-Block,
  Komponenten-Overrides, analog Aufbau von `theme-halloween.css`)
- Registrierung in `CUSTOM_THEMES` ([app/js/theme.js:29](../../../app/js/theme.js))
  und `DESIGNS`/Rollen-Gating in `app/js/profil.js`
- Canvas-Curl-Implementierung (Algorithmus, Performance-Budget, iPad-Test)
- Cursor-SVG als eigenständige Asset-Datei vs. Inline-Data-URI
- Test-/Verifikations-Schritte (visuelle Regression, iPad-Gerätetest)
