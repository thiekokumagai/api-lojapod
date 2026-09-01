/**
 * Utility function to convert startDate and endDate (Date object or YYYY-MM-DD string)
 * into UTC Date objects that correspond to 00:00:00.000 and 23:59:59.999 in local timezone.
 */
export function getZonedStartAndEndDates(
  startDateInput: Date | string,
  endDateInput: Date | string,
  timeZone = 'America/Campo_Grande',
): { startOfDay: Date; endOfDay: Date } {
  const startStr =
    startDateInput instanceof Date
      ? startDateInput.toISOString().split('T')[0]
      : String(startDateInput).split('T')[0];

  const endStr =
    endDateInput instanceof Date
      ? endDateInput.toISOString().split('T')[0]
      : String(endDateInput).split('T')[0];

  const getUtcDateForLocalTime = (dateStr: string, timeStr: string): Date => {
    const baseUtc = new Date(`${dateStr}T${timeStr}Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(baseUtc);
    const partMap: Record<string, string> = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }

    const localAsUtc = new Date(
      `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}.${partMap.fractionalSecond || '000'}Z`,
    );

    const offsetMs = baseUtc.getTime() - localAsUtc.getTime();
    return new Date(baseUtc.getTime() + offsetMs);
  };

  const startOfDay = getUtcDateForLocalTime(startStr, '00:00:00.000');
  const endOfDay = getUtcDateForLocalTime(endStr, '23:59:59.999');

  return { startOfDay, endOfDay };
}
