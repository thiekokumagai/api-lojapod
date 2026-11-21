import { StoreSettings } from '../entities/store-settings.entity';

export interface SaveSettingsOptions {
  disableCustomizableProducts?: boolean;
}

export abstract class ISettingsRepository {
  abstract get(): Promise<StoreSettings | null>;
  abstract countCustomizableProducts?(): Promise<number>;
  abstract save(
    settings: Omit<StoreSettings, 'id' | 'createdAt' | 'updatedAt'>,
    options?: SaveSettingsOptions,
  ): Promise<StoreSettings>;
}
