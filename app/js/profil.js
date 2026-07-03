/* ===================================================================
   PROFIL.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-profil', [{ label: 'Mein Profil', href: 'profil.html' }]);
  if (!user) return;

  /* Volle Seitenbreite: aktiviert den body[data-page="profil"]-Override in
     layout.css. Wird hier (nicht in profil.html) gesetzt, weil der SPA-Router
     data-page bei jeder Navigation löscht und die Seiten-Skripte es neu setzen. */
  document.body.dataset.page = 'profil';

  /* „Ist Azubi" ist eine Fähigkeit, keine Rolle: SSO-Nutzer können z. B.
     role=developer MIT istAzubi=true sein (Azubi + erhöhte Rechte) und
     sollen alle Azubi-Sektionen inkl. Themes sehen — wie das Nav-Gating
     (data-ist-azubi) läuft das über das istAzubi-Flag. */
  const isAzubi = user.role === 'azubi' || !!user.istAzubi;
  const isAusbilder = user.role === 'pruefer';
  const isAdmin = user.role === 'admin';

  function getRoleLabel(role) {
    switch (role) {
      case 'azubi':     return 'Auszubildende/r';
      case 'pruefer': return 'Prüfer';
      case 'admin':     return 'Administrator';
      default:          return role;
    }
  }

  /* Ausbildungsjahr-Berechnung — identisch zur (früheren) Logik der
     Wochenansicht, damit beide Stellen dasselbe Jahr anzeigen. */
  function calcAusbildungsjahr(beginnStr, refDate = new Date()) {
    if (!beginnStr) return null;
    const start = new Date(beginnStr + 'T00:00:00');
    const months = (refDate.getFullYear() - start.getFullYear()) * 12 + (refDate.getMonth() - start.getMonth());
    return Math.max(1, Math.min(4, Math.floor(months / 12) + 1));
  }

  /* Stammdaten-Kachel — von der Wochenansicht hierher umgezogen.
     Gleiche Datenquelle wie dort: aktuelle Zuweisung über
     DB.getAktuellerAusbilder, Ausbilder-Name über DB.getUser,
     Ausbildungsjahr aus user.ausbildungsBeginn. */
  async function buildStammdaten() {
    if (!isAzubi) return '';

    const zuw = await DB.getAktuellerAusbilder(user.id);
    const ausbilderName = zuw ? (zuw.verantwName || '–') : null;
    const ausbildungsjahr = calcAusbildungsjahr(user.ausbildungsBeginn);

    const fields = [
      { label: 'Auszubildende/r',         value: user.name },
      { label: 'Beruf',                   value: user.beruf || '–' },
      { label: 'Ausbildungsjahr',         value: ausbildungsjahr ? `${ausbildungsjahr}. Jahr` : '–' },
      { label: 'Aktuelle Abteilung',      value: zuw?.abteilung || user.abteilung || '–' },
      { label: 'Aktuelle/r Ausbilder/in', value: ausbilderName || '–' },
      { label: 'Ausbildungsbetrieb',      value: user.unternehmen || '–' },
    ];

    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('document')}
          </div>
          <div class="profil-section__title">Stammdaten</div>
        </div>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <dl class="profil-stammdaten__grid">
            ${fields.map(f => `
              <div class="profil-stammdaten__field">
                <dt class="profil-stammdaten__label">${f.label}</dt>
                <dd class="profil-stammdaten__value">${f.value}</dd>
              </div>
            `).join('')}
          </dl>
        </div></div>
      </section>
    `;
  }

  function buildPersoenlicheDaten() {
    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('user')}
          </div>
          <div class="profil-section__title">Persönliche Daten</div>
        </div>
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
      </section>
    `;
  }

  /* ── Darstellung & Themes ──────────────────────────────────────
     Einstellungs-Karte: Standard-Modus (Hell/Dunkel) + Custom-Designs
     (Hyperspace, CMD, Candy Land, Iceland). theme.js ist ein SHARED-
     Script (der SPA-Router führt es bei Navigationen nicht erneut aus)
     und exponiert das globale window.PMTheme-API – hier wird nur
     gerufen, nie neu initialisiert.
     Verhalten: Der Hell/Dunkel-Toggle in der Sidebar verlässt ein
     aktives Custom-Design und kehrt zum gewählten Standard-Modus
     zurück (implementiert in PMTheme.set/toggle, theme.js). */
  const THEME_DESIGNS = [
    { id: '',           name: 'Standard',   sub: 'Putzmeister-Design' },
    { id: 'silk',       name: 'Silk',       sub: 'Liquid Glass · futuristisch' },
    { id: 'cmd',        name: 'CMD',        sub: 'Terminal, Grün auf Schwarz' },
    { id: 'candy',      name: 'Candy Land', sub: 'Pastell & Regenbogen' },
    { id: 'iceland',    name: 'Iceland',    sub: 'Schnee, Eis & Iglu' },
    { id: 'halloween',  name: 'Halloween',  sub: 'Geisterhaus & Nebel' },
    { id: 'christmas',  name: 'Christmas',  sub: 'Verschneit & festlich' },
  ];

  function buildDarstellung() {
    const mode   = window.PMTheme?.getMode?.()   || 'light';
    const custom = window.PMTheme?.getCustom?.() || '';
    const silkColor  = window.PMTheme?.getSilkColor?.() || 'indigo';
    const silkColors = window.PMTheme?.SILK_COLORS || [];

    const modeBtn = (val, label, icon) => `
      <button type="button" class="theme-mode-btn ${mode === val ? 'active' : ''}"
              data-theme-mode="${val}" aria-pressed="${mode === val}">
        ${icon}
        <span>${label}</span>
      </button>
    `;
    const SUN  = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const MOON = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

    /* Custom-Designs sind ein reines Azubi-Feature – Ausbilder/Admin
       sehen nur den Hell/Dunkel-Umschalter: Titel ohne „& Themes",
       kürzerer Hinweis, keine Custom-Design-Gruppe. */
    const title = isAzubi ? 'Darstellung &amp; Themes' : 'Darstellung';

    const customGroup = !isAzubi ? '' : `
          <div class="theme-group">
            <div class="theme-group__label">Custom-Design</div>
            <div class="theme-tiles">
              ${THEME_DESIGNS.map(d => `
                <button type="button" class="theme-tile ${custom === d.id ? 'active' : ''}"
                        data-theme-design="${d.id}" aria-pressed="${custom === d.id}">
                  <span class="theme-tile__swatch theme-tile__swatch--${d.id || 'standard'}" aria-hidden="true"></span>
                  <span class="theme-tile__name">${d.name}</span>
                </button>
              `).join('')}
            </div>
            <div class="silk-colors ${custom === 'silk' ? 'is-visible' : ''}" id="silkColorRow">
              <div class="theme-group__label" style="margin-top:var(--sp-4)">Silk-Farbe</div>
              <div class="silk-swatches">
                ${silkColors.map(c => `
                  <button type="button" class="silk-swatch ${silkColor === c.id ? 'active' : ''}" data-silk-color="${c.id}" style="--sw-hue:${c.hue}" title="${c.label}" aria-label="${c.label}" aria-pressed="${silkColor === c.id}">
                    <span class="silk-swatch__dot" aria-hidden="true"></span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>`;

    /* Standardmäßig EINGEKLAPPT (kein open): Darstellung/Themes wird selten
       geändert – die Karte startet kompakt und wird bei Bedarf aufgeklappt. */
    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M12 22a10 10 0 1 1 10-10c0 2.21-1.79 3.5-4 3.5h-2.2c-1.1 0-1.8.9-1.8 2 0 .55.2 1.05.55 1.45.35.4.55.9.55 1.45 0 1.1-.9 1.6-2.1 1.6Z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="11" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <div class="profil-section__title">${title}</div>
        </div>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="theme-group">
            <div class="theme-group__label">Standard-Modus</div>
            <div class="theme-mode-row">
              ${modeBtn('light', 'Hell', SUN)}
              ${modeBtn('dark', 'Dunkel', MOON)}
            </div>
          </div>
          ${customGroup}
        </div></div>
      </section>
    `;
  }

  /* Active-Markierungen der Theme-Karte mit dem aktuellen PMTheme-State
     synchronisieren (auch bei Änderungen durch Sidebar-Toggle/andere Tabs). */
  function syncDarstellung() {
    if (!window.PMTheme) return;
    const mode   = window.PMTheme.getMode();
    const custom = window.PMTheme.getCustom() || '';
    document.querySelectorAll('[data-theme-mode]').forEach(btn => {
      const on = btn.dataset.themeMode === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-theme-design]').forEach(tile => {
      const on = (tile.dataset.themeDesign || '') === custom;
      tile.classList.toggle('active', on);
      tile.setAttribute('aria-pressed', String(on));
    });
    // Silk-Farb-Swatches: Reihe nur bei aktivem Silk zeigen, aktive Farbe markieren.
    const silkColor = window.PMTheme.getSilkColor ? window.PMTheme.getSilkColor() : 'indigo';
    const silkRow = document.getElementById('silkColorRow');
    if (silkRow) silkRow.classList.toggle('is-visible', custom === 'silk');
    document.querySelectorAll('[data-silk-color]').forEach(sw => {
      const on = sw.dataset.silkColor === silkColor;
      sw.classList.toggle('active', on);
      sw.setAttribute('aria-pressed', String(on));
    });
  }

  function bindDarstellung() {
    if (!window.PMTheme) return;
    document.querySelectorAll('[data-theme-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.PMTheme.setMode(btn.dataset.themeMode);
      });
    });
    document.querySelectorAll('[data-theme-design]').forEach(tile => {
      tile.addEventListener('click', () => {
        window.PMTheme.setCustom(tile.dataset.themeDesign || null);
      });
    });
    document.querySelectorAll('[data-silk-color]').forEach(sw => {
      sw.addEventListener('click', () => {
        window.PMTheme.setSilkColor?.(sw.dataset.silkColor);
      });
    });
    /* Listener deduplizieren: profil.js läuft bei jeder SPA-Navigation
       auf die Profil-Seite erneut – alten Handler vorher abhängen. */
    if (window.__pmThemeCardSync) {
      window.removeEventListener('pm-theme-change', window.__pmThemeCardSync);
      window.removeEventListener('pm-silk-color-change', window.__pmThemeCardSync);
    }
    window.__pmThemeCardSync = syncDarstellung;
    window.addEventListener('pm-theme-change', syncDarstellung);
    window.addEventListener('pm-silk-color-change', syncDarstellung);
  }

  /* ── Eingabehilfen ─────────────────────────────────────────────
     Azubi-Einstellung „Automatisches Ausfüllen vorschlagen": schaltet
     das Tätigkeits-Autocomplete in der Wochenansicht ein/aus. Rein
     clientseitig pro Gerät (localStorage, ACTIVITY_SUGGESTIONS_KEY),
     Default AN. Nur Azubis tippen Tätigkeiten → nur für sie sichtbar. */
  function suggestionsEnabled() {
    try { return localStorage.getItem(ACTIVITY_SUGGESTIONS_KEY) !== '0'; }
    catch (e) { return true; }
  }

  function buildEingabehilfen() {
    if (!isAzubi) return '';
    const on = suggestionsEnabled();
    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h11M4 12h7M4 18h11"/><path stroke-linecap="round" stroke-linejoin="round" d="m15 15 2.5 2.5L22 13"/></svg>
          </div>
          <div class="profil-section__title">Eingabehilfen</div>
        </div>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="settings-row">
            <div class="settings-row__text">
              <div class="settings-row__label">Automatisches Ausfüllen vorschlagen</div>
              <div class="settings-row__desc">Schlägt beim Eintragen der Tätigkeiten frühere Einträge zur schnellen Übernahme vor.</div>
            </div>
            <label class="ios-switch">
              <input type="checkbox" id="suggestionsToggle" ${on ? 'checked' : ''}
                     aria-label="Automatisches Ausfüllen vorschlagen">
              <span class="ios-switch__track" aria-hidden="true"></span>
            </label>
          </div>
        </div></div>
      </section>
    `;
  }

  function bindEingabehilfen() {
    document.getElementById('suggestionsToggle')?.addEventListener('change', (e) => {
      try { localStorage.setItem(ACTIVITY_SUGGESTIONS_KEY, e.target.checked ? '1' : '0'); }
      catch (err) { /* Privacy-Modus */ }
    });
  }

  function buildAusbildungsDaten() {
    if (!isAzubi) return '';

    const ausbildungsJahre = user.ausbildungsBeginn && user.ausbildungsEnde
      ? Math.round((new Date(user.ausbildungsEnde) - new Date(user.ausbildungsBeginn)) / (365.25 * 24 * 3600 * 1000) * 10) / 10
      : null;

    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('cap')}
          </div>
          <div class="profil-section__title">Ausbildungsdaten</div>
        </div>
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
      </section>
    `;
  }

  function buildIHKDaten() {
    if (!isAzubi) return '';
    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('document')}
          </div>
          <div class="profil-section__title">IHK-Daten</div>
        </div>
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
      </section>
    `;
  }

  function buildUnternehmensDaten() {
    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('building')}
          </div>
          <div class="profil-section__title">Unternehmensdaten</div>
        </div>
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
      </section>
    `;
  }

  async function buildAusbilderTimeline() {
    if (!isAzubi) return '';

    const zuweisungen = await DB.getZuweisungenFuerAzubi(user.id);
    if (!zuweisungen.length) return '';

    const today = DateUtil.toISODate(new Date());
    const sorted = [...zuweisungen].sort((a, b) => a.von.localeCompare(b.von));

    const itemsArr = sorted.map(z => {
      const verantwName = z.verantwName || '–';
      const initials = verantwName !== '–'
        ? verantwName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : '?';
      const isCurrent = z.von <= today && z.bis >= today;
      const dotClass = isCurrent ? 'current' : 'past';

      return `
        <div class="ausbilder-tl-item">
          <div class="ausbilder-tl-dot ${dotClass}">${initials}</div>
          <div class="ausbilder-tl-info">
            <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--pm-grey-400);margin-bottom:2px">Deine Ausbildungsbeauftragte/r</div>
            <div class="ausbilder-tl-name">${verantwName}</div>
            <div class="ausbilder-tl-abt">${z.abteilung || ''}</div>
            <div class="ausbilder-tl-dates">${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)}</div>
            ${isCurrent ? '<span class="badge badge--genehmigt">Aktueller Zeitraum</span>' : '<span class="badge badge--grey">Vergangener Zeitraum</span>'}
          </div>
        </div>
      `;
    });
    const items = itemsArr.join('');

    return `
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('clock')}
          </div>
          <div class="profil-section__title">Deine Ausbildungsbeauftragten</div>
        </div>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="ausbilder-timeline">
            ${items}
          </div>
        </div></div>
      </section>
    `;
  }

  async function buildAzubiListe() {
    if (!isAusbilder && !isAdmin) return '';

    const zuweisungen = isAusbilder ? await DB.getZuweisungenFuerVerantw(user.email) : [];
    if (!zuweisungen.length && isAusbilder) {
      return `
        <section class="profil-section">
          <div class="profil-section__header">
            <div class="profil-section__icon">
              ${Icon('users')}
            </div>
            <div class="profil-section__title">Zugeordnete Auszubildende</div>
          </div>
          <div class="profil-section__body-wrap"><div class="profil-section__body">
            <p style="font-size:var(--text-sm);color:var(--pm-grey-400)">Keine Zuweisungen vorhanden.</p>
          </div></div>
        </section>
      `;
    }

    if (isAdmin) {
      const azubis = await DB.getAzubis();
      return `
        <section class="profil-section">
          <div class="profil-section__header">
            <div class="profil-section__icon">
              ${Icon('users')}
            </div>
            <div class="profil-section__title">Alle Auszubildenden</div>
          </div>
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
        </section>
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
      <section class="profil-section">
        <div class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('users')}
          </div>
          <div class="profil-section__title">Zugeordnete Auszubildende</div>
        </div>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="ausbilder-timeline">
            ${items}
          </div>
        </div></div>
      </section>
    `;
  }

  /* Abmelde-Block am Ende der Profil-Seite. Der bestehende
     app.js-Handler greift via id="logoutBtn" automatisch. */
  function buildLogoutBlock() {
    return `
      <div class="profil-logout">
        <div class="profil-logout__icon" aria-hidden="true">
          ${Icon('logout')}
        </div>
        <div class="profil-logout__text">
          <div class="profil-logout__title">Abmelden</div>
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

  /* Profil/Import-Tabs: rein clientseitiges Anzeigen/Verbergen der Panels.
     Beide Panels bleiben im DOM (Import-Panel nur via [hidden] versteckt),
     damit ZeitnachweisUpload.bind()/IhkImport.bind() ihre Elemente finden. */
  function initProfilTabs() {
    const tabs = Array.from(document.querySelectorAll('.profil-tab'));
    const panels = {
      profil: document.getElementById('panel-profil'),
      import: document.getElementById('panel-import'),
    };
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.tab;
        tabs.forEach(t => {
          const on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
        });
        Object.entries(panels).forEach(([k, panel]) => {
          if (panel) panel.hidden = (k !== key);
        });
      });
    });
  }

  async function render() {
    const main = document.getElementById('mainContent');

    /* Import-Sektionen separat erfassen → eigener "Import"-Tab.
       renderSection() liefert '' für Nicht-Azubis; dann gibt es weder
       Import-Inhalt noch Tab-Leiste (Ausbilder/Admin sehen nur Profil). */
    const zeitnachweisHtml = ZeitnachweisUpload.renderSection(user);
    const ihkHtml = IhkImport.renderSection(user);
    const exportHtml = BerichtsheftExport.renderSection(user);
    const hasImport = (zeitnachweisHtml.trim() + ihkHtml.trim() + exportHtml.trim()).length > 0;

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Mein Profil</h1>
        </div>
      </div>

      ${hasImport ? `
      <div class="profil-tabs" role="tablist" aria-label="Profilbereiche">
        <button type="button" class="profil-tab is-active" role="tab" id="tab-profil"
                aria-controls="panel-profil" aria-selected="true" data-tab="profil">Profil</button>
        <button type="button" class="profil-tab" role="tab" id="tab-import"
                aria-controls="panel-import" aria-selected="false" data-tab="import">Import &amp; Export</button>
      </div>` : ''}

      <div class="profil-panels" id="panel-profil"${hasImport ? ' role="tabpanel" aria-labelledby="tab-profil"' : ''}>
        ${await buildStammdaten()}
        ${buildPersoenlicheDaten()}
        ${buildAusbildungsDaten()}
        ${buildIHKDaten()}
        ${buildUnternehmensDaten()}
        ${await buildAusbilderTimeline()}
        ${await buildAzubiListe()}
        ${buildEingabehilfen()}
        ${buildDarstellung()}
        ${buildLogoutBlock()}
      </div>

      ${hasImport ? `
      <div class="profil-panels profil-panels--import" id="panel-import"
           role="tabpanel" aria-labelledby="tab-import" hidden>
        ${exportHtml}
        ${zeitnachweisHtml}
        ${ihkHtml}
      </div>` : ''}

      ${buildPasswordModal()}
    `;

    // Tabs: Profil- vs. Import-Panel clientseitig umschalten.
    if (hasImport) initProfilTabs();

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

    // Darstellung & Themes verdrahten (Klick = sofort anwenden + persistieren)
    bindDarstellung();

    // Eingabehilfen-Schalter verdrahten (nur für Azubis gerendert)
    bindEingabehilfen();

    // Zeitnachweis-Import-Sektion verdrahten (nur für Azubis vorhanden)
    ZeitnachweisUpload.bind(user);
    IhkImport.bind(user);

    // Export & Backup verdrahten (Sektion nur für Azubis gerendert)
    BerichtsheftExport.bind(user);

    Modal.init();
    Toast.init();
  }

  await render();
});
