import { BadRequestException } from '@nestjs/common';
import { CreateOrderUseCase } from './create-order.use-case';
import { UpdateOrderUseCase } from './update-order.use-case';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';

type Fields = Record<string, any>;

const WEIGHED = {
  id: 'p-kg',
  title: 'Self-service',
  price: 69.9,
  promotionalPrice: null,
  costPrice: 30,
  isVisible: true,
  isSoldByWeight: true,
  // Estoque zerado: produto por peso não pode travar por isso
  items: [{ id: 'pi-kg', stock: 0, options: [] }],
};
const UNIT = {
  id: 'p-un',
  title: 'Refrigerante',
  price: 6,
  promotionalPrice: null,
  isVisible: true,
  isSoldByWeight: false,
  items: [{ id: 'pi-un', stock: 10, options: [] }],
};

function events() {
  return {
    notifyNewOrder: jest.fn(),
    notifyOrderUpdated: jest.fn(),
    emitToStore: jest.fn(),
    notifyCatalogRefresh: jest.fn(),
    server: { emit: jest.fn() },
  };
}

function buildCreate() {
  const saveWithStockDecrement = jest
    .fn()
    .mockImplementation((saved: Fields) =>
      Promise.resolve({ ...saved, id: 'o1', items: saved.items ?? [] }),
    );
  const prisma = {
    product: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === WEIGHED.id ? WEIGHED : UNIT),
      ),
    },
    orderBump: { findUnique: jest.fn() },
    combo: { findUnique: jest.fn() },
  };
  const useCase = new CreateOrderUseCase(
    { saveWithStockDecrement } as never,
    { execute: jest.fn() } as never,
    { findById: jest.fn(), update: jest.fn() } as never,
    { sendNotifications: jest.fn() } as never,
    { findAll: jest.fn().mockResolvedValue([]) } as never,
    { emitNovoPedido: jest.fn() } as never,
    events() as never,
    { getStoreId: jest.fn().mockReturnValue('store-1') } as never,
    {
      get: jest
        .fn()
        .mockResolvedValue({
          promoPaymentMethods: ['pix'],
          paymentGateways: {},
          paymentRules: [],
        }),
    } as never,
    prisma as never,
    {} as never,
  );
  return { useCase, saveWithStockDecrement };
}

const weighedItem = (over: Fields = {}) => ({
  productId: WEIGHED.id,
  productName: 'Self-service',
  quantity: 1,
  price: 45.44,
  weightKg: 0.65,
  unitPricePerKg: 69.9,
  weightSource: 'SCALE',
  ...over,
});

const adminOrder = (items: Fields[], itemsTotal: number) => ({
  customerName: 'Balcão',
  customerPhone: '67999990000',
  paymentType: 'entrega',
  paymentMethod: 'Dinheiro',
  deliveryModality: 'STORE_PICKUP',
  itemsTotal,
  freight: 0,
  totalOrder: itemsTotal,
  items,
});

