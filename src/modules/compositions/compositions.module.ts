import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { CompositionsService } from './domain/compositions.service';
import { CompositionsController } from './infrastructure/controllers/compositions.controller';
import { StoreCompositionsController } from './infrastructure/controllers/store-compositions.controller';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [CompositionsController, StoreCompositionsController],
  providers: [CompositionsService],
  exports: [CompositionsService],
})
export class CompositionsModule {}
