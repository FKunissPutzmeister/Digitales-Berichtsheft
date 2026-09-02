/* ===================================================================
   NOTEN-DRUCK.JS — der Notenspiegel als A4-Blatt
   Erzeugt ein eigenständiges HTML-Dokument in einem neuen Tab und löst
   dort den Druckdialog aus. Genau das Verfahren des Beurteilungsbogens
   (app/js/beurteilung.js) und aus demselben Grund:

   Ein @media-print-Block auf der App-Seite müsste Sidebar, Topbar,
   Karten, Schatten und die Farbwelt von sieben Themes zurückbauen — und
   jedes neue Theme könnte das Blatt wieder verstellen, ohne dass es
   jemand merkt. Ein eigenes Dokument hat keine Themes: es bringt seine
   Farben selbst mit und sieht in jedem Design gleich aus.

   Die ZEILEN kommen unverändert aus noten-core.js, die Zellinhalte aus
   noten-tabelle-ui.js (zellText). Diese Datei entscheidet nur über
   Papierformat und Seitenumbrüche — sonst stünde auf dem Blatt etwas
   anderes als auf dem Bildschirm.
   =================================================================== */
(function (global) {
  'use strict';

  const esc = global.escapeHtml;

  function heute() {
    return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /* Baut das Dokument. Getrennt von oeffne(), damit es prüfbar ist, ohne
     ein Fenster aufzumachen. */
  function baueHtml(opts) {
    const o = opts || {};
    const ui = global.NotenTabelleUI || {};
    const zellText = o.zellText || ui.zellText;
    const kennzahlen = o.kennzahlen || ((g) => (ui.kennzahlen ? ui.kennzahlen(g, false) : ''));
    const gruppenTitel = o.gruppenTitel || ui.gruppenTitel || ((g) => g.label);
    const spalten = o.spalten || [];
    const gruppen = o.gruppen || [];
    const p = o.person || {};

    const kopf = spalten.map(s => `<th class="${s.ausricht}">${esc(s.label)}</th>`).join('');
    const koerper = gruppen.map(g => {
      const zeitraum = `<tr class="zeitraum"><th colspan="${spalten.length}">
          <span class="zeitraum__name">${esc(gruppenTitel(g))}</span>
          <span class="zeitraum__zahlen">${esc(kennzahlen(g))}</span></th></tr>`;
      const zeilen = g.zeilen.map(z => `<tr>${
        spalten.map(s => `<td class="${s.ausricht}">${esc(zellText(s.id, z))}</td>`).join('')
      }</tr>`).join('');
      return zeitraum + zeilen;
    }).join('');

    const stammZeilen = [
      `<tr><td><b>Name:</b> ${esc(p.name || '')}</td><td><b>Stand:</b> ${esc(heute())}</td></tr>`,
      p.beruf
        ? `<tr><td><b>Ausbildungs-/Studienberuf:</b> ${esc(p.beruf)}</td><td><b>Auswahl:</b> ${esc(o.auswahl || '')}</td></tr>`
        : `<tr><td colspan="2"><b>Auswahl:</b> ${esc(o.auswahl || '')}</td></tr>`,
    ].join('');

    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Notenspiegel – ${esc(p.name || '')}</title><style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family:'Open Sans','Segoe UI',Arial,sans-serif; color:#1A1A1A; font-size:10.5pt; background:#5b5b5b; margin:0; }
  .toolbar { position:sticky; top:0; background:#1A1A1A; color:#fff; padding:10px 16px; }
  .toolbar button { background:#FFC300; border:0; border-radius:8px; padding:8px 16px; font-weight:700; cursor:pointer; }
  .sheet { width:210mm; min-height:297mm; background:#fff; margin:14px auto; padding:14mm; box-shadow:0 6px 24px rgba(0,0,0,.35); }
  h1 { font-size:15pt; margin:0 0 4mm; }
  table { border-collapse:collapse; width:100%; }
  .stamm td { padding:1.5mm 3mm; font-size:9.5pt; border:1px solid #999; }
  .grid { margin-top:4mm; }
  .grid th, .grid td { border:1px solid #999; padding:1.5mm 2mm; font-size:9pt; vertical-align:top; }
  .grid thead th { background:#efefef; text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:.04em; }
  .grid .links { text-align:left; }
  .grid .rechts { text-align:right; white-space:nowrap; }
  /* Zeitraum-Kopfzeile: Name links, Kennzahlen rechts in derselben Zelle. */
  .grid .zeitraum th { background:#f6f6f6; text-align:left; font-size:9.5pt; }
  .zeitraum__zahlen { float:right; font-weight:400; }
  .fuss { margin-top:3mm; font-size:8pt; color:#555; }
  @media print {
    /* Rand über @page statt als .sheet-Polsterung: Polsterung gilt nur
       EINMAL, ein mehrseitiger Notenspiegel bekäme ab Seite 2 keinen
       oberen Rand mehr. */
    @page { size:A4 portrait; margin:14mm; }
    body { background:#fff; }
    .toolbar { display:none; }
    .sheet { width:auto; min-height:0; margin:0; padding:0; box-shadow:none; }
    /* Spaltenköpfe auf jeder Seite wiederholen, Zeilen nicht zerschneiden
       und eine Zeitraum-Überschrift nicht allein am Seitenende stehen
       lassen. */
    .grid thead { display:table-header-group; }
    .grid tr { page-break-inside:avoid; }
    .grid .zeitraum { page-break-after:avoid; }
  }
</style></head><body>
  <div class="toolbar"><button type="button" onclick="window.print()">Als PDF speichern / Drucken</button></div>
  <section class="sheet">
    <h1>Notenspiegel</h1>
    <table class="stamm">${stammZeilen}</table>
    <table class="grid">
      <thead><tr>${kopf}</tr></thead>
      <tbody>${koerper}</tbody>
    </table>
    ${o.fussnote ? '<p class="fuss">* Dieses Fach zählt nicht in den Durchschnitt.</p>' : ''}
  </section>
  <script>if (window.self===window.top){window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},300);});}<\/script>
</body></html>`;
  }

  function oeffne(opts) {
    const win = global.open('', '_blank');
    if (!win) {
      Toast.error('Pop-up blockiert', 'Bitte Pop-ups für diese Seite erlauben und erneut versuchen.');
      return null;
    }
    win.document.open();
    win.document.write(baueHtml(opts));
    win.document.close();
    return win;
  }

  global.NotenDruck = { oeffne, baueHtml };
})(window);
