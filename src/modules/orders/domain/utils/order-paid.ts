type PaidFields = {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentType?: string | null;
};

/**
 * Pedido que já chega pago à entrega (a Uber leva só de ida, sem cobrar nada).
 * Vale `paymentStatus` PAID ou Pix online. Pix com `paymentType` 'entrega'
 * (Pix na maquininha) ainda não foi pago e segue a regra de dinheiro/cartão.
 */
export function isOrderPaid(order: PaidFields): boolean {
  if (order.paymentStatus === 'PAID') return true;

  const isPix = String(order.paymentMethod ?? '')
    .toLowerCase()
    .includes('pix');
  const isOnline =
    String(order.paymentType ?? '')
      .trim()
      .toLowerCase() === 'online';

  return isPix && isOnline;
}
