/* ===================================================================
   FAHRTGELD-CORE.JS
   Excel- und PDF-Generierung für die Fahrgelderstattung.
   Portiert aus der eigenständigen better-ess-App (analysis/fahrtgeld.js +
   parser/fahrgeldPdfParser.js) auf die Vanilla-Berichtsheft-Architektur:
     - ExcelJS   → globales window.ExcelJS (vendor/exceljs.min.js)
     - pdf-lib   → globales PDFLib          (vendor/pdf-lib.min.js)
     - date-fns  → kleine native Helfer (unten)
   Das PDF-Feld-Layout (welcher AcroForm-Feldname zu welcher Spalte/Zeile
   gehört) wird per Widget-Position aus der geladenen PDF bestimmt – kein
   pdfjs nötig, pdf-lib liefert die Rechtecke selbst.

   Vorlagen: app/templates/fahrgeld-vorlage.{xlsx,pdf} (Firmenformular F6344-1).
   =================================================================== */
(function (global) {
  'use strict';

  const SHEET_NAME = 'Fahrgelderstattung';
  const HEADER_DATUM_CELL = 'C4';
  const HEADER_NAME_CELL = 'C5';
  const HEADER_PERSNR_CELL = 'F4';
  const HEADER_KST_CELL = 'F5';
  const DATEN_VON_ZEILE = 10;
  const DATEN_BIS_ZEILE = 19;
  const ZEILEN_MERGES = [['A', 'B'], ['C', 'D'], ['E', 'F']];

  /* ── Vorlage verlängern (nur bei Blockunterricht) ────────────────
     Das Papierformular hat 10 Zeilen. Wer einen ganzen Monat Berufsschule
     hat, braucht mehr — dann wächst die Tabelle, statt Tage zu schlucken.
     Bis 10 Tage bleibt die Vorlage unangetastet.

     ExcelJS' duplicateRow() kopiert Stil, Rahmen und Zeilenhöhe und schiebt
     den Fußblock nach unten — die Verbund-Zellen bleiben dabei aber auf
     ihren alten Zeilennummern stehen (gemessen: nach Speichern+Laden waren
     die des Fußblocks ganz verschwunden). Sie werden deshalb unten komplett
     neu gesetzt. */
  function verlaengereExcelTabelle(sheet, extra) {
    sheet.duplicateRow(DATEN_BIS_ZEILE, extra, true);
    const bisZeile = DATEN_BIS_ZEILE + extra;

    // Alle Merges ab der ersten neuen Zeile lösen …
    for (const range of [...(sheet.model.merges || [])]) {
      const zeile = parseInt((range.match(/\d+/) || [0])[0], 10);
      if (zeile > DATEN_BIS_ZEILE) { try { sheet.unMergeCells(range); } catch (e) { /* war nicht verbunden */ } }
    }
    // … und passend zur neuen Geometrie wieder setzen: Datenzeilen, dann die
    // zwei Fußzeilen, dann die über beide laufende Summen-Zelle.
    const merge = (r) => ZEILEN_MERGES.forEach(([a, b]) => {
      try { sheet.mergeCells(`${a}${r}:${b}${r}`); } catch (e) { /* schon verbunden */ }
    });
    for (let r = DATEN_BIS_ZEILE + 1; r <= bisZeile + 2; r++) merge(r);
    try { sheet.mergeCells(`G${bisZeile + 1}:G${bisZeile + 2}`); } catch (e) { /* schon verbunden */ }
    return bisZeile;
  }

  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  /* ── Datums-Helfer (ersetzen date-fns) ───────────────────────── */
  function splitMonatKey(monatKey) {
    const [yyyy, mm] = monatKey.split('-').map(s => parseInt(s, 10));
    return { yyyy, mm };
  }
  /** "April 26" (date-fns 'MMMM yy') */
  function monatLabelKurz(monatKey) {
    const { yyyy, mm } = splitMonatKey(monatKey);
    return `${MONATE[mm - 1]} ${String(yyyy).slice(-2)}`;
  }
  /** "April 2026" (date-fns 'MMMM yyyy') */
  function formatMonatLabel(monatKey) {
    const { yyyy, mm } = splitMonatKey(monatKey);
    return `${MONATE[mm - 1]} ${yyyy}`;
  }
  /** ISO "2026-04-13" → "13.04.2026" */
  function isoZuDeutsch(iso) {
    const [yyyy, mm, dd] = iso.split('-');
    return `${dd}.${mm}.${yyyy}`;
  }
  /** heutiges Datum als "dd.MM.yyyy" */
  function heuteDeutsch() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  /** Filename-Schema: "Fahrgelderstattung <Vorname Nachname> <Monat> <YY>.<ext>". */
  function baueDateiname(name, monatKey, extension) {
    const { yyyy, mm } = splitMonatKey(monatKey);
    const monatsname = MONATE[mm - 1];
    const yy = String(yyyy).slice(-2);
    let formatierterName = (name || 'Azubi').trim();
    const m = /^(.+?),\s*(.+)$/.exec(formatierterName); // "Nachname, Vorname" → "Vorname Nachname"
    if (m) formatierterName = `${m[2].trim()} ${m[1].trim()}`;
    return `Fahrgelderstattung ${formatierterName} ${monatsname} ${yy}.${extension}`;
  }

  /**
   * Liest Breite/Höhe direkt aus PNG/JPEG-Bytes (ohne Image-API) – für
   * Aspect-Ratio-erhaltendes Einbetten der Unterschrift in Excel.
   */
  function liesBilddimensionen(input) {
    const ab = input instanceof ArrayBuffer ? input
      : input && input.buffer ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : null;
    if (!ab || ab.byteLength < 24) return null;
    const view = new DataView(ab);
    if (view.getUint32(0) === 0x89504E47 && view.getUint32(4) === 0x0D0A1A0A) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (view.getUint16(0) === 0xFFD8) {
      let offset = 2;
      while (offset + 9 < view.byteLength) {
        if (view.getUint8(offset) !== 0xFF) return null;
        const marker = view.getUint8(offset + 1);
        const isSOF = (marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
        if (isSOF) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        const segLen = view.getUint16(offset + 2);
        if (segLen < 2) return null;
        offset += 2 + segLen;
      }
    }
    return null;
  }

  /* ── Excel-Generierung ───────────────────────────────────────── */
  /**
   * @param {object} args
   * @param {ArrayBuffer} args.templateBytes  – Bytes der xlsx-Vorlage
   * @param {string} args.monatKey            – "yyyy-mm"
   * @param {Array<{datum:string}>} args.schultage – gefilterte BS-Tage (sortiert)
   * @param {object} args.konstanten          – {name, persNr, kst, vonHaltestelle, nachHaltestelle, betragProTag}
   * @param {Array<{datumText:string, von:string, nach:string, betrag:number}>} [args.zeilen]
   *        – editierte Vorschau-Zeilen; haben Vorrang vor schultage/konstanten
   * @param {ArrayBuffer} [args.unterschriftBytes]
   * @param {string} [args.unterschriftExtension] – 'png' | 'jpeg'
   * @returns {Promise<{blob: Blob, dateiname: string, anzahlTage: number, ueberzaehlig: number}>}
   */
  function baueEintraege({ zeilen, schultage, konstanten, slots }) {
    if (Array.isArray(zeilen) && zeilen.length > 0) {
      return zeilen.slice(0, slots).map(z => ({
        datumText: z.datumText || '',
        von: z.von || '',
        nach: z.nach || '',
        betrag: Number(z.betrag) || 0,
      }));
    }
    return (schultage || []).slice(0, slots).map(t => ({
      datumText: isoZuDeutsch(t.datum),
      von: konstanten.vonHaltestelle || '',
      nach: konstanten.nachHaltestelle || '',
      betrag: konstanten.betragProTag || 0,
    }));
  }

  async function generiereFahrtgeldExcel({
    templateBytes, monatKey, schultage, konstanten, zeilen,
    unterschriftBytes, unterschriftExtension
  }) {
    const ExcelJS = global.ExcelJS;
    if (!ExcelJS) throw new Error('ExcelJS nicht geladen (vendor/exceljs.min.js fehlt).');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(templateBytes);
    } catch (err) {
      throw new Error('Die Excel-Vorlage ist beschädigt.');
    }
    const sheet = wb.getWorksheet(SHEET_NAME) || wb.worksheets[0];
    if (!sheet) throw new Error('Die Excel-Vorlage hat kein passendes Arbeitsblatt.');

    // Eingebettete Unterschrift der Vorlage entfernen (soll nicht leaken) ODER
    // wenn der User eine eigene hochgeladen hat (alte ersetzen). ExcelJS 4.x hat
    // keine public removeImage-API – direkt auf _media zugreifen.
    try {
      if (Array.isArray(sheet._media)) {
        sheet._media = sheet._media.filter(m => {
          const startRow = (m && m.range && m.range.tl && (m.range.tl.nativeRow ?? m.range.tl.row)) || 0;
          return startRow < 18;
        });
      }
    } catch (err) {
      console.warn('[fahrtgeld] Bild-Cleanup fehlgeschlagen:', err);
    }

    // Header. Monat/Jahr als STRING ("April 26") statt Date – ExcelJS speichert
    // JS-Dates timezone-abhängig als Serial, was zu Tag/Monat-Versatz führt.
    const headerDatumCell = sheet.getCell(HEADER_DATUM_CELL);
    headerDatumCell.value = monatLabelKurz(monatKey);
    headerDatumCell.numFmt = '@';
    sheet.getCell(HEADER_NAME_CELL).value = konstanten.name || '';
    sheet.getCell(HEADER_PERSNR_CELL).value = `Pers.-Nr.: ${konstanten.persNr || ''}`;
    sheet.getCell(HEADER_KST_CELL).value = `KST: ${konstanten.kst || ''}`;

    // Tabelle nur verlängern, wenn die Tage die 10 Vorlagenzeilen wirklich
    // überschreiten — sonst bleibt die Vorlage exakt wie sie ist.
    const anzahlTage = (Array.isArray(zeilen) && zeilen.length) || (schultage || []).length;
    const extra = Math.max(0, anzahlTage - (DATEN_BIS_ZEILE - DATEN_VON_ZEILE + 1));
    const bisZeile = extra > 0 ? verlaengereExcelTabelle(sheet, extra) : DATEN_BIS_ZEILE;
    const summeZeile = bisZeile + 1;
    const unterschriftZeile = bisZeile + 2;

    // Alte Daten-Slots leeren
    for (let r = DATEN_VON_ZEILE; r <= bisZeile; r++) {
      sheet.getCell(`A${r}`).value = null;
      sheet.getCell(`C${r}`).value = null;
      sheet.getCell(`E${r}`).value = null;
      sheet.getCell(`G${r}`).value = null;
    }

    // Zeilen einfügen. Datum als TEXT (numFmt "@") gegen Zeitzonen-Versatz.
    const slots = bisZeile - DATEN_VON_ZEILE + 1;
    const verwendet = baueEintraege({ zeilen, schultage, konstanten, slots });
    for (let i = 0; i < verwendet.length; i++) {
      const zeile = DATEN_VON_ZEILE + i;
      const datumZelle = sheet.getCell(`A${zeile}`);
      datumZelle.value = verwendet[i].datumText;
      datumZelle.numFmt = '@';
      sheet.getCell(`C${zeile}`).value = verwendet[i].von;
      sheet.getCell(`E${zeile}`).value = verwendet[i].nach;
      sheet.getCell(`G${zeile}`).value = verwendet[i].betrag;
    }

    // G20-Summe: Formel behalten, aber gecachten Wert überschreiben, sonst zeigt
    // Excel im Schreibschutz den alten Vorlagen-Wert bis "Bearbeiten aktivieren".
    const korrekteSumme = +verwendet.reduce((s, e) => s + (e.betrag || 0), 0).toFixed(2);
    const summenZelle = sheet.getCell(`G${summeZeile}`);
    summenZelle.value = { formula: `SUM(G${DATEN_VON_ZEILE}:G${bisZeile})`, result: korrekteSumme };

    // Unterschriftsbereich: Datum (Tag der Generierung) unten zentriert.
    const heuteFormatiert = heuteDeutsch();
    const unterschriftCell = sheet.getCell(`A${unterschriftZeile}`);
    unterschriftCell.value = konstanten.unterschriftText
      ? `${heuteFormatiert} ${konstanten.unterschriftText}`
      : heuteFormatiert;
    unterschriftCell.alignment = { vertical: 'bottom', horizontal: 'center', wrapText: false };

    if (unterschriftBytes && unterschriftExtension) {
      const imageId = wb.addImage({ buffer: unterschriftBytes, extension: unterschriftExtension });
      // Unterschriftszelle ≈ 197×80 px. Bild zentriert, Aspect-Ratio erhalten, Platz fürs Datum drunter.
      const CELL_W_PX = 197, COL_A_W_PX = 80, ZIEL_H_PX = 62, MAX_W_PX = 190;
      const dim = liesBilddimensionen(unterschriftBytes);
      let w = MAX_W_PX, h = ZIEL_H_PX;
      if (dim && dim.width > 0 && dim.height > 0) {
        const ratio = Math.min(MAX_W_PX / dim.width, ZIEL_H_PX / dim.height);
        w = Math.round(dim.width * ratio);
        h = Math.round(dim.height * ratio);
      }
      const xOffsetPx = Math.max(0, Math.round((CELL_W_PX - w) / 2));
      sheet.addImage(imageId, {
        tl: { col: xOffsetPx / COL_A_W_PX, row: unterschriftZeile - 0.96 },
        ext: { width: w, height: h },
        editAs: 'oneCell'
      });
    }

    // Footer: Form-Nummer "F6344-1" o.ä. unter dem Fußblock entfernen (User will sie weg).
    for (let r = bisZeile + 3; r <= bisZeile + 5; r++) {
      for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        const cell = sheet.getCell(`${col}${r}`);
        const v = cell.value;
        if (typeof v === 'string' && /^[A-Z]\d+(-\d+)?$/.test(v.trim())) cell.value = null;
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return {
      blob,
      dateiname: baueDateiname(konstanten.name, monatKey, 'xlsx'),
      anzahlTage: verwendet.length,
      ueberzaehlig: Math.max(0, anzahlTage - verwendet.length)
    };
  }

  /* ── PDF-Geometrie der Vorlage ───────────────────────────────────
     Aus dem Content-Stream gemessen (die GEZEICHNETEN Rechtecke, nicht die
     Feld-Positionen — die streuen um bis zu 1,4 pt): die Trennlinien der
     Tabelle liegen im 19,32-pt-Takt, die letzte Zeile endet auf der dicken
     Abschlusslinie bei y≈380,3, darunter folgt der Unterschriftsblock.
     Unter y≈283 ist die Seite leer, es passen also 13 zusätzliche Zeilen —
     mehr Berufsschultage hat kein Monat. */
  const PDF_ZEILE_H = 19.32;
  const PDF_TABELLE_UNTEN = 380.3;
  const PDF_MUSTER_UNTEN = 399.3;   // Musterzeile mit dünner Linie oben UND unten
  const PDF_MUSTER_OBEN = 418.6;
  const PDF_DICKE_UNTEN = 379.4;    // dicke Abschlusslinie als eigene Bande
  const PDF_DICKE_OBEN = 381.2;
  const PDF_FUSS_UNTEN = 283;
  const PDF_FORMCODE_Y = 286;
  /* Die Kostenstelle steht in der PDF-Vorlage als STATISCHER Text (10000957),
     nicht in einem Formularfeld — jede erzeugte PDF trug damit eine fremde
     KST, egal was der Azubi einträgt. Stelle und Schriftgröße aus dem
     Content-Stream: „/F1 12 Tf … 1 0 0 1 482.14 636.07 Tm". */
  const PDF_KST_X = 482.14;
  const PDF_KST_Y = 636.07;
  const PDF_KST_SIZE = 12;

  /* Statischen Text an einer bekannten Stelle WIRKLICH entfernen, nicht nur
     weiß übermalen: übermalt bleibt er im Content-Stream stehen und ist per
     Textsuche, Copy-Paste oder jedem Parser auslesbar. In einem Beleg, der
     zur Entgeltabrechnung geht, darf keine fremde Angabe drinstehen — auch
     keine unsichtbare. Entfernt die Zeichenketten des Textblocks, dessen
     Textmatrix auf (x,y) steht; Gerüst (BT/ET, Tf, Tm) bleibt unangetastet,
     damit der Stream gültig bleibt. Findet sich nichts (z. B. weil die
     Vorlage bereinigt wurde), passiert nichts. */
  function entferneStatischenText(pdfDoc, page, x, y) {
    const PDFLib = global.PDFLib;
    const contents = page.node.Contents();
    if (!contents || typeof contents.size === 'function') return false; // schon zusammengesetzt
    let roh;
    try { roh = PDFLib.decodePDFRawStream(contents).decode(); } catch (e) { return false; }
    let text = '';
    for (let i = 0; i < roh.length; i++) text += String.fromCharCode(roh[i]);

    const marke = `1 0 0 1 ${x} ${y} Tm`;
    const start = text.indexOf(marke);
    if (start === -1) return false;
    const ende = text.indexOf('ET', start);
    if (ende === -1) return false;
    const block = text.slice(start, ende);
    // Alle Zeichenketten im Block leeren – "(10000957)" → "()"
    const sauber = block.replace(/\((?:[^()\\]|\\.)*\)/g, '()');
    if (sauber === block) return false;
    const neu = text.slice(0, start) + sauber + text.slice(ende);

    const bytes = new Uint8Array(neu.length);
    for (let i = 0; i < neu.length; i++) bytes[i] = neu.charCodeAt(i) & 0xff;
    page.node.set(PDFLib.PDFName.of('Contents'), pdfDoc.context.register(pdfDoc.context.flateStream(bytes)));
    return true;
  }
  const PDF_MAX_EXTRA = Math.floor((PDF_FUSS_UNTEN - 24) / PDF_ZEILE_H);

  /* Tabelle verlängern, ohne das Gitter nachzuzeichnen: eine saubere
     Zeilen-Bande der Vorlage wird als XObject mehrfach gestempelt, die
     Abschlusslinie und der Unterschriftsblock wandern um dieselbe Höhe nach
     unten. So bleibt das Original-Formular pixelgenau erhalten. */
  async function verlaengerePdfSeite({ PDFLib, pdfDoc, page, templateBytes, extra }) {
    const { PDFDocument, rgb } = PDFLib;
    const quelle = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const quellSeite = quelle.getPage(0);
    const breite = page.getWidth();
    const shift = extra * PDF_ZEILE_H;
    const bande = (bottom, top) => pdfDoc.embedPage(quellSeite, { left: 0, bottom, right: breite, top });

    const bandZeile = await bande(PDF_MUSTER_UNTEN, PDF_MUSTER_OBEN);
    const bandDick = await bande(PDF_DICKE_UNTEN, PDF_DICKE_OBEN);
    const bandFuss = await bande(PDF_FUSS_UNTEN, PDF_DICKE_UNTEN);

    // Abschlusslinie + Unterschriftsblock an der alten Stelle übermalen …
    page.drawRectangle({
      x: 0, y: PDF_FUSS_UNTEN, width: breite, height: PDF_DICKE_OBEN - PDF_FUSS_UNTEN,
      color: rgb(1, 1, 1), borderWidth: 0,
    });
    // … zusätzliche Zeilen stempeln …
    for (let k = 1; k <= extra; k++) {
      page.drawPage(bandZeile, { x: 0, y: PDF_TABELLE_UNTEN - PDF_ZEILE_H * k });
    }
    // … und beides um die gewonnene Höhe tiefer neu setzen.
    page.drawPage(bandDick, { x: 0, y: PDF_DICKE_UNTEN - shift });
    page.drawPage(bandFuss, { x: 0, y: PDF_FUSS_UNTEN - shift });
    return shift;
  }

  /* ── PDF-Layout aus geladener pdf-lib-Form klassifizieren ─────── */
  function klassifiziereLayout(form) {
    const items = [];
    for (const f of form.getFields()) {
      const fieldName = f.getName();
      let widgets = [];
      try { widgets = f.acroField.getWidgets(); } catch (e) { /* kein Widget */ }
      for (const w of widgets) {
        const r = w.getRectangle();
        const x1 = r.x, y1 = r.y, x2 = r.x + r.width, y2 = r.y + r.height;
        items.push({ fieldName, rect: [x1, y1, x2, y2], x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
      }
    }
    const byY = (a, b) => b.y - a.y; // Top→Bottom (große y zuerst)
    const tabelle = items.filter(i => i.y > 370 && i.y < 580);
    const monatJahr = items.find(i => i.y > 660 && i.x < 250) || null;
    const persNr = items.find(i => i.y > 660 && i.x > 400) || null;
    const name = items.find(i => i.y > 630 && i.y < 660 && i.x < 250) || null;
    const summe = items.find(i => i.y < 370 && i.y > 320 && i.x > 460) || null;
    const auszubildender = items.find(i => i.y < 340 && i.y > 310 && i.x < 200) || null;
    const spalte = (min, max) => tabelle.filter(i => i.x > min && i.x < max).sort(byY);
    const datum = spalte(0, 140), von = spalte(140, 290), nach = spalte(290, 460), betrag = spalte(460, 1e4);
    // Rechteck der jeweils UNTERSTEN Zeile je Spalte – daran richten sich die
    // zusätzlich gezeichneten Zeilen aus (dieselbe x-Position und Breite).
    const letzte = (arr) => (arr.length ? arr[arr.length - 1].rect : null);
    return {
      monatJahrField: monatJahr ? monatJahr.fieldName : null,
      persNrField: persNr ? persNr.fieldName : null,
      nameField: name ? name.fieldName : null,
      summeField: summe ? summe.fieldName : null,
      summeRect: summe ? summe.rect : null,
      auszubildenderField: auszubildender ? auszubildender.fieldName : null,
      auszubildenderRect: auszubildender ? auszubildender.rect : null,
      datumFields: datum.map(s => s.fieldName),
      vonFields: von.map(s => s.fieldName),
      nachFields: nach.map(s => s.fieldName),
      betragFields: betrag.map(s => s.fieldName),
      spaltenRects: { datum: letzte(datum), von: letzte(von), nach: letzte(nach), betrag: letzte(betrag) },
    };
  }

  function trySetField(form, fieldName, value) {
    if (!fieldName) return;
    try {
      form.getTextField(fieldName).setText(value == null ? '' : value);
    } catch (err) { /* kein Text-Field oder unbekannt */ }
  }

  /* ── PDF-Generierung ─────────────────────────────────────────── */
  /**
   * @param {object} args  – wie generiereFahrtgeldExcel, templateBytes = pdf-Vorlage
   */
  async function generiereFahrtgeldPdf({
    templateBytes, monatKey, schultage, konstanten, zeilen,
    unterschriftBytes, unterschriftExtension
  }) {
    const PDFLib = global.PDFLib;
    if (!PDFLib) throw new Error('pdf-lib nicht geladen (vendor/pdf-lib.min.js fehlt).');
    const { PDFDocument, PDFName, rgb } = PDFLib;

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    } catch (err) {
      throw new Error('Die PDF-Vorlage ist beschädigt.');
    }
    const form = pdfDoc.getForm();
    const layout = klassifiziereLayout(form);

    /* NICHTS aus der Vorlage stehen lassen: erst JEDES Textfeld leeren, dann
       ausschließlich echte Nutzerdaten setzen. Vorher wurden Name und
       Pers.-Nr. nur gesetzt, WENN ein Wert vorlag — bei leerem Wert wäre der
       Vorgabewert der Vorlage im Dokument gelandet. In einem Beleg, der zur
       Entgeltabrechnung geht, darf keine fremde Angabe auftauchen. */
    for (const f of form.getFields()) {
      try { form.getTextField(f.getName()).setText(''); } catch (e) { /* kein Textfeld */ }
    }

    // Header – unbedingt setzen, leer bleibt leer.
    trySetField(form, layout.monatJahrField, monatLabelKurz(monatKey));
    trySetField(form, layout.nameField, konstanten.name || '');
    trySetField(form, layout.persNrField, konstanten.persNr || '');

    // Fest einkodierte Kostenstelle aus der Vorlage LÖSCHEN und die echte setzen.
    const kstSeite = pdfDoc.getPage(0);
    const geloescht = entferneStatischenText(pdfDoc, kstSeite, PDF_KST_X, PDF_KST_Y);
    if (!geloescht) {
      // Rückfall, falls sich der Content-Stream nicht bearbeiten ließ: wenigstens
      // überdecken. Der Wert bliebe dann allerdings im Dokument auslesbar.
      console.warn('[fahrtgeld] Statische KST konnte nicht entfernt werden – nur überdeckt.');
      kstSeite.drawRectangle({
        x: PDF_KST_X - 2, y: PDF_KST_Y - 1.2, width: 92, height: PDF_KST_SIZE,
        color: rgb(1, 1, 1), borderWidth: 0,
      });
    }
    if (konstanten.kst) {
      const kstFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      kstSeite.drawText(String(konstanten.kst), {
        x: PDF_KST_X, y: PDF_KST_Y, size: PDF_KST_SIZE, font: kstFont,
      });
    }

    // Tabelle: erst leeren, dann befüllen
    const datumFields = layout.datumFields || [];
    const vonFields = layout.vonFields || [];
    const nachFields = layout.nachFields || [];
    const betragFields = layout.betragFields || [];
    const vorlagenSlots = Math.min(datumFields.length, vonFields.length, nachFields.length, betragFields.length);
    for (let i = 0; i < vorlagenSlots; i++) {
      trySetField(form, datumFields[i], '');
      trySetField(form, vonFields[i], '');
      trySetField(form, nachFields[i], '');
      trySetField(form, betragFields[i], '');
    }

    // Mehr Berufsschultage als Vorlagenzeilen (Blockunterricht) → Tabelle
    // verlängern. Bis einschließlich 10 Tage bleibt die Vorlage unangetastet
    // und die Felder ausfüllbar wie bisher.
    const anzahlTage = (Array.isArray(zeilen) && zeilen.length) || (schultage || []).length;
    const extra = Math.max(0, Math.min(anzahlTage - vorlagenSlots, PDF_MAX_EXTRA));
    const seite = pdfDoc.getPage(0);
    let shift = 0;
    if (extra > 0) {
      shift = await verlaengerePdfSeite({ PDFLib, pdfDoc, page: seite, templateBytes, extra });
    }

    const slots = vorlagenSlots + extra;
    const verwendet = baueEintraege({ zeilen, schultage, konstanten, slots });
    for (let i = 0; i < Math.min(verwendet.length, vorlagenSlots); i++) {
      trySetField(form, datumFields[i], verwendet[i].datumText);
      if (verwendet[i].von) trySetField(form, vonFields[i], verwendet[i].von);
      if (verwendet[i].nach) trySetField(form, nachFields[i], verwendet[i].nach);
      if (verwendet[i].betrag > 0) trySetField(form, betragFields[i], verwendet[i].betrag.toFixed(2).replace('.', ','));
    }

    const summe = +verwendet.reduce((s, e) => s + (e.betrag || 0), 0).toFixed(2);
    const summeText = summe.toFixed(2).replace('.', ',');
    // Auszubildender-Feld: heutiges Datum (+ optional Unterschrift-Text)
    const ausbildText = konstanten.unterschriftText
      ? `${heuteDeutsch()} ${konstanten.unterschriftText}`
      : heuteDeutsch();

    if (extra === 0) {
      trySetField(form, layout.summeField, summeText);
      trySetField(form, layout.auszubildenderField, ausbildText);
    } else {
      /* Die gestempelten Zeilen tragen keine Formularfelder → Werte zeichnen.
         Summen- und Auszubildenden-Feld liegen im verschobenen Fußblock; ihre
         Widgets kleben als Annotation an der alten (jetzt übermalten) Stelle
         und würden darüber liegen — also entfernen und ebenfalls zeichnen. */
      const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      const r = layout.spaltenRects;
      const zeichne = (text, rect, rechtsbuendig, y, size = 9) => {
        if (!rect || text === '' || text == null) return;
        const tb = font.widthOfTextAtSize(String(text), size);
        seite.drawText(String(text), {
          x: rechtsbuendig ? rect[2] - 2 - tb : rect[0] + 2,
          y, size, font,
        });
      };
      for (let i = vorlagenSlots; i < verwendet.length; i++) {
        const y = PDF_TABELLE_UNTEN - PDF_ZEILE_H * (i - vorlagenSlots + 1) + 6.5;
        zeichne(verwendet[i].datumText, r.datum, false, y);
        zeichne(verwendet[i].von, r.von, false, y);
        zeichne(verwendet[i].nach, r.nach, false, y);
        // linksbündig wie in den Vorlagenzeilen darüber, nicht am Zellrand
        if (verwendet[i].betrag > 0) zeichne(verwendet[i].betrag.toFixed(2).replace('.', ','), r.betrag, false, y);
      }
      for (const feldName of [layout.summeField, layout.auszubildenderField]) {
        if (!feldName) continue;
        try { form.removeField(form.getField(feldName)); } catch (e) { /* schon weg */ }
      }
      if (layout.summeRect) {
        const [, sy1, , sy2] = layout.summeRect;
        zeichne(summeText, layout.summeRect, true, (sy1 + sy2) / 2 - shift - 3, 10);
      }
      if (layout.auszubildenderRect) {
        const [ax1, ay1, ax2] = layout.auszubildenderRect;
        const tb = font.widthOfTextAtSize(ausbildText, 9);
        seite.drawText(ausbildText, { x: ax1 + ((ax2 - ax1) - tb) / 2, y: ay1 - shift + 3, size: 9, font });
      }
    }

    // StrikeOut-Annotationen der Vorlage entfernen (Redaktions-Markierungen).
    try {
      const annots = seite.node.Annots();
      if (annots) {
        for (let i = annots.size() - 1; i >= 0; i--) {
          const annotDict = pdfDoc.context.lookup(annots.get(i));
          if (annotDict && typeof annotDict.lookup === 'function') {
            const subtype = annotDict.lookup(PDFName.of('Subtype'));
            if (subtype && String(subtype) === '/StrikeOut') annots.remove(i);
          }
        }
      }
    } catch (err) {
      console.warn('[fahrtgeld] StrikeOut-Cleanup fehlgeschlagen:', err);
    }

    // Form-Code "F6344-1" (Teil des Content-Streams) mit weißem Rechteck überdecken.
    try {
      // wandert bei verlängerter Tabelle mit dem Fußblock nach unten
      seite.drawRectangle({ x: 16, y: PDF_FORMCODE_Y - shift, width: 60, height: 16, color: rgb(1, 1, 1), borderWidth: 0 });
    } catch (err) {
      console.warn('[fahrtgeld] Form-Code-Overlay fehlgeschlagen:', err);
    }

    // Unterschrift-Bild über dem Auszubildender-Feld
    if (unterschriftBytes && layout.auszubildenderRect) {
      try {
        const ext = (unterschriftExtension || 'png').toLowerCase();
        const img = ext === 'png' ? await pdfDoc.embedPng(unterschriftBytes) : await pdfDoc.embedJpg(unterschriftBytes);
        const [fx1, , fx2, fy2raw] = layout.auszubildenderRect;
        const fy2 = fy2raw - shift;   // Fußblock ist ggf. nach unten gewandert
        const targetX1 = fx1, targetX2 = fx2;
        const targetY1 = fy2 + 1;
        const targetY2 = Math.min(fy2 + 40, 366 - shift);
        const targetW = targetX2 - targetX1;
        const targetH = Math.max(0, targetY2 - targetY1);
        if (targetH > 4 && img.width > 0 && img.height > 0) {
          const ratio = Math.min((targetW * 0.96) / img.width, (targetH * 0.96) / img.height);
          const w = img.width * ratio, h = img.height * ratio;
          pdfDoc.getPage(0).drawImage(img, {
            x: targetX1 + (targetW - w) / 2,
            y: targetY1 + (targetH - h) / 2,
            width: w, height: h
          });
        }
      } catch (err) {
        console.warn('[fahrtgeld] Unterschrift-Embed fehlgeschlagen:', err);
      }
    }

    // Felder NICHT flatten – User kann fehlende Werte im Reader ergänzen.
    try { form.updateFieldAppearances(); } catch (err) { console.warn('[fahrtgeld] updateFieldAppearances fehlgeschlagen:', err); }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return {
      blob,
      dateiname: baueDateiname(konstanten.name, monatKey, 'pdf'),
      anzahlTage: verwendet.length,
      ueberzaehlig: Math.max(0, anzahlTage - verwendet.length)
    };
  }

  /* ── Upload bestehender Fahrgeld-Dokumente: Konstanten extrahieren ──
     Wie in der better-ess-App: der User lädt ein bereits ausgefülltes
     Fahrgeld-Dokument (Excel ODER PDF) hoch; wir lesen Name, Pers.-Nr., KST,
     Strecke und Tagessatz aus — und bei Excel zusätzlich die eingebettete
     Unterschrift. Format-Erkennung über Magic-Bytes. */
  function istPdfBytes(ab) {
    if (!ab || ab.byteLength < 5) return false;
    const v = new Uint8Array(ab, 0, 5);
    return v[0] === 0x25 && v[1] === 0x50 && v[2] === 0x44 && v[3] === 0x46 && v[4] === 0x2D; // %PDF-
  }

  function parseDeutscheZahl(s) {
    if (!s) return 0;
    const c = String(s).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(c);
    return Number.isFinite(n) ? n : 0;
  }

  async function extrahiereKonstantenAusTemplate(arrayBuffer) {
    return istPdfBytes(arrayBuffer)
      ? extrahiereKonstantenAusPdf(arrayBuffer)
      : extrahiereKonstantenAusExcel(arrayBuffer);
  }

  async function extrahiereKonstantenAusExcel(arrayBuffer) {
    const ExcelJS = global.ExcelJS;
    if (!ExcelJS) return { ok: false, fehler: 'ExcelJS nicht geladen.' };
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(arrayBuffer); }
    catch (e) { return { ok: false, fehler: 'Die Excel-Datei ist beschädigt oder kein gültiges .xlsx-Format.' }; }
    const sheet = wb.getWorksheet(SHEET_NAME) || wb.worksheets[0];
    if (!sheet) return { ok: false, fehler: 'Die Excel-Datei hat keine Arbeitsblätter.' };

    const cellText = (coord) => {
      const v = sheet.getCell(coord).value;
      if (v == null) return '';
      if (typeof v === 'object' && v.text) return String(v.text);
      if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('');
      return String(v);
    };
    const name = cellText(HEADER_NAME_CELL).trim();
    const persNr = (cellText(HEADER_PERSNR_CELL).match(/\d+/) || [''])[0];
    const kst = (cellText(HEADER_KST_CELL).match(/\d+/) || [''])[0];
    const vonHaltestelle = cellText(`C${DATEN_VON_ZEILE}`).trim();
    const nachHaltestelle = cellText(`E${DATEN_VON_ZEILE}`).trim();
    const betragRaw = sheet.getCell(`G${DATEN_VON_ZEILE}`).value;
    const betragProTag = typeof betragRaw === 'number' ? betragRaw : parseFloat(String(betragRaw).replace(',', '.')) || 0;

    // Eingebettete Unterschrift: als "Cell Image" (Excel 2022+) eingebettete Bilder
    // kennt ExcelJS nicht via getImages() — sie liegen als orphan media im Workbook.
    let unterschriftAuto = null;
    try {
      const usedImageIds = new Set(sheet.getImages().map(i => parseInt(i.imageId, 10)));
      const orphans = (wb.media || [])
        .map((m, idx) => ({ media: m, index: idx }))
        .filter(({ media, index }) => media && media.type === 'image' && !usedImageIds.has(index) && media.buffer);
      if (orphans.length) {
        orphans.sort((a, b) => (b.media.buffer.length || 0) - (a.media.buffer.length || 0));
        const sig = orphans[0].media, buf = sig.buffer;
        const ab = buf instanceof ArrayBuffer ? buf
          : (buf.buffer ? buf.buffer.slice(buf.byteOffset || 0, (buf.byteOffset || 0) + buf.byteLength) : null);
        if (ab) {
          const ext = (sig.extension || '').toLowerCase();
          unterschriftAuto = { bytes: ab, extension: ext === 'jpg' ? 'jpeg' : (ext || 'png') };
        }
      }
    } catch (e) { console.warn('[fahrtgeld] Unterschrift-Extraktion fehlgeschlagen:', e); }

    if (!name && !persNr && !kst && !vonHaltestelle && !nachHaltestelle && !betragProTag) {
      return { ok: false, fehler: 'Diese Excel ist nicht im Format der Standard-Fahrgelderstattung — keine erwarteten Felder gefunden.' };
    }
    return { ok: true, format: 'excel', konstanten: { name, persNr, kst, vonHaltestelle, nachHaltestelle, betragProTag }, unterschriftAuto };
  }

  async function extrahiereKonstantenAusPdf(arrayBuffer) {
    const PDFLib = global.PDFLib;
    if (!PDFLib) return { ok: false, fehler: 'pdf-lib nicht geladen.' };
    let doc;
    try { doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true }); }
    catch (e) { return { ok: false, fehler: 'Die PDF konnte nicht gelesen werden (beschädigt oder verschlüsselt).' }; }
    const form = doc.getForm();
    const layout = klassifiziereLayout(form);
    const get = (n) => { if (!n) return ''; try { return (form.getTextField(n).getText() || '').trim(); } catch (e) { return ''; } };
    const erster = (fields) => { for (const f of (fields || [])) { const v = get(f); if (v) return v; } return ''; };
    const name = get(layout.nameField);
    const persNr = (get(layout.persNrField).match(/\d+/) || [''])[0];
    const vonHaltestelle = erster(layout.vonFields);
    const nachHaltestelle = erster(layout.nachFields);
    const betragProTag = parseDeutscheZahl(erster(layout.betragFields));
    if (!name && !persNr && !vonHaltestelle && !nachHaltestelle && !betragProTag) {
      return { ok: false, fehler: 'Diese PDF ist eine leere Vorlage — bitte ein bereits ausgefülltes Fahrgeld-PDF hochladen.' };
    }
    // KST steht im Original-PDF als statischer Text (kein Formularfeld) → hier nicht lesbar; leer lassen.
    return { ok: true, format: 'pdf', konstanten: { name, persNr, kst: '', vonHaltestelle, nachHaltestelle, betragProTag }, unterschriftAuto: null };
  }

  /** Triggert Browser-Download eines Blobs. */
  function triggerDownload(blob, dateiname) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.FahrtgeldCore = {
    generiereFahrtgeldExcel,
    generiereFahrtgeldPdf,
    extrahiereKonstantenAusTemplate,
    triggerDownload,
    formatMonatLabel,
  };
})(window);
