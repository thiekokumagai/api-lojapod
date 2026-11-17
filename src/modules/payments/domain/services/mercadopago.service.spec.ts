import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

// Nenhuma chamada real: o cliente HTTP do Mercado Pago, o banco e o PaymentsService são mocks.
const SECRET = 'segredo-do-webhook';
const mpConfig = {
  enabled: true,
  acceptPix: true,
  acceptCreditCard: true,
  publicKey: 'TEST-public',
  accessToken: 'TEST-access-token',
  webhookSecret: SECRET,
  maxInstallments: 6,
  pixExpirationMinutes: 30,
};

const baseOrder = {
  id: 'order-1',
  orderNumber: 77,
  storeId: 'store-1',
  status: 'PENDING',
  paymentStatus: 'PENDING',
  paymentType: 'online',
  paymentMethod: 'pix',
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

const pixPayment = (
  overrides: Partial<MercadoPagoPayment> = {},
): MercadoPagoPayment => ({
  id: 987,
  status: 'pending',
  transaction_amount: 100,
  external_reference: 'order-1',
  payment_method_id: 'pix',
  date_of_expiration: new Date(Date.now() + 20 * 60_000).toISOString(),
  point_of_interaction: {
    transaction_data: {
      qr_code: '000201copiaecola',
      qr_code_base64: 'QkFTRTY0',
      ticket_url: 'https://mp/ticket',
    },
  },
  ...overrides,
});

function setup(
  order: Partial<typeof baseOrder> = {},
  gateways: unknown = { mercadopago: mpConfig },
) {
  const orderRow = { ...baseOrder, ...order };
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(orderRow),
      update: jest.fn().mockResolvedValue(orderRow),
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

beforeEach(() => {
  resetCardAttempts();
  process.env.API_PUBLIC_URL = 'https://api.exemplo.test';
});

describe('MercadoPagoService.createPix', () => {
  it('cria o Pix com o valor do PEDIDO no servidor, referência do pedido e chave de idempotência', async () => {
    const { service, client, prisma } = setup();
    client.createPayment.mockResolvedValue(pixPayment());

    const result = await service.createPix('order-1', 'store-1');

    expect(client.createPayment).toHaveBeenCalledTimes(1);
    const [token, body, key] = client.createPayment.mock.calls[0];
    expect(token).toBe('TEST-access-token');
    expect(body.transaction_amount).toBe(100);
    expect(body.payment_method_id).toBe('pix');
    expect(body.external_reference).toBe('order-1');
    expect(body.notification_url).toBe(
      'https://api.exemplo.test/api/payments/webhook/mercadopago?storeId=store-1',
    );
    expect(key).toBe('order-1:pix:10000:first');
    expect(result).toMatchObject({
      paymentId: '987',
      amount: 100,
      qrCode: '000201copiaecola',
      qrCodeBase64: 'QkFTRTY0',
    });
    // grava o id só enquanto o pedido está pendente
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', paymentStatus: 'PENDING' },
      data: { onlineGateway: 'MERCADOPAGO', gatewayTransactionId: '987' },
    });
  });

  it('devolve o mesmo QR quando o Pix anterior ainda está em aberto, sem criar outro', async () => {
    const { service, client } = setup({
      onlineGateway: 'MERCADOPAGO',
      gatewayTransactionId: '987',
    });
    client.getPayment.mockResolvedValue(pixPayment());

    const result = await service.createPix('order-1', 'store-1');

    expect(client.createPayment).not.toHaveBeenCalled();
    expect(result.paymentId).toBe('987');
  });

  it('cria um Pix novo (chave nova) quando o anterior venceu', async () => {
    const { service, client } = setup({
      onlineGateway: 'MERCADOPAGO',
      gatewayTransactionId: '987',
    });
    client.getPayment.mockResolvedValue(pixPayment({ status: 'cancelled' }));
    client.createPayment.mockResolvedValue(pixPayment({ id: 988 }));

    const result = await service.createPix('order-1', 'store-1');

    expect(client.createPayment.mock.calls[0][2]).toBe('order-1:pix:10000:987');
    expect(result.paymentId).toBe('988');
  });

  it('recusa total do pedido menor que a soma das partes (valor adulterado)', async () => {
    const { service, client } = setup({ totalOrder: 1 });
    await expect(
      service.createPix('order-1', 'store-1'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(client.createPayment).not.toHaveBeenCalled();
  });

  it('pedido de outra loja responde como não encontrado', async () => {
    const { service, client } = setup({ storeId: 'outra-loja' });
    await expect(
      service.createPix('order-1', 'store-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.createPayment).not.toHaveBeenCalled();
  });

  it('não cobra pedido cancelado, já pago ou de outra forma de pagamento', async () => {
    await expect(
      setup({ status: 'CANCELLED' }).service.createPix('order-1', 'store-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ paymentStatus: 'PAID' }).service.createPix('order-1', 'store-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      setup({ paymentType: 'entrega' }).service.createPix('order-1', 'store-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ paymentMethod: 'credit' }).service.createPix(
        'order-1',
        'store-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa quando o Mercado Pago está desligado, sem token ou sem Pix', async () => {
    for (const mp of [
      { ...mpConfig, enabled: false },
      { ...mpConfig, accessToken: '' },
      { ...mpConfig, acceptPix: false },
    ]) {
      const { service, client } = setup({}, { mercadopago: mp });
      await expect(
        service.createPix('order-1', 'store-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.createPayment).not.toHaveBeenCalled();
    }
  });

  it('erro do Mercado Pago vira mensagem segura, sem vazar o token', async () => {
    const { service, client } = setup();
    const { MercadoPagoApiError } = jest.requireActual(
      '../../infrastructure/adapters/mercadopago.client',
    );
    client.createPayment.mockRejectedValue(
      new MercadoPagoApiError('Falha', 400, 'invalid payer'),
    );

    const error = await service.createPix('order-1', 'store-1').catch((e) => e);
    expect(error.message).toBe(
      'Não foi possível falar com o Mercado Pago. Tente novamente.',
    );
    expect(JSON.stringify(error.getResponse())).not.toContain(
      'TEST-access-token',
    );
  });
});

describe('MercadoPagoService.createCard', () => {
  const dto = {
    token: 'tok_abc',
    installments: 3,
    paymentMethodId: 'visa',
    issuerId: '24',
  };
  const cardOrder = { paymentMethod: 'credit' };
  const cardPayment = (
    overrides: Partial<MercadoPagoPayment> = {},
  ): MercadoPagoPayment => ({
    id: 555,
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 100,
    external_reference: 'order-1',
    installments: 3,
    ...overrides,
  });

  it('cartão aprovado: cobra o valor do pedido com o token e marca como pago', async () => {
    const { service, client, payments, prisma } = setup(cardOrder);
    client.createPayment.mockResolvedValue(cardPayment());

    const result = await service.createCard('order-1', 'store-1', dto);

    const [, body, key] = client.createPayment.mock.calls[0];
    expect(body).toMatchObject({
      transaction_amount: 100,
      token: 'tok_abc',
      installments: 3,
      payment_method_id: 'visa',
      issuer_id: '24',
      external_reference: 'order-1',
    });
    expect(key).toMatch(/^order-1:card:10000:[0-9a-f]{16}$/);
    expect(JSON.stringify(body)).not.toMatch(/card_number|security_code/);
    expect(payments.markPaidAndAnnounce).toHaveBeenCalledTimes(1);
    expect(payments.markPaidAndAnnounce.mock.calls[0][1]).toMatchObject({
      paymentStatus: 'PAID',
      installments: 3,
      gatewayTransactionId: '555',
    });
    expect(prisma.order.updateMany).toHaveBeenCalled();
    expect(result).toMatchObject({
      paid: true,
      status: 'approved',
      paymentId: '555',
    });
  });

  it('cartão recusado: devolve mensagem clara e NÃO marca como pago', async () => {
    const { service, client, payments } = setup(cardOrder);
    client.createPayment.mockResolvedValue(
      cardPayment({
        status: 'rejected',
        status_detail: 'cc_rejected_insufficient_amount',
      }),
    );

    const result = await service.createCard('order-1', 'store-1', dto);

    expect(result.paid).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.message).toContain('Saldo insuficiente');
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('motivo de recusa desconhecido usa a mensagem padrão', async () => {
    const { service, client } = setup(cardOrder);
    client.createPayment.mockResolvedValue(
      cardPayment({
        status: 'rejected',
        status_detail: 'cc_rejected_other_reason',
      }),
    );
    const result = await service.createCard('order-1', 'store-1', dto);
    expect(result.message).toBe(
      'Pagamento recusado pelo cartão. Tente outro cartão ou pague com Pix.',
    );
  });

  it('em análise: não marca como pago e avisa que será confirmado depois', async () => {
    const { service, client, payments } = setup(cardOrder);
    client.createPayment.mockResolvedValue(
      cardPayment({
        status: 'in_process',
        status_detail: 'pending_contingency',
      }),
    );

    const result = await service.createCard('order-1', 'store-1', dto);

    expect(result).toMatchObject({ paid: false, status: 'in_process' });
    expect(result.message).toContain('em análise');
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('respeita o máximo de parcelas da loja', async () => {
    const { service, client } = setup(cardOrder);
    await expect(
      service.createCard('order-1', 'store-1', { ...dto, installments: 7 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.createPayment).not.toHaveBeenCalled();
  });

  it('se o Mercado Pago responde com valor diferente do pedido, não marca como pago', async () => {
    const { service, client, payments } = setup(cardOrder);
    client.createPayment.mockResolvedValue(
      cardPayment({ transaction_amount: 1 }),
    );
    await expect(
      service.createCard('order-1', 'store-1', dto),
    ).rejects.toThrow();
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoService.handleWebhook', () => {
  const query = { storeId: 'store-1', 'data.id': '987', type: 'payment' };
  const body = { type: 'payment', data: { id: '987' } };
  const ts = String(Date.now());
  const signedHeaders = (secret = SECRET) => ({
    'x-request-id': 'req-1',
    'x-signature': `ts=${ts},v1=${signMercadoPagoManifest(buildMercadoPagoManifest('987', 'req-1', ts), secret)}`,
  });
  const approved = (overrides: Partial<MercadoPagoPayment> = {}) =>
    pixPayment({ status: 'approved', ...overrides });

  it('assinatura inválida é rejeitada ANTES de consultar o Mercado Pago ou mexer no pedido', async () => {
    const { service, client, payments } = setup();
    await expect(
      service.handleWebhook(query, signedHeaders('segredo-errado'), body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.handleWebhook(query, {}, body)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(client.getPayment).not.toHaveBeenCalled();
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('loja sem webhook secret não aceita notificação', async () => {
    const { service, payments } = setup(
      {},
      { mercadopago: { ...mpConfig, webhookSecret: '' } },
    );
    await expect(
      service.handleWebhook(query, signedHeaders(), body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('assinatura válida: reconsulta o pagamento no Mercado Pago e marca como pago', async () => {
    const { service, client, payments } = setup();
    client.getPayment.mockResolvedValue(approved());

    const result = await service.handleWebhook(query, signedHeaders(), body);

    expect(client.getPayment).toHaveBeenCalledWith('TEST-access-token', '987');
    expect(payments.markPaidAndAnnounce).toHaveBeenCalledTimes(1);
    expect(payments.markPaidAndAnnounce.mock.calls[0][1]).toMatchObject({
      paymentStatus: 'PAID',
      onlineGateway: 'MERCADOPAGO',
      gatewayTransactionId: '987',
    });
    expect(result).toMatchObject({ applied: true, status: 'PAID' });
  });

  it('o corpo da notificação não decide nada: "approved" no corpo com pagamento pendente no MP não paga', async () => {
    const { service, client, payments } = setup();
    client.getPayment.mockResolvedValue(pixPayment({ status: 'pending' }));

    const result = await service.handleWebhook(query, signedHeaders(), {
      ...body,
      action: 'payment.updated',
      data: { id: '987' },
      status: 'approved',
    } as never);

    expect(result).toMatchObject({ applied: false });
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('webhook duplicado não paga nem anuncia de novo (pedido já pago)', async () => {
    const { service, client, payments } = setup({ paymentStatus: 'PAID' });
    client.getPayment.mockResolvedValue(approved());

    const first = await service.handleWebhook(query, signedHeaders(), body);
    const second = await service.handleWebhook(query, signedHeaders(), body);

    expect(first).toMatchObject({ applied: false, reason: 'already_paid' });
    expect(second).toMatchObject({ applied: false, reason: 'already_paid' });
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('valor aprovado diferente do pedido: NÃO marca como pago', async () => {
    const { service, client, payments } = setup();
    client.getPayment.mockResolvedValue(approved({ transaction_amount: 1 }));

    const result = await service.handleWebhook(query, signedHeaders(), body);

    expect(result).toMatchObject({ applied: false, reason: 'amount_mismatch' });
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('pagamento de pedido de outra loja é ignorado', async () => {
    const { service, client, payments } = setup({ storeId: 'outra-loja' });
    client.getPayment.mockResolvedValue(approved());

    const result = await service.handleWebhook(query, signedHeaders(), body);

    expect(result).toMatchObject({ applied: false, reason: 'store_mismatch' });
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
  });

  it('estorno/cancelamento só é registrado: nenhuma ação automática no pedido', async () => {
    const { service, client, payments, prisma } = setup({
      paymentStatus: 'PAID',
    });
    client.getPayment.mockResolvedValue(pixPayment({ status: 'refunded' }));

    const result = await service.handleWebhook(query, signedHeaders(), body);

    expect(result).toMatchObject({ applied: false, status: 'refunded' });
    expect(payments.markPaidAndAnnounce).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('notificação de outro tipo (ex.: merchant_order) é ignorada depois da assinatura', async () => {
    const { service, client } = setup();
    const result = await service.handleWebhook(
      { ...query, type: 'merchant_order' },
      signedHeaders(),
      body,
    );
    expect(result).toMatchObject({ ignored: 'merchant_order' });
    expect(client.getPayment).not.toHaveBeenCalled();
  });
});
