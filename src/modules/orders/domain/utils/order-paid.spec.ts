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

  it('Pix online pendente NÃO é pago (nem Mercado Pago nem Pix manual): só PAID vale', () => {
    for (const paymentType of ['online', ' Online ', 'ONLINE']) {
      for (const paymentMethod of ['pix', 'PIX']) {
        expect(
          isOrderPaid({ paymentStatus: 'PENDING', paymentMethod, paymentType }),
        ).toBe(false);
      }
    }
  });

  it('Pix online só passa a contar como pago quando a confirmação chega (PAID)', () => {
    const pending = {
      paymentStatus: 'PENDING',
      paymentMethod: 'pix',
      paymentType: 'online',
    };
    expect(isOrderPaid(pending)).toBe(false);
    expect(isOrderPaid({ ...pending, paymentStatus: 'PAID' })).toBe(true);
  });

  it('pedido PAID continua como pago em qualquer forma', () => {
    for (const paymentMethod of ['pix', 'credit', 'cash']) {
      for (const paymentType of ['entrega', 'online']) {
        expect(
          isOrderPaid({ paymentStatus: 'PAID', paymentMethod, paymentType }),
        ).toBe(true);
      }
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

  it('campos ausentes ou status desconhecido não contam como pago', () => {
    expect(isOrderPaid({})).toBe(false);
    expect(isOrderPaid({ paymentMethod: 'pix' })).toBe(false);
    expect(isOrderPaid({ paymentMethod: 'pix', paymentType: 'online' })).toBe(
      false,
    );
    expect(isOrderPaid({ paymentStatus: null })).toBe(false);
    expect(isOrderPaid({ paymentStatus: 'paid' })).toBe(false);
  });
});
