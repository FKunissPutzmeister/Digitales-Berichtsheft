# CMD-Theme: Lesbare Status-Texte + 0/1-Matrix-Lade-Intro

**Datum:** 2026-06-12
**Scope:** Ausschließlich das CMD-Theme (`[data-theme="cmd"]`). Alle anderen Themes bleiben unverändert.

## Problem / Ziel

Im CMD-Theme (Terminal-Look: Schwarz + Leuchtgrün) treten zwei Wünsche auf:

1. **Status-Texte sind grün und schlecht lesbar.** Die Graustufen-Skala (`--pm-grey-*`) ist im CMD-Theme komplett auf Grüntöne gemappt. Status-Labels wie „Offen", „Genehmigt", „Noch nicht freigegeben" sowie der Wochen-Banner-Titel erscheinen dadurch grün – teils auf ebenfalls grün getöntem Hintergrund (geringer Kontrast).
2. **Es fehlt ein thematisch passender Lade-Effekt.** Beim Laden einer Seite soll – passend zum Terminal-Look – kurz ein „Matrix-Regen" aus fallenden Nullen und Einsen erscheinen, bevor der echte Inhalt sichtbar wird.

## Teil 1 — Grüne Status-Texte lesbar machen

**Regel:** Nur die **grünen** Status-Texte werden umgefärbt. Blau (`Freigegeben`) und Rot (`Abgelehnt`) bleiben unverändert (bereits gut lesbar). Dunkler Hintergrund → **weiß**; helle Pastell-Pille → **schwarz**. Farbige Hintergründe und Status-Punkte bleiben überall erhalten (Status-Bedeutung bleibt erkennbar).

Alle Änderungen als neue `[data-theme="cmd"]`-Regeln in `app/css/theme-cmd.css`.

| Element / Selektor | Ort | aktuell (CMD) | neu |
|---|---|---|---|
| `.badge--offen`, `.badge--genehmigt`, `.badge--grey` | Wochenansicht-Header, Azubi-Planer, Verwaltung | grün (`#79E876` / `#6BD089` / `#97FB94`) auf dunklem Tint | weiß (`rgba(255,255,255,0.92)`) |
| `.week-status-banner__title` | Wochenansicht-Banner (alle Status) | hellgrün `#D9FFD8` (`--pm-grey-900`) | weiß |
| `.b-status--genehmigt` | Dashboard-Hero | dunkelgrün `#006E48` auf **heller** Mint-Pille `#C4ECDB` | schwarz (`var(--on-yellow-text)` `#001407`); Pille bleibt hell |
| `.b-wkcard--ok .b-wkcard__status`, `.b-daycard--ok .b-daycard__status` | Dashboard Wochen-/Tageskarten | grün `#00A26B` auf dunkler Karte | weiß (Punkt `.d` bleibt grün) |
| Jahresansicht-Legende (Status-Zeilen) | Jahresansicht-Legende | grüner Standard-Textton | weiß (farbige Status-Punkte bleiben) |

**Anmerkung:** Beim Dashboard-Status wird nur `--genehmigt` angefasst; `--freigegeben` (blau) und `--abgelehnt` (rot) bleiben. Bei den Wochen-/Tageskarten wird nur die Variante `--ok` (grün) angefasst; `--fr` (blau), `--er` (rot), `--draft` (gelb) bleiben. Bei der Jahresansicht-Legende ändert sich nur die Textfarbe, nicht die Status-Punkte.

## Teil 2 — 0/1-Matrix-Regen als Lade-Intro

### Verhalten
- **Trigger:** Bei **jedem** Seitenwechsel (SPA-Sidebar-Navigation) **und** bei echtem Neuladen / Direktaufruf einer Seite.
- **Dauer:** ~700 ms Regen, danach ~200 ms Ausblenden → fertig gerenderter Inhalt wird freigegeben.
- **Abdeckung:** Hauptbereich = `.main-wrapper` (Topbar + Inhalt). Sidebar bleibt sichtbar.
- **Nur CMD:** Alle Einstiegspunkte prüfen `document.documentElement.dataset.theme === 'cmd'`. Bei anderem Theme passiert nichts (bestehende Fade-Animation des Routers bleibt aktiv).
- **Barrierefreiheit:** Bei `prefers-reduced-motion: reduce` wird der Regen übersprungen (Inhalt sofort sichtbar) – konsistent mit den bestehenden Reduced-Motion-Regeln im CMD-Theme.

