import {
  DiagnosisInput,
  buildDiagnosisItems,
  calculateBreakEven,
  prorateFixedCosts,
} from './diagnosis.util';

const start = new Date('2026-11-01T04:00:00Z');
const end = new Date('2026-11-30T03:59:59Z');

describe('prorateFixedCosts', () => {
  it('custo recorrente vale mensal x dias/30', () => {
    const r = prorateFixedCosts(
      [{ name: 'Aluguel', value: 3000, repeats: true, createdAt: new Date('2025-01-01') }],
      10,
      start,
      end,
    );
    expect(r.total).toBe(1000);
    expect(r.items).toEqual([{ name: 'Aluguel', value: 1000 }]);
  });

  it('custo avulso só entra se foi cadastrado dentro do período', () => {
    const r = prorateFixedCosts(
      [
        { name: 'Reforma', value: 500, repeats: false, createdAt: new Date('2026-11-10T12:00:00Z') },
        { name: 'Antigo', value: 900, repeats: false, createdAt: new Date('2026-01-10T12:00:00Z') },
      ],
      30,
      start,
      end,
    );
    expect(r.total).toBe(500);
    expect(r.items.map((i) => i.name)).toEqual(['Reforma']);
  });

  it('agrupa pelo nome e ordena do maior para o menor', () => {
    const r = prorateFixedCosts(
      [
        { name: 'Internet', value: 100, repeats: true, createdAt: new Date('2025-01-01') },
        { name: 'Aluguel', value: 600, repeats: true, createdAt: new Date('2025-01-01') },
        { name: 'Internet', value: 50, repeats: true, createdAt: new Date('2025-01-01') },
      ],
      30,
      start,
      end,
    );
    expect(r.items).toEqual([
      { name: 'Aluguel', value: 600 },
      { name: 'Internet', value: 150 },
    ]);
    expect(r.total).toBe(750);
  });
});

describe('calculateBreakEven', () => {
  it('receita = custos fixos / margem; pedidos pela receita média por pedido', () => {
    expect(
      calculateBreakEven({ fixedCosts: 1000, marginRatio: 0.4, netRevenuePerOrder: 50 }),
    ).toEqual({ revenue: 2500, orders: 50 });
  });

  it('sem margem positiva não calcula', () => {
    expect(calculateBreakEven({ fixedCosts: 1000, marginRatio: null, netRevenuePerOrder: 50 })).toEqual({
      revenue: null,
      orders: null,
    });
    expect(calculateBreakEven({ fixedCosts: 1000, marginRatio: -0.1, netRevenuePerOrder: 50 }).revenue).toBeNull();
  });

  it('sem pedidos devolve só a receita', () => {
    expect(calculateBreakEven({ fixedCosts: 100, marginRatio: 0.5, netRevenuePerOrder: null })).toEqual({
      revenue: 200,
      orders: null,
    });
  });
});

