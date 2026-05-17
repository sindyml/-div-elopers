// server.js — Static file server + Gemini Agent + Payment + Payout API
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

require('dotenv').config();

const PORT = process.env.PORT || 8080;

// ── CORS Helper ───────────────────────────────────────────────────────────────
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Firebase Admin ────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId:  process.env.FIREBASE_PROJECT_ID,
      });
      console.log('✅ Firebase Admin initialized');
    } else {
      admin.initializeApp({ projectId: 'demo-project' });
      console.log('⚠️  Firebase Admin in demo mode (no real auth)');
    }
  } catch (err) {
    console.warn('⚠️  Firebase Admin init failed:', err.message);
  }
}

const db = admin.firestore();

// ── Routes ────────────────────────────────────────────────────────────────────
const paymentRoutes = require('./api/payments/index.js');
const payoutRoutes  = require('./api/payouts/index.js');

// ── Static files ──────────────────────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const MIME_TYPES = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.json':  'application/json',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
};

function parseJSONBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { callback(null, body ? JSON.parse(body) : {}); }
    catch (err) { callback(err, null); }
  });
}

function jsonError(res, status, message) {
  setCORSHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // CORS preflight for ALL API routes
  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    setCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/payments/* - Payment endpoints
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath.startsWith('/api/payments/')) {
    const paymentPath = urlPath.replace('/api/payments', '');
    
    const fakeReq = { method: req.method, url: paymentPath, headers: req.headers, body: null, params: {}, query: {}, user: null };
    const fakeRes = {
      statusCode: 200, headers: {},
      json: (data) => { 
        setCORSHeaders(res);
        fakeRes.setHeader('Content-Type', 'application/json'); 
        fakeRes.end(JSON.stringify(data)); 
      },
      status: (code) => { fakeRes.statusCode = code; return fakeRes; },
      setHeader: (key, value) => { fakeRes.headers[key] = value; },
      end: (data) => { 
        fakeRes.headers['Content-Type'] = fakeRes.headers['Content-Type'] || 'application/json'; 
        Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k]));
        setCORSHeaders(res);
        res.writeHead(fakeRes.statusCode); 
        res.end(data); 
      },
      getHeader: (key) => fakeRes.headers[key],
    };
    
    const parseAndRoute = (body = {}) => {
      fakeReq.body = body;
      const match = paymentPath.match(/\/status\/(.+)$/);
      const historyMatch = paymentPath.match(/\/history\/(.+)$/);
      if (match) fakeReq.params.paymentId = match[1];
      if (historyMatch) fakeReq.params.userId = historyMatch[1];
      paymentRoutes(fakeReq, fakeRes);
    };
    
    if (req.method === 'POST' || req.method === 'PUT') {
      parseJSONBody(req, (err, body) => { if (err) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; } parseAndRoute(body); });
    } else { parseAndRoute(); }
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/payouts/* - Payout endpoints
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath.startsWith('/api/payouts/')) {
    const payoutPath = urlPath.replace('/api/payouts', '');
    
    const processRequest = (fakeReq, fakeRes) => { payoutRoutes(fakeReq, fakeRes); };
    
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsedBody = {};
        try { parsedBody = body ? JSON.parse(body) : {}; } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
        const fakeReq = { method: req.method, url: payoutPath, headers: req.headers, body: parsedBody, params: {}, query: {} };
        const fakeRes = { 
          headersSent: false, statusCode: 200, headers: {}, 
          json: (data) => { 
            if (fakeRes.headersSent) return; 
            fakeRes.headersSent = true; 
            setCORSHeaders(res);
            fakeRes.setHeader('Content-Type', 'application/json'); 
            fakeRes.end(JSON.stringify(data)); 
          }, 
          status: (code) => { fakeRes.statusCode = code; return fakeRes; }, 
          setHeader: (key, value) => { fakeRes.headers[key] = value; }, 
          end: (data) => { 
            if (fakeRes.headersSent) return; 
            fakeRes.headersSent = true; 
            Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k]));
            setCORSHeaders(res);
            res.writeHead(fakeRes.statusCode); 
            res.end(data); 
          } 
        };
        processRequest(fakeReq, fakeRes);
      });
      return;
    } else {
      const fakeReq = { method: req.method, url: payoutPath, headers: req.headers, body: {}, params: {}, query: {} };
      const fakeRes = { 
        headersSent: false, statusCode: 200, headers: {}, 
        json: (data) => { 
          if (fakeRes.headersSent) return; 
          fakeRes.headersSent = true; 
          setCORSHeaders(res);
          fakeRes.setHeader('Content-Type', 'application/json'); 
          fakeRes.end(JSON.stringify(data)); 
        }, 
        status: (code) => { fakeRes.statusCode = code; return fakeRes; }, 
        setHeader: (key, value) => { fakeRes.headers[key] = value; }, 
        end: (data) => { 
          if (fakeRes.headersSent) return; 
          fakeRes.headersSent = true; 
          Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k]));
          setCORSHeaders(res);
          res.writeHead(fakeRes.statusCode); 
          res.end(data); 
        } 
      };
      processRequest(fakeReq, fakeRes);
    }
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/getFirebaseConfig
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/getFirebaseConfig' && req.method === 'GET') {
    setCORSHeaders(res);
    const config = {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      databaseURL: process.env.FIREBASE_DATABASE_URL || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || '',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify(config));
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     Static file serving
     ──────────────────────────────────────────────────────────────────────────── */
  let staticPath = decodeURIComponent(urlPath).replace(/\.\./g, '');
  if (staticPath === '/') staticPath = '/index.html';
  const ext = path.extname(staticPath);
  if (!ext) staticPath += '.html';
  const filePath = path.join(FRONTEND_DIR, staticPath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(FRONTEND_DIR, 'index.html'), (err2, fallback) => {
        if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    const mimeType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ StokPal server running → http://localhost:${PORT}`);
  console.log(`💳 Payment API:   http://localhost:${PORT}/api/payments/`);
  console.log(`📦 Payout API:    http://localhost:${PORT}/api/payouts/`);
});
