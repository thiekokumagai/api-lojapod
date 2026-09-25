export interface PaymentRule {
  id: string;
  paymentMethod: string; // 'pix' | 'cash' | 'debit' | 'credit'
  type: 'discount' | 'charge';
  value: number;
  maxInstallments?: number;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  logoUrl: string | null;
  whiteLogoUrl: string | null;
  faviconUrl: string | null;
  topHeaderText: string | null;
  bannerUrls: string[];
  phone: string;
  instagram: string | null;
  pixelId: string | null;
  facebookPixelEnabled: boolean;
  facebookConversionsToken: string | null;
  facebookConversionsApiEnabled: boolean;
  marketingLinks: any;

  // Endereço
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string | null;
  hideAddress: boolean;

  deliveryOriginCep: string | null;
  deliveryOriginNumber: string | null;
  deliveryRanges: any;
  installmentRules: any;
  businessHours: any;
  isTemporarilyClosed: boolean;
  closedNoticeMessage: string | null;
  enableExchangePolicy: boolean;
  exchangePolicy: string | null;

  // Pagamentos
  pixEnabled: boolean;
  pixKeyType: string | null;
  pixKey: string | null;
  pixHolder: string | null;

  payOnDeliveryCash: boolean;
  payOnDeliveryCardDebit: boolean;
  payOnDeliveryCardCredit: boolean;

  paymentRules: any; // Mapeado para Array de PaymentRule ou nulo

  // Frete e Retirada
  freeShippingEnabled?: boolean;
  freeShippingMinValue?: number | null;
  storePickupEnabled?: boolean;
  deliveryType?: string;
  deliveryFixedFee?: number | null;

  vendizapAuthId?: string | null;
  vendizapAuthSecret?: string | null;

  createdAt: Date;
  updatedAt: Date;
}
