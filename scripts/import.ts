/**
 * npm run content:import -- content/мои-места.json            проверка + запись как ЧЕРНОВИКИ
 * npm run content:import -- файл.json --dry-run               только проверка, ничего не пишет
 * npm run content:import -- файл.json --publish               сразу опубликовать (только то, что проходит правила публикации)
 */
import { readFileSync } from 'node:fs';
import { connectFromEnv } from './_db';
import { parseImport, runImport } from '../src/features/catalog/import';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('Использование: npm run content:import -- <файл.json> [--dry-run] [--publish]'); process.exit(1); }
const { records, issues } = parseImport(JSON.parse(readFileSync(file, 'utf8')));
for (const i of issues) console.error(`✗ #${i.index}${i.slug ? ` (${i.slug})` : ''}: ${i.message}`);
console.log(`Проверено: к записи готово ${records.length}, с ошибками ${issues.length}`);
if (flags.includes('--dry-run') || !records.length) process.exit(issues.length ? 1 : 0);

const { db, close } = connectFromEnv();
const res = await runImport(db, records, '00000000-0000-0000-0000-00000000000f', { publish: flags.includes('--publish') });
await close();
for (const s of res.skipped) console.error(`– #${s.index}${s.slug ? ` (${s.slug})` : ''}: ${s.message}`);
console.log(`Создано: ${res.created}, пропущено: ${res.skipped.length}`);
process.exit(issues.length || res.skipped.length ? 1 : 0);
