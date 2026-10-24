import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  IPaymentGateway,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  PaymentCheckInput,
  PaymentCheckOutput,
} from '../../domain/interfaces/payment-gateway.interface';

@Injectable()
export class InfinitePayAdapter implements IPaymentGateway {
  readonly provider = 'INFINITEPAY';
  private readonly logger = new Logger(InfinitePayAdapter.name);
  private readonly baseUrl = 'https://api.checkout.infinitepay.io';

  async createCreditCardCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
    const { credentials, orderNumber, amount, items, redirectUrl, webhookUrl } = input;
    const handle = credentials?.handle?.trim();
    const apiKey = credentials?.apiKey?.trim();

    if (!handle) {
      throw new BadRequestException('A tag/handle da loja na InfinitePay não foi configurada.');
    }

    const totalCents = Math.round(amount * 100);

    const formattedItems = items && items.length > 0
      ? items.map((item) => ({
          description: item.description || `Item do pedido #${orderNumber}`,
          quantity: item.quantity,
          price: Math.round(item.price * 100),
        }))
      : [
          {
            description: `Pedido #${orderNumber}`,
            quantity: 1,
            price: totalCents,
          },
        ];

    const itemsSum = formattedItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
    if (itemsSum !== totalCents) {
      formattedItems.splice(0, formattedItems.length, {
        description: `Pedido #${orderNumber}`,
        quantity: 1,
        price: totalCents,
      });
    }

    const payload: any = {
      handle,
      order_nsu: String(orderNumber),
      redirect_url: redirectUrl,
      items: formattedItems,
      options: {
        payment_methods_enabled: ['credit_card'],
        single_payment: true,
      },
    };

    if (webhookUrl) {
      payload.webhook_url = webhookUrl;
      payload.webhook = {
        url: webhookUrl,
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    this.logger.log(`Criando link de pagamento InfinitePay para o pedido #${orderNumber} (Handle: ${handle})`);

    try {
      const response = await fetch(`${this.baseUrl}/links`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        this.logger.error(`Erro ao criar link na InfinitePay (${response.status}):`, data);
        throw new BadRequestException(
          data?.message || data?.error || 'Erro ao gerar link de pagamento na InfinitePay.',
        );
      }

      const checkoutUrl = data?.url || data?.link_url || data?.checkout_url;
      if (!checkoutUrl) {
        throw new BadRequestException('InfinitePay não retornou uma URL de checkout válida.');
      }

      return {
        checkoutUrl,
        transactionId: data?.id || data?.slug || data?.transaction_nsu,
      };
    } catch (err: any) {
      this.logger.error(`Falha na requisição para InfinitePay: ${err.message}`, err.stack);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Falha ao se comunicar com a InfinitePay: ${err.message}`);
    }
  }

  async checkPayment(input: PaymentCheckInput): Promise<PaymentCheckOutput> {
    const { credentials, orderNumber, transactionNsu, slug } = input;
    const handle = credentials?.handle?.trim();

    if (!handle) {
      return { paid: false };
    }

    try {
      const response = await fetch(`${this.baseUrl}/payment_check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credentials?.apiKey ? { 'X-Api-Key': credentials.apiKey.trim() } : {}),
        },
        body: JSON.stringify({
          handle,
          order_nsu: String(orderNumber),
          transaction_nsu: transactionNsu,
          slug,
        }),
      });

      if (!response.ok) {
        return { paid: false };
      }

      const data = await response.json();
      return {
        paid: !!data?.paid,
        amount: data?.amount ? data.amount / 100 : undefined,
        paidAmount: data?.paid_amount ? data.paid_amount / 100 : undefined,
        captureMethod: data?.capture_method,
        installments: data?.installments,
      };
    } catch (err: any) {
      this.logger.error(`Erro ao verificar status na InfinitePay: ${err.message}`);
      return { paid: false };
    }
  }
}
