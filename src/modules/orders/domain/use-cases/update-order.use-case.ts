import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { ValidateCouponUseCase } from '../../../coupons/domain/use-cases/validate-coupon.use-case';
import type { ICouponsRepository } from '../../../coupons/domain/repositories/icoupons.repository';
import { PrintGateway } from '../../../print/print.gateway';
import { EventsGateway } from '../../../events/events.gateway';
import { TenantContextService } from '../../../tenant/tenant-context.service';

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
  ) {}

  async execute(
    id: string,
    data: Partial<Order> & { couponTitle?: string, showProductPrices?: boolean },
  ): Promise<Order> {
    try {
      const existingOrder = await this.ordersRepository.findById(id);
      if (!existingOrder) throw new BadRequestException('Pedido não encontrado.');

      if (existingOrder.status !== 'PENDING') {
        throw new BadRequestException('Apenas pedidos com status pendente podem ser editados.');
      }

      let couponId: string | undefined = undefined;
      let couponDiscountValue = Number(data.couponDiscount) || 0;
      let couponFreightDiscountValue = Number(data.couponFreightDiscount) || 0;

      const storeId = data.storeId || existingOrder.storeId || this.tenantContextService.getStoreId() || undefined;

      if (data.couponTitle) {
        const { coupon, discountAmount } =
          await this.validateCouponUseCase.execute({
            title: data.couponTitle,
            orderTotal: Number(data.itemsTotal) || 0,
          });

        couponId = coupon.id;
        if (coupon.type === 'FREE_SHIPPING') {
          couponFreightDiscountValue = Number(data.freight) || 0;
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

      const itemsTotal = Number(orderToUpdate.itemsTotal) || 0;
      const freight = Number(orderToUpdate.freight) || 0;
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
