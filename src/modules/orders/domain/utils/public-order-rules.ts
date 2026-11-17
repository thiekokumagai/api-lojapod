import { BadRequestException } from '@nestjs/common';

/**
 * Regras de segurança do pedido feito pela LOJA PÚBLICA (checkout do cliente, sem login).
 *
 * O pedido chega com preços, descontos e total calculados no navegador. Aqui o servidor:
 *  - ignora o que o cliente não pode decidir (status, pagamento, cupom, base do cupom);
 *  - confere o preço de cada item com o catálogo;
 *  - limita cada desconto/acréscimo pelas regras que a loja configurou;
 *  - recalcula o total com essas partes. O `totalOrder` enviado só é aceito se bater (até R$ 0,10).
 *
 * Limite conhecido: o FRETE é calculado no navegador (distância pela API do Google). O servidor não
 * tem esse cálculo, então o frete enviado é aceito (nunca negativo). Um cliente mal-intencionado pode
 * escolher um frete menor que o real, mas não consegue mais zerar itens, descontos nem o total.
 */

/** Diferença aceita no preço unitário (centavos de arredondamento). */
export const UNIT_PRICE_TOLERANCE = 0.02;
/** Diferença aceita entre o total enviado e o recalculado pelo servidor. */
export const TOTAL_TOLERANCE = 0.1;
/** Folga nos tetos de desconto (arredondamento de cada parte). */
const DISCOUNT_SLACK = 0.05;

const n = (value: unknown): number => Number(value) || 0;
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Campos do pedido que só o servidor pode definir; o cliente da loja não escolhe. */
export function sanitizePublicOrderInput<T extends Record<string, any>>(
  body: T,
): T {
  const clean: Record<string, any> = { ...body };
  // Pedido nasce pendente: só o servidor marca como pago (webhook ou verificação no provedor)
  clean.paymentStatus = 'PENDING';
  clean.status = undefined;
  clean.paymentDate = undefined;
  // Cupom: só vale o que o servidor calcula a partir do `couponTitle`
  clean.couponDiscount = 0;
  clean.couponFreightDiscount = 0;
  // Base do cupom e regras aplicadas são calculadas pelo servidor
  clean.nonPromoItemsTotal = undefined;
  clean.appliedTaxRule = undefined;
  clean.appliedCouponRule = undefined;
  // Taxa de cartão é do caixa/painel, nunca do cliente
  clean.cardFee = 0;
  clean.receiptSurcharge = 0;
  // `totalReceived` e `totalOrder` são regravados pelo servidor com o total recalculado
  return clean as T;
}

export function unitPriceMatches(price: unknown, allowed: number[]): boolean {
  const value = n(price);
  return allowed.some((a) => Math.abs(value - a) <= UNIT_PRICE_TOLERANCE);
}

/** Preços unitários que o catálogo aceita para o produto: regular e promocional. */
export function productAllowedPrices(product: {
  price?: unknown;
  promotionalPrice?: unknown;
}): number[] {
  const regular = n(product.price);
  const promo = n(product.promotionalPrice);
  return promo > 0 ? [regular, promo] : [regular];
}

/** Oferta "Peça também": preço fixo ou percentual de desconto sobre o preço do produto. */
export function orderBumpAllowedPrices(
  product: { price?: unknown; promotionalPrice?: unknown },
  bump: { customPrice?: unknown; discountPercent?: unknown },
): number[] {
  const prices = productAllowedPrices(product);
  const custom = n(bump.customPrice);
  if (custom > 0) prices.push(custom);
  const percent = n(bump.discountPercent);
  if (percent > 0) {
    for (const base of productAllowedPrices(product)) {
      prices.push(round2(base * (1 - percent / 100)));
    }
  }
  return prices;
}

interface PaymentRule {
  paymentMethod?: string;
  type?: string;
  value?: number | string;
}

/** Percentual de desconto do Pix que a loja configurou (`paymentRules`). 0 se não houver. */
export function pixDiscountPercent(paymentRules: unknown): number {
  if (!Array.isArray(paymentRules)) return 0;
  const rule = (paymentRules as PaymentRule[]).find(
    (r) => r?.paymentMethod === 'pix' && r?.type === 'discount',
  );
  return Math.max(0, n(rule?.value));
}

/** Tiers de desconto progressivo; as faixas padrão são as mesmas do widget de fidelidade da loja. */
const DEFAULT_PROGRESSIVE_PERCENTS = [3, 5, 10];

