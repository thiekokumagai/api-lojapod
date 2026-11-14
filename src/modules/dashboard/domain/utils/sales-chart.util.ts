// Série do gráfico "Faturamento × Lucro" do Dashboard.
// A granularidade segue o tamanho do período: hora (hoje), dia da semana (até 7 dias),
// dia (até 31 dias) ou mês. Os nomes dos pontos usam o fuso da loja.

const TIME_ZONE = 'America/Campo_Grande';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChartOrder {
  createdAt: Date;
  vendas: number;
  /** Lucro bruto do pedido (só itens com custo cadastrado). */
  lucro: number;
}

export interface ChartPoint {
  name: string;
  vendas: number;
  lucro: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const dayLabel = (d: Date) =>
  d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TIME_ZONE,
  });

export function buildSalesChart(
  orders: ChartOrder[],
  start: Date,
  end: Date,
): ChartPoint[] {
  const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / DAY_MS);
  const endTimestamp = end.getTime();
  let points: (ChartPoint & { sortKey?: string })[];

  if (diffDays <= 1) {
    // "Hoje" -> por hora (24h)
    points = Array.from({ length: 24 }, (_, i) => ({
      name: `${String(i).padStart(2, '0')}h`,
      vendas: 0,
      lucro: 0,
    }));
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    for (const order of orders) {
      const hour = parseInt(hourFormatter.format(order.createdAt), 10);
      if (hour >= 0 && hour < 24) {
        points[hour].vendas += order.vendas;
        points[hour].lucro += order.lucro;
      }
    }
  } else if (diffDays <= 31) {
    // "7 dias" (com dia da semana) e "30 dias" -> por dia
    const withWeekday = diffDays <= 7;
    const dateMap = new Map<string, ChartPoint>();
    const current = new Date(start);
    // Estrito: com tolerância sobrava um ponto vazio de "amanhã" no fim do gráfico.
    while (current.getTime() <= endTimestamp) {
      const dateStr = dayLabel(current);
      let name = dateStr;
      if (withWeekday) {
        const rawWeekday = current
          .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: TIME_ZONE })
          .replace('.', '');
        const weekday = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1);
        name = `${weekday} (${dateStr})`;
      }
      dateMap.set(dateStr, { name, vendas: 0, lucro: 0 });
      current.setDate(current.getDate() + 1);
    }
    for (const order of orders) {
      const point = dateMap.get(dayLabel(order.createdAt));
      if (point) {
        point.vendas += order.vendas;
        point.lucro += order.lucro;
      }
    }
    points = Array.from(dateMap.values());
  } else {
    // "6 meses" / "Ano" -> por mês
    const monthMap = new Map<string, ChartPoint & { sortKey: string }>();
    const yearFormatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      timeZone: TIME_ZONE,
    });
    const monthFormatter = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      timeZone: TIME_ZONE,
    });
    const keyOf = (d: Date) =>
      `${yearFormatter.format(d)}-${monthFormatter.format(d)}`;

    const current = new Date(start);
    while (current.getTime() <= endTimestamp + 60000) {
      const name = current
        .toLocaleDateString('pt-BR', {
          month: 'short',
          year: '2-digit',
          timeZone: TIME_ZONE,
        })
        .replace('.', '');
      const sortKey = keyOf(current);
      if (!monthMap.has(sortKey)) {
        monthMap.set(sortKey, { name, vendas: 0, lucro: 0, sortKey });
      }
      current.setMonth(current.getMonth() + 1);
    }
    for (const order of orders) {
      const point = monthMap.get(keyOf(order.createdAt));
      if (point) {
        point.vendas += order.vendas;
        point.lucro += order.lucro;
      }
    }
    points = Array.from(monthMap.values()).sort((a, b) =>
      (a.sortKey as string).localeCompare(b.sortKey as string),
    );
  }

  return points.map(({ name, vendas, lucro }) => ({
    name,
    vendas: round2(vendas),
    lucro: round2(lucro),
  }));
}

/**
 * Junta a série do período anterior à atual, ponto a ponto na mesma posição
 * (hora 14h ↔ 14h de ontem; 3º dia ↔ 3º dia do período anterior). Posição sem
 * correspondente no período anterior fica sem `vendasAnterior`.
 */
export function withPreviousSales(
  current: ChartPoint[],
  previous: ChartPoint[] | null,
): (ChartPoint & { vendasAnterior?: number })[] {
  if (!previous) return current;
  return current.map((point, i) =>
    previous[i] ? { ...point, vendasAnterior: previous[i].vendas } : point,
  );
}
