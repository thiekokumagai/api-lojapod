/**
 * Taxa fixa de rota do motoboy (FEE) e o que acontece com ela quando um pedido da rota é cancelado.
 *
 * A taxa é um valor único digitado por rota (ex.: R$ 50 para 3 pedidos). O motoboy não recebe por pedido
 * cancelado, então a sugestão é tirar a PARTE daquele pedido: valor atual / pedidos não cancelados da rota
 * (contando o que está sendo cancelado). A conta é feita em centavos inteiros: a parte e o novo valor
 * sempre somam exatamente o valor anterior (R$ 50 / 3 => parte 16,67 e novo valor 33,33).
 */

export interface CourierImpact {
  kind: 'CANCELLED' | 'REACTIVATED';
  transactionId: string;
  courierId: string;
  courierName: string;
  orderNumber: number | null;
  /** Taxa da rota hoje. */
  amount: number;
  /** Pedidos não cancelados da rota ANTES do cancelamento (CANCELLED) ou DEPOIS da reativação (REACTIVATED). */
  activeOrdersBefore: number;
  /** Parte do pedido cancelado dentro da taxa (só CANCELLED). */
  shareAmount: number | null;
  /** Valor sugerido para a taxa (só CANCELLED). No REACTIVATED o admin decide: nada é recalculado sozinho. */
  suggestedAmount: number | null;
}

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;

/** Arredonda para 2 casas (centavos). */
export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

/**
 * Parte do pedido cancelado e novo valor da taxa.
 * - Última rota ativa (activeOrdersBefore <= 1) => a taxa inteira sai e o novo valor é 0.
 * - Senão a parte é amount / activeOrdersBefore arredondada ao centavo, e o novo valor é o que sobra
 *   (amount - parte), sem perder nem criar centavo.
 */
export function splitCourierFee(
  amount: number,
  activeOrdersBefore: number,
): { shareAmount: number; suggestedAmount: number } {
  const totalCents = Math.max(0, toCents(Number(amount) || 0));
  if (!Number.isFinite(activeOrdersBefore) || activeOrdersBefore <= 1) {
    return { shareAmount: fromCents(totalCents), suggestedAmount: 0 };
  }
  const shareCents = Math.min(totalCents, Math.round(totalCents / activeOrdersBefore));
  return {
    shareAmount: fromCents(shareCents),
    suggestedAmount: fromCents(totalCents - shareCents),
  };
}

export interface OrderRouteInfo {
  orderNumber: number | null;
  orderStatus: string;
  tx: {
    id: string;
    type: string;
    amount: number;
    courierId: string;
    courierName: string;
    /** Pedidos não cancelados do lançamento (inclui o próprio pedido, se ele não estiver cancelado). */
    activeOrders: number;
  } | null;
}

interface PrismaLike {
  order: { findUnique: (args: any) => Promise<any> };
}

/** Lê a rota (lançamento de taxa) do pedido e quantos pedidos dela não estão cancelados. */
export async function loadOrderRoute(prisma: PrismaLike, orderId: string): Promise<OrderRouteInfo | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      courierTransaction: {
        select: {
          id: true,
          type: true,
          amount: true,
          courier: { select: { id: true, name: true } },
          orders: { select: { status: true } },
        },
      },
    },
  });
  if (!order) return null;
  const ct = order.courierTransaction;
  return {
    orderNumber: order.orderNumber ?? null,
    orderStatus: order.status,
    tx: ct
      ? {
          id: ct.id,
          type: ct.type,
          amount: Number(ct.amount),
          courierId: ct.courier?.id ?? '',
          courierName: ct.courier?.name ?? 'Motoboy',
          activeOrders: (ct.orders ?? []).filter((o: { status: string }) => o.status !== 'CANCELLED').length,
        }
      : null,
  };
}

/** Impacto de CANCELAR (chamar com os dados lidos ANTES de cancelar). Só para taxa FEE e pedido ainda não cancelado. */
export function buildCancelImpact(route: OrderRouteInfo | null): CourierImpact | null {
  if (!route?.tx || route.tx.type !== 'FEE' || route.orderStatus === 'CANCELLED') return null;
  const { shareAmount, suggestedAmount } = splitCourierFee(route.tx.amount, route.tx.activeOrders);
  return {
    kind: 'CANCELLED',
    transactionId: route.tx.id,
    courierId: route.tx.courierId,
    courierName: route.tx.courierName,
    orderNumber: route.orderNumber,
    amount: route.tx.amount,
    activeOrdersBefore: route.tx.activeOrders,
    shareAmount,
    suggestedAmount,
  };
}

/** Aviso de REATIVAR (chamar com os dados lidos DEPOIS de reativar). Não sugere valor: nada é recalculado sozinho. */
export function buildReactivationImpact(route: OrderRouteInfo | null): CourierImpact | null {
  if (!route?.tx || route.tx.type !== 'FEE' || route.orderStatus === 'CANCELLED') return null;
  return {
    kind: 'REACTIVATED',
    transactionId: route.tx.id,
    courierId: route.tx.courierId,
    courierName: route.tx.courierName,
    orderNumber: route.orderNumber,
    amount: route.tx.amount,
    activeOrdersBefore: route.tx.activeOrders,
    shareAmount: null,
    suggestedAmount: null,
  };
}
