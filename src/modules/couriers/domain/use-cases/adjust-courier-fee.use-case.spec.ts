import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdjustCourierFeeUseCase } from './adjust-courier-fee.use-case';

function build(tx: any) {
  const prisma = {
    courierTransaction: {
      findUnique: jest.fn().mockResolvedValue(tx),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...tx, ...data })),
    },
  } as any;
  const events = { notifyOrderUpdated: jest.fn() } as any;
  return { prisma, events, uc: new AdjustCourierFeeUseCase(prisma, events) };
}

const fee = (over: any = {}) => ({ id: 'tx1', type: 'FEE', amount: '50', storeId: 's1', ...over });

describe('AdjustCourierFeeUseCase', () => {
  it('ajusta o valor da taxa, arredondando a 2 casas, e avisa o painel', async () => {
    const { uc, prisma, events } = build(fee());
    const r = await uc.execute({ transactionId: 'tx1', amount: 33.333, storeId: 's1' });
    expect(prisma.courierTransaction.update).toHaveBeenCalledWith({ where: { id: 'tx1' }, data: { amount: 33.33 } });
    expect(Number(r.amount)).toBe(33.33);
    expect(events.notifyOrderUpdated).toHaveBeenCalledWith({ id: 'route_updated', storeId: 's1' });
  });

  it('permite zerar a taxa (rota 100% cancelada)', async () => {
    const { uc, prisma } = build(fee());
    await uc.execute({ transactionId: 'tx1', amount: 0, storeId: 's1' });
    expect(prisma.courierTransaction.update).toHaveBeenCalledWith({ where: { id: 'tx1' }, data: { amount: 0 } });
  });

  it('bloqueio entre lojas: lançamento de outra loja é tratado como inexistente', async () => {
    const { uc, prisma } = build(fee({ storeId: 's2' }));
    await expect(uc.execute({ transactionId: 'tx1', amount: 10, storeId: 's1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.courierTransaction.update).not.toHaveBeenCalled();
  });

  it('lançamento sem loja gravada também não passa', async () => {
    const { uc } = build(fee({ storeId: null }));
    await expect(uc.execute({ transactionId: 'tx1', amount: 10, storeId: 's1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sem loja vinculada ao usuário: recusa', async () => {
    const { uc, prisma } = build(fee());
    await expect(uc.execute({ transactionId: 'tx1', amount: 10 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.courierTransaction.findUnique).not.toHaveBeenCalled();
  });

  it('só taxa (FEE): pagamento não pode ser ajustado', async () => {
    const { uc, prisma } = build(fee({ type: 'PAYMENT' }));
    await expect(uc.execute({ transactionId: 'tx1', amount: 10, storeId: 's1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.courierTransaction.update).not.toHaveBeenCalled();
  });

  it('valor inválido (negativo, NaN, vazio, enorme) é recusado', async () => {
    const { uc, prisma } = build(fee());
    for (const amount of [-1, NaN, undefined as any, null as any, 'abc' as any, 1e9]) {
      await expect(uc.execute({ transactionId: 'tx1', amount, storeId: 's1' })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.courierTransaction.update).not.toHaveBeenCalled();
  });
});
