import { defineConfig } from '@playwright/test'

const webServer = {
  command: 'npm.cmd run dev -- --host 127.0.0.1 --port 4173',
  url: 'http://127.0.0.1:4173',
  reuseExistingServer: false,
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: process.env.NO_WEBSERVER === '1' ? undefined : webServer,
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
})
