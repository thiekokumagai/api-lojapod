import { GetDashboardStatsUseCase } from './get-dashboard-stats.use-case';

interface VariationRow {
  label: string;
  quantity: number;
  totalRevenue: number;
}
interface RankingRow {
  id: string;
  quantity: number;
  totalRevenue: number;
  variacoes?: VariationRow[];
}

const product = (id: string, categoryId = 'cat1') => ({
  id,
  title: `Produto ${id}`,
  costPrice: 20,
  categoryId,
  images: [],
  category: { title: 'Cat' },
});

const item = (
  productId: string,
  variation: string | null,
  quantity: number,
  price: number,
  categoryId = 'cat1',
) => ({
  isCombo: false,
  comboId: null,
  comboSnapshot: null,
  combo: null,
  productId,
  productName: productId,
  variation,
  price,
  quantity,
  product: product(productId, categoryId),
});

const order = (items: ReturnType<typeof item>[]) => ({
  couponDiscount: 0,
  paymentDiscount: 0,
  receiptDiscount: 0,
  cardFee: 0,
  totalOrder: 0,
  createdAt: new Date(),
  items,
});

async function ranking(
  orders: ReturnType<typeof order>[],
  categoryId?: string,
): Promise<RankingRow[]> {
  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue(orders) },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    storeSession: { findMany: jest.fn().mockResolvedValue([]) },
    cartDraft: { count: jest.fn().mockResolvedValue(0) },
  };
  const res = (await new GetDashboardStatsUseCase(prisma as never).execute({
    storeId: 's1',
    withComparison: false,
    limit: 100,
    categoryId,
  })) as unknown as { bestSellers: RankingRow[] };
  return res.bestSellers;
}

describe('GetDashboardStatsUseCase - variações em "Produtos vendidos"', () => {
  it('agrupa por variação, ordena por quantidade e a soma bate com o total do produto', async () => {
    const res = await ranking([
      order([item('cam', 'P / Azul', 2, 50), item('cam', 'M / Preto', 2, 50)]),
      order([item('cam', 'P / Azul', 1, 50), item('cam', null, 1, 40)]),
    ]);
    const cam = res.find((p) => p.id === 'cam');
    expect(cam?.quantity).toBe(6);
    expect(cam?.totalRevenue).toBe(290);
    expect(cam?.variacoes).toEqual([
      { label: 'P / Azul', quantity: 3, totalRevenue: 150 },
      { label: 'M / Preto', quantity: 2, totalRevenue: 100 },
      { label: 'Sem variação', quantity: 1, totalRevenue: 40 },
    ]);
    const variacoes = cam?.variacoes ?? [];
    const sumQty = variacoes.reduce((s, v) => s + v.quantity, 0);
    const sumRevenue = variacoes.reduce((s, v) => s + v.totalRevenue, 0);
    expect(sumQty).toBe(cam?.quantity);
    expect(sumRevenue).toBe(cam?.totalRevenue);
  });

  it('produto que nunca vendeu com variação não ganha lista (fica como hoje)', async () => {
    const res = await ranking([order([item('sim', null, 3, 10)])]);
    expect(res[0].variacoes).toBeUndefined();
    expect(res[0].quantity).toBe(3);
  });

  it('filtro de categoria continua valendo para as variações', async () => {
    const res = await ranking(
      [
        order([
          item('cam', 'P / Azul', 2, 50),
          item('cal', '40', 1, 80, 'cat2'),
        ]),
      ],
      'cat2',
    );
    expect(res.map((p) => p.id)).toEqual(['cal']);
    expect(res[0].variacoes).toEqual([
      { label: '40', quantity: 1, totalRevenue: 80 },
    ]);
  });
});
