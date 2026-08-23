import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BillingPaymentMethod, BillingPaymentStatus, BillingStatus, BillingPlanCheckoutType, Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CaktoClientService } from './cakto-client.service';
import { CreatePlanDto } from './infrastructure/dtos/create-plan.dto';
import { UpdatePlanDto } from './infrastructure/dtos/update-plan.dto';
import { UpdateStoreSubscriptionDto } from './infrastructure/dtos/update-store-subscription.dto';

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

  // --- GESTÃO DE PLANOS (DINÂMICO NO BANCO) ---

  async listPublicPlans() {
    return this.prisma.billingPlan.findMany({
      where: { isActive: true, isPublic: true },
      include: { nextSubscriptionPlan: true },
      orderBy: { price: 'asc' },
    });
  }

  async listAdminPlans() {
    return this.prisma.billingPlan.findMany({
      include: { nextSubscriptionPlan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async syncCaktoProducts() {
    if (!this.cakto.isConfigured()) {
      throw new BadRequestException('Chaves da API da Cakto (CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET) não configuradas no .env');
    }

    try {
      const [productsRes, offersRes] = await Promise.allSettled([
        this.cakto.listProducts(),
        this.cakto.listOffers(),
      ]);

      const rawProducts = productsRes.status === 'fulfilled' ? productsRes.value : [];
      const rawOffers = offersRes.status === 'fulfilled' ? offersRes.value : [];

      const productsList = Array.isArray(rawProducts) ? rawProducts : (rawProducts?.results || rawProducts?.data || rawProducts?.items || []);
      const offersList = Array.isArray(rawOffers) ? rawOffers : (rawOffers?.results || rawOffers?.data || rawOffers?.items || []);

      const combined = [...productsList, ...offersList];
      const importedPlans: any[] = [];

      for (const item of combined) {
        const providerProductId = String(item.id || item.product_id || item.offer_id || item.code || '');
        if (!providerProductId) continue;

        // Filtrar apenas produtos com status "active" na Cakto
        const itemStatus = item.status !== undefined
          ? String(item.status).toLowerCase()
          : (item.active !== undefined ? (item.active ? 'active' : 'inactive') : 'active');

        if (itemStatus !== 'active' && itemStatus !== 'ativo' && itemStatus !== 'true') {
          continue;
        }

        const name = String(item.name || item.title || item.offer_name || (item.product && item.product.name) || `Produto Cakto ${providerProductId}`);
        const description = String(
          item.description ||
          item.details ||
          item.about ||
          item.summary ||
          item.product_description ||
          item.offer_description ||
          (item.product && typeof item.product === 'object' ? (item.product.description || item.product.details || item.product.about) : '') ||
          (Array.isArray(item.offers) && item.offers[0] ? (item.offers[0].description || item.offers[0].details) : '') ||
          ''
        ).trim() || null;

        const rawVal = Number(item.price || item.amount || item.value || item.price_cents || (item.product && item.product.price) || 0);
        let price = rawVal;
        if (rawVal >= 1000 && Number.isInteger(rawVal)) {
          price = rawVal / 100;
        } else if (rawVal <= 0) {
          price = 150;
        }

        const typeStr = String(item.type || item.billing_type || item.payment_type || '').toLowerCase();
        let checkoutType: BillingPlanCheckoutType = BillingPlanCheckoutType.SINGLE_PRODUCT;

        if (['subscription', 'recurring', 'recorrente', 'signature'].includes(typeStr)) {
          checkoutType = BillingPlanCheckoutType.RECURRING_SUBSCRIPTION;
        } else if (['unique', 'single', 'one_time', 'avulso', 'unico'].includes(typeStr)) {
          checkoutType = BillingPlanCheckoutType.SINGLE_PRODUCT;
        } else if (name.toLowerCase().includes('assinatura') || name.toLowerCase().includes('mensal')) {
          checkoutType = BillingPlanCheckoutType.RECURRING_SUBSCRIPTION;
        }

        const existing = await this.prisma.billingPlan.findFirst({
          where: { providerProductId },
        });

        if (existing) {
          const updated = await this.prisma.billingPlan.update({
            where: { id: existing.id },
            data: {
              name,
              description: description || existing.description || null,
              price,
              checkoutType,
              providerProductId,
            },
          });
          importedPlans.push(updated);
        } else {
          const created = await this.prisma.billingPlan.create({
            data: {
              name,
              description,
              price,
              providerProductId,
              checkoutType,
              isActive: true,
              isPublic: true,
            },
          });
          importedPlans.push(created);
        }
      }

      // Se importou produtos reais da Cakto, limpa os planos semente/dummy antigos que não possuem assinaturas ou pagamentos vinculados
      if (importedPlans.length > 0) {
        await this.prisma.billingPlan.deleteMany({
          where: {
            providerProductId: null,
            subscriptions: { none: {} },
            payments: { none: {} },
          },
        });
      }

      return {
        message: importedPlans.length > 0
          ? `${importedPlans.length} plano(s) sincronizados com a Cakto com os preços e links reais da sua conta!`
          : 'Nenhum produto novo encontrado na API da Cakto.',
        plans: importedPlans,
        rawProductsCount: combined.length,
      };
    } catch (error: any) {
      throw new BadRequestException(`Erro ao consultar a API da Cakto: ${error.message || 'Verifique suas credenciais no .env.'}`);
    }
  }

  async listSubscriptions() {
    // Auto-backfill: garantir que toda loja no banco tenha um StoreSubscription
    const storesWithoutSub = await this.prisma.store.findMany({
      where: { subscription: { is: null } },
      select: { id: true },
    });

    if (storesWithoutSub.length > 0) {
      await this.prisma.storeSubscription.createMany({
        data: storesWithoutSub.map((s) => ({
          storeId: s.id,
          monthlyFee: 150.0,
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })),
        skipDuplicates: true,
      });
    }

    return this.prisma.storeSubscription.findMany({
      include: {
        store: { select: { id: true, title: true, subdomain: true, adminEmail: true, isActive: true } },
        plan: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listAllPayments() {
    return this.prisma.billingPayment.findMany({
      include: {
        store: { select: { id: true, title: true, subdomain: true, adminEmail: true } },
        plan: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createPlan(dto: CreatePlanDto) {
    const providerProductId = dto.providerProductId && dto.providerProductId.trim() !== '' ? dto.providerProductId.trim() : null;

    return this.prisma.billingPlan.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        price: dto.price,
        trialDays: dto.trialDays ?? 7,
        isActive: dto.isActive ?? true,
        isPublic: dto.isPublic ?? true,
        checkoutType: dto.checkoutType,
        providerProductId,
        nextSubscriptionPlanId: dto.nextSubscriptionPlanId && dto.nextSubscriptionPlanId.trim() !== '' ? dto.nextSubscriptionPlanId.trim() : null,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const existing = await this.prisma.billingPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plano não encontrado');

    const providerProductId = dto.providerProductId !== undefined 
      ? (dto.providerProductId && dto.providerProductId.trim() !== '' ? dto.providerProductId.trim() : null)
      : existing.providerProductId;

    const nextSubscriptionPlanId = dto.nextSubscriptionPlanId !== undefined
      ? (dto.nextSubscriptionPlanId && dto.nextSubscriptionPlanId.trim() !== '' ? dto.nextSubscriptionPlanId.trim() : null)
      : existing.nextSubscriptionPlanId;

    if (providerProductId && this.cakto.isConfigured()) {
      const priceNum = Number(dto.price !== undefined ? dto.price : existing.price);
      const priceStr = priceNum.toFixed(2);
      const salesPageUrl = `https://pay.cakto.com.br/${providerProductId}`;
      const updateData = {
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? (dto.description || '') : (existing.description || ''),
        price: priceStr,
        salesPage: salesPageUrl,
      };

      try {
        await this.cakto.updateProduct(providerProductId, updateData);
      } catch (prodErr: any) {
        try {
          await this.cakto.updateOffer(providerProductId, updateData);
        } catch (offerErr: any) {
          console.warn(`[Cakto Sync Error] Não foi possível atualizar o produto/oferta na Cakto (ID: ${providerProductId}):`, prodErr?.message || offerErr?.message);
        }
      }
    }

    return this.prisma.billingPlan.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? (dto.description || null) : existing.description,
        price: dto.price !== undefined ? dto.price : existing.price,
        trialDays: dto.trialDays !== undefined ? dto.trialDays : existing.trialDays,
        isActive: dto.isActive !== undefined ? dto.isActive : existing.isActive,
        isPublic: dto.isPublic !== undefined ? dto.isPublic : existing.isPublic,
        checkoutType: dto.checkoutType ?? existing.checkoutType,
        providerProductId,
        nextSubscriptionPlanId,
      },
    });
  }

  async deletePlan(id: string) {
    return this.prisma.billingPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // --- CONSULTA DE ASSINATURA E HISTÓRICO DA LOJA ---

  async getMySubscription(storeId: string) {
    const subscription = await this.prisma.storeSubscription.findUnique({
      where: { storeId },
      include: {
        plan: { include: { nextSubscriptionPlan: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!subscription) throw new NotFoundException('Assinatura não encontrada para a loja');

    const availablePlans = await this.listPublicPlans();

    return {
      subscription,
      availablePlans,
      payments: subscription.payments,
    };
  }

  // --- WEBHOOKS E DECODIFICAÇÃO DINÂMICA ---

  validateWebhookSecret(received?: string, bodySecret?: string): void {
    const expected = this.config.get<string>('CAKTO_WEBHOOK_SECRET');
    if (!expected) throw new UnauthorizedException('Segredo do webhook Cakto não configurado');
    const candidate = received || bodySecret || '';
    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(candidate).digest();
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException('Webhook Cakto inválido');
  }

  async processWebhook(payload: Payload): Promise<{ received: true; duplicate?: boolean }> {
    const event = this.text(payload, 'event', 'type', 'event_type') || 'unknown';
    const providerId = this.text(payload, 'id', 'event_id', 'data.id') ||
      createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    const existing = await this.prisma.caktoWebhookEvent.findUnique({ where: { providerId } });
    if (existing?.processedAt) return { received: true, duplicate: true };

    await this.prisma.caktoWebhookEvent.upsert({
      where: { providerId },
      create: { providerId, event, payload: payload as Prisma.InputJsonValue },
      update: { event, payload: payload as Prisma.InputJsonValue, error: null },
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

  async reprocessWebhooks() {
    const unproc = await this.prisma.caktoWebhookEvent.findMany({
      where: {
        OR: [
          { processedAt: null },
          { error: { not: null } }
        ]
      },
    });
    const results: any[] = [];
    for (const ev of unproc) {
      try {
        await this.applyWebhook(ev.event, ev.payload as Payload);
        await this.prisma.caktoWebhookEvent.update({
          where: { id: ev.id },
          data: { processedAt: new Date(), error: null },
        });
        results.push({ id: ev.id, providerId: ev.providerId, status: 'success' });
      } catch (err: any) {
        await this.prisma.caktoWebhookEvent.update({
          where: { id: ev.id },
          data: { error: err?.message || 'Erro ao reprocessar' },
        });
        results.push({ id: ev.id, providerId: ev.providerId, status: 'error', error: err?.message });
      }
    }
    return results;
  }

  private async applyWebhook(event: string, payload: Payload): Promise<void> {
    const storeId = this.text(
      payload,
      'metadata.storeId', 'metadata.sck',
      'data.metadata.storeId', 'data.metadata.sck',
      'data.storeId', 'storeId',
      'data.sck', 'sck'
    );
    const customerEmail = this.text(
      payload,
      'customer.email', 'data.customer.email',
      'email', 'data.email'
    );
    const providerSubscriptionId = this.text(
      payload,
      'subscription.id', 'data.subscription.id',
      'subscription', 'data.subscription'
    );
    const providerOrderId = this.text(
      payload,
      'order.id', 'data.order.id',
      'order_id', 'data.id', 'id'
    );

    let subscription = storeId
      ? await this.prisma.storeSubscription.findUnique({ where: { storeId } })
      : null;

    if (!subscription && customerEmail) {
      const storeByEmail = await this.prisma.store.findFirst({
        where: { adminEmail: { equals: customerEmail, mode: 'insensitive' } },
        include: { subscription: true },
      });
      if (storeByEmail?.subscription) {
        subscription = storeByEmail.subscription;
      }
    }

    if (!subscription && providerSubscriptionId) {
      subscription = await this.prisma.storeSubscription.findUnique({ where: { providerSubscriptionId } });
    }
    if (!subscription && providerOrderId) {
      subscription = await this.prisma.storeSubscription.findUnique({ where: { providerOrderId } });
    }
    if (!subscription) {
      console.warn('[Webhook Warning] Nenhuma loja encontrada para o payload:', { storeId, customerEmail, providerSubscriptionId, providerOrderId, event });
      throw new NotFoundException(`Assinatura de loja não encontrada (storeId: ${storeId || customerEmail || 'desconhecido'})`);
    }

    const paymentMethod = this.method(
      this.text(
        payload,
        'paymentMethod', 'data.paymentMethod',
        'payment_method', 'paymentMethodName',
        'data.paymentMethodName'
      )
    );
    const now = new Date();

    if (['subscription_created', 'subscription_renewed', 'purchase_approved', 'order_paid', 'payment_approved'].includes(event)) {
      const payloadAmount = Number(
        this.text(
          payload,
          'amount', 'data.amount',
          'baseAmount', 'data.baseAmount',
          'order.amount', 'data.order.amount',
          'payment.amount'
        ) || 0
      );
      const planMeta = this.text(payload, 'metadata.plan', 'data.metadata.plan');
      const productId = this.text(
        payload,
        'product_id', 'data.product_id',
        'order.product_id', 'data.order.product_id',
        'data.offer.id', 'offer.id',
        'data.product.id', 'product.id',
        'data.product.short_id', 'product.short_id'
      );

      // Tentar localizar o plano dinâmico cadastrado no banco pelo providerProductId ou ID
      let matchedPlan = productId
        ? await this.prisma.billingPlan.findFirst({
            where: {
              OR: [
                { providerProductId: productId },
                { id: productId },
              ],
            },
          })
        : null;

      const offerName = this.text(payload, 'data.offer.name', 'offer.name', 'data.product.name', 'product.name');
      if (!matchedPlan && offerName) {
        matchedPlan = await this.prisma.billingPlan.findFirst({
          where: { name: { contains: offerName, mode: 'insensitive' } },
        });
      }
      if (!matchedPlan && planMeta) {
        matchedPlan = await this.prisma.billingPlan.findFirst({
          where: { name: { contains: planMeta, mode: 'insensitive' } },
        });
      }

      // Se não encontrou pelo ID do produto, verifica pelo checkoutType e valor
      const isSetupProduct = matchedPlan
        ? matchedPlan.checkoutType === BillingPlanCheckoutType.SINGLE_PRODUCT
        : (planMeta === 'SETUP_ERP' || payloadAmount >= 250 || productId?.includes('300') || (event === 'purchase_approved' && !providerSubscriptionId));

      const kind = isSetupProduct ? 'SETUP_ERP_WITH_FIRST_MONTH' : 'MONTHLY_FEE';

      // Se for produto único com plano recorrente vinculado no banco (nextSubscriptionPlanId)
      let nextPlanId = subscription.planId;
      let nextMonthlyFee = Number(subscription.monthlyFee);

      if (matchedPlan) {
        if (matchedPlan.checkoutType === BillingPlanCheckoutType.SINGLE_PRODUCT && matchedPlan.nextSubscriptionPlanId) {
          nextPlanId = matchedPlan.nextSubscriptionPlanId;
          const nextPlan = await this.prisma.billingPlan.findUnique({ where: { id: matchedPlan.nextSubscriptionPlanId } });
          if (nextPlan) nextMonthlyFee = Number(nextPlan.price);
        } else if (matchedPlan.checkoutType === BillingPlanCheckoutType.RECURRING_SUBSCRIPTION) {
          nextPlanId = matchedPlan.id;
          nextMonthlyFee = Number(matchedPlan.price);
        }
      }

      const periodEndPayload = this.date(this.text(payload, 'current_period_end', 'data.current_period_end', 'subscription.next_payment_date', 'data.subscription.next_payment_date'));
      const defaultNextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const periodEnd = periodEndPayload || defaultNextMonth;
      const finalAmount = payloadAmount > 0 ? payloadAmount : (matchedPlan ? Number(matchedPlan.price) : (isSetupProduct ? 300 : 150));

      await this.prisma.$transaction([
        this.prisma.storeSubscription.update({
          where: { id: subscription.id },
          data: {
            planId: nextPlanId || subscription.planId,
            providerSubscriptionId: providerSubscriptionId || subscription.providerSubscriptionId,
            providerOrderId: providerOrderId || subscription.providerOrderId,
            paymentMethod,
            status: BillingStatus.ACTIVE,
            monthlyFee: nextMonthlyFee,
            supportSelected: isSetupProduct ? true : subscription.supportSelected,
            supportPaidAt: isSetupProduct ? now : subscription.supportPaidAt,
            currentPeriodEndsAt: periodEnd,
            overdueSince: null,
            gracePeriodEndsAt: null,
            suspendedAt: null,
            lastProviderSyncAt: now,
          },
        }),
        this.prisma.store.update({ where: { id: subscription.storeId }, data: { isActive: true } }),
      ]);

      await this.recordPayment(
        subscription.id,
        subscription.storeId,
        payload,
        BillingPaymentStatus.PAID,
        paymentMethod,
        kind,
        finalAmount,
        matchedPlan?.id,
      );
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

  private async recordPayment(
    subscriptionId: string,
    storeId: string,
    payload: Payload,
    status: BillingPaymentStatus,
    method: BillingPaymentMethod,
    kind: string = 'MONTHLY_FEE',
    overrideAmount?: number,
    planId?: string,
  ) {
    const providerPaymentId = this.text(payload, 'payment.id', 'data.payment.id', 'order.id', 'data.id');
    if (!providerPaymentId) return;
    const rawAmount = Number(this.text(payload, 'amount', 'data.amount', 'order.amount', 'payment.amount') || 0);
    const amount = overrideAmount || (rawAmount > 0 ? rawAmount : (kind.includes('SETUP') ? 300 : 150));

    await this.prisma.billingPayment.upsert({
      where: { providerPaymentId },
      create: {
        providerPaymentId,
        storeId,
        subscriptionId,
        planId: planId || null,
        amount,
        kind,
        method,
        status,
        paidAt: status === BillingPaymentStatus.PAID ? new Date() : null,
        raw: payload as Prisma.InputJsonValue,
      },
      update: {
        status,
        method,
        kind,
        amount,
        planId: planId || undefined,
        paidAt: status === BillingPaymentStatus.PAID ? new Date() : undefined,
        raw: payload as Prisma.InputJsonValue,
      },
    });
  }

  async getCheckout(storeId: string, planIdOrType?: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, include: { subscription: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');

    let targetPlan: any = null;

    if (planIdOrType) {
      try {
        targetPlan = await this.prisma.billingPlan.findUnique({ where: { id: planIdOrType } });
      } catch {
        targetPlan = null;
      }

      if (!targetPlan) {
        targetPlan = await this.prisma.billingPlan.findFirst({
          where: {
            isActive: true,
            OR: [
              { providerProductId: planIdOrType },
              { checkoutType: planIdOrType as any },
              { name: { contains: planIdOrType, mode: 'insensitive' } },
            ],
          },
        });
      }
    }

    if (!targetPlan) {
      targetPlan = await this.prisma.billingPlan.findFirst({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      });
    }

    if (!targetPlan) {
      throw new BadRequestException('Nenhum plano ativo foi encontrado no banco de dados. Cadastre ou importe planos no Super Admin.');
    }

    if (!targetPlan.providerProductId) {
      throw new BadRequestException(
        `O plano "${targetPlan.name}" não possui um ID do Produto na Cakto cadastrado. Clique em 'Importar da Cakto' no painel Super Admin.`
      );
    }

    const checkoutUrl = `https://pay.cakto.com.br/${targetPlan.providerProductId}`;
    const url = new URL(checkoutUrl);
    url.searchParams.set('sck', store.id);
    url.searchParams.set('planId', targetPlan.id);

    return {
      checkoutUrl: url.toString(),
      storeId,
      email: store.adminEmail,
      subscription: store.subscription,
      plan: targetPlan,
    };
  }

  async overview() {
    const [stores, payments] = await Promise.all([
      this.prisma.storeSubscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.billingPayment.aggregate({ where: { status: BillingPaymentStatus.PAID }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return { statuses: Object.fromEntries(stores.map((item) => [item.status, item._count._all])), paidAmount: Number(payments._sum.amount || 0), paidCount: payments._count._all, providerConfigured: this.cakto.isConfigured() };
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

  async updateStoreSubscription(storeId: string, dto: UpdateStoreSubscriptionDto) {
    const existing = await this.prisma.storeSubscription.findUnique({ where: { storeId } });
    if (!existing) throw new NotFoundException('Assinatura da loja não encontrada');

    const status = dto.status ?? existing.status;
    const isActive = status === BillingStatus.ACTIVE || status === BillingStatus.TRIALING;

    const dataToUpdate: any = {
      status,
      monthlyFee: dto.monthlyFee !== undefined ? dto.monthlyFee : existing.monthlyFee,
      planId: dto.planId !== undefined ? (dto.planId || null) : existing.planId,
      paymentMethod: dto.paymentMethod ?? existing.paymentMethod,
      supportSelected: dto.supportSelected !== undefined ? dto.supportSelected : existing.supportSelected,
    };

    if (dto.trialEndsAt !== undefined) {
      dataToUpdate.trialEndsAt = dto.trialEndsAt ? new Date(dto.trialEndsAt) : null;
    }

    if (dto.currentPeriodEndsAt !== undefined) {
      dataToUpdate.currentPeriodEndsAt = dto.currentPeriodEndsAt ? new Date(dto.currentPeriodEndsAt) : null;
    }

    if (status === BillingStatus.ACTIVE) {
      dataToUpdate.suspendedAt = null;
      dataToUpdate.canceledAt = null;
      dataToUpdate.overdueSince = null;
      dataToUpdate.gracePeriodEndsAt = null;
    } else if (status === BillingStatus.SUSPENDED) {
      dataToUpdate.suspendedAt = new Date();
    } else if (status === BillingStatus.CANCELED) {
      dataToUpdate.canceledAt = new Date();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.storeSubscription.update({
        where: { storeId },
        data: dataToUpdate,
      });
      await tx.store.update({
        where: { id: storeId },
        data: { isActive },
      });
      return res;
    });

    return updated;
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
