/** Таблицы словарей для руководства по импорту: `tsx scripts/dump-vocab.ts` (печатает markdown). */
import { TAGS } from '../src/features/recommend/tag-registry';
import { PLACE_KINDS } from '../src/features/catalog/place-kinds';

const GROUPS: [string, string, string][] = [
  ['category', 'Направление и формат', 'Направление (walks, venues, games, culture, wellness, home) — минимум один из шести; остальное — уточнения'],
  ['gameStyle', 'Тип игры', 'Для игр и развлечений'],
  ['competitionMode', 'Азарт', 'Для игр'],
  ['format', 'Формат участия и усилия', 'Смотреть/участвовать; усилия для домашних идей'],
  ['mood', 'Настроение', 'Какое настроение запись даёт (1–2 тега)'],
  ['energy', 'Энергия общения', 'Насколько людно и шумно (1–2 тега)'],
  ['company', 'Для кого', 'Состав компании и общение'],
  ['physicalLoad', 'Нагрузка', 'Физическая активность на месте'],
  ['accessibility', 'Доступность и ограничения', 'Только если это точно известно'],
];
const out: string[] = [];
for (const [g, title, note] of GROUPS) {
  out.push(`#### ${title}\n\n${note}.\n\n| Ключ (`+'`tags`'+`) | Значение |\n|---|---|`);
  for (const t of TAGS.filter((x) => x.group === g)) out.push(`| \`${t.key}\` | ${t.label} |`);
  out.push('');
}
out.push('#### Типы мест (`kind`)\n\n| Ключ | Значение |\n|---|---|');
for (const k of PLACE_KINDS) out.push(`| \`${k.key}\` | ${k.label} |`);
console.log(out.join('\n'));
