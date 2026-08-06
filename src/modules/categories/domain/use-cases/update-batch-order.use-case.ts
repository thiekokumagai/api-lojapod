import { Injectable } from '@nestjs/common';
import { ICategoriesRepository } from '../repositories/icategories.repository';

export interface BatchOrderItem {
  id: string;
  order: number;
}

@Injectable()
export class UpdateBatchOrderUseCase {
  constructor(private readonly categoriesRepository: ICategoriesRepository) {}

  async execute(items: BatchOrderItem[]): Promise<void> {
    await this.categoriesRepository.updateBatchOrder(items);
  }
}
