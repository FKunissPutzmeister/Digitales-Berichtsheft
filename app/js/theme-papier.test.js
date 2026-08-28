'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const CSS_PATH = path.join(__dirname, '..', 'css', 'theme-papier.css');
const THEME_JS_PATH = path.join(__dirname, 'theme.js');
const WOCHENANSICHT_JS_PATH = path.join(__dirname, 'wochenansicht.js');
const SIDEBAR_JS_PATH = path.join(__dirname, 'sidebar.js');

// Normalisiert CRLF->LF beim Lesen: git (core.autocrlf) wandelt Zeilenenden
// je nach Checkout/Merge-Pfad um -- Regexes hier mit literalem \n zwischen
// verketteten Selektoren (z.B. ".a,\n.b { ... }") matchen sonst nur in
// manchen Checkouts (Worktree vs. Haupt-Checkout nach Merge beobachtet).
function readCss() {
  return fs.readFileSync(CSS_PATH, 'utf8').replace(/\r\n/g, '\n');
}

test('Papierheft-Retro: alle fünf Webfont-Dateien liegen vor und sind nicht leer', () => {
  for (const name of ['unifraktur-maguntia.woff2', 'eb-garamond-400.woff2', 'eb-garamond-600.woff2', 'eb-garamond-400italic.woff2', 'pinyon-script.woff2']) {
    const p = path.join(FONT_DIR, name);
    assert.ok(fs.existsSync(p), `Erwartet: ${p}`);
    assert.ok(fs.statSync(p).size > 1000, `${name} ist verdächtig klein`);
  }
});

test('Papierheft-Retro: theme-papier.css existiert und referenziert alle Font-Familien', () => {
  assert.ok(fs.existsSync(CSS_PATH), `Erwartet: ${CSS_PATH}`);
  const css = readCss();
  assert.match(css, /Unifraktur Maguntia/);
  assert.match(css, /EB Garamond/);
  assert.match(css, /\[data-theme="papier"\]/);
});

test('Papierheft-Retro: Testphase Pinyon Script bei Überschriften (Nutzer-Wunsch "ausprobieren, wie es wirkt")', () => {
  // --font-heading bekommt Pinyon Script als primäre Schrift, mit
  // Unifraktur Maguntia als Fallback (falls die Testphase wieder
  // rückgängig gemacht wird, reicht das Entfernen von 'Pinyon Script'
  // aus der font-family-Liste). --font-body bleibt EB Garamond – im
  // Schriftproben-Vergleich (scratchpad feder-schriftproben.html) war
  // Pinyon Script für ganze Fließtext-Absätze grenzwertig eingestuft.
  const css = readCss();
  assert.match(css, /--font-heading:\s*'Pinyon Script',\s*'Unifraktur Maguntia',/);
  assert.match(css, /--font-body:\s*'EB Garamond',/);
  assert.match(css, /@font-face\s*\{\s*\n\s*font-family:\s*'Pinyon Script';\s*\n\s*src:\s*url\('\.\.\/assets\/fonts\/pinyon-script\.woff2'\)/);
});

test('Papierheft-Retro: theme-papier.css setzt eigene erstgenehmigt-Statusfarbe (kein Violett-Fallback)', () => {
  const css = readCss();
  assert.match(css, /--status-erstgenehmigt-bg:/);
  assert.match(css, /--status-erstgenehmigt:/);
});

test('Papierheft-Retro: Buttons verlieren Versalien-Look (kein uppercase mehr)', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\]\s+\.btn\s*\{[^}]*text-transform:\s*none/s);
});

test('Papierheft-Retro: leise Buttons bekommen Federstrich (kein Kasten)', () => {
  const css = readCss();
  // .btn-ghost steht in einer Mehrfach-Selektor-Liste (zusammen mit
  // .btn-secondary/.btn-outline/.btn-outline-yellow/.btn-success), deshalb
  // NICHT ".btn-ghost {" direkt matchen (das gibt es so nicht) — stattdessen
  // Selektor-Präsenz und die Federstrich-Deklaration getrennt prüfen.
  assert.match(css, /\[data-theme="papier"\]\s+\.btn-ghost[,\s]/);
  assert.match(css, /box-shadow:\s*inset 0 -1\.5px 0 0 var\(--pm-grey-500\);/);
});

