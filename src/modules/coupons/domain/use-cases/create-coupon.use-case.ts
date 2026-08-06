import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { ICouponsRepository } from '../repositories/icoupons.repository';
import { Coupon, DiscountType } from '../entities/coupon.entity';

interface CreateCouponInput {
  title: string;
  status?: boolean;
  type: DiscountType;
  value?: number;
  validUntilDate?: string;
  startTime?: string;
  endTime?: string;
  maxUses?: number;
  minOrderValue?: number;
  applyToPromotionalItems?: boolean;
}

@Injectable()
export class CreateCouponUseCase {
  constructor(
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
  ) {}

  async execute(input: CreateCouponInput): Promise<Coupon> {
    const existingCoupon = await this.couponsRepository.findByTitle(
      input.title,
    );
    if (existingCoupon) {
      throw new BadRequestException('Já existe um cupom com este título.');
    }

    if (input.type !== DiscountType.FREE_SHIPPING && !input.value) {
      throw new BadRequestException(
        'Cupons de valor ou porcentagem precisam ter um valor definido.',
      );
    }

    const coupon = new Coupon({
      title: input.title.toUpperCase(),
      status: input.status ?? true,
      type: input.type,
      value: input.value,
      validUntilDate: input.validUntilDate
        ? new Date(input.validUntilDate)
        : undefined,
      startTime: input.startTime ? new Date(input.startTime) : undefined,
      endTime: input.endTime ? new Date(input.endTime) : undefined,
      maxUses: input.maxUses,
      currentUses: 0,
      minOrderValue: input.minOrderValue,
      applyToPromotionalItems: input.applyToPromotionalItems ?? false,
    });

    return await this.couponsRepository.create(coupon);
  }
}
