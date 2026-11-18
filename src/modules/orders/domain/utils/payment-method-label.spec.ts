import {
  formatPaymentMethodLabel,
  normalizePaymentMethodKey,
} from './payment-method-label';

describe('formatPaymentMethodLabel', () => {
  it.each([
    ['pix', 'Pix'],
    ['PIX', 'Pix'],
    ['credit', 'Cartão de crédito'],
    ['Credit', 'Cartão de crédito'],
    ['CREDIT_CARD', 'Cartão de crédito'],
    ['credito', 'Cartão de crédito'],
    ['Cartão de Crédito', 'Cartão de crédito'],
    ['Cartão de Crédito Online', 'Cartão de crédito (online)'],
    ['online_credit', 'Cartão de crédito (online)'],
    ['debit', 'Cartão de débito'],
    ['Debit', 'Cartão de débito'],
    ['Cartão de Débito', 'Cartão de débito'],
    ['cash', 'Dinheiro'],
    ['Cash', 'Dinheiro'],
    ['money', 'Dinheiro'],
    ['Dinheiro', 'Dinheiro'],
    ['meal_voucher', 'Vale refeição'],
    ['Vale Refeição', 'Vale refeição'],
    ['food_voucher', 'Vale alimentação'],
    ['vale_alimentacao', 'Vale alimentação'],
    ['mercadopago', 'Mercado Pago'],
    ['infinitepay', 'InfinitePay'],
    ['pix_terminal', 'Pix na maquininha'],
    ['Outros', 'Outros'],
  ])('%s -> %s', (input, expected) => {
    expect(formatPaymentMethodLabel(input)).toBe(expected);
  });

  it('vazio ou nulo: texto padrão (ou o informado)', () => {
    expect(formatPaymentMethodLabel(undefined)).toBe('Não informado');
    expect(formatPaymentMethodLabel(null)).toBe('Não informado');
    expect(formatPaymentMethodLabel('  ')).toBe('Não informado');
    expect(formatPaymentMethodLabel('', 'Outros')).toBe('Outros');
  });

  it('desconhecido: legível, nunca o código cru', () => {
    expect(formatPaymentMethodLabel('gift_card')).toBe('Gift card');
    expect(formatPaymentMethodLabel('Boleto Bancário')).toBe('Boleto Bancário');
  });

  it('nenhum valor conhecido sai em inglês', () => {
    for (const value of [
      'credit',
      'Credit',
      'debit',
      'cash',
      'money',
      'meal_voucher',
      'food_voucher',
      'online_credit',
    ]) {
      expect(formatPaymentMethodLabel(value)).not.toMatch(
        /credit|debit|cash|money|voucher|_/i,
      );
    }
  });

  it('normaliza acento, caixa e separadores', () => {
    expect(normalizePaymentMethodKey('Cartão de Crédito Online')).toBe(
      'cartao_de_credito_online',
    );
    expect(normalizePaymentMethodKey(' Vale-Refeição ')).toBe('vale_refeicao');
  });
});
