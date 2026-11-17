import {
  FreightConfig,
  acceptableFreightPrices,
  computeFreight,
  distanceRequired,
  freightBounds,
  getFreightPrice,
  isFreeShippingBySettings,
  validateDistance,
} from './freight-rules';
import { buildFreightDestination, buildFreightOrigin } from './freight-address';

/**
 * ATENÇÃO: as tabelas abaixo (RANGES, PRICE_CASES, DISTANCE_CASES, COMPUTE_CASES, DESTINATION_CASES,
 * ORIGIN_CASES) são IGUAIS às de `cliente-lojapod/src/hooks/use-calculator-freight.parity.spec.ts`.
 * O navegador roda a regra dele e o servidor a daqui; se as duas tabelas passam nos dois lados, dão o mesmo resultado.
 */
// fora de ordem de propósito: a regra ordena por distância
const RANGES = [
  { id: 'c', distancia: 10, valor: 12 },
  { id: 'a', distancia: 2, valor: 5 },
  { id: 'b', distancia: 5, valor: 8 },
];

const PRICE_CASES: Array<[number, number]> = [
  [0, 5],
  [1.9, 5],
  [2, 5], // a divisa vale para a faixa de baixo (<=)
  [2.01, 8],
  [5, 8],
  [5.01, 12],
  [10, 12],
  [10.01, 12], // passou da última faixa: vale o preço da última
  [250, 12],
];

const DISTANCE_CASES: Array<{
  km: number;
  allowAboveMax: boolean;
  customMax: number | null;
  error: string | null;
}> = [
  { km: 10, allowAboveMax: false, customMax: null, error: null },
  { km: 10.04, allowAboveMax: false, customMax: null, error: null }, // arredonda para 10.0
  {
    km: 10.06,
    allowAboveMax: false,
    customMax: null,
    error: 'Endereço fora da área de entrega (máximo 10km).',
  },
  { km: 50, allowAboveMax: true, customMax: null, error: null },
  { km: 7.04, allowAboveMax: false, customMax: 7, error: null },
  {
    km: 7.06,
    allowAboveMax: false,
    customMax: 7,
    error: 'Endereço fora da área de entrega (máximo 7km).',
  },
  {
    km: 50,
    allowAboveMax: true,
    customMax: 7,
    error: 'Endereço fora da área de entrega (máximo 7km).',
  }, // raio máximo vale mesmo com "acima do máximo"
  { km: 12, allowAboveMax: false, customMax: 15, error: null }, // o raio máximo substitui o da maior faixa
  {
    km: 12,
    allowAboveMax: false,
    customMax: 0,
    error: 'Endereço fora da área de entrega (máximo 10km).',
  }, // 0 = sem raio próprio
];

