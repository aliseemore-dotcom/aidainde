'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChoiceButton } from './ChoiceButton';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Minus, Plus, ICON_STROKE } from '@/components/ui/icons';
import { computeDirectionMenu } from '@/features/quiz/direction';
import { readAnswer } from '@/features/quiz/graph';
import { todayKazan } from '@/lib/date-kazan';
import type { QuizAnswers, StepDef } from '@/features/quiz/types';

interface Props { step: StepDef; answers: QuizAnswers; onAnswer: (value: unknown) => void }

/** Цифры 1–9 выбирают вариант (клавиатурная навигация). Не срабатывает в полях ввода. */
function useDigitShortcuts(count: number, pick: (i: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, count)) { e.preventDefault(); pick(n - 1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [count, pick, enabled]);
}

export function SingleStep({ step, answers, onAnswer }: Props) {
  const options = step.optionsResolver ? step.optionsResolver(answers) : step.options ?? [];
  const current = readAnswer(step, answers);
  useDigitShortcuts(options.length, (i) => onAnswer(options[i]!.value), true);
  return (
    <ul className="choices">
      {options.map((o, i) => (
        <li key={o.value}>
          <ChoiceButton label={o.label} shortcut={i + 1} selected={current === o.value} onSelect={() => onAnswer(o.value)} />
        </li>
      ))}
    </ul>
  );
}

/** Адаптивное меню направлений (≤ 4) + «Показать все направления» с пометкой несоответствия. */
export function DirectionStep({ step, answers, onAnswer }: Props) {
  const [all, setAll] = useState(false);
  const menu = useMemo(() => computeDirectionMenu(answers), [answers]);
  const current = readAnswer(step, answers);
  const list = all ? menu.all : menu.primary;
  useDigitShortcuts(list.length, (i) => onAnswer(list[i]!.value), true);
  return (
    <>
      <ul className="choices">
        {list.map((d, i) => (
          <li key={d.value}>
            <ChoiceButton
              label={d.label}
              note={d.mismatch ? 'Не совсем под твой выбор «где», но можно' : undefined}
              shortcut={i + 1}
              selected={current === d.value}
              onSelect={() => onAnswer(d.value)}
            />
          </li>
        ))}
      </ul>
      {!all && <button type="button" className="k-linkbtn" onClick={() => setAll(true)}>Показать все направления</button>}
    </>
  );
}

export function MultiStep({ step, answers, onAnswer }: Props) {
  const saved = readAnswer(step, answers) as string[] | undefined;
  const [picked, setPicked] = useState<string[]>(saved ?? []);
  const [none, setNone] = useState<boolean>(saved !== undefined && saved.length === 0);
  const toggle = (v: string) => {
    setNone(false);
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  };
  const options = (step.options ?? []).filter((o) => o.value !== 'none');
  const canGo = none || picked.length > 0;
  return (
    <>
      <p className="t-meta" id="multi-hint">Можно выбрать несколько.</p>
      <ul className="choices" aria-describedby="multi-hint">
        {options.map((o) => (
          <li key={o.value}><ChoiceButton label={o.label} selected={picked.includes(o.value)} onSelect={() => toggle(o.value)} /></li>
        ))}
        <li><ChoiceButton label="Без детей" selected={none} onSelect={() => { setPicked([]); setNone(true); }} /></li>
      </ul>
      <div className="actions">
        <Button disabled={!canGo} onClick={() => onAnswer(none ? [] : picked)}>Дальше</Button>
      </div>
    </>
  );
}

export function NumberStep({ step, answers, onAnswer }: Props) {
  const { min, max } = step.range!(answers);
  const saved = readAnswer(step, answers) as number | undefined;
  const [n, setN] = useState<number>(saved ?? min);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <>
      <div className="stepper">
        <IconButton label="Меньше" onClick={() => setN((v) => clamp(v - 1))} disabled={n <= min}><Minus size={22} strokeWidth={ICON_STROKE} aria-hidden="true" /></IconButton>
        <label className="k-sr" htmlFor="party-size">Количество человек</label>
        <input
          id="party-size" type="number" inputMode="numeric" min={min} max={max} value={n}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setN(clamp(Math.round(v))); }}
        />
        <IconButton label="Больше" onClick={() => setN((v) => clamp(v + 1))} disabled={n >= max}><Plus size={22} strokeWidth={ICON_STROKE} aria-hidden="true" /></IconButton>
      </div>
      <p className="t-meta">От {min} до {max}.</p>
      <div className="actions"><Button onClick={() => onAnswer(n)}>Дальше</Button></div>
    </>
  );
}

export function DateStep({ step, answers, onAnswer }: Props) {
  const saved = readAnswer(step, answers) as string | undefined;
  const [value, setValue] = useState(saved ?? '');
  const [min] = useState(() => todayKazan(new Date())); // подсказка по часам клиента; решает сервер
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && (!min || value >= min);
  return (
    <>
      <div className="field">
        <label htmlFor="target-date">Дата</label>
        <input id="target-date" type="date" value={value} min={min} onChange={(e) => setValue(e.target.value)} />
      </div>
      <p className="t-meta">Прошедшие даты выбрать нельзя. Даты считаем по времени Казани.</p>
      <div className="actions"><Button disabled={!valid} onClick={() => onAnswer(value)}>Дальше</Button></div>
    </>
  );
}
