import { BadRequestException } from '@nestjs/common';
import {
  assertPublicOrderTotals,
  loyaltyDiscountCap,
  orderBumpAllowedPrices,
  orderBumpTriggerMet,
  orderBumpUsable,
  pixDiscountPercent,
  productAllowedPrices,
  sanitizePublicOrderInput,
  sanitizePublicOrderResponse,
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

describe('oferta "Peça também": quando o preço dela pode valer', () => {
  const bump = {
    storeId: 'store-1',
    isActive: true,
    suggestedProductId: 'coca',
    triggerType: 'ALL',
  };

  describe('orderBumpUsable (ativa, da loja e do produto)', () => {
    it('ativa, da loja do pedido e do produto da linha: vale', () => {
      expect(orderBumpUsable(bump, 'coca', 'store-1')).toBe(true);
    });

    it('desativada: não vale', () => {
      expect(orderBumpUsable({ ...bump, isActive: false }, 'coca', 'store-1')).toBe(false);
      expect(orderBumpUsable({ ...bump, isActive: undefined }, 'coca', 'store-1')).toBe(false);
    });

    it('de outra loja: não vale', () => {
      expect(orderBumpUsable({ ...bump, storeId: 'store-2' }, 'coca', 'store-1')).toBe(false);
    });

    it('de outro produto: não vale', () => {
      expect(orderBumpUsable(bump, 'fanta', 'store-1')).toBe(false);
    });

    it('regra inexistente: não vale', () => {
      expect(orderBumpUsable(null, 'coca', 'store-1')).toBe(false);
      expect(orderBumpUsable(undefined, 'coca', 'store-1')).toBe(false);
    });
  });

  describe('orderBumpTriggerMet (gatilho cumprido pelos itens do pedido)', () => {
    const donuts = { productId: 'donuts', categoryId: 'doces' };
    const coca = { productId: 'coca', categoryId: 'bebidas' };

    it('ALL: vale quando há outro produto no pedido, mas NÃO vale se sobrar apenas o próprio order bump sozinho', () => {
      expect(orderBumpTriggerMet(bump, [donuts, coca])).toBe(true);
      expect(orderBumpTriggerMet({ ...bump, triggerType: undefined }, [donuts, coca])).toBe(true);
      expect(
        orderBumpTriggerMet(bump, [{ ...coca, isOrderBump: true }]),
      ).toBe(false);
    });

    it('PRODUCT: exige o produto gatilho no pedido', () => {
      const rule = { ...bump, triggerType: 'PRODUCT', triggerProductId: 'donuts' };
      expect(orderBumpTriggerMet(rule, [donuts, coca])).toBe(true);
      expect(orderBumpTriggerMet(rule, [coca])).toBe(false);
    });

    it('PRODUCT sem produto gatilho cadastrado: não vale', () => {
      expect(orderBumpTriggerMet({ ...bump, triggerType: 'PRODUCT', triggerProductId: null }, [donuts, coca])).toBe(false);
    });

    it('CATEGORY: exige um produto da categoria gatilho no pedido', () => {
      const rule = { ...bump, triggerType: 'CATEGORY', triggerCategoryId: 'doces' };
      expect(orderBumpTriggerMet(rule, [donuts, coca])).toBe(true);
      expect(orderBumpTriggerMet(rule, [coca])).toBe(false);
    });

    it('o próprio produto da oferta não conta como gatilho (a loja nunca sugere o que já está no carrinho)', () => {
      const rule = { ...bump, triggerType: 'PRODUCT', triggerProductId: 'coca' };
      expect(orderBumpTriggerMet(rule, [coca])).toBe(false);
      const byCategory = { ...bump, triggerType: 'CATEGORY', triggerCategoryId: 'bebidas' };
      expect(orderBumpTriggerMet(byCategory, [coca])).toBe(false);
    });

    it('tipo de gatilho desconhecido: não vale', () => {
      expect(orderBumpTriggerMet({ ...bump, triggerType: 'OUTRO' }, [donuts])).toBe(false);
    });
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

describe('orderBumpTriggerMet — múltiplos triggerProductIds (regra OU)', () => {
  const multiBump = {
    storeId: 's1',
    isActive: true,
    suggestedProductId: 'coca',
    triggerType: 'PRODUCT',
    triggerProductId: 'p1',
    triggerProductIds: ['p1', 'p2', 'p3'],
  };

  it('aceita quando qualquer um dos produtos gatilho está no pedido', () => {
    expect(
      orderBumpTriggerMet(multiBump, [
        { productId: 'p2', isOrderBump: false },
        { productId: 'coca', isOrderBump: true },
      ]),
    ).toBe(true);
  });

  it('recusa quando nenhum dos produtos gatilho está no pedido', () => {
    expect(
      orderBumpTriggerMet(multiBump, [
        { productId: 'p99', isOrderBump: false },
        { productId: 'coca', isOrderBump: true },
      ]),
    ).toBe(false);
  });

  it('mantém fallback para regra legada com apenas triggerProductId', () => {
    expect(
      orderBumpTriggerMet(
        {
          storeId: 's1',
          isActive: true,
          suggestedProductId: 'coca',
          triggerType: 'PRODUCT',
          triggerProductId: 'p1',
          triggerProductIds: [],
        },
        [
          { productId: 'p1', isOrderBump: false },
          { productId: 'coca', isOrderBump: true },
        ],
      ),
    ).toBe(true);
  });
});

describe('sanitizePublicOrderResponse — não vaza custo/margem em rotas públicas', () => {
  it('remove costPrice, product.costPrice, customizationSnapshot.totalCost, options[].unitCost/totalCost e comboSnapshot.items[].productCostPrice preservando dados de venda', () => {
    const rawOrder = {
      id: 'ord-1',
      totalOrder: 65,
      items: [
        {
          id: 'it-1',
          productName: 'X-Bacon',
          price: 35,
          quantity: 1,
          costPrice: 15.7,
          product: { id: 'p1', title: 'X-Bacon', price: 25, costPrice: 11 },
          isCustomized: true,
          customizationSnapshot: {
            basePrice: 25,
            totalAdditions: 10,
            totalCost: 4.7,
            finalUnitPrice: 35,
            stages: [
              {
                groupId: 'g1',
                groupName: 'Adicionais',
                options: [
                  {
                    optionId: 'opt-bacon',
                    name: 'Bacon Extra',
                    quantity: 2,
                    unitPrice: 5,
                    totalPrice: 10,
                    unitCost: 1.75,
                    totalCost: 3.5,
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'it-2',
          productName: 'Combo Casal',
          price: 30,
          quantity: 1,
          costPrice: 12,
          isCombo: true,
          comboSnapshot: {
            comboName: 'Combo Casal',
            items: [
              {
                productId: 'p2',
                productName: 'Refri',
                quantity: 2,
                productCostPrice: 6,
                costPrice: 6,
              },
            ],
          },
        },
      ],
    };

    const sanitized = sanitizePublicOrderResponse(rawOrder);

    // Item customizado: custos removidos, dados de venda intactos
    const customItem = sanitized.items[0] as any;
    expect(customItem).not.toHaveProperty('costPrice');
    expect(customItem.product).not.toHaveProperty('costPrice');
    expect(customItem.price).toBe(35);
    expect(customItem.customizationSnapshot).not.toHaveProperty('totalCost');
    expect(customItem.customizationSnapshot.totalAdditions).toBe(10);
    expect(customItem.customizationSnapshot.finalUnitPrice).toBe(35);
    expect(customItem.customizationSnapshot.stages[0].options[0]).toEqual({
      optionId: 'opt-bacon',
      name: 'Bacon Extra',
      quantity: 2,
      unitPrice: 5,
      totalPrice: 10,
    });

    // Item combo: custos removidos, nomes/quantidades intactos
    const comboItem = sanitized.items[1] as any;
    expect(comboItem).not.toHaveProperty('costPrice');
    expect(comboItem.comboSnapshot.items[0]).toEqual({
      productId: 'p2',
      productName: 'Refri',
      quantity: 2,
    });

    // Não muta o objeto original
    expect(rawOrder.items[0].costPrice).toBe(15.7);
    expect(rawOrder.items[0].customizationSnapshot.totalCost).toBe(4.7);
    expect(rawOrder.items[1].comboSnapshot.items[0].productCostPrice).toBe(6);
  });
});

describe('orderBumpTriggerMet — múltiplos triggerCategoryIds (regra OU)', () => {
  const multiCatBump = {
    storeId: 's1',
    isActive: true,
    suggestedProductId: 'coca',
    triggerType: 'CATEGORY',
    triggerCategoryId: 'bolos',
    triggerCategoryIds: ['bolos', 'salgados', 'combos'],
  };

  it('aceita se o pedido contiver produto de qualquer uma das categorias de gatilho', () => {
    expect(
      orderBumpTriggerMet(multiCatBump, [
        { productId: 'p1', categoryId: 'salgados' },
        { productId: 'coca', categoryId: 'bebidas', isOrderBump: true },
      ]),
    ).toBe(true);
  });

  it('recusa se nenhum produto pertencer às categorias de gatilho', () => {
    expect(
      orderBumpTriggerMet(multiCatBump, [
        { productId: 'p1', categoryId: 'outros' },
        { productId: 'coca', categoryId: 'bebidas', isOrderBump: true },
      ]),
    ).toBe(false);
  });

  it('mantém fallback para triggerCategoryId legado quando triggerCategoryIds estiver vazio', () => {
    const legacy = {
      ...multiCatBump,
      triggerCategoryId: 'doces',
      triggerCategoryIds: [],
    };
    expect(
      orderBumpTriggerMet(legacy, [
        { productId: 'p1', categoryId: 'doces' },
        { productId: 'coca', categoryId: 'bebidas', isOrderBump: true },
      ]),
    ).toBe(true);
  });
});
