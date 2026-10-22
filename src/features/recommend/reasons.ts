import { tagLabel } from './tag-registry';
import type { Candidate, FinalAnswers, Occurrence } from './types';
import type { Match } from './scoring';
import { formatEventWhen } from '@/lib/date-kazan';
import { BUDGET_LIMIT } from './eligibility';

const MOOD_TEXT: Record<string, string> = {
  excitement: 'Для драйва', discovery: 'Для вдохновения', relax: 'Для отдыха', connection: 'Для общения', surprise: 'Для неожиданных впечатлений',
};
const SETTING_TEXT: Record<string, string> = { indoor: 'В помещении', outdoor: 'На улице', both: 'В помещении и на улице', home: 'Дома' };
const fmtRub = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;

/**
 * «Почему подходит»: только факты, подтверждённые данными карточки. Никаких обещаний наличия мест
 * (§9 шаг 5). Не более 4 пунктов.
 */
export function explain(c: Candidate, a: FinalAnswers, m: Match, occ: Occurrence | null, cost: number | null): { reasons: string[]; codes: string[] } {
  const reasons: string[] = []; const codes: string[] = [];
  const add = (code: string, text: string) => { codes.push(code); reasons.push(text); };

  if (m.mostSpecificMatch) add(`subtype:${m.mostSpecificMatch}`, tagLabel(m.mostSpecificMatch));
  else if (m.directionMatch && a.direction) add(`direction:${a.direction}`, tagLabel(a.direction));
  if (m.companyMatched) add('company', tagLabel(`company_${a.companion}`));
  if (m.settingMatched) add(`setting:${c.setting}`, SETTING_TEXT[a.setting === 'home' ? 'home' : c.setting]!);
  const limit = BUDGET_LIMIT[a.budgetTier] ?? null;
  if (limit != null && cost != null && cost <= limit) {
    add(`budget:${a.budgetTier}`, limit === 0 ? 'Бесплатно' : `До ${fmtRub(limit)}`);
  }
  if (m.moodMatched) add(`mood:${a.mood}`, MOOD_TEXT[a.mood]!);
  // не более 4 пунктов; у события дата показывается всегда
  const room = occ ? 3 : 4;
  const out = { reasons: reasons.slice(0, room), codes: codes.slice(0, room) };
  if (occ) { out.reasons.push(formatEventWhen(occ.startsAt)); out.codes.push('date'); }
  return out;
}
