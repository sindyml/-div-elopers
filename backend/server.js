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
    let credentials = null;
    
    // Check for Render secret file first
    const renderSecretPath = '/etc/secrets/service-account-key.json';
    if (fs.existsSync(renderSecretPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(renderSecretPath, 'utf8'));
      credentials = admin.credential.cert(serviceAccount);
      console.log('✅ Firebase Admin initialized from Render secret file');
    }
    // Fallback to local file for development
    else {
      const localPath = path.join(__dirname, '..', 'service-account-key.json');
      if (fs.existsSync(localPath)) {
        const serviceAccount = require(localPath);
        credentials = admin.credential.cert(serviceAccount);
        console.log('✅ Firebase Admin initialized from local file');
      }
    }
    
    if (credentials) {
      admin.initializeApp({
        credential: credentials,
        projectId: process.env.FIREBASE_PROJECT_ID || 'stokvel-database'
      });
    } else {
      console.warn('⚠️ No Firebase credentials found. Running in demo mode.');
      admin.initializeApp({ projectId: 'demo-project' });
    }
    
  } catch (err) {
    console.warn('⚠️ Firebase Admin init failed:', err.message);
    admin.initializeApp({ projectId: 'demo-project' });
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
     /api/stripe-webhook - Stripe Webhook
     ⚠️  MUST be before /api/payments/* so the raw body is read unparsed.
     Stripe needs the raw body bytes to verify the signature.
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/stripe-webhook' && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        const sig = req.headers['stripe-signature'];
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
          console.error('❌ STRIPE_WEBHOOK_SECRET env var is not set');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook secret not configured' }));
          return;
        }

        let event;
        try {
          event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (err) {
          console.error('❌ Webhook signature verification failed:', err.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature' }));
          return;
        }

        console.log(`📩 Stripe webhook received: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const { paymentId, userId, contributionId, groupId } = session.metadata || {};

          console.log(`✅ Payment completed — paymentId: ${paymentId}, contributionId: ${contributionId}`);

          // 1. Update transaction to completed
          if (paymentId) {
            await db.collection('transactions').doc(paymentId).update({
              status: 'completed',
              stripeSessionId: session.id,
              stripePaymentIntentId: session.payment_intent,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              completedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Transaction updated to completed:', paymentId);
          }

          // 2. Update contribution to 'paid'
          // FIX: was 'confirmed' — frontend filters for 'paid' so it never disappeared
          if (contributionId) {
            await db.collection('contributions').doc(contributionId).update({
              status: 'paid',
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
              transactionId: paymentId || null
            });
            console.log('✅ Contribution updated to paid:', contributionId);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));

      } catch (error) {
        console.error('❌ Stripe webhook error:', error);
        // Return 500 so Stripe retries the webhook
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
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
      apiKey:            process.env.FIREBASE_API_KEY            || '',
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
      databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
      projectId:         process.env.FIREBASE_PROJECT_ID         || '',
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId:             process.env.FIREBASE_APP_ID             || '',
      measurementId:     process.env.FIREBASE_MEASUREMENT_ID     || '',
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify(config));
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/create-checkout-session - Stripe Checkout (legacy direct route)
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/create-checkout-session' && req.method === 'POST') {
    setCORSHeaders(res);
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { amount, groupName, contributionId, groupId, returnUrl, cancelUrl } = JSON.parse(body);
        
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Authentication required' }));
          return;
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        
        if (!amount || amount <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid amount' }));
          return;
        }
        
        const paymentRef = db.collection('transactions').doc();
        const paymentId = paymentRef.id;
        
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'zar',
              product_data: { name: `${groupName || 'Stokvel'} - Contribution` },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: returnUrl,
          cancel_url: cancelUrl,
          metadata: { paymentId, userId, contributionId, groupId }
        });
        
        await paymentRef.set({
          id: paymentId,
          userId: userId,
          contributionId: contributionId || null,
          groupId: groupId || null,
          amount: amount,
          currency: 'ZAR',
          status: 'pending',
          type: 'payment',
          provider: 'stripe',
          stripeSessionId: session.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, paymentId, sessionId: session.id, url: session.url }));
        
      } catch (error) {
        console.error('Stripe checkout error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  /* ── API: /api/set-user-role ── */
  if (urlPath === '/api/set-user-role' && req.method === 'POST') {
    setCORSHeaders(res);
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { uid, role } = JSON.parse(body);
        
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        
        const token = authHeader.split('Bearer ')[1];
        await admin.auth().verifyIdToken(token);
        
        await admin.auth().setCustomUserClaims(uid, { role: role });
        
        await db.collection('users').doc(uid).update({
          role: role,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Role ${role} set for user ${uid}` }));
      } catch (error) {
        console.error('Error setting role:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
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
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ StokPal server running → http://localhost:${PORT}`);
  console.log(`💳 Payment API:    http://localhost:${PORT}/api/payments/`);
  console.log(`📦 Payout API:     http://localhost:${PORT}/api/payouts/`);
  console.log(`🔄 Stripe Webhook: http://localhost:${PORT}/api/stripe-webhook`);
});
