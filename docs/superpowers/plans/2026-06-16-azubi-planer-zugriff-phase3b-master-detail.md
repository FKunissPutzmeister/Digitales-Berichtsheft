# Azubi-Planer: Master-Detail-Umbau (Phase 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Dies ist ein UI-Umbau mit Gestaltungsspielraum — folge der Struktur, nutze die bestehenden Helfer/Design-Tokens, verifiziere visuell.

**Goal:** Den Azubi-Planer von der Gantt-zentrierten Ansicht auf ein **Master-Detail-Layout** umstellen, das die Pflege vieler Azubis/Zuweisungen/Verantwortlicher trägt: durchsuch-/filterbare Azubi-Liste links, Rotationsplan des gewählten Azubis rechts (anlegen/löschen). Der Gantt bleibt als einklappbare Gesamtübersicht.

**Architecture:** Reine Layout-Reorganisation in `app/js/azubi-planer.js` + CSS-Ergänzungen in `app/css/azubi-planer.css`. **Alle Logik-Helfer werden wiederverwendet** (siehe Reuse-Tabelle). Datenmodell, Backend und Modal-HTML (`app/azubi-planer.html`) bleiben unverändert.

**Tech Stack:** Vanilla JS, bestehende Design-Tokens/Komponenten (`badge`, `avatar`, `card`, `btn`, `form-control`, `var(--sp-*)`), bestehende Modals (`zuweisungModal`, `zuweisungDeleteModal`). Verifikation visuell (Server + Strg+F5 / Playwright-Edge).

**Bezug:** [Spec](../specs/2026-06-16-azubi-planer-zugriff-admin-umbau-design.md) Schritt 3. Nutzer-Entscheidung: Master-Detail (listen-fokussiert).

### Wiederverwenden (BEHALTEN, unverändert)
| Helfer | Zeilen (alt) |
|---|---|
| Datenladung `DB.getVerantwortliche()` / `getAzubis()` / `getAllZuweisungen()` / `getZuweisungenFuerAzubi()` / `getUser()` | 45-46 u.a. |
| `loadZuwRowData()` → `zuwRowData = [{z, azubi, ausb, status}]` | 297-304 |
| `zuweisungStatus(z)` → `{key,label,badge}` | 71-76 |
| `colorIndexFor(id)`, `getBarColor(idx)`, `COLORS` | 23-29, 56-68, 493-499 |
| `computeKpis()` / `buildKpis()` | 79-106 |
| Modal-CRUD: `initZuweisungModal()`, `initZuweisungDeleteModal()`, `DB.addZuweisung/deleteZuweisung` | 452-491 |
| Gantt: `buildGanttHeader()`, `buildGanttRows()`, `buildGanttBars()` | 197-285 |

### Neu bauen
Master-Detail-Layout (Liste + Detailpanel), Filterleiste, Signal-Chips, `getAktuelleZuweisung(azubiId)`, einklappbare Gantt-Sektion, zugehöriges CSS.

**v1-Scope:** Anlegen (vorausgewählter Azubi) + Löschen über die bestehenden Modals. **Kein** Inline-Edit (Update-Endpunkt fehlt; Korrektur = löschen + neu). Kein Mehrjahres-Gantt-Umbau (Gantt bleibt wie bisher, nur eingeklappt).

---

### Task 1: State + Helfer für Master-Detail

**Files:** Modify `app/js/azubi-planer.js`

- [ ] **Step 1: Neue State-Variablen + Helfer ergänzen**

Bei den bestehenden State-Variablen (`let searchText = '';` ~Zeile 35) ergänzen:
```js
  let selectedAzubiId = null;          // im Detailpanel gewählter Azubi
  let filterVerantw = '';              // Filter: Verantwortliche-OID ('' = alle)
  let filterAbteilung = '';            // Filter: Abteilung ('' = alle)
  let filterLehrjahr = '';             // Filter: Lehrjahr ('' = alle)
  let nurOhneZuweisung = false;        // Schnellfilter
```

