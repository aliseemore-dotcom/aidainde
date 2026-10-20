import type { Metadata } from 'next';
import { getDb } from '@/db/client';
import { getResults } from '@/features/results/service';
import { ResultCard } from '@/components/catalog/ResultCard';
import { EmptyState } from '@/components/catalog/EmptyState';
import { ErrorState } from '@/components/catalog/ErrorState';
import { LogoLink } from '@/components/ui/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { ApiError } from '@/lib/errors';
import { allowDemoContent, readEnv, tokenSecret } from '@/lib/env';
import { safe } from '@/lib/db-safe';
import { weatherFor } from '@/lib/weather';
import type { Recommendation } from '@/features/recommend/types';

export const dynamic = 'force-dynamic';
// Ссылка с токеном приватна: не индексируем
export const metadata: Metadata = { title: 'Твоя подборка', robots: { index: false, follow: false } };

const DAY_LABEL = { today: 'Сегодня', tomorrow: 'Завтра', weekend: 'Выходные', date: 'Выбранная дата' } as const;
const BUDGET_LABEL = { free: 'Бесплатно', low: 'До 1 000 ₽', mid: 'До 3 000 ₽', high: 'До 5 000 ₽', any: 'Бюджет не важен' } as const;

const toCard = (i: Recommendation) => ({
  type: i.type, slug: i.slug, title: i.title, tags: i.tags, priceMin: i.priceMin, priceMax: i.priceMax, priceUnit: i.priceUnit,
  startsAt: i.when?.startsAt ?? null, isDemo: i.isDemo, kind: i.kind, reasons: i.reasons, notes: i.notes,
});

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { session } = await searchParams;
  const header = <header className="pagehead"><LogoLink /></header>;

  if (!session) {
    return <div className="page">{header}<EmptyState title="Нет подборки" text="Пройди тест, и мы соберём подборку под твоё настроение."><ButtonLink href="/quiz">Подобрать досуг</ButtonLink></EmptyState></div>;
  }

  const res = await safe(async () => {
    const env = readEnv();
    try {
      return await getResults(await getDb(), session, { now: new Date(), allowDemo: allowDemoContent(env), secret: tokenSecret(env), weather: (range) => weatherFor(range) });
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'CONTENT_NOT_FOUND' || e.code === 'STALE_QUIZ_VERSION')) return e.code;
      throw e;
    }
  });

  if (!res.ok) return <div className="page">{header}<ErrorState retryHref={`/results?session=${encodeURIComponent(session)}`} /></div>;
  if (res.value === 'CONTENT_NOT_FOUND' || res.value === 'STALE_QUIZ_VERSION') {
    return (
      <div className="page">{header}
        <EmptyState title="Ссылка устарела" text="Подборки хранятся 30 дней, а тест мог обновиться. Давай соберём новую.">
          <ButtonLink href="/quiz">Пройти тест заново</ButtonLink>
        </EmptyState>
      </div>
    );
  }

  const r = res.value;
  const edit = (step: string) => `/quiz?from=${encodeURIComponent(session)}&step=${step}`;
  const main = r.items.filter((i) => i.tier === 'main');
  const similar = r.items.filter((i) => i.tier === 'similar');
  const unknown = r.items.filter((i) => i.tier === 'price_unknown');
  const editDirection = r.quizAnswers.setting === 'home' ? 'COMMON.Q4' : 'COMMON.DIRECTION';

  return (
    <div className="page">
      {header}
      <div className="stack">
        <div>
          <p className="t-greet">Рәхмәт, что поделился настроением!</p>
          <h1 className="t-h1">{r.empty ? 'Пока ничего не нашли' : 'Вот что подойдёт'}</h1>
        </div>
        <p className="t-meta">{DAY_LABEL[r.answers.dayChoice]} · {BUDGET_LABEL[r.answers.budgetTier]}</p>

        {r.weather && r.weather.risk !== 'ok' && (
          <div className="k-notice" role={r.weather.risk === 'dangerous' ? 'alert' : 'status'}>
            <p className="t-body">
              {r.weather.risk === 'dangerous'
                ? `Прогноз на выбранные дни: ${r.weather.summary}. Для безопасности лучше выбрать занятие в помещении.`
                : `Прогноз на выбранные дни: ${r.weather.summary}. Уличные варианты опущены ниже.`}
            </p>
            {r.weather.risk === 'dangerous' && (
              <div className="actions"><ButtonLink href={edit('COMMON.Q4')} variant="sunken">Выбрать «Под крышу»</ButtonLink></div>
            )}
          </div>
        )}
        {r.weather?.risk === 'ok' && <p className="t-meta">Прогноз на выбранные дни: {r.weather.summary}.</p>}

        {r.dateExpired && (
          <div className="k-notice" role="status">
            <p className="t-body">Выбранная дата уже прошла, поэтому события могут не показаться. Выбери новую дату.</p>
            <div className="actions"><ButtonLink href={edit('COMMON.DATE')} variant="sunken">Изменить дату</ButtonLink></div>
          </div>
        )}

        {r.empty ? (
          <EmptyState title="Под эти условия пока ничего нет" text="Мы ничего не выдумываем: показываем только проверенные записи каталога. Попробуй чуть поменять условия или посмотри каталог целиком.">
            <ButtonLink href={edit('COMMON.DATE')} variant="sunken">Изменить дату</ButtonLink>
            <ButtonLink href={edit('COMMON.BUDGET')} variant="sunken">Изменить бюджет</ButtonLink>
            <ButtonLink href={edit(editDirection)} variant="sunken">Изменить тип активности</ButtonLink>
            <ButtonLink href="/explore" arrow>Открыть каталог</ButtonLink>
          </EmptyState>
        ) : (
          <>
            {r.relaxed.length > 0 && (
              <div className="k-notice" role="status">
                {r.relaxed.map((x) => <p key={x.key} className="t-body">{x.label}</p>)}
              </div>
            )}
            {main.length > 0 && <ul className="grid" aria-label="Подборка">{main.map((i) => <li key={i.id}><ResultCard card={toCard(i)} /></li>)}</ul>}
            {similar.length > 0 && (
              <section className="section" aria-labelledby="similar">
                <h2 id="similar" className="t-h2">Похожие идеи</h2>
                <ul className="grid">{similar.map((i) => <li key={i.id}><ResultCard card={toCard(i)} /></li>)}</ul>
              </section>
            )}
            {r.indoorAlternatives && r.indoorAlternatives.length > 0 && (
              <section className="section" aria-labelledby="indoor">
                <h2 id="indoor" className="t-h2">Безопаснее в помещении</h2>
                <p className="t-meta">Показываем из-за прогноза. Твой выбор мы не меняли: решай сам.</p>
                <ul className="grid">{r.indoorAlternatives.map((i) => <li key={i.id}><ResultCard card={toCard(i)} /></li>)}</ul>
              </section>
            )}
            {unknown.length > 0 && (
              <section className="section" aria-labelledby="unknown">
                <h2 id="unknown" className="t-h2">Стоимость уточняется</h2>
                <p className="t-meta">Подходят по теме, но цену мы пока не знаем: не считаем её ни бесплатной, ни дорогой.</p>
                <ul className="grid">{unknown.map((i) => <li key={i.id}><ResultCard card={toCard(i)} /></li>)}</ul>
              </section>
            )}
            <div className="actions">
              <ButtonLink href={edit('COMMON.DATE')} variant="secondary">Изменить дату</ButtonLink>
              <ButtonLink href={edit('COMMON.BUDGET')} variant="secondary">Изменить бюджет</ButtonLink>
              <ButtonLink href="/explore" variant="secondary">Открыть каталог</ButtonLink>
            </div>
            <p className="disclaimer">Мы не бронируем и не обещаем свободных мест: проверяйте наличие на странице организатора.</p>
          </>
        )}
      </div>
    </div>
  );
}
