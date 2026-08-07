import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StoresService } from '../../domain/services/stores.service';
import { CreateStoreDto } from '../dtos/create-store.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get('by-subdomain/:subdomain')
  @ApiOperation({ summary: 'Obtém dados públicos da loja pelo subdomínio (Storefront)' })
  async getStoreBySubdomain(@Param('subdomain') subdomain: string) {
    return this.storesService.getStoreBySubdomain(subdomain);
  }

  @Post('print-agent/validate')
  @ApiOperation({ summary: 'Valida o token de ativação do agente de impressão (Print Agent)' })
  async validatePrintToken(@Body() body: { token: string }) {
    return this.storesService.validatePrintToken(body.token);
  }

  @Get(':id/print-token')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtém o token de impressão da loja' })
  async getPrintToken(@Param('id') id: string) {
    return this.storesService.getPrintTokenForStore(id);
  }

  @Post(':id/print-token/rotate')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gera um novo token de impressão para a loja' })
  async rotatePrintToken(@Param('id') id: string) {
    return this.storesService.rotatePrintToken(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cadastra uma nova loja (Super Admin)' })
  @ApiResponse({ status: 201, description: 'Loja criada com sucesso' })
  async createStore(@Body() dto: CreateStoreDto) {
    return this.storesService.createStore(dto);
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualiza título, subdomínio, e-mail admin e senha da loja' })
  async updateStore(
    @Param('id') id: string,
    @Body() body: { title?: string; subdomain?: string; adminEmail?: string; password?: string },
  ) {
    return this.storesService.updateStore(id, body);
  }

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lista todas as lojas cadastradas no sistema (Super Admin)' })
  async listStores() {
    return this.storesService.listStores();
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtém detalhes de uma loja específica por ID (Super Admin)' })
  async getStoreById(@Param('id') id: string) {
    return this.storesService.getStoreById(id);
  }
}
