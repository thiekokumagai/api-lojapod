import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { PrismaService } from '../../../prisma/prisma.service';

@Global()
@Module({
  providers: [TenantContextService, PrismaService],
  exports: [TenantContextService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
