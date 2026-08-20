# Klickbare „Abgeschlossen"-Station im Abteilungsplaner — Design-Spec

**Datum:** 2026-08-20
**Status:** Entwurf

---

## Problem

Im Plantafel-Seitenpanel des Abteilungsplaners (`ptPanel`) zeigt jede Station bei
abgeschlossener Beurteilung nur einen reinen Text-Badge „Abgeschlossen"
([abteilungs-planer.js:1182](../../../app/js/abteilungs-planer.js#L1182)) — ohne
Möglichkeit, die Beurteilung von dort aus zu öffnen. Admins müssen den Umweg über
die URL `beurteilung.html?zuw=<id>` von Hand gehen.

Der Zugriff selbst ist dabei serverseitig **längst offen**: `darfBeurteilen()`
lässt `role === 'admin'`/`'developer'` uneingeschränkt jede Beurteilung lesen und
bearbeiten ([backend/services/beurteilungen.js:27](../../../backend/services/beurteilungen.js#L27)),
und `beurteilung.js:83` markiert die Seite für sie als `editable`. Es fehlt
ausschließlich der Klick-Einstieg im Planer.

Das gleiche Muster existiert bereits an anderer Stelle im selben File: Das
Abteilungsdurchlauf-Board rendert eine abgeschlossene Station als echten Link
(`<a ... href="beurteilung.html?zuw=${z.id}">Öffnen</a>`,
[abteilungs-planer.js:107](../../../app/js/abteilungs-planer.js#L107)).

## Ziel

Im Plantafel-Panel wird eine Station mit `Beurteilung.status === 'abgeschlossen'`
als Ganzes klickbar und führt zu `beurteilung.html?zuw=<id>` — analog zum
bestehenden Link-Muster im Durchlauf-Board.

## Scope

Reine Frontend-Änderung, zwei Dateien, kein Backend-Änderungsbedarf:

### `app/js/abteilungs-planer.js` — `renderPanel()`

In der Stations-Schleife (aktuell ~[Zeile 1171–1197](../../../app/js/abteilungs-planer.js#L1171-L1197)):

- Wenn `b && b.status === 'abgeschlossen'`: Tag der Stations-Kachel von `div` auf
  `a` umstellen, `href="beurteilung.html?zuw=${z.id}"` setzen, Klasse
  `pt-stn--clickable` ergänzen.
- Sonst (offen/Entwurf/kein Eintrag): unverändert `div`, kein Link — **kein**
  Verhaltenswechsel für diese Fälle.
- Die bestehenden Klick-Handler auf `[data-edit]`/`[data-del]`
  ([Zeile 1202–1203](../../../app/js/abteilungs-planer.js#L1202-L1203)) rufen am
  Anfang zusätzlich `e.stopPropagation(); e.preventDefault();` auf, damit ein
  Klick auf ✎/✕ nicht zusätzlich die Link-Navigation der umschließenden Kachel
  auslöst.

### `app/css/planer-board.css`

Neue Regel `.pt-stn--clickable`: `cursor:pointer`, `text-decoration:none`,
`color:inherit`, `display:block` (Anker sind inline, `.pt-stn` braucht Block-Maße),
plus dezente Hover-Anhebung analog zu `.dlb-mini-card:hover`
([abteilungs-planer.css:840](../../../app/css/abteilungs-planer.css#L840)) als
Klick-Affordanz.

## Nicht im Scope

- Badges „Entwurf" und „Beurteilung offen" bleiben unverändert **nicht**
  klickbar — explizit nur „Abgeschlossen" wie vom Nutzer verlangt. Entwürfe
  anderer Verantwortlicher bleiben bewusst verborgen (bestehende Regel in
  `dlbBeurtBlock`, hier nicht betroffen, da andere Codepfad).
- Keine Berechtigungsänderung im Backend — `darfBeurteilen()` deckt admin/
  developer bereits ab; für andere `kannPlanen`-Nutzer (falls künftig ohne
  admin-Rolle) greift dieselbe Verantwortlichkeits-Prüfung, die im Durchlauf-
  Board schon denselben Endpunkt nutzt — kein neuer Sonderfall, keine neue
  Prüfung nötig.

## Risiken / Randfälle

- **Klick-Konflikt Edit/Delete vs. Kachel-Link:** abgefangen durch
  `stopPropagation()`/`preventDefault()` in den bestehenden Button-Handlern.
- **403 bei fehlender Berechtigung:** Kann nur bei einem hypothetischen
  `kannPlanen`-Nutzer ohne admin-Rolle und ohne Verantwortlichkeit auftreten —
  bestehendes, an dieser Stelle nicht neu eingeführtes Verhalten von
  `beurteilung.html`.

## Verifikation

Manuell im Browser (Demo-Konten): als **Admin Verwaltung** (oder **Developer
Demo**) den Abteilungsplaner öffnen, eine Station mit abgeschlossener
Beurteilung anklicken → `beurteilung.html?zuw=<id>` öffnet sich mit den echten
Daten. Bearbeiten/Löschen-Buttons auf derselben Kachel weiter einzeln testen
(dürfen nicht mit-navigieren). Offene/Entwurf-Stationen bleiben unverändert
nicht klickbar.
