# Dashboard auf den Planer ausrichten (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Das Dashboard kapazitätsbasiert komponieren: eine **Planer-Signalkarten-Sektion** (für `kannPlanen`: Azubis ohne aktuelle Zuweisung / bald ablaufende / bald beginnende Zuweisungen) und die bestehende **Korrektur-Sektion** nur noch für korrektur-berechtigte Nutzer — damit die reine Personalabteilung ein Planungs-Cockpit statt eines leeren Korrektur-Postfachs sieht.

**Architecture:** `dashboard.js` verzweigt heute auf `user.role` (Azubi vs. Ausbilder/Admin). Umstellung auf Fähigkeiten: Azubi → eigenes Dashboard; sonst `renderAusbilderDashboard`, das nun aus Sektionen je Fähigkeit komponiert wird (`istKorrektor = istAusbilder || hat aktive Zuweisung`; `kannPlanen` → Signalkarten). Signal-Daten kommen aus `DB.getAllZuweisungen()` + `DB.getAzubis()` (gleicher Datenpfad wie der Planer).

**Tech Stack:** Vanilla JS, verschachtelte Template-Literals (im Template bereits üblich, z. B. dashboard.js:858). Verifikation visuell (Server-Neustart + Strg+F5).

**Bezug:** [Spec](../specs/2026-06-16-azubi-planer-zugriff-admin-umbau-design.md) Schritt 4. Baut auf Phase 1–3a auf.

**Schwellwert:** „bald" = innerhalb der nächsten **14 Tage**. „Ohne Anschluss"-Verfeinerung (Folge-Zuweisung prüfen) ist bewusst NICHT in v1 (YAGNI; bald-ablaufend = endet ≤14 Tage).

---

### Task 1: Render-Verzweigung + getMeineAzubis auf Fähigkeiten

**Files:**
- Modify: `app/js/dashboard.js` (Zeilen ~21, ~52, ~1104-1113)

- [ ] **Step 1: DOMContentLoaded-Verzweigung (≈ Zeile 21)**

Ersetze:
```js
    if (user.role === 'azubi') {
      await renderAzubiDashboard(user);
    } else {
      await renderAusbilderDashboard(user);
    }
```
durch (es gibt ZWEI identische Vorkommen — DOMContentLoaded ~21 und pageshow ~52; beide ersetzen):
```js
    if (user.istAzubi) {
      await renderAzubiDashboard(user);
    } else {
      await renderAusbilderDashboard(user);
    }
```

- [ ] **Step 2: getMeineAzubis – Admin-Sonderregel entfernen (≈ Zeile 1104)**

