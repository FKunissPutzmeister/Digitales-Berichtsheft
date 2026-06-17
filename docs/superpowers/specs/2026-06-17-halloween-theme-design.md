# Halloween-Theme „Geisterhaus im Wald" – Design-Spec

**Datum:** 2026-06-17
**Branch:** `worktree-halloween-theme`
**Status:** freigegeben (Design vom Nutzer bestätigt)

## Ziel

Ein neues Custom-Design `halloween` für das digitale Berichtsheft – ein
düsteres, professionell gemachtes Halloween-Theme. Es reiht sich nahtlos
in die bestehende Theme-Engine ein (wie `hyperspace`, `cmd`, `candy`,
`iceland`) und ist über die Profil-Seite wählbar.

**Nicht** Teil dieser Umsetzung: die automatische Aktivierung in der Zeit
um Halloween. Das Theme wird nur als manuell wählbares Custom-Design
ausgeliefert (die spätere Auto-Aktivierung kann darauf aufsetzen).

## Entscheidungen (mit Nutzer abgestimmt)

- **Workflow:** isolierter Worktree-Branch, zu origin gepusht (kein
  direkter Merge in Main) – entspricht dem bisherigen Theme-Vorgehen.
- **Leitfarbe:** Kürbis-Orange (#FF7518) als Akzent auf düsterem,
  dunklem Theme (Anthrazit/Nachtblau, Hauch Lila im Ambient).
- **Logo:** PM-Elefant in Kürbis-Orange umgefärbt **plus kleiner
  Hexenhut** als Motiv (`logo-halloween.png`).
- **Vordergrund:** dezent an den Rändern (App bleibt gut bedienbar).
- **Verifikation:** nach dem Bauen visuell im Browser (Edge/Playwright).

## Szene (FX-Layer `#pmThemeFX`, hinten → vorne)

Template `halloween` in `FX_TEMPLATES` (js/theme.js), Styling in
`theme-halloween.css` unter `[data-theme="halloween"] #pmThemeFX …`.

1. **Nachthimmel** – CSS-Verlauf Mitternachtsblau → Düster-Lila →
   schwarzer Horizont; Vollmond mit weichem Halo; eine dünne Wolke zieht
   gelegentlich vor dem Mond durch (translateX).
2. **Wald-Silhouette** – zwei Reihen kahler Baum-Silhouetten (SVG/CSS) in
   Fast-Schwarz, leichte Parallaxe → „mitten im Wald".
3. **Geisterhaus** – SVG-Silhouette einer schiefen Villa mit Türmchen;
   2–3 Fenster glühen warm-orange und flackern (Opacity-Keyframes).
4. **Grabsteine** – einige RIP-Steine als Silhouette mit dezentem
   Rim-Light, neben dem Haus gruppiert.
5. **Nebel** – `<canvas class="pm-hw-fog">`, Engine `PMHalloweenFog`
   (abgeleitet von Icelands `drawFog`): 2–3 weiche Nebelbänke driften
   horizontal. **Kein** `filter:blur` (Perf-Regel themes.css). Respektiert
   `prefers-reduced-motion` (Standbild) und pausiert bei offenem Modal /
   verstecktem Tab (wie PMIcelandFX/PMCmdFX/PMCandyBubbles).
6. **Vordergrund** (CSS/SVG, am Viewport-Boden, dezent in den Ecken):
   - **Kürbisse** (Jack-o'-Lanterns) mit flackerndem Innenglühen
   - **Kerzen** mit animierter Flamme
   - **Spinne**, die sich an einem Faden von oben abseilt und sanft wippt
   - vereinzelte **Fledermäuse**, die durchs Bild flattern

## Tokens (dunkles Theme)

Wie `hyperspace`/`cmd`: die `--pm-grey`-Skala wird auf dunkel gekippt,
Flächen werden dunkles Glas mit warm-orangem Tint. Akzent-Familie
`--pm-yellow*` → Kürbis-Orange-Palette (Haupt #FF7518, -dark dunkler für
Text-auf-hell-Nutzung, -light/-pale/-bg heller). Schatten/Ringe mit orangem
Glow. `color-scheme: dark`.

**Kritisch (Lehre aus bestehenden Custom-Themes):** Komponenten-Regeln,
die in anderen CSS-Dateien hart an `[data-theme="dark"]` hängen
(Sidebar-Hover, Karten-Borders, Toast, Badges, Status-Pills …), werden
**nicht** automatisch vererbt. Sie werden im halloween-Scope gespiegelt –
analog zu theme-cmd.css / theme-iceland.css.

## Komponenten

- **Primär-Buttons** (`.btn-primary`, `.b-btn-primary`): „Kürbis-Glow"
  – warmer Orange-Verlauf + weiches Leuchten (box-shadow Glow), dunkler
  Text auf Orange.
- **Karten/Kacheln/Glas**: dunkles Milchglas mit orange getöntem Rand,
  passende Hover-States.
- **Logo-Swap**: `[data-theme="halloween"] .sidebar__logo-mark,
  .login-card__mark { content: url("../assets/logo-halloween.png"); }`

## Berührte Dateien

| Datei | Änderung |
|-------|----------|
| `app/js/theme.js` | `halloween` in `CUSTOM_THEMES`; `FX_TEMPLATES.halloween`; `PMHalloweenFog`-Controller; Verdrahtung in `ensureThemeFX` (start/stop) |
| `app/css/theme-halloween.css` | **NEU** – Tokens, Szene, Vordergrund, Komponenten, Dark-Overrides-Spiegel, Logo-Swap |
| `app/css/themes.css` | `halloween` in Modal-Pause-, Reduced-Motion- und Print-Selektorlisten ergänzen |
| 9× `app/*.html` | `<link rel="stylesheet" href="css/theme-halloween.css">` direkt nach theme-iceland.css, vor themes.css |
| `app/js/profil.js` | Kachel `{ id: 'halloween', name: 'Halloween', sub: 'Geisterhaus & Nebel' }` |
| `app/css/profil.css` | `.theme-tile__swatch--halloween` (Orange/Dunkel-Vorschau) |
| `app/assets/logo-halloween.png` | **NEU** – PM-Logo orange + Hexenhut |

Seitenliste (9): index, dashboard, wochenansicht, jahresansicht,
ausbildungsstand, berichtsheftverwaltung, azubi-planer, profil,
fahrgelderstattung.

## Performance- & Barrierefreiheits-Konventionen

- FX-Layer animiert nur `transform`/`opacity`; kein großflächiges
  `filter:blur` auf viewportfüllenden fixed Layern.
- Canvas-Loop pausiert bei `document.hidden` und offenem Modal.
- `prefers-reduced-motion: reduce` → alle Animationen aus, Nebel als
  Standbild (Sammelblöcke in themes.css greifen; FX-Container ist
  `aria-hidden="true"`).
- Login-Seite: FX bleibt aus (`body.login-page` → kein `#pmThemeFX`).
- Print: FX-Layer ausgeblendet.

## Verifikation

1. Backend (`backend/`, Port 3000) + Worktree-Static-Server
   (`node .dev-server.js`, Port 5500) starten.
2. Edge via Playwright: Theme über `localStorage('customTheme')='halloween'`
   setzen, Login + mehrere Innenseiten (Dashboard, Wochenansicht, Profil)
   visuell prüfen; Screenshots ablegen.
3. Checks: Lesbarkeit/Kontrast, Buttons/Kacheln im Stil, Nebel bewegt
   sich, Vordergrund stört Inhalt nicht, Logo getauscht, kein FX auf
   Login, Modal pausiert FX.
```
