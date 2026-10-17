import { defineConfig } from 'vitest/config';

// Unit tests cover the DOM-free logic in src/*.js. Browser-level interaction is
// covered separately by Playwright (see playwright.config.js / e2e/), which is
// excluded here so `vitest` and `playwright test` don't collide.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
