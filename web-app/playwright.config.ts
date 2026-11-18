import { defineConfig } from '@playwright/test';
const candidate = process.env.WORKMATE_PREVIEW_URL;
if (candidate && !/^http:\/\/127\.0\.0\.1:\d+$/.test(candidate)) throw Error('只允许本机候选预览地址');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: candidate || 'http://127.0.0.1:5181',
  },
  webServer: candidate ? undefined : [
    { command: 'pnpm exec vite --port 5181', url: 'http://127.0.0.1:5181', reuseExistingServer: !process.env.CI },
    { command: 'pnpm --dir ../admin-web dev', url: 'http://127.0.0.1:5174/admin/', reuseExistingServer: !process.env.CI },
  ],
});
