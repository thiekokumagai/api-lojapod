import { Module } from '@nestjs/common';
import { MinioModule } from '../../minio/minio.module';
import { VendizapImportsController } from './infrastructure/controllers/vendizap-imports.controller';
import { VendizapService } from './infrastructure/services/vendizap.service';
import { ImageMigrationService } from './infrastructure/services/image-migration.service';
import { ImportCategoriesUseCase } from './domain/use-cases/import-categories.use-case';
import { ImportProductsUseCase } from './domain/use-cases/import-products.use-case';
import { ImportProductImagesUseCase } from './domain/use-cases/import-product-images.use-case';
import { ImportOrdersUseCase } from './domain/use-cases/import-orders.use-case';
import { ImportProductVariationsUseCase } from './domain/use-cases/import-product-variations.use-case';
import { ClearDatabaseUseCase } from './domain/use-cases/clear-database.use-case';
import { FixProductCategoriesUseCase } from './domain/use-cases/fix-product-categories.use-case';
import { PrismaService } from '../../../prisma/prisma.service';

import { ImportWpFinanceiroUseCase } from './domain/use-cases/import-wp-financeiro.use-case';
import { ImportWpProductCostsUseCase } from './domain/use-cases/import-wp-product-costs.use-case';

@Module({
  imports: [MinioModule],
  controllers: [VendizapImportsController],
  providers: [
    PrismaService,
    VendizapService,
    ImageMigrationService,
    ImportCategoriesUseCase,
    ImportProductsUseCase,
    ImportProductImagesUseCase,
    ImportProductVariationsUseCase,
    ImportOrdersUseCase,
    FixProductCategoriesUseCase,
    ClearDatabaseUseCase,
    ImportWpFinanceiroUseCase,
    ImportWpProductCostsUseCase,
  ],
})
export class ImportsModule {}
