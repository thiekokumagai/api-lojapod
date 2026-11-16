import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import { EventsGateway } from '../../../events/events.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';
import { ALLOWED_PAYMENT_METHODS } from '../../infrastructure/dtos/receive-order.dto';

@Injectable()
export class ReceiveOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly settingsRepository: ISettingsRepository,
    private readonly eventsGateway: EventsGateway,
    private readonly loyaltyService: LoyaltyService,
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
    currentUser?: { storeId?: string | null; role?: string } | null,
  ): Promise<Order> {
    const storeFilter =
      currentUser && currentUser.role !== 'SUPER_ADMIN'
        ? currentUser.storeId ?? '__NO_STORE__'
        : undefined;

    const order = await this.ordersRepository.findById(id, storeFilter);
    if (
      !order ||
      (currentUser &&
        currentUser.role !== 'SUPER_ADMIN' &&
        (!currentUser.storeId || order.storeId !== currentUser.storeId))
    ) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot receive a cancelled order');
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('Pedido já recebido');
    }

    if (payload.installments !== undefined) {
      if (payload.installments < 1 || payload.installments > 12) {
        throw new BadRequestException('Número de parcelas deve ser entre 1 e 12');
      }
    }

    if (payload.paymentMethod && !ALLOWED_PAYMENT_METHODS.includes(payload.paymentMethod)) {
      throw new BadRequestException(`Forma de pagamento inválida: ${payload.paymentMethod}`);
    }

    const itemsTotal = Number(order.itemsTotal) || 0;
    const freight = Number(order.freight) || 0;
    const maxDiscount = Math.round((itemsTotal + freight) * 100);

    const pDiscount =
      Number(payload.paymentDiscount !== undefined ? payload.paymentDiscount : order.paymentDiscount) || 0;
    const rDiscount =
      Number(payload.receiptDiscount !== undefined ? payload.receiptDiscount : order.receiptDiscount) || 0;
    const cDiscount =
      Number(payload.couponDiscount !== undefined ? payload.couponDiscount : order.couponDiscount) || 0;
    const cFDiscount =
      Number(
        payload.couponFreightDiscount !== undefined
          ? payload.couponFreightDiscount
          : order.couponFreightDiscount,
      ) || 0;

    const totalDiscounts = Math.round((pDiscount + rDiscount + cDiscount + cFDiscount) * 100);
    if (totalDiscounts > maxDiscount) {
      throw new BadRequestException('Descontos não podem ultrapassar o valor dos itens mais frete');
    }

    const iSurcharge =
      Number(
        payload.installmentSurcharge !== undefined
          ? payload.installmentSurcharge
          : order.installmentSurcharge,
      ) || 0;
    const rSurcharge =
      Number(payload.receiptSurcharge !== undefined ? payload.receiptSurcharge : order.receiptSurcharge) || 0;

    const calculatedTotalOrder =
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

    const receivedCents = Math.round(Number(payload.totalReceived) * 100);
    const calculatedCents = Math.round(calculatedTotalOrder * 100);

    if (receivedCents < calculatedCents) {
      throw new BadRequestException('Valor recebido não pode ser menor que o total calculado do pedido');
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
    order.totalOrder = calculatedTotalOrder;

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
      'Vale Refeição': 'meal_voucher',
      'vale refeição': 'meal_voucher',
      'vale_refeicao': 'meal_voucher',
      'meal_voucher': 'meal_voucher',
      'Vale Alimentação': 'food_voucher',
      'vale alimentação': 'food_voucher',
      'vale_alimentacao': 'food_voucher',
      'food_voucher': 'food_voucher',
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

    // Atribuição de pontos/cashback/selos quando o pedido for recebido/pago
    this.loyaltyService.processOrderCompleted({
      id: savedOrder.id,
      storeId: savedOrder.storeId,
      customerPhone: savedOrder.customerPhone,
      customerName: savedOrder.customerName,
      totalOrder: savedOrder.totalOrder,
    }).catch((err) => {
      console.error('[Loyalty] Erro ao processar fidelidade no recebimento:', err);
    });

    return savedOrder;
  }
}
