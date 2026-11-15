import { GetCourierRoutesUseCase } from './get-courier-routes.use-case';

function build(rows: any[] = []) {
  const prisma = { courierTransaction: { findMany: jest.fn().mockResolvedValue(rows) } } as any;
  return { prisma, uc: new GetCourierRoutesUseCase(prisma) };
}

describe('GetCourierRoutesUseCase (mapa de entregas)', () => {
  it('sem ids: não consulta o banco', async () => {
    const { uc, prisma } = build();
    expect(await uc.execute(undefined, 's1')).toEqual([]);
    expect(await uc.execute('', 's1')).toEqual([]);
    expect(prisma.courierTransaction.findMany).not.toHaveBeenCalled();
  });

  it('consulta só os ids pedidos, só taxas (FEE) e só da loja de quem pede', async () => {
    const { uc, prisma } = build([
      {
        id: 'tx1',
        amount: '50',
        courier: { id: 'c1', name: 'Gui' },
        orders: [{ id: 'o1', orderNumber: 1, status: 'CANCELLED' }],
      },
    ]);
    const r = await uc.execute(' tx1 ,tx2,tx1', 's1');
    const args = prisma.courierTransaction.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: { in: ['tx1', 'tx2'] }, type: 'FEE', storeId: 's1' });
    expect(args.select.orders.select).toEqual({ id: true, orderNumber: true, status: true });
    expect(r).toEqual([
      { id: 'tx1', amount: 50, courierId: 'c1', courierName: 'Gui', orders: [{ id: 'o1', orderNumber: 1, status: 'CANCELLED' }] },
    ]);
  });

  it('limita a quantidade de ids por chamada', async () => {
    const { uc, prisma } = build();
    const many = Array.from({ length: 250 }, (_, i) => `tx${i}`).join(',');
    await uc.execute(many, 's1');
    expect(prisma.courierTransaction.findMany.mock.calls[0][0].where.id.in).toHaveLength(100);
  });
});
