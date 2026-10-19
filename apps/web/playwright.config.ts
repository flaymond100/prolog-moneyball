import { defineConfig, devices } from '@playwright/test'

const port = 4173
// Serve from a sub-path like GitHub Pages does. Must match `--base` in the `test:e2e` build script.
const basePath = '/prolog-moneyball/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Navigate with relative URLs (`page.goto('#/dev/palette')`) so they resolve under the base path.
    baseURL: `http://localhost:${port}${basePath}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build first (`pnpm test:e2e` runs `vite build`); a chained build here leaves an orphaned preview server.
    command: `vite preview --base ${basePath} --port ${port} --strictPort`,
    url: `http://localhost:${port}${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
