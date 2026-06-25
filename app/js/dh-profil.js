/* ===================================================================
   DH-PROFIL.JS – Profil-Seite für DH-Studenten (Rolle: dhstudent)
   -------------------------------------------------------------------
   Schlanke Profil-Seite (eigene Topbar-Shell, keine Sidebar) mit genau
   den Bereichen, die DH-Studenten brauchen: Stammdaten, Persönliche
   Daten, Darstellung & Themes, Abmelden. Nutzt dieselben themed-
   Komponenten/CSS-Klassen wie das reguläre Profil (profil.css) +
   dasselbe Theme-API (window.PMTheme aus theme.js).
   =================================================================== */

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/* Theme-Designs identisch zur regulären Profil-Seite (profil.js). */
const THEME_DESIGNS = [
  { id: '',           name: 'Standard',   sub: 'Putzmeister-Design' },
  { id: 'silk',       name: 'Silk',       sub: 'Liquid Glass · futuristisch' },
  { id: 'cmd',        name: 'CMD',        sub: 'Terminal, Grün auf Schwarz' },
  { id: 'candy',      name: 'Candy Land', sub: 'Pastell & Regenbogen' },
  { id: 'iceland',    name: 'Iceland',    sub: 'Schnee, Eis & Iglu' },
  { id: 'halloween',  name: 'Halloween',  sub: 'Geisterhaus & Nebel' },
  { id: 'christmas',  name: 'Christmas',  sub: 'Verschneit & festlich' },
];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await DB.fetchCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }
  if (!user.istDhStudent) {
    window.location.replace(typeof landingPageFor === 'function' ? landingPageFor(user) : 'dashboard.html');
    return;
  }

  const avatar = document.getElementById('dhAvatar');
  if (avatar) avatar.textContent = user.initials || (user.name || '').split(' ').map(n => n[0]).join('').toUpperCase();
  document.getElementById('dhThemeToggle')?.addEventListener('click', () => {
    if (!window.PMTheme) return;
    window.PMTheme.set(window.PMTheme.get() === 'dark' ? 'light' : 'dark');
  });

  const main = document.getElementById('mainContent');

  /* ── Stammdaten (DH-spezifisch: Studiengang/Semester + aktuelle Abteilung) ── */
  async function buildStammdaten() {
    let abteilung = '–', verantw = '–';
    try {
      const zuw = await DB.getAktuellerAusbilder(user.id);   // aktuelle Zuweisung (oder null)
      if (zuw) {
        abteilung = zuw.abteilung || '–';
        const v = await DB.getUser(zuw.ausbilderId);
        verantw = (v && v.name) || '–';
      }
    } catch (e) { /* ohne Backend/Daten: Platzhalter */ }

    const fields = [
      { label: 'Name',                    value: user.name },
      { label: 'Studiengang',             value: user.studiengang || '–' },
      { label: 'Semester',                value: user.semester ? `${user.semester}. Semester` : '–' },
      { label: 'Aktuelle Abteilung',      value: abteilung },
      { label: 'Verantwortliche/r',       value: verantw },
    ];
    return `
      <details class="profil-section" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">${Icon('document')}</div>
          <div class="profil-section__title">Stammdaten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <dl class="profil-stammdaten__grid">
            ${fields.map(f => `
              <div class="profil-stammdaten__field">
                <dt class="profil-stammdaten__label">${esc(f.label)}</dt>
                <dd class="profil-stammdaten__value">${esc(f.value)}</dd>
              </div>`).join('')}
          </dl>
        </div></div>
      </details>`;
  }

  /* ── Persönliche Daten ── */
  function buildPersoenlicheDaten() {
    const item = (label, value) => `
      <div class="profil-data-item">
        <div class="profil-data-label">${esc(label)}</div>
        <div class="profil-data-value">${esc(value)}</div>
      </div>`;
    return `
      <details class="profil-section" open>
        <summary class="profil-section__header">
          <div class="profil-section__icon">${Icon('user')}</div>
          <div class="profil-section__title">Persönliche Daten</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <div class="profil-data-grid">
            ${item('Vollständiger Name', user.name)}
            ${item('E-Mail-Adresse', user.email || '–')}
            ${item('Rolle', 'DH-Student/in')}
            ${item('Kürzel', user.initials)}
          </div>
        </div></div>
      </details>`;
  }

  /* ── Darstellung & Themes (voll, inkl. Custom-Designs) ──
     Markup/Logik bewusst identisch zur Profil-Seite (profil.js), damit
     Aussehen, Verhalten und Theme-Persistenz exakt gleich sind. */
  function buildDarstellung() {
    const mode   = window.PMTheme?.getMode?.()   || 'light';
    const custom = window.PMTheme?.getCustom?.() || '';
    const silkColor  = window.PMTheme?.getSilkColor?.() || 'indigo';
    const silkColors = window.PMTheme?.SILK_COLORS || [];

    const modeBtn = (val, label, icon) => `
      <button type="button" class="theme-mode-btn ${mode === val ? 'active' : ''}"
              data-theme-mode="${val}" aria-pressed="${mode === val}">${icon}<span>${label}</span></button>`;
    const SUN  = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const MOON = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

    const customGroup = `
      <div class="theme-group">
        <div class="theme-group__label">Custom-Design</div>
        <div class="theme-tiles">
          ${THEME_DESIGNS.map(d => `
            <button type="button" class="theme-tile ${custom === d.id ? 'active' : ''}"
                    data-theme-design="${d.id}" aria-pressed="${custom === d.id}">
              <span class="theme-tile__swatch theme-tile__swatch--${d.id || 'standard'}" aria-hidden="true"></span>
              <span class="theme-tile__name">${d.name}</span>
            </button>`).join('')}
        </div>
        <div class="silk-colors ${custom === 'silk' ? 'is-visible' : ''}" id="silkColorRow">
          <div class="theme-group__label" style="margin-top:var(--sp-4)">Silk-Farbe</div>
          <div class="silk-swatches">
            ${silkColors.map(c => `
              <button type="button" class="silk-swatch ${silkColor === c.id ? 'active' : ''}" data-silk-color="${c.id}" style="--sw-hue:${c.hue}" title="${c.label}" aria-label="${c.label}" aria-pressed="${silkColor === c.id}">
                <span class="silk-swatch__dot" aria-hidden="true"></span>
              </button>`).join('')}
          </div>
        </div>
      </div>`;

    return `
      <details class="profil-section">
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M12 22a10 10 0 1 1 10-10c0 2.21-1.79 3.5-4 3.5h-2.2c-1.1 0-1.8.9-1.8 2 0 .55.2 1.05.55 1.45.35.4.55.9.55 1.45 0 1.1-.9 1.6-2.1 1.6Z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="11" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <div class="profil-section__title">Darstellung &amp; Themes</div>
        </summary>
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
      </details>`;
  }

  function syncDarstellung() {
    if (!window.PMTheme) return;
    const mode   = window.PMTheme.getMode();
    const custom = window.PMTheme.getCustom() || '';
    document.querySelectorAll('[data-theme-mode]').forEach(btn => {
      const on = btn.dataset.themeMode === mode;
      btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-theme-design]').forEach(tile => {
      const on = (tile.dataset.themeDesign || '') === custom;
      tile.classList.toggle('active', on); tile.setAttribute('aria-pressed', String(on));
    });
    const silkColor = window.PMTheme.getSilkColor ? window.PMTheme.getSilkColor() : 'indigo';
    const silkRow = document.getElementById('silkColorRow');
    if (silkRow) silkRow.classList.toggle('is-visible', custom === 'silk');
    document.querySelectorAll('[data-silk-color]').forEach(sw => {
      const on = sw.dataset.silkColor === silkColor;
      sw.classList.toggle('active', on); sw.setAttribute('aria-pressed', String(on));
    });
  }

  function bindDarstellung() {
    if (!window.PMTheme) return;
    document.querySelectorAll('[data-theme-mode]').forEach(btn =>
      btn.addEventListener('click', () => window.PMTheme.setMode(btn.dataset.themeMode)));
    document.querySelectorAll('[data-theme-design]').forEach(tile =>
      tile.addEventListener('click', () => window.PMTheme.setCustom(tile.dataset.themeDesign || null)));
    document.querySelectorAll('[data-silk-color]').forEach(sw =>
      sw.addEventListener('click', () => window.PMTheme.setSilkColor?.(sw.dataset.silkColor)));
    if (window.__pmThemeCardSync) {
      window.removeEventListener('pm-theme-change', window.__pmThemeCardSync);
      window.removeEventListener('pm-silk-color-change', window.__pmThemeCardSync);
    }
    window.__pmThemeCardSync = syncDarstellung;
    window.addEventListener('pm-theme-change', syncDarstellung);
    window.addEventListener('pm-silk-color-change', syncDarstellung);
  }

  /* ── Abmelden ── */
  function buildLogout() {
    return `
      <div class="profil-logout">
        <div class="profil-logout__icon" aria-hidden="true">${Icon('logout')}</div>
        <div class="profil-logout__text"><div class="profil-logout__title">Abmelden</div></div>
        <button class="btn btn-danger" id="logoutBtn" type="button">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Jetzt abmelden
        </button>
      </div>`;
  }

  // Render
  main.innerHTML = `
    <div class="page-header"><div class="page-header__left"><h1 class="page-title">Mein Profil</h1></div></div>
    <div class="profil-panels">
      ${await buildStammdaten()}
      ${buildPersoenlicheDaten()}
      ${buildDarstellung()}
      ${buildLogout()}
    </div>`;

  bindDarstellung();

  // Logout (auf dieser Seite läuft kein initLayout, daher hier direkt binden).
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await DB.logout(); } catch (e) { /* trotzdem zur Login-Seite */ }
    window.location.href = 'index.html';
  });
});
