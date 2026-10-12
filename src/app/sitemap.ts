import type { MetadataRoute } from 'next';
import { getDb } from '@/db/client';
import { listPublicSlugs } from '@/features/catalog/queries';
import { allowDemoContent } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const pages: MetadataRoute.Sitemap = ['', '/quiz', '/explore', '/date', '/about', '/privacy'].map((p) => ({ url: `${base}${p}` }));
  try {
    const s = await listPublicSlugs(await getDb(), { allowDemo: allowDemoContent() });
    const mk = (dir: string, rows: { slug: string; updatedAt: Date }[]) => rows.map((r) => ({ url: `${base}/${dir}/${r.slug}`, lastModified: r.updatedAt }));
    return [...pages, ...mk('places', s.places), ...mk('events', s.events), ...mk('activities', s.activities)];
  } catch {
    return pages; // сбой БД не должен ломать sitemap
  }
}
