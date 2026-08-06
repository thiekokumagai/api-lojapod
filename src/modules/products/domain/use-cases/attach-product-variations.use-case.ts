import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class AttachProductVariationsUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(productId: string, dto: { variationIds: string[] }) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const uniqueVariationIds = [...new Set(dto.variationIds)];

    const variations =
      await this.productsRepository.findVariationsByIds(uniqueVariationIds);

    if (variations.length !== uniqueVariationIds.length) {
      throw new BadRequestException('Uma ou mais variações são inválidas');
    }

    const existing = await this.productsRepository.findProductVariations(
      productId,
      uniqueVariationIds,
    );

    if (existing.length > 0) {
      throw new ConflictException(
        'Não pode existir duplicação de variação dentro do mesmo produto',
      );
    }

    await this.productsRepository.attachVariations(
      productId,
      uniqueVariationIds,
    );

    return this.productsRepository.findById(productId);
  }
}
