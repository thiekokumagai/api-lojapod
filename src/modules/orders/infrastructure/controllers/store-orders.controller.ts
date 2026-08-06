import {
  Controller,
  Post,
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

@ApiTags('Store Orders')
@Controller('store/orders')
export class StoreOrdersController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
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
}
