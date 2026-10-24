export interface CreateCheckoutInput {
  orderId: string;
  orderNumber: number;
  amount: number; // Em reais (ex: 150.00)
  customerName: string;
  customerPhone?: string;
  redirectUrl: string;
  webhookUrl: string;
  credentials: any;
  items: Array<{
    description: string;
    quantity: number;
    price: number; // Em reais
  }>;
}

export interface CreateCheckoutOutput {
  checkoutUrl: string;
  transactionId?: string;
}

export interface PaymentCheckInput {
  orderId: string;
  orderNumber: number;
  transactionNsu?: string;
  slug?: string;
  credentials: any;
}

export interface PaymentCheckOutput {
  paid: boolean;
  amount?: number;
  paidAmount?: number;
  captureMethod?: string;
  installments?: number;
}

export interface IPaymentGateway {
  readonly provider: string;
  createCreditCardCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput>;
  checkPayment(input: PaymentCheckInput): Promise<PaymentCheckOutput>;
}
