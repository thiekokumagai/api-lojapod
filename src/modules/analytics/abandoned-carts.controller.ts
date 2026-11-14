import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/infrastructure/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/infrastructure/decorators/permissions.decorator';
import { AbandonedCartsService } from './abandoned-carts.service';

@ApiTags('Admin Abandoned Carts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('abandoned-carts')
@RequirePermissions('abandoned_carts')
export class AbandonedCartsController {
  constructor(private readonly service: AbandonedCartsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar carrinhos abandonados com contato (nome e telefone)',
  })
  async list() {
    return this.service.list();
  }

  @Post(':id/whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar como chamado e devolver o contato para abrir o WhatsApp',
  })
  async whatsapp(@Param('id') id: string) {
    return this.service.markContacted(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tirar da lista (apaga o contato do carrinho)' })
  async dismiss(@Param('id') id: string) {
    await this.service.dismiss(id);
  }
}
