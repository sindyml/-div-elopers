// server.js — lightweight static file server for Azure Web App
// Serves all HTML/CSS/JS files from the frontend/ directory
// Also provides /api/getSAData proxy for Frankfurter API (CORS fallback)

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const PORT    = process.env.PORT || 8080;

// Resolve the frontend directory (one level up from backend/)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

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

// Helper: send static SA data when Frankfurter API is unreachable
function sendFallbackSAData(res, saStatic) {
  const payload = {
    primeRate:      saStatic.primeRate,
    inflationRate:  saStatic.inflationRate,
    repoRate:       saStatic.repoRate,
    usdZar:         18.50,
    source:         'Static fallback (server proxy)',
    lastUpdated:    saStatic.lastUpdated,
    isFallback:     true,
  };
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ── API: /api/getFirebaseConfig ────────────────────────────
  // Returns Firebase client config from environment variables.
  // Mirrors the Azure Function in backend/api/getFirebaseConfig/.
  if (urlPath === '/api/getFirebaseConfig' && req.method === 'GET') {
    const config = {
      apiKey:            process.env.FIREBASE_API_KEY            || '',
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
      databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
      projectId:         process.env.FIREBASE_PROJECT_ID         || '',
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId:             process.env.FIREBASE_APP_ID             || '',
      measurementId:     process.env.FIREBASE_MEASUREMENT_ID     || '',
    };

    if (!config.apiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Firebase configuration is not set. Add FIREBASE_* environment variables.' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify(config));
    return;
  }

  // ── API proxy: /api/getSAData ──────────────────────────────
  // Proxies Frankfurter API server-side to avoid browser CORS issues.
  if (urlPath === '/api/getSAData' && req.method === 'GET') {
    const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';

    // SA rates (updated each sprint — SARB MPC decision)
    const SA_STATIC = {
      primeRate:      10.25,
      inflationRate:   4.0,
      repoRate:        6.75,
      lastUpdated:    'March 2026',
    };

    const apiReq = https.get(FRANKFURTER_URL, { timeout: 5000 }, (apiRes) => {
      let body = '';
      apiRes.on('data', (chunk) => { body += chunk; });
      apiRes.on('end', () => {
        try {
          const data = JSON.parse(body);
          const usdZar = data.rates?.ZAR ?? 18.50;
          const payload = {
            primeRate:      SA_STATIC.primeRate,
            inflationRate:  SA_STATIC.inflationRate,
            repoRate:       SA_STATIC.repoRate,
            usdZar:         usdZar,
            rates:          data.rates,
            date:           data.date,
            source:         'Frankfurter API via server proxy',
            lastUpdated:    SA_STATIC.lastUpdated,
            isFallback:     false,
          };
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(payload));
        } catch {
          sendFallbackSAData(res, SA_STATIC);
        }
      });
    });

    apiReq.on('error', () => { sendFallbackSAData(res, SA_STATIC); });
    apiReq.on('timeout', () => { apiReq.destroy(); sendFallbackSAData(res, SA_STATIC); });
    return;
  }

  // ── Static file serving ────────────────────────────────────
  // Sanitise URL — strip query strings and prevent directory traversal
  let staticPath = decodeURIComponent(urlPath).replace(/\.\./g, '');

  // Default to index.html for root
  if (staticPath === '/') staticPath = '/index.html';

  // If URL has no extension, try adding .html (clean URLs)
  const ext = path.extname(staticPath);
  if (!ext) staticPath = staticPath + '.html';

  const filePath = path.join(FRONTEND_DIR, staticPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // File not found — serve index.html (SPA-style fallback)
      fs.readFile(path.join(FRONTEND_DIR, 'index.html'), (err2, fallback) => {
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