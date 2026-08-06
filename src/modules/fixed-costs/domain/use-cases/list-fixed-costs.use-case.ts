import { Injectable } from '@nestjs/common';
import { FixedCost } from '../entities/fixed-cost.entity';
import { IFixedCostsRepository } from '../repositories/ifixed-costs.repository';

@Injectable()
export class ListFixedCostsUseCase {
  constructor(private readonly repository: IFixedCostsRepository) {}

  async execute(): Promise<FixedCost[]> {
    return this.repository.findAll();
  }
}
