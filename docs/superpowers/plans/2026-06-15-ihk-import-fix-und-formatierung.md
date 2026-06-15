# IHK-Import: mehrseitige Wochen + Status + Gating + Formatierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der IHK-PDF-Import übernimmt alle Tage/Zeiten/Orte (auch über Seitenumbrüche und trotz `Qualifikationen:`-Blöcken), ordnet den Status korrekt zu, erscheint nur für die wöchentliche Berichtsform und überträgt **Fett/Kursiv/Unterstreichung** der Tätigkeitstexte.

**Architecture:** `ihk-parser.js` wird zu einer **dokumentweiten State-Machine** (alle Seiten → ein Zeilenstrom → an gültigen `Ausbildungswoche …`-Markern mit Spanne ≤ 10 Tagen schneiden). Formatierung wird pro Textlauf als atomarer Marker `\x02<flag><text>\x03` (Bitmaske 1=fett/2=kursiv/4=unterstrichen) kodiert und in `linesToHtml` zu verschachteltem `<strong><em><u>` aufgelöst. `ihk-import.js` ruft `getOperatorList()` (echte Schriftnamen via `commonObjs` für Fett/Kursiv; gefüllte Rechtecke für Unterstreichung) und gated die Sektion auf `berichtTyp === 'wöchentlich'`.

**Tech Stack:** Vanilla JS (Browser-IIFE + CommonJS-Export), pdf.js 3.11.174 (vendored), Quill (Rich-Text, Toolbar hat bold/italic/underline), Node 24 `node:test` (null Abhängigkeiten; Parser ist `require`-bar).

**Specs (zusammengeführt):**
- [2026-05-27-ihk-berichtsheft-import-design.md](../specs/2026-05-27-ihk-berichtsheft-import-design.md) (Original)
- [2026-06-15-ihk-import-mehrseitige-wochen-fix-design.md](../specs/2026-06-15-ihk-import-mehrseitige-wochen-fix-design.md) (Multi-Page, Status, Gating)
- [2026-06-15-ihk-import-formatierung-zeiten-design.md](../specs/2026-06-15-ihk-import-formatierung-zeiten-design.md) (Formatierung)

> **Dieser Plan ersetzt** die beiden früheren Pläne `2026-06-15-ihk-import-mehrseitige-wochen-fix.md` und `2026-06-15-ihk-import-formatierung-zeiten.md` (beide entfernt).

---

## Setup (bereits erledigt)

Branch `feature/ihk-import-formatierung-zeiten` ist angelegt. Falls nicht aktiv:

```bash
git rev-parse --abbrev-ref HEAD   # erwartet: feature/ihk-import-formatierung-zeiten
```

---

## File Structure

| Aktion | Datei | Verantwortung |
|---|---|---|
| Ändern (Komplettersatz) | `app/js/ihk-parser.js` | reine Parse-/Format-Logik (State-Machine + Format-Helfer), Node-testbar |
| Neu | `app/js/ihk-parser.test.js` | Node-Unit-Tests (zero-dep) |
| Ändern | `app/js/ihk-import.js` | `extractPages`/`itemsToText` (getOperatorList + Format) **und** Gating in `renderSection` |

**Marker-Schema (alle Tasks):** `\x02` + Flag-Ziffer `'1'..'7'` (1=bold, 2=italic, 4=underline) + Text + `\x03`. Beispiel fett+unterstrichen → `\x025Text\x03`.

---

## Task 1: Parser — dokumentweite State-Machine + Format-Helfer (TDD)

**Files:**
- Create: `app/js/ihk-parser.test.js`
- Modify: `app/js/ihk-parser.js` (gesamter Datei-Inhalt ersetzt)

- [ ] **Step 1: Test-Datei `app/js/ihk-parser.test.js` anlegen** (test-first, referenziert die neue API):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./ihk-parser.js');

const B = '\x02', E = '\x03';
const wByKw = (res, kw) => res.wochen.find(w => w.kw === kw);

// ── Format-Helfer ──────────────────────────────────────────────
test('classifyFontName erkennt Bold/Italic/Normal', () => {
  assert.deepEqual(P.classifyFontName('EAAAAA+LiberationSans-Bold'),   { bold: true,  italic: false });
  assert.deepEqual(P.classifyFontName('EAAAAC+LiberationSans-Italic'), { bold: false, italic: true });
  assert.deepEqual(P.classifyFontName('EAAAAB+LiberationSans'),        { bold: false, italic: false });
  assert.deepEqual(P.classifyFontName(''),                             { bold: false, italic: false });
});

test('assembleLine sortiert nach x und setzt Flag-Marker', () => {
  const line = P.assembleLine([
    { x: 100, str: 'ERM',       bold: false, italic: false, underline: false },
    { x: 10,  str: 'Software:', bold: true,  italic: false, underline: false },
  ]);
  assert.equal(line, B + '1Software:' + E + ' ERM');
});

