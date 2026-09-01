# CLAUDE.md — Digitales Berichtsheft

Hinweise für Claude Code in diesem Repo. Ausgeliefert wird `app/` (Frontend) +
`backend/` (Express/mssql).

## Codesuche: kein rohes `grep`/`rg` über Bash/PowerShell

Für Volltextsuche im Code immer das dedizierte Grep-Tool benutzen, nicht
`grep`/`rg`/`findstr` über Bash oder PowerShell aufrufen. Ein Suchmuster, das
aus dem Code kopiert wird (z.B. `> 0.01)`, `< e.children.length`), enthält oft
`>`/`<` — beide Shells interpretieren das außerhalb von Anführungszeichen
immer als Um­leitung, auch mitten im Muster, und legen dafür klaglos eine
leere Datei mit dem Rest des Musters als Dateinamen an. So sind im Repo
mehrfach Geister-Dateien wie `0.01)`, `e.children.length` oder
`b.querySelector('svg')` entstanden (git-untracked, 0 Byte) — zuletzt beim
Debuggen des Silk-/Eck-Curl-Theme-Codes. Das dedizierte Grep-Tool übergibt das
Muster sicher, ohne Shell-Auswertung, und hat dieses Problem nicht.

## Dashboard „Abteilungsdurchlauf" — zwei Layout-Varianten

Für die Durchlauf-Übersicht auf dem Ausbilder-/Prüfer-Dashboard gibt es zwei
abgestimmte Layout-Varianten (aktiv: kompaktes Kern-Layout, Durchlauf unter
„Zu prüfen"). Kuniß' Alternative (breite Top-Sektion „Durchläufe") ist samt
einfachem Rückweg dokumentiert.

**Bevor du das Dashboard-Durchlauf-Layout änderst oder „zurücksetzt": zuerst
[docs/dashboard-durchlauf-layout.md](docs/dashboard-durchlauf-layout.md) lesen.**
Beide Varianten sind dort beschrieben; der Wechsel auf die jeweils andere ist mit
minimalem Aufwand möglich (Kuniß' Vollversion liegt unverändert in Commit `a066d94`).

## iOS / Touchgeräte — zwei Scroll-Modelle

Die Azubis arbeiten auf 11″-iPads. Dafür verhält sich die App auf Touchgeräten
an mehreren Stellen bewusst anders als am Desktop — am folgenreichsten: **dort
scrollt nicht das Dokument, sondern `.main-wrapper`.**

Wer eine Scrollposition liest oder setzt, muss `scrollHost()` aus
[app/js/app.js](app/js/app.js) benutzen. `window.scrollY` und `window.scrollTo`
allein funktionieren auf dem iPad nicht — und zwar stillschweigend.

**Bevor du an Scroll-Verhalten, Seitenhintergrund, Sidebar-Geometrie oder
Viewport-Einheiten arbeitest: zuerst
[docs/ios-touch-verhalten.md](docs/ios-touch-verhalten.md) lesen.** Dort steht
auch, warum `env(safe-area-inset-bottom)`, `svh` und die Hintergrund-Ebene
`html::before` so gesetzt sind — keine dieser Eigenheiten ist am Desktop
reproduzierbar, entsprechend leicht baut man sie versehentlich zurück.
