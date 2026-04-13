import { auth } from '../js/firebase-config.js';
import { isAuthenticated, getCurrentUserRole, privateRoute, roleGuard } from '../js/auth.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Mock Firebase modules
jest.mock('../js/firebase-config.js', () => ({
  auth: {
    currentUser: null
  },
  db: {}
}));

jest.mock('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js', () => ({
  doc: jest.fn(),
  getDoc: jest.fn()
}));

// Mock window.location
delete window.location;
window.location = { href: jest.fn() };

// Mock alert
global.alert = jest.fn();

describe('Auth Utilities', () => {
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    auth.currentUser = null;
  });

  // TEST 1: isAuthenticated()
  describe('isAuthenticated()', () => {
    test('returns false when no user is logged in', () => {
      auth.currentUser = null;
      expect(isAuthenticated()).toBe(false);
    });

    test('returns true when user is logged in', () => {
      auth.currentUser = { uid: 'test123', email: 'test@example.com' };
      expect(isAuthenticated()).toBe(true);
    });
  });

  // TEST 2: getCurrentUserRole()
  describe('getCurrentUserRole()', () => {
    test('returns null when no user is logged in', async () => {
      auth.currentUser = null;
      const role = await getCurrentUserRole();
      expect(role).toBe(null);
    });

    test('returns role from Firestore when user exists', async () => {
      auth.currentUser = { uid: 'test123' };
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ role: 'Admin' })
      });
      
      const role = await getCurrentUserRole();
      expect(role).toBe('Admin');
    });
  });

  // TEST 3: privateRoute()
  describe('privateRoute()', () => {
    test('redirects to login when no user is authenticated', () => {
      auth.currentUser = null;
      privateRoute();
      expect(window.location.href).toBe('login.html');
    });

    test('does not redirect when user is authenticated', () => {
      auth.currentUser = { uid: 'test123' };
      privateRoute();
      expect(window.location.href).not.toBe('login.html');
    });
  });

  // TEST 4: roleGuard()
  describe('roleGuard()', () => {
    test('redirects and shows alert when role does not match', async () => {
      auth.currentUser = { uid: 'test123' };
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ role: 'Member' })
      });
      
      await roleGuard('Admin');
      expect(alert).toHaveBeenCalledWith('403: Access denied');
      expect(window.location.href).toBe('dashboard.html');
    });

    test('does nothing when role matches', async () => {
      auth.currentUser = { uid: 'test123' };
      getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ role: 'Admin' })
      });
      
      const originalHref = window.location.href;
      await roleGuard('Admin');
      expect(window.location.href).toBe(originalHref);
    });
  });
});