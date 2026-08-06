import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { AddInvestmentUseCase } from '../../domain/use-cases/add-investment.use-case';
import { RegisterPurchaseUseCase } from '../../domain/use-cases/register-purchase.use-case';
import { GetInvestmentSummaryUseCase } from '../../domain/use-cases/get-investment-summary.use-case';
import { ListInvestmentTransactionsUseCase } from '../../domain/use-cases/list-investment-transactions.use-case';
import { DeleteInvestmentUseCase } from '../../domain/use-cases/delete-investment.use-case';
import { AddInvestmentDto } from './dtos/add-investment.dto';
import { RegisterPurchaseDto } from './dtos/register-purchase.dto';
import { AnalyzePurchaseUseCase } from '../../domain/use-cases/analyze-purchase.use-case';

@ApiTags('investments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(
    private readonly addInvestmentUseCase: AddInvestmentUseCase,
    private readonly registerPurchaseUseCase: RegisterPurchaseUseCase,
    private readonly getInvestmentSummaryUseCase: GetInvestmentSummaryUseCase,
    private readonly listInvestmentTransactionsUseCase: ListInvestmentTransactionsUseCase,
    private readonly deleteInvestmentUseCase: DeleteInvestmentUseCase,
    private readonly analyzePurchaseUseCase: AnalyzePurchaseUseCase,
  ) {}

  @Public()
  @Get('purchase-analysis')
  @ApiOperation({
    summary: 'Retorna a análise de compras baseada nas vendas, estoque e orçamento disponível',
  })
  async getPurchaseAnalysis(
    @Query('meses') meses?: number,
    @Query('categoria') categoria?: string,
    @Query('dias_cobertura') dias_cobertura?: number,
    @Query('valor') valor?: number,
    @Headers('token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    // Permite o token estático do n8n ou o token JWT normal do app
    if (token !== 'cG9kZW1haXM6MzMyNTI3Mjg' && !auth) {
      throw new UnauthorizedException('Token inválido ou ausente');
    }
    return await this.analyzePurchaseUseCase.execute({ meses, categoria, dias_cobertura, valor });
  }

  @Post('add')
  @ApiOperation({
    summary:
      'Adiciona dinheiro ao módulo de investimento de forma independente',
  })
  async addInvestment(@Body() dto: AddInvestmentDto) {
    return await this.addInvestmentUseCase.execute(dto);
  }

  @Post('purchase')
  @ApiOperation({
    summary: 'Registra uma compra de mercadoria subtraindo do investimento',
  })
  async registerPurchase(@Body() dto: RegisterPurchaseDto) {
    return await this.registerPurchaseUseCase.execute(dto);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Retorna o resumo (saldo e totais) do módulo de investimento',
  })
  async getSummary() {
    return await this.getInvestmentSummaryUseCase.execute();
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Lista todo o histórico de transações de investimento',
  })
  async listTransactions() {
    return await this.listInvestmentTransactionsUseCase.execute();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Exclui uma transação de investimento pelo ID' })
  async deleteTransaction(@Param('id') id: string) {
    return await this.deleteInvestmentUseCase.execute(id);
  }
}
