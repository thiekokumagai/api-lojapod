import { Injectable } from '@nestjs/common';
import { IVariationsRepository } from '../repositories/ivariations.repository';
import { normalizeOptionValues } from '../utils/normalize-options.util';
import { VariationNotFoundError } from '../exceptions/variation-not-found.exception';
import { OptionInUseError } from '../exceptions/option-in-use.exception';

@Injectable()
export class UpdateVariationUseCase {
  constructor(private readonly variationsRepository: IVariationsRepository) {}

  async execute(id: string, title?: string, options?: string[]) {
    const variation = await this.variationsRepository.findById(id);
    if (!variation) {
      throw new VariationNotFoundError();
    }

    if (!options) {
      // Only updating title
      return this.variationsRepository.update(id, title?.trim());
    }

    const normalizedOptions = normalizeOptionValues(options);

    const existingOptions = variation.options || [];
    const existingMap = new Map(
      existingOptions.map((opt) => [opt.value.toLowerCase(), opt]),
    );

    const nextValueSet = new Set(normalizedOptions.map((v) => v.toLowerCase()));

    const optionIdsToDelete = existingOptions
      .filter((opt) => !nextValueSet.has(opt.value.toLowerCase()))
      .map((opt) => opt.id);

    if (optionIdsToDelete.length > 0) {
      const isUsed =
        await this.variationsRepository.areOptionsUsedInProducts(
          optionIdsToDelete,
        );
      if (isUsed) {
        throw new OptionInUseError();
      }
    }

    const optionsToCreate: { value: string; order: number }[] = [];
    const optionsToUpdate: { id: string; value: string; order: number }[] = [];

    for (let i = 0; i < normalizedOptions.length; i++) {
      const value = normalizedOptions[i];
      const existing = existingMap.get(value.toLowerCase());

      if (existing) {
        optionsToUpdate.push({
          id: existing.id,
          value,
          order: i + 1,
        });
      } else {
        optionsToCreate.push({
          value,
          order: i + 1,
        });
      }
    }

    return this.variationsRepository.update(
      id,
      title?.trim(),
      optionsToCreate,
      optionsToUpdate,
      optionIdsToDelete,
    );
  }
}
