# Auto-Complete für häufige Tätigkeiten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Typeahead-Eingabehilfe im Tätigkeitsfeld der Wochenansicht, die während des Tippens zeilenweise Tätigkeiten aus der eigenen Historie des Azubis vorschlägt.

**Architecture:** Drei entkoppelte Vanilla-JS-Einheiten — eine reine, testbare Daten-/Ranking-Schicht (`activity-suggestions.js`), ein DOM-/ARIA-/Keyboard-UI-Controller, der sich an eine bestehende Quill-Instanz hängt (`activity-autocomplete.js`), und die Verdrahtung in `wochenansicht.js`. Die Vorschläge werden rein clientseitig aus bereits geladenen Wochendaten berechnet; kein Backend-Eingriff.

**Tech Stack:** Vanilla JS (kein Build), Quill 1.3.7 (CDN), CSS Custom Properties (Design-Tokens), `node:test` für Unit-Tests.

## Global Constraints

- **Kein Backend-Eingriff** — Feature ist rein clientseitig (`DB.getWochenFuerAzubi`).
- **Kein Build-Step / keine neuen Laufzeit-Abhängigkeiten** — reines Vanilla-JS, per `<script>` geladen.
- **Dual-Export-Muster** (wie `ihk-parser.js`): `global.X = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;` mit IIFE-Wrapper `(function(global){…})(typeof window !== 'undefined' ? window : globalThis);`.
- **Datenbasis: nur eigene Historie** des Azubis. Keine globale Liste, kein Fremd-Pool.
- **Granularität: zeilenweise** Tätigkeit (eine Zeile/ein Stichpunkt = ein Vorschlag).
- **Vorschläge pro Kind getrennt:** `betrieb` / `schule` / `unterweisung`.
- **Nur im bearbeitbaren Azubi-View aktiv** — nie in Readonly/Ausbilder-Sicht.
- **Max. 7 Vorschläge** gleichzeitig.
- **Tastatur:** ↑ ↓ Enter Esc Tab; **ARIA-Combobox** (listbox/option, `aria-activedescendant`).
- **Freitext immer erlaubt**, keine Pflichtauswahl, kein Auto-Einfügen.
- **Theming über Design-Tokens** (`--pm-*`, `--z-toast` etc.) — kein Hardcoding von Farben.
- **Tests:** `node:test` + `node:assert/strict`, kolokiert als `*.test.js`, Lauf via `node --test <datei>`.
- **Spec:** `docs/superpowers/specs/2026-06-24-autocomplete-taetigkeiten-design.md`.

## File Structure

**Neu:**
- `app/js/activity-suggestions.js` — reine Daten-/Ranking-Logik + In-Memory-Cache. Kein DOM.
- `app/js/activity-suggestions.test.js` — Unit-Tests (`node:test`).
- `app/js/activity-autocomplete.js` — UI-Controller (Dropdown, Positionierung, Keyboard, ARIA). Kein DB-Wissen.
- `app/css/activity-autocomplete.css` — Styling des Dropdowns, themt über Tokens.

**Geändert:**
- `app/wochenansicht.html` — ein `<link>` (CSS) + zwei `<script>` (die neuen JS-Dateien).
- `app/js/wochenansicht.js` — Registry + `detachAllAutocompletes()`, `ensureSuggestionIndex()`, `attachActivityAutocomplete()`, Aufrufe in `render()`, `initSingleDayEditor`, `initSingleWochenEditor`.

**Task-Abhängigkeiten:** Task 1 → 2 (gleiche Datei, Querying baut auf Index auf). Task 3 (Controller + CSS) hängt logisch nur von Tasks 1–2 ab. Task 4 (Integration) hängt von allen ab.

---

### Task 1: `activity-suggestions.js` — Textzerlegung & Index-Aufbau

**Files:**
- Create: `app/js/activity-suggestions.js`
- Test: `app/js/activity-suggestions.test.js`

**Interfaces:**
- Produces:
  - `htmlToLines(html: string) -> string[]` — Eintrags-HTML → getrimmte Klartextzeilen (leere entfallen).
  - `normalize(line: string) -> string` — Vergleichsschlüssel (lowercase, Akzente weg, Whitespace normalisiert).
  - `buildIndex(wochen: object[]) -> { betrieb: Map, schule: Map, unterweisung: Map }`, jede Map `Map<normKey, { text, count, lastDate }>`.
  - `KINDS = ['betrieb','schule','unterweisung']`.

- [ ] **Step 1: Failing test für `htmlToLines` + `normalize` schreiben**

Create `app/js/activity-suggestions.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./activity-suggestions.js');

test('htmlToLines: splittet Absätze und Listen in Zeilen', () => {
  const html = '<p>Wartung der Pumpe</p><ul><li>Förderband geölt</li><li>Doku erstellt</li></ul>';
  assert.deepEqual(S.htmlToLines(html), ['Wartung der Pumpe', 'Förderband geölt', 'Doku erstellt']);
});

test('htmlToLines: <br> trennt, leere Zeilen entfallen, &nbsp; wird Space', () => {
  const html = '<p>Zeile A<br>Zeile&nbsp;B</p><p><br></p>';
  assert.deepEqual(S.htmlToLines(html), ['Zeile A', 'Zeile B']);
});

test('htmlToLines: leerer/Nullwert und leere Absätze → []', () => {
  assert.deepEqual(S.htmlToLines(''), []);
  assert.deepEqual(S.htmlToLines(null), []);
  assert.deepEqual(S.htmlToLines('<p><br></p>'), []);
});

test('normalize: lowercase, Akzente entfernt, Whitespace normalisiert', () => {
  assert.equal(S.normalize('  Wärtung  der   PÜMPE '), 'wartung der pumpe');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: FAIL — `Cannot find module './activity-suggestions.js'`.

- [ ] **Step 3: Datei mit Scaffold + `htmlToLines` + `normalize` anlegen**

Create `app/js/activity-suggestions.js`:

```js
/* ===================================================================
   ACTIVITY-SUGGESTIONS.JS
   Datenbasis & Ranking für die Tätigkeiten-Auto-Complete.
   Reine Logik (kein DOM). Dual-Export: Browser-Global + node:test.
   =================================================================== */
