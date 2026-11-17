/**
 * Regra de frete da loja, em funções puras. É a MESMA regra que o navegador aplica em
 * `cliente-lojapod/src/hooks/use-calculator-freight.tsx` (`getFreightPrice`, `validateDistance` e o
 * trecho de preço de `calculate`). Os dois lados têm a mesma tabela de casos nos testes
 * (`freight-rules.spec.ts` aqui e `freight-rules-parity.spec.ts` no cliente); se mudar um, mude o outro.
 *
 * Aqui não há rede: a distância (km) vem de fora (Google Routes) e o resultado sai daqui.
 */

export interface DeliveryRange {
  id?: string;
  distancia: number;
  valor: number;
}

export interface FreightConfig {
  /** DISTANCE (padrão) | NO_FEE | FIXED_FEE | TO_COMBINE */
  deliveryType?: string | null;
  deliveryFixedFee?: unknown;
  deliveryRanges?: {
    ranges?: DeliveryRange[] | null;
    allowAboveMax?: unknown;
    maxDeliveryKm?: unknown;
  } | null;
  freeShippingEnabled?: boolean | null;
  freeShippingMinValue?: unknown;
}

export interface DistanceError {
  error: string;
  distanceKm: number;
}

/** Folga entre a distância do navegador e a do servidor (os dois endereços de destino podem ser escritos de forma um pouco diferente). */
export const FREIGHT_DISTANCE_MARGIN_KM = 0.5;
/** Diferença aceita entre o frete enviado pelo cliente e o calculado pelo servidor. */
export const FREIGHT_TOLERANCE = 0.1;

const num = (value: unknown): number => Number(value);

export function getRanges(config: FreightConfig): DeliveryRange[] {
  const ranges = config.deliveryRanges?.ranges;
  return Array.isArray(ranges) ? ranges : [];
}

/** Menor faixa cuja distância cobre `distanceKm`; passou da última, vale o preço da última; sem faixas, null (a combinar). */
export function getFreightPrice(
  distanceKm: number,
  ranges: DeliveryRange[],
): number | null {
  if (!ranges || ranges.length === 0) return null;
  const sorted = [...ranges].sort((a, b) => a.distancia - b.distancia);
  for (const tier of sorted) {
    if (distanceKm <= tier.distancia) return tier.valor;
  }
  return sorted[sorted.length - 1].valor;
}

/** Fora da área de entrega? (raio máximo configurado, ou a maior faixa quando "acima do máximo" não é permitido). */
export function validateDistance(
  distanceKm: number,
  ranges: DeliveryRange[],
  allowAboveMax: boolean,
  customMaxDistance?: number | null,
): DistanceError | null {
  const km = Math.round(distanceKm * 10) / 10;
  const rangesMax =
    ranges && ranges.length > 0
      ? Math.max(...ranges.map((r) => r.distancia))
      : 0;
  if (
    customMaxDistance !== null &&
    customMaxDistance !== undefined &&
    customMaxDistance > 0
  ) {
    if (km > customMaxDistance) {
      return {
        error: `Endereço fora da área de entrega (máximo ${customMaxDistance}km).`,
        distanceKm: km,
      };
    }
  } else if (rangesMax > 0 && km > rangesMax && !allowAboveMax) {
    return {
      error: `Endereço fora da área de entrega (máximo ${rangesMax}km).`,
      distanceKm: km,
    };
  }
  return null;
}

function areaLimits(config: FreightConfig) {
  const ranges = getRanges(config);
  const allowAboveMax = !!config.deliveryRanges?.allowAboveMax;
  const customMax = config.deliveryRanges?.maxDeliveryKm
    ? num(config.deliveryRanges.maxDeliveryKm)
    : null;
  return { ranges, allowAboveMax, customMax };
}

/** Pedido com valor para frete grátis por valor mínimo da loja. */
export function isFreeShippingBySettings(
  config: FreightConfig,
  cartTotal?: number,
): boolean {
  const min = config.freeShippingMinValue
    ? num(config.freeShippingMinValue)
    : null;
  return (
    !!config.freeShippingEnabled &&
    min !== null &&
    !Number.isNaN(min) &&
    min > 0 &&
    !!cartTotal &&
    cartTotal >= min
  );
}

export type FreightResult =
  | { outOfArea: string; distanceKm: number }
  | { outOfArea?: undefined; distanceKm: number; price: number | null };

