import { resolvePreviousPeriod } from './period.util';

const d = (iso: string) => new Date(iso);

describe('resolvePreviousPeriod', () => {
  // "Hoje" em Campo Grande (UTC-4): 04:00Z até 03:59:59.999Z do dia seguinte.
  const todayStart = d('2026-11-14T04:00:00.000Z');
  const todayEnd = d('2026-11-15T03:59:59.999Z');

  it('hoje às 14h compara com ontem até 14h', () => {
    const now = d('2026-11-14T18:00:00.000Z'); // 14h local
    const prev = resolvePreviousPeriod(todayStart, todayEnd, now)!;
    expect(prev.start.toISOString()).toBe('2026-11-13T04:00:00.000Z');
    expect(prev.end.toISOString()).toBe('2026-11-13T18:00:00.000Z');
  });

  it('período já encerrado compara com o período anterior inteiro', () => {
    const now = d('2026-11-20T12:00:00.000Z');
    const prev = resolvePreviousPeriod(todayStart, todayEnd, now)!;
    expect(prev.start.toISOString()).toBe('2026-11-13T04:00:00.000Z');
    expect(prev.end.toISOString()).toBe('2026-11-14T03:59:59.999Z');
  });

  it('7 dias com hoje pela metade corta a semana anterior no mesmo ponto', () => {
    const start = d('2026-11-08T04:00:00.000Z');
    const now = d('2026-11-14T18:00:00.000Z');
    const prev = resolvePreviousPeriod(start, todayEnd, now)!;
    expect(prev.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(prev.end.toISOString()).toBe('2026-11-07T18:00:00.000Z');
  });

  it('período que ainda não começou não tem comparação', () => {
    const now = d('2026-11-13T12:00:00.000Z');
    expect(resolvePreviousPeriod(todayStart, todayEnd, now)).toBeNull();
  });
});
