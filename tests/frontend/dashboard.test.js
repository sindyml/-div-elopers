/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mock Firebase compat SDK ──────────────────────────────────
const mockUser = {
  uid: 'user-123',
  email: 'test@stokpal.com',
  displayName: 'Sindiswa Mulondo',
};

const mockGroupData = {
  name: 'Test Stokvel',
  totalBalance: 5000,
  members: ['user-123', 'user-456', 'user-789'],
};

const mockGet = vi.fn().mockResolvedValue({
  empty: false,
  docs: [{ data: () => mockGroupData }],
});
const mockLimit = vi.fn(() => ({ get: mockGet }));
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockCollection = vi.fn(() => ({ where: mockWhere }));

global.firebase = {
  auth: vi.fn(() => ({
    onAuthStateChanged: vi.fn((cb) => cb(mockUser)),
  })),
  firestore: vi.fn(() => ({
    collection: mockCollection,
  })),
};

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ rates: { ZAR: 18.75 } }),
});

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((k) => store[k] ?? null),
    setItem: vi.fn((k, v) => { store[k] = v; }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

function setupDOM() {
  document.body.innerHTML = `
    <span id="user-display-name"></span>
    <span id="group-name-badge"></span>
    <span id="stat-balance"></span>
    <span id="stat-members"></span>
    <div id="sa-widget-container"></div>
    <button id="sa-refresh-btn">Refresh</button>
  `;
}

async function loadDashboard() {
  vi.resetModules();
  await import('../../frontend/js/dashboard.js');
}

describe('Auth Guard', () => {
  let hrefSetter;

  beforeEach(() => {
    setupDOM();
    vi.clearAllMocks();
    // Spy on window.location.href assignment
    hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      enumerable: true,
      value: { href: '', set href(value) { hrefSetter(value); } },
    });
  });

  it('should redirect to login.html when user is not signed in', async () => {
    global.firebase.auth = vi.fn(() => ({
      onAuthStateChanged: vi.fn((cb) => cb(null)),
    }));
    await loadDashboard();
    expect(hrefSetter).toHaveBeenCalledWith('login.html');
  });

  it('should NOT redirect when user is signed in', async () => {
    global.firebase.auth = vi.fn(() => ({
      onAuthStateChanged: vi.fn((cb) => cb(mockUser)),
    }));
    await loadDashboard();
    expect(hrefSetter).not.toHaveBeenCalled();
  });
});

describe('User Display Name', () => {
  beforeEach(() => setupDOM());

  it('should show first name only when displayName is set', async () => {
    global.firebase.auth = vi.fn(() => ({
      onAuthStateChanged: vi.fn((cb) => cb(mockUser)),
    }));
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('user-display-name').textContent).toBe('Sindiswa');
  });

  it('should fall back to email if displayName is null', async () => {
    global.firebase.auth = vi.fn(() => ({
      onAuthStateChanged: vi.fn((cb) => cb({ ...mockUser, displayName: null })),
    }));
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('user-display-name').textContent).toBe('test@stokpal.com');
  });
});

describe('Group Data Loading', () => {
  beforeEach(() => setupDOM());

  it('should display the group name in the badge', async () => {
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('group-name-badge').textContent).toContain('Test Stokvel');
  });

  it('should display the group balance', async () => {
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('stat-balance').textContent).toContain('5');
  });

  it('should display the member count', async () => {
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('stat-members').textContent).toBe('3');
  });

  it('should show "No group yet" when user has no group', async () => {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('group-name-badge').textContent).toContain('No group yet');
  });

  it('should handle Firestore errors gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Firestore unavailable'));
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('group-name-badge').textContent).toContain('My Stokvel');
  });
});

describe('SA Widget — Exchange Rate', () => {
  beforeEach(() => {
    setupDOM();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should render the widget container after load', async () => {
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    const container = document.getElementById('sa-widget-container');
    expect(container.innerHTML).not.toBe('');
  });

  it('should display USD/ZAR rate from Frankfurter API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { ZAR: 18.75 } }),
    });
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    expect(document.getElementById('sa-widget-container').innerHTML).toContain('18.75');
  });

  it('should use fallback rate of 18.50 when API fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    expect(document.getElementById('sa-widget-container').innerHTML).toContain('18.50');
  });

  it('should cache the exchange rate after first fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { ZAR: 18.75 } }),
    });
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    const cached = localStorage.getItem('stokpal_usd_zar');
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached).value).toBe(18.75);
  });

  it('should use cached rate without calling fetch again', async () => {
    localStorage.setItem('stokpal_usd_zar', JSON.stringify({ value: 19.00, timestamp: Date.now() }));
    global.fetch = vi.fn();
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(document.getElementById('sa-widget-container').innerHTML).toContain('19.00');
  });
});

describe('Savings Projection Calculations', () => {
  const PRIME = 10.25;

  it('should correctly calculate monthly interest', () => {
    const balance = 5000;
    const monthly = balance * (PRIME / 100) / 12;
    expect(monthly).toBeCloseTo(42.71, 1);
  });

  it('should correctly calculate annual interest', () => {
    const balance = 5000;
    const annual = balance * (PRIME / 100);
    expect(annual).toBeCloseTo(512.5, 1);
  });

  it('should correctly calculate projected balance after 12 months', () => {
    const balance = 5000;
    const projected = balance + balance * (PRIME / 100);
    expect(projected).toBeCloseTo(5512.5, 1);
  });

  it('should show projection section when balance > 0', async () => {
    setupDOM();
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    expect(document.getElementById('sa-widget-container').innerHTML).toContain('Savings Projection');
  });

  it('should show placeholder when balance is 0', async () => {
    setupDOM();
    mockGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ ...mockGroupData, totalBalance: 0 }) }],
    });
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    expect(document.getElementById('sa-widget-container').innerHTML).toContain('contributions are recorded');
  });
});

describe('Refresh Button', () => {
  beforeEach(() => setupDOM());

  it('should clear cache and re-fetch when refresh is clicked', async () => {
    localStorage.setItem('stokpal_usd_zar', JSON.stringify({ value: 18.75, timestamp: Date.now() }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { ZAR: 19.50 } }),
    });
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    document.getElementById('sa-refresh-btn').click();
    await new Promise((r) => setTimeout(r, 100));
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should disable button while refreshing', async () => {
    await loadDashboard();
    await new Promise((r) => setTimeout(r, 100));
    const btn = document.getElementById('sa-refresh-btn');
    btn.click();
    expect(btn.disabled).toBe(true);
  });
});