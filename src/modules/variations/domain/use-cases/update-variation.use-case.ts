import { Injectable } from '@nestjs/common';
import { IVariationsRepository } from '../repositories/ivariations.repository';
import { normalizeOptionValues } from '../utils/normalize-options.util';
import { VariationNotFoundError } from '../exceptions/variation-not-found.exception';
import { OptionInUseError } from '../exceptions/option-in-use.exception';

export type VariationOptionInput = string | { id?: string; value: string };

@Injectable()
export class UpdateVariationUseCase {
  constructor(private readonly variationsRepository: IVariationsRepository) {}

  async execute(
    id: string,
    title?: string,
    options?: VariationOptionInput[],
  ) {
    const variation = await this.variationsRepository.findById(id);
    if (!variation) {
      throw new VariationNotFoundError();
    }

    if (!options) {
      // Only updating title
      return this.variationsRepository.update(id, title?.trim());
    }

    const existingOptions = variation.options || [];
    const existingById = new Map(existingOptions.map((opt) => [opt.id, opt]));
    const existingByValue = new Map(
      existingOptions.map((opt) => [opt.value.toLowerCase(), opt]),
    );

    const matchedExistingIds = new Set<string>();

    const optionsToCreate: { value: string; order: number }[] = [];
    const optionsToUpdate: { id: string; value: string; order: number }[] = [];

    for (let i = 0; i < options.length; i++) {
      const item = options[i];
      let optId: string | undefined;
      let optValue: string;

      if (typeof item === 'string') {
        optValue = item.trim();
      } else {
        optId = item.id;
        optValue = item.value ? item.value.trim() : '';
      }

      if (!optValue) continue;

      let matched = optId ? existingById.get(optId) : undefined;

      if (!matched && !optId) {
        matched = existingByValue.get(optValue.toLowerCase());
        if (matched && matchedExistingIds.has(matched.id)) {
          matched = undefined;
        }
      }

      if (matched) {
        matchedExistingIds.add(matched.id);
        optionsToUpdate.push({
          id: matched.id,
          value: optValue,
          order: i + 1,
        });
      } else {
        optionsToCreate.push({
          value: optValue,
          order: i + 1,
        });
      }
    }

    const optionIdsToDelete = existingOptions
      .filter((opt) => !matchedExistingIds.has(opt.id))
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

    return this.variationsRepository.update(
      id,
      title?.trim(),
      optionsToCreate,
      optionsToUpdate,
      optionIdsToDelete,
    );
  }
}
