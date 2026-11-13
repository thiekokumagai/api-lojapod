import {
  isAwaitingOnlinePayment,
  isOnlineCardPayment,
} from './awaiting-online-payment';

describe('isAwaitingOnlinePayment', () => {
  it('esconde cartão online ainda não pago', () => {
    expect(
      isAwaitingOnlinePayment({
        paymentType: 'online',
        paymentMethod: 'credit',
        paymentStatus: 'PENDING',
      }),
    ).toBe(true);
  });

  it('mostra cartão online depois de pago', () => {
    expect(
      isAwaitingOnlinePayment({
        paymentType: 'online',
        paymentMethod: 'credit',
        paymentStatus: 'PAID',
      }),
    ).toBe(false);
  });

  it('não afeta Pix, que também é "online"', () => {
    expect(
      isAwaitingOnlinePayment({
        paymentType: 'online',
        paymentMethod: 'pix',
        paymentStatus: 'PENDING',
      }),
    ).toBe(false);
  });

  it('não afeta cartão de crédito na entrega', () => {
    expect(
      isAwaitingOnlinePayment({
        paymentType: 'entrega',
        paymentMethod: 'credit',
        paymentStatus: 'PENDING',
      }),
    ).toBe(false);
  });

  it('não afeta dinheiro, débito e vales', () => {
    for (const method of ['cash', 'debit', 'meal_voucher', 'food_voucher']) {
      expect(
        isAwaitingOnlinePayment({
          paymentType: 'entrega',
          paymentMethod: method,
          paymentStatus: 'PENDING',
        }),
      ).toBe(false);
    }
  });

  it('ignora maiúsculas e espaços', () => {
    expect(
      isOnlineCardPayment({ paymentType: ' Online ', paymentMethod: 'CREDIT' }),
    ).toBe(true);
  });
});