(function (global) {
  'use strict';

  const KINDS = ['betrieb', 'schule', 'unterweisung'];

  // HTML eines Eintrags → Klartextzeilen (eine je Block / Stichpunkt).
  function htmlToLines(html) {
    if (!html) return [];
    let s = String(html);
    // Block-/Zeilengrenzen in \n wandeln, dann restliche Tags strippen.
    s = s.replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6]|\/blockquote)\s*\/?\s*>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/gi, ' ')
         .replace(/&amp;/gi, '&')
         .replace(/&lt;/gi, '<')
         .replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"')
         .replace(/&#39;/gi, "'");
    return s.split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(line => line.length > 0);
  }

  // Vergleichsschlüssel: lowercase, Akzente weg, Whitespace normalisiert.
  // (Nur für den VERGLEICH, nie für Positionsberechnung — NFD ist nicht
  // längenerhaltend.)
  function normalize(line) {
    const decomposed = String(line || '').normalize('NFD');
    let out = '';
    for (let i = 0; i < decomposed.length; i++) {
      const c = decomposed.charCodeAt(i);
      if (c >= 0x0300 && c <= 0x036f) continue;   // kombinierende Diakritika
      out += decomposed[i];
    }
    return out.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const api = { htmlToLines, normalize, KINDS };
  global.ActivitySuggestions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: PASS (4 Tests grün).

- [ ] **Step 5: Failing test für `buildIndex` ergänzen**

Append to `app/js/activity-suggestions.test.js`:

```js
test('buildIndex: zählt Häufigkeit pro Kind und merkt lastDate', () => {
  const wochen = [
    { startDate: '2026-01-05', endDate: '2026-01-11', tage: [
      { datum: '2026-01-05', betriebEintrag: '<p>Wartung Pumpe</p>' },
      { datum: '2026-01-06', betriebEintrag: '<p>Wartung Pumpe</p><p>Doku</p>' },
      { datum: '2026-01-07', schuleEintrag: '<p>Mathe</p>' },
    ] },
  ];
  const idx = S.buildIndex(wochen);
  const w = idx.betrieb.get('wartung pumpe');
  assert.equal(w.count, 2);
  assert.equal(w.lastDate, '2026-01-06');
  assert.equal(idx.betrieb.get('doku').count, 1);
  assert.equal(idx.schule.get('mathe').count, 1);
  assert.equal(idx.unterweisung.size, 0);
});

test('buildIndex: Alt-Feld eintrag wird als betrieb gewertet', () => {
  const idx = S.buildIndex([{ tage: [{ datum: '2026-02-01', eintrag: '<p>Altbestand</p>' }] }]);
  assert.equal(idx.betrieb.get('altbestand').count, 1);
});

test('buildIndex: Wochen-Ebene (wöchentliches Format) wird erfasst', () => {
  const idx = S.buildIndex([{ endDate: '2026-03-01', betriebEintrag: '<p>Projektarbeit</p>' }]);
  assert.equal(idx.betrieb.get('projektarbeit').count, 1);
  assert.equal(idx.betrieb.get('projektarbeit').lastDate, '2026-03-01');
});

test('buildIndex: leere/fehlende Eingabe → leere Maps', () => {
  const idx = S.buildIndex(null);
  assert.equal(idx.betrieb.size, 0);
  assert.equal(idx.schule.size, 0);
  assert.equal(idx.unterweisung.size, 0);
});
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: FAIL — `S.buildIndex is not a function`.

- [ ] **Step 7: `buildIndex` implementieren**

In `app/js/activity-suggestions.js`, **vor** der `const api = …`-Zeile einfügen:

```js
  // wochen: Array normalisierter Wochen (wie DB.getWochenFuerAzubi liefert).
  // → { betrieb: Map, schule: Map, unterweisung: Map }, je Map
  //   Map<normalize(line), { text, count, lastDate }>.
  function buildIndex(wochen) {
    const index = { betrieb: new Map(), schule: new Map(), unterweisung: new Map() };

    function addLines(kind, html, dateStr) {
      const map = index[kind];
      htmlToLines(html).forEach(text => {
        const key = normalize(text);
        if (!key) return;
        const prev = map.get(key);
        if (prev) {
          prev.count += 1;
          if (dateStr && dateStr > prev.lastDate) { prev.lastDate = dateStr; prev.text = text; }
        } else {
          map.set(key, { text, count: 1, lastDate: dateStr || '' });
        }
      });
    }

    (wochen || []).forEach(woche => {
      const wDate = woche.endDate || woche.startDate || '';
      addLines('betrieb', woche.betriebEintrag, wDate);
      addLines('schule', woche.schuleEintrag, wDate);
      addLines('unterweisung', woche.unterweisungEintrag, wDate);
      (woche.tage || []).forEach(tag => {
        const d = tag.datum || wDate;
        addLines('betrieb', tag.betriebEintrag || tag.eintrag, d);
        addLines('schule', tag.schuleEintrag, d);
        addLines('unterweisung', tag.unterweisungEintrag, d);
      });
    });

    return index;
  }
```

Und die `api`-Zeile ersetzen durch:

```js
  const api = { htmlToLines, normalize, buildIndex, KINDS };
```

- [ ] **Step 8: Test laufen lassen, Erfolg prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: PASS (8 Tests grün).

- [ ] **Step 9: Commit**

```bash
git add app/js/activity-suggestions.js app/js/activity-suggestions.test.js
git commit -m "feat(autocomplete): Textzerlegung & Index-Aufbau für Tätigkeitsvorschläge"
```

---

### Task 2: `activity-suggestions.js` — Ranking, Bump & Cache

**Files:**
- Modify: `app/js/activity-suggestions.js`
- Test: `app/js/activity-suggestions.test.js`

**Interfaces:**
- Consumes (aus Task 1): `htmlToLines`, `normalize`, `buildIndex`, `KINDS`.
- Produces:
  - `query(index, kind: string, q: string, limit=7) -> Array<{ text, matchStart, matchLen }>` — gerankte Treffer; `matchStart=-1` = kein Highlight.
  - `bump(index, kind: string, text: string, today: string) -> void` — übernommene Zeile höher gewichten.
  - `ensure(azubiId: string, fetcher?) -> Promise<Index>` — Index einmal pro `azubiId` bauen + cachen; `fetcher(azubiId)->Promise<wochen[]>`, Default `DB.getWochenFuerAzubi`.
  - `invalidate(azubiId?) -> void` — Cache (gezielt oder ganz) leeren.

- [ ] **Step 1: Failing tests für `query` + `bump` schreiben**

Append to `app/js/activity-suggestions.test.js`:

```js
test('query: leerer Query liefert Top nach Häufigkeit, ohne Highlight', () => {
  const idx = { betrieb: new Map([
    ['a', { text: 'Aufräumen', count: 1, lastDate: '2026-01-01' }],
    ['b', { text: 'Bohren', count: 5, lastDate: '2026-01-01' }],
    ['c', { text: 'CNC fräsen', count: 3, lastDate: '2026-02-01' }],
  ]), schule: new Map(), unterweisung: new Map() };
  const res = S.query(idx, 'betrieb', '', 2);
  assert.deepEqual(res.map(r => r.text), ['Bohren', 'CNC fräsen']);
  assert.equal(res[0].matchStart, -1);
});

test('query: Voll-Präfix rankt vor Token-Präfix', () => {
  const idx = { betrieb: new Map([
    ['wartung pumpe', { text: 'Wartung Pumpe', count: 2, lastDate: '2026-01-01' }],
    ['pumpe wartung', { text: 'Pumpe Wartung', count: 9, lastDate: '2026-01-01' }],
  ]), schule: new Map(), unterweisung: new Map() };
  const res = S.query(idx, 'betrieb', 'wart', 5);
  assert.deepEqual(res.map(r => r.text), ['Wartung Pumpe', 'Pumpe Wartung']);
});

test('query: Highlight-Position im Originaltext', () => {
  const idx = { betrieb: new Map([
    ['wartung pumpe', { text: 'Wartung Pumpe', count: 1, lastDate: '' }],
  ]), schule: new Map(), unterweisung: new Map() };
  const res = S.query(idx, 'betrieb', 'wart', 5);
  assert.equal(res[0].matchStart, 0);
  assert.equal(res[0].matchLen, 4);
});

test('query: exakter Treffer (= bereits getippt) wird ausgelassen', () => {
  const idx = { betrieb: new Map([
    ['wartung pumpe', { text: 'Wartung Pumpe', count: 1, lastDate: '' }],
  ]), schule: new Map(), unterweisung: new Map() };
  assert.deepEqual(S.query(idx, 'betrieb', 'Wartung Pumpe', 5), []);
});

test('query: limit begrenzt die Trefferzahl', () => {
  const m = new Map();
  for (let i = 0; i < 20; i++) m.set('t' + i, { text: 'Task ' + i, count: i, lastDate: '' });
  const idx = { betrieb: m, schule: new Map(), unterweisung: new Map() };
  assert.equal(S.query(idx, 'betrieb', 'task', 7).length, 7);
});

test('query: leerer Index → []', () => {
  const idx = { betrieb: new Map(), schule: new Map(), unterweisung: new Map() };
  assert.deepEqual(S.query(idx, 'betrieb', 'x', 7), []);
});

test('bump: hebt count und lastDate (today injiziert)', () => {
  const idx = { betrieb: new Map([['wartung pumpe', { text: 'Wartung Pumpe', count: 1, lastDate: '2026-01-01' }]]),
                schule: new Map(), unterweisung: new Map() };
  S.bump(idx, 'betrieb', 'Wartung Pumpe', '2026-06-24');
  const e = idx.betrieb.get('wartung pumpe');
  assert.equal(e.count, 2);
  assert.equal(e.lastDate, '2026-06-24');
});

test('bump: unbekannte Zeile wird neu angelegt', () => {
  const idx = { betrieb: new Map(), schule: new Map(), unterweisung: new Map() };
  S.bump(idx, 'betrieb', 'Bohren', '2026-06-24');
  assert.equal(idx.betrieb.get('bohren').count, 1);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: FAIL — `S.query is not a function`.

- [ ] **Step 3: `query` + `bump` implementieren**

In `app/js/activity-suggestions.js`, **vor** der `const api = …`-Zeile einfügen:

```js
  function cmpByCountRecency(a, b) {
    return b.count - a.count
        || (b.lastDate || '').localeCompare(a.lastDate || '')
        || a.text.localeCompare(b.text);
  }

  // Enthält der normalisierte Text ein Wort, das mit nq beginnt?
  function hasTokenPrefix(nt, nq) {
    const tokens = nt.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].startsWith(nq)) return true;
    }
    return false;
  }

  // Highlight-Position im ORIGINAL-Text (case-insensitiv). Literaler Treffer;
  // scheitert er (z.B. Akzent-Differenz), { start: -1 }.
  function locateHighlight(text, q) {
    const qq = String(q || '').trim();
    if (!qq) return { start: -1, len: 0 };
    const idx = text.toLowerCase().indexOf(qq.toLowerCase());
    return idx >= 0 ? { start: idx, len: qq.length } : { start: -1, len: 0 };
  }

  // index, kind, roher Query-String → bis zu `limit` Treffer
  // { text, matchStart, matchLen }. matchStart === -1 ⇒ kein Highlight.
  function query(index, kind, q, limit) {
    limit = limit || 7;
    const map = index && index[kind];
    if (!map || map.size === 0) return [];

    const entries = Array.from(map.values());
    const nq = normalize(q);

    if (!nq) {
      return entries.slice().sort(cmpByCountRecency).slice(0, limit)
        .map(e => ({ text: e.text, matchStart: -1, matchLen: 0 }));
    }

    const scored = [];
    entries.forEach(e => {
      const nt = normalize(e.text);
      if (nt === nq) return;                  // exakt = schon getippt → raus
      let rank = -1;
      if (nt.startsWith(nq)) rank = 0;        // Voll-Präfix
      else if (hasTokenPrefix(nt, nq)) rank = 1; // Token-Präfix
      if (rank === -1) return;
      const hl = locateHighlight(e.text, q);
      scored.push({ text: e.text, rank, count: e.count, lastDate: e.lastDate,
                    matchStart: hl.start, matchLen: hl.len });
    });

    scored.sort((a, b) =>
      a.rank - b.rank
      || b.count - a.count
      || (b.lastDate || '').localeCompare(a.lastDate || '')
      || a.text.localeCompare(b.text));

    return scored.slice(0, limit)
      .map(e => ({ text: e.text, matchStart: e.matchStart, matchLen: e.matchLen }));
  }

  // Übernommene Zeile höher gewichten. today = ISO 'YYYY-MM-DD' (injiziert,
  // keine versteckte Date-Abhängigkeit in der reinen Logik).
  function bump(index, kind, text, today) {
    const map = index && index[kind];
    if (!map) return;
    const key = normalize(text);
    if (!key) return;
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
      if (today && today > prev.lastDate) prev.lastDate = today;
      prev.text = text;
    } else {
      map.set(key, { text, count: 1, lastDate: today || '' });
    }
  }
```

Und die `api`-Zeile ersetzen durch:

```js
  const api = { htmlToLines, normalize, buildIndex, query, bump, KINDS };
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: PASS (16 Tests grün).

- [ ] **Step 5: Failing tests für `ensure` + `invalidate` schreiben**

Append to `app/js/activity-suggestions.test.js`:

```js
test('ensure: baut Index einmal pro azubiId und cached', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return [{ tage: [{ datum: '2026-01-01', betriebEintrag: '<p>X</p>' }] }]; };
  S.invalidate();
  const a = await S.ensure('azubi-1', fetcher);
  const b = await S.ensure('azubi-1', fetcher);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(a.betrieb.get('x').count, 1);
});

test('ensure: invalidate erzwingt Neuaufbau', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return []; };
  S.invalidate();
  await S.ensure('azubi-2', fetcher);
  S.invalidate('azubi-2');
  await S.ensure('azubi-2', fetcher);
  assert.equal(calls, 2);
});
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: FAIL — `S.ensure is not a function`.

