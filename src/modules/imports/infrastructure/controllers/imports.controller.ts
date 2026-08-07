import {
  Controller,
  Post,
  Delete,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { ClearDatabaseUseCase } from '../../domain/use-cases/clear-database.use-case';
import { ImportWpFinanceiroUseCase } from '../../domain/use-cases/import-wp-financeiro.use-case';
import { ImportWpProductCostsUseCase } from '../../domain/use-cases/import-wp-product-costs.use-case';

@ApiTags('Imports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly clearDatabaseUseCase: ClearDatabaseUseCase,
    private readonly importWpFinanceiroUseCase: ImportWpFinanceiroUseCase,
    private readonly importWpProductCostsUseCase: ImportWpProductCostsUseCase,
  ) {}

  @Delete('clear')
  @ApiOperation({ summary: 'Limpa o banco de dados mantendo configurações, usuários e variações' })
  @ApiResponse({ status: 200, description: 'Banco de dados limpo com sucesso' })
  async clearDatabase(@Res() res: Response) {
    try {
      await this.clearDatabaseUseCase.execute();
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Banco de dados limpo com sucesso' });
    } catch (error: any) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message || 'Erro ao limpar banco de dados' });
    }
  }

  @Post('wordpress/cash-registers')
  @ApiOperation({ summary: 'Importa caixas e transações do dump do WordPress' })
  @ApiResponse({ status: 201, description: 'Dados importados com sucesso' })
  async importWpCashRegisters(@Res() res: Response) {
    try {
      const result = await this.importWpFinanceiroUseCase.execute();
      return res.status(HttpStatus.CREATED).json(result);
    } catch (error: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: error.message || 'Erro ao importar dados do WordPress',
      });
    }
  }

  @Post('wordpress/product-costs')
  @ApiOperation({ summary: 'Importa os valores de custo dos produtos do WordPress' })
  @ApiResponse({ status: 201, description: 'Custos importados com sucesso' })
  async importWpProductCosts(@Res() res: Response) {
    try {
      const result = await this.importWpProductCostsUseCase.execute();
      return res.status(HttpStatus.CREATED).json(result);
    } catch (error: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: error.message || 'Erro ao importar custos do WordPress',
      });
    }
  }
}
