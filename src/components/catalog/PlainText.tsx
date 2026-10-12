/**
 * Безопасный рендер «богатого» текста: абзацы и списки «- ». Никакого HTML: React экранирует всё,
 * поэтому вставить скрипт или разметку через админку нельзя.
 */
export function PlainText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}</ul>;
        }
        return <p key={i} className="t-body">{b}</p>;
      })}
    </div>
  );
}
