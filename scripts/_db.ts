import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/client';

export const MIGRATIONS = path.join(process.cwd(), 'drizzle');

export function connectFromEnv(): { db: Db; close: () => Promise<void>; migrateUp: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL не задан'); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    close: () => pool.end(),
    migrateUp: () => migrate(db, { migrationsFolder: MIGRATIONS }),
  };
}
