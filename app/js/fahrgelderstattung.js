/* ===================================================================
   FAHRGELDERSTATTUNG.JS
   Monatliche Fahrgelderstattung als Excel oder PDF erstellen.

   Ablauf:
     1. Erstmalig: „Formular erstellen" → Modal mit Stammdaten (Name kommt
        aus dem Profil, Kostenstelle vorausgefüllt) ODER bestehendes
        Fahrgeld-Dokument (Excel/PDF) hochladen → Daten werden übernommen.
     2. Danach: Monat wählen (Berufsschultage kommen automatisch aus dem
        Berichtsheft = Tage mit Ort „Schule") → Excel/PDF erzeugen.
   Stammdaten: Backend /api/fahrtgeld/konfig. Erzeugung: FahrtgeldCore.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-fahrgelderstattung', [{ label: 'Fahrgelderstattung', href: 'fahrgelderstattung.html' }]);
  if (!user) return;
  document.body.dataset.page = 'fahrgelderstattung';

  const main = document.getElementById('mainContent');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const FELD_LABELS = {
    name: 'Name', persNr: 'Personalnummer', kst: 'Kostenstelle',
    vonHaltestelle: 'Strecke von', nachHaltestelle: 'Strecke nach', betragProTag: 'Tagessatz',
  };
  // Pflichtfelder fürs sinnvolle Ausfüllen (KST ist konstant/vorausgefüllt).
  const PFLICHT = ['name', 'persNr', 'vonHaltestelle', 'nachHaltestelle', 'betragProTag'];
  // Kostenstelle ist bei Putzmeister-Azubis gleich → als Default vorbelegen (editierbar).
  const DEFAULT_KST = '10000956';

  let konfig = null;     // {name, persNr, kst, vonHaltestelle, nachHaltestelle, betragProTag}
  let monateInfo = [];   // [{ monatKey, tage:[{datum}], summe, ueberzaehlig }]
  let selectedMonatKey = null;  // gewählter Monat, überlebt Re-Renders

  // Download-Merker je Monat (lokal je Azubi) — grüner Haken in der Monatsliste.
  const DL_KEY = `fahrtgeldDownloads_${user.oid || user.id}`;
  let downloads = {};
  try { downloads = JSON.parse(localStorage.getItem(DL_KEY) || '{}'); } catch (e) { downloads = {}; }
  function markDownloaded(monatKey) {
    downloads[monatKey] = true;
    try { localStorage.setItem(DL_KEY, JSON.stringify(downloads)); } catch (e) {}
  }

  // Unterschrift (lokal je Azubi, localStorage). Quelle: hochgeladenes Dokument
  // (Excel auto-extrahiert) oder separates Bild. Wird in die Datei eingebettet.
  const SIG_KEY = `fahrtgeldUnterschrift_${user.oid || user.id}`;
  let unterschrift = null;
  try { unterschrift = JSON.parse(localStorage.getItem(SIG_KEY) || 'null'); } catch (e) { unterschrift = null; }

  function arrayBufferToDataUrl(ab, ext) {
    const b = new Uint8Array(ab); let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${btoa(s)}`;
  }
  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function setSignature(sig) {
    unterschrift = sig;
    try { sig ? localStorage.setItem(SIG_KEY, JSON.stringify(sig)) : localStorage.removeItem(SIG_KEY); } catch (e) {}
  }
  // "Vorname Nachname" → "Nachname, Vorname" (Format des Formulars).
  function toNachnameVorname(full) {
    const t = (full || '').trim();
    if (!t || t.includes(',')) return t;
    const p = t.split(/\s+/);
    if (p.length < 2) return t;
    return `${p[p.length - 1]}, ${p.slice(0, -1).join(' ')}`;
  }

  /* ── Berufsschultage aus dem Berichtsheft (Tage mit Ort „Schule") ── */
  function sammleSchultage(wochen) {
    const seen = new Set(); const tage = [];
    for (const w of wochen) {
      const wocheSchule = (w.wochenOrt || '').includes('Schule');
      for (const t of (w.tage || [])) {
        if (!t.datum) continue;
        const ort = t.ort || (wocheSchule ? 'Schule' : '');
        if (!ort.includes('Schule')) continue;
        if (t.anwesenheit === 'Wochenende' || DateUtil.isWeekend(t.datum)) continue;
        if (seen.has(t.datum)) continue;
        seen.add(t.datum); tage.push({ datum: t.datum });
      }
    }
    tage.sort((a, b) => a.datum.localeCompare(b.datum));
    return tage;
  }
  function gruppiereNachMonat(schultage) {
    const map = new Map();
    for (const t of schultage) {
      const mk = t.datum.slice(0, 7);
      if (!map.has(mk)) map.set(mk, []);
      map.get(mk).push(t);
    }
    return [...map.entries()]
      .map(([monatKey, tage]) => ({
        monatKey, tage,
        summe: +(Math.min(tage.length, 10) * (Number(konfig?.betragProTag) || 0)).toFixed(2),
        ueberzaehlig: tage.length > 10,
      }))
      .sort((a, b) => b.monatKey.localeCompare(a.monatKey));
  }
  function fehlendeFelder() {
    return PFLICHT.filter(k => {
      const v = konfig?.[k];
      if (k === 'betragProTag') return !(Number(v) > 0);
      return !v || !String(v).trim();
    });
  }
  function fmtBetrag(n) { return (Number(n) || 0).toFixed(2).replace('.', ','); }

  /* ── Empty-State: Formular anlegen oder bestehendes hochladen ────── */
  function buildEmptyState() {
    const logoBtn = (id, src, label) => `
      <button class="fg-logo-btn" id="${id}" type="button"
        style="display:flex;flex-direction:column;align-items:center;gap:var(--sp-2);padding:var(--sp-4) var(--sp-6);min-width:128px;
               background:var(--pm-grey-50,rgba(255,255,255,0.05));border:1px solid var(--pm-grey-200,rgba(255,255,255,0.12));
               border-radius:var(--radius-lg,14px);cursor:pointer;color:inherit;font:inherit">
        <img src="${src}" alt="" style="width:42px;height:42px;object-fit:contain">
        <span style="font-weight:600;font-size:var(--text-sm)">${label}</span>
      </button>`;
    return `
      <div class="card" style="text-align:center;padding:var(--sp-10,40px) var(--sp-6)">
        <h2 style="margin:0;font-family:var(--font-heading);font-size:var(--text-xl)">Fahrgeld-Formular einrichten</h2>
        <p class="page-subtitle" style="max-width:54ch;margin:var(--sp-2) auto var(--sp-6)">
          Lege einmalig deine Daten an — danach erstellst du jeden Monat per Klick die Fahrgelderstattung als Excel oder PDF.
        </p>
        <button class="btn btn-primary" id="fg-create" type="button"
                style="font-size:var(--text-base);padding:var(--sp-3) var(--sp-7,32px)">Formular erstellen</button>
        <div style="display:flex;align-items:center;gap:var(--sp-3);max-width:340px;margin:var(--sp-8,32px) auto var(--sp-6);color:var(--pm-grey-400)">
          <span style="flex:1;height:1px;background:currentColor;opacity:.35"></span>
          <span style="font-size:var(--text-sm)">oder</span>
          <span style="flex:1;height:1px;background:currentColor;opacity:.35"></span>
        </div>
        <p class="page-subtitle" style="margin:0 0 var(--sp-4)">Bestehendes Fahrgeld-Dokument hochladen</p>
        <div style="display:flex;gap:var(--sp-4);justify-content:center;flex-wrap:wrap">
          ${logoBtn('fg-upload-excel', 'img/excel-logo.png', 'Excel')}
          ${logoBtn('fg-upload-pdf', 'img/pdf-logo.png', 'PDF')}
        </div>
      </div>`;
  }

  /* ── Stammdaten + Unterschrift (eine Karte, zwei Sektionen) ─────── */
  function buildStammdatenCard() {
    const zeile = (key) => {
      const v = konfig?.[key];
      const text = key === 'betragProTag' ? (Number(v) > 0 ? `${fmtBetrag(v)} €` : '') : (v || '');
      return `
        <div class="profil-data-item">
          <div class="profil-data-label">${FELD_LABELS[key]}</div>
          <div class="profil-data-value">${text ? esc(text) : '<span style="color:var(--warn,#c0392b)">fehlt</span>'}</div>
        </div>`;
    };
    const has = !!(unterschrift && unterschrift.dataUrl);
    return `
      <div class="card" style="margin-bottom:var(--sp-6)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--sp-3);flex-wrap:wrap">
          <div>
            <h2 style="margin:0 0 var(--sp-1);font-family:var(--font-heading)">Stammdaten</h2>
            <p class="page-subtitle" style="margin:0">Werden in jede Fahrgelderstattung übernommen.</p>
          </div>
          <div style="display:flex;gap:var(--sp-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-outline btn-sm" id="fg-upload-doc" type="button">Aus Dokument übernehmen</button>
            <button class="btn btn-outline btn-sm" id="fg-edit" type="button">Bearbeiten</button>
          </div>
        </div>
        <div class="profil-data-grid">
          ${['name', 'persNr', 'kst', 'vonHaltestelle', 'nachHaltestelle', 'betragProTag'].map(zeile).join('')}
        </div>
        <hr class="fg-divider">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--sp-3);flex-wrap:wrap">
          <div>
            <h3 style="margin:0 0 var(--sp-1);font-family:var(--font-heading);font-size:var(--text-md)">Unterschrift</h3>
            <p class="page-subtitle" style="margin:0;max-width:60ch">${has
              ? 'Wird in jede erzeugte Datei eingefügt (Datum = Erstelltag).'
              : 'Optional — ohne Unterschrift wird nur das Datum gesetzt.'}</p>
          </div>
          <div style="display:flex;gap:var(--sp-2);flex-shrink:0">
            <button class="btn btn-outline btn-sm" id="fg-sig-upload" type="button">${has ? 'Ersetzen' : 'Bild hochladen'}</button>
            ${has ? `<button class="btn btn-outline btn-sm" id="fg-sig-remove" type="button">Entfernen</button>` : ''}
          </div>
        </div>
        ${has ? `<div style="margin-top:var(--sp-4);padding:var(--sp-3);background:var(--pm-grey-50,rgba(255,255,255,0.04));border-radius:var(--radius-md,8px);display:inline-block">
          <img src="${esc(unterschrift.dataUrl)}" alt="Unterschrift" style="max-height:64px;max-width:240px;display:block">
        </div>` : ''}
      </div>`;
  }

  /* ── Monat wählen (better-ess Monat-Rows) ───────────────────────── */
  function aktiverMonat() {
    return monateInfo.find(m => m.monatKey === selectedMonatKey) || monateInfo[0] || null;
  }
  function buildMonatCard() {
    if (!monateInfo.length) {
      return `
        <div class="card" style="margin-bottom:var(--sp-6)">
          <h2 style="margin:0 0 var(--sp-2);font-family:var(--font-heading)">Keine Berufsschultage erkannt</h2>
          <p class="page-subtitle" style="margin:0 0 var(--sp-4);max-width:60ch">
            Sobald im Berichtsheft Tage mit dem Ort „Schule" erfasst sind, erscheinen hier die Monate zur Auswahl.
            Mit „Formular erstellen" siehst du trotzdem schon, wie dein Formular aussehen wird.
          </p>
          <button class="btn btn-primary" id="fg-erstellen" type="button">Formular erstellen</button>
        </div>`;
    }
    const aktiv = aktiverMonat();
    const dlCheck = `
      <span class="fg-dl-check" data-tooltip="Formular heruntergeladen" aria-label="Formular heruntergeladen" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </span>`;
    return `
      <div class="card" style="margin-bottom:var(--sp-6)">
        <h2 style="margin:0 0 var(--sp-1);font-family:var(--font-heading)">Monat auswählen</h2>
        <p class="page-subtitle" style="margin:0 0 var(--sp-5);max-width:64ch">
          Es werden nur Tage mit dem Ort „Schule" gefüllt (max. 10 pro Monat — so viele Zeilen hat das Formular).
        </p>
        <div class="fg-monate">
          ${monateInfo.map(m => `
            <label class="fg-monat-row">
              <input type="radio" name="fg-monat" value="${m.monatKey}" ${aktiv && m.monatKey === aktiv.monatKey ? 'checked' : ''}>
              <span class="fg-monat-row__titel">
                <span class="fg-monat-row__name">${esc(FahrtgeldCore.formatMonatLabel(m.monatKey))}</span>
                <span class="fg-monat-row__detail">
                  ${m.tage.length} Berufsschultag${m.tage.length === 1 ? '' : 'e'} · ${fmtBetrag(m.summe)} €${m.ueberzaehlig ? ` · <span style="color:var(--warn,#c0392b)">${m.tage.length - 10} überzählig (max. 10)</span>` : ''}
                </span>
              </span>
              ${downloads[m.monatKey] ? dlCheck : ''}
            </label>`).join('')}
        </div>
        <button class="btn btn-primary" id="fg-erstellen" type="button">Formular erstellen</button>
      </div>`;
  }

  /* ── Formular-Vorschau: Papier-Replik des F6344-1 (editierbar) ───── */
  function buildSheet(monat) {
    const tage = monat ? monat.tage.slice(0, 10) : [];
    const summe = monat ? monat.summe : 0;
    const heute = new Date();
    const heuteStr = `${String(heute.getDate()).padStart(2, '0')}.${String(heute.getMonth() + 1).padStart(2, '0')}.${heute.getFullYear()}`;
    const isoZuDeutsch = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
    const monatLabel = monat ? FahrtgeldCore.formatMonatLabel(monat.monatKey) : '';
    const zeilen = Array.from({ length: 10 }, (_, i) => {
      const t = tage[i];
      return `
        <tr>
          <td contenteditable="true">${t ? isoZuDeutsch(t.datum) : ''}</td>
          <td contenteditable="true">${t ? esc(konfig?.vonHaltestelle || '') : ''}</td>
          <td contenteditable="true">${t ? esc(konfig?.nachHaltestelle || '') : ''}</td>
          <td contenteditable="true">${t ? fmtBetrag(konfig?.betragProTag) : ''}</td>
        </tr>`;
    }).join('');
    return `
      <div class="fg-sheet">
        <img class="fg-sheet__logo" src="img/pm-form-logo.jpg" alt="Putzmeister">
        <div class="fg-sheet__titel">Fahrgelderstattung für Berufsschulbesuche</div>
        <div class="fg-sheet__meta">
          <span class="fg-sheet__meta-label">Monat / Jahr:</span><span class="fg-sheet__meta-wert">${esc(monatLabel)}</span>
          <span class="fg-sheet__meta-label">Pers.-Nr.:</span><span class="fg-sheet__meta-wert">${esc(konfig?.persNr || '')}</span>
          <span class="fg-sheet__meta-label">Name, Vorname:</span><span class="fg-sheet__meta-wert">${esc(konfig?.name || '')}</span>
          <span class="fg-sheet__meta-label">KST:</span><span class="fg-sheet__meta-wert">${esc(konfig?.kst || '')}</span>
        </div>
        <table class="fg-sheet__tabelle">
          <colgroup><col class="fg-col-datum"><col><col><col class="fg-col-betrag"></colgroup>
          <thead>
            <tr><th rowspan="2">Datum</th><th colspan="2">Fahrstrecke (Hin- und Rückfahrt)</th><th rowspan="2">Betrag<br>in €</th></tr>
            <tr><th>von</th><th>nach</th></tr>
          </thead>
          <tbody>${zeilen}</tbody>
        </table>
        <div class="fg-sheet__fuss">
          <div>
            <div class="fg-sheet__sig-kopf">Auszubildender:</div>
            <div class="fg-sheet__sig-bereich">${(unterschrift && unterschrift.dataUrl) ? `<img src="${esc(unterschrift.dataUrl)}" alt="Unterschrift">` : ''}<span>${heuteStr}</span></div>
            <div class="fg-sheet__sig-caption">Datum / Unterschrift</div>
          </div>
          <div>
            <div class="fg-sheet__sig-kopf">Ausbilderin:</div>
            <div class="fg-sheet__sig-bereich"></div>
            <div class="fg-sheet__sig-caption">Unterschrift</div>
          </div>
          <div>
            <div class="fg-sheet__sig-kopf">Entgeltabrechnung:</div>
            <div class="fg-sheet__sig-bereich"></div>
            <div class="fg-sheet__sig-caption">Unterschrift</div>
          </div>
          <div class="fg-sheet__summe-box">
            <div class="fg-sheet__summe-wert" id="fg-sheet-summe">${fmtBetrag(summe)}</div>
            <div class="fg-sheet__summe-label">Summe</div>
          </div>
        </div>
      </div>`;
  }

  function buildVorschauModal() {
    const monat = aktiverMonat();
    return `
      <div class="modal-overlay" id="fgVorschauModal" role="dialog" aria-modal="true" aria-label="Formular-Vorschau">
        <div class="modal">
          <div class="modal__header">
            <span class="modal__title">Vorschau</span>
            <button class="modal__close" data-modal-close aria-label="Schließen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body">
            <p class="hint" style="margin:0 0 var(--sp-4)">Werte in der Tabelle lassen sich direkt anklicken und anpassen — der Download übernimmt sie.</p>
            <div id="fg-vorschau-sheet">${buildSheet(monat)}</div>
          </div>
          <div class="modal__footer" style="justify-content:center">
            <div class="fg-dl-buttons">
              <button class="fg-dl-btn" id="fg-gen-xlsx" type="button">
                <img src="img/excel-logo.png" alt="">Excel herunterladen
              </button>
              <span class="fg-dl-or">oder</span>
              <button class="fg-dl-btn fg-dl-btn--pdf" id="fg-gen-pdf" type="button">
                <img src="img/pdf-logo.png" alt="">PDF herunterladen
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ── Modal: Stammdaten anlegen/bearbeiten ────────────────────────── */
  function modalValues() {
    return {
      name: konfig?.name || toNachnameVorname(user.name || ''),
      persNr: konfig?.persNr || '',
      kst: konfig?.kst || DEFAULT_KST,
      vonHaltestelle: konfig?.vonHaltestelle || '',
      nachHaltestelle: konfig?.nachHaltestelle || '',
      betragProTag: (konfig?.betragProTag && Number(konfig.betragProTag) > 0) ? Number(konfig.betragProTag) : '',
    };
  }
  function buildModal() {
    const v = modalValues();
    const grp = (id, label, val, attrs = '', hint = '') => `
      <div class="form-group">
        <label class="form-label" for="${id}">${label}</label>
        <input class="form-control" id="${id}" ${attrs} value="${esc(val)}">
        ${hint ? `<p class="hint" style="margin:4px 0 0;font-size:11px">${hint}</p>` : ''}
      </div>`;
    return `
      <div class="modal-overlay" id="fgModal" role="dialog" aria-modal="true" aria-label="Fahrgeld-Formular">
        <div class="modal" style="max-width:560px">
          <div class="modal__header">
            <span class="modal__title">Fahrgeld-Formular</span>
            <button class="modal__close" data-modal-close aria-label="Schließen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body">
            <p class="hint" style="margin:0 0 var(--sp-4)">Name kommt aus deinem Profil, die Kostenstelle ist vorausgefüllt. Strecke und Tagessatz bitte eintragen.</p>
            ${grp('fgm-name', 'Name', v.name, 'placeholder="Nachname, Vorname"')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--sp-3)">
              ${grp('fgm-persNr', 'Personalnummer', v.persNr, 'placeholder="z.B. 123456" inputmode="numeric"')}
              ${grp('fgm-kst', 'Kostenstelle', v.kst, 'inputmode="numeric"', 'Für alle Azubis gleich')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--sp-3)">
              ${grp('fgm-vonHaltestelle', 'Strecke von', v.vonHaltestelle, 'placeholder="Start-Haltestelle"')}
              ${grp('fgm-nachHaltestelle', 'Strecke nach', v.nachHaltestelle, 'placeholder="Ziel-Haltestelle"')}
            </div>
            <div class="form-group" style="max-width:200px">
              <label class="form-label" for="fgm-betragProTag">Tagessatz (€)</label>
              <input class="form-control" id="fgm-betragProTag" type="number" step="0.01" min="0" placeholder="z.B. 8,30" value="${v.betragProTag}">
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn-ghost" data-modal-close type="button">Abbrechen</button>
            <button class="btn btn-primary" id="fg-modal-save" type="button">Speichern</button>
          </div>
        </div>
      </div>`;
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  function render() {
    const needsSetup = fehlendeFelder().length > 0;
    main.innerHTML = `
      <div class="page-header" style="margin-bottom:var(--sp-6)">
        <div class="page-header__left">
          <h1 class="page-title">Fahrgelderstattung</h1>
        </div>
      </div>
      ${needsSetup
        ? buildEmptyState()
        : `${buildStammdatenCard()}${buildMonatCard()}${buildVorschauModal()}`}
      ${buildModal()}
      <input type="file" id="fg-doc-input" style="display:none"
             accept=".xlsx,.xls,.xlsm,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      <input type="file" id="fg-sig-input" style="display:none" accept="image/png,image/jpeg,.png,.jpg,.jpeg">
    `;
    bind();
    Modal.init?.();
    Toast.init?.();
  }

  /* ── Events ─────────────────────────────────────────────────────── */
  function bind() {
    // accept je nach Klick-Quelle setzen: Excel-Button filtert auf Excel,
    // PDF-Button auf PDF; „Aus Dokument übernehmen" erlaubt beides.
    const ACCEPT_EXCEL = '.xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    const ACCEPT_PDF = '.pdf,application/pdf';
    const openDoc = (accept) => {
      const inp = document.getElementById('fg-doc-input');
      if (!inp) return;
      inp.accept = accept;
      inp.click();
    };
    document.getElementById('fg-create')?.addEventListener('click', () => Modal.open('fgModal'));
    document.getElementById('fg-edit')?.addEventListener('click', () => Modal.open('fgModal'));
    document.getElementById('fg-modal-save')?.addEventListener('click', saveModal);
    document.getElementById('fg-upload-excel')?.addEventListener('click', () => openDoc(ACCEPT_EXCEL));
    document.getElementById('fg-upload-pdf')?.addEventListener('click', () => openDoc(ACCEPT_PDF));
    document.getElementById('fg-upload-doc')?.addEventListener('click', () => openDoc(`${ACCEPT_EXCEL},${ACCEPT_PDF}`));
    document.getElementById('fg-doc-input')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) uploadDokument(f); e.target.value = ''; });
    document.getElementById('fg-sig-upload')?.addEventListener('click', () => document.getElementById('fg-sig-input')?.click());
    document.getElementById('fg-sig-input')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) uploadSignatureImage(f); e.target.value = ''; });
    document.getElementById('fg-sig-remove')?.addEventListener('click', () => { setSignature(null); Toast.info('Entfernt', 'Unterschrift entfernt.'); render(); });
    document.getElementById('fg-gen-xlsx')?.addEventListener('click', () => generate('excel'));
    document.getElementById('fg-gen-pdf')?.addEventListener('click', () => generate('pdf'));
    document.getElementById('fg-erstellen')?.addEventListener('click', oeffneVorschau);
    // Monatswechsel: Vorschau-Replik austauschen (verwirft dortige Edits).
    main.querySelectorAll('input[name="fg-monat"]').forEach(r => r.addEventListener('change', (e) => {
      selectedMonatKey = e.target.value;
      const sheet = document.getElementById('fg-vorschau-sheet');
      if (sheet) sheet.innerHTML = buildSheet(aktiverMonat());
    }));
    // Editierbare Zellen: Summe live aus der Betrag-Spalte nachrechnen.
    document.getElementById('fg-vorschau-sheet')?.addEventListener('input', (e) => {
      if (!e.target.closest('td[contenteditable]')) return;
      const sheet = document.getElementById('fg-vorschau-sheet');
      const summe = [...sheet.querySelectorAll('tbody tr')]
        .reduce((s, tr) => s + parseDeutsch(tr.cells[3].textContent), 0);
      const el = document.getElementById('fg-sheet-summe');
      if (el) el.textContent = fmtBetrag(summe);
    });
  }

  function oeffneVorschau() {
    const sheet = document.getElementById('fg-vorschau-sheet');
    if (sheet) sheet.innerHTML = buildSheet(aktiverMonat()); // frisch, verwirft alte Edits
    Modal.open('fgVorschauModal');
  }

  function parseDeutsch(s) {
    const n = parseFloat(String(s || '').trim().replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  async function saveModal() {
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const neu = {
      name: val('fgm-name'),
      persNr: val('fgm-persNr'),
      kst: val('fgm-kst'),
      vonHaltestelle: val('fgm-vonHaltestelle'),
      nachHaltestelle: val('fgm-nachHaltestelle'),
      betragProTag: Number(val('fgm-betragProTag').replace(',', '.')) || 0,
    };
    const btn = document.getElementById('fg-modal-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Speichere …'; }
    try {
      await DB.saveFahrtgeldKonfig(neu);
      konfig = neu;
      monateInfo = gruppiereNachMonat(monateInfo.flatMap(m => m.tage));
      Modal.closeAll?.();
      Toast.success('Gespeichert', 'Fahrgeld-Stammdaten gespeichert.');
      render();
    } catch (err) {
      console.error('Fahrtgeld-Konfig speichern fehlgeschlagen:', err);
      Toast.error('Fehler', err.message || 'Stammdaten konnten nicht gespeichert werden.');
      if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    }
  }

  /* Bestehendes Fahrgeld-Dokument (Excel/PDF) → Stammdaten + Unterschrift
     übernehmen; danach Modal zur Kontrolle öffnen. */
  async function uploadDokument(file) {
    try {
      const ab = await file.arrayBuffer();
      const res = await FahrtgeldCore.extrahiereKonstantenAusTemplate(ab);
      if (!res.ok) { Toast.error('Nicht erkannt', res.fehler || 'Dokument konnte nicht gelesen werden.'); return; }
      const neu = { ...(konfig || {}), ...res.konstanten };
      if (!neu.kst) neu.kst = konfig?.kst || DEFAULT_KST; // PDF liefert keine KST
      konfig = neu;
      monateInfo = gruppiereNachMonat(monateInfo.flatMap(m => m.tage));
      let sigHinweis = '';
      if (res.unterschriftAuto) {
        setSignature({ dataUrl: arrayBufferToDataUrl(res.unterschriftAuto.bytes, res.unterschriftAuto.extension), extension: res.unterschriftAuto.extension });
        sigHinweis = ' inkl. Unterschrift';
      }
      const quelle = res.format === 'pdf' ? 'PDF' : 'Excel';
      if (fehlendeFelder().length === 0) {
        // Alles vollständig aus dem Dokument gelesen → direkt speichern,
        // kein Kontroll-Modal. Korrigieren geht jederzeit über „Bearbeiten".
        await DB.saveFahrtgeldKonfig(konfig);
        render();
        Toast.success('Übernommen', `Daten aus ${quelle} gelesen${sigHinweis} und gespeichert.`);
      } else {
        // Es fehlen Felder (z. B. KST aus PDF nicht lesbar) → Modal zum Ergänzen.
        render();
        Modal.open('fgModal');
        Toast.success('Übernommen', `Daten aus ${quelle} gelesen${sigHinweis}. Bitte fehlende Felder ergänzen und speichern.`);
      }
    } catch (err) {
      console.error('Dokument-Upload fehlgeschlagen:', err);
      Toast.error('Fehler', err.message || String(err));
    }
  }

  async function uploadSignatureImage(file) {
    if (!/\.(png|jpe?g)$/i.test(file.name) && !['image/png', 'image/jpeg'].includes(file.type)) {
      Toast.warning('Format', 'Bitte ein PNG oder JPG hochladen.'); return;
    }
    if (file.size > 2 * 1024 * 1024) { Toast.warning('Zu groß', 'Maximal 2 MB.'); return; }
    try {
      const ab = await file.arrayBuffer();
      const ext = (/\.png$/i.test(file.name) || file.type === 'image/png') ? 'png' : 'jpeg';
      setSignature({ dataUrl: arrayBufferToDataUrl(ab, ext), extension: ext });
      Toast.success('Gespeichert', 'Unterschrift hinterlegt.');
      render();
    } catch (err) { Toast.error('Fehler', err.message || String(err)); }
  }

  /* Zeilen aus der (ggf. editierten) Vorschau-Tabelle einsammeln. */
  function leseVorschauZeilen() {
    const sheet = document.getElementById('fg-vorschau-sheet');
    if (!sheet) return [];
    return [...sheet.querySelectorAll('tbody tr')]
      .map(tr => ({
        datumText: tr.cells[0].textContent.trim(),
        von: tr.cells[1].textContent.trim(),
        nach: tr.cells[2].textContent.trim(),
        betrag: parseDeutsch(tr.cells[3].textContent),
      }))
      .filter(z => z.datumText || z.von || z.nach || z.betrag > 0);
  }

  async function generate(format) {
    const zeilen = leseVorschauZeilen();
    if (!zeilen.length) { Toast.warning('Keine Tage', 'Die Tabelle ist leer — kein Inhalt für das Formular.'); return; }
    const monat = aktiverMonat();
    const monatKey = monat ? monat.monatKey : new Date().toISOString().slice(0, 7);

    const btnId = format === 'pdf' ? 'fg-gen-pdf' : 'fg-gen-xlsx';
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;
    try {
      const url = format === 'pdf' ? 'templates/fahrgeld-vorlage.pdf' : 'templates/fahrgeld-vorlage.xlsx';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Vorlage nicht ladbar (HTTP ${resp.status})`);
      const templateBytes = await resp.arrayBuffer();
      const fn = format === 'pdf' ? FahrtgeldCore.generiereFahrtgeldPdf : FahrtgeldCore.generiereFahrtgeldExcel;
      const sig = (unterschrift && unterschrift.dataUrl)
        ? { bytes: dataUrlToBytes(unterschrift.dataUrl), ext: unterschrift.extension || 'png' }
        : null;
      const { blob, dateiname } = await fn({
        templateBytes,
        monatKey,
        zeilen,
        schultage: monat ? monat.tage : [],
        konstanten: konfig || {},
        unterschriftBytes: sig ? sig.bytes : undefined,
        unterschriftExtension: sig ? sig.ext : undefined,
      });
      FahrtgeldCore.triggerDownload(blob, dateiname);
      Toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} erstellt`, dateiname);
      markDownloaded(monatKey);
      zeigeDownloadHaken(monatKey); // ohne Voll-Render, damit Modal + Edits bleiben
    } catch (err) {
      console.error('Fahrgeld-Generierung fehlgeschlagen:', err);
      Toast.error('Fehler', err.message || String(err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* Grünen Haken an der Monat-Row nachziehen, ohne neu zu rendern. */
  function zeigeDownloadHaken(monatKey) {
    const radio = main.querySelector(`input[name="fg-monat"][value="${monatKey}"]`);
    const row = radio?.closest('.fg-monat-row');
    if (!row || row.querySelector('.fg-dl-check')) return;
    row.insertAdjacentHTML('beforeend', `
      <span class="fg-dl-check" data-tooltip="Formular heruntergeladen" aria-label="Formular heruntergeladen" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </span>`);
  }

  /* ── Laden ──────────────────────────────────────────────────────── */
  try {
    const [k, wochen] = await Promise.all([
      DB.getFahrtgeldKonfig().catch(() => null),
      DB.getWochenFuerAzubi(user.id).catch(() => []),
    ]);
    konfig = k || null;
    monateInfo = gruppiereNachMonat(sammleSchultage(wochen));
  } catch (err) {
    console.error('Fahrgeld-Seite laden fehlgeschlagen:', err);
  }
  render();
});
