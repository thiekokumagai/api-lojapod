import { Injectable, NotFoundException } from '@nestjs/common';
import { IOrdersRepository } from '../../domain/repositories/iorders.repository';

@Injectable()
export class MarkOrderPrintedUseCase {
  constructor(private readonly ordersRepository: IOrdersRepository) {}

  async execute(id: string): Promise<void> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    order.isPrinted = true;
    await this.ordersRepository.save(order);
  }
}
