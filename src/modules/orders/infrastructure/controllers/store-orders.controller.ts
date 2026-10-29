import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { CreateOrderDto } from '../dtos/create-order.dto';
import { CreateOrderUseCase } from '../../domain/use-cases/create-order.use-case';
import { GetOrderDetailUseCase } from '../../domain/use-cases/get-order-detail.use-case';

@ApiTags('Store Orders')
@Controller('store/orders')
export class StoreOrdersController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderDetailUseCase: GetOrderDetailUseCase,
  ) {}

  @Post()
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
    return this.createOrderUseCase.execute(body as any);
  }

  @Get('check-blocked')
  @ApiOperation({ summary: 'Verifica se o telefone do cliente está bloqueado' })
  async checkBlocked(@Query('phone') phone: string) {
    if (!phone) return { isBlocked: false };
    const isBlocked = await this.createOrderUseCase.isCustomerBlocked(null, phone);
    return { isBlocked };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar status e dados do pedido pelo cliente' })
  async getById(@Param('id') id: string) {
    return this.getOrderDetailUseCase.execute(id);
  }
}
