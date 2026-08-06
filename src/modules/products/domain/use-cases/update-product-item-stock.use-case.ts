import { Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';
import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class UpdateProductItemStockUseCase {
  constructor(
    private readonly productsRepository: IProductsRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(
    itemId: string,
    dto: { type: 'ADD' | 'SUBTRACT' | 'SET'; quantity: number; observation?: string },
  ) {
    const item = await this.productsRepository.findItemById(itemId);
    if (!item) {
      throw new NotFoundException('Item do produto não encontrado');
    }

    const updatedItem = await this.productsRepository.updateItemStock(
      itemId,
      dto.type,
      dto.quantity,
      dto.observation,
    );

    this.eventsGateway.server.emit('products.refresh');

    return updatedItem;
  }
}
