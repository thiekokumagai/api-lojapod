/**
 * "Onde mostrar" a oferta "Peça também": no carrinho, na tela do produto ou nos dois.
 * O cliente diz onde está (`location`) e só vêm as ofertas marcadas para aquele lugar ou para os dois.
 */
export type OrderBumpLocation = 'CART' | 'PRODUCT';
export type OrderBumpDisplayValue = 'CART' | 'PRODUCT' | 'BOTH';

/** Quantas ofertas vêm de uma vez. No carrinho é uma faixa curta; na tela do produto é um grupo. */
export const CART_MAX_SUGGESTIONS = 6;
export const PRODUCT_MAX_SUGGESTIONS = 10;

/** Sem informar `location` vale o carrinho (comportamento de antes, para quem não mandou o campo). */
export function normalizeLocation(location?: string | null): OrderBumpLocation {
  return location === 'PRODUCT' ? 'PRODUCT' : 'CART';
}

/** Valores de `displayLocation` que aparecem no lugar pedido. */
export function displayLocationsVisibleIn(
  location?: string | null,
): OrderBumpDisplayValue[] {
  return normalizeLocation(location) === 'PRODUCT'
    ? ['PRODUCT', 'BOTH']
    : ['CART', 'BOTH'];
}

export function maxSuggestionsFor(location?: string | null): number {
  return normalizeLocation(location) === 'PRODUCT'
    ? PRODUCT_MAX_SUGGESTIONS
    : CART_MAX_SUGGESTIONS;
}

/** Descrição curta do produto para a linha da oferta (ex.: "Lata 310ml"): uma linha, até `max` letras. */
export function shortDescription(
  text?: string | null,
  max = 120,
): string | null {
  const clean = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
