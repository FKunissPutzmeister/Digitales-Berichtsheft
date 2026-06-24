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

  const api = { htmlToLines, normalize, buildIndex, KINDS };
  global.ActivitySuggestions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