- [ ] **Step 7: `ensure` + `invalidate` implementieren**

In `app/js/activity-suggestions.js`, **vor** der `const api = …`-Zeile einfügen:

```js
  const _cache = new Map();   // azubiId -> index

  // Baut den Index einmal pro azubiId und cached ihn.
  // fetcher(azubiId) -> Promise<wochen[]>; Default: DB.getWochenFuerAzubi.
  async function ensure(azubiId, fetcher) {
    if (!azubiId) return buildIndex([]);
    if (_cache.has(azubiId)) return _cache.get(azubiId);
    const fetchFn = fetcher || (id => global.DB.getWochenFuerAzubi(id));
    const wochen = await fetchFn(azubiId);
    const index = buildIndex(wochen);
    _cache.set(azubiId, index);
    return index;
  }

  function invalidate(azubiId) {
    if (azubiId == null) _cache.clear();
    else _cache.delete(azubiId);
  }
```

Und die `api`-Zeile ersetzen durch:

```js
  const api = { htmlToLines, normalize, buildIndex, query, bump, ensure, invalidate, KINDS };
```

- [ ] **Step 8: Test laufen lassen, Erfolg prüfen**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: PASS (18 Tests grün).

- [ ] **Step 9: Commit**

```bash
git add app/js/activity-suggestions.js app/js/activity-suggestions.test.js
git commit -m "feat(autocomplete): Ranking, Bump & per-Azubi-Cache für Vorschläge"
```

