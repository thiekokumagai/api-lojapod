import { Module } from '@nestjs/common';
import { StoresService } from './domain/services/stores.service';
import { StoresController } from './infrastructure/controllers/stores.controller';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
  controllers: [StoresController],
  providers: [StoresService, PrismaService],
  exports: [StoresService],
})
export class StoresModule {}
