import { CancelOrderUseCase } from './cancel-order.use-case';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';

// Registro do pedido como o Prisma devolve em order.findUnique (com a rota do motoboy)
const orderWithRoute = (status: string, orders: string[], amount = '50') => ({
  orderNumber: 101,
  status,
  courierTransaction: {
    id: 'tx1',
    type: 'FEE',
    amount,
    courier: { id: 'c1', name: 'Gui' },
    orders: orders.map((s) => ({ status: s })),
  },
});

const events = () =>
  ({ server: { emit: jest.fn() }, emitToStore: jest.fn(), notifyCatalogRefresh: jest.fn(), notifyOrderUpdated: jest.fn() }) as any;

function buildCancel(prismaOrder: any) {
  const cancelled: any = { id: 'o1', status: 'CANCELLED', items: [] };
  const repo = {
    findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'CONFIRMED' }),
    cancelAndRestoreStock: jest.fn().mockResolvedValue(cancelled),
  } as any;
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(prismaOrder) },
    product: { findUnique: jest.fn() },
  } as any;
  const ev = events();
  const loyalty = { revertOrderLoyalty: jest.fn().mockResolvedValue(undefined) } as any;
  return { repo, prisma, ev, cancelled, uc: new CancelOrderUseCase(repo, ev, prisma, loyalty) };
}

describe('CancelOrderUseCase: impacto na taxa do motoboy', () => {
  it('rota de 3 pedidos, R$ 50: devolve a taxa sugerida de 33,33 e lê a rota ANTES de cancelar', async () => {
    const { uc, prisma, repo, ev } = buildCancel(orderWithRoute('CONFIRMED', ['CONFIRMED', 'CONFIRMED', 'DISPATCHED']));
    // o socket serializa na hora do aviso: guarda como estava naquele instante
    const sent: string[] = [];
    ev.notifyOrderUpdated.mockImplementation((o: unknown) => sent.push(JSON.stringify(o)));
    const order = await uc.execute('o1');

    expect(order.courierImpact).toMatchObject({
      kind: 'CANCELLED',
      transactionId: 'tx1',
      courierName: 'Gui',
      amount: 50,
      activeOrdersBefore: 3,
      shareAmount: 16.67,
      suggestedAmount: 33.33,
    });
    // a leitura da rota aconteceu antes do cancelamento
    expect(prisma.order.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      repo.cancelAndRestoreStock.mock.invocationCallOrder[0],
    );
    // o impacto não vai no aviso por socket (que vai para todos)
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('courierImpact');
  });

  it('último pedido ativo da rota: sugere R$ 0', async () => {
    const { uc } = buildCancel(orderWithRoute('CONFIRMED', ['CONFIRMED', 'CANCELLED', 'CANCELLED']));
    const order = await uc.execute('o1');
    expect(order.courierImpact).toMatchObject({ activeOrdersBefore: 1, suggestedAmount: 0, shareAmount: 50 });
  });

  it('pedido fora de rota: sem impacto', async () => {
    const { uc } = buildCancel({ orderNumber: 5, status: 'CONFIRMED', courierTransaction: null });
    expect((await uc.execute('o1')).courierImpact).toBeNull();
  });

  it('falha ao ler a rota não impede o cancelamento', async () => {
    const { uc, prisma, repo } = buildCancel(null);
    prisma.order.findUnique.mockRejectedValue(new Error('banco fora'));
    const order = await uc.execute('o1');
    expect(repo.cancelAndRestoreStock).toHaveBeenCalled();
    expect(order.status).toBe('CANCELLED');
    expect(order.courierImpact).toBeNull();
  });
});

function buildStatus(prismaOrders: any[], repoOverrides: any = {}, current: any = { id: 'o1', status: 'CONFIRMED', paymentStatus: 'PENDING' }) {
  const repo = {
    findById: jest.fn().mockResolvedValue(current),
    cancelAndRestoreStock: jest.fn().mockResolvedValue({ id: 'o1', status: 'CANCELLED' }),
    recoverAndDecrementStock: jest.fn().mockImplementation((_id: string, status: string) => Promise.resolve({ id: 'o1', status, paymentStatus: 'PENDING' })),
    save: jest.fn().mockImplementation((o: any) => Promise.resolve(o)),
    ...repoOverrides,
  } as any;
  const findUnique = jest.fn();
  prismaOrders.forEach((o) => findUnique.mockResolvedValueOnce(o));
  const prisma = { order: { findUnique } } as any;
  const uc = new UpdateOrderStatusUseCase(
    repo,
    { get: jest.fn().mockResolvedValue(null) } as any,
    events(),
    {
      revertOrderLoyalty: jest.fn().mockResolvedValue(undefined),
      processOrderCompleted: jest.fn().mockResolvedValue(undefined),
      markRedemptionDeliveredByOrderId: jest.fn().mockResolvedValue(undefined),
    } as any,
    {} as any,
    prisma,
  );
  return { uc, repo, prisma };
}

describe('UpdateOrderStatusUseCase: impacto na taxa do motoboy', () => {
  it('cancelar pelo seletor de status devolve a taxa sugerida', async () => {
    const { uc } = buildStatus([orderWithRoute('CONFIRMED', ['CONFIRMED', 'CONFIRMED', 'CONFIRMED'])]);
    const order = await uc.execute('o1', { status: 'CANCELLED' } as never);
    expect(order.status).toBe('CANCELLED');
    expect(order.courierImpact).toMatchObject({ kind: 'CANCELLED', amount: 50, activeOrdersBefore: 3, suggestedAmount: 33.33 });
  });

  it('reativar: só avisa (sem valor sugerido), com a taxa atual', async () => {
    const { uc } = buildStatus(
      // antes: pedido cancelado, taxa já reduzida para 33,33; depois: reativado, 3 ativos
      [orderWithRoute('CANCELLED', ['CONFIRMED', 'CONFIRMED', 'CANCELLED'], '33.33'), orderWithRoute('PENDING', ['CONFIRMED', 'CONFIRMED', 'PENDING'], '33.33')],
      {},
      { id: 'o1', status: 'CANCELLED', paymentStatus: 'PENDING' },
    );
    const order = await uc.execute('o1', { status: 'PENDING' } as never);
    expect(order.courierImpact).toMatchObject({
      kind: 'REACTIVATED',
      amount: 33.33,
      activeOrdersBefore: 3,
      shareAmount: null,
      suggestedAmount: null,
    });
  });

  it('mudar para outro status (ex.: Separado) não gera impacto', async () => {
    const { uc } = buildStatus([orderWithRoute('PENDING', ['PENDING', 'PENDING'])], {}, { id: 'o1', status: 'PENDING', paymentStatus: 'PENDING' });
    const order = await uc.execute('o1', { status: 'CONFIRMED' } as never);
    expect(order.courierImpact).toBeUndefined();
  });

  it('mudança só de pagamento nem consulta a rota', async () => {
    const { uc, prisma } = buildStatus([]);
    await uc.execute('o1', { paymentStatus: 'PAID' } as never);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('sem Prisma injetado (testes antigos): comportamento igual ao anterior, sem impacto', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'CONFIRMED', paymentStatus: 'PENDING' }),
      cancelAndRestoreStock: jest.fn().mockResolvedValue({ id: 'o1', status: 'CANCELLED' }),
    } as any;
    const uc = new UpdateOrderStatusUseCase(
      repo,
      {} as any,
      events(),
      { revertOrderLoyalty: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
    );
    const order = await uc.execute('o1', { status: 'CANCELLED' } as never);
    expect(order.courierImpact).toBeUndefined();
  });
});
