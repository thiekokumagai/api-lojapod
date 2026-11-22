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
});
