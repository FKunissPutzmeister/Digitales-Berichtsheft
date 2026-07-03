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

    // Alte Daten-Slots leeren
    for (let r = DATEN_VON_ZEILE; r <= DATEN_BIS_ZEILE; r++) {
      sheet.getCell(`A${r}`).value = null;
      sheet.getCell(`C${r}`).value = null;
      sheet.getCell(`E${r}`).value = null;
      sheet.getCell(`G${r}`).value = null;
    }

    // Zeilen einfügen. Datum als TEXT (numFmt "@") gegen Zeitzonen-Versatz.
    const slots = DATEN_BIS_ZEILE - DATEN_VON_ZEILE + 1;
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
    const g20 = sheet.getCell(`G${DATEN_BIS_ZEILE + 1}`);
    g20.value = { formula: `SUM(G${DATEN_VON_ZEILE}:G${DATEN_BIS_ZEILE})`, result: korrekteSumme };

    // Unterschriftsbereich A21: Datum (Tag der Generierung) unten zentriert.
    const heuteFormatiert = heuteDeutsch();
    const unterschriftCell = sheet.getCell('A21');
    unterschriftCell.value = konstanten.unterschriftText
      ? `${heuteFormatiert} ${konstanten.unterschriftText}`
      : heuteFormatiert;
    unterschriftCell.alignment = { vertical: 'bottom', horizontal: 'center', wrapText: false };

    if (unterschriftBytes && unterschriftExtension) {
      const imageId = wb.addImage({ buffer: unterschriftBytes, extension: unterschriftExtension });
      // Zelle A21:B21 ≈ 197×80 px. Bild zentriert, Aspect-Ratio erhalten, Platz fürs Datum drunter.
      const CELL_W_PX = 197, COL_A_W_PX = 80, ZIEL_H_PX = 55, MAX_W_PX = 185;
      const dim = liesBilddimensionen(unterschriftBytes);
      let w = MAX_W_PX, h = ZIEL_H_PX;
      if (dim && dim.width > 0 && dim.height > 0) {
        const ratio = Math.min(MAX_W_PX / dim.width, ZIEL_H_PX / dim.height);
        w = Math.round(dim.width * ratio);
        h = Math.round(dim.height * ratio);
      }
      const xOffsetPx = Math.max(0, Math.round((CELL_W_PX - w) / 2));
      sheet.addImage(imageId, {
        tl: { col: xOffsetPx / COL_A_W_PX, row: 20.04 },
        ext: { width: w, height: h },
        editAs: 'oneCell'
      });
    }

    // Footer: Form-Nummer "F6344-1" o.ä. in Zeile 23–25 entfernen (User will sie weg).
    for (let r = DATEN_BIS_ZEILE + 3; r <= DATEN_BIS_ZEILE + 5; r++) {
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
      ueberzaehlig: Math.max(0, ((zeilen && zeilen.length) || schultage.length) - verwendet.length)
    };
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
    return {
      monatJahrField: monatJahr ? monatJahr.fieldName : null,
      persNrField: persNr ? persNr.fieldName : null,
      nameField: name ? name.fieldName : null,
      summeField: summe ? summe.fieldName : null,
      auszubildenderField: auszubildender ? auszubildender.fieldName : null,
      auszubildenderRect: auszubildender ? auszubildender.rect : null,
      datumFields: tabelle.filter(i => i.x > 0 && i.x < 140).sort(byY).map(s => s.fieldName),
      vonFields: tabelle.filter(i => i.x > 140 && i.x < 290).sort(byY).map(s => s.fieldName),
      nachFields: tabelle.filter(i => i.x > 290 && i.x < 460).sort(byY).map(s => s.fieldName),
      betragFields: tabelle.filter(i => i.x > 460).sort(byY).map(s => s.fieldName),
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

    // Header
    trySetField(form, layout.monatJahrField, monatLabelKurz(monatKey));
    if (konstanten.name) trySetField(form, layout.nameField, konstanten.name);
    if (konstanten.persNr) trySetField(form, layout.persNrField, konstanten.persNr);

    // Tabelle: erst leeren, dann befüllen
    const datumFields = layout.datumFields || [];
    const vonFields = layout.vonFields || [];
    const nachFields = layout.nachFields || [];
    const betragFields = layout.betragFields || [];
    const slots = Math.min(datumFields.length, vonFields.length, nachFields.length, betragFields.length);
    for (let i = 0; i < slots; i++) {
      trySetField(form, datumFields[i], '');
      trySetField(form, vonFields[i], '');
      trySetField(form, nachFields[i], '');
      trySetField(form, betragFields[i], '');
    }
    const verwendet = baueEintraege({ zeilen, schultage, konstanten, slots });
    for (let i = 0; i < verwendet.length; i++) {
      trySetField(form, datumFields[i], verwendet[i].datumText);
      if (verwendet[i].von) trySetField(form, vonFields[i], verwendet[i].von);
      if (verwendet[i].nach) trySetField(form, nachFields[i], verwendet[i].nach);
      if (verwendet[i].betrag > 0) trySetField(form, betragFields[i], verwendet[i].betrag.toFixed(2).replace('.', ','));
    }

    // Summe
    const summe = +verwendet.reduce((s, e) => s + (e.betrag || 0), 0).toFixed(2);
    trySetField(form, layout.summeField, summe.toFixed(2).replace('.', ','));

    // Auszubildender-Feld: heutiges Datum (+ optional Unterschrift-Text)
    const ausbildText = konstanten.unterschriftText
      ? `${heuteDeutsch()} ${konstanten.unterschriftText}`
      : heuteDeutsch();
    trySetField(form, layout.auszubildenderField, ausbildText);

    // StrikeOut-Annotationen der Vorlage entfernen (Redaktions-Markierungen).
    try {
      const page0 = pdfDoc.getPage(0);
      const annots = page0.node.Annots();
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
      pdfDoc.getPage(0).drawRectangle({ x: 16, y: 286, width: 60, height: 16, color: rgb(1, 1, 1), borderWidth: 0 });
    } catch (err) {
      console.warn('[fahrtgeld] Form-Code-Overlay fehlgeschlagen:', err);
    }

    // Unterschrift-Bild über dem Auszubildender-Feld
    if (unterschriftBytes && layout.auszubildenderRect) {
      try {
        const ext = (unterschriftExtension || 'png').toLowerCase();
        const img = ext === 'png' ? await pdfDoc.embedPng(unterschriftBytes) : await pdfDoc.embedJpg(unterschriftBytes);
        const [fx1, , fx2, fy2] = layout.auszubildenderRect;
        const targetX1 = fx1, targetX2 = fx2;
        const targetY1 = fy2 + 1;
        const targetY2 = Math.min(fy2 + 30, 366);
        const targetW = targetX2 - targetX1;
        const targetH = Math.max(0, targetY2 - targetY1);
        if (targetH > 4 && img.width > 0 && img.height > 0) {
          const ratio = Math.min((targetW * 0.92) / img.width, (targetH * 0.92) / img.height);
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
      ueberzaehlig: Math.max(0, ((zeilen && zeilen.length) || schultage.length) - verwendet.length)
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
