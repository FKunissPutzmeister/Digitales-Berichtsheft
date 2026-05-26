/* Mini-Static-Server als Ersatz für Live Server.
   Läuft auf Port 5500 und serviert das aktuelle Verzeichnis als Root —
   damit URLs wie http://127.0.0.1:5500/app/dashboard.html funktionieren.
   Ohne Auto-Reload, dafür ohne Abhängigkeiten. */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 5500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(ROOT, urlPath);

  // Path-traversal Schutz
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',          // Browser-Cache hart deaktivieren
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('Serving ' + ROOT + ' on http://127.0.0.1:' + PORT + '/');
});
