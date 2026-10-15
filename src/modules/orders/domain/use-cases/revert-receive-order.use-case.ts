import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order, PaymentStatus } from '../entities/order.entity';
import { EventsGateway } from '../../../events/events.gateway';
import { LoyaltyService } from '../../../loyalty/domain/loyalty.service';

@Injectable()
export class RevertReceiveOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly eventsGateway: EventsGateway,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async execute(id: string): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    order.paymentStatus = PaymentStatus.PENDING;
    order.paymentDate = null;
    order.totalReceived = 0;
    order.receiptSurcharge = 0;
    order.receiptDiscount = 0;
    order.paymentDiscount = 0;
    order.installmentSurcharge = 0;
    order.cardFee = 0;

    const savedOrder = await this.ordersRepository.save(order);
    this.eventsGateway.notifyOrderUpdated(savedOrder);

    // Se o pedido não estiver concluído, estorna pontos/selos que foram concedidos ao receber
    if (savedOrder.status !== 'COMPLETED') {
      try {
        await this.loyaltyService.revertOrderLoyalty(id);
      } catch (loyaltyErr) {
        console.error('[RevertReceiveOrder] Erro ao estornar fidelidade ao desfazer recebimento:', loyaltyErr);
      }
    }

    return savedOrder;
  }
}
