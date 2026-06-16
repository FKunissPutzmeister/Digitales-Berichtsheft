/* ===================================================================
   WOCHENANSICHT.JS
   =================================================================== */

const quillInstances = {};

const QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
  ['bold', 'italic', 'underline'],
  ['link'],
  [{ list: 'bullet' }, { list: 'ordered' }],
  ['clean'],
  [{ indent: '-1' }, { indent: '+1' }],
  ['image'],
  ['blockquote'],
  // Hinweis: KEINE 'undo'/'redo'-Buttons. Quill liefert für diese
  // Custom-Formate kein Icon, und die ::before-Pfeile aus quill-editor.css
  // greifen nicht (Quill hängt die Toolbar als GESCHWISTER von
  // .ql-editor-wrap ein, nicht als Nachfahre) → es entstanden zwei leere,
  // unsichtbare Toolbar-Felder. Rückgängig/Wiederherstellen bleibt über die
  // Tastatur (Strg+Z / Strg+Y) via history-Modul verfügbar.
];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-wochenansicht', [{ label: 'Wochenansicht', href: 'wochenansicht.html' }]);
  if (!user) return;

  // Layout-Marker: erlaubt der Wochenansicht volle Seitenbreite, ohne
  // die globale --content-max-Beschränkung für andere Seiten aufzuheben.
  document.body.dataset.page = 'wochenansicht';

  const today = new Date();
  let currentKW = DateUtil.getKW(today);
  let currentYear = DateUtil.getKWYear(today);

  // Navigation von Jahresansicht oder Ausbilder-Cockpit übernehmen
  const savedKW      = sessionStorage.getItem('gotoKW');
  const savedYear    = sessionStorage.getItem('gotoYear');
  const savedAzubiId = sessionStorage.getItem('gotoAzubiId');
  if (savedKW && savedYear) {
    currentKW = parseInt(savedKW);
    currentYear = parseInt(savedYear);
    sessionStorage.removeItem('gotoKW');
    sessionStorage.removeItem('gotoYear');
  }

  // Beim nächsten render(): Richtung der gerade laufenden KW-Wechsel-Animation.
  // Wird von transitionedRender() gesetzt und im Markup direkt als
  // .week-pane--entering / .week-kw-block__core--entering ausgegeben. Sofort
  // nach dem Lesen genullt, damit normale Re-Renders (Autosave, Kommentare)
  // keine Enter-Anim auslösen.
  let pendingEnterDir = null;

  // Zähler für gerade laufende KW-Wechsel-Animationen. mainContent.overflow
  // wird erst zurückgesetzt, wenn der Zähler wieder bei 0 ist – verhindert,
  // dass beim schnellen Mehrfach-Klick ein älterer setTimeout das overflow
  // entfernt, während eine neuere Pane noch mit translateX(120 px) rechts
  // raus animiert (sonst horizontale Scrollbar an der Page).
  let activeTransitions = 0;

  let pendingDayTagId = null;
  // Korrektur-Ansicht für alle Nicht-Azubis (Verantwortliche/Ausbilder);
  // ein Azubi sieht ausschließlich sein eigenes Heft.
  const isAusbilder = !user.istAzubi;
  let viewAzubiId = user.istAzubi ? user.id : null;
  if (savedAzubiId && !user.istAzubi) {
    viewAzubiId = savedAzubiId;
    sessionStorage.removeItem('gotoAzubiId');
  } else if (!user.istAzubi && !viewAzubiId) {
    // Korrektor ohne Vorauswahl: ersten betreuten Azubi anzeigen
    const firstAzubi = (await DB.getBetreuteAzubis())[0];
    if (firstAzubi) viewAzubiId = firstAzubi.id;
  }

  async function getBerichtTyp() {
    const azubiUser = await DB.getUser(viewAzubiId || user.id);
    return azubiUser?.berichtTyp || 'täglich';
  }

  async function getCurrentWoche() {
    return await DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
  }

  // ── Zeit-Spinner Hilfsfunktionen ──────────────────────────────────

  function decimalToTimeStr(decimal) {
    const mins = Math.round((decimal || 0) * 60);
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  }

  // Tagdauer-Pill (Ganztag/Halbtag) im Liquid-Glass-Design des V2-Brand-
  // Selectors. Beide Optionen sind gleich breit → der Glas-Indikator wird
  // rein per CSS-transform verschoben (data-dauer), kein JS-Messen nötig.
  function renderDauerPill(dateStr, tagdauer, readonly) {
    const dauer = tagdauer === 'halbtag' ? 'halbtag' : 'ganztag';
    const dis = readonly ? 'disabled' : '';
    const cls = readonly ? ' dauer-pill--readonly' : '';
    return `<div class="dauer-pill${cls}" data-field="tagdauer" data-date="${dateStr}" data-dauer="${dauer}">
      <button type="button" class="dauer-pill__opt" data-dauer-set="ganztag" ${dis} onclick="handleDauerClick(this)">Ganztag</button>
      <button type="button" class="dauer-pill__opt" data-dauer-set="halbtag" ${dis} onclick="handleDauerClick(this)">Halbtag</button>
    </div>`;
  }

  function getDauerValue(dateStr) {
    const p = document.querySelector(`.dauer-pill[data-date="${dateStr}"]`);
    return p && p.dataset.dauer === 'halbtag' ? 'halbtag' : 'ganztag';
  }

  function setSpinnerCallback(cb) {
    window._spinnerCallback = cb;
  }

  async function render() {
    // Wenn dieser Render durch einen KW-Wechsel ausgelöst wurde, hängen
    // wir die --entering-Klasse + data-dir direkt ans Markup. So ist die
    // Enter-Animation schon beim allerersten Paint scharf – kein Frame
    // mit "neuer Pane voll sichtbar ohne Anim".
    const enterDir = pendingEnterDir;
    pendingEnterDir = null;
    const paneCls  = 'week-pane'           + (enterDir ? ' week-pane--entering' : '');
    const kwCoreCls = 'week-kw-block__core' + (enterDir ? ' week-kw-block__core--entering' : '');
    const enterAttr = enterDir ? ` data-dir="${enterDir}"` : '';

    const berichtTyp = await getBerichtTyp();
    const azubiId = viewAzubiId || user.id;
    const woche = await DB.getWoche(azubiId, currentKW, currentYear);
    const monday = DateUtil.getMondayOfKW(currentKW, currentYear);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const isReadonly = isAusbilder || (woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt'));
    const canApprove = isAusbilder && woche && woche.status === 'freigegeben';
    // Freigabe-Button erscheint, wenn die Woche bearbeitbar ist:
    // – noch nicht angelegt
    // – status 'offen' (Erstfreigabe)
    // – status 'abgelehnt' (erneute Freigabe nach Rückgabe durch Ausbilder)
    const canRelease = user.role === 'azubi'
      && (!woche || woche.status === 'offen' || woche.status === 'abgelehnt');
    const canWithdraw = user.role === 'azubi' && woche?.status === 'freigegeben';
    const anwesenheitstageDisplay = (woche?.tage || []).filter(t => t.anwesenheit === 'anwesend').length;

    // Stammdaten des aktuell sichtbaren Azubis
    const azubiUser = await DB.getUser(azubiId);
    const azubiZuw  = await DB.getAktuellerAusbilder(azubiId);
    const azubiAusbilder = azubiZuw ? await DB.getUser(azubiZuw.ausbilderId) : null;
    const ausbildungsjahr = calcAusbildungsjahr(azubiUser?.ausbildungsBeginn);

    const lastSavedStr = (() => {
      const ts = woche?.lastSavedAt;
      if (ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      }
      return null;
    })();

    const azubiSelectorHtml = isAusbilder ? await renderAzubiSelector(azubiId) : '';

    const wochenKommentare = (woche?.kommentare || []).filter(k => k.tagId === null);
    const wochenKommentareHtml = woche && wochenKommentare.length
      ? `<div class="card" style="margin-top:var(--sp-5)">
          <div class="card__header"><span class="card__title">Kommentare</span></div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
            ${(await Promise.all(wochenKommentare.map(k => renderComment(k)))).join('')}
            ${isAusbilder ? `<button class="btn btn-outline" id="addCommentBtn" style="align-self:flex-start">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Kommentar hinzufügen
            </button>` : ''}
          </div>
        </div>`
      : (isAusbilder && woche
          ? `<div style="margin-top:var(--sp-5)">
              <button class="btn btn-outline" id="addCommentBtn">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Kommentar hinzufügen
              </button>
            </div>`
          : '');

    const main = document.getElementById('mainContent');
    main.innerHTML = `
      ${azubiSelectorHtml}

      ${renderStammdatenPrintBlock(azubiUser, azubiAusbilder, ausbildungsjahr, azubiZuw)}

      ${await renderStatusBanner(woche, azubiAusbilder, user)}

      <div class="week-toolbar">
        <div class="week-toolbar__left">
          ${canApprove ? `
            <button class="btn btn-success btn-lg" id="approveBtn">Genehmigen</button>
            <button class="btn btn-danger" id="rejectBtn">Zurückgeben</button>
          ` : ''}
          ${!canRelease && !canApprove && woche ? `<span class="badge badge--${woche.status}">${getStatusLabel(woche.status)}</span>` : ''}
          ${canWithdraw ? `
            <div class="dropdown" id="weitereAktionenDropdown">
              <button class="btn btn-outline" id="weitereAktionenBtn" type="button" aria-haspopup="menu" aria-expanded="false">
                Weitere Aktionen
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;margin-left:var(--sp-1)"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="dropdown__menu" role="menu">
                <button class="dropdown__item" id="withdrawBtn" type="button" role="menuitem">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/><path stroke-linecap="round" stroke-linejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Woche bearbeiten
                </button>
              </div>
            </div>
          ` : ''}
          ${!isReadonly && user.role === 'azubi' ? `
            <span class="week-toolbar__autosave" title="Letzte Speicherung: ${lastSavedStr || 'noch keine'}">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              <span>Automatische Speicherung aktiv${lastSavedStr ? ` · letzte Speicherung: <strong>${lastSavedStr} Uhr</strong>` : ''}</span>
            </span>
          ` : ''}
          ${isReadonly ? `
            <span class="week-toolbar__autosave week-toolbar__autosave--lock">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span>Schreibgeschützt</span>
            </span>
          ` : ''}
        </div>
        <div class="week-toolbar__right">
          <div class="week-kw-block" role="group" aria-label="Kalenderwoche">
            <button class="week-kw-block__nav" id="prevWeekBtn" aria-label="Vorherige Woche">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="${kwCoreCls}"${enterAttr}>
              <div class="week-kw-block__kw">KW ${currentKW}</div>
              <div class="week-kw-block__range">${DateUtil.formatDateShort(DateUtil.toISODate(monday))} – ${DateUtil.formatDateShort(DateUtil.toISODate(sunday))}</div>
            </div>
            <button class="week-kw-block__nav" id="nextWeekBtn" aria-label="Nächste Woche">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="${paneCls}"${enterAttr}>
      ${berichtTyp === 'wöchentlich'
        ? renderWochenKacheln(woche, isReadonly, monday)
        : renderDayCards(woche, monday, isReadonly, isAusbilder)
      }

      <div class="week-bottom-bar">
        <div class="week-bottom-bar__sum">
          <span class="week-bottom-bar__sum-label">Anwesenheitstage:</span>
          <span class="week-bottom-bar__sum-value" id="totalHours">${anwesenheitstageDisplay} / 5</span>
        </div>
        <div class="week-bottom-bar__actions">
          ${!isReadonly ? `
            <button class="btn btn-secondary" id="saveBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Speichern
            </button>
          ` : ''}
          ${canRelease ? `
            <button class="btn btn-primary" id="releaseBtnBottom">
              Zur Abnahme freigeben
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
            </button>
          ` : ''}
        </div>
      </div>

      ${wochenKommentareHtml}
      </div>
    `;

    bindEvents(woche, azubiId, berichtTyp, monday);
  }

  // Wrapper um render(), der die KW-Wechsel-Animation (Spring Slide + Parallax)
  // fährt:
  //   1. .week-pane und .week-kw-block__core werden geklont und mit
  //      position:fixed an ihrer aktuellen Bildschirmposition ans <body>
  //      gehängt (--leaving + data-dir → Exit-Anim spielt los).
  //   2. Die Originale werden sofort auf opacity:0 gesetzt, damit der Klon
  //      darüber wegfaden kann ohne dass der unveränderte echte Inhalt
  //      darunter "stehen bleibt" und den Übergang verbuggt wirken lässt.
  //   3. pendingEnterDir wird gesetzt; render() backt darauf die
  //      --entering-Klasse direkt ins Markup, damit die Enter-Anim ab dem
  //      allerersten Paint des neuen Pane scharf ist.
  //   4. Klone werden entfernt, sobald sowohl render() fertig als auch die
  //      Exit-Anim mindestens ihre 220 ms abgespielt hat – verhindert
  //      Lücken bei langsamem render().
  function transitionedRender(dir) {
    pendingEnterDir = dir;

    // 1. Reste von einem noch laufenden vorherigen Wechsel wegräumen.
    document.querySelectorAll(
      '.week-pane-anim-stage, .week-kw-block__core--leaving'
    ).forEach(el => el.remove());

    // 2. Pane-Klon in einen Stage-Container mit overflow:hidden — alles was
    //    der Klon mit translateX rausragen würde, wird am Stage-Rand sauber
    //    abgeschnitten (Mockup-Verhalten).
    //
    //    Y-Sync: das Layout der Wochenansicht kann sich zwischen zwei Wochen
    //    in der Höhe ändern (Status-Banner / Pflichtfeld-Hinweis / Toolbar-
    //    Buttons hängen am Wochen-Status). Wir merken die ALTE Pane-Y, und
    //    nachdem render() fertig ist messen wir die NEUE Pane-Y. Wenn sie
    //    abweicht, schieben wir den Stage mit einer CSS-Transition sanft auf
    //    die neue Y. Klon und neuer Pane bleiben so visuell ausgerichtet —
    //    kein "kommt von oben/unten"-Versatz mehr.
    // Stage spannt die volle .main-wrapper-Breite (also von Sidebar bis
    // rechtem Viewport-Rand), damit der Klon mit translateX(-120 px) bis
    // zur Sidebar gleiten kann und erst dort am Stage-Rand abgeschnitten
    // wird statt schon an der Pane-Kante. Höhe = Pane-Höhe.
    const mainWrapper = document.querySelector('.main-wrapper');
    const mwRect = mainWrapper ? mainWrapper.getBoundingClientRect() : null;

    const pane = document.querySelector('.week-pane');
    let stage = null;
    let oldPaneTop = null;
    if (pane && mwRect) {
      pane.classList.remove('week-pane--entering');
      pane.removeAttribute('data-dir');
      pane.style.removeProperty('opacity');

      const rect = pane.getBoundingClientRect();
      oldPaneTop = rect.top;
      stage = document.createElement('div');
      stage.className = 'week-pane-anim-stage';
      stage.style.top    = rect.top    + 'px';
      stage.style.left   = mwRect.left  + 'px';
      stage.style.width  = mwRect.width + 'px';
      stage.style.height = rect.height + 'px';

      const clone = pane.cloneNode(true);
      clone.classList.remove('week-pane--entering');
      clone.removeAttribute('data-dir');
      clone.classList.add('week-pane--leaving');
      clone.setAttribute('data-dir', dir);
      // Klon innerhalb Stage an seiner originalen X-Position einsetzen
      // (Stage ist breiter als die Pane, kein 100 %-Width-Fill).
      clone.style.left  = (rect.left - mwRect.left) + 'px';
      clone.style.width = rect.width + 'px';
      stage.appendChild(clone);
      document.body.appendChild(stage);
      pane.style.opacity = '0';
    }

    // 3. KW-Block-Klon: translate ist klein (max 20 px), kein eigener
    //    overflow-Container nötig.
    const kw = document.querySelector('.week-kw-block__core');
    let kwClone = null;
    let oldKwTop = null;
    if (kw) {
      kw.classList.remove('week-kw-block__core--entering');
      kw.removeAttribute('data-dir');
      kw.style.removeProperty('opacity');

      const rect = kw.getBoundingClientRect();
      oldKwTop = rect.top;
      kwClone = kw.cloneNode(true);
      kwClone.classList.remove('week-kw-block__core--entering');
      kwClone.removeAttribute('data-dir');
      kwClone.style.position = 'fixed';
      kwClone.style.top    = rect.top    + 'px';
      kwClone.style.left   = rect.left   + 'px';
      kwClone.style.width  = rect.width  + 'px';
      kwClone.style.height = rect.height + 'px';
      kwClone.style.margin = '0';
      kwClone.classList.add('week-kw-block__core--leaving');
      kwClone.setAttribute('data-dir', dir);
      document.body.appendChild(kwClone);
      kw.style.opacity = '0';
    }

    // 4. mainContent overflow:hidden, damit der neue Pane mit translateX(120 px)
    //    nicht frei nach rechts rausragt. activeTransitions++ koordiniert das
    //    Zurücksetzen weiter unten – nur die letzte fertige Anim räumt auf.
    const mainContent = document.getElementById('mainContent');
    if (mainContent) mainContent.style.overflow = 'hidden';
    activeTransitions++;

    // 5. Render + Y-Sync nach render().
    render().then(() => {
      // Y-Differenz alte vs. neue Pane-Position ausgleichen, indem wir den
      // Stage sanft zur neuen Y mitwandern lassen. Gleiches Spiel für die KW.
      const newPane = document.querySelector('.week-pane');
      if (stage && newPane && oldPaneTop !== null) {
        const dy = newPane.getBoundingClientRect().top - oldPaneTop;
        if (Math.abs(dy) > 1) {
          stage.style.transition = 'top 240ms ease-out';
          stage.style.top = (oldPaneTop + dy) + 'px';
        }
      }
      const newKw = document.querySelector('.week-kw-block__core');
      if (kwClone && newKw && oldKwTop !== null) {
        const dy = newKw.getBoundingClientRect().top - oldKwTop;
        if (Math.abs(dy) > 1) {
          kwClone.style.transition = 'top 240ms ease-out';
          kwClone.style.top = (oldKwTop + dy) + 'px';
        }
      }
    });

    // 6. Cleanup: Klone nach Exit-Anim (220 ms) raus, mainContent.overflow
    //    nach Enter-Anim (520 ms + KW-Lag 80 ms + Puffer) zurücksetzen.
    //    Overflow wird nur restored, wenn KEINE andere Anim mehr läuft —
    //    verhindert die horizontale Scrollbar beim schnellen Hin-und-Her-Klicken.
    setTimeout(() => {
      if (stage) stage.remove();
      if (kwClone) kwClone.remove();
    }, 260);
    setTimeout(() => {
      activeTransitions--;
      if (activeTransitions <= 0) {
        activeTransitions = 0;
        if (mainContent) mainContent.style.removeProperty('overflow');
      }
    }, 620);
  }

  async function renderAzubiSelector(currentId) {
    const azubis = await DB.getBetreuteAzubis();
    return `
      <div style="margin-bottom:var(--sp-4);display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap">
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--pm-grey-600)">Azubi:</span>
        ${azubis.map(a => `
          <button class="ausbilder-chip ${a.id === currentId ? 'selected' : ''}" data-azubi-id="${a.id}">
            <div class="avatar" style="width:28px;height:28px;font-size:11px">${a.initials}</div>
            ${a.name}
          </button>
        `).join('')}
      </div>
    `;
  }

  // ── Stammdaten (nur Druck/PDF-Export) ─────────────────────────────
  // Die Bildschirm-Darstellung der Stammdaten lebt jetzt auf der
  // Profil-Seite (profil.js, Kachel "Stammdaten"). Für den IHK-Ausdruck
  // der Wochenansicht müssen die Stammdaten aber weiterhin auf dem
  // Papier stehen – daher rendert die Wochenansicht einen auf dem
  // Bildschirm unsichtbaren Block, der nur in @media print erscheint
  // (s. wochenansicht.css, Abschnitte "STAMMDATEN (nur Druck)" und
  // "DRUCK-OPTIMIERUNG").
  function calcAusbildungsjahr(beginnStr, refDate = new Date()) {
    if (!beginnStr) return null;
    const start = new Date(beginnStr + 'T00:00:00');
    const months = (refDate.getFullYear() - start.getFullYear()) * 12 + (refDate.getMonth() - start.getMonth());
    return Math.max(1, Math.min(4, Math.floor(months / 12) + 1));
  }

  function renderStammdatenPrintBlock(azubi, ausbilder, ausbildungsjahr, zuw) {
    if (!azubi) return '';

    // Im Wochenansicht-Kontext nur die für die Erfassung relevanten Stammdaten.
    // Detail-Felder (IHK, Berufsbildnummer, Azubi-Nr.) finden sich im Profil.
    const fields = [
      { label: 'Auszubildende/r',         value: azubi.name },
      { label: 'Beruf',                   value: azubi.beruf || '–' },
      { label: 'Ausbildungsjahr',         value: ausbildungsjahr ? `${ausbildungsjahr}. Jahr` : '–' },
      { label: 'Aktuelle Abteilung',      value: zuw?.abteilung || azubi.abteilung || '–' },
      { label: 'Aktuelle/r Ausbilder/in', value: ausbilder ? ausbilder.name : '–' },
      { label: 'Ausbildungsbetrieb',      value: azubi.unternehmen || '–' },
    ];

    return `
      <section class="stammdaten-print">
        <div class="stammdaten-print__title">Stammdaten</div>
        <dl class="stammdaten-print__grid">
          ${fields.map(f => `
            <div class="stammdaten-print__field">
              <dt class="stammdaten-print__label">${f.label}</dt>
              <dd class="stammdaten-print__value">${f.value}</dd>
            </div>
          `).join('')}
        </dl>
      </section>
    `;
  }

  // ── Tägliches Berichtsheft ────────────────────────────────────────

  function renderDayCards(woche, monday, readonly, isAusbilder) {
    const days = [
      { short: 'Mo', long: 'Montag' },
      { short: 'Di', long: 'Dienstag' },
      { short: 'Mi', long: 'Mittwoch' },
      { short: 'Do', long: 'Donnerstag' },
      { short: 'Fr', long: 'Freitag' },
      { short: 'Sa', long: 'Samstag' },
      { short: 'So', long: 'Sonntag' },
    ];
    const monthsShort = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    const rows = days.map((d, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const isWE = i >= 5;
      const isToday = DateUtil.isToday(dateStr);

      const tag = woche?.tage?.find(t => t.datum === dateStr) || {
        datum: dateStr, anwesenheit: isWE ? 'Wochenende' : '', ort: isWE ? '' : 'Betrieb', tagdauer: 'ganztag',
      };

      // Datenmigration: alte tag.eintrag → tag.betriebEintrag
      const betriebContent      = tag.betriebEintrag || tag.eintrag || '';
      const schuleContent       = tag.schuleEintrag || '';
      const unterweisungContent = tag.unterweisungEintrag || '';

      const isAbwesend = tag.anwesenheit && tag.anwesenheit !== 'anwesend' && tag.anwesenheit !== '';
      const hasBetrieb      = betriebContent && betriebContent.replace(/<[^>]+>/g, '').trim().length > 0;
      const hasSchule       = schuleContent && schuleContent.replace(/<[^>]+>/g, '').trim().length > 0;
      const hasUnterweisung = unterweisungContent && unterweisungContent.replace(/<[^>]+>/g, '').trim().length > 0;
      const hasEntry        = hasBetrieb || hasSchule || hasUnterweisung;
      const visibleSections = getVisibleDaySections(tag.ort);
      const showBetrieb = visibleSections.has('betrieb');
      const showSchule  = visibleSections.has('schule');
      const schuleExpanded  = hasSchule || showSchule;
      const unterweisungExpanded = hasUnterweisung;

      const completion = getDayCompletion(tag, isWE);
      const completionTitle = {
        complete: 'Vollständig erfasst',
        partial:  'Teilweise erfasst – Stunden oder Eintrag fehlen',
        empty:    'Noch nicht ausgefüllt',
        absent:   'Abwesenheit erfasst',
        we:       'Wochenende',
      }[completion];

      // Pille rechts oben: zeigt den gewählten Ort an (BETRIEB, SCHULE, …).
      // Bei Abwesenheit der Abwesenheits-Grund, an Wochenenden gar nichts.
      const pillText = isWE
        ? ''
        : isAbwesend
          ? (tag.anwesenheit || '').toUpperCase()
          : (tag.ort || '').toUpperCase();
      const pillKind = isAbwesend ? 'absent' : (tag.ort ? 'ort' : 'empty');

      return `
        <div class="tag-row${isWE ? ' tag-row--weekend' : ''}${isToday ? ' tag-row--today' : ''}${hasEntry ? ' tag-row--has-entry' : ''}${woche ? ' status-' + woche.status : ''}"
             id="dayCard_${dateStr}" data-date="${dateStr}" data-completion="${completion}">
          <div class="tag-row__summary" ${!isWE ? `onclick="handleTagRowToggle(event)"` : ''}>
            <div class="tag-row__datebox${isWE ? ' tag-row__datebox--we' : ''}${isToday ? ' tag-row__datebox--today' : ''}">
              <span class="tag-row__day-num">${date.getDate()}</span>
              <span class="tag-row__month">${monthsShort[date.getMonth()]}</span>
              <span class="tag-row__weekday">${d.long}</span>
            </div>

            <div class="tag-row__field">
              <label class="tag-row__field-label">Anwesenheit</label>
              <select class="tag-row__select day-card__select" data-field="anwesenheit" data-date="${dateStr}"
                      ${isWE || readonly ? 'disabled' : ''}>
                ${ANWESENHEIT_OPTS.map(o =>
                  `<option value="${o}" ${tag.anwesenheit === o ? 'selected' : ''}>${o || '– bitte wählen –'}</option>`
                ).join('')}
              </select>
            </div>

            <div class="tag-row__field">
              ${!isWE ? `
                <label class="tag-row__field-label">Ort</label>
                <select class="tag-row__select day-card__select${(!readonly && !isAbwesend && !tag.ort) ? ' tag-row__select--needs-input' : ''}" data-field="ort" data-date="${dateStr}"
                        ${readonly || isAbwesend ? 'disabled' : ''}>
                  ${ORT_OPTS.map(o =>
                    `<option value="${o}" ${tag.ort === o ? 'selected' : ''}>${o || '– bitte wählen –'}</option>`
                  ).join('')}
                </select>
              ` : ''}
            </div>

            <div class="tag-row__field tag-row__field--time">
              ${!isWE ? `<label class="tag-row__field-label tag-row__field-label--centered">Dauer</label>` : ''}
              ${!isWE
                ? renderDauerPill(
                    dateStr,
                    tag.tagdauer,
                    isAbwesend || readonly
                  )
                : `<span class="tag-row__we-marker">WE</span>`}
            </div>


            ${!isWE
              ? `<button type="button" class="tag-row__chevron" aria-label="Tag aufklappen"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>`
              : ''}
          </div>

          ${!isWE ? `
          <div class="tag-row__body" id="dayBody_${dateStr}">
            <div class="tag-row__validation" id="validationMsg_${dateStr}" role="alert" hidden></div>
            <div id="editorSection_${dateStr}" class="day-sections" style="${isAbwesend ? 'display:none' : ''}">
              ${renderDaySection('betrieb',     dateStr, true, true, readonly, showBetrieb)}
              ${renderDaySection('schule',      dateStr, true, schuleExpanded, readonly, showSchule)}
              ${renderDaySection('unterweisung', dateStr, true, unterweisungExpanded, readonly, !!tag.ort || hasUnterweisung)}
              <div class="day-card__footer">
                <span class="day-card__char-count" id="charCount_${dateStr}">0 Zeichen</span>
                ${!readonly ? `<button class="btn btn-sm btn-ghost" onclick="clearDayEntry('${dateStr}')">Eintrag leeren</button>` : ''}
              </div>
            </div>
            <div class="tag-row__absence-section" id="absenceSection_${dateStr}" style="${isAbwesend ? '' : 'display:none'}">
              <div class="form-group">
                <label class="form-label">Abwesenheitsnotiz (optional)</label>
                <textarea class="form-control" rows="2"
                          placeholder="Zusätzliche Informationen zur Abwesenheit…"
                          data-field="abwesenheitsnotiz" data-date="${dateStr}"
                          ${readonly ? 'disabled' : ''}>${tag.abwesenheitsnotiz || ''}</textarea>
              </div>
            </div>
            ${(() => {
              const dayComments = (woche?.kommentare || []).filter(k => k.tagId === tag.id && tag.id);
              if (!dayComments.length) return '';
              return `<div class="tag-row__day-comments">
                ${dayComments.map(k => `
                  <div class="tag-row__day-comment">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;margin-top:2px">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    <span style="flex:1">${escapeHtml(k.text)}</span>
                    ${isAusbilder && k.userId === user.id ? `
                      <button class="btn btn-sm btn-ghost" data-delete-kommentar="${k.id}" title="Kommentar löschen" style="color:var(--color-error);padding:2px 4px;margin-left:var(--sp-2)">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>`;
            })()}
            ${isAusbilder && tag.id ? `
              <button class="btn btn-sm btn-ghost tag-row__add-day-comment" data-add-day-comment="${tag.id}" style="margin-top:var(--sp-2);align-self:flex-start">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Kommentar
              </button>
            ` : ''}
          </div>
          ` : ''}
        </div>
      `;
    });

    return `
      <div class="tag-cards">
        <div class="tag-cards__header" aria-hidden="true">
          <span class="tag-cards__header-spacer"></span>
          <span class="tag-cards__header-label">Anwesenheit</span>
          <span class="tag-cards__header-label">Ort</span>
          <span class="tag-cards__header-label tag-cards__header-label--center">Std.</span>
          <span class="tag-cards__header-spacer"></span>
        </div>
        ${rows.join('')}
      </div>
    `;
  }

  // ── Status-Banner ─────────────────────────────────────────────────
  async function renderStatusBanner(woche, azubiAusbilder, currentUser) {
    if (!woche) return '';

    if (woche.status === 'genehmigt') {
      return `
        <div class="week-status-banner week-status-banner--genehmigt">
          <div class="week-status-banner__icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div class="week-status-banner__body">
            <div class="week-status-banner__title">Diese Woche wurde genehmigt</div>
            <p class="week-status-banner__text">Die Einträge sind abgenommen und schreibgeschützt. ${azubiAusbilder ? `Genehmigt durch <strong>${azubiAusbilder.name}</strong>.` : ''}</p>
          </div>
        </div>
      `;
    }

    if (woche.status === 'freigegeben') {
      const isAzubi = currentUser.role === 'azubi';
      return `
        <div class="week-status-banner week-status-banner--freigegeben">
          <div class="week-status-banner__icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="week-status-banner__body">
            <div class="week-status-banner__title">Zur Abnahme freigegeben</div>
            <p class="week-status-banner__text">
              ${isAzubi
                ? `Wartet auf Prüfung${azubiAusbilder ? ` durch <strong>${azubiAusbilder.name}</strong>` : ''}. Du kannst noch nichts ändern – wenn deine Ausbilder/in zurückgibt, wird die Woche wieder editierbar.`
                : `Bitte prüfen und über <strong>Genehmigen</strong> oder <strong>Zurückgeben</strong> entscheiden.`}
            </p>
          </div>
        </div>
      `;
    }

    if (woche.status === 'abgelehnt') {
      const rejectionComment = (woche.kommentare || []).slice().reverse().find(k => k.typ === 'abgelehnt');
      const author = rejectionComment ? await DB.getUser(rejectionComment.userId) : null;
      return `
        <div class="week-status-banner week-status-banner--abgelehnt">
          <div class="week-status-banner__icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </div>
          <div class="week-status-banner__body">
            <div class="week-status-banner__title">Zurückgegeben – bitte überarbeiten</div>
            ${rejectionComment ? `
              <div class="week-status-banner__quote">
                <div class="week-status-banner__quote-text">${escapeHtml(rejectionComment.text)}</div>
                <div class="week-status-banner__quote-meta">— ${author ? author.name : 'Ausbilder/in'}${rejectionComment.datum ? ' · ' + rejectionComment.datum : ''}</div>
              </div>
            ` : `<p class="week-status-banner__text">Bitte überarbeite die Einträge und gib die Woche erneut frei.</p>`}
          </div>
        </div>
      `;
    }

    return '';
  }

  // ── Pflichtfeld-Validierung ───────────────────────────────────────
  function htmlIsEmpty(html) {
    if (!html) return true;
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim().length === 0;
  }

  function getDayCompletion(tag, isWE) {
    if (isWE) return 'we';
    if (!tag || !tag.anwesenheit || tag.anwesenheit === '') return 'empty';
    const isAbwesend = tag.anwesenheit !== 'anwesend';
    if (isAbwesend) return 'absent';

    // Eintrag muss zur Ort-Wahl passen: bei Ort=Schule reicht Schul-Eintrag,
    // bei Ort=Betrieb/Schule müssen BEIDE befüllt sein, etc.
    const visible = getVisibleDaySections(tag.ort);
    let hasRequiredEintrag = visible.size > 0;
    if (visible.has('betrieb')) {
      hasRequiredEintrag = hasRequiredEintrag
        && !htmlIsEmpty(tag.betriebEintrag || tag.eintrag || '');
    }
    if (visible.has('schule')) {
      hasRequiredEintrag = hasRequiredEintrag
        && !htmlIsEmpty(tag.schuleEintrag || '');
    }
    // Irgendein Eintrag (auch nur Unterweisung) zählt als „angefangen"
    const hasAnyEintrag = !htmlIsEmpty(tag.betriebEintrag || tag.eintrag || '')
                       || !htmlIsEmpty(tag.schuleEintrag || '')
                       || !htmlIsEmpty(tag.unterweisungEintrag || '');

    if (tag.ort && hasRequiredEintrag) return 'complete';
    if (hasAnyEintrag || tag.ort) return 'partial';
    return 'empty';
  }

  /**
   * Tägliche Validierung – pro Tag wird Anwesenheit + Stunden + Ort verlangt,
   * sowie der Eintrag in der/den durch den Ort sichtbaren Kachel(n):
   *  – Ort = Betrieb / Zuhause / Dienstreise → Betriebs-Eintrag Pflicht
   *  – Ort = Schule                          → Schul-Eintrag Pflicht
   *  – Ort = Betrieb/Schule                  → BEIDE Pflicht
   * Errors tragen `dateStr`, damit showValidationErrors die zugehörige
   * Tageskarte aufklappen und markieren kann.
   */
  function validateWocheTaeglich(woche, monday) {
    const errors = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const tag = woche?.tage?.find(t => t.datum === dateStr);
      const dayName = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'][i];
      const dayLabel = `${dayName} (${DateUtil.formatDateShort(dateStr)})`;

      if (!tag || !tag.anwesenheit) {
        errors.push({ scope: 'tag', dateStr, day: dayLabel, field: 'anwesenheit', msg: 'Anwesenheit nicht gesetzt' });
        continue;
      }
      if (tag.anwesenheit === 'anwesend') {
        if (!tag.ort) {
          errors.push({ scope: 'tag', dateStr, day: dayLabel, field: 'ort', msg: 'Ort nicht gewählt' });
        } else {
          const visible = getVisibleDaySections(tag.ort);
          if (visible.has('betrieb')
              && htmlIsEmpty(tag.betriebEintrag || tag.eintrag || '')) {
            errors.push({ scope: 'tag', dateStr, day: dayLabel, field: 'betrieb', msg: 'Kein Eintrag „Betrieb"' });
          }
          if (visible.has('schule')
              && htmlIsEmpty(tag.schuleEintrag || '')) {
            errors.push({ scope: 'tag', dateStr, day: dayLabel, field: 'schule', msg: 'Kein Eintrag „Schule"' });
          }
        }
      }
    }
    return errors;
  }

  /**
   * Wöchentliche Validierung – pro Tag werden Anwesenheit/Stunden geprüft
   * (für die Stundenleiste oben), aber statt der Tages-Quills muss der
   * Wochen-Eintrag pro aktivierter Kachel (Betrieb / Schule / Unterweisung)
   * Inhalt haben. Errors mit scope:'kachel' werden auf die Quills im
   * unteren Block gemappt.
   */
  function validateWocheWoechentlich(woche, monday) {
    const errors = [];

    // 1) Stunden / Anwesenheit pro Werktag (gleiche Logik wie täglich,
    //    aber ohne Eintrags-Pflicht pro Tag)
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const tag = woche?.tage?.find(t => t.datum === dateStr);
      const dayName = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'][i];
      const dayLabel = `${dayName} (${DateUtil.formatDateShort(dateStr)})`;

      if (!tag || !tag.anwesenheit) {
        errors.push({ scope: 'tag', dateStr, day: dayLabel, field: 'anwesenheit', msg: 'Anwesenheit nicht gesetzt' });
        continue;
      }
    }

    // 2) Wochen-Kacheln: Betrieb ist Pflicht, Schule + Unterweisung
    //    nur wenn die jeweiligen Optionen aktiv sind.
    const ort = woche?.wochenOrt || 'betrieb';
    const unterweisung = !!woche?.unterweisungAktiv;

    if (htmlIsEmpty(woche?.betriebEintrag || '')) {
      errors.push({ scope: 'kachel', kachelId: 'betrieb', label: 'Betrieb',
                    msg: 'Wocheneintrag „Betrieb" fehlt' });
    }
    if (ort === 'betrieb_schule' && htmlIsEmpty(woche?.schuleEintrag || '')) {
      errors.push({ scope: 'kachel', kachelId: 'schule', label: 'Schule',
                    msg: 'Wocheneintrag „Schule" fehlt' });
    }
    if (unterweisung && htmlIsEmpty(woche?.unterweisungEintrag || '')) {
      errors.push({ scope: 'kachel', kachelId: 'unterweisung', label: 'Unterweisung',
                    msg: 'Wocheneintrag „Unterweisung" fehlt' });
    }

    return errors;
  }

  /** Dispatch je nach Format des Azubis. */
  async function validateWoche(woche, monday) {
    return (await getBerichtTyp()) === 'wöchentlich'
      ? validateWocheWoechentlich(woche, monday)
      : validateWocheTaeglich(woche, monday);
  }

  function clearValidationErrors() {
    document.querySelectorAll('.tag-row--has-error, .tag-row--has-issues')
      .forEach(r => r.classList.remove('tag-row--has-error', 'tag-row--has-issues'));
    document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    document.querySelectorAll('.tag-row__validation').forEach(e => {
      e.hidden = true;
      e.innerHTML = '';
    });
    document.querySelectorAll('.wochen-kachel--has-error').forEach(k => k.classList.remove('wochen-kachel--has-error'));
  }

  // Markiert eine einzelne fehlende Komponente eines Tages rot (statt der
  // ganzen Karte): Anwesenheit-/Ort-Select bzw. den Eintrag-Editor.
  function markFieldError(dateStr, field) {
    let el = null;
    if (field === 'anwesenheit') el = document.querySelector(`select[data-field="anwesenheit"][data-date="${dateStr}"]`);
    else if (field === 'ort')    el = document.querySelector(`select[data-field="ort"][data-date="${dateStr}"]`);
    else if (field === 'betrieb') el = document.getElementById(`editorWrap_betrieb_${dateStr}`);
    else if (field === 'schule')  el = document.getElementById(`editorWrap_schule_${dateStr}`);
    if (!el) return;
    // Native <select> werden durch PMSelect (app.js) durch ein eigenes
    // Widget ersetzt und selbst versteckt → das sichtbare .pm-select-Wrapper-
    // Element markieren, sonst bliebe die rote Markierung unsichtbar.
    (el.closest('.pm-select') || el).classList.add('field-error');
  }

  async function showValidationErrors(errors) {
    clearValidationErrors();

    // Tages-Errors nach Datum gruppieren (für täglich-Format und für die
    // Stundenleiste im wöchentlich-Format)
    const byDate = {};
    const kachelErrors = [];
    errors.forEach(e => {
      if (e.scope === 'kachel') {
        kachelErrors.push(e);
      } else {
        if (!byDate[e.dateStr]) byDate[e.dateStr] = [];
        byDate[e.dateStr].push(e);   // ganzes Error-Objekt (inkl. field)
      }
    });

    // ── Tageskarten markieren (gilt für beide Formate) ──
    for (const dateStr of Object.keys(byDate)) {
      const row = document.getElementById('dayCard_' + dateStr);
      if (row) {
        // Karte aufklappen + Hinweisbox zeigen, aber NICHT die ganze Karte
        // rot färben – nur die einzelnen fehlenden Felder (siehe unten).
        row.classList.add('expanded', 'tag-row--has-issues');
        const errBox = document.getElementById('validationMsg_' + dateStr);
        if (errBox) {
          errBox.hidden = false;
          errBox.innerHTML = `
            <div class="tag-row__validation-icon" aria-hidden="true">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div>
              <strong>Bitte ergänzen:</strong>
              <ul>${byDate[dateStr].map(e => `<li>${escapeHtml(e.msg)}</li>`).join('')}</ul>
            </div>
          `;
        }
        // Editoren initialisieren falls Tag erst jetzt ausklappt
        const w = await DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
        const ro = w && (w.status === 'freigegeben' || w.status === 'genehmigt');
        if (!quillInstances['day_betrieb_' + dateStr]) {
          initSingleDayEditor(dateStr, w, ro);
        }
        // Einzelne fehlende Komponenten rot markieren
        byDate[dateStr].forEach(e => markFieldError(dateStr, e.field));
      } else {
        // Wöchentlich-Format: keine Tageskarte vorhanden – kompakte Zeile
        // markieren und dort, wo möglich, das einzelne Feld.
        const wochenRow = document.querySelector(`.tag-row--compact[data-date="${dateStr}"]`);
        wochenRow?.classList.add('tag-row--has-issues');
        byDate[dateStr].forEach(e => markFieldError(dateStr, e.field));
      }
    }

    // ── Wochen-Kachel-Errors markieren (nur wöchentlich-Format) ──
    kachelErrors.forEach(e => {
      const wrap = document.getElementById('wochenEditorWrap_' + e.kachelId);
      const kachel = wrap?.closest('.wochen-kachel');
      kachel?.classList.add('wochen-kachel--has-error');
    });

    // Zum ersten Fehler scrollen – Tag bevorzugt, sonst erste Kachel
    const firstErrorDate = Object.keys(byDate)[0];
    if (firstErrorDate) {
      (document.getElementById('dayCard_' + firstErrorDate)
        || document.querySelector(`.tag-row--compact[data-date="${firstErrorDate}"]`))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (kachelErrors[0]) {
      const wrap = document.getElementById('wochenEditorWrap_' + kachelErrors[0].kachelId);
      wrap?.closest('.wochen-kachel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const totalCount = errors.length;
    const detailMsg = kachelErrors.length > 0 && Object.keys(byDate).length === 0
      ? 'Bitte fülle die markierten Wochen-Einträge aus und gib die Woche erneut frei.'
      : 'Bitte ergänze die markierten Stellen und gib die Woche erneut frei.';
    Toast.error(
      `${totalCount} ${totalCount === 1 ? 'Pflichtangabe fehlt' : 'Pflichtangaben fehlen'}`,
      detailMsg
    );
  }

  // Tag-Sektionen: Betrieb / Schule / Unterweisung
  const DAY_SECTION_META = {
    betrieb: {
      title: 'Betrieb',
      hint: 'Was hast du heute im Betrieb gemacht?',
      placeholder: 'z.B. Implementierung Login-Komponente, Code-Review, Bugfix Modul XY …',
      icon: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
      collapsible: false,
    },
    schule: {
      title: 'Berufsschule',
      hint: 'Welche Themen wurden behandelt?',
      placeholder: 'z.B. Lernfeld 7 – Datenbank-Normalisierung, Übungen zu SQL-Joins …',
      icon: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
      collapsible: true,
    },
    unterweisung: {
      title: 'Unterweisung & besondere Ereignisse',
      hint: 'Sicherheitsunterweisungen, Schulungen, Werksführungen …',
      placeholder: 'z.B. Sicherheitsunterweisung Brandschutz (45 Min) – Inhalte …',
      icon: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      collapsible: true,
    },
  };

  /**
   * Welche Tages-Kacheln sind für einen gegebenen Ort sichtbar?
   *  – ohne Ort: keine
   *  – Schule:           nur Schule
   *  – Betrieb/Schule:   Betrieb + Schule
   *  – Betrieb (oder Zuhause / Dienstreise = Betriebs-Kontexte): nur Betrieb
   * Unterweisung wird separat behandelt: erscheint ab dem Moment, in dem
   * ein Ort gewählt wurde (oder wenn bereits Inhalt vorhanden ist).
   */
  function getVisibleDaySections(ort) {
    if (!ort) return new Set();
    if (ort === 'Schule') return new Set(['schule']);
    if (ort === 'Betrieb/Schule') return new Set(['betrieb', 'schule']);
    return new Set(['betrieb']);
  }

  function renderDaySection(kind, dateStr, hasContent, expanded, readonly, visible = true) {
    const meta = DAY_SECTION_META[kind];
    const id = `${kind}_${dateStr}`;
    const expandedClass = expanded ? ' day-section--expanded' : '';
    const collapsibleClass = meta.collapsible ? ' day-section--collapsible' : '';
    const hiddenClass = visible ? '' : ' day-section--hidden';

    const headerInner = `
      <span class="day-section__icon" aria-hidden="true">${meta.icon}</span>
      <div class="day-section__titles">
        <span class="day-section__title">${meta.title}</span>
        <span class="day-section__hint">${meta.hint}</span>
      </div>
      ${meta.collapsible ? `
        <span class="day-section__action">
          <span class="day-section__action-add">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Hinzufügen
          </span>
          <span class="day-section__action-collapse" aria-label="Sektion ein-/ausklappen">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </span>
      ` : ''}
    `;

    const header = meta.collapsible
      ? (readonly
          ? `<div class="day-section__header">${headerInner}</div>`
          : `<button type="button" class="day-section__header day-section__header--toggle"
                  aria-expanded="${expanded}" aria-controls="editorWrap_${id}"
                  onclick="toggleDaySection(this)">
               ${headerInner}
             </button>`)
      : `<div class="day-section__header">${headerInner}</div>`;

    return `
      <div class="day-section day-section--${kind}${expandedClass}${collapsibleClass}${hiddenClass}"
           data-date="${dateStr}" data-section="${kind}">
        ${header}
        <div class="day-section__body">
          <div class="ql-editor-wrap" id="editorWrap_${id}" data-date="${dateStr}" data-section="${kind}"></div>
        </div>
      </div>
    `;
  }

  function initSingleDayEditor(dateStr, woche, readonly) {
    const tag = woche?.tage?.find(t => t.datum === dateStr) || {};
    const sections = [
      { kind: 'betrieb',      content: tag.betriebEintrag || tag.eintrag || '' },
      { kind: 'schule',       content: tag.schuleEintrag || '' },
      { kind: 'unterweisung', content: tag.unterweisungEintrag || '' },
    ];

    sections.forEach(({ kind, content }) => {
      const editorKey = `day_${kind}_${dateStr}`;
      const wrap = document.getElementById(`editorWrap_${kind}_${dateStr}`);
      if (!wrap || quillInstances[editorKey]) return;

      const quill = new Quill(wrap, {
        theme: 'snow',
        readOnly: readonly,
        placeholder: DAY_SECTION_META[kind].placeholder,
        modules: {
          toolbar: readonly ? false : { container: QUILL_TOOLBAR },
          history: { delay: 1000, maxStack: 100, userOnly: true },
        },
      });

      if (content) {
        quill.clipboard.dangerouslyPasteHTML(content, 'silent');
      }

      quillInstances[editorKey] = quill;

      if (!readonly) {
        quill.on('text-change', () => {
          updateDayCharCount(dateStr);
          debounceSave(dateStr);
        });
      }
    });

    updateDayCharCount(dateStr);
  }

  function updateDayCharCount(dateStr) {
    let total = 0;
    ['betrieb', 'schule', 'unterweisung'].forEach(kind => {
      const q = quillInstances[`day_${kind}_${dateStr}`];
      if (q) total += Math.max(0, q.getText().length - 1);
    });
    const ctr = document.getElementById('charCount_' + dateStr);
    if (ctr) ctr.textContent = total + ' Zeichen';
  }

  // ── Wöchentliches Berichtsheft ────────────────────────────────────

  function renderWochenKacheln(woche, readonly, monday) {
    const ort = woche?.wochenOrt || 'betrieb';
    const unterweisung = woche?.unterweisungAktiv || false;

    return `
      <div class="wochen-wrap">
        <div class="wochen-options">
          <div class="wochen-options__title">Einträge auf Wochenbasis</div>
          <div class="wochen-options__group">
            <label class="wochen-options__field-label" for="wochenOrtSelect">Ort</label>
            <select id="wochenOrtSelect" class="tag-row__select wochen-options__select"
                    ${readonly ? 'disabled' : ''}>
              <option value="betrieb"        ${ort === 'betrieb' ? 'selected' : ''}>Betrieb</option>
              <option value="betrieb_schule" ${ort === 'betrieb_schule' ? 'selected' : ''}>Schule/Betrieb</option>
            </select>
          </div>
          <label class="wochen-options__check">
            <input type="checkbox" id="unterweisungCheck"
                   ${unterweisung ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
            <span class="wochen-options__check-box">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span>mit Unterweisung</span>
          </label>
          <div class="wochen-options__actions">
            ${!readonly ? `
            <input type="file" id="wochenAnhangInput" multiple hidden
                   accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx,.pptx,.txt">
            <button type="button" class="wochen-options__icon-btn" id="wochenAnhangBtn" title="Anhang hinzufügen" aria-label="Anhang hinzufügen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
            </button>
            ` : ''}
            <button type="button" class="wochen-options__icon-btn" id="wochenResetBtn" title="Eingaben zurücksetzen" aria-label="Zurücksetzen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6M5.07 9A8 8 0 0119 12M19 15a8 8 0 01-13.93 3"/></svg>
            </button>
          </div>
        </div>

        <div class="wochen-anhaenge" id="wochenAnhaengeWrap">
          <div class="wochen-anhaenge__list" id="wochenAnhaengeListe"></div>
        </div>

        <div class="wochen-kacheln" id="wochenKacheln">
          ${buildWochenKacheln(ort, unterweisung, woche, readonly)}
        </div>

        <div class="wochen-tage-tabelle">
          ${buildWochenTageTabelle(woche, monday, readonly)}
        </div>
      </div>
    `;
  }

  function buildWochenTageTabelle(woche, monday, readonly) {
    // Im Wochen-Modus erscheinen die Tageszeilen visuell wie die Tag-Karten
    // im Tages-Modus, nur ohne Editor-Body. Klick-Toggle entfällt, Anwesenheit/
    // Ort/Stunden bleiben editierbar – Quills sind oben in den Wochenkacheln.
    const days = [
      { short: 'Mo', long: 'Montag' },
      { short: 'Di', long: 'Dienstag' },
      { short: 'Mi', long: 'Mittwoch' },
      { short: 'Do', long: 'Donnerstag' },
      { short: 'Fr', long: 'Freitag' },
      { short: 'Sa', long: 'Samstag' },
      { short: 'So', long: 'Sonntag' },
    ];
    const monthsShort = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    const rows = days.map((d, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const isWE = i >= 5;
      const isToday = DateUtil.isToday(dateStr);

      const tag = woche?.tage?.find(t => t.datum === dateStr) || {
        datum: dateStr, anwesenheit: isWE ? 'Wochenende' : '', ort: isWE ? '' : 'Betrieb', tagdauer: 'ganztag',
      };
      const isAbwesend = tag.anwesenheit && tag.anwesenheit !== 'anwesend' && tag.anwesenheit !== '';

      const pillText = isWE
        ? ''
        : isAbwesend
          ? (tag.anwesenheit || '').toUpperCase()
          : (tag.ort || '').toUpperCase();
      const pillKind = isAbwesend ? 'absent' : (tag.ort ? 'ort' : 'empty');

      return `
        <div class="tag-row tag-row--compact${isWE ? ' tag-row--weekend' : ''}${isToday ? ' tag-row--today' : ''}"
             data-date="${dateStr}">
          <div class="tag-row__summary tag-row__summary--no-toggle">
            <div class="tag-row__datebox${isWE ? ' tag-row__datebox--we' : ''}${isToday ? ' tag-row__datebox--today' : ''}">
              <span class="tag-row__day-num">${date.getDate()}</span>
              <span class="tag-row__month">${monthsShort[date.getMonth()]}</span>
              <span class="tag-row__weekday">${d.long}</span>
            </div>

            <div class="tag-row__field">
              <label class="tag-row__field-label">Anwesenheit</label>
              <select class="tag-row__select day-card__select" data-field="anwesenheit" data-date="${dateStr}"
                      ${isWE || readonly ? 'disabled' : ''}>
                ${ANWESENHEIT_OPTS.map(o =>
                  `<option value="${o}" ${tag.anwesenheit === o ? 'selected' : ''}>${o || '– bitte wählen –'}</option>`
                ).join('')}
              </select>
            </div>

            <div class="tag-row__field">
              ${!isWE ? `
                <label class="tag-row__field-label">Ort</label>
                <select class="tag-row__select day-card__select${(!readonly && !isAbwesend && !tag.ort) ? ' tag-row__select--needs-input' : ''}" data-field="ort" data-date="${dateStr}"
                        ${isAbwesend || readonly ? 'disabled' : ''}>
                  ${ORT_OPTS.map(o =>
                    `<option value="${o}" ${tag.ort === o ? 'selected' : ''}>${o || '– bitte wählen –'}</option>`
                  ).join('')}
                </select>
              ` : ''}
            </div>

            <div class="tag-row__field tag-row__field--time">
              ${!isWE ? `<label class="tag-row__field-label tag-row__field-label--centered">Dauer</label>` : ''}
              ${!isWE
                ? renderDauerPill(
                    dateStr,
                    tag.tagdauer,
                    isAbwesend || readonly
                  )
                : `<span class="tag-row__we-marker">WE</span>`}
            </div>

          </div>
        </div>
      `;
    });

    return `
      <div class="tag-cards">
        <div class="tag-cards__header" aria-hidden="true">
          <span class="tag-cards__header-spacer"></span>
          <span class="tag-cards__header-label">Anwesenheit</span>
          <span class="tag-cards__header-label">Ort</span>
          <span class="tag-cards__header-label tag-cards__header-label--center">Std.</span>
          <span class="tag-cards__header-spacer"></span>
        </div>
        ${rows.join('')}
      </div>
    `;
  }

  // Metadaten der drei Wochen-Kacheln. Placeholder lebt in
  // initSingleWochenEditor (Quill), Label/Hint hier fürs Markup.
  const WOCHEN_TILE_META = {
    betrieb:      { label: 'Betrieb',      hint: 'Betriebliche Tätigkeiten und Lerninhalte' },
    schule:       { label: 'Schule',       hint: 'Schulische Unterrichtsinhalte' },
    unterweisung: { label: 'Unterweisung', hint: 'Thema und Inhalt der Unterweisung' },
  };

  function wochenKachelTextOf(id, woche) {
    if (id === 'betrieb') return woche?.betriebEintrag || '';
    if (id === 'schule')  return woche?.schuleEintrag || '';
    return woche?.unterweisungEintrag || '';
  }

  // Markup einer einzelnen Wochen-Kachel. data-kachel-id erlaubt das
  // gezielte Ein-/Ausblenden einzelner Kacheln (statt Voll-Rerender).
  function wochenKachelHtml(id, readonly) {
    const meta = WOCHEN_TILE_META[id];
    return `
      <div class="wochen-kachel" data-kachel-id="${id}">
        <div class="wochen-kachel__header">
          <span class="wochen-kachel__title">${meta.label}</span>
          <span class="wochen-kachel__hint">${meta.hint}</span>
        </div>
        <div class="ql-editor-wrap wochen-editor-wrap" id="wochenEditorWrap_${id}" data-kachel="${id}"></div>
        <div class="day-card__footer">
          <span class="day-card__char-count" id="wochenCharCount_${id}">0 Zeichen</span>
          ${!readonly ? `<button class="btn btn-sm btn-ghost" onclick="clearWochenKachel('${id}')">Leeren</button>` : ''}
        </div>
      </div>
    `;
  }

  function buildWochenKacheln(ort, unterweisung, woche, readonly) {
    const ids = ['betrieb'];
    if (ort === 'betrieb_schule') ids.push('schule');
    if (unterweisung)             ids.push('unterweisung');
    return ids.map(id => wochenKachelHtml(id, readonly)).join('');
  }

  // ── Optimistisches Ein-/Ausblenden einzelner Wochen-Kacheln ───────
  // Statt bei jedem Häkchen die ganze Liste neu zu bauen (3 Netzwerk-
  // Round-Trips + alle Quills neu) wird nur die betroffene Kachel sofort
  // mit sanfter Höhen-/Fade-Animation ein- bzw. ausgeblendet. Gespeichert
  // wird im Hintergrund über debounceSaveWoche().

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Misst die natürliche Höhe (height:auto) ohne die laufende Animation
  // zu stören – inline gesetzte Höhe wird kurz aufgehoben und restauriert.
  function measureNatural(node) {
    const prevH = node.style.height;
    const prevT = node.style.transition;
    node.style.transition = 'none';
    node.style.height = 'auto';
    const h = node.getBoundingClientRect().height;
    node.style.height = prevH;
    node.style.transition = prevT;
    return h;
  }

  // Inline-Animationsreste entfernen (animation:none NICHT anfassen –
  // sonst würde die CSS-fadeIn-Regel der Kachel nachträglich noch feuern).
  function clearKachelAnim(node) {
    node.style.removeProperty('height');
    node.style.removeProperty('overflow');
    node.style.removeProperty('transition');
    node.style.removeProperty('opacity');
  }

  // Aktuellen Stand (Ort, Unterweisung, Editor-Inhalte) aus dem DOM/den
  // Live-Quills in ein woche-ähnliches Objekt übernehmen – als Basis für
  // den Neu-Aufbau einer Kachel, ohne dafür den Server zu fragen.
  function collectWochenState(base) {
    const w = { ...(base || {}) };
    const ortEl = document.getElementById('wochenOrtSelect');
    const uEl   = document.getElementById('unterweisungCheck');
    if (ortEl) w.wochenOrt = ortEl.value;
    if (uEl)   w.unterweisungAktiv = uEl.checked;
    const bQ = quillInstances['woche_betrieb'];
    const sQ = quillInstances['woche_schule'];
    const uQ = quillInstances['woche_unterweisung'];
    if (bQ) w.betriebEintrag      = bQ.root.innerHTML;
    if (sQ) w.schuleEintrag       = sQ.root.innerHTML;
    if (uQ) w.unterweisungEintrag = uQ.root.innerHTML;
    return w;
  }

  function expandKachel(node) {
    delete node.dataset.removing;
    if (prefersReducedMotion()) { clearKachelAnim(node); return; }
    const target = measureNatural(node);
    const start  = node.getBoundingClientRect().height;
    node.style.overflow = 'hidden';
    node.style.transition = 'none';
    node.style.height = start + 'px';
    void node.offsetHeight; // Reflow, damit der Startwert „greift"
    node.style.transition = 'height 260ms ease-out, opacity 200ms ease-out';
    node.style.height = target + 'px';
    node.style.opacity = '1';
    const done = (e) => {
      if (e.target !== node || e.propertyName !== 'height') return;
      node.removeEventListener('transitionend', done);
      if (!node.dataset.removing) clearKachelAnim(node); // Höhe → auto (wächst mit Inhalt)
    };
    node.addEventListener('transitionend', done);
  }

  function addWochenKachel(id, woche, readonly) {
    const container = document.getElementById('wochenKacheln');
    if (!container) return;

    let node = container.querySelector(`.wochen-kachel[data-kachel-id="${id}"]`);
    if (node) {
      // Kachel ist noch da (evtl. mitten im Ausblenden) → wieder einblenden.
      // Die Quill-Instanz wird erst nach Abschluss des Ausblendens gelöscht,
      // daher hier kein Neu-Init nötig.
      expandKachel(node);
      return;
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = wochenKachelHtml(id, readonly).trim();
    node = tmp.firstElementChild;
    // Reihenfolge wahren: Unterweisung ans Ende, Schule davor.
    const before = id === 'schule'
      ? container.querySelector('.wochen-kachel[data-kachel-id="unterweisung"]')
      : null;
    container.insertBefore(node, before);

    // CSS-fadeIn der Kachel unterdrücken – wir animieren die Höhe selbst.
    node.style.animation = 'none';
    node.style.overflow = 'hidden';
    node.style.height = '0px';
    node.style.opacity = '0';

    initSingleWochenEditor(id, woche, readonly);
    expandKachel(node);
  }

  function removeWochenKachel(id) {
    const container = document.getElementById('wochenKacheln');
    const node = container?.querySelector(`.wochen-kachel[data-kachel-id="${id}"]`);
    if (!node) return;
    node.dataset.removing = '1';

    if (prefersReducedMotion()) {
      delete quillInstances['woche_' + id];
      node.remove();
      return;
    }

    const current = node.getBoundingClientRect().height;
    node.style.overflow = 'hidden';
    node.style.transition = 'none';
    node.style.height = current + 'px';
    node.style.opacity = '1';
    void node.offsetHeight;
    node.style.transition = 'height 220ms ease-in, opacity 160ms ease-in';
    node.style.height = '0px';
    node.style.opacity = '0';
    const done = (e) => {
      if (e.target !== node || e.propertyName !== 'height') return;
      node.removeEventListener('transitionend', done);
      // Nur entfernen, wenn nicht zwischenzeitlich wieder eingeblendet wurde.
      if (node.dataset.removing) {
        delete quillInstances['woche_' + id];
        node.remove();
      }
    };
    node.addEventListener('transitionend', done);
  }

  function bindWochenEditorEvents() {
    // Events handled by Quill instances in initWochenQuillEditors
  }

  // ── Wochen-Anhänge ────────────────────────────────────────────────
  const ANHANG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (Spiegel des Backend-Limits)
  const ANHANG_ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'docx', 'xlsx', 'pptx', 'txt'];

  function anhangExt(name) {
    const m = /\.([^.]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function formatBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function anhangIconSvg(dateiname) {
    const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(anhangExt(dateiname));
    return isImg
      ? '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
      : '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }

  function renderAnhaengeListe(anhaenge, readonly) {
    if (!anhaenge || !anhaenge.length) return '';
    const rows = anhaenge.map(a => `
      <div class="wochen-anhang" data-anhang-id="${a.id}">
        <span class="wochen-anhang__icon" aria-hidden="true">${anhangIconSvg(a.dateiname)}</span>
        <a class="wochen-anhang__name" href="${DB.anhangDownloadUrl(a.id)}" download="${escapeHtml(a.dateiname)}" title="Herunterladen">${escapeHtml(a.dateiname)}</a>
        <span class="wochen-anhang__size">${formatBytes(a.groesseBytes)}</span>
        ${!readonly ? `
          <button type="button" class="wochen-anhang__delete" data-delete-anhang="${a.id}" title="Anhang löschen" aria-label="Anhang löschen">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ` : ''}
      </div>
    `).join('');
    return `
      <div class="wochen-anhaenge__header">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
        <span>Anhänge (${anhaenge.length})</span>
      </div>
      ${rows}
    `;
  }

  async function refreshAnhaenge(wocheId, readonly) {
    const listEl = document.getElementById('wochenAnhaengeListe');
    if (!listEl) return;
    if (!wocheId) { listEl.innerHTML = ''; return; }
    try {
      const anhaenge = await DB.getAnhaenge(wocheId);
      listEl.innerHTML = renderAnhaengeListe(anhaenge, readonly);
    } catch {
      // Liste beim Render still lassen (kein Toast-Spam) – Fehler bei
      // den eigentlichen Aktionen (Upload/Delete) werden dort gemeldet.
      listEl.innerHTML = '';
    }
  }

  async function handleAnhangFiles(fileList) {
    if (!fileList || !fileList.length) return;
    const azubiId = viewAzubiId || user.id;
    let woche = await DB.getWoche(azubiId, currentKW, currentYear);

    // Anhänge brauchen eine WocheId. Neue Wochen existieren erst nach dem
    // ersten Speichern – daher hier sicherstellen, dass die Woche persistiert ist.
    if (!woche || !woche.id) {
      await autoSaveWoche();
      woche = await DB.getWoche(azubiId, currentKW, currentYear);
    }
    if (!woche || !woche.id) {
      Toast.error('Fehler', 'Die Woche konnte nicht gespeichert werden.');
      return;
    }

    let uploaded = 0;
    for (const file of Array.from(fileList)) {
      if (file.size > ANHANG_MAX_BYTES) {
        Toast.error('Datei zu groß', `„${file.name}" überschreitet 10 MB.`);
        continue;
      }
      if (!ANHANG_ALLOWED_EXT.includes(anhangExt(file.name))) {
        Toast.error('Typ nicht erlaubt', `„${file.name}" hat einen nicht unterstützten Dateityp.`);
        continue;
      }
      try {
        await DB.uploadAnhang(woche.id, file);
        uploaded++;
      } catch (err) {
        Toast.error('Upload fehlgeschlagen', err.message || file.name);
      }
    }

    if (uploaded > 0) {
      Toast.success('Hochgeladen', uploaded === 1
        ? 'Die Datei wurde angehängt.'
        : `${uploaded} Dateien wurden angehängt.`);
      await refreshAnhaenge(woche.id, false);
    }
  }

  function initDayQuillEditors(woche, monday, readonly) {
    Object.keys(quillInstances)
      .filter(k => k.startsWith('day_'))
      .forEach(k => { delete quillInstances[k]; });

    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const tag = woche?.tage?.find(t => t.datum === dateStr);
      const isAbwesend = tag?.anwesenheit && tag.anwesenheit !== 'anwesend' && tag.anwesenheit !== '';
      if (isAbwesend) continue;
      initSingleDayEditor(dateStr, woche, readonly);
    }
  }

  const WOCHEN_PLACEHOLDERS = {
    betrieb:       'Tätigkeiten und Lerninhalte im Betrieb für diese Woche beschreiben…',
    schule:        'Unterrichtsinhalte der Berufsschule für diese Woche beschreiben…',
    unterweisung:  'Thema und Inhalt der Unterweisung beschreiben…',
  };

  // Initialisiert den Quill-Editor genau einer Wochen-Kachel. Wird sowohl
  // beim Voll-Aufbau (initWochenQuillEditors) als auch beim einzelnen
  // Hinzufügen einer Kachel (addWochenKachel) genutzt.
  function initSingleWochenEditor(id, woche, readonly) {
    const wrap = document.getElementById('wochenEditorWrap_' + id);
    if (!wrap || quillInstances['woche_' + id]) return;

    const quill = new Quill(wrap, {
      theme: 'snow',
      readOnly: readonly,
      placeholder: WOCHEN_PLACEHOLDERS[id],
      modules: {
        toolbar: readonly ? false : { container: QUILL_TOOLBAR },
        history: { delay: 1000, maxStack: 100, userOnly: true },
      },
    });

    const content = wochenKachelTextOf(id, woche);
    if (content) {
      quill.clipboard.dangerouslyPasteHTML(content, 'silent');
    }

    const charCount = Math.max(0, quill.getText().length - 1);
    const counter = document.getElementById('wochenCharCount_' + id);
    if (counter) counter.textContent = charCount + ' Zeichen';

    quillInstances['woche_' + id] = quill;

    if (!readonly) {
      quill.on('text-change', () => {
        const count = Math.max(0, quill.getText().length - 1);
        const ctr = document.getElementById('wochenCharCount_' + id);
        if (ctr) ctr.textContent = count + ' Zeichen';
        debounceSaveWoche();
      });
    }
  }

  function initWochenQuillEditors(woche, readonly) {
    Object.keys(quillInstances)
      .filter(k => k.startsWith('woche_'))
      .forEach(k => { delete quillInstances[k]; });
    ['betrieb', 'schule', 'unterweisung'].forEach(id => initSingleWochenEditor(id, woche, readonly));
  }

  // ── Auto-Save ─────────────────────────────────────────────────────

  async function autoSaveWoche() {
    const azubiId = viewAzubiId || user.id;
    let woche = await DB.getWoche(azubiId, currentKW, currentYear);
    if (!woche) {
      const monday = DateUtil.getMondayOfKW(currentKW, currentYear);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      woche = {
        azubiId, kw: currentKW, year: currentYear,
        startDate: DateUtil.toISODate(monday),
        endDate: DateUtil.toISODate(sunday),
        status: 'offen', gesamtstunden: 0, kommentare: [], tage: [],
        typ: 'wöchentlich',
      };
    }

    const ortEl = document.getElementById('wochenOrtSelect');
    const unterweisungEl = document.getElementById('unterweisungCheck');

    if (ortEl) woche.wochenOrt = ortEl.value;
    if (unterweisungEl) woche.unterweisungAktiv = unterweisungEl.checked;

    const betriebQ = quillInstances['woche_betrieb'];
    const schuleQ  = quillInstances['woche_schule'];
    const unterweisungQ = quillInstances['woche_unterweisung'];
    if (betriebQ)      woche.betriebEintrag      = betriebQ.root.innerHTML;
    if (schuleQ)       woche.schuleEintrag        = schuleQ.root.innerHTML;
    if (unterweisungQ) woche.unterweisungEintrag  = unterweisungQ.root.innerHTML;

    woche.gesamtstunden = (woche.tage || []).filter(t => t.anwesenheit === 'anwesend').length;
    woche.lastSavedAt = new Date().toISOString();
    await DB.saveWoche(woche);
  }

  async function autoSave(dateStr) {
    const azubiId = viewAzubiId || user.id;
    let woche = await DB.getWoche(azubiId, currentKW, currentYear);
    if (!woche) {
      const monday = DateUtil.getMondayOfKW(currentKW, currentYear);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      const bt = await getBerichtTyp();
      woche = {
        azubiId, kw: currentKW, year: currentYear,
        startDate: DateUtil.toISODate(monday),
        endDate: DateUtil.toISODate(sunday),
        status: 'offen', gesamtstunden: 0, kommentare: [], tage: [],
        ...(bt === 'wöchentlich' ? { typ: 'wöchentlich' } : {}),
      };
    }

    if (!woche.tage) woche.tage = [];
    const tagIdx = woche.tage.findIndex(t => t.datum === dateStr);
    const tagData = tagIdx >= 0 ? { ...woche.tage[tagIdx] } : { datum: dateStr };

    const anwesenheitEl = document.querySelector(`select[data-field="anwesenheit"][data-date="${dateStr}"]`);
    const ortEl         = document.querySelector(`select[data-field="ort"][data-date="${dateStr}"]`);
    const notizEl       = document.querySelector(`textarea[data-field="abwesenheitsnotiz"][data-date="${dateStr}"]`);

    if (anwesenheitEl) tagData.anwesenheit = anwesenheitEl.value;
    if (ortEl)         tagData.ort = ortEl.value;
    tagData.tagdauer = getDauerValue(dateStr);
    if (notizEl)       tagData.abwesenheitsnotiz = notizEl.value;

    const qBetrieb      = quillInstances['day_betrieb_' + dateStr];
    const qSchule       = quillInstances['day_schule_' + dateStr];
    const qUnterweisung = quillInstances['day_unterweisung_' + dateStr];
    if (qBetrieb)      tagData.betriebEintrag      = qBetrieb.root.innerHTML;
    if (qSchule)       tagData.schuleEintrag       = qSchule.root.innerHTML;
    if (qUnterweisung) tagData.unterweisungEintrag = qUnterweisung.root.innerHTML;
    // Altes Feld nicht mehr pflegen, aber falls Editor noch nicht initialisiert war
    // und der alte Eintrag schon migriert wurde, hier entfernen
    if (qBetrieb && tagData.eintrag) delete tagData.eintrag;

    if (tagIdx >= 0) woche.tage[tagIdx] = tagData;
    else woche.tage.push(tagData);

    woche.gesamtstunden = woche.tage.filter(t => t.anwesenheit === 'anwesend').length;
    woche.lastSavedAt = new Date().toISOString();
    await DB.saveWoche(woche);
    updateAutosaveTimestamp();
    updateStundenDisplay();
    await updateDayCompletion(dateStr);
    clearDayError(dateStr);
  }

  function updateAutosaveTimestamp() {
    const el = document.querySelector('.week-toolbar__autosave strong');
    if (!el) return;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    el.textContent = `${ts} Uhr`;
  }

  async function updateDayCompletion(dateStr) {
    const row = document.getElementById('dayCard_' + dateStr);
    if (!row) return;
    const w = await DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
    const tag = w?.tage?.find(t => t.datum === dateStr);
    const date = new Date(dateStr + 'T00:00:00');
    const isWE = date.getDay() === 0 || date.getDay() === 6;
    const completion = getDayCompletion(tag, isWE);
    row.dataset.completion = completion;
    const dot = row.querySelector('.tag-row__completion-dot');
    if (dot) dot.className = 'tag-row__completion-dot tag-row__completion-dot--' + completion;
    if (dot) {
      const titles = {
        complete: 'Vollständig erfasst',
        partial:  'Teilweise erfasst – Stunden oder Eintrag fehlen',
        empty:    'Noch nicht ausgefüllt',
        absent:   'Abwesenheit erfasst',
        we:       'Wochenende',
      };
      dot.title = titles[completion] || '';
      dot.setAttribute('aria-label', titles[completion] || '');
    }
  }

  function clearDayError(dateStr) {
    const row = document.getElementById('dayCard_' + dateStr);
    const errBox = document.getElementById('validationMsg_' + dateStr);
    if (row) {
      row.classList.remove('tag-row--has-error', 'tag-row--has-issues');
      row.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    }
    // Anwesenheit/Ort-Selects liegen ggf. außerhalb der Karte (Summary-Zeile)
    // bzw. sind durch PMSelect ersetzt → auch das Wrapper-Widget entmarkieren.
    document.querySelectorAll(`[data-date="${dateStr}"].field-error`).forEach(el => el.classList.remove('field-error'));
    document.querySelectorAll(`select[data-date="${dateStr}"]`).forEach(s => {
      (s.closest('.pm-select') || s).classList.remove('field-error');
    });
    if (errBox) { errBox.hidden = true; errBox.innerHTML = ''; }
  }

  /* Letzter Wochen-Total in Modul-Scope, damit wir die Richtung der
     Änderung kennen und die Bump-Animation passend feuern können. */
  let _lastWochenTotal = null;

  function updateStundenDisplay() {
    // „Wochensumme" ist jetzt die Zahl der Anwesenheitstage (Mo–Fr).
    const selects = document.querySelectorAll('select[data-field="anwesenheit"][data-date]');
    const total = Array.from(selects).filter(s => s.value === 'anwesend').length;
    const val = `${total} / 5`;

    let direction = null;
    if (_lastWochenTotal !== null && total !== _lastWochenTotal) {
      direction = total > _lastWochenTotal ? 'up' : 'down';
    }
    _lastWochenTotal = total;

    ['totalHours', 'statusTotalHours'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      if (direction) {
        el.classList.remove('hours-bump-up', 'hours-bump-down');
        void el.offsetWidth;
        el.classList.add('hours-bump-' + direction);
      }
    });
  }

  // ── Tages-Kommentar-Felder für Genehmigungs-/Ablehnungs-Modal ────

  function buildDayCommentFields(woche, monday) {
    const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    const monthsShort = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const fields = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const tag = woche?.tage?.find(t => t.datum === dateStr);
      if (!tag?.id) continue;
      const dateLabel = `${date.getDate()}. ${monthsShort[date.getMonth()]}`;
      fields.push(`
        <div class="form-group" style="margin-bottom:var(--sp-3)">
          <label class="form-label" style="font-size:var(--text-sm);font-weight:var(--fw-bold)">${dayNames[i]}, ${dateLabel}</label>
          <textarea class="form-control" rows="2"
                    placeholder="Kommentar zu diesem Tag (optional)…"
                    data-day-comment="${tag.id}"></textarea>
        </div>
      `);
    }
    if (!fields.length) return '';
    return `
      <div style="margin-top:var(--sp-4);padding-top:var(--sp-4);border-top:1px solid var(--pm-grey-100)">
        <p style="font-size:var(--text-sm);font-weight:var(--fw-bold);color:var(--pm-grey-600);margin:0 0 var(--sp-3)">Kommentare zu einzelnen Tagen (optional)</p>
        ${fields.join('')}
      </div>
    `;
  }

  // ── Events ────────────────────────────────────────────────────────

  async function renderComment(k) {
    const author = await DB.getUser(k.userId);
    const canDelete = isAusbilder && k.userId === user.id;
    return `
      <div class="comment comment--ausbilder" data-kommentar-id="${k.id}">
        <div class="comment__body">
          <div class="comment__header">
            <div class="avatar avatar--sm">${author ? author.initials : '?'}</div>
            <span class="comment__name">${author ? author.name : 'Unbekannt'}</span>
            <span class="comment__date">${k.datum || ''}</span>
            ${canDelete ? `<button class="btn btn-sm btn-ghost comment__delete" data-delete-kommentar="${k.id}" title="Kommentar löschen" style="margin-left:auto;color:var(--color-error)">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>` : ''}
          </div>
          <div class="comment__text">${escapeHtml(k.text)}</div>
        </div>
      </div>
    `;
  }

  function bindEvents(woche, azubiId, berichtTyp, monday) {
    // Navigation
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
      const prev = DateUtil.getMondayOfKW(currentKW, currentYear);
      prev.setDate(prev.getDate() - 7);
      currentKW = DateUtil.getKW(prev);
      currentYear = DateUtil.getKWYear(prev);
      transitionedRender('prev');
    });
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
      const next = DateUtil.getMondayOfKW(currentKW, currentYear);
      next.setDate(next.getDate() + 7);
      currentKW = DateUtil.getKW(next);
      currentYear = DateUtil.getKWYear(next);
      transitionedRender('next');
    });

    // Azubi-Wechsel (Ausbilder)
    document.querySelectorAll('.ausbilder-chip[data-azubi-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        viewAzubiId = btn.dataset.azubiId;
        render();
      });
    });

    // (Format-Toggle entfernt: berichtTyp ist pro Azubi fest in DB.users
    //  hinterlegt – technische Azubis = täglich, kaufmännische = wöchentlich.
    //  Ein Wechsel zur Laufzeit würde die beiden Erfassungs-Workflows
    //  künstlich koppeln und ist fachlich nicht vorgesehen.)

    const isReadonly = isAusbilder || (woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt'));

    if (berichtTyp === 'täglich') {
      bindDayCardEvents();
      initDayQuillEditors(woche, monday, isReadonly);
    } else {
      bindWochenEvents(woche, monday);
    }

    // Manuelles „Speichern" – flusht Auto-Save Timer und stößt ein Save an.
    document.getElementById('saveBtn')?.addEventListener('click', async () => {
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const ds = DateUtil.toISODate(d);
        if (saveTimers[ds]) {
          clearTimeout(saveTimers[ds]);
          delete saveTimers[ds];
        }
        await autoSave(ds);
      }
      if (berichtTyp === 'wöchentlich' && typeof flushWochenAutoSave === 'function') {
        await flushWochenAutoSave();
      }
      Toast.success('Gespeichert', 'Alle Änderungen wurden gespeichert.');
      render();
    });

    // „Weitere Aktionen"-Dropdown – Toggle + Außenklick schließt
    const weitereAktionenBtn = document.getElementById('weitereAktionenBtn');
    const weitereAktionenDropdown = document.getElementById('weitereAktionenDropdown');
    const weitereAktionenMenu = weitereAktionenDropdown?.querySelector('.dropdown__menu');
    weitereAktionenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = weitereAktionenMenu?.classList.contains('open');
      document.querySelectorAll('.dropdown__menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) {
        weitereAktionenMenu?.classList.add('open');
        weitereAktionenBtn.setAttribute('aria-expanded', 'true');
      } else {
        weitereAktionenBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', () => {
      if (weitereAktionenMenu?.classList.contains('open')) {
        weitereAktionenMenu.classList.remove('open');
        weitereAktionenBtn?.setAttribute('aria-expanded', 'false');
      }
    });

    // „Woche bearbeiten" – zieht die Freigabe zurück
    document.getElementById('withdrawBtn')?.addEventListener('click', () => {
      weitereAktionenMenu?.classList.remove('open');
      Modal.open('withdrawModal');
    });
    document.getElementById('withdrawConfirmBtn')?.addEventListener('click', async () => {
      await DB.setWocheStatus(woche.id, 'offen');
      Modal.closeAll();
      Toast.info('Bearbeitung freigegeben', `KW ${currentKW} kann wieder bearbeitet werden.`);
      render();
    });

    // Freigabe – mit Pflichtfeld-Validierung. Der Freigabe-Button sitzt jetzt
    // nur noch unten in der Bottom-Bar (#releaseBtnBottom); der frühere
    // Hero-Button wurde entfernt.
    document.getElementById('releaseBtnBottom')?.addEventListener('click', async () => {
      // Pending Auto-Saves flushen, damit Validierung den aktuellsten Stand sieht.
      // Im täglich-Format pro Tag ein Auto-Save; im wöchentlich-Format
      // zusätzlich der Wochen-Auto-Save (für Quills + Lernort/Unterweisung).
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const ds = DateUtil.toISODate(d);
        if (saveTimers[ds]) {
          clearTimeout(saveTimers[ds]);
          delete saveTimers[ds];
          await autoSave(ds);
        }
      }
      if (berichtTyp === 'wöchentlich' && typeof flushWochenAutoSave === 'function') {
        await flushWochenAutoSave();
      }
      const aktuelleWoche = await DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
      const errors = await validateWoche(aktuelleWoche, monday);
      // ── TEMP DEBUG (Freigabe-Validierung) – wieder entfernen ──────────
      console.group('%c[Freigabe-Debug] KW ' + currentKW + '/' + currentYear, 'color:#e8a000;font-weight:bold');
      console.log('berichtTyp (User):', await getBerichtTyp());
      console.log('woche.typ:', aktuelleWoche?.typ, '| wochenOrt:', aktuelleWoche?.wochenOrt, '| unterweisungAktiv:', aktuelleWoche?.unterweisungAktiv);
      console.log('betriebEintrag leer?', htmlIsEmpty(aktuelleWoche?.betriebEintrag || ''),
                  '| schuleEintrag leer?', htmlIsEmpty(aktuelleWoche?.schuleEintrag || ''),
                  '| unterweisungEintrag leer?', htmlIsEmpty(aktuelleWoche?.unterweisungEintrag || ''));
      console.log('monday:', DateUtil.toISODate(monday));
      console.table((aktuelleWoche?.tage || []).map(t => ({
        datum: t.datum, anwesenheit: t.anwesenheit, ort: t.ort,
        stunden: t.stunden, typeofStunden: typeof t.stunden,
        betriebEintragLeer: htmlIsEmpty(t.betriebEintrag || t.eintrag || ''),
      })));
      console.log('ERRORS (' + errors.length + '):', JSON.parse(JSON.stringify(errors)));
      console.groupEnd();
      // ── /TEMP DEBUG ──────────────────────────────────────────────────
      if (errors.length > 0) {
        await showValidationErrors(errors);
        return;
      }
      clearValidationErrors();
      Modal.open('releaseModal');
    });
    document.getElementById('releaseConfirmBtn')?.addEventListener('click', async () => {
      if (!woche) { Toast.warning('Keine Einträge', 'Bitte zuerst Einträge erfassen.'); Modal.closeAll(); return; }
      await DB.setWocheStatus(woche.id, 'freigegeben');
      Modal.closeAll();
      Toast.success('Freigegeben', `KW ${currentKW} wurde zur Abnahme freigegeben.`);
      render();
    });

    document.getElementById('approveBtn')?.addEventListener('click', () => {
      const dayFields = buildDayCommentFields(woche, monday);
      document.getElementById('approveDayComments').innerHTML = dayFields ||
        '<p style="color:var(--pm-grey-500);font-size:var(--text-sm);margin:0">Möchtest du diese Woche genehmigen?</p>';
      Modal.open('approveModal');
    });
    document.getElementById('approveConfirmBtn')?.addEventListener('click', async () => {
      const dayCommentInputs = document.querySelectorAll('#approveDayComments [data-day-comment]');
      for (const input of dayCommentInputs) {
        const text = input.value.trim();
        if (text) {
          await DB.addKommentar(woche.id, {
            userId: user.id, text,
            datum: new Date().toLocaleDateString('de-DE'), typ: 'ausbilder',
            tagId: parseInt(input.dataset.dayComment),
          });
        }
      }
      await DB.setWocheStatus(woche.id, 'genehmigt');
      await DB.addBenachrichtigung({
        userId: woche.azubiId,
        type: 'genehmigt',
        wocheId: woche.id,
        azubiId: woche.azubiId,
        kw: woche.kw,
        year: woche.year,
        fromUserId: user.id,
      });
      Modal.closeAll();
      Toast.success('Genehmigt', `KW ${currentKW} wurde genehmigt.`);
      render();
    });
    document.getElementById('rejectBtn')?.addEventListener('click', () => {
      document.getElementById('rejectReason').value = '';
      Modal.open('rejectModal');
    });
    document.getElementById('rejectConfirmBtn')?.addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) { Toast.error('Pflichtfeld', 'Bitte eine Begründung eingeben.'); return; }
      if (!woche) return;
      await DB.addKommentar(woche.id, {
        userId: user.id, text: reason,
        datum: new Date().toLocaleDateString('de-DE'), typ: 'abgelehnt',
      });
      await DB.setWocheStatus(woche.id, 'abgelehnt');
      await DB.addBenachrichtigung({
        userId: woche.azubiId,
        type: 'abgelehnt',
        wocheId: woche.id,
        azubiId: woche.azubiId,
        kw: woche.kw,
        year: woche.year,
        fromUserId: user.id,
      });
      Modal.closeAll();
      Toast.warning('Zurückgegeben', `KW ${currentKW} wurde zurückgegeben.`);
      render();
    });

    document.getElementById('addCommentBtn')?.addEventListener('click', () => {
      pendingDayTagId = null;
      document.getElementById('commentText').value = '';
      Modal.open('commentModal');
    });
    document.querySelectorAll('.tag-row__add-day-comment').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingDayTagId = parseInt(btn.dataset.addDayComment);
        document.getElementById('commentText').value = '';
        Modal.open('commentModal');
      });
    });
    document.getElementById('commentSubmitBtn')?.addEventListener('click', async () => {
      const text = document.getElementById('commentText').value.trim();
      if (!text) { Toast.error('Pflichtfeld', 'Bitte einen Kommentar eingeben.'); return; }
      if (!woche) return;
      const payload = { userId: user.id, text, datum: new Date().toLocaleDateString('de-DE'), typ: 'ausbilder' };
      if (pendingDayTagId) payload.tagId = pendingDayTagId;
      await DB.addKommentar(woche.id, payload);
      pendingDayTagId = null;
      Modal.closeAll();
      Toast.success('Kommentar', 'Kommentar wurde gespeichert.');
      render();
    });

    Modal.init();
  }

  function bindDayCardEvents() {
    // Editor ist in jeder Tageskarte permanent sichtbar (kein Toggle).
    // Daher kein Klick-Handler auf .tag-row__summary mehr nötig.

    // Anwesenheit live-toggle
    document.querySelectorAll('select[data-field="anwesenheit"]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const dateStr = sel.dataset.date;
        const isAbwesend = sel.value !== 'anwesend' && sel.value !== '';
        const row = document.getElementById('dayCard_' + dateStr);
        if (row) {
          const ortSel = row.querySelector('select[data-field="ort"]');
          if (ortSel) {
            ortSel.disabled = isAbwesend;
            // Ort hat einen Standard ("Betrieb") und gilt damit – wie Ganztag –
            // direkt als ausgefüllt; kein Pflicht-Klick beim Anwesend-Werden.
            if (!isAbwesend && !ortSel.value) ortSel.value = 'Betrieb';
          }

          const pill = row.querySelector('.dauer-pill');
          if (pill) {
            pill.classList.toggle('dauer-pill--readonly', isAbwesend);
            pill.querySelectorAll('.dauer-pill__opt').forEach(b => b.disabled = isAbwesend);
          }

          const editorSec = document.getElementById('editorSection_' + dateStr);
          const absenceSec = document.getElementById('absenceSection_' + dateStr);
          if (editorSec) editorSec.style.display = isAbwesend ? 'none' : '';
          if (absenceSec) absenceSec.style.display = isAbwesend ? '' : 'none';

          if (!isAbwesend && !quillInstances['day_betrieb_' + dateStr]) {
            const w = await DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
            const ro = w && (w.status === 'freigegeben' || w.status === 'genehmigt');
            initSingleDayEditor(dateStr, w, ro);
          }
        }
        await autoSave(dateStr);
        updateStundenDisplay();
      });
    });

    // Übrige Felder (Ort, Textareas) – Sichtbarkeit der Betrieb-/Schule-Kacheln
    // richtet sich nach dem gewählten Ort.
    document.querySelectorAll('select[data-field="ort"], textarea[data-field]').forEach(el => {
      el.addEventListener('change', async () => {
        if (el.dataset.field === 'ort') {
          const dateStr = el.dataset.date;
          const visible = getVisibleDaySections(el.value);
          ['betrieb', 'schule'].forEach(kind => {
            const section = document.querySelector(`.day-section--${kind}[data-date="${dateStr}"]`);
            if (!section) return;
            const isVisible = visible.has(kind);
            section.classList.toggle('day-section--hidden', !isVisible);
            // Sobald eine kollabierbare Kachel (Schule) durch den Ort sichtbar
            // wird, gleich aufklappen – sonst muss der Nutzer noch manuell
            // klicken, was bei einer gerade gewählten Option überflüssig ist.
            if (isVisible && DAY_SECTION_META[kind].collapsible) {
              section.classList.add('day-section--expanded');
              const header = section.querySelector('.day-section__header--toggle');
              if (header) header.setAttribute('aria-expanded', 'true');
            }
          });

          // Unterweisung erscheint erst, wenn ein Ort gewählt wurde.
          // Bestehender Inhalt schützt davor, dass die Sektion wieder
          // verschwindet, wenn der Ort später zurückgesetzt wird.
          const uSection = document.querySelector(`.day-section--unterweisung[data-date="${dateStr}"]`);
          if (uSection) {
            const qU = quillInstances['day_unterweisung_' + dateStr];
            const hasUnterweisungContent = qU && !htmlIsEmpty(qU.root.innerHTML);
            const uVisible = !!el.value || hasUnterweisungContent;
            uSection.classList.toggle('day-section--hidden', !uVisible);
          }

          // Nach Wahl eines Orts die Tageskachel automatisch aufklappen und
          // dorthin scrollen, damit der Eintrag sofort erfasst werden kann.
          // (Nur im Tages-Modus relevant – nur dort gibt es dayCard_<datum>.)
          if (el.value) {
            const card = document.getElementById('dayCard_' + dateStr);
            if (card) {
              card.classList.add('expanded');
              const chev = card.querySelector('.tag-row__chevron');
              if (chev) {
                chev.setAttribute('aria-expanded', 'true');
                chev.setAttribute('aria-label', 'Tag zuklappen');
              }
              card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
        await autoSave(el.dataset.date);
      });
    });

    // Spinner-Callback
    setSpinnerCallback(async dateStr => {
      await autoSave(dateStr);
      updateStundenDisplay();
    });
  }

  function bindWochenEvents(woche, monday) {
    const isReadonly = isAusbilder || (woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt'));

    // Lernort-Umschalter → Schule-Kachel sofort ein-/ausblenden (optimistisch),
    // Speichern im Hintergrund. Kein Voll-Rerender, kein Warten aufs Netzwerk.
    document.getElementById('wochenOrtSelect')?.addEventListener('change', (e) => {
      const wlocal = collectWochenState(woche);
      if (e.target.value === 'betrieb_schule') addWochenKachel('schule', wlocal, isReadonly);
      else                                      removeWochenKachel('schule');
      debounceSaveWoche();
    });

    // Unterweisung-Checkbox → Unterweisungs-Kachel sofort ein-/ausblenden.
    document.getElementById('unterweisungCheck')?.addEventListener('change', (e) => {
      const wlocal = collectWochenState(woche);
      if (e.target.checked) addWochenKachel('unterweisung', wlocal, isReadonly);
      else                  removeWochenKachel('unterweisung');
      debounceSaveWoche();
    });

    initWochenQuillEditors(woche, isReadonly);

    // Per-Tag Zeilen: Anwesenheit, Ort, Stunden
    document.querySelectorAll('.tag-row--compact[data-date]').forEach(row => {
      const dateStr = row.dataset.date;
      const anwesenheitSel = row.querySelector(`select[data-field="anwesenheit"]`);
      const ortSel         = row.querySelector(`select[data-field="ort"]`);

      if (anwesenheitSel) {
        anwesenheitSel.addEventListener('change', async () => {
          const isAbwesend = anwesenheitSel.value !== 'anwesend' && anwesenheitSel.value !== '';
          if (ortSel) {
            ortSel.disabled = isAbwesend;
            if (!isAbwesend && !ortSel.value) ortSel.value = 'Betrieb';
          }
          const pill = row.querySelector('.dauer-pill');
          if (pill) {
            pill.classList.toggle('dauer-pill--readonly', isAbwesend);
            pill.querySelectorAll('.dauer-pill__opt').forEach(b => b.disabled = isAbwesend);
          }
          await autoSave(dateStr);
          updateStundenDisplay();
        });
      }
      if (ortSel) ortSel.addEventListener('change', async () => await autoSave(dateStr));
    });

    // Spinner-Callback registrieren
    setSpinnerCallback(async dateStr => await autoSave(dateStr));

    // Anhänge: Büroklammer-Button öffnet das versteckte File-Input.
    // (Button + Input existieren im Markup nur, wenn die Woche bearbeitbar ist.)
    const anhangBtn = document.getElementById('wochenAnhangBtn');
    const anhangInput = document.getElementById('wochenAnhangInput');
    if (anhangBtn && anhangInput) {
      anhangBtn.addEventListener('click', () => anhangInput.click());
      anhangInput.addEventListener('change', async () => {
        await handleAnhangFiles(anhangInput.files);
        anhangInput.value = ''; // erlaubt erneutes Wählen derselben Datei
      });
    }

    // Bestehende Anhänge laden – auch im Readonly-Fall (Ausbilder: nur Download).
    refreshAnhaenge(woche?.id, isReadonly);
  }

  const saveTimers = {};
  function debounceSave(dateStr, ms = 800) {
    clearTimeout(saveTimers[dateStr]);
    saveTimers[dateStr] = setTimeout(() => autoSave(dateStr), ms);
  }

  let wochenSaveTimer = null;
  function debounceSaveWoche(ms = 800) {
    clearTimeout(wochenSaveTimer);
    wochenSaveTimer = setTimeout(() => autoSaveWoche(), ms);
  }
  /** Pending Wochen-Auto-Save sofort ausführen (für Freigabe-Validierung). */
  async function flushWochenAutoSave() {
    if (wochenSaveTimer) {
      clearTimeout(wochenSaveTimer);
      wochenSaveTimer = null;
    }
    await autoSaveWoche();
  }

  // Delegierter Klick-Handler für Kommentar-Löschen – einmal registriert,
  // überlebt alle render()-Aufrufe, da mainContent selbst nicht ausgetauscht wird.
  document.getElementById('mainContent').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-kommentar]');
    if (!btn) return;
    const id = parseInt(btn.dataset.deleteKommentar);
    if (!id) return;
    await DB.deleteKommentar(id);
    Toast.success('Kommentar', 'Kommentar wurde gelöscht.');
    render();
  });

  // Delegierter Klick-Handler für Anhang-Löschen. Aktualisiert nur die
  // Anhang-Liste (kein voller render(), der die Quill-Editoren neu aufbaut).
  document.getElementById('mainContent').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-anhang]');
    if (!btn) return;
    const id = parseInt(btn.dataset.deleteAnhang);
    if (!id) return;
    try {
      await DB.deleteAnhang(id);
      Toast.success('Anhang', 'Anhang wurde gelöscht.');
    } catch (err) {
      Toast.error('Fehler', err.message || 'Anhang konnte nicht gelöscht werden.');
      return;
    }
    const w = await DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
    await refreshAnhaenge(w?.id, false);
  });

  /* Toggle für Tag-Rows wird inline am .tag-row__summary aufgesetzt,
     siehe Markup unten. Dadurch braucht's keinen Delegation-Listener
     und der Klick feuert verlässlich auch zwischen den Form-Controls. */

  await render();
});

