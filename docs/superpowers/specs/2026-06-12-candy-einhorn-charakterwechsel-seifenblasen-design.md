# Candy-Theme: Einhorn-Charakterwechsel + kollidierende Seifenblasen

**Datum:** 2026-06-12
**Betrifft ausschließlich:** CandyLand-Theme (`app/js/theme.js` candy-Teile, `app/css/theme-candy.css`)
**Status:** Design abgenommen

## Ziel

Zwei Erweiterungen der Candy-Hintergrundszene:

1. **Charakterwechsel im Vordergrund:** Wenn ein galoppierendes Einhorn den
   Bildschirmrand verlassen hat, wechselt, welcher Charakter im Vordergrund
   läuft.
2. **Seifenblasen im Hintergrund:** Sanft treibende Seifenblasen, die bei
   Kollision mit einem Einhorn **zerplatzen** (Pop).

## Kontext / Ausgangslage

Die Candy-Szene ist heute eine **rein deklarative CSS/SVG-Szene** (Regenbogen,
Wolken, Hügel, zwei Einhörner, Deko), eingehängt von `ensureThemeFX()` in
`#pmThemeFX`. Die Einhörner laufen per CSS-Keyframe `pm-cd-uni-run`
(`--uni-x: -22vw → 122vw`, `infinite`); es gibt **keinen JS-Loop**, der ihre
Position kennt.

Das einzige bestehende Canvas-/`requestAnimationFrame`-Vorbild im Projekt ist
der `PMIcelandFX`-Controller (iceland-Theme). Dessen **Struktur** (Lebenszyklus,
Pause bei `document.hidden`/offenem Modal, `prefers-reduced-motion`-Standbild,
Einklinken in `ensureThemeFX`) wird als Blaupause übernommen — iceland-Code
selbst wird **nicht** verändert.

### Entscheidung zum verlinkten CodePen (wBzWebb „Liquid Glass")