### Architektur
- **Neues geteiltes Modul** `app/js/cmd-intro.js`:
  - Exportiert `window.CmdIntro` mit `play({ minDuration })` → `Promise`, das nach Abbau des Overlays auflöst.
  - `<canvas>`-basierter 0/1-Regen: Spalten fallender Glyphen `0`/`1` in Terminal-Grün (`#00E64D`) mit Nachzieh-Trails auf Schwarz.
  - Genau **ein** Canvas, `requestAnimationFrame`-Loop mit fester Maximaldauer; bei Abschluss Loop stoppen + Overlay/Canvas entfernen (keine Leaks über Navigationen).
  - Idempotent: ein bereits laufendes Intro wird nicht doppelt gestartet; ein neuer Aufruf während eines laufenden räumt das alte sauber ab.
  - **Self-Init** beim Laden (am Modulende, einmalig): wenn CMD-Theme aktiv → `play()` über `.main-wrapper`.
- **Einbindung als Shared-Script:**
  - `<script src="js/cmd-intro.js">` in alle 7 Seiten (`dashboard.html`, `wochenansicht.html`, `jahresansicht.html`, `ausbildungsstand.html`, `berichtsheftverwaltung.html`, `azubi-planer.html`, `profil.html` – sofern vorhanden) **vor** den seitenspezifischen Skripten, analog zu `theme.js`.
  - In `app/js/router.js` zur Liste der SHARED-Skripte hinzufügen (wird bei SPA-Navigation **nicht** neu ausgeführt), damit der Loop nur einmal definiert wird.
- **Router-Hook** in `app/js/router.go()`:
  - Wenn CMD-Theme: zu Beginn der Navigation `window.CmdIntro.play()` starten (Overlay deckt sofort den ausgehenden Inhalt ab); Fetch/Content-Swap/Skripte laufen darunter; Overlay bleibt mind. die Mindestdauer und blendet danach aus → neuer Inhalt erscheint.
  - Bei Nicht-CMD: unverändert (bestehende Exit-/Enter-Fade-Animation).
- **CSS** (in `theme-cmd.css`): Positionierung des Overlays. `.main-wrapper` erhält im CMD-Theme `position: relative`; das Overlay liegt `position:absolute; inset:0` mit hohem `z-index` **unterhalb** von Modals (`--z-modal`). Canvas füllt das Overlay.

### Komponenten-Grenzen
- `cmd-intro.js` ist eigenständig: kennt nur `.main-wrapper`, das Theme-Attribut und sein eigenes Canvas/Overlay. Keine Abhängigkeit zu Seiten-Daten.
- `router.js` ruft nur `window.CmdIntro?.play()` auf – lose Kopplung, kein Wissen über die Animation selbst.

## Betroffene Dateien
- `app/css/theme-cmd.css` — Status-Text-Overrides (Teil 1) + Overlay-Positionierung (Teil 2)
- `app/js/cmd-intro.js` — **neu**, Matrix-Regen-Modul
- `app/js/router.js` — SHARED-Liste + `play()`-Hook in `go()`
- `app/*.html` (7 Seiten) — `<script src="js/cmd-intro.js">`-Einbindung

## Verifikation
- Backend starten (`node server.js`, Port 3000) und im CMD-Theme via Browser-Automation prüfen:
  1. Status-Texte (Wochenansicht-Badge + Banner, Dashboard, Jahresansicht-Legende) sind nicht mehr grün, sondern weiß/schwarz und gut lesbar; Blau/Rot unverändert.
  2. Beim Seitenwechsel und beim Neuladen erscheint kurz der 0/1-Regen über dem Hauptbereich, danach der Inhalt.
  3. In einem anderen Theme (z.B. Standard) erscheint **kein** Regen und Status-Texte sind unverändert.
- Auslieferung der geänderten Dateien in den Haupt-Checkout (Dev-Server serviert MAIN).
