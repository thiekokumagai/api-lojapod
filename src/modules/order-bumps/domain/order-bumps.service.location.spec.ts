import { OrderBumpsService } from './order-bumps.service';

type Rule = Record<string, any>;

interface Suggestion {
  bumpId: string;
  sectionTitle: string;
  product: {
    description: string | null;
    price: number;
    originalPrice: number;
    hasDiscount: boolean;
    imageUrl: string | null;
  };
}

/** Sugestões já tipadas (o serviço devolve any). */
const suggest = async (
  service: OrderBumpsService,
  dto: { productIds: string[]; location?: 'CART' | 'PRODUCT' },
): Promise<Suggestion[]> =>
  (await service.getSuggestionsForStore(dto)) as Suggestion[];

/** Produto sugerido mínimo, com estoque e foto. */
const suggested = (id: string, extra: Rule = {}) => ({
  id,
  title: `Bebida ${id}`,
  price: 7,
  promotionalPrice: null,
  isVisible: true,
  deletedAt: null,
  description: 'Lata 310ml',
  images: [{ url: `/img/${id}.png` }],
  variations: [],
  items: [{ id: `pi-${id}`, stock: 5, options: [] }],
  ...extra,
});

const rule = (id: string, displayLocation: string, extra: Rule = {}) => ({
  id: `bump-${id}`,
  storeId: 'store-1',
  isActive: true,
  title: 'Leve junto uma Bebida',
  priority: 0,
  triggerType: 'ALL',
  triggerProductId: null,
  triggerCategoryId: null,
  customPrice: null,
  discountPercent: null,
  displayLocation,
  suggestedProduct: suggested(id),
  ...extra,
});

/** "Banco" falso que aplica o filtro `where` que o serviço manda (loja, ativa e local). */
function build(rules: Rule[]) {
  const findMany = jest.fn(
    ({
      where,
    }: {
      where: {
        storeId: string;
        isActive: boolean;
        displayLocation: { in: string[] };
      };
    }) =>
      Promise.resolve(
        rules.filter(
          (r) =>
            r.storeId === where.storeId &&
            r.isActive === where.isActive &&
            where.displayLocation.in.includes(r.displayLocation),
        ),
      ),
  );
  const create = jest.fn(({ data }: { data: Rule }) => Promise.resolve(data));
  const update = jest.fn(({ data }: { data: Rule }) => Promise.resolve(data));
  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'p-ok' }),
    },
    category: { findFirst: jest.fn().mockResolvedValue({ id: 'c-ok' }) },
    orderBump: {
      findMany,
      create,
      update,
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'bump-x', storeId: 'store-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const service = new OrderBumpsService(
    prisma as never,
    { getStoreId: () => 'store-1' } as never,
  );
  return { service, prisma, findMany, create, update };
}

const ids = (suggestions: Array<{ bumpId: string }>) =>
  suggestions.map((s) => s.bumpId).sort();

