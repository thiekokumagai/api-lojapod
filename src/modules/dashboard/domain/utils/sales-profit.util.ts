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
  customizationSnapshot?: unknown;
  /** Venda por peso: o costPrice do produto é por kg e o item (quantity 1) custa custo/kg × peso. */
  weightKg?: unknown;
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

  const costPerUnit = Math.max(0, Number(item.product?.costPrice || 0));
  const weightKg = Number(item.weightKg);
  const baseCost =
    item.weightKg !== null && item.weightKg !== undefined && weightKg > 0 ? costPerUnit * weightKg : costPerUnit;
  const extraCost = resolveCustomizationExtraCost(item.customizationSnapshot);
  const totalCost = round2(baseCost + extraCost);
  return totalCost > 0 ? totalCost : null;
}

/**
 * Extrai o custo adicional das opções de montagem gravado no customizationSnapshot.
 * Retrocompatível: pedidos antigos sem totalCost/unitCost retornam 0 (nunca NaN).
 */
export function resolveCustomizationExtraCost(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const snap = snapshot as {
    totalCost?: unknown;
    stages?: Array<{
      options?: Array<{
        totalCost?: unknown;
        unitCost?: unknown;
        quantity?: unknown;
      }>;
    }>;
  };

  if (snap.totalCost !== undefined && snap.totalCost !== null) {
    const parsed = Number(snap.totalCost);
    return Number.isFinite(parsed) && parsed > 0 ? round2(parsed) : 0;
  }

  if (!Array.isArray(snap.stages)) return 0;
  let sum = 0;
  for (const stage of snap.stages) {
    if (!Array.isArray(stage?.options)) continue;
    for (const opt of stage.options) {
      if (opt?.totalCost !== undefined && opt?.totalCost !== null) {
        const c = Number(opt.totalCost);
        if (Number.isFinite(c) && c > 0) sum += c;
      } else if (opt?.unitCost !== undefined && opt?.unitCost !== null) {
        const u = Number(opt.unitCost);
        const q = Number(opt.quantity || 1);
        if (Number.isFinite(u) && u > 0 && Number.isFinite(q) && q > 0) {
          sum += u * q;
        }
      }
    }
  }
  return sum > 0 ? round2(sum) : 0;
}
