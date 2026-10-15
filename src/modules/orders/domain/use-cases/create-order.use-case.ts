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

      // Processa ou vincula recompensa/brinde/desconto de fidelidade resgatado ao pedido
      try {
        const cleanPhone = (savedOrder.customerPhone || '').replace(/\D/g, '');
        const loyaltyReward = (data as any).redeemedReward;

        if (loyaltyReward && loyaltyReward.rewardType && cleanPhone) {
          // O cliente selecionou uma recompensa no carrinho: efetiva o resgate AGORA vinculado a este pedido!
          const card = await this.prisma.loyaltyCard.findFirst({
            where: {
              storeId: savedOrder.storeId || storeId,
              customerPhone: { contains: cleanPhone.slice(-8) },
            },
          });

          if (card) {
            const program = await this.prisma.loyaltyProgram.findUnique({
              where: { storeId: savedOrder.storeId || storeId },
            });

            const rType = loyaltyReward.rewardType;
            const rTitle = loyaltyReward.rewardTitle || program?.rewardText || 'Brinde Fidelidade';
            const isPointsDiscount = rType === 'POINTS_DISCOUNT';
            const isCashback = rType === 'CASHBACK';

            // Cria o registro de redenção já com o orderId
            await this.prisma.loyaltyRewardRedemption.create({
              data: {
                storeId: savedOrder.storeId || storeId || '',
                loyaltyCardId: card.id,
                orderId: savedOrder.id,
                customerPhone: cleanPhone,
                customerName: card.customerName || savedOrder.customerName,
                rewardType: rType,
                rewardTitle: rTitle,
                status: (isPointsDiscount || isCashback) ? 'DELIVERED' : 'PENDING_DELIVERY',
              },
            });

            // Ao resgatar benefícios descartáveis (produto grátis, desconto por pontos, cashback), zera tudo no cartão.
            // Para PROGRESSIVE_DISCOUNT, é acumulativo: NÃO zera os pedidos do cliente!
            let updatedCard = card;
            if (rType !== 'PROGRESSIVE_DISCOUNT') {
              updatedCard = await this.prisma.loyaltyCard.update({
                where: { id: card.id },
                data: {
                  status: 'REDEEMED',
                  currentStamps: 0,
                  pointsBalance: 0,
                  cashbackBalance: 0,
                  totalCompleted: card.totalCompleted + 1,
                  startedAt: null,
                  expiresAt: null,
                },
              });
            }

            // Registra a transação detalhada correspondente
            if (isPointsDiscount) {
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'USE_POINTS',
                  pointsAmount: card.pointsBalance,
                  stampsCount: card.currentStamps,
                  description: `Desconto por pontos resgatado no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            } else if (isCashback) {
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'USE_CASHBACK',
                  cashbackAmount: card.cashbackBalance,
                  description: `Saldo de cashback resgatado no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            } else if (rType === 'PROGRESSIVE_DISCOUNT') {
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'USE_DISCOUNT',
                  stampsCount: card.currentStamps,
                  description: `Desconto progressivo aplicado no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            } else {
              // Brinde / Produto grátis
              await this.prisma.loyaltyTransaction.create({
                data: {
                  storeId: savedOrder.storeId || storeId || '',
                  loyaltyCardId: card.id,
                  orderId: savedOrder.id,
                  type: 'REDEEM_REWARD',
                  stampsCount: card.currentStamps,
                  description: `Recompensa resgatada no Pedido #${savedOrder.id.slice(-6).toUpperCase()}: ${rTitle}`,
                },
              });
            }

            // Notifica via socket
            try {
              this.eventsGateway.server.emit('loyalty.reward_redeemed', {
                storeId: savedOrder.storeId || storeId,
                customerName: card.customerName || savedOrder.customerName || 'Cliente',
                customerPhone: cleanPhone,
                rewardTitle: rTitle,
                rewardType: rType,
                orderId: savedOrder.id,
                createdAt: new Date(),
              });
              this.eventsGateway.server.emit('loyalty.card_updated', {
                storeId: savedOrder.storeId || storeId,
                cardId: card.id,
                customerPhone: cleanPhone,
              });
              this.eventsGateway.server.emit('loyalty.refresh', { storeId: savedOrder.storeId || storeId });
            } catch (wsErr) {
              console.error('[Loyalty] Erro ao emitir notificação de resgate:', wsErr);
            }
          }
        } else if (cleanPhone) {
          // Fallback para resgates que possam ter sido registrados anteriormente sem orderId
          const recentRedemption = await this.prisma.loyaltyRewardRedemption.findFirst({
            where: {
              customerPhone: { contains: cleanPhone.slice(-8) },
              orderId: null,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (recentRedemption) {
            await this.prisma.loyaltyRewardRedemption.update({
              where: { id: recentRedemption.id },
              data: { orderId: savedOrder.id },
            });
          }
        }
      } catch (err) {
        console.error('[Loyalty] Erro ao processar resgate de fidelidade no pedido:', err);
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
          // Estoque mínimo: 7 dias de cobertura (mínimo 3 unidades)
          const minStock = product.minStock ?? Math.max(3, Math.ceil((product.dailyRunRate ?? 0) * 7));
          const previousState = product.stockAlertState || 'OK';

          let newState = 'OK';
          if (totalStock === 0) {
            newState = 'OUT_OF_STOCK';
          } else if (
            product.coverageDays !== null && product.coverageDays <= 3
          ) {
            newState = 'CRITICAL';
          } else if (totalStock <= minStock) {
            newState = 'LOW_STOCK';
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
