import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { EventsGateway } from '../../../events/events.gateway';
import { PrintGateway } from '../../../print/print.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly eventsGateway: EventsGateway,
    private readonly printGateway: PrintGateway,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  /**
   * Gera o link de checkout online para um pedido, localizando o gateway ativo na loja
   */
  async createOnlineCheckout(orderId: string, storeId: string, originUrl?: string) {
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

    if (gateways.infinitepay?.enabled && gateways.infinitepay?.acceptCreditCard) {
      selectedProvider = 'INFINITEPAY';
      credentials = {
        ...gateways.infinitepay,
        storeCep: settings?.deliveryOriginCep || settings?.cep,
      };
    } else if (gateways.mercadopago?.enabled && gateways.mercadopago?.acceptCreditCard) {
      selectedProvider = 'MERCADOPAGO';
      credentials = gateways.mercadopago;
    } else if (gateways.asaas?.enabled && gateways.asaas?.acceptCreditCard) {
      selectedProvider = 'ASAAS';
      credentials = gateways.asaas;
    }

    if (!selectedProvider || !credentials) {
      throw new BadRequestException('Nenhum gateway de pagamento online com cartão está configurado nesta loja.');
    }

    const gateway = this.gatewayFactory.getGateway(selectedProvider);

    // Determinar URLs de retorno e webhook
    const cleanOrigin = originUrl ? originUrl.replace(/\/$/, '') : '';
    const redirectUrl = `${cleanOrigin}/pedido/${order.id}/sucesso`;

    // Montar webhook URL pública se configurada na env
    let apiBaseUrl = process.env.API_PUBLIC_URL || process.env.VITE_ADMIN_API || 'https://ecommerce-core-api-production-3cc7.up.railway.app';
    apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    if (!apiBaseUrl.endsWith('/api')) {
      apiBaseUrl = `${apiBaseUrl}/api`;
    }
    const webhookUrl = `${apiBaseUrl}/payments/webhook/${selectedProvider.toLowerCase()}?storeId=${effectiveStoreId}&orderId=${order.id}`;

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
      items: (order.items || []).map((item) => ({
        description: item.productName || 'Produto',
        quantity: item.quantity,
        price: Number(item.price),
      })),
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
   * Processa notificação recebida de webhook de pagamento
   */
  async handleWebhook(provider: string, payload: any, query: any) {
    this.logger.log(`Webhook recebido para provedor ${provider}:`, { payload, query });

    const orderId = query?.orderId || payload?.order_nsu_id || payload?.metadata?.orderId;
    const orderNumber = query?.orderNumber || payload?.order_nsu;

    let order: any = null;
    if (orderId) {
      order = await this.prisma.order.findUnique({ where: { id: orderId } });
    } else if (orderNumber) {
      order = await this.prisma.order.findFirst({
        where: { orderNumber: Number(orderNumber) },
      });
    }

    if (!order) {
      this.logger.warn(`Pedido não encontrado para webhook ${provider}`);
      return { success: false, message: 'Pedido não encontrado' };
    }

    // Se já estiver pago, ignora para idempotência (mas atualiza parcelas se vieram na notificação)
    if (order.paymentStatus === 'PAID') {
      const incomingInstallments =
        payload?.installments ||
        payload?.data?.installments ||
        payload?.metadata?.installments;
      if (
        incomingInstallments &&
        Number(incomingInstallments) > 0 &&
        order.installments !== Number(incomingInstallments)
      ) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { installments: Number(incomingInstallments) },
        });
      }
      return { success: true, message: 'Pedido já marcado como pago' };
    }

    // Verificar se o payload indica pagamento aprovado
    const isPaid =
      payload?.paid === true ||
      payload?.status === 'paid' ||
      payload?.status === 'approved' ||
      payload?.status === 'succeeded' ||
      payload?.status === 'captured' ||
      payload?.event === 'paid' ||
      payload?.event === 'payment.paid' ||
      payload?.event === 'charge.paid' ||
      payload?.event === 'transaction.paid' ||
      payload?.data?.status === 'paid' ||
      payload?.data?.status === 'approved';

    if (isPaid) {
      const incomingInstallments =
        payload?.installments ||
        payload?.data?.installments ||
        payload?.metadata?.installments;
      const transactionId =
        payload?.transaction_nsu ||
        payload?.id ||
        payload?.invoice_slug;

      const updateData: any = {
        paymentStatus: 'PAID',
        paymentDate: new Date(),
      };

      if (incomingInstallments && Number(incomingInstallments) > 0) {
        updateData.installments = Number(incomingInstallments);
      }

      if (transactionId && !order.gatewayTransactionId) {
        updateData.gatewayTransactionId = String(transactionId);
      }

      const updatedOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });

      this.logger.log(`Pedido #${order.orderNumber} atualizado para PAID via Webhook ${provider}`);

      // Notificar Admin e Frente de Caixa via WebSocket
      try {
        this.eventsGateway.server?.emit('orders.updated', updatedOrder);
        this.printGateway.emitNovoPedido(order.storeId || '1', updatedOrder);
      } catch (wsErr) {
        this.logger.error('Erro ao emitir eventos websocket após pagamento online:', wsErr);
      }

      // Processar fidelidade
      try {
        await this.loyaltyService.processOrderCompleted({
          id: order.id,
          storeId: order.storeId || '1',
          customerPhone: order.customerPhone,
          customerName: order.customerName,
          totalOrder: order.totalOrder,
        });
      } catch (loyaltyErr) {
        this.logger.error('Erro ao processar fidelidade após pagamento:', loyaltyErr);
      }

      return { success: true, orderId: order.id, status: 'PAID' };
    }

    return { success: true, message: 'Evento processado sem alteração de status' };
  }

  /**
   * Verificação ativa de status (ex: quando o cliente volta à tela de sucesso)
   */
  async checkOrderStatus(orderId: string, storeId: string, transactionNsu?: string, slug?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (order.paymentStatus === 'PAID') {
      return { paid: true, status: order.status, paymentStatus: order.paymentStatus, order };
    }

    if (!order.onlineGateway) {
      return { paid: false, paymentStatus: order.paymentStatus, order };
    }

    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId },
    });

    const gateways = (settings?.paymentGateways as any) || {};
    const credentials = gateways[order.onlineGateway.toLowerCase()];

    if (!credentials) {
      return { paid: false, paymentStatus: order.paymentStatus, order };
    }

    const gateway = this.gatewayFactory.getGateway(order.onlineGateway);
    const result = await gateway.checkPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      transactionNsu: transactionNsu || order.gatewayTransactionId || undefined,
      slug,
      credentials,
    });

    if (result.paid) {
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

      const updatedOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          items: true,
        },
      });

      try {
        this.eventsGateway.server?.emit('orders.updated', updatedOrder);
      } catch (e) {}

      return { paid: true, status: updatedOrder.status, paymentStatus: updatedOrder.paymentStatus, order: updatedOrder };
    }

    return { paid: false, status: order.status, paymentStatus: order.paymentStatus, order };
  }
}
