import { Injectable, NotFoundException } from '@nestjs/common';
import { FixedCost } from '../entities/fixed-cost.entity';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

export interface UpdateFixedCostInput {
  name?: string;
  value?: number;
  repeats?: boolean;
  type?: string;
  installmentsCount?: number | null;
}

@Injectable()
export class UpdateFixedCostUseCase {
  constructor(private readonly repository: IFixedCostsRepository) {}

  async execute(id: string, input: UpdateFixedCostInput): Promise<FixedCost> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`FixedCost with ID ${id} not found`);
    }

    return this.repository.update(id, input);
  }
}
