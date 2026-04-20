// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/frontend/**/*.test.js'],
    exclude: ['tests/integration/**'],
    setupFiles: ['./tests/frontend/setup.js'],
  },
// add to both vitest.config.js and vitest.integration.config.js
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'json-summary', 'html'],
  reportsDirectory: './coverage',
},
});