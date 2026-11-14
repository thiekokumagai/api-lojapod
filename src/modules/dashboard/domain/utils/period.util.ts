import { getZonedStartAndEndDates } from '../../../../common/utils/date.utils';

const TIME_ZONE = 'America/Campo_Grande';

/**
 * Período do Dashboard: datas YYYY-MM-DD vindas do front, ou "hoje" no fuso da loja.
 * Início 00:00:00.000 e fim 23:59:59.999 no fuso America/Campo_Grande.
 */
export function resolveDashboardPeriod(
  startDate?: string,
  endDate?: string,
): { start: Date; end: Date } {
  if (startDate && endDate) {
    const dates = getZonedStartAndEndDates(startDate, endDate);
    return { start: dates.startOfDay, end: dates.endOfDay };
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
  }).format(new Date());
  const dates = getZonedStartAndEndDates(todayStr, todayStr);
  return { start: dates.startOfDay, end: dates.endOfDay };
}

/** Quantidade de dias corridos do período (mínimo 1). */
export function countPeriodDays(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}
