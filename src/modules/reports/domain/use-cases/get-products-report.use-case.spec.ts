import { ForbiddenException } from '@nestjs/common';
import { GetProductsReportUseCase } from './get-products-report.use-case';

const DAY = 24 * 60 * 60 * 1000;

const prod = (id: string, over: any = {}) => ({
  id,
  title: `Produto ${id}`,
  categoryId: 'cat1',
  costPrice: 5,
  price: 10,
  deletedAt: null,
  createdAt: new Date(Date.now() - 200 * DAY),
  category: { title: 'Café' },
  images: [],
  items: [{ stock: 10 }],
  ...over,
});

const order = (items: any[], over: any = {}) => ({
  couponDiscount: 0,
  paymentDiscount: 0,
  receiptDiscount: 0,
  cardFee: 0,
  paymentMethod: 'pix',
  items,
  ...over,
});

const line = (over: any) => ({
  productId: null,
  productName: 'x',
  price: 10,
  quantity: 1,
  isCombo: false,
  comboId: null,
  comboSnapshot: null,
  product: null,
  ...over,
});

const boxLine = (quantity: number) =>
  line({
    productName: 'Box A+B',
    price: 30,
    quantity,
    isCombo: true,
    comboId: 'c1',
    comboSnapshot: {
      items: [
        { productId: 'a', productName: 'Produto a', quantity: 2, productPrice: 10, productCostPrice: 5 },
        { productId: 'b', productName: 'Produto b', quantity: 1, productPrice: 10, productCostPrice: 5 },
      ],
    },
  });

function buildPrisma(opts: {
  products?: any[];
  orders?: any[];
  recentItems?: any[];
  direct?: any[];
  viaCombo?: any[];
}) {
  return {
    product: { findMany: jest.fn().mockResolvedValue(opts.products ?? []) },
    order: { findMany: jest.fn().mockResolvedValue(opts.orders ?? []) },
    combo: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', name: 'Box A+B', imageUrl: null, categoryId: 'cat1', category: { title: 'Café' } },
      ]),
    },
    // 1ª chamada: vendas recentes (janela); 2ª: última venda avulsa; 3ª: via box
    orderItem: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(opts.recentItems ?? [])
        .mockResolvedValueOnce(opts.direct ?? [])
        .mockResolvedValueOnce(opts.viaCombo ?? []),
    },
  } as any;
}

const run = (prisma: any, extra: any = {}) =>
  new GetProductsReportUseCase(prisma).execute({ storeId: 's1', ...extra });