const COMPUTE_CASES: Array<{
  name: string;
  config: FreightConfig;
  km: number;
  cart?: number;
  expected: number | null | 'FORA';
}> = [
  {
    name: 'por distância (faixa do meio)',
    config: { deliveryRanges: { ranges: RANGES } },
    km: 3,
    cart: 50,
    expected: 8,
  },
  {
    name: 'DISTANCE explícito',
    config: { deliveryType: 'DISTANCE', deliveryRanges: { ranges: RANGES } },
    km: 1,
    expected: 5,
  },
  {
    name: 'sem faixas: a combinar',
    config: { deliveryType: 'DISTANCE', deliveryRanges: { ranges: [] } },
    km: 3,
    expected: null,
  },
  {
    name: 'sem configuração de faixas: a combinar',
    config: {},
    km: 3,
    expected: null,
  },
  {
    name: 'NO_FEE',
    config: { deliveryType: 'NO_FEE', deliveryRanges: { ranges: RANGES } },
    km: 9,
    expected: 0,
  },
  {
    name: 'FIXED_FEE',
    config: { deliveryType: 'FIXED_FEE', deliveryFixedFee: 6 },
    km: 9,
    expected: 6,
  },
  {
    name: 'FIXED_FEE como texto',
    config: { deliveryType: 'FIXED_FEE', deliveryFixedFee: '6.5' },
    km: 9,
    expected: 6.5,
  },
  {
    name: 'FIXED_FEE sem valor',
    config: { deliveryType: 'FIXED_FEE' },
    km: 9,
    expected: 0,
  },
  {
    name: 'TO_COMBINE',
    config: { deliveryType: 'TO_COMBINE' },
    km: 9,
    expected: null,
  },
  {
    name: 'frete grátis: carrinho no mínimo',
    config: {
      freeShippingEnabled: true,
      freeShippingMinValue: 100,
      deliveryRanges: { ranges: RANGES },
    },
    km: 9,
    cart: 100,
    expected: 0,
  },
  {
    name: 'frete grátis: abaixo do mínimo cobra a faixa',
    config: {
      freeShippingEnabled: true,
      freeShippingMinValue: 100,
      deliveryRanges: { ranges: RANGES },
    },
    km: 9,
    cart: 99.99,
    expected: 12,
  },
  {
    name: 'frete grátis: valor mínimo como texto',
    config: {
      freeShippingEnabled: true,
      freeShippingMinValue: '100',
      deliveryRanges: { ranges: RANGES },
    },
    km: 3,
    cart: 150,
    expected: 0,
  },
  {
    name: 'frete grátis desligado',
    config: {
      freeShippingEnabled: false,
      freeShippingMinValue: 100,
      deliveryRanges: { ranges: RANGES },
    },
    km: 3,
    cart: 500,
    expected: 8,
  },
  {
    name: 'frete grátis sem carrinho informado não vale',
    config: {
      freeShippingEnabled: true,
      freeShippingMinValue: 100,
      deliveryRanges: { ranges: RANGES },
    },
    km: 3,
    expected: 8,
  },
  {
    name: 'frete grátis com mínimo zero é ignorado',
    config: {
      freeShippingEnabled: true,
      freeShippingMinValue: 0,
      deliveryRanges: { ranges: RANGES },
    },
    km: 3,
    cart: 500,
    expected: 8,
  },
  {
    name: 'frete grátis também zera taxa fixa',
    config: {
      deliveryType: 'FIXED_FEE',
      deliveryFixedFee: 6,
      freeShippingEnabled: true,
      freeShippingMinValue: 50,
    },
    km: 3,
    cart: 60,
    expected: 0,
  },
  {
    name: 'acima do máximo sem permissão: fora da área',
    config: { deliveryRanges: { ranges: RANGES, allowAboveMax: false } },
    km: 11,
    expected: 'FORA',
  },
  {
    name: 'acima do máximo com permissão: preço da última faixa',
    config: { deliveryRanges: { ranges: RANGES, allowAboveMax: true } },
    km: 11,
    expected: 12,
  },
  {
    name: 'raio máximo vale para taxa fixa também',
    config: {
      deliveryType: 'FIXED_FEE',
      deliveryFixedFee: 6,
      deliveryRanges: { ranges: [], maxDeliveryKm: 8 },
    },
    km: 9,
    expected: 'FORA',
  },
];

const DESTINATION_CASES: Array<[Record<string, string>, string]> = [
  [
    {
      street: 'Rua Goiânia, 2386',
      number: '2386',
      neighborhood: 'Vila Birigui',
      city: 'Rondonópolis',
      state: 'MT',
    },
    'Rua Goiânia, 2386, Vila Birigui, Rondonópolis, MT',
  ],
  [
    {
      street: 'Rua Goiânia',
      number: '2386',
      neighborhood: 'Vila Birigui',
      city: 'Rondonópolis',
      state: 'MT',
    },
    'Rua Goiânia, 2386, Vila Birigui, Rondonópolis, MT',
  ],
  [
    {
      street: 'Av. Afonso Pena',
      number: 'S/N',
      neighborhood: 'Centro',
      city: 'Campo Grande',
      state: 'MS',
    },
    'Av. Afonso Pena, Centro, Campo Grande, MS',
  ],
  [
    {
      street: 'Rua X, s/n',
      number: '',
      neighborhood: 'Centro',
      city: 'Campo Grande',
      state: 'MS',
    },
    'Rua X, Centro, Campo Grande, MS',
  ],
  [
    {
      street: 'Rua A',
      number: '0',
      neighborhood: 'Bairro',
      city: 'Cidade',
      state: 'MS',
    },
    'Rua A, Bairro, Cidade, MS',
  ],
  [
    {
      street: 'Rua A',
      number: '10',
      neighborhood: 'Bairro',
      city: '',
      state: 'MS',
    },
    'Rua A, 10, Bairro, MS',
  ],
  [
    {
      street: '  Rua B  ',
      number: ' 5 ',
      neighborhood: '',
      city: 'Cidade',
      state: 'MS',
    },
    'Rua B, 5, Cidade, MS',
  ],
  [
    {
      street: '',
      number: '5',
      neighborhood: 'Bairro',
      city: 'Cidade',
      state: 'MS',
    },
    '',
  ],
];

