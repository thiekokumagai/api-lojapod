import { Module } from '@nestjs/common';
import { DashboardController } from './infrastructure/controllers/dashboard.controller';
import { GetDashboardStatsUseCase } from './domain/use-cases/get-dashboard-stats.use-case';

@Module({
  controllers: [DashboardController],
  providers: [GetDashboardStatsUseCase],
})
export class DashboardModule {}
