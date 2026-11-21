import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { CompositionsService } from '../../domain/compositions.service';

@ApiTags('Store Compositions')
@Public()
@Controller('store/compositions')
export class StoreCompositionsController {
  constructor(private readonly service: CompositionsService) {}

  @Get('product/:productId')
  @ApiOperation({ summary: 'Obter grupos e opções de montagem ativas para o produto da loja' })
  async getProductCompositions(@Param('productId') productId: string) {
    return this.service.getProductCompositionsForStore(productId);
  }
}
