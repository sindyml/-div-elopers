/* ============================================================
   Azure Function: getSAData
   
   Server-side proxy for the Frankfurter API.
   Used as a CORS fallback when the browser cannot reach the
   API directly (e.g. corporate firewalls, strict CSP).
   
   Deployed automatically by Azure Static Web Apps when the
   api/ folder is present.
   ============================================================ */

const https = require('https');

// SA rates — updated each sprint (SARB MPC decision)
const SA_STATIC = {
  primeRate:      10.25,   // Prime = repo (6.75%) + 3.5%
  inflationRate:   4.0,    // SARB Q2 2026 forecast
  repoRate:        6.75,
  lastUpdated:    'March 2026',
};

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR';

function fetchFrankfurter() {
  return new Promise((resolve, reject) => {
    const req = https.get(FRANKFURTER_URL, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('Invalid JSON from Frankfurter'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = async function (context, req) {
  try {
    const data = await fetchFrankfurter();
    const usdZar = data.rates?.ZAR ?? 18.50;

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: {
        primeRate:      SA_STATIC.primeRate,
        inflationRate:  SA_STATIC.inflationRate,
        repoRate:       SA_STATIC.repoRate,
        usdZar:         usdZar,
        rates:          data.rates,
        date:           data.date,
        source:         'Frankfurter API via Azure Function',
        lastUpdated:    SA_STATIC.lastUpdated,
        isFallback:     false,
      },
    };
  } catch (err) {
    context.log.warn('Frankfurter API failed, returning static fallback:', err.message);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: {
        primeRate:      SA_STATIC.primeRate,
        inflationRate:  SA_STATIC.inflationRate,
        repoRate:       SA_STATIC.repoRate,
        usdZar:         18.50,
        source:         'Static fallback (Azure Function)',
        lastUpdated:    SA_STATIC.lastUpdated,
        isFallback:     true,
      },
    };
  }
};
