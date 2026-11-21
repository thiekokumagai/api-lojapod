import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RequirePermissions } from '../../../auth/infrastructure/decorators/permissions.decorator';
import { CompositionsService } from '../../domain/compositions.service';
import { CreateCompositionGroupDto } from '../../dto/create-composition-group.dto';
import { UpdateCompositionGroupDto } from '../../dto/update-composition-group.dto';
import { CreateCompositionOptionDto } from '../../dto/create-composition-option.dto';
import { UpdateCompositionOptionDto } from '../../dto/update-composition-option.dto';
import { SyncProductCompositionsDto } from '../../dto/attach-composition-product.dto';

@ApiTags('Admin Compositions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('compositions')
@RequirePermissions('products')
export class CompositionsController {
  constructor(private readonly service: CompositionsService) {}

  @Get('groups')
  @ApiOperation({ summary: 'Listar todos os grupos de composição da loja' })
  async listGroups() {
    return this.service.listGroupsForAdmin();
  }

  @Get('groups/:id')
  @ApiOperation({ summary: 'Obter detalhes de um grupo de composição' })
  async getGroup(@Param('id') id: string) {
    return this.service.findGroupById(id);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Criar novo grupo de composição' })
  async createGroup(@Body() dto: CreateCompositionGroupDto) {
    return this.service.createGroup(dto);
  }

  @Put('groups/:id')
  @ApiOperation({ summary: 'Atualizar grupo de composição' })
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateCompositionGroupDto,
  ) {
    return this.service.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  @ApiOperation({ summary: 'Excluir grupo de composição' })
  async deleteGroup(@Param('id') id: string) {
    return this.service.deleteGroup(id);
  }

  @Post('groups/:groupId/options')
  @ApiOperation({ summary: 'Adicionar opção ao grupo de composição' })
  async createOption(
    @Param('groupId') groupId: string,
    @Body() dto: CreateCompositionOptionDto,
  ) {
    return this.service.createOption(groupId, dto);
  }

  @Put('options/:id')
  @ApiOperation({ summary: 'Atualizar opção de composição' })
  async updateOption(
    @Param('id') id: string,
    @Body() dto: UpdateCompositionOptionDto,
  ) {
    return this.service.updateOption(id, dto);
  }

  @Delete('options/:id')
  @ApiOperation({ summary: 'Excluir opção de composição' })
  async deleteOption(@Param('id') id: string) {
    return this.service.deleteOption(id);
  }

  @Get('products/:productId')
  @ApiOperation({ summary: 'Listar composições vinculadas ao produto' })
  async getProductCompositions(@Param('productId') productId: string) {
    return this.service.getProductCompositions(productId);
  }

  @Put('products/:productId')
  @ApiOperation({ summary: 'Sincronizar grupos de composição vinculados ao produto' })
  async syncProductCompositions(
    @Param('productId') productId: string,
    @Body() dto: SyncProductCompositionsDto,
  ) {
    return this.service.syncProductCompositions(productId, dto);
  }
}