/** Frete de uma entrega com a distância já conhecida. `price` null = a combinar. */
export function computeFreight(
  config: FreightConfig,
  distanceKm: number,
  cartTotal?: number,
): FreightResult {
  const { ranges, allowAboveMax, customMax } = areaLimits(config);

  const outside = validateDistance(
    distanceKm,
    ranges,
    allowAboveMax,
    customMax,
  );
  if (outside)
    return { outOfArea: outside.error, distanceKm: outside.distanceKm };

  let price: number | null;
  if (config.deliveryType === 'NO_FEE') {
    price = 0;
  } else if (config.deliveryType === 'FIXED_FEE') {
    price = config.deliveryFixedFee ? num(config.deliveryFixedFee) : 0;
  } else if (config.deliveryType === 'TO_COMBINE') {
    price = null;
  } else {
    price = getFreightPrice(distanceKm, ranges);
  }

  if (isFreeShippingBySettings(config, cartTotal)) price = 0;

  return { distanceKm: Math.round(distanceKm * 10) / 10, price };
}

/**
 * O frete depende da distância? Se não depende (taxa fixa, grátis, a combinar, sem faixas) e a loja não
 * tem raio máximo, não precisa chamar o Google: economiza uma consulta paga por pedido.
 */
export function distanceRequired(
  config: FreightConfig,
  cartTotal?: number,
  /** Falso quando o frete já está decidido por outra regra (ex.: cupom de frete grátis): só a checagem de área conta. */
  priceMatters = true,
): boolean {
  const { ranges, allowAboveMax, customMax } = areaLimits(config);
  const rangesMax =
    ranges.length > 0 ? Math.max(...ranges.map((r) => r.distancia)) : 0;
  const canBeOutOfArea =
    (customMax !== null && customMax > 0) || (rangesMax > 0 && !allowAboveMax);

  const priceByDistance =
    priceMatters &&
    config.deliveryType !== 'NO_FEE' &&
    config.deliveryType !== 'FIXED_FEE' &&
    config.deliveryType !== 'TO_COMBINE' &&
    ranges.length > 0 &&
    !isFreeShippingBySettings(config, cartTotal);

  return canBeOutOfArea || priceByDistance;
}

/**
 * Preços aceitáveis para o frete quando a distância tem folga: todos os preços que as faixas dão para
 * distâncias entre `km - margem` e `km + margem`. Evita recusar o cliente cujo endereço cai perto da
 * divisa entre duas faixas e que o navegador e o servidor mediram com 100 m de diferença.
 */
export function acceptableFreightPrices(
  config: FreightConfig,
  distanceKm: number,
  cartTotal?: number,
  marginKm: number = FREIGHT_DISTANCE_MARGIN_KM,
): Array<number | null> {
  const lo = Math.max(0, distanceKm - marginKm);
  const hi = distanceKm + marginKm;

  const samples = new Set<number>([distanceKm, lo, hi]);
  for (let d = lo; d <= hi; d += 0.1) samples.add(Math.round(d * 100) / 100);
  for (const tier of getRanges(config)) {
    if (tier.distancia >= lo && tier.distancia <= hi) {
      samples.add(tier.distancia);
      samples.add(tier.distancia + 0.01);
    }
  }

  const prices = new Set<number | null>();
  for (const d of samples) {
    const result = computeFreight(config, d, cartTotal);
    if (result.outOfArea === undefined) prices.add(result.price);
  }
  return [...prices];
}

/**
 * Faixa de preços que a loja pratica, para quando não dá para medir a distância (Google fora do ar):
 * o frete enviado tem que estar entre o menor e o maior preço configurado. É uma trava, não o cálculo.
 */
export function freightBounds(
  config: FreightConfig,
  cartTotal?: number,
): { min: number; max: number } | null {
  if (isFreeShippingBySettings(config, cartTotal)) return { min: 0, max: 0 };
  switch (config.deliveryType) {
    case 'NO_FEE':
      return { min: 0, max: 0 };
    case 'FIXED_FEE': {
      const fee = config.deliveryFixedFee ? num(config.deliveryFixedFee) : 0;
      return { min: fee, max: fee };
    }
    case 'TO_COMBINE':
      return null;
    default: {
      const prices = getRanges(config).map((r) => num(r.valor));
      if (prices.length === 0) return null;
      return { min: Math.min(...prices), max: Math.max(...prices) };
    }
  }
}
