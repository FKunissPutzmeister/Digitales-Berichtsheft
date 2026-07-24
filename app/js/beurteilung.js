/* ===================================================================
   BEURTEILUNG.JS – Controller der Beurteilungsseite (beurteilung.html).
   Rollen-/Shell-bewusst: Verantwortliche bearbeiten, Azubi/DH lesen.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await DB.fetchCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }

  document.getElementById('dhThemeToggle')?.addEventListener('click', () => {
    if (window.PMTheme) window.PMTheme.set(window.PMTheme.get() === 'dark' ? 'light' : 'dark');
  });

  // DH-Studenten in eigener Optik (Body-Marker fürs CSS).
  if (user.istDhStudent) document.body.classList.add('beurt-page--dh');

  const zuw = new URLSearchParams(location.search).get('zuw');
  const back = () => {
    if (document.referrer && history.length > 1) history.back();
    else window.location.href = user.istDhStudent ? 'abteilungsdurchlauf.html' : 'abteilungs-planer.html';
  };
  document.querySelectorAll('[data-back]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); back(); }));

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  if (!zuw) { main.innerHTML = `<div class="dh-empty">Keine Zuweisung angegeben.</div>`; return; }

  let data;
  try { data = await loadContext(zuw); }
  catch (err) {
    console.error('Beurteilung konnte nicht geladen werden:', err);
    main.innerHTML = `<div class="dh-empty">${esc(err.message || 'Beurteilung konnte nicht geladen werden.')}</div>`;
    return;
  }

  const { zuweisung, beurteilung, azubi, editable } = data;

  if (!editable && !beurteilung) {
    main.innerHTML = `<div class="dh-empty">Für diesen Zeitraum liegt noch keine abgeschlossene Beurteilung vor.</div>`;
    return;
  }

  const kopf = {
    name: azubi ? displayName(azubi.name) : '',
    abteilung: zuweisung.abteilung || '',
    zeitraum: `${DateUtil.formatDate(zuweisung.von)} – ${DateUtil.formatDate(zuweisung.bis)}`,
    beurteilende: displayName(zuweisung.verantwName || ''),
    beruf: azubi ? (azubi.beruf || azubi.studiengang || '') : '',
  };
  const punkteByKey = {};
  (beurteilung?.kriterien || []).forEach(k => { punkteByKey[k.kriteriumKey] = k.punkte; });

  const statusAbg = beurteilung?.status === 'abgeschlossen';
  const statusLabel = statusAbg ? 'Abgeschlossen' : (beurteilung ? 'Entwurf' : (editable ? 'Neu' : 'Offen'));
  const statusBadge = statusAbg ? 'badge--genehmigt' : (beurteilung ? 'badge--yellow' : 'badge--grey');
  main.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Beurteilungsbogen</h1>
      <span class="badge ${statusBadge}">${statusLabel}</span>
    </div>
    <div id="beurtFormHost"></div>
    <div class="beurt-actions" id="beurtActions"></div>`;

  const form = window.Beurteilung.renderForm(document.getElementById('beurtFormHost'), {
    kopf, punkteByKey, individuell: beurteilung?.individuelleBeurteilung || '',
    gespraechAm: beurteilung?.gespraechAm || '', editable,
  });

  renderActions({ user, zuweisung, beurteilung, azubi, editable, form, back }); // defined in Tasks 9–10
});

// Lädt Zuweisung (via Azubi-Liste), bestehende Beurteilung, Azubi-User und leitet den Modus ab.
async function loadContext(zuweisungId) {
  const beurteilung = await DB.getBeurteilung(zuweisungId);      // null erlaubt
  // Zuweisung selbst: aus der Azubi-/Verantwortlichen-Liste beziehen – wir kennen den Azubi erst über die Beurteilung
  // ODER über die Zuweisungsliste. Robust: Zuweisung über den dedizierten Endpoint der Beurteilung mitliefern.
  const zuweisung = await resolveZuweisung(zuweisungId, beurteilung);
  if (!zuweisung) throw new Error('Zuweisung nicht gefunden.');
  const me = DB.getCurrentUser();
  const azubi = await DB.getUser(zuweisung.azubiId);
  // editable, wenn ich verantwortlich bin (E-Mail-Match) ODER developer/admin – der Server prüft es endgültig.
  const email = (me.email || '').toLowerCase();
  const editable = me.role === 'developer' || me.role === 'admin'
    || (!!zuweisung.verantwEmail && zuweisung.verantwEmail.toLowerCase() === email)
    || (me.istAusbilder && !me.istAzubi && me.oid !== zuweisung.azubiId);
  return { zuweisung, beurteilung, azubi, editable: !!editable && me.oid !== zuweisung.azubiId };
}

// Zuweisung DIREKT per Id holen (robust: unabhängig davon, ob der aktuelle Nutzer
// über verantwEmail ODER dauerhafte AusbilderAzubis-Zuordnung betreut, und ob schon
// eine Beurteilung existiert). Der eigentliche Zugriffsschutz läuft zuvor serverseitig
// über getBeurteilung; die Zuweisungs-Basisdaten (Name/Abteilung/Zeitraum) sind hier unkritisch.
async function resolveZuweisung(zuweisungId) {
  try { return await DB.getZuweisung(zuweisungId); }
  catch (e) { return null; }
}

// Rendert die Aktionsleiste (Speichern/Abschließen/PDF/Berichte für Verantwortliche, Kenntnisnahme/PDF für Azubi/DH).
function renderActions(ctx) {
  const { zuweisung, beurteilung, editable, form, user, back } = ctx;
  const host = document.getElementById('beurtActions');
  if (!host) return;
  let id = beurteilung?.id || null;
  const status = beurteilung?.status || (editable ? 'neu' : null);

  if (editable) {
    const abgeschlossen = status === 'abgeschlossen';
    host.innerHTML = `
      <button class="btn btn-ghost" id="beurtPdf">Als PDF</button>
      <button class="btn btn-secondary" id="beurtSave">Entwurf speichern</button>
      <button class="btn btn-primary" id="beurtFinish">${abgeschlossen ? 'Änderungen speichern' : 'Abschließen'}</button>`;

    document.getElementById('beurtSave').addEventListener('click', async () => {
      try {
        const st = form.getState();
        id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
        Toast.success('Gespeichert', 'Entwurf wurde gespeichert.');
      } catch (e) { Toast.error('Fehler', e.message); }
    });

    document.getElementById('beurtFinish').addEventListener('click', async () => {
      const st = form.getState();
      if (st.kriterien.length < 10) { Toast.error('Unvollständig', 'Bitte alle 10 Kriterien bewerten.'); return; }
      try {
        if (abgeschlossen) {
          await DB.patchBeurteilung(id, st);
          Toast.success('Aktualisiert', 'Beurteilung wurde aktualisiert (Azubi wird informiert).');
        } else {
          id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
          await DB.abschliessenBeurteilung(id);
          Toast.success('Abgeschlossen', 'Beurteilung abgeschlossen. Der Azubi wurde benachrichtigt.');
        }
        setTimeout(back, 800); // nach dem Abgeben zurück zur Ausgangsseite
      } catch (e) { Toast.error('Fehler', e.message); }
    });

    document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx)); // Task 10
    return;
  }

  // Read-only (Azubi/DH): Kenntnisnahme + PDF.
  const bestaetigt = !!beurteilung?.kenntnisnahmeAm;
  host.innerHTML = `
    <button class="btn btn-ghost" id="beurtPdf">Als PDF</button>
    <button class="btn btn-primary" id="beurtAck" ${bestaetigt ? 'disabled' : ''}>
      ${bestaetigt ? 'Kenntnisnahme bestätigt' : 'Kenntnisnahme bestätigen'}</button>`;
  document.getElementById('beurtPdf').addEventListener('click', () => exportBeurteilungPdf(ctx));
  if (!bestaetigt) {
    document.getElementById('beurtAck').addEventListener('click', async () => {
      try {
        await DB.kenntnisnahmeBeurteilung(beurteilung.id);
        Toast.success('Bestätigt', 'Kenntnisnahme wurde vermerkt.');
        setTimeout(() => location.reload(), 800);
      } catch (e) { Toast.error('Fehler', e.message); }
    });
  }
}

// Exportiert die Beurteilung als druckfertiges A4-HTML (Print-Muster wie berichtsheft-export.js).
function exportBeurteilungPdf(ctx) {
  const { zuweisung, beurteilung, azubi, form } = ctx;
  const B = window.Beurteilung;

  // Punkte: im Edit-Modus der Live-Stand, sonst der gespeicherte.
  const punkteByKey = {};
  if (form) { form.getState().kriterien.forEach(k => { punkteByKey[k.kriteriumKey] = k.punkte; }); }
  else { (beurteilung?.kriterien || []).forEach(k => { punkteByKey[k.kriteriumKey] = k.punkte; }); }
  const indiv = form ? form.getState().individuelleBeurteilung : (beurteilung?.individuelleBeurteilung || '');
  const gespraech = form ? form.getState().gespraechAm : (beurteilung?.gespraechAm || '');
  const r = B.berechne(punkteByKey);
  const esc = window.escapeHtml;
  const f1 = n => (Math.round(n * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const rowsFor = block => B.BLOECKE[block].keys.map(key => {
    const k = B.KRITERIEN.find(x => x.key === key);
    const p = punkteByKey[key];
    const stufe = (p == null || p === '') ? null : B.stufeFuerPunkte(p);
    const cells = B.STUFEN.map(s => `<td class="mark">${stufe === s.stufe ? '✕' : ''}</td>`).join('');
    return `<tr><th class="krit">${esc(k.label)}</th>${cells}<td class="pkt">${p ?? ''}</td></tr>`;
  }).join('');
  const blockSum = block => f1(r.bloecke[block]);

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Beurteilung – ${esc(displayName(azubi?.name || ''))}</title><style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family:'Open Sans','Segoe UI',Arial,sans-serif; color:#1A1A1A; font-size:10.5pt; background:#5b5b5b; margin:0; }
  .toolbar { position:sticky; top:0; background:#1A1A1A; color:#fff; padding:10px 16px; }
  .toolbar button { background:#FFC300; border:0; border-radius:8px; padding:8px 16px; font-weight:700; cursor:pointer; }
  .sheet { width:210mm; min-height:297mm; background:#fff; margin:14px auto; padding:14mm; box-shadow:0 6px 24px rgba(0,0,0,.35); }
  h1 { font-size:15pt; margin:0 0 4mm; }
  table { border-collapse:collapse; width:100%; }
  .stamm td { padding:1.5mm 3mm; font-size:9.5pt; border:1px solid #999; }
  .grid th, .grid td { border:1px solid #999; padding:1.5mm 2mm; font-size:8.5pt; vertical-align:middle; }
  .grid .krit { text-align:left; width:34%; }
  .grid .mark { text-align:center; width:8%; font-weight:700; }
  .grid .blk th { background:#efefef; text-align:left; }
  .grid .sum td, .grid .sum th { background:#f6f6f6; font-weight:700; }
  .fuss { margin-top:4mm; text-align:right; }
  .fuss .note { font-size:14pt; font-weight:700; }
  .indiv { border:1px solid #999; padding:3mm; margin-top:4mm; min-height:30mm; white-space:pre-wrap; }
  .sign { display:flex; justify-content:space-between; margin-top:16mm; gap:8mm; }
  .sign div { flex:1; border-top:1px solid #333; padding-top:2mm; font-size:8pt; text-align:center; }
  @media print { @page { size:A4; margin:0; } body { background:#fff; } .toolbar { display:none; } .sheet { margin:0; box-shadow:none; } }
</style></head><body>
  <div class="toolbar"><button type="button" onclick="window.print()">Als PDF speichern / Drucken</button></div>
  <section class="sheet">
    <h1>Beurteilungsbogen für Auszubildende und DH-Studenten</h1>
    <table class="stamm"><tr><td><b>Name:</b> ${esc(displayName(azubi?.name || ''))}</td><td><b>Abteilung:</b> ${esc(zuweisung.abteilung || '')}</td></tr>
      <tr><td><b>Zeitraum:</b> ${esc(DateUtil.formatDate(zuweisung.von))} – ${esc(DateUtil.formatDate(zuweisung.bis))}</td>
          <td><b>Beurteilende/-r:</b> ${esc(displayName(zuweisung.verantwName || ''))}</td></tr>
      <tr><td colspan="2"><b>Ausbildungs-/Studienberuf:</b> ${esc(azubi?.beruf || azubi?.studiengang || '')}</td></tr></table>
    <table class="grid" style="margin-top:4mm">
      <thead><tr><th>Beurteilungskriterien</th>${B.STUFEN.map(s => `<th>${s.stufe}<br><small>${s.max}–${s.min}</small></th>`).join('')}<th>Punkte</th></tr></thead>
      <tbody>
        <tr class="blk"><th colspan="8">A · ${esc(B.BLOCK_LABELS.A)}</th></tr>${rowsFor('A')}
        <tr class="sum"><th colspan="7">Summe : Anzahl Kriterien (${B.BLOECKE.A.keys.length})</th><td>${blockSum('A')}</td></tr>
        <tr class="blk"><th colspan="8">B · ${esc(B.BLOCK_LABELS.B)}</th></tr>${rowsFor('B')}
        <tr class="sum"><th colspan="7">Summe : Anzahl Kriterien (${B.BLOECKE.B.keys.length})</th><td>${blockSum('B')}</td></tr>
        <tr class="blk"><th colspan="8">C · ${esc(B.BLOCK_LABELS.C)}</th></tr>${rowsFor('C')}
        <tr class="sum"><th colspan="7">Summe : Anzahl Kriterien (${B.BLOECKE.C.keys.length})</th><td>${blockSum('C')}</td></tr>
      </tbody>
    </table>
    <div class="fuss">
      <div>Summe (ØA+ØB+ØC): <b>${f1(r.summe)}</b></div>
      <div>Beurteilungspunkte ÷ 3 = Gesamt: <b>${f1(r.gesamt)}</b></div>
      <div class="note">Note: ${r.note == null ? '–' : r.note.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
    </div>
    <div><b>Individuelle Beurteilung:</b><div class="indiv">${esc(indiv)}</div></div>
    <div class="sign">
      <div>Unterschrift des/r Beurteilenden</div>
      <div>Unterschrift des/r Ausbildungsleiters/-in</div>
      <div>Unterschrift des/r Auszubildenden</div>
    </div>
    <p style="margin-top:6mm;font-size:8.5pt">Beurteilungsgespräch durchgeführt und Kopie erhalten am:
      ${gespraech ? esc(DateUtil.formatDate(gespraech)) : '________________'}</p>
  </section>
  <script>if (window.self===window.top){window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},300);});}<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { Toast.error('Pop-up blockiert', 'Bitte Pop-ups erlauben und erneut versuchen.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}
