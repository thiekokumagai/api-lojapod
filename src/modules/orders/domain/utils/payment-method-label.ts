/**
 * Nome em português da FORMA de pagamento para TEXTOS gerados pela API (diagnóstico, mensagens).
 * Só apresentação: o valor gravado no pedido e o contrato da API não mudam.
 *
 * `Order.paymentMethod` é texto livre e chega em formatos diferentes (`credit`, `Credit`,
 * `Cartão de Crédito`, `PIX`, `cash`, `vale_refeicao`...). A busca ignora caixa, acento, espaço,
 * hífen e sublinhado.
 */
const LABELS: Record<string, string> = {
  pix: 'Pix',
  pix_terminal: 'Pix na maquininha',
  credit: 'Cartão de crédito',
  credit_online: 'Cartão de crédito (online)',
  debit: 'Cartão de débito',
  cash: 'Dinheiro',
  meal_voucher: 'Vale refeição',
  food_voucher: 'Vale alimentação',
  mercadopago: 'Mercado Pago',
  infinitepay: 'InfinitePay',
  asaas: 'Asaas',
  other: 'Outros',
};

const ALIASES: Record<string, string> = {
  pix: 'pix',
  pix_automatico: 'pix',
  pix_maquininha: 'pix_terminal',
  pix_na_maquininha: 'pix_terminal',
  pix_terminal: 'pix_terminal',

  credit: 'credit',
  credito: 'credit',
  credit_card: 'credit',
  creditcard: 'credit',
  cartao_de_credito: 'credit',
  cartao_credito: 'credit',
  credit_online: 'credit_online',
  online_credit: 'credit_online',
  cartao_online: 'credit_online',
  cartao_de_credito_online: 'credit_online',

  debit: 'debit',
  debito: 'debit',
  debit_card: 'debit',
  debitcard: 'debit',
  cartao_de_debito: 'debit',
  cartao_debito: 'debit',

  cash: 'cash',
  money: 'cash',
  dinheiro: 'cash',
  especie: 'cash',

  meal_voucher: 'meal_voucher',
  vale_refeicao: 'meal_voucher',
  voucher_refeicao: 'meal_voucher',
  food_voucher: 'food_voucher',
  vale_alimentacao: 'food_voucher',
  voucher_alimentacao: 'food_voucher',

  mercadopago: 'mercadopago',
  mercado_pago: 'mercadopago',
  infinitepay: 'infinitepay',
  infinite_pay: 'infinitepay',
  asaas: 'asaas',

  other: 'other',
  others: 'other',
  outro: 'other',
  outros: 'other',
};

/** `"Cartão de Crédito Online"` -> `"cartao_de_credito_online"`. */
export function normalizePaymentMethodKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Código desconhecido vira texto legível (`gift_card` -> `Gift card`); texto já legível passa direto. */
function humanize(raw: string): string {
  const text = raw.trim();
  if (/\s/.test(text) || /[^ -~]/.test(text) || /[a-z][A-Z]/.test(text)) {
    return text;
  }
  const spaced = text.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatPaymentMethodLabel(
  value?: string | null,
  fallback = 'Não informado',
): string {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const raw = String(value);
  const canonical = ALIASES[normalizePaymentMethodKey(raw)];
  return canonical ? LABELS[canonical] : humanize(raw);
}
