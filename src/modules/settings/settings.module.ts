import { Module } from '@nestjs/common';
import { SettingsController } from './infrastructure/controllers/settings.controller';
import { StoreSettingsController } from './infrastructure/controllers/store-settings.controller';
import { MinioModule } from '../../minio/minio.module';
import { ISettingsRepository } from './domain/repositories/isettings.repository';
import { PrismaSettingsRepository } from './infrastructure/database/prisma-settings.repository';

import { GetSettingsUseCase } from './domain/use-cases/get-settings.use-case';
import { UpdateSettingsUseCase } from './domain/use-cases/update-settings.use-case';

@Module({
  imports: [MinioModule],
  controllers: [SettingsController, StoreSettingsController],
  providers: [
    GetSettingsUseCase,
    UpdateSettingsUseCase,
    {
      provide: ISettingsRepository,
      useClass: PrismaSettingsRepository,
    },
  ],
  exports: [ISettingsRepository],
})
export class SettingsModule {}
