import { isOrderPaid } from './order-paid';

describe('isOrderPaid', () => {
  it('Pix na maquininha (entrega, PENDING) não é pedido pago', () => {
    expect(
      isOrderPaid({
        paymentStatus: 'PENDING',
        paymentMethod: 'pix',
        paymentType: 'entrega',
      }),
    ).toBe(false);
  });

  it('Pix online continua como pago, mesmo PENDING (comportamento atual)', () => {
    expect(
      isOrderPaid({
        paymentStatus: 'PENDING',
        paymentMethod: 'pix',
        paymentType: 'online',
      }),
    ).toBe(true);
    expect(
      isOrderPaid({
        paymentStatus: 'PENDING',
        paymentMethod: 'PIX',
        paymentType: ' Online ',
      }),
    ).toBe(true);
  });

  it('pedido PAID continua como pago em qualquer forma', () => {
    for (const paymentMethod of ['pix', 'credit', 'cash']) {
      expect(
        isOrderPaid({
          paymentStatus: 'PAID',
          paymentMethod,
          paymentType: 'entrega',
        }),
      ).toBe(true);
    }
  });

  it('dinheiro, cartão e vales pendentes não são pagos', () => {
    for (const paymentMethod of [
      'cash',
      'credit',
      'debit',
      'meal_voucher',
      'food_voucher',
    ]) {
      expect(
        isOrderPaid({
          paymentStatus: 'PENDING',
          paymentMethod,
          paymentType: 'entrega',
        }),
      ).toBe(false);
    }
  });

  it('cartão online pendente não é pago até o gateway confirmar', () => {
    expect(
      isOrderPaid({
        paymentStatus: 'PENDING',
        paymentMethod: 'credit',
        paymentType: 'online',
      }),
    ).toBe(false);
  });

  it('campos ausentes não contam como pago', () => {
    expect(isOrderPaid({})).toBe(false);
    expect(isOrderPaid({ paymentMethod: 'pix' })).toBe(false);
  });
});
