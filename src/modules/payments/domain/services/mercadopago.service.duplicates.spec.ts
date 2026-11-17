import { ConflictException, HttpException, Logger } from '@nestjs/common';
import { MercadoPagoService, resetCardAttempts } from './mercadopago.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import {
  MercadoPagoClient,
  MercadoPagoPayment,
} from '../../infrastructure/adapters/mercadopago.client';
import {
  buildMercadoPagoManifest,
  signMercadoPagoManifest,
} from '../utils/mercadopago-signature';

// Sem rede e sem banco: cliente do Mercado Pago, Prisma e PaymentsService são mocks.
const SECRET = 'segredo-do-webhook';
const gateways = {
  mercadopago: {
    enabled: true,
    acceptPix: true,
    acceptCreditCard: true,
    publicKey: 'TEST-public',
    accessToken: 'TEST-access-token',
    webhookSecret: SECRET,
    maxInstallments: 6,
    pixExpirationMinutes: 30,
  },
};

const baseOrder = {
  id: 'order-1',
  orderNumber: 77,
  storeId: 'store-1',
  status: 'PENDING',
  paymentStatus: 'PENDING',
  paymentType: 'online',
  paymentMethod: 'credit',
  customerName: 'Maria Souza',
  itemsTotal: 90,
  freight: 10,
  installmentSurcharge: 0,
  receiptSurcharge: 0,
  paymentDiscount: 0,
  receiptDiscount: 0,
  couponDiscount: 0,
  couponFreightDiscount: 0,
  totalOrder: 100,
  onlineGateway: null as string | null,
  gatewayTransactionId: null as string | null,
};

const payment = (
  overrides: Partial<MercadoPagoPayment> = {},
): MercadoPagoPayment => ({
  id: 555,
  status: 'approved',
  status_detail: 'accredited',
  transaction_amount: 100,
  external_reference: 'order-1',
  installments: 1,
  payment_method_id: 'visa',
  ...overrides,
});

function setup(order: Partial<typeof baseOrder> = {}) {
  const row = { ...baseOrder, ...order };
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storeSettings: {
      findFirst: jest.fn().mockResolvedValue({ paymentGateways: gateways }),
    },
  };
  const client = { createPayment: jest.fn(), getPayment: jest.fn() };
  const payments = { markPaidAndAnnounce: jest.fn().mockResolvedValue({}) };
  const service = new MercadoPagoService(
    prisma as unknown as PrismaService,
    client as unknown as MercadoPagoClient,
    payments as unknown as PaymentsService,
  );
  return { service, prisma, client, payments };
}

const dto = { token: 'tok_abc', installments: 1, paymentMethodId: 'visa' };

const signedWebhook = (dataId: string) => {
  const ts = String(Date.now());
  return {
    'x-request-id': 'req-1',
    'x-signature': `ts=${ts},v1=${signMercadoPagoManifest(buildMercadoPagoManifest(dataId, 'req-1', ts), SECRET)}`,
  };
};

