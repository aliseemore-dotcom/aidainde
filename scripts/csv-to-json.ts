/**
 * npm run content:csv -- places|events|activities файл.csv [--out файл.json]
 * Превращает таблицу (CSV из Excel/Google Таблиц, UTF-8) в JSON для `content:import` и проверяет её.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { csvToRecords } from '../src/features/catalog/csv-import';
import { TYPE_BY_ARG } from '../src/features/catalog/csv-schema';

const [kind, file, ...rest] = process.argv.slice(2);
const type = kind ? TYPE_BY_ARG[kind] : undefined;
if (!type || !file) { console.error('Использование: npm run content:csv -- places|events|activities файл.csv [--out файл.json]'); process.exit(1); }
const { records, issues, skippedExamples } = csvToRecords(type, readFileSync(file, 'utf8'));
for (const i of issues) console.error(`✗ строка ${i.row}${i.column ? `, «${i.column}»` : ''}: ${i.message}`);
if (skippedExamples) console.log(`Строк-примеров пропущено: ${skippedExamples}`);
console.log(`Строк готово к импорту: ${records.length}, ошибок: ${issues.filter((x) => !/Неизвестная колонка/.test(x.message)).length}`);
const out = rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : file.replace(/\.csv$/i, '') + '.json';
if (records.length && out) { writeFileSync(out, JSON.stringify(records, null, 2)); console.log(`Записано: ${out}`); }
process.exit(issues.some((x) => !/Неизвестная колонка/.test(x.message)) ? 1 : 0);
