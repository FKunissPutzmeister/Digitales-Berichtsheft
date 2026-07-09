/* ===================================================================
   BERICHTSHEFT-EXPORT.JS – Export & Backup (Profil-Sektionen)

   - PDF-Export:  komplettes Berichtsheft als gebrandetes HTML-Dokument,
                  über window.print() → „Als PDF speichern". Echter
                  Vektortext, korrekte Umlaute, CD-Fonts & -Farben,
                  saubere Seitenumbrüche. Layout = freigegebene Mockups
                  (IHK-Formularklassiker, Deckblatt + Wochenblätter).
   - JSON-Export: vollständiges Backup aller Wochen inkl. Tage.
   - JSON-Import: Backup wiederherstellen; freigegebene/genehmigte
                  Wochen werden nicht überschrieben.

   Ansatz & Gotchas: siehe Skill web-print-pdf-export und
   docs/superpowers/specs/2026-07-02-berichtsheft-export-design.md.
   =================================================================== */
const BerichtsheftExport = (() => {
  'use strict';

  // Grau-Logo für weißen Druckgrund; Fonts wie in der App (CD).
  const LOGO_REL  = '../Corporate Design/Digital Logo_png/Standard Logo/600 px_wide_Std_Grey.png';
  const FONT_REL  = {
    franklinBold:  '../Corporate Design/Fonts/librefranklin-bold.ttf',
    franklinLight: '../Corporate Design/Fonts/librefranklin-light.ttf',
    openSans:      '../Corporate Design/Fonts/OpenSans-Variable.ttf',
  };

  const TAGNAMEN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  let _user = null;
  let _backup = null;   // { data, neu, ueberschreiben, geschuetzt, ungueltig }

  /* ── HTML-Escaping + Rich-Text-Whitelist ───────────────────────── */
  const esc = window.escapeHtml;

  // Quill-Rich-Text (bereits HTML mit Entities): mit DOMParser parsen statt
  // blind escapen (sonst würde getipptes & als &amp;amp; doppelt escaped).
  // Nur Whitelist-Tags behalten, alle Attribute verwerfen, Textknoten genau
  // einmal escapen. DOMParser führt kein Skript aus.
  const RICH_ALLOWED = new Set(['p', 'br', 'strong', 'em', 'u', 'b', 'i', 'ul', 'ol', 'li', 'span']);
  function serializeAllowed(node) {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += esc(n.nodeValue); return; }   // Textknoten
      if (n.nodeType !== 1) return;                                 // Kommentare etc. verwerfen
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { out += '<br>'; return; }
      const inner = serializeAllowed(n);
      out += RICH_ALLOWED.has(tag) ? `<${tag}>${inner}</${tag}>` : inner;  // unerlaubtes Tag: nur Inhalt
    });
    return out;
  }
  function sanitizeRich(html) {
    const doc = new DOMParser().parseFromString(String(html == null ? '' : html), 'text/html');
    return serializeAllowed(doc.body);
  }
  // Reintext (Entities dekodiert), um zu entscheiden ob ein Block leer ist.
  function richIstLeer(html) {
    const doc = new DOMParser().parseFromString(String(html == null ? '' : html), 'text/html');
    return (doc.body.textContent || '').replace(/ /g, ' ').trim() === '';
  }

  /* ── Datei-Download & kleine Helfer ─────────────────────────────── */
  function download(data, filename, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function slug(s) { return String(s || 'Berichtsheft').trim().replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, '_'); }
  function heute() { return DateUtil.toISODate(new Date()); }

  async function run(btn, fn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true; btn.style.opacity = '0.6';
    try { await fn(); }
    catch (err) { Toast.error('Fehler', err.message || String(err)); }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }

  // Ausbildungsjahr (1-basiert) zum Stichtag; null wenn Beginn unbekannt.
  function ausbildungsjahr(dateStr) {
    if (!_user.ausbildungsBeginn || !dateStr) return null;
    const b = new Date(_user.ausbildungsBeginn + 'T00:00:00');
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(b) || isNaN(d) || d < b) return 1;
    let jahre = d.getFullYear() - b.getFullYear();
    const jub = new Date(b); jub.setFullYear(b.getFullYear() + jahre);
    if (d < jub) jahre--;
    return jahre + 1;
  }

  /* ── 1) Profil-Sektionen (Render) ──────────────────────────────── */
  function renderSection(user) {
    if (!user || !user.istAzubi) return '';

    const logoBtn = (id, inner, label) => `
      <button class="bhx-logo-btn" id="${id}" type="button"
        style="display:flex;flex-direction:column;align-items:center;gap:var(--sp-2);padding:var(--sp-4) var(--sp-6);min-width:128px;
               background:var(--pm-grey-50,rgba(255,255,255,0.05));border:1px solid var(--pm-grey-200,rgba(255,255,255,0.12));
               border-radius:var(--radius-lg,14px);cursor:pointer;color:inherit;font:inherit">
        ${inner}
        <span style="font-weight:600;font-size:var(--text-sm)">${label}</span>
      </button>`;

    return `
      <details class="profil-section" id="bhxExportSection" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">${Icon('download')}</div>
          <div class="profil-section__title">Berichtsheft exportieren</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="bhx-zeitraum" style="display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:flex-end;margin-bottom:var(--sp-4)">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-sm)">
              <span class="zlabel">Von (optional)</span>
              <input type="date" id="bhxVon" class="form-control" style="width:auto;min-width:160px">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-sm)">
              <span class="zlabel">Bis (optional)</span>
              <input type="date" id="bhxBis" class="form-control" style="width:auto;min-width:160px">
            </label>
          </div>
          ${logoBtn('bhxPdfBtn', '<img src="img/pdf-logo.png" alt="" style="width:48px;height:48px;object-fit:contain">', 'PDF exportieren')}
        </div></div>
      </details>

      <details class="profil-section" id="bhxBackupSection">
        <summary class="profil-section__header">
          <div class="profil-section__icon">${Icon('inbox')}</div>
          <div class="profil-section__title">Backup</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <input type="file" id="bhxFile" accept=".json,application/json" hidden>
          <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap">
            <button class="btn btn-secondary" id="bhxJsonBtn" type="button"
                    style="display:inline-flex;align-items:center;gap:var(--sp-2)">
              <span style="display:inline-flex;width:18px;height:18px">${Icon('download', { size: 18 })}</span>
              Herunterladen
            </button>
            <button class="btn btn-secondary" id="bhxPick" type="button"
                    style="display:inline-flex;align-items:center;gap:var(--sp-2)">
              <span style="display:inline-flex;width:18px;height:18px">${Icon('upload', { size: 18 })}</span>
              Wiederherstellen…
            </button>
          </div>
          <div id="bhxPreview" hidden style="margin-top:var(--sp-4)">
            <p id="bhxSummary" style="margin:0 0 var(--sp-3)"></p>
            <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
              <button class="btn btn-primary" id="bhxRestore" type="button">Wiederherstellen</button>
              <button class="btn btn-ghost" id="bhxCancel" type="button">Abbrechen</button>
            </div>
          </div>
        </div></div>
      </details>`;
  }

  /* ── 2) JSON-Export ─────────────────────────────────────────────── */
  async function exportJson() {
    const wochen = await DB.getWochenFuerAzubi(_user.oid);
    if (!wochen.length) { Toast.info('Keine Daten', 'Es sind noch keine Wochen im Berichtsheft vorhanden.'); return; }
    const payload = {
      format: 'berichtsheft-backup', version: 1,
      exportiertAm: new Date().toISOString(),
      azubi: {
        oid: _user.oid, name: _user.name, email: _user.email,
        beruf: _user.beruf || '', berichtTyp: _user.berichtTyp || '',
        ausbildungsBeginn: _user.ausbildungsBeginn || '', ausbildungsEnde: _user.ausbildungsEnde || '',
      },
      wochen,
    };
    download(JSON.stringify(payload, null, 2),
      `Berichtsheft-Backup_${slug(_user.name)}_${heute()}.json`, 'application/json');
    Toast.success('Backup erstellt', `${wochen.length} Wochen als JSON exportiert.`);
  }

  /* ── 3) JSON-Import ─────────────────────────────────────────────── */
  async function analyzeBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
    if (!data || data.format !== 'berichtsheft-backup' || !Array.isArray(data.wochen))
      throw new Error('Die Datei ist kein Berichtsheft-Backup.');
    if ((data.version || 1) > 1)
      throw new Error(`Backup-Version ${data.version} wird von dieser App-Version nicht unterstützt.`);

    const gueltig = [], ungueltig = [];
    data.wochen.forEach(w => {
      (w && Number.isInteger(w.kw) && Number.isInteger(w.year) && w.startDate && w.endDate)
        ? gueltig.push(w) : ungueltig.push(w);
    });

    const bestehend = await DB.getWochenFuerAzubi(_user.oid);
    const key = w => `${w.year}-${w.kw}`;
    const geschuetztKeys = new Set(
      bestehend.filter(w => w.status === 'freigegeben' || w.status === 'genehmigt').map(key));
    const bestehendKeys = new Set(bestehend.map(key));

    const neu            = gueltig.filter(w => !bestehendKeys.has(key(w)));
    const geschuetzt     = gueltig.filter(w => geschuetztKeys.has(key(w)));
    const ueberschreiben = gueltig.filter(w => bestehendKeys.has(key(w)) && !geschuetztKeys.has(key(w)));
    return { data, neu, ueberschreiben, geschuetzt, ungueltig };
  }

  function resetImport() {
    _backup = null;
    const f = document.getElementById('bhxFile'); if (f) f.value = '';
    const p = document.getElementById('bhxPreview'); if (p) p.hidden = true;
  }

  function showPreview() {
    const { data, neu, ueberschreiben, geschuetzt, ungueltig } = _backup;
    const teile = [];
    const dat = String(data.exportiertAm || '').split('T')[0];
    teile.push(`Backup vom <strong>${esc(DateUtil.formatDate(dat) || 'unbekannt')}</strong>`
      + (data.azubi && data.azubi.name ? ` (${esc(data.azubi.name)})` : ''));
    if (data.azubi && data.azubi.oid && data.azubi.oid !== _user.oid)
      teile.push('<strong style="color:var(--color-warning,#d97706)">Achtung: Das Backup stammt von einem anderen Konto und wird in dein Berichtsheft übernommen.</strong>');
    teile.push(`<strong>${neu.length}</strong> neue Wochen werden angelegt, <strong>${ueberschreiben.length}</strong> bestehende überschrieben.`);
    if (geschuetzt.length) teile.push(`${geschuetzt.length} freigegebene/genehmigte Wochen bleiben unangetastet.`);
    if (ungueltig.length)  teile.push(`${ungueltig.length} unvollständige Einträge werden übersprungen.`);
    document.getElementById('bhxSummary').innerHTML = teile.join('<br>');
    document.getElementById('bhxPreview').hidden = false;
    document.getElementById('bhxRestore').disabled = (neu.length + ueberschreiben.length) === 0;
  }

  async function doRestore() {
    if (!_backup) return;
    const wochen = [..._backup.neu, ..._backup.ueberschreiben];
    let ok = 0;
    for (const w of wochen) {
      // azubiId immer aufs eigene Konto zwingen – nie in ein fremdes Heft schreiben.
      await DB.saveWoche({ ...w, azubiId: _user.oid, tage: Array.isArray(w.tage) ? w.tage : [] });
      ok++;
    }
    const uebersprungen = _backup.geschuetzt.length;
    resetImport();
    Toast.success('Backup wiederhergestellt',
      `${ok} Wochen übernommen${uebersprungen ? `, ${uebersprungen} geschützte Wochen übersprungen` : ''}.`);
  }

  /* ── 4) PDF-Export (branded HTML → window.print) ────────────────── */

  // Absolute URL im Opener berechnen (Popup ist about:blank → relative Pfade scheitern).
  function absUrl(rel) { return new URL(rel, document.baseURI).href; }

  // Logo als Data-URI holen (bombensicher im Popup, kein Bild-Ladezeitproblem).
  async function logoDataUri() {
    try {
      const res = await fetch(absUrl(LOGO_REL));
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch { return ''; }   // ohne Logo lieber exportieren als scheitern
  }

  // Bestätigungstexte je Status (elektronisch statt Unterschrift).
  function bestaetigung(w, ausbilderName) {
    const genehmigtAm = w.korrigiertAm ? DateUtil.formatDate(w.korrigiertAm) : '';
    const azubiFreigegeben = (w.status === 'freigegeben' || w.status === 'genehmigt' || w.status === 'abgelehnt');
    let ausbilderText;
    if (w.status === 'genehmigt')      ausbilderText = `Geprüft und genehmigt${genehmigtAm ? ` am ${genehmigtAm}` : ''}`;
    else if (w.status === 'abgelehnt') ausbilderText = `Zur Überarbeitung zurückgegeben${genehmigtAm ? ` am ${genehmigtAm}` : ''}`;
    else                               ausbilderText = 'Prüfung ausstehend';
    return {
      azubiText: azubiFreigegeben ? 'Berichtsheft geführt und zur Prüfung freigegeben' : 'Entwurf – noch nicht freigegeben',
      ausbilderName: (w.status === 'genehmigt' || w.status === 'abgelehnt') ? (ausbilderName || 'Ausbilder/in') : '—',
      ausbilderText,
    };
  }

  // Ein Wochenblatt (wöchentlich): drei Blöcke.
  function renderWocheWoechentlich(w) {
    const bloecke = [
      ['Betriebliche Tätigkeiten', w.betriebEintrag],
      ['Berufsschule (Unterrichtsthemen)', w.schuleEintrag],
      ['Unterweisungen', w.unterweisungEintrag],
    ].filter(([, v]) => !richIstLeer(v));
    if (!bloecke.length) return `<tr><td class="z">${'<span class="leer">Keine Einträge für diese Woche.</span>'}</td></tr>`;
    return bloecke.map(([label, v]) => `
      <tr><td class="z">
        <div class="blocktitel">${esc(label)}</div>
        <div class="richtext">${sanitizeRich(v)}</div>
      </td></tr>`).join('');
  }

  // Ein Wochenblatt (täglich): Zeile je Tag.
  function renderWocheTaeglich(w) {
    const tage = (w.tage || []).slice().sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
    const zeilen = [];
    for (const t of tage) {
      const inhalte = [
        ['', t.eintrag],
        ['Betrieb', t.betriebEintrag],
        ['Berufsschule', t.schuleEintrag],
        ['Unterweisung', t.unterweisungEintrag],
      ].filter(([, v]) => !richIstLeer(v));
      const anw = (t.anwesenheit || '').trim();
      const abwesend = !inhalte.length;
      // Reine Wochenend-/Leerzeilen ohne jeden Inhalt überspringen.
      if (abwesend && (!anw || anw.toLowerCase() === 'wochenende')) continue;

      const d = new Date(t.datum + 'T00:00:00');
      const tagName = isNaN(d) ? esc(t.datum) : TAGNAMEN[d.getDay()];
      const datum = isNaN(d) ? '' : DateUtil.formatDate(t.datum);
      const metaTeile = [datum, t.ort, t.tagdauer === 'halbtag' ? 'Halbtag' : (inhalte.length ? 'Ganztag' : '')]
        .filter(Boolean).map(esc).join(' · ');

      const inhaltHtml = abwesend
        ? `<span class="leer">${esc(anw || 'Kein Eintrag')}</span>`
        : inhalte.map(([lab, v]) =>
            `<div class="richtext">${lab ? `<span class="tglabel">${esc(lab)}:</span> ` : ''}${sanitizeRich(v)}</div>`).join('');

      zeilen.push(`
        <tr class="${abwesend ? 'abwesend' : ''}">
          <td class="z z-tag">
            <div class="tagname">${tagName}</div>
            <div class="tagmeta">${metaTeile}</div>
          </td>
          <td class="z">${inhaltHtml}</td>
        </tr>`);
    }
    if (!zeilen.length) return `<tr><td class="z" colspan="2"><span class="leer">Keine Einträge für diese Woche.</span></td></tr>`;
    return zeilen.join('');
  }

  // Vollständiges Wochenblatt (Kopf + Inhalt + Bestätigung) als .sheet.
  function renderBlatt(w, ctx, first) {
    const taeglich = ctx.taeglich;
    const aj = ausbildungsjahr(w.startDate);
    const zeitraum = `${DateUtil.formatDate(w.startDate)} – ${DateUtil.formatDate(w.endDate)} (KW ${w.kw}/${w.year})`;
    const inhalt = taeglich ? renderWocheTaeglich(w) : renderWocheWoechentlich(w);
    const b = bestaetigung(w, ctx.nameByOid[w.korrigiertVon]);

    const inhaltTabelle = taeglich
      ? `<table class="inhalt inhalt--tag">
           <thead><tr><th style="width:26%">Tag</th><th>Ausgeführte Arbeiten / Unterweisung</th></tr></thead>
           <tbody>${inhalt}</tbody>
         </table>`
      : `<table class="inhalt">
           <thead><tr><th>Ausgeführte Arbeiten, Unterricht, Unterweisungen</th></tr></thead>
           <tbody>${inhalt}</tbody>
         </table>`;

    return `
      <section id="${wocheAnchor(w)}" class="sheet ${first ? 'sheet--first' : ''}">
        <div class="kopf">
          <img class="logo" src="${ctx.logo}" alt="Putzmeister">
          <div class="doktitel">Ausbildungsnachweis</div>
        </div>
        <table class="stamm">
          <tr>
            <td class="z"><span class="zlabel">Name der/des Auszubildenden</span><br><strong>${esc(_user.name)}</strong></td>
            <td class="z" style="width:18%"><span class="zlabel">Ausbildungsjahr</span><br><strong>${aj ?? '–'}</strong></td>
            <td class="z" style="width:40%"><span class="zlabel">Berichtszeitraum</span><br><strong>${esc(zeitraum)}</strong></td>
          </tr>
        </table>
        ${inhaltTabelle}
        <table class="bestaetigung">
          <thead><tr><th colspan="2">Bestätigung (elektronisch)</th></tr></thead>
          <tbody><tr>
            <td class="z" style="width:50%">
              <span class="zlabel">Auszubildende/r</span><br><strong>${esc(_user.name)}</strong><br>
              <span class="muted">${esc(b.azubiText)}</span>
            </td>
            <td class="z">
              <span class="zlabel">Ausbilder/in</span><br><strong>${esc(b.ausbilderName)}</strong><br>
              <span class="muted">${esc(b.ausbilderText)}</span>
            </td>
          </tr></tbody>
        </table>
        <div class="fuss">
          <span>Digital geführt und elektronisch bestätigt (Berichtsheft-System Putzmeister)</span>
        </div>
      </section>`;
  }

  function renderDeckblatt(ctx) {
    const von = ctx.wochen.length ? DateUtil.formatDate(ctx.wochen[0].startDate) : '';
    const bis = ctx.wochen.length ? DateUtil.formatDate(ctx.wochen[ctx.wochen.length - 1].endDate) : '';
    const ausb = (_user.ausbildungsBeginn && _user.ausbildungsEnde)
      ? `${DateUtil.formatDate(_user.ausbildungsBeginn)} – ${DateUtil.formatDate(_user.ausbildungsEnde)}` : '';
    return `
      <section class="sheet sheet--first cover">
        <img class="cover-logo" src="${ctx.logo}" alt="Putzmeister">
        <h1 class="cover-title">Ausbildungsnachweis</h1>
        <table class="cover-stamm">
          <tr><td class="zlabel">Name</td><td><strong>${esc(_user.name)}</strong></td></tr>
          ${_user.beruf ? `<tr><td class="zlabel">Ausbildungsberuf</td><td>${esc(_user.beruf)}</td></tr>` : ''}
          ${ausb ? `<tr><td class="zlabel">Ausbildungszeitraum</td><td>${esc(ausb)}</td></tr>` : ''}
          <tr><td class="zlabel">Unternehmen</td><td>Putzmeister Concrete Pumps GmbH</td></tr>
          <tr><td class="zlabel">Berichtszeitraum</td><td>${von && bis ? `${esc(von)} – ${esc(bis)}` : '–'}</td></tr>
          <tr><td class="zlabel">Umfang</td><td>${ctx.wochen.length} Wochen</td></tr>
          <tr><td class="zlabel">Exportiert am</td><td>${esc(DateUtil.formatDate(heute()))}</td></tr>
        </table>
      </section>`;
  }

  // Anker-ID je Woche – Ziel der Inhaltsverzeichnis-Links (klickbar im PDF).
  function wocheAnchor(w) { return `w-${w.year}-${w.kw}`; }

  function statusLabel(w) {
    if (w.status === 'genehmigt')   return 'Genehmigt';
    if (w.status === 'freigegeben') return 'In Prüfung';
    if (w.status === 'abgelehnt')   return 'Zurückgewiesen';
    return 'In Bearbeitung';
  }
  // Distinkte Orte der Woche (nur täglich sinnvoll), z. B. „Schule / Betrieb".
  function wocheOrte(w) {
    return [...new Set((w.tage || []).map(t => (t.ort || '').trim()).filter(Boolean))].join(' / ');
  }

  // Interaktives Inhaltsverzeichnis: eine Zeile je Woche, Woche verlinkt aufs Blatt.
  function renderInhalt(ctx) {
    const taeglich = ctx.taeglich;
    const head = taeglich
      ? '<tr><th>Berichtswoche</th><th>Zeitraum</th><th>Ort</th><th>Status</th></tr>'
      : '<tr><th>Berichtswoche</th><th>Zeitraum</th><th>Status</th></tr>';
    const rows = ctx.wochen.map(w => {
      const zeitraum = `${DateUtil.formatDate(w.startDate)} – ${DateUtil.formatDate(w.endDate)}`;
      return `<tr>
        <td class="z"><a class="toc-link" href="#${wocheAnchor(w)}">KW ${w.kw}/${w.year}</a></td>
        <td class="z">${esc(zeitraum)}</td>
        ${taeglich ? `<td class="z">${esc(wocheOrte(w))}</td>` : ''}
        <td class="z">${esc(statusLabel(w))}</td>
      </tr>`;
    }).join('');
    return `
      <section class="sheet">
        <div class="kopf">
          <img class="logo" src="${ctx.logo}" alt="Putzmeister">
          <div class="doktitel">Inhaltsverzeichnis</div>
        </div>
        <table class="inhalt toc-table">
          <thead>${head}</thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  // Reine Funktion: ctx-Daten → vollständiges HTML-Dokument. Backend-frei testbar.
  function _buildHtml(ctx) {
    const sheets = [renderDeckblatt(ctx), renderInhalt(ctx)];
    ctx.wochen.forEach(w => sheets.push(renderBlatt(w, ctx, false)));

    const ff = (fam, url, weight, fmt) =>
      `@font-face{font-family:'${fam}';src:url('${url}') format('${fmt}');font-weight:${weight};font-style:normal;font-display:swap;}`;

    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Ausbildungsnachweis – ${esc(_user.name)}</title>
<style>
  ${ff('Libre Franklin', ctx.fonts.franklinBold, 700, 'truetype')}
  ${ff('Libre Franklin', ctx.fonts.franklinLight, 300, 'truetype')}
  ${ff('Open Sans', ctx.fonts.openSans, '300 800', 'truetype-variations')}
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background:#5b5b5b; font-family:'Open Sans','Segoe UI',Arial,sans-serif; color:#1A1A1A; font-size:10.5pt; line-height:1.5; }
  .toolbar { position:sticky; top:0; z-index:10; background:#1A1A1A; color:#fff; padding:10px 16px; display:flex; gap:12px; align-items:center; font-size:10pt; }
  .toolbar button { background:#FFC300; color:#1A1A1A; border:0; border-radius:8px; padding:8px 16px; font:inherit; font-weight:700; cursor:pointer; }
  .toolbar span { opacity:.85; }
  /* padding-top:0 -> Banner-Logo bündig an der oberen Blattkante (CD-Regel). */
  .sheet { width:210mm; min-height:297mm; background:#fff; margin:14px auto; padding:0 14mm 14mm; box-shadow:0 6px 24px rgba(0,0,0,.35); }
  .kopf { display:flex; flex-direction:column; align-items:flex-start; padding-top:0; }
  .logo { width:45mm; height:auto; display:block; }
  .doktitel { font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-weight:700; font-size:16pt; margin-top:4mm; }
  table { border-collapse:collapse; width:100%; }
  .stamm { margin:5mm 0 3mm; }
  .inhalt { }
  .bestaetigung { margin-top:6mm; }
  .z { border:1px solid #999; padding:2mm 3mm; vertical-align:top; }
  .z-tag { width:26%; }
  thead th { border:1px solid #999; padding:2mm 3mm; text-align:left; background:#efefef; font-size:9pt; font-weight:700; }
  .zlabel { font-size:7pt; color:#6b6b6b; letter-spacing:.4px; text-transform:uppercase; }
  .blocktitel { font-size:8.5pt; font-weight:700; letter-spacing:.4px; text-transform:uppercase; margin-bottom:1mm; }
  .richtext { white-space:normal; }
  .richtext p { margin:0 0 1mm; }
  .richtext ul, .richtext ol { margin:0 0 1mm; padding-left:5mm; }
  .tglabel { font-weight:700; }
  .tagname { font-weight:700; font-size:9pt; }
  .tagmeta { font-size:7.5pt; color:#6b6b6b; }
  tr.abwesend .z { background:#fafafa; }
  .leer { color:#8a8a8a; font-style:italic; }
  .muted { color:#6b6b6b; }
  .fuss { margin-top:4mm; font-size:7.5pt; color:#6b6b6b; }
  /* Deckblatt */
  .cover { display:flex; flex-direction:column; }
  .cover-logo { width:70mm; height:auto; }
  .cover-title { font-family:'Libre Franklin','Segoe UI',Arial,sans-serif; font-weight:700; font-size:28pt; margin:24mm 0 12mm; }
  .cover-stamm td { padding:2.5mm 4mm 2.5mm 0; font-size:11pt; vertical-align:top; }
  .cover-stamm td.zlabel { width:46mm; }
  /* Inhaltsverzeichnis: Zebra + klickbare, aber unauffällige Wochen-Links. */
  .toc-table tbody tr:nth-child(even) .z { background:#f4f4f4; }
  .toc-link { color:inherit; text-decoration:none; font-weight:700; }
  .toc-link:hover { text-decoration:underline; }
  .pm-doc { width:100%; }   /* Bildschirm-Vorschau: Tabelle füllt die Breite, Blätter bleiben zentriert */
  /* CD-Fußleiste (gelb-graue Bleed-Leiste): nur im Druck, wiederholt je Seite. */
  .pm-footer { display:none; }
  @media print {
    /* Ränder auf 0 (Vollbleed für Kopf-Logo oben und Fußleiste unten); Seiten-
       einzug macht das .sheet-Padding, der 16mm-Unterrand hält jede Seite frei. */
    @page { size: A4; margin: 0; }
    body { background:#fff; }
    .toolbar { display:none; }
    .sheet { width:auto; min-height:0; margin:0; padding:0 13mm; box-shadow:none; break-before:page; }
    .sheet--first { break-before:auto; }
    .cover { break-after:page; }
    /* Nur kleine, atomare Blöcke zusammenhalten. Der Inhalt (.inhalt) DARF
       über Seiten umbrechen – sonst springt langer Text komplett auf eine
       neue Seite und lässt die vorige fast leer. */
    .kopf, .stamm, .bestaetigung { break-inside:avoid; }
    .inhalt--tag tbody tr { break-inside:avoid; }   /* einzelne Tageszeile nicht splitten */
    /* Laufende CD-Fußleiste: echtes <tfoot> – Chrome wiederholt es am unteren Rand
       JEDER Druckseite und reserviert dort Platz, sodass der Fließtext davor umbricht
       (kein Überlappen wie bei position:fixed). Volle Breite (Seitenrand 0). */
    .pm-doc { width:100%; border-collapse:collapse; }
    .pm-foot-cell, .pm-body-cell { padding:0; }
    .pm-footer { display:table-footer-group; }
    .pm-footer__yellow { height:1.6mm; background:#FFC300; }
    .pm-footer__grey   { height:2.6mm; margin-top:0.8mm; margin-bottom:2mm; background:#53565A; }
  }
</style></head><body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Als PDF speichern / Drucken</button>
    <span>${esc(_user.name)} · Ausbildungsnachweis · ${ctx.wochen.length} Wochen</span>
  </div>
  <table class="pm-doc">
    <tfoot class="pm-footer" aria-hidden="true"><tr><td class="pm-foot-cell"><div class="pm-footer__yellow"></div><div class="pm-footer__grey"></div></td></tr></tfoot>
    <tbody><tr><td class="pm-body-cell">${sheets.join('\n')}</td></tr></tbody>
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

  function inRange(w, von, bis) {
    if (von && w.startDate < von) return false;
    if (bis && w.startDate > bis) return false;
    return true;
  }

  async function exportPdf() {
    const von = document.getElementById('bhxVon')?.value || '';
    const bis = document.getElementById('bhxBis')?.value || '';

    // Popup SYNCHRON im Klick-Gesture öffnen (Blocker), dann async befüllen.
    const win = window.open('', '_blank');
    if (!win) { Toast.error('Pop-up blockiert', 'Bitte Pop-ups für diese Seite erlauben, dann erneut versuchen.'); return; }
    win.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;color:#555">Berichtsheft wird aufbereitet …</body>');

    try {
      let wochen = (await DB.getWochenFuerAzubi(_user.oid))
        .filter(w => inRange(w, von, bis))
        .sort((a, b) => (a.year - b.year) || (a.kw - b.kw));
      if (!wochen.length) {
        win.close();
        Toast.info('Keine Daten', von || bis ? 'Im gewählten Zeitraum sind keine Wochen vorhanden.' : 'Es sind noch keine Wochen im Berichtsheft vorhanden.');
        return;
      }

      const korrektorOids = [...new Set(wochen.map(w => w.korrigiertVon).filter(Boolean))];
      const korrektoren = await Promise.all(korrektorOids.map(oid => DB.getUser(oid)));
      const nameByOid = Object.fromEntries(korrektoren.filter(Boolean).map(u => [u.oid, u.name]));

      const ctx = {
        wochen,
        taeglich: _user.berichtTyp === 'täglich',
        nameByOid,
        logo: await logoDataUri(),
        fonts: {
          franklinBold:  absUrl(FONT_REL.franklinBold),
          franklinLight: absUrl(FONT_REL.franklinLight),
          openSans:      absUrl(FONT_REL.openSans),
        },
      };

      win.document.open();
      win.document.write(_buildHtml(ctx));
      win.document.close();
      Toast.success('PDF vorbereitet', `${wochen.length} Wochen – im Druckdialog „Als PDF speichern" wählen.`);
    } catch (err) {
      win.close();
      throw err;
    }
  }

  /* ── 5) Verdrahten ─────────────────────────────────────────────── */
  function bind(user) {
    _user = user;
    const pdfBtn = document.getElementById('bhxPdfBtn');
    if (!pdfBtn) return;   // Sektion nicht gerendert (kein Azubi)

    pdfBtn.addEventListener('click', () => run(pdfBtn, exportPdf));
    const jsonBtn = document.getElementById('bhxJsonBtn');
    jsonBtn.addEventListener('click', () => run(jsonBtn, exportJson));

    const fileInput = document.getElementById('bhxFile');
    const pickBtn = document.getElementById('bhxPick');
    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      run(pickBtn, async () => { _backup = await analyzeBackup(file); showPreview(); });
    });
    document.getElementById('bhxCancel').addEventListener('click', resetImport);
    const restoreBtn = document.getElementById('bhxRestore');
    restoreBtn.addEventListener('click', () => run(restoreBtn, doRestore));
  }

  return { renderSection, bind, _buildHtml };
})();
