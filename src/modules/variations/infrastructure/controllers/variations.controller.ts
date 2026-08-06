import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateVariationDto } from '../dtos/create-variation.dto';
import {
  UpdateVariationDto,
  UpdateOrderDto,
} from '../dtos/update-variation.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

import { ListVariationsUseCase } from '../../domain/use-cases/list-variations.use-case';
import { GetVariationUseCase } from '../../domain/use-cases/get-variation.use-case';
import { CreateVariationUseCase } from '../../domain/use-cases/create-variation.use-case';
import { UpdateVariationUseCase } from '../../domain/use-cases/update-variation.use-case';
import { UpdateBatchOrderUseCase } from '../../domain/use-cases/update-batch-order.use-case';
import { DeleteVariationUseCase } from '../../domain/use-cases/delete-variation.use-case';

@ApiTags('Variations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('variations')
export class VariationsController {
  constructor(
    private readonly listVariationsUseCase: ListVariationsUseCase,
    private readonly getVariationUseCase: GetVariationUseCase,
    private readonly createVariationUseCase: CreateVariationUseCase,
    private readonly updateVariationUseCase: UpdateVariationUseCase,
    private readonly updateBatchOrderUseCase: UpdateBatchOrderUseCase,
    private readonly deleteVariationUseCase: DeleteVariationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar variação com opções' })
  @ApiResponse({ status: 201, description: 'Variação criada com sucesso' })
  create(@Body() body: CreateVariationDto) {
    return this.createVariationUseCase.execute(body.title, body.options);
  }

  @Get()
  @ApiOperation({ summary: 'Listar variações' })
  findAll() {
    return this.listVariationsUseCase.execute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar variação por id' })
  findOne(@Param('id') id: string) {
    return this.getVariationUseCase.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar variação' })
  update(@Param('id') id: string, @Body() body: UpdateVariationDto) {
    return this.updateVariationUseCase.execute(id, body.title, body.options);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar variação' })
  delete(@Param('id') id: string) {
    return this.deleteVariationUseCase.execute(id);
  }

  @Patch('batch/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reordenar variações' })
  async updateBatchOrder(@Body() body: UpdateOrderDto) {
    return this.updateBatchOrderUseCase.execute(body.items);
  }
}
