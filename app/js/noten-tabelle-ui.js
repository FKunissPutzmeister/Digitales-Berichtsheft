/* ===================================================================
   NOTEN-TABELLE-UI.JS — „Notenspiegel"
   Alle Noten einer Person in EINER flachen Tabelle: das Fach als Spalte,
   der Zeitraum als Zwischenkopf mit Ø und Credit-Summe. Filterbar auf
   einen Zeitraum, druckbar als A4-Blatt (app/js/noten-druck.js).

   Wie noten-ui.js von ZWEI Shells benutzt, weil DH-Studenten keine
   Sidebar haben:
     app/js/noten-tabelle.js      → Azubi- und Ausbilder-Ansicht
     app/js/dh-noten-tabelle.js   → DH-Shell

   Abgrenzung zu noten-ui.js: das ist die PFLEGE-Ansicht (anlegen,
   bearbeiten, Belege), das hier die LESE-Ansicht. Deshalb gibt es hier
   keinen einzigen Schreibpfad — auch nicht für den Eigentümer.

   Die Zeilen selbst kommen aus noten-core.js (tabellenZeilen /
   tabellenSpalten). Diese Datei formatiert nur, und zellText() unten ist
   die einzige Stelle, an der Zellinhalte entstehen — das Druckblatt ruft
   dieselbe Funktion auf.

   Re-entrant: der SPA-Router führt Seiten-Scripts beim zweiten Besuch
   erneut in new Function() aus, deshalb liegt der Zustand in start().
   =================================================================== */
