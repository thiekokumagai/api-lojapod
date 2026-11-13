import type { StoreSettings } from '../../../settings/domain/entities/store-settings.entity';

type CanonicalMethod =
  | 'pix'
  | 'credit'
  | 'debit'
  | 'cash'
  | 'meal_voucher'
  | 'food_voucher';

const METHOD_ALIASES: Record<string, CanonicalMethod> = {
  pix: 'pix',
  credit: 'credit',
  'cartão de crédito': 'credit',
  'cartao de credito': 'credit',
  'cartão de crédito online': 'credit',
  'cartao de credito online': 'credit',
  debit: 'debit',
  'cartão de débito': 'debit',
  'cartao de debito': 'debit',
  cash: 'cash',
  dinheiro: 'cash',
  meal_voucher: 'meal_voucher',
  'vale refeição': 'meal_voucher',
  'vale refeicao': 'meal_voucher',
  food_voucher: 'food_voucher',
  'vale alimentação': 'food_voucher',
  'vale alimentacao': 'food_voucher',
};

const METHOD_LABELS: Record<CanonicalMethod, string> = {
  pix: 'Pix',
  credit: 'Cartão de crédito',
  debit: 'Cartão de débito',
  cash: 'Dinheiro',
  meal_voucher: 'Vale refeição',
  food_voucher: 'Vale alimentação',
};

function hasOnlineCreditGateway(settings: StoreSettings): boolean {
  const gateways = (settings.paymentGateways ?? {}) as Record<string, any>;
  return ['infinitepay', 'mercadopago', 'asaas'].some(
    (key) => !!gateways[key]?.enabled && !!gateways[key]?.acceptCreditCard,
  );
}

/**
 * Verifica se a forma de pagamento enviada por um pedido do catálogo está ativa na loja.
 * Retorna `null` quando o pagamento é permitido, ou a mensagem de erro para o cliente.
 */
export function getPaymentNotAllowedReason(
  settings: StoreSettings | null | undefined,
  paymentType: string | undefined,
  paymentMethod: string | undefined,
): string | null {
  // Sem configurações não há como validar; mantém o comportamento anterior.
  if (!settings) return null;

  const method =
    METHOD_ALIASES[
      String(paymentMethod ?? '')
        .trim()
        .toLowerCase()
    ];
  if (!method) {
    return 'Forma de pagamento inválida. Escolha outra forma de pagamento.';
  }

  const isOnline =
    String(paymentType ?? '')
      .trim()
      .toLowerCase() === 'online';

  let allowed: boolean;
  switch (method) {
    case 'pix':
      allowed = !!settings.pixEnabled;
      break;
    case 'credit':
      allowed = isOnline
        ? hasOnlineCreditGateway(settings)
        : !!settings.payOnDeliveryCardCredit;
      break;
    case 'debit':
      allowed = !isOnline && !!settings.payOnDeliveryCardDebit;
      break;
    case 'cash':
      allowed = !isOnline && !!settings.payOnDeliveryCash;
      break;
    case 'meal_voucher':
      allowed = !isOnline && !!settings.payOnDeliveryMealVoucher;
      break;
    case 'food_voucher':
      allowed = !isOnline && !!settings.payOnDeliveryFoodVoucher;
      break;
  }

  if (allowed) return null;

  const label =
    METHOD_LABELS[method] +
    (method === 'credit' ? (isOnline ? ' online' : ' na entrega') : '');
  return `${label} não está disponível nesta loja. Atualize a página e escolha outra forma de pagamento.`;
}
