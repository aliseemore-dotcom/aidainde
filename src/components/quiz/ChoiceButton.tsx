import type { ReactNode } from 'react';

export function ChoiceButton({
  label, note, selected, shortcut, onSelect,
}: { label: ReactNode; note?: string; selected?: boolean; shortcut?: number; onSelect: () => void }) {
  return (
    <button type="button" className="k-choice" aria-pressed={selected ? 'true' : 'false'} onClick={onSelect}>
      {shortcut !== undefined && <span className="k-choice__key" aria-hidden="true">{shortcut}</span>}
      <span className="k-choice__label">{label}{note && <span className="k-choice__note">{note}</span>}</span>
    </button>
  );
}
