/* ===================================================================
   BEURTEILUNG-CORE.JS – Kriterienkatalog, IHK-Punkte→Note-Tabelle und
   Rechenlogik des Beurteilungsbogens. Dual-mode: Browser (window.Beurteilung)
   UND Node (module.exports, für Tests + Backend-Wiederverwendung).
   KEIN document/window-Zugriff auf Modulebene – nur in Funktionen.
   =================================================================== */
(function (root) {
  'use strict';

  // Kriterienkatalog (Reihenfolge = Bogen). stufen[0]=Stufe 1 … stufen[5]=Stufe 6.
  // Volltexte siehe docs/superpowers/specs/2026-07-07-beurteilungsbogen-design.md §4.4.
  const KRITERIEN = [
    { key: 'auffassungsgabe', block: 'A', label: 'Auffassungsgabe',
      beschreibung: 'Sicherheit und Schnelligkeit beim Erfassen von Lerninhalten und -situationen, im Begreifen von Zusammenhängen',
      stufen: [
        'Auch schwierige Sachverhalte werden schnell begriffen, Zusammenhänge klar erkannt, Einzeldaten gewichtet und zugeordnet.',
        'Schnelle Auffassungsgabe. Der Kern einer Sache wird rasch begriffen. Ist in der Lage, Wesentliches vom Unwesentlichen zu unterscheiden.',
        'Inhalt und Bedeutung eines Sachverhalts werden erfasst. Das Begriffene wird sachlich richtig eingeordnet.',
        'Anleitungen bzw. wiederholte Erklärungen sind notwendig, damit Lerninhalte und -situationen verstanden werden.',
        'Lerninhalte und -situationen werden selbst nach eingehender, wiederholter Erklärung nur unvollkommen verstanden.',
        'Lerninhalte und -situationen werden selbst nach eingehender, wiederholter Erklärung nicht verstanden.',
      ] },
    { key: 'transfervermoegen', block: 'A', label: 'Transfervermögen',
      beschreibung: 'Umsetzung vorhandener Erkenntnisse auf ähnliche Problemstellungen',
      stufen: [
        'Sichere und richtige Übertragung gewonnener Erkenntnisse.',
        'Gewonnene Erkenntnisse werden übertragen.',
        'Gewonnene Erkenntnisse werden meist übertragen.',
        'Kann gewonnene Erkenntnisse nur vereinzelt übertragen.',
        'Gewonnene Erkenntnisse werden kaum übertragen.',
        'Gewonnene Erkenntnisse können nicht übertragen werden.',
      ] },
    { key: 'ausdauer', block: 'A', label: 'Ausdauer',
      beschreibung: 'Beharrlichkeit und Beständigkeit bei der Erledigung der gestellten Aufgaben und bei der Erreichung der Ausbildungsziele',
      stufen: [
        'Ist außerordentlich ausdauernd auch unter erschwerten Bedingungen.',
        'Ist ausdauernd. Gelegentliche Schwierigkeiten werden überwunden.',
        'Ist im Allgemeinen beharrlich und beständig.',
        'Ist unterschiedlich ausdauernd. Schwierigkeiten werden nur mühsam überwunden.',
        'Weniger beharrlich und beständig. Gibt bei Schwierigkeiten schnell auf.',
        'Ausdauer ist nicht vorhanden. Gibt auch bei allgemeinen Aufgaben schnell auf.',
      ] },
    { key: 'zusammenarbeit', block: 'B', label: 'Zusammenarbeit',
      beschreibung: 'Verhalten im Kontakt mit Kollegen und Vorgesetzten. Fähigkeit zur Zusammenarbeit. Hilfsbereitschaft für andere und deren Unterstützung beim Lernen und Arbeiten',
      stufen: [
        'Zeigt besonderes Einfühlungsvermögen im Umgang mit anderen. Gute Zusammenarbeit und Hilfsbereitschaft. Aufgeschlossen und fair.',
        'Besitzt gutes Einfühlungsvermögen im Umgang mit anderen. Ist hilfsbereit und fähig zu guter Zusammenarbeit.',
        'Zeigt in der Regel Einfühlungsvermögen im Umgang mit anderen. Hat den Willen zur Hilfsbereitschaft und Zusammenarbeit.',
        'Zeigt Unsicherheiten im Umgang mit anderen, wodurch eine problemlose Zusammenarbeit erschwert wird. Arbeitet, von Ausnahmen abgesehen, in der Gruppe mit.',
        'Zeigt ungenügendes Einfühlungsvermögen im Umgang mit anderen. Kein ausgeprägtes Gefühl für Zusammenarbeit. Arbeitet lieber allein.',
        'Zeigt kein Einfühlungsvermögen im Umgang mit anderen. Kein Gefühl für Zusammenarbeit. Arbeitet nur allein.',
      ] },
    { key: 'interesse_initiative', block: 'B', label: 'Interesse / Initiative',
      beschreibung: 'Interesse an der Aufgabe und Initiative, Gelerntes und eigene Fähigkeiten effektiv in der Praxis einzusetzen',
      stufen: [
        'Zeigt außergewöhnliches Interesse. Besonders ausgeprägte Initiative. Scheut auch vor schwierigen Aufgaben nicht zurück. Sehr zielstrebig.',
        'Zeigt Interesse und Initiative. Beteiligt sich an der Lösung auch schwieriger Aufgaben.',
        'Ist interessiert und aufgeschlossen. Setzt seine Fähigkeiten effektiv ein. Braucht nur selten Anregungen bei schwierigen Aufgaben.',
        'Zeigt nicht immer Interesse und Initiative. Bedarf der Anregungen.',
        'Zeigt kaum Interesse und Initiative. Meidet schwierige Aufgaben. Bedarf ständiger Anregungen.',
        'Zeigt keinerlei Interesse und Initiative.',
      ] },
    { key: 'zuverlaessigkeit', block: 'B', label: 'Zuverlässigkeit',
      beschreibung: 'Bereitschaft, Vorschriften (beispielsweise zur Arbeitssicherheit), Anweisungen und Termine gewissenhaft einzuhalten und Verantwortung zu übernehmen',
      stufen: [
        'Ist sehr zuverlässig und verantwortungsbewusst in der Erledigung der gestellten Aufgaben und insbesondere bei der Einhaltung von Vorschriften, Anweisungen und Terminen.',
        'Ist zuverlässig und verantwortungsbewusst in der Erledigung gestellter Aufgaben. Vorschriften, Anweisungen und Termine werden eingehalten.',
        'Übertragene Aufgaben werden im Allgemeinen zuverlässig durchgeführt. In der Regel werden Vorschriften, Anweisungen und Termine eingehalten.',
        'Zuverlässigkeit lässt zu wünschen übrig. Vorschriften und Anweisungen werden oft nicht ausreichend beachtet. Es gibt Schwierigkeiten bei der Einhaltung von Terminen.',
        'Vorschriften und Anweisungen werden nur ungenügend beachtet. Ist nicht zuverlässig bei der Einhaltung von Terminen.',
        'Vorschriften und Anweisungen werden nicht beachtet. Hält Termine nicht ein.',
      ] },
    { key: 'fertigkeiten', block: 'C', label: 'Fertigkeiten',
      beschreibung: 'Verfügen über die für den Ausbildungsprozess bzw. Ausbildungsabschnitt geforderten Fertigkeiten',
      stufen: [
        'Verfügt über einen sehr hohen Fertigkeitsgrad. Führt die übertragenen Tätigkeiten mit großer Geschicklichkeit durch.',
        'Verfügt über einen hohen Fertigkeitsgrad. Arbeitet sicher und geschickt.',
        'Die Fertigkeiten ermöglichen eine zufriedenstellende Arbeitsausführung. Ist selten unsicher.',
        'Der erforderliche Fertigkeitsgrad wird nicht immer erreicht. Die Arbeitsausführung wird dadurch erschwert.',
        'Kann die Anforderungen an Fertigkeiten kaum erfüllen. Ist bei vielen Tätigkeiten unsicher und ungeschickt.',
        'Kann die Anforderungen an Fertigkeiten nicht erfüllen. Ist bei allen Tätigkeiten unsicher und ungeschickt.',
      ] },
    { key: 'kenntnisse', block: 'C', label: 'Kenntnisse',
      beschreibung: 'Verfügen über die für den Ausbildungsprozess bzw. Ausbildungsabschnitt geforderten Kenntnisse',
      stufen: [
        'Verfügt über besonders umfangreiche Fachkenntnisse und erkennt sicher Zusammenhänge.',
        'Verfügt über umfangreiche Fachkenntnisse. Kann Zusammenhänge herstellen.',
        'Besitzt die erforderlichen Fachkenntnisse, um die übertragenen Aufgaben zufriedenstellend ausführen zu können.',
        'Die erforderlichen Fachkenntnisse sind nicht immer vorhanden. Fehlendes Wissen erschwert den Arbeitsablauf und damit auch den Ausbildungsablauf.',
        'Verfügt kaum über die erforderlichen Fachkenntnisse. Ist häufig auf Erklärungen, Hilfen und Ratschläge angewiesen.',
        'Erforderliche Fachkenntnisse sind nicht vorhanden. Ist ständig auf Erklärungen, Hilfe und Ratschläge angewiesen.',
      ] },
    { key: 'sorgfalt', block: 'C', label: 'Sorgfalt',
      beschreibung: 'Fähigkeiten, die im jeweiligen durchzuführenden Aufgaben planmäßig und sorgfältig, den Qualitätsanforderungen entsprechend auszuführen',
      stufen: [
        'Arbeitet stets planvoll und mit großer Sorgfalt. Arbeitsergebnisse liegen immer im Bereich der Qualitätsanforderungen.',
        'Arbeitet planvoll. Ist sorgfältig in der Arbeitsausführung. Arbeitsergebnisse liegen nur selten außerhalb der gestellten Qualitätsanforderungen.',
        'Es wird im Allgemeinen planvoll und sorgfältig gearbeitet. Arbeitsergebnisse liegen zum größten Teil im Bereich der Qualitätsanforderungen.',
        'Planmäßigkeit und Sorgfalt bei der Arbeitsausführung lassen zu wünschen übrig. Arbeitsergebnisse entsprechen häufig nicht den gestellten Qualitätsanforderungen.',
        'Übertragene Aufgaben werden nicht planvoll und sorgfältig durchgeführt. Erreicht kein ausreichendes Arbeitsergebnis.',
        'Übertragene Aufgaben werden nachlässig und unvollständig durchgeführt. Erzielt nur ungenügende Arbeitsergebnisse.',
      ] },
    { key: 'lerntempo', block: 'C', label: 'Lerntempo / Zeitaufwand',
      beschreibung: 'Zeit, die – unter Berücksichtigung des Ausbildungsstandes – für den Erwerb von Fertigkeiten und Kenntnissen bzw. zur Erledigung gestellter Aufgaben benötigt wird',
      stufen: [
        'Fertigkeiten werden besonders rasch beherrscht. Das Lerntempo ist außerordentlich hoch. Gestellte Aufgaben werden immer schneller erledigt, als der Ausbildungsstand erwarten lässt.',
        'Fertigkeiten werden rasch beherrscht. Das Lerntempo ist hoch. Gestellte Aufgaben werden häufig schneller erledigt, als der Ausbildungsstand erwarten lässt.',
        'Fertigkeiten werden nach Übung beherrscht. Das Lerntempo ist ausreichend. Gestellte Aufgaben werden in einer dem Ausbildungsstand angemessenen Zeit bewältigt.',
        'Fertigkeiten werden meist erst nach längerer Übung beherrscht. Das Lerntempo ist nicht immer ausreichend. Benötigt für die gestellten Aufgaben meist mehr Zeit als vorgesehen.',
        'Fertigkeiten werden auch nach längerer Übung kaum beherrscht. Das Lerntempo ist gering. Kommt bei der Ausführung gestellter Aufgaben mit der vorhergesehenen Zeit nicht aus.',
        'Fertigkeiten werden auch nach längerer Übung nicht beherrscht. Das Lerntempo ist sehr gering. Die für die Aufgabe übliche Bearbeitungszeit wird stets überschritten.',
      ] },
  ];

  const BLOCK_LABELS = { A: 'Persönliche Kompetenz', B: 'Soziale Kompetenz', C: 'Fachkompetenz' };
  const BLOECKE = { A: { label: BLOCK_LABELS.A, keys: [] }, B: { label: BLOCK_LABELS.B, keys: [] }, C: { label: BLOCK_LABELS.C, keys: [] } };
  KRITERIEN.forEach(k => BLOECKE[k.block].keys.push(k.key));

  const STUFEN = [
    { stufe: 1, min: 92, max: 100, verbal: 'sehr gut' },
    { stufe: 2, min: 81, max: 91,  verbal: 'gut' },
    { stufe: 3, min: 67, max: 80,  verbal: 'befriedigend' },
    { stufe: 4, min: 50, max: 66,  verbal: 'ausreichend' },
    { stufe: 5, min: 30, max: 49,  verbal: 'mangelhaft' },
    { stufe: 6, min: 0,  max: 29,  verbal: 'ungenügend' },
  ];

  // Index = Punkte 0..100 → Schulnote. Quelle: Spec §4.3 (verifiziert).
  const PUNKTE_ZU_NOTE = [
    6.0,6.0,6.0,6.0,6.0,6.0,5.9,5.9,5.9,5.9, // 0–9
    5.9,5.9,5.8,5.8,5.8,5.8,5.8,5.7,5.7,5.7, // 10–19
    5.7,5.7,5.7,5.6,5.6,5.6,5.6,5.6,5.6,5.5, // 20–29
    5.4,5.4,5.3,5.3,5.2,5.2,5.1,5.1,5.0,5.0, // 30–39
    5.0,4.9,4.9,4.8,4.8,4.7,4.7,4.6,4.6,4.5, // 40–49
    4.4,4.4,4.3,4.3,4.2,4.1,4.1,4.0,4.0,3.9, // 50–59
    3.9,3.8,3.7,3.7,3.6,3.6,3.5,3.4,3.3,3.3, // 60–69
    3.2,3.1,3.1,3.0,2.9,2.9,2.8,2.7,2.7,2.6, // 70–79
    2.5,2.4,2.3,2.2,2.1,2.0,2.0,1.9,1.8,1.7, // 80–89
    1.6,1.5,1.4,1.4,1.3,1.3,1.2,1.2,1.1,1.1,1.0, // 90–100
  ];

  function clampPunkte(p) { p = Math.round(Number(p) || 0); return p < 0 ? 0 : (p > 100 ? 100 : p); }
  function stufeFuerPunkte(p) { p = clampPunkte(p); for (const s of STUFEN) if (p >= s.min) return s.stufe; return 6; }
  function noteFuerPunkte(p) { return PUNKTE_ZU_NOTE[clampPunkte(p)]; }

  // punkteByKey: { key: number|null }. Block-Ø über die FESTE Kriterienzahl.
  function berechne(punkteByKey) {
    punkteByKey = punkteByKey || {};
    const bloecke = {};
    let vollstaendig = true;
    for (const b of ['A', 'B', 'C']) {
      const keys = BLOECKE[b].keys;
      let sum = 0;
      for (const key of keys) {
        const v = punkteByKey[key];
        if (v === null || v === undefined || v === '' || isNaN(Number(v))) { vollstaendig = false; }
        else sum += clampPunkte(v);
      }
      bloecke[b] = keys.length ? sum / keys.length : 0;
    }
    const summe = bloecke.A + bloecke.B + bloecke.C;
    const gesamt = summe / 3;
    const note = vollstaendig ? noteFuerPunkte(Math.round(gesamt)) : null;
    return { bloecke, summe, gesamt, note, vollstaendig };
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmtNote(n) { return n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  // Zeichnet EIN Kriterium (Zeile): 6 Stufen-Radios + Punkte-Feld, gekoppelt.
  function kriteriumRowHtml(k, punkte, editable) {
    const dis = editable ? '' : 'disabled';
    const st = STUFEN.map(s =>
      `<label class="beurt-stufe" title="${esc(s.verbal)} (${s.max}–${s.min})">
         <input type="radio" name="stufe_${k.key}" value="${s.stufe}" ${dis}>
         <span>${s.stufe}</span></label>`).join('');
    return `
      <tr class="beurt-row" data-key="${k.key}">
        <th class="beurt-row__krit"><span class="beurt-row__label">${esc(k.label)}</span></th>
        <td class="beurt-row__stufen">${st}</td>
        <td class="beurt-row__pkt">
          <input type="number" min="0" max="100" step="1" class="beurt-pkt-input"
                 data-key="${k.key}" value="${(punkte ?? '') === '' ? '' : esc(punkte)}" ${dis} aria-label="Punkte ${esc(k.label)}">
        </td>
      </tr>`;
  }

  function blockHtml(block, punkteByKey, editable) {
    const rows = BLOECKE[block].keys.map(key => {
      const k = KRITERIEN.find(x => x.key === key);
      return kriteriumRowHtml(k, punkteByKey[key], editable);
    }).join('');
    return `
      <tbody class="beurt-block" data-block="${block}">
        <tr class="beurt-block__head"><th colspan="3">${block} · ${esc(BLOCK_LABELS[block])}</th></tr>
        ${rows}
        <tr class="beurt-block__sum"><th colspan="2">Summe Punkte : Anzahl Kriterien (${BLOECKE[block].keys.length})</th>
            <td class="beurt-block__avg" data-block-avg="${block}">0,0</td></tr>
      </tbody>`;
  }

  function renderForm(container, opts) {
    const o = opts || {};
    const editable = !!o.editable;
    const punkteByKey = Object.assign({}, o.punkteByKey || {});
    const kopf = o.kopf || {};
    const dis = editable ? '' : 'disabled';

    container.innerHTML = `
      <div class="beurt">
        <div class="beurt__kopf">
          <div><span class="beurt__label">Name, Vorname</span><div class="beurt__val">${esc(kopf.name)}</div></div>
          <div><span class="beurt__label">Abteilung</span><div class="beurt__val">${esc(kopf.abteilung)}</div></div>
          <div><span class="beurt__label">Zeitraum</span><div class="beurt__val">${esc(kopf.zeitraum)}</div></div>
          <div><span class="beurt__label">Beurteilende/-r</span><div class="beurt__val">${esc(kopf.beurteilende)}</div></div>
          <div><span class="beurt__label">Ausbildungs-/Studienberuf</span><div class="beurt__val">${esc(kopf.beruf)}</div></div>
          <button type="button" class="btn btn--ghost beurt__katalog-btn" id="beurtKatalogBtn">Kriterienkatalog</button>
        </div>
        <table class="beurt-table">
          <thead><tr><th>Beurteilungskriterien</th>
            <th>Beurteilungsstufen<br><span class="beurt-th-sub">1&nbsp;=&nbsp;100–92 … 6&nbsp;=&nbsp;29–0</span></th>
            <th>Punkte</th></tr></thead>
          ${blockHtml('A', punkteByKey, editable)}
          ${blockHtml('B', punkteByKey, editable)}
          ${blockHtml('C', punkteByKey, editable)}
        </table>
        <div class="beurt-fuss">
          <div><span>Summe (ØA + ØB + ØC)</span><b data-fuss="summe">0,0</b></div>
          <div><span>Beurteilungspunkte ÷ 3 = Gesamt</span><b data-fuss="gesamt">0,0</b></div>
          <div class="beurt-fuss__note"><span>Note</span><b data-fuss="note">–</b></div>
        </div>
        <div class="beurt-indiv">
          <label class="beurt__label" for="beurtIndiv">Individuelle Beurteilung</label>
          <textarea id="beurtIndiv" rows="6" ${dis}>${esc(o.individuell || '')}</textarea>
        </div>
        <div class="beurt-gespraech">
          <label class="beurt__label" for="beurtGespraech">Beurteilungsgespräch geführt am</label>
          <input type="date" id="beurtGespraech" value="${esc(o.gespraechAm || '')}" ${dis}>
        </div>
      </div>`;

    // Initiale Stufen-Markierung aus vorhandenen Punkten.
    KRITERIEN.forEach(k => {
      const p = punkteByKey[k.key];
      if (p !== '' && p != null && !isNaN(Number(p))) markStufe(k.key, stufeFuerPunkte(p));
    });

    function markStufe(key, stufe) {
      container.querySelectorAll(`input[name="stufe_${key}"]`).forEach(r => { r.checked = (Number(r.value) === stufe); });
    }
    function currentPunkte() {
      const map = {};
      container.querySelectorAll('.beurt-pkt-input').forEach(inp => {
        const v = inp.value === '' ? null : clampPunkte(inp.value);
        map[inp.dataset.key] = v;
      });
      return map;
    }
    function refresh() {
      const map = currentPunkte();
      const r = berechne(map);
      for (const b of ['A', 'B', 'C']) {
        const el = container.querySelector(`[data-block-avg="${b}"]`); if (el) el.textContent = fmt1(r.bloecke[b]);
      }
      container.querySelector('[data-fuss="summe"]').textContent = fmt1(r.summe);
      container.querySelector('[data-fuss="gesamt"]').textContent = fmt1(r.gesamt);
      container.querySelector('[data-fuss="note"]').textContent = fmtNote(r.note);
    }

    if (editable) {
      // Punkte-Eingabe -> Stufe automatisch markieren + neu rechnen.
      container.querySelectorAll('.beurt-pkt-input').forEach(inp => {
        inp.addEventListener('input', () => {
          if (inp.value !== '') { inp.value = String(clampPunkte(inp.value)); markStufe(inp.dataset.key, stufeFuerPunkte(inp.value)); }
          refresh();
        });
      });
      // Stufe klicken -> Punkte in den Bandbereich ziehen (nur wenn außerhalb), dann rechnen.
      container.querySelectorAll('.beurt-stufe input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
          const key = radio.name.slice('stufe_'.length);
          const stufe = Number(radio.value);
          const band = STUFEN.find(s => s.stufe === stufe);
          const inp = container.querySelector(`.beurt-pkt-input[data-key="${key}"]`);
          const cur = inp.value === '' ? null : clampPunkte(inp.value);
          if (cur == null || cur < band.min || cur > band.max) inp.value = String(band.max); // Bandobergrenze als Default
          refresh();
        });
      });
    }
    refresh();

    document.getElementById('beurtKatalogBtn')?.addEventListener('click', openKatalogModal);

    return {
      refresh,
      getState() {
        return {
          kriterien: KRITERIEN.map(k => ({ kriteriumKey: k.key, punkte: currentPunkte()[k.key] }))
                              .filter(x => x.punkte != null),
          individuelleBeurteilung: (document.getElementById('beurtIndiv')?.value || ''),
          gespraechAm: (document.getElementById('beurtGespraech')?.value || ''),
        };
      },
    };
  }

  function openKatalogModal() {
    let ov = document.getElementById('beurtKatalogModal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'beurtKatalogModal';
      ov.className = 'modal-overlay';
      const blocks = ['A', 'B', 'C'].map(b => `
        <h3>${b} · ${esc(BLOCK_LABELS[b])}</h3>
        ${BLOECKE[b].keys.map(key => {
          const k = KRITERIEN.find(x => x.key === key);
          return `<div class="katalog-krit"><b>${esc(k.label)}</b><div class="katalog-krit__desc">${esc(k.beschreibung)}</div>
            <ol class="katalog-krit__stufen">${k.stufen.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
        }).join('')}`).join('');
      ov.innerHTML = `<div class="modal modal--lg"><div class="modal__head"><h2>Kriterienkatalog</h2>
        <button class="modal__close" type="button" data-modal-close aria-label="Schließen">×</button></div>
        <div class="modal__body beurt-katalog">${blocks}</div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-modal-close]')) ov.classList.remove('open'); });
    }
    ov.classList.add('open');
  }

  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, berechne, renderForm, openKatalogModal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node/Tests/Backend
  root.Beurteilung = Object.assign(root.Beurteilung || {}, api);             // Browser
})(typeof window !== 'undefined' ? window : globalThis);
