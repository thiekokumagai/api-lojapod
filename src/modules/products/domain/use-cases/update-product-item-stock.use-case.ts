import { Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';
import { EventsGateway } from '../../../events/events.gateway';
import { CombosService } from '../../../combos/infrastructure/services/combos.service';

@Injectable()
export class UpdateProductItemStockUseCase {
  constructor(
    private readonly productsRepository: IProductsRepository,
    private readonly eventsGateway: EventsGateway,
    private readonly combosService: CombosService,
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

    if (updatedItem?.productId) {
      const prod = await this.productsRepository.findById(updatedItem.productId);
      if (prod && prod.isVisible === false) {
        try {
          await this.combosService.checkAndDeactivateAffectedCombos(prod.id);
        } catch (err) {
          console.error('Erro ao desativar combos afetados pelo estoque:', err);
        }
      }
    }

    this.eventsGateway.server.emit('products.refresh');

    return updatedItem;
  }
}
