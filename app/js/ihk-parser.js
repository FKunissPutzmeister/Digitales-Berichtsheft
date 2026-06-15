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
          warnungen.push(`${cap(wt)} ${datum}: Typ „${typ.trim()}" nicht erkannt.`);
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
