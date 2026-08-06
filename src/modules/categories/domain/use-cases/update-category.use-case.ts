import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity';
import { ICategoriesRepository } from '../repositories/icategories.repository';
import { CategoryNotFoundError } from '../exceptions/category-not-found.exception';

export interface UpdateCategoryInput {
  title?: string;
  image?: string | null;
  isVisible?: boolean;
  excludeFromBestSeller?: boolean;
  oldUrl?: string;
}

@Injectable()
export class UpdateCategoryUseCase {
  constructor(private readonly categoriesRepository: ICategoriesRepository) {}

  async execute(id: string, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new CategoryNotFoundError(id);
    }

    return this.categoriesRepository.update(id, input);
  }
}