(function (global) {
  'use strict';

  const N = global.Noten;
  const esc = global.escapeHtml;
  const ALLE = 'alle';

  const fmtDatum = (iso) => (iso ? DateUtil.formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

  /* Zellinhalt je Spalte — EINE Stelle für alle acht Spalten, damit auf dem
     Papier nichts anders formatiert ist als auf dem Bildschirm. Gibt reinen
     Text zurück (keine Auszeichnung): der Bildschirm hängt Klassen an, das
     A4-Blatt nicht, und beide sollen dieselben Zeichen zeigen.

     Das Sternchen an einem Fach mit zaehltInSchnitt=false gehört hierher
     und nicht in den Renderer: ohne die Fußnote sähe der Ø der Kopfzeile
     falsch aus, und diese Erklärung darf auf keinem der beiden Wege
     verlorengehen. */
  function zellText(spalteId, z) {
    switch (spalteId) {
      case 'fach':    return (z.fach || '') + (z.zaehltInSchnitt ? '' : ' *');
      case 'titel':   return z.titel || '';
      case 'art':     return (N.artById(z.art) || {}).label || z.art || '';
      case 'datum':   return fmtDatum(z.datum);
      case 'note':    return z.noteText;
      case 'punkte':  return (z.punkte === null || z.punkte === undefined) ? '' : N.formatPunkte(z.punkte);
      case 'credits': return (z.credits === null || z.credits === undefined) ? '' : N.formatCredits(z.credits);
      case 'status':  return z.status ? N.statusLabel(z.status) : '';
      default:        return '';
    }
  }

  /* Kopfzeile eines Zeitraums: "SoSe 2026 · Ø 1,82 · 5 Noten · 33,0 Credits".
     Die Anzahl steht dabei, damit der Ø nachrechenbar ist. */
  function kennzahlen(g, mitCredits) {
    const teile = [];
    teile.push(g.schnitt === null || g.schnitt === undefined
      ? 'keine Note'
      : `Ø ${N.formatNote(g.schnitt)} · ${g.anzahlNoten} ${g.anzahlNoten === 1 ? 'Note' : 'Noten'}`);
    if (mitCredits) teile.push(`${N.formatCredits(g.credits)} Credits`);
    return teile.join(' · ');
  }

  const gruppenTitel = (g) => (g.label === null ? 'Ohne Zeitraum' : g.label);

  /* Eine durchgehende Tabelle, der Zeitraum als Zeile über die ganze
     Breite. Bewusst nicht eine Tabelle je Zeitraum: dann wanderten die
     Spaltenbreiten von Block zu Block, und genau das soll eine flache
     Tabelle nicht tun. */
  function tabelleHtml(spalten, gruppen) {
    const mitCredits = spalten.some(s => s.id === 'credits');
    /* Sobald EIN Fach der Tabelle eine Farbe hat, bekommt jede Fach-Zelle
       den Platz für den Punkt — auch die farblosen. Sonst beginnt der
       Fachname in einer farblosen Zeile 17 px weiter links als in den
       anderen, und die Spalte franst links aus (auf dem Bildschirm
       gesehen: die Zeile "Zeugnisse" stand ausgerückt zwischen den
       farbigen). Hat kein Fach eine Farbe, entfällt der Platz ganz. */
    const mitFarben = gruppen.some(g => g.zeilen.some(z => N.istHexFarbe(z.farbe)));
    const kopf = spalten.map(s =>
      `<th class="noten-spiegel__${s.ausricht}">${esc(s.label)}</th>`).join('');

    const koerper = gruppen.map(g => {
      const kopfzeile = `<tr class="noten-spiegel__zeitraum">
          <th colspan="${spalten.length}" scope="colgroup">
            <span class="noten-spiegel__zeitraum-name">${esc(gruppenTitel(g))}</span>
            <span class="noten-spiegel__zeitraum-zahlen">${esc(kennzahlen(g, mitCredits))}</span>
          </th></tr>`;
      // data-spalte: erlaubt spaltenweises CSS (das Datum darf nicht
      // umbrechen) und macht die Tabelle in Tests adressierbar.
      const zeilen = g.zeilen.map(z => `<tr${z.zaehltInSchnitt ? '' : ' class="noten-spiegel__aus"'}>${
        spalten.map(s => `<td class="noten-spiegel__${s.ausricht}" data-spalte="${s.id}">${
          s.id === 'fach' && mitFarben ? farbPunkt(z.farbe) : ''}${esc(zellText(s.id, z))}</td>`).join('')
      }</tr>`).join('');
      return kopfzeile + zeilen;
    }).join('');

    return `<table class="noten-spiegel">
        <thead><tr>${kopf}</tr></thead>
        <tbody>${koerper}</tbody>
      </table>`;
  }

  const hatFussnote = (gruppen) => gruppen.some(g => g.zeilen.some(z => !z.zaehltInSchnitt));

  /* Farbe des Fachs als kleiner Punkt vor dem Namen — in einer flachen
     Tabelle wiederholt sich derselbe Fachname über viele Zeilen, und der
     Punkt bindet sie sichtbar zusammen.

     BEWUSST hier und nicht in zellText(): das A4-Blatt ruft dieselbe
     Funktion auf und soll schwarzweiß bleiben. Die Farbe geht in ein
     style-Attribut, deshalb nur über N.istHexFarbe. */
  function farbPunkt(farbe) {
    // Ohne Farbe ein LEERER Punkt: er hält die Spalte in der Reihe,
    // ohne etwas zu behaupten.
    if (!N.istHexFarbe(farbe)) {
      return '<span class="noten-spiegel__punkt noten-spiegel__punkt--leer" aria-hidden="true"></span>';
    }
    return `<span class="noten-spiegel__punkt" aria-hidden="true" style="background: ${farbe}"></span>`;
  }

  /* ── Seite ────────────────────────────────────────────────────────
     opts:
       user         – der eingeloggte Nutzer
       host         – Container (#mainContent)
       mitAzubiWahl – true in der Sidebar-Shell (Ausbilder wählen die Person)
       zurueckHref  – Ziel des Zurück-Knopfes (Pflegeansicht der Shell)
  */
  async function start(opts) {
    const { user, host } = opts;
    const mitAzubiWahl = opts.mitAzubiWahl !== false;
    const zurueckBasis = opts.zurueckHref || 'noten.html';

    const nurEigene = !mitAzubiWahl || (!!user.istAzubi && !user.istAusbilder && !user.istAusbildungsleiter);

    const url = new URLSearchParams(location.search);
    let azubis = [];
    let viewAzubiId = user.oid;
    let daten = null;
    // Filterzustand: ALLE oder eine Abschnitt-Id. Der Wunsch war eine
    // Übersicht — also beginnt sie bei allen Zeiträumen.
    let filter = ALLE;

    if (!nurEigene) {
      try {
        azubis = await DB.getNotenAzubis();
      } catch (e) {
        azubis = [];
      }
      const ausUrl = url.get('azubi');
      const gemerkt = ausUrl || getPersistedAzubiId();
      if (gemerkt && azubis.some(a => a.oid === gemerkt)) viewAzubiId = gemerkt;
      else if (azubis.length && !azubis.some(a => a.oid === user.oid)) viewAzubiId = azubis[0].oid;
    }

    // ?abschnitt=<id> erlaubt den Direkteinstieg in einen Zeitraum.
    const ausUrlAbschnitt = Number(url.get('abschnitt'));
    if (Number.isFinite(ausUrlAbschnitt) && ausUrlAbschnitt > 0) filter = ausUrlAbschnitt;

    /* Die Person, um deren Noten es geht. Wer selbst schreibt, ist sie
       selbst; sonst kommt sie aus der Liste der betreuten Azubis. */
    function person() {
      const eigen = viewAzubiId === user.oid;
      const eintrag = azubis.find(a => a.oid === viewAzubiId);
      return {
        name: displayName((eigen ? user.name : (eintrag && eintrag.name)) || ''),
        // Beruf steht am eigenen Nutzer und (seit dieser Ansicht) in der
        // Azubi-Liste. Fehlt er, bleibt die Zeile weg statt leer zu stehen.
        beruf: (eigen ? (user.beruf || user.studiengang) : (eintrag && eintrag.beruf)) || '',
        // Rolle des EIGENTÜMERS, nicht des Betrachters: sie entscheidet über
        // die Spalten. Ein Ausbilder, der einen DH-Studenten ansieht, muss
        // Credits und Status sehen — mit user.role wäre die Tabelle falsch.
        rolle: (eintrag && eintrag.role) || (eigen ? user.role : null) || rolleAusDaten(),
      };
    }

    /* Rückfall, wenn keine Liste vorliegt: die Zeitraum-TYPEN verraten die
       Rolle, weil ein Azubi nur Ausbildungsjahre und ein Student nur
       Semester anlegen kann (pruefeAbschnitt in noten-core.js). */
    function rolleAusDaten() {
      const typen = ((daten && daten.abschnitte) || []).map(a => a.typ);
      return typen.some(t => t === 'sose' || t === 'wise') ? 'dhstudent' : 'azubi';
    }

    async function ladeDaten() {
      daten = await DB.getNoten(viewAzubiId === user.oid ? null : viewAzubiId);
    }

    function render() {
      const p = person();
      // Ungefiltert, denn daraus entsteht die Auswahlliste: nur Zeiträume,
      // in denen wirklich etwas steht, sind wählbar.
      const alleGruppen = N.tabellenZeilen(daten.abschnitte, daten.ordner);
      const gueltig = filter === ALLE || alleGruppen.some(g => g.id === filter);
      if (!gueltig) filter = ALLE;

      const gruppen = filter === ALLE
        ? alleGruppen
        : N.tabellenZeilen(daten.abschnitte, daten.ordner, { abschnittId: filter });
      const spalten = N.tabellenSpalten(p.rolle, gruppen);

      const zurueckZiel = (!nurEigene && viewAzubiId !== user.oid)
        ? `${zurueckBasis}?azubi=${encodeURIComponent(viewAzubiId)}`
        : zurueckBasis;

      // Auswahlliste: nur Zeiträume mit Inhalt. Die Auffanggruppe (Fächer
      // ohne Zeitraum) steht bewusst NICHT darin — sie hat keine Id, und
      // über „Alle Zeiträume" ist sie erreichbar.
      const optionen = [`<option value="${ALLE}"${filter === ALLE ? ' selected' : ''}>Alle Zeiträume</option>`]
        .concat(alleGruppen.filter(g => g.id !== null).map(g =>
          `<option value="${g.id}"${filter === g.id ? ' selected' : ''}>${esc(g.label)}</option>`))
        .join('');

      const wahl = (!nurEigene && azubis.length)
        ? renderAzubiSelect(azubis.map(a => ({ id: a.oid, name: displayName(a.name) })), viewAzubiId)
        : '';

      /* Filterleiste und Tabelle stehen in EINER Karte, und das ist keine
         Kosmetik: Texte außerhalb der Karte färben mehrere Themes selbst
         ein (papier setzt .page-title/.page-subtitle auf Gold, weil dort
         der Seitengrund fast schwarz ist). Ein eigenes Label mit
         --pm-grey-700 lag dort dunkelbraun auf dunkel — gemessen 2,19:1.
         Auf der Kartenfläche gilt dagegen in jedem Theme dieselbe
         Token-Wahrheit. Zweiter Grund: der Filter gehört sichtbar zu der
         Tabelle, die er filtert.

         Ohne Zeitraum gibt es weder Tabelle noch Leiste — nur den Satz.
         Ein Filter mit einer einzigen Option und ein gesperrter
         Drucken-Knopf wären dort reine Kulisse. */
      const untertitel = (!nurEigene && viewAzubiId !== user.oid)
        ? `Alle eingetragenen Noten von ${esc(p.name)} in einer Tabelle.`
        : 'Alle deine eingetragenen Noten in einer Tabelle – zum Ansehen und Ausdrucken.';

      host.innerHTML = `
        <div class="page-header">
          <div class="page-header__left">
            <a class="btn btn-ghost btn-sm" href="${esc(zurueckZiel)}">← Noten &amp; Zeugnisse</a>
            <h1 class="page-title">Notenspiegel</h1>
            <p class="page-subtitle">${untertitel}</p>
          </div>
        </div>
        ${wahl}
        ${gruppen.length ? `<div class="card">
            <div class="card__body">
              <div class="noten-spiegel-leiste">
                <label class="noten-spiegel-leiste__label" for="notenSpiegelFilter">Zeitraum:</label>
                <select class="form-control" id="notenSpiegelFilter">${optionen}</select>
                <button type="button" class="btn btn-primary" id="notenSpiegelDruck">
                  ${Icon('print', { size: 18 })} Drucken / als PDF speichern</button>
              </div>
              <div class="noten-tabelle-wrap">${tabelleHtml(spalten, gruppen)}</div>
              ${hatFussnote(gruppen)
                ? `<p class="noten-spiegel__fussnote">* Dieses Fach zählt nicht in den Durchschnitt.</p>`
                : ''}
            </div>
          </div>`
        : `<p class="noten-leer">Hier erscheinen die Noten, sobald welche eingetragen sind.</p>`}`;

      binde(p, spalten, gruppen);
    }

    function binde(p, spalten, gruppen) {
      const auswahl = document.getElementById('notenSpiegelFilter');
      if (auswahl) auswahl.addEventListener('change', (e) => {
        const v = e.target.value;
        filter = v === ALLE ? ALLE : Number(v);
        render();
      });

      const druck = document.getElementById('notenSpiegelDruck');
      if (druck) druck.addEventListener('click', () => {
        NotenDruck.oeffne({
          person: p,
          auswahl: filter === ALLE ? 'Alle Zeiträume' : (gruppen[0] ? gruppenTitel(gruppen[0]) : ''),
          spalten, gruppen,
          zellText,
          kennzahlen: (g) => kennzahlen(g, spalten.some(s => s.id === 'credits')),
          gruppenTitel,
          fussnote: hatFussnote(gruppen),
        });
      });

      const select = document.getElementById('azubiSelect');
      if (select) select.addEventListener('change', async (e) => {
        viewAzubiId = e.target.value;
        setPersistedAzubiId(viewAzubiId);
        // Der Filter gilt für die vorige Person — deren Zeitraum-Ids
        // bedeuten bei der neuen nichts.
        filter = ALLE;
        await ladeDaten();
        render();
      });

      // PMSelect verschönert neue <select> über einen MutationObserver in
      // app.js; defensiv anstoßen (idempotent über data-pm-enhanced).
      if (global.PMSelect && global.PMSelect.enhance) global.PMSelect.enhance();
    }

    await ladeDaten();
    render();
  }

  global.NotenTabelleUI = { start, zellText, tabelleHtml, kennzahlen, gruppenTitel };
})(window);
