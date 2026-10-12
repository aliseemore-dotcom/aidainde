import 'server-only';
import path from 'node:path';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleLite } from 'drizzle-orm/pglite';
import { migrate as migrateLite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';
import { isProductionDeploy, readEnv } from '@/lib/env';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), 'drizzle');
const g = globalThis as unknown as { __db?: Promise<Db> };

/**
 * DATABASE_URL задан -> Postgres (Supabase). Иначе локально встроенный PGlite в `.pglite/`
 * (с миграциями «на лету»); в боевом деплое без DATABASE_URL — ошибка, а не тихая пустая база.
 */
export function getDb(): Promise<Db> {
  g.__db ??= connect();
  return g.__db;
}

async function connect(): Promise<Db> {
  const env = readEnv();
  if (env.DATABASE_URL) {
    const db = drizzlePg(new Pool({ connectionString: env.DATABASE_URL, max: 5 }), { schema });
    return db as unknown as Db;
  }
  if (isProductionDeploy(env)) throw new Error('DATABASE_URL не задан в production');
  const lite = new PGlite(path.join(process.cwd(), '.pglite'));
  const db = drizzleLite(lite, { schema });
  await migrateLite(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** Для тестов и скриптов: чистая in-memory БД с применёнными миграциями. */
export async function createMemoryDb(): Promise<Db> {
  const db = drizzleLite(new PGlite(), { schema });
  await migrateLite(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

export async function runMigrations(db: Db): Promise<void> {
  // pg и pglite мигратор совместимы по формату папки; выбираем по наличию DATABASE_URL
  if (readEnv().DATABASE_URL) await migratePg(db as never, { migrationsFolder: MIGRATIONS });
  else await migrateLite(db as never, { migrationsFolder: MIGRATIONS });
}

export { schema };
