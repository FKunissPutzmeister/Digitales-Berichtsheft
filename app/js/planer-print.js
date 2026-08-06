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

  /* Gemeinsames Stylesheet aller Druckdokumente. Bewusst eigenstaendig und
     ohne CSS-Variablen der App — das Druckfenster laedt kein App-CSS. */
  const PRINT_CSS = `
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;margin:0;padding:0}
    h1{font-size:17px;margin:0 0 3px}
    .sub{color:#666;margin:0 0 14px;font-size:11px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}
    th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #ddd;vertical-align:middle}
    th{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#888;border-bottom:1px solid #bbb}
    th+th,td+td{border-left:1px solid #eee}
    .pp-nm{font-weight:700}
    .pp-br{color:#888;font-size:9px}
    .pp-track{position:relative;height:20px;padding:0}
    .pp-bar{position:absolute;top:2px;height:16px;border-radius:3px;color:#fff;font-size:9px;
      line-height:16px;padding:0;overflow:hidden;white-space:nowrap;
      print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-bar__lbl{padding:0 5px;white-space:nowrap}
    .pp-bar--cut-l{border-top-left-radius:0;border-bottom-left-radius:0}
    .pp-bar--cut-r{border-top-right-radius:0;border-bottom-right-radius:0}
    .pp-none{color:#aaa;font-style:italic;font-size:9px}
    .pp-legend{margin-top:12px;font-size:9px;color:#555;display:flex;flex-wrap:wrap;gap:10px}
    .pp-legend span.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;
      print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-sec{margin:0 0 18px;break-inside:avoid;page-break-inside:avoid}
    .pp-sec h2{font-size:13px;margin:0 0 2px}
  `;

  function kopfHtml(sel, titelZusatz) {
    // Defensiv: sel.personen darf fehlen (z.B. degenerierter Aufruf) —
    // dann zaehlt der Kopf 0 Personen statt abzustuerzen.
    const n = (sel.personen || []).length;
    return `<h1>Abteilungsdurchlauf${titelZusatz ? ` – ${esc(titelZusatz)}` : ''}</h1>
      <p class="sub">${fmtDe(sel.von)} – ${fmtDe(sel.bis)} · ${n} ${n === 1 ? 'Person' : 'Personen'} · Stand ${fmtDe(sel.stand)}</p>`;
  }

  function dokument(titel, css, body, seite) {
    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">`
      + `<title>${esc(titel)}</title><style>${css}\n@page{${seite}}</style></head>`
      + `<body>${body}</body></html>`;
  }

  // Defensiv: sel.personen darf fehlen — beide Builder liefern dann ein
  // gueltiges, leeres Dokument statt eines TypeError. Ein fehlendes
  // personen-Array ist trotzdem ein Aufrufer-Fehler, den wir nicht
  // stillschweigend "reparieren" wollen; wir liefern nur ein gueltiges
  // Dokument statt eines Absturzes.
  function personenListe(sel) {
    return sel.personen || [];
  }

  // Beide Druckvarianten muessen fuer denselben sel dasselbe Urteil faellen,
  // ob der Zeitraum degeneriert ist — sonst zeigt die eine Sorte Papier eine
  // Tafel/Tabelle, waehrend die andere einen Hinweis druckt.
  //
  // Bewusst NICHT "sel.von > sel.bis": das ist fuer '' / null / undefined
  // (leeres <input type="date">, Task 6) schlicht false — leere/gleiche
  // Werte sind lexikalisch nicht "groesser" als einander — waehrend
  // buildRaster fuer genau diese Eingaben trotzdem ein leeres Spaltenarray
  // liefert (tageZwischen faengt ungueltige Date-Strings über NaN ab). Ein
  // Stringvergleich prueft nur eine Vorbedingung; das tatsaechliche
  // Rasterergebnis zu pruefen ist die schaerfere, tatsaechlich robustere
  // Bedingung. Nimmt optional einen bereits berechneten Raster entgegen,
  // damit renderTafelHtml buildRaster nicht zweimal aufrufen muss.
  function zeitraumUngueltig(sel, raster) {
    return !(raster || buildRaster(sel.von, sel.bis)).spalten.length;
  }

  /* Tafel = echte <table> mit <thead>: Browser wiederholen einen Tabellenkopf
     auf jeder Folgeseite von selbst, ein nachgebauter Grid-Kopf tut das nicht.
     Die Balken liegen absolut in EINER Zelle, die per colspan genau die
     Rasterspalten ueberdeckt — dadurch stimmt die Ausrichtung ohne
     Pixelrechnung. table-layout:fixed ist dafuer Pflicht. */
  function renderTafelHtml(sel) {
    const range = { von: sel.von, bis: sel.bis };
    const raster = buildRaster(sel.von, sel.bis);

    // Degenerierter Zeitraum: keine Tafel ohne Zeitachse drucken, sondern
    // Kopf + klarer Hinweis. Sonst waere die einzige Alternative
    // colspan="0" (ungueltig, Browser klemmt auf 1) und left/width:NaN% —
    // ein Blatt, das etwas behauptet, was nicht da ist. Raster wird bereits
    // gebraucht (Spalten/Kopf unten) — hier durchgereicht, damit
    // zeitraumUngueltig buildRaster nicht zweimal aufruft.
    if (zeitraumUngueltig(sel, raster)) {
      const body = kopfHtml(sel, '')
        + `<div class="pp-none">Zeitraum ungueltig (Ende vor Beginn) — keine Tafel darstellbar</div>`;
      return dokument('Abteilungsdurchlauf', PRINT_CSS, body, 'size:A4 landscape;margin:12mm');
    }

    const personen = personenListe(sel);

    const NAME_PCT = 22;
    const restPct = 100 - NAME_PCT;

    const cols = `<colgroup><col style="width:${NAME_PCT}%">`
      + raster.spalten.map(c => `<col style="width:${(c.widthPct * restPct / 100).toFixed(4)}%">`).join('')
      + `</colgroup>`;

    const kopf = `<thead><tr><th>Person</th>`
      + raster.spalten.map(c => `<th>${esc(c.label)}</th>`).join('')
      + `</tr></thead>`;

    // Senkrechte Rasterlinien in der Balkenzelle nachziehen (die colspan-Zelle
    // hat keine eigenen Spaltengrenzen mehr). slice(1): die erste Grenze faellt
    // mit dem linken Rand der Zelle zusammen, den bereits die CSS-Regel
    // td+td{border-left} der Namensspalte zeichnet — sonst doppelte Linie.
    const linien = raster.spalten.slice(1)
      .map(c => `<div style="position:absolute;top:0;bottom:0;left:${c.leftPct.toFixed(4)}%;width:1px;background:#eee"></div>`)
      .join('');

    const zeilen = personen.map(p => {
      const balken = (p.stationen || []).map(s => {
        const g = barGeom(s, range);
        if (!g) return '';
        const cls = 'pp-bar'
          + (g.cutLeft ? ' pp-bar--cut-l' : '')
          + (g.cutRight ? ' pp-bar--cut-r' : '');
        const bisTxt = s.bis ? fmtDe(s.bis) : 'offen';
        const marker = (g.cutLeft ? '‹ ' : '') + esc(s.abteilung || '') + (g.cutRight ? ' ›' : '');
        // Padding liegt am inneren Label, nicht am Balken: mit
        // box-sizing:border-box würde Padding am Balken selbst eine
        // Mindestbreite erzwingen, die kurze Stationen (1-2 Tage) zu breit
        // zeichnet — das Papier zeigte dann einen laengeren Zeitraum als
        // tatsaechlich vorhanden.
        return `<div class="${cls}" style="left:${g.leftPct.toFixed(4)}%;width:${g.widthPct.toFixed(4)}%;background:${esc(s.farbe)}"`
          + ` title="${esc(s.abteilung || '')} (${fmtDe(s.von)} – ${bisTxt})"><span class="pp-bar__lbl">${marker}</span></div>`;
      }).join('');

      const leer = balken ? '' : `<div class="pp-none">keine Zuweisung im Zeitraum</div>`;
      return `<tr>
        <td><div class="pp-nm">${esc(p.name)}</div><div class="pp-br">${esc(p.beruf || '')}</div></td>
        <td class="pp-track" colspan="${raster.spalten.length}">${linien}${balken}${leer}</td>
      </tr>`;
    }).join('');

    // Legende nur mit den Abteilungen, die tatsaechlich aufs Papier kommen.
    const gedruckt = new Map();
    personen.forEach(p => (p.stationen || []).forEach(s => {
      if (barGeom(s, range) && !gedruckt.has(s.abteilung)) gedruckt.set(s.abteilung, s.farbe);
    }));
    const legende = `<div class="pp-legend">`
      + [...gedruckt].sort((a, b) => a[0].localeCompare(b[0], 'de'))
          .map(([ab, farbe]) => `<b><span class="sw" style="background:${esc(farbe)}"></span>${esc(ab)}</b>`).join('')
      + `</div>`;

    const body = kopfHtml(sel, '')
      + `<table>${cols}${kopf}<tbody>${zeilen}</tbody></table>${legende}`;
    return dokument('Abteilungsdurchlauf', PRINT_CSS, body, 'size:A4 landscape;margin:12mm');
  }

  /* Tabelle = je Person ein Abschnitt. break-inside:avoid haelt Name und
     Stationen zusammen, damit kein Azubi mitten im Block umbricht.
     Gefiltert wird mit barGeom (gleiche Zeitraumlogik wie die Tafel), das
     angezeigte Datum bleibt das echte. */
  function renderTabelleHtml(sel) {
    const range = { von: sel.von, bis: sel.bis };

    // Degenerierter Zeitraum: gleiche Pruefung wie bei der Tafel
    // (zeitraumUngueltig) — dadurch faellen beide Druckvarianten fuer
    // denselben sel garantiert dasselbe Urteil. Kopf + klarer Hinweis statt
    // eines Blatts, das faelschlich "keine Zuweisung im Zeitraum" fuer alle
    // Personen behaupten wuerde.
    if (zeitraumUngueltig(sel)) {
      const body = kopfHtml(sel, '')
        + `<div class="pp-none">Zeitraum ungueltig (Ende vor Beginn) — keine Tabelle darstellbar</div>`;
      return dokument('Abteilungsdurchlauf', PRINT_CSS, body, 'size:A4 portrait;margin:16mm');
    }

    const personen = personenListe(sel);

    const abschnitte = personen.map(p => {
      const drin = (p.stationen || []).filter(s => barGeom(s, range));
      const zeilen = drin.length
        ? drin.map(s => `<tr>
            <td>${esc(s.abteilung || '–')}</td>
            <td>${fmtDe(s.von)} – ${s.bis ? fmtDe(s.bis) : 'offen'}</td>
            <td>${esc(s.verantw || '–')}</td>
          </tr>`).join('')
        : `<tr><td colspan="3" class="pp-none">keine Zuweisung im Zeitraum</td></tr>`;
      return `<div class="pp-sec">
        <h2>${esc(p.name)}</h2>
        <p class="sub">${esc(p.beruf || '')}${p.gruppe ? ` · ${esc(p.gruppe)}` : ''}</p>
        <table><thead><tr><th>Abteilung</th><th>Zeitraum</th><th>Verantwortlich</th></tr></thead>
        <tbody>${zeilen}</tbody></table>
      </div>`;
    }).join('');

    return dokument('Abteilungsdurchlauf', PRINT_CSS,
      kopfHtml(sel, '') + abschnitte, 'size:A4 portrait;margin:16mm');
  }

  const api = { esc, fmtDe, tageZwischen, buildRaster, barGeom, PRINT_CSS, renderTafelHtml, renderTabelleHtml };
  if (typeof window !== 'undefined') window.PlanerPrint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
