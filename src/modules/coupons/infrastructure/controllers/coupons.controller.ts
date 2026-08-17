import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CreateCouponUseCase } from '../../domain/use-cases/create-coupon.use-case';
import { UpdateCouponUseCase } from '../../domain/use-cases/update-coupon.use-case';
import { ListCouponsUseCase } from '../../domain/use-cases/list-coupons.use-case';
import { ToggleCouponStatusUseCase } from '../../domain/use-cases/toggle-coupon-status.use-case';
import { ValidateCouponUseCase } from '../../domain/use-cases/validate-coupon.use-case';
import { CreateCouponDto } from '../dtos/create-coupon.dto';
import { UpdateCouponDto } from '../dtos/update-coupon.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';

@ApiTags('Coupons')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly createCouponUseCase: CreateCouponUseCase,
    private readonly updateCouponUseCase: UpdateCouponUseCase,
    private readonly listCouponsUseCase: ListCouponsUseCase,
    private readonly toggleCouponStatusUseCase: ToggleCouponStatusUseCase,
    private readonly validateCouponUseCase: ValidateCouponUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new coupon' })
  async create(@Body() dto: CreateCouponDto) {
    return this.createCouponUseCase.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all coupons' })
  async findAll() {
    return this.listCouponsUseCase.execute();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a coupon' })
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.updateCouponUseCase.execute(id, dto);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle coupon status' })
  async toggleStatus(@Param('id') id: string) {
    return this.toggleCouponStatusUseCase.execute(id);
  }

  @Public()
  @Post('validate')
  @ApiOperation({ summary: 'Validate a coupon' })
  async validate(
    @Body('title') title: string,
    @Body('orderTotal') orderTotal: number,
  ) {
    return this.validateCouponUseCase.execute({ title, orderTotal });
  }
}
