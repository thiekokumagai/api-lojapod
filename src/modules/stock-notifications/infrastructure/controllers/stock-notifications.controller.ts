import { Controller, Get, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { StockNotificationsService } from '../../domain/stock-notifications.service';

@ApiTags('Admin Stock Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock-notifications')
export class StockNotificationsController {
  constructor(private readonly service: StockNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as solicitações de avise-me da loja' })
  async list(@Query('status') status?: string, @Query('productId') productId?: string) {
    return this.service.listAllForAdmin({ status, productId });
  }

  @Patch(':id/notify')
  @ApiOperation({ summary: 'Marcar solicitação como notificada' })
  async markAsNotified(@Param('id') id: string) {
    return this.service.markAsNotified(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir solicitação de avise-me' })
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
