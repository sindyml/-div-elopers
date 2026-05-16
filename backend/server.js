// server.js — Static file server + Gemini Agent with Firestore tool-calling
<<<<<<< HEAD
// + Payment & Payout API endpoints
=======
>>>>>>> origin/main
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
<<<<<<< HEAD

// ── Routes ────────────────────────────────────────────────────────────────────
const paymentRoutes = require('./api/payments/index.js');
const payoutRoutes  = require('./api/payouts/index.js');

=======

// ── Payment routes ────────────────────────────────────────────────────────────
const paymentRoutes = require('./api/payments/index.js');

>>>>>>> origin/main
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
<<<<<<< HEAD
=======
   These are sent to Gemini so it knows what it can call.
>>>>>>> origin/main
   ══════════════════════════════════════════════════════════════════════════════ */
const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_group_balance',
<<<<<<< HEAD
        description: 'Get the total confirmed contributions (balance) for a stokvel group.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
=======
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
>>>>>>> origin/main
          },
          required: ['groupId'],
        },
      },
      {
        name: 'get_payout_schedule',
<<<<<<< HEAD
        description: 'Get the full payout schedule for a group.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
=======
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
>>>>>>> origin/main
          },
          required: ['groupId'],
        },
      },
      {
        name: 'get_upcoming_meetings',
<<<<<<< HEAD
        description: 'Get upcoming scheduled meetings for one or more groups.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Array of Firestore group document IDs' },
=======
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
>>>>>>> origin/main
          },
          required: ['groupIds'],
        },
      },
      {
        name: 'get_my_contributions',
<<<<<<< HEAD
        description: 'Get the contribution history for the current user in a specific group.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
            userId:  { type: 'STRING', description: 'The Firebase UID of the user' },
=======
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
>>>>>>> origin/main
          },
          required: ['groupId', 'userId'],
        },
      },
      {
        name: 'get_group_members',
<<<<<<< HEAD
        description: 'Get the list of members in a group with their roles.',
        parameters: {
          type: 'OBJECT',
          properties: {
            groupId: { type: 'STRING', description: 'The Firestore document ID of the group' },
=======
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
>>>>>>> origin/main
          },
          required: ['groupId'],
        },
      },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════════
<<<<<<< HEAD
   TOOL EXECUTOR
=======
   TOOL EXECUTOR — runs the actual Firestore queries
>>>>>>> origin/main
   ══════════════════════════════════════════════════════════════════════════════ */
async function executeTool(toolName, args) {
  try {
    switch (toolName) {
<<<<<<< HEAD
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
=======

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
>>>>>>> origin/main
    }
  } catch (err) {
    console.error(`[Agent] Tool "${toolName}" error:`, err.message);
    return { error: err.message };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/main
}

/* ══════════════════════════════════════════════════════════════════════════════
   GEMINI AGENT LOOP
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/main
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runGeminiAgent({ systemText, contents, apiKey, maxOutputTokens = 1000, groupId, uid, groupIds }) {
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/main
  const lastUserMessage = [...contents].reverse().find(c => c.role === 'user')?.parts?.[0]?.text || '';
  return await offlineFallback({ userMessage: lastUserMessage, groupId, uid, groupIds });
}

<<<<<<< HEAD
=======
async function resolveToolCalls(functionCalls) {
  return Promise.all(
    functionCalls.map(async (part) => {
      const { name, args } = part.functionCall;
      const result = await executeTool(name, args || {});
      return { functionResponse: { name, response: { content: result } } };
    })
  );
}


>>>>>>> origin/main
/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════════ */
function parseJSONBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
<<<<<<< HEAD
  req.on('end', () => { try { callback(null, body ? JSON.parse(body) : {}); } catch (err) { callback(err, null); } });
}

function jsonError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
=======
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
>>>>>>> origin/main
  res.end(JSON.stringify({ error: message }));
}

/* ══════════════════════════════════════════════════════════════════════════════
   HTTP SERVER
   ══════════════════════════════════════════════════════════════════════════════ */
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

<<<<<<< HEAD
  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
=======
  // CORS preflight
  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
>>>>>>> origin/main
    res.end();
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/main
    });
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/main
    }
    return;
  }

  /* ────────────────────────────────────────────────────────────────────────────
     /api/getFirebaseConfig
     ──────────────────────────────────────────────────────────────────────────── */
  if (urlPath === '/api/getFirebaseConfig' && req.method === 'GET') {
<<<<<<< HEAD
    const config = { apiKey: process.env.FIREBASE_API_KEY || '', authDomain: process.env.FIREBASE_AUTH_DOMAIN || '', databaseURL: process.env.FIREBASE_DATABASE_URL || '', projectId: process.env.FIREBASE_PROJECT_ID || '', storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '', messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '', appId: process.env.FIREBASE_APP_ID || '', measurementId: process.env.FIREBASE_MEASUREMENT_ID || '' };
    if (!config.apiKey) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Firebase configuration is not set.' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
=======
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
>>>>>>> origin/main
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
<<<<<<< HEAD
  const filePath = path.join(FRONTEND_DIR, staticPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(FRONTEND_DIR, 'index.html'), (err2, fallback) => {
=======

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
>>>>>>> origin/main
        if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    const mimeType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
<<<<<<< HEAD
    res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
=======
    res.writeHead(200, {
      'Content-Type':           mimeType,
      'Cache-Control':          'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options':        'DENY',
    });
>>>>>>> origin/main
    res.end(data);
  });
});

server.listen(PORT, () => {
<<<<<<< HEAD
  const keyStatus = process.env.GEMINI_API_KEY ? '✅ key loaded' : '❌ GEMINI_API_KEY missing';
  console.log(`\n✅ StokPal server running → http://localhost:${PORT}`);
  console.log(`🤖 Gemini Agent:  http://localhost:${PORT}/api/chat  (${keyStatus})`);
  console.log(`💳 Payment API:   http://localhost:${PORT}/api/payments/`);
  console.log(`📦 Payout API:    http://localhost:${PORT}/api/payouts/`);
});
=======
  const keyStatus = process.env.GEMINI_API_KEY ? '✅ key loaded' : '❌ GEMINI_API_KEY missing in .env';
  console.log(`\n✅ StokPal server running → http://localhost:${PORT}`);
  console.log(`🤖 Gemini Agent:  http://localhost:${PORT}/api/chat  (${keyStatus})`);
  console.log(`💳 Payment API:   http://localhost:${PORT}/api/payments/\n`);
});
>>>>>>> origin/main
