// server.js — lightweight static file server for Azure Web App
// Serves all HTML/CSS/JS files from the project root

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const PORT    = process.env.PORT || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  // Sanitise URL — strip query strings and prevent directory traversal
  let urlPath = req.url.split('?')[0];
  urlPath = decodeURIComponent(urlPath).replace(/\.\./g, '');

  // Default to index.html for root
  if (urlPath === '/') urlPath = '/index.html';

  // If URL has no extension, try adding .html (clean URLs)
  const ext = path.extname(urlPath);
  if (!ext) urlPath = urlPath + '.html';

  const filePath = path.join(__dirname, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // File not found — serve index.html (SPA-style fallback)
      fs.readFile(path.join(__dirname, 'index.html'), (err2, fallback) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }

    const mimeType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`StokPal server running on port ${PORT}`);
});