import { Controller, Get, Post, Body, UseGuards, Param, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { CreateCourierUseCase } from '../../domain/use-cases/create-courier.use-case';
import { GetCouriersUseCase } from '../../domain/use-cases/get-couriers.use-case';
import { RegisterCourierFeeUseCase } from '../../domain/use-cases/register-courier-fee.use-case';
import { PayCourierUseCase } from '../../domain/use-cases/pay-courier.use-case';
import { GetCourierUseCase } from '../../domain/use-cases/get-courier.use-case';
import { DeleteCourierTransactionUseCase } from '../../domain/use-cases/delete-courier-transaction.use-case';

@ApiTags('Couriers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('couriers')
export class CouriersController {
  constructor(
    private readonly createCourierUseCase: CreateCourierUseCase,
    private readonly getCouriersUseCase: GetCouriersUseCase,
    private readonly registerCourierFeeUseCase: RegisterCourierFeeUseCase,
    private readonly payCourierUseCase: PayCourierUseCase,
    private readonly getCourierUseCase: GetCourierUseCase,
    private readonly deleteCourierTransactionUseCase: DeleteCourierTransactionUseCase,
  ) {}

  @Get()
  async getCouriers() {
    return this.getCouriersUseCase.execute();
  }

  @Post()
  async createCourier(@Body() data: { name: string; phone: string }) {
    return this.createCourierUseCase.execute(data);
  }

  @Post('fee')
  async registerFee(@Body() data: { courierId: string; amount: number; description: string; orderIds?: string[] }) {
    return this.registerCourierFeeUseCase.execute(data);
  }

  @Post('pay')
  async payCourier(@Body() data: { courierId: string; amount: number; description?: string }) {
    return this.payCourierUseCase.execute(data);
  }

  @Get(':id')
  async getCourier(@Param('id') id: string) {
    return this.getCourierUseCase.execute(id);
  }

  @Delete('transactions/:id')
  async deleteTransaction(@Param('id') id: string) {
    return this.deleteCourierTransactionUseCase.execute(id);
  }
}
