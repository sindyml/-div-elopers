/* ============================================================
   sa-data.js — SA Financial Data Integration (P6 Task 3b)
   
   Fetches live South African financial data using the
   Frankfurter API (no key required, CORS-friendly).
   Falls back to an Azure Function proxy if direct browser
   fetch is blocked, and to cached/static values if both
   fail (so the widget never breaks the page).
   ============================================================ */

// ── CONFIG ──────────────────────────────────────────────────
const SA_DATA_CONFIG = {
  // Primary: Frankfurter API — free, no key, CORS-friendly
  primaryUrl: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR',

  // Fallback: Azure Function proxy (deployed alongside the app)
  // Proxies the same Frankfurter request server-side to avoid CORS
  azureFunctionUrl: '/api/getSAData',

  // Cache key and duration
  cacheKey:         'stokvel_sa_data',
  cacheDurationMs:  4 * 60 * 60 * 1000, // 4 hours

  // Timeout for each fetch attempt (ms)
  timeoutMs: 5000,
};

// ── STATIC FALLBACK VALUES ───────────────────────────────────
// Used only if both the API and Azure Function are unreachable.
// Update these at the start of each sprint with current values.
// Source: SARB MPC decision March 2026 — repo held at 6.75%
const SA_DATA_FALLBACK = {
  primeRate:      10.25,   // % — Prime = repo (6.75%) + 3.5%
  inflationRate:   4.0,    // % — SARB Q2 2026 forecast
  usdZar:         18.50,   // USD/ZAR exchange rate
  source:         'Static fallback (last updated March 2026)',
  isFallback:     true,
};

// ── HELPERS ─────────────────────────────────────────────────

/**
 * Wraps fetch() with a timeout so we don't wait forever.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = SA_DATA_CONFIG.timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Read data from localStorage cache if it's still fresh.
 */
