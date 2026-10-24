import { Injectable, BadRequestException } from '@nestjs/common';
import { IPaymentGateway } from '../interfaces/payment-gateway.interface';
import { InfinitePayAdapter } from '../../infrastructure/adapters/infinitepay.adapter';

@Injectable()
export class PaymentGatewayFactory {
  constructor(private readonly infinitePayAdapter: InfinitePayAdapter) {}

  getGateway(providerName: string): IPaymentGateway {
    const normalized = (providerName || '').toUpperCase();
    switch (normalized) {
      case 'INFINITEPAY':
        return this.infinitePayAdapter;
      default:
        throw new BadRequestException(`Provedor de pagamento '${providerName}' não suportado.`);
    }
  }
}
