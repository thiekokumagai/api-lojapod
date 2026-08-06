import { StoreSettings } from '../entities/store-settings.entity';

export abstract class ISettingsRepository {
  abstract get(): Promise<StoreSettings | null>;
  abstract save(
    settings: Omit<StoreSettings, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StoreSettings>;
}
