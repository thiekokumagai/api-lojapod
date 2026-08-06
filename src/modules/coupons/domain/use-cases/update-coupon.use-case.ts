import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { ICouponsRepository } from '../repositories/icoupons.repository';
import { Coupon, DiscountType } from '../entities/coupon.entity';

interface UpdateCouponInput {
  title?: string;
  status?: boolean;
  type?: DiscountType;
  value?: number;
  validUntilDate?: string;
  startTime?: string;
  endTime?: string;
  maxUses?: number;
  minOrderValue?: number;
  applyToPromotionalItems?: boolean;
}

@Injectable()
export class UpdateCouponUseCase {
  constructor(
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
  ) {}

  async execute(id: string, input: UpdateCouponInput): Promise<Coupon> {
    const coupon = await this.couponsRepository.findById(id);
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado.');
    }

    if (input.title && input.title !== coupon.title) {
      const existingCoupon = await this.couponsRepository.findByTitle(
        input.title,
      );
      if (existingCoupon) {
        throw new BadRequestException('Já existe um cupom com este título.');
      }
    }

    const type = input.type ?? coupon.type;
    const value = input.value !== undefined ? input.value : coupon.value;

    if (type !== DiscountType.FREE_SHIPPING && !value) {
      throw new BadRequestException(
        'Cupons de valor ou porcentagem precisam ter um valor definido.',
      );
    }

    const updateData: Partial<Coupon> = {
      ...(input.title && { title: input.title.toUpperCase() }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.type && { type: input.type }),
      ...(input.value !== undefined && { value: input.value }),
      ...(input.validUntilDate !== undefined && {
        validUntilDate: input.validUntilDate
          ? new Date(input.validUntilDate)
          : null,
      }),
      ...(input.startTime !== undefined && {
        startTime: input.startTime ? new Date(input.startTime) : null,
      }),
      ...(input.endTime !== undefined && {
        endTime: input.endTime ? new Date(input.endTime) : null,
      }),
      ...(input.maxUses !== undefined && { maxUses: input.maxUses }),
      ...(input.minOrderValue !== undefined && {
        minOrderValue: input.minOrderValue,
      }),
      ...(input.applyToPromotionalItems !== undefined && {
        applyToPromotionalItems: input.applyToPromotionalItems,
      }),
    };

    return await this.couponsRepository.update(id, updateData);
  }
}
