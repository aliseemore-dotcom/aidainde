/**
 * Все даты сервиса считаются в часовом поясе Казани (Europe/Moscow, UTC+3, без перехода на летнее время).
 * Чистые функции: «сейчас» передаётся аргументом, поэтому границы полуночи и выходных тестируются без моков.
 */
export const KAZAN_TZ = 'Europe/Moscow';
export const KAZAN_UTC_OFFSET = '+03:00';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: KAZAN_TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface KazanDay { iso: string; weekday: number } // weekday: 0 = вс … 6 = сб

export function kazanDay(now: Date): KazanDay {
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, weekday: WEEKDAYS.indexOf(p.weekday!) };
}

export const todayKazan = (now: Date): string => kazanDay(now).iso;

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface DateRange { from: string; to: string } // включительно, ISO-даты

/** today / tomorrow / weekend / date -> диапазон дат (в Казани). Выходные: сб–вс; если уже выходные — оставшиеся дни. */
export function resolveDayChoice(
  choice: 'today' | 'tomorrow' | 'weekend' | 'date',
  now: Date,
  targetDate?: string,
): DateRange {
  const { iso, weekday } = kazanDay(now);
  switch (choice) {
    case 'today': return { from: iso, to: iso };
    case 'tomorrow': { const t = addDays(iso, 1); return { from: t, to: t }; }
    case 'date': {
      if (!targetDate) throw new Error('targetDate is required for dayChoice=date');
      return { from: targetDate, to: targetDate };
    }
    case 'weekend': {
      if (weekday === 6) return { from: iso, to: addDays(iso, 1) };
      if (weekday === 0) return { from: iso, to: iso };
      const toSat = 6 - weekday;
      return { from: addDays(iso, toSat), to: addDays(iso, toSat + 1) };
    }
  }
}

/** Границы суток Казани в UTC — для запросов по timestamptz. to — исключительно. */
export function kazanDayBounds(range: DateRange): { start: Date; end: Date } {
  return {
    start: new Date(`${range.from}T00:00:00${KAZAN_UTC_OFFSET}`),
    end: new Date(`${addDays(range.to, 1)}T00:00:00${KAZAN_UTC_OFFSET}`),
  };
}

export function isPastDate(iso: string, now: Date): boolean {
  return iso < todayKazan(now);
}

const longFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: KAZAN_TZ, weekday: 'short', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: KAZAN_TZ, hour: '2-digit', minute: '2-digit' });
/** «пт, 19:00» стиль мета-строки */
export function formatEventMeta(startsAt: Date): string {
  const wd = new Intl.DateTimeFormat('ru-RU', { timeZone: KAZAN_TZ, weekday: 'short' }).format(startsAt);
  return `${wd}, ${timeFmt.format(startsAt)}`;
}
const shortDateFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: KAZAN_TZ, weekday: 'short', day: 'numeric', month: 'short' });
/** «пт, 23 окт., 19:00»: полный ориентир для списков, где события разнесены на недели. */
export function formatEventWhen(startsAt: Date): string {
  return `${shortDateFmt.format(startsAt)}, ${timeFmt.format(startsAt)}`;
}
export const formatLongDate = (d: Date): string => longFmt.format(d);
