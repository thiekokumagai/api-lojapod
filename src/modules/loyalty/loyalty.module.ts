import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { EventsModule } from '../events/events.module';
import { LoyaltyService } from './domain/loyalty.service';
import { LoyaltyController } from './infrastructure/controllers/loyalty.controller';
import { StoreLoyaltyController } from './infrastructure/controllers/store-loyalty.controller';

@Module({
  imports: [PrismaModule, TenantModule, EventsModule],
  controllers: [LoyaltyController, StoreLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
