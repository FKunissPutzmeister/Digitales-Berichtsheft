# Dedizierte Sicht für rein befristete Prüfer + eigener Beurteilungen-Reiter

**Datum:** 2026-07-16
**Status:** Design freigegeben

## Ziel

Ein Nutzer mit Rolle `pruefer`, der ausschließlich über den Abteilungsplaner
befristet zugewiesen wird (keine dauerhafte `AusbilderAzubis`-Zuordnung), soll
eine deutlich reduzierte, eigene Sicht bekommen statt der vollen
Ausbilder-Ansicht:

- Kein Zugriff auf Jahresansicht.
- Kein Zugriff auf den Abteilungsdurchlauf.
- Wochenansicht: navigierbar/sichtbar nur der Zeitraum der eigenen Zuweisung
  (Von–Bis), kein Blättern davor/danach. Der Zugriff auf genau dieses Fenster
  bleibt bis 6 Wochen nach Ablauf (`Bis`) bestehen, danach vollständig
  erloschen (Azubi verschwindet komplett aus der Liste des Prüfers).
- Eigenes Dashboard „Meine Prüfzeiträume" statt der allgemeinen
  Ausbilder-Kacheln.
- Zusätzlich, unabhängig vom obigen Punkt: Beurteilungen bekommen einen
  eigenen Sidebar-Reiter (statt ausschließlich über den Abteilungsdurchlauf
  erreichbar zu sein), sichtbar für Ausbilder, Prüfer (inkl. reiner Prüfer),
  Admin und Developer — **nicht** für Azubis. Azubis bleiben beim bisherigen
  Weg (Klick auf Durchlauf-Kachel), die Kacheln bekommen deutlicheres
  Hover-Feedback.

Ein Nutzer mit Rolle `pruefer`, der zusätzlich mindestens eine dauerhafte
`AusbilderAzubis`-Zuordnung hat, gilt weiterhin als vollwertiger Ausbilder
(keine reduzierte Sicht) — die beiden Zugriffsarten können sich bei derselben
Person überschneiden.

## Ausgangslage (heutiges Verhalten)

- `backend/services/zugriff.js` unterscheidet pro Woche technisch bereits
  zwischen befristetem Prüfer (`istPeriodenPruefer`, Z. 55–64) und dauerhaftem
  Ausbilder (`istDauerAusbilder`, Z. 47–51). `istAktiv` (Z. 24–28) verlangt
  `von ≤ stichtag ≤ bis` **ohne jede Nachlauffrist** — der Zugriff wird exakt
  an `bis` gekappt. `wocheFaelltInZuweisung` (Z. 31–36) begrenzt das
  sichtbare/korrigierbare Wochenfenster bereits exakt auf Von–Bis; das bleibt
  unverändert.
- `backend/services/users.js` `buildReqUser` (Z. 43–67) setzt
  `istAusbilder: isDev || role === 'pruefer' || !!row.IstAusbilder` (Z. 54) —
  **jeder** Prüfer gilt pauschal als Ausbilder-Capability, unabhängig davon,
  ob eine dauerhafte Zuordnung existiert. Das ist die Ursache dafür, dass
  Navigation/Dashboard/Jahresansicht für beide Zugriffsarten identisch sind
  (`app/js/app.js` `applyCapabilities()`, `app/js/jahresansicht.js:14,50`,
  `app/js/ausbildungsstand.js:13`).
- `app/js/wochenansicht.js` `navigateWeeks()` (Z. 757–763) verschiebt
  `currentKW`/`currentYear` unbegrenzt; keine Sperre nach Rolle oder Datum.
- Beurteilungen sind ausschließlich über anklickbare Durchlauf-Kacheln
  erreichbar (`wireBeurteilungKacheln`, `app/js/abteilungs-planer.js:153–159`
  und `app/js/abteilungsdurchlauf.js:79–81`), navigiert zu
  `beurteilung.html?zuw=<ZuweisungId>`. Das Zugriffsrecht selbst
  (`darfBeurteilen` → `verantwortlichFuerZuweisung`, `zugriff.js:123–129`) ist
  bewusst **datumsunabhängig** (Kommentar: Beurteilungen entstehen erst nach
  Ende des Durchlaufs) und bleibt das auch nach diesem Umbau unverändert.

## Getroffene Entscheidungen

1. **6-Wochen-Regel betrifft nur den Zugriffsschalter, nicht das Wochenfenster.**
   Sichtbar/korrigierbar bleiben ausschließlich Wochen innerhalb Von–Bis der
   Zuweisung. Ob dieses Fenster überhaupt noch geöffnet werden darf, gilt bis
   `Bis + 42 Tage`, danach nicht mehr.