---

### Task 3: `activity-autocomplete.js` + CSS — UI-Controller

**Files:**
- Create: `app/js/activity-autocomplete.js`
- Create: `app/css/activity-autocomplete.css`
- Verify: temporäre Harness-Seite `app/_ac-harness.html` (wird am Ende gelöscht, nicht committet)

**Interfaces:**
- Consumes: eine Quill-Instanz; `getSuggestions(q) -> Array<{text,matchStart,matchLen}>` (vom Aufrufer an `ActivitySuggestions.query` gebunden); optional `onAccept(text)`.
- Produces: `ActivityAutocomplete.attach(quill, { kind, getSuggestions, onAccept, limit=7 }) -> { close(), refresh(), destroy() }`.

*Hinweis Verifikation:* Der Controller hängt von echten DOM-/Quill-Events ab und ist im Repo nicht automatisiert testbar (kein jsdom — bewusst, kein neuer Dependency). Verifikation daher per Code-Review + temporärer Harness-Seite, die über den laufenden Backend-Server (`node server.js`, Port 3000) ausgeliefert und mit Edge/Playwright bedient wird.

- [ ] **Step 1: `activity-autocomplete.css` anlegen**

Create `app/css/activity-autocomplete.css`:

```css
/* ===================================================================
   ACTIVITY-AUTOCOMPLETE.CSS
   Typeahead-Dropdown für die Tätigkeitsfelder (Wochenansicht).
   An document.body gehängt (position:fixed), JS setzt left/top.
   Themt automatisch über die Design-Tokens (Light/Dark/Sonder-Themes),
   da diese auf <html data-theme="…"> definiert sind und kaskadieren.
   =================================================================== */

.ac-dropdown {
  position: fixed;
  z-index: var(--z-toast);
  box-sizing: border-box;
  min-width: 220px;
  max-width: 440px;
  max-height: 280px;
  overflow-y: auto;
  padding: var(--sp-1);
  background: var(--pm-white);
  border: 1px solid var(--pm-grey-200);
  border-radius: var(--r-md);
  box-shadow: var(--elev-pop);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--pm-grey-800);
}

.ac-option {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  line-height: var(--lh-snug);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color var(--t-fast);
}

.ac-option:hover,
.ac-option--active {
  background: var(--pm-yellow-bg);
}

.ac-option--active {
  box-shadow: inset 0 0 0 1px var(--pm-yellow-dark);
}

.ac-option__match {
  font-weight: var(--fw-bold);
  color: var(--pm-yellow-darker);
}

@media (prefers-reduced-motion: reduce) {
  .ac-option { transition: none; }
}
```

