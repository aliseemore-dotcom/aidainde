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
  PREVIEW_DRAFTS: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal('').transform(() => undefined)),
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

/**
 * Режим предпросмотра черновиков (для тестирования до публикации): в каталоге, подборке и карточках появляются
 * записи со статусом «черновик». Включается только PREVIEW_DRAFTS=true и НИКОГДА на боевом деплое.
 */
export function allowDraftPreview(env: Env = readEnv()): boolean {
  return !isProductionDeploy(env) && env.PREVIEW_DRAFTS === 'true';
}

/** Единое место, где решается, что видят посетители: demo и черновики. */
export function contentVisibility(env: Env = readEnv()): { allowDemo: boolean; allowDrafts: boolean } {
  return { allowDemo: allowDemoContent(env), allowDrafts: allowDraftPreview(env) };
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
