/** Данные для сборки шаблона .xlsx (columns + теги): `tsx scripts/dump-template-data.ts > data.json` */
import { COLUMNS, SHEET_NAME } from '../src/features/catalog/csv-schema';
import { TAGS } from '../src/features/recommend/tag-registry';

console.log(JSON.stringify({ columns: COLUMNS, sheets: SHEET_NAME, tags: TAGS }, null, 2));