Nahe `computeKpis()` (nach ~Zeile 90) diese Helfer ergänzen (nutzen das bereits geladene `zuwRowData`):
```js
  // Aktuell aktive Zuweisung eines Azubis (oder null).
  function getAktuelleZuweisung(azubiId) {
    return zuwRowData.find(r => r.z.azubiId === azubiId && r.status.key === 'aktuell') || null;
  }
  // Lehrjahr aus ausbildungsBeginn (1..4), wie in der Wochenansicht.
  function lehrjahrVon(azubi) {
    if (!azubi?.ausbildungsBeginn) return null;
    const start = new Date(azubi.ausbildungsBeginn + 'T00:00:00');
    const m = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    return Math.max(1, Math.min(4, Math.floor(m / 12) + 1));
  }
  // Alle Abteilungs-Namen (für den Abteilungs-Filter), dedupliziert/sortiert.
  function alleAbteilungen() {
    return [...new Set(zuwRowData.map(r => r.z.abteilung).filter(Boolean))].sort();
  }
  // Azubi-Liste nach allen aktiven Filtern.
  function gefilterteAzubis() {
    return azubis.filter(a => {
      if (searchText && !(`${a.name} ${a.beruf || ''}`.toLowerCase().includes(searchText))) return false;
      const akt = getAktuelleZuweisung(a.id);
      if (nurOhneZuweisung && akt) return false;
      if (filterVerantw && akt?.z.ausbilderId !== filterVerantw) return false;
      if (filterAbteilung && akt?.z.abteilung !== filterAbteilung) return false;
      if (filterLehrjahr && String(lehrjahrVon(a)) !== filterLehrjahr) return false;
      return true;
    });
  }
```

- [ ] **Step 2: Parse-Check**
Run: `node -e "new Function(require('fs').readFileSync('app/js/azubi-planer.js','utf8')); console.log('parse ok')"` → `parse ok`.

- [ ] **Step 3: Commit**
```bash
git add app/js/azubi-planer.js && git commit -m "feat(planer): State + Helfer fuer Master-Detail (Filter, aktuelle Zuweisung, Lehrjahr)"
```

---

### Task 2: Neues Layout in `render()` (Liste + Detail + Filterleiste + Signal-Chips + einklappbarer Gantt)

**Files:** Modify `app/js/azubi-planer.js` (`render()`, ~126-195)

- [ ] **Step 1: `render()`-Template auf Master-Detail umbauen**

Ersetze die drei Zonen im `main.innerHTML` von `render()` durch folgende Struktur (KPIs oben bleiben via `buildKpis()`; danach Filterleiste + Signal-Chips; danach Master-Detail-Grid; unten einklappbarer Gantt). Konkret das `main.innerHTML = \`...\`` so aufbauen:
```js
    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Azubi-Planer</h1>
          <p class="page-subtitle">Zuweisungen von Auszubildenden zu Verantwortlichen verwalten.</p>
        </div>
        <button class="btn btn-secondary" id="newZuweisungBtn">+ Zuweisung</button>
      </div>

      ${buildKpis()}

      <div class="planer-filterbar">
        <div class="planer-search">
          <input type="search" id="azubiSearch" class="form-control" placeholder="Azubi suchen …" value="${searchText}">
        </div>
        <select class="form-control" id="filterVerantw">${buildVerantwOptions()}</select>
        <select class="form-control" id="filterAbteilung">${buildAbteilungOptions()}</select>
        <select class="form-control" id="filterLehrjahr">${buildLehrjahrOptions()}</select>
        <label class="planer-quickfilter">
          <input type="checkbox" id="filterNurOhne" ${nurOhneZuweisung ? 'checked' : ''}> nur ohne aktuelle Zuweisung
        </label>
      </div>

      <div class="planer-master">
        <div class="planer-list" id="planerList">${buildAzubiListe()}</div>
        <div class="planer-detail" id="planerDetail">${buildDetail(selectedAzubiId)}</div>
      </div>

      <details class="planer-gantt-details">
        <summary>Gesamt-Timeline (${planYear})</summary>
        <div class="gantt-wrap">
          ${buildGanttHeader()}
          <div class="gantt-body">${ganttRowsHtml}</div>
        </div>
      </details>
    `;
