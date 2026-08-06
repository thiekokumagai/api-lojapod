import { Module } from '@nestjs/common';
import { CategoriesController } from './infrastructure/controllers/categories.controller';
import { StoreCategoriesController } from './infrastructure/controllers/store-categories.controller';
import { MinioModule } from '../../minio/minio.module';
import { ICategoriesRepository } from './domain/repositories/icategories.repository';
import { PrismaCategoriesRepository } from './infrastructure/database/prisma-categories.repository';

import { ListCategoriesUseCase } from './domain/use-cases/list-categories.use-case';
import { GetCategoryUseCase } from './domain/use-cases/get-category.use-case';
import { CreateCategoryUseCase } from './domain/use-cases/create-category.use-case';
import { UpdateCategoryUseCase } from './domain/use-cases/update-category.use-case';
import { UpdateBatchOrderUseCase } from './domain/use-cases/update-batch-order.use-case';
import { DeleteCategoryUseCase } from './domain/use-cases/delete-category.use-case';

@Module({
  imports: [MinioModule],
  controllers: [CategoriesController, StoreCategoriesController],
  providers: [
    ListCategoriesUseCase,
    GetCategoryUseCase,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    UpdateBatchOrderUseCase,
    DeleteCategoryUseCase,
    {
      provide: ICategoriesRepository,
      useClass: PrismaCategoriesRepository,
    },
  ],
  exports: [ICategoriesRepository],
})
export class CategoriesModule {}
