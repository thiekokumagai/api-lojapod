import { Module } from '@nestjs/common';
import { UberDirectService } from './uber-direct.service';
import { UberController } from './uber.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [UberController],
  providers: [UberDirectService],
  exports: [UberDirectService],
})
export class UberModule {}