```
Die Filter-Options-Builder ergänzen (nahe `buildKpis`):
```js
  function buildVerantwOptions() {
    return `<option value="">Alle Verantwortlichen</option>` +
      ausbilder.map(a => `<option value="${a.id}" ${a.id === filterVerantw ? 'selected' : ''}>${a.name}</option>`).join('');
  }
  function buildAbteilungOptions() {
    return `<option value="">Alle Abteilungen</option>` +
      alleAbteilungen().map(ab => `<option value="${ab}" ${ab === filterAbteilung ? 'selected' : ''}>${ab}</option>`).join('');
  }
  function buildLehrjahrOptions() {
    return `<option value="">Alle Lehrjahre</option>` +
      [1,2,3,4].map(j => `<option value="${j}" ${String(j) === filterLehrjahr ? 'selected' : ''}>${j}. Lehrjahr</option>`).join('');
  }
```

- [ ] **Step 2: Event-Binding in `render()` aktualisieren**

Nach dem Setzen von `main.innerHTML` die bestehenden Listener so anpassen/ergänzen (newZuweisungBtn bleibt; Suche re-rendert jetzt Liste; Filter-Selects + Quickfilter re-rendern Liste; Klick auf Listeneintrag wählt Azubi):
```js
    document.getElementById('newZuweisungBtn')?.addEventListener('click', () => openNewZuweisung());

    const rerenderList = () => {
      document.getElementById('planerList').innerHTML = buildAzubiListe();
      bindListEvents();
    };
    document.getElementById('azubiSearch')?.addEventListener('input', (e) => { searchText = e.target.value.toLowerCase(); rerenderList(); });
    document.getElementById('filterVerantw')?.addEventListener('change', (e) => { filterVerantw = e.target.value; rerenderList(); });
    document.getElementById('filterAbteilung')?.addEventListener('change', (e) => { filterAbteilung = e.target.value; rerenderList(); });
    document.getElementById('filterLehrjahr')?.addEventListener('change', (e) => { filterLehrjahr = e.target.value; rerenderList(); });
    document.getElementById('filterNurOhne')?.addEventListener('change', (e) => { nurOhneZuweisung = e.target.checked; rerenderList(); });

    bindListEvents();
    initZuweisungModal();         // bestehend
    // Delete-Modal einmalig (außerhalb render, s. bestehende Bindung Zeile 503)
```
Und `bindListEvents()` neu definieren (Klick wählt Azubi → Detail neu rendern):
```js
  function bindListEvents() {
    document.querySelectorAll('.planer-list-item[data-azubi-id]').forEach(el => {
      el.addEventListener('click', () => {
        selectedAzubiId = el.dataset.azubiId;
        document.getElementById('planerDetail').innerHTML = buildDetail(selectedAzubiId);
        bindDetailEvents();
        document.querySelectorAll('.planer-list-item').forEach(x => x.classList.toggle('selected', x.dataset.azubiId === selectedAzubiId));
      });
    });
  }