- [ ] **Step 2: `activity-autocomplete.js` anlegen**

Create `app/js/activity-autocomplete.js`:

```js
/* ===================================================================
   ACTIVITY-AUTOCOMPLETE.JS
   Typeahead-Overlay für Quill-Editoren. Kein DB-Wissen.
   Liest die aktuelle Zeile über die Quill-Text-API, rendert ein an
   document.body gehängtes Dropdown und fängt Navigationstasten nur bei
   offenem Dropdown ab (Capture-Phase auf quill.container, damit Quills
   eigene Keyboard-Bindings nicht zuerst feuern).
   =================================================================== */
(function (global) {
  'use strict';

  let _openController = null;   // nur ein Dropdown global gleichzeitig
  let _idSeq = 0;

  function attach(quill, opts) {
    opts = opts || {};
    const kind = opts.kind || '';
    const getSuggestions = opts.getSuggestions || function () { return []; };
    const onAccept = opts.onAccept || function () {};
    const limit = opts.limit || 7;

    const root = quill.root;                 // .ql-editor (contenteditable)
    const dropdownId = 'ac-dd-' + (++_idSeq);

    let dropdown = null;
    let items = [];
    let activeIdx = -1;
    let open = false;
    let lineStart = 0;
    let queryLen = 0;
    let accepting = false;

    root.setAttribute('aria-autocomplete', 'list');
    root.setAttribute('aria-expanded', 'false');

    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Aktuelle Cursor-Zeile bis zum Cursor als Query lesen.
    function readQuery() {
      const sel = quill.getSelection();
      if (!sel) return null;
      const lineInfo = quill.getLine(sel.index);   // [blot, offsetInLine]
      const line = lineInfo && lineInfo[0];
      if (!line) return null;
      const ls = quill.getIndex(line);
      return { lineStart: ls, cursor: sel.index, q: quill.getText(ls, sel.index - ls) };
    }

    function refresh() {
      const info = readQuery();
      if (!info) return close();
      const list = getSuggestions(info.q.trim()) || [];
      if (!list.length) return close();
      items = list.slice(0, limit);
      lineStart = info.lineStart;
      queryLen = info.cursor - info.lineStart;
      activeIdx = -1;
      renderDropdown();
      position(info.cursor);
      setOpen(true);
    }

    function renderDropdown() {
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'ac-dropdown';
        dropdown.id = dropdownId;
        dropdown.setAttribute('role', 'listbox');
        dropdown.addEventListener('mousedown', onDropdownMousedown);
        dropdown.addEventListener('mousemove', onDropdownMousemove);
        document.body.appendChild(dropdown);
      }
      dropdown.innerHTML = items.map(function (it, i) {
        const on = i === activeIdx;
        return '<div class="ac-option' + (on ? ' ac-option--active' : '') +
          '" role="option" id="' + dropdownId + '-opt-' + i + '" data-idx="' + i +
          '" aria-selected="' + (on ? 'true' : 'false') + '">' + highlight(it) + '</div>';
      }).join('');
    }

    function highlight(it) {
      const text = it.text;
      if (it.matchStart == null || it.matchStart < 0 || !it.matchLen) return esc(text);
      const a = text.slice(0, it.matchStart);
      const b = text.slice(it.matchStart, it.matchStart + it.matchLen);
      const c = text.slice(it.matchStart + it.matchLen);
      return esc(a) + '<span class="ac-option__match">' + esc(b) + '</span>' + esc(c);
    }

    // getBounds ist relativ zu quill.container → dessen Viewport-Rect addieren.
    function position(cursorIndex) {
      const b = quill.getBounds(cursorIndex);
      const r = quill.container.getBoundingClientRect();
      dropdown.style.left = (r.left + b.left) + 'px';
      dropdown.style.top = (r.top + b.top + b.height + 2) + 'px';
    }

    function setOpen(v) {
      open = v;
      root.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (v) {
        root.setAttribute('aria-controls', dropdownId);
        if (_openController && _openController !== controller) _openController.close();
        _openController = controller;
        if (dropdown) dropdown.style.display = 'block';
      } else {
        root.removeAttribute('aria-activedescendant');
        if (dropdown) dropdown.style.display = 'none';
        if (_openController === controller) _openController = null;
      }
    }

    function setActive(i) {
      if (!items.length) return;
      activeIdx = (i + items.length) % items.length;
      const kids = dropdown.children;
      for (let k = 0; k < kids.length; k++) {
        const on = k === activeIdx;
        kids[k].classList.toggle('ac-option--active', on);
        kids[k].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      const activeEl = kids[activeIdx];
      if (activeEl) {
        root.setAttribute('aria-activedescendant', activeEl.id);
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }

    function accept(i) {
      const it = items[i];
      if (!it) return;
      accepting = true;
      quill.deleteText(lineStart, queryLen, 'user');
      quill.insertText(lineStart, it.text, 'user');
      quill.setSelection(lineStart + it.text.length, 0, 'user');
      accepting = false;
      onAccept(it.text);
      close();
    }

    function close() {
      if (open || (dropdown && dropdown.style.display !== 'none')) setOpen(false);
      activeIdx = -1;
    }

    function onKeydown(e) {
      if (!open) return;                       // sonst Quill ganz normal
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActive(activeIdx + 1); break;
        case 'ArrowUp':   e.preventDefault(); e.stopPropagation(); setActive(activeIdx - 1); break;
        case 'Enter':
        case 'Tab':
          if (activeIdx >= 0) { e.preventDefault(); e.stopPropagation(); accept(activeIdx); }
          else { close(); }
          break;
        case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
        default: break;
      }
    }

    function onTextChange(delta, old, source) { if (!accepting && source === 'user') refresh(); }
    function onSelectionChange(range, old, source) {
      if (accepting) return;
      if (!range) { close(); return; }         // blur
      refresh();
    }
    function onDropdownMousedown(e) {
      const opt = e.target.closest('.ac-option');
      if (!opt) return;
      e.preventDefault();                      // Editor-Blur verhindern
      accept(parseInt(opt.getAttribute('data-idx'), 10));
    }
    function onDropdownMousemove(e) {
      const opt = e.target.closest('.ac-option');
      if (opt) setActive(parseInt(opt.getAttribute('data-idx'), 10));
    }
    function onDocPointerDown(e) {
      if (!open) return;
      if (root.contains(e.target)) return;
      if (dropdown && dropdown.contains(e.target)) return;
      close();
    }
    function onReposition() {
      if (!open) return;
      const sel = quill.getSelection();
      if (sel) position(sel.index); else close();
    }

    // Capture-Phase auf container (Vorfahre von root) → vor Quills keydown.
    quill.container.addEventListener('keydown', onKeydown, true);
    quill.on('text-change', onTextChange);
    quill.on('selection-change', onSelectionChange);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);

    const controller = {
      close: close,
      refresh: refresh,
      destroy: function () {
        close();
        quill.container.removeEventListener('keydown', onKeydown, true);
        quill.off('text-change', onTextChange);
        quill.off('selection-change', onSelectionChange);
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        window.removeEventListener('scroll', onReposition, true);
        window.removeEventListener('resize', onReposition);
        if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        dropdown = null;
        ['aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant']
          .forEach(function (a) { root.removeAttribute(a); });
      },
    };

    return controller;
  }

  const api = { attach: attach };
  global.ActivityAutocomplete = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 3: Temporäre Harness-Seite anlegen**

Create `app/_ac-harness.html` (temporär — wird in Step 6 gelöscht, NICHT committen):

```html
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>AC Harness</title>
<link rel="stylesheet" href="https://cdn.quilljs.com/1.3.7/quill.snow.css">
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/activity-autocomplete.css">
<style>body{padding:40px;font-family:sans-serif}#ed{height:160px}</style>
</head><body>
<h3>Autocomplete-Harness (temporär)</h3>
<div id="ed"></div>
<script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script>
<script src="js/activity-suggestions.js"></script>
<script src="js/activity-autocomplete.js"></script>
<script>
  const q = new Quill('#ed', { theme: 'snow' });
  const idx = ActivitySuggestions.buildIndex([{ tage: [
    { datum: '2026-01-01', betriebEintrag: '<p>Wartung der Hydraulikpumpe</p><p>Wartung Förderband</p>' },
    { datum: '2026-01-02', betriebEintrag: '<p>Wartung der Hydraulikpumpe</p><p>Doku erstellt</p>' },
  ]}]);
  ActivityAutocomplete.attach(q, {
    kind: 'betrieb',
    getSuggestions: (s) => ActivitySuggestions.query(idx, 'betrieb', s, 7),
    onAccept: (t) => console.log('accepted:', t),
  });
