import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'payments.spec.ts', workers: 1, timeout: 45000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3006', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'node tests/fixtures/qrmanager.mjs', url: 'http://127.0.0.1:3099/control', reuseExistingServer: false },
    { command: 'npx next dev --hostname 127.0.0.1 --port 3006', url: 'http://127.0.0.1:3006', reuseExistingServer: false, timeout: 90000,
      env: { MENU_STORE: 'local', APP_ORIGINS: 'http://127.0.0.1:3006', QRM_MODE: 'sandbox', QRM_API_KEY: 'local-fixture-key', QRM_TEST_ORIGIN: 'http://127.0.0.1:3099', SESSION_SECRET: 'local-payment-tests-only-not-a-production-secret' } },
  ],
});
