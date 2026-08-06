import { Injectable } from '@nestjs/common';
import { IVariationsRepository } from '../repositories/ivariations.repository';
import { VariationNotFoundError } from '../exceptions/variation-not-found.exception';

@Injectable()
export class GetVariationUseCase {
  constructor(private readonly variationsRepository: IVariationsRepository) {}

  async execute(id: string) {
    const variation = await this.variationsRepository.findById(id);
    if (!variation) {
      throw new VariationNotFoundError();
    }
    return variation;
  }
}
