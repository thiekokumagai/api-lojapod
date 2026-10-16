import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { StockNotificationsService } from './domain/stock-notifications.service';
import { StoreStockNotificationsController } from './infrastructure/controllers/store-stock-notifications.controller';
import { StockNotificationsController } from './infrastructure/controllers/stock-notifications.controller';

import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { PushNotificationService } from '../../shared/services/push-notification.service';

@Module({
  imports: [PrismaModule, TenantModule, UsersModule, SettingsModule],
  controllers: [StoreStockNotificationsController, StockNotificationsController],
  providers: [StockNotificationsService, PushNotificationService],
  exports: [StockNotificationsService],
})
export class StockNotificationsModule {}
