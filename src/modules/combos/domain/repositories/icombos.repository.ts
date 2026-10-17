import { Combo } from '../entities/combo.entity';

export interface ComboFilters {
  search?: string;
  isActive?: boolean;
  categoryId?: string;
}

export interface ICombosRepository {
  create(combo: Partial<Combo>, items: Array<{ productId: string; productItemId?: string | null; quantity: number; variation?: string | null }>): Promise<Combo>;
  update(id: string, combo: Partial<Combo>, items?: Array<{ productId: string; productItemId?: string | null; quantity: number; variation?: string | null }>): Promise<Combo>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Combo | null>;
  findMany(filters: ComboFilters): Promise<Combo[]>;
  findStoreCombos(): Promise<Combo[]>;
  incrementTotalSold(id: string, quantity: number): Promise<void>;
}
