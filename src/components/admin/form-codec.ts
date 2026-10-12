import type { ContentType } from '@/features/recommend/types';
import { FIELDS } from './fields';
import { KAZAN_UTC_OFFSET } from '@/lib/date-kazan';

/** Значения полей в форме — строки; здесь они превращаются в то, что принимает API, и обратно. */
export type FormState = Record<string, string>;
export interface MediaRow { url: string; alt: string; rightsStatus: string }
export interface OccRow { startsAt: string; endsAt: string; status: string; ticketsUrl: string }

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO/Date -> значение для <input type="datetime-local"> в часовом поясе Казани (UTC+3). */
export function toKazanInput(v: unknown): string {
  if (!v) return '';
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return '';
  const k = new Date(d.getTime() + 3 * 3600_000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
export function fromKazanInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00${KAZAN_UTC_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const tri = (v: string) => (v === 'true' ? true : v === 'false' ? false : null);
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export function initialForm(type: ContentType, data: Record<string, unknown> | null): { form: FormState; tags: string[]; media: MediaRow[]; occurrences: OccRow[] } {
  const form: FormState = { status: 'draft', isDemo: 'false' };
  for (const f of FIELDS.filter((x) => x.types.includes(type))) {
    const raw = data?.[f.name === 'openingHours' ? 'openingHoursJson' : f.name === 'requiredMaterials' ? 'requiredMaterialsJson' : f.name];
    if (f.kind === 'datetime') form[f.name] = toKazanInput(raw);
    else if (f.kind === 'tristate') form[f.name] = raw === true ? 'true' : raw === false ? 'false' : '';
    else if (f.kind === 'hours') form[f.name] = raw ? Object.entries(raw as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
    else if (f.kind === 'lines') form[f.name] = Array.isArray(raw) ? raw.join('\n') : '';
    else form[f.name] = raw == null ? (f.kind === 'select' ? f.options![0]!.v : '') : String(raw);
  }
  if (data) { form.status = String(data.status ?? 'draft'); form.isDemo = data.isDemo ? 'true' : 'false'; }
  if (type === 'place') {
    const c = (data?.contactsJson ?? {}) as { phone?: string; email?: string };
    form.phone = c.phone ?? ''; form.email = c.email ?? '';
  }
  if (type === 'event') form.placeId = data?.placeId ? String(data.placeId) : '';
  return {
    form,
    tags: (data?.tags as string[] | undefined) ?? [],
    media: ((data?.media as MediaRow[] | undefined) ?? []).map((m) => ({ url: m.url, alt: m.alt, rightsStatus: m.rightsStatus })),
    occurrences: ((data?.occurrences as { startsAt: string; endsAt: string | null; status: string; ticketsUrl: string | null }[] | undefined) ?? [])
      .map((o) => ({ startsAt: toKazanInput(o.startsAt), endsAt: toKazanInput(o.endsAt), status: o.status, ticketsUrl: o.ticketsUrl ?? '' })),
  };
}

export function buildPayload(
  type: ContentType, form: FormState, tags: string[], media: MediaRow[], occurrences: OccRow[], status: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { status, isDemo: form.isDemo === 'true', tags };
  for (const f of FIELDS.filter((x) => x.types.includes(type))) {
    const v = form[f.name] ?? '';
    switch (f.kind) {
      case 'number': out[f.name] = num(v); break;
      case 'tristate': out[f.name] = tri(v); break;
      case 'datetime': out[f.name] = fromKazanInput(v); break;
      case 'url': out[f.name] = orNull(v); break;
      case 'select': out[f.name] = f.name === 'indoorOutdoor' && type === 'event' ? orNull(v) : v; break;
      case 'lines': out.requiredMaterialsJson = v.split('\n').map((x) => x.trim()).filter(Boolean); break;
      case 'hours': {
        const entries = v.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });
        out.openingHoursJson = entries.length ? Object.fromEntries(entries) : null; break;
      }
      case 'text': case 'textarea': out[f.name] = f.name === 'district' || f.name === 'stepsRichText' ? orNull(v) : v.trim(); break;
      default: out[f.name] = v;
    }
  }
  delete out.requiredMaterials; delete out.openingHours;
  if (type === 'place') out.contactsJson = form.phone || form.email ? { ...(form.phone ? { phone: form.phone } : {}), ...(form.email ? { email: form.email } : {}) } : null;
  if (type === 'event') {
    out.placeId = orNull(form.placeId ?? '');
    out.occurrences = occurrences.filter((o) => o.startsAt).map((o) => ({ startsAt: fromKazanInput(o.startsAt), endsAt: fromKazanInput(o.endsAt), status: o.status, ticketsUrl: orNull(o.ticketsUrl) }));
  }
  out.media = media.filter((m) => m.url).map((m, i) => ({ url: m.url.trim(), alt: m.alt.trim(), order: i, rightsStatus: m.rightsStatus }));
  return out;
}
