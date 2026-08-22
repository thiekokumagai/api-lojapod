import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BillingPaymentMethod, BillingPaymentStatus, BillingStatus, Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CaktoClientService } from './cakto-client.service';

type Payload = Record<string, unknown>;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cakto: CaktoClientService,
  ) {}

  private pick(payload: Payload, ...paths: string[]): unknown {
    for (const path of paths) {
      let value: unknown = payload;
      for (const key of path.split('.')) {
        if (!value || typeof value !== 'object') { value = undefined; break; }
        value = (value as Payload)[key];
      }
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  }

  private text(payload: Payload, ...paths: string[]): string | undefined {
    const value = this.pick(payload, ...paths);
    return value === undefined ? undefined : String(value);
  }

  private date(value?: string): Date | undefined {
    if (!value) return undefined;
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? undefined : result;
  }

  private method(value?: string): BillingPaymentMethod {
    if (value?.toLowerCase().includes('pix')) return BillingPaymentMethod.PIX_AUTO;
    if (value?.toLowerCase().includes('card') || value?.toLowerCase().includes('credit')) return BillingPaymentMethod.CREDIT_CARD;
    return BillingPaymentMethod.UNKNOWN;
  }

  validateWebhookSecret(received?: string, bodySecret?: string): void {
    const expected = this.config.get<string>('CAKTO_WEBHOOK_SECRET');
    if (!expected) throw new UnauthorizedException('Segredo do webhook Cakto não configurado');
    const candidate = received || bodySecret || '';
    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(candidate).digest();
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException('Webhook Cakto inválido');
  }

  async processWebhook(payload: any): Promise<{ received: boolean }> {
    const orderId = payload.data?.id || 'unknown';
    // Se a Cakto não enviar um ID único de evento, usamos o ID do pedido + nome do evento para garantir idempotência
    const providerId = payload.id || `${orderId}_${payload.event}`;
    const event = payload.event;
    
    if (!providerId || orderId === 'unknown') return { received: true };

    const exists = await this.prisma.caktoWebhookEvent.findUnique({ where: { providerId } });
    if (exists) return { received: true };

    await this.prisma.caktoWebhookEvent.create({
      data: { providerId, event, payload: payload as object },
    });

    try {
      await this.applyWebhook(event, payload);
      await this.prisma.caktoWebhookEvent.update({ where: { providerId }, data: { processedAt: new Date() } });
      return { received: true };
    } catch (error) {
      await this.prisma.caktoWebhookEvent.update({
        where: { providerId },
        data: { error: error instanceof Error ? error.message.slice(0, 1000) : 'Erro desconhecido' },
      });
      throw error;
    }
  }

  private async applyWebhook(event: string, payload: Payload): Promise<void> {
    const storeId = this.text(payload, 'metadata.storeId', 'metadata.sck', 'data.metadata.storeId', 'data.metadata.sck', 'data.storeId', 'storeId', 'data.sck', 'sck');
    const providerSubscriptionId = this.text(payload, 'subscription.id', 'data.subscription.id', 'subscription', 'data.subscription');
    const providerOrderId = this.text(payload, 'order.id', 'data.order.id', 'order_id', 'data.id');

    let subscription = storeId
      ? await this.prisma.storeSubscription.findUnique({ where: { storeId } })
      : null;
    if (!subscription && providerSubscriptionId) {
      subscription = await this.prisma.storeSubscription.findUnique({ where: { providerSubscriptionId } });
    }
    if (!subscription && providerOrderId) {
      subscription = await this.prisma.storeSubscription.findUnique({ where: { providerOrderId } });
    }
    if (!subscription) return;

    const paymentMethod = this.method(this.text(payload, 'paymentMethod', 'data.paymentMethod', 'payment_method'));
    const now = new Date();

    if (['subscription_created', 'subscription_renewed', 'purchase_approved'].includes(event)) {
      let periodEnd = this.date(this.text(payload, 'current_period_end', 'data.current_period_end', 'subscription.next_payment_date', 'data.subscription.next_payment_date'));
      
      // Se não vier data de vencimento no webhook, calculamos +30 dias
      if (!periodEnd) {
        // Se já tiver uma data futura (trial ou vencimento atual), somamos 30 dias a partir dela, para o cliente não perder dias caso pague adiantado
        const baseDate = subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt > now 
          ? subscription.currentPeriodEndsAt 
          : (subscription.trialEndsAt && subscription.trialEndsAt > now ? subscription.trialEndsAt : now);
          
        periodEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      await this.prisma.$transaction([
        this.prisma.storeSubscription.update({
          where: { id: subscription.id },
          data: {
            providerSubscriptionId: providerSubscriptionId || subscription.providerSubscriptionId,
            providerOrderId: providerOrderId || subscription.providerOrderId,
            paymentMethod,
            status: BillingStatus.ACTIVE,
            currentPeriodEndsAt: periodEnd,
            overdueSince: null,
            gracePeriodEndsAt: null,
            suspendedAt: null,
            lastProviderSyncAt: now,
          },
        }),
        this.prisma.store.update({ where: { id: subscription.storeId }, data: { isActive: true } }),
      ]);
      await this.recordPayment(subscription.id, subscription.storeId, payload, BillingPaymentStatus.PAID, paymentMethod);
      return;
    }

    if (['subscription_renewal_refused', 'purchase_refused'].includes(event)) {
      const dueAt = this.date(this.text(payload, 'dueDate', 'data.dueDate', 'data.due_date')) || now;
      const gracePeriodEndsAt = new Date(dueAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      await this.prisma.storeSubscription.update({
        where: { id: subscription.id },
        data: { status: BillingStatus.PAST_DUE, paymentMethod, paymentDueAt: dueAt, overdueSince: dueAt, gracePeriodEndsAt, lastProviderSyncAt: now },
      });
      await this.recordPayment(subscription.id, subscription.storeId, payload, BillingPaymentStatus.REFUSED, paymentMethod);
      return;
    }

    if (event === 'subscription_canceled') {
      await this.prisma.storeSubscription.update({ where: { id: subscription.id }, data: { status: BillingStatus.CANCELED, canceledAt: now, lastProviderSyncAt: now } });
      return;
    }

    if (event === 'refund' || event === 'chargeback') {
      await this.recordPayment(subscription.id, subscription.storeId, payload, event === 'refund' ? BillingPaymentStatus.REFUNDED : BillingPaymentStatus.CHARGEBACK, paymentMethod);
    }
  }

  private async recordPayment(subscriptionId: string, storeId: string, payload: Payload, status: BillingPaymentStatus, method: BillingPaymentMethod) {
    const providerPaymentId = this.text(payload, 'payment.id', 'data.payment.id', 'order.id', 'data.id');
    if (!providerPaymentId) return;
    const amount = Number(this.text(payload, 'amount', 'data.amount', 'order.amount') || 150);
    await this.prisma.billingPayment.upsert({
      where: { providerPaymentId },
      create: { providerPaymentId, storeId, subscriptionId, amount, method, status, paidAt: status === BillingPaymentStatus.PAID ? new Date() : null, raw: payload as Prisma.InputJsonValue },
      update: { status, method, paidAt: status === BillingPaymentStatus.PAID ? new Date() : undefined, raw: payload as Prisma.InputJsonValue },
    });
  }

  async getCheckout(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, include: { subscription: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const checkoutUrl = this.cakto.getCheckoutUrl();
    if (!checkoutUrl) throw new BadRequestException('CAKTO_CHECKOUT_URL não configurada');
    const url = new URL(checkoutUrl);
    url.searchParams.set('sck', store.id);
    url.searchParams.set('email', store.adminEmail);
    url.searchParams.set('name', store.title);
    return { checkoutUrl: url.toString(), storeId, email: store.adminEmail, subscription: store.subscription };
  }

  async overview() {
    const [stores, payments] = await Promise.all([
      this.prisma.storeSubscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.billingPayment.aggregate({ where: { status: BillingPaymentStatus.PAID }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return { statuses: Object.fromEntries(stores.map((item) => [item.status, item._count._all])), paidAmount: Number(payments._sum.amount || 0), paidCount: payments._count._all, providerConfigured: this.cakto.isConfigured() };
  }

  listSubscriptions() {
    return this.prisma.storeSubscription.findMany({ include: { store: { select: { id: true, title: true, subdomain: true, adminEmail: true, isActive: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 5 } }, orderBy: { updatedAt: 'desc' } });
  }

  async adminAction(storeId: string, action: 'SUSPEND' | 'REACTIVATE' | 'CANCEL', reason: string, actorId: string, ipAddress?: string) {
    const current = await this.prisma.storeSubscription.findUnique({ where: { storeId } });
    if (!current) throw new NotFoundException('Assinatura da loja não encontrada');
    if (action === 'CANCEL' && current.providerSubscriptionId && this.cakto.isConfigured()) await this.cakto.cancelSubscription(current.providerSubscriptionId);
    const status = action === 'SUSPEND' ? BillingStatus.SUSPENDED : action === 'REACTIVATE' ? BillingStatus.ACTIVE : BillingStatus.CANCELED;
    const isActive = action === 'REACTIVATE';
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.storeSubscription.update({ where: { storeId }, data: { status, suspendedAt: action === 'SUSPEND' ? new Date() : null, canceledAt: action === 'CANCEL' ? new Date() : undefined, overdueSince: isActive ? null : undefined, gracePeriodEndsAt: isActive ? null : undefined } });
      await tx.store.update({ where: { id: storeId }, data: { isActive } });
      await tx.adminAuditLog.create({ data: { actorId, storeId, action: `BILLING_${action}`, reason, before: current as unknown as Prisma.InputJsonValue, after: result as unknown as Prisma.InputJsonValue, ipAddress } });
      return result;
    });
    return updated;
  }

  async adminEditSubscription(storeId: string, data: { status?: BillingStatus; trialEndsAt?: Date | null; currentPeriodEndsAt?: Date | null; gracePeriodEndsAt?: Date | null; monthlyFee?: number }) {
    const current = await this.prisma.storeSubscription.findUnique({ where: { storeId } });
    if (!current) {
      // Create if it doesn't exist
      return this.prisma.storeSubscription.create({
        data: {
          storeId,
          status: data.status || BillingStatus.TRIALING,
          trialEndsAt: data.trialEndsAt,
          currentPeriodEndsAt: data.currentPeriodEndsAt,
          gracePeriodEndsAt: data.gracePeriodEndsAt,
          monthlyFee: data.monthlyFee || 150,
        }
      });
    }

    return this.prisma.storeSubscription.update({
      where: { storeId },
      data: {
        status: data.status,
        trialEndsAt: data.trialEndsAt,
        currentPeriodEndsAt: data.currentPeriodEndsAt,
        gracePeriodEndsAt: data.gracePeriodEndsAt,
        monthlyFee: data.monthlyFee,
        // Also ensure store isActive matches the logic if it's being manually edited to SUSPENDED or ACTIVE
      }
    });
  }

  @Cron('0 * * * *')
  async checkBillingStatuses(): Promise<void> {
    const now = new Date();

    // 1. Verificar trials expirados
    const expiredTrials = await this.prisma.storeSubscription.findMany({
      where: { status: BillingStatus.TRIALING, trialEndsAt: { lte: now } },
      select: { id: true }
    });

    for (const trial of expiredTrials) {
      const gracePeriodEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await this.prisma.storeSubscription.update({
        where: { id: trial.id },
        data: {
          status: BillingStatus.PAST_DUE,
          overdueSince: now,
          gracePeriodEndsAt
        }
      });
    }

    // 2. Suspender assinaturas com carência vencida
    const expiredGrace = await this.prisma.storeSubscription.findMany({ 
      where: { status: BillingStatus.PAST_DUE, gracePeriodEndsAt: { lte: now } }, 
      select: { id: true, storeId: true } 
    });
    for (const item of expiredGrace) {
      await this.prisma.$transaction([
        this.prisma.storeSubscription.update({ where: { id: item.id }, data: { status: BillingStatus.SUSPENDED, suspendedAt: now } }),
        this.prisma.store.update({ where: { id: item.storeId }, data: { isActive: false } }),
      ]);
    }
  }
}
