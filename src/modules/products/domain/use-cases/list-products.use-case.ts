import { Injectable } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class ListProductsUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async execute(query: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    isVisible?: boolean;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productsRepository.findAll({
        skip,
        take: limit,
        search: query.search,
        categoryId: query.categoryId,
        isVisible: query.isVisible,
      }),
      this.productsRepository.count({
        search: query.search,
        categoryId: query.categoryId,
        isVisible: query.isVisible,
      }),
    ]);

    return { products, total };
  }
}
