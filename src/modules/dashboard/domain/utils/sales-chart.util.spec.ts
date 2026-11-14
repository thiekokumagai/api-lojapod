import { buildSalesChart, withPreviousSales } from './sales-chart.util';

const d = (iso: string) => new Date(iso);
const order = (iso: string, vendas: number, lucro: number) => ({
  createdAt: d(iso),
  vendas,
  lucro,
});

describe('buildSalesChart', () => {
  it('hoje: 24 pontos por hora no fuso de Campo Grande (UTC-4), com vendas e lucro', () => {
    const start = d('2026-11-14T04:00:00.000Z');
    const end = d('2026-11-15T03:59:59.999Z');
    const chart = buildSalesChart(
      [
        order('2026-11-14T14:30:00.000Z', 100, 40), // 10h local
        order('2026-11-14T14:50:00.000Z', 50, 10), // 10h local
        order('2026-11-14T23:00:00.000Z', 30, 5), // 19h local
      ],
      start,
      end,
    );
    expect(chart).toHaveLength(24);
    expect(chart[10]).toEqual({ name: '10h', vendas: 150, lucro: 50 });
    expect(chart[19]).toEqual({ name: '19h', vendas: 30, lucro: 5 });
    expect(chart[0]).toEqual({ name: '00h', vendas: 0, lucro: 0 });
  });

  it('7 dias: um ponto por dia com o dia da semana no nome', () => {
    const start = d('2026-11-09T04:00:00.000Z');
    const end = d('2026-11-16T03:59:59.999Z');
    const chart = buildSalesChart([order('2026-11-12T15:00:00.000Z', 80, 20)], start, end);
    expect(chart).toHaveLength(7);
    const day = chart.find((p) => p.name.includes('(12/11)'));
    expect(day).toMatchObject({ vendas: 80, lucro: 20 });
    expect(chart[0].name).toMatch(/\(09\/11\)$/);
    expect(chart[6].name).toMatch(/\(15\/11\)$/);
  });

  it('30 dias: um ponto por dia só com dd/mm', () => {
    const start = d('2026-10-16T04:00:00.000Z');
    const end = d('2026-11-15T03:59:59.999Z');
    const chart = buildSalesChart([order('2026-11-01T15:00:00.000Z', 10, 3)], start, end);
    expect(chart.length).toBeGreaterThanOrEqual(30);
    expect(chart.find((p) => p.name === '01/11')).toEqual({ name: '01/11', vendas: 10, lucro: 3 });
  });

  it('6 meses/ano: um ponto por mês, em ordem cronológica', () => {
    const start = d('2026-05-15T04:00:00.000Z');
    const end = d('2026-11-15T03:59:59.999Z');
    const chart = buildSalesChart(
      [order('2026-06-10T15:00:00.000Z', 200, 80), order('2026-06-20T15:00:00.000Z', 100, 20)],
      start,
      end,
    );
    expect(chart.length).toBeGreaterThanOrEqual(6);
    const june = chart.find((p) => p.vendas > 0);
    expect(june).toMatchObject({ vendas: 300, lucro: 100 });
    expect(chart.filter((p) => p.vendas > 0)).toHaveLength(1);
  });

  it('arredonda em centavos', () => {
    const start = d('2026-11-14T04:00:00.000Z');
    const end = d('2026-11-15T03:59:59.999Z');
    const chart = buildSalesChart(
      [order('2026-11-14T14:00:00.000Z', 0.1, 0.1), order('2026-11-14T14:10:00.000Z', 0.2, 0.2)],
      start,
      end,
    );
    expect(chart[10].vendas).toBe(0.3);
    expect(chart[10].lucro).toBe(0.3);
  });

  it('sem pedidos devolve a série zerada (o front mostra "sem dados")', () => {
    const chart = buildSalesChart([], d('2026-11-14T04:00:00.000Z'), d('2026-11-15T03:59:59.999Z'));
    expect(chart.every((p) => p.vendas === 0 && p.lucro === 0)).toBe(true);
  });
});

describe('withPreviousSales', () => {
  const cur = [
    { name: 'a', vendas: 10, lucro: 1 },
    { name: 'b', vendas: 20, lucro: 2 },
    { name: 'c', vendas: 30, lucro: 3 },
  ];

  it('junta o faturamento do período anterior na mesma posição', () => {
    const prev = [
      { name: 'x', vendas: 5, lucro: 0 },
      { name: 'y', vendas: 0, lucro: 0 },
    ];
    expect(withPreviousSales(cur, prev)).toEqual([
      { name: 'a', vendas: 10, lucro: 1, vendasAnterior: 5 },
      { name: 'b', vendas: 20, lucro: 2, vendasAnterior: 0 },
      { name: 'c', vendas: 30, lucro: 3 },
    ]);
  });

  it('sem período anterior devolve a série como está', () => {
    expect(withPreviousSales(cur, null)).toEqual(cur);
  });
});
