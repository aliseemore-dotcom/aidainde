import { describe, expect, it } from 'vitest';
import { addDays, isPastDate, kazanDay, kazanDayBounds, resolveDayChoice, todayKazan } from '@/lib/date-kazan';

// 2026-10-12 — понедельник
describe('часовой пояс Казани (Europe/Moscow, UTC+3)', () => {
  it('23:59 и 00:01 по Казани — разные дни, независимо от времени UTC', () => {
    expect(todayKazan(new Date('2026-10-12T20:59:00Z'))).toBe('2026-10-12'); // 23:59 MSK
    expect(todayKazan(new Date('2026-10-12T21:01:00Z'))).toBe('2026-10-13'); // 00:01 MSK
  });

  it('вечер в UTC уже следующий день в Казани', () => {
    expect(kazanDay(new Date('2026-10-31T22:30:00Z')).iso).toBe('2026-11-01');
  });

  it('today / tomorrow около полуночи', () => {
    const justBefore = new Date('2026-10-12T20:59:00Z');
    const justAfter = new Date('2026-10-12T21:01:00Z');
    expect(resolveDayChoice('today', justBefore, undefined)).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(resolveDayChoice('today', justAfter, undefined)).toEqual({ from: '2026-10-13', to: '2026-10-13' });
    expect(resolveDayChoice('tomorrow', justBefore, undefined)).toEqual({ from: '2026-10-13', to: '2026-10-13' });
  });

  it('выходные: будни -> ближайшие сб–вс', () => {
    for (const d of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']) {
      expect(resolveDayChoice('weekend', new Date(`${d}T09:00:00Z`), undefined)).toEqual({ from: '2026-10-17', to: '2026-10-18' });
    }
  });

  it('выходные: в субботу — сб и вс, в воскресенье — только оставшийся день', () => {
    expect(resolveDayChoice('weekend', new Date('2026-10-17T09:00:00Z'), undefined)).toEqual({ from: '2026-10-17', to: '2026-10-18' });
    expect(resolveDayChoice('weekend', new Date('2026-10-18T09:00:00Z'), undefined)).toEqual({ from: '2026-10-18', to: '2026-10-18' });
  });

  it('граница выходных: пятница 23:59 по Казани ещё пятница, 00:01 уже суббота', () => {
    expect(resolveDayChoice('weekend', new Date('2026-10-16T20:59:00Z'), undefined).from).toBe('2026-10-17');
    expect(resolveDayChoice('weekend', new Date('2026-10-16T21:01:00Z'), undefined)).toEqual({ from: '2026-10-17', to: '2026-10-18' });
    // воскресенье 23:59 -> понедельник 00:01: следующие выходные
    expect(resolveDayChoice('weekend', new Date('2026-10-18T20:59:00Z'), undefined)).toEqual({ from: '2026-10-18', to: '2026-10-18' });
    expect(resolveDayChoice('weekend', new Date('2026-10-18T21:01:00Z'), undefined)).toEqual({ from: '2026-10-24', to: '2026-10-25' });
  });

  it('date требует targetDate; прошедшая дата определяется по Казани', () => {
    expect(() => resolveDayChoice('date', new Date(), undefined)).toThrow();
    expect(resolveDayChoice('date', new Date(), '2026-12-01')).toEqual({ from: '2026-12-01', to: '2026-12-01' });
    expect(isPastDate('2026-10-12', new Date('2026-10-12T21:01:00Z'))).toBe(true);
    expect(isPastDate('2026-10-12', new Date('2026-10-12T20:59:00Z'))).toBe(false);
  });

  it('границы суток в UTC и переход через конец месяца', () => {
    const { start, end } = kazanDayBounds({ from: '2026-10-31', to: '2026-10-31' });
    expect(start.toISOString()).toBe('2026-10-30T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
