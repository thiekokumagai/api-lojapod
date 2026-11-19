import { expandOrderSales, marginPct, productSaleProfit } from './product-sales.util';

const direct = (over: any = {}) => ({
  productId: 'p1',
  productName: 'Café',
  price: 10,
  quantity: 2,
  isCombo: false,
  comboId: null,
  comboSnapshot: null,
  product: { costPrice: 4 },
  ...over,
});

// Box com 2 cafés (R$ 10 cada) + 1 filtro (R$ 20), vendido a R$ 36
const box = (over: any = {}) => ({
  productId: null,
  productName: 'Box Café',
  price: 36,
  quantity: 1,
  isCombo: true,
  comboId: 'c1',
  product: null,
  comboSnapshot: {
    items: [
      { productId: 'p1', productName: 'Café', quantity: 2, productPrice: 10, productCostPrice: 4 },
      { productId: 'p2', productName: 'Filtro', quantity: 1, productPrice: 20, productCostPrice: 8 },
    ],
  },
  ...over,
});

describe('expandOrderSales', () => {
  it('venda avulsa vira 1 produto DIRECT com receita e custo', () => {
    const { products, combos } = expandOrderSales({
      discounts: 0,
      cardFee: 0,
      items: [direct()],
    });
    expect(combos).toHaveLength(0);
    expect(products).toEqual([
      expect.objectContaining({ kind: 'DIRECT', productId: 'p1', units: 2, revenue: 20, cost: 8 }),
    ]);
  });

  it('box abre em unidades dos componentes e conta 1 linha de box', () => {
    const { products, combos } = expandOrderSales({
      discounts: 0,
      cardFee: 0,
      items: [box({ quantity: 3, price: 36 })],
    });
    expect(combos).toEqual([
      expect.objectContaining({ comboId: 'c1', quantity: 3, hasComposition: true }),
    ]);
    const cafe = products.find((p) => p.productId === 'p1')!;
    const filtro = products.find((p) => p.productId === 'p2')!;
    expect(cafe.kind).toBe('COMBO_COMPONENT');
    expect(cafe.units).toBe(6); // 2 por box x 3 boxes
    expect(filtro.units).toBe(3);
    expect(cafe.cost).toBe(24); // 4 x 2 x 3
    expect(filtro.cost).toBe(24); // 8 x 1 x 3
  });

  it('reparte a receita do box pelo preço de tabela dos componentes', () => {
    const { products } = expandOrderSales({
      discounts: 0,
      cardFee: 0,
      items: [box()],
    });
    const cafe = products.find((p) => p.productId === 'p1')!;
    const filtro = products.find((p) => p.productId === 'p2')!;
    // pesos 20 e 20: metade cada de R$ 36
    expect(cafe.revenue).toBeCloseTo(18);
    expect(filtro.revenue).toBeCloseTo(18);
    expect(cafe.revenue + filtro.revenue).toBeCloseTo(36);
  });

  it('descontos e taxa de cartão do pedido entram proporcionais e fecham com o total', () => {
    const { products } = expandOrderSales({
      discounts: 6,
      cardFee: 3,
      items: [direct(), box()], // 20 + 36 = 56 de receita
    });
    const sumDiscount = products.reduce((s, p) => s + p.discount, 0);
    const sumFee = products.reduce((s, p) => s + p.cardFee, 0);
    expect(sumDiscount).toBeCloseTo(6, 1);
    expect(sumFee).toBeCloseTo(3, 1);
  });

  it('componente sem custo fica com custo null e não esconde os outros', () => {
    const snap = box().comboSnapshot;
    snap.items[1].productCostPrice = 0;
    const { products } = expandOrderSales({
      discounts: 0,
      cardFee: 0,
      items: [box({ comboSnapshot: snap })],
    });
    expect(products.find((p) => p.productId === 'p1')!.cost).toBe(8);
    expect(products.find((p) => p.productId === 'p2')!.cost).toBeNull();
  });

  it('box antigo sem composição conta como box, mas não abre em produtos', () => {
    const { products, combos } = expandOrderSales({
      discounts: 0,
      cardFee: 0,
      items: [box({ comboSnapshot: null })],
    });
    expect(products).toHaveLength(0);
    expect(combos[0].hasComposition).toBe(false);
    expect(combos[0].quantity).toBe(1);
  });

  it('produto apagado (sem productId) continua pelo nome', () => {
    const { products } = expandOrderSales({
      discounts: 0,
      cardFee: 0,
      items: [direct({ productId: null, product: null })],
    });
    expect(products[0].productId).toBeNull();
    expect(products[0].title).toBe('Café');
    expect(products[0].cost).toBeNull();
  });
});

describe('productSaleProfit / marginPct', () => {
  it('lucro = receita - desconto - custo - taxa; null sem custo', () => {
    expect(productSaleProfit({ revenue: 20, discount: 2, cardFee: 1, cost: 8 })).toBe(9);
    expect(productSaleProfit({ revenue: 20, discount: 0, cardFee: 0, cost: null })).toBeNull();
  });

  it('margem sobre a receita líquida, null sem base', () => {
    expect(marginPct(9, 18)).toBe(50);
    expect(marginPct(5, 0)).toBeNull();
  });
});
