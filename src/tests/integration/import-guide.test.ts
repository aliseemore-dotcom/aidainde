import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createMemoryDb, type Db } from '@/db/client';
import { events, places } from '@/db/schema';
import { seedTags } from '@/features/catalog/mutations';
import { allowedFields, parseImport, runImport } from '@/features/catalog/import';
import { PLACE_KINDS } from '@/features/catalog/place-kinds';
import { TAGS } from '@/features/recommend/tag-registry';

const guide = readFileSync('docs/CATALOG_IMPORT_GUIDE.md', 'utf8');
const blocks = [...guide.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>[]);
const [restaurant, museum, event] = blocks.map((b) => b[0]!);
let db: Db;
beforeAll(async () => { db = await createMemoryDb(); await seedTags(db); });

describe('руководство по импорту соответствует реальной схеме', () => {
  it('есть три примера: ресторан, культурная площадка, мероприятие', () => {
    expect(blocks).toHaveLength(3);
    expect(restaurant).toMatchObject({ type: 'place', kind: 'restaurant' });
    expect(museum).toMatchObject({ type: 'place', kind: 'museum' });
    expect(event).toMatchObject({ type: 'event', placeSlug: museum!.slug });
  });

  it('каждый пример проходит ту же проверку, что боевой импорт', () => {
    for (const b of blocks) {
      const r = parseImport(b, { imageHosts: [] });
      expect(r.issues).toEqual([]);
      expect(r.records).toHaveLength(1);
      expect(r.records[0]!.data.status).toBe('draft');
    }
  });

  it('примеры реально загружаются: ресторан, музей, затем событие на этой площадке', async () => {
    const res = await runImport(db, parseImport([restaurant, museum, event], { imageHosts: [] }).records, '00000000-0000-0000-0000-00000000000f');
    expect(res).toMatchObject({ created: 3, skipped: [] });
    const [m] = await db.select().from(places).where(eq(places.slug, 'muzey-obrazets'));
    const [e] = await db.select().from(events).where(eq(events.slug, 'kamerny-kontsert-obrazets'));
    expect(e!.placeId).toBe(m!.id);
    expect(e!.startsAt.toISOString()).toBe('2026-10-17T16:00:00.000Z');
  });

  it('повторная загрузка примеров не создаёт дублей', async () => {
    const res = await runImport(db, parseImport([restaurant, museum, event], { imageHosts: [] }).records, '00000000-0000-0000-0000-00000000000f');
    expect(res.created).toBe(0);
    expect(res.skipped).toHaveLength(3);
  });

  it('руководство описывает все допустимые поля каждого типа', () => {
    for (const type of ['place', 'event', 'activity'] as const) {
      for (const f of allowedFields(type)) {
        if (['isDemo', 'status'].includes(f)) continue; // служебные: в файле не задаются
        expect(guide, `${type}.${f}`).toContain(`\`${f}\``);
      }
    }
  });

  it('все теги и типы мест из кода перечислены в руководстве', () => {
    for (const t of TAGS) expect(guide, t.key).toContain(`\`${t.key}\``);
    for (const k of PLACE_KINDS) expect(guide, k.key).toContain(`\`${k.key}\``);
  });

  it('команды из руководства существуют', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
    for (const name of ['content:import', 'content:check', 'content:csv']) {
      expect(guide).toContain(`npm run ${name}`);
      expect(scripts[name]).toBeTruthy();
    }
  });
});
