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

export function getTimezoneFromCepOrState(
  cep?: string | null,
  state?: string | null,
): string {
  // 1. Sigla do Estado (UF)
  const uf = state?.trim().toUpperCase();
  if (uf) {
    if (uf === 'AC') return 'America/Rio_Branco'; // Acre: UTC-5
    if (uf === 'MT') return 'America/Cuiaba'; // Mato Grosso: UTC-4
    if (uf === 'MS') return 'America/Campo_Grande'; // Mato Grosso do Sul: UTC-4
    if (uf === 'RO') return 'America/Porto_Velho'; // Rondônia: UTC-4
    if (uf === 'RR') return 'America/Boa_Vista'; // Roraima: UTC-4
    if (uf === 'AM') return 'America/Manaus'; // Amazonas: UTC-4
    return 'America/Sao_Paulo'; // Demais estados: Horário de Brasília (UTC-3)
  }

  // 2. Faixa de CEP
  if (cep) {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length >= 2) {
      const prefix2 = parseInt(cleanCep.slice(0, 2), 10);
      const prefix5 =
        cleanCep.length >= 5 ? parseInt(cleanCep.slice(0, 5), 10) : 0;

      // Fernando de Noronha (PE)
      if (prefix5 >= 53990 && prefix5 <= 53999) return 'America/Noronha';

      // Acre (69900 a 69999)
      if (prefix2 === 69 && cleanCep.length >= 3 && cleanCep.charAt(2) === '9') {
        return 'America/Rio_Branco';
      }

      // Rondônia (76800 a 76999)
      if (prefix5 >= 76800 && prefix5 <= 76999) return 'America/Porto_Velho';

      // Roraima (69300 a 69399)
      if (prefix5 >= 69300 && prefix5 <= 69399) return 'America/Boa_Vista';

      // Amazonas (69000 a 69899)
      if (prefix2 === 69) return 'America/Manaus';

      // Mato Grosso (78000 a 78899)
      if (prefix2 === 78) return 'America/Cuiaba';

      // Mato Grosso do Sul (79000 a 79999)
      if (prefix2 === 79) return 'America/Campo_Grande';

      return 'America/Sao_Paulo';
    }
  }

  return 'America/Sao_Paulo';
}
