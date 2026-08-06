import { Injectable } from '@nestjs/common';
import { IVariationsRepository } from '../repositories/ivariations.repository';
import { normalizeOptionValues } from '../utils/normalize-options.util';

@Injectable()
export class CreateVariationUseCase {
  constructor(private readonly variationsRepository: IVariationsRepository) {}

  async execute(title: string, options: string[]) {
    const normalizedOptions = normalizeOptionValues(options);
    return this.variationsRepository.create(title.trim(), normalizedOptions);
  }
}
