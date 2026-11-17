import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CreateCheckoutOutput,
  IPaymentGateway,
  PaymentCheckInput,
  PaymentCheckOutput,
} from '../../domain/interfaces/payment-gateway.interface';
import { sameAmount } from '../../domain/utils/order-amount';
import { MERCADOPAGO_PROVIDER } from '../../domain/utils/mercadopago-config';
import { MercadoPagoClient } from './mercadopago.client';

/**
 * Entra na factory para a verificação ativa (`PaymentsService.checkOrderStatus`).
 * O Mercado Pago não usa link de checkout: Pix e cartão têm endpoints próprios (`MercadoPagoService`).
 */
@Injectable()
export class MercadoPagoAdapter implements IPaymentGateway {
  readonly provider = MERCADOPAGO_PROVIDER;
  private readonly logger = new Logger(MercadoPagoAdapter.name);

  constructor(private readonly client: MercadoPagoClient) {}

  createCreditCardCheckout(): Promise<CreateCheckoutOutput> {
    throw new BadRequestException(
      'O Mercado Pago é pago na própria página do pedido, sem link de checkout.',
    );
  }

  /** Só diz "pago" se o pagamento for do pedido, estiver aprovado e tiver exatamente o valor esperado. */
  async checkPayment(input: PaymentCheckInput): Promise<PaymentCheckOutput> {
    const paymentId = input.transactionNsu;
    const rawToken = (
      input.credentials as { accessToken?: unknown } | undefined
    )?.accessToken;
    const accessToken = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!paymentId || !accessToken) return { paid: false };

    try {
      const payment = await this.client.getPayment(accessToken, paymentId);
      const paid =
        payment.status === 'approved' &&
        payment.external_reference === input.orderId &&
        sameAmount(payment.transaction_amount, input.expectedAmount);
      return {
        paid,
        amount: Number(payment.transaction_amount),
        paidAmount: paid ? Number(payment.transaction_amount) : undefined,
        captureMethod: payment.payment_type_id,
        installments: payment.installments,
        transactionId: String(payment.id),
      };
    } catch (err) {
      this.logger.warn(
        `Não foi possível consultar o pagamento ${paymentId} no Mercado Pago: ${(err as Error).message}`,
      );
      return { paid: false };
    }
  }
}