/**
 * TETO do desconto de fidelidade que o cliente pode ter agora. Não é o valor exato (o widget da loja é
 * quem calcula) e sim o maior que algum benefício real permitiria. Mesmo sem login, ninguém passa disso.
 */
export function loyaltyDiscountCap(input: {
  rewardType?: string;
  itemsTotal: number;
  program?: {
    isActive?: boolean;
    pointsRedemptionValue?: unknown;
    progressiveTiers?: unknown;
  } | null;
  card?: {
    status?: string;
    cashbackBalance?: unknown;
    pointsBalance?: unknown;
  } | null;
}): number {
  const { rewardType, itemsTotal, program, card } = input;
  if (!rewardType || !program?.isActive || !card) return 0;
  if (card.status === 'REDEEMED') return 0;

  let cap = 0;
  if (rewardType === 'CASHBACK') {
    cap = n(card.cashbackBalance);
  } else if (rewardType === 'POINTS_DISCOUNT') {
    cap = n(card.pointsBalance) * (n(program.pointsRedemptionValue) || 0.05);
  } else if (rewardType === 'PROGRESSIVE_DISCOUNT') {
    const tiers = Array.isArray(program.progressiveTiers)
      ? (program.progressiveTiers as Array<{ discountPercent?: unknown }>).map(
          (t) => n(t?.discountPercent),
        )
      : [];
    const maxPercent = Math.max(
      0,
      ...(tiers.length > 0 ? tiers : DEFAULT_PROGRESSIVE_PERCENTS),
    );
    cap = (itemsTotal * maxPercent) / 100;
  }
  return Math.max(0, Math.min(cap, itemsTotal));
}

export interface PublicOrderTotalsInput {
  /** Soma dos itens com os preços já conferidos (preço do catálogo × quantidade). */
  itemsSum: number;
  clientItemsTotal: number;
  clientTotal: number | undefined;
  freight: number;
  installmentSurcharge: number;
  receiptSurcharge: number;
  paymentDiscount: number;
  receiptDiscount: number;
  /** Já calculados pelo servidor a partir do cupom. */
  couponDiscount: number;
  couponFreightDiscount: number;
  paymentIsPix: boolean;
  pixDiscountPercent: number;
  loyaltyCap: number;
}

/** Confere as partes do pedido e devolve o total que o servidor vai gravar (e cobrar). */
export function assertPublicOrderTotals(input: PublicOrderTotalsInput): {
  itemsTotal: number;
  totalOrder: number;
} {
  const itemsSum = round2(input.itemsSum);

  if (Math.abs(n(input.clientItemsTotal) - itemsSum) > TOTAL_TOLERANCE) {
    throw new BadRequestException(
      'O preço de algum item mudou. Atualize o carrinho e tente de novo.',
    );
  }

  const negative = [
    input.installmentSurcharge,
    input.receiptSurcharge,
    input.paymentDiscount,
    input.receiptDiscount,
  ].some((v) => n(v) < 0);
  if (negative) {
    throw new BadRequestException('Valores do pedido inválidos.');
  }

  const maxPaymentDiscount = input.paymentIsPix
    ? (itemsSum * Math.max(0, input.pixDiscountPercent)) / 100
    : 0;
  if (n(input.paymentDiscount) > maxPaymentDiscount + DISCOUNT_SLACK) {
    throw new BadRequestException(
      'Desconto da forma de pagamento inválido. Atualize a página e tente de novo.',
    );
  }

  if (n(input.receiptDiscount) > input.loyaltyCap + DISCOUNT_SLACK) {
    throw new BadRequestException(
      'Desconto de fidelidade indisponível. Atualize a página e tente de novo.',
    );
  }

  // Mesma conta da loja: o desconto de fidelidade e o cupom nunca deixam os produtos negativos
  const productsAfterDiscounts = Math.max(
    0,
    itemsSum - n(input.couponDiscount) - n(input.receiptDiscount),
  );
  const expected = round2(
    Math.max(
      0,
      productsAfterDiscounts -
        n(input.paymentDiscount) +
        Math.max(0, n(input.freight)) -
        n(input.couponFreightDiscount) +
        n(input.installmentSurcharge) +
        n(input.receiptSurcharge),
    ),
  );

  if (
    input.clientTotal !== undefined &&
    Math.abs(n(input.clientTotal) - expected) > TOTAL_TOLERANCE
  ) {
    throw new BadRequestException(
      'O valor do pedido não confere. Atualize a página e tente de novo.',
    );
  }

  return { itemsTotal: itemsSum, totalOrder: expected };
}