</script>
</body></html>
```

- [ ] **Step 4: Backend starten (falls nicht schon laufend)**

Run: `cd backend && node server.js` (Port 3000; im Hintergrund/separatem Terminal lassen)
Expected: Server lauscht auf Port 3000.

- [ ] **Step 5: Harness mit Edge/Playwright bedienen und prüfen**

Öffne `http://localhost:3000/_ac-harness.html` (Edge via npx-Playwright). Prüfen:
- **Fokus** ins leere Editorfeld → Dropdown zeigt „Wartung der Hydraulikpumpe" (count 2) zuerst, dann „Wartung Förderband"/„Doku erstellt", kein Highlight.
- **„wart" tippen** → gefilterte Liste, „Wart" in den Treffern fett/gelb hervorgehoben.
- **↓/↑** → Markierung wandert (mit Wrap am Rand), `aria-activedescendant` am Editor gesetzt (DOM prüfen).
- **Enter** auf markiertem Eintrag → Zeile wird durch vollen Text ersetzt, Cursor am Ende, Dropdown zu.
- **Esc** → schließt ohne Änderung; Freitext bleibt.
- **Maus-Klick** auf Eintrag → übernimmt (Konsole zeigt `accepted: …`).
- **Tab** ohne Markierung → schließt und tabbt normal; mit Markierung → übernimmt.

