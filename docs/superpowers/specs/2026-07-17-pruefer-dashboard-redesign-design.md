# Reiner-Prüfer-Dashboard: Neuaufbau + Wochenansicht-Fristanzeige

**Datum:** 2026-07-17
**Status:** Design freigegeben

## Ziel

Das mit dem vorherigen Feature-Branch eingeführte Dashboard für rein befristete
Prüfer (`renderReinerPrueferDashboard`, `app/js/dashboard.js`) wird überarbeitet:

1. **Bugfix:** Im Dunkelmodus (und allen Custom-Themes) fehlt der Kasten um
   die Zuweisungs-Karten komplett — Text schwebt unstyled auf dem
   Seitenhintergrund.
2. **Neuaufbau:** Statt nur der Kartenliste bekommt der Prüfer sofort
   sichtbar: wie viele Berichte und Beurteilungen auf ihn warten, eine
   deutliche Warnung wenn eine Zuweisung im Nachlauf ist und bald
   endgültig erlischt, und eine Übersicht kommender (noch nicht
   begonnener) Zuweisungen.
3. **Wochenansicht:** Die Korrektur-Frist (Nachlauf-Enddatum) wird dort
   ebenfalls sichtbar gemacht, nicht nur im Dashboard.

## Ausgangslage

- `app/dashboard.html` bindet `css/abteilungs-planer.css` nicht ein.
  `.durchlauf-card`/`.durchlauf-list` (verwendet von
  `renderReinerPrueferDashboard`, `app/js/dashboard.js:549-586`) sind
  ausschließlich dort definiert (`app/css/abteilungs-planer.css:610-635`).
  Im Hellmodus fällt das kaum auf (Seiten- und Kartenhintergrund beide
  hell); im Dunkelmodus fehlt jede Kartenfläche.
- `renderAusbilderDashboard` (`app/js/dashboard.js:589-775`) hat bereits ein
  etabliertes Muster für „offene Punkte, die auf Aktion warten": ein
  `queue`-Array aus `allWochen.filter(w => (w.erlaubteAktionen || []).some(a
  => a === 'erstgenehmigen' || a === 'endgenehmigen'))`, sortiert nach
  Wartedauer, mit Klick-Navigation in die Wochenansicht (setzt
  `sessionStorage.gotoKW`/`gotoYear`/`gotoAzubiId`, dann
  `location.href='wochenansicht.html'`). `erlaubteAktionen` liefert das
  Backend pro Woche (`backend/routes/wochen.js`, `annotiereWoche` →
  `wochenAktionen()` aus `backend/services/zugriff.js`). Für einen reinen
  Prüfer (nie `istDauerAusbilder`) enthält `erlaubteAktionen` nie
  `endgenehmigen` — nur `erstgenehmigen`/`zurueckgeben`.
- `GET /api/beurteilungen/meine` liefert bereits `status: 'offen'|
  'abgeschlossen'` pro Zuweisung (`backend/services/beurteilungen.js:222-265`);
  ein Zähler ist reines Client-Filtering.
- `GET /api/zuweisungen/meine-pruefungen` (`backend/routes/zuweisungen.js`)
  filtert aktuell hart auf `istZugreifbar` (`von ≤ heute ≤ bis+42 Tage`,
  `backend/services/zugriff.js`) — zukünftige Zuweisungen (`von > heute`)
  werden nicht geliefert. Es gibt keinen Endpunkt für „kommende"
  Zuweisungen.
- `app/js/wochenansicht.js` überschreibt für reine Prüfer **immer** die
  Zielwoche auf die Von-Woche der Zuweisung — auch wenn ein expliziter
  Sprung (`sessionStorage.gotoKW`/`gotoYear`) vorliegt. Das kollidiert mit
  der neuen Anforderung, von einer Dashboard-Kachel aus direkt zu einem
  bestimmten offenen Bericht zu springen.

## Getroffene Entscheidungen