let errorLog: jest.SpyInstance;
beforeEach(() => {
  resetCardAttempts();
  errorLog = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('E: cobrança duplicada', () => {
  it('webhook: 2º pagamento aprovado em pedido já pago registra erro com os DOIS ids e não paga nem anuncia de novo', async () => {
    const { service, client, payments } = setup({
      paymentStatus: 'PAID',
      gatewayTransactionId: '111',
    });
    client.getPayment.mockResolvedValue(payment({ id: 222 }));

    const result = await service.handleWebhook(
      { storeId: 'store-1', 'data.id': '222', type: 'payment' },
      signedWebhook('222'),
      undefined,
    );

    expect(result).toMatchObject({
      applied: false,
      reason: 'duplicate_payment',
    });
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
    const message = String(errorLog.mock.calls[0][0]);
    expect(message).toContain('COBRANÇA DUPLICADA');
    expect(message).toContain('111');
    expect(message).toContain('222');
  });

  it('webhook repetido do MESMO pagamento não é duplicidade', async () => {
    const { service, client } = setup({
      paymentStatus: 'PAID',
      gatewayTransactionId: '987',
    });
    client.getPayment.mockResolvedValue(payment({ id: 987 }));

    const result = await service.handleWebhook(
      { storeId: 'store-1', 'data.id': '987', type: 'payment' },
      signedWebhook('987'),
      undefined,
    );

    expect(result).toMatchObject({ reason: 'already_paid' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('cartão aprovado em pedido que já constava pago por outro pagamento registra a cobrança duplicada', async () => {
    const { service, client, prisma } = setup();
    client.createPayment.mockResolvedValue(payment({ id: 555 }));
    // 1ª leitura: pedido pendente (para cobrar); 2ª leitura: já pago por outro pagamento
    prisma.order.findUnique
      .mockResolvedValueOnce({ ...baseOrder })
      .mockResolvedValueOnce({
        paymentStatus: 'PAID',
        gatewayTransactionId: '111',
      });

    await service.createCard('order-1', 'store-1', dto);

    const message = String(errorLog.mock.calls[0][0]);
    expect(message).toContain('COBRANÇA DUPLICADA');
    expect(message).toContain('111');
    expect(message).toContain('555');
  });

  it('cartão aprovado normal não registra duplicidade', async () => {
    const { service, client, prisma } = setup();
    client.createPayment.mockResolvedValue(payment({ id: 555 }));
    prisma.order.findUnique
      .mockResolvedValueOnce({ ...baseOrder })
      .mockResolvedValueOnce({
        paymentStatus: 'PAID',
        gatewayTransactionId: '555',
      });

    await service.createCard('order-1', 'store-1', dto);

    expect(errorLog).not.toHaveBeenCalled();
  });
});

describe('E: pagamento em análise e tentativas de cartão', () => {
  it('recusa nova tentativa enquanto o pagamento anterior está em análise, sem chamar o MP', async () => {
    const { service, client } = setup({
      onlineGateway: 'MERCADOPAGO',
      gatewayTransactionId: '300',
    });
    client.getPayment.mockResolvedValue(
      payment({ id: 300, status: 'in_process' }),
    );

    await expect(
      service.createCard('order-1', 'store-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.createPayment).not.toHaveBeenCalled();
  });

  it('cartão "pending" também bloqueia; Pix pendente ou cartão recusado não', async () => {
    const pending = setup({
      onlineGateway: 'MERCADOPAGO',
      gatewayTransactionId: '300',
    });
    pending.client.getPayment.mockResolvedValue(
      payment({ id: 300, status: 'pending', payment_method_id: 'visa' }),
    );
    await expect(
      pending.service.createCard('order-1', 'store-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);

    for (const previous of [
      payment({ id: 300, status: 'pending', payment_method_id: 'pix' }),
      payment({ id: 300, status: 'rejected' }),
    ]) {
      const { service, client } = setup({
        onlineGateway: 'MERCADOPAGO',
        gatewayTransactionId: '300',
      });
      client.getPayment.mockResolvedValue(previous);
      client.createPayment.mockResolvedValue(payment({ id: 556 }));
      await expect(
        service.createCard('order-1', 'store-1', dto),
      ).resolves.toMatchObject({ status: 'approved' });
    }
  });

  it('no máximo 5 tentativas de cartão por pedido: a 6ª recebe 429 e não chama o MP', async () => {
    const { service, client } = setup();
    client.createPayment.mockResolvedValue(
      payment({
        status: 'rejected',
        status_detail: 'cc_rejected_other_reason',
      }),
    );

    for (let i = 0; i < 5; i++) {
      const result = await service.createCard('order-1', 'store-1', {
        ...dto,
        token: `tok_${i}`,
      });
      expect(result.status).toBe('rejected');
    }
    const error = await service
      .createCard('order-1', 'store-1', { ...dto, token: 'tok_5' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(client.createPayment).toHaveBeenCalledTimes(5);
  });

  it('a contagem é por pedido: outro pedido não é afetado', async () => {
    const first = setup();
    first.client.createPayment.mockResolvedValue(
      payment({ status: 'rejected' }),
    );
    for (let i = 0; i < 5; i++)
      await first.service.createCard('order-1', 'store-1', {
        ...dto,
        token: `t${i}`,
      });

    const other = setup({ id: 'order-2' });
    other.client.createPayment.mockResolvedValue(
      payment({ external_reference: 'order-2' }),
    );
    await expect(
      other.service.createCard('order-2', 'store-1', dto),
    ).resolves.toMatchObject({ status: 'approved' });
  });
});
