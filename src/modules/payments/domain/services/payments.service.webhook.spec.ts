import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { EventsGateway } from '../../../events/events.gateway';
import { PrintGateway } from '../../../print/print.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';

// Sem rede e sem banco: o provedor (InfinitePay), o Prisma e os avisos são mocks.
const order = (extra: Record<string, unknown> = {}) => ({
  id: 'order-1',
  orderNumber: 77,
  storeId: 'store-1',
  status: 'PENDING',
  paymentStatus: 'PENDING',
  onlineGateway: 'INFINITEPAY',
  gatewayTransactionId: null,
  totalOrder: 100,
  customerName: 'Ana',
  customerPhone: '1',
  items: [],
  ...extra,
});

function setup(found: Record<string, unknown> | null = order()) {
  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(found),
      findUnique: jest.fn().mockResolvedValue(found),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storeSettings: {
      findFirst: jest.fn().mockResolvedValue({
        paymentGateways: {
          infinitepay: { enabled: true, handle: 'loja-x', apiKey: 'k' },
        },
      }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const checkPayment = jest.fn().mockResolvedValue({ paid: false });
  const factory = { getGateway: jest.fn().mockReturnValue({ checkPayment }) };
  const events = { server: { emit: jest.fn() }, notifyOrderStatus: jest.fn() };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    factory as unknown as PaymentGatewayFactory,
    events as unknown as EventsGateway,
    {} as PrintGateway,
    { processOrderCompleted: jest.fn() } as unknown as LoyaltyService,
    { sendNotifications: jest.fn() } as unknown as PushNotificationService,
  );
  return { service, prisma, checkPayment, factory, events };
}

const query = { storeId: 'store-1', orderId: 'order-1' };

describe('A: webhook genérico não confia no corpo da notificação', () => {
  it('provedor desconhecido (qualquer nome) é recusado sem tocar no banco', async () => {
    const { service, prisma } = setup();
    for (const provider of ['qualquer', 'stripe', 'asaas', '']) {
      await expect(
        service.handleWebhook(provider, { status: 'paid' }, query),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('Mercado Pago não passa por aqui (tem endpoint com assinatura)', async () => {
    const { service, prisma } = setup();
    await expect(
      service.handleWebhook('mercadopago', { status: 'paid' }, query),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('corpo forjado "paid" NÃO paga: quem decide é a InfinitePay, que diz não pago', async () => {
    const { service, prisma, checkPayment } = setup();
    checkPayment.mockResolvedValue({ paid: false });

    const result = await service.handleWebhook(
      'infinitepay',
      {
        paid: true,
        status: 'paid',
        event: 'payment.paid',
        transaction_nsu: 'falso',
        invoice_slug: 'falso',
      },
      query,
    );

    expect(checkPayment).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      message: expect.stringContaining('sem alteração'),
    });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('InfinitePay confirma o pagamento: marca como pago, consultando com as credenciais DA LOJA do pedido', async () => {
    const { service, prisma, checkPayment } = setup();
    checkPayment.mockResolvedValue({
      paid: true,
      amount: 100,
      paidAmount: 103,
      installments: 3,
      transactionId: 'nsu-9',
    });

    const result = await service.handleWebhook(
      'InfinitePay',
      { transaction_nsu: 'nsu-9', invoice_slug: 'slug-9' },
      query,
    );

    expect(checkPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        orderNumber: 77,
        transactionNsu: 'nsu-9',
        slug: 'slug-9',
        expectedAmount: 100,
        credentials: expect.objectContaining({ handle: 'loja-x' }),
      }),
    );
    expect(prisma.storeSettings.findFirst).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', paymentStatus: 'PENDING' },
      data: expect.objectContaining({
        paymentStatus: 'PAID',
        installments: 3,
        gatewayTransactionId: 'nsu-9',
      }),
    });
    expect(result).toMatchObject({ success: true, status: 'PAID' });
  });

  it('valor confirmado pelo provedor diferente do pedido: NÃO marca como pago', async () => {
    const { service, prisma, checkPayment } = setup();
    checkPayment.mockResolvedValue({ paid: true, amount: 1 });

    const result = await service.handleWebhook('infinitepay', {}, query);

    expect(result).toMatchObject({ success: true });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('pedido é buscado por id + loja; pedido de outra loja não é encontrado nem consultado', async () => {
    const { service, prisma, checkPayment } = setup(null);

    const result = await service.handleWebhook(
      'infinitepay',
      { status: 'paid' },
      query,
    );

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', storeId: 'store-1' },
    });
    expect(result).toMatchObject({ success: false });
    expect(checkPayment).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('número do pedido só vale junto com a loja (nunca findFirst por orderNumber solto)', async () => {
    const { service, prisma } = setup();
    await service.handleWebhook(
      'infinitepay',
      { order_nsu: '77' },
      { storeId: 'store-1' },
    );
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { orderNumber: 77, storeId: 'store-1' },
    });
  });

  it('sem loja na notificação, ou sem pedido identificável: ignora sem consultar o banco', async () => {
    const { service, prisma } = setup();
    expect(
      await service.handleWebhook(
        'infinitepay',
        { order_nsu: '77', status: 'paid' },
        {},
      ),
    ).toMatchObject({ success: false });
    expect(
      await service.handleWebhook('infinitepay', {}, { storeId: 'store-1' }),
    ).toMatchObject({ success: false });
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('pedido já pago não consulta o provedor de novo; pedido de outro provedor é ignorado', async () => {
    const paid = setup(order({ paymentStatus: 'PAID' }));
    expect(
      await paid.service.handleWebhook('infinitepay', {}, query),
    ).toMatchObject({ success: true, message: 'Pedido já marcado como pago' });
    expect(paid.checkPayment).not.toHaveBeenCalled();

    const other = setup(order({ onlineGateway: 'MERCADOPAGO' }));
    expect(
      await other.service.handleWebhook(
        'infinitepay',
        { status: 'paid' },
        query,
      ),
    ).toMatchObject({ success: false });
    expect(other.checkPayment).not.toHaveBeenCalled();
    expect(other.prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('loja sem credenciais da InfinitePay não paga ninguém', async () => {
    const { service, prisma, checkPayment } = setup();
    prisma.storeSettings.findFirst.mockResolvedValue({ paymentGateways: {} });
    await service.handleWebhook('infinitepay', { status: 'paid' }, query);
    expect(checkPayment).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

describe('verificação ativa (check-status)', () => {
  it('pedido de outra loja responde como inexistente', async () => {
    const { service, checkPayment } = setup(order({ storeId: 'outra-loja' }));
    await expect(
      service.checkOrderStatus('order-1', 'store-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(checkPayment).not.toHaveBeenCalled();
  });

  it('também confere o valor confirmado pelo provedor', async () => {
    const { service, prisma, checkPayment } = setup();
    checkPayment.mockResolvedValue({ paid: true, amount: 5 });
    const result = await service.checkOrderStatus('order-1', 'store-1');
    expect(result.paid).toBe(false);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('provedor confirma com valor certo: marca como pago', async () => {
    const { service, prisma, checkPayment } = setup();
    checkPayment.mockResolvedValue({
      paid: true,
      amount: 100,
      transactionId: 'x',
    });
    const result = await service.checkOrderStatus('order-1', 'store-1');
    expect(result.paid).toBe(true);
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
  });
});