describe('OrderBumpsService: onde mostrar a oferta', () => {
  const all = [
    rule('cart', 'CART'),
    rule('prod', 'PRODUCT'),
    rule('both', 'BOTH'),
  ];

  describe('sugestões filtradas pelo local', () => {
    it('carrinho (e cliente antigo sem o campo): só as do carrinho e as dos dois', async () => {
      const { service } = build(all);
      expect(
        ids(
          await suggest(service, {
            productIds: ['x'],
            location: 'CART',
          }),
        ),
      ).toEqual(['bump-both', 'bump-cart']);
      expect(ids(await suggest(service, { productIds: ['x'] }))).toEqual([
        'bump-both',
        'bump-cart',
      ]);
    });

    it('tela do produto: só as da tela do produto e as dos dois', async () => {
      const { service } = build(all);
      expect(
        ids(
          await suggest(service, {
            productIds: ['x'],
            location: 'PRODUCT',
          }),
        ),
      ).toEqual(['bump-both', 'bump-prod']);
    });

    it('oferta só do carrinho NUNCA aparece na tela do produto, e vice-versa', async () => {
      const { service } = build(all);
      const onProduct = await suggest(service, {
        productIds: ['x'],
        location: 'PRODUCT',
      });
      const onCart = await suggest(service, {
        productIds: ['x'],
        location: 'CART',
      });
      expect(ids(onProduct)).not.toContain('bump-cart');
      expect(ids(onCart)).not.toContain('bump-prod');
    });

    it('o filtro vai para o banco com o local pedido', async () => {
      const { service, findMany } = build(all);
      await suggest(service, {
        productIds: ['x'],
        location: 'PRODUCT',
      });
      const where = findMany.mock.calls[0][0].where;
      expect(where.displayLocation).toEqual({ in: ['PRODUCT', 'BOTH'] });
      expect(where.isActive).toBe(true);
      expect(where.storeId).toBe('store-1');
    });
  });

  describe('gatilho continua valendo na tela do produto', () => {
    it('oferta com gatilho de produto só vem para esse produto', async () => {
      const { service } = build([
        rule('a', 'PRODUCT', {
          triggerType: 'PRODUCT',
          triggerProductId: 'donuts',
        }),
      ]);
      expect(
        (
          await suggest(service, {
            productIds: ['donuts'],
            location: 'PRODUCT',
          })
        ).length,
      ).toBe(1);
      expect(
        (
          await suggest(service, {
            productIds: ['pizza'],
            location: 'PRODUCT',
          })
        ).length,
      ).toBe(0);
    });
  });

  describe('resposta', () => {
    it('inclui a descrição curta, o preço da oferta e a foto', async () => {
      const { service } = build([
        rule('a', 'PRODUCT', {
          customPrice: 5,
          suggestedProduct: suggested('a', {
            description: '<p>Lata 310ml</p>',
          }),
        }),
      ]);
      const [s] = await suggest(service, {
        productIds: ['x'],
        location: 'PRODUCT',
      });
      expect(s.product.description).toBe('Lata 310ml');
      expect(s.product.price).toBe(5);
      expect(s.product.originalPrice).toBe(7);
      expect(s.product.hasDiscount).toBe(true);
      expect(s.product.imageUrl).toBe('/img/a.png');
      expect(s.sectionTitle).toBe('Leve junto uma Bebida');
    });

    it('produto sem descrição: description null', async () => {
      const { service } = build([
        rule('a', 'PRODUCT', {
          suggestedProduct: suggested('a', { description: null }),
        }),
      ]);
      const [s] = await suggest(service, {
        productIds: ['x'],
        location: 'PRODUCT',
      });
      expect(s.product.description).toBeNull();
    });
  });

  describe('limite de ofertas', () => {
    const many = Array.from({ length: 14 }, (_, i) => rule(`m${i}`, 'BOTH'));

    it('carrinho: até 6', async () => {
      const { service } = build(many);
      expect(
        (
          await suggest(service, {
            productIds: ['x'],
            location: 'CART',
          })
        ).length,
      ).toBe(6);
    });

    it('tela do produto: até 10', async () => {
      const { service } = build(many);
      expect(
        (
          await suggest(service, {
            productIds: ['x'],
            location: 'PRODUCT',
          })
        ).length,
      ).toBe(10);
    });
  });

  describe('cadastro (admin)', () => {
    const dto = {
      triggerType: 'ALL' as const,
      suggestedProductId: 'p-ok',
    };

    it('criar sem informar o local: padrão CART (comportamento de antes)', async () => {
      const { service, create } = build([]);
      await service.create(dto);
      expect(create.mock.calls[0][0].data.displayLocation).toBe('CART');
    });

    it.each(['CART', 'PRODUCT', 'BOTH'] as const)(
      'criar com %s grava o local',
      async (loc) => {
        const { service, create } = build([]);
        await service.create({ ...dto, displayLocation: loc });
        expect(create.mock.calls[0][0].data.displayLocation).toBe(loc);
      },
    );

    it('editar o local grava; sem informar não mexe', async () => {
      const { service, update } = build([]);
      await service.update('bump-x', { displayLocation: 'BOTH' });
      expect(update.mock.calls[0][0].data.displayLocation).toBe('BOTH');

      await service.update('bump-x', { title: 'Novo' });
      expect('displayLocation' in update.mock.calls[1][0].data).toBe(false);
    });
  });
});
