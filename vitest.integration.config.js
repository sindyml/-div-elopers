// vitest.integration.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.js'],
  },
// add to both vitest.config.js and vitest.integration.config.js
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'json-summary', 'html'],
  reportsDirectory: './coverage',
},
});