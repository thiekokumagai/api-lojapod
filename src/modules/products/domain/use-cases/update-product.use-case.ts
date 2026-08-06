import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

import { EventsGateway } from '../../../events/events.gateway';

@Injectable()
export class UpdateProductUseCase {
  constructor(
    private readonly productsRepository: IProductsRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(
    id: string,
    dto: {
      title?: string;
      description?: string;
      descriptionFormated?: string;
      categoryId?: string;
      price?: any;
      promotionalPrice?: any;
      costPrice?: any;
      isVisible?: boolean;
    },
  ) {
    const existing = await this.productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Produto não encontrado');
    }

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const categoryExists = await this.productsRepository.checkCategoryExists(
        dto.categoryId,
      );
      if (!categoryExists) {
        throw new BadRequestException('Categoria inválida');
      }
    }

    await this.productsRepository.update(id, {
      title: dto.title?.trim(),
      description: dto.description,
      descriptionFormated: dto.descriptionFormated,
      categoryId: dto.categoryId,
      price: dto.price,
      promotionalPrice: dto.promotionalPrice,
      costPrice: dto.costPrice,
      isVisible: dto.isVisible,
    });

    const updatedProduct = await this.productsRepository.findById(id);
    
    // Se a visibilidade foi alterada ou algo importante que afete o catálogo
    this.eventsGateway.server.emit('products.refresh');

    return updatedProduct;
  }
}
