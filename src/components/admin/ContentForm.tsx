'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FIELDS, STATUS_OPTIONS, type Field } from './fields';
import { buildPayload, initialForm, type MediaRow, type OccRow } from './form-codec';
import { TAGS } from '@/features/recommend/tag-registry';
import { slugify } from '@/features/catalog/slug';
import type { ContentType } from '@/features/recommend/types';

const SECTION = { place: 'places', event: 'events', activity: 'activities' } as const;
const GROUP_LABEL: Record<string, string> = {
  category: 'Направление и формат', gameStyle: 'Тип игры', competitionMode: 'Азарт', mood: 'Настроение', energy: 'Энергия общения',
  company: 'Для кого', format: 'Формат участия', physicalLoad: 'Нагрузка', accessibility: 'Доступность и ограничения', setting: 'Место',
};
interface Issue { field?: string; message: string }

export function ContentForm({ type, id, initial, places, role }: {
  type: ContentType; id?: string; initial: Record<string, unknown> | null; places: { id: string; title: string }[]; role: 'editor' | 'admin';
}) {
  const router = useRouter();
  const init = initialForm(type, initial);
  const [form, setForm] = useState(init.form);
  const [tags, setTags] = useState(init.tags);
  const [media, setMedia] = useState<MediaRow[]>(init.media);
  const [occ, setOcc] = useState<OccRow[]>(init.occurrences);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; issues?: Issue[] } | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }

  async function save(status: string) {
    setBusy(true); setMsg(null);
    try {
      const payload = buildPayload(type, form, tags, media, occ, status);
      const r = id ? await call(`/api/admin/${SECTION[type]}/${id}`, 'PATCH', payload) : await call(`/api/admin/${SECTION[type]}`, 'POST', payload);
      if (!r.ok) { setMsg({ ok: false, text: r.json?.error?.message ?? 'Не удалось сохранить', issues: Array.isArray(r.json?.error?.details) ? r.json.error.details : undefined }); return; }
      if (!id) { router.push(`/admin/${SECTION[type]}/${r.json.id}`); return; }
      set('status', status);
      setMsg({ ok: true, text: status === 'published' ? 'Опубликовано' : 'Сохранено' });
      router.refresh();
    } catch { setMsg({ ok: false, text: 'Нет соединения. Повторите.' }); } finally { setBusy(false); }
  }
  async function unpublish() {
    setBusy(true);
    const r = await call(`/api/admin/${SECTION[type]}/${id}/unpublish`, 'POST', {});
    setBusy(false);
    if (r.ok) { set('status', 'draft'); setMsg({ ok: true, text: 'Снято с публикации' }); router.refresh(); } else setMsg({ ok: false, text: r.json?.error?.message ?? 'Не получилось' });
  }
  async function remove() {
    if (!confirm('Удалить запись навсегда? Это нельзя отменить.')) return;
    setBusy(true);
    const r = await call(`/api/admin/${SECTION[type]}/${id}`, 'DELETE');
    setBusy(false);
    if (r.ok) router.push(`/admin/${SECTION[type]}`); else setMsg({ ok: false, text: r.json?.error?.message ?? 'Не получилось удалить' });
  }

  const fields = FIELDS.filter((f) => f.types.includes(type));
  const input = (f: Field) => {
    const common = { id: `f-${f.name}`, name: f.name, value: form[f.name] ?? '' };
    switch (f.kind) {
      case 'textarea': case 'hours': case 'lines': return <textarea {...common} rows={f.kind === 'textarea' ? 6 : 4} onChange={(e) => set(f.name, e.target.value)} />;
      case 'select': return <select {...common} onChange={(e) => set(f.name, e.target.value)}>{f.options!.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
      case 'tristate': return <select {...common} onChange={(e) => set(f.name, e.target.value)}><option value="">Не знаем</option><option value="true">Да</option><option value="false">Нет</option></select>;
      case 'number': return <input {...common} type="number" step="any" min={f.name === 'lat' || f.name === 'lng' ? undefined : 0} onChange={(e) => set(f.name, e.target.value)} />;
      case 'datetime': return <input {...common} type="datetime-local" onChange={(e) => set(f.name, e.target.value)} />;
      case 'url': return <input {...common} type="url" inputMode="url" onChange={(e) => set(f.name, e.target.value)} />;
      default: return (
        <input {...common} type="text" onChange={(e) => set(f.name, e.target.value)}
          // для новой записи slug предлагается из названия, пока редактор не ввёл свой
          onBlur={f.name === 'title' && !id ? () => setForm((x) => (x.slug || !x.title ? x : { ...x, slug: slugify(x.title) })) : undefined} />
      );
    }
  };
  const byGroup = TAGS.reduce<Record<string, (typeof TAGS)[number][]>>((m, t) => { (m[t.group] ??= []).push(t); return m; }, {});
  const status = form.status ?? 'draft';

  return (
    <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void save(status === 'draft' ? 'draft' : status); }}>
      {msg && (
        <div className={`k-notice${msg.ok ? '' : ' k-notice--danger'}`} role={msg.ok ? 'status' : 'alert'}>
          <p className="t-body">{msg.text}</p>
          {msg.issues && <ul>{msg.issues.map((i, n) => <li key={n}>{i.field ? `${i.field}: ` : ''}{i.message}</li>)}</ul>}
        </div>
      )}

      <div className="admin-grid">
        {fields.map((f) => (
          <div key={f.name + f.types.join()} className={`field${f.wide ? ' admin-wide' : ''}`}>
            <label htmlFor={`f-${f.name}`}>{f.label}</label>
            {input(f)}
            {f.help && <span className="t-meta">{f.help}</span>}
          </div>
        ))}
        {type === 'place' && <>
          <div className="field"><label htmlFor="f-phone">Телефон</label><input id="f-phone" type="text" inputMode="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field"><label htmlFor="f-email">Почта</label><input id="f-email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></div>
        </>}
        {type === 'event' && (
          <div className="field admin-wide"><label htmlFor="f-placeId">Площадка</label>
            <select id="f-placeId" value={form.placeId ?? ''} onChange={(e) => set('placeId', e.target.value)}>
              <option value="">Без площадки</option>
              {places.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select></div>
        )}
        <div className="field"><label htmlFor="f-status">Статус</label>
          <select id="f-status" value={status} onChange={(e) => set('status', e.target.value)}>{STATUS_OPTIONS[type].map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
        <label className="admin-check"><input type="checkbox" checked={form.isDemo === 'true'} onChange={(e) => set('isDemo', e.target.checked ? 'true' : 'false')} /> Демо-запись (вымышленная, в production не показывается)</label>
      </div>

      <fieldset className="admin-fieldset"><legend className="t-h2">Теги</legend>
        <p className="t-meta">Нужен минимум один тег-направление (прогулки, заведения, игры, культура, спокойный отдых). Подбор учитывает только эти теги: других в системе нет.</p>
        {Object.entries(byGroup).map(([g, list]) => (
          <div key={g} className="stack stack--tight"><p className="t-meta">{GROUP_LABEL[g] ?? g}</p>
            <div className="chips">{list.map((t) => (
              <button key={t.key} type="button" className="k-chip" aria-pressed={tags.includes(t.key) ? 'true' : 'false'}
                onClick={() => setTags((x) => (x.includes(t.key) ? x.filter((k) => k !== t.key) : [...x, t.key]))}>{t.label}</button>
            ))}</div></div>
        ))}
      </fieldset>

      {type === 'event' && (
        <fieldset className="admin-fieldset"><legend className="t-h2">Дополнительные сеансы</legend>
          {occ.map((o, i) => (
            <div key={i} className="admin-row">
              <input type="datetime-local" aria-label="Начало сеанса" value={o.startsAt} onChange={(e) => setOcc((a) => a.map((x, j) => (j === i ? { ...x, startsAt: e.target.value } : x)))} />
              <input type="datetime-local" aria-label="Конец сеанса" value={o.endsAt} onChange={(e) => setOcc((a) => a.map((x, j) => (j === i ? { ...x, endsAt: e.target.value } : x)))} />
              <select aria-label="Статус сеанса" value={o.status} onChange={(e) => setOcc((a) => a.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}>
                <option value="published">Идёт</option><option value="sold_out">Билеты закончились</option><option value="cancelled">Отменён</option></select>
              <button type="button" className="k-btn k-btn--secondary" onClick={() => setOcc((a) => a.filter((_, j) => j !== i))}>Убрать</button>
            </div>
          ))}
          <button type="button" className="k-btn k-btn--secondary" onClick={() => setOcc((a) => [...a, { startsAt: '', endsAt: '', status: 'published', ticketsUrl: '' }])}>Добавить сеанс</button>
        </fieldset>
      )}

      <fieldset className="admin-fieldset"><legend className="t-h2">Фото</legend>
        <p className="t-meta">Только изображения с правами и только с разрешённых доменов. Права «Не подтверждены» — фото на сайте не показывается. Фото в списках не используются.</p>
        {media.map((m, i) => (
          <div key={i} className="admin-row">
            <input type="url" aria-label="Адрес изображения (https)" placeholder="https://…" value={m.url} onChange={(e) => setMedia((a) => a.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <input aria-label="Описание изображения (alt)" placeholder="Что на фото" value={m.alt} onChange={(e) => setMedia((a) => a.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
            <select aria-label="Права на изображение" value={m.rightsStatus} onChange={(e) => setMedia((a) => a.map((x, j) => (j === i ? { ...x, rightsStatus: e.target.value } : x)))}>
              <option value="unknown">Не подтверждены</option><option value="owned">Наше</option><option value="licensed">Лицензия</option><option value="permission">Разрешение</option></select>
            <button type="button" className="k-btn k-btn--secondary" onClick={() => setMedia((a) => a.filter((_, j) => j !== i))}>Убрать</button>
          </div>
        ))}
        <button type="button" className="k-btn k-btn--secondary" onClick={() => setMedia((a) => [...a, { url: '', alt: '', rightsStatus: 'unknown' }])}>Добавить фото</button>
      </fieldset>

      <div className="actions admin-actions">
        <button type="button" className="k-btn k-btn--secondary" disabled={busy} onClick={() => save('draft')}>Сохранить черновик</button>
        <button type="button" className="k-btn k-btn--primary" disabled={busy} onClick={() => save(type === 'event' && ['cancelled', 'sold_out'].includes(status) ? status : 'published')}>Опубликовать</button>
        {id && status !== 'draft' && <button type="button" className="k-btn k-btn--secondary" disabled={busy} onClick={unpublish}>Снять с публикации</button>}
        {id && form.slug && <Link className="k-btn k-btn--secondary" href={`/${SECTION[type]}/${form.slug}?preview=1`} target="_blank">Предпросмотр</Link>}
        {id && role === 'admin' && <button type="button" className="k-btn k-btn--secondary admin-danger" disabled={busy} onClick={remove}>Удалить</button>}
      </div>
    </form>
  );
}
