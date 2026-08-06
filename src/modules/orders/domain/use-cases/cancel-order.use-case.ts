import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class CancelOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(id: string): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    try {
      const canceledOrder = await this.ordersRepository.cancelAndRestoreStock(id);
      
      // Notify client front to update catalog since stock changed
      this.eventsGateway.server.emit('products.refresh');
      this.eventsGateway.notifyOrderUpdated(canceledOrder);
      
      return canceledOrder;
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }
}