const ORIGIN_CASES: Array<[Record<string, string>, string]> = [
  [
    {
      street: 'Rua 14 de Julho',
      number: '539',
      city: 'Campo Grande',
      state: 'MS',
      cep: '79002-330',
    },
    'Rua 14 de Julho, 539, Campo Grande - MS, CEP 79002330, Brasil',
  ],
  [
    {
      street: 'Av A',
      number: '1',
      deliveryOriginNumber: '99',
      cep: '1',
      deliveryOriginCep: '79.000-111',
      city: 'X',
      state: 'MS',
    },
    'Av A, 99, X - MS, CEP 79000111, Brasil',
  ],
  [{ number: '12', cep: '79010-000' }, 'CEP 79010000, 12, Brasil'],
  [{}, 'CEP 79000000, Brasil'],
  [{ street: 'Rua Z', cep: '79000-000' }, 'Rua Z, CEP 79000000, Brasil'],
];

describe('regra de frete (mesma do navegador)', () => {
  it.each(PRICE_CASES)('faixas: %skm custa R$ %s', (km, price) => {
    expect(getFreightPrice(km, RANGES)).toBe(price);
  });

  it('sem faixas o preço é "a combinar" (null)', () => {
    expect(getFreightPrice(3, [])).toBeNull();
  });

  it('não altera a lista de faixas recebida', () => {
    const copy = JSON.parse(JSON.stringify(RANGES));
    getFreightPrice(3, RANGES);
    expect(RANGES).toEqual(copy);
  });

  it.each(DISTANCE_CASES)(
    'área de entrega: %j',
    ({ km, allowAboveMax, customMax, error }) => {
      const result = validateDistance(km, RANGES, allowAboveMax, customMax);
      expect(result?.error ?? null).toBe(error);
    },
  );

  it.each(COMPUTE_CASES)('$name', ({ config, km, cart, expected }) => {
    const result = computeFreight(config, km, cart);
    if (expected === 'FORA') {
      expect(result.outOfArea).toBeDefined();
    } else {
      expect(result.outOfArea).toBeUndefined();
      expect('price' in result ? result.price : 'sem-preco').toBe(expected);
    }
  });

  it('distância devolvida arredondada em 1 casa, como no navegador', () => {
    const result = computeFreight(
      { deliveryRanges: { ranges: RANGES } },
      3.14159,
      10,
    );
    expect(result.distanceKm).toBe(3.1);
  });

  it('frete grátis por valor mínimo: só com carrinho no mínimo e configuração válida', () => {
    const cfg = { freeShippingEnabled: true, freeShippingMinValue: 80 };
    expect(isFreeShippingBySettings(cfg, 80)).toBe(true);
    expect(isFreeShippingBySettings(cfg, 79.99)).toBe(false);
    expect(isFreeShippingBySettings(cfg, undefined)).toBe(false);
    expect(
      isFreeShippingBySettings({ ...cfg, freeShippingEnabled: false }, 500),
    ).toBe(false);
  });
});

describe('endereços enviados ao Google (mesmos textos do navegador)', () => {
  it.each(DESTINATION_CASES)('destino %j', (input, expected) => {
    expect(buildFreightDestination(input)).toBe(expected);
  });

  it.each(ORIGIN_CASES)('origem %j', (input, expected) => {
    expect(buildFreightOrigin(input)).toBe(expected);
  });
});

