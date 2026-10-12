import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';

// Используем предустановленный Chromium (скачивать браузеры не нужно)
function chromiumPath(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => d.startsWith('chromium-'));
  const p = dir && `${root}/${dir}/chrome-linux/chrome`;
  return p && existsSync(p) ? p : existsSync(`${root}/chromium`) ? `${root}/chromium` : undefined;
}

export default defineConfig({
  testDir: 'src/tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: { executablePath: chromiumPath() },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