test('assembleLine kombiniert Flags (fett+unterstrichen = 5)', () => {
  assert.equal(
    P.assembleLine([{ x: 0, str: 'Dienstag:', bold: true, italic: false, underline: true }]),
    B + '5Dienstag:' + E
  );
});

test('linesToHtml löst Flags zu verschachtelten Tags auf und escaped', () => {
  assert.equal(P.linesToHtml([B + '5Dienstag:' + E + ' normal']),
    '<p><strong><u>Dienstag:</u></strong> normal</p>');
  assert.equal(P.linesToHtml([B + '1GK:' + E + ' <Sach>']),
    '<p><strong>GK:</strong> &lt;Sach&gt;</p>');
  assert.equal(P.linesToHtml([]), '');
});

// ── Unterstreichungs-Geometrie ─────────────────────────────────
const OPS = { save:10, restore:11, transform:12, constructPath:91,
  moveTo:13, lineTo:14, curveTo:15, rectangle:19,
  fill:22, eoFill:23, stroke:20, closeStroke:21, endPath:28 };

test('decodeUnderlineSegments findet dünnes gefülltes Rechteck', () => {
  const segs = P.decodeUnderlineSegments(
    [OPS.constructPath, OPS.fill],
    [ [ [OPS.rectangle], [69, 565.7, 45, 0.3] ], null ], OPS);
  assert.equal(segs.length, 1);
  assert.ok(Math.abs(segs[0].y - 565.85) < 0.2);
  assert.equal(Math.round(segs[0].x0), 69);
  assert.equal(Math.round(segs[0].x1), 114);
});

test('decodeUnderlineSegments ignoriert gestrichene Pfade', () => {
  assert.equal(P.decodeUnderlineSegments(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [57, 736, 241, 0] ], null ], OPS).length, 0);
});

test('decodeUnderlineSegments ignoriert hohe Rechtecke', () => {
  assert.equal(P.decodeUnderlineSegments(
    [OPS.constructPath, OPS.fill],
    [ [ [OPS.rectangle], [57, 600, 480, 5] ], null ], OPS).length, 0);
});

test('matchUnderline trifft Linie knapp unter Baseline', () => {
  assert.equal(P.matchUnderline({ x0: 69, x1: 114, baseline: 566.9 },
    [{ y: 565.9, x0: 69, x1: 114 }]), true);
});

test('matchUnderline verwirft zu breite Tabellenlinie', () => {
  assert.equal(P.matchUnderline({ x0: 298, x1: 466, baseline: 686.5 },
    [{ y: 684, x0: 298, x1: 539 }]), false);
});

// ── State-Machine: Kernbug (Multi-Page + Qualifikationen) ──────
test('mehrseitige Woche: alle 5 Tage trotz Qualifikationen-Block & Seitenumbruch', () => {
  const page1 = [
    'Ausbildungsnachweis auf Wochenbasis',
    'Auszubildende/r',
    'Mustermann, Max',
    'Ausbilder Status',
    'Lengerer, Matthias Eingereicht am 10.02.2025. Von Ausbilder:in Matthias',
    'Lengerer am 27.08.2025 freigegeben.',
    'Ausbildungswoche 06.01.2025 bis 12.01.2025',
    'Schule/Betrieb',
    'Schule:',
    B + '5Dienstag:' + E,
    B + '1GK:' + E + ' Sachmängel',
    'Betrieb:',
    B + '5IT-Abteilung:' + E,
    '-PDF Dateien in SAP einfügen und aussortieren',
    'Mo | 06.01.2025 | Feiertag | abwesend 00:00',
    'Di | 07.01.2025 | Schule | anwesend 07:00',
    '07:00',
    'Qualifikationen:',
    '- Allgemeinbildende Fächer',
    '- Serviceanfragen bearbeiten',
    'Mi | 08.01.2025 | Betrieb | anwesend 07:25',
    '07:25',
    'Seite 7',
  ].join('\n');
  const page2 = [
    'Ausbildungsnachweis auf Wochenbasis',
    'Qualifikationen:',
    '- Betreiben von IT-Systemen',
    'Do | 09.01.2025 | Betrieb | anwesend 07:05',
    '07:05',
    'Qualifikationen:',
    '- Sonstige Qualifikation',
    'Fr | 10.01.2025 | Betrieb | anwesend 07:00',
    '07:00',
    'Dauer gesamt: 28:30',
    'Seite 8',
  ].join('\n');

  const res = P.parse([page1, page2]);
  assert.equal(res.wochen.length, 1);
  const w = res.wochen[0];
  assert.equal(w.kw, 2);
  assert.equal(w.year, 2025);
  assert.equal(w.tage.length, 5);
  const byTag = Object.fromEntries(w.tage.map(t => [t.wochentag, t]));
  assert.equal(byTag.Mo.anwesenheit, 'Feiertag');
  assert.equal(byTag.Di.ort, 'Schule');
  assert.equal(byTag.Di.stunden, 7);
  assert.equal(byTag.Mi.ort, 'Betrieb');
  assert.equal(byTag.Mi.stunden, 7.42);
  assert.equal(byTag.Do.ort, 'Betrieb');
  assert.equal(byTag.Fr.stunden, 7);
  assert.equal(w.status, 'freigegeben');
  // Formatierung durchgereicht:
  assert.match(w.schuleText, /<strong><u>Dienstag:<\/u><\/strong>/);
  assert.match(w.schuleText, /<strong>GK:<\/strong> Sachmängel/);
  assert.match(w.betriebText, /<strong><u>IT-Abteilung:<\/u><\/strong>/);
  assert.match(w.betriebText, /PDF Dateien in SAP/);
});

