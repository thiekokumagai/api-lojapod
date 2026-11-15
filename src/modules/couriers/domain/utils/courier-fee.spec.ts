import {
  buildCancelImpact,
  buildReactivationImpact,
  loadOrderRoute,
  roundMoney,
  splitCourierFee,
} from './courier-fee';

describe('splitCourierFee (taxa fixa da rota)', () => {
  it('R$ 50 com 3 pedidos ativos: cancelar 1 tira 16,67 e deixa 33,33 (sem perder centavo)', () => {
    const r = splitCourierFee(50, 3);
    expect(r).toEqual({ shareAmount: 16.67, suggestedAmount: 33.33 });
    expect(roundMoney(r.shareAmount + r.suggestedAmount)).toBe(50);
  });

  it('R$ 50 com 2 pedidos: metade para cada um', () => {
    expect(splitCourierFee(50, 2)).toEqual({ shareAmount: 25, suggestedAmount: 25 });
  });

  it('último pedido ativo (ou rota de 1): a taxa inteira sai e o novo valor é 0', () => {
    expect(splitCourierFee(50, 1)).toEqual({ shareAmount: 50, suggestedAmount: 0 });
    expect(splitCourierFee(50, 0)).toEqual({ shareAmount: 50, suggestedAmount: 0 });
  });

  it('centavos: parte + novo valor sempre fecham o valor anterior', () => {
    for (const [amount, active] of [
      [100, 3],
      [10, 3],
      [0.01, 2],
      [33.33, 2],
      [7.99, 4],
      [1234.56, 7],
    ] as const) {
      const r = splitCourierFee(amount, active);
      expect(roundMoney(r.shareAmount + r.suggestedAmount)).toBe(roundMoney(amount));
      expect(r.suggestedAmount).toBeGreaterThanOrEqual(0);
    }
    expect(splitCourierFee(100, 3)).toEqual({ shareAmount: 33.33, suggestedAmount: 66.67 });
  });

  it('cancelar de novo na mesma rota usa o valor já reduzido (33,33 com 2 ativos)', () => {
    expect(splitCourierFee(33.33, 2)).toEqual({ shareAmount: 16.67, suggestedAmount: 16.66 });
  });

  it('taxa zero ou valor inválido não gera valor negativo', () => {
    expect(splitCourierFee(0, 3)).toEqual({ shareAmount: 0, suggestedAmount: 0 });
    expect(splitCourierFee(NaN, 3)).toEqual({ shareAmount: 0, suggestedAmount: 0 });
  });
});

const route = (over: any = {}) => ({
  orderNumber: 101,
  orderStatus: 'CONFIRMED',
  tx: { id: 'tx1', type: 'FEE', amount: 50, courierId: 'c1', courierName: 'Gui', activeOrders: 3 },
  ...over,
});

describe('impacto no cancelamento / reativação', () => {
  it('cancelar: sugere o novo valor com os dados lidos antes', () => {
    expect(buildCancelImpact(route())).toEqual({
      kind: 'CANCELLED',
      transactionId: 'tx1',
      courierId: 'c1',
      courierName: 'Gui',
      orderNumber: 101,
      amount: 50,
      activeOrdersBefore: 3,
      shareAmount: 16.67,
      suggestedAmount: 33.33,
    });
  });

  it('todos cancelados: última rota ativa vai a R$ 0 (lançamento fica, valor zerado)', () => {
    expect(buildCancelImpact(route({ tx: { ...route().tx, activeOrders: 1 } }))).toMatchObject({
      activeOrdersBefore: 1,
      shareAmount: 50,
      suggestedAmount: 0,
    });
  });

  it('sem rota, lançamento que não é FEE ou pedido já cancelado: sem impacto', () => {
    expect(buildCancelImpact(null)).toBeNull();
    expect(buildCancelImpact(route({ tx: null }))).toBeNull();
    expect(buildCancelImpact(route({ tx: { ...route().tx, type: 'PAYMENT' } }))).toBeNull();
    expect(buildCancelImpact(route({ orderStatus: 'CANCELLED' }))).toBeNull();
  });

  it('reativar: só avisa, não sugere valor (nada é recalculado sozinho)', () => {
    const impact = buildReactivationImpact(route({ tx: { ...route().tx, amount: 33.33, activeOrders: 3 } }));
    expect(impact).toMatchObject({ kind: 'REACTIVATED', amount: 33.33, shareAmount: null, suggestedAmount: null });
    expect(buildReactivationImpact(route({ orderStatus: 'CANCELLED' }))).toBeNull();
  });
});

describe('loadOrderRoute', () => {
  it('conta só pedidos não cancelados do lançamento', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderNumber: 7,
          status: 'CONFIRMED',
          courierTransaction: {
            id: 'tx1',
            type: 'FEE',
            amount: '50',
            courier: { id: 'c1', name: 'Gui' },
            orders: [{ status: 'CONFIRMED' }, { status: 'CANCELLED' }, { status: 'DISPATCHED' }],
          },
        }),
      },
    };
    const r = await loadOrderRoute(prisma, 'o1');
    expect(r?.tx).toMatchObject({ id: 'tx1', amount: 50, courierName: 'Gui', activeOrders: 2 });
  });

  it('pedido sem rota', async () => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ orderNumber: 7, status: 'PENDING', courierTransaction: null }) },
    };
    expect((await loadOrderRoute(prisma, 'o1'))?.tx).toBeNull();
  });
});
