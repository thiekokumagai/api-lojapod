import { Module } from '@nestjs/common';
import { StoresService } from './domain/services/stores.service';
import { StoresController } from './infrastructure/controllers/stores.controller';
import { SubscriptionsController } from './infrastructure/controllers/subscriptions.controller';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
  controllers: [StoresController, SubscriptionsController],
  providers: [StoresService, PrismaService],
  exports: [StoresService],
})
export class StoresModule {}
