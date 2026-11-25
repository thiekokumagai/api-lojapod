/**
 * Vendas por variação dentro de um produto do ranking "Produtos vendidos".
 * Usa o texto da variação que o item do pedido já grava (ex.: "P / Azul").
 * Item sem variação (pedido antigo, produto simples) entra como "Sem variação".
 */
export const NO_VARIATION_LABEL = 'Sem variação';

export interface VariationSale {
  label: string;
  quantity: number;
  totalRevenue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function addVariationSale(
  sales: Map<string, VariationSale>,
  variation: string | null | undefined,
  quantity: number,
  revenue: number,
): void {
  const label =
    typeof variation === 'string' && variation.trim()
      ? variation.trim()
      : NO_VARIATION_LABEL;
  const current = sales.get(label) ?? { label, quantity: 0, totalRevenue: 0 };
  current.quantity += quantity;
  current.totalRevenue += revenue;
  sales.set(label, current);
}

/**
 * Lista ordenada por quantidade (e faturamento no empate). Produto que nunca vendeu
 * com variação devolve undefined: a linha fica como hoje, sem nada para abrir.
 */
export function toVariationList(
  sales: Map<string, VariationSale>,
): VariationSale[] | undefined {
  const hasRealVariation = Array.from(sales.keys()).some(
    (label) => label !== NO_VARIATION_LABEL,
  );
  if (!hasRealVariation) return undefined;
  return Array.from(sales.values())
    .map((v) => ({ ...v, totalRevenue: round2(v.totalRevenue) }))
    .sort((a, b) => b.quantity - a.quantity || b.totalRevenue - a.totalRevenue);
}
