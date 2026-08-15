export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productItemId: string | null;
  productName: string;
  price: number;
  quantity: number;
  variation: string | null;
  imageUrl?: string;
  costPrice?: number;
}

export class Order {
  id: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  customerId?: string | null;
  storeId?: string | null;

  itemsTotal: number;
  freight: number;
  totalOrder: number;
  totalReceived: number;
  cardFee: number;

  paymentDiscount: number;
  installmentSurcharge: number;
  couponDiscount: number;
  couponFreightDiscount: number;
  receiptDiscount: number;
  receiptSurcharge: number;

  amountProvided?: number | null;
  changeAmount?: number | null;

  appliedTaxRule?: Record<string, any> | null;
  appliedCouponRule?: Record<string, any> | null;

  paymentType: string;
  paymentMethod: string;
  pixKey: string | null;

  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  complement: string | null;
  observation: string | null;

  status: OrderStatus;
  paymentStatus: PaymentStatus;
  installments?: number;
  paymentDate?: Date | null;
  isPrinted: boolean;

  createdAt: Date;
  updatedAt: Date;

  couponId?: string | null;
  coupon?: {
    title: string;
    type: string;
  } | null;

  courierTransactionId?: string | null;
  courier?: {
    id: string;
    name: string;
  } | null;

  items?: OrderItem[];

  constructor(data: Partial<Order>) {
    Object.assign(this, data);
  }

  cancel(): void {
    if (this.status === OrderStatus.COMPLETED) {
      throw new Error('Cannot cancel a completed order');
    }
    this.status = OrderStatus.CANCELLED;
  }
}
