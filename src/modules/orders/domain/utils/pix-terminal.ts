import type { StoreSettings } from '../../../settings/domain/entities/store-settings.entity';

type SettingsWithGateways = Pick<StoreSettings, 'paymentGateways'>;

type PaymentFields = {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
};

/** Loja com "Pix na maquininha" ligado (`paymentGateways.pixOnTerminal === true`). */
export function isPixOnTerminal(
  settings: SettingsWithGateways | null | undefined,
): boolean {
  const gateways = (settings?.paymentGateways ?? {}) as Record<string, unknown>;
  return gateways.pixOnTerminal === true;
}

/**
 * Com "Pix na maquininha" ligado, Pix ainda não pago é pagamento na entrega:
 * nunca pode ficar `online` + PENDING, senão `isOrderPaid()` o trata como pago
 * (Uber "só ida", mapa sem cobrança). Devolve `'entrega'` quando o tipo deve ser
 * forçado e `undefined` quando nada muda (flag desligada, outro método ou pedido PAID).
 */
export function pixTerminalPaymentType(
  order: PaymentFields,
  settings: SettingsWithGateways | null | undefined,
): 'entrega' | undefined {
  if (!isPixOnTerminal(settings)) return undefined;

  const isPix = String(order.paymentMethod ?? '')
    .toLowerCase()
    .includes('pix');

  return isPix && order.paymentStatus !== 'PAID' ? 'entrega' : undefined;
}
