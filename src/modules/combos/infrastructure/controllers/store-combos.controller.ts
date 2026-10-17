import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { CombosService } from '../services/combos.service';

@ApiTags('Store Combos')
@Public()
@Controller('store/combos')
export class StoreCombosController {
  constructor(private readonly combosService: CombosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar combos ativos disponíveis para venda na loja' })
  async findStoreCombos() {
    return this.combosService.findStoreCombos();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Visualizar detalhes de um combo para a loja' })
  async findById(@Param('id') id: string) {
    return this.combosService.findById(id);
  }
}
