import { Injectable } from '@nestjs/common';
import { FixedCost } from '../entities/fixed-cost.entity';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

export interface CreateFixedCostInput {
  name: string;
  value: number;
  repeats?: boolean;
  type?: string;
  installmentsCount?: number | null;
}

@Injectable()
export class CreateFixedCostUseCase {
  constructor(private readonly repository: IFixedCostsRepository) {}

  async execute(input: CreateFixedCostInput): Promise<FixedCost> {
    return this.repository.create({
      name: input.name,
      value: input.value,
      repeats: input.repeats ?? true,
      type: input.type ?? 'ALWAYS',
      installmentsCount: input.installmentsCount ?? null,
    });
  }
}
