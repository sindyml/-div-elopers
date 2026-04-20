// tests/integration/routeGuard.integration.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock firebase-config.js ────────────────────────────────────────────────
// auth.js imports auth and db from here; we provide fakes so Node doesn't
// try to initialise a real Firebase app.
vi.mock('../../frontend/js/firebase-config.js', () => ({
  auth: {
    get currentUser() {
      return global._mockCurrentUser ?? null;
    },
  },
  db: {},
}));

// ─── Mock firebase-firestore (CDN URL) ──────────────────────────────────────
// auth.js imports getDoc / doc from a CDN https:// URL which Node can't load.
vi.mock(
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  () => ({
    doc: vi.fn((_db, _collection, _id) => ({ id: _id })),
    getDoc: vi.fn(async () => ({
      data: () => ({ role: global._mockUserRole ?? null }),
    })),
  })
);

// ─── Mock window globals ─────────────────────────────────────────────────────
global.window = {
  location: { href: '' },
  alert: vi.fn(),
};

// ─── Import the real functions AFTER mocks are in place ──────────────────────
const { privateRoute, roleGuard, isAuthenticated, getCurrentUserRole } =
  await import('../../frontend/js/auth.js');

// ─── Reset state before each test ────────────────────────────────────────────
beforeEach(() => {
  global._mockCurrentUser = null;
  global._mockUserRole = null;
  global.window.location.href = '';
  global.window.alert.mockClear();
});

// ─── isAuthenticated ─────────────────────────────────────────────────────────
describe('isAuthenticated', () => {
  it('returns false when no user is logged in', () => {
    global._mockCurrentUser = null;
    expect(isAuthenticated()).toBe(false);
  });

  it('returns true when a user is logged in', () => {
    global._mockCurrentUser = { uid: 'user123' };
    expect(isAuthenticated()).toBe(true);
  });
});

// ─── getCurrentUserRole ───────────────────────────────────────────────────────
describe('getCurrentUserRole', () => {
  it('returns null when no user is logged in', async () => {
    global._mockCurrentUser = null;
    const role = await getCurrentUserRole();
    expect(role).toBeNull();
  });

  it('returns the role from Firestore for a logged-in user', async () => {
    global._mockCurrentUser = { uid: 'user123' };
    global._mockUserRole = 'Admin';
    const role = await getCurrentUserRole();
    expect(role).toBe('Admin');
  });
});

// ─── privateRoute ─────────────────────────────────────────────────────────────
describe('privateRoute', () => {
  it('redirects to login.html when not authenticated', () => {
    global._mockCurrentUser = null;
    privateRoute();
    expect(global.window.location.href).toBe('login.html');
  });

  it('does not redirect when user is authenticated', () => {
    global._mockCurrentUser = { uid: 'user123' };
    privateRoute();
    expect(global.window.location.href).not.toBe('login.html');
  });
});

// ─── roleGuard ───────────────────────────────────────────────────────────────
describe('roleGuard', () => {
  it('redirects to dashboard.html when role does not match', async () => {
    global._mockCurrentUser = { uid: 'user123' };
    global._mockUserRole = 'Member';
    await roleGuard('Admin');
    expect(global.window.location.href).toBe('dashboard.html');
    expect(global.window.alert).toHaveBeenCalledWith('403: Access denied');
  });

  it('does not redirect when role matches', async () => {
    global._mockCurrentUser = { uid: 'user123' };
    global._mockUserRole = 'Admin';
    await roleGuard('Admin');
    expect(global.window.location.href).not.toBe('dashboard.html');
    expect(global.window.alert).not.toHaveBeenCalled();
  });

  it('redirects to dashboard.html when no user is logged in', async () => {
    global._mockCurrentUser = null;
    global._mockUserRole = null;
    await roleGuard('Admin');
    expect(global.window.location.href).toBe('dashboard.html');
    expect(global.window.alert).toHaveBeenCalledWith('403: Access denied');
  });
});