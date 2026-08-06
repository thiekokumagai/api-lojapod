import { Injectable, BadRequestException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class CreateProductUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(dto: {
    title: string;
    description?: string;
    descriptionFormated?: string;
    categoryId: string;
    price?: any;
    promotionalPrice?: any;
    costPrice?: any;
    createdAt?: string;
    isVisible?: boolean;
  }) {
    const categoryExists = await this.productsRepository.checkCategoryExists(
      dto.categoryId,
    );
    if (!categoryExists) {
      throw new BadRequestException('Categoria inválida');
    }

    const product = await this.productsRepository.create({
      title: dto.title.trim(),
      description: dto.description,
      descriptionFormated: dto.descriptionFormated,
      categoryId: dto.categoryId,
      price: dto.price,
      promotionalPrice: dto.promotionalPrice,
      costPrice: dto.costPrice,
      createdAt: dto.createdAt,
      isVisible: dto.isVisible,
    });

    return this.productsRepository.findById(product.id);
  }
}
