import { Module } from '@nestjs/common';
import { PaymentsController } from './infrastructure/controllers/payments.controller';
import { PaymentsService } from './domain/services/payments.service';
import { PaymentGatewayFactory } from './domain/services/payment-gateway.factory';
import { InfinitePayAdapter } from './infrastructure/adapters/infinitepay.adapter';
import { EventsModule } from '../events/events.module';
import { PrintModule } from '../print/print.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [EventsModule, PrintModule, LoyaltyModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentGatewayFactory,
    InfinitePayAdapter,
  ],
  exports: [PaymentsService, PaymentGatewayFactory],
})
export class PaymentsModule {}
