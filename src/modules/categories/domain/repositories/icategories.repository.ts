import { Category } from '../entities/category.entity';

export abstract class ICategoriesRepository {
  abstract findAll(): Promise<Category[]>;
  abstract findById(id: string): Promise<Category | null>;
  abstract findLastOrder(): Promise<number>;
  abstract create(data: {
    title: string;
    image: string | null;
    oldUrl: string | null;
    isVisible: boolean;
    excludeFromBestSeller: boolean;
    order: number;
  }): Promise<Category>;
  abstract update(
    id: string,
    data: {
      title?: string;
      image?: string | null;
      oldUrl?: string | null;
      isVisible?: boolean;
      excludeFromBestSeller?: boolean;
    },
  ): Promise<Category>;
  abstract updateOrder(id: string, order: number): Promise<Category>;
  abstract updateBatchOrder(
    items: { id: string; order: number }[],
  ): Promise<void>;
  abstract decrementOrdersAbove(order: number): Promise<void>;
  abstract softDelete(id: string): Promise<Category>;
}
