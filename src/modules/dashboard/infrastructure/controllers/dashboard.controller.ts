import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GetDashboardStatsUseCase } from '../../domain/use-cases/get-dashboard-stats.use-case';
import { parseRankingSortBy } from '../../domain/utils/sales-profit.util';
import { GetStockOpportunitiesUseCase } from '../../domain/use-cases/get-stock-opportunities.use-case';
import { GetStoreDiagnosisUseCase } from '../../domain/use-cases/get-store-diagnosis.use-case';

import { RequirePermissions } from '../../../auth/infrastructure/decorators/permissions.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
@RequirePermissions('dashboard')
export class DashboardController {
  constructor(
    private readonly getDashboardStatsUseCase: GetDashboardStatsUseCase,
    private readonly getStockOpportunitiesUseCase: GetStockOpportunitiesUseCase,
    private readonly getStoreDiagnosisUseCase: GetStoreDiagnosisUseCase,
  ) {}

  @Get('stats')
  @ApiOperation({
    summary:
      'Obter estatísticas consolidadas (lucro bruto, margem e ranking ordenável por quantity|revenue|profit|margin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas obtidas com sucesso',
  })
  async getStats(
    @Req() req: Request & { user: { storeId?: string } },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('limit') limit?: string,
    @Query('compare') compare?: string,
  ) {
    return this.getDashboardStatsUseCase.execute({
      storeId: req.user?.storeId,
      startDate,
      endDate,
      categoryId,
      sortBy: parseRankingSortBy(sortBy),
      limit: limit ? Number(limit) || undefined : undefined,
      // compare=false pula a consulta do período anterior (ranking por categoria/ordenação).
      withComparison: compare !== 'false',
    });
  }

  @Get('diagnosis')
  @ApiOperation({
    summary:
      'Diagnóstico da loja: resultado do período (lucro líquido, ponto de equilíbrio) e lista de vazamentos por R$',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagnóstico obtido com sucesso',
  })
  async getDiagnosis(
    @Req() req: Request & { user: { storeId?: string } },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.getStoreDiagnosisUseCase.execute({
      storeId: req.user?.storeId,
      startDate,
      endDate,
    });
  }

  @Get('opportunities')
  @ApiOperation({
    summary: 'Obter análise de oportunidades, riscos de estoque e capital parado',
  })
  @ApiResponse({
    status: 200,
    description: 'Oportunidades e indicadores de estoque obtidos com sucesso',
  })
  async getOpportunities(@Req() req: Request & { user: { storeId?: string } }) {
    return this.getStockOpportunitiesUseCase.execute({
      storeId: req.user?.storeId,
    });
  }
}
