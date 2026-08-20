import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { ICouponsRepository } from '../repositories/icoupons.repository';
import { Coupon, DiscountType } from '../entities/coupon.entity';

interface ValidateCouponInput {
  title: string;
  orderTotal: number;
  nonPromoItemsTotal?: number;
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
      // O frontend envia a hora digitada como UTC (ex: 20:00 vira 20:00Z).
      // Portanto, extraímos a hora digitada usando getUTCHours().
      // Comparamos com a hora atual no fuso do Brasil (BRT: UTC-3).
      let currentHours = now.getUTCHours() - 3;
      if (currentHours < 0) currentHours += 24;
      const currentMinutes = now.getUTCMinutes();
      const currentTotalMinutes = currentHours * 60 + currentMinutes;

      if (coupon.startTime) {
        const sH = coupon.startTime.getUTCHours();
        const sM = coupon.startTime.getUTCMinutes();
        if (currentTotalMinutes < sH * 60 + sM) {
          throw new BadRequestException(
            'Este cupom ainda não é válido neste horário.',
          );
        }
      }

      if (coupon.endTime) {
        let eH = coupon.endTime.getUTCHours();
        const eM = coupon.endTime.getUTCMinutes();
        
        // Se a hora final for 00:00, consideramos como 24:00 (final do dia)
        if (eH === 0 && eM === 0) {
          eH = 24;
        }

        if (currentTotalMinutes > eH * 60 + eM) {
          throw new BadRequestException(
            'Este cupom não é mais válido neste horário.',
          );
        }
      }
    }

    let discountAmount = 0;
    
    // Calcula o valor sobre o qual o cupom será aplicado
    const applicableTotal = coupon.applyToPromotionalItems 
      ? input.orderTotal 
      : (input.nonPromoItemsTotal ?? input.orderTotal);

    if (applicableTotal > 0) {
      if (coupon.type === DiscountType.VALUE) {
        discountAmount = Math.min(Number(coupon.value) || 0, applicableTotal);
      } else if (coupon.type === DiscountType.PERCENTAGE) {
        discountAmount = Math.min(
          (applicableTotal * (Number(coupon.value) || 0)) / 100,
          applicableTotal,
        );
      }
    } else if (coupon.type !== DiscountType.FREE_SHIPPING && !coupon.applyToPromotionalItems) {
      throw new BadRequestException('Este cupom não se aplica aos itens promocionais do carrinho.');
    }

    if (coupon.type === DiscountType.FREE_SHIPPING) {
      // FRETE GRÁTIS: O desconto é o próprio valor do frete.
      // Retornaremos discountAmount = 0, e a lógica será aplicada no create-order
      discountAmount = 0;
    }

    return { coupon, discountAmount };
  }
}
