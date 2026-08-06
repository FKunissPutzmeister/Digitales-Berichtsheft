'use strict';
/* ===================================================================
   PLANER-PRINT.JS — Druckausgabe des Abteilungsdurchlaufs

   Baut vollstaendige HTML-Dokumente fuer ein EIGENES Druckfenster.
   Bewusst ohne App-Globals (escapeHtml/DateUtil/displayName): das
   Druckfenster hat sie nicht, und die Builder sollen in Node testbar
   bleiben. Deshalb lokale esc()/fmtDe().

   Warum eigenes Fenster statt @media print auf der Live-Seite: die SPA-Seite
   traegt Theme-Hintergruende, eine fixed Sidebar und Responsive-Breakpoints,
   die bei Druckbreite (~1032px bei A4-Landscape) anders greifen als am
   Bildschirm. Genau daran ist der alte Tafel-Druck gescheitert.

   Browser: window.PlanerPrint · Node/Tests: module.exports
   =================================================================== */
const PlanerPrint = (() => {
  const MS_TAG = 86400000;

  /* Datumsrechnung strikt in UTC — lokale Zeitzonen kippen an der
     Sommerzeit-Umstellung um einen Tag. */
  function d(iso) { return new Date(iso + 'T00:00:00Z'); }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDe(iso) {
    if (!iso) return '';
    const [y, m, day] = String(iso).slice(0, 10).split('-');
    return `${day}.${m}.${y}`;
  }

  function tageZwischen(vonISO, bisISO) {
    const n = Math.round((d(bisISO) - d(vonISO)) / MS_TAG) + 1;
    return n > 0 ? n : 0;
  }

  /* ISO-Kalenderwoche (Do-Regel), gleiche Logik wie DateUtil.getKW —
     hier UTC-basiert und ohne Abhaengigkeit auf api.js. */
  function kwOf(date) {
    const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const jahresStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - jahresStart) / MS_TAG) + 1) / 7);
  }

  const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  /* Spaltenraster: <=3 Monate -> Kalenderwochen, <=18 -> Monate, sonst
     Quartale. Automatisch, damit der Dialog keinen Zoom-Regler braucht.
     leftPct/widthPct sind Prozent des Gesamtzeitraums — die Balken nutzen
     dieselbe Skala, dadurch passt der Tabellenkopf ohne Pixelrechnung. */
  function buildRaster(vonISO, bisISO) {
    const tage = tageZwischen(vonISO, bisISO);
    if (!tage) return { einheit: 'monat', tage: 0, spalten: [] };

    const start = d(vonISO), ende = d(bisISO);
    const monate = (ende.getUTCFullYear() - start.getUTCFullYear()) * 12
                 + (ende.getUTCMonth() - start.getUTCMonth()) + 1;
    const einheit = monate <= 3 ? 'woche' : (monate <= 18 ? 'monat' : 'quartal');

    // Grenzen der Spalten sammeln (jeweils Beginn der Einheit, auf den
    // Zeitraum geklemmt), dann in Prozent umrechnen.
    const grenzen = [];
    let cur;
    if (einheit === 'woche') {
      cur = new Date(start);
      cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() || 7) - 1));   // Montag
    } else if (einheit === 'monat') {
      cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    } else {
      cur = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
    }
    while (cur <= ende) {
      grenzen.push(new Date(cur));
      if (einheit === 'woche') cur.setUTCDate(cur.getUTCDate() + 7);
      else cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + (einheit === 'monat' ? 1 : 3), 1));
    }

    const spalten = grenzen.map((g, i) => {
      const von = g < start ? start : g;
      const naechste = grenzen[i + 1];
      const bis = new Date((naechste && naechste <= ende ? naechste : new Date(ende.getTime() + MS_TAG)).getTime() - MS_TAG);
      const offset = Math.round((von - start) / MS_TAG);
      const laenge = Math.round((bis - von) / MS_TAG) + 1;
      const jj = String(g.getUTCFullYear()).slice(2);
      const label = einheit === 'woche' ? `KW ${kwOf(g)}`
        : einheit === 'monat' ? `${MONATE[g.getUTCMonth()]} ${jj}`
        : `Q${Math.floor(g.getUTCMonth() / 3) + 1} ${jj}`;
      return { label, leftPct: offset / tage * 100, widthPct: laenge / tage * 100 };
    });

    return { einheit, tage, spalten };
  }

  /* Station auf den Druckzeitraum abbilden. Randstationen werden GEZEIGT und
     am Blattrand abgeschnitten (cutLeft/cutRight -> Marker im HTML); das
     angezeigte Datum bleibt trotzdem das echte, ungekuerzte. Leeres Bis =
     offen und laeuft bis zum Zeitraumende. */
  function barGeom(station, range) {
    const OFFEN = '9999-12-31';
    const sVon = String(station.von).slice(0, 10);
    const sBis = station.bis ? String(station.bis).slice(0, 10) : OFFEN;
    if (sBis < range.von || sVon > range.bis) return null;

    const start = sVon < range.von ? range.von : sVon;
    const ende  = sBis > range.bis ? range.bis : sBis;
    const tage  = tageZwischen(range.von, range.bis);
    const offset = tageZwischen(range.von, start) - 1;
    const laenge = tageZwischen(start, ende);

    return {
      leftPct: offset / tage * 100,
      widthPct: laenge / tage * 100,
      cutLeft: sVon < range.von,
      cutRight: sBis > range.bis,
      open: !station.bis,
    };
  }

  const api = { esc, fmtDe, tageZwischen, buildRaster, barGeom };
  if (typeof window !== 'undefined') window.PlanerPrint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
