import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreSettings } from '../entities/store-settings.entity';
import { ISettingsRepository } from '../repositories/isettings.repository';
import { TenantContextService } from '../../../tenant/tenant-context.service';

@Injectable()
export class GetSettingsUseCase {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async execute(): Promise<StoreSettings> {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new NotFoundException('URL ou subdomínio não encontrado');
    }

    const settings = await this.settingsRepository.get();
    if (!settings) {
      throw new NotFoundException('URL ou subdomínio não encontrado');
    }
    return settings;
  }
}
