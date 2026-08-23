import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import { ISettingsRepository } from '../../domain/repositories/isettings.repository';
import { TenantContextService } from '../../../tenant/tenant-context.service';

@Injectable()
export class PrismaSettingsRepository implements ISettingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async get(): Promise<StoreSettings | null> {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      return null;
    }
    let record = await this.prisma.storeSettings.findFirst({
      where: { storeId },
    });

    if (!record) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { title: true },
      });
      if (store) {
        record = await this.prisma.storeSettings.create({
          data: {
            storeId,
            storeName: store.title,
          },
        });
      }
    }

    if (!record) return null;
    return record as unknown as StoreSettings;
  }

  async save(
    settings: Omit<StoreSettings, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StoreSettings> {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }

    const existing = await this.prisma.storeSettings.findFirst({
      where: { storeId },
    });

    const dataPayload = {
      storeId,
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

    const result = await this.prisma.storeSettings.upsert({
      where: { storeId },
      create: dataPayload,
      update: dataPayload,
    });

    return result as unknown as StoreSettings;
  }
}
