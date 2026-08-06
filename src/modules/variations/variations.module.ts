import { Module } from '@nestjs/common';
import { VariationsController } from './infrastructure/controllers/variations.controller';
import { PrismaVariationsRepository } from './infrastructure/database/prisma-variations.repository';
import { IVariationsRepository } from './domain/repositories/ivariations.repository';

import { ListVariationsUseCase } from './domain/use-cases/list-variations.use-case';
import { GetVariationUseCase } from './domain/use-cases/get-variation.use-case';
import { CreateVariationUseCase } from './domain/use-cases/create-variation.use-case';
import { UpdateVariationUseCase } from './domain/use-cases/update-variation.use-case';
import { UpdateBatchOrderUseCase } from './domain/use-cases/update-batch-order.use-case';
import { DeleteVariationUseCase } from './domain/use-cases/delete-variation.use-case';

@Module({
  controllers: [VariationsController],
  providers: [
    ListVariationsUseCase,
    GetVariationUseCase,
    CreateVariationUseCase,
    UpdateVariationUseCase,
    UpdateBatchOrderUseCase,
    DeleteVariationUseCase,
    {
      provide: IVariationsRepository,
      useClass: PrismaVariationsRepository,
    },
  ],
  exports: [IVariationsRepository],
})
export class VariationsModule {}
