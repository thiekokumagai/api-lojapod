import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { StoreSettings } from '../../domain/entities/store-settings.entity';
import {
  ISettingsRepository,
  SaveSettingsOptions,
} from '../../domain/repositories/isettings.repository';
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
      include: {
        store: {
          select: { businessType: true },
        },
      },
    });

    if (!record) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { title: true, businessType: true },
      });
      if (store) {
        record = (await this.prisma.storeSettings.create({
          data: {
            storeId,
            storeName: store.title,
          },
          include: {
            store: {
              select: { businessType: true },
            },
          },
        })) as any;
      }
    }

    if (!record) return null;
    return {
      ...record,
      businessType: (record as any).store?.businessType ?? 'POD',
    } as unknown as StoreSettings;
  }

  async countCustomizableProducts(): Promise<number> {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      return 0;
    }
    return this.prisma.product.count({
      where: { storeId, isCustomizable: true },
    });
  }

  async save(
    settings: Omit<StoreSettings, 'id' | 'createdAt' | 'updatedAt'>,
    options?: SaveSettingsOptions,
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
      templateId: settings.templateId ?? 'classic',
      primaryColor: settings.primaryColor ?? '#dc2626',
      secondaryColor: settings.secondaryColor ?? '#18181b',
      priceColor: settings.priceColor ?? '#16a34a',
      defaultProductSort: settings.defaultProductSort ?? 'newest',
      logoUrl: settings.logoUrl,
      whiteLogoUrl: settings.whiteLogoUrl,
      faviconUrl: settings.faviconUrl,
      topHeaderText: settings.topHeaderText,
      bannerUrls: settings.bannerUrls,
      phone: settings.phone,
      instagram: settings.instagram,
      pixelId: settings.pixelId,
      facebookPixelEnabled: settings.facebookPixelEnabled ?? false,
      facebookConversionsToken: settings.facebookConversionsToken ?? null,
      facebookConversionsApiEnabled:
        settings.facebookConversionsApiEnabled ?? false,
      marketingLinks: settings.marketingLinks ?? [],
      cep: settings.cep,
      street: settings.street,
      number: settings.number,
      neighborhood: settings.neighborhood,
      city: settings.city,
      state: settings.state,
      complement: settings.complement,
      hideAddress: settings.hideAddress,
      savedStoreAddresses: settings.savedStoreAddresses ?? [],
      deliveryOriginCep: settings.deliveryOriginCep,
      deliveryOriginNumber: settings.deliveryOriginNumber,
      deliveryRanges: settings.deliveryRanges ?? [],
      installmentRules: settings.installmentRules ?? [],
      businessHours: settings.businessHours ?? null,
      isTemporarilyClosed: settings.isTemporarilyClosed ?? false,
      closedNoticeMessage: settings.closedNoticeMessage ?? null,
      enableExchangePolicy: settings.enableExchangePolicy ?? false,
      exchangePolicy: settings.exchangePolicy ?? null,
      pixEnabled: settings.pixEnabled,
      pixKeyType: settings.pixKeyType,
      pixKey: settings.pixKey,
      pixHolder: settings.pixHolder,
      payOnDeliveryCash: settings.payOnDeliveryCash,
      payOnDeliveryCardDebit: settings.payOnDeliveryCardDebit,
      payOnDeliveryCardCredit: settings.payOnDeliveryCardCredit,
      payOnDeliveryMealVoucher:
        (settings as any).payOnDeliveryMealVoucher ?? false,
      payOnDeliveryFoodVoucher:
        (settings as any).payOnDeliveryFoodVoucher ?? false,
      paymentRules: settings.paymentRules ?? [],
      promoPaymentMethods: settings.promoPaymentMethods ?? ['pix'],
      paymentGateways: settings.paymentGateways ?? undefined,
      freeShippingEnabled: settings.freeShippingEnabled ?? false,
      freeShippingMinValue: settings.freeShippingMinValue ?? null,
      minOrderEnabled: settings.minOrderEnabled ?? false,
      minOrderValue: settings.minOrderValue ?? null,
      storePickupEnabled: settings.storePickupEnabled ?? false,
      deliveryType: settings.deliveryType ?? 'DISTANCE',
      deliveryFixedFee: settings.deliveryFixedFee ?? null,
      vendizapAuthId: settings.vendizapAuthId ?? null,
      vendizapAuthSecret: settings.vendizapAuthSecret ?? null,
      uberDirectEnabled: settings.uberDirectEnabled ?? false,
      uberDirectAutoDispatch: settings.uberDirectAutoDispatch ?? false,
      uberDirectClientId: settings.uberDirectClientId ?? null,
      uberDirectClientSecret: settings.uberDirectClientSecret ?? null,
      uberDirectCustomerId: settings.uberDirectCustomerId ?? null,
      uberDirectEnvironment: settings.uberDirectEnvironment ?? 'sandbox',
      uberDirectPickupInstructions:
        settings.uberDirectPickupInstructions ?? null,
      uberDirectPickupPhone: settings.uberDirectPickupPhone ?? null,
      uberDirectBatchSize: settings.uberDirectBatchSize ?? 3,
      uberDirectMaxAngleDelta: settings.uberDirectMaxAngleDelta ?? 45,
      uberDirectDispatchDelayMinutes:
        settings.uberDirectDispatchDelayMinutes ?? 0,
      autoHideOutOfStock: settings.autoHideOutOfStock ?? true,
      enableStockAlertNotification:
        settings.enableStockAlertNotification ?? true,
      showVariationsOnCard: settings.showVariationsOnCard ?? true,
      searchFilters: ((settings as any).searchFilters ?? []) as any,
    };

    const validTypes = ['POD', 'FOOD', 'ACAI'] as const;
    const requestedBusinessType = validTypes.includes(
      (settings as any).businessType,
    )
      ? ((settings as any).businessType as 'POD' | 'FOOD' | 'ACAI')
      : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      if (options?.disableCustomizableProducts) {
        await tx.product.updateMany({
          where: { storeId, isCustomizable: true },
          data: { isCustomizable: false },
        });
      }

      if (requestedBusinessType) {
        await tx.store.update({
          where: { id: storeId },
          data: { businessType: requestedBusinessType },
        });
      }

      return tx.storeSettings.upsert({
        where: { storeId },
        create: dataPayload,
        update: dataPayload,
      });
    });

    return {
      ...result,
      businessType:
        requestedBusinessType ?? (settings as any).businessType ?? 'POD',
    } as unknown as StoreSettings;
  }
}
