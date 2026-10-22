import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Проверка полного пути на подготовленных данных (content/preview) в режиме предпросмотра черновиков.
 * Отдельная БД (.pglite-preview) и порт, чтобы не мешать основным автотестам.
 */
export default defineConfig({
  ...base,
  testDir: 'src/tests/preview',
  use: { ...base.use, baseURL: 'http://localhost:3200' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1100 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'rm -rf .pglite-preview && npx next start -p 3200',
    url: 'http://localhost:3200',
    reuseExistingServer: false,
    timeout: 90_000,
    env: { PREVIEW_DRAFTS: 'true', PGLITE_DIR: '.pglite-preview', RESULT_TOKEN_SECRET: 'preview-secret-preview' },
  },
});
