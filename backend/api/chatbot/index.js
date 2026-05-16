// api/chat/index.js
// ─────────────────────────────────────────────────────────────
// Azure Functions v3 HTTP trigger — proxies chat to Anthropic.
//
// SETUP:
//   1. Place this file at:  api/chat/index.js
//   2. Place function.json at: api/chat/function.json  (see sibling file)
//   3. Add your key to local.settings.json (never commit this file):
//        { "Values": { "ANTHROPIC_API_KEY": "sk-ant-..." } }
//   4. In Azure Portal → Function App → Configuration → App Settings:
//        ANTHROPIC_API_KEY = sk-ant-...
// ─────────────────────────────────────────────────────────────

const https = require('https');

module.exports = async function (context, req) {
  // ── CORS headers (adjust origin for production) ──────────
  const origin = req.headers['origin'] || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers: corsHeaders, body: '' };
    return;
  }

  // ── Validate method ───────────────────────────────────────
  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
    return;
  }

  // ── API key ───────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    context.log.error('[/api/chat] ANTHROPIC_API_KEY is not set');
    context.res = {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfiguration: API key missing.' }),
    };
    return;
  }

  // ── Forward to Anthropic ──────────────────────────────────
  try {
    const payload = JSON.stringify(req.body);

    const anthropicRes = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'Content-Type':      'application/json',
          'Content-Length':    Buffer.byteLength(payload),
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          resolve({ status: proxyRes.statusCode, body: data });
        });
      });

      proxyReq.on('error', reject);
      proxyReq.write(payload);
      proxyReq.end();
    });

    context.res = {
      status:  anthropicRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body:    anthropicRes.body, // already JSON string
    };
  } catch (err) {
    context.log.error('[/api/chat] Upstream error:', err.message);
    context.res = {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to reach Anthropic API: ' + err.message }),
    };
  }
};