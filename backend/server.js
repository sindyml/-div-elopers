// server.js — Static file server with Payment API integration
// Serves all HTML/CSS/JS files from the frontend/ directory
// Also provides /api/getSAData proxy for Frankfurter API (CORS fallback)
// And /api/payments/* endpoints for Yoco payment processing

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const admin   = require('firebase-admin');
const PORT    = process.env.PORT || 8080;

// Import payment routes
const paymentRoutes = require('./api/payments');

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  // Check if running in Azure with environment variables
  if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } else {
    // Local development - use service account key file
    try {
      const serviceAccount = require('../firebase/service-account-key.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (error) {
      console.warn('Firebase Admin not initialized. Payment features will be limited.');
    }
  }
}

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

// Helper to parse JSON body for POST requests
function parseJSONBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      callback(null, body ? JSON.parse(body) : {});
    } catch (error) {
      callback(error, null);
    }
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ── API: /api/payments/* - Payment endpoints ─────────────────
  if (urlPath.startsWith('/api/payments/')) {
    // Extract the payment endpoint path (remove /api/payments)
    const paymentPath = urlPath.replace('/api/payments', '');
    
    // Create a fake Express-like request object for our payment routes
    const fakeReq = {
      method: req.method,
      url: paymentPath,
      headers: req.headers,
      body: null,
      params: {},
      query: {},
      user: null,
    };
    
    const fakeRes = {
      statusCode: 200,
      headers: {},
      json: (data) => {
        fakeRes.setHeader('Content-Type', 'application/json');
        fakeRes.end(JSON.stringify(data));
      },
      status: (code) => {
        fakeRes.statusCode = code;
        return fakeRes;
      },
      setHeader: (key, value) => {
        fakeRes.headers[key] = value;
      },
      end: (data) => {
        fakeRes.headers['Content-Type'] = fakeRes.headers['Content-Type'] || 'application/json';
        Object.keys(fakeRes.headers).forEach(key => {
          res.setHeader(key, fakeRes.headers[key]);
        });
        res.writeHead(fakeRes.statusCode);
        res.end(data);
      },
      getHeader: (key) => fakeRes.headers[key],
    };
    
    // Parse body for POST/PUT requests
    if (req.method === 'POST' || req.method === 'PUT') {
      parseJSONBody(req, (err, body) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        fakeReq.body = body;
        
        // Add helper to get params
        fakeReq.params = {};
        const match = paymentPath.match(/\/status\/(.+)$/);
        if (match) fakeReq.params.paymentId = match[1];
        
        const historyMatch = paymentPath.match(/\/history\/(.+)$/);
        if (historyMatch) fakeReq.params.userId = historyMatch[1];
        
        // Call payment route handler
        paymentRoutes(fakeReq, fakeRes);
      });
    } else {
      // Handle GET requests
      fakeReq.body = {};
      
      // Parse query parameters
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      fakeReq.query = Object.fromEntries(urlObj.searchParams);
      
      // Extract params from URL
      fakeReq.params = {};
      const match = paymentPath.match(/\/status\/(.+)$/);
      if (match) fakeReq.params.paymentId = match[1];
      
      const historyMatch = paymentPath.match(/\/history\/(.+)$/);
      if (historyMatch) fakeReq.params.userId = historyMatch[1];
      
      // Call payment route handler
      paymentRoutes(fakeReq, fakeRes);
    }
    return;
  }

  // ── API: /api/getFirebaseConfig ────────────────────────────
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
  if (urlPath === '/api/getSAData' && req.method === 'GET') {
    const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';

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
  let staticPath = decodeURIComponent(urlPath).replace(/\.\./g, '');

  if (staticPath === '/') staticPath = '/index.html';

  const ext = path.extname(staticPath);
  if (!ext) staticPath = staticPath + '.html';

  const filePath = path.join(FRONTEND_DIR, staticPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
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
  console.log(`Payment API available at: http://localhost:${PORT}/api/payments/`);
});