describe('CreateOrderUseCase — venda por peso (PDV)', () => {
  it('grava o peso, o preço por kg e o preço calculado, mesmo com estoque zerado', async () => {
    const { useCase, saveWithStockDecrement } = buildCreate();
    await useCase.execute(adminOrder([weighedItem()], 45.44) as never);

    const saved = saveWithStockDecrement.mock.calls[0][0];
    expect(saved.items[0]).toMatchObject({
      productItemId: 'pi-kg',
      quantity: 1,
      price: 45.44,
      weightKg: 0.65,
      unitPricePerKg: 69.9,
      weightSource: 'SCALE',
    });
  });

  it('duas pesagens do mesmo produto entram como dois itens', async () => {
    const { useCase, saveWithStockDecrement } = buildCreate();
    await useCase.execute(
      adminOrder(
        [
          weighedItem(),
          weighedItem({ weightKg: 0.3, price: 20.97, weightSource: 'MANUAL' }),
        ],
        66.41,
      ) as never,
    );
    const items = saveWithStockDecrement.mock.calls[0][0].items;
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      weightKg: 0.3,
      price: 20.97,
      weightSource: 'MANUAL',
    });
  });

  it('valor do item alterado no envio é recusado', async () => {
    const { useCase, saveWithStockDecrement } = buildCreate();
    await expect(
      useCase.execute(adminOrder([weighedItem({ price: 5 })], 5) as never),
    ).rejects.toThrow(BadRequestException);
    expect(saveWithStockDecrement).not.toHaveBeenCalled();
  });

  it('produto por peso sem peso é recusado', async () => {
    const { useCase } = buildCreate();
    await expect(
      useCase.execute(
        adminOrder([weighedItem({ weightKg: undefined })], 45.44) as never,
      ),
    ).rejects.toThrow(/Informe o peso/);
  });

  it('pedido da loja virtual não aceita produto por peso', async () => {
    const { useCase } = buildCreate();
    await expect(
      useCase.execute(adminOrder([weighedItem()], 45.44) as never, {
        publicOrder: true,
      }),
    ).rejects.toThrow(/só pode ser pedido no balcão/);
  });

  it('item por unidade nunca grava peso vindo da tela', async () => {
    const { useCase, saveWithStockDecrement } = buildCreate();
    await useCase.execute(
      adminOrder(
        [
          {
            productId: UNIT.id,
            productName: 'Refrigerante',
            quantity: 2,
            price: 6,
            weightKg: 5,
            weightSource: 'SCALE',
          },
        ],
        12,
      ) as never,
    );
    expect(saveWithStockDecrement.mock.calls[0][0].items[0]).toMatchObject({
      quantity: 2,
      weightKg: null,
      unitPricePerKg: null,
      weightSource: null,
    });
  });
});

describe('UpdateOrderUseCase — venda por peso (Editar Pedido)', () => {
  function buildUpdate() {
    const existing = new Order({
      id: 'o1',
      storeId: 'store-1',
      orderNumber: 7,
      customerName: 'Balcão',
      customerPhone: '67999990000',
      itemsTotal: 45.44,
      freight: 0,
      totalOrder: 45.44,
      totalReceived: 0,
      paymentType: 'entrega',
      paymentMethod: 'Dinheiro',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      items: [
        {
          ...weighedItem(),
          id: 'i1',
          orderId: 'o1',
          productItemId: 'pi-kg',
          variation: null,
        } as never,
      ],
    });
    const updateWithStockAdjustment = jest
      .fn()
      .mockImplementation((_id: string, o: Order) => Promise.resolve(o));
    const prisma = {
      product: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === WEIGHED.id ? WEIGHED : UNIT),
        ),
      },
    };
    const useCase = new UpdateOrderUseCase(
      {
        findById: jest.fn().mockResolvedValue(existing),
        updateWithStockAdjustment,
      } as never,
      { execute: jest.fn() } as never,
      { findById: jest.fn(), update: jest.fn() } as never,
      { emitNovoPedido: jest.fn() } as never,
      events() as never,
      { getStoreId: jest.fn().mockReturnValue('store-1') } as never,
      {
        get: jest.fn().mockResolvedValue({ promoPaymentMethods: ['pix'] }),
      } as never,
      prisma as never,
    );
    return { useCase, updateWithStockAdjustment };
  }
  const user = { storeId: 'store-1', role: 'ADMIN' };

  it('nova pesagem enviada na edição é conferida e gravada', async () => {
    const { useCase, updateWithStockAdjustment } = buildUpdate();
    await useCase.execute(
      'o1',
      {
        items: [weighedItem({ weightKg: 1, price: 69.9 })] as never,
        itemsTotal: 69.9,
        totalOrder: 69.9,
      },
      user,
    );
    expect(updateWithStockAdjustment.mock.calls[0][1].items[0]).toMatchObject({
      weightKg: 1,
      price: 69.9,
    });
  });

  it('valor alterado na edição é recusado', async () => {
    const { useCase, updateWithStockAdjustment } = buildUpdate();
    await expect(
      useCase.execute(
        'o1',
        { items: [weighedItem({ weightKg: 1, price: 1 })] as never },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(updateWithStockAdjustment).not.toHaveBeenCalled();
  });

  it('edição sem reenviar os itens mantém o peso gravado', async () => {
    const { useCase, updateWithStockAdjustment } = buildUpdate();
    await useCase.execute('o1', { observation: 'sem talher' }, user);
    expect(updateWithStockAdjustment.mock.calls[0][1].items[0]).toMatchObject({
      weightKg: 0.65,
      price: 45.44,
    });
  });
});
