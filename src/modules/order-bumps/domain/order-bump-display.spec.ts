import {
  CART_MAX_SUGGESTIONS,
  PRODUCT_MAX_SUGGESTIONS,
  displayLocationsVisibleIn,
  maxSuggestionsFor,
  normalizeLocation,
  shortDescription,
} from './order-bump-display';

describe('order-bump-display', () => {
  describe('displayLocationsVisibleIn', () => {
    it('carrinho mostra as ofertas do carrinho e as dos dois', () => {
      expect(displayLocationsVisibleIn('CART')).toEqual(['CART', 'BOTH']);
    });

    it('tela do produto mostra as ofertas do produto e as dos dois', () => {
      expect(displayLocationsVisibleIn('PRODUCT')).toEqual(['PRODUCT', 'BOTH']);
    });

    it('sem informar (cliente antigo) vale o carrinho, como era antes', () => {
      expect(displayLocationsVisibleIn(undefined)).toEqual(['CART', 'BOTH']);
      expect(displayLocationsVisibleIn(null)).toEqual(['CART', 'BOTH']);
      expect(displayLocationsVisibleIn('qualquer')).toEqual(['CART', 'BOTH']);
    });
  });

  it('normalizeLocation: só PRODUCT muda o padrão', () => {
    expect(normalizeLocation('PRODUCT')).toBe('PRODUCT');
    expect(normalizeLocation('CART')).toBe('CART');
    expect(normalizeLocation(undefined)).toBe('CART');
  });

  it('limite: 6 no carrinho e 10 na tela do produto', () => {
    expect(maxSuggestionsFor('CART')).toBe(CART_MAX_SUGGESTIONS);
    expect(maxSuggestionsFor(undefined)).toBe(6);
    expect(maxSuggestionsFor('PRODUCT')).toBe(PRODUCT_MAX_SUGGESTIONS);
    expect(PRODUCT_MAX_SUGGESTIONS).toBe(10);
  });

  describe('shortDescription', () => {
    it('texto curto passa como veio', () => {
      expect(shortDescription('Lata 310ml')).toBe('Lata 310ml');
    });

    it('vazio, nulo ou só espaços: null', () => {
      expect(shortDescription(undefined)).toBeNull();
      expect(shortDescription(null)).toBeNull();
      expect(shortDescription('   \n ')).toBeNull();
    });

    it('junta quebras de linha e tira etiquetas HTML', () => {
      expect(shortDescription('<p>Lata</p>\n<b>310ml</b>')).toBe('Lata 310ml');
    });

    it('corta no limite com reticências', () => {
      const long = 'a'.repeat(300);
      const result = shortDescription(long, 50) as string;
      expect(result.length).toBe(50);
      expect(result.endsWith('…')).toBe(true);
    });
  });
});
