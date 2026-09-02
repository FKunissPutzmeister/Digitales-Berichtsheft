// ============================================================
// Noten & Zeugnisse — Kernlogik
// Design-Spec: docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
//
// Shell-agnostisch: läuft im Browser (window.Noten) UND in Node
// (module.exports) — wie app/js/beurteilung-core.js. Das Backend requirt
// diese Datei, damit Arten-Whitelist, Notengrenzen und Validierung genau
// EINE Wahrheit haben (backend/routes/noten.js).
//
// Deshalb darf hier NICHTS auf Top-Level stehen, was nur im Browser oder
// nur in Node existiert: kein document, kein require auf Top-Level.
// beurteilung-core.js wird lazy in noteAusPunkten() aufgelöst.
// ============================================================
(function (root) {
  'use strict';

  // ── Arten eines Eintrags ──────────────────────────────────────────
  // zeigtPunkte: IHK-Punkte gibt es nur bei Prüfungen, nicht bei
  //   Klassenarbeiten (dort steht eine Note auf dem Blatt).
  // mitteilung: löst eine Benachrichtigung an Ausbilder und
  //   Ausbildungsleitung aus. Bei jeder Klassenarbeit zu benachrichtigen
  //   würde die Mitteilungen fluten.
  // Erweiterung dieser Liste = Migration (CK_NotenEintraege_Art).
  const ARTEN = [
    { id: 'klassenarbeit',     label: 'Klassenarbeit',    zeigtNote: true, zeigtPunkte: false, mitteilung: false },
    { id: 'zwischenpruefung',  label: 'Zwischenprüfung',  zeigtNote: true, zeigtPunkte: true,  mitteilung: true  },
    { id: 'abschlusspruefung', label: 'Abschlussprüfung', zeigtNote: true, zeigtPunkte: true,  mitteilung: true  },
    { id: 'semesterpruefung',  label: 'Semesterprüfung',  zeigtNote: true, zeigtPunkte: true,  mitteilung: true  },
    { id: 'zeugnis',           label: 'Zeugnis',          zeigtNote: true, zeigtPunkte: false, mitteilung: true  },
    { id: 'sonstiges',         label: 'Sonstiges',        zeigtNote: true, zeigtPunkte: false, mitteilung: false },
  ];
  const ART_IDS = ARTEN.map(a => a.id);
  const ARTEN_MIT_MITTEILUNG = new Set(ARTEN.filter(a => a.mitteilung).map(a => a.id));

  function artById(id) { return ARTEN.find(a => a.id === id) || null; }

  // ── Grenzen ───────────────────────────────────────────────────────
  const NOTE_MIN = 1.0;
  const NOTE_MAX = 6.0;
  const PUNKTE_MAX = 100;
  const TITEL_MAX = 200;
  const BEMERKUNG_MAX = 1000;
  const ORDNERNAME_MAX = 100;
  // Zeugnisse können älter als der Ausbildungsvertrag sein — deshalb keine
  // Kopplung an Users.AusbildungBeginn, nur eine weite Plausibilität.
  const DATUM_MIN = '2015-01-01';
  const DATUM_ZUKUNFT_TAGE = 30;

  const MAX_BELEG_BYTES = 10 * 1024 * 1024;
  const ERLAUBTE_ENDUNGEN = new Set(['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']);
  // HEIC/HEIF können Edge und Chrome nicht dekodieren. Sie werden trotzdem
  // angenommen (iOS liefert sie über "Dateien durchsuchen"), aber ohne
  // Vorschau — die Kachel zeigt stattdessen den Download-Hinweis.
  const OHNE_VORSCHAU = new Set(['heic', 'heif']);
  const BILD_ENDUNGEN = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
  const MAX_KANTE = 2000; // längste Kante nach clientseitiger Verkleinerung

  /* accept-Attribut für die Datei-Felder, ABGELEITET aus ERLAUBTE_ENDUNGEN —
     sonst laufen Feld und Validierung auseinander. Genau das war der Fall:
     accept stand auf "image/*,application/pdf", iOS ordnet HEIC aber nicht
     immer image/* zu. Eine HEIC-Datei aus der Dateien-App fiel damit schon
     im Auswahlfenster durch, obwohl endungErlaubt() und der Server sie
     annehmen.

     Endungen UND MIME-Typen: iOS filtert das Auswahlfenster nach den
     Endungen, Desktop-Browser zeigen mit den MIME-Typen sprechendere
     Dateitypnamen an. */
  const ACCEPT_BELEG = [...ERLAUBTE_ENDUNGEN].map(e => '.' + e)
    .concat(['image/*', 'application/pdf']).join(',');

  /* Abschnitte = die oberste Gliederungsebene (Migration 046). Zwei Achsen
     in einem Feldpaar (Typ, Nr), weil Azubis und DH-Studenten ihre Zeit
     verschieden zählen:
       ausbildungsjahr -> Nr = 1..4
       sose | wise     -> Nr = Jahr, bei wise das STARTjahr
                          (2025 = "WiSe 2025/26" – so steht es im DUALIS-
                          Notenspiegel, an dem sich die Achse orientiert)
     Erweiterung dieser Liste = Migration (CK_NotenAbschnitte_Typ/_Nr). */
  const ABSCHNITT_TYPEN = ['ausbildungsjahr', 'sose', 'wise'];
  const AJ_NR_MAX = 4;                 // 3,5-jährige Ausbildung -> 4 Jahre
  /* Zwei verschiedene Grenzen, die nicht verwechselt werden dürfen:

     SEMESTER_JAHR_MIN/MAX sind die PLAUSIBILITÄTS-Grenzen des Validators
     (und von CK_NotenAbschnitte_Nr). Sie sagen nur: "ist das überhaupt
     eine denkbare Jahreszahl".

     RUECKBLICK/VORLAUF spannen das ANGEBOT im Dialog auf, relativ zum
     aktuellen Jahr. Das Fenster wandert damit von selbst mit — es muss
     niemand jährlich Semester nachtragen. Drei Jahre zurück decken eine
     ganze Bachelor-Zeit ab, das kommende Semester ist für die Vorplanung
     dabei. Absichtlich RELATIV und nicht "ab 2023 fest": ein fester
     Startpunkt ließe die Liste jedes Jahr um zwei Einträge wachsen. */
  const SEMESTER_JAHR_MIN = 2015;
  const SEMESTER_JAHR_MAX = 2100;
  const SEMESTER_RUECKBLICK = 3;
  const SEMESTER_VORLAUF = 1;

  /* Credits und Status kennt nur der DH-Teil. Die Credit-SUMME eines
     Semesters zählt ausschließlich bestandene Module — im Referenz-
     Notenspiegel ergeben sieben Module 45,0 Credits, angezeigt werden
     33,0: es fehlen genau die 12,0 der noch nicht bewerteten
     Bachelorarbeit. */
  const CREDITS_MAX = 60;              // Modul 5, Bachelorarbeit 12 – 60 ist weit
  const STATUS_WERTE = [
    { id: 'bestanden',       label: 'bestanden',       zaehltCredits: true  },
    { id: 'nicht_bestanden', label: 'nicht bestanden', zaehltCredits: false },
    { id: 'offen',           label: 'offen',           zaehltCredits: false },
  ];
  const STATUS_IDS = STATUS_WERTE.map(s => s.id);
  function statusById(id) { return STATUS_WERTE.find(s => s.id === id) || null; }
  function statusLabel(id) { const s = statusById(id); return s ? s.label : '–'; }

  /* Schulnoten gehen bis 6,0, DHBW-Noten nur bis 5,0. Die Obergrenze hängt
     also an der Rolle, nicht am Feld. */
  function NOTE_MAX_FUER_ROLLE(rolle) { return rolle === 'dhstudent' ? 5.0 : NOTE_MAX; }

  // ── Note / Punkte ─────────────────────────────────────────────────
  function runde2(n) { return Math.round(n * 100) / 100; }

  // Freie Eingabe: "2,3" und "2.3" sind beides gültig, Leerraum wird
  // getrimmt. Alles, was nicht vollständig eine Zahl in 1,0..6,0 ist,
  // ergibt null — bewusst kein Teil-Parsen ("2,3 gut" ist kein Wert).
  function parseNote(wert) {
    if (wert === null || wert === undefined) return null;
    if (typeof wert === 'number') {
      if (!isFinite(wert)) return null;
      const g = runde2(wert);
      return (g >= NOTE_MIN && g <= NOTE_MAX) ? g : null;
    }
    const text = String(wert).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(text)) return null;
    const n = runde2(parseFloat(text));
    return (n >= NOTE_MIN && n <= NOTE_MAX) ? n : null;
  }

  function formatNote(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '–';
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  // maxPunkte optional: ohne Angabe gilt die IHK-Grenze 100. Halbe Punkte
  // sind erlaubt, weil die DUALIS-Tabelle auf einem Halbpunkt-Raster liegt
  // (Note 1,0 bei 100 Punkten beginnt bei 98,5). Feinere Bruchteile nicht —
  // die gibt es in keiner der beiden Tabellen.
  function parsePunkte(wert, maxPunkte) {
    if (wert === null || wert === undefined || wert === '') return null;
    const text = String(wert).trim().replace(',', '.');
    if (!/^\d+(\.[05])?$/.test(text)) return null;
    const p = parseFloat(text);
    const grenze = (maxPunkte === null || maxPunkte === undefined) ? PUNKTE_MAX : Number(maxPunkte);
    return (p >= 0 && p <= grenze) ? p : null;
  }

  // "87,5" bzw. "87" — halbe Punkte deutsch, ganze ohne Nachkomma.
  function formatPunkte(p) {
    if (p === null || p === undefined || isNaN(Number(p))) return '–';
    return Number(p).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  }

  /* ── DHBW / DUALIS ────────────────────────────────────────────────
     Offizielle Punkte-Noten-Tabellen der Dualen Hochschule Baden-
     Württemberg, Studienbereich Wirtschaft, Stand 14.10.2022
     (DUALIS_Punkte-Noten-Tabelle_2022.pdf, vom Auftraggeber geliefert).

     SECHS Maximalpunktzahlen, und dieselbe Punktzahl ergibt je Maximum
     eine andere Note: 60 Punkte sind bei max 100 die Note 3,4, bei
     max 120 aber genau 4,0. Ohne die Maximalpunktzahl ist eine
     Umrechnung deshalb nicht möglich — der Eintrag speichert sie mit
     (dbo.NotenEintraege.MaxPunkte, Migration 045).

     Aufbau je Skala: [minPunkte, Note], ABSTEIGEND nach minPunkte. Die
     Note ist die erste Zeile, deren minPunkte die Punktzahl nicht
     übersteigt. Die Tabelle ist maschinell aus dem PDF erzeugt und
     gegen drei Struktureigenschaften geprüft (noten-core.test.js):
     Notenfolge 1,0..5,0 in 0,1-Schritten, streng fallende Schwellen,
     Note 4,0 bei genau max/2 und die 5,0-Grenze bei max/3. */
  const DHBW_MAXPUNKTE = [60, 90, 100, 120, 150, 180];
  const DHBW_SKALEN = {
    60: [
      [59.5,1.0], [58.5,1.1], [57.5,1.2], [56.5,1.3], [55.5,1.4],
      [54.5,1.5], [53.5,1.6], [52.5,1.7], [51.5,1.8], [50.5,1.9],
      [49.5,2.0], [48.5,2.1], [47.5,2.2], [46.5,2.3], [45.5,2.4],
      [44.5,2.5], [43.5,2.6], [42.5,2.7], [41.5,2.8], [40.5,2.9],
      [39.5,3.0], [38.5,3.1], [37.5,3.2], [36.5,3.3], [35.5,3.4],
      [34.5,3.5], [33.5,3.6], [32.5,3.7], [31.5,3.8], [30.5,3.9],
      [30,4.0], [28.5,4.1], [27.5,4.2], [26.5,4.3], [25.5,4.4],
      [24.5,4.5], [23.5,4.6], [22.5,4.7], [21.5,4.8], [20.5,4.9],
      [0,5.0], // alles unterhalb: nicht bestanden (Tabelle: "X – 20")
    ],
    90: [
      [89,1.0], [87.5,1.1], [86,1.2], [84.5,1.3], [83,1.4],
      [81.5,1.5], [80,1.6], [78.5,1.7], [77,1.8], [75.5,1.9],
      [74,2.0], [72.5,2.1], [71,2.2], [69.5,2.3], [68,2.4],
      [66.5,2.5], [65,2.6], [63.5,2.7], [62,2.8], [60.5,2.9],
      [59,3.0], [57.5,3.1], [56,3.2], [54.5,3.3], [53,3.4],
      [51.5,3.5], [50,3.6], [48.5,3.7], [47,3.8], [45.5,3.9],
      [45,4.0], [42.5,4.1], [41,4.2], [39.5,4.3], [38,4.4],
      [36.5,4.5], [35,4.6], [33.5,4.7], [32,4.8], [30.5,4.9],
      [0,5.0], // alles unterhalb: nicht bestanden (Tabelle: "X – 30")
    ],
    100: [
      [98.5,1.0], [97,1.1], [95.5,1.2], [93.5,1.3], [92,1.4],
      [90.5,1.5], [88.5,1.6], [87,1.7], [85.5,1.8], [83.5,1.9],
      [82,2.0], [80.5,2.1], [78.5,2.2], [77,2.3], [75.5,2.4],
      [73.5,2.5], [72,2.6], [70.5,2.7], [68.5,2.8], [67,2.9],
      [65.5,3.0], [63.5,3.1], [62,3.2], [60.5,3.3], [58.5,3.4],
      [57,3.5], [55.5,3.6], [53.5,3.7], [52,3.8], [50.5,3.9],
      [50,4.0], [47,4.1], [45.5,4.2], [43.5,4.3], [42,4.4],
      [40.5,4.5], [38.5,4.6], [37,4.7], [35.5,4.8], [33.5,4.9],
      [0,5.0], // alles unterhalb: nicht bestanden (Tabelle: "X – 33")
    ],
    120: [
      [118.5,1.0], [116.5,1.1], [114.5,1.2], [112.5,1.3], [110.5,1.4],
      [108.5,1.5], [106.5,1.6], [104.5,1.7], [102.5,1.8], [100.5,1.9],
      [98.5,2.0], [96.5,2.1], [94.5,2.2], [92.5,2.3], [90.5,2.4],
      [88.5,2.5], [86.5,2.6], [84.5,2.7], [82.5,2.8], [80.5,2.9],
      [78.5,3.0], [76.5,3.1], [74.5,3.2], [72.5,3.3], [70.5,3.4],
      [68.5,3.5], [66.5,3.6], [64.5,3.7], [62.5,3.8], [60.5,3.9],
      [60,4.0], [56.5,4.1], [54.5,4.2], [52.5,4.3], [50.5,4.4],
      [48.5,4.5], [46.5,4.6], [44.5,4.7], [42.5,4.8], [40.5,4.9],
      [0,5.0], // alles unterhalb: nicht bestanden (Tabelle: "X – 40")
    ],
    150: [
      [148,1.0], [145.5,1.1], [143,1.2], [140.5,1.3], [138,1.4],
      [135.5,1.5], [133,1.6], [130.5,1.7], [128,1.8], [125.5,1.9],
      [123,2.0], [120.5,2.1], [118,2.2], [115.5,2.3], [113,2.4],
      [110.5,2.5], [108,2.6], [105.5,2.7], [103,2.8], [100.5,2.9],
      [98,3.0], [95.5,3.1], [93,3.2], [90.5,3.3], [88,3.4],
      [85.5,3.5], [83,3.6], [80.5,3.7], [78,3.8], [75.5,3.9],
      [75,4.0], [70.5,4.1], [68,4.2], [65.5,4.3], [63,4.4],
      [60.5,4.5], [58,4.6], [55.5,4.7], [53,4.8], [50.5,4.9],
      [0,5.0], // alles unterhalb: nicht bestanden (Tabelle: "X – 50")
    ],
    180: [
      [177.5,1.0], [174.5,1.1], [171.5,1.2], [168.5,1.3], [165.5,1.4],
      [162.5,1.5], [159.5,1.6], [156.5,1.7], [153.5,1.8], [150.5,1.9],
      [147.5,2.0], [144.5,2.1], [141.5,2.2], [138.5,2.3], [135.5,2.4],
      [132.5,2.5], [129.5,2.6], [126.5,2.7], [123.5,2.8], [120.5,2.9],
      [117.5,3.0], [114.5,3.1], [111.5,3.2], [108.5,3.3], [105.5,3.4],
      [102.5,3.5], [99.5,3.6], [96.5,3.7], [93.5,3.8], [90.5,3.9],
      [90,4.0], [84.5,4.1], [81.5,4.2], [78.5,4.3], [75.5,4.4],
      [72.5,4.5], [69.5,4.6], [66.5,4.7], [63.5,4.8], [60.5,4.9],
      [0,5.0], // alles unterhalb: nicht bestanden (Tabelle: "X – 60")
    ],
  };

  function istDhbwMax(maxPunkte) {
    return DHBW_MAXPUNKTE.includes(Number(maxPunkte));
  }

  // Ohne gültige Maximalpunktzahl gibt es keine Umrechnung — dann trägt
  // der Student seine Note direkt ein.
  function noteAusPunktenDhbw(punkte, maxPunkte) {
    if (!istDhbwMax(maxPunkte)) return null;
    const p = parsePunkte(punkte, Number(maxPunkte));
    if (p === null) return null;
    for (const [ab, note] of DHBW_SKALEN[Number(maxPunkte)]) {
      if (p >= ab) return note;
    }
    return null;
  }

  // Azubis: der bereits verifizierte IHK-Schlüssel aus dem
  // Beurteilungsbogen (app/js/beurteilung-core.js) — eine Tabelle, nicht
  // zwei. Lazy aufgelöst, weil ein Top-Level-require im Browser crasht.
  function beurteilungModul() {
    if (root && root.Beurteilung && root.Beurteilung.PUNKTE_ZU_NOTE) return root.Beurteilung;
    if (typeof require === 'function') return require('./beurteilung-core.js');
    return null;
  }

  // opt = { dh: true, maxPunkte: 60|90|100|120|150|180 } für DH-Studenten,
  // sonst IHK-Schlüssel mit fester Skala 0..100.
  function noteAusPunkten(punkte, opt) {
    if (opt && opt.dh) return noteAusPunktenDhbw(punkte, opt.maxPunkte);
    const p = parsePunkte(punkte);
    if (p === null) return null;
    // Der IHK-Schlüssel ist auf ganze Punkte indiziert; halbe Punkte gibt
    // es in IHK-Prüfungen nicht, ein versehentliches "87,5" darf aber
    // keine erfundene Note ergeben.
    if (!Number.isInteger(p)) return null;
    const B = beurteilungModul();
    if (!B) return null;
    // Absichtlich NICHT B.noteFuerPunkte: das klemmt über clampPunkte auf
    // 0..100. Hier ist die Quelle eine freie Eingabe — parsePunkte hat
    // ungültige Werte schon zu null gemacht, geklemmt wird nichts.
    const n = B.PUNKTE_ZU_NOTE[p];
    return (n === null || n === undefined) ? null : n;
  }

  // ── Abschnitt (Ausbildungsjahr / Semester) ────────────────────────
  /* Ein Ausbildungsjahr 2026 und ein "Semester 3" sind gleichermaßen
     Unsinn — die beiden Wertebereiche dürfen sich nicht vertauschen
     lassen. Spiegelt CK_NotenAbschnitte_Nr aus Migration 046. */
  function abschnittGueltig(typ, nr) {
    const n = Number(nr);
    if (nr === null || nr === undefined || nr === '' || !Number.isInteger(n)) return false;
    if (typ === 'ausbildungsjahr') return n >= 1 && n <= AJ_NR_MAX;
    if (typ === 'sose' || typ === 'wise') return n >= SEMESTER_JAHR_MIN && n <= SEMESTER_JAHR_MAX;
    return false;
  }

  function abschnittLabel(typ, nr) {
    if (!abschnittGueltig(typ, nr)) return null;
    const n = Number(nr);
    if (typ === 'ausbildungsjahr') return `${n}. Ausbildungsjahr`;
    if (typ === 'sose') return `SoSe ${n}`;
    // Ein Wintersemester läuft über den Jahreswechsel: 2025 -> "WiSe 2025/26".
    // Modulo 100 mit führender Null, damit 2099 zu "2099/00" wird und nicht
    // zu "2099/100".
    return `WiSe ${n}/${String((n + 1) % 100).padStart(2, '0')}`;
  }

  /* Chronologischer Sortierschlüssel. Das Wintersemester gehört ZWISCHEN
     die Sommersemester (SoSe 2025 -> WiSe 2025/26 -> SoSe 2026); eine
     Sortierung nach Nr allein würde WiSe 2025/26 vor SoSe 2025 legen. */
  function abschnittSortKey(typ, nr) {
    return Number(nr) * 2 + (typ === 'sose' ? 0 : 1);
  }

  // Jüngster Abschnitt zuerst.
  function sortiereAbschnitte(liste) {
    if (!Array.isArray(liste)) return [];
    return [...liste].sort((a, b) => abschnittSortKey(b.typ, b.nr) - abschnittSortKey(a.typ, a.nr));
  }

  /* Welche Achse darf diese Rolle anlegen? Ausbilder und Admins legen
     nichts an (das darf nur der Eigentümer, siehe backend/services/noten.js);
     sie bekommen die Azubi-Liste, damit die Anzeige nicht leer läuft. */
  function abschnittTypenFuerRolle(rolle) {
    return rolle === 'dhstudent' ? ['sose', 'wise'] : ['ausbildungsjahr'];
  }

  // ── Credits ───────────────────────────────────────────────────────
  // Eine Nachkommastelle, so wie DUALIS sie ausweist ("5,0", "12,0").
  function parseCredits(wert) {
    if (wert === null || wert === undefined || wert === '') return null;
    const text = String(wert).trim().replace(',', '.');
    if (!/^\d{1,3}(\.\d)?$/.test(text)) return null;
    const c = parseFloat(text);
    return (c >= 0 && c <= CREDITS_MAX) ? c : null;
  }

  function formatCredits(c) {
    if (c === null || c === undefined || isNaN(Number(c))) return '–';
    return Number(c).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /* Das "b" der DUALIS-Notenspalte. Es ist KEIN Notenwert, sondern eine
     fehlende Note bei Status "bestanden" — deshalb bleibt Note eine reine
     Zahl und kein Parser muss "b" von "6" unterscheiden. */
  function istBestandenOhneNote(eintrag) {
    const e = eintrag || {};
    return e.status === 'bestanden' && (e.note === null || e.note === undefined);
  }

  /* Der Text der Notenspalte in seinen drei Zuständen: "2,3" · "b" · "–".
     Liegt hier, weil Pflegeansicht, Tabelle und A4-Blatt dieselben drei
     Fälle zeigen müssen — die Oberfläche entscheidet nur noch über die
     Auszeichnung (Klasse, title), nicht mehr über den Text. */
  function noteText(eintrag) {
    if (istBestandenOhneNote(eintrag)) return 'b';
    return formatNote(eintrag ? eintrag.note : null);
  }

  // ── Durchschnitte ─────────────────────────────────────────────────
  function notenVon(eintraege) {
    if (!Array.isArray(eintraege)) return [];
    return eintraege
      .map(e => (e && e.note !== null && e.note !== undefined && !isNaN(Number(e.note))) ? Number(e.note) : null)
      .filter(n => n !== null);
  }

  function anzahlMitNote(eintraege) { return notenVon(eintraege).length; }

  function ordnerSchnitt(eintraege) {
    const noten = notenVon(eintraege);
    if (!noten.length) return null;
    return runde2(noten.reduce((s, n) => s + n, 0) / noten.length);
  }

  /* Ø eines ABSCHNITTS über die Ordner darin. Einen Durchschnitt über die
     gesamte Ausbildung gibt es bewusst nicht mehr (Migration 046): er sagt
     weniger als die Jahres-Ø und verbessert sich irgendwann nicht mehr
     sichtbar.

     EINFACHER Mittelwert über die Einträge, ausdrücklich NICHT
     credit-gewichtet — abgestimmt so entschieden, damit der DH-Teil gleich
     rechnet wie der Azubi-Teil. Einträge ohne Zahlennote (also auch das
     "b" für "bestanden") fallen heraus, nicht als 0 hinein.

     Ordner mit zaehltInSchnitt=false bleiben komplett draußen (typisch ein
     "Zeugnisse"-Ordner, der Noten der Fachordner wiederholt) — ihr
     ORDNER-Ø wird trotzdem angezeigt. */
  function abschnittSchnitt(ordner) {
    if (!Array.isArray(ordner)) return null;
    const noten = ordner
      .filter(o => o && o.zaehltInSchnitt !== false)
      .flatMap(o => notenVon(o.eintraege));
    if (!noten.length) return null;
    return runde2(noten.reduce((s, n) => s + n, 0) / noten.length);
  }

  /* Die Anzahl hinter dem Ø ("Ø 2,0 · 5 Noten"). Sie MUSS dieselbe
     Filterung fahren wie abschnittSchnitt: ein Fach mit
     zaehltInSchnitt=false gehört nicht in den Ø und damit auch nicht in
     seine Anzahl. Zählt man dort alle Noten, steht neben einem Ø aus fünf
     Werten die Zahl sieben — und die Zahl ist genau dazu da, den Ø
     nachrechenbar zu machen. */
  function abschnittAnzahlNoten(ordner) {
    if (!Array.isArray(ordner)) return 0;
    return ordner
      .filter(o => o && o.zaehltInSchnitt !== false)
      .reduce((s, o) => s + anzahlMitNote(o.eintraege), 0);
  }

  /* Credit-Summe eines Abschnitts. Nur BESTANDENE Module zählen — die
     Regel steckt in der Summenzeile des Referenz-Notenspiegels: sieben
     Module ergeben 45,0 Credits, ausgewiesen werden 33,0, es fehlen genau
     die 12,0 der Zeile ohne Status. */
  function creditSumme(ordner) {
    if (!Array.isArray(ordner)) return 0;
    const summe = ordner
      .filter(o => o && o.zaehltInSchnitt !== false)
      .flatMap(o => (Array.isArray(o.eintraege) ? o.eintraege : []))
      .filter(e => e && statusById(e.status) && statusById(e.status).zaehltCredits)
      .reduce((s, e) => s + (isNaN(Number(e.credits)) ? 0 : Number(e.credits)), 0);
    return Math.round(summe * 10) / 10;   // gegen Float-Drift bei halben Credits
  }

  // ── Belege ────────────────────────────────────────────────────────
  function endungVon(dateiname) {
    const treffer = /\.([a-z0-9]+)$/i.exec(String(dateiname || ''));
    return treffer ? treffer[1].toLowerCase() : '';
  }
  function endungErlaubt(dateiname) { return ERLAUBTE_ENDUNGEN.has(endungVon(dateiname)); }
  function istBildVorschau(dateiname) {
    const e = endungVon(dateiname);
    return BILD_ENDUNGEN.has(e) && !OHNE_VORSCHAU.has(e);
  }
  function istPdf(dateiname) { return endungVon(dateiname) === 'pdf'; }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    const einheit = b < 1024 * 1024 ? 'KB' : 'MB';
    const wert = b < 1024 * 1024 ? b / 1024 : b / (1024 * 1024);
    return `${wert.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${einheit}`;
  }

  // Verkleinert iPad-Fotos vor dem Upload. Nur im Browser aufrufbar.
  // Gehoben aus dem Verkleinerer in app/js/error-reporter.js (fmSkaliere),
  // aber mit canvas.toBlob() statt toDataURL(): der Base64-Umweg kostet
  // 33 % Größe und einen Riesen-String im iPad-Speicher, und apiUpload()
  // will ohnehin ein File. PDFs werden nie angefasst; HEIC scheitert am
  // Decoder und fällt still auf das Original zurück.
  function verkleinereBild(file, maxKante) {
    const grenze = maxKante || MAX_KANTE;
    return new Promise((resolve) => {
      if (!file || !istBildVorschau(file.name)) { resolve(file); return; }
      if (typeof document === 'undefined' || typeof URL === 'undefined') { resolve(file); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = Math.max(img.width, img.height);
        if (max <= grenze) { URL.revokeObjectURL(url); resolve(file); return; }
        const faktor = grenze / max;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * faktor);
        canvas.height = Math.round(img.height * faktor);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG behält seinen Typ (Transparenz), alles andere wird JPEG.
        const png = endungVon(file.name) === 'png';
        const typ = png ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          const name = png ? file.name : file.name.replace(/\.[a-z0-9]+$/i, '.jpg');
          resolve(new File([blob], name, { type: typ, lastModified: Date.now() }));
        }, typ, 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // z.B. HEIC
      img.src = url;
    });
  }

  // ── Validierung (eine Wahrheit für Frontend und Backend) ──────────
  function normalisiereOrdnerName(name) {
    return String(name === null || name === undefined ? '' : name).replace(/\s+/g, ' ').trim();
  }

  function pruefeOrdnerName(name) {
    const n = normalisiereOrdnerName(name);
    if (!n) return 'Name fehlt.';
    if (n.length > ORDNERNAME_MAX) return `Name darf höchstens ${ORDNERNAME_MAX} Zeichen haben.`;
    return null;
  }

  function istIsoDatum(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text || ''))) return false;
    // Round-Trip: fängt 2026-13-01 und 2026-02-31 ab.
    const d = new Date(`${text}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
  }

  // Gibt die erste Fehlermeldung als Klartext zurück, oder null.
  // Das Backend gibt diese Meldung unverändert als 400 heraus.
  function pruefeEintrag(daten, rolle) {
    const d = daten || {};
    const istDh = rolle === 'dhstudent';
    // Ohne Rolle wird nicht rollenabhängig geprüft (Aufrufer, die sie nicht
    // kennen, sollen nicht fälschlich abgewiesen werden). Das Backend gibt
    // sie immer mit.
    const rolleBekannt = rolle !== null && rolle !== undefined && rolle !== '';

    const titel = String(d.titel === null || d.titel === undefined ? '' : d.titel).trim();
    if (!titel) return 'Titel fehlt.';
    if (titel.length > TITEL_MAX) return `Titel darf höchstens ${TITEL_MAX} Zeichen haben.`;

    if (!d.art) return 'Art fehlt.';
    if (!artById(d.art)) return 'Art ist unbekannt.';

    if (!d.datum) return 'Datum fehlt.';
    if (!istIsoDatum(d.datum)) return 'Datum ist ungültig (Format JJJJ-MM-TT).';
    if (d.datum < DATUM_MIN) return `Datum liegt zu weit zurück (frühestens ${DATUM_MIN}).`;
    const grenze = new Date(Date.now() + DATUM_ZUKUNFT_TAGE * 86400000).toISOString().slice(0, 10);
    if (d.datum > grenze) return 'Datum liegt zu weit in der Zukunft.';

    const noteMax = NOTE_MAX_FUER_ROLLE(rolle);
    if (d.note !== null && d.note !== undefined && d.note !== '') {
      const n = parseNote(d.note);
      if (n === null || n > noteMax) {
        return `Note muss zwischen ${formatNote(NOTE_MIN)} und ${formatNote(noteMax)} liegen.`;
      }
    }
    const hatMax = d.maxPunkte !== null && d.maxPunkte !== undefined && d.maxPunkte !== '';
    if (hatMax && !istDhbwMax(d.maxPunkte)) {
      return `Maximalpunktzahl muss eine der DHBW-Werte sein: ${DHBW_MAXPUNKTE.join(', ')}.`;
    }
    const hatPunkte = d.punkte !== null && d.punkte !== undefined && d.punkte !== '';
    if (hatPunkte) {
      // Punkte sind IHK-Sache. DH-Studenten tragen seit Migration 046 nur
      // noch Note, Credits und Status ein.
      if (rolleBekannt && istDh) return 'Punkte sind für DH-Studenten nicht vorgesehen.';
      const grenze = hatMax ? Number(d.maxPunkte) : PUNKTE_MAX;
      if (parsePunkte(d.punkte, grenze) === null) {
        return `Punkte müssen zwischen 0 und ${grenze} liegen (halbe Punkte erlaubt).`;
      }
    }

    // Credits und Status sind DH-Sache. abschnittTyp/abschnittNr werden
    // NICHT mehr geprüft: der Zeitraum hängt am Ordner, nicht am Eintrag.
    // Ein Body, der die Altfelder noch mitschickt, soll daran nicht
    // scheitern — sie werden schlicht ignoriert.
    const hatCredits = d.credits !== null && d.credits !== undefined && d.credits !== '';
    if (hatCredits) {
      if (rolleBekannt && !istDh) return 'Credits sind nur für DH-Studenten vorgesehen.';
      if (parseCredits(d.credits) === null) {
        return `Credits müssen zwischen 0 und ${CREDITS_MAX} liegen (eine Nachkommastelle).`;
      }
    }
    const hatStatus = d.status !== null && d.status !== undefined && d.status !== '';
    if (hatStatus) {
      if (rolleBekannt && !istDh) return 'Status ist nur für DH-Studenten vorgesehen.';
      if (!statusById(d.status)) return `Status ist unbekannt (erlaubt: ${STATUS_IDS.join(', ')}).`;
    }

    if (d.bemerkung && String(d.bemerkung).length > BEMERKUNG_MAX) {
      return `Bemerkung darf höchstens ${BEMERKUNG_MAX} Zeichen haben.`;
    }
    return null;
  }

  /* Welche Zeiträume soll der Dialog anbieten? Reine Rechnung, deshalb
     hier und nicht in noten-ui.js: so ist das Fenster testbar.

     "jahr" ist das Bezugsjahr (Vorgabe: das laufende) — als Parameter,
     damit ein Test nicht von der Systemuhr abhängt.

     Schon angelegte Zeiträume fallen heraus: ein Eintrag, der beim Klick
     immer 409 liefert, gehört nicht in die Liste. Jüngster zuerst. */
  function abschnittKandidaten(rolle, vorhanden, jahr) {
    const bezug = Number.isInteger(jahr) ? jahr : new Date().getFullYear();
    const typen = abschnittTypenFuerRolle(rolle);
    const kandidaten = [];
    if (typen.includes('ausbildungsjahr')) {
      for (let n = 1; n <= AJ_NR_MAX; n++) kandidaten.push({ typ: 'ausbildungsjahr', nr: n });
    } else {
      for (let j = bezug - SEMESTER_RUECKBLICK; j <= bezug + SEMESTER_VORLAUF; j++) {
        if (j < SEMESTER_JAHR_MIN || j > SEMESTER_JAHR_MAX) continue;
        kandidaten.push({ typ: 'sose', nr: j });
        kandidaten.push({ typ: 'wise', nr: j });
      }
    }
    const belegt = new Set((vorhanden || []).map(a => a.typ + ':' + Number(a.nr)));
    return sortiereAbschnitte(kandidaten).filter(k => !belegt.has(k.typ + ':' + k.nr));
  }

  /* In welchem Semester liegt dieses Datum? DHBW-Grenzen:
       März–August     -> Sommersemester des Jahres
       September–Februar -> Wintersemester; im Januar/Februar ist das
                            STARTjahr das VORjahr (Feb 2026 = WiSe 2025/26)

     Dieselben Monatsgrenzen benutzt die Einmal-Umrechnung in
     db/migrations/046_noten_abschnitte_credits.sql — wer sie hier ändert,
     ändert dort nichts mit. */
  function semesterFuerDatum(datum) {
    const d = (datum instanceof Date) ? datum : new Date();
    const monat = d.getMonth() + 1;
    const jahr = d.getFullYear();
    if (monat >= 3 && monat <= 8) return { typ: 'sose', nr: jahr };
    return { typ: 'wise', nr: monat <= 2 ? jahr - 1 : jahr };
  }

  /* Welcher Zeitraum soll im Dialog vorausgewählt sein? Nicht einfach der
     erste Kandidat: die Liste ist jüngste-zuerst sortiert, ihr Kopf ist
     also das VORLAUF-Semester und damit fast nie das gemeinte.

     DH-Student, in dieser Reihenfolge:
       1. das laufende Semester
       2. sonst das jüngste noch freie, das NICHT in der Zukunft liegt —
          wer nachträgt, meint eher ein vergangenes als das kommende
       3. sonst der Listenkopf (dann sind nur Zukunfts-Semester frei)

     Azubi: aus dem Kalender lässt sich das Ausbildungsjahr nicht ableiten,
     dafür bräuchte man Users.AusbildungBeginn. Sie werden in Reihenfolge
     angelegt, also das NIEDRIGSTE noch freie. */
  function vorauswahlAbschnitt(rolle, kandidaten, datum) {
    const liste = Array.isArray(kandidaten) ? kandidaten : [];
    if (!liste.length) return null;
    if (abschnittTypenFuerRolle(rolle).includes('ausbildungsjahr')) {
      return liste.reduce((min, k) => (min === null || Number(k.nr) < Number(min.nr) ? k : min), null);
    }
    const jetzt = semesterFuerDatum(datum);
    const treffer = liste.find(k => k.typ === jetzt.typ && Number(k.nr) === jetzt.nr);
    if (treffer) return treffer;
    const jetztKey = abschnittSortKey(jetzt.typ, jetzt.nr);
    const vergangen = liste.filter(k => abschnittSortKey(k.typ, k.nr) < jetztKey);
    return vergangen.length ? vergangen[0] : liste[0];
  }

  /* Prüft einen anzulegenden Abschnitt gegen Typ, Wertebereich UND Rolle.
     Die Rolle gehört dazu, weil ein Azubi kein Semester anlegt und ein
     Student kein Ausbildungsjahr — sonst entstünden Abschnitte, die in
     der eigenen Ansicht nicht mehr wählbar wären. */
  function pruefeAbschnitt(typ, nr, rolle) {
    const erlaubt = abschnittTypenFuerRolle(rolle);
    if (!erlaubt.includes(typ)) {
      return erlaubt[0] === 'ausbildungsjahr'
        ? 'Azubis legen ein Ausbildungsjahr an, kein Semester.'
        : 'DH-Studenten legen ein Semester an, kein Ausbildungsjahr.';
    }
    if (!abschnittGueltig(typ, nr)) {
      return typ === 'ausbildungsjahr'
        ? `Ausbildungsjahr muss zwischen 1 und ${AJ_NR_MAX} liegen.`
        : `Jahr muss zwischen ${SEMESTER_JAHR_MIN} und ${SEMESTER_JAHR_MAX} liegen.`;
    }
    return null;
  }

  /* Gruppiert die ORDNER unter ihren Abschnitt, jüngster Abschnitt zuerst.
     Ersetzt gruppiereNachAbschnitt(): dort lag der Zeitraum am Eintrag und
     die Gruppierung passierte INNERHALB eines Fachs.

     Ein Abschnitt ohne Ordner bleibt in der Liste — man muss "SoSe 2026"
     anlegen können, bevor Fächer darin liegen, sonst verschwindet der
     gerade erzeugte Abschnitt sofort wieder.

     Ordner ohne (oder mit unbekanntem) AbschnittId landen in einer
     Auffanggruppe mit label = null, die ganz hinten steht und nur
     erscheint, wenn es solche Ordner gibt. */
  function gruppiereOrdnerNachAbschnitt(abschnitte, ordner) {
    const alle = Array.isArray(abschnitte) ? abschnitte : [];
    const liste = Array.isArray(ordner) ? ordner : [];
    const bekannt = new Set(alle.map(a => a.id));

    const gruppen = sortiereAbschnitte(alle).map((a) => {
      const drin = liste.filter(o => o && o.abschnittId === a.id);
      return {
        id: a.id, typ: a.typ, nr: Number(a.nr),
        label: abschnittLabel(a.typ, a.nr),
        schnitt: abschnittSchnitt(drin),
        credits: creditSumme(drin),
        ordner: drin,
      };
    });

    const ohne = liste.filter(o => o && (o.abschnittId === null || o.abschnittId === undefined
                                         || !bekannt.has(o.abschnittId)));
    if (ohne.length) {
      gruppen.push({
        id: null, typ: null, nr: null, label: null,
        schnitt: abschnittSchnitt(ohne),
        credits: creditSumme(ohne),
        ordner: ohne,
      });
    }
    return gruppen;
  }

  /* ── Notenspiegel: flache Tabelle ─────────────────────────────────
     Eine Zeile je Prüfung, das Fach als Spalte, der Zeitraum als
     Zwischenkopf mit Ø und Credit-Summe.

     Warum das HIER liegt und nicht in der Oberfläche: dieselben Zeilen
     erscheinen auf dem Bildschirm (app/js/noten-tabelle-ui.js) UND auf dem
     A4-Blatt (app/js/noten-druck.js). Zwei Aufbauten wären zwei
     Wahrheiten, und eine Abweichung fiele erst auf dem Papier auf — also
     dann, wenn das Blatt schon jemandem vorliegt.

     Zwei beabsichtigte Unterschiede zur Pflegeansicht:
       · Zeiträume OHNE Prüfung fallen weg. Dort müssen sie bleiben (man
         legt "SoSe 2026" an, bevor Fächer darin liegen), auf einem
         Notenspiegel sind sie eine leere Überschrift.
       · Prüfungen stehen AUFSTEIGEND nach Datum. Die API liefert sie
         absteigend, was für eine Liste "Neues zuerst" richtig ist und für
         einen Notenspiegel falsch. */
  function sortiereEintraege(eintraege) {
    // ISO-Daten (YYYY-MM-DD) sortieren als Text korrekt — kein Date-Objekt,
    // damit keine Zeitzone ins Spiel kommt (die Spalte ist DATE).
    return (Array.isArray(eintraege) ? eintraege.slice() : []).sort((a, b) => {
      const da = String((a && a.datum) || '');
      const db = String((b && b.datum) || '');
      if (da !== db) return da < db ? -1 : 1;
      return (Number(a && a.id) || 0) - (Number(b && b.id) || 0);
    });
  }

  function tabellenZeile(fach, e) {
    const wert = (v) => (v === undefined ? null : v);
    return {
      id: e.id,
      ordnerId: fach.id,
      fach: fach.name,
      // Trägt die Zeile zum Ø bei? Die Tabelle braucht das je ZEILE, weil
      // sie flach ist: die Fußnote hängt an der Zeile, nicht am Fach.
      zaehltInSchnitt: fach.zaehltInSchnitt !== false,
      titel: e.titel,
      art: e.art,
      datum: e.datum,
      note: wert(e.note),
      noteText: noteText(e),
      punkte: wert(e.punkte),
      maxPunkte: wert(e.maxPunkte),
      credits: wert(e.credits),
      status: wert(e.status),
      bemerkung: wert(e.bemerkung),
    };
  }

  function tabellenZeilen(abschnitte, ordner, opts) {
    const o = opts || {};
    // null/undefined = alle Zeiträume. Ein unbekannter Wert liefert nichts,
    // nicht versehentlich alles.
    const nurDieser = (o.abschnittId === null || o.abschnittId === undefined) ? null : o.abschnittId;

    return gruppiereOrdnerNachAbschnitt(abschnitte, ordner)
      .filter(g => nurDieser === null || g.id === nurDieser)
      .map(g => ({
        id: g.id, typ: g.typ, nr: g.nr, label: g.label,
        schnitt: g.schnitt,
        anzahlNoten: abschnittAnzahlNoten(g.ordner),
        credits: g.credits,
        zeilen: (g.ordner || []).flatMap(f => sortiereEintraege(f.eintraege).map(e => tabellenZeile(f, e))),
      }))
      .filter(g => g.zeilen.length > 0);
  }

  /* Spaltenbild. Beschriftung und Ausrichtung stehen hier und nicht in den
     beiden Renderern — sonst heißt dieselbe Spalte auf dem Blatt anders als
     auf dem Bildschirm. */
  const TABELLEN_SPALTEN = {
    fach:    { id: 'fach',    label: 'Fach',    ausricht: 'links'  },
    titel:   { id: 'titel',   label: 'Prüfung', ausricht: 'links'  },
    art:     { id: 'art',     label: 'Art',     ausricht: 'links'  },
    datum:   { id: 'datum',   label: 'Datum',   ausricht: 'links'  },
    note:    { id: 'note',    label: 'Note',    ausricht: 'rechts' },
    punkte:  { id: 'punkte',  label: 'Punkte',  ausricht: 'rechts' },
    credits: { id: 'credits', label: 'Credits', ausricht: 'rechts' },
    status:  { id: 'status',  label: 'Status',  ausricht: 'links'  },
  };

  function hatPunkte(gruppen) {
    return (Array.isArray(gruppen) ? gruppen : [])
      .some(g => (g.zeilen || []).some(z => z.punkte !== null && z.punkte !== undefined));
  }

  function tabellenSpalten(rolle, gruppen) {
    // Credits und Status gibt es nur bei DH-Studenten, die Art nur bei
    // Azubis (bei einem Studenten ist jede Zeile eine Semesterprüfung).
    const ids = rolle === 'dhstudent'
      ? ['fach', 'titel', 'datum', 'note', 'credits', 'status']
      : ['fach', 'titel', 'art', 'datum', 'note'];
    // IHK-Punkte hat kaum jemand überall eingetragen. Eine Spalte ohne
    // Zahlen kostet auf A4 die Breite, die die Fachnamen brauchen —
    // deshalb erscheint sie nur, wenn die AUSWAHL Punkte enthält.
    if (rolle !== 'dhstudent' && hatPunkte(gruppen)) ids.push('punkte');
    return ids.map(id => Object.assign({}, TABELLEN_SPALTEN[id]));
  }

  /* Führt einen PATCH-Body mit dem gespeicherten Eintrag zusammen.
     `alt` ist der Eintrag in der Antwort-Form (camelCase, wie mapEintrag in
     backend/routes/noten.js liefert), `body` die Teilmenge geänderter Felder.

     Der Grund, warum das hier und nicht in der Route steht: die eine
     Regel unten ist nicht offensichtlich und war schon einmal falsch. */
  function zusammenfuehreEintrag(alt, body) {
    const a = alt || {};
    const b = body || {};
    const nimm = (feld, standard) => (b[feld] !== undefined ? b[feld] : standard);
    return {
      titel: nimm('titel', a.titel),
      art: nimm('art', a.art),
      datum: nimm('datum', a.datum),
      // HIER die Regel: eine aus Punkten BERECHNETE Note ist keine
      // Nutzereingabe. Würde sie als solche übernommen, blockierte der alte
      // Wert jede Neuberechnung — ein PATCH, der nur die Maximalpunktzahl
      // korrigiert, ließe die Note stehen. Eine GETIPPTE Note bleibt
      // dagegen erhalten und behält ihren Vorrang vor den Punkten.
      note: nimm('note', a.noteAusPunkten ? null : a.note),
      punkte: nimm('punkte', a.punkte),
      maxPunkte: nimm('maxPunkte', a.maxPunkte),
      credits: nimm('credits', a.credits),
      status: nimm('status', a.status),
      bemerkung: nimm('bemerkung', a.bemerkung),
    };
  }

  // Muss Note/Punkte neu abgeleitet werden? Sonst bliebe eine berechnete
  // Note stehen, nachdem ihre Grundlage sich geändert hat.
  function mussNeuBerechnen(body) {
    const b = body || {};
    return b.note !== undefined || b.punkte !== undefined
      || b.art !== undefined || b.maxPunkte !== undefined;
  }

  const api = {
    ARTEN, ART_IDS, ARTEN_MIT_MITTEILUNG, artById,
    NOTE_MIN, NOTE_MAX, PUNKTE_MAX, TITEL_MAX, BEMERKUNG_MAX, ORDNERNAME_MAX,
    DATUM_MIN, DATUM_ZUKUNFT_TAGE,
    MAX_BELEG_BYTES, ERLAUBTE_ENDUNGEN, MAX_KANTE, ACCEPT_BELEG,
    ABSCHNITT_TYPEN, AJ_NR_MAX, SEMESTER_JAHR_MIN, SEMESTER_JAHR_MAX,
    SEMESTER_RUECKBLICK, SEMESTER_VORLAUF, abschnittKandidaten,
    semesterFuerDatum, vorauswahlAbschnitt,
    CREDITS_MAX, STATUS_WERTE, STATUS_IDS, statusById, statusLabel,
    NOTE_MAX_FUER_ROLLE,
    // STILLGELEGT mit Migration 046: DH-Studenten tragen keine Punkte mehr
    // ein, die DHBW-Umrechnung ist aus der Oberfläche verschwunden. Tabelle
    // und Spalte MaxPunkte bleiben unangetastet, damit ein Zurück keine
    // Migration kostet. Nichts Neues darauf aufbauen.
    DHBW_MAXPUNKTE, DHBW_SKALEN, istDhbwMax, noteAusPunktenDhbw,
    parseNote, formatNote, parsePunkte, formatPunkte, noteAusPunkten,
    parseCredits, formatCredits, istBestandenOhneNote, noteText,
    abschnittGueltig, abschnittLabel, abschnittSortKey, sortiereAbschnitte,
    abschnittTypenFuerRolle, pruefeAbschnitt,
    anzahlMitNote, ordnerSchnitt, abschnittSchnitt, abschnittAnzahlNoten, creditSumme,
    gruppiereOrdnerNachAbschnitt,
    TABELLEN_SPALTEN, tabellenZeilen, tabellenSpalten,
    endungVon, endungErlaubt, istBildVorschau, istPdf, formatBytes, verkleinereBild,
    normalisiereOrdnerName, pruefeOrdnerName, istIsoDatum, pruefeEintrag,
    zusammenfuehreEintrag, mussNeuBerechnen,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node/Tests/Backend
  root.Noten = Object.assign(root.Noten || {}, api);                        // Browser
})(typeof window !== 'undefined' ? window : globalThis);
