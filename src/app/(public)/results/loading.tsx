/** Состояние загрузки для страниц с данными (каталог, результаты, карточки). */
export default function Loading() {
  return (
    <div className="page" aria-busy="true">
      <p className="t-meta" role="status">Загружаем…</p>
      <div className="stack" aria-hidden="true" style={{ marginTop: 'var(--space-5)' }}>
        {[0, 1, 2].map((i) => <div key={i} className="k-skeleton" />)}
      </div>
    </div>
  );
}
