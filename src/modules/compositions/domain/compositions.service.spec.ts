import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { CompositionsService } from './compositions.service';
import { SyncProductCompositionsDto } from '../dto/attach-composition-product.dto';

// Sem banco: Prisma e contexto de loja são mocks.
function build(
  opts: {
    tenant?: string | null;
    product?: any;
    groups?: any[];
    comps?: any[];
  } = {},
) {
  const tx = {
    productComposition: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: { update: jest.fn() },
  };
  const prisma = {
    product: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.product ?? { id: 'p1', storeId: 'storeA' }),
      findUnique: jest.fn().mockResolvedValue(opts.product ?? null),
    },
    compositionGroup: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          (opts.groups ?? []).filter(
            (g) => where.id.in.includes(g.id) && g.storeId === where.storeId,
          ),
        ),
      ),
    },
    productComposition: {
      findMany: jest.fn().mockResolvedValue(opts.comps ?? []),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const tenant = {
    getStoreId: jest
      .fn()
      .mockReturnValue(opts.tenant === undefined ? 'storeA' : opts.tenant),
  };
  return {
    service: new CompositionsService(prisma as never, tenant as never),
    prisma,
    tx,
  };
}

describe('CompositionsService.syncProductCompositions', () => {
  it('recusa groupId de outra loja e não grava nada', async () => {
    const { service, prisma, tx } = build({
      groups: [
        { id: 'gA', storeId: 'storeA' },
        { id: 'gB', storeId: 'storeB' },
      ],
    });
    await expect(
      service.syncProductCompositions('p1', {
        groups: [{ groupId: 'gA' }, { groupId: 'gB' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.compositionGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['gA', 'gB'] }, storeId: 'storeA' },
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.productComposition.create).not.toHaveBeenCalled();
  });

  it('grava os vínculos quando todos os grupos são da loja', async () => {
    const { service, tx } = build({
      groups: [{ id: 'gA', storeId: 'storeA' }],
    });
    await service.syncProductCompositions('p1', {
      groups: [{ groupId: 'gA' }],
    });
    expect(tx.productComposition.create).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { isCustomizable: true },
    });
  });

  it('deduplica groupIds repetidos no payload para não violar a unique constraint (productId, groupId)', async () => {
    const { service, tx } = build({
      groups: [{ id: 'gA', storeId: 'storeA' }],
    });
    await service.syncProductCompositions('p1', {
      groups: [
        { groupId: 'gA', customMinQuantity: 1 },
        { groupId: 'gA', customMinQuantity: 2 },
      ],
    });
    expect(tx.productComposition.create).toHaveBeenCalledTimes(1);
    expect(tx.productComposition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'p1',
        groupId: 'gA',
        customMinQuantity: 1,
      }),
    });
  });

  it('o corpo do sync passa pelo ValidationPipe global (whitelist + forbidNonWhitelisted)', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const meta = {
      type: 'body' as const,
      metatype: SyncProductCompositionsDto,
    };
    const dto = await pipe.transform(
      { groups: [{ groupId: 'gA', sortOrder: 0, customFreeQuantity: 2 }] },
      meta,
    );
    expect(dto.groups[0].groupId).toBe('gA');
    await expect(
      pipe.transform({ groups: [{ groupId: 'gA', storeId: 'storeB' }] }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CompositionsService.getProductCompositionsForStore', () => {
  const product = {
    id: 'p1',
    storeId: 'storeA',
    title: 'Marmita',
    price: 25,
    isVisible: true,
    isCustomizable: true,
  };

  it('filtra os grupos pela loja do produto', async () => {
    const { service, prisma } = build({ product });
    await service.getProductCompositionsForStore('p1');
    expect(prisma.productComposition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: 'p1',
          group: { storeId: 'storeA', isActive: true },
        },
      }),
    );
  });

  it('não expõe produto de outra loja', async () => {
    const { service } = build({ product, tenant: 'storeB' });
    await expect(
      service.getProductCompositionsForStore('p1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CompositionsService.getProductCompositionsForStore — segurança de custo', () => {
  it('não expõe costPrice nas opções retornadas para a loja pública', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          storeId: 'store-1',
          title: 'X-Bacon',
          price: 25,
          promotionalPrice: null,
          isCustomizable: true,
          isVisible: true,
        }),
      },
      productComposition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pc1',
            sortOrder: 0,
            customMinQuantity: null,
            customMaxQuantity: null,
            customFreeQuantity: null,
            group: {
              id: 'g1',
              name: 'Adicionais',
              description: null,
              minQuantity: 0,
              maxQuantity: 3,
              freeQuantity: 0,
              options: [
                {
                  id: 'o1',
                  name: 'Bacon',
                  description: 'Crocante',
                  imageUrl: null,
                  price: 5,
                  costPrice: 1.8,
                  maxQuantityPerItem: 2,
                  sortOrder: 0,
                },
              ],
            },
          },
        ]),
      },
    };
    const tenant = { getStoreId: jest.fn().mockReturnValue('store-1') };
    const service = new CompositionsService(prisma as never, tenant as never);

    const res = await service.getProductCompositionsForStore('p1');
    expect(res.stages[0].options[0]).not.toHaveProperty('costPrice');
    expect(res.stages[0].options[0].price).toBe(5);
  });
});

describe('CompositionsService — validação minQuantity <= maxQuantity', () => {
  it('bloqueia createGroup quando minQuantity > maxQuantity', async () => {
    const prisma = { compositionGroup: { create: jest.fn() } };
    const tenant = { getStoreId: jest.fn().mockReturnValue('store-1') };
    const service = new CompositionsService(prisma as never, tenant as never);

    await expect(
      service.createGroup({ name: 'Ingredientes', minQuantity: 3, maxQuantity: 1 }),
    ).rejects.toThrow('não pode ser maior que a quantidade máxima');
    expect(prisma.compositionGroup.create).not.toHaveBeenCalled();
  });

  it('bloqueia syncProductCompositions quando override gera min > max', async () => {
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', storeId: 'store-1' }) },
      compositionGroup: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'g1', name: 'Ingredientes', minQuantity: 0, maxQuantity: 2 },
        ]),
      },
      $transaction: jest.fn(),
    };
    const tenant = { getStoreId: jest.fn().mockReturnValue('store-1') };
    const service = new CompositionsService(prisma as never, tenant as never);

    await expect(
      service.syncProductCompositions('p1', {
        groups: [{ groupId: 'g1', customMinQuantity: 3, customMaxQuantity: 1 }],
      }),
    ).rejects.toThrow('não pode ser maior que a quantidade máxima');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
