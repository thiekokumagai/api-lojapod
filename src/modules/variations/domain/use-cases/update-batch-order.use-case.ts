import { Injectable, NotFoundException } from '@nestjs/common';
import { IVariationsRepository } from '../repositories/ivariations.repository';

@Injectable()
export class UpdateBatchOrderUseCase {
  constructor(private readonly variationsRepository: IVariationsRepository) {}

  async execute(items: { id: string; order: number }[]) {
    const ids = items.map((i) => i.id);
    const existingOptions =
      await this.variationsRepository.findOptionsByIds(ids);

    if (existingOptions.length !== items.length) {
      throw new NotFoundException('Alguns itens não foram encontrados');
    }

    return this.variationsRepository.updateBatchOrder(items);
  }
}
