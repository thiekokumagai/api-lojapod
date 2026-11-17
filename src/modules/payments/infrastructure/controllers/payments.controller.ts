import { Controller, Post, Body, Param, Query, Headers, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RequirePermissions } from '../../../auth/infrastructure/decorators/permissions.decorator';
import { PaymentsService } from '../../domain/services/payments.service';
import { MercadoPagoService } from '../../domain/services/mercadopago.service';
import { MercadoPagoCardDto } from '../dtos/mercadopago-card.dto';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { RateLimit, RateLimitGuard } from '../../../../common/guards/rate-limit.guard';

@ApiTags('Payments Online')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mercadoPagoService: MercadoPagoService,
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

  @Post('mercadopago/pix/:orderId')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'mp-pix', limit: 20, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mercado Pago: gera o QR Code Pix do pedido (valor calculado no servidor)' })
  async createMercadoPagoPix(@Param('orderId') orderId: string) {
    return this.mercadoPagoService.createPix(orderId, this.tenantContextService.getStoreId());
  }

  @Post('mercadopago/card/:orderId')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'mp-card', limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mercado Pago: paga o pedido com o token do cartão gerado no navegador' })
  async createMercadoPagoCard(
    @Param('orderId') orderId: string,
    @Body() dto: MercadoPagoCardDto,
  ) {
    return this.mercadoPagoService.createCard(orderId, this.tenantContextService.getStoreId(), dto);
  }

  // Declarado antes de `webhook/:provider` para o Mercado Pago nunca cair no caminho sem assinatura
  @Post('webhook/mercadopago')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'mp-webhook', limit: 120, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook do Mercado Pago (assinatura validada e pagamento reconsultado)' })
  async handleMercadoPagoWebhook(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: { type?: string; action?: string; data?: { id?: string | number } },
  ) {
    return this.mercadoPagoService.handleWebhook(query, headers, payload);
  }

  @Post('test-infinitepay')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings')
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
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'check-status', limit: 60, windowMs: 60_000 })
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
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'webhook', limit: 60, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de retorno de pagamento (InfinitePay, etc.)' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Query() query: any,
  ) {
    return this.paymentsService.handleWebhook(provider, payload, query);
  }
}
