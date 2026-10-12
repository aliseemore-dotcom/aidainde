import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': p('./src'), 'server-only': p('./src/tests/stubs/server-only.ts') } },
  test: { include: ['src/tests/unit/**/*.test.ts', 'src/tests/integration/**/*.test.{ts,tsx}'], testTimeout: 30_000 },
});
