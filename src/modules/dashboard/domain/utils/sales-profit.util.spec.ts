import { calculateOrderItemsProfit,
  parseRankingSortBy,
  resolveItemUnitCost, resolveCustomizationExtraCost } from './sales-profit.util';

describe('sales-profit.util', () => {
  describe('calculateOrderItemsProfit', () => {
    it('calcula lucro de item único sem descontos', () => {
      const [r] = calculateOrderItemsProfit({
        discounts: 0,
        cardFee: 0,
        items: [{ price: 50, quantity: 2, unitCost: 20 }],
      });
      expect(r).toMatchObject({ revenue: 100, cost: 40, profit: 60 });
    });

    it('rateia descontos e taxa de cartão proporcional à receita', () => {
      const r = calculateOrderItemsProfit({
        discounts: 10, // cupom + pagamento + recibo
        cardFee: 5,
        items: [
          { price: 60, quantity: 1, unitCost: 30 }, // 60% da receita
          { price: 40, quantity: 1, unitCost: 10 }, // 40%
        ],
      });
      expect(r[0]).toMatchObject({ discount: 6, cardFee: 3, profit: 21 });
      expect(r[1]).toMatchObject({ discount: 4, cardFee: 2, profit: 24 });
      // soma dos itens = lucro do pedido: 100 - 10 - 40 - 5
      expect((r[0].profit as number) + (r[1].profit as number)).toBe(45);
    });

    it('item sem custo fica com lucro null (não vira margem de 100%)', () => {
      const r = calculateOrderItemsProfit({
        discounts: 0,
        cardFee: 0,
        items: [
          { price: 10, quantity: 1, unitCost: null },
          { price: 10, quantity: 1, unitCost: 0 },
        ],
      });
      expect(r.map((i) => i.profit)).toEqual([null, null]);
      expect(r.map((i) => i.cost)).toEqual([null, null]);
    });

    it('pedido sem receita não divide por zero', () => {
      const r = calculateOrderItemsProfit({
        discounts: 5,
        cardFee: 1,
        items: [{ price: 0, quantity: 1, unitCost: 3 }],
      });
      expect(r[0].discount).toBe(0);
      expect(r[0].profit).toBe(-3);
    });
  });

  describe('resolveItemUnitCost', () => {
    it('usa Product.costPrice no produto simples', () => {
      expect(resolveItemUnitCost({ product: { costPrice: '12.5' } })).toBe(12.5);
    });

    it('venda por peso: custo/kg × peso (R$ 30/kg × 0,650 kg = R$ 19,50)', () => {
      expect(resolveItemUnitCost({ weightKg: '0.650', product: { costPrice: '30' } })).toBe(19.5);
      // Lucro do prato de R$ 45,44: 45,44 − 19,50 = 25,94
      const [profit] = calculateOrderItemsProfit({
        discounts: 0,
        cardFee: 0,
        items: [{ price: 45.44, quantity: 1, unitCost: 19.5 }],
      });
      expect(profit.profit).toBeCloseTo(25.94, 2);
    });

    it('venda por peso sem custo cadastrado continua sem custo (null)', () => {
      expect(resolveItemUnitCost({ weightKg: 0.65, product: { costPrice: null } })).toBeNull();
    });

    it('retorna null para produto sem custo ou removido', () => {
      expect(resolveItemUnitCost({ product: { costPrice: null } })).toBeNull();
      expect(resolveItemUnitCost({ product: null })).toBeNull();
    });

    it('soma productCostPrice * quantity do comboSnapshot', () => {
      const cost = resolveItemUnitCost({
        isCombo: true,
        comboSnapshot: {
          items: [
            { productCostPrice: 10, quantity: 2 },
            { productCostPrice: 5, quantity: 1 },
          ],
        },
      });
      expect(cost).toBe(25);
    });

    it('combo com componente sem custo vira null (não subestima o custo)', () => {
      expect(
        resolveItemUnitCost({
          isCombo: true,
          comboSnapshot: {
            items: [
              { productCostPrice: 10, quantity: 1 },
              { productCostPrice: 0, quantity: 1 },
            ],
          },
        }),
      ).toBeNull();
    });

    it('combo sem snapshot vira null e ignora o product', () => {
      expect(
        resolveItemUnitCost({ comboId: 'c1', product: { costPrice: 99 } }),
      ).toBeNull();
    });
  });

  describe('parseRankingSortBy', () => {
    it('aceita os 4 critérios e cai em quantity no resto', () => {
      expect(parseRankingSortBy('revenue')).toBe('revenue');
      expect(parseRankingSortBy('profit')).toBe('profit');
      expect(parseRankingSortBy('margin')).toBe('margin');
      expect(parseRankingSortBy('quantity')).toBe('quantity');
      expect(parseRankingSortBy('foo')).toBe('quantity');
      expect(parseRankingSortBy(undefined)).toBe('quantity');
    });
  });
});

describe('resolveItemUnitCost e resolveCustomizationExtraCost — custo de ingredientes/montagem (customizationSnapshot)', () => {
  it('soma custo do produto base + totalCost do customizationSnapshot', () => {
    expect(
      resolveItemUnitCost({
        product: { costPrice: 11 },
        customizationSnapshot: { totalCost: 3.7, stages: [] },
      }),
    ).toBe(14.7);
  });

  it('retorna totalCost das opções mesmo quando produto base tem costPrice 0 (ex: Monte seu Açaí)', () => {
    expect(
      resolveItemUnitCost({
        product: { costPrice: 0 },
        customizationSnapshot: { totalCost: 6.5, stages: [] },
      }),
    ).toBe(6.5);
  });

  it('mantém retrocompatibilidade com pedidos antigos sem totalCost (retorna 0, sem NaN)', () => {
    expect(resolveCustomizationExtraCost({ stages: [{ options: [{ optionId: 'o1', quantity: 2 }] }] })).toBe(0);
    expect(
      resolveItemUnitCost({
        product: { costPrice: 12 },
        customizationSnapshot: { stages: [{ options: [{ optionId: 'o1', quantity: 2 }] }] },
      }),
    ).toBe(12);
  });

  it('mantém cálculo de combo inalterado', () => {
    expect(
      resolveItemUnitCost({
        isCombo: true,
        comboSnapshot: { items: [{ productCostPrice: 5, quantity: 2 }] },
        customizationSnapshot: { totalCost: 99 },
      }),
    ).toBe(10);
  });
});
