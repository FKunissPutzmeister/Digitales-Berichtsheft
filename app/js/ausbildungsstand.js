/* ===================================================================
   AUSBILDUNGSSTAND.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const user = initPage('nav-ausbildungsstand', [{ label: 'Ausbildungsstand', href: 'ausbildungsstand.html' }]);
  if (!user) return;

  let currentBereich = 'betrieb';
  let sortField = 'name';
  let sortAsc = true;
  let filterText = '';
  let viewAzubiId = user.role === 'azubi' ? user.id : user.id;

  function render() {
    const isAusbilder = ['ausbilder', 'admin'].includes(user.role);
    const qualis = DB.getQualifikationen(currentBereich);

    // Gesamt-Stunden – istStunden ist in 1/100 h gespeichert, sollStunden bereits in h
    const gesamtSoll = qualis.reduce((s, q) => s + q.sollStunden, 0);
    const gesamtIst  = qualis.reduce((s, q) => s + ((q.istStunden || 0) / 100), 0);
    const fortschrittPct = gesamtSoll > 0
      ? Math.min(Math.round((gesamtIst / gesamtSoll) * 100), 100)
      : 0;
    const fehltageProzent = 35;

    const main = document.getElementById('mainContent');
    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Ausbildungsstand</h1>
          <p class="page-subtitle">Qualifikationen und Stunden nach Lernbereichen.</p>
        </div>
        ${isAusbilder ? `
        <div class="page-header__actions">
          ${DB.getAzubis().map(a => `
            <button class="ausbilder-chip ${a.id === viewAzubiId ? 'selected' : ''}" data-azubi-id="${a.id}">
              <div class="avatar" style="width:28px;height:28px;font-size:11px">${a.initials}</div>
              ${a.name}
            </button>
          `).join('')}
        </div>
        ` : ''}
      </div>

      <!-- Kreis-Statistiken -->
      <div class="stand-summary">
        <div class="circle-stat animate-fade-in">
          <div class="circle-stat__ring">
            <svg viewBox="0 0 80 80">
              <circle class="track" cx="40" cy="40" r="34"/>
              <circle class="fill fill--error" cx="40" cy="40" r="34"
                      data-pct="${Math.min(fehltageProzent / 50 * 100, 100)}"/>
            </svg>
            <div class="circle-stat__value">
              <span class="circle-stat__num">35</span>
              <span class="circle-stat__unit">Tage</span>
            </div>
          </div>
          <span class="circle-stat__label">Fehltage Betrieb</span>
        </div>
        <div class="circle-stat animate-fade-in" style="animation-delay:60ms">
          <div class="circle-stat__ring">
            <svg viewBox="0 0 80 80">
              <circle class="track" cx="40" cy="40" r="34"/>
              <circle class="fill" cx="40" cy="40" r="34"
                      data-pct="${fortschrittPct}"/>
            </svg>
            <div class="circle-stat__value">
              <span class="circle-stat__num">${Math.round(gesamtIst)}</span>
              <span class="circle-stat__unit">Std.</span>
            </div>
          </div>
          <span class="circle-stat__label">Abgenommene Stunden</span>
          <span class="circle-stat__sub">von ${gesamtSoll} Soll</span>
        </div>
        <div class="circle-stat animate-fade-in" style="animation-delay:120ms">
          <div class="circle-stat__ring">
            <svg viewBox="0 0 80 80">
              <circle class="track" cx="40" cy="40" r="34"/>
              <circle class="fill fill--success" cx="40" cy="40" r="34"
                      data-pct="${fortschrittPct}"/>
            </svg>
            <div class="circle-stat__value">
              <span class="circle-stat__num">${fortschrittPct}</span>
              <span class="circle-stat__unit">%</span>
            </div>
          </div>
          <span class="circle-stat__label">Fortschritt</span>
          <span class="circle-stat__sub">Betrieb gesamt</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs-container">
        <div class="tabs" id="bereichTabs">
          <button class="tab-btn ${currentBereich === 'betrieb' ? 'active' : ''}" data-bereich="betrieb">Betrieb</button>
          <button class="tab-btn ${currentBereich === 'schule' ? 'active' : ''}" data-bereich="schule">Schule</button>
        </div>
      </div>

      <!-- Filter -->
      <div class="stand-filters">
        <div style="position:relative;">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
               style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--pm-grey-400);pointer-events:none">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-control" id="qualiSearch"
                 style="padding-left:34px"
                 placeholder="Qualifikation suchen…"
                 value="${filterText}">
        </div>
        <div class="stand-filters-right">
          <span style="font-size:var(--text-sm);color:var(--pm-grey-500)" id="qualiCount">
            ${qualis.length} Qualifikationen
          </span>
        </div>
      </div>

      <!-- Tabelle -->
      <div class="qual-table-wrap animate-fade-in">
        <table class="qual-table" id="qualiTable">
          <thead>
            <tr>
              <th data-sort="name">Qualifikation <span class="sort-icon">↕</span></th>
              <th data-sort="istStunden" style="width:150px;text-align:right">Abgenommene Std. <span class="sort-icon">↕</span></th>
              <th style="width:220px">Fortschritt</th>
            </tr>
          </thead>
          <tbody id="qualiBody">
            ${renderQualiRows(qualis)}
          </tbody>
        </table>
        <div class="pagination">
          <span class="pagination__info" id="paginationInfo">Zeige 1–${qualis.length} von ${qualis.length}</span>
        </div>
      </div>
    `;

    // Kreis-Animationen
    setTimeout(() => {
      document.querySelectorAll('.circle-stat__ring circle.fill').forEach(circle => {
        const pct = parseFloat(circle.dataset.pct) || 0;
        const r = 34;
        const circ = 2 * Math.PI * r;
        const offset = circ - (pct / 100) * circ;
        circle.style.strokeDasharray = circ;
        circle.style.strokeDashoffset = circ;
        setTimeout(() => { circle.style.strokeDashoffset = offset; }, 50);
      });
    }, 100);

    // Tab-Wechsel
    document.querySelectorAll('.tab-btn[data-bereich]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentBereich = btn.dataset.bereich;
        render();
      });
    });

    // Suche
    document.getElementById('qualiSearch')?.addEventListener('input', (e) => {
      filterText = e.target.value.toLowerCase();
      refreshTable();
    });

    // Sortierung
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        if (sortField === th.dataset.sort) sortAsc = !sortAsc;
        else { sortField = th.dataset.sort; sortAsc = true; }
        refreshTable();
      });
    });

    // Ausbilder Azubi-Wechsel
    document.querySelectorAll('.ausbilder-chip[data-azubi-id]').forEach(btn => {
      btn.addEventListener('click', () => { viewAzubiId = parseInt(btn.dataset.azubiId); render(); });
    });
  }

  function renderQualiRows(qualis) {
    let filtered = qualis.filter(q =>
      !filterText || q.name.toLowerCase().includes(filterText)
    );
    filtered.sort((a, b) => {
      let va = a[sortField] || 0;
      let vb = b[sortField] || 0;
      if (sortField === 'name') { va = a.name; vb = b.name; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    if (!filtered.length) {
      return `<tr><td colspan="3" style="text-align:center;padding:var(--sp-8);color:var(--pm-grey-400)">Keine Qualifikationen gefunden.</td></tr>`;
    }

    return filtered.map(q => {
      const istH = Math.round((q.istStunden || 0) / 100);
      const sollH = q.sollStunden;
      const pct = sollH > 0 ? Math.min(Math.round((istH / sollH) * 100), 100) : 0;
      const barClass = pct >= 100 ? 'progress-bar__fill--success' : pct >= 50 ? '' : 'progress-bar__fill--info';

      return `
        <tr>
          <td>${q.name}</td>
          <td style="text-align:right"><span class="hours">${formatStunden(q.istStunden)}</span></td>
          <td>
            <div class="progress-wrap">
              <div class="progress-bar" style="flex:1">
                <div class="progress-bar__fill ${barClass}" style="width:${pct}%"></div>
              </div>
              <span class="pct-label">${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function refreshTable() {
    const qualis = DB.getQualifikationen(currentBereich);
    document.getElementById('qualiBody').innerHTML = renderQualiRows(qualis);
    const filtered = qualis.filter(q => !filterText || q.name.toLowerCase().includes(filterText));
    document.getElementById('qualiCount').textContent = `${filtered.length} Qualifikationen`;
    document.getElementById('paginationInfo').textContent = `Zeige 1–${filtered.length} von ${filtered.length}`;
  }

  render();
});
