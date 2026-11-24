import { BadRequestException } from '@nestjs/common';
import { UNIT_PRICE_TOLERANCE, round2 } from './public-order-rules';

/**
 * Venda por peso (balança do PDV). Cada pesagem vira um item com quantity = 1 e
 * price = round2(weightKg × unitPricePerKg). O preço por kg vem SEMPRE do cadastro do produto.
 */

/** Peso máximo aceito por pesagem (balança de balcão vai até 30–50 kg; folga para não barrar uso real). */
export const MAX_WEIGHT_KG = 100;
export const MIN_WEIGHT_KG = 0.001;

export type WeightSource = 'SCALE' | 'MANUAL';

export const round3 = (value: number): number =>
  Math.round(value * 1000) / 1000;

/** O que o PDV mandou sobre o peso, já retirado do item (ver `takeWeightInput`). */
export interface WeightInput {
  weightKg: unknown;
  unitPricePerKg: unknown;
  weightSource: unknown;
}

interface WeightFields {
  weightKg?: number | null;
  unitPricePerKg?: number | null;
  weightSource?: WeightSource | null;
}

/**
 * Retira os campos de peso do item e devolve o que veio. Assim um item que NÃO é por peso
 * nunca grava peso vindo da tela, e o item por peso só grava o que o servidor validou.
 */
export function takeWeightInput(item: WeightFields): WeightInput {
  const input: WeightInput = {
    weightKg: item.weightKg,
    unitPricePerKg: item.unitPricePerKg,
    weightSource: item.weightSource,
  };
  item.weightKg = null;
  item.unitPricePerKg = null;
  item.weightSource = null;
  return input;
}

/** Item gravado com peso (vale para o item do domínio e para o registro do Prisma, com Decimal). */
export function isWeighedItem(
  item: { weightKg?: unknown } | null | undefined,
): boolean {
  if (item?.weightKg === null || item?.weightKg === undefined) return false;
  return Number(item.weightKg) > 0;
}

const fmtKg = (kg: number) => kg.toFixed(3).replace('.', ',');

/**
 * Valida a pesagem e grava no item o preço calculado pelo servidor.
 * `promoAllowed`: a forma de pagamento do pedido permite o preço promocional (mesma regra do item por unidade).
 * Recusa (em vez de corrigir calado) quando o valor da tela não bate: o total do pedido foi somado com ele.
 */
export function applyWeightedItem(
  product: { title: string; price?: unknown; promotionalPrice?: unknown },
  item: {
    quantity: number;
    price: number;
    isCustomized?: boolean;
    isCombo?: boolean;
    comboId?: string | null;
  } & WeightFields,
  input: WeightInput,
  options: { promoAllowed: boolean },
): void {
  const title = product.title;

  if (item.isCombo || item.comboId) {
    throw new BadRequestException(
      `"${title}" é vendido por peso e não pode entrar como combo.`,
    );
  }
  if (item.isCustomized) {
    throw new BadRequestException(
      `"${title}" é vendido por peso e não aceita montagem por etapas.`,
    );
  }
  if (Number(item.quantity) !== 1) {
    throw new BadRequestException(
      `Cada pesagem de "${title}" entra como um item separado (quantidade 1).`,
    );
  }

  const rawKg = Number(input.weightKg);
  if (
    !Number.isFinite(rawKg) ||
    rawKg < MIN_WEIGHT_KG ||
    rawKg > MAX_WEIGHT_KG
  ) {
    throw new BadRequestException(
      `Informe o peso de "${title}" entre ${fmtKg(MIN_WEIGHT_KG)} e ${MAX_WEIGHT_KG} kg.`,
    );
  }
  const weightKg = round3(rawKg);

  const regular = Number(product.price) || 0;
  if (!(regular > 0)) {
    throw new BadRequestException(
      `"${title}" está sem preço por kg no cadastro.`,
    );
  }
  const promo = Number(product.promotionalPrice) || 0;
  const allowedPerKg = [regular];
  if (options.promoAllowed && promo > 0 && promo < regular)
    allowedPerKg.push(promo);

  const requested =
    input.unitPricePerKg === null || input.unitPricePerKg === undefined
      ? regular
      : Number(input.unitPricePerKg);
  const unitPricePerKg = allowedPerKg.find(
    (p) => Math.abs(p - requested) < 0.005,
  );
  if (unitPricePerKg === undefined) {
    throw new BadRequestException(
      `O preço por kg de "${title}" mudou. Pese de novo para atualizar o valor.`,
    );
  }

  const price = round2(weightKg * unitPricePerKg);
  if (Math.abs((Number(item.price) || 0) - price) > UNIT_PRICE_TOLERANCE) {
    throw new BadRequestException(
      `O valor de "${title}" não confere com o peso (${fmtKg(weightKg)} kg × R$ ${unitPricePerKg.toFixed(2).replace('.', ',')}/kg = R$ ${price.toFixed(2).replace('.', ',')}).`,
    );
  }

  item.price = price;
  item.weightKg = weightKg;
  item.unitPricePerKg = unitPricePerKg;
  item.weightSource = input.weightSource === 'SCALE' ? 'SCALE' : 'MANUAL';
}
