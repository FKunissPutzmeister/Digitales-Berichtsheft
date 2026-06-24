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

  const api = { htmlToLines, normalize, buildIndex, query, bump, ensure, invalidate, KINDS };
  global.ActivitySuggestions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
