import { Injectable, NotFoundException } from '@nestjs/common';
import { IOrdersRepository } from '../repositories/iorders.repository';
import { Order } from '../entities/order.entity';

@Injectable()
export class GetOrderDetailUseCase {
  constructor(private readonly ordersRepository: IOrdersRepository) {}

  async execute(id: string): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return order;
  }
}
