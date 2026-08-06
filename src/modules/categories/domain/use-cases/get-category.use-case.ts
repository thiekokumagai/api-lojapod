import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity';
import { ICategoriesRepository } from '../repositories/icategories.repository';
import { CategoryNotFoundError } from '../exceptions/category-not-found.exception';

@Injectable()
export class GetCategoryUseCase {
  constructor(private readonly categoriesRepository: ICategoriesRepository) {}

  async execute(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new CategoryNotFoundError(id);
    }
    return category;
  }
}
