import { BadRequestException } from '@nestjs/common';
import {
  applyWeightedItem,
  isWeighedItem,
  takeWeightInput,
} from './weighted-item';

// Exemplo do plano: self-service a R$ 69,90/kg, prato de 0,700 kg bruto com tara de 50 g = 0,650 kg líquido
const product = { title: 'Self-service', price: 69.9, promotionalPrice: null };

function item(over: Record<string, unknown> = {}) {
  return {
    quantity: 1,
    price: 45.44,
    weightKg: 0.65,
    unitPricePerKg: 69.9,
    weightSource: 'SCALE' as const,
    ...over,
  } as any;
}

function apply(it: any, opts = { promoAllowed: true }, prod: any = product) {
  const input = takeWeightInput(it);
  applyWeightedItem(prod, it, input, opts);
  return it;
}

describe('applyWeightedItem (venda por peso)', () => {
  it('0,650 kg × R$ 69,90/kg = R$ 45,44, quantidade 1, origem da balança', () => {
    const it = apply(item());
    expect(it).toMatchObject({
      price: 45.44,
      quantity: 1,
      weightKg: 0.65,
      unitPricePerKg: 69.9,
      weightSource: 'SCALE',
    });
  });

  it('peso digitado: sem origem informada vira MANUAL; sem preço/kg usa o do cadastro', () => {
    const it = apply(
      item({ weightSource: undefined, unitPricePerKg: undefined }),
    );
    expect(it.weightSource).toBe('MANUAL');
    expect(it.unitPricePerKg).toBe(69.9);
  });

  it('arredonda o peso a 3 casas antes de calcular', () => {
    const it = apply(item({ weightKg: 0.6504, price: 45.44 }));
    expect(it.weightKg).toBe(0.65);
  });

  it('valor alterado na tela é recusado (o servidor não aceita outro preço)', () => {
    expect(() => apply(item({ price: 10 }))).toThrow(BadRequestException);
  });

  it('preço por kg adulterado é recusado', () => {
    expect(() => apply(item({ unitPricePerKg: 10, price: 6.5 }))).toThrow(
      /preço por kg/,
    );
  });

  it('preço promocional por kg só vale se a forma de pagamento permite', () => {
    const promo = { ...product, promotionalPrice: 59.9 };
    const ok = apply(
      item({ unitPricePerKg: 59.9, price: 38.94 }),
      { promoAllowed: true },
      promo,
    );
    expect(ok.price).toBe(38.94);
    expect(() =>
      apply(
        item({ unitPricePerKg: 59.9, price: 38.94 }),
        { promoAllowed: false },
        promo,
      ),
    ).toThrow(/preço por kg/);
  });

  it.each([0, -1, 0.0004, 100.5, 'abc', undefined])(
    'peso inválido (%p) é recusado',
    (kg) => {
      expect(() => apply(item({ weightKg: kg }))).toThrow(/Informe o peso/);
    },
  );

  it('quantidade diferente de 1 é recusada (cada pesagem é um item)', () => {
    expect(() => apply(item({ quantity: 2 }))).toThrow(/quantidade 1/);
  });

  it('produto sem preço por kg é recusado', () => {
    expect(() => apply(item(), undefined, { title: 'X', price: 0 })).toThrow(
      /sem preço por kg/,
    );
  });

  it('item por peso não aceita montagem nem combo', () => {
    expect(() => apply(item({ isCustomized: true }))).toThrow(/montagem/);
    expect(() => apply(item({ comboId: 'c1' }))).toThrow(/combo/);
  });
});

describe('takeWeightInput / isWeighedItem', () => {
  it('limpa o peso do item e devolve o que veio', () => {
    const it: any = {
      weightKg: 1.2,
      unitPricePerKg: 10,
      weightSource: 'SCALE',
    };
    expect(takeWeightInput(it)).toEqual({
      weightKg: 1.2,
      unitPricePerKg: 10,
      weightSource: 'SCALE',
    });
    expect(it).toEqual({
      weightKg: null,
      unitPricePerKg: null,
      weightSource: null,
    });
  });

  it('reconhece item gravado com peso (inclusive Decimal em texto)', () => {
    expect(isWeighedItem({ weightKg: '0.650' })).toBe(true);
    expect(isWeighedItem({ weightKg: null })).toBe(false);
    expect(isWeighedItem({})).toBe(false);
    expect(isWeighedItem({ weightKg: 0 })).toBe(false);
  });
});
