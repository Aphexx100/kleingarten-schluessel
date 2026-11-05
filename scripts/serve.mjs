/* Kleiner Entwicklungsserver.

   ES-Module laden nicht ueber file:// — die Seite braucht also einen Server,
   auch wenn sie sonst nichts davon will. Kein Neuladen bei Aenderungen,
   kein Zwischenspeicher: Datei speichern, Browser aktualisieren, fertig.

   Aufruf:  node scripts/serve.mjs  [Port] */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

http
  .createServer((req, res) => {
    const angefragt = decodeURIComponent(req.url.split('?')[0]);
    const p = path.join(WURZEL, angefragt);
    /* Nicht aus dem Projektordner herauslassen. */
    if (!p.startsWith(WURZEL)) {
      res.writeHead(403);
      res.end('verboten');
      return;
    }
    const datei = angefragt.endsWith('/') ? path.join(p, 'index.html') : p;
    fs.readFile(datei, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('nicht gefunden');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}/`));
