import { Module } from '@nestjs/common';
import { CombosController } from './infrastructure/controllers/combos.controller';
import { StoreCombosController } from './infrastructure/controllers/store-combos.controller';
import { CombosService } from './infrastructure/services/combos.service';
import { PrismaCombosRepository } from './infrastructure/database/prisma-combos.repository';
import { MinioModule } from '../../minio/minio.module';
import { TenantModule } from '../tenant/tenant.module';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, TenantModule, MinioModule],
  controllers: [CombosController, StoreCombosController],
  providers: [
    CombosService,
    {
      provide: 'ICombosRepository',
      useClass: PrismaCombosRepository,
    },
  ],
  exports: [CombosService, 'ICombosRepository'],
})
export class CombosModule {}
