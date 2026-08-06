import { Module } from '@nestjs/common';
import { MinioModule } from '../../minio/minio.module';
import { ProductsController } from './infrastructure/controllers/products.controller';
import { StoreProductsController } from './infrastructure/controllers/store-products.controller';
import { IProductsRepository } from './domain/repositories/iproducts.repository';
import { PrismaProductsRepository } from './infrastructure/database/prisma-products.repository';

import { ListProductsUseCase } from './domain/use-cases/list-products.use-case';
import { FindProductByIdUseCase } from './domain/use-cases/find-product-by-id.use-case';
import { CreateProductUseCase } from './domain/use-cases/create-product.use-case';
import { UpdateProductUseCase } from './domain/use-cases/update-product.use-case';
import { AttachProductVariationsUseCase } from './domain/use-cases/attach-product-variations.use-case';
import { CreateProductItemsUseCase } from './domain/use-cases/create-product-items.use-case';
import { ListProductItemsUseCase } from './domain/use-cases/list-product-items.use-case';
import { UpdateProductItemStockUseCase } from './domain/use-cases/update-product-item-stock.use-case';
import { GetStockHistoryUseCase } from './domain/use-cases/get-stock-history.use-case';
import { ManageProductImagesUseCase } from './domain/use-cases/manage-product-images.use-case';
import { DeleteProductUseCase } from './domain/use-cases/delete-product.use-case';
import { DeleteProductVariationUseCase } from './domain/use-cases/delete-product-variation.use-case';
import { DeleteProductVariationOptionUseCase } from './domain/use-cases/delete-product-variation-option.use-case';
import { DuplicateProductUseCase } from './domain/use-cases/duplicate-product.use-case';
import { ProductsRankingCronService } from './infrastructure/cron/products-ranking.cron.service';

@Module({
  imports: [MinioModule],
  controllers: [ProductsController, StoreProductsController],
  providers: [
    ListProductsUseCase,
    FindProductByIdUseCase,
    CreateProductUseCase,
    UpdateProductUseCase,
    AttachProductVariationsUseCase,
    CreateProductItemsUseCase,
    ListProductItemsUseCase,
    UpdateProductItemStockUseCase,
    GetStockHistoryUseCase,
    ManageProductImagesUseCase,
    DeleteProductUseCase,
    DeleteProductVariationUseCase,
    DeleteProductVariationOptionUseCase,
    DuplicateProductUseCase,
    ProductsRankingCronService,
    {
      provide: IProductsRepository,
      useClass: PrismaProductsRepository,
    },
  ],
  exports: [IProductsRepository],
})
export class ProductsModule {}
