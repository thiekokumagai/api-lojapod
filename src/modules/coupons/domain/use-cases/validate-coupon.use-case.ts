import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { ICouponsRepository } from '../repositories/icoupons.repository';
import { Coupon, DiscountType } from '../entities/coupon.entity';

interface ValidateCouponInput {
  title: string;
  orderTotal: number;
}

export interface ValidateCouponOutput {
  coupon: Coupon;
  discountAmount: number;
}

@Injectable()
export class ValidateCouponUseCase {
  constructor(
    @Inject('ICouponsRepository')
    private readonly couponsRepository: ICouponsRepository,
  ) {}

  async execute(input: ValidateCouponInput): Promise<ValidateCouponOutput> {
    const coupon = await this.couponsRepository.findByTitle(
      input.title.toUpperCase(),
    );

    if (!coupon) {
      throw new BadRequestException('Cupom inválido ou não encontrado.');
    }

    if (!coupon.status) {
      throw new BadRequestException('Este cupom está inativo.');
    }

    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
      throw new BadRequestException('Este cupom já atingiu o limite de uso.');
    }

    if (coupon.minOrderValue && input.orderTotal < coupon.minOrderValue) {
      throw new BadRequestException(
        `O valor mínimo para usar este cupom é R$ ${coupon.minOrderValue.toFixed(2)}.`,
      );
    }

    const now = new Date();

    if (coupon.validUntilDate) {
      const validUntil = new Date(coupon.validUntilDate);
      validUntil.setHours(23, 59, 59, 999); // Final do dia
      if (now > validUntil) {
        throw new BadRequestException('Este cupom está expirado.');
      }
    }

    if (coupon.startTime || coupon.endTime) {
      // Comparar apenas o horário
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTotalMinutes = currentHours * 60 + currentMinutes;

      if (coupon.startTime) {
        const startHours = coupon.startTime.getUTCHours() - 3; // Supondo timezone BRT para validação, o ideal seria o timezone correto ou usar a hora enviada
        // Vamos usar a hora local da máquina/servidor para simplificar
        const sH = coupon.startTime.getHours();
        const sM = coupon.startTime.getMinutes();
        if (currentTotalMinutes < sH * 60 + sM) {
          throw new BadRequestException(
            'Este cupom ainda não é válido neste horário.',
          );
        }
      }

      if (coupon.endTime) {
        const eH = coupon.endTime.getHours();
        const eM = coupon.endTime.getMinutes();
        if (currentTotalMinutes > eH * 60 + eM) {
          throw new BadRequestException(
            'Este cupom não é mais válido neste horário.',
          );
        }
      }
    }

    let discountAmount = 0;
    if (coupon.type === DiscountType.VALUE) {
      discountAmount = Math.min(Number(coupon.value) || 0, input.orderTotal);
    } else if (coupon.type === DiscountType.PERCENTAGE) {
      discountAmount = Math.min(
        (input.orderTotal * (Number(coupon.value) || 0)) / 100,
        input.orderTotal,
      );
    } else if (coupon.type === DiscountType.FREE_SHIPPING) {
      // FRETE GRÁTIS: O desconto é o próprio valor do frete.
      // Retornaremos discountAmount = 0, e a lógica será aplicada no create-order
      discountAmount = 0;
    }

    return { coupon, discountAmount };
  }
}
