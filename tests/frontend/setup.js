import { vi } from 'vitest';

// Mock window.location
Object.defineProperty(window, 'location', {
  value: { href: '', assign: vi.fn(), replace: vi.fn(), reload: vi.fn() },
  writable: true,
});

// Mock alert
global.alert = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((k) => store[k] || null),
    setItem: vi.fn((k, v) => { store[k] = v; }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = vi.fn();