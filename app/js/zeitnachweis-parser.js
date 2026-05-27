/* ===================================================================
   ZEITNACHWEIS-PARSER.JS
   Reine Parsing-Logik für den SAP-ESS-Zeitnachweis (PDF → Tagesdaten).
   Bewusst ohne DOM- und ohne pdf.js-Abhängigkeit, damit die Logik
   isoliert (auch in Node) testbar bleibt. Die PDF-Textextraktion
   passiert separat in zeitnachweis-upload.js und liefert hier nur den
   fertigen, zeilenweise zusammengesetzten Text.
   =================================================================== */
(function (global) {
  'use strict';

  // Deutsche Monatsnamen → Monatszahl (für "Monat: Mai - 2026").
  const MONATE = {
    'januar': 1, 'februar': 2, 'märz': 3, 'maerz': 3, 'april': 4, 'mai': 5,
    'juni': 6, 'juli': 7, 'august': 8, 'september': 9, 'oktober': 10,
    'november': 11, 'dezember': 12,
  };

  // Abwesenheits-Erkennung über Stichwörter im Tageslabel.
  const URLAUB_RE = /urlaub/i;
  const KRANK_RE  = /krank|arbeitsunf/i;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function ddmmyyyyToISO(s) {
    const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  // "6,27" → 6.27 (ein evtl. nachgestelltes Minus der +/--Spalte ist
  // hier nie Teil des Ist-Werts, da wir immer den ersten Wert nehmen).
  function parseDecimal(s) {
    return parseFloat(String(s).replace(',', '.'));
  }

  // Tageslabel für die Vorschau lesbar machen: Zeiten, Dezimalwerte und
  // TAZP-Codes (z.B. "V70C") entfernen, aufeinanderfolgende Doppelungen
  // ("Stempelzeit Stempelzeit …") zusammenfassen.
  function cleanLabel(text) {
    const stripped = text
      .replace(/\b\d{1,2}:\d{2}\b/g, '')   // Uhrzeiten
      .replace(/\d+,\d{2}-?/g, '')          // Dezimalwerte inkl. +/--Minus
      .replace(/\b[A-Z]\d{2}[A-Z]?\b/g, '') // TAZP-Codes
      .replace(/\s+/g, ' ')
      .trim();
    return stripped
      .split(' ')
      .filter((w, i, a) => w && w !== a[i - 1])
      .join(' ');
  }

  /**
   * Parst den Text eines Zeitnachweis-PDFs.
   * @param {string} text  Zeilenweise zusammengesetzter PDF-Text.
   * @returns {{zeitraum, stichtag, monat, tage, warnungen}}
   *   tage: [{ datum, wochentag, anwesenheit, ort, stunden, quelle, eindeutig }]
   */
  function parse(text) {
    const result = {
      zeitraum: null,
      stichtag: null,
      monat: null,
      tage: [],
      warnungen: [],
    };

    const lines = String(text || '')
      .split(/\r?\n/)
      .map(l => l.replace(/\s+/g, ' ').trim());
    const full = lines.join('\n');

    // ── Kopfdaten ──
    const zr = full.match(/vom\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(\d{2}\.\d{2}\.\d{4})/i);
    if (zr) result.zeitraum = { von: ddmmyyyyToISO(zr[1]), bis: ddmmyyyyToISO(zr[2]) };

    const st = full.match(/einschlie[ßs]lich\s+dem\s+(\d{2}\.\d{2}\.\d{4})/i);
    if (st) result.stichtag = ddmmyyyyToISO(st[1]);

    const mo = full.match(/Monat:\s*([A-Za-zäöüÄÖÜ]+)\s*-\s*(\d{4})/i);
    if (mo && MONATE[mo[1].toLowerCase()]) {
      result.monat = { monat: MONATE[mo[1].toLowerCase()], jahr: parseInt(mo[2], 10) };
    } else if (result.zeitraum && result.zeitraum.von) {
      const [y, m] = result.zeitraum.von.split('-');
      result.monat = { monat: parseInt(m, 10), jahr: parseInt(y, 10) };
    }

    // ── Tagesbereich abgrenzen ──
    const start = lines.findIndex(l => /Einzelergebnisse pro Tag/i.test(l));
    if (start === -1) {
      result.warnungen.push('Kein gültiger Zeitnachweis erkannt (Abschnitt "Einzelergebnisse pro Tag" fehlt).');
      return result;
    }
    let end = lines.findIndex(l => /Monats[üu]bersicht/i.test(l));
    if (end === -1 || end < start) end = lines.length;

    // ── Tagesblöcke sammeln (Folgezeilen ohne Tagesnummer gehören zum Tag) ──
    const dayLineRe = /^(\d{2})\s+(MO|DI|MI|DO|FR|SA|SO)\b(.*)$/i;
    const bloecke = [];
    let current = null;
    for (let i = start + 1; i < end; i++) {
      const line = lines[i];
      if (!line) continue;
      if (/^Wochensumme/i.test(line)) continue; // Wochensummen ignorieren
      if (/^Tag\b/i.test(line)) continue;        // Tabellenkopf
      const dm = line.match(dayLineRe);
      if (dm) {
        current = { tag: parseInt(dm[1], 10), wochentag: dm[2].toUpperCase(), text: (dm[3] || '').trim() };
        bloecke.push(current);
      } else if (current) {
        current.text += ' ' + line;
      }
    }

    if (!result.monat) {
      result.warnungen.push('Monat/Jahr konnte nicht ermittelt werden – Datumszuordnung nicht möglich.');
    }

    for (const b of bloecke) {
      result.tage.push(classifyDay(b, result.monat, result.warnungen));
    }
    return result;
  }

  function classifyDay(block, monat, warnungen) {
    const text = block.text || '';
    const istWochenende = block.wochentag === 'SA' || block.wochentag === 'SO';
    const datum = monat ? `${monat.jahr}-${pad2(monat.monat)}-${pad2(block.tag)}` : null;

    const decimals = (text.match(/\d+,\d{2}/g) || []).map(parseDecimal);
    const istWert = decimals.length ? decimals[0] : 0;
    const hatStempel     = /Stempelzeit/i.test(text);
    const hatSchule      = /Berufsschule/i.test(text);
    const hatDienstreise = /Dienstreise/i.test(text);
    const hatUrlaub      = URLAUB_RE.test(text);
    const hatKrank       = KRANK_RE.test(text);

    const tag = {
      datum,
      tagNr: block.tag,
      wochentag: block.wochentag,
      anwesenheit: '',
      ort: '',
      stunden: 0,
      quelle: cleanLabel(text),
      eindeutig: true,
    };

    if (hatStempel && hatSchule) {
      tag.anwesenheit = 'anwesend'; tag.ort = 'Betrieb/Schule'; tag.stunden = istWert;
    } else if (hatStempel) {
      tag.anwesenheit = 'anwesend'; tag.ort = 'Betrieb'; tag.stunden = istWert;
    } else if (hatSchule) {
      tag.anwesenheit = 'anwesend'; tag.ort = 'Schule'; tag.stunden = istWert;
    } else if (hatDienstreise) {
      tag.anwesenheit = 'anwesend'; tag.ort = 'Dienstreise'; tag.stunden = istWert;
    } else if (hatUrlaub) {
      tag.anwesenheit = 'Urlaub';
    } else if (hatKrank) {
      tag.anwesenheit = 'krank';
    } else if (istWochenende) {
      // Wochenende (auch ein evtl. Feiertag am Wochenende bleibt "Wochenende",
      // da ohnehin nicht gearbeitet wird).
      tag.anwesenheit = 'Wochenende';
    } else if (istWert > 0) {
      // Werktag mit Soll/Ist, aber ohne Stempelung/Schule/Abwesenheit →
      // Feiertags-Heuristik (z.B. Maifeiertg, Himmelfhrt, Karfreitag …).
      tag.anwesenheit = 'Feiertag';
    } else {
      tag.eindeutig = false;
      if (warnungen) {
        warnungen.push(`Tag ${pad2(block.tag)} (${block.wochentag}) nicht eindeutig erkannt${tag.quelle ? `: „${tag.quelle}"` : ''}.`);
      }
    }
    return tag;
  }

  const api = { parse, _cleanLabel: cleanLabel, _ddmmyyyyToISO: ddmmyyyyToISO };
  global.ZeitnachweisParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
