import { BadRequestException } from '@nestjs/common';
import {
  assertPublicOrderTotals,
  loyaltyDiscountCap,
  orderBumpAllowedPrices,
  pixDiscountPercent,
  productAllowedPrices,
  sanitizePublicOrderInput,
  unitPriceMatches,
} from './public-order-rules';

const base = {
  itemsSum: 100,
  clientItemsTotal: 100,
  clientTotal: 110 as number | undefined,
  freight: 10,
  installmentSurcharge: 0,
  receiptSurcharge: 0,
  paymentDiscount: 0,
  receiptDiscount: 0,
  couponDiscount: 0,
  couponFreightDiscount: 0,
  paymentIsPix: false,
  pixDiscountPercent: 0,
  loyaltyCap: 0,
};

describe('sanitizePublicOrderInput (B: o cliente não decide pagamento nem status)', () => {
  it('força PENDING e descarta status, data de pagamento, cupom, taxas e base do cupom', () => {
    const clean = sanitizePublicOrderInput({
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      paymentDate: new Date(),
      couponDiscount: 99,
      couponFreightDiscount: 99,
      nonPromoItemsTotal: 99999,
      cardFee: 50,
      receiptSurcharge: -10,
      appliedTaxRule: { x: 1 },
      appliedCouponRule: { y: 2 },
      customerName: 'Ana',
      totalOrder: 100,
    });

    expect(clean).toMatchObject({
      paymentStatus: 'PENDING',
      couponDiscount: 0,
      couponFreightDiscount: 0,
      cardFee: 0,
      receiptSurcharge: 0,
      customerName: 'Ana',
      totalOrder: 100,
    });
    expect(clean.status).toBeUndefined();
    expect(clean.paymentDate).toBeUndefined();
    expect(clean.nonPromoItemsTotal).toBeUndefined();
    expect(clean.appliedTaxRule).toBeUndefined();
    expect(clean.appliedCouponRule).toBeUndefined();
  });

  it('não altera o objeto original', () => {
    const original = { paymentStatus: 'PAID', status: 'CONFIRMED' };
    sanitizePublicOrderInput(original);
    expect(original).toEqual({ paymentStatus: 'PAID', status: 'CONFIRMED' });
  });
});

describe('preços de catálogo', () => {
  it('aceita preço regular e promocional, dentro de 2 centavos', () => {
    const allowed = productAllowedPrices({ price: 50, promotionalPrice: 40 });
    expect(unitPriceMatches(50, allowed)).toBe(true);
    expect(unitPriceMatches(40.01, allowed)).toBe(true);
    expect(unitPriceMatches(45, allowed)).toBe(false);
    expect(unitPriceMatches(0.01, allowed)).toBe(false);
  });

  it('sem promoção só vale o preço regular', () => {
    const allowed = productAllowedPrices({ price: 50, promotionalPrice: null });
    expect(unitPriceMatches(50, allowed)).toBe(true);
    expect(unitPriceMatches(40, allowed)).toBe(false);
  });

  it('oferta "Peça também": preço fixo ou percentual sobre o preço do produto', () => {
    const product = { price: 50, promotionalPrice: null };
    expect(
      unitPriceMatches(
        30,
        orderBumpAllowedPrices(product, { customPrice: 30 }),
      ),
    ).toBe(true);
    expect(
      unitPriceMatches(
        40,
        orderBumpAllowedPrices(product, { discountPercent: 20 }),
      ),
    ).toBe(true);
    expect(
      unitPriceMatches(
        10,
        orderBumpAllowedPrices(product, { customPrice: 30 }),
      ),
    ).toBe(false);
  });
});

