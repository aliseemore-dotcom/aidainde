import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  RESULT_TOKEN_SECRET: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  ALLOW_DEMO_CONTENT: z.string().optional(),
  LOG_RECOMMENDATIONS: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  IMAGE_HOSTS: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  APP_ENV: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return schema.parse(source);
}

/** Боевой деплой: на нём demo-контент не показывается никогда, независимо от переменных. */
export function isProductionDeploy(env: Env = readEnv()): boolean {
  return env.VERCEL_ENV === 'production' || env.APP_ENV === 'production';
}

export function allowDemoContent(env: Env = readEnv()): boolean {
  return !isProductionDeploy(env) && env.ALLOW_DEMO_CONTENT === 'true';
}

/** Секрет для хэширования токенов результатов. В боевом режиме обязателен. */
export function tokenSecret(env: Env = readEnv()): string {
  if (env.RESULT_TOKEN_SECRET && env.RESULT_TOKEN_SECRET.length >= 16) return env.RESULT_TOKEN_SECRET;
  if (isProductionDeploy(env)) throw new Error('RESULT_TOKEN_SECRET (16+ символов) обязателен в production');
  return 'dev-only-insecure-secret'; // только локальная разработка и тесты
}

export function allowedImageHosts(env: Env = readEnv()): string[] {
  return (env.IMAGE_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}
