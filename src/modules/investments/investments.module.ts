import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { InvestmentsController } from './infrastructure/controllers/investments.controller';
import { IInvestmentsRepository } from './domain/repositories/iinvestments.repository';
import { PrismaInvestmentsRepository } from './infrastructure/database/prisma-investments.repository';
import { AddInvestmentUseCase } from './domain/use-cases/add-investment.use-case';
import { RegisterPurchaseUseCase } from './domain/use-cases/register-purchase.use-case';
import { GetInvestmentSummaryUseCase } from './domain/use-cases/get-investment-summary.use-case';
import { ListInvestmentTransactionsUseCase } from './domain/use-cases/list-investment-transactions.use-case';
import { DeleteInvestmentUseCase } from './domain/use-cases/delete-investment.use-case';
import { AnalyzePurchaseUseCase } from './domain/use-cases/analyze-purchase.use-case';

@Module({
  imports: [PrismaModule],
  controllers: [InvestmentsController],
  providers: [
    {
      provide: IInvestmentsRepository,
      useClass: PrismaInvestmentsRepository,
    },
    AddInvestmentUseCase,
    RegisterPurchaseUseCase,
    GetInvestmentSummaryUseCase,
    ListInvestmentTransactionsUseCase,
    DeleteInvestmentUseCase,
    AnalyzePurchaseUseCase,
  ],
  exports: [IInvestmentsRepository],
})
export class InvestmentsModule {}
