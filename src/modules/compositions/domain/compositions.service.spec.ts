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
