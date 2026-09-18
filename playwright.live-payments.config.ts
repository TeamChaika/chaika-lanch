import { randomBytes, scryptSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// This suite cannot reach a bank: all QRM requests go to a local contract fixture.
const namespace = process.env.MENU_LOCAL_NAMESPACE || `payments-live-test-${Date.now()}`;
process.env.MENU_LOCAL_NAMESPACE = namespace;
const salt = randomBytes(16).toString('hex');
const env = {
  MENU_STORE: 'local', MENU_LOCAL_NAMESPACE: namespace,
  APP_ORIGINS: 'http://127.0.0.1:3007', QRM_MODE: 'live', QRM_LIVE_API_KEY: 'local-fixture-key', QRM_API_KEY: '',
  QRM_API_BASE_URL: 'https://fixture.qrm.ooo', QRM_TEST_ORIGIN: 'http://127.0.0.1:3099',
  SESSION_SECRET: 'local-live-payment-tests-only-no-production-secret',
  OWNER_PASSWORD_HASH: `${salt}:${scryptSync('local-owner-fixture', salt, 64).toString('hex')}`,
  PAYMENT_WORKER_TOKEN: 'local-payment-worker-fixture-token-32-characters',
};
export default defineConfig({
  testDir: './tests', testMatch: 'live-payments.spec.ts', workers: 1, timeout: 60000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3007', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'node tests/fixtures/qrmanager.mjs', url: 'http://127.0.0.1:3099/control', reuseExistingServer: false },
    { command: 'npx next dev --hostname 127.0.0.1 --port 3006', url: 'http://127.0.0.1:3006', reuseExistingServer: false, timeout: 90000, env },
    { command: 'node server/gateway.mjs', url: 'http://127.0.0.1:3007', reuseExistingServer: false, timeout: 90000, env: { ...env, NODE_ENV: 'development', PORT: '3007', PAYMENT_INTERNAL_PORT: '3006', PAYMENT_GATEWAY_ATTACH: '1' } },
  ],
});
