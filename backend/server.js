// server.js — Static file server + Gemini Agent with Firestore tool-calling
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

require('dotenv').config();

const PORT = process.env.PORT || 8082;

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

// ── Payment routes ────────────────────────────────────────────────────────────
const paymentRoutes = require('./api/payments/index.js');

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
   These are sent to Gemini so it knows what it can call.
   ══════════════════════════════════════════════════════════════════════════════ */
const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_group_balance',
        description:
          'Get the total confirmed contributions (balance) for a stokvel group. ' +
          'Use this when the user asks about their group balance, pot, or total saved.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: {
              type: 'STRING',
              description: 'The Firestore document ID of the group',
            },
          },
          required: ['groupId'],
        },
      },
      {
        name: 'get_payout_schedule',
        description:
          'Get the full payout schedule (order, member names, amounts, dates) for a group. ' +
          'Use when the user asks about payouts, whose turn it is, or upcoming payouts.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: {
              type: 'STRING',
              description: 'The Firestore document ID of the group',
            },
          },
          required: ['groupId'],
        },
      },
      {
        name: 'get_upcoming_meetings',
        description:
          'Get upcoming scheduled meetings for one or more groups. ' +
          'Use when the user asks about the next meeting, meeting dates, or meeting agenda.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupIds: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Array of Firestore group document IDs',
            },
          },
          required: ['groupIds'],
        },
      },
      {
        name: 'get_my_contributions',
        description:
          'Get the contribution history for the current user in a specific group. ' +
          'Use when the user asks how much they have paid, their contribution history, or their status.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: {
              type: 'STRING',
              description: 'The Firestore document ID of the group',
            },
            userId: {
              type: 'STRING',
              description: 'The Firebase UID of the user',
            },
          },
          required: ['groupId', 'userId'],
        },
      },
      {
        name: 'get_group_members',
        description:
          'Get the list of members in a group with their roles. ' +
          'Use when the user asks who is in the group, member count, or who the admin is.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: {
              type: 'STRING',
              description: 'The Firestore document ID of the group',
            },
          },
          required: ['groupId'],
        },
      },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════════
   TOOL EXECUTOR — runs the actual Firestore queries
   ══════════════════════════════════════════════════════════════════════════════ */
