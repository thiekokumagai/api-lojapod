import { Product, ProductImage, ProductItem } from '@prisma/client';

export type ProductWithDetails = Product & {
  category?: any;
  images?: any;
  variations?: any;
  items?: any;
};

export abstract class IProductsRepository {
  abstract create(data: {
    title: string;
    description?: string | null;
    descriptionFormated?: string | null;
    categoryId: string;
    price?: any;
    promotionalPrice?: any;
    costPrice?: any;
    createdAt?: Date | string;
    isVisible?: boolean;
  }): Promise<Product>;

  abstract update(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      descriptionFormated?: string | null;
      categoryId?: string;
      price?: any;
      promotionalPrice?: any;
      costPrice?: any;
      isVisible?: boolean;
    },
  ): Promise<Product>;

  abstract findAll(params: {
    skip: number;
    take: number;
    search?: string;
    categoryId?: string;
    isVisible?: boolean;
  }): Promise<ProductWithDetails[]>;

  abstract count(params: {
    search?: string;
    categoryId?: string;
    isVisible?: boolean;
  }): Promise<number>;

  abstract findById(id: string): Promise<ProductWithDetails | null>;

  abstract checkCategoryExists(categoryId: string): Promise<boolean>;

  abstract addImages(productId: string, urls: string[]): Promise<void>;

  abstract findImageById(imageId: string): Promise<ProductImage | null>;

  abstract removeImage(imageId: string): Promise<void>;

  abstract replaceImage(imageId: string, newUrl: string): Promise<void>;

  abstract countImagesByUrl(url: string): Promise<number>;

  abstract findVariationsByIds(
    variationIds: string[],
  ): Promise<{ id: string }[]>;

  abstract findProductVariations(
    productId: string,
    variationIds: string[],
  ): Promise<{ variationId: string }[]>;

  abstract attachVariations(
    productId: string,
    variationIds: string[],
  ): Promise<void>;

  abstract findItemsByProductId(productId: string): Promise<any[]>;

  abstract replaceProductItemsTransaction(
    productId: string,
    variationStructureChanged: boolean,
    itemsToCreate: {
      stock: number;

      hash: string;
      optionIds: string[];
    }[],
  ): Promise<void>;

  abstract updateSimpleItemTransaction(
    productId: string,
    stock: number,

    hash?: string,
  ): Promise<void>;

  abstract listItems(productId: string): Promise<any[]>;

  abstract findItemById(itemId: string): Promise<{ id: string } | null>;

  abstract updateItemStock(
    itemId: string,
    type: 'ADD' | 'SUBTRACT' | 'SET',
    quantity: number,
    observation?: string,
  ): Promise<any>;

  abstract getStockHistory(productId: string): Promise<any[]>;

  abstract softDelete(id: string): Promise<string[]>; // Returns imageUrls

  abstract deleteVariationTransaction(productId: string): Promise<void>;

  abstract deleteVariationOptionTransaction(
    productId: string,
    optionId: string,
  ): Promise<void>;

  abstract duplicate(id: string): Promise<ProductWithDetails>;
}
