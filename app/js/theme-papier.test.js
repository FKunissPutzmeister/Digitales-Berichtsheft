'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const CSS_PATH = path.join(__dirname, '..', 'css', 'theme-papier.css');
const THEME_JS_PATH = path.join(__dirname, 'theme.js');
const WOCHENANSICHT_JS_PATH = path.join(__dirname, 'wochenansicht.js');

test('Papierheft-Retro: alle fünf Webfont-Dateien liegen vor und sind nicht leer', () => {
  for (const name of ['unifraktur-maguntia.woff2', 'eb-garamond-400.woff2', 'eb-garamond-600.woff2', 'eb-garamond-400italic.woff2', 'pinyon-script.woff2']) {
    const p = path.join(FONT_DIR, name);
    assert.ok(fs.existsSync(p), `Erwartet: ${p}`);
    assert.ok(fs.statSync(p).size > 1000, `${name} ist verdächtig klein`);
  }
});

test('Papierheft-Retro: theme-papier.css existiert und referenziert alle Font-Familien', () => {
  assert.ok(fs.existsSync(CSS_PATH), `Erwartet: ${CSS_PATH}`);
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /--font-heading:\s*'Pinyon Script',\s*'Unifraktur Maguntia',/);
  assert.match(css, /--font-body:\s*'EB Garamond',/);
  assert.match(css, /@font-face\s*\{\s*\n\s*font-family:\s*'Pinyon Script';\s*\n\s*src:\s*url\('\.\.\/assets\/fonts\/pinyon-script\.woff2'\)/);
});

test('Papierheft-Retro: theme-papier.css setzt eigene erstgenehmigt-Statusfarbe (kein Violett-Fallback)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /--status-erstgenehmigt-bg:/);
  assert.match(css, /--status-erstgenehmigt:/);
});

test('Papierheft-Retro: Buttons verlieren Versalien-Look (kein uppercase mehr)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\[data-theme="papier"\]\s+\.btn\s*\{[^}]*text-transform:\s*none/s);
});

test('Papierheft-Retro: leise Buttons bekommen Federstrich (kein Kasten)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  // .btn-ghost steht in einer Mehrfach-Selektor-Liste (zusammen mit
  // .btn-secondary/.btn-outline/.btn-outline-yellow/.btn-success), deshalb
  // NICHT ".btn-ghost {" direkt matchen (das gibt es so nicht) — stattdessen
  // Selektor-Präsenz und die Federstrich-Deklaration getrennt prüfen.
  assert.match(css, /\[data-theme="papier"\]\s+\.btn-ghost[,\s]/);
  assert.match(css, /box-shadow:\s*inset 0 -1\.5px 0 0 var\(--pm-grey-500\);/);
});

test('Papierheft-Retro: Primär- und Destruktiv-Buttons bekommen sichtbaren, handgezeichneten Rahmen', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  // .btn-primary/.btn-danger sind hier Einzel-Selektor-Blöcke (kein Komma-
  // Selektor wie oben), deshalb DARF hier direkt "Selektor {...}" geprüft werden.
  assert.match(css, /\[data-theme="papier"\] \.btn-primary \{[\s\S]*?border-radius: 3px 7px 4px 8px \/ 6px 4px 8px 3px;/);
  assert.match(css, /\[data-theme="papier"\] \.btn-danger \{[\s\S]*?border-radius: 6px 3px 8px 4px \/ 4px 8px 3px 6px;/);
});

test('Papierheft-Retro: weißer Federspitzen-Cursor ist gesetzt', () => {
  // Nach Live-Feedback von Gold auf Weiß umgestellt.
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /cursor:\s*url\("data:image\/svg\+xml,/);
  assert.match(css, /%23ffffff/i); // Weiß-Füllung der Feder, URL-encodiert
  assert.doesNotMatch(css, /%23c9a227/i); // die alte Gold-Füllung darf nicht mehr da sein
});

test('Papierheft-Retro: Cursor ist als Feder erkennbar UND nach rechts geschwungen', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /@keyframes papier-week-curl-next/);
  assert.match(css, /@keyframes papier-week-curl-prev/);
  assert.match(css, /\[data-theme="papier"\] \.week-pane--leaving\[data-dir="next"\] \{[\s\S]*?animation: papier-week-curl-next 220ms/);
  assert.match(css, /\[data-theme="papier"\] \.week-pane--leaving\[data-dir="prev"\] \{[\s\S]*?animation: papier-week-curl-prev 220ms/);
});

test('Papierheft-Retro: Curl respektiert prefers-reduced-motion', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\[data-theme="papier"\] \.week-pane--leaving\[data-dir="next"\][\s\S]*?animation: none;/);
});

