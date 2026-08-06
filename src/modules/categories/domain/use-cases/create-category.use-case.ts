import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity';
import { ICategoriesRepository } from '../repositories/icategories.repository';

export interface CreateCategoryInput {
  title: string;
  image?: string | null;
  isVisible?: boolean;
  excludeFromBestSeller?: boolean;
  oldUrl?: string;
}

@Injectable()
export class CreateCategoryUseCase {
  constructor(private readonly categoriesRepository: ICategoriesRepository) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    const lastOrder = await this.categoriesRepository.findLastOrder();
    const nextOrder = lastOrder + 1;

    return this.categoriesRepository.create({
      title: input.title,
      image: input.image ?? null,
      isVisible: input.isVisible ?? true,
      excludeFromBestSeller: input.excludeFromBestSeller ?? false,
      oldUrl: input.oldUrl ?? null,
      order: nextOrder,
    });
  }
}
