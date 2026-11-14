import { isPixOnTerminal, pixTerminalPaymentType } from './pix-terminal';

const on = { paymentGateways: { pixOnTerminal: true } };
const off = { paymentGateways: { pixOnTerminal: false } };

describe('isPixOnTerminal', () => {
  it('só o booleano true liga', () => {
    expect(isPixOnTerminal(on)).toBe(true);
    expect(isPixOnTerminal(off)).toBe(false);
    expect(
      isPixOnTerminal({ paymentGateways: { pixOnTerminal: 'true' } }),
    ).toBe(false);
    expect(isPixOnTerminal({ paymentGateways: {} })).toBe(false);
    expect(isPixOnTerminal({ paymentGateways: null })).toBe(false);
    expect(isPixOnTerminal(null)).toBe(false);
    expect(isPixOnTerminal(undefined)).toBe(false);
  });
});

describe('pixTerminalPaymentType', () => {
  it('flag ligada: Pix PENDING vira entrega', () => {
    expect(
      pixTerminalPaymentType(
        { paymentMethod: 'pix', paymentStatus: 'PENDING' },
        on,
      ),
    ).toBe('entrega');
    expect(pixTerminalPaymentType({ paymentMethod: 'PIX' }, on)).toBe(
      'entrega',
    );
  });

  it('flag ligada: Pix PAID continua como está (online)', () => {
    expect(
      pixTerminalPaymentType(
        { paymentMethod: 'pix', paymentStatus: 'PAID' },
        on,
      ),
    ).toBeUndefined();
  });

  it('flag ligada: outras formas de pagamento não mudam', () => {
    for (const paymentMethod of ['credit', 'debit', 'cash', 'meal_voucher']) {
      expect(
        pixTerminalPaymentType({ paymentMethod, paymentStatus: 'PENDING' }, on),
      ).toBeUndefined();
    }
  });

  it('sem a flag nada muda', () => {
    const pix = { paymentMethod: 'pix', paymentStatus: 'PENDING' };
    expect(pixTerminalPaymentType(pix, off)).toBeUndefined();
    expect(pixTerminalPaymentType(pix, null)).toBeUndefined();
    expect(pixTerminalPaymentType(pix, undefined)).toBeUndefined();
  });
});
