import { Module } from '@nestjs/common';
import { DashboardController } from './infrastructure/controllers/dashboard.controller';
import { GetDashboardStatsUseCase } from './domain/use-cases/get-dashboard-stats.use-case';
import { GetStockOpportunitiesUseCase } from './domain/use-cases/get-stock-opportunities.use-case';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [DashboardController],
  providers: [GetDashboardStatsUseCase, GetStockOpportunitiesUseCase],
})
export class DashboardModule {}