test('Papierheft-Retro: Primär- und Destruktiv-Buttons bekommen sichtbaren, handgezeichneten Rahmen', () => {
  const css = readCss();
  // .btn-primary/.btn-danger sind hier Einzel-Selektor-Blöcke (kein Komma-
  // Selektor wie oben), deshalb DARF hier direkt "Selektor {...}" geprüft werden.
  assert.match(css, /\[data-theme="papier"\] \.btn-primary \{[\s\S]*?border-radius: 3px 7px 4px 8px \/ 6px 4px 8px 3px;/);
  assert.match(css, /\[data-theme="papier"\] \.btn-danger \{[\s\S]*?border-radius: 6px 3px 8px 4px \/ 4px 8px 3px 6px;/);
});

test('Papierheft-Retro: weißer Federspitzen-Cursor ist gesetzt', () => {
  // Nach Live-Feedback von Gold auf Weiß umgestellt.
  const css = readCss();
  assert.match(css, /cursor:\s*url\("data:image\/svg\+xml,/);
  assert.match(css, /%23ffffff/i); // Weiß-Füllung der Feder, URL-encodiert
  assert.doesNotMatch(css, /%23c9a227/i); // die alte Gold-Füllung darf nicht mehr da sein
});

test('Papierheft-Retro: Cursor ist als Feder erkennbar UND nach rechts geschwungen', () => {
  const css = readCss();
  // Nach Live-Feedback ("Mauszeiger in eine Feder ändern") von der reinen
  // Kite-Form auf eine Fahne + Kiel + Barben-Hatching umgestellt — das
  // Hatching (mehrere <line>-Paare) ist das eigentliche Erkennungsmerkmal.
  const lineCount = (css.match(/%3Cline /g) || []).length;
  assert.ok(lineCount >= 10, `Erwarte mindestens 10 Barben-Linien im Cursor-SVG, gefunden: ${lineCount}`);
  assert.match(css, /"\)\s*12 45,\s*auto !important;/); // Hotspot an der (jetzt auf die Nib verschobenen) Spitze
  // "Nach rechts geschwungen": der Kiel-Pfad muss die Spitze klar nach
  // rechts UND oben verlassen (nicht mehr eine gerade vertikale Linie wie
  // in der ersten Version) — Kiel-Pfad endet spürbar rechts vom Hotspot.
  const spinePath = css.match(/M12 44 C6 37,3 23,9 12 C14 5,21 1,29 0/);
  assert.ok(spinePath, 'Kiel-Pfad mit Rechtskurve nicht gefunden');
});

test('Papierheft-Retro: Feder hat eine kleine schwarze Spitze (Nib)', () => {
  // Live-Feedback: "gib der Feder noch eine kleine schwarze Spitze" — ein
  // kleines schwarzes Dreieck an der Kielspitze simuliert die Metallfeder.
  const css = readCss();
  assert.match(css, /%23000000/); // Schwarz-Füllung der Nib, URL-encodiert
  assert.match(css, /M9\.5 40 L14\.5 40 L12 45\.5 Z/); // kleines Dreieck an der Spitze
  // Muss NACH den Barben-Linien im SVG stehen, damit es über den
  // Federkiel-Auslauf gemalt wird, nicht darunter verschwindet.
  const svgMatch = css.match(/cursor:\s*url\("data:image\/svg\+xml,[^"]*"\)/);
  assert.ok(svgMatch, 'Cursor-SVG nicht gefunden');
  const lastLineIndex = svgMatch[0].lastIndexOf('%3Cline ');
  const nibIndex = svgMatch[0].indexOf('%3Cpath d=\'M9.5 40');
  assert.ok(nibIndex > lastLineIndex, 'Nib-Dreieck muss nach den Barben-Linien gezeichnet werden');
});

test('Papierheft-Retro: Eck-Curl-Keyframes für beide Wochenwechsel-Richtungen', () => {
  const css = readCss();
  assert.match(css, /@keyframes papier-week-curl-next/);
  assert.match(css, /@keyframes papier-week-curl-prev/);
  assert.match(css, /\[data-theme="papier"\] \.week-pane--leaving\[data-dir="next"\] \{[\s\S]*?animation: papier-week-curl-next 220ms/);
  assert.match(css, /\[data-theme="papier"\] \.week-pane--leaving\[data-dir="prev"\] \{[\s\S]*?animation: papier-week-curl-prev 220ms/);
});

test('Papierheft-Retro: Curl-Falz ist ein runder Bogen (10 Punkte je Keyframe), nicht mehr die gerade Diagonale', () => {
  const css = readCss();
  const nextBlock = css.match(/@keyframes papier-week-curl-next \{[\s\S]*?\n\}/)[0];
  const prevBlock = css.match(/@keyframes papier-week-curl-prev \{[\s\S]*?\n\}/)[0];
  // Jede Keyframe-Zeile muss exakt 10 Polygon-Punkte haben (gleiche
  // Punktzahl in JEDEM Step ist Voraussetzung fuer weiches Interpolieren
  // -- die alte Fassung wechselte zwischen 4/5 Punkten).
  for (const block of [nextBlock, prevBlock]) {
    const polygons = [...block.matchAll(/clip-path: polygon\(([^)]*)\);/g)];
    assert.strictEqual(polygons.length, 5, 'erwartet 5 Keyframe-Steps (0/20/45/70/100%)');
    for (const p of polygons) {
      const pointCount = p[1].split(',').length;
      assert.strictEqual(pointCount, 10, 'jeder Step muss 10 Polygon-Punkte haben');
    }
  }
  // Der 45%-Schritt muss einen echten Bogen zeigen (Zwischenpunkte
  // spuerbar von der geraden Sehne A-B abgesetzt) -- das war bei der
  // alten geraden Diagonale nicht der Fall.
  assert.match(nextBlock, /45%\s*\{ clip-path: polygon\(0% 0%, 0% 100%, 100% 100%, 100% 45%, 82% 48%/);
  assert.match(prevBlock, /45%\s*\{ clip-path: polygon\(100% 100%, 100% 0%, 0% 0%, 45% 100%, 48% 82%/);
});

test('Papierheft-Retro: Curl respektiert prefers-reduced-motion', () => {
  const css = readCss();
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\[data-theme="papier"\] \.week-pane--leaving\[data-dir="next"\][\s\S]*?animation: none;/);
});

test('Papierheft-Retro: PMPaperCurl-Engine + paintWeekCurl-API existieren in theme.js', () => {
  const js = fs.readFileSync(THEME_JS_PATH, 'utf8');
  assert.match(js, /var PMPaperCurl = \(function \(\) \{/);
  assert.match(js, /paintWeekCurl: function \(canvas, dir\) \{/);
});

test('Papierheft-Retro: PMPaperCurl malt zusätzlich einen dunklen Schatten-Fleck (Schlagschatten der abrollenden Ecke)', () => {
  const js = fs.readFileSync(THEME_JS_PATH, 'utf8');
  const engine = js.match(/var PMPaperCurl = \(function \(\) \{[\s\S]*?\n  \}\)\(\);/)[0];
  // Schatten-Versatzrichtung: next -> Seitenmitte unten-links (-1,+1),
  // prev -> oben-rechts (+1,-1) -- Gegenrichtung zur wegrollenden Ecke.
  assert.match(engine, /var sdx = dir === 'prev' \? 1 : -1;/);
  assert.match(engine, /var sdy = dir === 'prev' \? -1 : 1;/);
  assert.match(engine, /rgba\(30,20,10,/);
  // Lichtfleck bleibt erhalten (Glanz direkt auf dem Falz-Scheitel).
  assert.match(engine, /rgba\(255,248,230,/);
  // Radiale statt lineare Gradienten -- ein linearGradient über die volle
  // Canvas-Flaeche gezogen erzeugte einen haesslichen, unendlichen
  // Diagonal-Streifen statt eines lokal begrenzten Flecks (siehe
  // Kommentar oben der Engine).
  assert.match(engine, /createRadialGradient/);
  assert.doesNotMatch(engine, /createLinearGradient/);
  // Referenzpunkt = echter Bogen-Scheitel (curveApex), nicht mehr die
  // alte gerade Eck-zu-Eck-Diagonale.
  assert.match(engine, /function curveApex\(te, w, h, dir\) \{/);
});

test('Papierheft-Retro: wochenansicht.js erzeugt Curl-Canvas nur für papier-Theme (theme-gated, additiv)', () => {
  const js = fs.readFileSync(WOCHENANSICHT_JS_PATH, 'utf8');
  assert.match(js, /window\.PMTheme && window\.PMTheme\.getCustom\(\) === 'papier'/);
  assert.match(js, /window\.PMTheme\.paintWeekCurl\(curlCanvas, dir\)/);
  // Bestehende Zeilen müssen unverändert bleiben — stichprobenartig prüfen,
  // dass der ursprüngliche Klon-Code noch exakt so da steht wie vorher.
  assert.match(js, /clone\.classList\.add\('week-pane--leaving'\);/);
  assert.match(js, /stage\.appendChild\(clone\);/);
});

test('Papierheft-Retro: Logo-Asset + Filter-SVG liegen vor', () => {
  const logoPath = path.join(__dirname, '..', 'assets', 'logo-papier.png');
  const filterPath = path.join(__dirname, '..', 'assets', 'filters-papier.svg');
  assert.ok(fs.existsSync(logoPath), `Erwartet: ${logoPath}`);
  assert.ok(fs.statSync(logoPath).size > 1000, 'logo-papier.png ist verdächtig klein');
  assert.ok(fs.existsSync(filterPath), `Erwartet: ${filterPath}`);
  const svg = fs.readFileSync(filterPath, 'utf8');
  assert.match(svg, /id="roughen"/);
  assert.match(svg, /id="roughen-fine"/);
  assert.match(svg, /feDisplacementMap/);
});

test('Papierheft-Retro: roughen-fine ist ein Doppelstrich-Skizzeneffekt (feMerge aus zwei unabhängig verzerrten Kopien)', () => {
  // Nach Live-Feedback ("Icons wirken nicht handgezeichnet") von einer
  // einzelnen kaum sichtbaren Verzerrung auf zwei überlagerte, unterschiedlich
  // verzerrte Kopien umgestellt (Rough.js/xkcd-Prinzip) — deutlich sichtbarer.
  const filterPath = path.join(__dirname, '..', 'assets', 'filters-papier.svg');
  const svg = fs.readFileSync(filterPath, 'utf8');
  const roughenFineBlock = svg.match(/<filter id="roughen-fine"[\s\S]*?<\/filter>/);
  assert.ok(roughenFineBlock, 'roughen-fine-Filter nicht gefunden');
  const block = roughenFineBlock[0];
  assert.equal((block.match(/feTurbulence/g) || []).length, 2, 'erwarte zwei unabhängige feTurbulence-Durchläufe');
  assert.match(block, /feMerge/);
});

test('Papierheft-Retro: Foto-Hintergrund ersetzt den alten Verlauf (über die geteilten --app-bg-*-Tokens, nicht per body-Override)', () => {
  // Wichtig: NICHT body direkt überschreiben (das speist die iOS-
  // Spiegelebene html::before aus glass.css nicht mit, siehe
  // docs/ios-touch-verhalten.md) — stattdessen dieselben Tokens setzen,
  // die glass.css an body:not(.login-page) UND html::before durchreicht.
  const bgPath = path.join(__dirname, '..', 'assets', 'papier-bg.jpg');
  assert.ok(fs.existsSync(bgPath), `Erwartet: ${bgPath}`);
  assert.ok(fs.statSync(bgPath).size > 20000, 'papier-bg.jpg ist verdächtig klein');
  const css = readCss();
  assert.match(css, /--app-bg-image:\s*url\("\.\.\/assets\/papier-bg\.jpg"\);/);
  assert.match(css, /--app-bg-base:\s*#[0-9A-Fa-f]{6};/);
  // Die alte direkte body-Regel darf nicht wieder auftauchen.
  assert.doesNotMatch(css, /\[data-theme="papier"\]\s+body:not\(\.login-page\)\s*\{/);
});

test('Papierheft-Retro: die ECHTE .wochen-kachel trägt die Form (nicht nur ein Overlay dahinter)', () => {
  // .wochen-kachel ist die tatsächlich gerenderte Schreib-Kachel
  // (wochenansicht.js:1973) — NICHT die toten .day-card-Regeln, die laut
  // eigenem Kommentar in wochenansicht.css von keinem Template mehr erzeugt
  // werden.
  // Nutzer-Feedback: "du veränderst nur das Overlay ... ich verlange, dass
  // du die Kachel von der Form veränderst". Bug gefunden: eine spezifischere
  // Basisregel (`body[data-page="wochenansicht"] .wochen-kachel`,
  // wochenansicht.css:2743, Spezifität 0-2-1) überschrieb bislang jede
  // `[data-theme="papier"] .wochen-kachel`-Regel (Spezifität 0-2-0) still-
  // schweigend zurück auf ein opakes, unmaskiertes Rechteck — deshalb der
  // reine "Overlay"-Effekt. Selektor hier deshalb um
  // `body[data-page="wochenansicht"]` erweitert, damit er tatsächlich
  // gewinnt (siehe Kommentar in Abschnitt 10 der CSS-Datei).
  const css = readCss();
  const SEL = '\\[data-theme="papier"\\] body\\[data-page="wochenansicht"\\] \\.wochen-kachel';
  const baseBlock = css.match(new RegExp(SEL + ' \\{[\\s\\S]*?\\n\\}'))[0];
  assert.match(baseBlock, /background: var\(--pm-white\);/);
  assert.match(baseBlock, /border: none;/);
  assert.match(baseBlock, /isolation: isolate;/);
  assert.match(baseBlock, /mask: url\("data:image\/svg\+xml,/);
  assert.match(baseBlock, /-webkit-mask: url\("data:image\/svg\+xml,/);
  assert.match(baseBlock, /fill-rule='evenodd'/);
  assert.match(baseBlock, /filter:\s*\n\s*drop-shadow\(0 0 1px rgba\(43, 28, 13, 0\.85\)\)\s*\n\s*drop-shadow\(0 0 1\.5px rgba\(43, 28, 13, 0\.5\)\)\s*\n\s*drop-shadow\(3px 5px 8px rgba\(90, 60, 20, 0\.22\)\);/);
  assert.match(baseBlock, /transform: rotate\(-0\.9deg\) !important;/);
  // Drei zyklische Varianten, wie bei den Dashboard-Karten (Abschnitt 9) —
  // nur die Drehung unterscheidet sie, die Rissform ist überall gleich.
  assert.match(css, /\[data-theme="papier"\] \.wochen-kachel:nth-child\(3n\+2\) \{\s*\n\s*transform: rotate\(0\.7deg\) !important;/);
  assert.match(css, /\[data-theme="papier"\] \.wochen-kachel:nth-child\(3n\+3\) \{\s*\n\s*transform: rotate\(-0\.5deg\) !important;/);
});

test('Papierheft-Retro: ::before ist NUR NOCH die Vergilbung (kein eigenes Mask/Fill mehr)', () => {
  // Nutzer-Feedback: "das Overlay soll nur die Vergilbung darstellen" —
  // die Rissform liegt jetzt komplett auf der echten .wochen-kachel (s.o.),
  // ::before hat keinen eigenen Zweck mehr außer der Farbverlauf-Tönung.
  // Sie wird automatisch vom Mask des Eltern-Elements mitgeschnitten
  // (Pseudo-Elemente sind Teil des geclippten Renderings ihres Elements).
  const css = readCss();
  const beforeBlock = css.match(/\[data-theme="papier"\] \.wochen-kachel::before \{[\s\S]*?\n\}/)[0];
  assert.match(beforeBlock, /z-index: -1;/);
  assert.match(beforeBlock, /pointer-events: none;/);
  assert.doesNotMatch(beforeBlock, /mask:/);
  assert.doesNotMatch(beforeBlock, /filter:/);
  // Vergilbung "vom Rand nach innen": vier Linear-Gradients (einer pro
  // Kante, feste 60px).
  assert.match(beforeBlock, /linear-gradient\(to right, rgba\(150, 108, 45, 0\.42\), transparent 60px\)/);
  assert.match(beforeBlock, /linear-gradient\(to left, rgba\(150, 108, 45, 0\.42\), transparent 60px\)/);
  assert.match(beforeBlock, /linear-gradient\(to bottom, rgba\(150, 108, 45, 0\.42\), transparent 60px\)/);
  assert.match(beforeBlock, /linear-gradient\(to top, rgba\(150, 108, 45, 0\.42\), transparent 60px\)/);
});

test('Papierheft-Retro: SVG-Mask-Pfad ist nochmal dezenter (NEUFASSUNG #8) – Risse oben-rechts/unten-rechts erkennbar, aber weiter reduziert; Ecken oben-links/unten-links bleiben sicher flach', () => {
  // Nutzer-Feedback-Verlauf: "wo ist die Verformung??" (→ NEUFASSUNG #6,
  // dramatisch) → "etwas zu viel des Guten, subtiler" (→ NEUFASSUNG #7,
  // grob halbiert) → "gerne noch etwas dezenter" (→ NEUFASSUNG #8,
  // nochmal ~40% reduziert, Positionen unverändert). Oben-links/unten-
  // links (Fixtext-Schutz: Titel-Label 16px/36px, Zeichenzähler
  // 20px/12px vom Rand, live vermessen) bleiben weiterhin sicher flach
  // (siehe Kommentar in Abschnitt 10 der CSS-Datei).
  const css = readCss();
  const SEL = '\\[data-theme="papier"\\] body\\[data-page="wochenansicht"\\] \\.wochen-kachel';
  const beforeBlock = css.match(new RegExp(SEL + ' \\{[\\s\\S]*?\\n\\}'))[0];
  const maskUrl = beforeBlock.match(/mask: url\("([^"]+)"\)/)[1];
  const dAttr = decodeURIComponent(maskUrl).match(/d='([^']+)'/)[1];
  // Kein separater Loch-Teilpfad (keine zweite "M" mitten im Pfad).
  const subpathStarts = (dAttr.match(/ M/g) || []).length;
  assert.equal(subpathStarts, 0, 'Erwarte EINEN durchgehenden Pfad, keine separaten Loch-Teilpfade');
  const points = dAttr.slice(1, -2).split(' L').map(p => p.split(' ').map(Number));
  // Die auffälligste Ecke unten rechts bleibt am tiefsten, aber weiter
  // reduziert (~32 statt ~55 Einheiten Reichweite).
  const tornStart = points.findIndex(([x, y]) => x === 1197 && y === 272);
  const tornEnd = points.findIndex(([x, y]) => x === 1136 && y === 300);
  assert.ok(tornStart > -1 && tornEnd > tornStart, 'Abgerissene-Ecke-Diagonale (unten rechts) nicht gefunden');
  const tornPoints = points.slice(tornStart, tornEnd + 1);
  for (const [x, y] of tornPoints) {
    assert.ok(x <= 1197 && y >= 265, `Punkt liegt zu nah am ursprünglichen Rand: ${x},${y}`);
  }
  // Oben-rechts bleibt erkennbar (>8 Einheiten vom Bildeck entfernt),
  // aber deutlich weniger als in NEUFASSUNG #7 (dort 15-35).
  const distTR = Math.min(...points.map(([x, y]) => Math.hypot(x - 1200, y - 0)));
  assert.ok(distTR >= 8 && distTR <= 22, `Ecke "oben rechts" nicht mehr im erwarteten dezenteren Bereich (${distTR.toFixed(1)})`);
  // Oben-links/unten-links bleiben SICHER FLACH (< 10 Einheiten vom
  // Bildeck), damit Titel-Label bzw. Zeichenzähler nicht abgeschnitten
  // werden — das ist hier bewusst eine OBERGRENZE, keine Untergrenze.
  const distTL = Math.min(...points.map(([x, y]) => Math.hypot(x - 0, y - 0)));
  const distBL = Math.min(...points.map(([x, y]) => Math.hypot(x - 0, y - 300)));
  assert.ok(distTL <= 10, `Ecke "oben links" reicht zu tief, riskiert Titel-Label abzuschneiden (${distTL.toFixed(1)} > 10)`);
  assert.ok(distBL <= 10, `Ecke "unten links" reicht zu tief, riskiert Zeichenzähler abzuschneiden (${distBL.toFixed(1)} > 10)`);
  // Grundrauheit weiter reduziert (3-8 statt 5-14 Einheiten) — stichprobenartig
  // die ersten Punkte der oberen Kante prüfen.
  const topEdgeDepths = points.slice(1, 13).map(([, y]) => y);
  assert.ok(topEdgeDepths.every(d => d >= 2 && d <= 10), `Grundrauheit oben außerhalb des erwarteten dezenteren Bereichs: ${topEdgeDepths}`);
  // Zwei Scheren-Schnitte bleiben (rechte + untere Kante), Tiefe weiter
  // reduziert (15 statt 28 Einheiten).
  const cutPoints = points.filter(([x, y]) => (x === 1185 && y === 102) || (x === 360 && y === 285));
  assert.equal(cutPoints.length, 2, `Erwarte genau 2 Scheren-Schnitt-Punkte (15 Einheiten tief), gefunden: ${cutPoints.length}`);
});

test('Papierheft-Retro: Schriftrollen-Kante am linken Rand läuft über die volle Kachelhöhe', () => {
  // Nutzer-Feedback: "am linken Rand dieses eingerollte" — nicht mehr nur
  // eine gefaltete Ecke oben links (frühere Version), sondern ein
  // durchgehender Streifen über die GESAMTE linke Kante, mit gebändertem
  // Verlauf (Andeutung eines aufgerollten Papier-Zylinders) + Schatten
  // nach rechts.
  const css = readCss();
  const afterBlock = css.match(/\[data-theme="papier"\] \.wochen-kachel::after \{[\s\S]*?\n\}/)[0];
  assert.match(afterBlock, /top: 0;/);
  assert.match(afterBlock, /left: 0;/);
  assert.match(afterBlock, /height: 100%;/);
  assert.match(afterBlock, /width: 14px;/);
  assert.match(afterBlock, /background: linear-gradient\(\s*\n\s*90deg,/);
  assert.match(afterBlock, /box-shadow: 4px 0 8px rgba\(43, 28, 13, 0\.28\);/);
  // Darf keine Klicks abfangen (reines Dekor über der echten Kachelfläche).
  assert.match(afterBlock, /pointer-events: none;/);
});

test('Papierheft-Retro: Logo wird per content:url() getauscht + gewackelt', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] \.sidebar__logo-mark,/);
  assert.match(css, /content: url\("\.\.\/assets\/logo-papier\.png"\);/);
  assert.match(css, /filter: url\("\.\.\/assets\/filters-papier\.svg#roughen"\);/);
});

test('Papierheft-Retro: Dashboard-Karten rotieren zyklisch (3 Varianten) und bleiben es beim Hover', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+1\)/);
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+2\)/);
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+3\)/);
  // Hover muss die Rotation MITNEHMEN, nicht durch reines translateY ersetzen
  // (siehe Plan: sonst "springt" die Karte beim Hover gerade).
  // !important ist hier bewusst nötig — .animate-fade-in (base.css) ist eine
  // CSS-Animation mit fill-mode:both, deren transform:translateY(0)-Endwert
  // sonst jede normale Deklaration unabhängig von Spezifität überstimmt
  // (im Live-Test gefunden, siehe theme-papier.css Kommentar an dieser Stelle).
  assert.match(css, /\[data-theme="papier"\] \.bento \.b-tile:nth-child\(3n\+1\):hover \{[\s\S]*?transform: rotate\(-1\.2deg\) translateY\(-2px\) !important;/);
});

test('Papierheft-Retro: Schriftrollen-Navigation -- Geometrie-Token (--pgm-*) im Token-Block', () => {
  // Werte-Block aus docs/mockups/schriftrolle-nav-einbau.md Abschnitt 1,
  // vom Nutzer im Mockup abgenommen -- 1:1 uebernommen, praefigiert mit
  // --pgm- (Farben brauchen KEINE eigenen Token, siehe Testfall zum
  // Kommentar unten: die Mockup-Palette deckt sich mit den bestehenden
  // --pm-*-Token).
  const css = readCss();
  const tokenBlock = css.match(/\[data-theme="papier"\] \{[\s\S]*?\n\}/)[0];
  assert.match(tokenBlock, /--pgm-cap-h:\s*29px;/);
  assert.match(tokenBlock, /--pgm-core-w:\s*11px;/);
  assert.match(tokenBlock, /--pgm-core-w-shut:\s*6px;/);
  assert.match(tokenBlock, /--pgm-curl-w:\s*16px;/);
  assert.match(tokenBlock, /--pgm-tear-w:\s*11px;/);
  assert.match(tokenBlock, /--pgm-tear-h:\s*44px;/);
  assert.match(tokenBlock, /--pgm-speed:\s*400ms;/);
  assert.match(tokenBlock, /--pgm-ease: cubic-bezier\(\.4, 0, \.2, 1\);/);
  // Starkes Tinte-Schwarz fuer die Nav-Link-Schrift (Nutzer-Wunsch:
  // "wie es mit schwarzer Tinte aussehen wuerde") -- kein reines
  // #000000, ein Hauch Warmton haelt es als Tinte statt digital-schwarz.
  assert.match(tokenBlock, /--pgm-ink-black:\s*#120F0A;/);
});

test('Papierheft-Retro: .sidebar selbst verliert die Glas-Pillen-Optik (Form kommt jetzt vom Blatt)', () => {
  // Einbau-Dokument 3.2/3.3: overflow:visible (lässt die überstehenden
  // Zylinder-Enden sichtbar werden), border-radius/border/box-shadow/
  // backdrop-filter der Pille neutralisiert, Hintergrund transparent
  // (sonst schiene die alte dunkle Pillenfarbe durch die echten
  // Transparenz-Lücken der Risskante statt des Fotos dahinter).
  const css = readCss();
  const block = css.match(/\[data-theme="papier"\] \.sidebar \{[\s\S]*?\n\}/)[0];
  assert.match(block, /overflow: visible;/);
  assert.match(block, /border-radius: 0;/);
  assert.match(block, /border: none;/);
  assert.match(block, /background: transparent;/);
  assert.match(block, /backdrop-filter: none;/);
  assert.match(block, /-webkit-backdrop-filter: none;/);
  assert.match(block, /box-shadow: none;/);
  // Die alte rechteckige Farbband-Loesung (drei Vorfassungen) haengte an
  // .sidebar::after -- die gibt es fuer papier nicht mehr, die Form
  // kommt jetzt komplett aus .sidebar__scroll-*.
  assert.doesNotMatch(css, /\[data-theme="papier"\] \.sidebar::after \{/);
  // Der duenne Glas-Lichtreflex der Pille (glass.css:1086) passt nicht
  // zur Papier-Optik -- die Zylinder-Kappen uebernehmen diese Rolle.
  assert.match(css, /\[data-theme="papier"\] \.sidebar::before \{\s*\n\s*display: none;\s*\n\}/);
});

test('Papierheft-Retro: .sidebar__scroll-Wrapper existiert nur fuer papier, alle anderen Themes unberuehrt', () => {
  const css = readCss();
  // Unscoped Basisregel gilt global (theme-papier.css laedt auf JEDER
  // Seite) -- ohne data-theme-Praefix macht sie den Wrapper fuer alle
  // anderen Themes wirkungslos, Einbau-Dokument Abschnitt 4.
  assert.match(css, /\n\.sidebar__scroll \{ display: none; \}/);
  const block = css.match(/\[data-theme="papier"\] \.sidebar__scroll \{[\s\S]*?\n\}/)[0];
  assert.match(block, /display: block;/);
  assert.match(block, /position: absolute;/);
  assert.match(block, /inset: 0;/);
  // Ueberstimmt .sidebar > * { z-index: 1 } (glass.css:295), damit die
  // Dekoration HINTER dem echten Inhalt (Header/Nav/Footer) liegt.
  assert.match(block, /z-index: 0;/);
  assert.match(block, /pointer-events: none;/);
});

test('Papierheft-Retro: Blatt (.sidebar__scroll-sheet) hat echte Risskanten per SVG-Maske + Alterungs-Textur', () => {
  const css = readCss();
  const block = css.match(/\[data-theme="papier"\] \.sidebar__scroll-sheet \{[\s\S]*?\n\}/)[0];
  // Drei Mask-Layer: Risskachel links/rechts (repeat-y) + Vollflaeche
  // Mitte (no-repeat) -- Compositing "add" vereinigt sie automatisch.
  assert.match(block, /--tear-l: url\("data:image\/svg\+xml,%3Csvg[\s\S]*?viewBox='0 0 13 46' preserveAspectRatio='none'/);
  assert.match(block, /--tear-r: url\("data:image\/svg\+xml,%3Csvg[\s\S]*?viewBox='0 0 13 46' preserveAspectRatio='none'/);
  assert.match(block, /mask-repeat: repeat-y, repeat-y, no-repeat;/);
  // Groesse haengt an --pgm-tear-w/--pgm-tear-h, NICHT an 100% -- sonst
  // wuerde die Wellenlaenge des Risses an die (auf iOS nicht konstante)
  // Sidebar-Hoehe koppeln (Einbau-Dokument, Punkt 6.4).
  assert.match(block, /mask-size: var\(--pgm-tear-w\) var\(--pgm-tear-h\), var\(--pgm-tear-w\) var\(--pgm-tear-h\), calc\(100% - var\(--pgm-tear-w\) \* 2\) 100%;/);
  assert.doesNotMatch(block, /mask-size: 100% 100%/);
  // Papierkorn als feTurbulence-Rauschen, NICHT als gekreuzte
  // repeating-linear-gradients (Einbau-Dokument, Punkt 6.5 -- zwei
  // Linienraster ergeben zwangslaeufig ein regelmaessiges Karo).
  assert.match(block, /feTurbulence type='fractalNoise' baseFrequency='0\.9' numOctaves='4' stitchTiles='stitch'/);
  // Altersflecken + Randverdunkelung + Grundton (Palette deckt sich mit
  // den bestehenden --pm-*-Token, siehe Einbau-Dokument Abschnitt 5 --
  // keine neuen Farb-Token noetig).
  assert.match(block, /radial-gradient\(ellipse 62px 92px at 18% 20%, rgba\(150, 110, 50, \.13\), transparent 70%\),/);
  assert.match(block, /linear-gradient\( 90deg, rgba\(120, 85, 35, \.38\) 0, rgba\(120, 85, 35, 0\) 28px\),/);
  assert.match(block, /linear-gradient\(170deg, #EFE0BE 0%, var\(--pm-white\) 30%, var\(--pm-grey-100\) 72%, #D2BC8B 100%\);/);
});

test('Papierheft-Retro: Zylinder oben/unten (.sidebar__scroll-cap) ragen seitlich ueber + sind Geschwister der Maske', () => {
  // Einbau-Dokument 3.1: Maske und Zylinder duerfen NICHT am selben
  // Element haengen (mask-image beschneidet Kinder/Pseudo-Elemente mit)
  // -- Blatt und Kappen sind deshalb getrennte Elemente, keine
  // Pseudo-Elemente voneinander.
  const css = readCss();
  const shared = css.match(/\[data-theme="papier"\] \.sidebar__scroll-cap \{[\s\S]*?\n\}/)[0];
  assert.match(shared, /left: -7px;/);
  assert.match(shared, /right: -7px;/);
  assert.match(shared, /height: var\(--pgm-cap-h\);/);
  assert.match(shared, /border-radius: 9px \/ 50%;/);
  assert.match(shared, /repeating-linear-gradient\(180deg, rgba\(60, 35, 10, \.16\) 0 1px, transparent 1px 5px\),/);
  assert.match(shared, /#f4e2b8 48%, #e8d3a3 56%, #b8935c 70%, #6b4a24 84%,/);
  assert.doesNotMatch(shared, /mask/);

  assert.match(css, /\[data-theme="papier"\] \.sidebar__scroll-cap--top \{ top: 0; \}/);
  const bottom = css.match(/\[data-theme="papier"\] \.sidebar__scroll-cap--bottom \{[\s\S]*?\n\}/)[0];
  // KEIN bottom:0 -- derselbe Render-Bug wie in den drei Vorfassungen
  // (bottom:0 auf position:absolute in diesem Container wird von
  // Edge/Chromium fehlerhaft am OBEREN statt unteren Rand gemalt),
  // Workaround bewusst beibehalten obwohl backdrop-filter jetzt weg ist.
  assert.doesNotMatch(bottom, /bottom:\s*0/);
  assert.match(bottom, /top: calc\(100% - var\(--pgm-cap-h\)\);/);
  assert.match(bottom, /transform: scaleY\(-1\);/);
});

test('Papierheft-Retro: dunkle Kernenden der Zylinder sind auf min(...,22%) gedeckelt + schrumpfen eingeklappt', () => {
  // Einbau-Dokument, Punkt 6.3: eine feste Pixelbreite liesse den
  // Zylinder bei schmaler Sidebar zur Hantel werden. Bei den
  // abgenommenen 11px/6px greift die Deckelung selbst nicht (Notiz im
  // CSS-Kommentar), bleibt aber als Sicherung stehen -- NICHT
  // wegkuerzen, weil sie "nichts tut".
  const css = readCss();
  const core = css.match(/\[data-theme="papier"\] \.sidebar__scroll-cap::before,\n\[data-theme="papier"\] \.sidebar__scroll-cap::after \{[\s\S]*?\n\}/)[0];
  assert.match(core, /width: min\(var\(--pgm-core-w\), 22%\);/);
  assert.match(core, /border-radius: 50%;/);
  assert.match(core, /radial-gradient\(ellipse at 50% 50%, #0d0703 0%, #2a1a0a 44%, rgba\(42, 26, 10, 0\) 74%\),/);
  assert.match(css, /\[data-theme="papier"\] \.sidebar__scroll-cap::before \{ left: 0; \}/);
  assert.match(css, /\[data-theme="papier"\] \.sidebar__scroll-cap::after  \{ right: 0; \}/);
  const collapsedCore = css.match(/\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__scroll-cap::before,\n\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__scroll-cap::after \{[\s\S]*?\n\}/)[0];
  assert.match(collapsedCore, /width: min\(var\(--pgm-core-w-shut\), 22%\);/);
});

test('Papierheft-Retro: Seitenrolle (.sidebar__scroll-curl) ist nur im eingeklappten Zustand sichtbar', () => {
  // Deckt die rechte Risskante ab statt die (nicht animierbare)
  // Mask-Maske umzuschalten -- ein Pergament, das sich einrollt, verdeckt
  // seinen eigenen Rand ohnehin, statt ihn auszutauschen.
  const css = readCss();
  const block = css.match(/\[data-theme="papier"\] \.sidebar__scroll-curl \{[\s\S]*?\n\}/)[0];
  assert.match(block, /width: 0;/);
  assert.match(block, /opacity: 0;/);
  assert.match(block, /border-radius: 50% \/ 8px;/);
  const collapsedBlock = css.match(/\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__scroll-curl \{[\s\S]*?\n\}/)[0];
  assert.match(collapsedBlock, /width: var\(--pgm-curl-w\);/);
  assert.match(collapsedBlock, /opacity: 1;/);
});

test('Papierheft-Retro: Toggle-Button wird zum Wachssiegel (bestehendes Element, nur Optik neu)', () => {
  // Einbau-Dokument 3.4: #sidebarToggle NICHT ersetzen (State/
  // localStorage/aria haengen daran) -- nur Verlauf + organischer
  // Blob-border-radius aus dem Mockup, Position bleibt unangetastet
  // (keine top/right/left/bottom-Deklaration hier). Vertikaler Versatz
  // (Nutzer-Wunsch: "Button etwas weiter unten platzieren") laeuft
  // bewusst ueber transform:translateY statt top/position, damit die
  // obige Aussage "Position bleibt unangetastet" fachlich stimmt --
  // der Toggle bleibt im normalen Layoutfluss, nur optisch verschoben.
  const css = readCss();
  const base = css.match(/\[data-theme="papier"\] \.sidebar__toggle \{[\s\S]*?\n\}/)[0];
  assert.match(base, /border-radius: 47% 53% 51% 49% \/ 52% 47% 53% 48%;/);
  assert.match(base, /radial-gradient\(circle at 50% 55%, #9B4030 0%, var\(--color-error-mid\) 55%, #4E1A11 100%\);/);
  assert.doesNotMatch(base, /\btop:|(?<!-webkit-)\bright:|\bleft:|\bbottom:/);
  assert.match(base, /transform: translateY\(6px\);/);
  // Hover/Active ersetzen transform komplett (nicht additiv) -- der
  // Versatz muss dort explizit mitgefuehrt werden, sonst springt das
  // Siegel beim Hover/Klick kurz auf die alte Hoehe zurueck.
  const hover = css.match(/\[data-theme="papier"\] \.sidebar__toggle:hover \{[\s\S]*?\n\}/)[0];
  assert.match(hover, /transform: translateY\(6px\) scale\(1\.07\);/);
  assert.match(css, /\[data-theme="papier"\] \.sidebar__toggle:active \{ transform: translateY\(6px\) scale\(\.94\); \}/);
  // Muss auch im eingeklappten Zustand erhalten bleiben -- glass.css
  // strippt dort per .sidebar.collapsed .sidebar__toggle gezielt
  // Hintergrund/Rahmen/Schatten auf einen nackten Pfeil; ohne eigene
  // hoeher-spezifische Regel wuerde das Siegel beim Einklappen
  // verschwinden.
  const collapsed = css.match(/\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__toggle,\n\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__toggle:hover \{[\s\S]*?\n\}/)[0];
  assert.match(collapsed, /radial-gradient\(circle at 50% 55%, #9B4030 0%, var\(--color-error-mid\) 55%, #4E1A11 100%\);/);
});

test('Papierheft-Retro: Profil-Avatar in der Sidebar wird zum Wachssiegel mit unregelmaessiger Kontur', () => {
  // NEUFASSUNG V2 (Nutzer-Feedback zu V1: "nur ein roter Punkt, soll
  // wirklich wie ein echter Stempel aussehen, auch dass es ein bisschen
  // ueber den Rand hinausgeht und wirklich wie eingestampft aussieht").
  // Per Playwright-Mockup (wax-seal-v1.html, 3 Kandidaten in echter
  // 32px-Groesse + 3x-Zoom) auf Kandidat C entschieden: echte
  // unregelmaessige SVG-Blob-Kontur (nicht nur organischer
  // border-radius wie V1) + Kreuzschraffur + Rand-Rille + invertierte
  // (tatsaechlich eingepraegte statt erhabene) text-shadow-Konvention.
  const css = readCss();
  // "Geht ueber den Rand hinaus": overflow:visible an BEIDEN Stellen --
  // .sidebar__user-link clippt sonst als Pille (glass.css:1271), der
  // Avatar selbst clippt sonst per Basisregel (components.css:335).
  const linkBlock = css.match(/\[data-theme="papier"\] \.sidebar__user-link \{\s*\n\s*overflow: visible;\s*\n\}/);
  assert.ok(linkBlock, '.sidebar__user-link braucht overflow:visible fuer den ueberstehenden Siegel-Rand');
  const avatar = css.match(/\[data-theme="papier"\] \.sidebar__user-link \.avatar \{[\s\S]*?\n\}/)[0];
  assert.match(avatar, /overflow: visible;/);
  // Eingepraegt statt gedruckt: dunkel oben-links, hell unten-rechts --
  // die UMGEKEHRTE Reihenfolge (V1) waere die Konvention fuer ERHABENEN
  // Text, nicht fuer eine Vertiefung.
  assert.match(avatar, /text-shadow: -1px -1px 1px rgba\(0, 0, 0, \.55\), 1px 1px 1px rgba\(255, 220, 190, \.25\);/);
  assert.match(avatar, /color: #E8C9A0;/);

  const before = css.match(/\[data-theme="papier"\] \.sidebar__user-link \.avatar::before \{[\s\S]*?\n\}/)[0];
  // Pseudo-Element ist groesser als die Box (140%) und zentriert --
  // dadurch ragt die unregelmaessige Kontur sichtbar ueber den
  // urspruenglichen 32px-Kreis hinaus, waehrend das Kuerzel selbst auf
  // der normalen Box-Groesse bleibt.
  assert.match(before, /width: 140%;/);
  assert.match(before, /height: 140%;/);
  assert.match(before, /transform: translate\(-50%, -50%\);/);
  // z-index:-1 ist notwendig, nicht kosmetisch: ohne das wuerde das
  // absolut positionierte Siegel-Blob (z-index:auto) das Kuerzel-Text
  // ueberdecken statt dahinter zu liegen.
  assert.match(before, /z-index: -1;/);
  // Echte unregelmaessige Kontur per SVG-Maske (12-Punkte-Blob), NICHT
  // nur organischer border-radius wie in V1 -- bei 32px war ein
  // Ecken-Radius nicht von einem Kreis zu unterscheiden.
  assert.match(before, /viewBox='0 0 100 100'/);
  assert.doesNotMatch(avatar, /border-radius: 4[0-9]% 5[0-9]%/);
  // Kreuzschraffur (gestempelter Stoff-Eindruck) + Rand-Rille (erhabener
  // Rand vs. flachere Mitte) -- beides in V1 nicht vorhanden.
  assert.match(before, /repeating-linear-gradient\(45deg, rgba\(0, 0, 0, \.11\) 0 1px, transparent 1px 4px\),/);
  assert.match(before, /repeating-linear-gradient\(-45deg, rgba\(0, 0, 0, \.07\) 0 1px, transparent 1px 4px\),/);
  assert.match(before, /radial-gradient\(circle at 50% 50%, transparent 0%, transparent 54%, rgba\(0, 0, 0, \.42\) 59%, rgba\(255, 255, 255, \.08\) 63%, transparent 70%\),/);
  // Echtfoto (components.css:341-349, Entra-Sync) wuerde das Siegel-
  // Konzept unterlaufen -- fuer den Sidebar-Avatar in papier immer
  // ausgeblendet, das Kuerzel-Siegel zeigt sich garantiert.
  const img = css.match(/\[data-theme="papier"\] \.sidebar__user-link \.avatar img \{[\s\S]*?\n\}/)[0];
  assert.match(img, /display: none;/);
});

test('Papierheft-Retro: Wortmarke -- "Berichtsheft" gross oben, "PUTZMEISTER" als gesperrte Unterzeile', () => {
  // NEUFASSUNG V2 (Nutzer-Wunsch nach V1 "nur Berichtsheft"): "Berichtsheft"
  // etwas groesser, darunter "PUTZMEISTER" im Stil der Sidebar-Rubriken-
  // Labels (.sidebar__section-label: 10px, 700, 0.14em Sperrung, Versalien,
  // gedeckte --pm-grey-500-Tinte) -- vom Nutzer per Bildausschnitt
  // referenzierter Stil. Markup bleibt fuer ALLE Themes unangetastet
  // (sidebar.js nicht geaendert): "PUTZMEISTER" kommt aus
  // text-transform:uppercase auf dem vorhandenen "Putzmeister"-Text, kein
  // neuer String. Visuelle Reihenfolge (Berichtsheft oben, PUTZMEISTER
  // unten) laeuft ueber Flex+order, weil das DOM andersherum steht
  // (Putzmeister vor Berichtsheft).
  const css = readCss();
  // .sidebar__logo-text hat nur EINEN Regel-Block fuer papier (die
  // Label-Transition-Regel weiter oben in der Datei traegt jetzt auch
  // display/flex-direction) -- absichtlich nicht doppelt, siehe Kommentar
  // in der CSS-Datei.
  const container = css.match(/\[data-theme="papier"\] \.sidebar__logo-text \{[\s\S]*?\n\}/)[0];
  assert.match(container, /display: flex;/);
  assert.match(container, /flex-direction: column;/);
  // Nutzer-Feedback danach ("beides noch etwas nach unten setzen", dann
  // nochmal "noch etwas nach unten"): nur der Text-Block wandert, das
  // Logo-Mark bleibt an Ort und Stelle. margin-top statt
  // transform:translateY (erster Versuch, live verworfen -- ueberlappte
  // sichtbar mit "UEBERSICHT" darunter, weil reines transform keinen
  // echten Platz reserviert). 10px (zuvor 6px).
  assert.match(container, /margin-top: 10px;/);
  assert.doesNotMatch(container, /transform: translateY/);
  const sub = css.match(/\[data-theme="papier"\] \.sidebar__logo-sub \{[\s\S]*?\n\}/)[0];
  assert.match(sub, /order: 1;/);
  assert.match(sub, /font-family: var\(--font-heading\);/);
  assert.match(sub, /font-size: 19px;/);
  assert.match(sub, /color: var\(--pm-grey-900\);/);
  const name = css.match(/\[data-theme="papier"\] \.sidebar__logo-name \{[\s\S]*?\n\}/)[0];
  assert.match(name, /order: 2;/);
  assert.match(name, /display: block;/);
  assert.match(name, /font-family: var\(--font-body\);/);
  assert.match(name, /font-size: 10px;/);
  assert.match(name, /letter-spacing: 0\.14em;/);
  assert.match(name, /text-transform: uppercase;/);
  assert.match(name, /color: var\(--pm-grey-500\);/);
  // sidebar.js darf NICHT angefasst worden sein -- beide Texte bleiben
  // im Markup fuer alle anderen Themes erhalten, "PUTZMEISTER" ist reine
  // CSS-Grossschreibung, kein neuer/korrigierter String im Markup.
  const js = fs.readFileSync(SIDEBAR_JS_PATH, 'utf8');
  assert.match(js, />Putzmeister<\/span>/);
  assert.match(js, />Berichtsheft<\/span>/);
});

test('Papierheft-Retro: Kopf-/Fußinhalt rueckt aus der Rollen-Zone heraus (liegt unter/ueber den Zylindern)', () => {
  // Nutzer-Feedback nach erstem Live-Blick: Logo/Name/Toggle lagen ueber
  // dem oberen Zylinder statt darunter, Profilbild/Name unter dem
  // unteren Zylinder statt darueber. Zusaetzlicher Innenabstand in Hoehe
  // von --pgm-cap-h + urspruengliche Basis-Luecke (18px oben/14px unten,
  // glass.css:1102/1257) schiebt den Inhalt aus der Rollen-Zone heraus --
  // dieselbe Idee wie im Mockup selbst (.roll__inner { padding:
  // calc(var(--cap-h) + 14px) ... }), nur auf die getrennten
  // .sidebar__header/.sidebar__footer der App uebertragen.
  const css = readCss();
  const header = css.match(/\[data-theme="papier"\] \.sidebar__header \{[\s\S]*?\n\}/)[0];
  assert.match(header, /padding-top: calc\(var\(--pgm-cap-h\) \+ 14px\);/);
  // height:auto -- .sidebar__header erbt aus layout.css eine FESTE
  // Hoehe (calc(var(--topbar-h) + ...)), die glass.css nie ueberschreibt
  // (dort ist "height" gar nicht gesetzt). Ohne diesen Override wuchs
  // die Box nicht mit dem Innenabstand/Inhalt mit -- Folge: die goldene
  // Trennlinie (glass.css:377-389, per bottom:0 an der Box-Unterkante
  // verankert) landete mitten im ueberstehenden Wortmarken-Text statt
  // darunter (Nutzer-Feedback: "goldene Linie [...] gerade irgendwie
  // unter Berichtsheft aber ueber Putzmeister gezogen").
  assert.match(header, /height: auto;/);
  assert.match(css, /\[data-theme="papier"\] \.sidebar__footer \{\s*\n\s*padding-bottom: calc\(var\(--pgm-cap-h\) \+ 14px\);\s*\n\}/);
  // Eingeklappt hat .sidebar__footer einen anderen Basiswert (12px statt
  // 14px unten, glass.css:1348) -- eigener Override statt derselbe Puffer.
  assert.match(css, /\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__footer \{\s*\n\s*padding-bottom: calc\(var\(--pgm-cap-h\) \+ 12px\);\s*\n\}/);
});

test('Papierheft-Retro: Sidebar-Links -- Tinte statt heller Schrift, aktiver Link mit Wachs-Punkt', () => {
  // Seit der Schriftrollen-Navigation ist der Sidebar-Grund helles
  // Pergament, nicht mehr dunkel getoentes Glas -- die alten hellen
  // Cremewerte (aus Abschnitt 3, fuer den frueheren dunklen Hintergrund
  // gedacht) waeren jetzt unlesbar. Nutzer-Feedback danach: die Nav-
  // Schrift soll "in einem starken Schwarz, wie es mit schwarzer Tinte
  // aussehen wuerde" erscheinen -- --pm-grey-700/-900 (Sepia, spuerbar
  // braun) ersetzt durch das eigene --pgm-ink-black-Token.
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] \.sidebar__link \{\s*\n\s*color: var\(--pgm-ink-black\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.sidebar__link:hover \{\s*\n\s*background: rgba\(90, 68, 41, 0\.10\);\s*\n\s*color: var\(--pgm-ink-black\);\s*\n\}/);
  const active = css.match(/\[data-theme="papier"\] \.sidebar__link\.active \{[\s\S]*?\n\}/)[0];
  assert.match(active, /color: var\(--pm-yellow\);/);
  assert.match(active, /font-weight: 600;/);
  assert.match(active, /background: linear-gradient\(90deg, rgba\(44, 58, 92, 0\.13\), rgba\(44, 58, 92, 0\.02\)\);/);
  // Wachs-Punkt statt deckendem Block -- left NICHT negativ, weil
  // .sidebar__nav overflow-x:hidden hat (glass.css:1159) und einen
  // negativen Wert zur Haelfte abschneiden wuerde.
  const dot = css.match(/\[data-theme="papier"\] \.sidebar__link\.active::before \{[\s\S]*?\n\}/)[0];
  assert.match(dot, /content: "";/);
  assert.match(dot, /left: 2px;/);
  assert.doesNotMatch(dot, /left: -/);
  assert.match(dot, /background: var\(--color-error-mid\);/);
});

test('Papierheft-Retro: Labels blenden beim Ein-/Ausklappen asymmetrisch aus (kein senkrechtes Anschneiden)', () => {
  // Einbau-Dokument, Punkt 6.2: Aufklappen -> Text kommt SPAET zurueck
  // (Delay ~55% der Laufzeit), Einklappen -> Text geht FRUEH weg (~30%,
  // kein Delay). Es zaehlt immer die Transition der ZIELREGEL, deshalb
  // reicht das Delay in der Basisregel.
  const css = readCss();
  const linkOpen = css.match(/\[data-theme="papier"\] \.sidebar__link-label \{[\s\S]*?\n\}/)[0];
  assert.match(linkOpen, /opacity calc\(var\(--pgm-speed\) \* \.45\) var\(--pgm-ease\) calc\(var\(--pgm-speed\) \* \.55\);/);
  const linkShut = css.match(/\[data-theme="papier"\] \.sidebar\.collapsed \.sidebar__link-label \{[\s\S]*?\n\}/)[0];
  assert.match(linkShut, /opacity calc\(var\(--pgm-speed\) \* \.3\) var\(--pgm-ease\) 0ms;/);
  const logoOpen = css.match(/\[data-theme="papier"\] \.sidebar__logo-text \{[\s\S]*?\n\}/)[0];
  assert.match(logoOpen, /opacity calc\(var\(--pgm-speed\) \* \.45\) var\(--pgm-ease\) calc\(var\(--pgm-speed\) \* \.55\);/);
});

test('Papierheft-Retro: eingeklappter Tooltip bekommt Pergament-Optik statt Glas-Kapsel', () => {
  // Kein neues Tooltip-System -- die App hat mit setupSidebarTooltips()
  // (sidebar.js) bereits einen JS-positionierten Mechanismus, der
  // data-tooltip automatisch aus dem Label-Text pflegt. Hier nur Optik.
  const css = readCss();
  const block = css.match(/\[data-theme="papier"\] \.sidebar-tooltip \{[\s\S]*?\n\}/)[0];
  assert.match(block, /background: linear-gradient\(170deg, #F3E6C6, var\(--pm-grey-100\)\);/);
  assert.match(block, /color: var\(--pm-grey-900\);/);
  assert.match(block, /backdrop-filter: none;/);
});

test('Papierheft-Retro: Auftritts-Animation nur beim echten ersten Laden (is-entering-Gate)', () => {
  // animation-fill-mode:both haelt ein Element sonst rueckwaerts bis zum
  // Ablauf des eigenen animation-delay auf dem Startwert fest -- die
  // Klasse .is-entering (von sidebar.js gesetzt/entfernt) macht das Gate
  // explizit.
  const css = readCss();
  assert.match(css, /@keyframes papier-scroll-unfurl \{/);
  assert.match(css, /@keyframes papier-scroll-ink-in \{/);
  const sheetAnim = css.match(/\[data-theme="papier"\] \.sidebar\.is-entering \.sidebar__scroll-sheet \{[\s\S]*?\n\}/)[0];
  assert.match(sheetAnim, /animation: papier-scroll-unfurl 900ms var\(--pgm-ease\) both;/);
  const inkIn = css.match(/\[data-theme="papier"\] \.sidebar\.is-entering \.sidebar__header > \*,\n\[data-theme="papier"\] \.sidebar\.is-entering \.sidebar__nav > \*,\n\[data-theme="papier"\] \.sidebar\.is-entering \.sidebar__footer > \* \{[\s\S]*?\n\}/)[0];
  assert.match(inkIn, /animation: papier-scroll-ink-in 520ms var\(--pgm-ease\) both;/);
  // Gestaffelt per --i (von sidebar.js pro Element gesetzt).
  assert.match(inkIn, /animation-delay: calc\(620ms \+ 40ms \* var\(--i, 0\)\);/);
  // prefers-reduced-motion schaltet auch die neuen Animationen ab.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\[data-theme="papier"\] \.sidebar\.is-entering \.sidebar__scroll-sheet,/);
});

test('Papierheft-Retro: sidebar.js baut den .sidebar__scroll-Block als erstes Element vor dem Header', () => {
  // Markup-Quelle ist NICHT 14 HTML-Dateien (Einbau-Dokument geht davon
  // aus) -- 13 der 14 Sidebar-Shells sind ein leeres <aside id="sidebar">,
  // dessen Inhalt ausschliesslich buildSidebar() per innerHTML erzeugt.
  // Der Wrapper steht deshalb einmalig hier, nicht in jeder HTML-Datei.
  const js = fs.readFileSync(SIDEBAR_JS_PATH, 'utf8');
  const template = js.match(/sidebar\.innerHTML = `([\s\S]*?)`;/)[1];
  const scrollIdx = template.indexOf('sidebar__scroll"');
  const headerIdx = template.indexOf('sidebar__header"');
  assert.ok(scrollIdx > -1, 'sidebar__scroll-Wrapper fehlt im Template');
  assert.ok(headerIdx > -1, 'sidebar__header fehlt im Template');
  assert.ok(scrollIdx < headerIdx, 'sidebar__scroll muss VOR sidebar__header stehen');
  assert.match(template, /<div class="sidebar__scroll-sheet"><\/div>/);
  assert.match(template, /<div class="sidebar__scroll-cap sidebar__scroll-cap--top"><\/div>/);
  assert.match(template, /<div class="sidebar__scroll-cap sidebar__scroll-cap--bottom"><\/div>/);
  assert.match(template, /<div class="sidebar__scroll-curl"><\/div>/);
});

test('Papierheft-Retro: sidebar.js gated die Auftritts-Animation auf Theme "papier" und staffelt per --i', () => {
  const js = fs.readFileSync(SIDEBAR_JS_PATH, 'utf8');
  assert.match(js, /document\.documentElement\.getAttribute\('data-theme'\) === 'papier'/);
  assert.match(js, /sidebar\.classList\.add\('is-entering'\)/);
  assert.match(js, /setProperty\('--i', i\)/);
  assert.match(js, /setTimeout\(\(\) => sidebar\.classList\.remove\('is-entering'\), 1700\)/);
});

test('Papierheft-Retro: eigener Sekundär-Akzent (Verdigris) neben der Indigo-Tinte definiert', () => {
  const css = readCss();
  const token = css.match(/\[data-theme="papier"\] \{[\s\S]*?\n\}/)[0];
  assert.match(token, /--pm-accent-2:\s*#3E6B68;/);
  assert.match(token, /--pm-accent-2-dark:\s*#2F5350;/);
  assert.match(token, /--pm-accent-2-light:\s*#5C8B87;/);
  assert.match(token, /--pm-accent-2-pale:\s*rgba\(62, 107, 104, 0\.22\);/);
  assert.match(token, /--pm-accent-2-bg:\s*rgba\(62, 107, 104, 0\.12\);/);
  assert.match(token, /--on-accent-2-text:\s*#EFE6CE;/);
});

test('Papierheft-Retro: Wochennavigation (Pfeile) sitzt auf der Terrakotta-Topbar-Füllung mit heller Schrift', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.week-kw-block__nav \{\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.week-kw-block__nav:hover \{\s*\n\s*background: var\(--pm-fill-3-dark\);\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
});

test('Papierheft-Retro: Betrieb\\/Schule- + Anwesenheit-Auswahl (PMSelect) nutzt Verdigris statt Indigo für Fokus/Offen/Pflichtfeld', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.tag-row__select \.pm-select__trigger:focus-visible,\s*\n\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.wochen-options__select \.pm-select__trigger:focus-visible,\s*\n\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select--open\.tag-row__select \.pm-select__trigger,\s*\n\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select--open\.wochen-options__select \.pm-select__trigger \{\s*\n\s*border-color: var\(--pm-accent-2\);/);
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.tag-row__select--needs-input \.pm-select__trigger \{\s*\n\s*background: var\(--pm-accent-2-bg\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  // Fallback fuers native <select> vor PMSelect-Enhancement.
  assert.match(css, /\[data-theme="papier"\] \.tag-row__select--needs-input:not\(:disabled\) \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\s*background-color: var\(--pm-accent-2-bg\);\s*\n\}/);
});

test('Papierheft-Retro: Anhang-/Reset-Button nutzt Terrakotta-Füllung (Verdigris-Rahmen bleibt), Anhänge-Liste bleibt Verdigris (Löschen-Rot unverändert)', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] \.wochen-options__icon-btn \{\s*\n\s*background: var\(--pm-fill-3\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.wochen-options__icon-btn:hover \{\s*\n\s*background: var\(--pm-fill-3-dark\);\s*\n\s*border-color: var\(--pm-accent-2-dark\);\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.wochen-anhang__name:hover \{\s*\n\s*color: var\(--pm-accent-2-dark\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.wochen-anhang__delete:hover \{\s*\n\s*background: var\(--pm-accent-2-bg\);\s*\n\}/);
});

test('Papierheft-Retro: Verdigris ist nicht nur Hover -- betroffene Elemente tragen den Akzent (Rahmen/Icon) schon im Ruhezustand', () => {
  const css = readCss();
  // Anhaenge-Liste: Zeilen-Rahmen + Icon-Farbe schon in Ruhe (bleibt Verdigris-auf-Pergament).
  assert.match(css, /\[data-theme="papier"\] \.wochen-anhang \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.wochen-anhang__icon \{\s*\n\s*color: var\(--pm-accent-2-dark\);\s*\n\}/);
});

test('Papierheft-Retro: Füllfarbe (Terrakotta) auf Topbar, Anhang-/Reset-Button und Ort-/Anwesenheit-Auswahl -- Verdigris-Rahmen bleibt', () => {
  const css = readCss();
  const token = css.match(/\[data-theme="papier"\] \{[\s\S]*?\n\}/)[0];
  assert.match(token, /--pm-fill-3:\s*#C9AD8F;/);
  assert.match(token, /--pm-fill-3-dark:\s*#B3936F;/);
  assert.match(token, /--on-fill-3-text:\s*#3D2C14;/);

  // Topbar: Rahmen bleibt Verdigris, Fuellung wird solide Terrakotta,
  // Textkinder bekommen helle Schrift.
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.week-toolbar \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\s*background: var\(--pm-fill-3\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.week-toolbar__autosave \{\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.week-kw-block__kw \{\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.week-kw-block__range \{\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\s*opacity: \.8;\s*\n\}/);

  // Anhang-\/Reset-Button: Terrakotta-Fuellung + helle Symbolfarbe, Rahmen bleibt Verdigris.
  assert.match(css, /\[data-theme="papier"\] \.wochen-options__icon-btn \{\s*\n\s*background: var\(--pm-fill-3\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);

  // Betrieb\/Schule-Auswahl in der Options-Leiste (die EINE Wochen-Ort-Pille):
  // Terrakotta-Fuellung + helle Schrift\/Chevron, Rahmen bleibt Verdigris.
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.wochen-options__select \.pm-select__trigger \{\s*\n\s*background: var\(--pm-fill-3\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\s*color: var\(--on-fill-3-text\);\s*\n\}/);
  // Anwesenheit- + Ort-Auswahl JE TAGESZEILE bekommt bewusst KEINE Fuellfarbe --
  // nur der Verdigris-Rahmen, Hintergrund bleibt Pergament-Creme.
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.tag-row__select \.pm-select__trigger \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  assert.doesNotMatch(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.tag-row__select \.pm-select__trigger \{\s*\n\s*background: var\(--pm-fill-3\)/);
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.pm-select\.tag-row__select--needs-input \.pm-select__trigger \{\s*\n\s*background: var\(--pm-accent-2-bg\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);

  // Checkboxen ("mit Unterweisung" u.ae.): Kasten traegt schon ungeklickt
  // die Lehm-Fuellfarbe + Verdigris-Rahmen, angehakt vertieft auf Verdigris.
  assert.match(css, /\[data-theme="papier"\] \.wochen-checkbox-opt__box,\s*\n\[data-theme="papier"\] \.wochen-options__check-box \{\s*\n\s*background: var\(--pm-fill-3\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
});

test('Papierheft-Retro: Farbaufteilung -- Editor-/Tageskacheln bleiben Indigo, ihre Steuerelemente werden Verdigris', () => {
  const css = readCss();
  // Anwesenheit-Zeitfeld.
  assert.match(css, /\[data-theme="papier"\] \.day-card__hours-input:focus \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  // Checkboxen.
  assert.match(css, /\[data-theme="papier"\] \.wochen-checkbox-opt:has\(input:checked\) \.wochen-checkbox-opt__box,\s*\n\[data-theme="papier"\] \.wochen-options__check:has\(input:checked\) \.wochen-options__check-box \{\s*\n\s*background: var\(--pm-accent-2\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  // Zeit-Spinner.
  assert.match(css, /\[data-theme="papier"\] \.time-spinner:focus-within \.time-spinner__unit,\s*\n\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.time-spinner__input:focus \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  // Ganztag\/Halbtag-Segment (die tatsaechlich gerenderte .dauer-pill).
  assert.match(css, /\[data-theme="papier"\] \.dauer-pill\[data-dauer="ganztag"\] \.dauer-pill__opt\[data-dauer-set="ganztag"\],\s*\n\[data-theme="papier"\] \.dauer-pill\[data-dauer="halbtag"\] \.dauer-pill__opt\[data-dauer-set="halbtag"\] \{\s*\n\s*background: var\(--pm-accent-2\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.dauer-split__val \{\s*\n\s*background: var\(--pm-accent-2\);\s*\n\}/);
  // Qualifikations-Button.
  assert.match(css, /\[data-theme="papier"\] \.tag-row__qualif-btn \{\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\s*background: var\(--pm-accent-2-bg\);\s*\n\s*color: var\(--pm-accent-2-dark\);\s*\n\}/);
  // Pflichtfeld-Hinweis-Banner.
  assert.match(css, /\[data-theme="papier"\] \.pflichtfeld-hinweis \{\s*\n\s*background: var\(--pm-accent-2-bg\);\s*\n\s*border-color: var\(--pm-accent-2\);\s*\n\}/);
  assert.match(css, /\[data-theme="papier"\] \.pflichtfeld-hinweis__mark \{\s*\n\s*background: var\(--pm-accent-2\);\s*\n\s*color: var\(--on-accent-2-text\);\s*\n\}/);
});

test('Papierheft-Retro: Farbaufteilung -- Editor-Kacheln (Schreibflaeche + Kopf) bleiben unangetastet bei Indigo', () => {
  const css = readCss();
  // Kein neuer papier-Override fuer editor-area/wochen-kachel/day-section
  // auf Verdigris -- diese Selektoren duerfen in Abschnitt 12/13 nicht
  // mit --pm-accent-2 auftauchen (Regressionsschutz gegen versehentliches
  // Umfaerben der Schreibflaeche).
  const section12und13 = css.slice(css.indexOf('12 · '));
  assert.doesNotMatch(section12und13, /\.editor-area[^\n]*\{[^}]*--pm-accent-2/s);
  assert.doesNotMatch(section12und13, /\.wochen-kachel__title[^\n]*\{[^}]*--pm-accent-2/s);
  assert.doesNotMatch(section12und13, /\.day-section__(icon|action-add|header|toggle)[^\n]*\{[^}]*--pm-accent-2/s);
});

test('Papierheft-Retro: Seitentitel (.page-title/.page-subtitle) sind auf dem Holz-Hintergrund lesbar (Gold statt dunkler Tinte)', () => {
  const css = readCss();
  const token = css.match(/\[data-theme="papier"\] \{[\s\S]*?\n\}/)[0];
  assert.match(token, /--pgm-title-gold:\s*#E8C97A;/);
  assert.match(css, /\[data-theme="papier"\] \.page-title,\s*\n\[data-theme="papier"\] \.page-subtitle \{\s*\n\s*color: var\(--pgm-title-gold\);\s*\n\s*text-shadow: 0 1px 3px rgba\(0, 0, 0, 0\.55\), 0 1px 1px rgba\(0, 0, 0, 0\.35\);\s*\n\}/);
});

test('Papierheft-Retro: Spalten-/Feld-Label ("Ort", "Anwesenheit", "ArbZ", "mit Unterweisung") sind weiß + Schlagschatten lesbar auf dem Holz-Hintergrund', () => {
  const css = readCss();
  assert.match(css, /\[data-theme="papier"\] body\[data-page="wochenansicht"\] \.tag-cards__header-label,\s*\n\[data-theme="papier"\] \.wochen-options__field-label,\s*\n\[data-theme="papier"\] \.wochen-options__check \{\s*\n\s*color: #FFFFFF;\s*\n\s*-webkit-text-stroke: 0\.4px #FFFFFF;\s*\n\s*text-shadow: 0 1px 3px rgba\(0, 0, 0, 0\.55\), 0 1px 1px rgba\(0, 0, 0, 0\.35\);\s*\n\}/);
});
