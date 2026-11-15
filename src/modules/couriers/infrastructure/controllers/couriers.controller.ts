import { Controller, Get, Post, Put, Patch, Body, UseGuards, Param, Delete, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { CreateCourierUseCase } from '../../domain/use-cases/create-courier.use-case';
import { UpdateCourierUseCase } from '../../domain/use-cases/update-courier.use-case';
import { GetCouriersUseCase } from '../../domain/use-cases/get-couriers.use-case';
import { RegisterCourierFeeUseCase } from '../../domain/use-cases/register-courier-fee.use-case';
import { PayCourierUseCase } from '../../domain/use-cases/pay-courier.use-case';
import { GetCourierUseCase } from '../../domain/use-cases/get-courier.use-case';
import { DeleteCourierTransactionUseCase } from '../../domain/use-cases/delete-courier-transaction.use-case';
import { AdjustCourierFeeUseCase } from '../../domain/use-cases/adjust-courier-fee.use-case';
import { GetCourierRoutesUseCase } from '../../domain/use-cases/get-courier-routes.use-case';

import { RequireWritePermissions } from '../../../auth/infrastructure/decorators/permissions.decorator';

@ApiTags('Couriers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('couriers')
@RequireWritePermissions('couriers', 'delivery_map')
export class CouriersController {
  constructor(
    private readonly createCourierUseCase: CreateCourierUseCase,
    private readonly updateCourierUseCase: UpdateCourierUseCase,
    private readonly getCouriersUseCase: GetCouriersUseCase,
    private readonly registerCourierFeeUseCase: RegisterCourierFeeUseCase,
    private readonly payCourierUseCase: PayCourierUseCase,
    private readonly getCourierUseCase: GetCourierUseCase,
    private readonly deleteCourierTransactionUseCase: DeleteCourierTransactionUseCase,
    private readonly adjustCourierFeeUseCase: AdjustCourierFeeUseCase,
    private readonly getCourierRoutesUseCase: GetCourierRoutesUseCase,
  ) {}

  @Get()
  async getCouriers() {
    return this.getCouriersUseCase.execute();
  }

  @Post()
  async createCourier(@Body() data: { name: string; phone: string }) {
    return this.createCourierUseCase.execute(data);
  }

  @Put(':id')
  async updateCourier(
    @Param('id') id: string,
    @Body() data: { name?: string; phone?: string; isActive?: boolean },
  ) {
    return this.updateCourierUseCase.execute(id, data);
  }

  @Post('fee')
  async registerFee(@Body() data: { courierId: string; amount: number; description: string; orderIds?: string[] }) {
    return this.registerCourierFeeUseCase.execute(data);
  }

  @Post('pay')
  async payCourier(@Body() data: { courierId: string; amount: number; description?: string }) {
    return this.payCourierUseCase.execute(data);
  }

  // Precisa vir ANTES de `:id`, senão "routes" seria lido como id de motoboy.
  @Get('routes')
  async getRoutes(
    @Query('ids') ids: string | undefined,
    @Req() req: Request & { user?: { storeId?: string } },
  ) {
    return this.getCourierRoutesUseCase.execute(ids, req.user?.storeId);
  }

  @Get(':id')
  async getCourier(@Param('id') id: string) {
    return this.getCourierUseCase.execute(id);
  }

  @Patch('transactions/:id')
  async adjustFee(
    @Param('id') id: string,
    @Body() body: { amount: number },
    @Req() req: Request & { user?: { storeId?: string } },
  ) {
    return this.adjustCourierFeeUseCase.execute({
      transactionId: id,
      amount: body?.amount,
      storeId: req.user?.storeId,
    });
  }

  @Delete('transactions/:id')
  async deleteTransaction(
    @Param('id') id: string,
    @Req() req: Request & { user?: { storeId?: string } },
  ) {
    return this.deleteCourierTransactionUseCase.execute(id, req.user?.storeId);
  }
}
