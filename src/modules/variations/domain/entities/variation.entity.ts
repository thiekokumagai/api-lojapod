import { VariationOption } from './variation-option.entity';

export interface Variation {
  id: string;
  title: string;
  options?: VariationOption[];
  deletedAt: Date | null;
}
