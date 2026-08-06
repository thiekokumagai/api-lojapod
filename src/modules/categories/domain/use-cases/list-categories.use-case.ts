import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity';
import { ICategoriesRepository } from '../repositories/icategories.repository';

@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categoriesRepository: ICategoriesRepository) {}

  async execute(): Promise<Category[]> {
    return this.categoriesRepository.findAll();
  }
}