Der verlinkte Pen ist **kein** CSS-Seifenblasen-Snippet, sondern ein
schwergewichtiger **WebGL/Three.js-Metaball-Refraction-Shader** mit eigenem
deckenden Hintergrund (Verlauf + eingebrannter „Liquid Glass"-Text). Eine
1:1-Übernahme ist ungeeignet:

- Der Glas-Look lebt davon, einen Hintergrund zu **brechen**; über die
  Candy-Szene als transparenter Layer gelegt, kann WebGL den DOM dahinter nicht
  sampeln → Effekt bricht „ins Leere".
- Zieht Three.js (~150 KB CDN) in eine bislang **dependency-freie Vanilla-App**
  und ist deutlich GPU-lastiger.

**Gewählt (mit Nutzer abgestimmt): Hybrid.** Die *Physik-Ideen* des Pens
(Wander, Soft-Body-Feder, Oberflächen-Interaktion) werden in einem **leichten
2D-Canvas** mit Seifenblasen-Look nachgebaut. Kein Three.js, kein Metaball-
Shader.

## Architektur

### A) Charakterwechsel beim Rand-Austritt (event-basiert, kein rAF)

- Je Einhorn (`.pm-cd-unicorn--front`, `.pm-cd-unicorn--mid`) ein
  `animationiteration`-Listener, gefiltert auf
  `e.animationName === 'pm-cd-uni-run'` (ignoriert die Hüpf-Animation des
  Kind-Elements).
- Eine Iteration = ein voller Lauf von Rand zu Rand → das Einhorn ist beim
  Iterations-Ende **off-screen**. Genau dann wird das `<img src>` getauscht
  (unsichtbar).
- **Tausch-Regel:** Es gibt 2 Charaktere (`candy-unicorn-1.png` 330/460,
  `candy-unicorn-2.png` 321/460). Beim Lap-Ende setzt das Einhorn seinen
  Charakter auf den, den das **andere** Einhorn gerade *nicht* zeigt → die
  beiden bleiben stets unterschiedlich, und „wer vorne läuft" wechselt sichtbar.
  Passende `aspect-ratio` wird pro Charakter inline mitgesetzt.
- Verdrahtung in `ensureThemeFX()` im `candy`-Zweig. Listener werden beim
  Teardown (`#pmThemeFX` wird ersetzt) automatisch mit den Elementen entsorgt.

### B) Seifenblasen-Canvas mit Kollision → Pop

Neuer Controller **`PMCandyBubbles`** (IIFE, baugleich zu `PMIcelandFX`):

- **Layer:** `<canvas class="pm-cd-bubbles" aria-hidden="true">` als letztes
  Kind des candy-FX-Templates. CSS: `position:fixed; inset:0` (viewport-
  deckend), `z-index:9` (vor den Einhörnern z6/z8, aber als Teil von
  `#pmThemeFX` weiterhin hinter dem App-Inhalt) → Pops immer sichtbar.
  `pointer-events:none`.
- **Sprite:** vorgerendertes Blasen-Sprite (Offscreen-Canvas, einmalig):
  zarte durchscheinende Seifenhaut, dünner irisierender Ring, Glanzpunkt.
  Gezeichnet via `drawImage` (perf-schonend, wie iceland-Flocken).
- **Physik (fixed-timestep):** Wander-Drift, sanfter Auftrieb (Blasen steigen)
  + Seitwärts-Sinus, milde gegenseitige Abstoßung (kein Merge — passt zu
  Seifenblasen), Tempo-Cap, weicher seitlicher Wand-Abprall; oben raus → unten
  neu (endloser Strom). Soft-Body-Feder (`softOffset`) → leichtes Wabbeln/
  Squash beim Rendern (die signaturträchtige Idee des Pens). Max ~16 Blasen,
  Auto-Spawn ersetzt geplatzte.
- **Kollision:** pro Frame `getBoundingClientRect()` der beiden Einhorn-`<img>`
  lesen, auf den sichtbaren Körper geschrumpft (~62 % Breite, transparente
  PNG-Ränder ignoriert; Null-Flächen — z. B. mid via Media-Query
  `display:none` — übersprungen). Canvas-Pixel = Viewport-Koordinaten →
  direkter Kreis-Rechteck-Test. Treffer → Blase in `pop`-Zustand.
- **Pop:** ~260 ms Radius aufweiten, Ring/Füllung ausblenden, ein paar winzige
  Burst-Spritzer; danach entfernen.
- **Lebenszyklus:** `start(canvas)`/`stop()`; in `ensureThemeFX` wird
  `PMCandyBubbles.stop()` im Teardown gerufen und im `candy`-Zweig gestartet.
  Pause bei `document.hidden`/offenem Modal (wie iceland).
  `prefers-reduced-motion` → ein statisches Standbild ohne Loop/Kollision/Pop.
- **SPA-sicher:** `#pmThemeFX` überlebt Router-Navigationen → Loop läuft weiter;
  nur ein Theme-Wechsel baut neu auf (Teardown stoppt den Loop sauber).

## Betroffene Dateien

- `app/js/theme.js` — `<canvas class="pm-cd-bubbles">` im candy-Template;
  `PMCandyBubbles`-Controller; `wireCandyUnicornSwap()`; candy-Zweig +
  Teardown-Stop in `ensureThemeFX`.
- `app/css/theme-candy.css` — `.pm-cd-bubbles`-Regel.
- **Keine neuen Assets** (Blasen prozedural; Einhorn-PNGs wiederverwendet).

## Bewusst nicht enthalten (YAGNI)

Echtes Metaball-Rendering / Merge-Split, Maus-Interaktion, Three.js, der
WebGL-Glas-Shader. Der Physik-/Soft-Body-Charakter bleibt, der GPU-schwere
Kern nicht.

## Verifikation

Lokal: `node server.js` (Hauptcheckout, Port 3000) bzw. eigener Port für den
Worktree; Candy-Theme aktivieren; via Playwright+Edge prüfen:
1. Front-Einhorn-Charakter wechselt nach jedem Rand-Austritt (off-screen, kein
   sichtbarer Sprung); beide Einhörner zeigen stets unterschiedliche Charaktere.
2. Seifenblasen steigen sanft, wabbeln leicht; ein Einhorn, das eine Blase
   trifft, lässt sie zerplatzen.
3. Offenes Modal / verstecktes Tab → Loop pausiert. `prefers-reduced-motion`
   → statisches Standbild, keine Pops.
