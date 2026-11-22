import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdateOrderUseCase } from './update-order.use-case';
import { Order } from '../entities/order.entity';

describe('UpdateOrderUseCase — saneamento de personalização (update-full)', () => {
  const makeMocks = () => {
    const existingOrder = new Order({
      id: 'order-1',
      storeId: 'store-1',
      status: 'PENDING',
      customerName: 'Cliente',
      customerPhone: '67999999999',
      itemsTotal: 30,
      freight: 0,
      totalOrder: 30,
      items: [],
    });

    const ordersRepository = {
      findById: jest.fn().mockResolvedValue(existingOrder),
      updateWithStockAdjustment: jest
        .fn()
        .mockImplementation(async (_id: string, order: Order) => order),
    };
    const validateCouponUseCase = { execute: jest.fn() };
    const couponsRepository = { findById: jest.fn(), update: jest.fn() };
    const printGateway = { emitNovoPedido: jest.fn() };
    const eventsGateway = {
      notifyNewOrder: jest.fn(),
      server: { emit: jest.fn() },
    };
    const tenantContextService = { getStoreId: jest.fn().mockReturnValue('store-1') };
    const settingsRepository = { get: jest.fn().mockResolvedValue(null) };
    const prisma = {
      product: { findFirst: jest.fn() },
      compositionOption: { findMany: jest.fn() },
      productComposition: { findMany: jest.fn() },
    };

    const useCase = new UpdateOrderUseCase(
      ordersRepository as any,
      validateCouponUseCase as any,
      couponsRepository as any,
      printGateway as any,
      eventsGateway as any,
      tenantContextService as any,
      settingsRepository as any,
      prisma as any,
    );

    return { useCase, ordersRepository, prisma };
  };

  it('combo descarta isCustomized e customizationSnapshot enviados no payload', async () => {
    const { useCase, ordersRepository } = makeMocks();

    const saved = await useCase.execute('order-1', {
      items: [
        {
          id: 'i-1',
          isCombo: true,
          comboId: 'combo-1',
          productTitle: 'Combo Festa',
          quantity: 1,
          unitPrice: 50,
          totalPrice: 50,
          isCustomized: true,
          customizationSnapshot: {
            stages: [{ options: [{ optionId: 'fake', name: 'Picanha grátis', quantity: 3 }] }],
          },
        } as any,
      ],
      itemsTotal: 50,
    });

    expect(ordersRepository.updateWithStockAdjustment).toHaveBeenCalledTimes(1);
    const savedItem = saved.items![0];
    expect(savedItem.isCustomized).toBe(false);
    expect(savedItem.customizationSnapshot).toBeUndefined();
  });

  it('item sem isCustomized ou sem productId limpa customizationSnapshot', async () => {
    const { useCase } = makeMocks();

    const saved = await useCase.execute('order-1', {
      items: [
        {
          id: 'i-2',
          productId: 'prod-1',
          productTitle: 'Refrigerante',
          quantity: 1,
          unitPrice: 8,
          totalPrice: 8,
          isCustomized: false,
          customizationSnapshot: { hacked: true },
        } as any,
      ],
      itemsTotal: 8,
    });

    expect(saved.items![0].isCustomized).toBe(false);
    expect(saved.items![0].customizationSnapshot).toBeUndefined();
  });

  it('produto personalizado válido mantém snapshot saneado pelo banco (sobrescrevendo nome/preço do payload)', async () => {
    const { useCase, prisma } = makeMocks();

    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-acai',
      storeId: 'store-1',
      title: 'Açaí 500ml',
      price: 20,
      isCustomizable: true,
    });
    prisma.compositionOption.findMany.mockResolvedValue([
      {
        id: 'opt-granola',
        groupId: 'grp-1',
        name: 'Granola Real',
        price: 3.5,
        maxQuantityPerItem: 2,
        sortOrder: 1,
        group: { id: 'grp-1', name: 'Acompanhamentos', maxQuantity: 3, freeQuantity: 0 },
      },
    ]);
    prisma.productComposition.findMany.mockResolvedValue([
      {
        productId: 'prod-acai',
        groupId: 'grp-1',
        sortOrder: 0,
        customMaxQuantity: null,
        customFreeQuantity: null,
        group: { id: 'grp-1', name: 'Acompanhamentos', maxQuantity: 3, freeQuantity: 0 },
      },
    ]);

    const saved = await useCase.execute('order-1', {
      items: [
        {
          id: 'i-3',
          productId: 'prod-acai',
          productTitle: 'Açaí 500ml',
          quantity: 1,
          unitPrice: 23.5,
          totalPrice: 23.5,
          isCustomized: true,
          customizationSnapshot: {
            stages: [
              {
                groupId: 'forged-group',
                groupName: 'Grupo Falso',
                options: [
                  {
                    optionId: 'opt-granola',
                    name: 'Nome Adulterado',
                    quantity: 1,
                    unitPrice: 0,
                    totalPrice: 0,
                  },
                ],
              },
            ],
          },
        } as any,
      ],
      itemsTotal: 23.5,
    });

    const snap = saved.items![0].customizationSnapshot as any;
    expect(saved.items![0].isCustomized).toBe(true);
    expect(snap).toEqual({
      basePrice: 20,
      stages: [
        {
          groupId: 'grp-1',
          groupName: 'Acompanhamentos',
          options: [
            {
              optionId: 'opt-granola',
              name: 'Granola Real',
              quantity: 1,
              unitPrice: 3.5,
              totalPrice: 3.5,
              unitCost: 0,
              totalCost: 0,
            },
          ],
        },
      ],
      totalAdditions: 3.5,
      totalCost: 0,
      finalUnitPrice: 23.5,
    });
  });

  it('opção inventada/adulterada é rejeitada e nunca gravada crua', async () => {
    const { useCase, ordersRepository, prisma } = makeMocks();

    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-acai',
      storeId: 'store-1',
      title: 'Açaí 500ml',
      price: 20,
      isCustomizable: true,
    });
    prisma.compositionOption.findMany.mockResolvedValue([]);
    prisma.productComposition.findMany.mockResolvedValue([]);

    await expect(
      useCase.execute('order-1', {
        items: [
          {
            id: 'i-4',
            productId: 'prod-acai',
            productTitle: 'Açaí 500ml',
            quantity: 1,
            unitPrice: 20,
            totalPrice: 20,
            isCustomized: true,
            customizationSnapshot: {
              stages: [
                {
                  options: [{ optionId: 'opt-inventada', name: 'Picanha Grátis', quantity: 1 }],
                },
              ],
            },
          } as any,
        ],
        itemsTotal: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ordersRepository.updateWithStockAdjustment).not.toHaveBeenCalled();
  });
});

