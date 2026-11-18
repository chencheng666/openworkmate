import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5181',
  },
  webServer: [
    { command: 'pnpm exec vite --port 5181', url: 'http://127.0.0.1:5181', reuseExistingServer: !process.env.CI },
    { command: 'pnpm --dir ../admin-web dev', url: 'http://127.0.0.1:5174/admin/', reuseExistingServer: !process.env.CI },
  ],
});
