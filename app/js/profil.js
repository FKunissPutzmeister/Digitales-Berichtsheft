/* ===================================================================
   PROFIL.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-profil', [{ label: 'Mein Profil', href: 'profil.html' }]);
  if (!user) return;

  const isAzubi = user.role === 'azubi';
  const isAusbilder = user.role === 'ausbilder';
  const isAdmin = user.role === 'admin';

  function getRoleLabel(role) {
    switch (role) {
      case 'azubi':     return 'Auszubildende/r';
      case 'ausbilder': return 'Ausbildungsbeauftragte/r';
      case 'admin':     return 'Administrator';
      default:          return role;
    }
  }

  function getRoleBadgeClass(role) {
    switch (role) {
      case 'azubi':     return 'badge--info';
      case 'ausbilder': return 'badge--genehmigt';
      case 'admin':     return 'badge--grey';
      default:          return 'badge--grey';
    }
  }

  function calcAusbildungsfortschritt(azubi) {
    if (!azubi.ausbildungsBeginn || !azubi.ausbildungsEnde) return null;
    const start = new Date(azubi.ausbildungsBeginn).getTime();
    const end   = new Date(azubi.ausbildungsEnde).getTime();
    const now   = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.round(((now - start) / (end - start)) * 100);
  }

  function buildProfilCard() {
    const pct = isAzubi ? calcAusbildungsfortschritt(user) : null;

    const infoItems = [];

    infoItems.push(`
      <div class="profil-card__info-item">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span>${user.email || '–'}</span>
      </div>
    `);

    if (user.abteilung) {
      infoItems.push(`
        <div class="profil-card__info-item">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          <span>${user.abteilung}</span>
        </div>
      `);
    }

    if (user.unternehmen) {
      infoItems.push(`
        <div class="profil-card__info-item">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>${user.unternehmen}</span>
        </div>
      `);
    }

    if (isAzubi && user.ausbildungsBeginn && user.ausbildungsEnde) {
      infoItems.push(`
        <div class="profil-card__info-item">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>${DateUtil.formatDate(user.ausbildungsBeginn)} – ${DateUtil.formatDate(user.ausbildungsEnde)}</span>
        </div>
      `);
    }

    return `
      <div class="profil-card">
        <div class="profil-card__banner"></div>
        <div class="profil-card__avatar-wrap">
          <div class="profil-card__avatar">${user.initials}</div>
        </div>
        <div class="profil-card__name">${user.name}</div>
        <div class="profil-card__role">
          <span class="badge ${getRoleBadgeClass(user.role)}">${getRoleLabel(user.role)}</span>
        </div>
        <div class="profil-card__divider"></div>
        <div class="profil-card__info-list">
          ${infoItems.join('')}
        </div>
        ${pct !== null ? `
        <div class="profil-card__divider"></div>
        <div style="padding:var(--sp-4)">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--pm-grey-400);margin-bottom:var(--sp-2)">Ausbildungsfortschritt</div>
          <div style="display:flex;align-items:center;gap:var(--sp-2)">
            <div class="progress-bar" style="flex:1">
              <div class="progress-bar__fill" id="profilProgressBar" style="width:0%;transition:width .8s ease"></div>
            </div>
            <span style="font-size:var(--text-sm);font-weight:700;color:var(--pm-grey-700)">${pct}%</span>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function buildPersoenlicheDaten() {
    return `
      <details class="profil-section" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="profil-section__title">Persönliche Daten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="profil-data-grid">
            <div class="profil-data-item">
              <div class="profil-data-label">Vollständiger Name</div>
              <div class="profil-data-value">${user.name}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">E-Mail-Adresse</div>
              <div class="profil-data-value">${user.email || '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Rolle</div>
              <div class="profil-data-value">${getRoleLabel(user.role)}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Kürzel</div>
              <div class="profil-data-value">${user.initials}</div>
            </div>
          </div>
          <div style="margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--pm-grey-100)">
            <button class="btn btn-outline" id="changePasswordBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Passwort ändern
            </button>
          </div>
        </div></div>
      </details>
    `;
  }

  function buildAusbildungsDaten() {
    if (!isAzubi) return '';

    const ausbildungsJahre = user.ausbildungsBeginn && user.ausbildungsEnde
      ? Math.round((new Date(user.ausbildungsEnde) - new Date(user.ausbildungsBeginn)) / (365.25 * 24 * 3600 * 1000) * 10) / 10
      : null;

    return `
      <details class="profil-section" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          </div>
          <div class="profil-section__title">Ausbildungsdaten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="profil-data-grid">
            <div class="profil-data-item">
              <div class="profil-data-label">Ausbildungsberuf</div>
              <div class="profil-data-value">${user.beruf || '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Ausbildungsdauer</div>
              <div class="profil-data-value">${ausbildungsJahre ? ausbildungsJahre + ' Jahre' : '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Ausbildungsbeginn</div>
              <div class="profil-data-value">${user.ausbildungsBeginn ? DateUtil.formatDate(user.ausbildungsBeginn) : '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Ausbildungsende</div>
              <div class="profil-data-value">${user.ausbildungsEnde ? DateUtil.formatDate(user.ausbildungsEnde) : '–'}</div>
            </div>
          </div>
        </div></div>
      </details>
    `;
  }

  function buildIHKDaten() {
    if (!isAzubi) return '';
    return `
      <details class="profil-section">
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div class="profil-section__title">IHK-Daten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="profil-data-grid">
            <div class="profil-data-item">
              <div class="profil-data-label">IHK</div>
              <div class="profil-data-value">${user.ihkName || '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">IHK-Nummer</div>
              <div class="profil-data-value">${user.ihkNr || '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Azubi-Nummer</div>
              <div class="profil-data-value">${user.azubiNr || '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Berufsbildnummer</div>
              <div class="profil-data-value">${user.berufsbildnummer || '–'}</div>
            </div>
          </div>
        </div></div>
      </details>
    `;
  }

  function buildUnternehmensDaten() {
    return `
      <details class="profil-section">
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div class="profil-section__title">Unternehmensdaten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="profil-data-grid">
            <div class="profil-data-item">
              <div class="profil-data-label">Unternehmen</div>
              <div class="profil-data-value">${user.unternehmen || '–'}</div>
            </div>
            <div class="profil-data-item">
              <div class="profil-data-label">Abteilung</div>
              <div class="profil-data-value">${user.abteilung || '–'}</div>
            </div>
          </div>
        </div></div>
      </details>
    `;
  }

  async function buildAusbilderTimeline() {
    if (!isAzubi) return '';

    const zuweisungen = await DB.getZuweisungenFuerAzubi(user.id);
    if (!zuweisungen.length) return '';

    const today = DateUtil.toISODate(new Date());
    const sorted = [...zuweisungen].sort((a, b) => a.von.localeCompare(b.von));

    const itemsArr = await Promise.all(sorted.map(async z => {
      const ausb = await DB.getUser(z.ausbilderId);
      const isCurrent = z.von <= today && z.bis >= today;
      const dotClass = isCurrent ? 'current' : 'past';

      return `
        <div class="ausbilder-tl-item">
          <div class="ausbilder-tl-dot ${dotClass}">${ausb?.initials || '?'}</div>
          <div class="ausbilder-tl-info">
            <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--pm-grey-400);margin-bottom:2px">Deine Ausbildungsbeauftragte/r</div>
            <div class="ausbilder-tl-name">${ausb?.name || '–'}</div>
            <div class="ausbilder-tl-abt">${z.abteilung || ausb?.abteilung || ''}</div>
            <div class="ausbilder-tl-dates">${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}</div>
            ${isCurrent ? '<span class="badge badge--genehmigt">Aktueller Zeitraum</span>' : '<span class="badge badge--grey">Vergangener Zeitraum</span>'}
          </div>
        </div>
      `;
    }));
    const items = itemsArr.join('');

    return `
      <details class="profil-section" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="profil-section__title">Deine Ausbildungsbeauftragten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <p style="font-size:var(--text-sm);color:var(--pm-grey-500);margin-bottom:var(--sp-5)">
            Diese Personen sind oder waren als deine persönlichen Ausbildungsbeauftragten hinterlegt und begleiten dich in den jeweiligen Abteilungen und Zeiträumen.
          </p>
          <div class="ausbilder-timeline">
            ${items}
          </div>
        </div></div>
      </details>
    `;
  }

  async function buildAzubiListe() {
    if (!isAusbilder && !isAdmin) return '';

    const zuweisungen = isAusbilder ? await DB.getZuweisungenFuerAusbilder(user.id) : [];
    if (!zuweisungen.length && isAusbilder) {
      return `
        <details class="profil-section" open>
          <summary class="profil-section__header">
            <div class="profil-section__icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="profil-section__title">Zugeordnete Auszubildende</div>
          </summary>
          <div class="profil-section__body-wrap"><div class="profil-section__body">
            <p style="font-size:var(--text-sm);color:var(--pm-grey-400)">Keine Zuweisungen vorhanden.</p>
          </div></div>
        </details>
      `;
    }

    if (isAdmin) {
      const azubis = await DB.getAzubis();
      return `
        <details class="profil-section" open>
          <summary class="profil-section__header">
            <div class="profil-section__icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="profil-section__title">Alle Auszubildenden</div>
          </summary>
          <div class="profil-section__body-wrap"><div class="profil-section__body">
            <div class="profil-data-grid">
              ${azubis.map(a => `
                <div class="profil-data-item">
                  <div class="profil-data-label">${a.beruf || 'Auszubildende/r'}</div>
                  <div class="profil-data-value" style="display:flex;align-items:center;gap:var(--sp-2)">
                    <div class="avatar avatar--sm">${a.initials}</div>
                    ${a.name}
                  </div>
                </div>
              `).join('')}
            </div>
          </div></div>
        </details>
      `;
    }

    const today = DateUtil.toISODate(new Date());
    const sorted = [...zuweisungen].sort((a, b) => a.von.localeCompare(b.von));

    const itemsArr = await Promise.all(sorted.map(async z => {
      const azubi = await DB.getUser(z.azubiId);
      const isCurrent = z.von <= today && z.bis >= today;
      const dotClass = isCurrent ? 'current' : 'past';

      return `
        <div class="ausbilder-tl-item">
          <div class="ausbilder-tl-dot ${dotClass}">${azubi?.initials || '?'}</div>
          <div class="ausbilder-tl-info">
            <div class="ausbilder-tl-name">${azubi?.name || '–'}</div>
            <div class="ausbilder-tl-abt">${azubi?.beruf || ''}</div>
            <div class="ausbilder-tl-dates">${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}</div>
            ${isCurrent ? '<span class="badge badge--genehmigt">Aktuell</span>' : ''}
          </div>
        </div>
      `;
    }));
    const items = itemsArr.join('');

    return `
      <details class="profil-section" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="profil-section__title">Zugeordnete Auszubildende</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="ausbilder-timeline">
            ${items}
          </div>
        </div></div>
      </details>
    `;
  }

  /* Abmelde-Block am Ende der Profil-Seite. Der bestehende
     app.js-Handler greift via id="logoutBtn" automatisch. */
  function buildLogoutBlock() {
    return `
      <div class="profil-logout">
        <div class="profil-logout__icon" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
        </div>
        <div class="profil-logout__text">
          <div class="profil-logout__title">Abmelden</div>
          <div class="profil-logout__sub">Beendet deine aktuelle Sitzung und führt dich zurück zur Anmeldeseite.</div>
        </div>
        <button class="btn btn-danger" id="logoutBtn" type="button">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Jetzt abmelden
        </button>
      </div>
    `;
  }

  function buildPasswordModal() {
    return `
      <div class="modal-overlay" id="passwordModal" role="dialog" aria-modal="true" aria-label="Passwort ändern">
        <div class="modal" style="max-width:400px">
          <div class="modal__header">
            <span class="modal__title">Passwort ändern</span>
            <button class="modal__close" data-modal-close aria-label="Schließen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Aktuelles Passwort</label>
              <input type="password" class="form-control" id="pwCurrent" placeholder="Aktuelles Passwort">
            </div>
            <div class="form-group">
              <label class="form-label">Neues Passwort</label>
              <input type="password" class="form-control" id="pwNew" placeholder="Mindestens 8 Zeichen">
            </div>
            <div class="form-group">
              <label class="form-label">Neues Passwort bestätigen</label>
              <input type="password" class="form-control" id="pwConfirm" placeholder="Passwort wiederholen">
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn-ghost" data-modal-close>Abbrechen</button>
            <button class="btn btn-primary" id="pwSaveBtn">Passwort speichern</button>
          </div>
        </div>
      </div>
    `;
  }

  async function render() {
    const main = document.getElementById('mainContent');

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Mein Profil</h1>
          <p class="page-subtitle">Persönliche Daten und Ausbildungsinformationen.</p>
        </div>
      </div>

      <div class="profil-layout">
        ${buildProfilCard()}
        <div class="profil-panels">
          ${buildPersoenlicheDaten()}
          ${buildAusbildungsDaten()}
          ${buildIHKDaten()}
          ${buildUnternehmensDaten()}
          ${await buildAusbilderTimeline()}
          ${await buildAzubiListe()}
          ${buildLogoutBlock()}
        </div>
      </div>

      ${buildPasswordModal()}
    `;

    // Fortschrittsbalken animieren
    const bar = document.getElementById('profilProgressBar');
    if (bar) {
      const pct = calcAusbildungsfortschritt(user);
      setTimeout(() => { bar.style.width = pct + '%'; }, 150);
    }

    // Passwort-Modal
    document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
      document.getElementById('pwCurrent').value = '';
      document.getElementById('pwNew').value = '';
      document.getElementById('pwConfirm').value = '';
      Modal.open('passwordModal');
    });

    document.getElementById('pwSaveBtn')?.addEventListener('click', async () => {
      const current = document.getElementById('pwCurrent').value;
      const newPw   = document.getElementById('pwNew').value;
      const confirm = document.getElementById('pwConfirm').value;

      if (!current) { Toast.error('Pflichtfeld', 'Bitte aktuelles Passwort eingeben.'); return; }
      if (current !== user.password) { Toast.error('Falsches Passwort', 'Das aktuelle Passwort ist falsch.'); return; }
      if (newPw.length < 8) { Toast.error('Zu kurz', 'Das neue Passwort muss mindestens 8 Zeichen lang sein.'); return; }
      if (newPw !== confirm) { Toast.error('Nicht übereinstimmend', 'Die Passwörter stimmen nicht überein.'); return; }

      // Passwort-Änderung entfällt nach Azure-AD-Migration
      Modal.closeAll();
      Toast.info('Hinweis', 'Passwörter werden über das Putzmeister-Konto verwaltet.');
    });

    Modal.init();
    Toast.init();
  }

  await render();
});
