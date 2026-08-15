import { Category } from '../entities/category.entity';

export interface CreateCategoryData {
  title: string;
  image: string | null;
  isVisible: boolean;
  excludeFromBestSeller: boolean;
  order: number;
}

export interface UpdateCategoryData {
  title?: string;
  image?: string | null;
  isVisible?: boolean;
  excludeFromBestSeller?: boolean;
}

export abstract class ICategoriesRepository {
  abstract findAll(): Promise<Category[]>;
  abstract findById(id: string): Promise<Category | null>;
  abstract findLastOrder(): Promise<number>;
  abstract create(data: CreateCategoryData): Promise<Category>;
  abstract update(
    id: string,
    data: UpdateCategoryData,
  ): Promise<Category>;
  abstract updateOrder(id: string, order: number): Promise<Category>;
  abstract updateBatchOrder(
    items: { id: string; order: number }[],
  ): Promise<void>;
  abstract decrementOrdersAbove(order: number): Promise<void>;
  abstract softDelete(id: string): Promise<Category>;
}
