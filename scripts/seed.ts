/**
 * npm run db:seed            — словарь тегов (безопасно для production, идемпотентно)
 * npm run db:seed -- --demo  — + демо-записи (isDemo=true); в production запрещено
 */
import { connectFromEnv } from './_db';
import { seedTags } from '../src/features/catalog/mutations';
import { seedDemo } from '../src/db/seed-demo';
import { isProductionDeploy } from '../src/lib/env';

const { db, close } = connectFromEnv();
await seedTags(db);
console.log('Теги записаны.');
if (process.argv.includes('--demo')) {
  if (isProductionDeploy()) { console.error('Демо-записи в production не загружаются.'); await close(); process.exit(1); }
  console.log(`Демо-записей добавлено: ${await seedDemo(db)} (помечены isDemo=true)`);
}
await close();
