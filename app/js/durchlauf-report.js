'use strict';
/* ===================================================================
   DURCHLAUF-REPORT.JS — Sammel-PDF „Abteilungsdurchlauf-Report"
   Spec: docs/superpowers/specs/2026-09-09-durchlauf-report-design.md

   Baut ein vollstaendiges, gebrandetes HTML-Dokument fuer ein EIGENES
   Druckfenster (Popup) und laesst den Browser daraus „Als PDF speichern"
   machen — dasselbe Verfahren wie der Berichtsheft-Export, keine
   Server-PDF.

   ZWEI RANDBEDINGUNGEN, DIE MAN LEICHT KAPUTT MACHT:

   1. Das Druckfenster laedt KEIN App-CSS. Alle Farben, Fonts und Masse
      stehen hart im Template — keine CSS-Variablen der App (die waeren
      im Popup schlicht undefiniert und der Report faerbte sich grau in
      grau bzw. faellt auf Systemschrift zurueck).

   2. Das Modul muss in Node ladbar bleiben (durchlauf-report.test.js).
      Deshalb wird auf `window`, `document`, `DB`, `Toast` und `Modal`
      ausschliesslich INNERHALB von erstellen() zugegriffen, und esc(),
      fmtDe(), displayName() und initialen() sind lokale Kopien
      (planer-print.js / api.js) statt App-Globals.

   Browser: window.DurchlaufReport · Node/Tests: module.exports
   =================================================================== */