function readCache() {
  try {
    const raw = localStorage.getItem(SA_DATA_CONFIG.cacheKey);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < SA_DATA_CONFIG.cacheDurationMs) {
      return { ...data, fromCache: true };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write data to localStorage cache.
 */
function writeCache(data) {
  try {
    localStorage.setItem(SA_DATA_CONFIG.cacheKey, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {
    // localStorage might be full or unavailable — not critical
  }
}

// ── PRIMARY FETCH: Frankfurter API ───────────────────────────
async function fetchFromPrimaryAPI() {
  const response = await fetchWithTimeout(SA_DATA_CONFIG.primaryUrl);
  if (!response.ok) throw new Error(`API responded with ${response.status}`);

  const json = await response.json();

  // Frankfurter response: { amount: 1, base: "USD", date: "...", rates: { ZAR: 18.xx } }
  const usdZar = json.rates && json.rates.ZAR
    ? parseFloat(json.rates.ZAR.toFixed(2))
    : SA_DATA_FALLBACK.usdZar;

  return {
    usdZar,
    // Prime rate and inflation are SARB/Stats SA values — not available from Frankfurter.
    // We use known static values (updated each sprint).
    primeRate:     SA_DATA_FALLBACK.primeRate,
    inflationRate: SA_DATA_FALLBACK.inflationRate,
    source:        'Frankfurter API (live)',
    isFallback:    false,
  };
}

// ── SECONDARY FETCH: Azure Function Proxy ───────────────────
async function fetchFromAzureFunction() {
  const response = await fetchWithTimeout(SA_DATA_CONFIG.azureFunctionUrl);
  if (!response.ok) throw new Error(`Azure Function responded with ${response.status}`);
  const json = await response.json();
  return {
    primeRate:     json.primeRate     ?? SA_DATA_FALLBACK.primeRate,
    inflationRate: json.inflationRate ?? SA_DATA_FALLBACK.inflationRate,
    usdZar:        json.usdZar        ?? SA_DATA_FALLBACK.usdZar,
    source:        'Azure Function proxy (live)',
    isFallback:    false,
  };
}

// ── MAIN: fetchSAData() ──────────────────────────────────────
/**
 * Public function — call this from the savings widget.
 * Returns a data object with primeRate, inflationRate, usdZar, source.
 * Never throws — always returns something safe to display.
 *
 * @returns {Promise<{primeRate, inflationRate, usdZar, source, isFallback, fromCache?}>}
 */
async function fetchSAData() {
  // 1. Check cache first
  const cached = readCache();
  if (cached) {
    console.log('[SA Data] Serving from cache');
    return cached;
  }

  // 2. Try primary API
  try {
    const data = await fetchFromPrimaryAPI();
    writeCache(data);
    console.log('[SA Data] Fetched from primary API');
    return data;
  } catch (primaryErr) {
    console.warn('[SA Data] Primary API failed:', primaryErr.message);
  }

  // 3. Try Azure Function fallback
  try {
    const data = await fetchFromAzureFunction();
    writeCache(data);
    console.log('[SA Data] Fetched via Azure Function');
    return data;
  } catch (azureErr) {
    console.warn('[SA Data] Azure Function failed:', azureErr.message);
  }

  // 4. Static fallback — widget still renders, user sees a note
  console.warn('[SA Data] Using static fallback data');
  return { ...SA_DATA_FALLBACK };
}


// ── SAVINGS PROJECTION WIDGET ────────────────────────────────
/**
 * Renders the SA Data savings widget into the given container element.
 * Calls fetchSAData() internally.
 *
 * @param {HTMLElement} container — element to render into
 * @param {number} groupBalance   — current group balance in ZAR
 * @param {boolean} forceRefresh  — whether to bypass cache (optional, default false)
 */
async function renderSADataWidget(container, groupBalance = 0, forceRefresh = false) {
  // Clear cache if forceRefresh requested
  if (forceRefresh) {
    try { localStorage.removeItem(SA_DATA_CONFIG.cacheKey); } catch { /* ignore */ }
  }
  // Show loading state
  container.innerHTML = `
    <div class="sa-widget">
      <div class="sa-widget__header">
        <span class="sa-widget__title">📈 SA Financial Snapshot</span>
        <span class="sa-widget__loading">Loading…</span>
      </div>
    </div>
  `;
  injectWidgetStyles();

  const data = await fetchSAData();

  // Simple projection: balance * (1 + prime/100) over 12 months
  const projectedAnnual = groupBalance * (1 + data.primeRate / 100);
  const projectedMonthly = projectedAnnual / 12;

  const sourceLabel = data.fromCache
    ? `Cached data · ${data.source}`
    : data.isFallback
      ? `⚠️ ${data.source}`
      : `Live · ${data.source}`;

  container.innerHTML = `
    <div class="sa-widget${data.isFallback ? ' sa-widget--fallback' : ''}">
      <div class="sa-widget__header">
        <span class="sa-widget__title">📈 SA Financial Snapshot</span>
        <span class="sa-widget__source">${sourceLabel}</span>
      </div>
      <div class="sa-widget__stats">
        <div class="sa-widget__stat">
          <div class="sa-widget__stat-value">${data.primeRate}%</div>
          <div class="sa-widget__stat-label">Prime Rate</div>
        </div>
        <div class="sa-widget__stat">
          <div class="sa-widget__stat-value">${data.inflationRate}%</div>
          <div class="sa-widget__stat-label">CPI Inflation</div>
        </div>
        <div class="sa-widget__stat">
          <div class="sa-widget__stat-value">R${data.usdZar}</div>
          <div class="sa-widget__stat-label">USD / ZAR</div>
        </div>
      </div>
      ${groupBalance > 0 ? `
      <div class="sa-widget__projection">
        <div class="sa-widget__proj-label">Savings Projection (12 months @ prime)</div>
        <div class="sa-widget__proj-values">
          <span>Monthly interest: <strong>R ${projectedMonthly.toFixed(2)}</strong></span>
          <span>Annual total: <strong>R ${projectedAnnual.toFixed(2)}</strong></span>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

function injectWidgetStyles() {
  if (document.getElementById('sa-widget-styles')) return;
  const style = document.createElement('style');
  style.id = 'sa-widget-styles';
  style.textContent = `
    .sa-widget {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-5);
      box-shadow: var(--shadow-sm);
    }
    .sa-widget--fallback {
      border-color: var(--color-warning);
      background: var(--color-warning-light);
    }
    .sa-widget__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
    }
    .sa-widget__title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--color-text-primary);
    }
    .sa-widget__source {
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }
    .sa-widget__loading {
      font-size: 0.82rem;
      color: var(--color-text-muted);
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    .sa-widget__stats {
      display: flex;
      gap: var(--space-6);
      flex-wrap: wrap;
      margin-bottom: var(--space-4);
    }
    .sa-widget__stat-value {
      font-family: var(--font-display);
      font-size: 1.5rem;
      color: var(--color-primary);
    }
    .sa-widget__stat-label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .sa-widget__projection {
      border-top: 1px solid var(--color-border);
      padding-top: var(--space-4);
    }
    .sa-widget__proj-label {
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin-bottom: var(--space-2);
    }
    .sa-widget__proj-values {
      display: flex;
      gap: var(--space-6);
      flex-wrap: wrap;
      font-size: 0.88rem;
      color: var(--color-text-secondary);
    }
    .sa-widget__proj-values strong {
      color: var(--color-primary);
    }
  `;
  document.head.appendChild(style);
}

// Export public API
export { fetchSAData, renderSADataWidget };
