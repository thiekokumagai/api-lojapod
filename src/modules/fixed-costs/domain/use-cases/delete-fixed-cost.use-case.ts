import { Injectable, NotFoundException } from '@nestjs/common';
import { FixedCost } from '../entities/fixed-cost.entity';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

@Injectable()
export class DeleteFixedCostUseCase {
  constructor(private readonly repository: IFixedCostsRepository) {}

  async execute(id: string): Promise<FixedCost> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`FixedCost with ID ${id} not found`);
    }

    return this.repository.delete(id);
  }
}
