// Cálculo de lucro bruto de produto para o Dashboard.
// Usa o custo ATUAL do produto (Product.costPrice); no combo, o custo gravado
// no comboSnapshot (productCostPrice). Frete fica fora: não entra na receita nem no custo.

export type RankingSortBy = 'quantity' | 'revenue' | 'profit' | 'margin';

export const RANKING_SORT_OPTIONS: RankingSortBy[] = [
  'quantity',
  'revenue',
  'profit',
  'margin',
];

export function parseRankingSortBy(value?: string): RankingSortBy {
  return RANKING_SORT_OPTIONS.includes(value as RankingSortBy)
    ? (value as RankingSortBy)
    : 'quantity';
}

export interface ProfitItemInput {
  price: number;
  quantity: number;
  /** Custo unitário já resolvido; null/0 = produto sem custo cadastrado. */
  unitCost: number | null;
}

export interface ProfitOrderInput {
  /** Cupom + desconto de pagamento + desconto de recibo (não inclui desconto de frete). */
  discounts: number;
  cardFee: number;
  items: ProfitItemInput[];
}

export interface ItemProfit {
  /** price * quantity, antes de descontos. */
  revenue: number;
  /** Parte proporcional dos descontos do pedido. */
  discount: number;
  /** Parte proporcional da taxa de cartão do pedido. */
  cardFee: number;
  /** Receita menos descontos. */
  netRevenue: number;
  /** null quando o item não tem custo cadastrado. */
  cost: number | null;
  /** null quando o item não tem custo cadastrado. */
  profit: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rateia descontos e taxa de cartão do pedido entre os itens, proporcional à receita
 * de cada um, e calcula o lucro de cada item. A soma dos itens fecha com o pedido.
 */
export function calculateOrderItemsProfit(order: ProfitOrderInput): ItemProfit[] {
  const orderRevenue = order.items.reduce(
    (sum, it) => sum + it.price * it.quantity,
    0,
  );

  return order.items.map((it) => {
    const revenue = it.price * it.quantity;
    const share = orderRevenue > 0 ? revenue / orderRevenue : 0;
    const discount = order.discounts * share;
    const cardFee = order.cardFee * share;
    const netRevenue = revenue - discount;
    const hasCost = it.unitCost !== null && it.unitCost > 0;
    const cost = hasCost ? (it.unitCost as number) * it.quantity : null;
    const profit = cost === null ? null : netRevenue - cost - cardFee;

    return {
      revenue: round2(revenue),
      discount: round2(discount),
      cardFee: round2(cardFee),
      netRevenue: round2(netRevenue),
      cost: cost === null ? null : round2(cost),
      profit: profit === null ? null : round2(profit),
    };
  });
}

interface CostSourceItem {
  isCombo?: boolean;
  comboId?: string | null;
  comboSnapshot?: unknown;
  product?: { costPrice?: unknown } | null;
}

/**
 * Custo unitário do item vendido. Retorna null se não houver custo confiável:
 * produto sem costPrice, ou combo com algum componente sem custo (somar só uma
 * parte esconderia o buraco e inflaria a margem).
 */
export function resolveItemUnitCost(item: CostSourceItem): number | null {
  const isCombo = !!(item.isCombo || item.comboId || item.comboSnapshot);

  if (isCombo) {
    const snapshot = item.comboSnapshot as
      | { items?: { productCostPrice?: unknown; quantity?: unknown }[] }
      | null
      | undefined;
    const components = snapshot?.items;
    if (!Array.isArray(components) || components.length === 0) return null;

    let total = 0;
    for (const comp of components) {
      const compCost = Number(comp.productCostPrice || 0);
      if (!(compCost > 0)) return null;
      total += compCost * Number(comp.quantity || 1);
    }
    return total > 0 ? total : null;
  }

  const cost = Number(item.product?.costPrice || 0);
  return cost > 0 ? cost : null;
}
