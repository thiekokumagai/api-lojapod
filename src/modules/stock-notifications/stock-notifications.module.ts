import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { StockNotificationsService } from './domain/stock-notifications.service';
import { StoreStockNotificationsController } from './infrastructure/controllers/store-stock-notifications.controller';
import { StockNotificationsController } from './infrastructure/controllers/stock-notifications.controller';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [StoreStockNotificationsController, StockNotificationsController],
  providers: [StockNotificationsService],
  exports: [StockNotificationsService],
})
export class StockNotificationsModule {}