describe('buildDiagnosisItems', () => {
  const base = (): DiagnosisInput => ({
    receitaItens: 10000,
    resultado: { lucroBruto: 4000, custosFixos: 3000, lucroLiquido: 1000, breakEvenRevenue: 7500 },
    descontos: { total: 100, topCoupon: null },
    cardFee: { total: 100, byMethod: [] },
    freight: { loss: 0, ordersWithLoss: 0, ordersChecked: 0 },
    abandoned: { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0, validCount: 100 },
    stock: { stagnantCapital: 0, stagnantCount: 0, outOfStockCount: 0 },
    conversion: { visitas: 0, conversao: 0 },
    topProducts: [],
    semCusto: { count: 0, receitaLiquida: 0 },
  });
  const find = (items: ReturnType<typeof buildDiagnosisItems>, id: string) =>
    items.find((i) => i.id === id);

  it('tudo dentro do limite: nenhum item crítico ou de alerta', () => {
    const items = buildDiagnosisItems(base());
    expect(items.filter((i) => i.severity === 'critical' || i.severity === 'warning')).toEqual([]);
    expect(find(items, 'resultado')?.severity).toBe('ok');
  });

  it('lucro líquido negativo = crítico, com o valor que faltou', () => {
    const input = base();
    input.resultado = { lucroBruto: 1000, custosFixos: 3000, lucroLiquido: -2000, breakEvenRevenue: 9000 };
    const r = find(buildDiagnosisItems(input), 'resultado');
    expect(r).toMatchObject({ severity: 'critical', amount: 2000 });
    expect(r?.detail).toContain('9.000,00');
  });

  it('sem custos fixos cadastrados avisa em vez de dizer que está no lucro', () => {
    const input = base();
    input.resultado = { lucroBruto: 1000, custosFixos: 0, lucroLiquido: 1000, breakEvenRevenue: null };
    expect(find(buildDiagnosisItems(input), 'resultado')?.severity).toBe('info');
  });

  it('descontos: alerta em 8% e crítico em 15%, com o cupom que mais custou', () => {
    const warn = base();
    warn.descontos = { total: 900, topCoupon: { title: 'BEMVINDO', amount: 700, orders: 14 } };
    const w = find(buildDiagnosisItems(warn), 'descontos');
    expect(w?.severity).toBe('warning');
    expect(w?.detail).toContain('BEMVINDO');

    const crit = base();
    crit.descontos = { total: 1600, topCoupon: null };
    expect(find(buildDiagnosisItems(crit), 'descontos')?.severity).toBe('critical');
  });

  it('taxa de cartão: alerta em 3% e crítico em 5%', () => {
    const warn = base();
    warn.cardFee = { total: 350, byMethod: [{ method: 'CREDIT_CARD', amount: 350 }] };
    expect(find(buildDiagnosisItems(warn), 'taxa-cartao')?.severity).toBe('warning');
    const crit = base();
    crit.cardFee = { total: 600, byMethod: [] };
    expect(find(buildDiagnosisItems(crit), 'taxa-cartao')?.severity).toBe('critical');
  });

  it('taxa de cartão: o texto mostra a forma de pagamento em português, nunca o código gravado', () => {
    const input = base();
    input.cardFee = {
      total: 400,
      byMethod: [
        { method: 'credit', amount: 150 },
        { method: 'Credit', amount: 100 },
        { method: 'Cartão de Crédito', amount: 50 },
        { method: 'debit', amount: 100 },
      ],
    };
    const detail = find(buildDiagnosisItems(input), 'taxa-cartao')?.detail ?? '';

    // credit + Credit + Cartão de Crédito somam R$ 300 e passam o débito (R$ 100)
    expect(detail).toContain('a maior parte vem de Cartão de crédito');
    expect(detail).not.toMatch(/credit\b|debit\b/);
  });

  it('taxa de cartão: método desconhecido vira texto legível', () => {
    const input = base();
    input.cardFee = { total: 350, byMethod: [{ method: 'gift_card', amount: 350 }] };
    const detail = find(buildDiagnosisItems(input), 'taxa-cartao')?.detail ?? '';

    expect(detail).toContain('a maior parte vem de Gift card');
    expect(detail).not.toContain('gift_card');
  });

  it('margem baixa: campeão com margem negativa é crítico e o valor é o lucro que faltou até 10%', () => {
    const input = base();
    input.topProducts = [
      { title: 'A', quantity: 50, lucro: -20, margem: -2, receitaLiquida: 1000 },
      { title: 'B', quantity: 30, lucro: 300, margem: 30, receitaLiquida: 1000 },
      { title: 'C', quantity: 10, lucro: null, margem: null, receitaLiquida: 0 },
    ];
    const r = find(buildDiagnosisItems(input), 'margem-baixa');
    expect(r).toMatchObject({ severity: 'critical', amount: 120 }); // 10% de 1000 = 100, faltam 120
    expect(r?.detail).toContain('A (-2%)');
    expect(r?.detail).not.toContain('B (');
  });

  it('frete só aparece quando há entregas com custo registrado', () => {
    expect(find(buildDiagnosisItems(base()), 'frete')).toBeUndefined();
    const input = base();
    input.freight = { loss: 200, ordersWithLoss: 8, ordersChecked: 20 }; // 2% das vendas
    expect(find(buildDiagnosisItems(input), 'frete')).toMatchObject({ severity: 'warning', amount: 200 });
    input.freight = { loss: 400, ordersWithLoss: 10, ordersChecked: 20 }; // 4% das vendas
    expect(find(buildDiagnosisItems(input), 'frete')?.severity).toBe('critical');
  });

  it('cancelamentos: percentual sobre pedidos válidos + cancelados', () => {
    const input = base();
    input.cancelled = { count: 6, amount: 300, validCount: 94 }; // 6%
    expect(find(buildDiagnosisItems(input), 'cancelamentos')).toMatchObject({ severity: 'warning', amount: 300 });
    input.cancelled = { count: 12, amount: 600, validCount: 88 }; // 12%
    expect(find(buildDiagnosisItems(input), 'cancelamentos')?.severity).toBe('critical');
  });

  it('carrinhos, estoque e sem custo só entram quando existem', () => {
    const none = buildDiagnosisItems(base()).map((i) => i.id);
    expect(none).not.toEqual(
      expect.arrayContaining(['carrinhos-abandonados', 'capital-parado', 'estoque-zerado', 'sem-custo']),
    );
    const input = base();
    input.abandoned = { count: 3, amount: 450 };
    input.stock = { stagnantCapital: 3900, stagnantCount: 12, outOfStockCount: 2 };
    input.semCusto = { count: 4, receitaLiquida: 800 };
    const items = buildDiagnosisItems(input);
    expect(find(items, 'carrinhos-abandonados')).toMatchObject({ severity: 'warning', amount: 450, estimated: true });
    expect(find(items, 'capital-parado')).toMatchObject({ severity: 'warning', amount: 3900 });
    expect(find(items, 'estoque-zerado')).toMatchObject({ severity: 'warning', amount: null });
    expect(find(items, 'sem-custo')).toMatchObject({ severity: 'info', amount: 800 });
  });

  it('ordena por gravidade e, dentro dela, por valor em R$', () => {
    const input = base();
    input.resultado = { lucroBruto: 0, custosFixos: 500, lucroLiquido: -500, breakEvenRevenue: null };
    input.descontos = { total: 1600, topCoupon: null }; // crítico, 1600
    input.abandoned = { count: 2, amount: 3000 }; // alerta, 3000
    input.stock = { stagnantCapital: 100, stagnantCount: 1, outOfStockCount: 0 }; // alerta, 100
    const ids = buildDiagnosisItems(input).map((i) => i.id);
    expect(ids.indexOf('descontos')).toBeLessThan(ids.indexOf('resultado')); // ambos críticos: 1600 > 500
    expect(ids.indexOf('resultado')).toBeLessThan(ids.indexOf('carrinhos-abandonados'));
    expect(ids.indexOf('carrinhos-abandonados')).toBeLessThan(ids.indexOf('capital-parado'));
  });
});
