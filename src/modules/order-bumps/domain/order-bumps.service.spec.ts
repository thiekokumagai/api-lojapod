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
