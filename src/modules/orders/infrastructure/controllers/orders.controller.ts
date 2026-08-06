import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { QueryOrdersDto } from '../dtos/query-orders.dto';
import { CreateOrderDto } from '../dtos/create-order.dto';
import { ListOrdersUseCase } from '../../domain/use-cases/list-orders.use-case';
import { GetOrderDetailUseCase } from '../../domain/use-cases/get-order-detail.use-case';
import { CancelOrderUseCase } from '../../domain/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '../../domain/use-cases/create-order.use-case';
import { UpdateOrderStatusUseCase } from '../../domain/use-cases/update-order-status.use-case';
import { ReceiveOrderUseCase } from '../../domain/use-cases/receive-order.use-case';
import { RevertReceiveOrderUseCase } from '../../domain/use-cases/revert-receive-order.use-case';
import { MarkOrderPrintedUseCase } from '../../domain/use-cases/mark-order-printed.use-case';
import { ReprintOrderUseCase } from '../../domain/use-cases/reprint-order.use-case';
import { UpdateOrderUseCase } from '../../domain/use-cases/update-order.use-case';
import { OrderStatus, PaymentStatus } from '../../domain/entities/order.entity';
import { ReceiveOrderDto } from '../dtos/receive-order.dto';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly getOrderDetailUseCase: GetOrderDetailUseCase,
    private readonly cancelOrderUseCase: CancelOrderUseCase,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
    private readonly receiveOrderUseCase: ReceiveOrderUseCase,
    private readonly revertReceiveOrderUseCase: RevertReceiveOrderUseCase,
    private readonly markOrderPrintedUseCase: MarkOrderPrintedUseCase,
    private readonly reprintOrderUseCase: ReprintOrderUseCase,
    private readonly updateOrderUseCase: UpdateOrderUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os pedidos com filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista de pedidos obtida com sucesso',
  })
  async list(@Query() query: QueryOrdersDto) {
    return this.listOrdersUseCase.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de um pedido por ID' })
  @ApiResponse({
    status: 200,
    description: 'Detalhes do pedido obtidos com sucesso',
  })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  async getDetail(@Param('id') id: string) {
    return this.getOrderDetailUseCase.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar um novo pedido com verificação de estoque' })
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

  @Post(':id/update-full')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualizar um pedido completo com verificação de estoque' })
  @ApiResponse({
    status: 200,
    description: 'Pedido atualizado com sucesso',
  })
  async updateFull(@Param('id') id: string, @Body() body: CreateOrderDto) {
    return this.updateOrderUseCase.execute(id, body as any);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar um pedido por ID' })
  @ApiResponse({ status: 200, description: 'Pedido cancelado com sucesso' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  async cancel(@Param('id') id: string) {
    return this.cancelOrderUseCase.execute(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualizar status do pedido' })
  @ApiResponse({ status: 200, description: 'Status atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: OrderStatus; paymentStatus?: PaymentStatus },
  ) {
    return this.updateOrderStatusUseCase.execute(id, body);
  }

  @Patch(':id/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receber pagamento de um pedido' })
  @ApiResponse({ status: 200, description: 'Pagamento recebido com sucesso' })
  async receive(@Param('id') id: string, @Body() body: ReceiveOrderDto) {
    return this.receiveOrderUseCase.execute(id, body);
  }

  @Post(':id/revert-receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverter recebimento de pagamento de um pedido' })
  @ApiResponse({
    status: 200,
    description: 'Recebimento revertido com sucesso',
  })
  async revertReceive(@Param('id') id: string) {
    return this.revertReceiveOrderUseCase.execute(id);
  }

  @Patch(':id/print')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar pedido como impresso' })
  @ApiResponse({ status: 200, description: 'Pedido marcado como impresso com sucesso' })
  async markPrinted(@Param('id') id: string) {
    await this.markOrderPrintedUseCase.execute(id);
    return { success: true };
  }

  @Post(':id/reprint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenviar pedido para a impressora (Print Agent)' })
  @ApiResponse({ status: 200, description: 'Comando de impressão enviado com sucesso' })
  async reprint(@Param('id') id: string) {
    await this.reprintOrderUseCase.execute(id);
    return { success: true };
  }
}
