/* ===================================================================
   ABTEILUNGSPLANER-EXPORT.JS

   Excel-Export der Plantafel: mehrblättrige Arbeitsmappe statt toter CSV.
   Die Kennzahlen stehen als ECHTE Excel-Formeln in den Zellen (VLOOKUP/
   SVERWEIS, COUNTIF(S), SUMIF, SUMPRODUCT, TODAY) – die Mappe rechnet
   also weiter, wenn jemand darin plant, filtert oder Datumsfelder ändert.
   Formeln werden immer englisch + mit Komma geschrieben; Excel zeigt sie
   automatisch lokalisiert (SVERWEIS, WENN, ZÄHLENWENN …).

   Zwei Teile:
     buildExportModel(input)        – reine Datenaufbereitung, Node-testbar
     buildWorkbook(ExcelJS, model)  – Blätter, Formeln, Formatierung

   ACHTUNG Datumswerte: ExcelJS rechnet Date → Serial über getTime() (UTC).
   Daten daher immer über Date.UTC(...) bauen, sonst kippt der Tag um eins
   (gleiche Falle wie im Fahrtgeld-Export).
   =================================================================== */
(function (root) {
  'use strict';

  const MS_TAG = 86400000;
  const OFFEN = '9999-12-31';           // leeres "Bis" = unbefristet
  const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  const ms = iso => Date.parse(iso + 'T00:00:00Z');
  const tage = (vonISO, bisISO) => Math.round((ms(bisISO) - ms(vonISO)) / MS_TAG) + 1;

  /* Überschneidungstage zweier Zeiträume (leeres Bis = offen). 0 = disjunkt. */
  function overlapTage(aVon, aBis, bVon, bBis) {
    if (!aVon || !bVon) return 0;
    const start = aVon > bVon ? aVon : bVon;
    const aE = aBis || OFFEN, bE = bBis || OFFEN;
    const ende = aE < bE ? aE : bE;
    return ende < start ? 0 : tage(start, ende);
  }

  function statusVon(z, heute) {
    if (!z.von) return 'Offen';
    if (z.bis && z.bis < heute) return 'Beendet';
    if (z.von > heute) return 'Zukünftig';
    return 'Aktuell';
  }

  /* ─────────────────────── MODELL ─────────────────────── */
  /* input = { ajStartYear, heute, exportiertVon, filter:[{label,wert}],
               personen:[{id,nachname,vorname,name,beruf,typ,gruppe,email,aktiv,
                          ausbildungVon,ausbildungBis}],
               zuweisungen:[{id,personId,abteilung,von,bis,verantwEmail,verantwName}],
               abteilungen:[{name,istPmm,aktiv,farbe,verantwortliche:[{email,name}]}] } */
  function buildExportModel(input) {
    const heute = input.heute;
    const ajStart = input.ajStartYear;
    const fenster = { von: `${ajStart}-09-01`, bis: `${ajStart + 1}-08-31` };
    const ajTage = tage(fenster.von, fenster.bis);

    // Ausbildungsjahr = Sep … Aug
    const monate = Array.from({ length: 12 }, (_, i) => {
      const m = (8 + i) % 12;
      const y = ajStart + (m >= 8 ? 0 : 1);
      const letzter = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const p = n => String(n).padStart(2, '0');
      return {
        label: `${MONATE_KURZ[m]} ${String(y).slice(2)}`,
        von: `${y}-${p(m + 1)}-01`,
        bis: `${y}-${p(m + 1)}-${p(letzter)}`,
      };
    });

    const personById = new Map(input.personen.map(p => [p.id, p]));

    const zuweisungen = input.zuweisungen
      .filter(z => personById.has(z.personId))
      .map(z => {
        const p = personById.get(z.personId);
        return {
          ...z,
          nachname: p.nachname, vorname: p.vorname, beruf: p.beruf || '',
          typ: p.typ, gruppe: p.gruppe,
          status: statusVon(z, heute),
          dauer: (z.von && z.bis) ? tage(z.von, z.bis) : null,
        };
      })
      .sort((a, b) => a.nachname.localeCompare(b.nachname, 'de')
        || a.vorname.localeCompare(b.vorname, 'de')
        || (a.von || '').localeCompare(b.von || ''));

    // Überschneidungen + Planungslücken je Person (Liste ist nach Von sortiert)
    const jePerson = new Map();
    zuweisungen.forEach(z => {
      if (!jePerson.has(z.personId)) jePerson.set(z.personId, []);
      jePerson.get(z.personId).push(z);
    });
    jePerson.forEach(list => {
      list.forEach((z, i) => {
        z.konflikte = list.filter(o => o !== z && overlapTage(z.von, z.bis, o.von, o.bis) > 0).length;
        const vorher = list[i - 1];
        // Ungeplante Tage strikt ZWISCHEN beiden Zeiträumen (Randtage abziehen).
        z.lueckeDavor = (vorher && vorher.bis && z.von && vorher.bis < z.von)
          ? tage(vorher.bis, z.von) - 2 : null;
      });
    });

    const personen = input.personen.map(p => {
      const list = jePerson.get(p.id) || [];
      const aktuell = list.find(z => z.status === 'Aktuell') || null;
      const naechste = list.find(z => z.status === 'Zukünftig') || null;
      const beendet = list.filter(z => z.status === 'Beendet').slice(-1)[0] || null;
      return {
        ...p,
        anzahlZuw: list.length,
        abteilungenAnzahl: new Set(list.map(z => z.abteilung).filter(Boolean)).size,
        tageGeplant: list.reduce((s, z) => s + (z.dauer || 0), 0),
        tageImAj: list.reduce((s, z) => s + overlapTage(z.von, z.bis, fenster.von, fenster.bis), 0),
        aktuelleAbteilung: aktuell ? aktuell.abteilung : '',
        laeuftBis: aktuell ? (aktuell.bis || '') : '',
        naechsteAbteilung: naechste ? naechste.abteilung : '',
        naechsterStart: naechste ? naechste.von : '',
        letzteAbteilung: beendet ? beendet.abteilung : '',
        // Belegung je AJ-Monat = Abteilung mit den meisten Tagen in dem Monat
        monate: monate.map(m => {
          let best = null, bestTage = 0;
          list.forEach(z => {
            const t = overlapTage(z.von, z.bis, m.von, m.bis);
            if (t > bestTage) { bestTage = t; best = z; }
          });
          return best ? { abteilung: best.abteilung, tage: bestTage } : null;
        }),
      };
    });

    // Abteilungen: Katalog ∪ tatsächlich verplante Namen (Altbestand ohne Katalogeintrag)
    const katalogNamen = new Set(input.abteilungen.map(a => a.name));
    const extra = [...new Set(zuweisungen.map(z => z.abteilung).filter(n => n && !katalogNamen.has(n)))]
      .map(name => ({ name, istPmm: null, aktiv: null, farbe: null, verantwortliche: [], nichtImKatalog: true }));
    const abteilungen = [...input.abteilungen, ...extra]
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(a => {
        const list = zuweisungen.filter(z => z.abteilung === a.name);
        const v = a.verantwortliche || [];
        return {
          ...a,
          verantwText: v.map(x => x.name || x.email).join(', '),
          anzahlVerantw: v.length,
          anzahlZuw: list.length,
          anzahlPersonen: new Set(list.map(z => z.personId)).size,
          tageGeplant: list.reduce((s, z) => s + (z.dauer || 0), 0),
        };
      });

    // Verantwortliche: Katalog-Zuordnungen ∪ tatsächlich eingetragene
    const vMap = new Map();
    const vGet = (email, name) => {
      const key = email.toLowerCase();
      if (!vMap.has(key)) vMap.set(key, { email, name: name || '', abteilungen: new Set(), personen: new Set(), anzahlZuw: 0, tageGeplant: 0 });
      const e = vMap.get(key);
      if (!e.name && name) e.name = name;
      return e;
    };
    input.abteilungen.forEach(a => (a.verantwortliche || []).forEach(v => {
      if (v.email) vGet(v.email, v.name).abteilungen.add(a.name);
    }));
    zuweisungen.forEach(z => {
      if (!z.verantwEmail) return;
      const e = vGet(z.verantwEmail, z.verantwName);
      if (z.abteilung) e.abteilungen.add(z.abteilung);
      e.personen.add(z.personId);
      e.anzahlZuw++;
      e.tageGeplant += z.dauer || 0;
    });
    const verantwortliche = [...vMap.values()]
      .map(e => ({ ...e, abteilungenText: [...e.abteilungen].sort((a, b) => a.localeCompare(b, 'de')).join(', '), anzahlPersonen: e.personen.size }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'de'));

    return {
      meta: {
        ajLabel: `AJ ${ajStart}/${String(ajStart + 1).slice(2)}`,
        ajVon: fenster.von, ajBis: fenster.bis, ajTage,
        heute,
        exportiertVon: input.exportiertVon || '',
        filter: input.filter || [],
      },
      monate, zuweisungen, personen, abteilungen, verantwortliche,
    };
  }

  /* ─────────────────────── ARBEITSMAPPE ─────────────────────── */
  const DARK = 'FF1A1A1A', GELB = 'FFFFC300', ZEILE_ALT = 'FFFAFAFA',
        RAHMEN = 'FFD4D4D8', GRAU_TEXT = 'FF6B7280';
  const FMT_DATUM = 'DD.MM.YYYY', FMT_ZAHL = '#,##0', FMT_PROZ = '0 %', FMT_KOMMA = '#,##0.0';

  const argb = hex => (hex ? 'FF' + String(hex).replace('#', '').toUpperCase() : null);
  const xlDate = iso => (iso ? new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))) : null);
  const solid = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });
  const dxfFill = color => ({ type: 'pattern', pattern: 'solid', bgColor: { argb: color } });

  function blatt(wb, name, spalten, opts) {
    const o = opts || {};
    const ws = wb.addWorksheet(name, {
      views: [{ state: 'frozen', xSplit: o.xSplit || 0, ySplit: o.ySplit != null ? o.ySplit : 1, showGridLines: false }],
      pageSetup: {
        orientation: o.orientation || 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        paperSize: 9, printTitlesRow: o.ySplit === 0 ? undefined : '1:1',
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });
    ws.columns = spalten.map(s => ({ width: s[1] }));
    if (spalten.length) {
      const kopf = ws.getRow(1);
      kopf.values = spalten.map(s => s[0]);
      kopf.height = 26;
      kopf.eachCell(c => {
        c.fill = solid(DARK);
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.alignment = { vertical: 'middle', wrapText: true };
        c.border = { bottom: { style: 'medium', color: { argb: GELB } } };
      });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spalten.length } };
    }
    return ws;
  }

  /* Zebra + dünne Rahmen über den Datenbereich. */
  function zebra(ws, vonZeile, bisZeile, spalten) {
    for (let r = vonZeile; r <= bisZeile; r++) {
      const row = ws.getRow(r);
      row.height = 17;
      for (let c = 1; c <= spalten; c++) {
        const cell = row.getCell(c);
        if (r % 2 === 0) cell.fill = solid(ZEILE_ALT);
        cell.border = { bottom: { style: 'hair', color: { argb: RAHMEN } } };
        if (!cell.alignment) cell.alignment = { vertical: 'middle' };
      }
    }
  }

  function buildWorkbook(ExcelJS, model) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitales Berichtsheft';
    wb.created = xlDate(model.meta.heute) || new Date(0);
    wb.calcProperties = { fullCalcOnLoad: true };   // Formeln beim Öffnen rechnen (keine gecachten Werte im File)

    const Z = model.zuweisungen, P = model.personen, A = model.abteilungen, V = model.verantwortliche;
    const zL = Z.length + 1, pL = P.length + 1, aL = A.length + 1, vL = V.length + 1;   // letzte Datenzeile
    // Bereichs-Helfer: berZ('P') → Zuweisungen!$P$2:$P$47 (bei 0 Datenzeilen bleibt Zeile 2 als leerer Bereich)
    const berZ = sp => `Zuweisungen!$${sp}$2:$${sp}$${Math.max(zL, 2)}`;
    const berP = sp => `Personen!$${sp}$2:$${sp}$${Math.max(pL, 2)}`;
    const berA = sp => `Abteilungen!$${sp}$2:$${sp}$${Math.max(aL, 2)}`;
    const berV = sp => `Verantwortliche!$${sp}$2:$${sp}$${Math.max(vL, 2)}`;
    const ABT_LISTE = `Abteilungen!$A$2:$M$${Math.max(aL, 2)}`;
    const VER_LISTE = `Verantwortliche!$A$2:$F$${Math.max(vL, 2)}`;

    /* ═══ 1 · ÜBERSICHT ═══ */
    const ueb = wb.addWorksheet('Übersicht', {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    ueb.columns = [{ width: 3 }, { width: 38 }, { width: 16 }, { width: 6 }, { width: 34 }, { width: 14 }, { width: 12 }];
    ueb.mergeCells('B2:G2');
    ueb.getCell('B2').value = 'Abteilungs-Planer · Auswertung';
    ueb.getCell('B2').font = { bold: true, size: 18, color: { argb: DARK } };
    ueb.getRow(2).height = 30;
    ueb.mergeCells('B3:G3');
    ueb.getCell('B3').value = `${model.meta.ajLabel}  ·  Zeitfenster ${model.meta.ajVon} – ${model.meta.ajBis}  ·  Stand ${model.meta.heute}`
      + (model.meta.exportiertVon ? `  ·  Export: ${model.meta.exportiertVon}` : '');
    ueb.getCell('B3').font = { size: 10, color: { argb: GRAU_TEXT } };
    ueb.mergeCells('B4:G4');
    ueb.getCell('B4').fill = solid(GELB);
    ueb.getRow(4).height = 6;

    let r = 6;
    const abschnitt = (titel) => {
      ueb.getCell(`B${r}`).value = titel;
      ueb.getCell(`B${r}`).font = { bold: true, size: 11, color: { argb: DARK } };
      ueb.getCell(`B${r}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
      ueb.getCell(`C${r}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
      r += 1;
    };
    const kpi = (label, formel, fmt) => {
      ueb.getCell(`B${r}`).value = label;
      ueb.getCell(`B${r}`).font = { size: 10 };
      const c = ueb.getCell(`C${r}`);
      c.value = typeof formel === 'string' ? { formula: formel } : formel;
      c.font = { bold: true, size: 11 };
      c.alignment = { horizontal: 'right' };
      c.numFmt = fmt || FMT_ZAHL;
      ueb.getRow(r).height = 16;
      r += 1;
    };

    abschnitt('Bestand');
    kpi('Personen im Export', `COUNTA(${berP('A')})`);
    kpi('… davon Azubis', `COUNTIF(${berP('E')},"Azubi")`);
    kpi('… davon DH-Studenten', `COUNTIF(${berP('E')},"DH-Student")`);
    kpi('Abteilungen (Katalog + verplant)', `COUNTA(${berA('A')})`);
    kpi('Verantwortliche', `COUNTA(${berV('A')})`);
    r += 1;

    abschnitt('Zuweisungen');
    kpi('Zuweisungen gesamt', `COUNTA(${berZ('A')})`);
    kpi('Aktuell laufend', `COUNTIF(${berZ('P')},"Aktuell")`);
    kpi('Zukünftig', `COUNTIF(${berZ('P')},"Zukünftig")`);
    kpi('Beendet', `COUNTIF(${berZ('P')},"Beendet")`);
    kpi('Ohne Enddatum (offen)', `COUNTBLANK(${berZ('M')})`);
    kpi('Mit Überschneidung', `COUNTIF(${berZ('S')},">0")`);
    r += 1;

    abschnitt('Planungsgrad');
    kpi('Personen ohne jede Zuweisung', `COUNTIF(${berP('J')},0)`);
    kpi('Personen aktuell ohne Abteilung', `COUNTBLANK(${berP('O')})`);
    kpi('Geplante Tage gesamt', `SUM(${berZ('N')})`);
    kpi('Ø Dauer je Zuweisung (Tage)', `IFERROR(ROUND(AVERAGE(${berZ('N')}),1),"–")`, FMT_KOMMA);
    kpi('Längste Zuweisung (Tage)', `IFERROR(MAX(${berZ('N')}),"–")`);
    kpi('Kürzeste Zuweisung (Tage)', `IFERROR(MIN(${berZ('N')}),"–")`);
    kpi('Tage im Ausbildungsjahr', model.meta.ajTage);
    const ajTageZelle = `Übersicht!$C$${r - 1}`;
    kpi('Ø Abdeckung des AJ je Person', `IFERROR(AVERAGE(${berP('N')}),"–")`, FMT_PROZ);

    // Top-5 Abteilungen nach geplanten Tagen (KGRÖSSTE + INDEX/VERGLEICH auf den
    // Sortierschlüssel in Abteilungen!N – der bricht Punktgleichstände auf, sonst
    // würde VERGLEICH bei gleicher Tagesumme zweimal denselben Namen liefern).
    let rr = 6;
    ueb.getCell(`E${rr}`).value = 'Top 5 Abteilungen (geplante Tage)';
    ueb.getCell(`E${rr}`).font = { bold: true, size: 11, color: { argb: DARK } };
    ueb.getCell(`E${rr}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
    ueb.getCell(`F${rr}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
    ueb.getCell(`G${rr}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
    rr += 1;
    ['Abteilung', 'Tage', 'Personen'].forEach((t, i) => {
      const c = ueb.getCell(rr, 5 + i);
      c.value = t; c.font = { bold: true, size: 9, color: { argb: GRAU_TEXT } };
    });
    rr += 1;
    for (let i = 1; i <= 5; i++) {
      const zeile = rr + i - 1;
      const treffer = `MATCH(LARGE(${berA('N')},${i}),${berA('N')},0)`;
      ueb.getCell(`E${zeile}`).value = { formula: `IFERROR(INDEX(${berA('A')},${treffer}),"–")` };
      ueb.getCell(`F${zeile}`).value = { formula: `IFERROR(INDEX(${berA('H')},${treffer}),"–")` };
      ueb.getCell(`F${zeile}`).numFmt = FMT_ZAHL;
      ueb.getCell(`G${zeile}`).value = { formula: `IFERROR(INDEX(${berA('G')},${treffer}),"–")` };
      ueb.getCell(`G${zeile}`).numFmt = FMT_ZAHL;
      ueb.getCell(`E${zeile}`).font = { size: 10 };
    }
    rr += 6;
    ueb.getCell(`E${rr}`).value = 'Status-Verteilung';
    ueb.getCell(`E${rr}`).font = { bold: true, size: 11, color: { argb: DARK } };
    ueb.getCell(`E${rr}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
    ueb.getCell(`F${rr}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
    ueb.getCell(`G${rr}`).border = { bottom: { style: 'thin', color: { argb: GELB } } };
    rr += 1;
    ['Aktuell', 'Zukünftig', 'Beendet', 'Offen'].forEach((st, i) => {
      const zeile = rr + i;
      ueb.getCell(`E${zeile}`).value = st;
      ueb.getCell(`E${zeile}`).font = { size: 10 };
      ueb.getCell(`F${zeile}`).value = { formula: `COUNTIF(${berZ('P')},"${st}")` };
      ueb.getCell(`F${zeile}`).numFmt = FMT_ZAHL;
      ueb.getCell(`G${zeile}`).value = { formula: `IFERROR(F${zeile}/COUNTA(${berZ('A')}),"–")` };
      ueb.getCell(`G${zeile}`).numFmt = FMT_PROZ;
    });

    /* ═══ 2 · ZUWEISUNGEN (die Datenbank-Tabelle) ═══ */
    const zws = blatt(wb, 'Zuweisungen', [
      ['ZuwID', 14], ['PersonID', 14], ['Nachname', 18], ['Vorname', 16], ['Beruf', 26],
      ['Typ', 12], ['Gruppe', 15], ['Abteilung', 30], ['PMM', 7], ['Verantw. E-Mail', 30],
      ['Verantwortlich', 22], ['Von', 11], ['Bis', 11], ['Dauer (Tage)', 11], ['Wochen', 9],
      ['Status', 12], ['Fortschritt', 11], ['Resttage', 10], ['Überschneidungen', 13], ['Lücke davor (Tage)', 13],
    ], { xSplit: 4 });

    Z.forEach((z, i) => {
      const n = i + 2;
      const row = zws.getRow(n);
      row.getCell(1).value = z.id;
      row.getCell(2).value = z.personId;
      row.getCell(3).value = z.nachname;
      row.getCell(4).value = z.vorname;
      row.getCell(5).value = z.beruf;
      row.getCell(6).value = z.typ;
      row.getCell(7).value = z.gruppe;
      row.getCell(8).value = z.abteilung;
      // SVERWEIS auf den Abteilungs-Katalog (Spalte 2 = PMM ja/nein)
      row.getCell(9).value = { formula: `IF($H${n}="","",IFERROR(VLOOKUP($H${n},${ABT_LISTE},2,FALSE),"nicht im Katalog"))` };
      row.getCell(10).value = z.verantwEmail;
      // SVERWEIS auf das Verantwortlichen-Blatt (Spalte 2 = Anzeigename)
      row.getCell(11).value = { formula: `IF($J${n}="","",IFERROR(VLOOKUP($J${n},${VER_LISTE},2,FALSE),$J${n}))` };
      row.getCell(12).value = xlDate(z.von);
      row.getCell(13).value = xlDate(z.bis);
      row.getCell(14).value = { formula: `IF(OR($L${n}="",$M${n}=""),"",$M${n}-$L${n}+1)` };
      row.getCell(15).value = { formula: `IF($N${n}="","",ROUND($N${n}/7,1))` };
      row.getCell(16).value = { formula: `IF($L${n}="","Offen",IF(AND($M${n}<>"",$M${n}<TODAY()),"Beendet",IF($L${n}>TODAY(),"Zukünftig","Aktuell")))` };
      // Fortschritt 0–100 %, per MEDIAN geklammert (kein WENN-Verschachteln nötig)
      row.getCell(17).value = { formula: `IF($N${n}="","",MEDIAN(0,(TODAY()-$L${n}+1)/$N${n},1))` };
      row.getCell(18).value = { formula: `IF($M${n}="","",MAX(0,$M${n}-TODAY()))` };
      // Überschneidungen derselben Person: SUMMENPRODUKT über alle Zeilen, sich selbst abziehen
      row.getCell(19).value = { formula: Z.length > 1
        ? `SUMPRODUCT((${berZ('B')}=$B${n})*(${berZ('L')}<=IF($M${n}="",DATE(9999,12,31),$M${n}))*(IF(${berZ('M')}="",DATE(9999,12,31),${berZ('M')})>=$L${n}))-1`
        : '0' };
      row.getCell(20).value = z.lueckeDavor == null ? '' : z.lueckeDavor;
    });
    if (Z.length) {
      zebra(zws, 2, zL, 20);
      [12, 13].forEach(c => { zws.getColumn(c).numFmt = FMT_DATUM; });
      [14, 18, 19, 20].forEach(c => { zws.getColumn(c).numFmt = FMT_ZAHL; });
      zws.getColumn(15).numFmt = FMT_KOMMA;
      zws.getColumn(17).numFmt = FMT_PROZ;
      [9, 14, 15, 16, 17, 18, 19, 20].forEach(c => { zws.getColumn(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
      // Abteilung + Typ als Dropdown → die Mappe taugt auch zum Weiterplanen
      for (let n = 2; n <= zL; n++) {
        zws.getCell(`H${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`=${berA('A')}`] };
        zws.getCell(`F${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Azubi,DH-Student"'] };
      }
      zws.addConditionalFormatting({
        ref: `P2:P${zL}`,
        rules: [
          { type: 'containsText', operator: 'containsText', text: 'Aktuell', priority: 1, style: { font: { bold: true, color: { argb: 'FF166534' } }, fill: dxfFill('FFDCFCE7') } },
          { type: 'containsText', operator: 'containsText', text: 'Zukünftig', priority: 2, style: { font: { color: { argb: 'FF1E40AF' } }, fill: dxfFill('FFDBEAFE') } },
          { type: 'containsText', operator: 'containsText', text: 'Beendet', priority: 3, style: { font: { color: { argb: 'FF6B7280' } } } },
          { type: 'containsText', operator: 'containsText', text: 'Offen', priority: 4, style: { font: { bold: true, color: { argb: 'FF92400E' } }, fill: dxfFill('FFFEF3C7') } },
        ],
      });
      zws.addConditionalFormatting({
        ref: `S2:S${zL}`,
        rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 1, style: { font: { bold: true, color: { argb: 'FF991B1B' } }, fill: dxfFill('FFFEE2E2') } }],
      });
      zws.addConditionalFormatting({
        ref: `T2:T${zL}`,
        rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['30'], priority: 1, style: { font: { color: { argb: 'FF92400E' } }, fill: dxfFill('FFFEF3C7') } }],
      });
    }

    /* ═══ 3 · PERSONEN ═══ */
    const pws = blatt(wb, 'Personen', [
      ['PersonID', 14], ['Nachname', 18], ['Vorname', 16], ['Beruf', 26], ['Typ', 12],
      ['E-Mail', 28], ['Aktiv', 8], ['Ausb. von', 11], ['Ausb. bis', 11], ['Zuweisungen', 11],
      ['Abteilungen', 11], ['Tage geplant', 11], ['Tage im AJ', 10], ['Abdeckung AJ', 11],
      ['Aktuelle Abteilung', 28], ['läuft bis', 11], ['Nächste Abteilung', 28], ['ab', 11],
      ['Letzte Abteilung', 28], ['Planungsstatus', 18],
    ], { xSplit: 3 });

    P.forEach((p, i) => {
      const n = i + 2;
      const row = pws.getRow(n);
      row.getCell(1).value = p.id;
      row.getCell(2).value = p.nachname;
      row.getCell(3).value = p.vorname;
      row.getCell(4).value = p.beruf || '';
      row.getCell(5).value = p.typ;
      row.getCell(6).value = p.email || '';
      row.getCell(7).value = p.aktiv ? 'ja' : 'nein';
      row.getCell(8).value = xlDate(p.ausbildungVon);
      row.getCell(9).value = xlDate(p.ausbildungBis);
      // ZÄHLENWENN / SUMMEWENN direkt auf die Zuweisungs-Tabelle
      row.getCell(10).value = { formula: `COUNTIF(${berZ('B')},$A${n})` };
      row.getCell(11).value = p.abteilungenAnzahl;
      row.getCell(12).value = { formula: `SUMIF(${berZ('B')},$A${n},${berZ('N')})` };
      row.getCell(13).value = p.tageImAj;
      row.getCell(14).value = { formula: `IF(${ajTageZelle}=0,"",$M${n}/${ajTageZelle})` };
      row.getCell(15).value = p.aktuelleAbteilung;
      row.getCell(16).value = xlDate(p.laeuftBis);
      row.getCell(17).value = p.naechsteAbteilung;
      row.getCell(18).value = xlDate(p.naechsterStart);
      row.getCell(19).value = p.letzteAbteilung;
      row.getCell(20).value = { formula: `IF($J${n}=0,"ungeplant",IF($O${n}<>"","läuft",IF($Q${n}<>"","Lücke bis Start","nur Vergangenheit")))` };
    });
    if (P.length) {
      zebra(pws, 2, pL, 20);
      [8, 9, 16, 18].forEach(c => { pws.getColumn(c).numFmt = FMT_DATUM; });
      [10, 11, 12, 13].forEach(c => { pws.getColumn(c).numFmt = FMT_ZAHL; });
      pws.getColumn(14).numFmt = FMT_PROZ;
      [7, 10, 11, 12, 13, 14].forEach(c => { pws.getColumn(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
      pws.addConditionalFormatting({
        ref: `J2:J${pL}`,
        rules: [{ type: 'cellIs', operator: 'equal', formulae: ['0'], priority: 1, style: { font: { bold: true, color: { argb: 'FF991B1B' } }, fill: dxfFill('FFFEE2E2') } }],
      });
      pws.addConditionalFormatting({
        ref: `T2:T${pL}`,
        rules: [
          { type: 'containsText', operator: 'containsText', text: 'ungeplant', priority: 1, style: { font: { bold: true, color: { argb: 'FF991B1B' } }, fill: dxfFill('FFFEE2E2') } },
          { type: 'containsText', operator: 'containsText', text: 'läuft', priority: 2, style: { font: { color: { argb: 'FF166534' } }, fill: dxfFill('FFDCFCE7') } },
        ],
      });
      // Ganze Zeile leicht tönen, wenn die Person aktuell keine Abteilung hat
      pws.addConditionalFormatting({
        ref: `A2:T${pL}`,
        rules: [{ type: 'expression', formulae: [`$O2=""`], priority: 3, style: { fill: dxfFill('FFFFF8DC') } }],
      });
    }

    /* ═══ 4 · ABTEILUNGEN (Nachschlage-Tabelle für die SVERWEISe) ═══ */
    const aws = blatt(wb, 'Abteilungen', [
      ['Abteilung', 32], ['PMM', 8], ['Aktiv', 8], ['Verantwortliche', 40], ['Anz. Verantw.', 11],
      ['Zuweisungen', 11], ['Personen', 10], ['Tage geplant', 11], ['Ø Tage', 9],
      ['Aktuell', 9], ['Zukünftig', 10], ['Beendet', 9], ['Farbe', 8], ['Sortierschlüssel', 12],
    ], { xSplit: 1 });
    aws.getColumn(14).hidden = true;      // nur Tie-Break für die Top-5 auf der Übersicht

    A.forEach((a, i) => {
      const n = i + 2;
      const row = aws.getRow(n);
      row.getCell(1).value = a.name;
      row.getCell(2).value = a.istPmm == null ? '–' : (a.istPmm ? 'ja' : 'nein');
      row.getCell(3).value = a.aktiv == null ? '–' : (a.aktiv ? 'ja' : 'nein');
      row.getCell(4).value = a.verantwText;
      row.getCell(5).value = a.anzahlVerantw;
      row.getCell(6).value = { formula: `COUNTIF(${berZ('H')},$A${n})` };
      row.getCell(7).value = a.anzahlPersonen;
      row.getCell(8).value = { formula: `SUMIF(${berZ('H')},$A${n},${berZ('N')})` };
      row.getCell(9).value = { formula: `IFERROR(ROUND($H${n}/$F${n},1),"–")` };
      row.getCell(10).value = { formula: `COUNTIFS(${berZ('H')},$A${n},${berZ('P')},"Aktuell")` };
      row.getCell(11).value = { formula: `COUNTIFS(${berZ('H')},$A${n},${berZ('P')},"Zukünftig")` };
      row.getCell(12).value = { formula: `COUNTIFS(${berZ('H')},$A${n},${berZ('P')},"Beendet")` };
      const farbe = argb(a.farbe);
      if (farbe) row.getCell(13).fill = solid(farbe);
      row.getCell(14).value = { formula: `$H${n}+ROW()/1000000` };
    });
    if (A.length) {
      zebra(aws, 2, aL, 12);
      [5, 6, 7, 8].forEach(c => { aws.getColumn(c).numFmt = FMT_ZAHL; });
      aws.getColumn(9).numFmt = FMT_KOMMA;
      [2, 3, 5, 6, 7, 8, 9, 10, 11, 12].forEach(c => { aws.getColumn(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
      aws.addConditionalFormatting({
        ref: `F2:F${aL}`,
        rules: [{ type: 'cellIs', operator: 'equal', formulae: ['0'], priority: 1, style: { font: { color: { argb: 'FF6B7280' } } } }],
      });
    }

    /* ═══ 5 · BELEGUNG JE MONAT (Gantt als Raster) ═══ */
    const bws = blatt(wb, 'Belegung', [
      ['Nachname', 18], ['Vorname', 16], ['Beruf', 24], ['Typ', 12],
      ...model.monate.map(m => [m.label, 13]),
      ['Monate belegt', 11],
    ], { xSplit: 2 });
    const farbeVon = new Map(A.map(a => [a.name, argb(a.farbe)]));

    P.forEach((p, i) => {
      const n = i + 2;
      const row = bws.getRow(n);
      row.getCell(1).value = p.nachname;
      row.getCell(2).value = p.vorname;
      row.getCell(3).value = p.beruf || '';
      row.getCell(4).value = p.typ;
      p.monate.forEach((m, mi) => {
        const cell = row.getCell(5 + mi);
        if (!m) return;
        cell.value = m.abteilung;
        const f = farbeVon.get(m.abteilung);
        if (f) {
          cell.fill = solid(f);
          cell.font = { size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
        } else {
          cell.font = { size: 8.5 };
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      row.getCell(17).value = { formula: `COUNTA(E${n}:P${n})` };
      row.getCell(17).numFmt = FMT_ZAHL;
      row.getCell(17).alignment = { horizontal: 'center', vertical: 'middle' };
      row.height = 24;
    });
    if (P.length) {
      for (let n = 2; n <= pL; n++) {
        for (let c = 1; c <= 17; c++) {
          bws.getRow(n).getCell(c).border = { bottom: { style: 'hair', color: { argb: RAHMEN } }, right: { style: 'hair', color: { argb: RAHMEN } } };
        }
      }
    }

    /* ═══ 6 · VERANTWORTLICHE (Nachschlage-Tabelle) ═══ */
    const vws = blatt(wb, 'Verantwortliche', [
      ['E-Mail', 32], ['Name', 24], ['Abteilungen', 46], ['Zuweisungen', 11], ['Personen', 10], ['Tage geplant', 12],
    ], { xSplit: 1 });
    V.forEach((v, i) => {
      const n = i + 2;
      const row = vws.getRow(n);
      row.getCell(1).value = v.email;
      row.getCell(2).value = v.name || v.email;
      row.getCell(3).value = v.abteilungenText;
      row.getCell(4).value = { formula: `COUNTIF(${berZ('J')},$A${n})` };
      row.getCell(5).value = v.anzahlPersonen;
      row.getCell(6).value = { formula: `SUMIF(${berZ('J')},$A${n},${berZ('N')})` };
    });
    if (V.length) {
      zebra(vws, 2, vL, 6);
      [4, 5, 6].forEach(c => { vws.getColumn(c).numFmt = FMT_ZAHL; vws.getColumn(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
    }

    /* ═══ 7 · INFO ═══ */
    const iws = wb.addWorksheet('Info', { views: [{ showGridLines: false }] });
    iws.columns = [{ width: 3 }, { width: 26 }, { width: 78 }];
    iws.getCell('B2').value = 'Über diese Auswertung';
    iws.getCell('B2').font = { bold: true, size: 16, color: { argb: DARK } };
    iws.mergeCells('B3:C3');
    iws.getCell('B3').fill = solid(GELB);
    iws.getRow(3).height = 5;
    let ri = 5;
    const zeile = (label, text, fett) => {
      iws.getCell(`B${ri}`).value = label;
      iws.getCell(`B${ri}`).font = { bold: true, size: 10, color: { argb: fett ? DARK : GRAU_TEXT } };
      iws.getCell(`B${ri}`).alignment = { vertical: 'top' };
      iws.getCell(`C${ri}`).value = text;
      iws.getCell(`C${ri}`).font = { size: 10 };
      iws.getCell(`C${ri}`).alignment = { vertical: 'top', wrapText: true };
      ri += 1;
    };
    zeile('Quelle', 'Digitales Berichtsheft · Abteilungs-Planer', true);
    zeile('Ausbildungsjahr', `${model.meta.ajLabel} (${model.meta.ajVon} – ${model.meta.ajBis}, ${model.meta.ajTage} Tage)`);
    zeile('Stand', model.meta.heute);
    if (model.meta.exportiertVon) zeile('Exportiert von', model.meta.exportiertVon);
    zeile('Umfang', `${P.length} Personen · ${Z.length} Zuweisungen · ${A.length} Abteilungen · ${V.length} Verantwortliche`);
    zeile('Aktive Filter', model.meta.filter.length
      ? model.meta.filter.map(f => `${f.label}: ${f.wert}`).join('  ·  ')
      : 'keine – vollständiger Bestand');
    ri += 1;
    zeile('Rechnet mit', 'Status, Dauer, Fortschritt, Resttage, Überschneidungen, Kennzahlen und die Nachschlagespalten sind Formeln (SVERWEIS, ZÄHLENWENN(S), SUMMEWENN, SUMMENPRODUKT, HEUTE). Datum ändern → alles zieht nach.', true);
    zeile('Nachschlagen', 'Blatt "Abteilungen" und "Verantwortliche" sind die Nachschlage-Tabellen; "Zuweisungen" holt PMM-Kennzeichen und Anzeigenamen per SVERWEIS daraus. Benannte Bereiche: Abt_Liste, Verantw_Liste, Zuw_Tabelle, AJ_Tage.');
    zeile('Weiterplanen', 'Auf "Zuweisungen" sind Abteilung und Typ Dropdowns (Datenüberprüfung). Kopierte Zeilen rechnen mit, wenn die Formeln der Nachbarzeile mitgezogen werden.');
    zeile('Rückweg', 'Änderungen in dieser Datei fließen NICHT zurück in die App – die Mappe ist eine Momentaufnahme zum Auswerten, Drucken und Verteilen.');
    ri += 1;

    const spaltenLexikon = [
      ['Zuweisungen · Dauer (Tage)', 'Bis − Von + 1, inklusive beider Randtage. Leer, solange kein Enddatum gesetzt ist.'],
      ['Zuweisungen · Fortschritt', 'Anteil der bereits vergangenen Tage, per MEDIAN auf 0–100 % geklammert.'],
      ['Zuweisungen · Überschneidungen', 'Andere Zuweisungen DERSELBEN Person, die sich zeitlich überlappen (0 = sauber). Rot markiert.'],
      ['Zuweisungen · Lücke davor', 'Ungeplante Tage zwischen dem Ende der vorherigen und dem Start dieser Zuweisung. Ab 30 Tagen gelb.'],
      ['Personen · Tage im AJ', 'Geplante Tage, auf das Ausbildungsjahr-Fenster zugeschnitten (Grundlage für "Abdeckung AJ").'],
      ['Personen · Planungsstatus', 'ungeplant = gar keine Zuweisung · läuft = aktuell in einer Abteilung · Lücke bis Start · nur Vergangenheit.'],
      ['Abteilungen · Ø Tage', 'Tage geplant / Zuweisungen – die typische Verweildauer in dieser Abteilung.'],
      ['Belegung', 'Ein Feld je Monat: die Abteilung mit den meisten Tagen in dem Monat. Farben wie in der Plantafel.'],
    ];
    iws.getCell(`B${ri}`).value = 'Spalten, die nicht selbsterklärend sind';
    iws.getCell(`B${ri}`).font = { bold: true, size: 11, color: { argb: DARK } };
    ri += 1;
    spaltenLexikon.forEach(([k, t]) => zeile(k, t));

    /* Benannte Bereiche – damit eigene Formeln im Blatt lesbar bleiben. */
    try {
      wb.definedNames.add(`Abteilungen!$A$2:$M$${Math.max(aL, 2)}`, 'Abt_Liste');
      wb.definedNames.add(`Verantwortliche!$A$2:$F$${Math.max(vL, 2)}`, 'Verantw_Liste');
      wb.definedNames.add(`Zuweisungen!$A$1:$T$${Math.max(zL, 2)}`, 'Zuw_Tabelle');
      wb.definedNames.add(ajTageZelle, 'AJ_Tage');
    } catch (e) { /* benannte Bereiche sind Komfort, kein Muss */ }

    return wb;
  }

  const api = { buildExportModel, buildWorkbook, _intern: { overlapTage, statusVon, tage } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbtPlanerExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
