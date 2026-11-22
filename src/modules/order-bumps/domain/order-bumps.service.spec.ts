import { BadRequestException } from '@nestjs/common';
import { OrderBumpsService } from './order-bumps.service';

describe('OrderBumpsService.reorder', () => {
  function build(opts: { storeId?: string; foundIds?: string[] } = {}) {
    const storeId = opts.storeId ?? 'store-1';
    const orderBump = {
      findMany: jest.fn(({ where }: any) => {
        if (where?.id?.in) {
          const found = opts.foundIds ?? where.id.in;
          return Promise.resolve(found.map((id: string) => ({ id })));
        }
        return Promise.resolve([]);
      }),
      update: jest.fn(({ where, data }: any) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
    };
    const prisma = {
      orderBump,
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const tenant = {
      getStoreId: jest.fn().mockReturnValue(storeId),
    };
    return {
      service: new OrderBumpsService(prisma as never, tenant as never),
      prisma,
      orderBump,
    };
  }

  it('atribui priority decrescente na ordem enviada (1º da lista recebe o maior priority)', async () => {
    const { service, orderBump } = build({ foundIds: ['b1', 'b2', 'b3'] });

    await service.reorder(['b1', 'b2', 'b3']);

    expect(orderBump.update).toHaveBeenCalledTimes(3);
    expect(orderBump.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b1' },
      data: { priority: 3 },
    });
    expect(orderBump.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b2' },
      data: { priority: 2 },
    });
    expect(orderBump.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'b3' },
      data: { priority: 1 },
    });
  });

  it('recusa se algum ID não pertencer à loja atual', async () => {
    const { service, orderBump } = build({ foundIds: ['b1'] });

    await expect(service.reorder(['b1', 'b-outra-loja'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(orderBump.update).not.toHaveBeenCalled();
  });
});

describe('OrderBumpsService — múltiplos produtos de gatilho (regra OU)', () => {
  function buildMulti(opts: {
    storeId?: string;
    validProductIds?: string[];
    rules?: any[];
  } = {}) {
    const storeId = opts.storeId ?? 'store-1';
    const validIds = new Set(opts.validProductIds ?? ['p1', 'p2', 'p3', 'coca']);
    const product = {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(validIds.has(where?.id) ? { id: where.id, title: where.id } : null),
      ),
      findMany: jest.fn(({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return Promise.resolve(
          ids
            .filter((id) => validIds.has(id))
            .map((id) => ({ id, title: `Produto ${id}`, price: 10, images: [] })),
        );
      }),
    };
    const orderBump = {
      findFirst: jest.fn().mockResolvedValue({ priority: 5 }),
      findMany: jest.fn().mockResolvedValue(opts.rules ?? []),
      create: jest.fn(({ data }: any) =>
        Promise.resolve({ id: 'bump-1', ...data }),
      ),
      update: jest.fn(({ where, data }: any) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = { product, orderBump };
    const tenant = { getStoreId: jest.fn().mockReturnValue(storeId) };
    return {
      service: new OrderBumpsService(prisma as never, tenant as never),
      product,
      orderBump,
    };
  }

  it('cria regra com vários triggerProductIds deduplicados e mantém triggerProductId = primeiro', async () => {
    const { service, orderBump } = buildMulti();

    const created = await service.create({
      triggerType: 'PRODUCT',
      triggerProductIds: ['p1', 'p2', 'p1', 'p3'],
      suggestedProductId: 'coca',
      customPrice: 5,
    });

    expect(orderBump.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerProductId: 'p1',
          triggerProductIds: ['p1', 'p2', 'p3'],
        }),
      }),
    );
    expect(created.triggerProductIds).toEqual(['p1', 'p2', 'p3']);
    expect(created.triggerProducts.map((p: any) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('rejeita quando qualquer produto de gatilho não pertence à loja', async () => {
    const { service, orderBump } = buildMulti({ validProductIds: ['p1', 'coca'] });

    await expect(
      service.create({
        triggerType: 'PRODUCT',
        triggerProductIds: ['p1', 'p-outra-loja'],
        suggestedProductId: 'coca',
      }),
    ).rejects.toThrow('Produto de gatilho não encontrado na loja');
    expect(orderBump.create).not.toHaveBeenCalled();
  });

  it('getSuggestions aplica regra OU (qualquer um dos produtos gatilho dispara a oferta) e fallback legado', async () => {
    const suggestedProduct = {
      id: 'coca',
      title: 'Coca Zero',
      price: 8,
      promotionalPrice: null,
      isVisible: true,
      deletedAt: null,
      images: [],
      variations: [],
      items: [{ id: 'pi-1', stock: 10, options: [] }],
    };
    const ruleMulti = {
      id: 'b-multi',
      title: 'Peça também',
      triggerType: 'PRODUCT',
      triggerProductId: 'p1',
      triggerProductIds: ['p1', 'p2', 'p3'],
      triggerCategoryId: null,
      customPrice: 5,
      discountPercent: null,
      suggestedProduct,
    };
    const ruleLegacy = {
      id: 'b-legacy',
      title: 'Peça também',
      triggerType: 'PRODUCT',
      triggerProductId: 'p-legado',
      triggerProductIds: [],
      triggerCategoryId: null,
      customPrice: 6,
      discountPercent: null,
      suggestedProduct: { ...suggestedProduct, id: 'guarana', title: 'Guaraná' },
    };

    const { service } = buildMulti({ rules: [ruleMulti, ruleLegacy] });

    // Carrinho com apenas p2 dispara b-multi (regra OU) e não dispara b-legacy
    const res1 = await service.getSuggestionsForStore({ productIds: ['p2'], location: 'CART' });
    expect(res1).toHaveLength(1);
    expect(res1[0].bumpId).toBe('b-multi');
    expect(res1[0].triggerProductIds).toEqual(['p1', 'p2', 'p3']);

    // Carrinho com p-legado dispara b-legacy via fallback triggerProductId
    const res2 = await service.getSuggestionsForStore({ productIds: ['p-legado'], location: 'PRODUCT' });
    expect(res2).toHaveLength(1);
    expect(res2[0].bumpId).toBe('b-legacy');
    expect(res2[0].triggerProductIds).toEqual(['p-legado']);
  });

  describe('múltiplas categorias de gatilho (triggerCategoryIds — regra OU)', () => {
    function createService() {
      const prisma: any = {
        product: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sug-1', storeId: 'store-1' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        category: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        orderBump: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const tenant = { getStoreId: jest.fn().mockReturnValue('store-1') };
      return {
        service: new OrderBumpsService(prisma, tenant as never),
        prisma,
      };
    }
    it('cria regra com vários triggerCategoryIds deduplicados e mantém triggerCategoryId = primeiro', async () => {
      const { service, prisma } = createService();
      prisma.category.findMany = jest.fn().mockResolvedValue([
        { id: 'c1', title: 'Bolos' },
        { id: 'c2', title: 'Salgados' },
        { id: 'c3', title: 'Combos' },
      ]);
      prisma.orderBump.create.mockImplementation(async ({ data }: any) => ({
        id: 'bump-cat-multi',
        ...data,
      }));

      const created = await service.create({
        triggerType: 'CATEGORY',
        triggerCategoryIds: ['c1', 'c2', 'c1', 'c3'],
        suggestedProductId: 'sug-1',
      });

      expect(prisma.orderBump.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            triggerCategoryId: 'c1',
            triggerCategoryIds: ['c1', 'c2', 'c3'],
          }),
        }),
      );
      expect(created.triggerCategoryIds).toEqual(['c1', 'c2', 'c3']);
    });

    it('rejeita categoria de gatilho de outra loja ou inexistente', async () => {
      const { service, prisma } = createService();
      prisma.category.findMany = jest.fn().mockResolvedValue([{ id: 'c1' }]);

      await expect(
        service.create({
          triggerType: 'CATEGORY',
          triggerCategoryIds: ['c1', 'c-outra-loja'],
          suggestedProductId: 'sug-1',
        }),
      ).rejects.toThrow('Categoria de gatilho não encontrada na loja');
    });

    it('revalida storeId no update para triggerCategoryIds e suggestedProductId', async () => {
      const { service, prisma } = createService();
      prisma.orderBump.findFirst.mockResolvedValue({
        id: 'bump-1',
        storeId: 'store-1',
        triggerType: 'CATEGORY',
        triggerCategoryId: 'c1',
        triggerCategoryIds: ['c1'],
        suggestedProductId: 'sug-1',
      });
      prisma.category.findMany = jest.fn().mockResolvedValue([]);

      await expect(
        service.update('bump-1', { triggerCategoryIds: ['c-outra-loja'] }),
      ).rejects.toThrow('Categoria de gatilho não encontrada na loja');

      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        service.update('bump-1', { suggestedProductId: 'prod-outra-loja' }),
      ).rejects.toThrow('Produto sugerido não encontrado na loja');
    });

    it('dispara sugestão se o carrinho tiver item de QUALQUER uma das triggerCategoryIds (ou legado)', async () => {
      const { service, prisma } = createService();
      prisma.product.findMany.mockResolvedValue([{ id: 'p-bolo', categoryId: 'c2' }]);
      prisma.orderBump.findMany.mockResolvedValue([
        {
          id: 'b-multi-cat',
          title: 'Peça também',
          triggerType: 'CATEGORY',
          triggerProductId: null,
          triggerProductIds: [],
          triggerCategoryId: 'c1',
          triggerCategoryIds: ['c1', 'c2', 'c3'],
          suggestedProductId: 'sug-1',
          displayLocation: 'CART',
          suggestedProduct: {
            id: 'sug-1',
            title: 'Coca 2L',
            price: 12,
            promotionalPrice: null,
            isVisible: true,
            deletedAt: null,
            items: [{ stock: 5, options: [] }],
            images: [],
            variations: [],
          },
        },
        {
          id: 'b-legado-cat',
          title: 'Peça também',
          triggerType: 'CATEGORY',
          triggerProductId: null,
          triggerProductIds: [],
          triggerCategoryId: 'c-legado',
          triggerCategoryIds: [],
          suggestedProductId: 'sug-2',
          displayLocation: 'CART',
          suggestedProduct: {
            id: 'sug-2',
            title: 'Guaraná',
            price: 10,
            promotionalPrice: null,
            isVisible: true,
            deletedAt: null,
            items: [{ stock: 5, options: [] }],
            images: [],
            variations: [],
          },
        },
      ]);

      const res1 = await service.getSuggestionsForStore({ productIds: ['p-bolo'], location: 'CART' });
      expect(res1.map((r) => r.bumpId)).toEqual(['b-multi-cat']);
      expect(res1[0].triggerCategoryIds).toEqual(['c1', 'c2', 'c3']);

      prisma.product.findMany.mockResolvedValue([{ id: 'p-leg', categoryId: 'c-legado' }]);
      const res2 = await service.getSuggestionsForStore({ productIds: ['p-leg'], location: 'CART' });
      expect(res2.map((r) => r.bumpId)).toEqual(['b-legado-cat']);
      expect(res2[0].triggerCategoryIds).toEqual(['c-legado']);
    });
  });
});
