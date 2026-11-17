export interface CreateCheckoutInput {
  orderId: string;
  orderNumber: number;
  amount: number; // Em reais (ex: 150.00)
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    complement?: string;
  };
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
  /** Valor que o pedido deve ter (em reais). Gateways que conferem o valor recusam se não bater. */
  expectedAmount?: number;
}

export interface PaymentCheckOutput {
  paid: boolean;
  amount?: number;
  paidAmount?: number;
  captureMethod?: string;
  installments?: number;
  transactionId?: string;
}

export interface IPaymentGateway {
  readonly provider: string;
  createCreditCardCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput>;
  checkPayment(input: PaymentCheckInput): Promise<PaymentCheckOutput>;
}
