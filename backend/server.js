// server.js — Static file server + Gemini Agent with Firestore tool-calling
// + Payment & Payout API endpoints
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

require('dotenv').config();

const PORT = process.env.PORT || 8080;

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

/* ══════════════════════════════════════════════════════════════════════════════
   GEMINI AGENT — TOOL DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════════ */
const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_group_balance',
        description: 'Get the total confirmed contributions (balance) for a stokvel group.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
          },
          required: ['groupId'],
        },
      },
      {
        name: 'get_payout_schedule',
        description: 'Get the full payout schedule for a group.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
          },
          required: ['groupId'],
        },
      },
      {
        name: 'get_upcoming_meetings',
        description: 'Get upcoming scheduled meetings for one or more groups.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Array of Firestore group document IDs' },
          },
          required: ['groupIds'],
        },
      },
      {
        name: 'get_my_contributions',
        description: 'Get the contribution history for the current user in a specific group.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
            userId:  { type: 'STRING', description: 'The Firebase UID of the user' },
          },
          required: ['groupId', 'userId'],
        },
      },
      {
        name: 'get_group_members',
        description: 'Get the list of members in a group with their roles.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
          },
          required: ['groupId'],
        },
      },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════════
   TOOL EXECUTOR
   ══════════════════════════════════════════════════════════════════════════════ */
