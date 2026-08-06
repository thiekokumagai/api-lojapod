import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class UpdateOrderStatusUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly settingsRepository: ISettingsRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(
    id: string,
    payload: { status?: OrderStatus; paymentStatus?: PaymentStatus },
  ): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    try {
      if (payload.status === 'CANCELLED' && order.status !== 'CANCELLED') {
        const canceledOrder = await this.ordersRepository.cancelAndRestoreStock(id);
        this.eventsGateway.server.emit('products.refresh');
        this.eventsGateway.notifyOrderUpdated(canceledOrder);
        
        // If paymentStatus is also passed (unlikely but possible), apply it after cancellation
        if (payload.paymentStatus) {
           canceledOrder.paymentStatus = payload.paymentStatus;
           return await this.ordersRepository.save(canceledOrder);
        }
        return canceledOrder;
      }

      // Se estamos recuperando um pedido cancelado para outro status
      if (order.status === 'CANCELLED' && payload.status && payload.status !== 'CANCELLED') {
        const recoveredOrder = await this.ordersRepository.recoverAndDecrementStock(id, payload.status);
        this.eventsGateway.server.emit('products.refresh');
        this.eventsGateway.notifyOrderUpdated(recoveredOrder);
        
        // Atribui o novo pedido para a variável order para continuar o fluxo (ex: atualizar paymentStatus)
        Object.assign(order, recoveredOrder);
      } else if (payload.status) {
        order.status = payload.status;
      }
      if (payload.paymentStatus) {
        order.paymentStatus = payload.paymentStatus;
        if (payload.paymentStatus === PaymentStatus.PAID) {
          order.paymentDate = new Date();

          if (!order.totalReceived || order.totalReceived === 0) {
            let initialDiscount =
              (order.couponDiscount || 0) + (order.couponFreightDiscount || 0);
            // Fix for FREE_SHIPPING coupons that might have 0 discount saved
            if (
              order.coupon &&
              order.coupon.type === 'FREE_SHIPPING' &&
              initialDiscount === 0
            ) {
              initialDiscount = order.freight || 0;
              order.couponFreightDiscount = initialDiscount;
            }

            const baseTotal = (order.itemsTotal || 0) + (order.freight || 0);
            const totalDiscount = initialDiscount;
            const amountForFee = baseTotal - totalDiscount;
            const productDiscount = order.couponDiscount || 0;
            const baseForPix = Math.max(
              0,
              (order.itemsTotal || 0) - productDiscount,
            );

            let pixDiscount = 0;
            let cardSurcharge = 0;

            const methodMap: Record<string, string> = {
              'Cartão de Crédito': 'credit',
              'Cartão de Débito': 'debit',
              PIX: 'pix',
              Dinheiro: 'cash',
              'credito': 'credit',
              'debito': 'debit',
              'pix': 'pix',
              'dinheiro': 'cash',
              'credit': 'credit',
              'debit': 'debit',
              'cash': 'cash',
            };

            const normalizedMethod = methodMap[order.paymentMethod || ''];

            if (normalizedMethod) {
              const settings = await this.settingsRepository.get();
              if (settings && Array.isArray(settings.paymentRules)) {
                const rules = settings.paymentRules;

                // PIX Discount
                if (normalizedMethod === 'pix') {
                  const pixRule = rules.find(
                    (r) => r.paymentMethod === 'pix' && r.type === 'discount',
                  );
                  if (pixRule && typeof pixRule.value === 'number') {
                    pixDiscount =
                      Math.round(baseForPix * (pixRule.value / 100) * 100) /
                      100;
                  }
                }

                // Card Surcharge (Passed to Customer)
                if (normalizedMethod === 'credit') {
                  const inst = order.installments || 1;
                  const surchargeRule = rules.find(
                    (r) =>
                      r.paymentMethod === 'credit' &&
                      r.type === 'charge' &&
                      inst >= (r.parcelaMin || 0) &&
                      inst <= (r.parcelaMax || 99),
                  );
                  if (
                    surchargeRule &&
                    typeof surchargeRule.value === 'number' &&
                    surchargeRule.passedToCustomer !== false
                  ) {
                    cardSurcharge =
                      Math.round(
                        amountForFee * (surchargeRule.value / 100) * 100,
                      ) / 100;
                  }
                } else if (normalizedMethod === 'debit') {
                  const surchargeRule = rules.find(
                    (r) => r.paymentMethod === 'debit' && r.type === 'charge',
                  );
                  if (
                    surchargeRule &&
                    typeof surchargeRule.value === 'number' &&
                    surchargeRule.passedToCustomer !== false
                  ) {
                    cardSurcharge =
                      Math.round(
                        amountForFee * (surchargeRule.value / 100) * 100,
                      ) / 100;
                  }
                }

                // Calculate standard total to check if there is a manual override
                const previousCalculatedTotal =
                  Math.round(
                    (baseTotal +
                      (order.installmentSurcharge || 0) +
                      (order.receiptSurcharge || 0) -
                      (order.paymentDiscount || 0) -
                      totalDiscount) *
                      100,
                  ) / 100;

                const isCustomTotal = order.totalOrder && order.totalOrder !== previousCalculatedTotal;

                const calculatedTotal =
                  Math.round(
                    (baseTotal +
                      cardSurcharge +
                      (order.receiptSurcharge || 0) -
                      pixDiscount -
                      totalDiscount) *
                      100,
                  ) / 100;
                  
                if (isCustomTotal) {
                  order.totalReceived = order.totalOrder;
                } else {
                  // Keep the existing paymentDiscount and installmentSurcharge
                  // unless they don't exist, in which case use the calculated ones.
                  order.paymentDiscount = order.paymentDiscount !== undefined ? order.paymentDiscount : pixDiscount;
                  order.installmentSurcharge = order.installmentSurcharge !== undefined ? order.installmentSurcharge : cardSurcharge;
                  
                  // Recalculate based on the preserved or new discounts
                  const preservedCalculatedTotal = Math.round(
                    (baseTotal +
                      (order.installmentSurcharge || 0) +
                      (order.receiptSurcharge || 0) -
                      (order.paymentDiscount || 0) -
                      totalDiscount) * 100
                  ) / 100;
                  
                  order.totalReceived = preservedCalculatedTotal;
                  order.totalOrder = preservedCalculatedTotal;
                }
              } else {
                order.totalReceived =
                  Math.round(
                    (baseTotal +
                      (order.receiptSurcharge || 0) -
                      totalDiscount) *
                      100,
                  ) / 100;
                order.totalOrder = order.totalReceived;
              }
            } else {
              order.totalReceived =
                Math.round(
                  (baseTotal + (order.receiptSurcharge || 0) - totalDiscount) *
                    100,
                ) / 100;
              order.totalOrder = order.totalReceived;
            }
          }

          // Card Fee (Kept by Shop) - Calculate always when status is PAID
          let cardFee = 0;
          const methodMap: Record<string, string> = {
            'Cartão de Crédito': 'credit',
            'Cartão de Débito': 'debit',
            PIX: 'pix',
            Dinheiro: 'cash',
            'credito': 'credit',
            'debito': 'debit',
            'pix': 'pix',
            'dinheiro': 'cash',
            'credit': 'credit',
            'debit': 'debit',
            'cash': 'cash',
          };

          const normalizedMethod = methodMap[order.paymentMethod || ''] || (order.paymentMethod ? order.paymentMethod.toLowerCase() : '');

          if (normalizedMethod) {
            const settings = await this.settingsRepository.get();
            if (settings && Array.isArray(settings.paymentRules)) {
              const rules = settings.paymentRules;
              let matchingRule: any = null;
              if (normalizedMethod === 'credit') {
                const inst = order.installments || 1;
                matchingRule = rules.find(
                  (r) =>
                    r.paymentMethod === 'credit' &&
                    r.type === 'charge' &&
                    inst >= (r.parcelaMin || 0) &&
                    inst <= (r.parcelaMax || 99),
                );
              } else {
                matchingRule = rules.find(
                  (r) =>
                    r.paymentMethod === normalizedMethod &&
                    r.type === 'charge',
                );
              }

              if (matchingRule && typeof matchingRule.value === 'number') {
                const amountForCardFee = order.totalReceived || order.totalOrder || 0;
                const rawFee = amountForCardFee * (matchingRule.value / 100);
                cardFee = Math.round(rawFee * 100) / 100;
              }
            }
          }

          order.cardFee = cardFee;
        } else if (payload.paymentStatus === PaymentStatus.PENDING) {
          order.paymentDate = null as any; // Prisma requires null or undefined based on schema
          order.totalReceived = 0;
          order.cardFee = 0;
        }
      }

      const savedOrder = await this.ordersRepository.save(order);
      this.eventsGateway.notifyOrderUpdated(savedOrder);
      this.eventsGateway.server.emit('products.refresh'); // Update stock info if any
      return savedOrder;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