describe('pixDiscountPercent e teto de fidelidade', () => {
  it('lê o desconto do Pix configurado na loja', () => {
    expect(
      pixDiscountPercent([
        { paymentMethod: 'pix', type: 'discount', value: 5 },
      ]),
    ).toBe(5);
    expect(
      pixDiscountPercent([
        { paymentMethod: 'credit', type: 'charge', value: 3 },
      ]),
    ).toBe(0);
    expect(pixDiscountPercent(undefined)).toBe(0);
  });

  const program = {
    isActive: true,
    pointsRedemptionValue: 0.1,
    progressiveTiers: [
      { minOrders: 3, discountPercent: 4 },
      { minOrders: 6, discountPercent: 8 },
    ],
  };
  const card = { status: 'ACTIVE', cashbackBalance: 12, pointsBalance: 300 };

  it('cashback = saldo; pontos = saldo × valor do ponto; progressivo = maior faixa × itens', () => {
    expect(
      loyaltyDiscountCap({
        rewardType: 'CASHBACK',
        itemsTotal: 100,
        program,
        card,
      }),
    ).toBe(12);
    expect(
      loyaltyDiscountCap({
        rewardType: 'POINTS_DISCOUNT',
        itemsTotal: 100,
        program,
        card,
      }),
    ).toBe(30);
    expect(
      loyaltyDiscountCap({
        rewardType: 'PROGRESSIVE_DISCOUNT',
        itemsTotal: 100,
        program,
        card,
      }),
    ).toBe(8);
  });

  it('nunca passa do valor dos itens e é zero sem programa, cartão ou tipo', () => {
    expect(
      loyaltyDiscountCap({
        rewardType: 'POINTS_DISCOUNT',
        itemsTotal: 20,
        program,
        card,
      }),
    ).toBe(20);
    expect(
      loyaltyDiscountCap({
        rewardType: 'CASHBACK',
        itemsTotal: 100,
        program: null,
        card,
      }),
    ).toBe(0);
    expect(
      loyaltyDiscountCap({
        rewardType: 'CASHBACK',
        itemsTotal: 100,
        program,
        card: null,
      }),
    ).toBe(0);
    expect(
      loyaltyDiscountCap({
        rewardType: undefined,
        itemsTotal: 100,
        program,
        card,
      }),
    ).toBe(0);
    expect(
      loyaltyDiscountCap({
        rewardType: 'FREE_PRODUCT',
        itemsTotal: 100,
        program,
        card,
      }),
    ).toBe(0);
    expect(
      loyaltyDiscountCap({
        rewardType: 'CASHBACK',
        itemsTotal: 100,
        program: { ...program, isActive: false },
        card,
      }),
    ).toBe(0);
    expect(
      loyaltyDiscountCap({
        rewardType: 'CASHBACK',
        itemsTotal: 100,
        program,
        card: { ...card, status: 'REDEEMED' },
      }),
    ).toBe(0);
  });

  it('progressivo sem faixas cadastradas usa as faixas padrão da loja (até 10%)', () => {
    expect(
      loyaltyDiscountCap({
        rewardType: 'PROGRESSIVE_DISCOUNT',
        itemsTotal: 100,
        program: { isActive: true },
        card,
      }),
    ).toBe(10);
  });
});

describe('assertPublicOrderTotals (C: total recalculado pelo servidor)', () => {
  it('pedido normal com frete: mantém o total', () => {
    expect(assertPublicOrderTotals(base)).toEqual({
      itemsTotal: 100,
      totalOrder: 110,
    });
  });

  it('desconto Pix dentro da regra da loja, com cupom e acréscimo: total confere', () => {
    const result = assertPublicOrderTotals({
      ...base,
      paymentIsPix: true,
      pixDiscountPercent: 5,
      paymentDiscount: 4.75, // 5% de (100 − 5 de cupom)
      couponDiscount: 5,
      clientTotal: 100.25, // 95 − 4,75 + 10
    });
    expect(result.totalOrder).toBe(100.25);
  });

  it('total enviado pelo cliente é ignorado dentro da tolerância e o do servidor é o gravado', () => {
    expect(
      assertPublicOrderTotals({ ...base, clientTotal: 110.05 }).totalOrder,
    ).toBe(110);
  });

  it('total adulterado (R$ 0,01) é recusado', () => {
    expect(() =>
      assertPublicOrderTotals({ ...base, clientTotal: 0.01 }),
    ).toThrow(BadRequestException);
  });

  it('itemsTotal adulterado em relação aos itens é recusado', () => {
    expect(() =>
      assertPublicOrderTotals({
        ...base,
        itemsSum: 100,
        clientItemsTotal: 0.01,
      }),
    ).toThrow(BadRequestException);
  });

  it('desconto de pagamento fora da regra: sem Pix, ou maior que o percentual da loja', () => {
    expect(() =>
      assertPublicOrderTotals({
        ...base,
        paymentDiscount: 50,
        clientTotal: 60,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertPublicOrderTotals({
        ...base,
        paymentIsPix: true,
        pixDiscountPercent: 5,
        paymentDiscount: 50,
        clientTotal: 60,
      }),
    ).toThrow(BadRequestException);
  });

  it('desconto de fidelidade acima do teto é recusado; até o teto passa', () => {
    expect(() =>
      assertPublicOrderTotals({
        ...base,
        receiptDiscount: 100,
        loyaltyCap: 0,
        clientTotal: 10,
      }),
    ).toThrow(BadRequestException);
    expect(
      assertPublicOrderTotals({
        ...base,
        receiptDiscount: 12,
        loyaltyCap: 12,
        clientTotal: 98,
      }).totalOrder,
    ).toBe(98);
  });

  it('acréscimos e descontos negativos são recusados (acréscimo negativo seria desconto escondido)', () => {
    expect(() =>
      assertPublicOrderTotals({
        ...base,
        installmentSurcharge: -50,
        clientTotal: 60,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertPublicOrderTotals({
        ...base,
        receiptSurcharge: -50,
        clientTotal: 60,
      }),
    ).toThrow(BadRequestException);
  });

  it('frete negativo ("a combinar") vira zero e o produto nunca fica negativo', () => {
    expect(
      assertPublicOrderTotals({ ...base, freight: -1, clientTotal: 100 })
        .totalOrder,
    ).toBe(100);
    expect(
      assertPublicOrderTotals({
        ...base,
        couponDiscount: 150,
        freight: 0,
        clientTotal: 0,
      }).totalOrder,
    ).toBe(0);
  });

  it('acréscimo de parcelas legítimo entra no total', () => {
    expect(
      assertPublicOrderTotals({
        ...base,
        installmentSurcharge: 3.3,
        clientTotal: 113.3,
      }).totalOrder,
    ).toBe(113.3);
  });
});
