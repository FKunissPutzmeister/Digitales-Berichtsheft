/* ===================================================================
   ABTEILUNGSDURCHLAUF.JS – Ansicht für DH-Studenten (Rolle: dhstudent)
   -------------------------------------------------------------------
   Read-only Sicht auf den eigenen Abteilungsdurchlauf: Hero, Kennzahlen,
   Zeitstrahl (Gantt-Optik wie im Azubi-Planer, hier mehrjährig) und
   Karten je Abteilung. Nutzt ausschließlich bestehende, theme-fähige
   Komponenten + Design-Tokens, damit alle Themes automatisch greifen.
   =================================================================== */

/* Einheitliche, ruhige Abteilungs-Palette (wie im Azubi-Planer). */
const GANTT_PALETTE = ['#4F9D9A','#5B86C2','#5FAE72','#D8835A','#9B7BC4',
  '#C75C6B','#C99A3E','#6B8E4E','#C77FB2','#4F8FB8','#7E70BE','#B06A52','#5BA98C','#6E7E8C','#A86FA0'];

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

document.addEventListener('DOMContentLoaded', async () => {
  const user = await DB.fetchCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }
  // Nur DH-Studenten sehen diese Seite – alle anderen auf ihre Startseite.
  if (!user.istDhStudent) {
    window.location.replace(typeof landingPageFor === 'function' ? landingPageFor(user) : 'dashboard.html');
    return;
  }

  // Topbar: Avatar + Theme-Toggle
  const avatar = document.getElementById('dhAvatar');
  if (avatar) avatar.textContent = user.initials || (user.name || '').split(' ').map(n => n[0]).join('').toUpperCase();
  document.getElementById('dhThemeToggle')?.addEventListener('click', () => {
    if (!window.PMTheme) return;
    window.PMTheme.set(window.PMTheme.get() === 'dark' ? 'light' : 'dark');
  });

  const main = document.getElementById('mainContent');
  const today = new Date();
  const heute = DateUtil.toISODate(today);
  let pendingScrollLeft = 0;   // Timeline-Scrollziel („heute"), nach Render angewandt

  // Stabile Farbe je Abteilung (alphabetisch vorbelegt).
  const abtColorIdx = {}; let _nextIdx = 0;
  const colorFor = (abt) => {
    if (!abt) return GANTT_PALETTE[0];
    if (!(abt in abtColorIdx)) { abtColorIdx[abt] = _nextIdx % GANTT_PALETTE.length; _nextIdx++; }
    return GANTT_PALETTE[abtColorIdx[abt]];
  };

  function statusFor(z) {
    if (!z.von || !z.bis) return { key: 'offen',      label: 'Offen',      badge: 'badge--grey' };
    if (z.bis < heute)    return { key: 'beendet',    label: 'Beendet',    badge: 'badge--grey' };
    if (z.von > heute)    return { key: 'zukuenftig', label: 'Zukünftig', badge: 'badge--freigegeben' };
    return { key: 'aktuell', label: 'Aktuell', badge: 'badge--genehmigt' };
  }

  try {
    const zuwRaw = await DB.getZuweisungenFuerAzubi(user.id);
    const zuw = zuwRaw.slice().sort((a, b) => (a.von || '').localeCompare(b.von || ''));
    // Abteilungen vorab einfärben (sortiert → stabile Farbe je Abteilung).
    [...new Set(zuw.map(z => z.abteilung).filter(Boolean))].sort().forEach(colorFor);

    const rows = await Promise.all(zuw.map(async z => {
      const v = await DB.getUser(z.ausbilderId);
      return { z, verantw: (v && v.name) || '–', status: statusFor(z) };
    }));

    const aktuell  = rows.find(r => r.status.key === 'aktuell') || null;
    const naechste = rows.find(r => r.status.key === 'zukuenftig') || null;
    const erste    = rows[0] || null;

    main.innerHTML = `
      ${heroHtml(user, today, aktuell)}
      ${kpisHtml(aktuell, naechste, erste)}
      ${zuw.length ? `
        <h2 class="dh-section-title">Zeitstrahl deines Durchlaufs</h2>
        <div class="dh-timeline">${timelineHtml(zuw)}</div>` : ''}
      <h2 class="dh-section-title">Alle Abteilungen</h2>
      ${rows.length
        ? `<div class="durchlauf-list">${rows.map(cardHtml).join('')}</div>`
        : `<div class="dh-empty">Dir ist aktuell keine Abteilung zugewiesen. Sobald die Personalabteilung deine Abteilungen plant, erscheinen sie hier.</div>`}
    `;

    // Timeline auf „heute" scrollen (heute ~3 Tage vom linken Rand).
    const sc = document.getElementById('azubiGanttScroll');
    if (sc) requestAnimationFrame(() => { sc.scrollLeft = pendingScrollLeft; });
  } catch (err) {
    console.error('Abteilungsdurchlauf konnte nicht geladen werden:', err);
    main.innerHTML = `
      ${heroHtml(user, today, null)}
      <div class="dh-empty">Dein Abteilungsdurchlauf konnte gerade nicht geladen werden. Bitte später erneut versuchen.</div>`;
  }

  /* ── Hero (dunkles Welcome-Banner, in allen Themes konsistent) ── */
  function heroHtml(u, date, aktuell) {
    const first = (u.name || '').split(' ')[0];
    const greeting = (typeof getGreeting === 'function') ? getGreeting() : 'Hallo';
    const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
    const info = [
      u.studiengang || '',
      u.semester ? `${u.semester}. Semester` : '',
      `${weekday}, ${date.getDate()}. ${DateUtil.MONTHS[date.getMonth()]}`,
    ].filter(Boolean).join(' · ');
    return `
      <section class="welcome-banner">
        <div class="welcome-banner__content">
          <p class="welcome-banner__greeting">${esc(greeting)}, ${esc(first)}</p>
          <h1 class="welcome-banner__title">Mein Abteilungsdurchlauf</h1>
          <p class="welcome-banner__info">${esc(info)}</p>
        </div>
        <div class="welcome-banner__kw">
          <div class="welcome-banner__kw-number">${date.getDate()}</div>
          <div class="welcome-banner__kw-label">${DateUtil.MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}</div>
        </div>
      </section>`;
  }

  /* ── Kennzahlen (bestehende .planer-kpi-Kacheln) ── */
  function kpisHtml(aktuell, naechste, erste) {
    const tile = (value, label, meta = '') => `
      <div class="planer-kpi">
        <div class="planer-kpi__value">${esc(value)}</div>
        <div class="planer-kpi__label">${esc(label)}</div>
        ${meta ? `<div class="planer-kpi__label" style="text-transform:none;letter-spacing:0;color:var(--pm-grey-500);margin-top:2px">${esc(meta)}</div>` : ''}
      </div>`;
    const monatJahr = (iso) => { if (!iso) return '–'; const d = new Date(iso + 'T00:00:00'); return `${DateUtil.MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
    return `
      <div class="planer-kpis">
        ${tile(aktuell ? aktuell.z.abteilung : '–', 'Aktuelle Abteilung', aktuell ? `noch bis ${DateUtil.formatDate(aktuell.z.bis)}` : 'derzeit keine')}
        ${tile(naechste ? naechste.z.abteilung : '–', 'Nächste Abteilung', naechste ? `ab ${DateUtil.formatDate(naechste.z.von)}` : 'keine geplant')}
        ${tile(aktuell ? aktuell.verantw : '–', 'Verantwortlich (aktuell)')}
        ${tile(erste ? monatJahr(erste.z.von) : '–', 'Durchlauf seit', erste ? 'erste Abteilung' : '')}
      </div>`;
  }

  /* ── Zeitstrahl: Gantt-Optik wie im Azubi-Planer, über alle Jahre ── */
  function timelineHtml(zuw) {
    const DAY_PX = 30;
    const withDates = zuw.filter(z => z.von && z.bis);
    if (!withDates.length) return '';
    const minVon = withDates.reduce((m, z) => z.von < m ? z.von : m, withDates[0].von);
    const maxBis = withDates.reduce((m, z) => z.bis > m ? z.bis : m, withDates[0].bis);
    const [sy, sm] = minVon.split('-').map(Number);
    const [ey, em] = maxBis.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, 1);
    const endDate   = new Date(ey, em, 0);                 // letzter Tag des End-Monats
    const numDays   = Math.round((endDate - startDate) / 86400000) + 1;
    const dayOf     = d => Math.round((d - startDate) / 86400000);

    let monate = '', tage = '';
    let cur = new Date(startDate);
    while (cur <= endDate) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const dim = new Date(y, m + 1, 0).getDate();
      monate += `<div class="gantt-month" style="width:calc(${dim} * var(--day-px))">${DateUtil.MONTHS_SHORT[m]} ${y}</div>`;
      for (let d = 1; d <= dim; d++) {
        const date = new Date(y, m, d);
        const dow = date.getDay();
        const we = dow === 0 || dow === 6;
        const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
        tage += `<div class="gantt-day${we ? ' gantt-day--weekend' : ''}${isToday ? ' current' : ''}${d === 1 ? ' gantt-day--month' : ''}">${d}</div>`;
      }
      cur = new Date(y, m + 1, 1);
    }

    let bars = '';
    zuw.forEach(z => {
      if (!z.von || !z.bis) return;
      const fromDay = dayOf(new Date(z.von + 'T00:00:00'));
      const toDay   = dayOf(new Date(z.bis + 'T00:00:00'));
      const startDay = Math.max(0, fromDay), endDay = Math.min(numDays - 1, toDay);
      if (endDay < startDay) return;
      const left = startDay / numDays * 100, width = (endDay - startDay + 1) / numDays * 100;
      bars += `<div class="gantt-bar" style="left:${left}%;width:${width}%;background:${colorFor(z.abteilung)}"
        title="${esc(z.abteilung || '–')} (${DateUtil.formatDate(z.von)} – ${DateUtil.formatDate(z.bis)})">
        <span class="gantt-bar__label">${esc(z.abteilung || '')}</span></div>`;
    });

    let today_ = '';
    if (today.getFullYear() >= sy && today.getFullYear() <= ey && today >= startDate && today <= endDate) {
      const pct = (dayOf(today) + 0.5) / numDays * 100;
      today_ = `<div class="gantt-today-line" style="left:${pct}%"></div><div class="gantt-today-marker" style="left:${pct}%">Heute</div>`;
    }

    // Scroll-Position für „heute" merken (wird nach dem Einfügen angewandt).
    pendingScrollLeft = (today >= startDate && today <= endDate) ? Math.max(0, (dayOf(today) - 3) * DAY_PX) : 0;

    const html = `
      <div class="gantt-scroll" id="azubiGanttScroll">
        <div class="gantt-grid gantt--lg" style="--num-days:${numDays};--day-px:${DAY_PX}px">
          <div class="gantt-header">
            <div class="gantt-header__name-col">${sy === ey ? sy : `${sy} – ${ey}`}</div>
            <div class="gantt-header__timeline">
              <div class="gantt-months">${monate}</div>
              <div class="gantt-days">${tage}</div>
            </div>
          </div>
          <div class="gantt-body">
            <div class="gantt-row">
              <div class="gantt-row__info"><span class="gantt-row__name">Abteilungen</span></div>
              <div class="gantt-row__timeline">${today_}${bars}</div>
            </div>
          </div>
        </div>
      </div>`;
    return html;
  }

  /* ── Karte je Abteilung (bestehende .durchlauf-card) ── */
  function cardHtml(r) {
    return `
      <div class="durchlauf-card${r.status.key === 'aktuell' ? ' durchlauf-card--current' : ''}">
        <span class="badge ${r.status.badge} durchlauf-card__badge">${r.status.label}</span>
        <div class="durchlauf-card__abt">${esc(r.z.abteilung) || '–'}</div>
        <div class="durchlauf-card__zeit">${DateUtil.formatDate(r.z.von)} – ${DateUtil.formatDate(r.z.bis)}</div>
        <div class="durchlauf-card__verantw">Ansprechpartner: <strong>${esc(r.verantw)}</strong></div>
      </div>`;
  }
});
