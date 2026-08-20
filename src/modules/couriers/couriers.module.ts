import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CouriersController } from './infrastructure/controllers/couriers.controller';
import { CreateCourierUseCase } from './domain/use-cases/create-courier.use-case';
import { UpdateCourierUseCase } from './domain/use-cases/update-courier.use-case';
import { GetCouriersUseCase } from './domain/use-cases/get-couriers.use-case';
import { RegisterCourierFeeUseCase } from './domain/use-cases/register-courier-fee.use-case';
import { PayCourierUseCase } from './domain/use-cases/pay-courier.use-case';
import { GetCourierUseCase } from './domain/use-cases/get-courier.use-case';
import { DeleteCourierTransactionUseCase } from './domain/use-cases/delete-courier-transaction.use-case';

@Module({
  imports: [PrismaModule],
  controllers: [CouriersController],
  providers: [
    CreateCourierUseCase,
    UpdateCourierUseCase,
    GetCouriersUseCase,
    RegisterCourierFeeUseCase,
    PayCourierUseCase,
    GetCourierUseCase,
    DeleteCourierTransactionUseCase,
  ],
})
export class CouriersModule {}
