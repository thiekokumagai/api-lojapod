type PaidFields = {
  paymentStatus?: string | null;
  // Mantidos só para quem passa o pedido inteiro: a regra não depende mais da forma de pagamento.
  paymentMethod?: string | null;
  paymentType?: string | null;
};

/**
 * Pedido que já chega pago à entrega (a Uber leva só de ida, sem cobrar nada).
 *
 * Vale SÓ `paymentStatus` PAID, em qualquer forma de pagamento. Pix online pendente NÃO é pago:
 * antes era tratado como pago desde a criação, o que liberava o despacho da Uber para um Pix que
 * o cliente ainda não tinha pago (e para um QR Code do Mercado Pago que pode nunca ser pago).
 * Quem marca como pago é o servidor (webhook/verificação do provedor) ou a loja (Receber).
 */
export function isOrderPaid(order: PaidFields): boolean {
  return order.paymentStatus === 'PAID';
}
