import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { EventsGateway } from '../../../events/events.gateway';
import { PrintGateway } from '../../../print/print.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';
import { sameAmount } from '../utils/order-amount';

/** Provedores que notificam por webhook sem assinatura e por isso são sempre reconsultados. */
const WEBHOOK_PROVIDERS = ['infinitepay'];

const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly eventsGateway: EventsGateway,
    private readonly printGateway: PrintGateway,
    private readonly loyaltyService: LoyaltyService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  /**
   * Testa a conexão com a InfinitePay usando as credenciais salvas na loja.
   * A InfinitePay não tem endpoint de autenticação: o teste cria um link de R$ 1,00
   * (nunca cobrado enquanto ninguém pagar) e devolve a URL gerada.
   */
  async testInfinitePayConnection(storeId: string, originUrl?: string) {
    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId },
    });
    const credentials = ((settings?.paymentGateways as any) || {}).infinitepay;

    if (!credentials?.handle?.trim()) {
      return {
        ok: false,
        error:
          'InfiniteTag (handle) não configurada. Salve a integração antes de testar.',
      };
    }

    try {
      const gateway = this.gatewayFactory.getGateway('INFINITEPAY');
      const cleanOrigin = (
        originUrl ||
        process.env.ADMIN_FRONTEND_URL ||
        'https://lojapod.com'
      ).replace(/\/$/, '');
      const result = await gateway.createCreditCardCheckout({
        orderId: 'teste-conexao',
        orderNumber: Date.now(),
        amount: 1,
        customerName: 'Teste de Conexão',
        redirectUrl: `${cleanOrigin}/`,
        webhookUrl: '',
        credentials,
        items: [
          { description: 'Teste de conexão Loja Pod', quantity: 1, price: 1 },
        ],
      });
      return {
        ok: true,
        message: 'Conexão com a InfinitePay OK',
        checkoutUrl: result.checkoutUrl,
      };
    } catch (e: any) {
      const msg = e?.response?.message || e?.message || 'Falha desconhecida';
      return { ok: false, error: Array.isArray(msg) ? msg.join(', ') : msg };
    }
  }

  /**
   * Gera o link de checkout online para um pedido, localizando o gateway ativo na loja
   */
  async createOnlineCheckout(
    orderId: string,
    storeId: string,
    originUrl?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const effectiveStoreId = storeId || order.storeId;
    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId: effectiveStoreId },
    });

    const gateways = (settings?.paymentGateways as any) || {};

    // Identificar qual gateway está configurado e habilitado para cartão de crédito
    let selectedProvider: string | null = null;
    let credentials: any = null;

    if (
      gateways.infinitepay?.enabled &&
      gateways.infinitepay?.acceptCreditCard
    ) {
      selectedProvider = 'INFINITEPAY';
      credentials = gateways.infinitepay;
    } else if (gateways.asaas?.enabled && gateways.asaas?.acceptCreditCard) {
      selectedProvider = 'ASAAS';
      credentials = gateways.asaas;
    }

    if (!selectedProvider || !credentials) {
      throw new BadRequestException(
        'Nenhum gateway de pagamento online com cartão está configurado nesta loja.',
      );
    }

    const gateway = this.gatewayFactory.getGateway(selectedProvider);

    // Determinar URLs de retorno e webhook
    const cleanOrigin = originUrl ? originUrl.replace(/\/$/, '') : '';
    const redirectUrl = `${cleanOrigin}/pedido/${order.id}/sucesso`;

    // Montar webhook URL pública se configurada na env
    let apiBaseUrl =
      process.env.API_PUBLIC_URL ||
      process.env.VITE_ADMIN_API ||
      'https://ecommerce-core-api-production-3cc7.up.railway.app';
    apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    if (!apiBaseUrl.endsWith('/api')) {
      apiBaseUrl = `${apiBaseUrl}/api`;
    }
    const webhookUrl = `${apiBaseUrl}/payments/webhook/${selectedProvider.toLowerCase()}?storeId=${effectiveStoreId}&orderId=${order.id}`;

    // Montar lista completa de itens (produtos com variação, frete e acréscimos)
    const itemsList: Array<{
      description: string;
      quantity: number;
      price: number;
    }> = (order.items || []).map((item) => {
      let desc = item.productName || 'Produto';
      if (item.variation) {
        desc += ` (${item.variation})`;
      }
      return {
        description: desc,
        quantity: item.quantity,
        price: Number(item.price),
      };
    });

    const freightNum = Number(order.freight || 0);
    if (freightNum > 0) {
      itemsList.push({
        description: 'Taxa de Entrega',
        quantity: 1,
        price: freightNum,
      });
    }

    const surchargeNum =
      Number(order.cardFee || 0) +
      Number(order.receiptSurcharge || 0) +
      Number(order.installmentSurcharge || 0);
    if (surchargeNum > 0) {
      itemsList.push({
        description: 'Taxa de Pagamento / Acréscimo',
        quantity: 1,
        price: surchargeNum,
      });
    }

    const checkoutResult = await gateway.createCreditCardCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.totalOrder),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: {
        cep: order.cep,
        street: order.street,
        number: order.number,
        neighborhood: order.neighborhood,
        city: order.city || undefined,
        state: order.state || undefined,
        complement: order.complement || undefined,
      },
      redirectUrl,
      webhookUrl,
      credentials,
      items: itemsList,
    });

    // Atualizar pedido com os dados do checkout
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        onlineGateway: selectedProvider,
        gatewayTransactionId: checkoutResult.transactionId,
        gatewayCheckoutUrl: checkoutResult.checkoutUrl,
      },
    });

    return checkoutResult;
  }

  /**
   * Webhook de pagamento (hoje só a InfinitePay usa este caminho; o Mercado Pago tem endpoint próprio com assinatura).
   *
   * O corpo da notificação NÃO é confiável: não há assinatura. Por isso ele só serve para achar o pedido
   * e as dicas (`transaction_nsu`, `invoice_slug`). Quem decide se foi pago é a própria InfinitePay, consultada
   * de novo com as credenciais da loja (`payment_check`), e o valor confere com o do pedido.
   *
   * Como a InfinitePay notifica: o link de pagamento é criado com `webhook_url` contendo `storeId` e `orderId`
   * (ver `createOnlineCheckout`). O pedido é buscado por id + loja, nunca por número solto.
   */
  async handleWebhook(provider: string, payload: any, query: any) {
    const normalizedProvider = (provider || '').toLowerCase();
    if (normalizedProvider === 'mercadopago') {
      throw new BadRequestException(
        'Webhook do Mercado Pago deve usar o endpoint validado.',
      );
    }
    if (!WEBHOOK_PROVIDERS.includes(normalizedProvider)) {
      throw new NotFoundException('Provedor de webhook não suportado.');
    }

    const storeId = typeof query?.storeId === 'string' ? query.storeId : '';
    const orderId = typeof query?.orderId === 'string' ? query.orderId : '';
    // Plano B se a InfinitePay não devolver o orderId: número do pedido, mas sempre preso à loja
    const orderNumber = Number(query?.orderNumber ?? payload?.order_nsu);

    if (!storeId || (!orderId && !Number.isInteger(orderNumber))) {
      this.logger.warn(`Webhook ${provider} sem loja ou pedido identificáveis. Ignorado.`);
      return { success: false, message: 'Notificação incompleta' };
    }

    const order = await this.prisma.order.findFirst({
      where: orderId ? { id: orderId, storeId } : { orderNumber, storeId },
    });

    if (!order) {
      this.logger.warn(`Pedido não encontrado para webhook ${provider}`);
      return { success: false, message: 'Pedido não encontrado' };
    }

    if (order.paymentStatus === 'PAID') {
      return { success: true, message: 'Pedido já marcado como pago' };
    }

    // Pedido que não escolheu este provedor não é pago por ele
    if (order.onlineGateway && order.onlineGateway.toLowerCase() !== normalizedProvider) {
      this.logger.warn(
        `Webhook ${provider} para o pedido ${order.id}, que usa ${order.onlineGateway}. Ignorado.`,
      );
      return { success: false, message: 'Provedor diferente do pedido' };
    }

    const confirmed = await this.confirmWithProvider(order, {
      provider: normalizedProvider.toUpperCase(),
      transactionNsu: asNonEmptyString(payload?.transaction_nsu),
      slug: asNonEmptyString(payload?.invoice_slug),
      source: `Webhook ${provider}`,
    });

    if (confirmed) {
      return { success: true, orderId: order.id, status: 'PAID' };
    }
    return {
      success: true,
      message: 'Evento processado sem alteração de status',
    };
  }

  /**
   * Verificação ativa de status (ex: quando o cliente volta à tela de sucesso)
   */
  async checkOrderStatus(
    orderId: string,
    storeId: string,
    transactionNsu?: string,
    slug?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    // Pedido de outra loja responde como inexistente
    if (!order || (storeId && order.storeId && order.storeId !== storeId)) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (order.paymentStatus === 'PAID') {
      return {
        paid: true,
        status: order.status,
        paymentStatus: order.paymentStatus,
        order,
      };
    }

    if (!order.onlineGateway) {
      return { paid: false, paymentStatus: order.paymentStatus, order };
    }

    const confirmed = await this.confirmWithProvider(order, {
      provider: order.onlineGateway,
      transactionNsu,
      slug,
      source: 'verificação ativa',
    });

    if (confirmed) {
      return {
        paid: true,
        status: confirmed.status,
        paymentStatus: confirmed.paymentStatus,
        order: confirmed,
      };
    }

    return {
      paid: false,
      status: order.status,
      paymentStatus: order.paymentStatus,
      order,
    };
  }

  /**
   * Pergunta ao provedor se o pedido foi pago (com as credenciais da LOJA DO PEDIDO) e confere o valor.
   * Só marca como pago se o provedor confirmar. Devolve o pedido atualizado, ou `null` se não confirmou.
   */
  private async confirmWithProvider(
    order: {
      id: string;
      orderNumber: number;
      storeId: string | null;
      totalOrder: unknown;
      gatewayTransactionId: string | null;
    },
    hints: {
      provider: string;
      transactionNsu?: string;
      slug?: string;
      source: string;
    },
  ) {
    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId: order.storeId },
    });
    const gateways = (settings?.paymentGateways as any) || {};
    const credentials = gateways[hints.provider.toLowerCase()];
    if (!credentials) return null;

    const gateway = this.gatewayFactory.getGateway(hints.provider);
    const result = await gateway.checkPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      transactionNsu:
        hints.transactionNsu || order.gatewayTransactionId || undefined,
      slug: hints.slug,
      credentials,
      expectedAmount: Number(order.totalOrder),
    });

    if (!result.paid) return null;

    // `amount` é o valor do pedido (sem juros de parcelamento); `paidAmount` pode ser maior. Se o provedor
    // informou o valor e ele não bate com o pedido, não marca como pago.
    if (
      result.amount !== undefined &&
      !sameAmount(result.amount, order.totalOrder)
    ) {
      this.logger.error(
        `Provedor ${hints.provider} confirmou pagamento do pedido #${order.orderNumber} com valor ${result.amount}, mas o pedido vale ${Number(order.totalOrder)}. NÃO marcado como pago; confira no provedor.`,
      );
      return null;
    }

    const updateData: any = {
      paymentStatus: 'PAID',
      paymentDate: new Date(),
    };
    if (result.installments && Number(result.installments) > 0) {
      updateData.installments = Number(result.installments);
    }
    if (result.transactionId && !order.gatewayTransactionId) {
      updateData.gatewayTransactionId = String(result.transactionId);
    }

    return this.markPaidAndAnnounce(order.id, updateData, hints.source);
  }

  /**
   * Marca o pedido como pago e avisa a loja (atualização no painel, push e fidelidade).
   * O webhook e a verificação ativa podem chegar ao mesmo tempo: a atualização condicional
   * (paymentStatus = PENDING) garante que só um deles anuncia, então nada sai duplicado.
   */
  async markPaidAndAnnounce(
    orderId: string,
    updateData: any,
    source: string,
  ) {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, paymentStatus: 'PENDING' },
      data: updateData,
    });

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_PRINT_INCLUDE,
    });

    if (!order || count === 0) {
      // Outro processo já marcou como pago e anunciou
      return order as any;
    }

    this.logger.log(
      `Pedido #${order.orderNumber} atualizado para PAID via ${source}`,
    );
    const storeId = order.storeId || '1';
    const wasCancelled = order.status === 'CANCELLED';

    // Painel: o pedido já apareceu (e foi impresso) na criação; aqui só atualiza o status de pagamento
    try {
      this.eventsGateway.server?.emit('orders.updated', order);
      this.eventsGateway.notifyOrderStatus(order);
    } catch (wsErr) {
      this.logger.error(
        'Erro ao emitir eventos websocket após pagamento online:',
        wsErr,
      );
    }

    // Push para os usuários da loja
    try {
      const users = await this.prisma.user.findMany({
        where: { storeId: order.storeId },
      });
      const tokens: string[] = [];
      const webSubscriptions: any[] = [];
      for (const u of users) {
        if (u.expoPushToken)
          tokens.push(...u.expoPushToken.split(',').filter(Boolean));
        if (u.webPushSubscription) {
          if (Array.isArray(u.webPushSubscription))
            webSubscriptions.push(...u.webPushSubscription);
          else webSubscriptions.push(u.webPushSubscription);
        }
      }
      if (tokens.length > 0 || webSubscriptions.length > 0) {
        const value = new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(Number(order.totalOrder || 0));
        const title = wasCancelled
          ? `⚠️ Pagamento recebido de pedido cancelado #${order.orderNumber}`
          : `(${value}) Pagamento no cartão aprovado ✅`;
        const body = wasCancelled
          ? `${order.customerName} pagou depois do prazo. Verifique o pedido.`
          : `Pedido nº #${order.orderNumber} - ${order.customerName}`;
        this.pushNotificationService
          .sendNotifications(
            tokens,
            title,
            body,
            { orderId: order.id },
            webSubscriptions,
          )
          .catch((e) =>
            this.logger.error('Erro ao enviar push de pedido pago:', e),
          );
      }
    } catch (pushErr) {
      this.logger.error(
        'Erro ao buscar tokens para push de pedido pago:',
        pushErr,
      );
    }

    // Fidelidade
    try {
      await this.loyaltyService.processOrderCompleted({
        id: order.id,
        storeId,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        totalOrder: order.totalOrder,
      });
    } catch (loyaltyErr) {
      this.logger.error(
        'Erro ao processar fidelidade após pagamento:',
        loyaltyErr,
      );
    }

    return order as any;
  }
}

/** Mesmo formato que a fila de impressão usa para reimprimir pedidos pendentes. */
const ORDER_PRINT_INCLUDE = {
  items: {
    include: {
      combo: true,
      product: {
        include: {
          category: true,
          images: {
            orderBy: [
              { position: 'asc' as const },
              { createdAt: 'asc' as const },
            ],
          },
        },
      },
    },
  },
};
