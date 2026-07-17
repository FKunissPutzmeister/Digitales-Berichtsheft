# Prüfer-Dashboard-Neuaufbau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Dashboard für rein befristete Prüfer bekommt einen Kartenrahmen-Bugfix, zwei anklickbare Kennzahl-Kacheln (offene Berichte/Beurteilungen), eine Nachlauf-Ablaufwarnung, einen "Demnächst"-Abschnitt für künftige Zuweisungen, und die Wochenansicht zeigt die Korrekturfrist permanent an.

**Architecture:** Ein neuer, rein additiver Backend-Endpunkt liefert künftige (noch nicht begonnene) Zuweisungen. `renderReinerPrueferDashboard` (`app/js/dashboard.js`) wird um die bereits im normalen Ausbilder-Dashboard etablierten Muster (Queue-Filterung nach `erlaubteAktionen`, Klick-Navigation via `sessionStorage`) erweitert. Die Wochenansicht bekommt eine kleine Verhaltenskorrektur (expliziter Sprung schlägt Von-Woche-Default) plus eine reine Anzeige-Ergänzung (keine neue Anfrage nötig, Daten liegen bereits vor).

**Tech Stack:** Node.js/Express-Backend (mssql), Vanilla-JS-SPA-Frontend (kein Framework).

## Global Constraints

- `GET /api/zuweisungen/meine-pruefungen` (bestehend) bleibt unverändert — weiterhin nur zugreifbare, bereits begonnene Zuweisungen, Grundlage für Wochenansicht-Fenstergrenzen.
- Ablauf-Warnung erscheint NUR bei Status `nachlauf`, nicht schon während `laeuft`.
- „Demnächst" ist ein eigener, klar getrennter Abschnitt (keine gemeinsame Liste mit einem dritten Badge-Status).
- Kennzahl-Kacheln sind anklickbar, springen zum jeweils ältesten offenen Eintrag.
- Ein expliziter Navigationswunsch (`sessionStorage.gotoKW`/`gotoYear`) hat in der Wochenansicht für reine Prüfer Vorrang vor dem automatischen Sprung auf die Von-Woche.
- Die Frist-Anzeige in der Wochenansicht ist permanent sichtbar (nicht nur im Nachlauf), wechselt aber bei Nachlauf auf Warnfarbe.
- Keine neue DB-Migration, keine Änderung an `verantwortlichFuerZuweisung`/`istZugreifbar`/`darfBeurteilen`.
- Deutsche Bezeichner/Kommentare wie im übrigen Repo.

---

### Task 1: Backend-Endpunkt `GET /api/zuweisungen/meine-pruefungen-kommend`

**Files:**
- Modify: `backend/routes/zuweisungen.js:250-294` (nach dem bestehenden `meine-pruefungen`-Handler, vor `GET /:id` bei Zeile 298)

**Interfaces:**
- Consumes: `ladeKorrekturKontext` (bereits importiert, Zeile 5), `ymd` (bereits importiert, Zeile 6).
- Produces: `GET /api/zuweisungen/meine-pruefungen-kommend` → `Array<{azubiOid, azubiName, abteilung, von, bis}>`, sortiert nach `von` aufsteigend. Konsumiert in Task 2 (`DB.getMeinePruefungenKommend`).

- [ ] **Step 1: Route ergänzen**

In `backend/routes/zuweisungen.js`, direkt NACH dem bestehenden `router.get('/meine-pruefungen', ...)`-Block (nach der schließenden `});` in Zeile 294, vor dem Kommentar zu `GET /:id` in Zeile 296), einfügen:

```js
// GET /api/zuweisungen/meine-pruefungen-kommend
// Für Prüfer: die eigenen (inkl. per Vertretung geerbten) befristeten
// Zuweisungen, die noch nicht begonnen haben (Von in der Zukunft). Speist
// den "Demnächst"-Abschnitt im Prüfer-Dashboard. Keine Zugreifbarkeits-
// prüfung nötig (die Zuweisung hat ja noch nicht begonnen), keine Dedup-
// Notwendigkeit (mehrere künftige Rotationen zum selben Azubi sind
// informativ und werden alle gezeigt).
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

- [ ] **Step 2: Manuell verifizieren**

Kein dedizierter Route-Test (Konvention dieses Repos, siehe bestehender `meine-pruefungen`-Handler direkt darüber). Verifikation: `node --check backend/routes/zuweisungen.js`, und Modul-Ladbarkeit:

```bash
node -e "require('./backend/routes/zuweisungen.js')"
```

Expected: kein Fehler.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/zuweisungen.js
git commit -m "feat(zuweisungen): Endpunkt meine-pruefungen-kommend für 'Demnächst'-Abschnitt"
```