// ── Globale Hilfsfunktionen ───────────────────────────────────────

function toggleDayCard(dateStr) {
  const card = document.getElementById('dayCard_' + dateStr);
  card?.classList.toggle('expanded');
}

/* Inline-Handler, am .tag-row__summary verkabelt. Robuster als ein
   delegierter document-Listener, weil das click-Event direkt am Element
   feuert und nicht durch fehlgeleitete Bubbling-Pfade verschluckt wird.
   Klicks auf Form-Controls werden ignoriert, damit der Tag nicht zuklappt
   wenn man einen Select öffnet oder den Spinner bedient. */
function handleTagRowToggle(e) {
  if (e.target.closest('select, option, input, textarea, .time-spinner, .dauer-pill')) return;
  // Buttons ignorieren – AUSSER dem Aufklapp-Pfeil, der ebenfalls toggeln soll.
  if (e.target.closest('button') && !e.target.closest('.tag-row__chevron')) return;
  const row = e.currentTarget.closest('.tag-row');
  if (!row) return;
  if (row.classList.contains('tag-row--weekend')) return;
  if (row.classList.contains('tag-row--compact')) return;
  if (!row.querySelector('.tag-row__body')) return;

  const opened = row.classList.toggle('expanded');
  const chev = row.querySelector('.tag-row__chevron');
  if (chev) {
    chev.setAttribute('aria-expanded', String(opened));
    chev.setAttribute('aria-label', opened ? 'Tag zuklappen' : 'Tag aufklappen');
  }
}

