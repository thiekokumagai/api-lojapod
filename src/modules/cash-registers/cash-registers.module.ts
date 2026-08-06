import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { ICashRegistersRepository } from './domain/repositories/icash-registers.repository';
import { PrismaCashRegistersRepository } from './infrastructure/database/prisma-cash-registers.repository';
import { CreateCashRegisterUseCase } from './domain/use-cases/create-cash-register.use-case';
import { UpdateCashRegisterUseCase } from './domain/use-cases/update-cash-register.use-case';
import { DeleteCashRegisterUseCase } from './domain/use-cases/delete-cash-register.use-case';
import { ListCashRegistersUseCase } from './domain/use-cases/list-cash-registers.use-case';
import { GetCashRegisterSummaryUseCase } from './domain/use-cases/get-cash-register-summary.use-case';
import { CreateCashTransactionUseCase } from './domain/use-cases/create-cash-transaction.use-case';
import { CashRegistersController } from './infrastructure/controllers/cash-registers.controller';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [CashRegistersController],
  providers: [
    {
      provide: ICashRegistersRepository,
      useClass: PrismaCashRegistersRepository,
    },
    CreateCashRegisterUseCase,
    UpdateCashRegisterUseCase,
    DeleteCashRegisterUseCase,
    ListCashRegistersUseCase,
    GetCashRegisterSummaryUseCase,
    CreateCashTransactionUseCase,
  ],
  exports: [ICashRegistersRepository, CreateCashTransactionUseCase],
})
export class CashRegistersModule {}
