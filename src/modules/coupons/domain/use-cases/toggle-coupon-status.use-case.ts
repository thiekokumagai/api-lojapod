import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { ICouponsRepository } from '../repositories/icoupons.repository';
import { Coupon } from '../entities/coupon.entity';

@Injectable()
export class ToggleCouponStatusUseCase {
  constructor(
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
  ) {}

  async execute(id: string): Promise<Coupon> {
    const coupon = await this.couponsRepository.findById(id);
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado.');
    }

    return await this.couponsRepository.update(id, { status: !coupon.status });
  }
}