function clearDayEntry(dateStr) {
  ['betrieb', 'schule', 'unterweisung'].forEach(kind => {
    const q = quillInstances[`day_${kind}_${dateStr}`];
    if (q) q.setContents([]);
  });
  const counter = document.getElementById('charCount_' + dateStr);
  if (counter) counter.textContent = '0 Zeichen';
}

function toggleDaySection(headerEl) {
  const section = headerEl.closest('.day-section');
  if (!section) return;
  const isExpanded = section.classList.toggle('day-section--expanded');
  headerEl.setAttribute('aria-expanded', String(isExpanded));
}

function clearWochenKachel(kachelId) {
  const quill = quillInstances['woche_' + kachelId];
  if (quill) {
    quill.setContents([]);
    const counter = document.getElementById('wochenCharCount_' + kachelId);
    if (counter) counter.textContent = '0 Zeichen';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Visuelle Quittung am Spinner-Input: leichter Bump in der jeweiligen
   Richtung. Vor jedem Trigger die Animation-Klassen entfernen und einen
   Reflow erzwingen, sonst feuert die Animation beim wiederholten Klick
   in dieselbe Richtung nicht mehr. */
function pulseSpinnerInput(inp, direction) {
  inp.classList.remove('spinner-bump-up', 'spinner-bump-down');
  void inp.offsetWidth;
  inp.classList.add('spinner-bump-' + direction);
}

/* Tagdauer-Pill: Klick auf Ganztag/Halbtag setzt den Wert, verschiebt den
   Glas-Indikator (per data-dauer/CSS) und löst denselben Auto-Save aus wie
   früher der Zeit-Spinner (window._spinnerCallback). */
function handleDauerClick(btn) {
  if (btn.disabled) return;
  const pill = btn.closest('.dauer-pill');
  if (!pill || pill.classList.contains('dauer-pill--readonly')) return;
  const val = btn.dataset.dauerSet === 'halbtag' ? 'halbtag' : 'ganztag';
  if (pill.dataset.dauer !== val) {
    pill.dataset.dauer = val;
    pill.classList.remove('dauer-pill--morph');
    void pill.offsetWidth;
    pill.classList.add('dauer-pill--morph');
  }
  window._spinnerCallback?.(pill.dataset.date);
}

function handleSpinnerClick(btn) {
  if (btn.disabled) return;
  const spinner = btn.closest('.time-spinner');
  if (!spinner || spinner.classList.contains('time-spinner--readonly')) return;
  const dateStr = spinner.dataset.date;
  const part = btn.dataset.part;
  const inp = spinner.querySelector(`.time-spinner__input[data-part="${part}"]`);
  if (!inp) return;
  const oldV = parseInt(inp.value) || 0;
  let v = oldV;
  if (btn.dataset.action === 'up') {
    v = part === 'h' ? Math.min(23, v + 1) : (v + 5 >= 60 ? 0 : v + 5);
  } else {
    v = part === 'h' ? Math.max(0, v - 1) : (v - 5 < 0 ? 55 : v - 5);
  }
  if (v !== oldV) {
    pulseSpinnerInput(inp, btn.dataset.action === 'up' ? 'up' : 'down');
  }
  inp.value = String(v).padStart(2, '0');
  window._spinnerCallback?.(dateStr);
}

function handleSpinnerInput(inp) {
  if (inp.readOnly) return;
  const spinner = inp.closest('.time-spinner');
  if (!spinner || spinner.classList.contains('time-spinner--readonly')) return;
  const dateStr = spinner.dataset.date;
  const part = inp.dataset.part;
  const oldV = parseInt(inp.dataset.lastValue) || 0;
  let v = parseInt(inp.value) || 0;
  v = part === 'h' ? Math.min(23, Math.max(0, v)) : Math.min(59, Math.max(0, v));
  if (v !== oldV) {
    pulseSpinnerInput(inp, v > oldV ? 'up' : 'down');
  }
  inp.value = String(v).padStart(2, '0');
  inp.dataset.lastValue = String(v);
  window._spinnerCallback?.(dateStr);
}
