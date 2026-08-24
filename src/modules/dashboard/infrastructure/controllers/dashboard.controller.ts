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

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getDashboardStatsUseCase: GetDashboardStatsUseCase,
  ) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Obter estatísticas consolidadas e detalhadas para o dashboard',
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
  ) {
    return this.getDashboardStatsUseCase.execute({
      storeId: req.user?.storeId,
      startDate,
      endDate,
      categoryId,
    });
  }
}
