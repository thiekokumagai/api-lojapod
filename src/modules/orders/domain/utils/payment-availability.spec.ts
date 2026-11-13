import { getPaymentNotAllowedReason } from './payment-availability';

const baseSettings = {
  pixEnabled: false,
  payOnDeliveryCash: false,
  payOnDeliveryCardDebit: false,
  payOnDeliveryCardCredit: false,
  payOnDeliveryMealVoucher: false,
  payOnDeliveryFoodVoucher: false,
  paymentGateways: {},
} as any;

const onlineCardOnly = {
  ...baseSettings,
  paymentGateways: { infinitepay: { enabled: true, acceptCreditCard: true } },
};

describe('getPaymentNotAllowedReason', () => {
  it('bloqueia cartão de crédito na entrega quando a loja só aceita cartão online', () => {
    expect(
      getPaymentNotAllowedReason(onlineCardOnly, 'entrega', 'credit'),
    ).toMatch(/na entrega não está disponível/);
  });

  it('permite cartão de crédito online quando há gateway ativo', () => {
    expect(
      getPaymentNotAllowedReason(onlineCardOnly, 'online', 'credit'),
    ).toBeNull();
  });

  it('bloqueia cartão online quando o gateway não aceita cartão', () => {
    const settings = {
      ...baseSettings,
      paymentGateways: {
        infinitepay: { enabled: true, acceptCreditCard: false },
      },
    };
    expect(
      getPaymentNotAllowedReason(settings, 'online', 'credit'),
    ).not.toBeNull();
  });

  it('bloqueia dinheiro, débito e vales desativados', () => {
    for (const method of ['cash', 'debit', 'meal_voucher', 'food_voucher']) {
      expect(
        getPaymentNotAllowedReason(onlineCardOnly, 'entrega', method),
      ).not.toBeNull();
    }
  });

  it('permite formas na entrega que estão ativas', () => {
    const settings = {
      ...baseSettings,
      payOnDeliveryCash: true,
      payOnDeliveryCardCredit: true,
    };
    expect(getPaymentNotAllowedReason(settings, 'entrega', 'cash')).toBeNull();
    expect(
      getPaymentNotAllowedReason(settings, 'entrega', 'credit'),
    ).toBeNull();
  });

  it('respeita o Pix ativo ou desativado', () => {
    expect(
      getPaymentNotAllowedReason(baseSettings, 'online', 'pix'),
    ).not.toBeNull();
    expect(
      getPaymentNotAllowedReason(
        { ...baseSettings, pixEnabled: true },
        'online',
        'pix',
      ),
    ).toBeNull();
  });

  it('aceita nomes em português enviados por clientes antigos', () => {
    const settings = { ...baseSettings, payOnDeliveryCash: true };
    expect(
      getPaymentNotAllowedReason(settings, 'Na Entrega', 'Dinheiro'),
    ).toBeNull();
  });

  it('recusa forma de pagamento desconhecida', () => {
    expect(
      getPaymentNotAllowedReason(onlineCardOnly, 'entrega', 'bitcoin'),
    ).toMatch(/inválida/);
  });

  it('não bloqueia quando a loja não tem configurações', () => {
    expect(getPaymentNotAllowedReason(null, 'entrega', 'credit')).toBeNull();
  });
});
