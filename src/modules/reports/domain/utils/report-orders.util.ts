// Filtros de pedidos compartilhados pelos 3 relatórios.

import { BadRequestException } from '@nestjs/common';
import { resolveDashboardPeriod } from '../../../dashboard/domain/utils/period.util';
import { formatPaymentMethodLabel } from '../../../orders/domain/utils/payment-method-label';

export const IDLE_DAYS_DEFAULT = 30;
/** Máximo de pedidos devolvidos na lista de vendas (o resto só entra nos totais). */
export const ORDERS_LIST_LIMIT = 500;
/** Máximo de linhas na tabela de produtos. */
export const PRODUCTS_LIST_LIMIT = 500;

export interface OrderFilterInput {
  deliveryModality?: string;
  status?: string;
  paymentStatus?: string;
}

/** `where` do Prisma: loja + período + filtros. Sem status explícito, cancelados ficam de fora. */
export function buildOrderWhere(
  storeId: string,
  start: Date,
  end: Date,
  filters: OrderFilterInput,
) {
  return {
    storeId,
    createdAt: { gte: start, lte: end },
    status: filters.status
      ? (filters.status as 'PENDING')
      : { not: 'CANCELLED' as const },
    ...(filters.deliveryModality && {
      deliveryModality: filters.deliveryModality,
    }),
    ...(filters.paymentStatus && {
      paymentStatus: filters.paymentStatus as 'PAID',
    }),
  };
}

/**
 * `Order.paymentMethod` é texto livre (`credit`, `Cartão de Crédito`...). Comparar pelo nome
 * em português cobre todas as grafias da mesma forma de pagamento.
 */
export function matchesPaymentFilter(
  orderPaymentMethod: string | null | undefined,
  filter?: string,
): boolean {
  if (!filter) return true;
  return (
    formatPaymentMethodLabel(orderPaymentMethod) ===
    formatPaymentMethodLabel(filter)
  );
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function pct(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

export function orderDiscounts(order: {
  couponDiscount: unknown;
  paymentDiscount: unknown;
  receiptDiscount: unknown;
}): number {
  return (
    Number(order.couponDiscount || 0) +
    Number(order.paymentDiscount || 0) +
    Number(order.receiptDiscount || 0)
  );
}

/** Maior intervalo aceito: relatório carrega os pedidos do período inteiro em memória. */
export const MAX_REPORT_DAYS = 366;

/** Período do relatório: valida datas reais, início <= fim e limite de dias (400 fora disso). */
export function resolveReportPeriod(startDate?: string, endDate?: string) {
  const valid = (d?: string) =>
    !d || (!Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d));
  if (!valid(startDate) || !valid(endDate) || !!startDate !== !!endDate) {
    throw new BadRequestException('Informe startDate e endDate com datas válidas (YYYY-MM-DD).');
  }
  const period = resolveDashboardPeriod(startDate, endDate);
  if (period.start > period.end) {
    throw new BadRequestException('A data inicial deve ser anterior à final.');
  }
  if (period.end.getTime() - period.start.getTime() > MAX_REPORT_DAYS * 86_400_000) {
    throw new BadRequestException(`O período máximo é de ${MAX_REPORT_DAYS} dias.`);
  }
  return period;
}
