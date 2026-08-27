'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const CSS_PATH = path.join(__dirname, '..', 'css', 'theme-papier.css');
const THEME_JS_PATH = path.join(__dirname, 'theme.js');
const WOCHENANSICHT_JS_PATH = path.join(__dirname, 'wochenansicht.js');

test('Papierheft-Retro: alle vier Webfont-Dateien liegen vor und sind nicht leer', () => {
  for (const name of ['unifraktur-maguntia.woff2', 'eb-garamond-400.woff2', 'eb-garamond-600.woff2', 'eb-garamond-400italic.woff2']) {
    const p = path.join(FONT_DIR, name);
    assert.ok(fs.existsSync(p), `Erwartet: ${p}`);
    assert.ok(fs.statSync(p).size > 1000, `${name} ist verdächtig klein`);
  }
});

test('Papierheft-Retro: theme-papier.css existiert und referenziert beide Font-Familien', () => {
  assert.ok(fs.existsSync(CSS_PATH), `Erwartet: ${CSS_PATH}`);
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /Unifraktur Maguntia/);
  assert.match(css, /EB Garamond/);
  assert.match(css, /\[data-theme="papier"\]/);
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

test('Papierheft-Retro: Wochen-Kacheln (Schreib-Flächen) haben einen unregelmäßig zerrissenen Rand', () => {
  // .wochen-kachel ist die tatsächlich gerenderte Schreib-Kachel
  // (wochenansicht.js:1973) — NICHT die toten .day-card-Regeln, die laut
  // eigenem Kommentar in wochenansicht.css von keinem Template mehr erzeugt
  // werden.
  // Nach Live-Feedback mit einem NEUEN Referenzbild (unregelmäßig zerrissener
  // Rand statt gleichmäßiger Briefmarken-Kerben) von mask-image zurück auf
  // clip-path mit 42 handgesetzten, unregelmäßigen Punkten umgestellt (siehe
  // Kommentar in Abschnitt 10 der CSS-Datei).
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const baseBlock = css.match(/\[data-theme="papier"\] \.wochen-kachel \{[\s\S]*?\n\}/)[0];
  assert.match(baseBlock, /clip-path: polygon\(/);
  assert.match(baseBlock, /transform: rotate\(-0\.9deg\) !important;/);
  // drop-shadow statt box-shadow: folgt der geclippten Silhouette exakt und
  // wird selbst nicht vom eigenen clip-path mit abgeschnitten.
  assert.match(baseBlock, /filter:\s*\n\s*drop-shadow\(0 0 1px rgba\(43, 28, 13, 0\.85\)\)\s*\n\s*drop-shadow\(0 0 1\.5px rgba\(43, 28, 13, 0\.5\)\)\s*\n\s*drop-shadow\(3px 5px 8px rgba\(90, 60, 20, 0\.22\)\);/);
  // Drei zyklische Varianten, wie bei den Dashboard-Karten (Abschnitt 9) —
  // nur die Drehung unterscheidet sie, die Rissform ist überall gleich.
  assert.match(css, /\[data-theme="papier"\] \.wochen-kachel:nth-child\(3n\+2\) \{\s*\n\s*transform: rotate\(0\.7deg\) !important;/);
  assert.match(css, /\[data-theme="papier"\] \.wochen-kachel:nth-child\(3n\+3\) \{\s*\n\s*transform: rotate\(-0\.5deg\) !important;/);
});

test('Papierheft-Retro: Biss-Tiefe entlang der Kanten bleibt sicher innerhalb des kleinsten Innenabstands (kein Zellenmenü-Clipping)', () => {
  // clip-path erzeugt einen eigenen Stacking-Context und würde das schwebende
  // quill-table-better-Zellenmenü mit-clippen, wenn ein Kanten-Biss zu tief
  // wird (siehe Kommentar in Abschnitt 10). Sicherheits-Obergrenze: 8px,
  // sicher unter der schmalsten Innenabstand-Stelle im Baum (12px, --sp-3).
  // Der 38px-Eckschnitt oben links ist davon ausgenommen (siehe eigener Test
  // unten) — er liegt immer im Kachel-Header, nie im Editor.
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const baseBlock = css.match(/\[data-theme="papier"\] \.wochen-kachel \{[\s\S]*?\n\}/)[0];
  const polygonBlock = baseBlock.match(/clip-path: polygon\(([\s\S]*?)\);/)[1];
  const pxDepths = [...polygonBlock.matchAll(/(?:^|[\s(])(\d+)px/gm)]
    .map(m => Number(m[1]))
    .filter(n => n !== 38 && n !== 0); // 38px/0px = die eingerollte Ecke, kein Kanten-Biss
  assert.ok(pxDepths.length > 0, 'keine Kanten-Biss-Tiefen im Polygon gefunden');
  assert.ok(pxDepths.every(d => d <= 8), `Kanten-Biss über 8px gefunden: ${pxDepths.filter(d => d > 8)}`);
});

test('Papierheft-Retro: eingerollte Ecke oben links füllt die abgeschnittene Dreiecksfläche', () => {
  // Der Polygon-Pfad schneidet die Ecke selbst per Diagonale ab (38px);
  // ::after füllt exakt diese Fläche mit einer hellen Papier-Rückseite +
  // Schlagschatten – das "Eselsohr" liegt damit in der tatsächlichen
  // Kachelform, nicht nur als Overlay obendrauf.
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const baseBlock = css.match(/\[data-theme="papier"\] \.wochen-kachel \{[\s\S]*?\n\}/)[0];
  assert.match(baseBlock, /38px 0px,/);
  assert.match(baseBlock, /0px 38px\s*\);/);
  const afterBlock = css.match(/\[data-theme="papier"\] \.wochen-kachel::after \{[\s\S]*?\n\}/)[0];
  assert.match(afterBlock, /top: 0;/);
  assert.match(afterBlock, /left: 0;/);
  assert.match(afterBlock, /clip-path: polygon\(0 0, 100% 0, 0 100%\);/);
  assert.match(afterBlock, /box-shadow:/);
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
