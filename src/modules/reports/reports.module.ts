import { Module } from '@nestjs/common';
import { ReportsController } from './infrastructure/controllers/reports.controller';
import { GetSalesReportUseCase } from './domain/use-cases/get-sales-report.use-case';
import { GetFinancialReportUseCase } from './domain/use-cases/get-financial-report.use-case';
import { GetProductsReportUseCase } from './domain/use-cases/get-products-report.use-case';

@Module({
  controllers: [ReportsController],
  providers: [
    GetSalesReportUseCase,
    GetFinancialReportUseCase,
    GetProductsReportUseCase,
  ],
})
export class ReportsModule {}
