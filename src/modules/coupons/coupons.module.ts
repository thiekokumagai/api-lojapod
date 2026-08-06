import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaCouponsRepository } from './infrastructure/database/prisma-coupons.repository';
import { CreateCouponUseCase } from './domain/use-cases/create-coupon.use-case';
import { UpdateCouponUseCase } from './domain/use-cases/update-coupon.use-case';
import { ListCouponsUseCase } from './domain/use-cases/list-coupons.use-case';
import { ToggleCouponStatusUseCase } from './domain/use-cases/toggle-coupon-status.use-case';
import { ValidateCouponUseCase } from './domain/use-cases/validate-coupon.use-case';
import { CouponsController } from './infrastructure/controllers/coupons.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CouponsController],
  providers: [
    {
      provide: 'ICouponsRepository',
      useClass: PrismaCouponsRepository,
    },
    CreateCouponUseCase,
    UpdateCouponUseCase,
    ListCouponsUseCase,
    ToggleCouponStatusUseCase,
    ValidateCouponUseCase,
  ],
  exports: [ValidateCouponUseCase, 'ICouponsRepository'],
})
export class CouponsModule {}
