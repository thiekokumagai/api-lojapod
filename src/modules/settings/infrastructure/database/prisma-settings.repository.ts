import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { ISettingsRepository } from '../../domain/repositories/isettings.repository';

@Injectable()
export class PrismaSettingsRepository implements ISettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<StoreSettings | null> {
    const record = await this.prisma.storeSettings.findFirst();
    if (!record) return null;
    return record as unknown as StoreSettings;
  }

  async save(
    settings: Omit<StoreSettings, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StoreSettings> {
    const existing = await this.prisma.storeSettings.findFirst();

    const dataPayload = {
      storeName: settings.storeName,
      logoUrl: settings.logoUrl,
      whiteLogoUrl: settings.whiteLogoUrl,
      faviconUrl: settings.faviconUrl,
      topHeaderText: settings.topHeaderText,
      bannerUrls: settings.bannerUrls,
      phone: settings.phone,
      instagram: settings.instagram,
      pixelId: settings.pixelId,
      marketingLinks: settings.marketingLinks ?? [],
      cep: settings.cep,
      street: settings.street,
      number: settings.number,
      neighborhood: settings.neighborhood,
      city: settings.city,
      state: settings.state,
      complement: settings.complement,
      hideAddress: settings.hideAddress,
      deliveryOriginCep: settings.deliveryOriginCep,
      deliveryOriginNumber: settings.deliveryOriginNumber,
      deliveryRanges: settings.deliveryRanges ?? [],
      installmentRules: settings.installmentRules ?? [],
      businessHours: settings.businessHours ?? null,
      pixEnabled: settings.pixEnabled,
      pixKeyType: settings.pixKeyType,
      pixKey: settings.pixKey,
      pixHolder: settings.pixHolder,
      payOnDeliveryCash: settings.payOnDeliveryCash,
      payOnDeliveryCardDebit: settings.payOnDeliveryCardDebit,
      payOnDeliveryCardCredit: settings.payOnDeliveryCardCredit,
      paymentRules: settings.paymentRules ?? [],
    };

    let result;
    if (existing) {
      result = await this.prisma.storeSettings.update({
        where: { id: existing.id },
        data: dataPayload,
      });
    } else {
      result = await this.prisma.storeSettings.create({
        data: dataPayload,
      });
    }

    return result as unknown as StoreSettings;
  }
}
