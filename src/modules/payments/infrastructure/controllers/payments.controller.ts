import { Controller, Post, Body, Param, Query, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from '../../domain/services/payments.service';
import { TenantContextService } from '../../../tenant/tenant-context.service';

@ApiTags('Payments Online')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  @Post('checkout/:orderId')
  @ApiOperation({ summary: 'Criar link de pagamento online (cartão) para um pedido' })
  async createCheckout(
    @Param('orderId') orderId: string,
    @Body() body: { originUrl?: string },
    @Headers('origin') headerOrigin?: string,
  ) {
    const storeId = this.tenantContextService.getStoreId();
    const origin = body?.originUrl || headerOrigin || '';
    return this.paymentsService.createOnlineCheckout(orderId, storeId || '', origin);
  }

  @Post('check-status/:orderId')
  @ApiOperation({ summary: 'Verificar status do pagamento de um pedido' })
  async checkStatus(
    @Param('orderId') orderId: string,
    @Body() body: { transactionNsu?: string; slug?: string },
  ) {
    const storeId = this.tenantContextService.getStoreId();
    return this.paymentsService.checkOrderStatus(
      orderId,
      storeId || '',
      body?.transactionNsu,
      body?.slug,
    );
  }

  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de retorno de pagamento (InfinitePay, MercadoPago, etc.)' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Query() query: any,
  ) {
    return this.paymentsService.handleWebhook(provider, payload, query);
  }
}
