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

  /* Kurzform mit zweistelligem Jahr — nur fuer die schmalste Balkenstufe,
     wo das volle Datum nicht mehr passt. Bleibt ein echtes Datum, kein
     aus der Geometrie zurueckgerechneter Wert. */
  function fmtDeKurz(iso) {
    if (!iso) return '';
    const [y, m, day] = String(iso).slice(0, 10).split('-');
    return `${day}.${m}.${String(y).slice(2)}`;
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

  /* ── Balkenlabel: Textbreite schaetzen und Inhalt staffeln ──────────────
     Warum geschaetzt statt gemessen: die Builder laufen in Node (Tests) und
     bauen einen HTML-String, es gibt zu diesem Zeitpunkt kein Layout, an dem
     man messen koennte. Die Tabelle unten ist deshalb KEINE Schaetzung nach
     Gefuehl, sondern im Druckfenster (Edge) gemessen: je Zeichen 100x
     wiederholt in 9px 'Segoe UI', Breite/100, dann auf 1/20 px AUFGERUNDET.
     Aufrunden ist Absicht — die Schaetzung darf nie kleiner ausfallen als die
     echte Breite, sonst laeuft ein Label doch ueber den Balken hinaus. */
  const ZEICHEN_PX_9 = (() => {
    const t = {};
    const setze = (zeichen, px) => { for (const c of zeichen) t[c] = px; };
    setze('0123456789', 4.90);
    setze('.', 2.00); setze(',', 2.00); setze(':', 2.00);
    setze(' ', 2.50); setze('–', 4.50); setze('-', 3.60);
    setze('‹', 2.85); setze('›', 2.85); setze('/', 3.55); setze('&', 7.25);
    setze('(', 2.75); setze(')', 2.75);
    setze('I', 2.40); setze('J', 2.90); setze('L', 4.25); setze('F', 4.40);
    setze('E', 4.60); setze('S', 4.80); setze('T', 4.90); setze('Y', 5.00);
    setze('Z', 5.15); setze('P', 5.05); setze('B', 5.20); setze('K', 5.25);
    setze('C', 5.35); setze('X', 5.35); setze('R', 5.40); setze('V', 5.60);
    setze('AÄ', 5.85); setze('GUÜ', 6.20); setze('D', 6.35); setze('H', 6.40);
    setze('N', 6.75); setze('OÖQ', 6.80); setze('M', 8.10); setze('W', 8.45);
    setze('ijl', 2.20); setze('t', 3.05); setze('f', 2.85); setze('r', 3.15);
    setze('s', 3.85); setze('z', 4.10); setze('x', 4.15); setze('c', 4.20);
    setze('v', 4.35); setze('y', 4.40); setze('k', 4.50); setze('aä', 4.60);
    setze('e', 4.75); setze('ß', 4.90); setze('hnuü', 5.10); setze('bdgopqö', 5.30);
    setze('w', 6.55); setze('m', 7.80);
    return t;
  })();
  // Unbekannte Zeichen (z.B. Emoji, kyrillisch) bewusst grosszuegig: breiter
  // als jedes gemessene Zeichen, damit die Stufe im Zweifel schmaler ausfaellt.
  const ZEICHEN_PX_FALLBACK = 8.50;

  function textBreitePx(s) {
    let b = 0;
    for (const c of String(s ?? '')) b += ZEICHEN_PX_9[c] ?? ZEICHEN_PX_FALLBACK;
    return b;
  }

  /* Breite der Balkenzelle auf dem Papier: A4 Querformat (297mm) minus 2x12mm
     Rand = 273mm; bei 96dpi 273/25.4*96 = 1031.8px. Davon traegt die
     Namensspalte NAME_PCT (22%), der Rest ist die Balkenzelle:
     1031.8 * 0.78 = 804.8px. Bewusst leicht darunter angesetzt (Zellrand,
     Rundung des Browsers), damit die Schaetzung nicht zu grosszuegig wird.
     Im Druckfenster nachgemessen: 802.7px. */
  const TRACK_PX = 800;
  // .pp-bar__lbl{padding:0 5px} — das Padding steht dem Text nicht zur Verfuegung.
  const LBL_PADDING_PX = 10;

  /* Balkeninhalt nach verfuegbarer Breite staffeln:
       1. Abteilung + Von–Bis   2. nur Von–Bis   3. nur Startdatum (kurz)
       4. nur die ‹/›-Randmarker            5. leer
     Das Datum hat Vorrang vor dem Abteilungsnamen: die Abteilung ist ueber
     Balkenfarbe und Legende bestimmbar, das Datum steht sonst nirgends auf dem
     Blatt (title-Attribute drucken nicht). Abgeschnitten wird NIE — ein leerer
     Balken ist ehrlicher als ein Wortfragment ("Ei" liest sich wie ein
     Abteilungsname, nicht wie eine Kuerzung).
     Das Datum ist in jeder Stufe das echte aus station.von/station.bis, nie
     aus der Geometrie zurueckgerechnet. Rueckgabe ist ROHTEXT — der Aufrufer
     muss esc() anwenden. */
  function barLabel(station, geom, trackPx) {
    const innen = geom.widthPct / 100 * (trackPx || TRACK_PX) - LBL_PADDING_PX;
    const pre  = geom.cutLeft  ? '‹ ' : '';
    const post = geom.cutRight ? ' ›' : '';
    const ab = String(station.abteilung ?? '').trim();
    const spanne = `${fmtDe(station.von)}–${station.bis ? fmtDe(station.bis) : 'offen'}`;
    const stufen = [ab ? `${ab} ${spanne}` : spanne, spanne, fmtDeKurz(station.von)];
    for (const txt of stufen) {
      const s = pre + txt + post;
      if (textBreitePx(s) <= innen) return s;
    }
    // Nur noch die Randmarker (ohne Abstandszeichen), sonst gar nichts.
    const nurMarker = (geom.cutLeft ? '‹' : '') + (geom.cutRight ? '›' : '');
    return textBreitePx(nurMarker) <= innen ? nurMarker : '';
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
    /* background hier als BASIS, nicht nur als Deko: ein fehlender oder
       unbrauchbarer Farbwert erzeugt inline eine ungueltige Deklaration
       (background:) — die verwirft der CSS-Parser, und dann traegt diese Regel.
       Ohne sie waere der Balken vollstaendig transparent und die Station auf
       dem Papier unsichtbar. Dunkel genug fuer den weissen Balkentext. */
    .pp-bar{position:absolute;top:2px;height:16px;border-radius:3px;color:#fff;font-size:9px;
      line-height:16px;padding:0;overflow:hidden;white-space:nowrap;background:#37474F;
      print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-bar__lbl{padding:0 5px;white-space:nowrap}
    .pp-bar--cut-l{border-top-left-radius:0;border-bottom-left-radius:0}
    .pp-bar--cut-r{border-top-right-radius:0;border-bottom-right-radius:0}
    .pp-none{color:#aaa;font-style:italic;font-size:9px}
    .pp-legend{margin-top:12px;font-size:9px;color:#555;display:flex;flex-wrap:wrap;gap:10px}
    /* Gleiche Basisfarbe wie .pp-bar — ein unbrauchbarer Farbwert darf auch in
       der Legende kein unsichtbares Kaestchen ergeben. */
    .pp-legend span.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;
      background:#37474F;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-sec{margin:0 0 18px;break-inside:avoid;page-break-inside:avoid}
    .pp-sec h2{font-size:13px;margin:0 0 2px}
    /* Gruppen-Trennzeile der Tafel (wie am Bildschirm). break-after:avoid
       verhindert, dass eine Gruppenueberschrift allein am Seitenende steht. */
    .pp-grp th{background:#f2f2f2;color:#444;font-size:9px;text-transform:uppercase;
      letter-spacing:.04em;border-bottom:1px solid #bbb;padding:4px 7px;
      break-after:avoid;page-break-after:avoid;
      print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-grp{break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}
    .pp-grp__n{font-weight:400;color:#888;text-transform:none;letter-spacing:0}
  `;

  /* sel.titelZusatz (optional) = Personenname beim Panel-Druck. Steht in der
     Ueberschrift UND im Fenster-/Dokumenttitel, damit der Panel-Druck wie
     vorher "Durchlauf <Name>" heisst und nicht mehrere gleichnamige
     Druckfenster ununterscheidbar werden. */
  function kopfHtml(sel) {
    const n = personenListe(sel).length;
    const zusatz = String(sel.titelZusatz ?? '').trim();
    return `<h1>Abteilungsdurchlauf${zusatz ? ` – ${esc(zusatz)}` : ''}</h1>
      <p class="sub">${fmtDe(sel.von)} – ${fmtDe(sel.bis)} · ${n} ${n === 1 ? 'Person' : 'Personen'} · Stand ${fmtDe(sel.stand)}</p>`;
  }

  function dokTitel(sel) {
    const zusatz = String(sel.titelZusatz ?? '').trim();
    return zusatz ? `Durchlauf ${zusatz}` : 'Abteilungsdurchlauf';
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

  /* Der Hinweis auf dem Blatt muss den TATSAECHLICHEN Grund nennen. Vorher
     stand dort immer "(Ende vor Beginn)" — bei einem leeren Von/Bis-Feld ist
     das schlicht falsch und schickt den Nutzer auf die falsche Fehlersuche. */
  function zeitraumGrund(sel) {
    const von = sel.von, bis = sel.bis;
    if (!von && !bis) return 'Zeitraum fehlt (Von und Bis sind leer)';
    if (!von) return 'Zeitraum unvollständig (Von fehlt)';
    if (!bis) return 'Zeitraum unvollständig (Bis fehlt)';
    if (String(von) > String(bis)) return 'Zeitraum ungültig (Ende vor Beginn)';
    return 'Zeitraum ungültig (Datum nicht lesbar)';
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
      const body = kopfHtml(sel)
        + `<div class="pp-none">${esc(zeitraumGrund(sel))} — keine Tafel darstellbar</div>`;
      return dokument(dokTitel(sel), PRINT_CSS, body, 'size:A4 landscape;margin:12mm');
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

    const personZeile = (p) => {
      const balken = (p.stationen || []).map(s => {
        const g = barGeom(s, range);
        if (!g) return '';
        const cls = 'pp-bar'
          + (g.cutLeft ? ' pp-bar--cut-l' : '')
          + (g.cutRight ? ' pp-bar--cut-r' : '');
        const bisTxt = s.bis ? fmtDe(s.bis) : 'offen';
        // Balkeninhalt gestaffelt (barLabel): Datum vor Abteilungsname, nie
        // abgeschnitten. Der title bleibt mit dem vollen Datum daran — er
        // druckt nicht, hilft aber in der Bildschirmansicht des Druckfensters.
        // background wird nur gesetzt, wenn ueberhaupt ein Wert da ist; sonst
        // traegt die Basisfarbe aus .pp-bar (siehe PRINT_CSS).
        const farbe = String(s.farbe ?? '').trim();
        const lbl = barLabel(s, g);
        // Padding liegt am inneren Label, nicht am Balken: mit
        // box-sizing:border-box würde Padding am Balken selbst eine
        // Mindestbreite erzwingen, die kurze Stationen (1-2 Tage) zu breit
        // zeichnet — das Papier zeigte dann einen laengeren Zeitraum als
        // tatsaechlich vorhanden.
        return `<div class="${cls}" style="left:${g.leftPct.toFixed(4)}%;width:${g.widthPct.toFixed(4)}%`
          + `${farbe ? `;background:${esc(farbe)}` : ''}"`
          + ` title="${esc(s.abteilung || '')} (${fmtDe(s.von)} – ${bisTxt})">`
          // Leeres Label: den <span> gar nicht bauen. Sein padding (0 5px)
          // waere sonst 10px Inhaltsbreite in einem 2px schmalen Balken —
          // messbarer Ueberlauf, obwohl gar kein Text da ist.
          + `${lbl ? `<span class="pp-bar__lbl">${esc(lbl)}</span>` : ''}</div>`;
      }).join('');

      const leer = balken ? '' : `<div class="pp-none">keine Zuweisung im Zeitraum</div>`;
      return `<tr>
        <td><div class="pp-nm">${esc(p.name)}</div><div class="pp-br">${esc(p.beruf || '')}</div></td>
        <td class="pp-track" colspan="${raster.spalten.length}">${linien}${balken}${leer}</td>
      </tr>`;
    };

    /* Gruppen-Trennzeilen wie am Bildschirm ("Ohne Zuordnung / Zugewiesen /
       DH-Studenten"), mit Anzahl. Ohne sie laeuft das Alphabet auf dem Blatt
       mehrfach von vorn los und die Sortierung sieht falsch aus.
       Reihenfolge: die des Aufrufers. gruppierteAzubis() in
       abteilungs-planer.js liefert die Gruppen bereits in GROUP_ORDER und
       flatMap haengt sie in dieser Ordnung aneinander — hier wird deshalb
       NICHT sortiert, nur nach erstem Auftreten gebuendelt (Map bewahrt die
       Einfuegereihenfolge). Personen ohne gruppe-Feld (z.B. Panel-Druck)
       laufen ohne Trennzeile durch.
       Die Trennzeile ist eine eigene <tr> mit einer colspan-Zelle: sie fasst
       die colgroup-Breiten nicht an, die Balkengeometrie bleibt unberuehrt. */
    const gruppen = new Map();
    personen.forEach(p => {
      const g = String(p.gruppe ?? '').trim();
      if (!gruppen.has(g)) gruppen.set(g, []);
      gruppen.get(g).push(p);
    });
    const spaltenGesamt = raster.spalten.length + 1;
    const zeilen = [...gruppen].map(([g, ps]) =>
      (g ? `<tr class="pp-grp"><th colspan="${spaltenGesamt}" scope="rowgroup">`
           + `${esc(g)} <span class="pp-grp__n">(${ps.length})</span></th></tr>` : '')
      + ps.map(personZeile).join('')
    ).join('');

    // Legende nur mit den Abteilungen, die tatsaechlich aufs Papier kommen.
    const gedruckt = new Map();
    personen.forEach(p => (p.stationen || []).forEach(s => {
      if (barGeom(s, range) && !gedruckt.has(s.abteilung)) gedruckt.set(s.abteilung, s.farbe);
    }));
    const legende = `<div class="pp-legend">`
      + [...gedruckt].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'de'))
          .map(([ab, farbe]) => {
            const f = String(farbe ?? '').trim();
            return `<b><span class="sw"${f ? ` style="background:${esc(f)}"` : ''}></span>${esc(ab)}</b>`;
          }).join('')
      + `</div>`;

    const body = kopfHtml(sel)
      + `<table>${cols}${kopf}<tbody>${zeilen}</tbody></table>${legende}`;
    return dokument(dokTitel(sel), PRINT_CSS, body, 'size:A4 landscape;margin:12mm');
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
      const body = kopfHtml(sel)
        + `<div class="pp-none">${esc(zeitraumGrund(sel))} — keine Tabelle darstellbar</div>`;
      return dokument(dokTitel(sel), PRINT_CSS, body, 'size:A4 portrait;margin:16mm');
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

    return dokument(dokTitel(sel), PRINT_CSS,
      kopfHtml(sel) + abschnitte, 'size:A4 portrait;margin:16mm');
  }

  /* Eigenes Fenster statt @media print: das Druckdokument bringt sein CSS
     selbst mit und ist damit immun gegen Theme-, Sidebar- und
     Responsive-Regeln der SPA. Rueckgabe false = Popup blockiert. */
  function openPrintWindow(html) {
    const w = window.open('', '_blank', 'width=1000,height=760');
    if (!w) return false;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
    return true;
  }

  /* Dialog-Zustand auf MODULEBENE, nicht in der open()-Closure.
     Grund: die Handler unten werden nur EINMAL gebunden (das Markup bleibt im
     DOM). Lebte der Zustand in der Closure von open(), wuerden sie beim
     zweiten Oeffnen weiter das ctx des ERSTEN Aufrufs sehen — nach einem
     Filterwechsel wuerde also die alte Personenliste gedruckt. */
  let S = null;   // { ctx, gewaehlt:Set, mode, suche }

  const byId = id => document.getElementById(id);

  /* Korrektur ggue. der Erstfassung: ein leeres <input type="date"> liefert
     '' — bei von==='' ist "von && bis" falsy, die urspruengliche Pruefung
     "von && bis && von > bis" haette den Drucken-Button also faelschlich
     AKTIV gelassen. Genau dieser Weg (leeres Von/Bis) erzeugte in Task 5
     colspan="0" und left:NaN% im Builder — ein Blatt, das etwas behauptet,
     was nicht da ist. zeitraumUngueltig() im Builder faengt das inzwischen
     ab, aber die UI soll den Nutzer erst gar nicht so weit laufen lassen.
     Deshalb hier: leeres Von, leeres Bis, beide leer und Bis-vor-Von je
     einzeln erkennen und mit passendem Grund anzeigen. */
  function dlgPruefen() {
    const von = byId('ppVon').value, bis = byId('ppBis').value;
    const gruende = [];
    if (!von && !bis) gruende.push('Bitte „Von" und „Bis" angeben.');
    else if (!von) gruende.push('Bitte „Von" angeben.');
    else if (!bis) gruende.push('Bitte „Bis" angeben.');
    else if (von > bis) gruende.push('„Bis" liegt vor „Von".');
    // Der Drucken-Button war auch bei 0 gewaehlten Personen grau, der Hinweis
    // nannte aber nur Datumsgruende — ein Abteilungsfilter ohne Personen
    // sperrte den Button also ohne jede Begruendung.
    if (S.gewaehlt.size === 0) {
      gruende.push(S.ctx.personen.length
        ? 'Bitte mindestens eine Person wählen.'
        : 'Keine Person im aktuellen Filter — Filter in der Toolbar lockern.');
    }
    const text = gruende.join(' ');
    byId('ppErr').textContent = text;
    byId('ppErr').hidden = !text;
    byId('ppGo').disabled = !!text;
  }

  function dlgZeichnen() {
    const listEl = byId('ppList'), countEl = byId('ppCount');
    const sichtbar = S.ctx.personen.filter(p => !S.suche
      || `${p.name} ${p.beruf || ''}`.toLowerCase().includes(S.suche));
    listEl.innerHTML = sichtbar.map(p => `
      <label class="pp-dlg__item">
        <input type="checkbox" data-id="${esc(p.id)}" ${S.gewaehlt.has(p.id) ? 'checked' : ''}>
        <b>${esc(p.name)}</b><span>${esc(p.beruf || '')}</span>
      </label>`).join('')
      // Leertext nach Ursache trennen: "Keine Treffer." behauptet eine Suche,
      // die es ohne Sucheingabe gar nicht gab.
      || `<div class="pp-dlg__item">${S.suche ? 'Keine Treffer.' : 'Keine Personen vorhanden.'}</div>`;
    listEl.querySelectorAll('input[data-id]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) S.gewaehlt.add(cb.dataset.id); else S.gewaehlt.delete(cb.dataset.id);
      countEl.textContent = `(${S.gewaehlt.size} von ${S.ctx.personen.length})`;
      dlgPruefen();
    }));
    countEl.textContent = `(${S.gewaehlt.size} von ${S.ctx.personen.length})`;
    dlgPruefen();
  }

  function dlgBind() {
    const modal = byId('ptPrintModal');
    if (modal.dataset.ppBound) return;
    modal.dataset.ppBound = '1';

    byId('ppMode').addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]'); if (!b) return;
      S.mode = b.dataset.mode;
      byId('ppMode').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
    });
    byId('ppSearch').addEventListener('input', e => { S.suche = e.target.value.toLowerCase(); dlgZeichnen(); });
    byId('ppAll').addEventListener('click', () => { S.ctx.personen.forEach(p => S.gewaehlt.add(p.id)); dlgZeichnen(); });
    byId('ppNone').addEventListener('click', () => { S.gewaehlt.clear(); dlgZeichnen(); });
    byId('ppVon').addEventListener('change', dlgPruefen);
    byId('ppBis').addEventListener('change', dlgPruefen);

    byId('ppPresets').addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]'); if (!b) return;
      const ctx = S.ctx;
      const aktive = ctx.personen.filter(p => S.gewaehlt.has(p.id));
      if (b.dataset.preset === 'aj') { byId('ppVon').value = ctx.von; byId('ppBis').value = ctx.bis; }
      else if (b.dataset.preset === 'heute') {
        byId('ppVon').value = ctx.stand;
        byId('ppBis').value = maxEnde(aktive) || ctx.bis;
      } else {
        // Ganze Ausbildung: Min/Max ueber die gewaehlten Personen. Fehlen die
        // Profildaten, bleibt das aktuelle Ausbildungsjahr stehen.
        byId('ppVon').value = minBeginn(aktive) || ctx.von;
        byId('ppBis').value = maxEnde(aktive) || ctx.bis;
      }
      dlgPruefen();
    });

    byId('ppGo').addEventListener('click', () => {
      const sel = {
        von: byId('ppVon').value, bis: byId('ppBis').value, stand: S.ctx.stand,
        personen: S.ctx.personen.filter(p => S.gewaehlt.has(p.id)),
      };
      const html = S.mode === 'tafel' ? renderTafelHtml(sel) : renderTabelleHtml(sel);
      if (!openPrintWindow(html)) {
        if (typeof Toast !== 'undefined') Toast.error('Popup blockiert', 'Bitte Pop-ups für diese Seite erlauben.');
        return;
      }
      Modal.close('ptPrintModal');
    });
  }

  function open(ctx) {
    S = { ctx, gewaehlt: new Set(ctx.personen.map(p => p.id)), mode: 'tafel', suche: '' };
    byId('ppVon').value = ctx.von;
    byId('ppBis').value = ctx.bis;
    byId('ppSearch').value = '';
    byId('ppPresets').querySelector('[data-preset="aj"]').textContent = ctx.ajLabel;
    // Darstellung bei jedem Oeffnen auf Tafel zuruecksetzen (passt zu S.mode).
    byId('ppMode').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x.dataset.mode === 'tafel'));
    dlgBind();
    dlgZeichnen();
    Modal.init();
    Modal.open('ptPrintModal');
  }

  function minBeginn(ps) {
    const v = ps.map(p => p.ausbildungsBeginn).filter(Boolean).sort();
    return v[0] || null;
  }
  function maxEnde(ps) {
    const v = ps.map(p => p.ausbildungsEnde).filter(Boolean).sort();
    return v[v.length - 1] || null;
  }

  const api = { esc, fmtDe, fmtDeKurz, tageZwischen, buildRaster, barGeom, textBreitePx, barLabel,
    TRACK_PX, zeitraumGrund, PRINT_CSS, renderTafelHtml, renderTabelleHtml, openPrintWindow, open };
  if (typeof window !== 'undefined') window.PlanerPrint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
