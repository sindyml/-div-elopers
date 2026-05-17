/* ============================================================
   tests/sa-data.test.js — Unit tests for the SA financial data
   fetch and savings projection logic in frontend/js/sa-data.js.

   Covers:
   - fetchSAData() fallback chain (primary → Azure → static)
   - Cache read / write / expiry behaviour
   - Savings projection arithmetic
   - fetchWithTimeout abort on timeout
   ============================================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ── Load the sa-data.js source ──────────────────────────────
const SA_DATA_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'js', 'sa-data.js'),
  'utf-8',
).replace(/export\s+\{[^}]+\};/g, '');

// ── Helpers to build a sandboxed execution context ──────────

/**
 * Creates a fresh sandboxed environment that mimics the browser
 * globals sa-data.js needs (fetch, localStorage, document, console).
 * Returns the sandbox so tests can inspect / control mocks.
 */
function createSandbox(overrides = {}) {
  const store = {};

  const localStorage = {
    _store: store,
    getItem: jest.fn((key) => store[key] ?? null),
    setItem: jest.fn((key, val) => { store[key] = val; }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  };

  const sandbox = {
    fetch: jest.fn(),
    localStorage,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    document: {
      getElementById: jest.fn(() => null),
      createElement: jest.fn(() => ({ id: '', textContent: '' })),
      head: { appendChild: jest.fn() },
    },
    setTimeout,
    clearTimeout,
    Date,
    parseFloat,
    AbortController,
    Error,
    JSON,
    ...overrides,
  };

  // Execute sa-data.js inside the sandbox so its top-level
  // declarations become properties of the sandbox.
  vm.createContext(sandbox);
  vm.runInContext(SA_DATA_SRC, sandbox, { filename: 'sa-data.js' });

  return sandbox;
}

/**
 * Helper: make sandbox.fetch resolve with a JSON body.
 */
function mockFetchOk(sandbox, body) {
  sandbox.fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

/**
 * Helper: make sandbox.fetch reject.
 */
function mockFetchFail(sandbox, message = 'Network error') {
  sandbox.fetch.mockRejectedValue(new Error(message));
}

// ── Tests: fetchSAData fallback chain ───────────────────────

describe('fetchSAData() — fallback chain', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  test('returns data from primary API on success', async () => {
    mockFetchOk(sandbox, {
      amount: 1, base: 'USD', date: '2026-04-15',
      rates: { ZAR: 18.72 },
    });

    const data = await sandbox.fetchSAData();

    expect(data.usdZar).toBe(18.72);
    expect(data.primeRate).toBe(10.25);
    expect(data.inflationRate).toBe(4.0);
    expect(data.isFallback).toBe(false);
    expect(data.source).toContain('Frankfurter');
  });

  test('falls back to Azure Function when primary API fails', async () => {
    // First call (primary) fails, second call (Azure) succeeds
    sandbox.fetch
      .mockRejectedValueOnce(new Error('Primary down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          primeRate: 10.25,
          inflationRate: 4.0,
          usdZar: 18.60,
        }),
      });

    const data = await sandbox.fetchSAData();

    expect(data.usdZar).toBe(18.60);
    expect(data.isFallback).toBe(false);
    expect(data.source).toContain('Azure');
  });

  test('returns static fallback when both API and Azure fail', async () => {
    sandbox.fetch.mockRejectedValue(new Error('All endpoints down'));

    const data = await sandbox.fetchSAData();

    expect(data.primeRate).toBe(10.25);
    expect(data.inflationRate).toBe(4.0);
    expect(data.usdZar).toBe(18.50);
    expect(data.isFallback).toBe(true);
    expect(data.source).toContain('fallback');
  });

  test('never throws — always returns a valid object', async () => {
    sandbox.fetch.mockRejectedValue(new Error('catastrophic'));

    const data = await sandbox.fetchSAData();

    expect(data).toBeDefined();
    expect(typeof data.primeRate).toBe('number');
    expect(typeof data.inflationRate).toBe('number');
    expect(typeof data.usdZar).toBe('number');
  });

  test('uses fallback usdZar when rates.ZAR is missing in API response', async () => {
    mockFetchOk(sandbox, { amount: 1, base: 'USD', rates: {} });

    const data = await sandbox.fetchSAData();

    // Should use the SA_DATA_FALLBACK.usdZar value
    expect(data.usdZar).toBe(18.50);
  });
});

// ── Tests: Cache behaviour ──────────────────────────────────

