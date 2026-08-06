import { Variation } from '../entities/variation.entity';
import { VariationOption } from '../entities/variation-option.entity';

export abstract class IVariationsRepository {
  abstract findAll(): Promise<Variation[]>;
  abstract findById(id: string): Promise<Variation | null>;
  abstract create(title: string, options: string[]): Promise<Variation>;
  abstract update(
    id: string,
    title?: string,
    optionsToCreate?: { value: string; order: number }[],
    optionsToUpdate?: { id: string; value: string; order: number }[],
    optionIdsToDelete?: string[],
  ): Promise<Variation>;
  abstract softDelete(id: string): Promise<Variation>;

  abstract findOptionsByIds(ids: string[]): Promise<VariationOption[]>;
  abstract areOptionsUsedInProducts(optionIds: string[]): Promise<boolean>;
  abstract updateBatchOrder(
    items: { id: string; order: number }[],
  ): Promise<void>;
}
