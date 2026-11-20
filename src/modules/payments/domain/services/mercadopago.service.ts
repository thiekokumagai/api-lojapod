import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  MercadoPagoApiError,
  MercadoPagoClient,
  MercadoPagoPayment,
} from '../../infrastructure/adapters/mercadopago.client';
import { MercadoPagoCardDto } from '../../infrastructure/dtos/mercadopago-card.dto';
import {
  MERCADOPAGO_PROVIDER,
  readMercadoPagoConfig,
} from '../utils/mercadopago-config';
import { verifyMercadoPagoSignature } from '../utils/mercadopago-signature';
import { chargeableOrderAmount, sameAmount } from '../utils/order-amount';
import { PaymentsService } from './payments.service';

/** Texto só de string/número; qualquer outra coisa (objeto, lista) vira vazio. */
const asText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

type PayMethod = 'pix' | 'card';

const MAX_CARD_ATTEMPTS_PER_ORDER = 5;
const CARD_ATTEMPTS_WINDOW_MS = 60 * 60_000;
/** Contagem em memória deste processo (sem coluna nova no banco). */
const cardAttempts = new Map<string, { count: number; resetAt: number }>();

/** Só para testes. */
export function resetCardAttempts() {
  cardAttempts.clear();
}

export interface MercadoPagoPixResult {
  paymentId: string;
  status: string;
  amount: number;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string | null;
  expiresAt: string | null;
}

export interface MercadoPagoCardResult {
  paid: boolean;
  status: 'approved' | 'in_process' | 'rejected';
  paymentId: string;
  statusDetail?: string;
  message: string;
}