---

### Task 2: Frontend-API-Wrapper

**Files:**
- Modify: `app/js/api.js:447-449` (nach dem bestehenden `getMeinePruefungen`)

**Interfaces:**
- Produces: `DB.getMeinePruefungenKommend(): Promise<Array<{azubiOid, azubiName, abteilung, von, bis}>>`. Konsumiert in Task 5.

- [ ] **Step 1: Wrapper ergänzen**

In `app/js/api.js`, direkt nach dem bestehenden Block:

```js
  async getMeinePruefungen() {
    return await apiFetch('/zuweisungen/meine-pruefungen');
  },
```

einfügen:

```js
  async getMeinePruefungenKommend() {
    return await apiFetch('/zuweisungen/meine-pruefungen-kommend');
  },
```

- [ ] **Step 2: Verifizieren**

```bash
node --check app/js/api.js
```

- [ ] **Step 3: Commit**

```bash
git add app/js/api.js
git commit -m "feat(api): DB-Wrapper für meine-pruefungen-kommend"
```

---

### Task 3: Dashboard-CSS-Bugfix + Warnkarten-Style

**Files:**
- Modify: `app/dashboard.html:19` (fehlendes Stylesheet)
- Modify: `app/css/abteilungs-planer.css:619` (neue Kartenvariante)

**Interfaces:**
- Produces: CSS-Klasse `.durchlauf-card--warnung` (rote Akzentfarbe, analog zu `.durchlauf-card--current`). Konsumiert in Task 5.

- [ ] **Step 1: Fehlendes Stylesheet in `dashboard.html` ergänzen**

In `app/dashboard.html`, Zeile 19 (`<link rel="stylesheet" href="css/dashboard.css?v=20260618-signalcols">`), direkt danach einfügen:

```html
  <link rel="stylesheet" href="css/abteilungs-planer.css"> <!-- .durchlauf-card/-list/-empty (Prüfer-Dashboard) -->
```

- [ ] **Step 2: Warnkarten-Variante ergänzen**

In `app/css/abteilungs-planer.css`, Zeile 619 (`.durchlauf-card--current { border-left-color: var(--pm-yellow); background: var(--pm-yellow-pale); }`), direkt danach einfügen:

```css
.durchlauf-card--warnung { border-left-color: var(--status-abgelehnt); background: var(--status-abgelehnt-bg); }
```

- [ ] **Step 3: Visuell verifizieren**

Kein automatisierter Test für CSS. Kurzer Sichtcheck genügt in Task 5/6 (dort wird die Klasse tatsächlich verwendet und kann im Browser geprüft werden) — kein eigener Schritt hier nötig außer Syntaxkontrolle durch Lesen der Datei nach dem Edit.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard.html app/css/abteilungs-planer.css
git commit -m "fix(dashboard): fehlendes Kachel-Stylesheet + Nachlauf-Warnkarten-Variante"
```

---

### Task 4: Wochenansicht — expliziter Sprung schlägt Von-Woche-Default, permanente Fristanzeige

**Files:**
- Modify: `app/js/wochenansicht.js:279-291` (Von-Woche-Sprunglogik)
- Modify: `app/js/wochenansicht.js:443-444` (nach der bestehenden Fenster-Berechnung in `render()`)
- Modify: `app/js/wochenansicht.js:511-512` (Template, wo `azubiSelectorHtml` eingefügt wird)

**Interfaces:**
- Consumes: `savedKW`, `savedYear` (bestehende Variablen, Zeile 190-191 — bleiben nach dem `sessionStorage.removeItem` in Zeile 196-197 als lokale JS-Konstanten weiterhin wahr/falsy auswertbar), `fenster` (bestehende Variable in `render()`, Zeile 436, trägt `.status`/`.nachlaufBis`).
- Produces: neue lokale Variable `fristHinweisHtml` in `render()`.

- [ ] **Step 1: Von-Woche-Sprung nur ohne expliziten Zielsprung**

Zeile 279-291 ersetzen:

```js
  // Reiner Prüfer: Fenster-Map nachladen, falls sie oben noch nicht befüllt
  // wurde (z. B. weil savedAzubiId den Sprung ausgelöst hat). Auf die erste
  // Woche der Zuweisung springen (unabhängig vom heutigen Datum) NUR, wenn
  // kein expliziter Sprung (gotoKW/gotoYear, z. B. von der neuen
  // "Offene Berichte"-Kachel im Dashboard) vorliegt — ein expliziter Sprung
  // hat immer Vorrang.
  if (user.istReinerPruefer) {
    if (!pruefungsFenster) pruefungsFenster = new Map((await DB.getMeinePruefungen()).map(p => [String(p.azubiOid), p]));
    if (!(savedKW && savedYear)) {
      const fenster = viewAzubiId ? pruefungsFenster.get(String(viewAzubiId)) : null;
      if (fenster) {
        const vonDatum = new Date(fenster.von + 'T00:00:00');
        currentKW = DateUtil.getKW(vonDatum);
        currentYear = DateUtil.getKWYear(vonDatum);
      }
    }
  }
