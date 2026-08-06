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
export class ReceiveOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly settingsRepository: ISettingsRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(
    id: string,
    payload: {
      paymentMethod?: string;
      paymentType?: string;

      paymentDiscount?: number;
      installmentSurcharge?: number;
      couponDiscount?: number;
      couponFreightDiscount?: number;
      receiptDiscount?: number;
      receiptSurcharge?: number;
      totalReceived: number;
      installments?: number;
    },
  ): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot receive a cancelled order');
    }

    order.paymentMethod = payload.paymentMethod || order.paymentMethod;
    if (payload.paymentType) {
      order.paymentType = payload.paymentType;
    }

    // Assign new fields
    if (payload.paymentDiscount !== undefined)
      order.paymentDiscount = payload.paymentDiscount;
    if (payload.installmentSurcharge !== undefined)
      order.installmentSurcharge = payload.installmentSurcharge;
    if (payload.couponDiscount !== undefined)
      order.couponDiscount = payload.couponDiscount;
    if (payload.couponFreightDiscount !== undefined)
      order.couponFreightDiscount = payload.couponFreightDiscount;
    if (payload.receiptDiscount !== undefined)
      order.receiptDiscount = payload.receiptDiscount;
    if (payload.receiptSurcharge !== undefined)
      order.receiptSurcharge = payload.receiptSurcharge;

    order.totalReceived = payload.totalReceived;

    const itemsTotal = Number(order.itemsTotal) || 0;
    const freight = Number(order.freight) || 0;
    const pDiscount = Number(order.paymentDiscount) || 0;
    const rDiscount = Number(order.receiptDiscount) || 0;
    const cDiscount = Number(order.couponDiscount) || 0;
    const cFDiscount = Number(order.couponFreightDiscount) || 0;
    const iSurcharge = Number(order.installmentSurcharge) || 0;
    const rSurcharge = Number(order.receiptSurcharge) || 0;

    order.totalOrder =
      Math.round(
        (itemsTotal +
          freight +
          iSurcharge +
          rSurcharge -
          pDiscount -
          rDiscount -
          cDiscount -
          cFDiscount) *
          100,
      ) / 100;

    order.paymentStatus = PaymentStatus.PAID;
    order.paymentDate = new Date();

    if (payload.installments) {
      order.installments = payload.installments;
    } else {
      order.installments = 1;
    }

    // Cálculo dinâmico da taxa de transação (cardFee) baseada nas regras ativas
    let cardFee = 0;
    const methodMap: Record<string, string> = {
      'Cartão de Crédito': 'credit',
      'credito': 'credit',
      'credit': 'credit',
      'Cartão de Débito': 'debit',
      'debito': 'debit',
      'debit': 'debit',
      'PIX': 'pix',
      'pix': 'pix',
      'Dinheiro': 'cash',
      'dinheiro': 'cash',
      'cash': 'cash',
    };

    const normalizedMethod = methodMap[order.paymentMethod] || order.paymentMethod;
    if (normalizedMethod) {
      const settings = await this.settingsRepository.get();
      if (settings && Array.isArray(settings.paymentRules)) {
        const rules = settings.paymentRules;

        let matchingRule: any = null;
        if (normalizedMethod === 'credit') {
          // Para crédito, busca por parcelaMin e parcelaMax
          const inst = order.installments || 1;
          matchingRule = rules.find(
            (r) =>
              r.paymentMethod === 'credit' &&
              r.type === 'charge' &&
              inst >= (r.parcelaMin || 0) &&
              inst <= (r.parcelaMax || 99),
          );
        } else {
          // Outros métodos de pagamento
          matchingRule = rules.find(
            (r) => r.paymentMethod === normalizedMethod && r.type === 'charge',
          );
        }

        if (matchingRule && typeof matchingRule.value === 'number') {
          const rawFee = order.totalReceived * (matchingRule.value / 100);
          cardFee = Math.round(rawFee * 100) / 100;
        }
      }
    }

    order.cardFee = cardFee;

    const savedOrder = await this.ordersRepository.save(order);
    this.eventsGateway.notifyOrderUpdated(savedOrder);
    return savedOrder;
  }
}
