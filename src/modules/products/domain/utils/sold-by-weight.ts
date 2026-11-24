import { BadRequestException } from '@nestjs/common';

/** Tipos de loja que vendem por peso (self-service, açaí por kg). */
export const SOLD_BY_WEIGHT_BUSINESS_TYPES = ['FOOD', 'ACAI'] as const;

/** Tara máxima aceita no cadastro (5 kg cobre qualquer recipiente de balcão). */
export const MAX_TARE_WEIGHT_GRAMS = 5000;

/**
 * Regras do cadastro de produto vendido por peso. `isSoldByWeight`/`isCustomizable` são o estado FINAL
 * do produto (no update, o valor novo ou o que já estava gravado).
 */
export function assertSoldByWeightRules(params: {
  isSoldByWeight: boolean;
  isCustomizable: boolean;
  businessType: string | null | undefined;
}): void {
  if (!params.isSoldByWeight) return;

  if (
    !SOLD_BY_WEIGHT_BUSINESS_TYPES.includes(
      params.businessType as (typeof SOLD_BY_WEIGHT_BUSINESS_TYPES)[number],
    )
  ) {
    throw new BadRequestException(
      'Venda por peso só está disponível para lojas de comida ou açaí.',
    );
  }
  if (params.isCustomizable) {
    throw new BadRequestException(
      'Produto vendido por peso não pode ter montagem por etapas.',
    );
  }
}