```

- [ ] **Step 2: Fristanzeige berechnen**

Zeile 443-444 (`const prevWeekDisabled = ...` / `const nextWeekDisabled = ...`), direkt danach einfügen:

```js
    // Permanente, dezente Fristanzeige für reine Prüfer (nutzt das bereits
    // geladene Fenster, keine neue Anfrage): zeigt, bis wann der Bericht
    // dieses Azubis noch korrigiert werden darf. Wechselt bei Nachlauf auf
    // Warnfarbe.
    const fristHinweisHtml = (user.istReinerPruefer && fenster)
      ? `<div class="wochen-frist-hinweis"${fenster.status === 'nachlauf' ? ' style="color:var(--status-abgelehnt)"' : ''}>
          Korrektur möglich bis ${DateUtil.formatDate(fenster.nachlaufBis)}
        </div>`
      : '';
```

- [ ] **Step 3: Fristanzeige ins Template einfügen**

Zeile 511-512 (`main.innerHTML = \`` / `      ${azubiSelectorHtml}`), ersetzen durch:

```js
    main.innerHTML = `
      ${azubiSelectorHtml}
      ${fristHinweisHtml}
```

- [ ] **Step 4: Verifizieren**

```bash
node --check app/js/wochenansicht.js
```

- [ ] **Step 5: Commit**

```bash
git add app/js/wochenansicht.js
git commit -m "feat(wochenansicht): expliziter Sprung schlägt Von-Woche-Default + permanente Fristanzeige"
```

---

### Task 5: Dashboard-Neuaufbau — `renderReinerPrueferDashboard`

**Files:**
- Modify: `app/js/dashboard.js:548-586` (komplette Funktion ersetzen)

**Interfaces:**
- Consumes: `DB.getMeinePruefungen()`, `DB.getMeinePruefungenKommend()` (Task 2), `DB.getWochenFuerAzubi(azubiId)` (bestehend), `DB.getMeineBeurteilungen()` (bestehend, ohne Parameter → flache Liste), `Icon()` (bestehend, `app/js/icons.js`), `getGreeting`/`firstName`/`escapeHtml` (bestehende globale Helfer).
- Produces: keine neuen exportierten Namen — reine Ersetzung der bestehenden Render-Funktion, gleiche Dispatch-Stellen (`app/js/dashboard.js:24,67`, unverändert) rufen sie weiterhin per Namen auf.

- [ ] **Step 1: Funktion komplett ersetzen**

Zeile 548-586 (der gesamte Kommentar + die Funktion `renderReinerPrueferDashboard`) ersetzen durch:

```js
/* ── Reiner-Prüfer-Dashboard: befristete Zuweisungen statt "Meine Azubis" ── */
async function renderReinerPrueferDashboard(user) {
  const main = document.getElementById('mainContent');
  const [pruefungen, kommende, beurteilungen] = await Promise.all([
    DB.getMeinePruefungen(),
    DB.getMeinePruefungenKommend(),
    DB.getMeineBeurteilungen(),
  ]);

  // Offene Berichte: über alle aktuell zugreifbaren Azubis die Wochen
  // sammeln, auf die der Prüfer reagieren kann (nie 'endgenehmigen' — das
  // bleibt dem dauerhaften Ausbilder vorbehalten). Älteste zuerst, wie im
  // normalen Ausbilder-Posteingang.
  const offeneBerichte = [];
  for (const p of pruefungen) {
    const wochen = await DB.getWochenFuerAzubi(p.azubiOid);
    wochen.forEach(w => {
      if ((w.erlaubteAktionen || []).includes('erstgenehmigen')) {
        offeneBerichte.push({ ...w, azubiOid: p.azubiOid, azubiName: p.azubiName });
      }
    });
  }
  offeneBerichte.sort((a, b) => (a.year - b.year) || (a.kw - b.kw));

  const offeneBeurteilungen = beurteilungen
    .filter(b => b.status === 'offen')
    .sort((a, b) => (a.bis < b.bis ? -1 : 1));

  const warnungen = pruefungen.filter(p => p.status === 'nachlauf');

  const STATUS_LABEL = p => p.status === 'laeuft'
    ? 'Läuft'
    : `Nachlauf bis ${DateUtil.formatDate(p.nachlaufBis)}`;

  const pruefungCard = p => `
    <div class="durchlauf-card">
      <span class="badge ${p.status === 'laeuft' ? 'badge--genehmigt' : 'badge--grey'} durchlauf-card__badge">
        ${STATUS_LABEL(p)}
      </span>
      <div class="durchlauf-card__abt">${escapeHtml(p.azubiName)}${p.abteilung ? ' · ' + escapeHtml(p.abteilung) : ''}</div>
      <div class="durchlauf-card__zeit">${DateUtil.formatDate(p.von)} – ${DateUtil.formatDate(p.bis)}</div>
      <div class="durchlauf-card__verantw">
        <a href="wochenansicht.html" class="dash-pruefung-link" data-goto-azubi="${escapeHtml(p.azubiOid)}">Wochenansicht öffnen</a>
        &nbsp;·&nbsp;
        <a href="beurteilungen.html">Beurteilung</a>
      </div>
    </div>`;

  main.innerHTML = `
    <div class="welcome-banner welcome-banner--ausbilder">
      <div class="welcome-banner__content">
        <p class="welcome-banner__greeting">${getGreeting()}, ${firstName(user.name)} 👋</p>
        <h1 class="welcome-banner__title">Meine Prüfzeiträume</h1>
        <p class="welcome-banner__info">${pruefungen.length} ${pruefungen.length === 1 ? 'Zuweisung' : 'Zuweisungen'}</p>
      </div>
    </div>

    <div class="stats-grid stats-grid--3">
      <div class="stat-card animate-fade-in" id="statOffeneBerichte" style="animation-delay:0ms${offeneBerichte.length ? ';cursor:pointer' : ''}"${offeneBerichte.length ? ' role="button" tabindex="0"' : ''}>
        <div class="stat-card__icon stat-card__icon--${offeneBerichte.length ? 'error' : 'success'}">
          ${Icon('document')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Offene Berichte</div>
          <div class="stat-card__value">${offeneBerichte.length}</div>
          <div class="stat-card__sub">${offeneBerichte.length ? 'warten auf Erstgenehmigung' : 'Keine offenen Berichte'}</div>
        </div>
      </div>
      <div class="stat-card animate-fade-in" id="statOffeneBeurteilungen" style="animation-delay:60ms${offeneBeurteilungen.length ? ';cursor:pointer' : ''}"${offeneBeurteilungen.length ? ' role="button" tabindex="0"' : ''}>
        <div class="stat-card__icon stat-card__icon--${offeneBeurteilungen.length ? 'error' : 'success'}">
          ${Icon('cap')}
        </div>
        <div class="stat-card__content">
          <div class="stat-card__label">Offene Beurteilungen</div>
          <div class="stat-card__value">${offeneBeurteilungen.length}</div>
          <div class="stat-card__sub">${offeneBeurteilungen.length ? 'noch zu erstellen' : 'Keine offenen Beurteilungen'}</div>
        </div>
      </div>
    </div>

    ${warnungen.length ? `
      <div class="durchlauf-list">
        ${warnungen.map(p => `
          <div class="durchlauf-card durchlauf-card--warnung">
            <div class="durchlauf-card__abt">Zugriff für ${escapeHtml(p.azubiName)} endet am ${DateUtil.formatDate(p.nachlaufBis)}</div>
            <div class="durchlauf-card__zeit">Zuweisung (${p.abteilung ? escapeHtml(p.abteilung) : 'ohne Abteilung'}) endete bereits am ${DateUtil.formatDate(p.bis)} — danach ist keine Korrektur mehr möglich.</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <h2 class="dashboard-section-title" style="font-size:var(--text-base);margin:var(--sp-6) 0 var(--sp-3)">Meine Prüfzeiträume</h2>
    ${pruefungen.length
      ? `<div class="durchlauf-list">${pruefungen.map(pruefungCard).join('')}</div>`
      : `<div class="durchlauf-empty">Aktuell keine aktive Zuweisung.</div>`}

    ${kommende.length ? `
      <h2 class="dashboard-section-title" style="font-size:var(--text-base);margin:var(--sp-6) 0 var(--sp-3)">Demnächst</h2>
      <div class="durchlauf-list">
        ${kommende.map(k => `
          <div class="durchlauf-card">
            <span class="badge badge--grey durchlauf-card__badge">Kommend</span>
            <div class="durchlauf-card__abt">${escapeHtml(k.azubiName)}${k.abteilung ? ' · ' + escapeHtml(k.abteilung) : ''}</div>
            <div class="durchlauf-card__zeit">${DateUtil.formatDate(k.von)} – ${DateUtil.formatDate(k.bis)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  main.querySelectorAll('.dash-pruefung-link').forEach(a => {
    a.addEventListener('click', () => sessionStorage.setItem('gotoAzubiId', a.dataset.gotoAzubi));
  });

  if (offeneBerichte.length) {
    const goBerichte = () => {
      const b = offeneBerichte[0];
      sessionStorage.setItem('gotoAzubiId', b.azubiOid);
      sessionStorage.setItem('gotoKW', String(b.kw));
      sessionStorage.setItem('gotoYear', String(b.year));
      window.location.href = 'wochenansicht.html';
    };
    const el = document.getElementById('statOffeneBerichte');
    el.addEventListener('click', goBerichte);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBerichte(); } });
  }
  if (offeneBeurteilungen.length) {
    const goBeurteilung = () => { window.location.href = `beurteilung.html?zuw=${offeneBeurteilungen[0].zuweisungId}`; };
    const el = document.getElementById('statOffeneBeurteilungen');
    el.addEventListener('click', goBeurteilung);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBeurteilung(); } });
  }
}
```

- [ ] **Step 2: Verifizieren**

```bash
node --check app/js/dashboard.js
```

- [ ] **Step 3: Commit**

```bash
git add app/js/dashboard.js
git commit -m "feat(dashboard): Neuaufbau Reiner-Pruefer-Dashboard (offene Berichte/Beurteilungen, Nachlauf-Warnung, Demnaechst)"
```

---

### Task 6: End-to-End-Verifikation

**Files:** keine (nur manuelles Testen)

- [ ] **Step 1: Backend-Tests laufen lassen**

```bash
node --test backend/services/zugriff.test.js backend/middleware/auth.test.js backend/services/users.test.js
```
Expected: PASS, keine Regressionen (dieser Umbau ändert keine der dort getesteten Funktionen).

- [ ] **Step 2: Manuell gegen die Dev-Instanz prüfen**

Mit dem Test-Prüfer-Demo-Konto (`test.pruefer.demo@putzmeister.com`) einloggen und im Dunkelmodus prüfen:
1. Kartenrahmen um alle Zuweisungs-Karten sichtbar (Bugfix).
2. Kennzahl-Kacheln zeigen korrekte Zahlen; bei offenen Berichten/Beurteilungen anklickbar, Klick springt zum ältesten Eintrag (bei Berichten: korrekte KW in der Wochenansicht, nicht die Von-Woche).
3. Zuweisung im Nachlauf → Warnkarte mit korrektem Datum sichtbar; Zuweisung `läuft` → keine Warnkarte.
4. Künftige Zuweisung (Von in der Zukunft, per SQL testweise anlegen) → erscheint nur unter „Demnächst".
5. Wochenansicht: Fristanzeige permanent sichtbar, Warnfarbe im Nachlauf.
6. Normales Öffnen der Wochenansicht über die Sidebar landet weiterhin auf der Von-Woche (Regressionscheck für Task 11 aus dem vorherigen Branch).

Kein Commit in diesem Task (rein manuelle Verifikation).