1. **Ablauf-Warnung nur im Nachlauf.** Solange eine Zuweisung noch läuft,
   erscheint keine Frist-Warnung; erst wenn ihr Status `nachlauf` ist (Bis
   bereits überschritten, Zugriff aber noch bis `nachlaufBis` offen),
   erscheint ein deutlicher Hinweis mit Datum.
2. **„Demnächst" als eigener Abschnitt**, klar getrennt von den aktuellen
   Zuweisungen (nicht in derselben Liste mit einem dritten Status-Badge
   vermischt).
3. **Kennzahl-Kacheln sind anklickbar** und springen zum jeweils ältesten
   offenen Eintrag — konsistent mit dem bestehenden
   Ausbilder-Posteingang-Muster.
4. **Verhaltensänderung Wochenansicht:** Ein expliziter Navigationswunsch
   (`gotoKW`/`gotoYear` aus `sessionStorage`, gesetzt von der neuen
   Dashboard-Kachel oder einer Benachrichtigung) hat für reine Prüfer
   Vorrang vor dem automatischen Sprung auf die Von-Woche. Der
   automatische Sprung greift nur, wenn **kein** explizites Ziel vorliegt
   (normales Öffnen über Sidebar/Azubi-Wechsel).
5. **Frist-Anzeige in der Wochenansicht ist permanent sichtbar** (nicht nur
   im Nachlauf), damit der Prüfer die Deadline kennt, bevor sie akut wird —
   im Nachlauf wechselt sie optisch auf Warnfarbe.

## Backend-Änderungen

### Neuer Endpunkt `GET /api/zuweisungen/meine-pruefungen-kommend`

In `backend/routes/zuweisungen.js`, analog zu `meine-pruefungen` (gleiche
Imports, gleiche Registrierung vor `GET /:id`), aber mit umgekehrtem Filter
(`von > heute`, keine `istZugreifbar`-Prüfung, keine Dedup-Notwendigkeit —
mehrere künftige Rotationen zum selben Azubi sind informativ und werden alle
gezeigt):

