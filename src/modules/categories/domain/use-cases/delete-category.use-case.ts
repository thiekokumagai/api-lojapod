import { Injectable } from '@nestjs/common';
import { ICategoriesRepository } from '../repositories/icategories.repository';
import { CategoryNotFoundError } from '../exceptions/category-not-found.exception';

@Injectable()
export class DeleteCategoryUseCase {
  constructor(private readonly categoriesRepository: ICategoriesRepository) {}

  async execute(id: string): Promise<{ id: string }> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new CategoryNotFoundError(id);
    }

    await this.categoriesRepository.softDelete(id);
    await this.categoriesRepository.decrementOrdersAbove(category.order);

    return { id: category.id };
  }
}
