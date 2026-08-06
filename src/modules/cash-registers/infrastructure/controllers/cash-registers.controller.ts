import { ApiBearerAuth } from '@nestjs/swagger';
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
import { CreateCashRegisterUseCase } from '../../domain/use-cases/create-cash-register.use-case';
import { UpdateCashRegisterUseCase } from '../../domain/use-cases/update-cash-register.use-case';
import { DeleteCashRegisterUseCase } from '../../domain/use-cases/delete-cash-register.use-case';
import { ListCashRegistersUseCase } from '../../domain/use-cases/list-cash-registers.use-case';
import { GetCashRegisterSummaryUseCase } from '../../domain/use-cases/get-cash-register-summary.use-case';
import { CreateCashTransactionUseCase } from '../../domain/use-cases/create-cash-transaction.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('cash-registers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class CashRegistersController {
  constructor(
    private readonly createUseCase: CreateCashRegisterUseCase,
    private readonly updateUseCase: UpdateCashRegisterUseCase,
    private readonly deleteUseCase: DeleteCashRegisterUseCase,
    private readonly listUseCase: ListCashRegistersUseCase,
    private readonly getSummaryUseCase: GetCashRegisterSummaryUseCase,
    private readonly createTransactionUseCase: CreateCashTransactionUseCase,
  ) {}

  @Post()
  async create(
    @Body() data: { title: string; startDate: string; endDate: string; initialValue?: number },
  ) {
    return this.createUseCase.execute({
      title: data.title,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      initialValue: data.initialValue ? Number(data.initialValue) : undefined,
    });
  }

  @Get()
  async findAll() {
    return this.listUseCase.execute();
  }

  @Get(':id/summary')
  async getSummary(@Param('id') id: string) {
    return this.getSummaryUseCase.execute(id);
  }

  @Post(':id/transactions')
  async createTransaction(
    @Param('id') id: string,
    @Body()
    data: {
      type: 'ENTRY' | 'OUTFLOW';
      amount: number;
      description: string;
      category?: string;
    },
  ) {
    return this.createTransactionUseCase.execute({
      cashRegisterId: id,
      type: data.type,
      amount: data.amount,
      description: data.description,
      category: data.category,
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: { title?: string; startDate?: string; endDate?: string; initialValue?: number },
  ) {
    return this.updateUseCase.execute(id, {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      initialValue: data.initialValue !== undefined ? Number(data.initialValue) : undefined,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.deleteUseCase.execute(id);
  }
}