describe('GetProductsReportUseCase', () => {
  it('recusa consulta sem storeId', async () => {
    await expect(run(buildPrisma({}), { storeId: undefined })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('separa unidades avulsas, dentro de box e total, e conta os boxes à parte', async () => {
    const prisma = buildPrisma({
      products: [prod('a'), prod('b')],
      orders: [
        order([
          line({ productId: 'a', productName: 'Produto a', price: 10, quantity: 3 }),
          boxLine(2), // 2 boxes: 4x a + 2x b
        ]),
      ],
    });
    const res = await run(prisma);

    const a = res.produtos.find((p) => p.id === 'a')!;
    const b = res.produtos.find((p) => p.id === 'b')!;
    expect(a).toMatchObject({ unidadesAvulsas: 3, unidadesEmCombos: 4, unidadesTotais: 7 });
    expect(b).toMatchObject({ unidadesAvulsas: 0, unidadesEmCombos: 2, unidadesTotais: 2 });

    expect(res.resumo).toMatchObject({
      unidadesTotais: 9,
      unidadesAvulsas: 3,
      unidadesEmCombos: 6,
      combosVendidos: 2,
      itensContandoBoxComoUm: 5, // 3 avulsas + 2 boxes (como o Dashboard conta)
    });
    expect(res.combos[0]).toMatchObject({ id: 'c1', quantidade: 2 });
    expect(res.combos[0].composicao).toContain('2x Produto a');
  });

  it('ordena o ranking por unidades totais', async () => {
    const prisma = buildPrisma({
      products: [prod('a'), prod('b')],
      orders: [
        order([
          line({ productId: 'a', productName: 'Produto a', quantity: 1 }),
          line({ productId: 'b', productName: 'Produto b', quantity: 5 }),
        ]),
      ],
    });
    const res = await run(prisma);
    expect(res.produtos.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('calcula lucro e margem por produto; sem custo vira null e sinalizado', async () => {
    const prisma = buildPrisma({
      products: [prod('a'), prod('b', { costPrice: null })],
      orders: [
        order([
          line({ productId: 'a', productName: 'Produto a', price: 10, quantity: 2, product: { costPrice: 4 } }),
          line({ productId: 'b', productName: 'Produto b', price: 10, quantity: 1, product: { costPrice: null } }),
        ]),
      ],
    });
    const res = await run(prisma);
    const a = res.produtos.find((p) => p.id === 'a')!;
    const b = res.produtos.find((p) => p.id === 'b')!;
    expect(a.lucro).toBe(12); // 20 - 8
    expect(a.margem).toBe(60);
    expect(b.lucro).toBeNull();
    expect(b.semCusto).toBe(true);
    expect(res.resumo.produtosSemCusto).toBe(1);
  });

  it('filtra por categoria', async () => {
    const prisma = buildPrisma({
      products: [prod('a'), prod('b', { categoryId: 'cat2' })],
      orders: [
        order([
          line({ productId: 'a', productName: 'Produto a', quantity: 1 }),
          line({ productId: 'b', productName: 'Produto b', quantity: 1 }),
        ]),
      ],
    });
    const res = await run(prisma, { categoryId: 'cat2' });
    expect(res.produtos.map((p) => p.id)).toEqual(['b']);
  });

  it('filtra por forma de pagamento mesmo com grafias diferentes', async () => {
    const prisma = buildPrisma({
      products: [prod('a')],
      orders: [
        order([line({ productId: 'a', productName: 'Produto a', quantity: 1 })], {
          paymentMethod: 'Cartão de Crédito',
        }),
        order([line({ productId: 'a', productName: 'Produto a', quantity: 4 })], {
          paymentMethod: 'pix',
        }),
      ],
    });
    const res = await run(prisma, { paymentMethod: 'credit' });
    expect(res.produtos[0].unidadesTotais).toBe(1);
  });

  describe('produtos parados', () => {
    it('lista produtos com estoque sem venda na janela, com dias e capital parado', async () => {
      const last = new Date(Date.now() - 50 * DAY);
      const prisma = buildPrisma({
        products: [
          prod('vendeu'),
          prod('parado', { items: [{ stock: 4 }, { stock: 6 }], costPrice: 5 }),
          prod('semestoque', { items: [{ stock: 0 }] }),
          prod('apagado', { deletedAt: new Date() }),
        ],
        recentItems: [{ productId: 'vendeu', comboSnapshot: null }],
        direct: [{ productId: 'parado', order: { createdAt: last } }],
      });
      const { parados } = await run(prisma);
      expect(parados.quantidade).toBe(1);
      expect(parados.itens[0]).toMatchObject({
        id: 'parado',
        estoque: 10,
        capitalParado: 50,
        diasSemVender: 50,
        nuncaVendeu: false,
      });
      expect(parados.capitalParado).toBe(50);
    });

    it('venda dentro de box tira o produto da lista de parados', async () => {
      const prisma = buildPrisma({
        products: [prod('a'), prod('b')],
        recentItems: [{ productId: null, comboSnapshot: { items: [{ productId: 'a' }] } }],
      });
      const { parados } = await run(prisma);
      expect(parados.itens.map((i) => i.id)).toEqual(['b']);
    });

    it('produto que nunca vendeu usa a data de cadastro e é marcado', async () => {
      const prisma = buildPrisma({
        products: [prod('novo', { createdAt: new Date(Date.now() - 90 * DAY) })],
      });
      const { parados } = await run(prisma);
      expect(parados.itens[0]).toMatchObject({ nuncaVendeu: true, diasSemVender: 90 });
    });

    it('usa a última venda via box quando é mais recente que a avulsa', async () => {
      const prisma = buildPrisma({
        products: [prod('a')],
        direct: [{ productId: 'a', order: { createdAt: new Date(Date.now() - 100 * DAY) } }],
        viaCombo: [
          {
            comboSnapshot: { items: [{ productId: 'a' }] },
            order: { createdAt: new Date(Date.now() - 40 * DAY) },
          },
        ],
      });
      const { parados } = await run(prisma);
      expect(parados.itens[0].diasSemVender).toBe(40);
    });

    it('respeita idleDays e a categoria', async () => {
      const prisma = buildPrisma({
        products: [prod('a'), prod('b', { categoryId: 'cat2' })],
      });
      const { parados } = await run(prisma, { idleDays: 90, categoryId: 'cat2' });
      expect(parados.diasSemVender).toBe(90);
      expect(parados.itens.map((i) => i.id)).toEqual(['b']);
    });
  });
});
