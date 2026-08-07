import {
  Controller,
  Get,
  Post,
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

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cadastra uma nova loja (Super Admin)' })
  @ApiResponse({ status: 201, description: 'Loja criada com sucesso' })
  async createStore(@Body() dto: CreateStoreDto) {
    return this.storesService.createStore(dto);
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
