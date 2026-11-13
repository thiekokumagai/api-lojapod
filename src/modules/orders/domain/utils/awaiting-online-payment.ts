/**
 * Pedidos do catálogo pagos com cartão online só passam a existir para a loja
 * depois que o pagamento é aprovado. Até lá ficam escondidos do painel, do dashboard,
 * da fila de impressão e do histórico do cliente, e não disparam push nem impressão.
 *
 * Só o cartão online é afetado: Pix, dinheiro, débito, crédito na entrega e vales
 * continuam aparecendo na hora, como sempre.
 */

/** Minutos sem pagamento até o pedido de cartão online ser cancelado e o estoque devolvido. */
export const UNPAID_ONLINE_CARD_TIMEOUT_MINUTES = 60;

type PaymentFields = {
  paymentType?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
};

export function isOnlineCardPayment(order: PaymentFields): boolean {
  return (
    String(order.paymentType ?? '')
      .trim()
      .toLowerCase() === 'online' &&
    String(order.paymentMethod ?? '')
      .trim()
      .toLowerCase() === 'credit'
  );
}

/** Pedido de cartão online que ainda não foi pago. */
export function isAwaitingOnlinePayment(order: PaymentFields): boolean {
  return isOnlineCardPayment(order) && order.paymentStatus !== 'PAID';
}

/** Filtro Prisma que corresponde aos pedidos de cartão online ainda não pagos. */
export const AWAITING_ONLINE_PAYMENT_WHERE = {
  paymentType: { equals: 'online', mode: 'insensitive' as const },
  paymentMethod: { equals: 'credit', mode: 'insensitive' as const },
  paymentStatus: 'PENDING' as const,
};

/** Filtro Prisma para esconder os pedidos de cartão online ainda não pagos. */
export const HIDE_AWAITING_ONLINE_PAYMENT = {
  NOT: AWAITING_ONLINE_PAYMENT_WHERE,
};
