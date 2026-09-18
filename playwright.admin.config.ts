import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'admin.spec.ts', workers: 1, fullyParallel: false, reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3002', trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