const DurchlaufReport = (() => {

  // Grau-Logo fuer weissen Druckgrund; Fonts wie in der App (CD).
  // Kopie aus berichtsheft-export.js — dieses Modul ist auf der
  // Planer-Seite nicht geladen, und ein Import nur fuer drei Pfade waere
  // eine Abhaengigkeit zwischen zwei sonst unabhaengigen Druckwegen.
  const LOGO_REL = '../Corporate Design/Digital Logo_png/Standard Logo/600 px_wide_Std_Grey.png';
  const FONT_REL = {
    franklinBold:  '../Corporate Design/Fonts/librefranklin-bold.ttf',
    franklinLight: '../Corporate Design/Fonts/librefranklin-light.ttf',
    openSans:      '../Corporate Design/Fonts/OpenSans-Variable.ttf',
  };

  const MAX_TEXT = 200;         // Individuelle Beurteilung / Gesamteindruck
  const MAX_EMPFEHLUNG = 100;   // „Empfehlung:"
  const OFFEN = '9999-12-31';   // Ersatzdatum fuer ein leeres Bis

  /* ── Kleine reine Helfer (lokale Kopien, keine App-Globals) ─────── */

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

  // Entra liefert „Nachname, Vorname" — hier zu „Vorname Nachname" drehen
  // (idempotent). Kopie aus api.js, weil das Popup keine App-Globals hat.
  function displayName(raw) {
    const n = String(raw ?? '').trim();
    if (!n.includes(',')) return n;
    const [last, first] = n.split(',');
    return `${first.trim()} ${last.trim()}`.trim();
  }

  // Initialen aus dem Anzeigenamen, z. B. „FK" (wie getInitials in api.js).
  function initialen(name) {
    const parts = displayName(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /* ── Reine Fachlogik (getestet in durchlauf-report.test.js) ─────── */

  // Zaehlt die Station fuer den Zeitraum? Gleiche Regel wie barGeom in
  // planer-print.js: reine Ueberlappung, ein leeres Bis gilt als offen und
  // laeuft damit immer in den Zeitraum hinein.
  function ueberlappt(station, range) {
    if (!station || !range) return false;
    const sVon = String(station.von ?? '').slice(0, 10);
    const sBis = station.bis ? String(station.bis).slice(0, 10) : OFFEN;
    if (!sVon) return false;
    return !(sBis < range.von || sVon > range.bis);
  }

  // Text auf @max Zeichen kuerzen: Whitespace zusammenziehen, an der
  // Wortgrenze schneiden, „…" anhaengen. Ein harter Schnitt mitten im Wort
  // sieht auf Papier wie ein Datenfehler aus.
  function kuerzen(text, max = MAX_TEXT) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const roh = t.slice(0, max);
    const luecke = roh.lastIndexOf(' ');
    // Ohne Leerzeichen im Fenster (ein sehr langes Wort) bleibt der harte
    // Schnitt die einzige Option.
    const kern = luecke > max * 0.5 ? roh.slice(0, luecke) : roh;
    return `${kern.replace(/[\s,;:.]+$/, '')}…`;
  }

  function fmtNote(n) {
    if (n == null || Number.isNaN(Number(n))) return '–';
    return Number(n).toFixed(1).replace('.', ',');
  }
  function fmtSchnitt(n) {
    if (n == null || Number.isNaN(Number(n))) return '–';
    return Number(n).toFixed(2).replace('.', ',');
  }

  const istFertig = st => !!(st && st.beurteilung && st.beurteilung.status === 'abgeschlossen');
  // Beendet = Bis liegt VOR dem Stand. Ein leeres Bis ist nie beendet.
  const istBeendet = (st, stand) => !!(st && st.bis && String(st.bis).slice(0, 10) < String(stand).slice(0, 10));

  // Kennzahlenzeile je Person. Der Notendurchschnitt zaehlt bewusst nur
  // abgeschlossene GROSSE Beurteilungen mit Note: Kurzfeedbacks haben keine
  // Note, Entwuerfe sind noch keine Aussage, und eine fehlende Note (Note
  // NULL trotz Abschluss, Altbestand) darf den Schnitt nicht verzerren.
  function berechneKennzahlen(stationen, stand) {
    const liste = Array.isArray(stationen) ? stationen : [];
    const noten = [];
    let beurteilt = 0, offen = 0;
    for (const st of liste) {
      const fertig = istFertig(st);
      if (fertig) beurteilt++;
      if (fertig && st.beurteilung.typ === 'gross' && st.beurteilung.note != null) {
        noten.push(Number(st.beurteilung.note));
      }
      if (!fertig && istBeendet(st, stand)) offen++;
    }
    return {
      anzahl: liste.length,
      beurteilt,
      notenDurchschnitt: noten.length ? noten.reduce((a, b) => a + b, 0) / noten.length : null,
      offen,
    };
  }

  // Inhalt der Spalte „Beurteilung". Kern der fachlichen Entscheidung:
  // NUR eine abgeschlossene Beurteilung zeigt Inhalt. Ein Entwurf ist eine
  // private Notiz des Verantwortlichen — er steht als „offen (Entwurf)" da,
  // ohne eine Zeile seines Textes.
  function beurteilungZelle(station, stand) {
    const b = station && station.beurteilung;
    if (!b) {
      return istBeendet(station, stand)
        ? '<span class="dr-offen">offen</span>'
        : '<span class="dr-leer">–</span>';
    }
    if (b.status !== 'abgeschlossen') {
      return '<span class="dr-offen">offen (Entwurf)</span>';
    }
    if (b.typ === 'kurz') {
      const teile = [];
      const eindruck = kuerzen(b.kurzfeedbackEindruck, MAX_TEXT);
      if (eindruck) teile.push(`<div class="dr-txt">${esc(eindruck)}</div>`);
      const empf = kuerzen(b.kurzfeedbackEmpfehlung, MAX_EMPFEHLUNG);
      if (empf) teile.push(`<div class="dr-txt"><b>Empfehlung:</b> ${esc(empf)}</div>`);
      // Abgeschlossen, aber ohne einen Satz Text — trotzdem als erledigt
      // kennzeichnen, sonst sieht die Zelle wie eine offene aus.
      if (!teile.length) teile.push('<div class="dr-txt dr-leer">abgeschlossen, ohne Text</div>');
      return teile.join('');
    }
    // Typ gross: Note ist die Hauptaussage. Punkte nur, wenn beides da ist.
    const punkte = (b.note != null && b.gesamtPunkte != null)
      ? ` <span class="dr-pkt">(${esc(b.gesamtPunkte)}/100)</span>` : '';
    const teile = [`<div class="dr-note">Note ${fmtNote(b.note)}${punkte}</div>`];
    const txt = kuerzen(b.individuelleBeurteilung, MAX_TEXT);
    if (txt) teile.push(`<div class="dr-txt">${esc(txt)}</div>`);
    return teile.join('');
  }

  /* ── Zeitraum-Pruefung (Muster planer-print.js: den ECHTEN Grund
     nennen, nicht pauschal „Ende vor Beginn") ─────────────────────── */

  const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

  function zeitraumGrund(ctx) {
    const von = ctx.von, bis = ctx.bis;
    if (!von && !bis) return 'Zeitraum fehlt (Von und Bis sind leer)';
    if (!von) return 'Zeitraum unvollständig (Von fehlt)';
    if (!bis) return 'Zeitraum unvollständig (Bis fehlt)';
    if (!ISO_TAG.test(String(von)) || !ISO_TAG.test(String(bis))) return 'Zeitraum ungültig (Datum nicht lesbar)';
    if (String(von) > String(bis)) return 'Zeitraum ungültig (Ende vor Beginn)';
    return null;
  }

  /* ── Print-Template ────────────────────────────────────────────────
     Vorlage: berichtsheft-export.js. Farben und Fonts hart, CD-Fussleiste
     als echtes <tfoot> (Chrome wiederholt es am unteren Rand JEDER
     Druckseite und reserviert dort Platz — anders als position:fixed).  */

  function reportCss(fonts) {
    const ff = (fam, url, weight, fmt) =>
      `@font-face{font-family:'${fam}';src:url('${url}') format('${fmt}');font-weight:${weight};font-style:normal;font-display:swap;}`;
    const f = fonts || {};
    return `
  ${ff('Libre Franklin', f.franklinBold || '', 700, 'truetype')}
  ${ff('Libre Franklin', f.franklinLight || '', 300, 'truetype')}
  ${ff('Open Sans', f.openSans || '', '300 800', 'truetype-variations')}
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background:#5b5b5b; font-family:'Open Sans','Segoe UI',Arial,sans-serif; color:#1A1A1A; font-size:10pt; line-height:1.45; }
  .toolbar { position:sticky; top:0; z-index:10; background:#1A1A1A; color:#fff; padding:10px 16px; display:flex; gap:12px; align-items:center; font-size:10pt; }
  .toolbar button { background:#FFC300; color:#1A1A1A; border:0; border-radius:8px; padding:8px 16px; font:inherit; font-weight:700; cursor:pointer; }
  .toolbar span { opacity:.85; }
  .sheet { width:210mm; min-height:297mm; background:#fff; margin:14px auto; padding:0 14mm 14mm; box-shadow:0 6px 24px rgba(0,0,0,.35); }
  .kopf { display:flex; flex-direction:column; align-items:flex-start; padding-top:0; }
  .logo { width:45mm; height:auto; display:block; }
  .doktitel { font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-weight:700; font-size:16pt; margin-top:4mm; }
  .dokmeta { font-size:8.5pt; color:#53565A; margin-top:1.5mm; }
  /* Stammdaten: Avatar links, Daten rechts. */
  .dr-stamm { display:flex; gap:6mm; align-items:flex-start; margin:6mm 0 4mm; }
  .dr-avatar { width:24mm; height:24mm; border-radius:50%; overflow:hidden; flex:0 0 auto;
    background:#E6E7E8; color:#53565A; display:flex; align-items:center; justify-content:center;
    font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-weight:700; font-size:17pt; letter-spacing:.5pt; }
  .dr-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
  .dr-person { flex:1 1 auto; }
  .dr-name { font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-weight:700; font-size:15pt; }
  .dr-meta { font-size:9pt; color:#53565A; margin-top:1mm; }
  .dr-meta b { color:#1A1A1A; font-weight:700; }
  /* Kennzahlen: vier Kaesten in einer Zeile. Nur die DIREKTEN Kinder sind
     Kaesten — mit dem blanken Nachfahren-Selektor .dr-kpi div bekamen auch
     .k und .v Rahmen und Gelbkante, jede Kachel sah dadurch nach drei
     gestapelten Kaesten aus. */
  .dr-kpi { display:flex; gap:3mm; margin:0 0 4mm; }
  .dr-kpi > div { flex:1 1 0; border:0.6pt solid #C8C9CA; border-top:1.6mm solid #FFC300;
    padding:2mm 3mm; }
  .dr-kpi .k { font-size:7pt; text-transform:uppercase; letter-spacing:.4pt; color:#6b6b6b; }
  .dr-kpi .v { font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-weight:700; font-size:14pt; }
  table.dr-tab { border-collapse:collapse; width:100%; }
  table.dr-tab thead th { border:0.6pt solid #999; padding:1.8mm 2.5mm; text-align:left;
    background:#efefef; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:.3pt; }
  table.dr-tab td { border:0.6pt solid #999; padding:1.8mm 2.5mm; vertical-align:top; font-size:9pt; }
  .dr-c-abt { width:26%; font-weight:700; }
  .dr-c-zeit { width:20%; }
  .dr-c-verantw { width:22%; }
  .dr-note { font-weight:700; }
  .dr-pkt { font-weight:400; color:#53565A; }
  .dr-txt { margin-top:0.8mm; }
  .dr-offen { color:#53565A; font-style:italic; }
  .dr-leer { color:#8a8a8a; }
  .dr-keine { color:#8a8a8a; font-style:italic; font-size:9pt; margin:3mm 0; }
  .dr-hinweis { background:#fff; margin:14px auto; padding:14mm; width:210mm; }
  .dr-hinweis h2 { font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-size:13pt; margin:0 0 2mm; }
  .pm-doc { width:100%; }
  .pm-footer { display:none; }
  @media print {
    @page { size: A4; margin: 0; }
    body { background:#fff; }
    .toolbar { display:none; }
    .sheet { width:auto; min-height:0; margin:0; padding:0 13mm; box-shadow:none; break-before:page; }
    .sheet--first { break-before:auto; }
    .dr-hinweis { width:auto; margin:0; padding:0 13mm; }
    .kopf, .dr-stamm, .dr-kpi { break-inside:avoid; }
    /* Eine Stationszeile nicht ueber zwei Seiten reissen; der Kopf wiederholt
       sich von selbst, weil es ein echtes <thead> ist. */
    table.dr-tab tbody tr { break-inside:avoid; }
    table.dr-tab thead { display:table-header-group; }
    .pm-doc { width:100%; border-collapse:collapse; }
    .pm-foot-cell, .pm-body-cell { padding:0; }
    .pm-footer { display:table-footer-group; }
    .pm-footer__yellow { height:1.6mm; background:#FFC300; }
    .pm-footer__grey   { height:2.6mm; margin-top:0.8mm; margin-bottom:2mm; background:#53565A; }
  }`;
  }

  function kopfHtml(ctx, anzahl) {
    const logo = ctx.logo ? `<img class="logo" src="${esc(ctx.logo)}" alt="Putzmeister">` : '';
    const ersteller = String(ctx.erstelltVon ?? '').trim();
    const zeile = `Zeitraum ${fmtDe(ctx.von)} – ${fmtDe(ctx.bis)} · ${anzahl} ${anzahl === 1 ? 'Person' : 'Personen'} `
      + `· Stand ${fmtDe(ctx.stand)}${ersteller ? ` · erstellt von ${esc(ersteller)}` : ''}`;
    return `<div class="kopf">${logo}
      <div class="doktitel">Abteilungsdurchlauf-Report</div>
      <div class="dokmeta">${zeile}</div>
    </div>`;
  }

  function avatarHtml(azubi) {
    if (azubi.foto) {
      return `<div class="dr-avatar"><img src="${esc(azubi.foto)}" alt=""></div>`;
    }
    return `<div class="dr-avatar">${esc(initialen(azubi.name))}</div>`;
  }

  /* Der Ausbildungsrahmen (Beginn–Ende) stand hier bis 2026-09-09 als dritte
     Angabe; auf Wunsch wieder entfernt. Die Felder kommen weiter aus dem
     Endpunkt und liegen im ctx — nur ausgegeben werden sie nicht mehr. */
  function stammHtml(azubi) {
    const zeilen = [
      azubi.beruf ? `<b>Beruf:</b> ${esc(azubi.beruf)}` : '',
      azubi.department ? `<b>Bereich:</b> ${esc(azubi.department)}` : '',
    ].filter(Boolean);
    return `<div class="dr-stamm">${avatarHtml(azubi)}
      <div class="dr-person">
        <div class="dr-name">${esc(azubi.name)}</div>
        ${zeilen.length ? `<div class="dr-meta">${zeilen.join(' · ')}</div>` : ''}
      </div></div>`;
  }

  function kpiHtml(k) {
    const kasten = (label, wert) => `<div><div class="k">${esc(label)}</div><div class="v">${wert}</div></div>`;
    return `<div class="dr-kpi">
      ${kasten('Stationen', String(k.anzahl))}
      ${kasten('beurteilt', String(k.beurteilt))}
      ${kasten('Notenschnitt', esc(fmtSchnitt(k.notenDurchschnitt)))}
      ${kasten('offene Abschlüsse', String(k.offen))}
    </div>`;
  }

  function stationenHtml(stationen, stand) {
    if (!stationen.length) {
      return '<p class="dr-keine">Keine Zuweisung im Zeitraum.</p>';
    }
    const zeilen = stationen.map(st => {
      const zeit = `${fmtDe(st.von)} – ${st.bis ? fmtDe(st.bis) : 'offen'}`;
      // Verantwortlich: Name, sonst die E-Mail — eine leere Zelle liesse
      // offen, ob niemand zustaendig war oder die Daten fehlen.
      const verantw = st.verantwName ? displayName(st.verantwName) : (st.verantwEmail || '—');
      return `<tr>
        <td class="dr-c-abt">${esc(st.abteilung || '—')}</td>
        <td class="dr-c-zeit">${esc(zeit)}</td>
        <td class="dr-c-verantw">${esc(verantw)}</td>
        <td>${beurteilungZelle(st, stand)}</td>
      </tr>`;
    }).join('');
    return `<table class="dr-tab">
      <thead><tr><th>Abteilung</th><th>Zeitraum</th><th>Verantwortlich</th><th>Beurteilung</th></tr></thead>
      <tbody>${zeilen}</tbody></table>`;
  }

  // Reine Funktion: ctx → vollstaendiges HTML-Dokument. Backend-frei testbar.
  // ctx = { von, bis, stand, erstelltVon, logo, fonts, azubis:[{oid,name,beruf,
  //         department,ausbildungsBeginn,ausbildungsEnde,foto,stationen:[…]}] }
  function renderReportHtml(ctx) {
    const azubis = Array.isArray(ctx.azubis) ? ctx.azubis : [];
    const grund = zeitraumGrund(ctx);

    let koerper;
    if (grund) {
      // Kein Blatt drucken: ein Report ueber einen kaputten Zeitraum wuerde
      // etwas behaupten, was nicht gemessen wurde.
      koerper = `<div class="dr-hinweis">${kopfHtml(ctx, azubis.length)}
        <h2>Kein Report erzeugt</h2>
        <p>${esc(grund)}. Bitte den Zeitraum im Dialog korrigieren.</p></div>`;
    } else {
      const range = { von: ctx.von, bis: ctx.bis };
      koerper = azubis.map((az, i) => {
        const stationen = (Array.isArray(az.stationen) ? az.stationen : [])
          .filter(st => ueberlappt(st, range))
          .sort((a, b) => String(a.von).localeCompare(String(b.von)));
        const k = berechneKennzahlen(stationen, ctx.stand);
        return `<section class="sheet${i === 0 ? ' sheet--first' : ''}">
          ${kopfHtml(ctx, azubis.length)}
          ${stammHtml(az)}
          ${kpiHtml(k)}
          ${stationenHtml(stationen, ctx.stand)}
        </section>`;
      }).join('\n');
    }

    const n = azubis.length;
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Abteilungsdurchlauf-Report</title>
<style>${reportCss(ctx.fonts)}
</style></head><body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Als PDF speichern / Drucken</button>
    <span>Abteilungsdurchlauf-Report · ${n} ${n === 1 ? 'Person' : 'Personen'} · ${esc(fmtDe(ctx.von))} – ${esc(fmtDe(ctx.bis))}</span>
  </div>
  <table class="pm-doc">
    <tfoot class="pm-footer" aria-hidden="true"><tr><td class="pm-foot-cell"><div class="pm-footer__yellow"></div><div class="pm-footer__grey"></div></td></tr></tfoot>
    <tbody><tr><td class="pm-body-cell">${koerper}</td></tr></tbody>
  </table>
  <script>
    // Auto-Print nur im echten Top-Fenster (nicht in Preview-iframes) und
    // erst wenn die CD-Fonts geladen sind, sonst rendert das PDF im Fallback.
    if (window.self === window.top) {
      window.addEventListener('load', function () {
        var ready = (document.fonts && document.fonts.ready) || Promise.resolve();
        ready.then(function () { setTimeout(function () { window.focus(); window.print(); }, 350); });
      });
    }
  <\/script>
</body></html>`;
  }

  /* ── Orchestrierung (nur Browser) ─────────────────────────────────
     Ab hier werden window/document/DB/Toast/Modal benutzt — bewusst
     ausschliesslich hier drin, damit require() in Node nicht bricht.   */

  // Absolute URL im Opener berechnen (das Popup ist about:blank, relative
  // Pfade scheitern dort).
  function absUrl(rel) { return new URL(rel, document.baseURI).href; }

  function blobZuDataUri(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function logoDataUri() {
    try {
      const res = await fetch(absUrl(LOGO_REL));
      if (!res.ok) return '';
      return await blobZuDataUri(await res.blob());
    } catch { return ''; }   // ohne Logo lieber drucken als scheitern
  }

  // Fonts als ABSOLUTE URL (nicht als Data-URI): das Popup hat kein
  // baseURI, unter dem '../Corporate Design/...' aufloest — eine absolute
  // URL laedt dort aber normal. Genau wie im Berichtsheft-Export; die drei
  // TTFs als Base64 in das Dokument zu giessen waere ein Megabyte HTML
  // ohne Gegenwert.
  function fontUrls() {
    return {
      franklinBold:  absUrl(FONT_REL.franklinBold),
      franklinLight: absUrl(FONT_REL.franklinLight),
      openSans:      absUrl(FONT_REL.openSans),
    };
  }

  // Fotos in kleinen Rudeln laden: 60 parallele Requests wuerden dem
  // Dev-Server (und dem Graph-Cache dahinter) nichts Gutes tun.
  async function fotosLaden(oids) {
    const basis = (window.location.port === '5500')
      ? `http://${window.location.hostname}:3000/api` : '/api';
    const treffer = {};
    const BATCH = 8;
    for (let i = 0; i < oids.length; i += BATCH) {
      const teil = oids.slice(i, i + BATCH);
      await Promise.all(teil.map(async oid => {
        try {
          const res = await fetch(`${basis}/users/${encodeURIComponent(oid)}/photo`, { credentials: 'include' });
          if (!res.ok) { treffer[oid] = null; return; }   // 404 = kein Foto -> Initialen
          const blob = await res.blob();
          treffer[oid] = blob.size ? await blobZuDataUri(blob) : null;
        } catch { treffer[oid] = null; }
      }));
    }
    return treffer;
  }

  // win MUSS synchron im Klick geoeffnet worden sein (Popup-Blocker);
  // befuellt wird erst nach den awaits.
  async function erstellen(win, opts) {
    const { azubiOids, von, bis, erstelltVon } = opts || {};
    win.document.write('<!doctype html><meta charset="utf-8">'
      + '<body style="font-family:sans-serif;padding:40px;color:#555">Report wird aufbereitet …</body>');

    const data = await DB.getDurchlaufReport(azubiOids, von, bis);
    const azubisRoh = (data && data.azubis) || [];
    if (!azubisRoh.length) {
      win.close();
      Toast.info('Keine Daten', 'Für die gewählten Personen gibt es im Zeitraum keine Daten.');
      return;
    }

    const [logo, fotos] = await Promise.all([
      logoDataUri(),
      fotosLaden(azubisRoh.map(a => a.oid)),
    ]);
    const fonts = fontUrls();

    const ctx = {
      von: data.von, bis: data.bis, stand: data.stand,
      // Der Server liefert „Nachname, Vorname"; gedreht wird im Client.
      erstelltVon: erstelltVon || displayName((data.erstelltVon && data.erstelltVon.name) || ''),
      logo, fonts,
      azubis: azubisRoh.map(a => ({
        oid: a.oid,
        name: displayName(a.name),
        beruf: a.beruf || '',
        department: a.department || '',
        ausbildungsBeginn: a.ausbildungsBeginn || null,
        ausbildungsEnde: a.ausbildungsEnde || null,
        foto: fotos[a.oid] || null,
        stationen: a.stationen || [],
      })),
    };

    win.document.open();
    win.document.write(renderReportHtml(ctx));
    win.document.close();
    win.focus();
    Toast.success('Report vorbereitet', 'Im Druckdialog „Als PDF speichern" wählen.');
  }

  const api = {
    LOGO_REL, FONT_REL, MAX_TEXT, MAX_EMPFEHLUNG,
    esc, fmtDe, displayName, initialen,
    ueberlappt, kuerzen, fmtNote, fmtSchnitt,
    berechneKennzahlen, beurteilungZelle, zeitraumGrund,
    reportCss, renderReportHtml, erstellen,
  };
  if (typeof window !== 'undefined') window.DurchlaufReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