```

- [ ] **Step 3: Parse-Check + Commit**
Run parse-check (wie Task 1). Commit:
```bash
git add app/js/azubi-planer.js && git commit -m "feat(planer): Master-Detail-Layout (Filterleiste, Liste, Detail, einklappbarer Gantt)"
```

---

### Task 3: Azubi-Liste + Detailpanel rendern

**Files:** Modify `app/js/azubi-planer.js`

- [ ] **Step 1: `buildAzubiListe()` + `buildDetail()` + `bindDetailEvents()` ergänzen**

```js
  // Linke Liste: ein Eintrag je (gefiltertem) Azubi mit aktueller Zuweisung/Status.
  function buildAzubiListe() {
    const list = gefilterteAzubis();
    if (!list.length) return `<div class="planer-empty">Keine Azubis für die aktuelle Filterung.</div>`;
    return list.map(a => {
      const akt = getAktuelleZuweisung(a.id);
      const lj = lehrjahrVon(a);
      let badge, sub;
      if (!akt) { badge = `<span class="badge badge--abgelehnt">Keine Zuweisung</span>`; sub = '—'; }
      else {
        const farbe = getBarColor(colorIndexFor(akt.z.ausbilderId));
        badge = `<span class="badge ${akt.status.badge}">${akt.status.label}</span>`;
        sub = `<span class="planer-dot" style="background:${farbe}"></span>${akt.z.abteilung || '–'} · ${akt.ausb?.name || '–'}`;
      }
      return `
        <button class="planer-list-item ${a.id === selectedAzubiId ? 'selected' : ''}" data-azubi-id="${a.id}">
          <div class="avatar avatar--sm">${a.initials}</div>
          <div class="planer-list-item__main">
            <div class="planer-list-item__name">${a.name}${lj ? ` <span class="planer-list-item__lj">${lj}. LJ</span>` : ''}</div>
            <div class="planer-list-item__sub">${sub}</div>
          </div>
          ${badge}
        </button>`;
    }).join('');
  }

  // Rechtes Detailpanel: Rotationsplan des gewählten Azubis.
  function buildDetail(azubiId) {
    if (!azubiId) return `<div class="planer-detail__empty">Azubi links auswählen, um den Rotationsplan zu sehen.</div>`;
    const azubi = azubis.find(a => a.id === azubiId);
    if (!azubi) return `<div class="planer-detail__empty">Azubi nicht gefunden.</div>`;
    // Alle Zuweisungen dieses Azubis aus zuwRowData, chronologisch.
    const rows = zuwRowData.filter(r => r.z.azubiId === azubiId)
      .sort((a, b) => a.z.von.localeCompare(b.z.von));
    const liste = rows.length ? rows.map(r => {
      const farbe = getBarColor(colorIndexFor(r.z.ausbilderId));
      return `
        <div class="rotation-item">
          <span class="planer-dot" style="background:${farbe}"></span>
          <div class="rotation-item__main">
            <div class="rotation-item__abt">${r.z.abteilung || '–'}</div>
            <div class="rotation-item__meta">${r.ausb?.name || '–'} · ${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}</div>
          </div>
          <span class="badge ${r.status.badge}">${r.status.label}</span>
          <button class="btn btn-sm btn-ghost detail-delete-btn" data-id="${r.z.id}" title="Löschen">✕</button>
        </div>`;
    }).join('') : `<div class="planer-empty">Noch keine Zuweisungen.</div>`;
    return `
      <div class="planer-detail__header">
        <div>
          <h2 class="planer-detail__name">${azubi.name}</h2>
          <p class="planer-detail__beruf">${azubi.beruf || ''}</p>
        </div>
        <button class="btn btn-sm btn-secondary detail-add-btn" data-azubi-id="${azubiId}">+ Zuweisung</button>
      </div>
      <div class="rotation-list">${liste}</div>`;
  }

  // Detailpanel-Events: Anlegen (vorausgewählt) + Löschen.
  function bindDetailEvents() {
    document.querySelector('.detail-add-btn')?.addEventListener('click', (e) => openNewZuweisung(e.currentTarget.dataset.azubiId));
    document.querySelectorAll('.detail-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDeleteZuweisungId = parseInt(btn.dataset.id);
        const row = zuwRowData.find(r => r.z.id === pendingDeleteZuweisungId);
        const textEl = document.getElementById('zuweisungDeleteText');
        if (textEl) textEl.textContent = row?.azubi
          ? `Die Zuweisung von „${row.azubi.name}" wird unwiderruflich entfernt. Möchtest du fortfahren?`
          : 'Diese Zuweisung wird unwiderruflich entfernt. Möchtest du fortfahren?';
        Modal.open('zuweisungDeleteModal');
      });
    });
  }
```

- [ ] **Step 2: `openNewZuweisung()` um Vorauswahl erweitern**

Ersetze `openNewZuweisung()` (alt ~465-471) durch:
```js
  function openNewZuweisung(presetAzubiId) {
    const azubiSel = document.getElementById('zuweisungAzubi');
    const ausbilderSel = document.getElementById('zuweisungAusbilder');
    if (azubiSel) azubiSel.innerHTML = azubis.map(a => `<option value="${a.id}" ${a.id === presetAzubiId ? 'selected' : ''}>${a.name}</option>`).join('');
    if (ausbilderSel) ausbilderSel.innerHTML = ausbilder.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    Modal.open('zuweisungModal');
  }
