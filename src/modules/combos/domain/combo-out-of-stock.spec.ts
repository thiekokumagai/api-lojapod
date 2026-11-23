import {
  isComboOutOfStock,
  syncAffectedCombosAfterSale,
  type ComboAvailabilitySnapshot,
  type ComboOutOfStockTx,
} from './combo-out-of-stock';

const makeCombo = (
  overrides: Partial<ComboAvailabilitySnapshot> = {},
): ComboAvailabilitySnapshot => ({
  id: 'combo-1',
  storeId: 'store-1',
  isActive: true,
  maxTotalSales: null,
  totalSold: 0,
  items: [
    {
      productId: 'prod-1',
      productItemId: null,
      quantity: 1,
      product: {
        id: 'prod-1',
        isVisible: true,
        deletedAt: null,
        items: [{ id: 'pi-1', stock: 5 }],
      },
    },
  ],
  ...overrides,
});

function createTxMock(
  autoHideOutOfStock: boolean | null,
  candidateCombos: ComboAvailabilitySnapshot[],
): {
  tx: ComboOutOfStockTx;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  updateMany: jest.Mock;
} {
  const findFirst = jest.fn().mockResolvedValue(
    autoHideOutOfStock === null ? null : { autoHideOutOfStock },
  );
  const findMany = jest.fn().mockResolvedValue(candidateCombos);
  const updateMany = jest.fn().mockResolvedValue({ count: candidateCombos.length });

  return {
    tx: {
      storeSettings: { findFirst },
      combo: { findMany, updateMany },
    },
    findFirst,
    findMany,
    updateMany,
  };
}

describe('combo-out-of-stock (autoHideOutOfStock para combos após venda)', () => {
  it('opção ativa + componente zera estoque -> desativa o combo na mesma loja', async () => {
    const combo = makeCombo({
      items: [
        {
          productId: 'prod-1',
          productItemId: null,
          quantity: 1,
          product: {
            id: 'prod-1',
            isVisible: false,
            deletedAt: null,
            items: [{ id: 'pi-1', stock: 0 }],
          },
        },
      ],
    });
    const { tx, findMany, updateMany } = createTxMock(true, [combo]);

    const deactivated = await syncAffectedCombosAfterSale(tx, 'store-1', ['prod-1']);

    expect(deactivated).toEqual(['combo-1']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          isActive: true,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['combo-1'] }, storeId: 'store-1' },
      data: { isActive: false },
    });
  });

  it('opção ativa + componente fica abaixo da quantidade exigida pelo combo (estoque 1, combo exige 2) -> desativa o combo', async () => {
    const combo = makeCombo({
      id: 'combo-duplo',
      items: [
        {
          productId: 'prod-1',
          productItemId: null,
          quantity: 2,
          product: {
            id: 'prod-1',
            isVisible: true,
            deletedAt: null,
            items: [{ id: 'pi-1', stock: 1 }],
          },
        },
      ],
    });
    const { tx, updateMany } = createTxMock(true, [combo]);

    const deactivated = await syncAffectedCombosAfterSale(tx, 'store-1', ['prod-1']);

    expect(deactivated).toEqual(['combo-duplo']);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['combo-duplo'] }, storeId: 'store-1' },
      data: { isActive: false },
    });
  });

  it('opção ativa + combo atinge limite próprio maxTotalSales -> desativa o combo mesmo com componentes em estoque', async () => {
    const combo = makeCombo({
      id: 'combo-limitado',
      maxTotalSales: 10,
      totalSold: 10,
    });
    const { tx, updateMany } = createTxMock(true, [combo]);

    const deactivated = await syncAffectedCombosAfterSale(
      tx,
      'store-1',
      ['prod-1'],
      ['combo-limitado'],
    );

    expect(deactivated).toEqual(['combo-limitado']);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['combo-limitado'] }, storeId: 'store-1' },
      data: { isActive: false },
    });
  });

  it('opção ativa + componente com outra variação disponível (variação aberta) -> mantém combo visível', async () => {
    const combo = makeCombo({
      items: [
        {
          productId: 'prod-1',
          productItemId: null,
          quantity: 1,
          product: {
            id: 'prod-1',
            isVisible: true,
            deletedAt: null,
            items: [
              { id: 'pi-zero', stock: 0 },
              { id: 'pi-disponivel', stock: 3 },
            ],
          },
        },
      ],
    });
    const { tx, updateMany } = createTxMock(true, [combo]);

    const deactivated = await syncAffectedCombosAfterSale(tx, 'store-1', ['prod-1']);

    expect(deactivated).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('opção ativa + variação específica (productItemId) vinculada ao combo zera -> desativa mesmo com outra variação em estoque', () => {
    const combo = makeCombo({
      items: [
        {
          productId: 'prod-1',
          productItemId: 'pi-especifica',
          quantity: 1,
          product: {
            id: 'prod-1',
            isVisible: true,
            deletedAt: null,
            items: [
              { id: 'pi-especifica', stock: 0 },
              { id: 'pi-outra', stock: 10 },
            ],
          },
        },
      ],
    });

    expect(isComboOutOfStock(combo)).toBe(true);
  });

  it('opção DESATIVADA (autoHideOutOfStock = false) + componente zera estoque -> mantém combo visível', async () => {
    const combo = makeCombo({
      items: [
        {
          productId: 'prod-1',
          productItemId: null,
          quantity: 1,
          product: {
            id: 'prod-1',
            isVisible: true,
            deletedAt: null,
            items: [{ id: 'pi-1', stock: 0 }],
          },
        },
      ],
    });
    const { tx, findMany, updateMany } = createTxMock(false, [combo]);

    const deactivated = await syncAffectedCombosAfterSale(
      tx,
      'store-1',
      ['prod-1'],
      ['combo-1'],
    );

    expect(deactivated).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('quando storeSettings não existe (padrão = ativo), desativa combo afetado', async () => {
    const combo = makeCombo({
      items: [
        {
          productId: 'prod-1',
          productItemId: null,
          quantity: 1,
          product: {
            id: 'prod-1',
            isVisible: true,
            deletedAt: null,
            items: [{ id: 'pi-1', stock: 0 }],
          },
        },
      ],
    });
    const { tx, updateMany } = createTxMock(null, [combo]);

    const deactivated = await syncAffectedCombosAfterSale(tx, 'store-1', ['prod-1']);

    expect(deactivated).toEqual(['combo-1']);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