async function executeTool(toolName, args) {
  try {
    switch (toolName) {
      case 'get_group_balance': {
        const snap = await db.collection('contributions').where('groupId', '==', args.groupId).where('status', '==', 'confirmed').get();
        const total = snap.docs.reduce((s, d) => s + (Number(d.data().amount) || 0), 0);
        return { groupId: args.groupId, totalConfirmedAmountRands: total, confirmedContributions: snap.docs.length, currency: 'ZAR' };
      }
      case 'get_payout_schedule': {
        const snap = await db.collection('payouts').where('groupId', '==', args.groupId).orderBy('order', 'asc').get();
        const payouts = snap.docs.map(d => ({ order: d.data().order, memberName: d.data().userDisplayName || 'Unknown', amountRands: d.data().amount || 0 }));
        return { groupId: args.groupId, payouts };
      }
      case 'get_upcoming_meetings': {
        const today = new Date().toISOString().slice(0, 10);
        const snap = await db.collection('meetings').where('groupId', 'in', (args.groupIds || []).slice(0, 10)).where('date', '>=', today).orderBy('date', 'asc').limit(5).get();
        const meetings = snap.docs.map(d => ({ title: d.data().title, date: d.data().date, time: d.data().time, location: d.data().location }));
        return { meetings, count: meetings.length };
      }
      case 'get_my_contributions': {
        const snap = await db.collection('contributions').where('groupId', '==', args.groupId).where('userId', '==', args.userId).orderBy('date', 'desc').limit(20).get();
        const contributions = snap.docs.map(d => ({ amount: d.data().amount, date: d.data().date, status: d.data().status }));
        const total = contributions.filter(c => c.status === 'confirmed').reduce((s, c) => s + (Number(c.amount) || 0), 0);
        return { userId: args.userId, groupId: args.groupId, contributions, totalConfirmedRands: total };
      }
      case 'get_group_members': {
        const snap = await db.collection(`groups/${args.groupId}/members`).get();
        const members = snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName || 'Member', role: d.data().role || 'member' }));
        return { groupId: args.groupId, memberCount: members.length, members };
      }
      default: return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[Agent] Tool "${toolName}" error:`, err.message);
    return { error: err.message };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   OFFLINE FALLBACK
   ══════════════════════════════════════════════════════════════════════════════ */
async function offlineFallback({ userMessage, groupId, uid, groupIds }) {
  const msg = userMessage.toLowerCase();
  async function tryTool(name, args) { try { return await executeTool(name, args); } catch { return null; } }
  if (msg.includes('balance') && groupId) {
    const data = await tryTool('get_group_balance', { groupId });
    if (data) return `💰 Your group balance is **R ${Number(data.totalConfirmedAmountRands).toLocaleString('en-ZA')}**.`;
  }
  if ((msg.includes('payout') || msg.includes('turn')) && groupId) {
    const data = await tryTool('get_payout_schedule', { groupId });
    if (data?.payouts?.[0]) return `📅 Next payout: ${data.payouts[0].memberName} receives R ${data.payouts[0].amountRands}.`;
  }
  if (msg.includes('meeting')) {
    const ids = groupIds?.length ? groupIds : (groupId ? [groupId] : []);
    const data = await tryTool('get_upcoming_meetings', { groupIds: ids });
    if (data?.meetings?.[0]) return `🗓 Next meeting: ${data.meetings[0].title} on ${data.meetings[0].date}.`;
  }
  return 'I can help with group balance, payouts, meetings, contributions, and member lists. Please select a group first.';
}

/* ══════════════════════════════════════════════════════════════════════════════
   GEMINI AGENT LOOP
   ══════════════════════════════════════════════════════════════════════════════ */
const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];

async function callGeminiOnce({ model, systemText, contents, apiKey, maxOutputTokens }) {
  const endpoint = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = JSON.stringify({ ...(systemText && { system_instruction: { parts: [{ text: systemText }] } }), contents, tools: AGENT_TOOLS, generationConfig: { maxOutputTokens, temperature: 0.7 } });
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'generativelanguage.googleapis.com', path: endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Parse error')); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runGeminiAgent({ systemText, contents, apiKey, maxOutputTokens = 1000, groupId, uid, groupIds }) {
  for (const model of GEMINI_MODELS) {
    try {
      const res = await callGeminiOnce({ model, systemText, contents, apiKey, maxOutputTokens });
      if (res.error) continue;
      const parts = res?.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts.filter(p => p.functionCall);
      if (!functionCalls.length) return parts.filter(p => p.text).map(p => p.text).join('') || 'No response.';
      const results = await Promise.all(functionCalls.map(async (part) => {
        const { name, args } = part.functionCall;
        const result = await executeTool(name, args || {});
        return { functionResponse: { name, response: { content: result } } };
      }));
      const finalRes = await callGeminiOnce({ model, systemText, contents: [...contents, { role: 'model', parts }, { role: 'user', parts: results }], apiKey, maxOutputTokens });
      return finalRes?.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('') || 'Done.';
    } catch (err) { continue; }
  }
  const lastUserMessage = [...contents].reverse().find(c => c.role === 'user')?.parts?.[0]?.text || '';
  return await offlineFallback({ userMessage: lastUserMessage, groupId, uid, groupIds });
}

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════════ */
function parseJSONBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => { try { callback(null, body ? JSON.parse(body) : {}); } catch (err) { callback(err, null); } });
}

function jsonError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: message }));
}

/* ══════════════════════════════════════════════════════════════════════════════
   HTTP SERVER
   ══════════════════════════════════════════════════════════════════════════════ */
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/chat — Gemini Agent
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/chat' && req.method === 'POST') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { jsonError(res, 500, 'GEMINI_API_KEY missing'); return; }
    parseJSONBody(req, async (err, body) => {
      if (err) { jsonError(res, 400, 'Invalid JSON'); return; }
      const systemText = body.system || '';
      const messages = body.messages || [];
      const groupId = body.groupId || null;
      const uid = body.uid || null;
      const groupIds = body.groupIds || (groupId ? [groupId] : []);
      const agentSystem = `You are a StokPal assistant. You have real-time data access. Be concise. Current group: ${groupId || 'none'}. User: ${uid || 'unknown'}.`;
      const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      try {
        const text = await runGeminiAgent({ systemText: agentSystem, contents, apiKey, maxOutputTokens: body.max_tokens || 1000, groupId, uid, groupIds });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ content: [{ type: 'text', text }] }));
      } catch (agentErr) { jsonError(res, 502, agentErr.message); }
    });
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/payments/* — YOUR PAYMENT ENDPOINTS
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath.startsWith('/api/payments/')) {
    const paymentPath = urlPath.replace('/api/payments', '');
    const fakeReq = { method: req.method, url: paymentPath, headers: req.headers, body: null, params: {}, query: {}, user: null };
    const fakeRes = {
      statusCode: 200, headers: {},
      json: (data) => { fakeRes.setHeader('Content-Type', 'application/json'); fakeRes.end(JSON.stringify(data)); },
      status: (code) => { fakeRes.statusCode = code; return fakeRes; },
      setHeader: (key, value) => { fakeRes.headers[key] = value; },
      end: (data) => { fakeRes.headers['Content-Type'] = fakeRes.headers['Content-Type'] || 'application/json'; Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k])); res.writeHead(fakeRes.statusCode); res.end(data); },
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
     /api/payouts/* — YOUR PAYOUT ENDPOINTS
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath.startsWith('/api/payouts/')) {
    const payoutPath = urlPath.replace('/api/payouts', '');
    const processPayoutRequest = (fakeReq, fakeRes) => { payoutRoutes(fakeReq, fakeRes); };
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsedBody = {};
        try { parsedBody = body ? JSON.parse(body) : {}; } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
        const fakeReq = { method: req.method, url: payoutPath, headers: req.headers, body: parsedBody, params: {}, query: {} };
        const fakeRes = { headersSent: false, statusCode: 200, headers: {}, json: (data) => { if (fakeRes.headersSent) return; fakeRes.headersSent = true; fakeRes.setHeader('Content-Type', 'application/json'); fakeRes.end(JSON.stringify(data)); }, status: (code) => { fakeRes.statusCode = code; return fakeRes; }, setHeader: (key, value) => { fakeRes.headers[key] = value; }, end: (data) => { if (fakeRes.headersSent) return; fakeRes.headersSent = true; Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k])); res.writeHead(fakeRes.statusCode); res.end(data); } };
        processPayoutRequest(fakeReq, fakeRes);
      });
      return;
    } else {
      const fakeReq = { method: req.method, url: payoutPath, headers: req.headers, body: {}, params: {}, query: {} };
      const fakeRes = { headersSent: false, statusCode: 200, headers: {}, json: (data) => { if (fakeRes.headersSent) return; fakeRes.headersSent = true; fakeRes.setHeader('Content-Type', 'application/json'); fakeRes.end(JSON.stringify(data)); }, status: (code) => { fakeRes.statusCode = code; return fakeRes; }, setHeader: (key, value) => { fakeRes.headers[key] = value; }, end: (data) => { if (fakeRes.headersSent) return; fakeRes.headersSent = true; Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k])); res.writeHead(fakeRes.statusCode); res.end(data); } };
      processPayoutRequest(fakeReq, fakeRes);
    }
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/getFirebaseConfig
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/getFirebaseConfig' && req.method === 'GET') {
    const config = { apiKey: process.env.FIREBASE_API_KEY || '', authDomain: process.env.FIREBASE_AUTH_DOMAIN || '', databaseURL: process.env.FIREBASE_DATABASE_URL || '', projectId: process.env.FIREBASE_PROJECT_ID || '', storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '', messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '', appId: process.env.FIREBASE_APP_ID || '', measurementId: process.env.FIREBASE_MEASUREMENT_ID || '' };
    if (!config.apiKey) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Firebase configuration is not set.' })); return; }
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
  const keyStatus = process.env.GEMINI_API_KEY ? '✅ key loaded' : '❌ GEMINI_API_KEY missing';
  console.log(`\n✅ StokPal server running → http://localhost:${PORT}`);
  console.log(`🤖 Gemini Agent:  http://localhost:${PORT}/api/chat  (${keyStatus})`);
  console.log(`💳 Payment API:   http://localhost:${PORT}/api/payments/`);
  console.log(`📦 Payout API:    http://localhost:${PORT}/api/payouts/`);
});