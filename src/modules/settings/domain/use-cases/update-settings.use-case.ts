import { Injectable } from '@nestjs/common';
import { StoreSettings } from '../entities/store-settings.entity';
import { ISettingsRepository } from '../repositories/isettings.repository';

export interface UpdateSettingsInput {
  storeName?: string;
  logoUrl?: string | null;
  whiteLogoUrl?: string | null;
  faviconUrl?: string | null;
  topHeaderText?: string | null;
  bannerUrls?: string[];
  phone?: string;
  instagram?: string | null;
  pixelId?: string | null;
  facebookPixelEnabled?: boolean;
  facebookConversionsToken?: string | null;
  facebookConversionsApiEnabled?: boolean;
  marketingLinks?: any;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  complement?: string | null;
  hideAddress?: boolean;
  deliveryOriginCep?: string | null;
  deliveryOriginNumber?: string | null;
  deliveryRanges?: any;
  installmentRules?: any;
  businessHours?: any;
  isTemporarilyClosed?: boolean;
  closedNoticeMessage?: string | null;
  enableExchangePolicy?: boolean;
  exchangePolicy?: string | null;
  pixEnabled?: boolean;
  pixKeyType?: string | null;
  pixKey?: string | null;
  pixHolder?: string | null;
  payOnDeliveryCash?: boolean;
  payOnDeliveryCardDebit?: boolean;
  payOnDeliveryCardCredit?: boolean;
  paymentRules?: any;
  freeShippingEnabled?: boolean;
  freeShippingMinValue?: number | null;
  storePickupEnabled?: boolean;
  deliveryType?: string;
  deliveryFixedFee?: number | null;
  vendizapAuthId?: string | null;
  vendizapAuthSecret?: string | null;
}

@Injectable()
export class UpdateSettingsUseCase {
  constructor(private readonly settingsRepository: ISettingsRepository) {}

