import { ForbiddenException } from '@nestjs/common';
import { GetStoreDiagnosisUseCase } from './get-store-diagnosis.use-case';

function build(overrides: any = {}) {
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue(overrides.orders ?? []),
      aggregate: jest.fn().mockResolvedValue(
        overrides.cancelled ?? { _count: { _all: 0 }, _sum: { totalOrder: null } },
      ),
    },
    cartDraft: { findMany: jest.fn().mockResolvedValue(overrides.carts ?? []) },
    fixedCost: { findMany: jest.fn().mockResolvedValue(overrides.fixedCosts ?? []) },
  } as any;

  const stats = {
    execute: jest.fn().mockResolvedValue(
      overrides.stats ?? {
        stats: {
          lucroBruto: 1000,
          margemBruta: 40,
          receitaItens: 3000,
          descontosConcedidos: 500,
          totalPedidos: 10,
          visitas: 0,
          conversao: 0,
        },
        semCusto: { count: 0, receitaLiquida: 0 },
        bestSellers: [],
      },
    ),
  } as any;

  const stock = {
    execute: jest.fn().mockResolvedValue({
      kpis: { stagnantCapital: 0, stagnantCount: 0, outOfStockCount: 0 },
    }),
  } as any;

  return { prisma, stats, stock, uc: new GetStoreDiagnosisUseCase(prisma, stats, stock) };
}

describe('GetStoreDiagnosisUseCase', () => {
  it('recusa consulta sem storeId (não soma todas as lojas)', async () => {
    const { uc, prisma, stats } = build();
    await expect(uc.execute({})).rejects.toBeInstanceOf(ForbiddenException);
    expect(stats.execute).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('todas as consultas filtram pela loja', async () => {
    const { uc, prisma, stats, stock } = build();
    await uc.execute({ storeId: 's1', startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(stats.execute.mock.calls[0][0].storeId).toBe('s1');
    expect(prisma.order.findMany.mock.calls[0][0].where.storeId).toBe('s1');
    expect(prisma.order.aggregate.mock.calls[0][0].where.storeId).toBe('s1');
    expect(prisma.cartDraft.findMany.mock.calls[0][0].where.storeId).toBe('s1');
    expect(prisma.fixedCost.findMany.mock.calls[0][0].where.storeId).toBe('s1');
    expect(stock.execute).toHaveBeenCalledWith({ storeId: 's1' });
  });

  it('pedidos cancelados ficam fora das contas e entram só no item de cancelamentos', async () => {
    const { uc, prisma } = build({
      cancelled: { _count: { _all: 2 }, _sum: { totalOrder: '150.00' } },
    });
    const r = await uc.execute({ storeId: 's1' });
    expect(prisma.order.findMany.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
    expect(prisma.order.aggregate.mock.calls[0][0].where.status).toBe('CANCELLED');
    expect(r.itens.find((i) => i.id === 'cancelamentos')).toMatchObject({ amount: 150 });
  });

  it('lucro líquido = lucro bruto - custo fixo proporcional (30 dias = mensal inteiro)', async () => {
    const { uc } = build({
      fixedCosts: [
        { name: 'Aluguel', value: '1200', repeats: true, createdAt: new Date('2025-01-01') },
        { name: 'Internet', value: '300', repeats: true, createdAt: new Date('2025-01-01') },
      ],
    });
    const r = await uc.execute({ storeId: 's1', startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(r.periodo.dias).toBe(30);
    expect(r.resultado.custosFixos).toBe(1500);
    expect(r.resultado.lucroLiquido).toBe(-500); // 1000 - 1500
    expect(r.custosFixosPorItem).toEqual([
      { name: 'Aluguel', value: 1200 },
      { name: 'Internet', value: 300 },
    ]);
    // equilíbrio: 1500 / 0,40 = 3750 em itens; receita líquida por pedido = (3000-500)/10 = 250 => 15 pedidos
    expect(r.resultado.pontoEquilibrioReceita).toBe(3750);
    expect(r.resultado.pontoEquilibrioPedidos).toBe(15);
    expect(r.itens.find((i) => i.id === 'resultado')?.severity).toBe('critical');
  });

  it('um dia usa 1/30 do custo mensal', async () => {
    const { uc } = build({
      fixedCosts: [{ name: 'Aluguel', value: '3000', repeats: true, createdAt: new Date('2025-01-01') }],
    });
    const r = await uc.execute({ storeId: 's1', startDate: '2026-11-10', endDate: '2026-11-10' });
    expect(r.periodo.dias).toBe(1);
    expect(r.resultado.custosFixos).toBe(100);
  });

  it('descontos, cupom campeão e taxa de cartão vêm dos pedidos válidos', async () => {
    const { uc } = build({
      orders: [
        { couponDiscount: '30', paymentDiscount: '0', receiptDiscount: '0', cardFee: '0', paymentMethod: 'PIX', freight: '0', couponFreightDiscount: '0', uberDeliveryFee: null, coupon: { title: 'PROMO10' }, courierTransaction: null },
        { couponDiscount: '20', paymentDiscount: '10', receiptDiscount: '0', cardFee: '12', paymentMethod: 'CREDIT_CARD', freight: '0', couponFreightDiscount: '0', uberDeliveryFee: null, coupon: { title: 'PROMO10' }, courierTransaction: null },
      ],
    });
    const r = await uc.execute({ storeId: 's1' });
    const d = r.itens.find((i) => i.id === 'descontos');
    expect(d?.amount).toBe(60);
    expect(d?.detail).toContain('PROMO10');
    expect(r.itens.find((i) => i.id === 'taxa-cartao')?.amount).toBe(12);
  });

  it('frete: soma o que a entrega custou acima do frete cobrado (Uber e motoboy em lote)', async () => {
    const { uc } = build({
      orders: [
        // Uber custou 18, cobrou 10 => perda 8
        { couponDiscount: '0', paymentDiscount: '0', receiptDiscount: '0', cardFee: '0', paymentMethod: 'PIX', freight: '10', couponFreightDiscount: '0', uberDeliveryFee: '18', coupon: null, courierTransaction: null },
        // Motoboy: lote de 2 pedidos com taxa 20 => 10 cada; cobrou 15 => sem perda
        { couponDiscount: '0', paymentDiscount: '0', receiptDiscount: '0', cardFee: '0', paymentMethod: 'PIX', freight: '15', couponFreightDiscount: '0', uberDeliveryFee: null, coupon: null, courierTransaction: { type: 'FEE', amount: '20', _count: { orders: 2 } } },
        // Retirada na loja, sem custo de entrega registrado: fora da conta
        { couponDiscount: '0', paymentDiscount: '0', receiptDiscount: '0', cardFee: '0', paymentMethod: 'PIX', freight: '0', couponFreightDiscount: '0', uberDeliveryFee: null, coupon: null, courierTransaction: null },
      ],
    });
    const r = await uc.execute({ storeId: 's1' });
    expect(r.itens.find((i) => i.id === 'frete')).toMatchObject({ amount: 8 });
  });

  it('carrinhos abandonados: só os com contato, ainda não chamados e não convertidos', async () => {
    const { uc, prisma } = build({ carts: [{ totalAmount: '100' }, { totalAmount: '50.5' }] });
    const r = await uc.execute({ storeId: 's1' });
    const where = prisma.cartDraft.findMany.mock.calls[0][0].where;
    expect(where.customerPhone).toEqual({ not: null });
    expect(where.contactedAt).toBeNull();
    expect(where.session).toEqual({ isConverted: false });
    expect(r.itens.find((i) => i.id === 'carrinhos-abandonados')).toMatchObject({ amount: 150.5 });
  });
});
