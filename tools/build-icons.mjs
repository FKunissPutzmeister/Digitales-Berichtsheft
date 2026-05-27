/* ===================================================================
   build-icons.mjs  —  Generator für app/js/icons.js
   -------------------------------------------------------------------
   Lädt die benötigten Icons aus dem Solar-Set über die Iconify-API
   und bettet sie als Inline-SVG in eine zentrale Registry ein
   → app/js/icons.js (offline, kein CDN zur Laufzeit).

   Solar Icon Set: © 480 Design, lizenziert unter CC BY 4.0
   (https://github.com/480-Design/Solar-Icon-Set) – via Iconify.

   STIL UMSCHALTEN: unten STYLE ändern und `node tools/build-icons.mjs`
   (aus dem Repo-Root) ausführen. Mögliche Solar-Stile u.a.:
     'linear'  (Outline, dünn)        → stroke-basiert  [aktuell]
     'outline' (Outline, etwas fetter) → stroke-basiert
     'bold'    (gefüllt, solid)        → fill-basiert
     'bold-duotone' (Duotone)          → fill-basiert
   Der Wrapper unten setzt fill/stroke automatisch passend zum Stil.

   Neues Icon hinzufügen: Eintrag in MAP ergänzen (Basisname OHNE
   Stil-Suffix) und neu ausführen.
   =================================================================== */
import fs from 'node:fs';
import path from 'node:path';

const STYLE = 'linear';

// semantischer Name  →  Solar-Icon-Basisname (ohne Stil-Suffix)
const MAP = {
  // Navigation
  dashboard:    'widget-5',
  wochenansicht:'notebook',
  jahresansicht:'calendar',
  verwaltung:   'folder-with-files',
  planer:       'users-group-rounded',
  // Profil / Stammdaten
  user:         'user',
  cap:          'square-academic-cap-2',
  document:     'document-text',
  building:     'buildings-2',
  briefcase:    'case-minimalistic',
  clock:        'clock-circle',
  users:        'users-group-two-rounded',
  mail:         'letter',
  calendar:     'calendar',
  logout:       'logout-3',
  lock:         'lock-password',
  // Zeitnachweis-Import
  upload:       'cloud-upload',
  question:     'question-circle',
  // Feedback / Status / allgemein
  info:         'info-circle',
  success:      'check-circle',
  warning:      'danger-triangle',
  bell:         'bell',
  chart:        'chart-2',
  clipboard:    'clipboard-list',
  edit:         'pen-2',
  trash:        'trash-bin-trash',
  add:          'add-circle',
  home:         'home-smile',
  hourglass:    'hourglass-line',
  inbox:        'inbox-line',
  refresh:      'refresh-circle',
  search:       'magnifer',
  download:     'download-minimalistic',
  paperclip:    'paperclip',
};

const isStroke = /linear|outline|broken|line-duotone/.test(STYLE);
const API = base => `https://api.iconify.design/solar/${base}-${STYLE}.svg`;

function innerOf(svg) {
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
}

const icons = {};
let failed = 0;
for (const [key, base] of Object.entries(MAP)) {
  try {
    const res = await fetch(API(base));
    if (!res.ok) { console.log('FAIL', key, base, res.status); failed++; continue; }
    icons[key] = innerOf(await res.text());
    console.log('OK  ', key.padEnd(14), `${base}-${STYLE}`);
  } catch (e) {
    console.log('FAIL', key, base, e.message); failed++;
  }
}

// Wrapper-Attribute passend zum Stil: Outline = stroke, Solid/Duotone = fill.
const svgAttrs = isStroke
  ? 'fill="none" stroke="currentColor" stroke-width="1.5"'
  : 'fill="currentColor"';

const header = `/* ===================================================================
   ICONS.JS  —  zentrale Icon-Registry (AUTO-GENERIERT)
   -------------------------------------------------------------------
   Nicht von Hand bearbeiten. Stattdessen tools/build-icons.mjs anpassen
   (Stil/Icons) und neu ausführen.

   Stil: Solar "${STYLE}". Icons aus dem Solar Icon Set, © 480 Design,
   lizenziert unter CC BY 4.0 — via Iconify (api.iconify.design).

   Verwendung:  Icon('user')                → <svg …>…</svg>
                Icon('user', { size: 18 })   → andere Größe
                Icon('user', { cls: 'foo' }) → zusätzliche CSS-Klasse
   =================================================================== */`;

let js = header + '\n(function (global) {\n  \'use strict\';\n\n  const ICONS = {\n';
for (const [key, inner] of Object.entries(icons)) {
  js += `    ${JSON.stringify(key)}: ${JSON.stringify(inner)},\n`;
}
js += `  };

  function Icon(name, opts) {
    opts = opts || {};
    const inner = ICONS[name];
    if (!inner) { console.warn('[Icon] unbekanntes Icon:', name); return ''; }
    const size = opts.size || 24;
    const cls  = 'icon' + (opts.cls ? ' ' + opts.cls : '');
    return '<svg class="' + cls + '" viewBox="0 0 24 24" width="' + size + '" height="' + size +
           '" ${svgAttrs} aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  global.Icon = Icon;
  global.ICONS = ICONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Icon, ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
`;

const outPath = path.join('app', 'js', 'icons.js');
fs.writeFileSync(outPath, js, 'utf8');
console.log(`\nWROTE ${outPath} — ${Object.keys(icons).length} Icons (Stil: ${STYLE}), ${failed} Fehler.`);
