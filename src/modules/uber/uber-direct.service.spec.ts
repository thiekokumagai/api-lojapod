import { UberDirectService } from './uber-direct.service';

describe('UberDirectService.processStoreAutomaticDispatch (pedido pago x na entrega)', () => {
  const baseOrder = {
    id: 'o1',
    orderNumber: 10,
    status: 'CONFIRMED',
    deliveryModality: 'DELIVERY',
    uberDeliveryId: null,
  };

  const build = (order: Record<string, unknown>) => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ ...baseOrder, ...order }),
        findMany: jest.fn().mockResolvedValue([{ ...baseOrder, ...order }]),
      },
    };
    const service = new UberDirectService(prisma as never, {} as never);
    jest
      .spyOn(service, 'getStoreUberSettings')
      .mockResolvedValue({ enabled: true, autoDispatch: true } as never);
    const dispatch = jest
      .spyOn(service, 'dispatchUberDelivery')
      .mockResolvedValue({ id: 'uber-1' } as never);
    return { service, prisma, dispatch };
  };

  it('Pix na maquininha (entrega, PENDING) não é despachado como pago', async () => {
    const { service, prisma, dispatch } = build({
      paymentMethod: 'pix',
      paymentType: 'entrega',
      paymentStatus: 'PENDING',
    });

    await expect(
      service.processStoreAutomaticDispatch('store-1', 'o1'),
    ).resolves.toBeNull();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Pix online continua sendo despachado (só ida)', async () => {
    const { service, dispatch } = build({
      paymentMethod: 'pix',
      paymentType: 'online',
      paymentStatus: 'PENDING',
    });

    await service.processStoreAutomaticDispatch('store-1', 'o1');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('pedido PAID continua sendo despachado', async () => {
    const { service, dispatch } = build({
      paymentMethod: 'credit',
      paymentType: 'online',
      paymentStatus: 'PAID',
    });

    await service.processStoreAutomaticDispatch('store-1', 'o1');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('dinheiro na entrega pendente não é despachado', async () => {
    const { service, dispatch } = build({
      paymentMethod: 'cash',
      paymentType: 'entrega',
      paymentStatus: 'PENDING',
    });

    await expect(
      service.processStoreAutomaticDispatch('store-1', 'o1'),
    ).resolves.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
