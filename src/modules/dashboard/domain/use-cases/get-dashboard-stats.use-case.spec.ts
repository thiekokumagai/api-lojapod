import { ForbiddenException } from '@nestjs/common';
import { GetDashboardStatsUseCase } from './get-dashboard-stats.use-case';

function buildPrisma(orders: any[]) {
  return {
    order: { findMany: jest.fn().mockResolvedValue(orders) },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    storeSession: { findMany: jest.fn().mockResolvedValue([]) },
    cartDraft: { count: jest.fn().mockResolvedValue(0) },
  } as any;
}

const product = (id: string, costPrice: number | null, categoryId = 'cat1') => ({
  id,
  title: `Produto ${id}`,
  costPrice,
  categoryId,
  images: [],
  category: { title: 'Cat' },
});

const item = (over: any) => ({
  isCombo: false,
  comboId: null,
  comboSnapshot: null,
  combo: null,
  ...over,
});

describe('GetDashboardStatsUseCase - lucro e ranking', () => {
  const baseOrder = {
    couponDiscount: 0,
    paymentDiscount: 0,
    receiptDiscount: 0,
    cardFee: 0,
    totalOrder: 0,
    createdAt: new Date(),
  };

  const run = (orders: any[], extra: any = {}) =>
    new GetDashboardStatsUseCase(buildPrisma(orders)).execute({
      storeId: 's1',
      ...extra,
    });

  it('recusa consulta sem storeId (não soma todas as lojas)', async () => {
    const prisma = buildPrisma([]);
    await expect(
      new GetDashboardStatsUseCase(prisma).execute({}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('filtra pedidos por storeId e exclui CANCELLED', async () => {
    const prisma = buildPrisma([]);
    await new GetDashboardStatsUseCase(prisma).execute({ storeId: 's1' });
    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.storeId).toBe('s1');
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });

  it('calcula lucro bruto e margem com cupom e taxa de cartão (frete fora)', async () => {
    // itens 100, cupom 10, taxa 5, custo 40 => lucro 100-10-40-5 = 45; margem 45/90 = 50%
    const res = await run([
      {
        ...baseOrder,
        id: 'o1',
        totalOrder: 120, // inclui frete, que não pode afetar o lucro
        couponDiscount: 10,
        cardFee: 5,
        items: [
          item({
            id: 'i1',
            productId: 'p1',
            productName: 'Produto p1',
            price: 50,
            quantity: 2,
            product: product('p1', 20),
          }),
        ],
      },
    ]);
    expect(res.stats.lucroBruto).toBe(45);
    expect(res.stats.margemBruta).toBe(50);
    expect(res.stats.custoProdutosVendidos).toBe(40);
    expect(res.semCusto.count).toBe(0);
    expect(res.bestSellers[0]).toMatchObject({ lucro: 45, margem: 50, semCusto: false });
  });

  it('produto sem custo: fora do lucro/margem, listado em semCusto, margem null', async () => {
    const res = await run([
      {
        ...baseOrder,
        id: 'o1',
        items: [
          item({ id: 'i1', productId: 'p1', productName: 'Com custo', price: 100, quantity: 1, product: product('p1', 60) }),
          item({ id: 'i2', productId: 'p2', productName: 'Sem custo', price: 100, quantity: 5, product: product('p2', null) }),
        ],
      },
    ]);
    expect(res.stats.lucroBruto).toBe(40);
    expect(res.stats.margemBruta).toBe(40); // não 100%: o item sem custo não entra
    expect(res.semCusto.count).toBe(1);
    expect(res.semCusto.produtos).toEqual([{ id: 'p2', title: 'Sem custo' }]);
    const semCusto = res.bestSellers.find((b) => b.id === 'p2');
    expect(semCusto).toMatchObject({ lucro: null, margem: null, semCusto: true });
  });

  it('combo usa productCostPrice do snapshot', async () => {
    const res = await run([
      {
        ...baseOrder,
        id: 'o1',
        items: [
          item({
            id: 'i1',
            isCombo: true,
            comboId: 'c1',
            productName: 'Combo',
            price: 100,
            quantity: 1,
            combo: { name: 'Combo', imageUrl: null, categoryId: 'cat1', category: { title: 'Cat' } },
            comboSnapshot: {
              items: [
                { productCostPrice: 30, quantity: 1 },
                { productCostPrice: 10, quantity: 2 },
              ],
            },
          }),
        ],
      },
    ]);
    expect(res.stats.custoProdutosVendidos).toBe(50);
    expect(res.stats.lucroBruto).toBe(50);
  });

  describe('ordenação do ranking', () => {
    const orders = [
      {
        ...baseOrder,
        id: 'o1',
        items: [
          // A: muita quantidade, margem baixa (rev 100, lucro 10, margem 10%)
          item({ id: 'a', productId: 'A', productName: 'A', price: 10, quantity: 10, product: product('A', 9) }),
          // B: lucro maior (rev 400, lucro 200, margem 50%)
          item({ id: 'b', productId: 'B', productName: 'B', price: 200, quantity: 2, product: product('B', 100) }),
          // C: maior margem, pouco volume (rev 10, lucro 9, margem 90%)
          item({ id: 'c', productId: 'C', productName: 'C', price: 10, quantity: 1, product: product('C', 1) }),
          // D: maior faturamento, sem custo
          item({ id: 'd', productId: 'D', productName: 'D', price: 1000, quantity: 1, product: product('D', null) }),
        ],
      },
    ];
    const ids = async (sortBy: any) =>
      (await run(orders, { sortBy })).bestSellers.map((b) => b.id);

    it('quantity', async () => expect(await ids('quantity')).toEqual(['A', 'B', 'C', 'D']));
    it('revenue', async () => expect(await ids('revenue')).toEqual(['D', 'B', 'A', 'C']));
    it('profit (sem custo no fim)', async () => expect(await ids('profit')).toEqual(['B', 'A', 'C', 'D']));
    it('margin (sem custo no fim)', async () => expect(await ids('margin')).toEqual(['C', 'B', 'A', 'D']));
  });

  it('categoryId filtra só o ranking; os cards seguem com todas as vendas', async () => {
    const res = await run(
      [
        {
          ...baseOrder,
          id: 'o1',
          items: [
            item({ id: 'a', productId: 'A', productName: 'A', price: 100, quantity: 1, product: product('A', 50, 'cat1') }),
            item({ id: 'b', productId: 'B', productName: 'B', price: 100, quantity: 1, product: product('B', 50, 'cat2') }),
          ],
        },
      ],
      { categoryId: 'cat2' },
    );
    expect(res.bestSellers.map((b) => b.id)).toEqual(['B']);
    expect(res.stats.lucroBruto).toBe(100);
  });
  describe('comparacao com o período anterior', () => {
    const orders = [
      {
        ...baseOrder,
        id: 'o1',
        totalOrder: 120,
        cardFee: 5,
        items: [
          item({ id: 'i1', productId: 'p1', productName: 'p1', price: 50, quantity: 2, product: product('p1', 20) }),
        ],
      },
    ];

    it('busca o período anterior antes do início e devolve os mesmos KPIs', async () => {
      const prisma = buildPrisma(orders);
      const res = await new GetDashboardStatsUseCase(prisma).execute({
        storeId: 's1',
        startDate: '2026-01-10',
        endDate: '2026-01-16',
      });

      const prevWhere = prisma.order.findMany.mock.calls[1][0].where;
      expect(prevWhere.storeId).toBe('s1');
      expect(prevWhere.status).toEqual({ not: 'CANCELLED' });
      expect(prevWhere.createdAt.lte.getTime()).toBeLessThan(
        prisma.order.findMany.mock.calls[0][0].where.createdAt.gte.getTime(),
      );

      // itens 100, taxa 5, custo 40 => lucro 55; margem 55/100
      expect(res.comparacao).toMatchObject({
        totalVendas: 120,
        totalPedidos: 1,
        ticketMedio: 120,
        totalProdutosVendidos: 2,
        lucroBruto: 55,
        margemBruta: 55,
        visitas: 0,
        conversao: 0,
        abandonos: 0,
      });
    });

    it('withComparison=false não faz a consulta extra', async () => {
      const prisma = buildPrisma(orders);
      const res = await new GetDashboardStatsUseCase(prisma).execute({
        storeId: 's1',
        withComparison: false,
      });
      expect(res.comparacao).toBeNull();
      expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
