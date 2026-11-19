import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RequirePermissions } from '../../../auth/infrastructure/decorators/permissions.decorator';
import { GetSalesReportUseCase } from '../../domain/use-cases/get-sales-report.use-case';
import { GetFinancialReportUseCase } from '../../domain/use-cases/get-financial-report.use-case';
import { GetProductsReportUseCase } from '../../domain/use-cases/get-products-report.use-case';
import { ReportFiltersDto } from '../dtos/report-filters.dto';

type AuthedRequest = Request & { user: { storeId?: string } };

@ApiTags('Relatórios')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('reports')
@RequirePermissions('reports')
export class ReportsController {
  constructor(
    private readonly getSalesReport: GetSalesReportUseCase,
    private readonly getFinancialReport: GetFinancialReportUseCase,
    private readonly getProductsReport: GetProductsReportUseCase,
  ) {}

  @Get('sales')
  @ApiOperation({
    summary:
      'Relatório de vendas: totais, evolução, formas de pagamento, entrega, status e lista de pedidos',
  })
  @ApiResponse({ status: 200, description: 'Relatório de vendas' })
  sales(@Req() req: AuthedRequest, @Query() filters: ReportFiltersDto) {
    return this.getSalesReport.execute({ ...filters, storeId: req.user?.storeId });
  }

  @Get('financial')
  @ApiOperation({
    summary:
      'Relatório financeiro: resultado (lucro bruto e líquido), frete, recebimentos e movimentação de caixa',
  })
  @ApiResponse({ status: 200, description: 'Relatório financeiro' })
  financial(@Req() req: AuthedRequest, @Query() filters: ReportFiltersDto) {
    return this.getFinancialReport.execute({ ...filters, storeId: req.user?.storeId });
  }

  @Get('products')
  @ApiOperation({
    summary:
      'Relatório de produtos: ranking por unidades (avulsas, dentro de box e total), lucro, boxes vendidos e produtos parados',
  })
  @ApiResponse({ status: 200, description: 'Relatório de produtos' })
  products(@Req() req: AuthedRequest, @Query() filters: ReportFiltersDto) {
    return this.getProductsReport.execute({ ...filters, storeId: req.user?.storeId });
  }
}
