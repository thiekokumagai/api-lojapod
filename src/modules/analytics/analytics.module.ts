import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { AbandonedCartsController } from './abandoned-carts.controller';
import { AbandonedCartsService } from './abandoned-carts.service';
import { AbandonedCartsRetentionCronService } from './abandoned-carts-retention.cron.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [AnalyticsController, AbandonedCartsController],
  providers: [
    AnalyticsService,
    AbandonedCartsService,
    AbandonedCartsRetentionCronService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
