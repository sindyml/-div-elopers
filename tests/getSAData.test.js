/* ============================================================
   tests/getSAData.test.js — Unit tests for the getSAData
   Azure Function (backend/api/getSAData/index.js).

   Covers:
   - Successful Frankfurter API fetch → returns live data
   - Frankfurter API failure → returns static fallback
   - Response structure validation (primeRate, inflationRate, etc.)
   ============================================================ */

const https = require('https');
const { EventEmitter } = require('events');

// The Azure Function handler
const getSAData = require('../backend/api/getSAData/index');

// ── Helpers ────────────────────────────────────────────────

/** Build a minimal Azure Functions context object. */
function createContext() {
  return {
    res: null,
    log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
  };
}

/** Simulate an https.get response stream. */
function mockHttpsGet(responseBody, statusCode = 200) {
  jest.spyOn(https, 'get').mockImplementation((_url, _opts, callback) => {
    const res = new EventEmitter();
    res.statusCode = statusCode;

    // Invoke the callback with the response stream on next tick
    process.nextTick(() => {
      callback(res);
      res.emit('data', JSON.stringify(responseBody));
      res.emit('end');
    });

    // Return a fake request object (for .on('error') / .on('timeout'))
    const req = new EventEmitter();
    req.destroy = jest.fn();
    return req;
  });
}

/** Simulate an https.get that emits an error. */
function mockHttpsGetError(errorMessage) {
  jest.spyOn(https, 'get').mockImplementation((_url, _opts, _callback) => {
    const req = new EventEmitter();
    req.destroy = jest.fn();
    process.nextTick(() => req.emit('error', new Error(errorMessage)));
    return req;
  });
}

// ── Tests ──────────────────────────────────────────────────

describe('Azure Function: getSAData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns live data when Frankfurter API responds successfully', async () => {
    const frankfurterResponse = {
      amount: 1,
      base: 'USD',
      date: '2026-04-15',
      rates: { ZAR: 18.72 },
    };
    mockHttpsGet(frankfurterResponse);

    const context = createContext();
    await getSAData(context, {});

    expect(context.res.status).toBe(200);

    const body = context.res.body;
    expect(body.usdZar).toBe(18.72);
    expect(body.primeRate).toBe(10.25);
    expect(body.inflationRate).toBe(4.0);
    expect(body.repoRate).toBe(6.75);
    expect(body.isFallback).toBe(false);
    expect(body.source).toContain('Frankfurter');
    expect(body.rates).toEqual({ ZAR: 18.72 });
    expect(body.date).toBe('2026-04-15');
  });

  test('returns static fallback when Frankfurter API fails', async () => {
    mockHttpsGetError('Network unreachable');

    const context = createContext();
    await getSAData(context, {});

    expect(context.res.status).toBe(200);

    const body = context.res.body;
    expect(body.usdZar).toBe(18.50);
    expect(body.primeRate).toBe(10.25);
    expect(body.inflationRate).toBe(4.0);
    expect(body.repoRate).toBe(6.75);
    expect(body.isFallback).toBe(true);
    expect(body.source).toContain('fallback');
  });

  test('fallback sets Cache-Control to no-store', async () => {
    mockHttpsGetError('timeout');

    const context = createContext();
    await getSAData(context, {});

    expect(context.res.headers['Cache-Control']).toBe('no-store');
  });

  test('live response sets Cache-Control with max-age', async () => {
    mockHttpsGet({ rates: { ZAR: 19.0 } });

    const context = createContext();
    await getSAData(context, {});

    expect(context.res.headers['Cache-Control']).toContain('max-age');
  });

  test('uses fallback usdZar when rates.ZAR is missing', async () => {
    mockHttpsGet({ amount: 1, base: 'USD', rates: {} });

    const context = createContext();
    await getSAData(context, {});

    expect(context.res.body.usdZar).toBe(18.50);
    expect(context.res.body.isFallback).toBe(false);
  });

  test('response always contains required fields', async () => {
    mockHttpsGet({ rates: { ZAR: 17.5 } });

    const context = createContext();
    await getSAData(context, {});

    const body = context.res.body;
    const requiredFields = ['primeRate', 'inflationRate', 'repoRate', 'usdZar', 'source', 'isFallback', 'lastUpdated'];
    for (const field of requiredFields) {
      expect(body).toHaveProperty(field);
    }
  });
});
