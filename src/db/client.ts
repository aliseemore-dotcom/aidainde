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
import { allowDemoContent, isProductionDeploy, readEnv } from '@/lib/env';
import { seedTags } from '@/features/catalog/mutations';
import { seedDemo } from './seed-demo';

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
  await bootstrapLocal(db as unknown as Db);
  return db as unknown as Db;
}

/** Локальная разработка: словарь тегов и (если разрешено) демо-записи появляются сами. */
async function bootstrapLocal(db: Db): Promise<void> {
  await seedTags(db);
  if (allowDemoContent()) {
    const [any] = await db.select({ id: schema.places.id }).from(schema.places).limit(1);
    if (!any) await seedDemo(db);
  }
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
