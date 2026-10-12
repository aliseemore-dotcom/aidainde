import { connectFromEnv } from './_db';

const { migrateUp, close } = connectFromEnv();
await migrateUp();
await close();
console.log('Миграции применены.');
