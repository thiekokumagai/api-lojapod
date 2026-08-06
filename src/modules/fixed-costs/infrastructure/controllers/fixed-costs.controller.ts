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
import { CreateFixedCostUseCase } from '../../domain/use-cases/create-fixed-cost.use-case';
import { ListFixedCostsUseCase } from '../../domain/use-cases/list-fixed-costs.use-case';
import { UpdateFixedCostUseCase } from '../../domain/use-cases/update-fixed-cost.use-case';
import { DeleteFixedCostUseCase } from '../../domain/use-cases/delete-fixed-cost.use-case';
import { PayFixedCostUseCase } from '../../domain/use-cases/pay-fixed-cost.use-case';
import { CreateCashTransactionUseCase } from '../../domain/use-cases/create-cash-transaction.use-case';
import { DeleteCashTransactionUseCase } from '../../domain/use-cases/delete-cash-transaction.use-case';
import { CreateFixedCostDto } from '../dto/create-fixed-cost.dto';
import { UpdateFixedCostDto } from '../dto/update-fixed-cost.dto';
import { PayFixedCostDto } from '../dto/pay-fixed-cost.dto';
import { CreateCashTransactionDto } from '../dto/create-cash-transaction.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('fixed-costs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class FixedCostsController {
  constructor(
    private readonly createUseCase: CreateFixedCostUseCase,
    private readonly listUseCase: ListFixedCostsUseCase,
    private readonly updateUseCase: UpdateFixedCostUseCase,
    private readonly deleteUseCase: DeleteFixedCostUseCase,
    private readonly payUseCase: PayFixedCostUseCase,
    private readonly createCashTransactionUseCase: CreateCashTransactionUseCase,
    private readonly deleteCashTransactionUseCase: DeleteCashTransactionUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateFixedCostDto) {
    return this.createUseCase.execute(dto);
  }

  @Get()
  async findAll() {
    return this.listUseCase.execute();
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFixedCostDto) {
    return this.updateUseCase.execute(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.deleteUseCase.execute(id);
  }

  @Post(':id/pay')
  async pay(@Param('id') id: string, @Body() dto: PayFixedCostDto) {
    return this.payUseCase.execute({
      fixedCostId: id,
      amount: dto.amount,
      cashRegisterId: dto.cashRegisterId,
      description: dto.description,
    });
  }

  @Post('transactions')
  async createTransaction(@Body() dto: CreateCashTransactionDto) {
    return this.createCashTransactionUseCase.execute(dto);
  }

  @Delete('transactions/:id')
  async deleteTransaction(@Param('id') id: string) {
    return this.deleteCashTransactionUseCase.execute(id);
  }
}
