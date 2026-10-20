/**
 * Данные для сборки шаблона .xlsx. Шаблон пересобирается так:
 *   npx tsx scripts/dump-template-data.ts > data.json && python3 scripts/build-template.py data.json content/catalog-template.xlsx
 */
import { COLUMNS, SHEET_NAME } from '../src/features/catalog/csv-schema';
import { TAGS } from '../src/features/recommend/tag-registry';
import { PLACE_KINDS } from '../src/features/catalog/place-kinds';

console.log(JSON.stringify({ columns: COLUMNS, sheets: SHEET_NAME, tags: TAGS, kinds: PLACE_KINDS }, null, 2));
