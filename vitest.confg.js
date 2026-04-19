// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/frontend/**/*.test.js'],
    exclude: ['tests/integration/**'],
    setupFiles: ['./tests/setup.js'],
  },
});