const REJECTION_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount:
    'Saldo insuficiente no cartão. Tente outro cartão ou pague com Pix.',
  cc_rejected_bad_filled_card_number:
    'Número do cartão incorreto. Confira e tente de novo.',
  cc_rejected_bad_filled_date:
    'Validade do cartão incorreta. Confira e tente de novo.',
  cc_rejected_bad_filled_security_code:
    'Código de segurança incorreto. Confira e tente de novo.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão e tente de novo.',
  cc_rejected_call_for_authorize:
    'O banco pede autorização. Ligue para o banco ou use outro cartão.',
  cc_rejected_card_disabled:
    'Cartão desabilitado. Ative-o com o banco ou use outro cartão.',
  cc_rejected_high_risk:
    'Pagamento recusado por segurança. Tente outra forma de pagamento.',
  cc_rejected_duplicated_payment:
    'Já existe um pagamento igual a este. Aguarde um instante e confira o pedido.',
  cc_rejected_max_attempts:
    'Limite de tentativas atingido. Use outro cartão ou pague com Pix.',
  cc_rejected_blacklist: 'Pagamento recusado. Tente outra forma de pagamento.',
};
const GENERIC_REJECTION =
  'Pagamento recusado pelo cartão. Tente outro cartão ou pague com Pix.';

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MercadoPagoClient,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ───────────────────────── Pix ─────────────────────────

  async createPix(
    orderId: string,
    tenantStoreId?: string,
  ): Promise<MercadoPagoPixResult> {
    const { order, config } = await this.loadPayableOrder(
      orderId,
      tenantStoreId,
      'pix',
    );
    const amount = chargeableOrderAmount(order);

    // Se já existe um Pix em aberto para este pedido, devolve o mesmo QR (cliente recarregou a página)
    const previousId =
      order.onlineGateway === MERCADOPAGO_PROVIDER
        ? order.gatewayTransactionId
        : null;
    if (previousId) {
      const previous = await this.client
        .getPayment(config.accessToken, previousId)
        .catch(() => null);
      if (previous && this.isReusablePix(previous, order.id, amount)) {
        return this.toPixResult(previous, amount);
      }
    }

    const expiresAt = new Date(
      Date.now() + config.pixExpirationMinutes * 60_000,
    );
    const body: Record<string, unknown> = {
      transaction_amount: amount,
      description: `Pedido #${order.orderNumber}`,
      payment_method_id: 'pix',
      external_reference: order.id,
      date_of_expiration: expiresAt.toISOString().replace('Z', '+00:00'),
      payer: {
        email: this.fallbackEmail(order.orderNumber),
        first_name: this.firstName(order.customerName),
      },
      ...this.notificationFields(order.storeId),
    };
    // A chave muda quando o Pix anterior venceu, para o Mercado Pago criar um novo QR
    const key = `${order.id}:pix:${Math.round(amount * 100)}:${previousId ?? 'first'}`;

    const payment = await this.callMercadoPago(() =>
      this.client.createPayment(config.accessToken, body, key),
    );
    this.assertPaymentMatchesOrder(payment, order.id, amount);

    await this.prisma.order.updateMany({
      where: { id: order.id, paymentStatus: 'PENDING' },
      data: {
        onlineGateway: MERCADOPAGO_PROVIDER,
        gatewayTransactionId: String(payment.id),
      },
    });
    return this.toPixResult(payment, amount);
  }

  // ───────────────────────── Cartão ─────────────────────────

  async createCard(
    orderId: string,
    tenantStoreId: string | undefined,
    dto: MercadoPagoCardDto,
  ): Promise<MercadoPagoCardResult> {
    const { order, config } = await this.loadPayableOrder(
      orderId,
      tenantStoreId,
      'card',
    );
    const amount = chargeableOrderAmount(order);

    if (dto.installments > config.maxInstallments) {
      throw new BadRequestException(
        `Esta loja aceita parcelar em até ${config.maxInstallments}x.`,
      );
    }

    // Pagamento anterior ainda em análise: aguardar o resultado em vez de cobrar de novo
    const previousId =
      order.onlineGateway === MERCADOPAGO_PROVIDER
        ? order.gatewayTransactionId
        : null;
    if (previousId) {
      const previous = await this.client
        .getPayment(config.accessToken, previousId)
        .catch(() => null);
      if (previous && this.isAwaitingResult(previous)) {
        throw new ConflictException(
          'Seu pagamento anterior ainda está em análise. Aguarde a confirmação antes de tentar de novo.',
        );
      }
    }

    // Limite de tentativas por pedido (evita usar o checkout para testar cartões)
    this.registerCardAttempt(order.id);

    const body: Record<string, unknown> = {
      transaction_amount: amount,
      token: dto.token,
      description: `Pedido #${order.orderNumber}`,
      installments: dto.installments,
      payment_method_id: dto.paymentMethodId,
      ...(dto.issuerId ? { issuer_id: dto.issuerId } : {}),
      external_reference: order.id,
      payer: {
        email: dto.payerEmail || this.fallbackEmail(order.orderNumber),
        ...(dto.identification ? { identification: dto.identification } : {}),
      },
      ...this.notificationFields(order.storeId),
    };
    // O token do cartão vale uma vez: repetir a mesma tentativa devolve o mesmo resultado, sem cobrar duas vezes
    const tokenHash = createHash('sha256')
      .update(dto.token)
      .digest('hex')
      .slice(0, 16);
    const key = `${order.id}:card:${Math.round(amount * 100)}:${tokenHash}`;

    const payment = await this.callMercadoPago(() =>
      this.client.createPayment(config.accessToken, body, key),
    );
    this.assertPaymentMatchesOrder(payment, order.id, amount);

    // Só grava o id enquanto o pedido está pendente: um pedido já pago mantém o id do pagamento que o pagou
    await this.prisma.order.updateMany({
      where: { id: order.id, paymentStatus: 'PENDING' },
      data: {
        onlineGateway: MERCADOPAGO_PROVIDER,
        gatewayTransactionId: String(payment.id),
        installments: dto.installments,
      },
    });

    const paymentId = String(payment.id);
    if (payment.status === 'approved') {
      await this.paymentsService.markPaidAndAnnounce(
        order.id,
        {
          paymentStatus: 'PAID',
          paymentDate: new Date(),
          installments: dto.installments,
          gatewayTransactionId: paymentId,
        },
        'Mercado Pago (cartão)',
      );
      await this.warnIfDuplicateCharge(order.id, paymentId);
      return {
        paid: true,
        status: 'approved',
        paymentId,
        message: 'Pagamento aprovado!',
      };
    }

    if (['in_process', 'pending', 'authorized'].includes(payment.status)) {
      return {
        paid: false,
        status: 'in_process',
        paymentId,
        statusDetail: payment.status_detail,
        message:
          'Seu pagamento está em análise. Avisaremos assim que for confirmado.',
      };
    }

    return {
      paid: false,
      status: 'rejected',
      paymentId,
      statusDetail: payment.status_detail,
      message:
        REJECTION_MESSAGES[payment.status_detail ?? ''] ?? GENERIC_REJECTION,
    };
  }

  // ───────────────────────── Webhook ─────────────────────────

  /**
   * Notificação do Mercado Pago. Ordem obrigatória:
   * 1. assinatura (`x-signature`) com a chave secreta DA LOJA;
   * 2. reconsulta o pagamento na API do Mercado Pago (o corpo da notificação nunca decide nada);
   * 3. confere pedido, loja e valor;
   * 4. só então marca como pago, pela atualização condicional de `markPaidAndAnnounce` (idempotente).
   */
  async handleWebhook(
    query: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    body:
      | { type?: string; action?: string; data?: { id?: string | number } }
      | undefined,
  ) {
    const storeId = typeof query?.storeId === 'string' ? query.storeId : '';
    const dataId = asText(query?.['data.id'] ?? body?.data?.id);
    if (!storeId || !dataId) {
      throw new BadRequestException('Notificação incompleta.');
    }

    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId },
    });
    const config = readMercadoPagoConfig(settings?.paymentGateways);
    if (!config?.webhookSecret || !config.accessToken) {
      throw new UnauthorizedException(
        'Webhook do Mercado Pago não configurado para esta loja.',
      );
    }

    const validSignature = verifyMercadoPagoSignature({
      signature: headers['x-signature'],
      requestId: headers['x-request-id'],
      dataId,
      secret: config.webhookSecret,
    });
    if (!validSignature) {
      this.logger.warn(
        `Webhook do Mercado Pago com assinatura inválida (loja ${storeId}).`,
      );
      throw new UnauthorizedException('Assinatura inválida.');
    }

    const type = asText(query?.type ?? query?.topic ?? body?.type);
    if (type && type !== 'payment') {
      return { received: true, ignored: type };
    }

    const payment = await this.callMercadoPago(() =>
      this.client.getPayment(config.accessToken, dataId),
    );
    return this.applyPayment(payment, storeId);
  }

  private async applyPayment(payment: MercadoPagoPayment, storeId: string) {
    const orderId = payment.external_reference;
    const order = orderId
      ? await this.prisma.order.findUnique({ where: { id: orderId } })
      : null;
    if (!order) {
      this.logger.warn(
        `Pagamento ${payment.id} do Mercado Pago sem pedido correspondente.`,
      );
      return { received: true, applied: false, reason: 'order_not_found' };
    }
    if (order.storeId !== storeId) {
      this.logger.error(
        `Pagamento ${payment.id} aponta para o pedido ${order.id}, que não é da loja ${storeId}. Ignorado.`,
      );
      return { received: true, applied: false, reason: 'store_mismatch' };
    }

    if (payment.status === 'approved') {
      // Pedido já pago por OUTRO pagamento e agora chega mais um aprovado: o cliente foi cobrado duas vezes
      if (
        order.paymentStatus === 'PAID' &&
        order.gatewayTransactionId &&
        order.gatewayTransactionId !== String(payment.id)
      ) {
        this.logger.error(
          `COBRANÇA DUPLICADA: o pedido #${order.orderNumber} (${order.id}) já foi pago pelo pagamento ${order.gatewayTransactionId} e o pagamento ${payment.id} também foi aprovado. Estorne um deles no Mercado Pago.`,
        );
        return { received: true, applied: false, reason: 'duplicate_payment' };
      }
      if (!sameAmount(payment.transaction_amount, order.totalOrder)) {
        this.logger.error(
          `Pagamento ${payment.id} aprovado com valor ${payment.transaction_amount}, mas o pedido #${order.orderNumber} vale ${Number(order.totalOrder)}. NÃO marcado como pago; confira no Mercado Pago.`,
        );
        return { received: true, applied: false, reason: 'amount_mismatch' };
      }
      if (order.paymentStatus === 'PAID') {
        return { received: true, applied: false, reason: 'already_paid' };
      }
      await this.paymentsService.markPaidAndAnnounce(
        order.id,
        {
          paymentStatus: 'PAID',
          paymentDate: new Date(),
          onlineGateway: MERCADOPAGO_PROVIDER,
          gatewayTransactionId: String(payment.id),
          ...(payment.installments
            ? { installments: payment.installments }
            : {}),
        },
        'Webhook Mercado Pago',
      );
      return {
        received: true,
        applied: true,
        orderId: order.id,
        status: 'PAID',
      };
    }

    if (['refunded', 'charged_back', 'cancelled'].includes(payment.status)) {
      // Só registro: o estorno/cancelamento do pedido no lojapod é decisão da loja
      this.logger.warn(
        `Pagamento ${payment.id} do pedido #${order.orderNumber} está "${payment.status}" no Mercado Pago (pedido ${order.paymentStatus}/${order.status}). Nenhuma ação automática; revise o pedido.`,
      );
    }
    return { received: true, applied: false, status: payment.status };
  }

  // ───────────────────────── Apoio ─────────────────────────

  private async loadPayableOrder(
    orderId: string,
    tenantStoreId: string | undefined,
    method: PayMethod,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    // Pedido de outra loja responde como inexistente
    if (
      !order ||
      (tenantStoreId && order.storeId && order.storeId !== tenantStoreId)
    ) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Este pedido foi cancelado.');
    }
    if (order.paymentStatus === 'PAID') {
      throw new ConflictException('Este pedido já foi pago.');
    }
    const orderMethod = String(order.paymentMethod ?? '').toLowerCase();
    const wanted = method === 'pix' ? 'pix' : 'credit';
    if (
      String(order.paymentType ?? '').toLowerCase() !== 'online' ||
      orderMethod !== wanted
    ) {
      throw new BadRequestException(
        'Este pedido não foi feito para pagamento online com esta forma.',
      );
    }

    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId: order.storeId },
    });
    const config = readMercadoPagoConfig(settings?.paymentGateways);
    const accepted =
      method === 'pix' ? config?.acceptPix : config?.acceptCreditCard;
    if (!config || !config.enabled || !config.accessToken || !accepted) {
      throw new BadRequestException(
        'Mercado Pago não está disponível nesta loja para esta forma de pagamento.',
      );
    }
    return { order, config: config };
  }

  /** O Mercado Pago só avisa a loja certa se a URL levar o storeId (a assinatura é conferida com o segredo dela). */
  private notificationFields(storeId: string | null): Record<string, string> {
    const base = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
    if (!base || !storeId) {
      this.logger.warn(
        'API_PUBLIC_URL não definido: o Mercado Pago não terá URL de notificação (a confirmação depende da verificação ativa).',
      );
      return {};
    }
    const apiBase = base.endsWith('/api') ? base : `${base}/api`;
    return {
      notification_url: `${apiBase}/payments/webhook/mercadopago?storeId=${encodeURIComponent(storeId)}`,
    };
  }

  /** Pagamento que ainda não tem resultado final: não se deve cobrar outra vez por cima dele. */
  private isAwaitingResult(payment: MercadoPagoPayment): boolean {
    if (['in_process', 'authorized'].includes(payment.status)) return true;
    // Cartão "pending" (aguardando o banco). Pix pendente não bloqueia: o cliente pode trocar para cartão.
    return payment.status === 'pending' && payment.payment_method_id !== 'pix';
  }

  /** Máximo de tentativas de cartão por pedido numa janela de 1 hora. */
  private registerCardAttempt(orderId: string) {
    const now = Date.now();
    for (const [key, entry] of cardAttempts) {
      if (entry.resetAt <= now) cardAttempts.delete(key);
    }
    const entry = cardAttempts.get(orderId) ?? {
      count: 0,
      resetAt: now + CARD_ATTEMPTS_WINDOW_MS,
    };
    entry.count += 1;
    cardAttempts.set(orderId, entry);
    if (entry.count > MAX_CARD_ATTEMPTS_PER_ORDER) {
      this.logger.warn(
        `Pedido ${orderId} passou de ${MAX_CARD_ATTEMPTS_PER_ORDER} tentativas de cartão em 1 hora.`,
      );
      throw new HttpException(
        'Muitas tentativas de cartão neste pedido. Pague com Pix ou faça um novo pedido mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Depois de aprovar um cartão: se o pedido já constava como pago por outro pagamento, registra a cobrança em dobro. */
  private async warnIfDuplicateCharge(orderId: string, paymentId: string) {
    const fresh = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentStatus: true, gatewayTransactionId: true },
    });
    if (
      fresh?.paymentStatus === 'PAID' &&
      fresh.gatewayTransactionId &&
      fresh.gatewayTransactionId !== paymentId
    ) {
      this.logger.error(
        `COBRANÇA DUPLICADA: o pedido ${orderId} já estava pago pelo pagamento ${fresh.gatewayTransactionId} e o pagamento ${paymentId} também foi aprovado. Estorne um deles no Mercado Pago.`,
      );
    }
  }

  private isReusablePix(
    payment: MercadoPagoPayment,
    orderId: string,
    amount: number,
  ): boolean {
    const expiresAt = payment.date_of_expiration
      ? Date.parse(payment.date_of_expiration)
      : NaN;
    return (
      payment.status === 'pending' &&
      payment.payment_method_id === 'pix' &&
      payment.external_reference === orderId &&
      sameAmount(payment.transaction_amount, amount) &&
      (Number.isNaN(expiresAt) || expiresAt > Date.now()) &&
      !!payment.point_of_interaction?.transaction_data?.qr_code
    );
  }

  private assertPaymentMatchesOrder(
    payment: MercadoPagoPayment,
    orderId: string,
    amount: number,
  ) {
    if (
      payment.external_reference !== orderId ||
      !sameAmount(payment.transaction_amount, amount)
    ) {
      this.logger.error(
        `Resposta do Mercado Pago não confere com o pedido ${orderId} (pagamento ${payment.id}).`,
      );
      throw new BadGatewayException(
        'O Mercado Pago devolveu um pagamento diferente do pedido.',
      );
    }
  }

  private toPixResult(
    payment: MercadoPagoPayment,
    amount: number,
  ): MercadoPagoPixResult {
    const data = payment.point_of_interaction?.transaction_data;
    if (!data?.qr_code || !data.qr_code_base64) {
      throw new BadGatewayException(
        'O Mercado Pago não devolveu o QR Code do Pix.',
      );
    }
    return {
      paymentId: String(payment.id),
      status: payment.status,
      amount,
      qrCode: data.qr_code,
      qrCodeBase64: data.qr_code_base64,
      ticketUrl: data.ticket_url ?? null,
      expiresAt: payment.date_of_expiration ?? null,
    };
  }

  /** Erros do Mercado Pago viram uma mensagem segura; detalhes só no log (sem token). */
  private async callMercadoPago<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof MercadoPagoApiError) {
        this.logger.error(
          `Mercado Pago respondeu ${err.status ?? 'sem status'}: ${err.mpMessage ?? err.message}`,
        );
        throw new BadGatewayException(
          'Não foi possível falar com o Mercado Pago. Tente novamente.',
        );
      }
      throw err;
    }
  }

  private firstName(name: string | null | undefined): string {
    return (name || '').trim().split(/\s+/)[0]?.slice(0, 40) || 'Cliente';
  }

  /** O pedido não guarda e-mail do cliente e o Mercado Pago exige um. */
  private fallbackEmail(orderNumber: number): string {
    return `pedido${orderNumber}@pagamento.podipedir.com.br`;
  }
}