test('Inhaltsverzeichnis (Gesamtzeitraum) erzeugt keine Schein-Woche', () => {
  const toc = [
    'Inhaltsverzeichnis',
    'Ausbildungswoche 30.12.2024 bis 08.02.2026',
    'Berichtheftswoche Seitenzahl Status Ort',
    '30.12.2024 bis 05.01.2025 6 0 5 Urlaub',
    '06.01.2025 bis 12.01.2025 7 4 1 Schule/Betrieb',
    'Seite 3',
  ].join('\n');
  assert.equal(P.parse([toc]).wochen.length, 0);
});

test('Status wird der richtigen Woche zugeordnet (steht vor dem Marker)', () => {
  const page = [
    'Ausbilder Status',
    'X Eingereicht am 01.01.2025. freigegeben.',
    'Ausbildungswoche 06.01.2025 bis 12.01.2025',
    'Mo | 06.01.2025 | Betrieb | anwesend 08:00',
    'Qualifikationen:',
    '- Irgendwas',
    'Ausbilder Status',
    'Y am 02.02.2025 abgelehnt.',
    'Ausbildungswoche 13.01.2025 bis 19.01.2025',
    'Mo | 13.01.2025 | Betrieb | anwesend 08:00',
  ].join('\n');
  const res = P.parse([page]);
  assert.equal(res.wochen.length, 2);
  assert.equal(wByKw(res, 2).status, 'freigegeben');
  assert.equal(wByKw(res, 3).status, 'abgelehnt');
});

