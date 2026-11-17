import { UnprocessableEntityException } from '@nestjs/common';

interface OrderAmountFields {
  itemsTotal?: unknown;
  freight?: unknown;
  installmentSurcharge?: unknown;
  receiptSurcharge?: unknown;
  paymentDiscount?: unknown;
  receiptDiscount?: unknown;
  couponDiscount?: unknown;
  couponFreightDiscount?: unknown;
  totalOrder?: unknown;
}

const n = (value: unknown): number => Number(value) || 0;
const cents = (value: number): number => Math.round(value * 100);

/** Mesma conta que o pedido usa ao ser criado (`create-order.use-case.ts`). */
export function computeOrderTotal(order: OrderAmountFields): number {
  const freight = n(order.freight) > 0 ? n(order.freight) : 0;
  return (
    Math.round(
      (n(order.itemsTotal) +
        freight +
        n(order.installmentSurcharge) +
        n(order.receiptSurcharge) -
        n(order.paymentDiscount) -
        n(order.receiptDiscount) -
        n(order.couponDiscount) -
        n(order.couponFreightDiscount)) *
        100,
    ) / 100
  );
}

/** Quanto o total pode ficar abaixo da soma das partes antes de recusar a cobrança (arredondamentos do carrinho). */
const UNDERPAY_TOLERANCE = 0.1;

/**
 * Valor que será cobrado no Mercado Pago: o `totalOrder` guardado no pedido, NUNCA um valor vindo
 * da requisição de pagamento. Se o total gravado for menor que a soma das partes do próprio pedido
 * (itens + frete + acréscimos − descontos), a cobrança é recusada.
 *
 * Limite conhecido: o preço dos itens é gravado como o front enviou (`create-order.use-case.ts`),
 * então esta checagem pega total inconsistente, não preço de catálogo adulterado.
 */
export function chargeableOrderAmount(order: OrderAmountFields): number {
  const total = n(order.totalOrder);
  if (total <= 0) {
    throw new UnprocessableEntityException('Pedido sem valor a cobrar.');
  }
  if (computeOrderTotal(order) - total > UNDERPAY_TOLERANCE) {
    throw new UnprocessableEntityException(
      'O valor do pedido não confere com os itens. Refaça o pedido.',
    );
  }
  return cents(total) / 100;
}

export function sameAmount(a: unknown, b: unknown): boolean {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && cents(x) === cents(y);
}
