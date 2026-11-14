import {
  normalizeName,
  normalizePhone,
  phoneKey,
  summarizeItems,
} from './cart-contact';

describe('normalizePhone', () => {
  it('aceita celular e fixo brasileiros, com ou sem máscara e +55', () => {
    expect(normalizePhone('(67) 99213-0201')).toBe('67992130201');
    expect(normalizePhone('67992130201')).toBe('67992130201');
    expect(normalizePhone('+55 67 99213-0201')).toBe('67992130201');
    expect(normalizePhone('(67) 3321-0201')).toBe('6733210201');
  });

  it('recusa telefone incompleto, longo demais ou inventado', () => {
    expect(normalizePhone('(67) 9213-020')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('0099213-0201')).toBeNull();
    expect(normalizePhone('67892130201')).toBeNull(); // 11 dígitos sem o 9
    expect(normalizePhone('679921302011234')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone({ a: 1 })).toBeNull();
  });
});

describe('normalizeName', () => {
  it('limpa espaços e caracteres de controle', () => {
    expect(normalizeName('  João   da\tSilva\n')).toBe('João da Silva');
    expect(normalizeName('Maria\u0000 Souza')).toBe('Maria Souza');
  });

  it('recusa nome curto, longo demais ou que não é texto', () => {
    expect(normalizeName('A')).toBeNull();
    expect(normalizeName('x'.repeat(81))).toBeNull();
    expect(normalizeName(null)).toBeNull();
    expect(normalizeName(42)).toBeNull();
  });
});

describe('phoneKey', () => {
  it('compara pelos 8 últimos dígitos, ignorando máscara, DDI e o 9', () => {
    expect(phoneKey('(67) 99213-0201')).toBe(phoneKey('5567992130201'));
    expect(phoneKey('(67) 99213-0201')).toBe(phoneKey('67 9213-0201'));
    expect(phoneKey(null)).toBe('');
    expect(phoneKey(undefined)).toBe('');
  });
});

describe('summarizeItems', () => {
  it('reduz o carrinho do navegador a nome, quantidade e variação', () => {
    expect(
      summarizeItems([
        {
          product: { name: 'Pod X', price: 99, secret: 'x' },
          quantity: 2,
          selectedVariation: 'Menta',
        },
        { product: { name: 'Líquido' }, quantity: 0 },
      ]),
    ).toEqual([
      { name: 'Pod X', quantity: 2, variation: 'Menta' },
      { name: 'Líquido', quantity: 1, variation: null },
    ]);
  });

  it('ignora lixo e limita tamanho e quantidade', () => {
    expect(summarizeItems(null)).toEqual([]);
    expect(summarizeItems('texto')).toEqual([]);
    expect(summarizeItems([null, 3, { quantity: 2 }, { product: {} }])).toEqual(
      [],
    );

    const many = Array.from({ length: 80 }, (_, i) => ({
      product: { name: `Item ${i}` },
      quantity: 500,
    }));
    const result = summarizeItems(many);
    expect(result).toHaveLength(30);
    expect(result[0].quantity).toBe(99);
    expect(
      summarizeItems([{ product: { name: 'n'.repeat(200) }, quantity: 1 }])[0]
        .name,
    ).toHaveLength(80);
  });
});
