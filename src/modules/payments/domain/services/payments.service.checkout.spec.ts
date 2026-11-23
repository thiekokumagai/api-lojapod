import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

function makeService(
  order: Record<string, unknown> | null,
  gateways: Record<string, unknown> = {},
) {
  const createCreditCardCheckout = jest.fn().mockResolvedValue({
    checkoutUrl: 'https://checkout.infinitepay.io/novo-link',
    transactionId: 'tx-new',
  });
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({}),
    },
    storeSettings: {
      findFirst: jest.fn().mockResolvedValue({ paymentGateways: gateways }),
    },
  };
  const gatewayFactory = {
    getGateway: jest.fn().mockReturnValue({ createCreditCardCheckout }),
  };

  const service = new PaymentsService(
    prisma as never,
    gatewayFactory as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, prisma, gatewayFactory, createCreditCardCheckout };
}

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  storeId: 'store-1',
  orderNumber: 42,
  totalOrder: 100,
  freight: 0,
  cardFee: 0,
  receiptSurcharge: 0,
  installmentSurcharge: 0,
  customerName: 'Maria',
  customerPhone: '67999999999',
  paymentType: 'online',
  paymentMethod: 'credit',
  paymentStatus: 'PENDING',
  status: 'PENDING',
  onlineGateway: 'INFINITEPAY',
  gatewayCheckoutUrl: null,
  gatewayTransactionId: null,
  items: [{ productName: 'Item 1', quantity: 1, price: 100 }],
  ...overrides,
});

const infinitepayGateways = {
  infinitepay: { enabled: true, acceptCreditCard: true, handle: 'minhaloja' },
};

describe('PaymentsService.createOnlineCheckout (segurança e reuso de link)', () => {
  it('rejeita pedido de outra loja (storeId diferente)', async () => {
    const { service } = makeService(
      baseOrder({ storeId: 'store-2' }),
      infinitepayGateways,
    );
    await expect(
      service.createOnlineCheckout('order-1', 'store-1', 'https://loja.com'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejeita pedido já pago (PAID)', async () => {
    const { service } = makeService(
      baseOrder({ paymentStatus: 'PAID' }),
      infinitepayGateways,
    );
    await expect(
      service.createOnlineCheckout('order-1', 'store-1', 'https://loja.com'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita pedido cancelado (CANCELLED)', async () => {
    const { service } = makeService(
      baseOrder({ status: 'CANCELLED' }),
      infinitepayGateways,
    );
    await expect(
      service.createOnlineCheckout('order-1', 'store-1', 'https://loja.com'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita pedido que não é pagamento online (paymentType = entrega)', async () => {
    const { service } = makeService(
      baseOrder({ paymentType: 'entrega' }),
      infinitepayGateways,
    );
    await expect(
      service.createOnlineCheckout('order-1', 'store-1', 'https://loja.com'),
    ).rejects.toThrow(BadRequestException);
  });

  it('reaproveita gatewayCheckoutUrl HTTPS já salvo para o mesmo provedor', async () => {
    const { service, createCreditCardCheckout } = makeService(
      baseOrder({
        gatewayCheckoutUrl: 'https://checkout.infinitepay.io/salvo',
        gatewayTransactionId: 'tx-salvo',
      }),
      infinitepayGateways,
    );

    const res = await service.createOnlineCheckout(
      'order-1',
      'store-1',
      'https://loja.com',
    );
    expect(res).toEqual({
      checkoutUrl: 'https://checkout.infinitepay.io/salvo',
      transactionId: 'tx-salvo',
    });
    expect(createCreditCardCheckout).not.toHaveBeenCalled();
  });

  it('gera novo link InfinitePay quando ainda não há gatewayCheckoutUrl salvo', async () => {
    const { service, createCreditCardCheckout, prisma } = makeService(
      baseOrder(),
      infinitepayGateways,
    );

    const res = await service.createOnlineCheckout(
      'order-1',
      'store-1',
      'https://loja.com',
    );
    expect(res.checkoutUrl).toBe('https://checkout.infinitepay.io/novo-link');
    expect(createCreditCardCheckout).toHaveBeenCalledTimes(1);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        onlineGateway: 'INFINITEPAY',
        gatewayTransactionId: 'tx-new',
        gatewayCheckoutUrl: 'https://checkout.infinitepay.io/novo-link',
      },
    });
  });
});
