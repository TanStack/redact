import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    env: { PORT: '5173' },
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
