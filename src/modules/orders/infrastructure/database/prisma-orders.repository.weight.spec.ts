import { PrismaOrdersRepository } from './prisma-orders.repository';
import {
  Order,
  OrderStatus,
  PaymentStatus,
} from '../../domain/entities/order.entity';

/**
 * Item vendido por peso não mexe no estoque em unidades: não trava, não baixa, não devolve no cancelamento.
 * O item por unidade do mesmo pedido continua baixando normalmente.
 */
function makeTx(orderItems: Record<string, unknown>[] = []) {
  const unitItem = { id: 'pi-un', productId: 'p-un', stock: 10, options: [] };
  const tx = {
    productItem: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === 'pi-un' ? unitItem : null),
      ),
      findMany: jest.fn().mockResolvedValue([unitItem]),
      findFirst: jest.fn().mockResolvedValue(unitItem),
      update: jest.fn().mockResolvedValue(unitItem),
    },
    stockMovement: {
      create: jest.fn().mockResolvedValue({ id: 'sm1' }),
      updateMany: jest.fn(),
    },
    product: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    storeSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn(),
    },
    customerAddress: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    combo: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    comboItem: { findMany: jest.fn().mockResolvedValue([]) },
    orderBump: { update: jest.fn() },
    order: {
      create: jest.fn(({ data }: { data: Record<string, any> }) =>
        Promise.resolve({
          id: 'o1',
          orderNumber: 1,
          ...data,
          items: data.items.create,
        }),
      ),
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'o1',
          orderNumber: 1,
          status: 'PENDING',
          items: orderItems,
        }),
      update: jest.fn(({ data }: { data: Record<string, any> }) =>
        Promise.resolve({ id: 'o1', ...data, items: orderItems }),
      ),
    },
    loyaltyRewardRedemption: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const repo = new PrismaOrdersRepository(
    prisma as never,
    { getStoreId: () => 'store-1' } as never,
  );
  return { tx, repo };
}

const order = () =>
  new Order({
    storeId: 'store-1',
    customerName: 'Balcão',
    customerPhone: '',
    itemsTotal: 57.44,
    freight: 0,
    totalOrder: 57.44,
    totalReceived: 0,
    paymentType: 'entrega',
    paymentMethod: 'Dinheiro',
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    items: [
      {
        productId: 'p-kg',
        productItemId: 'pi-kg',
        productName: 'Self-service',
        price: 45.44,
        quantity: 1,
        variation: null,
        weightKg: 0.65,
        unitPricePerKg: 69.9,
        weightSource: 'SCALE',
      },
      {
        productId: 'p-un',
        productItemId: 'pi-un',
        productName: 'Refrigerante',
        price: 6,
        quantity: 2,
        variation: null,
      },
    ] as never,
  });

describe('PrismaOrdersRepository — estoque de item por peso', () => {
  it('venda: só o item por unidade baixa estoque; o peso é gravado no item', async () => {
    const { tx, repo } = makeTx();
    await repo.saveWithStockDecrement(order());

    expect(tx.productItem.update).toHaveBeenCalledTimes(1);
    expect(tx.productItem.update).toHaveBeenCalledWith({
      where: { id: 'pi-un' },
      data: { stock: { decrement: 2 } },
    });

    const created = tx.order.create.mock.calls[0][0].data.items.create;
    expect(created[0]).toMatchObject({
      weightKg: 0.65,
      unitPricePerKg: 69.9,
      weightSource: 'SCALE',
    });
    expect(created[1]).toMatchObject({
      weightKg: null,
      unitPricePerKg: null,
      weightSource: null,
    });
  });

  it('cancelamento: devolve estoque só do item por unidade', async () => {
    const { tx, repo } = makeTx([
      {
        id: 'i1',
        productId: 'p-kg',
        productItemId: 'pi-kg',
        quantity: 1,
        weightKg: '0.650',
        price: '45.44',
      },
      {
        id: 'i2',
        productId: 'p-un',
        productItemId: 'pi-un',
        quantity: 2,
        weightKg: null,
        price: '6',
      },
    ]);
    await repo.cancelAndRestoreStock('o1').catch(() => undefined);

    const increments = tx.productItem.update.mock.calls.filter(
      ([arg]) => arg?.data?.stock?.increment,
    );
    expect(increments).toEqual([
      [{ where: { id: 'pi-un' }, data: { stock: { increment: 2 } } }],
    ]);
  });
});