```
(Nach erfolgreichem Anlegen/Löschen ruft das bestehende Modal `await render()` auf — danach `bindDetailEvents()` ist durch das render→bindListEvents-Reselect abgedeckt; falls `selectedAzubiId` gesetzt ist, das Detailpanel wird im neuen `render()` mitgerendert.)

- [ ] **Step 3: Parse-Check + Commit**
Parse-check, dann:
```bash
git add app/js/azubi-planer.js && git commit -m "feat(planer): Azubi-Liste + Rotationsplan-Detailpanel + Anlegen vorausgewaehlt"
```

---

### Task 4: CSS für Master-Detail

**Files:** Modify `app/css/azubi-planer.css`

- [ ] **Step 1: Layout-Klassen ergänzen** (an den vorhandenen Token-/Komponentenstil anlehnen: `var(--sp-*)`, `var(--pm-grey-*)`, `card`-ähnliche Flächen)

Mindestens diese Klassen stilisieren (Werte im bestehenden Stil wählen):
- `.planer-filterbar` — flex/wrap, Abstand; Kinder (`.planer-search` input, selects) kompakt nebeneinander; `.planer-quickfilter` als Label mit Checkbox.
- `.planer-master` — CSS-Grid `grid-template-columns: minmax(320px, 0.9fr) 1.4fr; gap: var(--sp-5);` (auf schmal < ~900px: einspaltig, Detail unter Liste).
- `.planer-list` — scrollbarer Container (`max-height: 62vh; overflow:auto`), Kartenfläche.
- `.planer-list-item` — Button, volle Breite, flex (avatar | main | badge), Hover/`.selected`-Hervorhebung (linker Akzentbalken), `text-align:left`.
- `.planer-list-item__name/__sub/__lj`, `.planer-dot` (10px Kreis), `.planer-detail`, `.planer-detail__header/__name/__beruf/__empty`.
- `.rotation-list`, `.rotation-item` (flex: dot | main | badge | delete), `.rotation-item__abt/__meta`.
- `.planer-gantt-details > summary` — als klickbarer Abschnittstitel; offener Zustand zeigt den vorhandenen `.gantt-wrap`.
- `.planer-empty` — zentrierter Leerzustandstext.

Responsive: `@media (max-width: 900px) { .planer-master { grid-template-columns: 1fr; } }`.

- [ ] **Step 2: Commit**
```bash
git add app/css/azubi-planer.css && git commit -m "feat(planer): CSS fuer Master-Detail-Layout (Filterbar, Liste, Detail, Rotation)"
```

---

### Task 5: Verifikation (visuell, zentral)

**Files:** keine Änderung.

- [ ] **Step 1:** Server-Neustart (für `users.js`/exclRole, damit das Modal-Dropdown nur Nicht-Azubis zeigt) + Strg+F5.
- [ ] **Step 2:** Als Personalabteilung (`…0004`) den Planer öffnen:
  - Azubi-Liste links zeigt alle Azubis mit aktueller Abteilung·Verantwortliche/r + Status (oder „Keine Zuweisung").
  - Filter (Verantwortliche/Abteilung/Lehrjahr/„nur ohne") grenzen die Liste ein; Suche funktioniert.
  - Klick auf Azubi → rechts Rotationsplan; „+ Zuweisung" öffnet Modal mit vorausgewähltem Azubi; Anlegen + Löschen aktualisieren Liste & Detail.
  - Verantwortlichen-Dropdown im Modal listet **nur Nicht-Azubis**.
  - „Gesamt-Timeline" einklappbar; KPIs oben stimmen.
- [ ] **Step 3:** Bei 30–60 Azubis: Liste scrollt flüssig; Layout bleibt stabil (kein horizontales Scrollen der Seite).

---

## Nicht in dieser Phase
- Inline-Bearbeiten bestehender Zuweisungen (braucht `PUT /api/zuweisungen/:id` + Frontend) — derzeit löschen + neu.
- Mehrjahres-Gantt / Sticky-Gantt-Header (Gantt bleibt einklappbare Jahresübersicht).
- Anhang-Download-Härtung (separat).