2. **Mehrfache Zuweisungen zum selben Azubi:** Nur die zeitlich aktuellste
   Zuweisung zählt für die Fenstergrenzen; länger zurückliegende, bereits über
   die Nachlauffrist hinaus abgelaufene frühere Zuweisungen werden ignoriert.
3. **Startwoche:** Die Wochenansicht landet beim Öffnen durch einen Prüfer
   immer auf der ersten Woche der Zuweisung (Von), unabhängig vom heutigen
   Datum.
4. **Nach Ablauf der Nachlauffrist:** Der betroffene Azubi verschwindet
   ersatzlos aus den Listen/Dashboard des Prüfers — keine Fehlermeldung nötig,
   da kein Einstiegspunkt mehr existiert.
5. **Gemischte Rolle (dauerhaft + befristet):** Sobald ein Nutzer mindestens
   eine `AusbilderAzubis`-Zeile als Ausbilder hat, bleibt er vollwertiger
   Ausbilder in Navigation/Dashboard — unabhängig von zusätzlichen befristeten
   Zuweisungen.
6. **Beurteilungen-Reiter:** Neuer Sidebar-Punkt, sichtbar für Ausbilder,
   Prüfer (inkl. reiner Prüfer), Admin, Developer. Nicht für Azubis — deren
   Weg über die Durchlauf-Kacheln bleibt bestehen und bekommt lediglich
   deutlicheres Hover-Feedback (CSS/Markup, keine Zugriffslogik-Änderung).
   Der Abteilungsdurchlauf bleibt für Azubi/Ausbilder zusätzlich klickbar
   (zwei Wege zum selben Ziel) — nur für reine Prüfer ist der
   Abteilungsdurchlauf komplett unsichtbar, sie erreichen Beurteilungen
   ausschließlich über den neuen Reiter.
7. **Beurteilungs-Zugriffsrecht unverändert:** Keine Änderung an
   `verantwortlichFuerZuweisung`/`darfBeurteilen` — bleibt datumsunabhängig.

## Backend-Änderungen

### `backend/services/zugriff.js`
- Neue Konstante `NACHLAUF_TAGE = 42` und neue reine Funktion
  `istZugreifbar(zuweisung, stichtag)`: `von ≤ stichtag ≤ bis + 42 Tage`.
  `istAktiv` bleibt unverändert bestehen (wird an keiner anderen Stelle
  verwendet als in `istPeriodenPruefer`, siehe Grep-Ergebnis — sichere
  Ersetzung).
- `istPeriodenPruefer` (Z. 55–64) nutzt `istZugreifbar` statt `istAktiv`.
  `wocheFaelltInZuweisung` bleibt als zweite Bedingung unverändert bestehen.

### `backend/services/users.js` / `backend/middleware/auth.js`
- Neues abgeleitetes Flag `istReinerPruefer` auf `req.user`: `true`, wenn
  `role === 'pruefer'` UND keine Zeile in `AusbilderAzubis` mit
  `AusbilderOid = oid` UND `IstAusbilder`-Spalte nicht manuell gesetzt.
  Berechnung nur bei Rolle `pruefer` (ein zusätzlicher indexierter Query
  gegen `IX_AusbilderAzubis_AusbilderOid`, kein Overhead für andere Rollen).
- `istAusbilder`-Capability (Z. 54) bleibt wie heute — sie steuert
  Eligibility für Zuordnungen (`validateZuordnung`,
  `backend/services/ausbilderAzubis.js:39-51`) und darf nicht an
  `istReinerPruefer` gekoppelt werden (sonst könnte ein frisch angelegter
  Prüfer nie als dauerhafter Ausbilder zugewiesen werden — zirkuläre
  Abhängigkeit).

### Neuer Endpunkt `GET /api/zuweisungen/meine-pruefungen`
- Nur für Prüfer relevant (funktioniert aber unabhängig vom
  `istReinerPruefer`-Flag — auch ein Ausbilder mit Zusatzzuweisung kann ihn
  aufrufen).
- Liefert je Azubi die aktuellste Zuweisung dieses Prüfers
  (`VerantwEmail = eigene E-Mail`, inkl. Vertretungen wie
  `ladeKorrekturKontext` heute schon), gefiltert auf `istZugreifbar`:
  `{ azubiOid, azubiName, abteilung, von, bis, status: 'laeuft'|'nachlauf', nachlaufBis }`.
- Versorgt sowohl das neue Dashboard als auch die Wochenansicht-Fenstergrenzen
  (ein Fetch, zweifache Verwendung).

## Frontend-Änderungen

### `app/js/app.js` (`applyCapabilities`)
- Neuer Zweig für `caps.istReinerPruefer`: Jahresansicht-Link und
  Abteilungsdurchlauf-Link (`nav-durchlauf`) ausblenden.
