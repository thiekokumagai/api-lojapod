import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { OrderBumpsService } from './domain/order-bumps.service';
import { OrderBumpsController } from './infrastructure/controllers/order-bumps.controller';
import { StoreOrderBumpsController } from './infrastructure/controllers/store-order-bumps.controller';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [OrderBumpsController, StoreOrderBumpsController],
  providers: [OrderBumpsService],
  exports: [OrderBumpsService],
})
export class OrderBumpsModule {}
