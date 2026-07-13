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

  // IHK-Quellstatus → interner Status. WICHTIG: In der IHK-Quelle heißt es, der
  // Azubi „reicht ein" (eingereicht) und die/der Ausbilder:in „gibt frei"
  // (freigegeben) – „freigegeben" bedeutet dort also ABGENOMMEN/genehmigt.
  // Bei uns ist 'freigegeben' hingegen „vom Azubi abgegeben, wartet noch auf
  // Prüfung" und 'genehmigt' = abgenommen. Deshalb:
  //   „… freigegeben." / „genehmigt" / „akzeptiert"  → 'genehmigt'
  //   „eingereicht" (nur abgegeben, keine Ausbilder-Freigabe) → 'freigegeben'
  //   „abgelehnt" / „zurückgewiesen" / „zurückgegeben"        → 'abgelehnt'
  //   „In Bearbeitung" / nichts erkannt                        → 'offen'
  // Reihenfolge: Ablehnung zuerst (überstimmt eine frühere Freigabe), dann die
  // Abnahme (deren Text „Eingereicht … freigegeben" auch „eingereicht" enthält,
  // daher VOR der Abgabe-Prüfung), zuletzt die reine Abgabe.
  function mapStatus(text) {
    const t = String(text || '').toLowerCase();
    if (/abgelehnt|zur[üu]ckgewiesen|zur[üu]ckgegeben/.test(t)) return 'abgelehnt';
    if (/freigegeben|genehmigt|akzeptiert/.test(t))            return 'genehmigt';
    if (/eingereicht|vom azubi/.test(t))                       return 'freigegeben';
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
      .map(c => {
        const str = String(c.str).replace(/[\x02-\x05]/g, ''); // In-band-Markerzeichen aus Nutztext fernhalten
        const f = cellFlag(c);
        return f ? `\x02${f}${str}\x03` : str;
      })
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

  // Eine Marker-Zeile (\x02flag…\x03-Läufe) → Inline-HTML.
  function inlineHtml(line) {
    const parts = String(line).split(/(\x02[1-7][^\x03]*\x03)/);
    return parts.map(part => {
      if (part.charAt(0) === '\x02') {
        return wrapFlag(parseInt(part.charAt(1), 10), escapeHtml(part.slice(2, -1)));
      }
      return escapeHtml(part);
    }).join('');
  }

  // Zellinhalt (Zeilen per \n) → <p>-Folge; leere Zelle → Quill-Leerabsatz.
  function cellHtml(cellStr) {
    const lines = String(cellStr).split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return '<p><br></p>';
    return lines.map(l => `<p>${inlineHtml(l)}</p>`).join('');
  }

  // Tabellenmarker (\x04json\x05) → <table>-HTML; null bei defektem Marker.
  function tableMarkerToHtml(line) {
    const s = String(line);
    if (s.charAt(0) !== '\x04' || s.charAt(s.length - 1) !== '\x05') return null;
    let rows;
    try { rows = JSON.parse(s.slice(1, -1)); } catch (e) { return null; }
    if (!Array.isArray(rows) || !rows.length || !rows.every(Array.isArray)) return null;
    const body = rows.map(r =>
      '<tr>' + r.map(c => `<td>${cellHtml(c)}</td>`).join('') + '</tr>'
    ).join('');
    return `<table><tbody>${body}</tbody></table>`;
  }

  function linesToHtml(lines) {
    if (!lines.length) return '';
    return lines.map(l => {
      if (String(l).charAt(0) === '\x04') {
        const t = tableMarkerToHtml(l);
        if (t) return t;
        // Fallback: Markerzeichen entfernen, Inhalt als Absatz erhalten.
        return `<p>${inlineHtml(String(l).replace(/[\x04\x05]/g, ''))}</p>`;
      }
      return `<p>${inlineHtml(l)}</p>`;
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
        // Unterstreichungen im IHK-Export sind ~0,3pt hohe gefüllte Rechtecke
        // (PDF-Punkte): h<1,5 trennt sie von Flächen/Boxen, w>3 von Punkten.
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

  // Läuft die Operatorliste ab und ruft cb mit der BBox jedes GESTRICHENEN
  // Subpfads auf (Gerätekoordinaten). Gemeinsame Basis für decodeStrokedBoxes
  // (geschlossene 2D-Zellboxen) und decodeStrokedLines (Kanten als Linien).
  function eachStrokedSubpath(fnArray, argsArray, OPS, cb) {
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let subpaths = [];
    let cur = null;

    function addPoint(x, y) {
      const p = matApply(ctm, x, y);
      if (!cur) { cur = { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] }; subpaths.push(cur); return; }
      cur.minX = Math.min(cur.minX, p[0]); cur.maxX = Math.max(cur.maxX, p[0]);
      cur.minY = Math.min(cur.minY, p[1]); cur.maxY = Math.max(cur.maxY, p[1]);
    }

    for (let k = 0; k < fnArray.length; k++) {
      const fn = fnArray[k], a = argsArray[k];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = matMul(ctm, a);
      else if (fn === OPS.constructPath) {
        const ops = a[0], c = a[1];
        let i = 0;
        for (const op of ops) {
          if (op === OPS.moveTo)      { cur = null; addPoint(c[i], c[i+1]); i += 2; }
          else if (op === OPS.lineTo) { addPoint(c[i], c[i+1]); i += 2; }
          else if (op === OPS.curveTo) {
            addPoint(c[i], c[i+1]); addPoint(c[i+2], c[i+3]); addPoint(c[i+4], c[i+5]); i += 6;
          }
          else if (op === OPS.rectangle) {
            cur = null;
            addPoint(c[i], c[i+1]);
            addPoint(c[i] + c[i+2], c[i+1] + c[i+3]);
            cur = null;
            i += 4;
          }
        }
      }
      else if (fn === OPS.stroke || fn === OPS.closeStroke) {
        for (const s of subpaths) cb(s);
        subpaths = []; cur = null;
      }
      else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) { subpaths = []; cur = null; }
    }
  }

  // → Bounding-Boxen GESTRICHENER Subpfade mit echter 2D-Ausdehnung
  // (Zellen, die als geschlossener (Rund-)Rechteckpfad gezeichnet sind).
  // Gegenstück zu decodeUnderlineSegments (das nur GEFÜLLTE Unterstreichungs-
  // Rechtecke sammelt). Plausible Zellgrößen (PDF-Punkte): schließt Separator-
  // Linien (h≈0 bzw. w≈0) und den seitengroßen Karten-Container aus.
  function decodeStrokedBoxes(fnArray, argsArray, OPS) {
    const boxes = [];
    eachStrokedSubpath(fnArray, argsArray, OPS, s => {
      const w = s.maxX - s.minX, h = s.maxY - s.minY;
      if (w >= 15 && w <= 520 && h >= 8 && h <= 500) {
        boxes.push({ x0: s.minX, y0: s.minY, x1: s.maxX, y1: s.maxY });
      }
    });
    return boxes;
  }

  // → degenerierte GESTRICHENE Subpfade (Dicke < 2pt) als Kantenlinien.
  // Der echte IHK-Export zeichnet jede Zellkante als eigenen 2-Punkt-
  // Linienzug – decodeStrokedBoxes verwirft genau diese; hier werden sie
  // eingesammelt und von cellsFromLines zu Zellen rekonstruiert.
  function decodeStrokedLines(fnArray, argsArray, OPS) {
    const hLines = [], vLines = [];
    eachStrokedSubpath(fnArray, argsArray, OPS, s => {
      const w = s.maxX - s.minX, h = s.maxY - s.minY;
      if (h < 2 && w >= 15)      hLines.push({ y: (s.minY + s.maxY) / 2, x0: s.minX, x1: s.maxX });
      else if (w < 2 && h >= 8)  vLines.push({ x: (s.minX + s.maxX) / 2, y0: s.minY, y1: s.maxY });
    });
    return { hLines, vLines };
  }

  // Segmente einer Achse zu Kanten clustern (Position ±2.5pt), je Kante
  // kollineare Läufe mergen (Lücke ≤ 4pt) – geteilte Kantenstücke benachbarter
  // Zellen zählen so als eine durchgehende Kante.
  function clusterEdges(segs, posKey, aKey, bKey) {
    const edges = [];
    for (const s of segs) {
      let e = null;
      for (const cand of edges) { if (Math.abs(cand.pos - s[posKey]) <= 2.5) { e = cand; break; } }
      if (!e) { e = { pos: s[posKey], runs: [] }; edges.push(e); }
      e.runs.push({ a: s[aKey], b: s[bKey] });
    }
    for (const e of edges) {
      e.runs.sort((r, q) => r.a - q.a);
      const merged = [];
      for (const r of e.runs) {
        const last = merged[merged.length - 1];
        if (last && r.a <= last.b + 4) last.b = Math.max(last.b, r.b);
        else merged.push({ a: r.a, b: r.b });
      }
      e.runs = merged;
    }
    edges.sort((e, f) => e.pos - f.pos);
    return edges;
  }

  function edgeCovers(edge, from, to) {
    return edge.runs.some(r => r.a <= from + 3 && r.b >= to - 3);
  }

  // Zellen aus dem Linienraster: Ein Paar vertikaler Kanten (links/rechts) ×
  // ein Paar horizontaler Kanten (unten/oben) bildet eine Zelle, wenn alle
  // vier Kanten die jeweilige Spanne abdecken und keine weitere Kante die
  // Fläche teilt (sonst entstünden spalten-/zeilenübergreifende Riesenzellen).
  function cellsFromLines(lines) {
    const vEdges = clusterEdges((lines && lines.vLines) || [], 'x', 'y0', 'y1');
    const hEdges = clusterEdges((lines && lines.hLines) || [], 'y', 'x0', 'x1');
    const cells = [];
    for (let a = 0; a < vEdges.length; a++) {
      for (let b = a + 1; b < vEdges.length; b++) {
        const xL = vEdges[a].pos, xR = vEdges[b].pos, w = xR - xL;
        if (w < 15) continue;
        if (w > 520) break;
        for (let c = 0; c < hEdges.length; c++) {
          for (let d = c + 1; d < hEdges.length; d++) {
            const y0 = hEdges[c].pos, y1 = hEdges[d].pos, h = y1 - y0;
            if (h < 8) continue;
            if (h > 500) break;
            if (!edgeCovers(vEdges[a], y0, y1) || !edgeCovers(vEdges[b], y0, y1)) continue;
            if (!edgeCovers(hEdges[c], xL, xR) || !edgeCovers(hEdges[d], xL, xR)) continue;
            const splitV = vEdges.some(e => e.pos > xL + 2 && e.pos < xR - 2 && edgeCovers(e, y0 + 2, y1 - 2));
            if (splitV) continue;
            const splitH = hEdges.some(e => e.pos > y0 + 2 && e.pos < y1 - 2 && edgeCovers(e, xL + 2, xR - 2));
            if (splitH) continue;
            cells.push({ x0: xL, y0: y0, x1: xR, y1: y1 });
          }
        }
      }
    }
    return cells;
  }

  // ── Tabellen-Gitter aus Zellboxen ──────────────────────────────
  function overlap1d(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }

  // Benachbart = neben- oder untereinander mit kleiner Lücke (IHK-Export:
  // Zellboxen haben ~4–10pt Abstand) und ausreichender Überlappung quer dazu.
  function boxesAdjacent(a, b) {
    const GAP = 14;
    const hGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
    const vGap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
    const vOv  = overlap1d(a.y0, a.y1, b.y0, b.y1);
    const hOv  = overlap1d(a.x0, a.x1, b.x0, b.x1);
    const minH = Math.min(a.y1 - a.y0, b.y1 - b.y0);
    const minW = Math.min(a.x1 - a.x0, b.x1 - b.x0);
    if (hGap > -2 && hGap <= GAP && vOv >= minH * 0.5) return true;
    if (vGap > -2 && vGap <= GAP && hOv >= minW * 0.5) return true;
    return false;
  }

  // Boxen zu Gittern clustern. Tabelle = Cluster mit ≥2 Zeilen UND ≥2 Spalten;
  // alles andere (einspaltige Layout-Boxen, Einzelboxen) wird verworfen.
  function detectTableGrids(boxes) {
    const n = (boxes || []).length;
    const parent = [];
    for (let i = 0; i < n; i++) parent.push(i);
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (boxesAdjacent(boxes[i], boxes[j])) parent[find(i)] = find(j);
      }
    }
    const groups = {};
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups[r]) groups[r] = [];
      groups[r].push(boxes[i]);
    }

    const grids = [];
    Object.values(groups).forEach(cells => {
      if (cells.length < 4) return;
      // Zeilen: Zellen mit ≥50% vertikaler Überlappung zur ersten Zelle der Zeile
      const sorted = cells.slice().sort((a, b) => b.y1 - a.y1);
      const rows = [];
      for (const c of sorted) {
        const row = rows.find(r =>
          overlap1d(r[0].y0, r[0].y1, c.y0, c.y1) >= Math.min(r[0].y1 - r[0].y0, c.y1 - c.y0) * 0.5);
        if (row) row.push(c); else rows.push([c]);
      }
      rows.forEach(r => r.sort((a, b) => a.x0 - b.x0));
      // Spaltenzahl: distinkte x0-Werte (Toleranz 6pt)
      const xs = [];
      cells.forEach(c => { if (!xs.some(x => Math.abs(x - c.x0) <= 6)) xs.push(c.x0); });
      if (rows.length < 2 || xs.length < 2) return;
      grids.push({
        x0: Math.min.apply(null, cells.map(c => c.x0)),
        y0: Math.min.apply(null, cells.map(c => c.y0)),
        x1: Math.max.apply(null, cells.map(c => c.x1)),
        y1: Math.max.apply(null, cells.map(c => c.y1)),
        rows,
      });
    });
    return grids;
  }

  // Zellindex eines Punkts im Gitter (±1pt Toleranz), sonst null.
  function cellAt(grid, x, y) {
    for (let r = 0; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      for (let c = 0; c < row.length; c++) {
        const b = row[c];
        if (x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1) return { r, c };
      }
    }
    return null;
  }

  // Gitter, in dessen ZELLE der Punkt liegt. Punkte in Zell-Lücken/Rändern
  // bleiben im normalen Zeilenfluss (kein Textverlust durch Fehlzuordnung).
  function gridContaining(grids, x, y) {
    for (const g of (grids || [])) { if (cellAt(g, x, y)) return g; }
    return null;
  }

  // Items eines Gitters → Tabellenmarker. Je Zelle werden die Items wie in
  // itemsToText nach y-Läufen gruppiert (Toleranz 3) und per assembleLine
  // formatiert; mehrzeilige Zellinhalte verbinden sich per \n. JSON.stringify
  // escaped die \x02/\x03-Formatmarker → der Marker bleibt EINE Zeile.
  function assembleTable(grid, items) {
    const buf = grid.rows.map(row => row.map(() => []));
    for (const it of (items || [])) {
      const pos = cellAt(grid, it.x, it.y);
      if (!pos) continue;
      const runs = buf[pos.r][pos.c];
      const y = Math.round(it.y);
      let run = runs.find(l => Math.abs(l.y - y) <= 3);
      if (!run) { run = { y, cells: [] }; runs.push(run); }
      run.cells.push({ x: it.x, str: it.str, bold: it.bold, italic: it.italic, underline: it.underline });
    }
    const rows = buf.map(row => row.map(runs => {
      runs.sort((a, b) => b.y - a.y);
      return runs.map(r => assembleLine(r.cells)).join('\n');
    }));
    return '\x04' + JSON.stringify(rows) + '\x05';
  }

  // Liegt eine Unterstreichungs-Linie knapp unter der Baseline und ~ textbreit?
  function matchUnderline(item, segs) {
    // Toleranzen in PDF-Punkten, empirisch am IHK-Export kalibriert: Linie sitzt
    // ~1pt unter der Baseline (0..4), deckt ≥60% der Laufbreite und ist nicht
    // wesentlich breiter als der Text (≤1,4×) → grenzt Unterstreichung von Tabellenrändern ab.
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
  // doppelte Standalone-Zeit-Zeile unter jeder Tageszeile). Gilt für beide
  // Exportformen (Wochen- und Tagesbasis).
  const NOISE_RE              = /^(Seite\s+\d+|Ausbildungsnachweis auf (Wochen|Tages)basis|Dauer gesamt:.*|\d{1,2}:\d{2})$/i;
  // Kopfzeile jeder (Folge-)Woche im Tagesbasis-Export. Sie steht VOR dem
  // „Ausbildungswoche …"-Marker und fällt damit ans Ende des Bodys der
  // VORWoche → markiert dort das Ende der letzten Tagesbeschreibung.
  const AZUBI_HEADER_RE       = /^Auszubildende\/r$/i;

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

  // Manche IHK-Exporte rahmen den KOMPLETTEN Wochentext als Tabelle – dann
  // stecken die Abschnitts-Überschriften („Schule:" / „Betrieb:" /
  // „Unterweisung:") samt Inhalt IN einer Tabellenzelle statt als eigene
  // Zeilen. Die section-basierte Zuordnung in parseWeekBody liefe dann leer
  // (betriebText/schuleText blieben trotz vorhandenem Inhalt leer, s. echter
  // Fall KW21/2026). Solche „Container-Tabellen" werden hier wieder in ihre
  // Einzelzeilen zerlegt (Reihenfolge + Format-Marker erhalten), sodass die
  // normale Zeilenlogik greift. ECHTE Inhaltstabellen (z. B. BWL|Prokura)
  // tragen KEINE Abschnitts-Labels und bleiben unangetastet (→ <table>).
  const SECTION_LABEL_RE = /^(Schule|Betrieb|Unterweisung):/i;

  function decodeTableRows(line) {
    const s = String(line);
    if (s.charAt(0) !== '\x04' || s.charAt(s.length - 1) !== '\x05') return null;
    try {
      const rows = JSON.parse(s.slice(1, -1));
      if (Array.isArray(rows) && rows.length && rows.every(Array.isArray)) return rows;
    } catch (e) { /* defekter Marker → nicht zerlegen */ }
    return null;
  }

  function isSectionContainerTable(rows) {
    return rows.some(row => row.some(cell =>
      SECTION_LABEL_RE.test(strip(String(cell)).trim())));
  }

  function expandSectionTables(lines) {
    const out = [];
    for (const line of lines) {
      const rows = (String(line).charAt(0) === '\x04') ? decodeTableRows(line) : null;
      if (rows && isSectionContainerTable(rows)) {
        // Zellen in Lesereihenfolge (Zeile für Zeile) zu Einzelzeilen auflösen;
        // Zellinhalt ist per \n gegliedert (inkl. der Abschnitts-Überschrift als
        // erster Zeile). Format-Marker bleiben erhalten.
        for (const row of rows) {
          for (const cell of row) {
            const c = String(cell);
            if (!c.trim()) continue;
            for (const sub of c.split('\n')) {
              if (sub.trim()) out.push(sub);
            }
          }
        }
      } else {
        out.push(line);
      }
    }
    return out;
  }

  // Einen Wochen-Block parsen (Zeilen einer Woche, Marker erhalten).
  function parseWeekBody(startDate, endDate, lines, status, warnungen) {
    lines = expandSectionTables(lines);
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
      kw, year, startDate, endDate, status, modus: 'wöchentlich', tage,
      betriebText:      linesToHtml(textBlocks.betrieb),
      schuleText:       linesToHtml(textBlocks.schule),
      unterweisungText: linesToHtml(textBlocks.unterweisung),
    };
  }

  // Einen Wochen-Block im TAGESBASIS-Format parsen. Anders als beim
  // Wochenbasis-Export steht die Tätigkeitsbeschreibung NICHT in
  // Betrieb:/Schule:/Unterweisung:-Wochenblöcken, sondern unter jeder
  // Tageskarte (zwischen Tageskopf und dem tageseigenen Qualifikationen-Block).
  // Pro Tag entsteht ein eintragText (HTML); die Qualifikationen-Liste wird –
  // wie beim Wochenimport – verworfen (kein Datenmodell-Feld dafür).
  function parseWeekBodyDaily(startDate, endDate, lines, status, warnungen) {
    const tageByDatum = {};
    let current   = null;  // aktueller Tag: { …, _lines: [], _first: bool }
    let skipQuali = false;

    for (const line of lines) {
      const s = strip(line);

      // Kopfzeile der Folgewoche → aktuelle Tagesbeschreibung beenden; die
      // restlichen Kopfzeilen (Name, Ausbilder, Status) gehören zur nächsten
      // Woche und werden ignoriert, bis die nächste Tageszeile beginnt.
      if (AZUBI_HEADER_RE.test(s)) { current = null; skipQuali = false; continue; }

      if (QUALI_RE.test(s)) { current = null; skipQuali = true; continue; }
      if (skipQuali) {
        if (DAY_RE.test(s)) skipQuali = false; // neue Tageszeile beendet Quali-Block
        else continue;
      }

      const dm = s.match(DAY_RE);
      if (dm) {
        const [, wt, datStr, typ, anwAbw, zeit] = dm;
        const datum = ddmmyyyyToISO(datStr);
        if (!datum) { current = null; continue; }
        const mapped = mapDayType(typ);
        if (!mapped) {
          warnungen.push(`${cap(wt)} ${datum}: Typ „${typ.trim()}" nicht erkannt.`);
          current = null;
          continue;
        }
        // Pro Tag gibt es im Export genau einen Kartenblock. Taucht dasselbe
        // Datum dennoch erneut auf (z. B. Folgeseite), an bestehenden Eintrag
        // weiterhängen statt ihn (und seinen Text) zu überschreiben.
        if (tageByDatum[datum]) {
          current = tageByDatum[datum];
          current._first = false;
          continue;
        }
        const stunden = anwAbw.toLowerCase() === 'anwesend' ? hmToDecimal(zeit) : 0;
        current = { datum, wochentag: cap(wt), ...mapped, stunden, _lines: [], _first: true };
        tageByDatum[datum] = current;
        continue;
      }

      // Beschreibungszeile des aktuellen Tags sammeln (Marker bleiben erhalten).
      if (current) {
        let raw = line;
        if (current._first) {
          // Tagesdauer (HH:MM) ist rechtsbündig und landet beim y-Gruppieren am
          // Ende der ERSTEN Beschreibungszeile → abschneiden.
          raw = raw.replace(/\s*\d{1,2}:\d{2}\s*$/, '');
          current._first = false;
        }
        if (raw.trim()) current._lines.push(raw);
      }
    }

    const tage = Object.values(tageByDatum).map(d => ({
      datum:       d.datum,
      wochentag:   d.wochentag,
      anwesenheit: d.anwesenheit,
      ort:         d.ort,
      stunden:     d.stunden,
      eintragText: linesToHtml(d._lines),
    }));

    if (!tage.length) return null;
    tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));
    const { kw, year } = getISOKW(new Date(startDate + 'T00:00:00'));
    return { kw, year, startDate, endDate, status, modus: 'täglich', tage };
  }

  // Exportform anhand des Seitenkopfs erkennen (Default: wöchentlich, damit
  // bestehende Wochenbasis-Tests/PDFs unverändert greifen).
  function detectModus(pages) {
    return /Ausbildungsnachweis\s+auf\s+Tagesbasis/i.test((pages || []).join('\n'))
      ? 'täglich' : 'wöchentlich';
  }

  /**
   * @param {string[]} pages  Array von Seiten-Strings (pdf.js, eine je PDF-Seite).
   * @param {{ modus?: 'wöchentlich'|'täglich' }} [opts]  Exportform erzwingen;
   *        ohne Angabe automatisch am Seitenkopf erkannt.
   * @returns {{ wochen: Woche[], warnungen: string[], modus: string }}
   */
  function parse(pages, opts) {
    const modus    = (opts && opts.modus) || detectModus(pages);
    const result   = { wochen: [], warnungen: [], modus };
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
      // Status steht im Kopfbereich direkt VOR dem Wochen-Marker („Ausbilder
      // Status … Eingereicht … freigegeben"). Rückwärts (max. 8 Zeilen, begrenzt
      // durch die vorige Woche) sammeln und an der ersten Body-Zeile der Vorwoche
      // (Tageszeile / Abschnitt-Header / Qualifikationen) STOPPEN — sonst können
      // Status-Stichwörter aus Freitexten der Vorwoche die Folgewoche falsch stempeln.
      const lowBound = idx === 0 ? 0 : markers[idx - 1].i + 1;
      const head = [];
      for (let j = mk.i - 1; j >= lowBound && (mk.i - j) <= 8; j--) {
        const sj = strip(allLines[j]);
        if (DAY_RE.test(sj) || isSectionHeader(sj) || QUALI_RE.test(sj)) break;
        head.push(allLines[j]);
      }
      const status = mapStatus(head.map(strip).join(' '));
      const woche  = modus === 'täglich'
        ? parseWeekBodyDaily(mk.startDate, mk.endDate, bodyLines, status, result.warnungen)
        : parseWeekBody(mk.startDate, mk.endDate, bodyLines, status, result.warnungen);
      if (woche) result.wochen.push(woche);
    });

    return result;
  }

  const api = {
    parse,
    detectModus,
    classifyFontName,
    assembleLine,
    linesToHtml,
    assembleTable,
    decodeUnderlineSegments,
    decodeStrokedBoxes,
    decodeStrokedLines,
    cellsFromLines,
    detectTableGrids,
    gridContaining,
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
