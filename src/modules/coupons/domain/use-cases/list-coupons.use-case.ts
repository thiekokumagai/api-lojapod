import { Injectable, Inject } from '@nestjs/common';
import type { ICouponsRepository } from '../repositories/icoupons.repository';
import { Coupon } from '../entities/coupon.entity';

@Injectable()
export class ListCouponsUseCase {
  constructor(
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
  ) {}

  async execute(): Promise<Coupon[]> {
    return await this.couponsRepository.findAll();
  }
}
