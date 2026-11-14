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

/**
 * Período anterior para comparação: mesmo tamanho, imediatamente antes, e cortado no
 * mesmo ponto em que o atual está agora. "Hoje" às 14h compara com "ontem até 14h";
 * "7 dias" (com hoje pela metade) compara com os 7 dias anteriores cortados igual.
 * null quando o período atual ainda nem começou.
 */
export function resolvePreviousPeriod(
  start: Date,
  end: Date,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const cutoff = Math.min(end.getTime(), now.getTime());
  if (cutoff < start.getTime()) return null;

  const length = end.getTime() - start.getTime() + 1;
  const prevStart = new Date(start.getTime() - length);
  const prevEnd = new Date(prevStart.getTime() + (cutoff - start.getTime()));
  return { start: prevStart, end: prevEnd };
}
