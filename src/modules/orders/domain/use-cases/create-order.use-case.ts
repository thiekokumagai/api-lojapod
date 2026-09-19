import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { ValidateCouponUseCase } from '../../../coupons/domain/use-cases/validate-coupon.use-case';
import type { ICouponsRepository } from '../../../coupons/domain/repositories/icoupons.repository';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';
import { IUsersRepository } from '../../../users/domain/repositories/iusers.repository';
import { PrintGateway } from '../../../print/print.gateway';
import { EventsGateway } from '../../../events/events.gateway';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly validateCouponUseCase: ValidateCouponUseCase,
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
    private readonly pushNotificationService: PushNotificationService,
    private readonly usersRepository: IUsersRepository,
    private readonly printGateway: PrintGateway,
    private readonly eventsGateway: EventsGateway,
    private readonly tenantContextService: TenantContextService,
    private readonly settingsRepository: ISettingsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    data: Partial<Order> & { couponTitle?: string, showProductPrices?: boolean },
  ): Promise<Order> {
    try {
      let couponId: string | undefined = undefined;
      let couponDiscountValue = Number(data.couponDiscount) || 0;
      let couponFreightDiscountValue = Number(data.couponFreightDiscount) || 0;

      const storeId = data.storeId || this.tenantContextService.getStoreId() || undefined;
      // Se a loja tem regra de isenção de taxa (frete grátis) a partir de um valor
      try {
        const settings = await this.settingsRepository.get();
        if (settings?.freeShippingEnabled && settings?.freeShippingMinValue) {
          const minVal = Number(settings.freeShippingMinValue);
          if (!isNaN(minVal) && minVal > 0 && (Number(data.itemsTotal) || 0) >= minVal) {
            data.freight = 0;
          }
        }
      } catch (err) {
        // Ignora erro ao buscar settings
      }

      if (data.couponTitle) {
        let nonPromoTotal = (data as any).nonPromoItemsTotal !== undefined 
          ? Number((data as any).nonPromoItemsTotal) 
          : undefined;

        if (nonPromoTotal === undefined && data.items && Array.isArray(data.items)) {
          nonPromoTotal = data.items.reduce((acc: number, item: any) => {
            const isPromo = item.isPromo || item.isPromotional || (item.oldPrice !== undefined && item.oldPrice > 0);
            if (isPromo) return acc;
            return acc + (Number(item.price) || 0) * (Number(item.quantity) || 1);
          }, 0);
        }

        const { coupon, discountAmount } =
          await this.validateCouponUseCase.execute({
            title: data.couponTitle,
            orderTotal: Number(data.itemsTotal) || 0,
            nonPromoItemsTotal: nonPromoTotal,
          });

        couponId = coupon.id;
        if (coupon.type === 'FREE_SHIPPING') {
          couponFreightDiscountValue = Number(data.freight) > 0 ? Number(data.freight) : 0;
        } else {
          couponDiscountValue = discountAmount;
        }
      }

      const order = new Order({
        ...data,
        storeId: storeId || data.storeId,
        couponDiscount: couponDiscountValue,
        couponFreightDiscount: couponFreightDiscountValue,
        couponId: couponId,
        status: data.status || undefined,
        paymentDate: data.paymentStatus === 'PAID' ? new Date() : undefined,
      });

      // Recalcular o totalOrder para garantir a precisão no backend
      const itemsTotal = Number(order.itemsTotal) || 0;
      const freight = Number(order.freight) > 0 ? Number(order.freight) : 0;
      const installmentSurcharge = Number(order.installmentSurcharge) || 0;
      const receiptSurcharge = Number(order.receiptSurcharge) || 0;
      const paymentDiscount = Number(order.paymentDiscount) || 0;
      const receiptDiscount = Number(order.receiptDiscount) || 0;
      const cDiscount = Number(order.couponDiscount) || 0;
      const cFDiscount = Number(order.couponFreightDiscount) || 0;

      // Mantemos suporte aos campos legados se ainda chegarem
      const calculatedTotal =
        Math.round(
          (itemsTotal +
            freight +
            installmentSurcharge +
            receiptSurcharge -
            paymentDiscount -
            receiptDiscount -
            cDiscount -
            cFDiscount) *
            100,
        ) / 100;
        
      order.totalOrder = data.totalOrder !== undefined ? data.totalOrder : calculatedTotal;
      const savedOrder =
        await this.ordersRepository.saveWithStockDecrement(order);

      if (couponId) {
        const coupon = await this.couponsRepository.findById(couponId);
        if (coupon) {
          await this.couponsRepository.update(couponId, {
            currentUses: coupon.currentUses + 1,
          });
        }
      }

      // Disparar Notificação Push
      try {
        const admins = await this.usersRepository.findAll();
        const tokens: string[] = [];
        const webSubscriptions: any[] = [];
        admins.forEach(u => {
          if (u.expoPushToken) {
            tokens.push(...u.expoPushToken.split(',').filter(Boolean));
          }
          if (u.webPushSubscription) {
            if (Array.isArray(u.webPushSubscription)) {
              webSubscriptions.push(...u.webPushSubscription);
            } else {
              webSubscriptions.push(u.webPushSubscription as any);
            }
          }
        });
        console.log(`[Push Notification] Found ${tokens.length} expo tokens and ${webSubscriptions.length} web subs to send notifications.`);
        if (tokens.length > 0 || webSubscriptions.length > 0) {
          const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
          const formattedValue = formatter.format(Number(savedOrder.totalOrder || 0));
          this.pushNotificationService.sendNotifications(
            tokens,
            `(${formattedValue}) Oba! Chegou pedido 🤩`,
            `Pedido nº #${savedOrder.orderNumber} - ${savedOrder.customerName}`,
            { orderId: savedOrder.id },
            webSubscriptions
          ).catch(e => console.error(e));
        }
      } catch (err) {
        console.error('Erro ao buscar tokens para notificação', err);
      }

      // Avaliação de Transição de Estado de Estoque (Máquina de Estados Anti-Spam)
      try {
        const rawProductIds = (savedOrder.items || []).map((i) => i.productId);
        const uniqueProductIds = Array.from(new Set(rawProductIds.filter(Boolean))) as string[];

        for (const prodId of uniqueProductIds) {
          const product = await this.prisma.product.findUnique({
            where: { id: prodId },
            include: { items: true },
          });

          if (!product) continue;

          const totalStock = product.items.reduce((acc, item) => acc + item.stock, 0);
          const minStock = product.minStock ?? 5;
          const previousState = product.stockAlertState || 'OK';

          let newState = 'OK';
          if (totalStock === 0) {
            newState = 'OUT_OF_STOCK';
          } else if (
            totalStock <= minStock ||
            (product.dailyRunRate && product.coverageDays !== null && product.coverageDays <= 3)
          ) {
            newState = 'CRITICAL';
          }

          // Só notifica se HOUVE TRANSIÇÃO DE ESTADO
          if (newState !== previousState && newState !== 'OK') {
            const isOutOfStock = newState === 'OUT_OF_STOCK';
            const alertTitle = isOutOfStock
              ? `🔴 Esgotou: ${product.title}`
              : `⚠️ Estoque Crítico: ${product.title}`;
            const alertBody = isOutOfStock
              ? 'O estoque deste produto acabou de zerar.'
              : `Restam apenas ${totalStock} un (mínimo: ${minStock}). Cobertura estimada: ${product.coverageDays ?? 1} dias.`;

            const admins = await this.usersRepository.findAll();
            const alertTokens: string[] = [];
            const alertWebSubs: unknown[] = [];
            admins.forEach((u) => {
              if (u.expoPushToken) alertTokens.push(...u.expoPushToken.split(',').filter(Boolean));
              if (u.webPushSubscription) {
                if (Array.isArray(u.webPushSubscription)) alertWebSubs.push(...u.webPushSubscription);
                else alertWebSubs.push(u.webPushSubscription);
              }
            });

            if (alertTokens.length > 0 || alertWebSubs.length > 0) {
              this.pushNotificationService
                .sendNotifications(
                  alertTokens,
                  alertTitle,
                  alertBody,
                  { screen: 'ProductDetails', productId: product.id },
                  alertWebSubs,
                )
                .catch((e) => console.error('[StockAlert Push] Erro ao enviar:', e));
            }

            await this.prisma.product.update({
              where: { id: product.id },
              data: {
                stockAlertState: newState,
                lastStockAlertAt: new Date(),
              },
            });
          } else if (newState === 'OK' && previousState !== 'OK') {
            await this.prisma.product.update({
              where: { id: product.id },
              data: {
                stockAlertState: 'OK',
              },
            });
          }
        }
      } catch (stockAlertErr) {
        console.error('[StockAlert StateMachine] Erro ao verificar estado de estoque:', stockAlertErr);
      }

      // Disparar WebSocket para impressão
      try {
        if (savedOrder.status !== 'CANCELLED') {
          const orderForPrint = { ...savedOrder, showProductPrices: data.showProductPrices };
          const targetPrintStoreId = savedOrder.storeId || storeId || '1';
          this.printGateway.emitNovoPedido(targetPrintStoreId, orderForPrint);
        }
      } catch (err) {
        console.error('Erro ao emitir pedido para impressão', err);
      }

      // Disparar Eventos WebSocket (Admin e Client)
      try {
        this.eventsGateway.notifyNewOrder(savedOrder);
        // Também disparamos um evento genérico para atualizar o catálogo no front cliente
        this.eventsGateway.server.emit('products.refresh');
      } catch (err) {
        console.error('Erro ao emitir eventos websocket', err);
      }

      return savedOrder;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
