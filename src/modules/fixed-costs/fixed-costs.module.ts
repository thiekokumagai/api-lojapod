import { Module } from '@nestjs/common';
import { FixedCostsController } from './infrastructure/controllers/fixed-costs.controller';
import { IFixedCostsRepository } from './domain/repositories/ifixed-costs.repository';
import { PrismaFixedCostsRepository } from './infrastructure/database/prisma-fixed-costs.repository';

import { CreateFixedCostUseCase } from './domain/use-cases/create-fixed-cost.use-case';
import { ListFixedCostsUseCase } from './domain/use-cases/list-fixed-costs.use-case';
import { UpdateFixedCostUseCase } from './domain/use-cases/update-fixed-cost.use-case';
import { DeleteFixedCostUseCase } from './domain/use-cases/delete-fixed-cost.use-case';
import { PayFixedCostUseCase } from './domain/use-cases/pay-fixed-cost.use-case';
import { CreateCashTransactionUseCase } from './domain/use-cases/create-cash-transaction.use-case';
import { DeleteCashTransactionUseCase } from './domain/use-cases/delete-cash-transaction.use-case';

@Module({
  controllers: [FixedCostsController],
  providers: [
    CreateFixedCostUseCase,
    ListFixedCostsUseCase,
    UpdateFixedCostUseCase,
    DeleteFixedCostUseCase,
    PayFixedCostUseCase,
    CreateCashTransactionUseCase,
    DeleteCashTransactionUseCase,
    {
      provide: IFixedCostsRepository,
      useClass: PrismaFixedCostsRepository,
    },
  ],
  exports: [
    IFixedCostsRepository,
    CreateFixedCostUseCase,
    ListFixedCostsUseCase,
    UpdateFixedCostUseCase,
    DeleteFixedCostUseCase,
    PayFixedCostUseCase,
    CreateCashTransactionUseCase,
    DeleteCashTransactionUseCase,
  ],
})
export class FixedCostsModule {}
