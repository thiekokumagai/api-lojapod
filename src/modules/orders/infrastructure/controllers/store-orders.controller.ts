import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Header,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { CreateOrderDto } from '../dtos/create-order.dto';
import { CreateOrderUseCase } from '../../domain/use-cases/create-order.use-case';
import { GetOrderDetailUseCase } from '../../domain/use-cases/get-order-detail.use-case';
import { ISettingsRepository } from '../../../settings/domain/repositories/isettings.repository';
import { getPaymentNotAllowedReason } from '../../domain/utils/payment-availability';
import { sanitizePublicOrderInput } from '../../domain/utils/public-order-rules';
import { RateLimit, RateLimitGuard } from '../../../../common/guards/rate-limit.guard';

@ApiTags('Store Orders')
@Controller('store/orders')
export class StoreOrdersController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderDetailUseCase: GetOrderDetailUseCase,
    private readonly settingsRepository: ISettingsRepository,
  ) {}

  @Post()
  // Sem login e sem captcha: o limite por IP segura criação de pedidos em massa (e teste de cartões por trás deles)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'store-order', limit: 10, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar um novo pedido pela loja virtual (Cliente)' })
  @ApiResponse({
    status: 201,
    description: 'Pedido criado com sucesso',
    type: CreateOrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Estoque insuficiente ou dados inválidos',
  })
  async create(@Body() body: CreateOrderDto) {
    // Pedidos do catálogo só podem usar formas de pagamento ativas na loja
    const settings = await this.settingsRepository.get();
    const reason = getPaymentNotAllowedReason(
      settings,
      body.paymentType,
      body.paymentMethod,
    );
    if (reason) {
      throw new BadRequestException(reason);
    }

    // Pedido da loja pública: o cliente não decide status, pagamento nem desconto; o servidor confere preços e total
    return this.createOrderUseCase.execute(sanitizePublicOrderInput(body) as any, {
      publicOrder: true,
    });
  }

  @Get('check-blocked')
  @ApiOperation({ summary: 'Verifica se o telefone do cliente está bloqueado' })
  async checkBlocked(@Query('phone') phone: string) {
    if (!phone) return { isBlocked: false };
    const isBlocked = await this.createOrderUseCase.isCustomerBlocked(
      null,
      phone,
    );
    return { isBlocked };
  }

  @Get(':id')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  @ApiOperation({ summary: 'Consultar status e dados do pedido pelo cliente' })
  async getById(@Param('id') id: string) {
    return this.getOrderDetailUseCase.execute(id);
  }
}
