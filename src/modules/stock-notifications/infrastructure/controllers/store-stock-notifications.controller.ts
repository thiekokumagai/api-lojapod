import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { StockNotificationsService } from '../../domain/stock-notifications.service';
import { CreateStockNotificationDto } from '../dtos/create-stock-notification.dto';

@ApiTags('Store Stock Notifications')
@Public()
@Controller('store/stock-notifications')
export class StoreStockNotificationsController {
  constructor(private readonly service: StockNotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar solicitação de avise-me quando chegar' })
  async create(@Body() dto: CreateStockNotificationDto) {
    return this.service.createForStore(dto);
  }
}