Ersetze:
```js
async function getMeineAzubis(user) {
  if (user.role === 'admin') return await DB.getAzubis();

  const heute = new Date().toISOString().split('T')[0];
  const meineZuw = (await DB.getZuweisungenFuerAusbilder(user.id))
    .filter(z => z.von <= heute && z.bis >= heute);
  const azubiIds = [...new Set(meineZuw.map(z => z.azubiId))];
  const users = await Promise.all(azubiIds.map(id => DB.getUser(id)));
  return users.filter(Boolean);
}
```
durch (Korrektur ist jetzt für alle zuweisungsgetrieben — kein „Admin sieht alle"):
```js
async function getMeineAzubis(user) {
  const heute = new Date().toISOString().split('T')[0];
  const meineZuw = (await DB.getZuweisungenFuerAusbilder(user.id))
    .filter(z => z.von <= heute && z.bis >= heute);
  const azubiIds = [...new Set(meineZuw.map(z => z.azubiId))];
  const users = await Promise.all(azubiIds.map(id => DB.getUser(id)));
  return users.filter(Boolean);
}
```

- [ ] **Step 3: Parse-Check**

Run: `node -e "new Function(require('fs').readFileSync('app/js/dashboard.js','utf8')); console.log('parse ok')"`
Expected: `parse ok`.

- [ ] **Step 4: Commit**
```bash
git add app/js/dashboard.js && git commit -m "feat(dashboard): Render-Verzweigung + getMeineAzubis auf Faehigkeiten (istAzubi, zuweisungsgetrieben)"
```

---

### Task 2: Planer-Signal-Helfer

**Files:**
- Modify: `app/js/dashboard.js` (neue Funktionen direkt VOR `async function getMeineAzubis`)

- [ ] **Step 1: `getPlanerSignale` + `renderPlanerSignale` ergänzen**

Direkt vor `async function getMeineAzubis(user) {` einfügen:
```js
/* Planer-Signale: Datenpfad identisch zum Azubi-Planer (DB.getAllZuweisungen
   + DB.getAzubis). "bald" = innerhalb der nächsten 14 Tage. */
async function getPlanerSignale() {
  const heuteD  = new Date();
  const grenzeD = new Date(); grenzeD.setDate(grenzeD.getDate() + 14);
  const heute   = heuteD.toISOString().split('T')[0];
  const grenze  = grenzeD.toISOString().split('T')[0];
  const [azubis, zuw] = await Promise.all([DB.getAzubis(), DB.getAllZuweisungen()]);
  const aktiveAzubiIds = new Set(
    zuw.filter(z => z.von <= heute && z.bis >= heute).map(z => z.azubiId)
  );
  return {
    ohneZuweisung: azubis.filter(a => !aktiveAzubiIds.has(a.id)),
    baldAblaufend: zuw.filter(z => z.bis >= heute && z.bis <= grenze),
    baldBeginnend: zuw.filter(z => z.von >  heute && z.von <= grenze),
  };
}

/* Drei klickbare Signalkarten (führen in den Planer). Wiederverwendet die
   stat-card-Styles; Icon('planer') existiert (Sidebar). */
function renderPlanerSignale(sig) {
  const card = (count, label, sub, mod) => `
    <a href="azubi-planer.html" class="stat-card animate-fade-in" style="text-decoration:none">
      <div class="stat-card__icon stat-card__icon--${mod}">${Icon('planer')}</div>
      <div class="stat-card__content">
        <div class="stat-card__label">${label}</div>
        <div class="stat-card__value">${count}</div>
        <div class="stat-card__sub">${sub}</div>
      </div>
    </a>`;
  return `
    <div class="stats-grid stats-grid--3">
      ${card(sig.ohneZuweisung.length, 'Azubis ohne aktuelle Zuweisung',
             sig.ohneZuweisung.length ? 'Handlungsbedarf' : 'Alles zugewiesen',
             sig.ohneZuweisung.length ? 'error' : 'success')}
      ${card(sig.baldAblaufend.length, 'Zuweisungen enden bald', 'in den nächsten 14 Tagen', 'info')}
      ${card(sig.baldBeginnend.length, 'Zuweisungen beginnen bald', 'in den nächsten 14 Tagen', 'info')}
    </div>`;
}
```

- [ ] **Step 2: Parse-Check**

Run: `node -e "new Function(require('fs').readFileSync('app/js/dashboard.js','utf8')); console.log('parse ok')"`
Expected: `parse ok`.

- [ ] **Step 3: Commit**
```bash
git add app/js/dashboard.js && git commit -m "feat(dashboard): Planer-Signal-Helfer (ohne Zuweisung / bald ablaufend / bald beginnend)"
```

---

### Task 3: renderAusbilderDashboard kapazitätsbasiert komponieren

**Files:**
- Modify: `app/js/dashboard.js` (`renderAusbilderDashboard`, ~754-899)

- [ ] **Step 1: Fähigkeiten nach getMeineAzubis berechnen (≈ Zeile 759)**

Direkt NACH `const meineAzubis = await getMeineAzubis(user);` einfügen:
```js
  const istKorrektor   = user.istAusbilder || meineAzubis.length > 0;
  const planerSignale  = user.kannPlanen ? await getPlanerSignale() : null;
```

- [ ] **Step 2: Welcome-Banner kapazitätsabhängig (≈ Zeile 798-802)**

Ersetze:
```js
        <h1 class="welcome-banner__title">Ausbilder-Cockpit</h1>
        <p class="welcome-banner__info">
          ${meineAzubis.length} Auszubildende
          ${queue.length > 0 ? ` &nbsp;·&nbsp; <strong style="color:var(--pm-yellow)">${queue.length} ${queue.length === 1 ? 'Eintrag' : 'Einträge'} zur Abnahme</strong>` : ' &nbsp;·&nbsp; Keine offenen Prüfungen'}
        </p>
```
durch:
```js
        <h1 class="welcome-banner__title">${istKorrektor ? 'Ausbilder-Cockpit' : 'Planungs-Cockpit'}</h1>
        <p class="welcome-banner__info">
          ${istKorrektor
            ? `${meineAzubis.length} Auszubildende${queue.length > 0 ? ` &nbsp;·&nbsp; <strong style="color:var(--pm-yellow)">${queue.length} ${queue.length === 1 ? 'Eintrag' : 'Einträge'} zur Abnahme</strong>` : ' &nbsp;·&nbsp; Keine offenen Prüfungen'}`
            : 'Abteilungsdurchläufe & Zuweisungen verwalten'}
        </p>
```

- [ ] **Step 3: Planer-Sektion einhängen + Korrektur-Block kapseln**

Im `main.innerHTML`-Template: NACH dem schließenden `</div>` des `welcome-banner` (Zeile ~808) und VOR `${renderAusbilderPrimaryCta(queue, meineAzubis.length)}` (Zeile 810) einfügen:
```js

    ${user.kannPlanen ? `
    <section class="planer-signals">
      <h2 class="dashboard-section-title" style="font-size:var(--text-base);margin:var(--sp-5) 0 var(--sp-3)">Planung</h2>
      ${renderPlanerSignale(planerSignale)}
    </section>
    ` : ''}

    ${istKorrektor ? `
```
Und das Ende des Korrektur-Blocks kapseln: das `dashboard-grid`-`</div>` (Zeile ~898) ist das letzte Element vor dem schließenden Template-Backtick. Direkt NACH diesem schließenden `</div>` (also vor dem `` ` ``, das das Template beendet, Zeile ~899) einfügen:
```js
    ` : ''}
