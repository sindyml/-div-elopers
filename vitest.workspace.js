// vitest.workspace.js
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'frontend',
      environment: 'jsdom',
      globals: true,
      include: ['tests/frontend/**/*.test.js'],
      setupFiles: ['./tests/setup.js'],
    },
  },
  {
    test: {
      name: 'integration',
      environment: 'node',
      globals: true,
      include: ['tests/integration/**/*.test.js'],
    },
  },
]);