describe('UpdateOrderUseCase — isolamento por loja (tenant / IDOR)', () => {
  const makeTenantSetup = (orderStoreId: string) => {
    const existingOrder = new Order({
      id: 'order-b',
      storeId: orderStoreId,
      status: 'PENDING',
      customerName: 'Cliente Loja B',
      customerPhone: '67999999999',
      itemsTotal: 40,
      freight: 0,
      totalOrder: 40,
      items: [],
    });

    const ordersRepository = {
      findById: jest.fn().mockImplementation(async (_id: string, storeFilter?: string) => {
        if (storeFilter && storeFilter !== existingOrder.storeId) {
          return null;
        }
        return existingOrder;
      }),
      updateWithStockAdjustment: jest
        .fn()
        .mockImplementation(async (_id: string, order: Order) => order),
    };
    const validateCouponUseCase = { execute: jest.fn() };
    const couponsRepository = { findById: jest.fn(), update: jest.fn() };
    const printGateway = { emitNovoPedido: jest.fn() };
    const eventsGateway = {
      notifyNewOrder: jest.fn(),
      server: { emit: jest.fn() },
    };
    const tenantContextService = { getStoreId: jest.fn().mockReturnValue('store-A') };
    const settingsRepository = { get: jest.fn().mockResolvedValue(null) };
    const prisma = {
      product: { findFirst: jest.fn() },
      compositionOption: { findMany: jest.fn() },
      productComposition: { findMany: jest.fn() },
    };

    const useCase = new UpdateOrderUseCase(
      ordersRepository as any,
      validateCouponUseCase as any,
      couponsRepository as any,
      printGateway as any,
      eventsGateway as any,
      tenantContextService as any,
      settingsRepository as any,
      prisma as any,
    );

    return { useCase, ordersRepository, printGateway, eventsGateway };
  };

  it('ADMIN da Loja A tentando editar pedido PENDING da Loja B (mesmo com storeId da Loja B no corpo) é rejeitado sem alterar pedido/estoque', async () => {
    const { useCase, ordersRepository, printGateway } = makeTenantSetup('store-B');

    await expect(
      useCase.execute(
        'order-b',
        { storeId: 'store-B', itemsTotal: 1, items: [] } as any,
        { role: 'ADMIN', storeId: 'store-A' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(ordersRepository.findById).toHaveBeenCalledWith('order-b', 'store-A');
    expect(ordersRepository.updateWithStockAdjustment).not.toHaveBeenCalled();
    expect(printGateway.emitNovoPedido).not.toHaveBeenCalled();
  });

  it('USER da Loja A tentando editar pedido PENDING da Loja B é rejeitado mesmo se repositório ignorar storeFilter', async () => {
    const { useCase, ordersRepository, printGateway } = makeTenantSetup('store-B');
    // Simula repositório devolvendo o registro sem filtrar: defesa em profundidade no use-case bloqueia
    ordersRepository.findById.mockResolvedValueOnce(
      new Order({ id: 'order-b', storeId: 'store-B', status: 'PENDING' }),
    );

    await expect(
      useCase.execute(
        'order-b',
        { storeId: 'store-B', itemsTotal: 1, items: [] } as any,
        { role: 'USER', storeId: 'store-A' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(ordersRepository.updateWithStockAdjustment).not.toHaveBeenCalled();
    expect(printGateway.emitNovoPedido).not.toHaveBeenCalled();
  });

  it('ADMIN editando pedido da própria loja é permitido e ignora data.storeId adulterado', async () => {
    const { useCase, ordersRepository } = makeTenantSetup('store-A');

    const saved = await useCase.execute(
      'order-b',
      { storeId: 'store-B', itemsTotal: 45, items: [] } as any,
      { role: 'ADMIN', storeId: 'store-A' },
    );

    expect(ordersRepository.findById).toHaveBeenCalledWith('order-b', 'store-A');
    expect(ordersRepository.updateWithStockAdjustment).toHaveBeenCalledTimes(1);
    expect(saved.storeId).toBe('store-A');
  });

  it('SUPER_ADMIN editando pedido PENDING (padrão de cancel-order.use-case.ts) é permitido preservando storeId do pedido', async () => {
    const { useCase, ordersRepository } = makeTenantSetup('store-B');

    const saved = await useCase.execute(
      'order-b',
      { storeId: 'store-A', itemsTotal: 50, items: [] } as any,
      { role: 'SUPER_ADMIN', storeId: null },
    );

    expect(ordersRepository.findById).toHaveBeenCalledWith('order-b', undefined);
    expect(ordersRepository.updateWithStockAdjustment).toHaveBeenCalledTimes(1);
    expect(saved.storeId).toBe('store-B');
  });
});
