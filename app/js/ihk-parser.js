/* ===================================================================
   IHK-PARSER.JS
   Reine Parsing-Logik für den IHK-Ausbildungsnachweis (PDF → Wochendaten).
   Bewusst ohne DOM- und ohne pdf.js-Abhängigkeit, damit die Logik
   isoliert (auch in Node) testbar bleibt. Die PDF-Textextraktion
   passiert separat in ihk-import.js und liefert hier ein Array von
   Seiten-Strings (je Seite = je Ausbildungswoche).
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

  // ISO 8601 Kalenderwoche aus Date-Objekt (identische Logik wie DateUtil in api.js)
  function getISOKW(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yr = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return {
      kw:   Math.ceil((((d - yr) / 86400000) + 1) / 7),
      year: d.getUTCFullYear(),
    };
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

  function linesToHtml(lines) {
    if (!lines.length) return '';
    return lines.map(l => {
      // Segmente an Fett-Markern aufteilen, HTML-escapen, <strong> einfügen
      const parts = l.split(/(\x02[^\x03]*\x03)/);
      const html = parts.map(part => {
        if (part.charAt(0) === '\x02') {
          return '<strong>' + escapeHtml(part.slice(1, -1)) + '</strong>';
        }
        return escapeHtml(part);
      }).join('');
      return `<p>${html}</p>`;
    }).join('');
  }

  // Mo/Di/Mi/Do/Fr | DD.MM.YYYY | Typ | anwesend/abwesend [HH:MM]
  // Das | kann im extrahierten pdf.js-Text auch fehlen oder als Leerzeichen erscheinen.
  const DAY_RE              = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s*\|?\s*(\d{2}\.\d{2}\.\d{4})\s*\|?\s*(.+?)\s*\|?\s*(anwesend|abwesend)(?:\s+(\d{1,2}:\d{2}))?/i;
  const WOCHE_RE            = /Ausbildungswoche\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(\d{2}\.\d{2}\.\d{4})/i;
  const STATUS_RE           = /^Status[:\s]+(.+)/i;
  const QUALI_RE            = /^Qualifikationen:/i;
  const WEEKEND_RE          = /^(Sa|So)\b/i;
  const SCHULE_BETRIEB_RE   = /^Schule\/Betrieb\s*$/i;
  const SCHULE_BLOCK_RE     = /^Schule:\s*$/i;
  const BETRIEB_BLOCK_RE    = /^Betrieb:\s*$/i;
  const UNTERWEISUNG_BLOCK_RE = /^Unterweisung:\s*$/i;

  function parsePage(text, warnungen) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let startDate   = null;
    let endDate     = null;
    let status      = 'offen';
    let skipRest    = false;
    let textSection = null; // null | 'schule' | 'betrieb' | 'unterweisung'

    // Roheinträge je Datum – mehrere Zeilen möglich (Betrieb + Schule am gleichen Tag)
    const rawByDatum = {};
    const textBlocks = { schule: [], betrieb: [], unterweisung: [] };

    for (const line of lines) {
      // Fett-Marker für Struktur-Matching entfernen; Original-Zeile für Textblöcke behalten
      const s = line.replace(/\x02|\x03/g, '');

      if (skipRest) continue;
      if (QUALI_RE.test(s)) { skipRest = true; continue; }

      const wm = s.match(WOCHE_RE);
      if (wm) {
        startDate = ddmmyyyyToISO(wm[1]);
        endDate   = ddmmyyyyToISO(wm[2]);
        continue;
      }

      const sm = s.match(STATUS_RE);
      if (sm) { status = mapStatus(sm[1]); continue; }

      if (WEEKEND_RE.test(s)) continue; // Sa/So in 7-Tage-PDFs überspringen

      // Textbereich-Abschnitts-Header
      if (SCHULE_BETRIEB_RE.test(s))     { continue; }
      if (SCHULE_BLOCK_RE.test(s))       { textSection = 'schule';       continue; }
      if (BETRIEB_BLOCK_RE.test(s))      { textSection = 'betrieb';      continue; }
      if (UNTERWEISUNG_BLOCK_RE.test(s)) { textSection = 'unterweisung'; continue; }

      const dm = s.match(DAY_RE);
      if (dm) {
        textSection = null; // Anwesenheitstabelle kommt vor den Textblöcken
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
        textBlocks[textSection].push(line); // Original mit Fett-Markern
      }
    }

    if (!startDate) return null; // Kein Wochenkopf → keine gültige Seite

    const { kw, year } = getISOKW(new Date(startDate + 'T00:00:00'));

    // Betrieb + Schule am gleichen Tag → ort: 'Betrieb/Schule', Stunden summiert
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
          stunden:     entries.reduce((s, e) => s + e.stunden, 0),
        };
      }
      return entries[0];
    });

    tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));

    return {
      kw, year, startDate, endDate, status, tage,
      betriebText:      linesToHtml(textBlocks.betrieb),
      schuleText:       linesToHtml(textBlocks.schule),
      unterweisungText: linesToHtml(textBlocks.unterweisung),
    };
  }

  /**
   * @param {string[]} pages  Array von Seiten-Strings (je Seite = je Woche).
   * @returns {{ wochen: Woche[], warnungen: string[] }}
   */
  function parse(pages) {
    const result = { wochen: [], warnungen: [] };
    for (const pageText of (pages || [])) {
      const woche = parsePage(pageText, result.warnungen);
      if (woche) result.wochen.push(woche);
    }
    return result;
  }

  const api = {
    parse,
    // Für direkte Node-Tests exportiert:
    _ddmmyyyyToISO: ddmmyyyyToISO,
    _hmToDecimal:   hmToDecimal,
    _mapStatus:     mapStatus,
    _mapDayType:    mapDayType,
    _getISOKW:      getISOKW,
  };
  global.IhkParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
