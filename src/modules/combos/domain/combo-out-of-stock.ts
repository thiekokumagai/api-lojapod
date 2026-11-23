export interface ComboAvailabilityProductItem {
  id: string;
  stock: number | null;
}

export interface ComboAvailabilityProduct {
  id: string;
  isVisible: boolean;
  deletedAt: Date | null;
  items?: ComboAvailabilityProductItem[];
}

export interface ComboAvailabilityItem {
  productId: string;
  productItemId?: string | null;
  quantity: number;
  product?: ComboAvailabilityProduct | null;
}

export interface ComboAvailabilitySnapshot {
  id: string;
  storeId: string;
  isActive: boolean;
  maxTotalSales?: number | null;
  totalSold?: number | null;
  items: ComboAvailabilityItem[];
}

export interface ComboOutOfStockTx {
  storeSettings: {
    findFirst(args: {
      where: { storeId: string };
      select: { autoHideOutOfStock: true };
    }): Promise<{ autoHideOutOfStock: boolean | null } | null>;
  };
  combo: {
    findMany(args: {
      where: Record<string, unknown>;
      include: {
        items: {
          include: {
            product: {
              include: { items: true };
            };
          };
        };
      };
    }): Promise<ComboAvailabilitySnapshot[]>;
    updateMany(args: {
      where: { id: { in: string[] }; storeId: string };
      data: { isActive: false };
    }): Promise<unknown>;
  };
}

/**
 * Retorna true quando o combo não pode mais ser montado/vendido:
 * - atingiu o limite próprio de vendas (maxTotalSales), OU
 * - algum componente está invisível/deletado, sem estoque suficiente na variação
 *   vinculada (productItemId) ou sem nenhuma variação elegível com estoque >= quantity.
 */
export function isComboOutOfStock(combo: ComboAvailabilitySnapshot): boolean {
  if (
    combo.maxTotalSales !== null &&
    combo.maxTotalSales !== undefined &&
    (combo.totalSold ?? 0) >= combo.maxTotalSales
  ) {
    return true;
  }

  for (const item of combo.items) {
    const requiredQty = Math.max(1, Number(item.quantity) || 1);
    const prod = item.product;

    if (!prod || prod.isVisible === false || prod.deletedAt !== null) {
      return true;
    }

    const productItems = prod.items ?? [];

    if (item.productItemId) {
      const targetItem = productItems.find(
        (pi) => pi.id === item.productItemId,
      );
      if (!targetItem || (targetItem.stock ?? 0) < requiredQty) {
        return true;
      }
    } else if (productItems.length > 0) {
      const hasEligibleVariation = productItems.some(
        (pi) => (pi.stock ?? 0) >= requiredQty,
      );
      if (!hasEligibleVariation) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
}

/**
 * Após uma venda/baixa de estoque dentro de uma transação Prisma, desativa (`isActive: false`)
 * os combos da mesma loja (`storeId`) que ficaram sem estoque próprio (`maxTotalSales`) ou
 * com algum componente abaixo da quantidade necessária — somente quando `autoHideOutOfStock`
 * está ativo (true ou padrão).
 */
export async function syncAffectedCombosAfterSale(
  tx: ComboOutOfStockTx,
  storeId: string | null | undefined,
  touchedProductIds: Iterable<string>,
  soldComboIds: Iterable<string> = [],
): Promise<string[]> {
  if (!storeId) {
    return [];
  }

  const productIds = Array.from(
    new Set(Array.from(touchedProductIds).filter(Boolean)),
  );
  const comboIds = Array.from(
    new Set(Array.from(soldComboIds).filter(Boolean)),
  );

  if (productIds.length === 0 && comboIds.length === 0) {
    return [];
  }

  const settings = await tx.storeSettings.findFirst({
    where: { storeId },
    select: { autoHideOutOfStock: true },
  });

  if (settings && settings.autoHideOutOfStock === false) {
    return [];
  }

  const orFilters: Record<string, unknown>[] = [];
  if (comboIds.length > 0) {
    orFilters.push({ id: { in: comboIds } });
  }
  if (productIds.length > 0) {
    orFilters.push({ items: { some: { productId: { in: productIds } } } });
  }

  const candidateCombos = await tx.combo.findMany({
    where: {
      storeId,
      isActive: true,
      OR: orFilters,
    },
    include: {
      items: {
        include: {
          product: {
            include: { items: true },
          },
        },
      },
    },
  });

  if (candidateCombos.length === 0) {
    return [];
  }

  const comboIdsToDeactivate = candidateCombos
    .filter((combo) => isComboOutOfStock(combo))
    .map((combo) => combo.id);

  if (comboIdsToDeactivate.length === 0) {
    return [];
  }

  await tx.combo.updateMany({
    where: {
      id: { in: comboIdsToDeactivate },
      storeId,
    },
    data: { isActive: false },
  });

  return comboIdsToDeactivate;
}
