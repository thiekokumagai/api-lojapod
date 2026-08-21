import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CaktoClientService } from './cakto-client.service';
import { SuperAdminGuard } from './infrastructure/guards/super-admin.guard';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, CaktoClientService, SuperAdminGuard],
  exports: [BillingService],
})
export class BillingModule {}
