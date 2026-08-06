import { Module } from '@nestjs/common';
import { PrintGateway } from './print.gateway';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PrintGateway],
  exports: [PrintGateway],
})
export class PrintModule {}