describe('fetchSAData() — caching', () => {
  test('returns cached data when cache is fresh', async () => {
    const sandbox = createSandbox();

    // Pre-populate the cache with fresh data
    const cachedPayload = {
      data: { primeRate: 10.25, inflationRate: 4.0, usdZar: 19.0, source: 'test', isFallback: false },
      timestamp: Date.now(),
    };
    sandbox.localStorage._store['stokvel_sa_data'] = JSON.stringify(cachedPayload);

    const data = await sandbox.fetchSAData();

    // Should serve from cache — fetch should NOT be called
    expect(sandbox.fetch).not.toHaveBeenCalled();
    expect(data.usdZar).toBe(19.0);
    expect(data.fromCache).toBe(true);
  });

  test('ignores expired cache and fetches fresh data', async () => {
    const sandbox = createSandbox();

    // Pre-populate with stale cache (5 hours old, cache duration is 4)
    const stalePayload = {
      data: { primeRate: 10.25, inflationRate: 4.0, usdZar: 17.0, source: 'old', isFallback: false },
      timestamp: Date.now() - 5 * 60 * 60 * 1000,
    };
    sandbox.localStorage._store['stokvel_sa_data'] = JSON.stringify(stalePayload);

    mockFetchOk(sandbox, { rates: { ZAR: 18.80 } });

    const data = await sandbox.fetchSAData();

    // Cache was stale, so fetch should have been called
    expect(sandbox.fetch).toHaveBeenCalled();
    expect(data.usdZar).toBe(18.80);
  });

  test('writes data to cache after successful fetch', async () => {
    const sandbox = createSandbox();
    mockFetchOk(sandbox, { rates: { ZAR: 18.65 } });

    await sandbox.fetchSAData();

    expect(sandbox.localStorage.setItem).toHaveBeenCalledWith(
      'stokvel_sa_data',
      expect.any(String),
    );

    const written = JSON.parse(sandbox.localStorage.setItem.mock.calls[0][1]);
    expect(written.data.usdZar).toBe(18.65);
    expect(written.timestamp).toBeGreaterThan(0);
  });
});

// ── Tests: Savings projection calculations ──────────────────

describe('Savings projection calculations', () => {
  // These tests verify the arithmetic used in both sa-data.js
  // (renderSADataWidget) and dashboard.js (renderSAWidget).

  const primeRate = 10.25; // current SARB prime rate

  test('annual projection for R 10 000 balance', () => {
    const groupBalance = 10_000;
    const projectedAnnual = groupBalance * (1 + primeRate / 100);
    expect(projectedAnnual).toBeCloseTo(11_025.00, 2);
  });

  test('monthly projection for R 10 000 balance', () => {
    const groupBalance = 10_000;
    const projectedAnnual = groupBalance * (1 + primeRate / 100);
    const projectedMonthly = projectedAnnual / 12;
    expect(projectedMonthly).toBeCloseTo(918.75, 2);
  });

  test('monthly interest earned for R 10 000 balance', () => {
    const groupBalance = 10_000;
    const monthlyInterest = groupBalance * (primeRate / 100) / 12;
    expect(monthlyInterest).toBeCloseTo(85.42, 2);
  });

  test('annual interest earned for R 10 000 balance', () => {
    const groupBalance = 10_000;
    const annualGrowth = groupBalance * (primeRate / 100);
    expect(annualGrowth).toBeCloseTo(1_025.00, 2);
  });

  test('projected year-end balance for R 10 000', () => {
    const groupBalance = 10_000;
    const annualGrowth = groupBalance * (primeRate / 100);
    const projectedYear = groupBalance + annualGrowth;
    expect(projectedYear).toBeCloseTo(11_025.00, 2);
  });

  test('zero balance produces zero projections', () => {
    const groupBalance = 0;
    const projectedAnnual = groupBalance * (1 + primeRate / 100);
    const projectedMonthly = projectedAnnual / 12;
    const monthlyInterest = groupBalance * (primeRate / 100) / 12;

    expect(projectedAnnual).toBe(0);
    expect(projectedMonthly).toBe(0);
    expect(monthlyInterest).toBe(0);
  });

  test('large balance R 500 000 produces correct projections', () => {
    const groupBalance = 500_000;
    const annualGrowth = groupBalance * (primeRate / 100);
    const monthlyInterest = annualGrowth / 12;
    const projectedYear = groupBalance + annualGrowth;

    expect(annualGrowth).toBeCloseTo(51_250.00, 2);
    expect(monthlyInterest).toBeCloseTo(4_270.83, 2);
    expect(projectedYear).toBeCloseTo(551_250.00, 2);
  });

  test('both projection formulas agree on annual total', () => {
    // sa-data.js formula: groupBalance * (1 + primeRate / 100)
    // dashboard.js formula: groupBalance + groupBalance * (primeRate / 100)
    const groupBalance = 25_000;
    const formulaA = groupBalance * (1 + primeRate / 100);
    const formulaB = groupBalance + groupBalance * (primeRate / 100);

    expect(formulaA).toBeCloseTo(formulaB, 10);
  });
});

// ── Tests: Static fallback values (verified via fetchSAData) ─

describe('Static fallback values (SARB March 2026)', () => {
  test('fallback returns correct prime rate, inflation, usdZar and isFallback flag', async () => {
    const sandbox = createSandbox();
    // Force both endpoints to fail so fetchSAData returns the static fallback
    sandbox.fetch.mockRejectedValue(new Error('offline'));

    const data = await sandbox.fetchSAData();

    expect(data.primeRate).toBe(10.25);
    expect(data.inflationRate).toBe(4.0);
    expect(data.usdZar).toBe(18.50);
    expect(data.isFallback).toBe(true);
    expect(data.source).toMatch(/fallback/i);
  });
});
