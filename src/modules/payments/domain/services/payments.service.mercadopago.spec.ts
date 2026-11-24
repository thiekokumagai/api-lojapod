import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { MercadoPagoAdapter } from '../../infrastructure/adapters/mercadopago.adapter';
import { MercadoPagoClient } from '../../infrastructure/adapters/mercadopago.client';
import { EventsGateway } from '../../../events/events.gateway';
import { PrintGateway } from '../../../print/print.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';

// Sem rede e sem banco: tudo mock.
function build(updateManyCount: number) {
  const order = {
    id: 'o1',
    orderNumber: 5,
    storeId: 's1',
    status: 'PENDING',
    paymentStatus: 'PAID',
    totalOrder: 100,
    customerName: 'Ana',
    customerPhone: '1',
    items: [],
  };
  const prisma = {
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
      findUnique: jest.fn().mockResolvedValue(order),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const eventsGateway = {
    server: { emit: jest.fn() },
    notifyOrderStatus: jest.fn(),
    notifyOrderUpdated: jest.fn(),
  };
  const loyalty = {
    processOrderCompleted: jest.fn().mockResolvedValue(undefined),
  };
  const client = { getPayment: jest.fn() };
  const factory = new PaymentGatewayFactory(
    {} as never,
    new MercadoPagoAdapter(client as unknown as MercadoPagoClient),
  );
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    factory,
    eventsGateway as unknown as EventsGateway,
    {} as PrintGateway,
    loyalty as unknown as LoyaltyService,
    { sendNotifications: jest.fn() } as unknown as PushNotificationService,
  );
  return { service, prisma, eventsGateway, loyalty, client };
}

describe('PaymentsService e o Mercado Pago', () => {
  it('o caminho genérico de webhook (sem assinatura) recusa o Mercado Pago', async () => {
    const { service, prisma } = build(1);
    await expect(
      service.handleWebhook(
        'mercadopago',
        { status: 'approved', paid: true },
        { orderId: 'o1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('markPaidAndAnnounce só anuncia uma vez: a segunda chamada (webhook duplicado) não repete nada', async () => {
    const first = build(1);
    await first.service.markPaidAndAnnounce(
      'o1',
      { paymentStatus: 'PAID' },
      'teste',
    );
    expect(first.eventsGateway.notifyOrderUpdated).toHaveBeenCalledTimes(1);
    expect(first.loyalty.processOrderCompleted).toHaveBeenCalledTimes(1);

    // outro processo já tinha marcado como pago: count 0
    const second = build(0);
    await second.service.markPaidAndAnnounce(
      'o1',
      { paymentStatus: 'PAID' },
      'teste',
    );
    expect(second.prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', paymentStatus: 'PENDING' },
      data: { paymentStatus: 'PAID' },
    });
    expect(second.eventsGateway.notifyOrderUpdated).not.toHaveBeenCalled();
    expect(second.loyalty.processOrderCompleted).not.toHaveBeenCalled();
  });

  describe('verificação ativa pelo adapter do Mercado Pago', () => {
    const adapterWith = (payment: Record<string, unknown>) => {
      const client = { getPayment: jest.fn().mockResolvedValue(payment) };
      return new MercadoPagoAdapter(client as unknown as MercadoPagoClient);
    };
    const input = {
      orderId: 'o1',
      orderNumber: 5,
      transactionNsu: '99',
      credentials: { accessToken: 'TEST-token' },
      expectedAmount: 100,
    };

    it('só considera pago se aprovado, do pedido e com o valor exato', async () => {
      const ok = await adapterWith({
        id: 99,
        status: 'approved',
        transaction_amount: 100,
        external_reference: 'o1',
      }).checkPayment(input);
      expect(ok.paid).toBe(true);

      for (const bad of [
        {
          id: 99,
          status: 'pending',
          transaction_amount: 100,
          external_reference: 'o1',
        },
        {
          id: 99,
          status: 'approved',
          transaction_amount: 1,
          external_reference: 'o1',
        },
        {
          id: 99,
          status: 'approved',
          transaction_amount: 100,
          external_reference: 'outro-pedido',
        },
      ]) {
        expect((await adapterWith(bad).checkPayment(input)).paid).toBe(false);
      }
      expect(
        (
          await adapterWith({
            id: 99,
            status: 'approved',
            transaction_amount: 100,
            external_reference: 'o1',
          }).checkPayment({ ...input, expectedAmount: undefined })
        ).paid,
      ).toBe(false);
    });

    it('falha ao consultar o Mercado Pago não derruba nada: segue como não pago', async () => {
      const client = {
        getPayment: jest.fn().mockRejectedValue(new Error('timeout')),
      };
      const result = await new MercadoPagoAdapter(
        client as unknown as MercadoPagoClient,
      ).checkPayment(input);
      expect(result.paid).toBe(false);
    });
  });
});
