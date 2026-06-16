# Frontend-Gating auf Fähigkeiten (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Das sichtbare Menü-/Seiten-Gating von rollenbasiert (`role`) auf fähigkeitsbasiert (`kannPlanen`/`istAusbilder`/`istAzubi`/korrektur-berechtigt) umstellen — damit die Adminverwaltung nur noch berechtigten Nutzern erscheint und sich von der Ausbilder-Ansicht unterscheidet.

**Architecture:** Phase 1 liefert die Flags bereits auf `req.user`/`/api/auth/me`, und `normalizeUser` reicht sie unverändert durch ([api.js:53-57](../../../app/js/api.js#L53-L57)). Gating läuft heute doppelt: CSS pre-paint über `<html data-role>` ([layout.css:208-219](../../../app/css/layout.css#L208-L219), [theme.js:1076-1081](../../../app/js/theme.js#L1076-L1081)) und JS in `initLayout` ([app.js:101-110](../../../app/js/app.js#L101-L110)). Beides wird auf Fähigkeits-Attribute (`data-kann-planen`, `data-ist-ausbilder`, `data-ist-azubi`, `data-korrektur`) umgestellt. „Korrektur-berechtigt" = `istAusbilder` ODER hat (aktuelle/frühere) Zuweisungen als Verantwortliche/r.

**Tech Stack:** Vanilla JS, statisches HTML, CSS. Kein Build, kein Test-Runner fürs Frontend — Verifikation visuell im Browser (lokaler Server Port 3000, Edge/Playwright).

**Bezug:** [Spec](../specs/2026-06-16-azubi-planer-zugriff-admin-umbau-design.md) Schritt 2. Baut auf Phase 1 (committet) auf. **Nicht in dieser Phase:** Wochenansicht-Azubi-Selektor-Filter + Dashboard-Komposition (Phase 2b/4, eigener Plan).

**Verifikation generell:** Nach allen Tasks Dev-Server neu starten, dann je Persona einloggen (Demo-Accounts: Azubi `…0001`, Personalabteilung `…0004` = `kannPlanen`, Ausbilderin `…0002` = `kannPlanen`+`istAusbilder`) und das Menü prüfen.

---

### Task 1: Fähigkeits-Gating in `initLayout` (app.js)

**Files:**
- Modify: `app/js/app.js` (Block [101-110](../../../app/js/app.js#L101-L110) ersetzen; Helper ergänzen)

- [ ] **Step 1: Den role-basierten Nav-Block ersetzen**

In `app/js/app.js` den Block (aktuell Zeilen 101-110):
```js
  // Rollen-spezifische Navlinks ein-/ausblenden
  const adminLinks = document.querySelectorAll('.nav-admin-only');
  const ausbilderLinks = document.querySelectorAll('.nav-ausbilder-only');

  adminLinks.forEach(el => {
    el.style.display = (user.role === 'admin') ? '' : 'none';
  });
  ausbilderLinks.forEach(el => {
    el.style.display = (['admin', 'ausbilder'].includes(user.role)) ? '' : 'none';
  });
```
ersetzen durch:
```js
  // Fähigkeits-Gating der Navigation.
  // "Korrektur-berechtigt" = Ausbilder ODER hat (aktuelle/frühere) Zuweisungen
  // als Verantwortliche/r. Pure Planer (kannPlanen, kein Azubi, keine Zuweisung)
  // sehen daher KEIN Berichtsheft-Menü.
  let istKorrektor = !!user.istAusbilder;
  if (!istKorrektor && !user.istAzubi) {
    try {
      const z = await DB.getZuweisungenFuerAusbilder(user.id);
      istKorrektor = Array.isArray(z) && z.length > 0;
    } catch (e) { /* ohne Zuweisungsdaten: konservativ kein Korrektur-Menü */ }
  }
  applyCapabilities({
    kannPlanen:   !!user.kannPlanen,
    istAusbilder: !!user.istAusbilder,
    istAzubi:     !!user.istAzubi,
    korrektur:    istKorrektor,
  });
```

- [ ] **Step 2: Helper `applyCapabilities` ergänzen**

Direkt vor der `async function initLayout(activeNavId) {`-Zeile (aktuell [app.js:39](../../../app/js/app.js#L39)) einfügen:
```js
/* Spiegelt die Fähigkeiten des Nutzers auf <html data-*> (für CSS-Gating),
   persistiert sie für den Pre-Paint-Read in theme.js (kein Flash beim nächsten
   Load) und blendet die Nav-Items zusätzlich per JS ein/aus (belt-and-suspenders). */
function applyCapabilities(caps) {
  const html = document.documentElement;
  const attrs = {
    'data-kann-planen':   caps.kannPlanen,
    'data-ist-ausbilder': caps.istAusbilder,
    'data-ist-azubi':     caps.istAzubi,
    'data-korrektur':     caps.korrektur,
  };
  for (const [attr, on] of Object.entries(attrs)) {
    if (on) html.setAttribute(attr, '1'); else html.removeAttribute(attr);
  }
  try {
    localStorage.setItem('capKannPlanen',   caps.kannPlanen   ? '1' : '0');
    localStorage.setItem('capIstAusbilder', caps.istAusbilder ? '1' : '0');
    localStorage.setItem('capIstAzubi',     caps.istAzubi     ? '1' : '0');
    localStorage.setItem('capKorrektur',    caps.korrektur    ? '1' : '0');
  } catch (e) { /* localStorage kann blockieren */ }
  document.querySelectorAll('.nav-planer-only').forEach(el => {
    el.style.display = caps.kannPlanen ? '' : 'none';
  });
  document.querySelectorAll('.nav-berichtsheft-only').forEach(el => {
    el.style.display = (caps.istAzubi || caps.korrektur) ? '' : 'none';
  });
  document.querySelectorAll('.nav-azubi-only').forEach(el => {
    el.style.display = caps.istAzubi ? '' : 'none';
  });
}
```

- [ ] **Step 3: Smoke-Check (Syntax)**

Run: `node -e "require('fs').readFileSync('app/js/app.js','utf8'); new Function(require('fs').readFileSync('app/js/app.js','utf8')); console.log('app.js parstbar')"`
Expected: `app.js parstbar` (kein SyntaxError). *(Reiner Parse-Check; das Skript läuft im Browser, nicht in Node.)*

- [ ] **Step 4: Commit**
```bash
git add app/js/app.js && git commit -m "feat(gating): initLayout faehigkeitsbasiert (applyCapabilities) statt role"
```

---

### Task 2: Pre-Paint-Read der Fähigkeiten (theme.js)

**Files:**
- Modify: `app/js/theme.js` (nach dem `data-role`-Block [1076-1081](../../../app/js/theme.js#L1076-L1081))

- [ ] **Step 1: Pre-Paint-Block ergänzen**

Direkt NACH diesem bestehenden Block (endet bei `} catch (e) {}` nach `html.setAttribute('data-role', cachedRole);`):
```js
  try {
    var cachedRole = localStorage.getItem('userRole');
    if (cachedRole === 'azubi' || cachedRole === 'ausbilder' || cachedRole === 'admin') {
      html.setAttribute('data-role', cachedRole);
    }
  } catch (e) {}
```
folgenden Block einfügen:
```js
  /* ── Fähigkeits-Init-State ──────────────────────────────────────
     Spiegelt die zuletzt bekannten Fähigkeits-Flags (gesetzt von
     applyCapabilities() in app.js) synchron auf <html data-*>, damit das
     fähigkeitsbasierte Nav-Gating schon vor dem ersten Paint stimmt. */
  try {
    if (localStorage.getItem('capKannPlanen')   === '1') html.setAttribute('data-kann-planen', '1');
    if (localStorage.getItem('capIstAusbilder') === '1') html.setAttribute('data-ist-ausbilder', '1');
    if (localStorage.getItem('capIstAzubi')     === '1') html.setAttribute('data-ist-azubi', '1');
    if (localStorage.getItem('capKorrektur')    === '1') html.setAttribute('data-korrektur', '1');
  } catch (e) {}
```

- [ ] **Step 2: Commit**
```bash
git add app/js/theme.js && git commit -m "feat(gating): Pre-Paint-Spiegelung der Faehigkeits-Flags (kein Flash)"
```

---

### Task 3: CSS-Gating auf Fähigkeiten (layout.css)

**Files:**
- Modify: `app/css/layout.css` (Block [208-219](../../../app/css/layout.css#L208-L219))

- [ ] **Step 1: Selektoren ersetzen**

In `app/css/layout.css` diesen Block (aktuell Zeilen 208-219):
```css
html:not([data-role="ausbilder"]):not([data-role="admin"]) .nav-ausbilder-only {
  display: none;
}
html:not([data-role="admin"]) .nav-admin-only {
  display: none;
}
/* ESS ist azubi-persönlich (eigener Zeitsaldo + Fahrtgeld) → für
   Ausbilder/Admin ausgeblendet. Gegenstück zu nav-ausbilder-only. */
html[data-role="ausbilder"] .nav-azubi-only,
html[data-role="admin"] .nav-azubi-only {
  display: none;
}
```
ersetzen durch:
```css
/* Fähigkeitsbasiertes Nav-Gating (Default: versteckt; sichtbar, sobald die
   passende Fähigkeit auf <html data-*> gesetzt ist – via theme.js pre-paint
   bzw. applyCapabilities() in app.js). Negation per :not(), damit die Items
   ihren normalen display-Wert behalten, sobald die Fähigkeit passt. */
html:not([data-kann-planen="1"]) .nav-planer-only {
  display: none;
}
/* Berichtsheft (Wochen-/Jahresansicht): eigenes Heft (Azubi) ODER korrektur-berechtigt. */
html:not([data-ist-azubi="1"]):not([data-korrektur="1"]) .nav-berichtsheft-only {
  display: none;
}
/* Azubi-persönlich (Fahrgelderstattung/ESS): nur Azubis. */
html:not([data-ist-azubi="1"]) .nav-azubi-only {
  display: none;
}
```

- [ ] **Step 2: Commit**
```bash
git add app/css/layout.css && git commit -m "feat(gating): CSS-Nav-Gating auf Faehigkeits-Attribute umgestellt"
```

---

### Task 4: Nav-Klassen in der Sidebar (sidebar.js)

**Files:**
- Modify: `app/js/sidebar.js` (Block [32-57](../../../app/js/sidebar.js#L32-L57))

- [ ] **Step 1: Berichtsheft- und Verwaltungs-Links neu klassifizieren**

In `app/js/sidebar.js` den Abschnitt (aktuell Zeilen 32-57):
```js
      <span class="sidebar__section-label">Berichtsheft</span>
      <a href="wochenansicht.html" class="sidebar__link" id="nav-wochenansicht">
        <span class="sidebar__link-icon">${Icon('wochenansicht')}</span>
        <span class="sidebar__link-label">Wochenansicht</span>
      </a>
      <a href="jahresansicht.html" class="sidebar__link" id="nav-jahresansicht">
        <span class="sidebar__link-icon">${Icon('jahresansicht')}</span>
        <span class="sidebar__link-label">Jahresansicht</span>
      </a>

      <span class="sidebar__section-label nav-azubi-only">Sonstiges</span>
      <a href="fahrgelderstattung.html" class="sidebar__link nav-azubi-only" id="nav-fahrgelderstattung">
        <span class="sidebar__link-icon">${Icon('document')}</span>
        <span class="sidebar__link-label">Fahrgelderstattung</span>
      </a>

      <div class="sidebar__divider"></div>
      <span class="sidebar__section-label nav-ausbilder-only">Verwaltung</span>
      <a href="berichtsheftverwaltung.html" class="sidebar__link nav-ausbilder-only" id="nav-verwaltung">
        <span class="sidebar__link-icon">${Icon('verwaltung')}</span>
        <span class="sidebar__link-label">Berichtsheftverwaltung</span>
      </a>
      <a href="azubi-planer.html" class="sidebar__link nav-ausbilder-only" id="nav-planer">
        <span class="sidebar__link-icon">${Icon('planer')}</span>
        <span class="sidebar__link-label">Azubi-Planer</span>
      </a>
```
ersetzen durch (Berichtsheft-Items bekommen `nav-berichtsheft-only`, Verwaltungs-Items `nav-planer-only`):
```js
      <span class="sidebar__section-label nav-berichtsheft-only">Berichtsheft</span>
      <a href="wochenansicht.html" class="sidebar__link nav-berichtsheft-only" id="nav-wochenansicht">
        <span class="sidebar__link-icon">${Icon('wochenansicht')}</span>
        <span class="sidebar__link-label">Wochenansicht</span>
      </a>
      <a href="jahresansicht.html" class="sidebar__link nav-berichtsheft-only" id="nav-jahresansicht">
        <span class="sidebar__link-icon">${Icon('jahresansicht')}</span>
        <span class="sidebar__link-label">Jahresansicht</span>
      </a>

      <span class="sidebar__section-label nav-azubi-only">Sonstiges</span>
      <a href="fahrgelderstattung.html" class="sidebar__link nav-azubi-only" id="nav-fahrgelderstattung">
        <span class="sidebar__link-icon">${Icon('document')}</span>
        <span class="sidebar__link-label">Fahrgelderstattung</span>
      </a>

      <div class="sidebar__divider nav-planer-only"></div>
      <span class="sidebar__section-label nav-planer-only">Verwaltung</span>
      <a href="berichtsheftverwaltung.html" class="sidebar__link nav-planer-only" id="nav-verwaltung">
        <span class="sidebar__link-icon">${Icon('verwaltung')}</span>
        <span class="sidebar__link-label">Berichtsheftverwaltung</span>
      </a>
      <a href="azubi-planer.html" class="sidebar__link nav-planer-only" id="nav-planer">
        <span class="sidebar__link-icon">${Icon('planer')}</span>
        <span class="sidebar__link-label">Azubi-Planer</span>
      </a>
```

- [ ] **Step 2: Commit**
```bash
git add app/js/sidebar.js && git commit -m "feat(gating): Sidebar-Nav-Klassen auf Faehigkeiten (planer-only/berichtsheft-only)"
```

---

### Task 5: Seiten-Zugang Planer & Verwaltung auf `kannPlanen`

**Files:**
- Modify: `app/js/azubi-planer.js` (Block [13-16](../../../app/js/azubi-planer.js#L13-L16))
- Modify: `app/js/berichtsheftverwaltung.js` ([15](../../../app/js/berichtsheftverwaltung.js#L15), [19](../../../app/js/berichtsheftverwaltung.js#L19))

- [ ] **Step 1: azubi-planer.js – Redirect auf `kannPlanen`**

In `app/js/azubi-planer.js` den Block (aktuell Zeilen 13-16):
```js
  if (!['ausbilder', 'admin'].includes(user.role)) {
    window.location.href = 'dashboard.html';
    return;
  }
```
ersetzen durch:
```js
  if (!user.kannPlanen) {
    window.location.href = 'dashboard.html';
    return;
  }
```

- [ ] **Step 2: berichtsheftverwaltung.js – Zugang + interne Flags auf `kannPlanen`**

In `app/js/berichtsheftverwaltung.js` direkt nach `document.body.dataset.page = 'berichtsheftverwaltung';` (aktuell [Zeile 10](../../../app/js/berichtsheftverwaltung.js#L10)) einen Zugangs-Guard ergänzen:
```js
  if (!user.kannPlanen) {
    window.location.href = 'dashboard.html';
    return;
  }
```
Und die Zeile (aktuell [15](../../../app/js/berichtsheftverwaltung.js#L15)):
```js
  let selectedAzubiId = user.role === 'azubi' ? user.id : azubisInit[0]?.id;
```
ersetzen durch (ein Planer ist nie der Azubi selbst → immer ersten Azubi vorwählen):
```js
  let selectedAzubiId = azubisInit[0]?.id;
```
Und in `render()` die Zeile (aktuell [19](../../../app/js/berichtsheftverwaltung.js#L19)):
```js
    const isAusbilder = ['ausbilder', 'admin'].includes(user.role);
```
ersetzen durch:
```js
    const isAusbilder = user.kannPlanen;  // Verwaltung ist nur für Planer erreichbar → Azubi-Auswahl zeigen
```

- [ ] **Step 3: Smoke-Check (Syntax)**

Run: `node -e "['app/js/azubi-planer.js','app/js/berichtsheftverwaltung.js'].forEach(f=>new Function(require('fs').readFileSync(f,'utf8'))); console.log('parstbar')"`
Expected: `parstbar`.

- [ ] **Step 4: Commit**
```bash
git add app/js/azubi-planer.js app/js/berichtsheftverwaltung.js && git commit -m "feat(gating): Planer/Verwaltung-Seitenzugang auf kannPlanen"
```

---

### Task 6: Fähigkeits-Cache beim Logout/Auth-Fehler leeren (api.js)

**Files:**
- Modify: `app/js/api.js` (`cacheUserRole`, [153-163](../../../app/js/api.js#L153-L163))

- [ ] **Step 1: Else-Zweig erweitern**

In `app/js/api.js` in `cacheUserRole(role)` den `else`-Zweig (aktuell):
```js
    } else {
      localStorage.removeItem('userRole');
      document.documentElement.removeAttribute('data-role');
    }
```
ersetzen durch:
```js
    } else {
      localStorage.removeItem('userRole');
      document.documentElement.removeAttribute('data-role');
      // Fähigkeits-Cache mitleeren (Logout / fehlgeschlagene Auth), damit beim
      // nächsten Login kein veraltetes Gating pre-paint durchschlägt.
      ['capKannPlanen', 'capIstAusbilder', 'capIstAzubi', 'capKorrektur'].forEach(k => localStorage.removeItem(k));
      ['data-kann-planen', 'data-ist-ausbilder', 'data-ist-azubi', 'data-korrektur'].forEach(a => document.documentElement.removeAttribute(a));
    }
```

- [ ] **Step 2: Commit**
```bash
git add app/js/api.js && git commit -m "feat(gating): Faehigkeits-Cache bei Logout/Auth-Fehler leeren"
```

---

### Task 7: Verifikation Phase 2 (visuell, zentral)

**Files:** keine Änderung.

- [ ] **Step 1: Dev-Server neu starten** (Backend lädt unverändert; Frontend wird statisch ausgeliefert → harter Reload Strg+F5 wegen Caching).

- [ ] **Step 2: Persona-Checks im Browser**
  - **Azubi (`…0001`):** sieht Dashboard, Berichtsheft (Wochen-/Jahresansicht), Sonstiges (Fahrgelderstattung). **Keine** Verwaltung.
  - **Personalabteilung (`…0004`, kannPlanen, kein Azubi, keine Zuweisung):** sieht Dashboard + **Verwaltung** (Berichtsheftverwaltung + Azubi-Planer). **Kein** Berichtsheft-Menü, **kein** Sonstiges. → unterscheidet sich jetzt sichtbar von der Ausbilder-Ansicht.
  - **Ausbilderin (`…0002`, kannPlanen+istAusbilder):** sieht Dashboard, **Berichtsheft** (korrektur-berechtigt) **und Verwaltung**.
  - Direktaufruf `azubi-planer.html` als Azubi → Redirect auf Dashboard.
- [ ] **Step 3:** Kurz prüfen, dass beim Reload kein „Flash" falscher Menüpunkte auftritt (Pre-Paint-Cache greift).

---

## Nicht in dieser Phase (Folgepläne)

- **Phase 2b:** Wochenansicht-Azubi-Selektor auf erlaubte Azubis begrenzen ([wochenansicht.js:440](../../../app/js/wochenansicht.js#L440)); `isAusbilder`-Logik dort an Fähigkeiten ausrichten.
- **Phase 4:** Komponierbares Dashboard (Planer-Signalkarten; Korrektur-Sektion nach Fähigkeiten).
- **Anhang-Download-Härtung** (in Phase 1 als vorbestehende Lücke gefunden): `GET /api/wochen/anhaenge/:id/download` mit `darfWocheSehen` absichern.