test('Betrieb + Schule am selben Tag → Ort Betrieb/Schule, Stunden summiert', () => {
  const page = [
    'Ausbildungswoche 13.01.2025 bis 19.01.2025',
    'Mo | 13.01.2025 | Betrieb | anwesend 04:00',
    'Mo | 13.01.2025 | Schule | anwesend 04:00',
    'Di | 14.01.2025 | Feiertag | abwesend 00:00',
  ].join('\n');
  const mo = P.parse([page]).wochen[0].tage.find(t => t.wochentag === 'Mo');
  assert.equal(mo.ort, 'Betrieb/Schule');
  assert.equal(mo.stunden, 8);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test app/js/ihk-parser.test.js`
Expected: FAIL — `P.classifyFontName is not a function` (neue API fehlt) und State-Machine-Tests rot.

- [ ] **Step 3: `app/js/ihk-parser.js` vollständig ersetzen** durch:

```js
/* ===================================================================
   IHK-PARSER.JS
   Reine Parsing-Logik für den IHK-Ausbildungsnachweis (PDF → Wochendaten).
   Dokumentweite State-Machine: Eine Ausbildungswoche kann sich über mehrere
   PDF-Seiten erstrecken (Folgeseiten ohne Wochenkopf) und enthält je Tag einen
   Qualifikationen-Block. Daher wird der Text ALLER Seiten zu einem Zeilenstrom
   zusammengeführt, Rausch-Zeilen entfernt und an gültigen „Ausbildungswoche …"-
   Markern (Spanne ≤ 10 Tage) in Wochen geschnitten.
   Formatierung: pro Textlauf ein Marker \x02<flag><text>\x03 (Bitmaske
   1=fett/2=kursiv/4=unterstrichen) → linesToHtml erzeugt <strong>/<em>/<u>.
   Bewusst ohne DOM-/pdf.js-Abhängigkeit (Node-testbar); die PDF-Extraktion
   passiert in ihk-import.js und ruft die hier exportierten Format-Helfer.
   =================================================================== */
(function (global) {
  'use strict';

  function ddmmyyyyToISO(s) {
    const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  // "7:48" → 7.8  |  "08:00" → 8.0
  function hmToDecimal(s) {
    const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10) / 60) * 100) / 100;
  }

  // ISO 8601 Kalenderwoche (identische Logik wie DateUtil in api.js)
  function getISOKW(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yr = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { kw: Math.ceil((((d - yr) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
  }

  // Kalendertage zwischen zwei ISO-Daten (Plausibilität der Wochenspanne).
  function spanDays(isoStart, isoEnd) {
    return Math.round((new Date(isoEnd + 'T00:00:00') - new Date(isoStart + 'T00:00:00')) / 86400000);
  }

  function mapStatus(text) {
    const t = String(text || '').toLowerCase();
    if (/genehmigt/.test(t))                          return 'genehmigt';
    if (/freigegeben|eingereicht|vom azubi/.test(t))  return 'freigegeben';
    if (/abgelehnt|zur[üu]ckgegeben/.test(t))         return 'abgelehnt';
    return 'offen';
  }

  function mapDayType(typ) {
    const t = String(typ || '').trim().toLowerCase();
    if (/betrieb/.test(t))               return { anwesenheit: 'anwesend',             ort: 'Betrieb' };
    if (/schule/.test(t))                return { anwesenheit: 'anwesend',             ort: 'Schule'  };
    if (/urlaub/.test(t))                return { anwesenheit: 'Urlaub',               ort: ''        };
    if (/feiertag/.test(t))              return { anwesenheit: 'Feiertag',             ort: ''        };
    if (/zeitausgleich/.test(t))         return { anwesenheit: 'sonstige Abwesenheit', ort: ''        };
    if (/sonstige abwesenheit/.test(t))  return { anwesenheit: 'sonstige Abwesenheit', ort: ''        };
    if (/krank|arbeitsunf/i.test(t))     return { anwesenheit: 'krank',                ort: ''        };
    return null;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Formatierung ───────────────────────────────────────────────
  function classifyFontName(name) {
    const n = String(name || '');
    return {
      bold:   /bold|black|heavy|semibold|demi/i.test(n),
      italic: /italic|oblique/i.test(n),
    };
  }

  function cellFlag(cell) {
    return (cell.bold ? 1 : 0) | (cell.italic ? 2 : 0) | (cell.underline ? 4 : 0);
  }

  // Zellen eines y-Laufs → String mit Format-Markern (von ihk-import.js genutzt).
  function assembleLine(cells) {
    return cells.slice()
      .sort((a, b) => a.x - b.x)
      .map(c => { const f = cellFlag(c); return f ? `\x02${f}${c.str}\x03` : c.str; })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wrapFlag(flag, inner) {
    let html = inner;
    if (flag & 4) html = '<u>' + html + '</u>';
    if (flag & 2) html = '<em>' + html + '</em>';
    if (flag & 1) html = '<strong>' + html + '</strong>';
    return html;
  }

  function linesToHtml(lines) {
    if (!lines.length) return '';
    return lines.map(l => {
      const parts = String(l).split(/(\x02[1-7][^\x03]*\x03)/);
      const html = parts.map(part => {
        if (part.charAt(0) === '\x02') {
          return wrapFlag(parseInt(part.charAt(1), 10), escapeHtml(part.slice(2, -1)));
        }
        return escapeHtml(part);
      }).join('');
      return `<p>${html}</p>`;
    }).join('');
  }

  // ── Unterstreichungs-Geometrie (pdf.js-Operatorliste) ──────────
  function matMul(m, n) {
    return [
      m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1],
      m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3],
      m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5],
    ];
  }
  function matApply(m, x, y) { return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }

  // → horizontale, dünne GEFÜLLTE Rechtecke (Unterstreichungen).
  // Gestrichene Pfade (Tabellen-/Boxränder) zählen NICHT.
  function decodeUnderlineSegments(fnArray, argsArray, OPS) {
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let rects = [];
    const segs = [];
    function flushFill() {
      for (const r of rects) {
        const a = matApply(ctm, r.rx, r.ry);
        const b = matApply(ctm, r.rx + r.rw, r.ry + r.rh);
        const h = Math.abs(b[1] - a[1]);
        const w = Math.abs(b[0] - a[0]);
        if (h < 1.5 && w > 3) {
          segs.push({ y: (a[1] + b[1]) / 2, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) });
        }
      }
    }
    for (let k = 0; k < fnArray.length; k++) {
      const fn = fnArray[k], a = argsArray[k];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = matMul(ctm, a);
      else if (fn === OPS.constructPath) {
        const ops = a[0], coords = a[1];
        let i = 0;
        for (const op of ops) {
          if (op === OPS.moveTo || op === OPS.lineTo) i += 2;
          else if (op === OPS.curveTo) i += 6;
          else if (op === OPS.rectangle) {
            rects.push({ rx: coords[i], ry: coords[i+1], rw: coords[i+2], rh: coords[i+3] });
            i += 4;
          }
        }
      }
      else if (fn === OPS.fill || fn === OPS.eoFill) { flushFill(); rects = []; }
      else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.endPath) { rects = []; }
    }
    return segs;
  }

  // Liegt eine Unterstreichungs-Linie knapp unter der Baseline und ~ textbreit?
  function matchUnderline(item, segs) {
    const w = item.x1 - item.x0;
    if (w <= 0) return false;
    return segs.some(s => {
      const below = item.baseline - s.y;
      if (below < -0.5 || below > 4) return false;
      const overlap = Math.min(item.x1, s.x1) - Math.max(item.x0, s.x0);
      if (overlap < w * 0.6) return false;
      return (s.x1 - s.x0) <= w * 1.4 + 2;
    });
  }

  // ── Struktur-Regexe ────────────────────────────────────────────
  const DAY_RE                = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s*\|?\s*(\d{2}\.\d{2}\.\d{4})\s*\|?\s*(.+?)\s*\|?\s*(anwesend|abwesend)(?:\s+(\d{1,2}:\d{2}))?/i;
  const WOCHE_RE              = /Ausbildungswoche\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(\d{2}\.\d{2}\.\d{4})/i;
  const QUALI_RE              = /^Qualifikationen:/i;
  const WEEKEND_RE            = /^(Sa|So)\b/i;
  const SCHULE_BETRIEB_RE     = /^Schule\/Betrieb\s*$/i;
  const SCHULE_BLOCK_RE       = /^Schule:\s*$/i;
  const BETRIEB_BLOCK_RE      = /^Betrieb:\s*$/i;
  const UNTERWEISUNG_BLOCK_RE = /^Unterweisung:\s*$/i;
  // Über alle Seiten entfernte Rausch-Zeilen (Seitenkopf/-fuß, Wochensumme,
  // doppelte Standalone-Zeit-Zeile unter jeder Tageszeile).
  const NOISE_RE              = /^(Seite\s+\d+|Ausbildungsnachweis auf Wochenbasis|Dauer gesamt:.*|\d{1,2}:\d{2})$/i;

  function isSectionHeader(s) {
    return SCHULE_BETRIEB_RE.test(s) || SCHULE_BLOCK_RE.test(s)
        || BETRIEB_BLOCK_RE.test(s) || UNTERWEISUNG_BLOCK_RE.test(s);
  }

  // Marker (\x02<flag> … \x03) für Struktur-Matching entfernen.
  function strip(line) { return String(line).replace(/\x02[1-7]|\x03/g, ''); }

  // Alle Seiten → ein Zeilenstrom; leere & Rausch-Zeilen raus.
  // Marker bleiben in der Zeile (für Textblöcke); Matching nutzt strip().
  function flattenPages(pages) {
    const out = [];
    for (const pageText of (pages || [])) {
      String(pageText || '').split(/\r?\n/).forEach(raw => {
        const line = raw.trim();
        if (!line) return;
        if (NOISE_RE.test(strip(line))) return;
        out.push(line);
      });
    }
    return out;
  }

  // Einen Wochen-Block parsen (Zeilen einer Woche, Marker erhalten).
  function parseWeekBody(startDate, endDate, lines, status, warnungen) {
    let skipQuali   = false;
    let textSection = null; // null | 'schule' | 'betrieb' | 'unterweisung'
    const rawByDatum = {};
    const textBlocks = { schule: [], betrieb: [], unterweisung: [] };

    for (const line of lines) {
      const s = strip(line);

      // Qualifikationen-Block: nur bis zum nächsten Tag/Abschnitt überspringen,
      // NICHT bis Seitenende (der Block wiederholt sich je Tag).
      if (skipQuali) {
        if (DAY_RE.test(s) || isSectionHeader(s)) skipQuali = false; // Trigger normal weiter
        else continue;
      }

      if (QUALI_RE.test(s)) { skipQuali = true; continue; }
      if (WEEKEND_RE.test(s)) continue;

      if (SCHULE_BETRIEB_RE.test(s))     { continue; }
      if (SCHULE_BLOCK_RE.test(s))       { textSection = 'schule';       continue; }
      if (BETRIEB_BLOCK_RE.test(s))      { textSection = 'betrieb';      continue; }
      if (UNTERWEISUNG_BLOCK_RE.test(s)) { textSection = 'unterweisung'; continue; }

      const dm = s.match(DAY_RE);
      if (dm) {
        textSection = null; // Anwesenheitstabelle kommt nach den Textblöcken
        const [, wt, datStr, typ, anwAbw, zeit] = dm;
        const datum = ddmmyyyyToISO(datStr);
        if (!datum) continue;
        const mapped = mapDayType(typ);
        if (!mapped) {
          warnungen.push(`${cap(wt)} ${datum}: Typ „${typ.trim()}” nicht erkannt.`);
          continue;
        }
        const stunden = anwAbw.toLowerCase() === 'anwesend' ? hmToDecimal(zeit) : 0;
        if (!rawByDatum[datum]) rawByDatum[datum] = [];
        rawByDatum[datum].push({ datum, wochentag: cap(wt), ...mapped, stunden });
      } else if (textSection) {
        textBlocks[textSection].push(line); // Original mit Markern
      }
    }

    const tage = Object.values(rawByDatum).map(entries => {
      if (entries.length === 1) return entries[0];
      const hatBetrieb = entries.some(e => e.ort === 'Betrieb');
      const hatSchule  = entries.some(e => e.ort === 'Schule');
      if (hatBetrieb && hatSchule) {
        return {
          datum:       entries[0].datum,
          wochentag:   entries[0].wochentag,
          anwesenheit: 'anwesend',
          ort:         'Betrieb/Schule',
          stunden:     entries.reduce((sum, e) => sum + e.stunden, 0),
        };
      }
      return entries[0];
    });

    if (!tage.length) return null; // Woche ohne erkannte Tage → verwerfen

    tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));
    const { kw, year } = getISOKW(new Date(startDate + 'T00:00:00'));
    return {
      kw, year, startDate, endDate, status, tage,
      betriebText:      linesToHtml(textBlocks.betrieb),
      schuleText:       linesToHtml(textBlocks.schule),
      unterweisungText: linesToHtml(textBlocks.unterweisung),
    };
  }

  /**
   * @param {string[]} pages  Array von Seiten-Strings (pdf.js, eine je PDF-Seite).
   * @returns {{ wochen: Woche[], warnungen: string[] }}
   */
  function parse(pages) {
    const result = { wochen: [], warnungen: [] };
    const allLines = flattenPages(pages);

    // Gültige Wochen-Marker einsammeln (Spanne ≤ 10 Tage; verwirft TOC-Gesamtzeitraum).
    const markers = [];
    allLines.forEach((line, i) => {
      const m = strip(line).match(WOCHE_RE);
      if (!m) return;
      const startDate = ddmmyyyyToISO(m[1]);
      const endDate   = ddmmyyyyToISO(m[2]);
      if (startDate && endDate && spanDays(startDate, endDate) >= 0 && spanDays(startDate, endDate) <= 10) {
        markers.push({ i, startDate, endDate });
      }
    });

    markers.forEach((mk, idx) => {
      const bodyEnd   = idx + 1 < markers.length ? markers[idx + 1].i : allLines.length;
      const bodyLines = allLines.slice(mk.i + 1, bodyEnd);
      // Status steht im Export VOR dem Wochen-Marker („Ausbilder Status …
      // Eingereicht … freigegeben"): die bis zu 8 Vorlauf-Zeilen scannen,
      // begrenzt durch die vorige Woche.
      const headStart = Math.max(idx === 0 ? 0 : markers[idx - 1].i + 1, mk.i - 8);
      const status    = mapStatus(allLines.slice(headStart, mk.i).map(strip).join(' '));
      const woche     = parseWeekBody(mk.startDate, mk.endDate, bodyLines, status, result.warnungen);
      if (woche) result.wochen.push(woche);
    });

    return result;
  }

  const api = {
    parse,
    classifyFontName,
    assembleLine,
    linesToHtml,
    decodeUnderlineSegments,
    matchUnderline,
    // Für direkte Node-Tests exportiert:
    _ddmmyyyyToISO: ddmmyyyyToISO,
    _hmToDecimal:   hmToDecimal,
    _mapStatus:     mapStatus,
    _mapDayType:    mapDayType,
    _getISOKW:      getISOKW,
    _spanDays:      spanDays,
  };
  global.IhkParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `node --test app/js/ihk-parser.test.js`
Expected: PASS — alle Tests grün (`# pass 12`, `# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add app/js/ihk-parser.js app/js/ihk-parser.test.js
git commit -m "$(cat <<'EOF'
fix(ihk-parser): mehrseitige Wochen + Status + Format-Marker

Dokumentweite State-Machine (Seiten -> ein Zeilenstrom, Schnitt an
gueltigen Ausbildungswoche-Markern <=10 Tage), Qualifikationen-Skip nur
bis zum naechsten Tag/Abschnitt, Status-Preamble vor dem Marker.
Format-Marker \x02<flag><text>\x03 (fett/kursiv/unterstrichen) -> linesToHtml,
plus classifyFontName + decodeUnderlineSegments/matchUnderline fuer ihk-import.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: pdf.js-Glue + Gating (`ihk-import.js`)

**Files:**
- Modify: `app/js/ihk-import.js` — `renderSection` (Z. ~32–33, Gating), `extractPages` (Z. ~210–220), `itemsToText` (Z. ~225–242)

- [ ] **Step 1: Gating in `renderSection`** — die erste Zeile von `renderSection(user)`

```js
    if (!user || user.role !== 'azubi') return '';
```

ersetzen durch:

```js
    // Vorerst nur fuer die woechentliche Berichtsform (kaufmaennische & IT-Azubis).
    // Taeglicher Import folgt spaeter. berichtTyp ist pro Azubi gespeichert.
    if (!user || user.role !== 'azubi' || user.berichtTyp !== 'wöchentlich') return '';
```

`bind(user)` braucht keine Änderung (kehrt ohne `#ihkSection` früh zurück).

- [ ] **Step 2: `extractPages` ersetzen** (Z. ~210–220) — `getOperatorList` ergänzen, Unterstreichungen je Seite vorab berechnen:

```js
  // Seitenweise pdf.js-Extraktion: getOperatorList() laedt Fonts (fuer echte
  // Schriftnamen) und liefert die Pfad-Ops (fuer Unterstreichungs-Erkennung).
  async function extractPages(arrayBuffer) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const pdf   = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page       = await pdf.getPage(p);
      const opList     = await page.getOperatorList();
      const underlines = IhkParser.decodeUnderlineSegments(opList.fnArray, opList.argsArray, pdfjsLib.OPS);
      const content    = await page.getTextContent();
      pages.push(itemsToText(content.items, page, underlines));
      page.cleanup();
    }
    return pages;
  }
```

- [ ] **Step 3: `itemsToText` ersetzen** (Z. ~225–242) — Fett/Kursiv aus echtem Font-Namen, Unterstreichung aus Geometrie, Marker via `IhkParser.assembleLine`:

```js
  // Items nach y-Koordinate zu Zeilen gruppieren; pro Lauf Bold/Italic (echter
  // Schriftname via commonObjs) und Underline (Fuell-Rechteck) bestimmen.
  function itemsToText(items, page, underlines) {
    const fontFlags = {};
    function flagsFor(fontName) {
      if (fontFlags[fontName]) return fontFlags[fontName];
      let name = '';
      try {
        if (page.commonObjs.has(fontName)) name = (page.commonObjs.get(fontName) || {}).name || '';
      } catch (e) { name = ''; }
      return (fontFlags[fontName] = IhkParser.classifyFontName(name));
    }

    const rows = [];
    items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      const f  = flagsFor(it.fontName);
      const x0 = it.transform[4];
      const underline = IhkParser.matchUnderline(
        { x0, x1: x0 + it.width, baseline: it.transform[5] }, underlines
      );
      row.cells.push({ x: x0, str: it.str, bold: f.bold, italic: f.italic, underline });
    });
    rows.sort((a, b) => b.y - a.y); // oben → unten
    return rows.map(r => IhkParser.assembleLine(r.cells)).join('\n');
  }
```

- [ ] **Step 4: Syntax-Check**

Run: `node --check app/js/ihk-import.js`
Expected: keine Ausgabe (Syntax OK). Laufzeit-Test folgt in Task 3 (braucht pdf.js/Browser).

- [ ] **Step 5: Commit**

```bash
git add app/js/ihk-import.js
git commit -m "$(cat <<'EOF'
feat(ihk-import): Formatierung extrahieren + Gating auf woechentliche Form

extractPages nutzt getOperatorList (Fonts + Pfade); itemsToText bestimmt
Bold/Italic ueber den echten Schriftnamen (commonObjs) statt fontFamily und
Underline ueber Fuell-Rechtecke, delegiert die Zeilen-Assembly an den Parser.
renderSection nur noch fuer berichtTyp === 'woechentlich'.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verifikation gegen echte PDFs + App-Rundlauf

**Files:** keine (reine Verifikation)

- [ ] **Step 1: Temp-Harness mit pdfjs-dist anlegen** (Repo bleibt abhängigkeitsfrei):

```bash
TMP="$TEMP/ihk-verify"; mkdir -p "$TMP"; cd "$TMP"
echo '{"name":"v","version":"1.0.0","type":"commonjs"}' > package.json
npm install pdfjs-dist@3.11.174 --no-audit --no-fund --loglevel=error
```

- [ ] **Step 2: Harness `$TEMP/ihk-verify/verify.cjs` schreiben** (spiegelt die ihk-import-Extraktion, ruft den echten Parser):

```js
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const REPO = process.argv[3] || 'c:/Dev/Digitales-Berichtsheft';
const P = require(REPO + '/app/js/ihk-parser.js');

function itemsToText(items, page, underlines) {
  const ff = {};
  const flags = fn => ff[fn] || (ff[fn] = P.classifyFontName(
    (() => { try { return page.commonObjs.has(fn) ? (page.commonObjs.get(fn)||{}).name||'' : ''; } catch(e){ return ''; } })()
  ));
  const rows = [];
  items.forEach(it => {
    if (!it.str || !it.str.trim()) return;
    const y = Math.round(it.transform[5]);
    let r = rows.find(r => Math.abs(r.y - y) <= 3);
    if (!r) { r = { y, cells: [] }; rows.push(r); }
    const f = flags(it.fontName), x0 = it.transform[4];
    const underline = P.matchUnderline({ x0, x1: x0 + it.width, baseline: it.transform[5] }, underlines);
    r.cells.push({ x: x0, str: it.str, bold: f.bold, italic: f.italic, underline });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => P.assembleLine(r.cells)).join('\n');
}

(async () => {
  const data = new Uint8Array(fs.readFileSync(process.argv[2]));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const ol = await page.getOperatorList();
    const u = P.decodeUnderlineSegments(ol.fnArray, ol.argsArray, pdfjsLib.OPS);
    const c = await page.getTextContent();
    pages.push(itemsToText(c.items, page, u));
  }
  const res = P.parse(pages);
  const w = res.wochen.find(x => x.startDate === '2025-01-06');
  console.log('Wochen gesamt:', res.wochen.length);
  console.log('KW 06.01.2025 -> Tage:', w ? w.tage.length : 'FEHLT',
              '| Status', w && w.status,
              '| Orte', w && w.tage.map(t => t.wochentag + '=' + (t.ort || t.anwesenheit)).join(','));
  console.log('Unterstr. IT-Abteilung:', w && /<strong><u>IT-Abteilung:<\/u><\/strong>/.test(w.betriebText));
  console.log('Unterstr. Dienstag:', w && /<strong><u>Dienstag:<\/u><\/strong>/.test(w.schuleText));
  if (!w || w.tage.length !== 5) { console.error('FEHLER: KW 06.01.2025 sollte 5 Tage haben'); process.exit(1); }
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Harness ausführen**

```bash
cd "$TEMP/ihk-verify"
node verify.cjs "c:/Dev/Digitales-Berichtsheft/Berichtsheft exporte/Flo K.pdf" 2>/dev/null
node verify.cjs "c:/Dev/Digitales-Berichtsheft/Berichtsheft exporte/Luca D.pdf" 2>/dev/null
```

**Akzeptanzkriterien:**
- `KW 06.01.2025 -> Tage: 5` (vorher 2), Orte für alle 5 Tage gefüllt, `Status freigegeben`.
- `Unterstr. IT-Abteilung: true` und `Unterstr. Dienstag: true`.
- `Wochen gesamt` ≈ Anzahl Detail-Wochen (keine Geisterwoche aus dem Inhaltsverzeichnis), Abschluss `OK`.

Bei Abweichung: Schwellen in `matchUnderline`/`decodeUnderlineSegments` bzw. State-Machine prüfen, Tests in Task 1 ergänzen und fixen (zurück zum Implementierer).

- [ ] **Step 4: App-Rundlauf (Browser)** — Dev-Server + Edge/Playwright (siehe Memory „Lokales App-Testing"):

```bash
node backend/server.js   # Port 3000, in separatem Terminal
```

1. **Gating:** als Azubi mit `berichtTyp: 'täglich'` → Profil zeigt **keine** IHK-Sektion; als Azubi mit `berichtTyp: 'wöchentlich'` → Sektion sichtbar. (Seed-User mit beiden Typen in [app/js/data.js](../../app/js/data.js).)
2. PDF `Flo K.pdf` hochladen → Vorschau (Wochen/Tage/Status plausibel) → übernehmen → Wochenansicht KW 02/2025.
3. Prüfen: alle 5 Werktage mit Anwesenheit/Ort/Stunden; im Quill-Editor `Dienstag:`/`IT-Abteilung:` **fett + unterstrichen**, `Software:` etc. **fett**.
4. Kleinigkeit ändern → speichern → neu laden: Formatierung übersteht den Rundlauf.

- [ ] **Step 5: Temp-Ordner aufräumen (optional)**

```bash
rm -rf "$TEMP/ihk-verify"
```

---

## Self-Review-Notiz (Autor)

- **Spec-Abdeckung:** Multi-Page+Quali → Task 1 (`flattenPages`/`parseWeekBody`/`skipQuali`); TOC-Guard → Task 1 (`spanDays ≤ 10` + Test); Status-Zuordnung → Task 1 (`headStart`-Preamble + Test); Gating → Task 2; Fett/Kursiv → Task 1 (`classifyFontName`/`linesToHtml`) + Task 2 (`commonObjs`); Unterstreichung → Task 1 (`decodeUnderlineSegments`/`matchUnderline`) + Task 2; Quill-Rundlauf → Task 3/Step 4; Verifikation echte PDFs → Task 3.
- **Typkonsistenz:** Marker-Bitmaske identisch in `assembleLine`/`linesToHtml`/`strip`; `matchUnderline({x0,x1,baseline})` ↔ `itemsToText`; `decodeUnderlineSegments(fnArray,argsArray,OPS)` identisch in Task 1/2/3.
- **Out of scope:** Schriftfarbe, markitdown/Backend, `status='genehmigt'`-Hardcode beim Speichern, täglicher Import.