- [ ] **Step 6: Harness-Seite löschen**

```bash
rm app/_ac-harness.html
```
Verify: `git status --short` zeigt `app/_ac-harness.html` NICHT mehr (war nur lokal/untracked).

- [ ] **Step 7: Commit**

```bash
git add app/js/activity-autocomplete.js app/css/activity-autocomplete.css
git commit -m "feat(autocomplete): Quill-Typeahead-Controller + Dropdown-Styling"
```

---

### Task 4: Integration in die Wochenansicht

**Files:**
- Modify: `app/wochenansicht.html`
- Modify: `app/js/wochenansicht.js`

**Interfaces:**
- Consumes: `ActivitySuggestions.{ensure,query,bump}`, `ActivityAutocomplete.attach`, `DateUtil.toISODate`.
- Produces: keine (Endverdrahtung).

- [ ] **Step 1: CSS-Link in `wochenansicht.html` ergänzen**

In `app/wochenansicht.html` ersetzen:

```html
  <link rel="stylesheet" href="https://cdn.quilljs.com/1.3.7/quill.snow.css">
  <link rel="stylesheet" href="css/quill-editor.css">
```

durch:

```html
  <link rel="stylesheet" href="https://cdn.quilljs.com/1.3.7/quill.snow.css">
  <link rel="stylesheet" href="css/quill-editor.css">
  <link rel="stylesheet" href="css/activity-autocomplete.css">
```

- [ ] **Step 2: Die zwei `<script>` in `wochenansicht.html` ergänzen**

In `app/wochenansicht.html` ersetzen:

```html
<script src="js/react-theme-layer.js"></script>
<script src="js/wochenansicht.js"></script>
```

durch:

```html
<script src="js/react-theme-layer.js"></script>
<script src="js/activity-suggestions.js"></script>
<script src="js/activity-autocomplete.js"></script>
<script src="js/wochenansicht.js"></script>
```

- [ ] **Step 3: Registry, Index-Loader & Attach-Helfer in `wochenansicht.js` einfügen**

In `app/js/wochenansicht.js` den Block (Azubi-Kontext-Setup, ~Z. 97–101):

```js
  } else if (!user.istAzubi && !viewAzubiId) {
    // Korrektor ohne Vorauswahl: ersten betreuten Azubi anzeigen
    const firstAzubi = (await DB.getBetreuteAzubis())[0];
    if (firstAzubi) viewAzubiId = firstAzubi.id;
  }
```

ersetzen durch (Helfer direkt dahinter):

```js
  } else if (!user.istAzubi && !viewAzubiId) {
    // Korrektor ohne Vorauswahl: ersten betreuten Azubi anzeigen
    const firstAzubi = (await DB.getBetreuteAzubis())[0];
    if (firstAzubi) viewAzubiId = firstAzubi.id;
  }

  // ── Auto-Complete für Tätigkeiten ─────────────────────────────────
  // Registry aller aktiven Typeahead-Handles; vor jedem Re-Render sauber
  // abgeräumt (Editoren werden pro render() neu erzeugt → kein Leak).
  const activeAutocompletes = [];
  let suggestionIndex = null;        // gecachter Index des aktuellen Azubis
  let suggestionIndexAzubi = null;

  function detachAllAutocompletes() {
    while (activeAutocompletes.length) {
      const ac = activeAutocompletes.pop();
      try { ac.destroy(); } catch (e) { /* idempotent */ }
    }
  }

  // Index lazy laden (fire-and-forget). Nur für den eigenen, bearbeitbaren
  // Azubi-View; Ausbilder/Korrektoren bekommen keine Vorschläge (D5).
  function ensureSuggestionIndex(azubiId) {
    if (isAusbilder || !azubiId || !window.ActivitySuggestions) return;
    if (suggestionIndexAzubi === azubiId && suggestionIndex) return;
    suggestionIndexAzubi = azubiId;
    ActivitySuggestions.ensure(azubiId).then(idx => {
      if (suggestionIndexAzubi === azubiId) suggestionIndex = idx;
    }).catch(() => {});
  }

  // Typeahead an einen frisch erzeugten Quill-Editor hängen.
  function attachActivityAutocomplete(quill, kind) {
    if (isAusbilder) return;                                 // D5
    if (!window.ActivityAutocomplete || !window.ActivitySuggestions) return;
    const azubiId = viewAzubiId || user.id;
    ensureSuggestionIndex(azubiId);
    const ac = ActivityAutocomplete.attach(quill, {
      kind: kind,
      getSuggestions: function (q) {
        return suggestionIndex ? ActivitySuggestions.query(suggestionIndex, kind, q, 7) : [];
      },
      onAccept: function (text) {
        if (suggestionIndex) ActivitySuggestions.bump(suggestionIndex, kind, text, DateUtil.toISODate(new Date()));
      },
    });
    activeAutocompletes.push(ac);
  }
```