```js
router.get('/meine-pruefungen-kommend', async (req, res) => {
  try {
    const pool = await getPool();
    const kontext = await ladeKorrekturKontext(pool, req.user);
    const kommende = kontext.zuweisungen.filter(z => ymd(z.von) > kontext.stichtag);
    if (!kommende.length) return res.json([]);

    const r = pool.request();
    const params = kommende.map((z, i) => { r.input(`o${i}`, sql.NVarChar(36), z.azubiOid); return `@o${i}`; });
    const namen = await r.query(`SELECT Oid, Name FROM dbo.Users WHERE Oid IN (${params.join(',')})`);
    const nameByOid = new Map(namen.recordset.map(n => [n.Oid, n.Name]));

    const liste = kommende.map(z => ({
      azubiOid: z.azubiOid,
      azubiName: nameByOid.get(z.azubiOid) || '',
      abteilung: z.abteilung || null,
      von: ymd(z.von),
      bis: ymd(z.bis),
    })).sort((a, b) => (a.von < b.von ? -1 : 1));

    res.json(liste);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] meine-pruefungen-kommend: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

Keine Änderung an `meine-pruefungen` selbst — bleibt exakt wie vorher (nur
zugreifbare, bereits begonnene Zuweisungen; Grundlage für die
Wochenansicht-Fenstergrenzen).

## Frontend-Änderungen

### `app/dashboard.html`
`<link rel="stylesheet" href="css/abteilungs-planer.css">` ergänzen (gleiche
Stelle wie in `app/abteilungs-planer.html`).

### `app/js/api.js`
`DB.getMeinePruefungenKommend()` — dünner Wrapper wie `getMeinePruefungen()`.

### `app/js/dashboard.js` — `renderReinerPrueferDashboard` neu aufgebaut

Lädt zusätzlich zu `DB.getMeinePruefungen()`:
- `DB.getMeinePruefungenKommend()`
- Für jede aktuell zugreifbare Zuweisung: `DB.getWochenFuerAzubi(azubiOid)`,
  gefiltert auf `erlaubteAktionen.includes('erstgenehmigen')` → `offeneBerichte`
  (sortiert nach `(year, kw)` aufsteigend, ältester zuerst)
- `DB.getMeineBeurteilungen()`, gefiltert auf `status === 'offen'` →
  `offeneBeurteilungen` (sortiert nach `bis` aufsteigend)

Rendert in dieser Reihenfolge: Begrüßungsbanner → zwei Kennzahl-Kacheln
(„Offene Berichte" / „Offene Beurteilungen", je mit Zähler + Klick-Handler)
→ Ablauf-Warnungen (eine Karte pro Zuweisung mit `status === 'nachlauf'`) →
„Meine Prüfzeiträume" (bestehende Karten, unverändert) → „Demnächst"
(nur gerendert, wenn `kommend.length > 0`).

Klick auf „Offene Berichte": `sessionStorage.setItem('gotoAzubiId', …)` +
`gotoKW`/`gotoYear` des ältesten offenen Berichts, dann
`location.href='wochenansicht.html'` (exakt das bestehende Muster aus
`renderAusbilderDashboard`).
Klick auf „Offene Beurteilungen": `location.href = 'beurteilung.html?zuw=' +
ältesteId`.

### `app/js/wochenansicht.js`

1. Vor dem Löschen von `savedKW`/`savedYear` aus `sessionStorage` (bestehender
   Code, `app/js/wochenansicht.js` nahe Zeile 190) einen Merker setzen:
   `const hatteZielKW = !!(savedKW && savedYear);`
2. Der bestehende Block, der für `user.istReinerPruefer` unconditional auf
   die Von-Woche springt, wird um `if (!hatteZielKW)` ergänzt — ein
   expliziter Sprung gewinnt.
3. Neue, permanent sichtbare Info-Zeile beim Azubi-Selektor (nutzt
   `pruefungsFenster`, das durch Task 11 bereits geladen wird — kein neuer
   Request): „Korrektur möglich bis {nachlaufBis}", Warnfarbe wenn
   `fenster.status === 'nachlauf'`.

## Testfälle / Verifikation

1. Dunkelmodus: Zuweisungs-Karten im Prüfer-Dashboard haben sichtbaren
   Rahmen/Hintergrund.
2. Offener Bericht vorhanden → Kachel zeigt korrekte Zahl, Klick springt
   direkt zur betroffenen KW/zum betroffenen Azubi.
3. Offene Beurteilung vorhanden → Kachel zeigt korrekte Zahl, Klick öffnet
   die Beurteilungsseite direkt.
4. Zuweisung im Nachlauf → Warnkarte mit korrektem Datum erscheint; Zuweisung
   `läuft` → keine Warnung.
5. Künftige Zuweisung (Von in der Zukunft) → erscheint nur unter
   „Demnächst", nicht in „Meine Prüfzeiträume", nicht in der
   Wochenansicht-Azubi-Auswahl.
6. Klick auf „Offene Berichte" landet auf der richtigen KW (nicht auf der
   Von-Woche); normales Öffnen der Wochenansicht über die Sidebar landet
   weiterhin auf der Von-Woche.
7. Wochenansicht zeigt die Frist permanent an; wechselt bei Nachlauf auf
   Warnfarbe.

## Nicht im Scope

- Änderungen an `meine-pruefungen` selbst oder an der
  Zugriffs-/Nachlauf-Logik (`istZugreifbar`) — nur Anzeige/Navigation.
- Eine Benachrichtigung (`dbo.Benachrichtigungen`) für den Nachlauf-Fall —
  bleibt eine reine Dashboard-/Wochenansicht-Anzeige, kein neuer
  Mitteilungstyp.
- Dedup/Zusammenfassung mehrerer künftiger Zuweisungen zum selben Azubi.