async function executeTool(toolName, args) {
  try {
    switch (toolName) {

      case 'get_group_balance': {
        const snap = await db
          .collection('contributions')
          .where('groupId', '==', args.groupId)
          .where('status', '==', 'confirmed')
          .get();

        const total      = snap.docs.reduce((s, d) => s + (Number(d.data().amount) || 0), 0);
        const count      = snap.docs.length;
        const allSnap    = await db.collection('contributions').where('groupId', '==', args.groupId).get();
        const grandTotal = allSnap.docs.reduce((s, d) => s + (Number(d.data().amount) || 0), 0);

        return {
          groupId:                    args.groupId,
          confirmedContributions:     count,
          totalConfirmedAmountRands:  total,
          totalAllContributionsRands: grandTotal,
          currency:                   'ZAR',
        };
      }

      case 'get_payout_schedule': {
        const snap = await db
          .collection('payouts')
          .where('groupId', '==', args.groupId)
          .orderBy('order', 'asc')
          .get();

        const today   = new Date().toISOString().slice(0, 10);
        const payouts = snap.docs.map(d => {
          const data = d.data();
          let payoutDate = data.payoutDate;
          if (payoutDate?.toDate) payoutDate = payoutDate.toDate().toISOString().slice(0, 10);
          return {
            order:           data.order,
            memberName:      data.userDisplayName || 'Unknown',
            amountRands:     data.amount || 0,
            payoutDate:      payoutDate || 'TBD',
            isUpcoming:      payoutDate >= today,
          };
        });

        const next = payouts.find(p => p.isUpcoming);
        return { groupId: args.groupId, payouts, nextPayout: next || null };
      }

      case 'get_upcoming_meetings': {
        const today    = new Date().toISOString().slice(0, 10);
        const groupIds = (args.groupIds || []).slice(0, 10);
        if (!groupIds.length) return { meetings: [] };

        const snap = await db
          .collection('meetings')
          .where('groupId', 'in', groupIds)
          .where('date', '>=', today)
          .orderBy('date', 'asc')
          .limit(5)
          .get();

        const meetings = snap.docs.map(d => {
          const data = d.data();
          return {
            title:    data.title    || data.agenda?.split('\n')[0] || 'Untitled',
            date:     data.date,
            time:     data.time     || null,
            location: data.location || null,
            groupId:  data.groupId,
            agenda:   data.agenda   || null,
          };
        });

        return { meetings, count: meetings.length };
      }

      case 'get_my_contributions': {
        const snap = await db
          .collection('contributions')
          .where('groupId', '==', args.groupId)
          .where('userId',  '==', args.userId)
          .orderBy('date', 'desc')
          .limit(20)
          .get();

        const contributions = snap.docs.map(d => ({
          amount: d.data().amount,
          date:   d.data().date,
          status: d.data().status,
        }));

        const confirmed = contributions.filter(c => c.status === 'confirmed');
        const total     = confirmed.reduce((s, c) => s + (Number(c.amount) || 0), 0);

        return {
          userId:                    args.userId,
          groupId:                   args.groupId,
          contributions,
          totalConfirmedRands:       total,
          confirmedContributionCount: confirmed.length,
        };
      }

      case 'get_group_members': {
        const snap = await db
          .collection(`groups/${args.groupId}/members`)
          .get();

        const members = snap.docs.map(d => ({
          uid:         d.id,
          displayName: d.data().displayName || 'Member',
          role:        d.data().role        || 'member',
        }));

        return {
          groupId:     args.groupId,
          memberCount: members.length,
          members,
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[Agent] Tool "${toolName}" error:`, err.message);
    return { error: err.message };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   OFFLINE / QUOTA FALLBACK
   When Gemini is unavailable we run the question through a lightweight
   rule-based engine that queries Firestore directly and returns a plain
   text answer — no AI API needed.
   ══════════════════════════════════════════════════════════════════════════════ */
async function offlineFallback({ userMessage, groupId, uid, groupIds }) {
  const msg = userMessage.toLowerCase();

  // Helper — fetch tool data directly
  async function tryTool(name, args) {
    try { return await executeTool(name, args); }
    catch { return null; }
  }

  // Balance
  if (msg.includes('balance') || msg.includes('total') || msg.includes('pot') || msg.includes('saved')) {
    if (!groupId) return '💡 Please select a group first so I can check the balance.';
    const data = await tryTool('get_group_balance', { groupId });
    if (!data || data.error) return '⚠️ Could not fetch balance right now. Please try again shortly.';
    return `💰 Your group has **R ${Number(data.totalConfirmedAmountRands).toLocaleString('en-ZA')}** in confirmed contributions (${data.confirmedContributions} payments).`;
  }

  // Payout
  if (msg.includes('payout') || msg.includes('whose turn') || msg.includes('next turn') || msg.includes('receive')) {
    if (!groupId) return '💡 Please select a group first so I can check payouts.';
    const data = await tryTool('get_payout_schedule', { groupId });
    if (!data || data.error) return '⚠️ Could not fetch payout schedule right now.';
    if (!data.nextPayout) return '📅 No upcoming payouts scheduled yet.';
    const p = data.nextPayout;
    return `📅 Next payout: **${p.memberName}** receives **R ${Number(p.amountRands).toLocaleString('en-ZA')}** on ${p.payoutDate} (position #${p.order}).`;
  }

  // Meetings
  if (msg.includes('meeting') || msg.includes('when') || msg.includes('schedule') || msg.includes('agenda')) {
    const ids = groupIds?.length ? groupIds : (groupId ? [groupId] : []);
    if (!ids.length) return '💡 Please select a group first so I can check meetings.';
    const data = await tryTool('get_upcoming_meetings', { groupIds: ids });
    if (!data || data.error || !data.meetings?.length) return '📅 No upcoming meetings scheduled.';
    const m = data.meetings[0];
    return `🗓 Next meeting: **${m.title}** on ${m.date}${m.time ? ' at ' + m.time : ''}${m.location ? ' · ' + m.location : ''}.`;
  }

  // My contributions
  if (msg.includes('my contribution') || msg.includes('i paid') || msg.includes('i have paid') || msg.includes('history')) {
    if (!groupId || !uid) return '💡 Please select a group first.';
    const data = await tryTool('get_my_contributions', { groupId, userId: uid });
    if (!data || data.error) return '⚠️ Could not fetch your contributions right now.';
    return `📋 You have made **${data.confirmedContributionCount}** confirmed contributions totalling **R ${Number(data.totalConfirmedRands).toLocaleString('en-ZA')}**.`;
  }

  // Members
  if (msg.includes('member') || msg.includes('who is') || msg.includes('who are') || msg.includes('admin')) {
    if (!groupId) return '💡 Please select a group first.';
    const data = await tryTool('get_group_members', { groupId });
    if (!data || data.error) return '⚠️ Could not fetch members right now.';
    const names = data.members.map(m => `${m.displayName} (${m.role})`).join(', ');
    return `👥 Your group has **${data.memberCount}** member${data.memberCount !== 1 ? 's' : ''}: ${names}.`;
  }

  // Generic fallback
  return [
    '⚡ The AI assistant is temporarily unavailable (quota limit reached).',
    'I can still answer questions about your group data. Try asking:',
    '• "What is our group balance?"',
    '• "When is the next payout?"',
    '• "When is the next meeting?"',
    '• "Show my contributions"',
    '• "Who are the members?"',
  ].join('\n');
}

/* ══════════════════════════════════════════════════════════════════════════════
   GEMINI AGENT LOOP
   Tries models in order. On quota/rate error falls back to offlineFallback.
   ══════════════════════════════════════════════════════════════════════════════ */

// Models to try in order — first available wins
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',   // lightest quota usage
  'gemini-2.0-flash',        // standard
  'gemini-1.5-flash-latest', // older but separate quota
  'gemini-1.5-pro-latest',   // heavier but separate quota
];

async function callGeminiOnce({ model, systemText, contents, apiKey, maxOutputTokens }) {
  const endpoint = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload  = JSON.stringify({
    ...(systemText && { system_instruction: { parts: [{ text: systemText }] } }),
    contents,
    tools: AGENT_TOOLS,
    generationConfig: { maxOutputTokens, temperature: 0.7 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path:     endpoint,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runGeminiAgent({ systemText, contents, apiKey, maxOutputTokens = 1000, groupId, uid, groupIds }) {
  const MAX_TURNS = 5;

  // Try each model until one works
  let workingModel = null;
  for (const model of GEMINI_MODELS) {
    try {
      const testRes = await callGeminiOnce({ model, systemText, contents, apiKey, maxOutputTokens });
      if (testRes.error) {
        const errMsg = testRes.error.message || '';
        const isQuota = errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('rate');
        const isNotFound = errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('not supported');
        if (isQuota || isNotFound) {
          console.warn(`[Agent] Model ${model} unavailable (${isQuota ? 'quota' : 'not found'}), trying next…`);
          continue;
        }
        throw new Error(errMsg);
      }
      // Model worked — use it and process this first response
      workingModel = model;

      // Process the first response immediately rather than making a second call
      const candidate = testRes?.candidates?.[0];
      const parts     = candidate?.content?.parts || [];
      const functionCalls = parts.filter(p => p.functionCall);

      if (!functionCalls.length) {
        return parts.filter(p => p.text).map(p => p.text).join('') || 'Sorry, I could not generate a response.';
      }

      // Has function calls — continue the agent loop with this model
      console.log(`[Agent] Using model: ${workingModel}`);
      let loopContents = [
        ...contents,
        { role: 'model', parts },
        { role: 'user', parts: await resolveToolCalls(functionCalls) },
      ];

      for (let turn = 1; turn < MAX_TURNS; turn++) {
        const res = await callGeminiOnce({ model: workingModel, systemText, contents: loopContents, apiKey, maxOutputTokens });
        if (res.error) throw new Error(res.error.message);

        const c  = res?.candidates?.[0];
        const p  = c?.content?.parts || [];
        const fc = p.filter(x => x.functionCall);

        if (!fc.length) {
          return p.filter(x => x.text).map(x => x.text).join('') || 'Sorry, I could not generate a response.';
        }

        console.log(`[Agent] Turn ${turn + 1}: executing ${fc.length} tool(s)`);
        loopContents = [
          ...loopContents,
          { role: 'model', parts: p },
          { role: 'user',  parts: await resolveToolCalls(fc) },
        ];
      }

      return 'I reached the maximum reasoning steps. Please try a simpler question.';

    } catch (err) {
      console.warn(`[Agent] Model ${model} error:`, err.message);
      continue;
    }
  }

  // All models failed — use offline fallback
  console.warn('[Agent] All Gemini models exhausted — using offline fallback');
  const lastUserMessage = [...contents].reverse().find(c => c.role === 'user')?.parts?.[0]?.text || '';
  return await offlineFallback({ userMessage: lastUserMessage, groupId, uid, groupIds });
}

async function resolveToolCalls(functionCalls) {
  return Promise.all(
    functionCalls.map(async (part) => {
      const { name, args } = part.functionCall;
      const result = await executeTool(name, args || {});
      return { functionResponse: { name, response: { content: result } } };
    })
  );
}


/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════════ */
function sendFallbackSAData(res, saStatic) {
  const payload = {
    primeRate:     saStatic.primeRate,
    inflationRate: saStatic.inflationRate,
    repoRate:      saStatic.repoRate,
    usdZar:        18.50,
    source:        'Static fallback (server proxy)',
    lastUpdated:   saStatic.lastUpdated,
    isFallback:    true,
  };
  res.writeHead(200, {
    'Content-Type':                'application/json',
    'Cache-Control':               'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

function parseJSONBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try   { callback(null, body ? JSON.parse(body) : {}); }
    catch (err) { callback(err, null); }
  });
}

function jsonError(res, status, message) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: message }));
}

/* ══════════════════════════════════════════════════════════════════════════════
   HTTP SERVER
   ══════════════════════════════════════════════════════════════════════════════ */
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // CORS preflight
  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/chat  — Gemini Agent with function-calling
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/chat' && req.method === 'POST') {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      jsonError(res, 500,
        'GEMINI_API_KEY is missing. Add it to your .env file. Get a free key at https://aistudio.google.com/app/apikey'
      );
      return;
    }

    parseJSONBody(req, async (err, body) => {
      if (err) { jsonError(res, 400, 'Invalid JSON in request body.'); return; }

      // body shape: { system, messages: [{role, content}], max_tokens, groupId, uid, groupIds }
      const systemText = body.system   || '';
      const messages   = body.messages || [];
      const groupId    = body.groupId  || null;
      const uid        = body.uid      || null;
      const groupIds   = body.groupIds || (groupId ? [groupId] : []);

      // Build a richer system prompt that tells Gemini what context is available
      const agentSystem = [
        systemText,
        '',
        '## Agent Capabilities',
        'You have access to real-time Firestore data via function calls. ALWAYS call the appropriate',
        'function instead of saying you cannot access data. You can:',
        '- get_group_balance(groupId)      → real confirmed contribution totals',
        '- get_payout_schedule(groupId)    → full payout order, amounts, dates',
        '- get_upcoming_meetings(groupIds) → next meetings with dates and times',
        '- get_my_contributions(groupId, userId) → user\'s personal contribution history',
        '- get_group_members(groupId)      → member list with roles',
        '',
        '## Context',
        groupId  ? `Current group ID: ${groupId}`  : 'No group selected yet.',
        uid      ? `Current user ID: ${uid}`        : 'User ID not provided.',
        groupIds.length ? `All group IDs: ${groupIds.join(', ')}` : '',
        '',
        'Amounts are always in South African Rand (ZAR). Be concise and friendly.',
      ].filter(Boolean).join('\n');

      // Convert message history to Gemini format
      const contents = messages.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      try {
        const text = await runGeminiAgent({
          systemText:      agentSystem,
          contents,
          apiKey,
          maxOutputTokens: body.max_tokens || 1000,
          groupId,
          uid,
          groupIds,
        });

        res.writeHead(200, {
          'Content-Type':                'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
          content: [{ type: 'text', text }],
        }));
      } catch (agentErr) {
        console.error('[Agent] Error:', agentErr.message);
        jsonError(res, 502, agentErr.message || 'Agent error');
      }
    });
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/payments/*
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath.startsWith('/api/payments/')) {
    const paymentPath = urlPath.replace('/api/payments', '');

    const fakeReq = {
      method:  req.method,
      url:     paymentPath,
      headers: req.headers,
      body:    null,
      params:  {},
      query:   {},
      user:    null,
    };

    const fakeRes = {
      statusCode: 200,
      headers:    {},
      json: (data) => {
        fakeRes.setHeader('Content-Type', 'application/json');
        fakeRes.end(JSON.stringify(data));
      },
      status:    (code) => { fakeRes.statusCode = code; return fakeRes; },
      setHeader: (key, value) => { fakeRes.headers[key] = value; },
      end: (data) => {
        fakeRes.headers['Content-Type'] = fakeRes.headers['Content-Type'] || 'application/json';
        Object.keys(fakeRes.headers).forEach(k => res.setHeader(k, fakeRes.headers[k]));
        res.writeHead(fakeRes.statusCode);
        res.end(data);
      },
      getHeader: (key) => fakeRes.headers[key],
    };

    const parseAndRoute = (body = {}) => {
      fakeReq.body = body;
      const match        = paymentPath.match(/\/status\/(.+)$/);
      const historyMatch = paymentPath.match(/\/history\/(.+)$/);
      if (match)        fakeReq.params.paymentId = match[1];
      if (historyMatch) fakeReq.params.userId    = historyMatch[1];
      paymentRoutes(fakeReq, fakeRes);
    };

    if (req.method === 'POST' || req.method === 'PUT') {
      parseJSONBody(req, (err, body) => {
        if (err) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        fakeReq.query = Object.fromEntries(urlObj.searchParams);
        parseAndRoute(body);
      });
    } else {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      fakeReq.query = Object.fromEntries(urlObj.searchParams);
      parseAndRoute();
    }
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/getFirebaseConfig
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/getFirebaseConfig' && req.method === 'GET') {
    const config = {
      apiKey:            process.env.FIREBASE_API_KEY             || '',
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN         || '',
      databaseURL:       process.env.FIREBASE_DATABASE_URL        || '',
      projectId:         process.env.FIREBASE_PROJECT_ID          || '',
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET      || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId:             process.env.FIREBASE_APP_ID              || '',
      measurementId:     process.env.FIREBASE_MEASUREMENT_ID      || '',
    };

    if (!config.apiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Firebase configuration is not set.' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify(config));
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/getSAData
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/getSAData' && req.method === 'GET') {
    const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';
    const SA_STATIC = {
      primeRate:     10.25,
      inflationRate: 4.0,
      repoRate:      6.75,
      lastUpdated:   'March 2026',
    };

    const apiReq = https.get(FRANKFURTER_URL, { timeout: 5000 }, (apiRes) => {
      let body = '';
      apiRes.on('data', chunk => { body += chunk; });
      apiRes.on('end', () => {
        try {
          const data   = JSON.parse(body);
          const usdZar = data.rates?.ZAR ?? 18.50;
          res.writeHead(200, {
            'Content-Type':                'application/json',
            'Cache-Control':               'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({
            primeRate:     SA_STATIC.primeRate,
            inflationRate: SA_STATIC.inflationRate,
            repoRate:      SA_STATIC.repoRate,
            usdZar,
            rates:         data.rates,
            date:          data.date,
            source:        'Frankfurter API via server proxy',
            lastUpdated:   SA_STATIC.lastUpdated,
            isFallback:    false,
          }));
        } catch {
          sendFallbackSAData(res, SA_STATIC);
        }
      });
    });

    apiReq.on('error',   ()  => sendFallbackSAData(res, SA_STATIC));
    apiReq.on('timeout', ()  => { apiReq.destroy(); sendFallbackSAData(res, SA_STATIC); });
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     Static file serving
     ──────────────────────────────────────────────────────────────────────────── */
  let staticPath = decodeURIComponent(urlPath).replace(/\.\./g, '');
  if (staticPath === '/') staticPath = '/index.html';

  const ext = path.extname(staticPath);
  if (!ext) staticPath += '.html';

  const frontendRoot = path.resolve(FRONTEND_DIR);
  const relativeStaticPath = staticPath.replace(/^\/+/, '');
  const filePath = path.resolve(frontendRoot, relativeStaticPath);

  if (filePath !== frontendRoot && !filePath.startsWith(frontendRoot + path.sep)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.resolve(frontendRoot, 'index.html'), (err2, fallback) => {
        if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    const mimeType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':           mimeType,
      'Cache-Control':          'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options':        'DENY',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const keyStatus = process.env.GEMINI_API_KEY ? '✅ key loaded' : '❌ GEMINI_API_KEY missing in .env';
  console.log(`\n✅ StokPal server running → http://localhost:${PORT}`);
  console.log(`🤖 Gemini Agent:  http://localhost:${PORT}/api/chat  (${keyStatus})`);
  console.log(`💳 Payment API:   http://localhost:${PORT}/api/payments/\n`);
});