  async execute(input: UpdateSettingsInput): Promise<StoreSettings> {
    const existing = await this.settingsRepository.get();

    const base = existing || {
      storeName: 'Minha Loja',
      logoUrl: null,
      whiteLogoUrl: null,
      faviconUrl: null,
      topHeaderText: null,
      bannerUrls: [],
      phone: '',
      instagram: null,
      pixelId: null,
      marketingLinks: [],
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      complement: null,
      hideAddress: false,
      deliveryOriginCep: null,
      deliveryOriginNumber: null,
      deliveryRanges: [],
      installmentRules: [],
      businessHours: [],
      isTemporarilyClosed: false,
      closedNoticeMessage: null,
      enableExchangePolicy: false,
      exchangePolicy: null,
      pixEnabled: false,
      pixKeyType: null,
      pixKey: null,
      pixHolder: null,
      payOnDeliveryCash: false,
      payOnDeliveryCardDebit: false,
      payOnDeliveryCardCredit: false,
      paymentRules: [],
    };

    return this.settingsRepository.save({
      storeName:
        input.storeName !== undefined ? input.storeName : base.storeName,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : base.logoUrl,
      whiteLogoUrl: input.whiteLogoUrl !== undefined ? input.whiteLogoUrl : base.whiteLogoUrl,
      faviconUrl:
        input.faviconUrl !== undefined ? input.faviconUrl : base.faviconUrl,
      topHeaderText:
        input.topHeaderText !== undefined
          ? input.topHeaderText
          : base.topHeaderText,
      bannerUrls:
        input.bannerUrls !== undefined ? input.bannerUrls : base.bannerUrls,
      phone: input.phone !== undefined ? input.phone : base.phone,
      instagram:
        input.instagram !== undefined ? input.instagram : base.instagram,
      pixelId:
        input.pixelId !== undefined ? input.pixelId : (base as any).pixelId,
      facebookPixelEnabled:
        input.facebookPixelEnabled !== undefined ? input.facebookPixelEnabled : (base as any).facebookPixelEnabled ?? false,
      facebookConversionsToken:
        input.facebookConversionsToken !== undefined ? input.facebookConversionsToken : (base as any).facebookConversionsToken,
      facebookConversionsApiEnabled:
        input.facebookConversionsApiEnabled !== undefined ? input.facebookConversionsApiEnabled : (base as any).facebookConversionsApiEnabled ?? false,
      marketingLinks:
        input.marketingLinks !== undefined ? input.marketingLinks : (base as any).marketingLinks,
      cep: input.cep !== undefined ? input.cep : base.cep,
      street: input.street !== undefined ? input.street : base.street,
      number: input.number !== undefined ? input.number : base.number,
      neighborhood:
        input.neighborhood !== undefined
          ? input.neighborhood
          : base.neighborhood,
      city: input.city !== undefined ? input.city : base.city,
      state: input.state !== undefined ? input.state : base.state,
      complement:
        input.complement !== undefined ? input.complement : base.complement,
      hideAddress:
        input.hideAddress !== undefined ? input.hideAddress : base.hideAddress,
      deliveryOriginCep:
        input.deliveryOriginCep !== undefined
          ? input.deliveryOriginCep
          : base.deliveryOriginCep,
      deliveryOriginNumber:
        input.deliveryOriginNumber !== undefined
          ? input.deliveryOriginNumber
          : base.deliveryOriginNumber,
      deliveryRanges:
        input.deliveryRanges !== undefined
          ? input.deliveryRanges
          : base.deliveryRanges,
      installmentRules:
        input.installmentRules !== undefined
          ? input.installmentRules
          : base.installmentRules,
      pixEnabled:
        input.pixEnabled !== undefined ? input.pixEnabled : base.pixEnabled,
      pixKeyType:
        input.pixKeyType !== undefined ? input.pixKeyType : base.pixKeyType,
      pixKey: input.pixKey !== undefined ? input.pixKey : base.pixKey,
      pixHolder:
        input.pixHolder !== undefined ? input.pixHolder : base.pixHolder,
      payOnDeliveryCash:
        input.payOnDeliveryCash !== undefined
          ? input.payOnDeliveryCash
          : base.payOnDeliveryCash,
      payOnDeliveryCardDebit:
        input.payOnDeliveryCardDebit !== undefined
          ? input.payOnDeliveryCardDebit
          : base.payOnDeliveryCardDebit,
      payOnDeliveryCardCredit:
        input.payOnDeliveryCardCredit !== undefined
          ? input.payOnDeliveryCardCredit
          : base.payOnDeliveryCardCredit,
      paymentRules:
        input.paymentRules !== undefined
          ? input.paymentRules
          : base.paymentRules,
      businessHours:
        input.businessHours !== undefined
          ? input.businessHours
          : base.businessHours,
      isTemporarilyClosed:
        input.isTemporarilyClosed !== undefined
          ? input.isTemporarilyClosed
          : base.isTemporarilyClosed,
      closedNoticeMessage:
        input.closedNoticeMessage !== undefined
          ? input.closedNoticeMessage
          : base.closedNoticeMessage,
      enableExchangePolicy:
        input.enableExchangePolicy !== undefined
          ? input.enableExchangePolicy
          : base.enableExchangePolicy,
      exchangePolicy:
        input.exchangePolicy !== undefined
          ? input.exchangePolicy
          : base.exchangePolicy,
      freeShippingEnabled:
        input.freeShippingEnabled !== undefined
          ? input.freeShippingEnabled
          : (base as any).freeShippingEnabled,
      freeShippingMinValue:
        input.freeShippingMinValue !== undefined
          ? input.freeShippingMinValue
          : (base as any).freeShippingMinValue,
      storePickupEnabled:
        input.storePickupEnabled !== undefined
          ? input.storePickupEnabled
          : (base as any).storePickupEnabled,
      deliveryType:
        input.deliveryType !== undefined
          ? input.deliveryType
          : (base as any).deliveryType,
      deliveryFixedFee:
        input.deliveryFixedFee !== undefined
          ? input.deliveryFixedFee
          : (base as any).deliveryFixedFee,
      vendizapAuthId:
        input.vendizapAuthId !== undefined
          ? input.vendizapAuthId
          : (base as any).vendizapAuthId,
      vendizapAuthSecret:
        input.vendizapAuthSecret !== undefined
          ? input.vendizapAuthSecret
          : (base as any).vendizapAuthSecret,
    });
  }
}
