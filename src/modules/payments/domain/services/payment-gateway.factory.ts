import { Injectable, BadRequestException } from '@nestjs/common';
import { IPaymentGateway } from '../interfaces/payment-gateway.interface';
import { InfinitePayAdapter } from '../../infrastructure/adapters/infinitepay.adapter';
import { MercadoPagoAdapter } from '../../infrastructure/adapters/mercadopago.adapter';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly infinitePayAdapter: InfinitePayAdapter,
    private readonly mercadoPagoAdapter: MercadoPagoAdapter,
  ) {}

  getGateway(providerName: string): IPaymentGateway {
    const normalized = (providerName || '').toUpperCase();
    switch (normalized) {
      case 'INFINITEPAY':
        return this.infinitePayAdapter;
      case 'MERCADOPAGO':
        return this.mercadoPagoAdapter;
      default:
        throw new BadRequestException(`Provedor de pagamento '${providerName}' não suportado.`);
    }
  }
}