- [ ] **Step 4: `detachAllAutocompletes()` am Anfang von `render()` aufrufen**

In `app/js/wochenansicht.js` ersetzen:

```js
  async function render() {
    // Wenn dieser Render durch einen KW-Wechsel ausgelöst wurde, hängen
```

durch:

```js
  async function render() {
    detachAllAutocompletes();
    // Wenn dieser Render durch einen KW-Wechsel ausgelöst wurde, hängen
```

- [ ] **Step 5: Attach im Tages-Editor (`initSingleDayEditor`)**

In `app/js/wochenansicht.js` ersetzen:

```js
      quillInstances[editorKey] = quill;

      if (!readonly) {
        quill.on('text-change', () => {
          updateDayCharCount(dateStr);
          debounceSave(dateStr);
        });
      }
```

durch:

```js
      quillInstances[editorKey] = quill;

      if (!readonly) {
        quill.on('text-change', () => {
          updateDayCharCount(dateStr);
          debounceSave(dateStr);
        });
        attachActivityAutocomplete(quill, kind);
      }
```

- [ ] **Step 6: Attach im Wochen-Editor (`initSingleWochenEditor`)**

In `app/js/wochenansicht.js` ersetzen:

```js
    if (!readonly) {
      quill.on('text-change', () => {
        const count = Math.max(0, quill.getText().length - 1);
        const ctr = document.getElementById('wochenCharCount_' + id);
        if (ctr) ctr.textContent = count + ' Zeichen';
        debounceSaveWoche();
      });
    }
```

durch:

```js
    if (!readonly) {
      quill.on('text-change', () => {
        const count = Math.max(0, quill.getText().length - 1);
        const ctr = document.getElementById('wochenCharCount_' + id);
        if (ctr) ctr.textContent = count + ' Zeichen';
        debounceSaveWoche();
      });
      attachActivityAutocomplete(quill, id);
    }
```

- [ ] **Step 7: Unit-Tests laufen lassen (Regression)**

Run: `node --test app/js/activity-suggestions.test.js`
Expected: PASS (18 Tests grün, keine Regression).

- [ ] **Step 8: Manuelle End-to-End-Verifikation in der App**

Backend laufend (`node server.js`, Port 3000). Edge via npx-Playwright. Als **Azubi** anmelden (Test-Login per E-Mail). Wochenansicht öffnen, **harter Reload (Strg+F5)** wegen SPA-CSS/JS-Caching. Prüfen:
- Tag aufklappen, **Betrieb-Editor fokussieren** → Top-Vorschläge aus eigener Historie (wenn vorhanden); leerer Verlauf → kein Dropdown.
- Tippen → Live-Filter + Treffer-Highlight; **↑↓/Enter/Esc/Tab** und Maus-Klick funktionieren; Übernahme ersetzt nur die Zeile, Freitext läuft weiter.
- Übernommener Vorschlag rankt beim nächsten Fokus höher (`bump`).
- **Schule-/Unterweisung-Editor** schlagen nur ihre eigene Art vor (kein Betrieb-Rauschen).
- **Wöchentliches Format** (Azubi mit `berichtTyp` wöchentlich): Vorschläge auch in den Wochen-Kacheln.
- **Ausbilder-/Korrektor-Login**: dieselbe Woche zeigt **kein** Dropdown.
- **Theme-Durchlauf**: Light, Dark und ein Sonder-Theme (z.B. candy) — Dropdown lesbar, Markierung/Highlight sichtbar.
- KW-Wechsel/Autosave während offenem Dropdown → schließt sauber, keine Doppel-Listener (Konsole fehlerfrei).

- [ ] **Step 9: Commit**

```bash
git add app/wochenansicht.html app/js/wochenansicht.js
git commit -m "feat(autocomplete): Typeahead in Tages- und Wochen-Editoren der Wochenansicht verdrahten"
```

---

## Notes für den Implementierer

- **Quill-Versionsannahmen:** `getSelection`, `getLine` (→ `[blot, offset]`), `getIndex(blot)`, `getBounds(index)`, `getText(index,len)`, `deleteText`, `insertText`, `setSelection`, `on`/`off`, `.root`, `.container` existieren alle in Quill 1.3.7.
- **Positionierungs-Offset:** `getBounds` ist relativ zu `quill.container`. Sollte das Dropdown in der echten App minimal versetzt sitzen (Toolbar-Höhe etc.), in `position()` den Origin-Rect prüfen — die Body-fixed-Strategie selbst bleibt korrekt.
- **Warum Capture auf `quill.container`:** Quill registriert seinen keydown-Handler auf `quill.root` während `new Quill` (also vor unserem `attach`). Am Ziel-Element laufen Listener in Registrierungsreihenfolge — `stopPropagation` auf `root` käme zu spät. Ein Capture-Listener auf dem Vorfahren `container` feuert davor und kann mit `stopPropagation` verhindern, dass Quill die Taste überhaupt sieht.
- **Kein `_ac-harness.html` committen** — reine lokale Verifikationshilfe.
