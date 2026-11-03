import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { OrderBumpsService } from '../../domain/order-bumps.service';
import { CreateOrderBumpDto } from '../../dto/create-order-bump.dto';
import { UpdateOrderBumpDto } from '../../dto/update-order-bump.dto';

@ApiTags('Admin Order Bumps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('order-bumps')
export class OrderBumpsController {
  constructor(private readonly service: OrderBumpsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as regras de Order Bump da loja' })
  async listAll() {
    return this.service.listAllForAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Criar nova regra de Order Bump' })
  async create(@Body() dto: CreateOrderBumpDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar regra de Order Bump' })
  async update(@Param('id') id: string, @Body() dto: UpdateOrderBumpDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/Desativar regra de Order Bump' })
  async toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir regra de Order Bump' })
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
