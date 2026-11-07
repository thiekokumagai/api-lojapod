import { Controller, Post, Body, Param, Query, Headers, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
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

  @Post('test-infinitepay')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Testa a conexão com a InfinitePay (gera um link de teste de R$ 1,00)' })
  async testInfinitePay(@Headers('origin') headerOrigin?: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }
    return this.paymentsService.testInfinitePayConnection(storeId, headerOrigin);
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
