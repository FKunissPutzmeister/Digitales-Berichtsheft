/* ===================================================================
   MITTEILUNGEN.JS – Vollseite „Alle Mitteilungen" mit Filter + Suche.
   Spiegelt die Dashboard-Kacheln 1:1, nur ohne Kappung:
     • Azubi     → Backend-Benachrichtigungen (ohne versetzung_/genehmigt)
     • Ausbilder → aus Wochen + Beurteilungen abgeleitet (ohne genehmigt)
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  document.body.dataset.page = 'mitteilungen';
  const user = await initPage('nav-dashboard', [{ label: 'Mitteilungen', href: 'mitteilungen.html' }]);
  if (!user) return;

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  const isAzubi = !!user.istAzubi;

  const ICON = {
    ok:      '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    er:      '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    info:    '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 12h-6l-2 3h-4l-2-3H2"/><path stroke-linecap="round" stroke-linejoin="round" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    warn:    '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 1.5"/></svg>',
    neutral: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path stroke-linecap="round" stroke-linejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    cap:     '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5"/></svg>',
  };

  function relTime(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'gerade eben';
    if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
    if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
    if (s < 86400 * 2) return 'gestern';
    if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} Tagen`;
    return new Date(ts).toLocaleDateString('de-DE');
  }

  // Kopie von dashboard.js#getMeineAzubis (dort file-scoped, hier eigenständig).
  async function getMeineAzubis() {
    const heute = new Date().toISOString().split('T')[0];
    const byId = new Map();
    const meineZuw = (await DB.getZuweisungenFuerVerantw(user.email))
      .filter(z => z.von <= heute && z.bis >= heute);
    const azubiIds = [...new Set(meineZuw.map(z => z.azubiId))];
    for (const u of (await Promise.all(azubiIds.map(id => DB.getUser(id)))).filter(Boolean)) {
      byId.set(u.oid, u);
    }
    for (const u of await DB.getDauerhafteAzubis()) {
      if (!byId.has(u.oid)) byId.set(u.oid, u);
    }
    return [...byId.values()];
  }

  async function buildAusbilderItems() {
    const azubis = await getMeineAzubis();
    const items = [];
    for (const a of azubis) {
      const azName = displayName(a.name || '');
      let wochen = [];
      try { wochen = await DB.getWochenFuerAzubi(a.id); } catch (_) { /* ignore */ }
      wochen
        .filter(w => w.status !== 'offen' && w.status !== 'genehmigt')
        .forEach(w => {
          const sunday = DateUtil.getMondayOfKW(w.kw, w.year);
          sunday.setDate(sunday.getDate() + 6);
          let tone, typeKey, typeLabel;
          if (w.status === 'freigegeben')    { tone = 'info';    typeKey = 'eingereicht';   typeLabel = 'Eingereicht'; }
          else if (w.status === 'abgelehnt') { tone = 'er';      typeKey = 'zurueckgegeben'; typeLabel = 'Zurückgegeben'; }
          else                               { tone = 'neutral'; typeKey = 'erstgenehmigt';  typeLabel = 'Erstgenehmigt'; }
          items.push({
            ts: sunday.getTime(), tone, typeKey, typeLabel,
            title: `<strong>${esc(azName)}</strong>: KW ${w.kw}`,
            meta: `KW ${w.kw}/${w.year}`,
            azubiName: azName,
            href: 'wochenansicht.html',
            nav: { gotoAzubiId: a.id, gotoKW: String(w.kw), gotoYear: String(w.year) },
          });
        });
      let bs = [];
      try { bs = await DB.getBeurteilungenFuerAzubi(a.oid); } catch (_) { /* ignore */ }
      bs.filter(b => b.status === 'abgeschlossen' && b.abgeschlossenAm).forEach(b => {
        const d = new Date(b.abgeschlossenAm);
        const note = b.note != null ? ` · Note ${b.note.toLocaleString('de-DE')}` : '';
        items.push({
          ts: isNaN(d) ? 0 : d.getTime(), tone: 'neutral', typeKey: 'beurteilung', typeLabel: 'Beurteilung',
          title: `<strong>${esc(azName)}</strong>: Beurteilung abgeschlossen${note}`,
          meta: isNaN(d) ? '' : d.toLocaleDateString('de-DE'),
          azubiName: azName,
          href: `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId)}`,
        });
      });
    }
    return items.sort((x, y) => y.ts - x.ts);
  }

  async function buildAzubiItems() {
    const notifs = (await DB.getBenachrichtigungenFuerUser(user.id))
      .filter(b => !String(b.type || '').startsWith('versetzung_') && b.type !== 'genehmigt');
    return notifs.map(b => {
      const isErst = b.type === 'erstgenehmigt';
      const tone = isErst ? 'ok' : 'er';
      const typeKey = isErst ? 'erstgenehmigt' : 'zurueckgegeben';
      const typeLabel = isErst ? 'Erstgenehmigt' : 'Zurückgegeben';
      return {
        ts: b.timestamp || 0, tone, typeKey, typeLabel,
        title: isErst ? `KW ${b.kw}/${b.year} erstgenehmigt` : `KW ${b.kw}/${b.year} zurückgegeben`,
        meta: relTime(b.timestamp),
        gelesen: !!b.gelesen,
        notifId: b.id,
        href: 'wochenansicht.html',
        nav: { gotoKW: String(b.kw), gotoYear: String(b.year), ...(b.azubiId ? { gotoAzubiId: b.azubiId } : {}) },
      };
    }).sort((x, y) => y.ts - x.ts);
  }

  let items = [];
  try {
    items = isAzubi ? await buildAzubiItems() : await buildAusbilderItems();
  } catch (e) {
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left"><h1 class="page-title">Mitteilungen</h1></div></div>
      <div class="card"><div class="card__body"><p style="color:var(--color-error)">Fehler beim Laden: ${esc(e.message)}</p></div></div>`;
    return;
  }

  // Filter-State
  let query = '', typeFilter = '', readFilter = '';

  // Typ-Optionen aus den vorhandenen Items ableiten (stabile Reihenfolge).
  const typeOrder = ['eingereicht', 'zurueckgegeben', 'erstgenehmigt', 'beurteilung'];
  const typeLabelByKey = {};
  items.forEach(it => { typeLabelByKey[it.typeKey] = it.typeLabel; });
  const typeKeys = Object.keys(typeLabelByKey).sort((a, b) => {
    const ia = typeOrder.indexOf(a), ib = typeOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // „Neu seit letztem Besuch": Einträge, die neuer sind als der letzte Aufruf
  // dieser Seite, bekommen einen sanften Hinweis. Der Marker wird beim Laden
  // sofort aktualisiert → beim nächsten Öffnen/Refresh sind sie „gesehen" und
  // der Hinweis verschwindet. Rein clientseitig (localStorage), pro Rolle.
  const SEEN_KEY = `mitteilungenLastSeen:${isAzubi ? 'azubi' : 'ausbilder'}`;
  let lastSeen = 0;
  try { lastSeen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch (_) { /* ignore */ }
  items.forEach(it => { it.isNew = (it.ts || 0) > lastSeen; });
  try {
    const maxTs = items.reduce((m, it) => Math.max(m, it.ts || 0), 0);
    localStorage.setItem(SEEN_KEY, String(Math.max(Date.now(), maxTs)));
  } catch (_) { /* ignore */ }

  main.innerHTML = `
    <div class="page-header">
      <div class="page-header__left">
        <h1 class="page-title">Mitteilungen</h1>
      </div>
    </div>

    <div class="card">
      <div class="card__body">
        <div class="mt-toolbar">
          <input type="search" class="form-control mt-toolbar__search" id="mtSearch"
                 placeholder="Suchen…" autocomplete="off" spellcheck="false">
          <select class="form-control mt-toolbar__select" id="mtType" aria-label="Nach Typ filtern">
            <option value="">Alle Typen</option>
            ${typeKeys.map(k => `<option value="${k}">${esc(typeLabelByKey[k])}</option>`).join('')}
          </select>
          ${isAzubi ? `
          <select class="form-control mt-toolbar__select" id="mtRead" aria-label="Nach Status filtern">
            <option value="">Alle</option>
            <option value="unread">Nur ungelesen</option>
          </select>` : ''}
        </div>
        <div class="mt-count" id="mtCount"></div>
        <div class="mt-list" id="mtList"></div>
      </div>
    </div>`;

  function itemHtml(it) {
    const unread = it.gelesen === false;
    const chipTone = it.tone === 'ok' ? 'ok' : it.tone === 'er' ? 'er' : it.tone === 'info' ? 'info' : '';
    const azubiMeta = it.azubiName ? `<span>·</span><span>${esc(it.azubiName)}</span>` : '';
    const navData = it.nav
      ? Object.entries(it.nav).map(([k, v]) => ` data-${k.toLowerCase()}="${esc(v)}"`).join('')
      : '';
    return `
      <a class="mt-item${unread ? ' mt-item--unread' : ''}${it.isNew ? ' mt-item--new' : ''}" href="${it.href}"${navData}${it.notifId != null ? ` data-notif-id="${it.notifId}"` : ''}>
        <span class="mt-item__icon mt-item__icon--${it.tone}">${ICON[it.tone] || ICON.neutral}</span>
        <span class="mt-item__body">
          <span class="mt-item__title">${it.title}</span>
          <span class="mt-item__meta">
            <span class="mt-item__chip${chipTone ? ' mt-item__chip--' + chipTone : ''}">${esc(it.typeLabel)}</span>
            ${it.meta ? `<span>${esc(it.meta)}</span>` : ''}
            ${azubiMeta}
          </span>
        </span>
        ${unread ? '<span class="mt-item__dot" aria-hidden="true"></span>' : ''}
      </a>`;
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (typeFilter && it.typeKey !== typeFilter) return false;
      if (readFilter === 'unread' && it.gelesen !== false) return false;
      if (q) {
        const hay = (it.title + ' ' + (it.azubiName || '') + ' ' + (it.meta || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderList() {
    const list = document.getElementById('mtList');
    const count = document.getElementById('mtCount');
    const rows = filtered();
    count.textContent = rows.length === items.length
      ? `${items.length} ${items.length === 1 ? 'Mitteilung' : 'Mitteilungen'}`
      : `${rows.length} von ${items.length} Mitteilungen`;
    list.innerHTML = rows.length
      ? rows.map(itemHtml).join('')
      : `<div class="mt-empty">${items.length === 0 ? 'Noch keine Mitteilungen.' : 'Keine Mitteilungen für diese Filter.'}</div>`;
  }

  renderList();

  // Filter verdrahten
  document.getElementById('mtSearch').addEventListener('input', e => { query = e.target.value; renderList(); });
  document.getElementById('mtType').addEventListener('change', e => { typeFilter = e.target.value; renderList(); });
  document.getElementById('mtRead')?.addEventListener('change', e => { readFilter = e.target.value; renderList(); });

  // Klick: gotoX in sessionStorage setzen (die Zielseite liest das aus) und –
  // bei Azubi-Benachrichtigungen – als gelesen markieren. Wichtig: erst markieren
  // (await), DANN navigieren – sonst bricht der Voll-Seiten-Wechsel den PATCH ab
  // (kein keepalive), und die Benachrichtigung bliebe ungelesen (wie im Dashboard).
  document.getElementById('mtList').addEventListener('click', async (e) => {
    const a = e.target.closest('.mt-item');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.gotoazubiid) sessionStorage.setItem('gotoAzubiId', a.dataset.gotoazubiid);
    if (a.dataset.gotokw)      sessionStorage.setItem('gotoKW', a.dataset.gotokw);
    if (a.dataset.gotoyear)    sessionStorage.setItem('gotoYear', a.dataset.gotoyear);
    const id = a.dataset.notifId;
    if (id != null && id !== '') {
      try { await DB.markBenachrichtigungGelesen(Number(id)); } catch (_) { /* best effort */ }
    }
    window.location.href = a.getAttribute('href');
  });
});