```
Damit sind `renderAusbilderPrimaryCta` (810), `stats-grid` (812-843) und `dashboard-grid` (845-898) zusammen in `${istKorrektor ? \`…\` : ''}` gekapselt.

- [ ] **Step 4: Rollen-Reste in der Korrektur-Sektion ersetzen**

Zeile ~820:
```js
          <div class="stat-card__sub">${user.role === 'admin' ? 'im System' : 'aktuell zugewiesen'}</div>
```
→
```js
          <div class="stat-card__sub">aktuell zugewiesen</div>
```

Zeile ~876:
```js
            ${user.role === 'admin' || user.role === 'ausbilder' ? `<a href="azubi-planer.html" class="btn btn-sm btn-ghost">Verwalten</a>` : ''}
```
→
```js
            ${user.kannPlanen ? `<a href="azubi-planer.html" class="btn btn-sm btn-ghost">Verwalten</a>` : ''}
```

- [ ] **Step 5: Parse-Check (kritisch — verschachtelte Template-Literals)**

Run: `node -e "new Function(require('fs').readFileSync('app/js/dashboard.js','utf8')); console.log('parse ok')"`
Expected: `parse ok`. (Bei SyntaxError: die `${istKorrektor ? \`` / `\` : ''}`-Klammerung prüfen.)

- [ ] **Step 6: Commit**
```bash
git add app/js/dashboard.js && git commit -m "feat(dashboard): Planer-Sektion + Korrektur-Sektion nach Faehigkeiten komponieren"
```

---

### Task 4: Verifikation Phase 4 (visuell, zentral)

**Files:** keine Änderung.

- [ ] **Step 1: Server-Neustart + Strg+F5.**
- [ ] **Step 2: Personas:**
  - **Personalabteilung (`…0004`):** „Planungs-Cockpit" + drei Signalkarten (ohne Zuweisung / enden bald / beginnen bald), die in den Planer führen. **Kein** Posteingang/„Meine Azubis".
  - **Ausbilderin (`…0002`):** Planungs-Signalkarten **und** Korrektur-Sektion (Posteingang, Meine Azubis), Titel „Ausbilder-Cockpit".
  - **Azubi (`…0001`):** unverändertes Azubi-Dashboard.
- [ ] **Step 3:** Signal-Zahlen gegen den Planer plausibilisieren (gleiche Zuweisungsdaten).

---

## Nicht in dieser Phase
- **Phase 3b:** Gantt-Optimierung für 30–60 Azubis (sticky, Filter, Lücken-Markierung, Dichte, Zeitnavigation).
- **„Ohne Anschluss"-Verfeinerung** der bald-ablaufend-Karte (Folge-Zuweisung prüfen).
- **Anhang-Download-Härtung** (`GET /api/wochen/anhaenge/:id/download` mit `darfWocheSehen`).
