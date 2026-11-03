import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { OrderBumpsService } from '../../domain/order-bumps.service';
import { GetOrderBumpSuggestionsDto } from '../../dto/get-order-bump-suggestions.dto';

@ApiTags('Store Order Bumps')
@Public()
@Controller('store/order-bumps')
export class StoreOrderBumpsController {
  constructor(private readonly service: OrderBumpsService) {}

  @Post('suggestions')
  @ApiOperation({ summary: 'Obter produtos sugeridos para o carrinho (Order Bump)' })
  async getSuggestions(@Body() dto: GetOrderBumpSuggestionsDto) {
    return this.service.getSuggestionsForStore(dto);
  }
}
