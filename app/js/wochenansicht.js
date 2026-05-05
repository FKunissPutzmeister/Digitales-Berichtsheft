/* ===================================================================
   WOCHENANSICHT.JS
   =================================================================== */

const quillInstances = {};

const QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  [{ align: [] }],
  ['bold', 'italic', 'underline'],
  ['link'],
  [{ list: 'bullet' }, { list: 'ordered' }],
  ['clean'],
  [{ indent: '-1' }, { indent: '+1' }],
  ['image'],
  ['blockquote'],
  ['undo', 'redo'],
];

const QUILL_HANDLERS = {
  undo: function() { this.quill.history.undo(); },
  redo: function() { this.quill.history.redo(); },
};

document.addEventListener('DOMContentLoaded', () => {
  const user = initPage('nav-wochenansicht', [{ label: 'Wochenansicht', href: 'wochenansicht.html' }]);
  if (!user) return;

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

  let viewAzubiId = user.role === 'azubi' ? user.id : null;
  if (savedAzubiId && user.role !== 'azubi') {
    viewAzubiId = parseInt(savedAzubiId);
    sessionStorage.removeItem('gotoAzubiId');
  } else if (user.role !== 'azubi' && !viewAzubiId) {
    // Ausbilder/Admin ohne Vorauswahl: ersten zugewiesenen Azubi anzeigen
    const firstAzubi = DB.getAzubis()[0];
    if (firstAzubi) viewAzubiId = firstAzubi.id;
  }

  function getBerichtTyp() {
    const azubiUser = DB.getUser(viewAzubiId || user.id);
    return azubiUser?.berichtTyp || 'täglich';
  }

  function getCurrentWoche() {
    return DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
  }

  // ── Zeit-Spinner Hilfsfunktionen ──────────────────────────────────

  function decimalToTimeStr(decimal) {
    const mins = Math.round((decimal || 0) * 60);
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  }

  function renderTimeSpinner(dateStr, stunden, readonly) {
    const mins = Math.round((stunden || 0) * 60);
    const h    = Math.floor(mins / 60);
    const m    = mins % 60;
    const hStr = String(h).padStart(2, '0');
    const mStr = String(m).padStart(2, '0');
    const dis  = readonly ? 'disabled' : '';
    const ro   = readonly ? 'readonly' : '';
    const cls  = readonly ? ' time-spinner--readonly' : '';
    const oc   = readonly ? '' : 'onclick="handleSpinnerClick(this)"';
    const onchg = readonly ? '' : 'onchange="handleSpinnerInput(this)"';
    const up   = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:10px;height:10px;pointer-events:none"><polyline points="18 15 12 9 6 15"/></svg>`;
    const dn   = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:10px;height:10px;pointer-events:none"><polyline points="6 9 12 15 18 9"/></svg>`;
    return `<div class="time-spinner${cls}" data-field="stunden" data-date="${dateStr}">
      <div class="time-spinner__unit">
        <button type="button" class="time-spinner__btn" data-action="up" data-part="h" ${dis} ${oc} tabindex="-1">${up}</button>
        <input class="time-spinner__input" type="text" inputmode="numeric" data-part="h" value="${hStr}" maxlength="2" ${ro} ${onchg} onfocus="this.select()">
        <button type="button" class="time-spinner__btn" data-action="down" data-part="h" ${dis} ${oc} tabindex="-1">${dn}</button>
      </div>
      <span class="time-spinner__sep">:</span>
      <div class="time-spinner__unit">
        <button type="button" class="time-spinner__btn" data-action="up" data-part="m" ${dis} ${oc} tabindex="-1">${up}</button>
        <input class="time-spinner__input" type="text" inputmode="numeric" data-part="m" value="${mStr}" maxlength="2" ${ro} ${onchg} onfocus="this.select()">
        <button type="button" class="time-spinner__btn" data-action="down" data-part="m" ${dis} ${oc} tabindex="-1">${dn}</button>
      </div>
    </div>`;
  }

  function getSpinnerDecimal(dateStr) {
    const s = document.querySelector(`.time-spinner[data-date="${dateStr}"]`);
    if (!s) return 0;
    const h = parseInt(s.querySelector('input[data-part="h"]')?.value) || 0;
    const m = parseInt(s.querySelector('input[data-part="m"]')?.value) || 0;
    return h + m / 60;
  }

  function setSpinnerCallback(cb) {
    window._spinnerCallback = cb;
  }

  function render() {
    const berichtTyp = getBerichtTyp();
    const azubiId = viewAzubiId || user.id;
    const woche = DB.getWoche(azubiId, currentKW, currentYear);
    const monday = DateUtil.getMondayOfKW(currentKW, currentYear);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const isReadonly = woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt');
    const isAusbilder = ['ausbilder', 'admin'].includes(user.role);
    const canApprove = isAusbilder && woche && woche.status === 'freigegeben';
    // Freigabe-Button erscheint, wenn die Woche bearbeitbar ist:
    // – noch nicht angelegt
    // – status 'offen' (Erstfreigabe)
    // – status 'abgelehnt' (erneute Freigabe nach Rückgabe durch Ausbilder)
    const canRelease = user.role === 'azubi'
      && (!woche || woche.status === 'offen' || woche.status === 'abgelehnt');
    const gesamtstundenDisplay = (woche?.tage || []).reduce((s, t) => s + (t.stunden || 0), 0);

    // Stammdaten des aktuell sichtbaren Azubis
    const azubiUser = DB.getUser(azubiId);
    const azubiZuw  = DB.getAktuellerAusbilder(azubiId);
    const azubiAusbilder = azubiZuw ? DB.getUser(azubiZuw.ausbilderId) : null;
    const ausbildungsjahr = calcAusbildungsjahr(azubiUser?.ausbildungsBeginn);

    const main = document.getElementById('mainContent');
    main.innerHTML = `
      ${isAusbilder ? renderAzubiSelector(azubiId) : ''}

      ${renderStammdatenBlock(azubiUser, azubiAusbilder, ausbildungsjahr, azubiZuw)}

      ${renderStatusBanner(woche, azubiAusbilder, user)}

      <div class="week-header">
        <div class="week-nav">
          <button class="week-nav__btn" id="prevWeekBtn" aria-label="Vorherige Woche">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="week-nav__current">
            <div>${DateUtil.formatDateShort(DateUtil.toISODate(monday))} – ${DateUtil.formatDateShort(DateUtil.toISODate(sunday))}&nbsp;&nbsp;<span class="week-nav__kw">KW ${currentKW}</span></div>
          </div>
          <button class="week-nav__btn" id="nextWeekBtn" aria-label="Nächste Woche">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div class="week-actions">
          ${woche ? `<span class="badge badge--${woche.status}">${getStatusLabel(woche.status)}</span>` : '<span class="badge badge--offen">Offen</span>'}
          ${canRelease ? `<button class="btn btn-primary" id="releaseBtn">Zur Abnahme freigeben</button>` : ''}
          ${canApprove ? `
            <button class="btn btn-success" id="approveBtn">Genehmigen</button>
            <button class="btn btn-danger" id="rejectBtn">Zurückgeben</button>
          ` : ''}
          ${woche ? `
            <button class="btn btn-outline" id="exportBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              PDF
            </button>
          ` : ''}
        </div>
      </div>

      <div class="week-status-bar">
        <div class="week-status-bar__item">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Gesamtstunden: <strong id="statusTotalHours">${decimalToTimeStr(gesamtstundenDisplay)}</strong></span>
        </div>
        ${!isReadonly && user.role === 'azubi' ? `
        <div class="week-status-bar__sep"></div>
        <div class="week-status-bar__autosave">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Automatisch gespeichert
        </div>
        ` : ''}
        ${isReadonly ? `
        <div class="week-status-bar__item week-status-bar__readonly" style="color:var(--pm-grey-500)">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Schreibgeschützt
        </div>
        ` : ''}
      </div>

      ${berichtTyp === 'wöchentlich'
        ? renderWochenKacheln(woche, isReadonly, monday)
        : renderDayCards(woche, monday, isReadonly, isAusbilder)
      }

      <div class="week-total-bar">
        <span class="week-total-bar__label">Gesamtstunden diese Woche:</span>
        <span class="week-total-bar__value" id="totalHours">${decimalToTimeStr(gesamtstundenDisplay)}</span>
        <span class="week-total-bar__target">/ 40:00 Std.</span>
      </div>

      ${woche && woche.kommentare && woche.kommentare.length ? `
      <div class="card" style="margin-top:var(--sp-4)">
        <div class="card__header"><span class="card__title">Kommentare</span></div>
        <div class="card__body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
          ${woche.kommentare.map(k => renderComment(k)).join('')}
          ${isAusbilder ? `<button class="btn btn-outline" id="addCommentBtn" style="align-self:flex-start">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Kommentar hinzufügen
          </button>` : ''}
        </div>
      </div>
      ` : (isAusbilder && woche ? `
      <div style="margin-top:var(--sp-4)">
        <button class="btn btn-outline" id="addCommentBtn">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Kommentar hinzufügen
        </button>
      </div>
      ` : '')}
    `;

    bindEvents(woche, azubiId, berichtTyp, monday);
  }

  function renderAzubiSelector(currentId) {
    const azubis = DB.getAzubis();
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

  // ── Stammdaten-Block ──────────────────────────────────────────────
  function calcAusbildungsjahr(beginnStr, refDate = new Date()) {
    if (!beginnStr) return null;
    const start = new Date(beginnStr + 'T00:00:00');
    const months = (refDate.getFullYear() - start.getFullYear()) * 12 + (refDate.getMonth() - start.getMonth());
    return Math.max(1, Math.min(4, Math.floor(months / 12) + 1));
  }

  function renderStammdatenBlock(azubi, ausbilder, ausbildungsjahr, zuw) {
    if (!azubi) return '';
    const summarySub = [
      ausbildungsjahr ? `${ausbildungsjahr}. Ausbildungsjahr` : null,
      azubi.beruf,
      azubi.abteilung,
    ].filter(Boolean).join(' · ');

    const fields = [
      { label: 'Auszubildende/r',   value: azubi.name },
      { label: 'Beruf',             value: azubi.beruf || '–' },
      { label: 'Ausbildungsjahr',   value: ausbildungsjahr ? `${ausbildungsjahr}. Jahr` : '–' },
      { label: 'Ausbildungszeitraum', value: (azubi.ausbildungsBeginn && azubi.ausbildungsEnde)
          ? `${DateUtil.formatDate(azubi.ausbildungsBeginn)} – ${DateUtil.formatDate(azubi.ausbildungsEnde)}`
          : '–' },
      { label: 'Aktuelle Abteilung', value: zuw?.abteilung || azubi.abteilung || '–' },
      { label: 'Aktuelle/r Ausbilder/in', value: ausbilder ? ausbilder.name : '–' },
      { label: 'Berufsbildnummer',  value: azubi.berufsbildnummer || '–' },
      { label: 'Azubi-Nr.',         value: azubi.azubiNr || '–' },
      { label: 'IHK',               value: azubi.ihkName || '–' },
      { label: 'Ausbildungsbetrieb', value: azubi.unternehmen || '–' },
    ];

    return `
      <details class="stammdaten" id="stammdatenBlock">
        <summary class="stammdaten__summary">
          <div class="stammdaten__summary-icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div class="stammdaten__summary-text">
            <div class="stammdaten__summary-title">Stammdaten</div>
            <div class="stammdaten__summary-sub">${azubi.name}${summarySub ? ' · ' + summarySub : ''}</div>
          </div>
          <div class="stammdaten__summary-chevron" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </summary>
        <div class="stammdaten__body">
          <dl class="stammdaten__grid">
            ${fields.map(f => `
              <div class="stammdaten__field">
                <dt class="stammdaten__label">${f.label}</dt>
                <dd class="stammdaten__value">${f.value}</dd>
              </div>
            `).join('')}
          </dl>
        </div>
      </details>
    `;
  }

  // ── Tägliches Berichtsheft ────────────────────────────────────────

  function renderDayCards(woche, monday, readonly, isAusbilder) {
    const days = [
      { short: 'Mo' }, { short: 'Di' }, { short: 'Mi' },
      { short: 'Do' }, { short: 'Fr' }, { short: 'Sa' }, { short: 'So' },
    ];

    const rows = days.map((d, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const isWE = i >= 5;
      const isToday = DateUtil.isToday(dateStr);

      const tag = woche?.tage?.find(t => t.datum === dateStr) || {
        datum: dateStr, anwesenheit: isWE ? 'Wochenende' : '', ort: '', stunden: 0,
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
      const schuleExpanded  = hasSchule || tag.ort === 'Schule';
      const unterweisungExpanded = hasUnterweisung;

      const completion = getDayCompletion(tag, isWE);
      const completionTitle = {
        complete: 'Vollständig erfasst',
        partial:  'Teilweise erfasst – Stunden oder Eintrag fehlen',
        empty:    'Noch nicht ausgefüllt',
        absent:   'Abwesenheit erfasst',
        we:       'Wochenende',
      }[completion];

      const dayNumHtml = isToday
        ? `<span class="day-card__day-num--today">${date.getDate()}</span>`
        : `<span class="wochen-tage-row__dn">${date.getDate()}.</span>`;

      return `
        <div class="tag-row${isWE ? ' tag-row--weekend' : ''}${isToday ? ' tag-row--today' : ''}${hasEntry ? ' tag-row--has-entry' : ''}${woche ? ' status-' + woche.status : ''}"
             id="dayCard_${dateStr}" data-date="${dateStr}" data-completion="${completion}">
          <div class="tag-row__summary">
            <div class="wochen-tage-row__tag">
              <span class="wochen-tage-row__wt">${d.short}</span>
              ${dayNumHtml}
              ${!isWE ? `<span class="tag-row__completion-dot tag-row__completion-dot--${completion}"
                              title="${completionTitle}" aria-label="${completionTitle}"></span>` : ''}
            </div>
            <div>
              <select class="day-card__select" data-field="anwesenheit" data-date="${dateStr}"
                      ${isWE || readonly ? 'disabled' : ''}>
                ${ANWESENHEIT_OPTS.map(o =>
                  `<option value="${o}" ${tag.anwesenheit === o ? 'selected' : ''}>${o}</option>`
                ).join('')}
              </select>
            </div>
            <div>
              ${!isWE ? `
              <select class="day-card__select" data-field="ort" data-date="${dateStr}"
                      ${readonly || isAbwesend ? 'disabled' : ''}>
                ${ORT_OPTS.map(o =>
                  `<option value="${o}" ${tag.ort === o ? 'selected' : ''}>${o || '– Ort –'}</option>`
                ).join('')}
              </select>
              ` : ''}
            </div>
            <div style="display:flex;justify-content:flex-end">
              ${!isWE
                ? renderTimeSpinner(dateStr, isAbwesend ? 0 : tag.stunden, isAbwesend || readonly)
                : `<span style="font-size:var(--text-xs);color:var(--pm-grey-500);font-weight:700">WE</span>`}
            </div>
            ${!isWE
              ? `<div class="tag-row__chevron"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><polyline points="6 9 12 15 18 9"/></svg></div>`
              : `<div></div>`}
          </div>

          ${!isWE ? `
          <div class="tag-row__body" id="dayBody_${dateStr}">
            <div class="tag-row__validation" id="validationMsg_${dateStr}" role="alert" hidden></div>
            <div id="editorSection_${dateStr}" class="day-sections" style="${isAbwesend ? 'display:none' : ''}">
              ${renderDaySection('betrieb', dateStr, true, true, readonly)}
              ${renderDaySection('schule', dateStr, true, schuleExpanded, readonly)}
              ${renderDaySection('unterweisung', dateStr, true, unterweisungExpanded, readonly)}
              <div class="day-card__footer">
                <span class="day-card__char-count" id="charCount_${dateStr}">0 Zeichen</span>
                ${!readonly ? `<button class="btn btn-sm btn-ghost" onclick="clearDayEntry('${dateStr}')">Tag leeren</button>` : ''}
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
          </div>
          ` : ''}
        </div>
      `;
    });

    return `
      <div class="tag-tabelle__legend">
        <span class="legend-item"><span class="legend-dot legend-dot--complete"></span> vollständig</span>
        <span class="legend-item"><span class="legend-dot legend-dot--partial"></span> teilweise</span>
        <span class="legend-item"><span class="legend-dot legend-dot--empty"></span> leer</span>
        <span class="legend-item"><span class="legend-dot legend-dot--absent"></span> Abwesenheit</span>
        <span class="legend-required">* Pflichtfeld bei Anwesenheit</span>
      </div>
      <div class="tag-tabelle">
        <div class="tag-tabelle__header">
          <div>Tag</div>
          <div>Anwesenheit <span class="legend-required-mark">*</span></div>
          <div>Ort</div>
          <div style="text-align:right">Std. <span class="legend-required-mark">*</span></div>
          <div></div>
        </div>
        ${rows.join('')}
      </div>
    `;
  }

  // ── Status-Banner ─────────────────────────────────────────────────
  function renderStatusBanner(woche, azubiAusbilder, currentUser) {
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
      const author = rejectionComment ? DB.getUser(rejectionComment.userId) : null;
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

    const hasStunden = (tag.stunden || 0) > 0;
    const hasEintrag = !htmlIsEmpty(tag.betriebEintrag || tag.eintrag || '')
                    || !htmlIsEmpty(tag.schuleEintrag || '')
                    || !htmlIsEmpty(tag.unterweisungEintrag || '');

    if (hasStunden && hasEintrag) return 'complete';
    if (hasStunden || hasEintrag) return 'partial';
    return 'empty';
  }

  /**
   * Tägliche Validierung – pro Tag wird Anwesenheit, Stunden UND ein
   * Eintrag (Betrieb/Schule/Unterweisung) verlangt.
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
        errors.push({ scope: 'tag', dateStr, day: dayLabel, msg: 'Anwesenheit nicht gesetzt' });
        continue;
      }
      if (tag.anwesenheit === 'anwesend') {
        if (!(tag.stunden > 0)) {
          errors.push({ scope: 'tag', dateStr, day: dayLabel, msg: 'Keine Arbeitsstunden erfasst' });
        }
        const hasEintrag = !htmlIsEmpty(tag.betriebEintrag || tag.eintrag || '')
                        || !htmlIsEmpty(tag.schuleEintrag || '')
                        || !htmlIsEmpty(tag.unterweisungEintrag || '');
        if (!hasEintrag) {
          errors.push({ scope: 'tag', dateStr, day: dayLabel, msg: 'Kein Eintrag (Betrieb/Schule/Unterweisung)' });
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
        errors.push({ scope: 'tag', dateStr, day: dayLabel, msg: 'Anwesenheit nicht gesetzt' });
        continue;
      }
      if (tag.anwesenheit === 'anwesend' && !(tag.stunden > 0)) {
        errors.push({ scope: 'tag', dateStr, day: dayLabel, msg: 'Keine Arbeitsstunden erfasst' });
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
  function validateWoche(woche, monday) {
    return getBerichtTyp() === 'wöchentlich'
      ? validateWocheWoechentlich(woche, monday)
      : validateWocheTaeglich(woche, monday);
  }

  function clearValidationErrors() {
    document.querySelectorAll('.tag-row--has-error').forEach(r => r.classList.remove('tag-row--has-error'));
    document.querySelectorAll('.tag-row__validation').forEach(e => {
      e.hidden = true;
      e.innerHTML = '';
    });
    document.querySelectorAll('.wochen-kachel--has-error').forEach(k => k.classList.remove('wochen-kachel--has-error'));
  }

  function showValidationErrors(errors) {
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
        byDate[e.dateStr].push(e.msg);
      }
    });

    // ── Tageskarten markieren (gilt für beide Formate) ──
    Object.keys(byDate).forEach(dateStr => {
      const row = document.getElementById('dayCard_' + dateStr);
      if (row) {
        row.classList.add('tag-row--has-error', 'expanded');
        const errBox = document.getElementById('validationMsg_' + dateStr);
        if (errBox) {
          errBox.hidden = false;
          errBox.innerHTML = `
            <div class="tag-row__validation-icon" aria-hidden="true">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div>
              <strong>Bitte ergänzen:</strong>
              <ul>${byDate[dateStr].map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
            </div>
          `;
        }
        // Editoren initialisieren falls Tag erst jetzt ausklappt
        const w = DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
        const ro = w && (w.status === 'freigegeben' || w.status === 'genehmigt');
        if (!quillInstances['day_betrieb_' + dateStr]) {
          initSingleDayEditor(dateStr, w, ro);
        }
      } else {
        // Wöchentlich-Format: keine Tageskarte vorhanden – stattdessen
        // die kompakte Stunden-Tabelle markieren
        const wochenRow = document.querySelector(`.wochen-tage-row[data-date="${dateStr}"]`);
        wochenRow?.classList.add('wochen-tage-row--error');
      }
    });

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
        || document.querySelector(`.wochen-tage-row[data-date="${firstErrorDate}"]`))
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

  function renderDaySection(kind, dateStr, hasContent, expanded, readonly) {
    const meta = DAY_SECTION_META[kind];
    const id = `${kind}_${dateStr}`;
    const expandedClass = expanded ? ' day-section--expanded' : '';
    const collapsibleClass = meta.collapsible ? ' day-section--collapsible' : '';

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
      ? `<button type="button" class="day-section__header day-section__header--toggle"
                 aria-expanded="${expanded}" aria-controls="editorWrap_${id}"
                 onclick="toggleDaySection(this)">
           ${headerInner}
         </button>`
      : `<div class="day-section__header">${headerInner}</div>`;

    return `
      <div class="day-section day-section--${kind}${expandedClass}${collapsibleClass}"
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
          toolbar: readonly ? false : { container: QUILL_TOOLBAR, handlers: QUILL_HANDLERS },
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
          <div class="wochen-options__left">
            <span class="wochen-options__label">Lernort:</span>
            <div class="wochen-ort-group">
              <label class="wochen-radio-opt${ort === 'betrieb' ? ' active' : ''}">
                <input type="radio" name="wochenOrt" value="betrieb"
                       ${ort === 'betrieb' ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                Betrieb
              </label>
              <label class="wochen-radio-opt${ort === 'betrieb_schule' ? ' active' : ''}">
                <input type="radio" name="wochenOrt" value="betrieb_schule"
                       ${ort === 'betrieb_schule' ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Betrieb + Schule
              </label>
            </div>
          </div>
          <div class="wochen-options__right">
            <label class="wochen-checkbox-opt">
              <input type="checkbox" id="unterweisungCheck"
                     ${unterweisung ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
              <span class="wochen-checkbox-opt__box">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              Unterweisung
            </label>
          </div>
        </div>

        <div class="wochen-tage-tabelle">
          ${buildWochenTageTabelle(woche, monday, readonly)}
        </div>

        <div class="wochen-kacheln" id="wochenKacheln">
          ${buildWochenKacheln(ort, unterweisung, woche, readonly)}
        </div>
      </div>
    `;
  }

  function buildWochenTageTabelle(woche, monday, readonly) {
    const days = [
      { short: 'Mo' }, { short: 'Di' }, { short: 'Mi' },
      { short: 'Do' }, { short: 'Fr' }, { short: 'Sa' }, { short: 'So' },
    ];

    const rows = days.map((d, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = DateUtil.toISODate(date);
      const isWE = i >= 5;
      const isToday = DateUtil.isToday(dateStr);

      const tag = woche?.tage?.find(t => t.datum === dateStr) || {
        datum: dateStr, anwesenheit: isWE ? 'Wochenende' : '', ort: '', stunden: 0
      };
      const isAbwesend = tag.anwesenheit && tag.anwesenheit !== 'anwesend' && tag.anwesenheit !== '';

      return `
        <div class="wochen-tage-row${isWE ? ' wochen-tage-row--weekend' : ''}${isToday ? ' wochen-tage-row--today' : ''}"
             data-date="${dateStr}">
          <div class="wochen-tage-row__tag">
            <span class="wochen-tage-row__wt">${d.short}</span>
            <span class="wochen-tage-row__dn">${date.getDate()}.</span>
          </div>
          <div>
            <select class="day-card__select" data-field="anwesenheit" data-date="${dateStr}"
                    style="width:100%" ${isWE || readonly ? 'disabled' : ''}>
              ${ANWESENHEIT_OPTS.map(o =>
                `<option value="${o}" ${tag.anwesenheit === o ? 'selected' : ''}>${o || '– Anwesenheit –'}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            ${!isWE ? `
            <select class="day-card__select" data-field="ort" data-date="${dateStr}"
                    style="width:100%" ${isAbwesend || readonly ? 'disabled' : ''}>
              ${ORT_OPTS.map(o =>
                `<option value="${o}" ${tag.ort === o ? 'selected' : ''}>${o || '– Ort –'}</option>`
              ).join('')}
            </select>
            ` : ''}
          </div>
          <div style="display:flex;justify-content:flex-end">
            ${!isWE ? renderTimeSpinner(dateStr, isAbwesend ? 0 : tag.stunden, isAbwesend || readonly)
                    : `<span style="font-size:var(--text-xs);color:var(--pm-grey-500);font-weight:700">WE</span>`}
          </div>
        </div>
      `;
    });

    const gesamt = (woche?.tage || []).reduce((s, t) => s + (t.stunden || 0), 0);

    return `
      <div class="wochen-tage-row wochen-tage-row--header">
        <div>Tag</div>
        <div>Anwesenheit</div>
        <div>Ort</div>
        <div style="text-align:right">Std.</div>
      </div>
      ${rows.join('')}
      <div class="wochen-tage-row wochen-tage-row--total">
        <div class="wochen-tage-row__total-label">Gesamt</div>
        <div></div>
        <div></div>
        <div style="text-align:right">
          <span id="wochenTageGesamt" class="wochen-tage-row__total-val">${decimalToTimeStr(gesamt)}</span>
        </div>
      </div>
    `;
  }

  function buildWochenKacheln(ort, unterweisung, woche, readonly) {
    const tiles = [
      {
        id: 'betrieb',
        label: 'Betrieb',
        hint: 'Betriebliche Tätigkeiten und Lerninhalte',
        placeholder: 'Tätigkeiten und Lerninhalte im Betrieb für diese Woche beschreiben…',
        text: woche?.betriebEintrag || '',
        show: true,
      },
      {
        id: 'schule',
        label: 'Schule',
        hint: 'Schulische Unterrichtsinhalte',
        placeholder: 'Unterrichtsinhalte der Berufsschule für diese Woche beschreiben…',
        text: woche?.schuleEintrag || '',
        show: ort === 'betrieb_schule',
      },
      {
        id: 'unterweisung',
        label: 'Unterweisung',
        hint: 'Thema und Inhalt der Unterweisung',
        placeholder: 'Thema und Inhalt der Unterweisung beschreiben…',
        text: woche?.unterweisungEintrag || '',
        show: unterweisung,
      },
    ].filter(t => t.show);

    if (!tiles.length) return '';

    return tiles.map(t => `
      <div class="wochen-kachel">
        <div class="wochen-kachel__header">
          <span class="wochen-kachel__title">${t.label}</span>
          <span class="wochen-kachel__hint">${t.hint}</span>
        </div>
        <div class="ql-editor-wrap wochen-editor-wrap" id="wochenEditorWrap_${t.id}" data-kachel="${t.id}"></div>
        <div class="day-card__footer">
          <span class="day-card__char-count" id="wochenCharCount_${t.id}">0 Zeichen</span>
          ${!readonly ? `<button class="btn btn-sm btn-ghost" onclick="clearWochenKachel('${t.id}')">Leeren</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  function refreshWochenKacheln(woche) {
    const ort = document.querySelector('input[name="wochenOrt"]:checked')?.value || 'betrieb';
    const unterweisung = document.getElementById('unterweisungCheck')?.checked || false;
    const isReadonly = woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt');

    const container = document.getElementById('wochenKacheln');
    if (container) {
      container.innerHTML = buildWochenKacheln(ort, unterweisung, woche, isReadonly);
      initWochenQuillEditors(woche, isReadonly);
    }
  }

  function bindWochenEditorEvents() {
    // Events handled by Quill instances in initWochenQuillEditors
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

  function initWochenQuillEditors(woche, readonly) {
    Object.keys(quillInstances)
      .filter(k => k.startsWith('woche_'))
      .forEach(k => { delete quillInstances[k]; });

    const placeholders = {
      betrieb:       'Tätigkeiten und Lerninhalte im Betrieb für diese Woche beschreiben…',
      schule:        'Unterrichtsinhalte der Berufsschule für diese Woche beschreiben…',
      unterweisung:  'Thema und Inhalt der Unterweisung beschreiben…',
    };
    const contentMap = {
      betrieb:      woche?.betriebEintrag || '',
      schule:       woche?.schuleEintrag || '',
      unterweisung: woche?.unterweisungEintrag || '',
    };

    ['betrieb', 'schule', 'unterweisung'].forEach(id => {
      const wrap = document.getElementById('wochenEditorWrap_' + id);
      if (!wrap) return;

      const quill = new Quill(wrap, {
        theme: 'snow',
        readOnly: readonly,
        placeholder: placeholders[id],
        modules: {
          toolbar: readonly ? false : { container: QUILL_TOOLBAR, handlers: QUILL_HANDLERS },
          history: { delay: 1000, maxStack: 100, userOnly: true },
        },
      });

      const content = contentMap[id];
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
    });
  }

  // ── Auto-Save ─────────────────────────────────────────────────────

  function autoSaveWoche() {
    const azubiId = viewAzubiId || user.id;
    let woche = DB.getWoche(azubiId, currentKW, currentYear);
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

    const ortEl = document.querySelector('input[name="wochenOrt"]:checked');
    const unterweisungEl = document.getElementById('unterweisungCheck');

    if (ortEl) woche.wochenOrt = ortEl.value;
    if (unterweisungEl) woche.unterweisungAktiv = unterweisungEl.checked;

    const betriebQ = quillInstances['woche_betrieb'];
    const schuleQ  = quillInstances['woche_schule'];
    const unterweisungQ = quillInstances['woche_unterweisung'];
    if (betriebQ)      woche.betriebEintrag      = betriebQ.root.innerHTML;
    if (schuleQ)       woche.schuleEintrag        = schuleQ.root.innerHTML;
    if (unterweisungQ) woche.unterweisungEintrag  = unterweisungQ.root.innerHTML;

    woche.gesamtstunden = (woche.tage || []).reduce((s, t) => s + (t.stunden || 0), 0);
    DB.saveWoche(woche);
  }

  function autoSave(dateStr) {
    const azubiId = viewAzubiId || user.id;
    let woche = DB.getWoche(azubiId, currentKW, currentYear);
    if (!woche) {
      const monday = DateUtil.getMondayOfKW(currentKW, currentYear);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      const bt = getBerichtTyp();
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
    tagData.stunden = getSpinnerDecimal(dateStr);
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

    woche.gesamtstunden = woche.tage.reduce((s, t) => s + (t.stunden || 0), 0);
    DB.saveWoche(woche);
    updateStundenDisplay();
    updateDayCompletion(dateStr);
    clearDayError(dateStr);
  }

  function updateDayCompletion(dateStr) {
    const row = document.getElementById('dayCard_' + dateStr);
    if (!row) return;
    const w = DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
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
    if (row) row.classList.remove('tag-row--has-error');
    if (errBox) { errBox.hidden = true; errBox.innerHTML = ''; }
  }

  function updateStundenDisplay() {
    let total = 0;
    document.querySelectorAll('.time-spinner[data-date]').forEach(s => {
      const h = parseInt(s.querySelector('input[data-part="h"]')?.value) || 0;
      const m = parseInt(s.querySelector('input[data-part="m"]')?.value) || 0;
      total += h + m / 60;
    });
    const val = decimalToTimeStr(total);
    const totalEl = document.getElementById('totalHours');
    const statusEl = document.getElementById('statusTotalHours');
    const tageEl = document.getElementById('wochenTageGesamt');
    if (totalEl) totalEl.textContent = val;
    if (statusEl) statusEl.textContent = val;
    if (tageEl) tageEl.textContent = val;
  }

  // ── Events ────────────────────────────────────────────────────────

  function renderComment(k) {
    const author = DB.getUser(k.userId);
    return `
      <div class="comment comment--ausbilder">
        <div class="comment__body">
          <div class="comment__header">
            <div class="avatar avatar--sm">${author ? author.initials : '?'}</div>
            <span class="comment__name">${author ? author.name : 'Unbekannt'}</span>
            <span class="comment__date">${k.datum || ''}</span>
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
      render();
    });
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
      const next = DateUtil.getMondayOfKW(currentKW, currentYear);
      next.setDate(next.getDate() + 7);
      currentKW = DateUtil.getKW(next);
      currentYear = DateUtil.getKWYear(next);
      render();
    });

    // Azubi-Wechsel (Ausbilder)
    document.querySelectorAll('.ausbilder-chip[data-azubi-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        viewAzubiId = parseInt(btn.dataset.azubiId);
        render();
      });
    });

    // (Format-Toggle entfernt: berichtTyp ist pro Azubi fest in DB.users
    //  hinterlegt – technische Azubis = täglich, kaufmännische = wöchentlich.
    //  Ein Wechsel zur Laufzeit würde die beiden Erfassungs-Workflows
    //  künstlich koppeln und ist fachlich nicht vorgesehen.)

    const isReadonly = woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt');

    if (berichtTyp === 'täglich') {
      bindDayCardEvents();
      initDayQuillEditors(woche, monday, isReadonly);
    } else {
      bindWochenEvents(woche, monday);
    }

    // Freigabe – mit Pflichtfeld-Validierung
    document.getElementById('releaseBtn')?.addEventListener('click', () => {
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
          autoSave(ds);
        }
      }
      if (berichtTyp === 'wöchentlich' && typeof flushWochenAutoSave === 'function') {
        flushWochenAutoSave();
      }
      const aktuelleWoche = DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
      const errors = validateWoche(aktuelleWoche, monday);
      if (errors.length > 0) {
        showValidationErrors(errors);
        return;
      }
      clearValidationErrors();
      Modal.open('releaseModal');
    });
    document.getElementById('releaseConfirmBtn')?.addEventListener('click', () => {
      if (!woche) { Toast.warning('Keine Einträge', 'Bitte zuerst Einträge erfassen.'); Modal.closeAll(); return; }
      DB.setWocheStatus(woche.id, 'freigegeben');
      Modal.closeAll();
      Toast.success('Freigegeben', `KW ${currentKW} wurde zur Abnahme freigegeben.`);
      render();
    });

    document.getElementById('approveBtn')?.addEventListener('click', () => {
      DB.setWocheStatus(woche.id, 'genehmigt');
      DB.addBenachrichtigung({
        userId: woche.azubiId,
        type: 'genehmigt',
        wocheId: woche.id,
        azubiId: woche.azubiId,
        kw: woche.kw,
        year: woche.year,
        fromUserId: user.id,
      });
      Toast.success('Genehmigt', `KW ${currentKW} wurde genehmigt.`);
      render();
    });
    document.getElementById('rejectBtn')?.addEventListener('click', () => Modal.open('rejectModal'));
    document.getElementById('rejectConfirmBtn')?.addEventListener('click', () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) { Toast.error('Pflichtfeld', 'Bitte eine Begründung eingeben.'); return; }
      DB.addKommentar(woche.id, {
        userId: user.id, text: reason,
        datum: new Date().toLocaleDateString('de-DE'), typ: 'abgelehnt',
      });
      DB.setWocheStatus(woche.id, 'abgelehnt');
      DB.addBenachrichtigung({
        userId: woche.azubiId,
        type: 'abgelehnt',
        wocheId: woche.id,
        azubiId: woche.azubiId,
        kw: woche.kw,
        year: woche.year,
        fromUserId: user.id,
        kommentar: reason,
      });
      Modal.closeAll();
      document.getElementById('rejectReason').value = '';
      Toast.warning('Zurückgegeben', `KW ${currentKW} wurde zurückgegeben.`);
      render();
    });

    document.getElementById('addCommentBtn')?.addEventListener('click', () => {
      document.getElementById('commentText').value = '';
      Modal.open('commentModal');
    });
    document.getElementById('commentSubmitBtn')?.addEventListener('click', () => {
      const text = document.getElementById('commentText').value.trim();
      if (!text) { Toast.error('Pflichtfeld', 'Bitte einen Kommentar eingeben.'); return; }
      if (!woche) return;
      DB.addKommentar(woche.id, {
        userId: user.id, text,
        datum: new Date().toLocaleDateString('de-DE'), typ: 'ausbilder',
      });
      Modal.closeAll();
      Toast.success('Kommentar', 'Kommentar wurde gespeichert.');
      render();
    });

    document.getElementById('exportBtn')?.addEventListener('click', () => {
      // Stammdaten zum Drucken aufklappen, damit alles sichtbar ist
      const stammdaten = document.getElementById('stammdatenBlock');
      const wasOpen = stammdaten?.hasAttribute('open');
      if (stammdaten) stammdaten.setAttribute('open', '');
      window.print();
      if (stammdaten && !wasOpen) stammdaten.removeAttribute('open');
    });

    Modal.init();
  }

  function bindDayCardEvents() {
    // Klick auf Zeile → ausklappen (nicht auf interaktive Elemente)
    document.querySelectorAll('.tag-row__summary').forEach(summary => {
      summary.addEventListener('click', (e) => {
        if (e.target.closest('select, input, button')) return;
        const row = summary.closest('.tag-row');
        if (!row || row.classList.contains('tag-row--weekend')) return;
        toggleDayCard(row.dataset.date);
      });
    });

    // Anwesenheit live-toggle
    document.querySelectorAll('select[data-field="anwesenheit"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const dateStr = sel.dataset.date;
        const isAbwesend = sel.value !== 'anwesend' && sel.value !== '';
        const row = document.getElementById('dayCard_' + dateStr);
        if (row) {
          const ortSel = row.querySelector('select[data-field="ort"]');
          if (ortSel) ortSel.disabled = isAbwesend;

          const spinner = row.querySelector('.time-spinner');
          if (spinner) {
            spinner.querySelectorAll('.time-spinner__btn').forEach(b => b.disabled = isAbwesend);
            spinner.querySelectorAll('input.time-spinner__input').forEach(inp => {
              inp.readOnly = isAbwesend;
              if (isAbwesend) inp.value = '00';
            });
            spinner.classList.toggle('time-spinner--readonly', isAbwesend);
          }

          const editorSec = document.getElementById('editorSection_' + dateStr);
          const absenceSec = document.getElementById('absenceSection_' + dateStr);
          if (editorSec) editorSec.style.display = isAbwesend ? 'none' : '';
          if (absenceSec) absenceSec.style.display = isAbwesend ? '' : 'none';

          if (!isAbwesend && !quillInstances['day_betrieb_' + dateStr]) {
            const w = DB.getWoche(viewAzubiId || user.id, currentKW, currentYear);
            const ro = w && (w.status === 'freigegeben' || w.status === 'genehmigt');
            initSingleDayEditor(dateStr, w, ro);
          }
        }
        autoSave(dateStr);
        updateStundenDisplay();
      });
    });

    // Übrige Felder (Ort, Textareas) – Schule-Sektion auto-expandieren wenn Ort=Schule
    document.querySelectorAll('select[data-field="ort"], textarea[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        if (el.dataset.field === 'ort' && el.value === 'Schule') {
          const dateStr = el.dataset.date;
          const schuleSection = document.querySelector(`.day-section--schule[data-date="${dateStr}"]`);
          if (schuleSection && !schuleSection.classList.contains('day-section--expanded')) {
            schuleSection.classList.add('day-section--expanded');
            const header = schuleSection.querySelector('.day-section__header--toggle');
            if (header) header.setAttribute('aria-expanded', 'true');
          }
        }
        autoSave(el.dataset.date);
      });
    });

    // Spinner-Callback
    setSpinnerCallback(dateStr => {
      autoSave(dateStr);
      updateStundenDisplay();
    });
  }

  function bindWochenEvents(woche, monday) {
    const isReadonly = woche && (woche.status === 'freigegeben' || woche.status === 'genehmigt');

    // Lernort-Umschalter → Kacheln neu rendern
    document.querySelectorAll('input[name="wochenOrt"]').forEach(radio => {
      radio.addEventListener('change', () => {
        autoSaveWoche();
        refreshWochenKacheln(DB.getWoche(viewAzubiId || user.id, currentKW, currentYear));
      });
    });

    // Unterweisung-Checkbox → Kacheln neu rendern
    document.getElementById('unterweisungCheck')?.addEventListener('change', () => {
      autoSaveWoche();
      refreshWochenKacheln(DB.getWoche(viewAzubiId || user.id, currentKW, currentYear));
    });

    initWochenQuillEditors(woche, isReadonly);

    // Per-Tag Zeilen: Anwesenheit, Ort, Stunden
    document.querySelectorAll('.wochen-tage-row[data-date]').forEach(row => {
      const dateStr = row.dataset.date;
      const anwesenheitSel = row.querySelector(`select[data-field="anwesenheit"]`);
      const ortSel         = row.querySelector(`select[data-field="ort"]`);

      if (anwesenheitSel) {
        anwesenheitSel.addEventListener('change', () => {
          const isAbwesend = anwesenheitSel.value !== 'anwesend' && anwesenheitSel.value !== '';
          if (ortSel) ortSel.disabled = isAbwesend;
          const spinner = row.querySelector('.time-spinner');
          if (spinner) {
            spinner.querySelectorAll('.time-spinner__btn').forEach(b => b.disabled = isAbwesend);
            spinner.querySelectorAll('.time-spinner__input').forEach(inp => {
              inp.readOnly = isAbwesend;
              if (isAbwesend) inp.value = '00';
            });
            spinner.classList.toggle('time-spinner--readonly', isAbwesend);
          }
          autoSave(dateStr);
          updateStundenDisplay();
        });
      }
      if (ortSel) ortSel.addEventListener('change', () => autoSave(dateStr));
    });

    // Spinner-Callback registrieren
    setSpinnerCallback(dateStr => autoSave(dateStr));
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
  function flushWochenAutoSave() {
    if (wochenSaveTimer) {
      clearTimeout(wochenSaveTimer);
      wochenSaveTimer = null;
    }
    autoSaveWoche();
  }

  render();
});

// ── Globale Hilfsfunktionen ───────────────────────────────────────

function toggleDayCard(dateStr) {
  const card = document.getElementById('dayCard_' + dateStr);
  card?.classList.toggle('expanded');
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

function handleSpinnerClick(btn) {
  if (btn.disabled) return;
  const spinner = btn.closest('.time-spinner');
  if (!spinner || spinner.classList.contains('time-spinner--readonly')) return;
  const dateStr = spinner.dataset.date;
  const part = btn.dataset.part;
  const inp = spinner.querySelector(`.time-spinner__input[data-part="${part}"]`);
  if (!inp) return;
  let v = parseInt(inp.value) || 0;
  if (btn.dataset.action === 'up') {
    v = part === 'h' ? Math.min(23, v + 1) : (v + 5 >= 60 ? 0 : v + 5);
  } else {
    v = part === 'h' ? Math.max(0, v - 1) : (v - 5 < 0 ? 55 : v - 5);
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
  let v = parseInt(inp.value) || 0;
  v = part === 'h' ? Math.min(23, Math.max(0, v)) : Math.min(59, Math.max(0, v));
  inp.value = String(v).padStart(2, '0');
  window._spinnerCallback?.(dateStr);
}