- Neuer Sidebar-Punkt „Beurteilungen" (neue CSS-Klasse, z.B.
  `nav-beurteilungen-only`), sichtbar für `istAusbilder || istReinerPruefer
  || role === 'admin' || role === 'developer'`.

### `app/js/dashboard.js`
- Neuer Rendering-Zweig für `istReinerPruefer`: „Meine Prüfzeiträume" —
  Liste/Kacheln aus `GET /api/zuweisungen/meine-pruefungen`, je Eintrag Azubi,
  Abteilung, Zeitraum, Status, Link in Wochenansicht + Link zur Beurteilung.
  Kein Rendering der bestehenden „Meine Azubis"/„Aktive Azubis"-Kacheln
  (`renderAusbilderDashboard`, Z. 535ff.) in diesem Fall.

### `app/js/wochenansicht.js`
- Beim Laden: wenn `istReinerPruefer` (oder generischer: kein
  `istDauerAusbilder` für diesen konkreten Azubi), Fenstergrenzen aus
  `meine-pruefungen` (bzw. einer Einzel-Variante mit `azubiOid`-Filter)
  holen; `currentKW`/`currentYear` auf die Von-Woche setzen.
- `navigateWeeks()` / Prev-/Next-Buttons: `disabled`, sobald das Ziel
  außerhalb Von–Bis läge. Rein UI-seitige Absicherung — die serverseitige
  Sperre über `wocheFaelltInZuweisung` bestand bereits vorher.

### Neue Seite/Route „Beurteilungen"
- Flache Liste aller relevanten Zuweisungen mit Status offen/abgeschlossen,
  gespeist aus der bestehenden `GET /api/beurteilungen`-Filterlogik
  (`backend/routes/beurteilungen.js:8-54`, keine Backend-Änderung nötig,
  ggf. eine Liste-Variante ergänzen statt Einzel-Lookup per `zuweisungId`).
  Klick auf einen Eintrag → `beurteilung.html?zuw=<ZuweisungId>` (wie heute).

### Abteilungsdurchlauf-Kacheln (Azubi-/Ausbilder-Sicht)
- `.durchlauf-card--clickable`: zusätzliches Hover-Styling (Cursor, Rahmen-
  /Hintergrund-Highlight), damit die bestehende Klickbarkeit sichtbar wird.
  Keine Funktionsänderung.

## Testfälle / Verifikation

Manuell (lokal über `localhost:3000`, Demo-Konten) durchzuspielen:
1. Reiner Prüfer (nur Zuweisung, keine `AusbilderAzubis`-Zeile) loggt sich
   ein → sieht kein Jahresansicht-/Durchlauf-Menü, Dashboard zeigt „Meine
   Prüfzeiträume".
2. Wochenansicht dieses Prüfers für seinen Azubi: startet auf Von-Woche,
   Zurück-Button vor Von deaktiviert, Vor-Button nach Bis deaktiviert.
3. Zuweisung `Bis` liegt 3 Wochen zurück → Prüfer sieht den Azubi weiterhin
   (innerhalb der 6-Wochen-Nachlauffrist), kann die Wochen des Zeitraums noch
   korrigieren.
4. Zuweisung `Bis` liegt 7 Wochen zurück → Azubi taucht in
   `meine-pruefungen`/Dashboard/Wochenansicht-Auswahl nicht mehr auf.
5. Nutzer mit einer dauerhaften `AusbilderAzubis`-Zeile UND einer zusätzlichen
   befristeten Zuweisung: sieht weiterhin die volle Ausbilder-Sicht
   (Jahresansicht, Durchlauf, normales Dashboard).
6. Beurteilungen-Reiter: sichtbar für Ausbilder, Prüfer, Admin, Developer;
   nicht sichtbar für Azubi. Klick auf einen offenen Eintrag führt zur
   Beurteilungsseite.
7. Azubi-Sicht: Abteilungsdurchlauf-Kacheln weiterhin klickbar, jetzt mit
   erkennbarem Hover-Zustand.
8. Regressionstest `backend/services/zugriff.test.js`: bestehende
   `istAktiv`-Fälle bleiben unverändert grün; neue Fälle für `istZugreifbar`
   (innerhalb/außerhalb der 42-Tage-Frist) ergänzen.

## Nicht im Scope

- Änderungen am Zugriffsrecht für Beurteilungen selbst
  (`verantwortlichFuerZuweisung` bleibt datumsunabhängig).
- Eine UI, die dem Nutzer die Nachlauffrist explizit als Countdown anzeigt
  (nur Status „läuft"/„Nachlauf bis TT.MM.").
- Anpassungen an `AusbilderAzubis`- oder `Zuweisungen`-Datenmodell selbst
  (keine neuen Spalten/Tabellen nötig).
- Konfigurierbarkeit der 42-Tage-Frist (hartkodierte Konstante).
