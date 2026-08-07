import { Module } from '@nestjs/common';
import { MinioModule } from '../../minio/minio.module';
import { ImportsController } from './infrastructure/controllers/imports.controller';
import { ClearDatabaseUseCase } from './domain/use-cases/clear-database.use-case';
import { PrismaService } from '../../../prisma/prisma.service';

import { ImportWpFinanceiroUseCase } from './domain/use-cases/import-wp-financeiro.use-case';
import { ImportWpProductCostsUseCase } from './domain/use-cases/import-wp-product-costs.use-case';

@Module({
  imports: [MinioModule],
  controllers: [ImportsController],
  providers: [
    PrismaService,
    ClearDatabaseUseCase,
    ImportWpFinanceiroUseCase,
    ImportWpProductCostsUseCase,
  ],
})
export class ImportsModule {}
