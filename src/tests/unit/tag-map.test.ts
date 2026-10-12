import { describe, expect, it } from 'vitest';
import { ALL_MAPPED_TAGS, branchRequirements } from '@/features/recommend/tag-map';
import { TAGS, TAG_KEYS } from '@/features/recommend/tag-registry';
import { ALL_STEPS } from '@/features/quiz/config';

describe('словарь тегов', () => {
  it('ключи тегов уникальны', () => {
    expect(new Set(TAGS.map((t) => t.key)).size).toBe(TAGS.length);
  });

  it('все теги из таблицы соответствия заведены в реестре', () => {
    for (const k of ALL_MAPPED_TAGS) expect(TAG_KEYS.has(k), k).toBe(true);
  });

  it('каждое значение ответа ветки либо сопоставлено тегам, либо нейтрально (any / surprise / city)', () => {
    const neutral = new Set(['any', 'surprise', 'city']);
    for (const s of ALL_STEPS.filter((x) => x.id.startsWith('BRANCH.'))) {
      const local = s.id.split('.').pop()!;
      for (const o of s.options!) {
        const reqs = branchRequirements({ [local]: o.value });
        if (neutral.has(o.value)) expect(reqs, `${s.id}=${o.value}`).toEqual([]);
        else expect(reqs.length, `${s.id}=${o.value}`).toBeGreaterThan(0);
      }
    }
  });
});