test('Papierheft-Retro: PMPaperCurl-Engine + paintWeekCurl-API existieren in theme.js', () => {
  const js = fs.readFileSync(THEME_JS_PATH, 'utf8');
  assert.match(js, /var PMPaperCurl = \(function \(\) \{/);
  assert.match(js, /paintWeekCurl: function \(canvas, dir\) \{/);
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\[data-theme="papier"\] \.sidebar__logo-mark,/);
  assert.match(css, /content: url\("\.\.\/assets\/logo-papier\.png"\);/);
  assert.match(css, /filter: url\("\.\.\/assets\/filters-papier\.svg#roughen"\);/);
});

test('Papierheft-Retro: Dashboard-Karten rotieren zyklisch (3 Varianten) und bleiben es beim Hover', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
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

test('Papierheft-Retro: Nav-Leiste hat aufgerollte Schriftrollen-Enden oben (::before) und unten (::after)', () => {
  // Nutzer-Wunsch (mit Referenzbild einer aufgerollten Testament-
  // Schriftrolle): der Rand der Sidebar soll wie eine aufgerollte
  // Pergamentrolle wirken, oben UND unten, angepasst auf die tatsächliche
  // Breite der Nav-Leiste (nicht so breit wie im Referenzbild).
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const beforeBlock = css.match(/\[data-theme="papier"\] \.sidebar::before \{[\s\S]*?\n\}/)[0];
  const afterBlock = css.match(/\[data-theme="papier"\] \.sidebar::after \{[\s\S]*?\n\}/)[0];
  // left:0; right:0 statt fester Breite -> folgt automatisch der
  // tatsächlichen Sidebar-Breite in beiden Zuständen (aus-/eingeklappt).
  for (const block of [beforeBlock, afterBlock]) {
    assert.match(block, /left: 0;/);
    assert.match(block, /right: 0;/);
    assert.doesNotMatch(block, /width:/);
    assert.match(block, /pointer-events: none;/);
    assert.match(block, /z-index: 0;/);
    assert.match(block, /height: 38px;/);
    // NEUFASSUNG V2: die erste Fassung (einzelner sanfter Token-Verlauf)
    // sah live nur wie ein schwacher Lichtschimmer aus, nicht wie eine
    // Pergamentrolle (Nutzer-Reklamation per Screenshot). Jetzt zwei
    // kombinierte Hintergrund-Ebenen: feine Ringlinien (Wicklungsschichten)
    // + ein stark kontrastierter Zylinder-Verlauf (Glanzstreifen mittig).
    // Literale Hex-Werte statt Sidebar-Tinte-Tokens: mit dem Nutzer per
    // Playwright-Mockup (Kandidat D von 4) genau an diesen Werten
    // abgestimmt, siehe Kommentar in Abschnitt 11 der CSS-Datei.
    assert.match(block, /repeating-linear-gradient\(\s*\n\s*180deg,\s*\n\s*rgba\(0, 0, 0, 0\.22\) 0px,\s*\n\s*rgba\(0, 0, 0, 0\.22\) 1px,\s*\n\s*transparent 1px,\s*\n\s*transparent 4px\s*\n\s*\),/);
    assert.match(block, /linear-gradient\(\s*\n\s*180deg,\s*\n\s*#1a0f06 0%,\s*\n\s*#3d2a14 12%,\s*\n\s*#6b4a24 28%,\s*\n\s*#caa268 42%,\s*\n\s*#f4e2b8 48%,\s*\n\s*#caa268 54%,\s*\n\s*#6b4a24 68%,\s*\n\s*#3d2a14 84%,\s*\n\s*#1a0f06 100%\s*\n\s*\);/);
  }
  assert.match(beforeBlock, /top: 0;/);
  assert.match(afterBlock, /bottom: 0;/);
  // Naht-Schatten + harte Trennlinie zeigen jeweils vom Rollen-Ende weg
  // zur flachen Fläche, damit der Übergang Rolle -> Seite klar sichtbar ist.
  assert.match(beforeBlock, /box-shadow: 0 5px 12px rgba\(0, 0, 0, 0\.65\);/);
  assert.match(beforeBlock, /border-bottom: 1px solid rgba\(0, 0, 0, 0\.55\);/);
  assert.match(afterBlock, /box-shadow: 0 -5px 12px rgba\(0, 0, 0, 0\.65\);/);
  assert.match(afterBlock, /border-top: 1px solid rgba\(0, 0, 0, 0\.55\);/);
});
