import { randomBytes, scryptSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const salt = randomBytes(16).toString('hex');
export default defineConfig({
  testDir: './tests', testMatch: 'nutrition.spec.ts', workers: 1, timeout: 45000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3008', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npx next dev --hostname 127.0.0.1 --port 3008', url: 'http://127.0.0.1:3008', reuseExistingServer: false, timeout: 90000,
    env: {
      MENU_STORE: 'local', MENU_LOCAL_NAMESPACE: `nutrition-test-${Date.now()}`,
      APP_ORIGINS: 'http://127.0.0.1:3008', QRM_MODE: 'disabled',
      SESSION_SECRET: 'nutrition-tests-only-not-a-production-secret',
      OWNER_PASSWORD_HASH: `${salt}:${scryptSync('nutrition-test-owner', salt, 64).toString('hex')}`,
    },
  },
});
