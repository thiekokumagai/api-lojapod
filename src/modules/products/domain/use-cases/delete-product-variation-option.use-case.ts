import { Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class DeleteProductVariationOptionUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(
    productId: string,
    dto: { variationId: string; optionId: string },
  ) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    await this.productsRepository.deleteVariationOptionTransaction(
      productId,
      dto.optionId,
    );
    return this.productsRepository.findById(productId);
  }
}
