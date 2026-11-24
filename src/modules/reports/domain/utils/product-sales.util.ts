// Abre as vendas de um pedido em UNIDADES DE PRODUTO.
// Um box (combo) vendido conta como 1 unidade de combo, mas também como as unidades dos
// produtos que ele leva (comboSnapshot.items). Receita, descontos, taxa de cartão e custo
// do box são repartidos entre os componentes, para dar lucro por produto de verdade.
// Funções puras (sem banco) para serem testáveis.

import {
  calculateOrderItemsProfit,
  resolveItemUnitCost,
} from '../../../dashboard/domain/utils/sales-profit.util';

export interface SaleItemInput {
  productId?: string | null;
  productName: string;
  price: number;
  quantity: number;
  isCombo?: boolean;
  comboId?: string | null;
  comboSnapshot?: unknown;
  customizationSnapshot?: unknown;
  /** Venda por peso: custo do item = custo/kg × peso (ver resolveItemUnitCost). */
  weightKg?: unknown;
  /** Custo ATUAL do produto (Product.costPrice), usado só nas vendas avulsas. */
  product?: { costPrice?: unknown } | null;
}

export interface SaleOrderInput {
  /** Cupom + desconto de pagamento + desconto de recibo (sem desconto de frete). */
  discounts: number;
  cardFee: number;
  items: SaleItemInput[];
}

export type UnitSaleKind = 'DIRECT' | 'COMBO_COMPONENT';

/** Um produto vendido, avulso ou dentro de um box. */
export interface ProductUnitSale {
  kind: UnitSaleKind;
  /** null quando o produto foi apagado e o pedido só guardou o nome. */
  productId: string | null;
  title: string;
  units: number;
  revenue: number;
  discount: number;
  cardFee: number;
  /** null = sem custo cadastrado. */
  cost: number | null;
  comboId?: string | null;
}

/** Uma linha de box vendida (1 por item de pedido de combo). */
export interface ComboLineSale {
  comboId: string | null;
  title: string;
  /** Quantos boxes foram vendidos nesta linha. */
  quantity: number;
  revenue: number;
  discount: number;
  cardFee: number;
  /** null quando algum componente não tem custo (ver resolveItemUnitCost). */
  cost: number | null;
  profit: number | null;
  /** false = pedido antigo sem a composição gravada: o box conta, mas não abre em produtos. */
  hasComposition: boolean;
}

export interface ExpandedOrderSales {
  products: ProductUnitSale[];
  combos: ComboLineSale[];
}

interface SnapshotComponent {
  productId?: string | null;
  productName?: string;
  quantity?: number;
  productPrice?: number;
  productCostPrice?: number;
}

const isComboItem = (item: SaleItemInput) =>
  !!(item.isCombo || item.comboId || item.comboSnapshot);

function readComponents(item: SaleItemInput): SnapshotComponent[] {
  const snapshot = item.comboSnapshot as { items?: SnapshotComponent[] } | null;
  return Array.isArray(snapshot?.items) ? snapshot!.items! : [];
}

/**
 * Peso de cada componente na repartição do valor do box: preço de tabela × quantidade.
 * Se nenhum componente tem preço, reparte pela quantidade.
 */
function componentWeights(components: SnapshotComponent[]): number[] {
  const byPrice = components.map(
    (c) => Math.max(0, Number(c.productPrice) || 0) * (Number(c.quantity) || 1),
  );
  if (byPrice.some((w) => w > 0)) return byPrice;
  return components.map((c) => Number(c.quantity) || 1);
}

export function expandOrderSales(order: SaleOrderInput): ExpandedOrderSales {
  const profits = calculateOrderItemsProfit({
    discounts: order.discounts,
    cardFee: order.cardFee,
    items: order.items.map((it) => ({
      price: it.price,
      quantity: it.quantity,
      unitCost: resolveItemUnitCost(it),
    })),
  });

  const products: ProductUnitSale[] = [];
  const combos: ComboLineSale[] = [];

  order.items.forEach((item, idx) => {
    const calc = profits[idx];

    if (!isComboItem(item)) {
      products.push({
        kind: 'DIRECT',
        productId: item.productId ?? null,
        title: item.productName,
        units: item.quantity,
        revenue: calc.revenue,
        discount: calc.discount,
        cardFee: calc.cardFee,
        cost: calc.cost,
      });
      return;
    }

    const components = readComponents(item);
    const hasComposition = components.length > 0;
    combos.push({
      comboId: item.comboId ?? null,
      title: item.productName,
      quantity: item.quantity,
      revenue: calc.revenue,
      discount: calc.discount,
      cardFee: calc.cardFee,
      cost: calc.cost,
      profit: calc.profit,
      hasComposition,
    });
    if (!hasComposition) return;

    const weights = componentWeights(components);
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    components.forEach((comp, ci) => {
      const share = totalWeight > 0 ? weights[ci] / totalWeight : 0;
      const unitCost = Number(comp.productCostPrice) || 0;
      const unitsPerBox = Number(comp.quantity) || 1;
      products.push({
        kind: 'COMBO_COMPONENT',
        productId: comp.productId ?? null,
        title: comp.productName || 'Produto',
        units: unitsPerBox * item.quantity,
        revenue: calc.revenue * share,
        discount: calc.discount * share,
        cardFee: calc.cardFee * share,
        cost: unitCost > 0 ? unitCost * unitsPerBox * item.quantity : null,
        comboId: item.comboId ?? null,
      });
    });
  });

  return { products, combos };
}

/** Lucro de uma venda de produto: receita - descontos - custo - taxa. null sem custo. */
export function productSaleProfit(sale: {
  revenue: number;
  discount: number;
  cardFee: number;
  cost: number | null;
}): number | null {
  if (sale.cost === null) return null;
  return sale.revenue - sale.discount - sale.cost - sale.cardFee;
}

/** Margem em % (1 casa) sobre a receita líquida; null sem base. */
export function marginPct(profit: number, netRevenue: number): number | null {
  return netRevenue > 0 ? Number(((profit / netRevenue) * 100).toFixed(1)) : null;
}
