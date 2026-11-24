import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { ValidateCouponUseCase } from '../../../coupons/domain/use-cases/validate-coupon.use-case';
import type { ICouponsRepository } from '../../../coupons/domain/repositories/icoupons.repository';
import { PrintGateway } from '../../../print/print.gateway';
import { EventsGateway } from '../../../events/events.gateway';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import { pixTerminalPaymentType } from '../utils/pix-terminal';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { applyWeightedItem, takeWeightInput } from '../utils/weighted-item';
import {
  resetNonProductCustomization,
  resolveCustomizedAllowedPrices,
} from '../utils/order-customization';

@Injectable()
export class UpdateOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly validateCouponUseCase: ValidateCouponUseCase,
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
    private readonly printGateway: PrintGateway,
    private readonly eventsGateway: EventsGateway,
    private readonly tenantContextService: TenantContextService,
    private readonly settingsRepository: ISettingsRepository,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async execute(
    id: string,
    data: Partial<Order> & { couponTitle?: string; showProductPrices?: boolean },
    currentUser?: { storeId?: string | null; role?: string } | null,
  ): Promise<Order> {
    try {
      const storeFilter =
        currentUser && currentUser.role !== 'SUPER_ADMIN'
          ? (currentUser.storeId ?? '__NO_STORE__')
          : undefined;

      const existingOrder = await this.ordersRepository.findById(
        id,
        storeFilter,
      );
      if (
        !existingOrder ||
        (currentUser &&
          currentUser.role !== 'SUPER_ADMIN' &&
          (!currentUser.storeId ||
            existingOrder.storeId !== currentUser.storeId))
      ) {
        throw new NotFoundException('Pedido não encontrado.');
      }

      if (existingOrder.status !== 'PENDING') {
        throw new BadRequestException('Apenas pedidos com status pendente podem ser editados.');
      }

      let couponId: string | undefined = undefined;
      let couponDiscountValue = Number(data.couponDiscount) || 0;
      let couponFreightDiscountValue = Number(data.couponFreightDiscount) || 0;

      const storeId =
        existingOrder.storeId ||
        this.tenantContextService.getStoreId() ||
        undefined;

      if (data.couponTitle) {
        const { coupon, discountAmount } =
          await this.validateCouponUseCase.execute({
            title: data.couponTitle,
            orderTotal: Number(data.itemsTotal) || 0,
          });

        couponId = coupon.id;
        if (coupon.type === 'FREE_SHIPPING') {
          couponFreightDiscountValue = Number(data.freight) > 0 ? Number(data.freight) : 0;
        } else {
          couponDiscountValue = discountAmount;
        }
      }

      const orderToUpdate = new Order({
        ...existingOrder,
        ...data,
        storeId,
        couponDiscount: couponDiscountValue,
        couponFreightDiscount: couponFreightDiscountValue,
        couponId: couponId,
      });

      const storeSettings = await this.settingsRepository
        .get()
        .catch(() => null);

      // Venda por peso (mesma regra do CreateOrderUseCase). Só quando a tela reenviou os itens:
      // sem `items` no corpo os itens gravados não mudam e o peso deles segue como está.
      if (Array.isArray(data.items) && Array.isArray(orderToUpdate.items)) {
        await this.applyWeightRules(orderToUpdate, storeId, storeSettings?.promoPaymentMethods);
      }

      // Saneamento da montagem dos itens (mesma regra do CreateOrderUseCase)
      if (Array.isArray(orderToUpdate.items)) {
        for (const item of orderToUpdate.items) {
          if (typeof (item as any).observation === 'string') {
            const trimmedObs = (item as any).observation.trim();
            (item as any).observation = trimmedObs ? trimmedObs.slice(0, 300) : null;
          } else if ((item as any).observation !== undefined) {
            (item as any).observation = null;
          }
          if (resetNonProductCustomization(item) || !item.isCustomized || !item.productId) {
            item.isCustomized = false;
            item.customizationSnapshot = undefined;
          } else {
            if (!this.prisma) {
              throw new BadRequestException(
                'Serviço de banco indisponível para validar personalização do item.',
              );
            }
            const prod = await this.prisma.product.findFirst({
              where: {
                id: item.productId,
                ...(storeId ? { storeId } : {}),
              },
            });
            if (!prod) {
              throw new BadRequestException(
                'Produto do item personalizado não encontrado.',
              );
            }
            const customResult = await resolveCustomizedAllowedPrices(
              prod,
              item,
              this.prisma,
              storeId,
            );
            item.customizationSnapshot = customResult.sanitizedSnapshot;
          }
        }
      }

      // Pix na maquininha: Pix não pago nunca fica `online` (seria tratado como já pago)
      orderToUpdate.paymentType =
        pixTerminalPaymentType(orderToUpdate, storeSettings) ??
        orderToUpdate.paymentType;

      const itemsTotal = Number(orderToUpdate.itemsTotal) || 0;
      const freight = Number(orderToUpdate.freight) > 0 ? Number(orderToUpdate.freight) : 0;
      const installmentSurcharge = Number(orderToUpdate.installmentSurcharge) || 0;
      const receiptSurcharge = Number(orderToUpdate.receiptSurcharge) || 0;
      const paymentDiscount = Number(orderToUpdate.paymentDiscount) || 0;
      const receiptDiscount = Number(orderToUpdate.receiptDiscount) || 0;
      const cDiscount = Number(orderToUpdate.couponDiscount) || 0;
      const cFDiscount = Number(orderToUpdate.couponFreightDiscount) || 0;

      const calculatedTotal =
        Math.round(
          (itemsTotal + freight + installmentSurcharge + receiptSurcharge - paymentDiscount - receiptDiscount - cDiscount - cFDiscount) * 100,
        ) / 100;
        
      orderToUpdate.totalOrder = data.totalOrder !== undefined ? data.totalOrder : calculatedTotal;
      
      const savedOrder = await this.ordersRepository.updateWithStockAdjustment(id, orderToUpdate);

      if (couponId && couponId !== existingOrder.couponId) {
        const coupon = await this.couponsRepository.findById(couponId);
        if (coupon) {
          await this.couponsRepository.update(couponId, {
            currentUses: coupon.currentUses + 1,
          });
        }
      }

      try {
        if (savedOrder.status !== 'CANCELLED') {
          const orderForPrint = { ...savedOrder, showProductPrices: data.showProductPrices };
          const printStoreId = savedOrder.storeId || existingOrder.storeId || storeId || '1';
          this.printGateway.emitNovoPedido(printStoreId, orderForPrint);
        }
      } catch (err) {
        console.error('Erro ao emitir pedido para impressão', err);
      }

      try {
        this.eventsGateway.notifyNewOrder(savedOrder);
        this.eventsGateway.notifyCatalogRefresh(savedOrder.storeId || existingOrder.storeId);
      } catch (err) {
        console.error('Erro ao emitir eventos websocket', err);
      }

      return savedOrder;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  /** Confere cada item por peso com o cadastro e limpa o peso dos itens que não são por peso. */
  private async applyWeightRules(
    order: Order,
    storeId: string | undefined,
    promoPaymentMethods: unknown,
  ): Promise<void> {
    const paymentMethod = String(order.paymentMethod ?? '').toLowerCase();
    const promoMethods = Array.isArray(promoPaymentMethods) ? promoPaymentMethods : ['pix'];
    const promoAllowed =
      !paymentMethod || promoMethods.map((m) => String(m).toLowerCase()).includes(paymentMethod);

    for (const item of order.items ?? []) {
      const weightInput = takeWeightInput(item);
      if (!item.productId || item.isCombo || item.comboId || !this.prisma) continue;
      const prod = await this.prisma.product.findFirst({
        where: { id: item.productId, ...(storeId ? { storeId } : {}) },
        select: { title: true, price: true, promotionalPrice: true, isSoldByWeight: true },
      });
      if (prod?.isSoldByWeight) {
        applyWeightedItem(prod, item, weightInput, { promoAllowed });
      }
    }
  }
}
