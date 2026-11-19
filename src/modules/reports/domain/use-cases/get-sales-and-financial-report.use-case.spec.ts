import { ForbiddenException } from '@nestjs/common';
import { GetSalesReportUseCase } from './get-sales-report.use-case';
import { GetFinancialReportUseCase } from './get-financial-report.use-case';

const baseOrder = (over: any = {}) => ({
  orderNumber: 1,
  createdAt: new Date(),
  customerName: 'Maria',
  totalOrder: 100,
  freight: 10,
  couponFreightDiscount: 0,
  couponDiscount: 0,
  paymentDiscount: 0,
  receiptDiscount: 0,
  cardFee: 0,
  paymentMethod: 'pix',
  paymentStatus: 'PAID',
  status: 'COMPLETED',
  deliveryModality: 'DELIVERY',
  uberDeliveryFee: null,
  courierTransaction: null,
  items: [
    {
      price: 90,
      quantity: 1,
      isCombo: false,
      comboId: null,
      comboSnapshot: null,
      product: { costPrice: 40 },
    },
  ],
  ...over,
});

function buildPrisma(orders: any[], extra: any = {}) {
  return {
    order: {
      findMany: jest.fn().mockResolvedValue(orders),
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 2 }, _sum: { totalOrder: 55 } }),
    },
    fixedCost: { findMany: jest.fn().mockResolvedValue(extra.fixedCosts ?? []) },
    cashTransaction: { findMany: jest.fn().mockResolvedValue(extra.cash ?? []) },
  } as any;
}

describe('GetSalesReportUseCase', () => {
  const run = (prisma: any, extra: any = {}) =>
    new GetSalesReportUseCase(prisma).execute({ storeId: 's1', ...extra });

  it('recusa consulta sem storeId', async () => {
    await expect(run(buildPrisma([]), { storeId: undefined })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('totaliza faturamento, ticket médio, recebido e a receber', async () => {
    const res = await run(
      buildPrisma([
        baseOrder({ totalOrder: 100 }),
        baseOrder({ totalOrder: 50, paymentStatus: 'PENDING', paymentMethod: 'cash' }),
      ]),
    );
    expect(res.resumo).toMatchObject({
      pedidos: 2,
      faturamento: 150,
      ticketMedio: 75,
      recebido: 100,
      aReceber: 50,
      pedidosPagos: 1,
      freteCobrado: 20,
      cancelados: { pedidos: 2, valor: 55 },
    });
  });

  it('agrupa por forma de pagamento com o nome em português', async () => {
    const res = await run(
      buildPrisma([
        baseOrder({ totalOrder: 100, paymentMethod: 'pix' }),
        baseOrder({ totalOrder: 100, paymentMethod: 'Pix' }),
        baseOrder({ totalOrder: 50, paymentMethod: 'credit' }),
      ]),
    );
    expect(res.porPagamento[0]).toMatchObject({ nome: 'Pix', pedidos: 2, valor: 200 });
    expect(res.porPagamento[1]).toMatchObject({ nome: 'Cartão de crédito', pedidos: 1 });
  });

  it('filtra por forma de pagamento e não busca cancelados quando há filtro de status', async () => {
    const prisma = buildPrisma([
      baseOrder({ totalOrder: 100, paymentMethod: 'pix' }),
      baseOrder({ totalOrder: 50, paymentMethod: 'credit' }),
    ]);
    const res = await run(prisma, { paymentMethod: 'pix', status: 'COMPLETED' });
    expect(res.resumo.pedidos).toBe(1);
    expect(res.resumo.cancelados).toBeNull();
    expect(prisma.order.aggregate).not.toHaveBeenCalled();
  });

  it('sem status explícito exclui cancelados da consulta', async () => {
    const prisma = buildPrisma([]);
    await run(prisma);
    expect(prisma.order.findMany.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
  });

  it('limita a lista de pedidos e avisa quando truncou', async () => {
    const many = Array.from({ length: 501 }, (_, i) => baseOrder({ orderNumber: i }));
    const res = await run(buildPrisma(many));
    expect(res.pedidos).toHaveLength(500);
    expect(res.listaTruncada).toBe(true);
    expect(res.resumo.pedidos).toBe(501);
  });
});

describe('GetFinancialReportUseCase', () => {
  const run = (prisma: any, extra: any = {}) =>
    new GetFinancialReportUseCase(prisma).execute({
      storeId: 's1',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      ...extra,
    });

  it('recusa consulta sem storeId', async () => {
    await expect(run(buildPrisma([]), { storeId: undefined })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lucro bruto = itens - descontos - custo - taxa (mesma regra do Dashboard)', async () => {
    const res = await run(
      buildPrisma([baseOrder({ couponDiscount: 10, cardFee: 5, totalOrder: 95 })]),
    );
    // 90 - 10 (cupom) - 40 (custo) - 5 (taxa) = 35
    expect(res.resultado).toMatchObject({
      receitaItens: 90,
      descontos: 10,
      custoProdutos: 40,
      taxaCartao: 5,
      lucroBruto: 35,
    });
  });

  it('desconta custos fixos proporcionais ao período no lucro líquido', async () => {
    const res = await run(
      buildPrisma([baseOrder()], {
        fixedCosts: [
          { name: 'Aluguel', value: 300, repeats: true, createdAt: new Date('2026-01-01') },
        ],
      }),
    );
    // 30 dias de 30: R$ 300 inteiros
    expect(res.resultado.custosFixos).toBe(300);
    expect(res.resultado.lucroLiquido).toBe(res.resultado.lucroBruto - 300);
    expect(res.custosFixosPorItem).toEqual([{ name: 'Aluguel', value: 300 }]);
  });

  it('item sem custo fica fora do lucro e entra em receitaSemCusto', async () => {
    const res = await run(
      buildPrisma([
        baseOrder({
          items: [
            { price: 90, quantity: 1, isCombo: false, comboId: null, comboSnapshot: null, product: { costPrice: null } },
          ],
        }),
      ]),
    );
    expect(res.resultado.lucroBruto).toBe(0);
    expect(res.resultado.receitaSemCusto).toBe(90);
    expect(res.resultado.margemBruta).toBeNull();
  });

  it('frete: cobrado, pago (Uber) e saldo ficam fora do lucro', async () => {
    const res = await run(
      buildPrisma([baseOrder({ freight: 12, uberDeliveryFee: 15 })]),
    );
    expect(res.frete).toEqual({ cobrado: 12, pago: 15, saldo: -3, pedidosComFretePago: 1 });
  });

  it('soma entradas e saídas do caixa e agrupa saídas por categoria', async () => {
    const res = await run(
      buildPrisma([], {
        cash: [
          { type: 'ENTRY', category: 'GENERAL', amount: 500 },
          { type: 'OUTFLOW', category: 'FIXED_COST', amount: 200 },
          { type: 'OUTFLOW', category: 'GENERAL', amount: 50 },
        ],
      }),
    );
    expect(res.caixa).toMatchObject({ entradas: 500, saidas: 250, saldo: 250 });
    expect(res.caixa.saidasPorCategoria[0]).toEqual({ categoria: 'FIXED_COST', valor: 200 });
  });

  it('separa recebido de a receber', async () => {
    const res = await run(
      buildPrisma([
        baseOrder({ totalOrder: 100 }),
        baseOrder({ totalOrder: 40, paymentStatus: 'PENDING' }),
      ]),
    );
    expect(res.recebimentos).toMatchObject({ recebido: 100, aReceber: 40 });
  });
});