describe('quando precisa medir a distância (custo do Google)', () => {
  it('taxa fixa, grátis e a combinar, sem raio máximo: NÃO chama o Google', () => {
    expect(
      distanceRequired({ deliveryType: 'FIXED_FEE', deliveryFixedFee: 6 }),
    ).toBe(false);
    expect(distanceRequired({ deliveryType: 'NO_FEE' })).toBe(false);
    expect(distanceRequired({ deliveryType: 'TO_COMBINE' })).toBe(false);
    expect(
      distanceRequired({
        deliveryType: 'DISTANCE',
        deliveryRanges: { ranges: [] },
      }),
    ).toBe(false);
  });

  it('por distância, ou com raio máximo/limite da maior faixa: chama', () => {
    expect(
      distanceRequired({
        deliveryRanges: { ranges: RANGES, allowAboveMax: true },
      }),
    ).toBe(true);
    expect(
      distanceRequired({
        deliveryType: 'FIXED_FEE',
        deliveryRanges: { ranges: [], maxDeliveryKm: 8 },
      }),
    ).toBe(true);
    expect(
      distanceRequired({
        deliveryType: 'FIXED_FEE',
        deliveryRanges: { ranges: RANGES, allowAboveMax: false },
      }),
    ).toBe(true);
  });

  it('frete grátis por valor, com permissão acima do máximo: dispensa o Google; sem permissão ainda precisa checar a área', () => {
    const free = { freeShippingEnabled: true, freeShippingMinValue: 50 };
    expect(
      distanceRequired(
        { ...free, deliveryRanges: { ranges: RANGES, allowAboveMax: true } },
        60,
      ),
    ).toBe(false);
    expect(
      distanceRequired(
        { ...free, deliveryRanges: { ranges: RANGES, allowAboveMax: false } },
        60,
      ),
    ).toBe(true);
  });

  it('cupom de frete grátis: só a checagem de área conta', () => {
    expect(
      distanceRequired(
        { deliveryRanges: { ranges: RANGES, allowAboveMax: true } },
        10,
        false,
      ),
    ).toBe(false);
    expect(
      distanceRequired(
        { deliveryRanges: { ranges: RANGES, allowAboveMax: false } },
        10,
        false,
      ),
    ).toBe(true);
  });
});

describe('folga perto da divisa de faixa e trava de preços', () => {
  const config = { deliveryRanges: { ranges: RANGES, allowAboveMax: true } };

  it('longe da divisa só um preço é aceitável', () => {
    expect(acceptableFreightPrices(config, 3.5, 10)).toEqual([8]);
  });

  it('perto da divisa (±0,5 km) aceita as duas faixas vizinhas', () => {
    const prices = acceptableFreightPrices(config, 5.1, 10);
    expect(prices.sort()).toEqual([8, 12].sort());
    expect(acceptableFreightPrices(config, 4.9, 10).sort()).toEqual(
      [8, 12].sort(),
    );
  });

  it('uma faixa a mais de distância não é aceita (não dá para escolher a faixa mais barata sem estar perto)', () => {
    expect(acceptableFreightPrices(config, 7, 10)).not.toContain(5);
  });

  it('trava pelos preços configurados quando não dá para medir', () => {
    expect(freightBounds(config)).toEqual({ min: 5, max: 12 });
    expect(
      freightBounds({ deliveryType: 'FIXED_FEE', deliveryFixedFee: 6 }),
    ).toEqual({ min: 6, max: 6 });
    expect(freightBounds({ deliveryType: 'NO_FEE' })).toEqual({
      min: 0,
      max: 0,
    });
    expect(freightBounds({ deliveryType: 'TO_COMBINE' })).toBeNull();
    expect(freightBounds({ deliveryRanges: { ranges: [] } })).toBeNull();
    expect(
      freightBounds(
        { ...config, freeShippingEnabled: true, freeShippingMinValue: 50 },
        80,
      ),
    ).toEqual({ min: 0, max: 0 });
  });
});
