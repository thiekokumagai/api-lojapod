import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeleteCourierTransactionUseCase } from './delete-courier-transaction.use-case';

function build(tx: any, started: { orderNumber: number }[] = []) {
  const prisma = {
    courierTransaction: {
      findUnique: jest.fn().mockResolvedValue(tx),
      delete: jest.fn().mockResolvedValue({}),
    },
    order: { findMany: jest.fn().mockResolvedValue(started) },
    cashTransaction: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
  } as any;
  const events = { notifyOrderUpdated: jest.fn() } as any;
  return { prisma, events, uc: new DeleteCourierTransactionUseCase(prisma, events) };
}

const fee = (over: any = {}) => ({ id: 'tx1', type: 'FEE', amount: '50', description: 'Taxa Rota 1', storeId: 's1', ...over });

describe('DeleteCourierTransactionUseCase', () => {
  it('recusa (409) excluir taxa com pedido DISPATCHED ou COMPLETED e diz quais pedidos', async () => {
    const { uc, prisma } = build(fee(), [{ orderNumber: 101 }, { orderNumber: 103 }]);
    const err: any = await uc.execute('tx1', 's1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('#101, #103');
    expect(err.message).toContain('já enviado ou entregue');
    // a consulta olha exatamente esses dois status
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      courierTransactionId: 'tx1',
      status: { in: ['DISPATCHED', 'COMPLETED'] },
    });
    expect(prisma.courierTransaction.delete).not.toHaveBeenCalled();
  });

  it('exclui taxa sem pedido enviado/entregue (só pendentes, confirmados ou cancelados)', async () => {
    const { uc, prisma, events } = build(fee(), []);
    await expect(uc.execute('tx1', 's1')).resolves.toEqual({ success: true });
    expect(prisma.courierTransaction.delete).toHaveBeenCalledWith({ where: { id: 'tx1' } });
    expect(events.notifyOrderUpdated).toHaveBeenCalledWith({ id: 'route_deleted' });
  });

  it('bloqueio entre lojas: lançamento de outra loja é tratado como inexistente', async () => {
    const { uc, prisma } = build(fee({ storeId: 's2' }), []);
    await expect(uc.execute('tx1', 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.courierTransaction.delete).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('lançamento inexistente', async () => {
    const { uc } = build(null);
    await expect(uc.execute('tx1', 's1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pagamento (PAYMENT) não consulta pedidos e segue excluindo, com a saída do caixa', async () => {
    const { uc, prisma } = build(fee({ type: 'PAYMENT' }), [{ orderNumber: 1 }]);
    await expect(uc.execute('tx1', 's1')).resolves.toEqual({ success: true });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.courierTransaction.delete).toHaveBeenCalled();
  });
});
