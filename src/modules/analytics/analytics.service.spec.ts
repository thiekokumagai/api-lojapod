/* `expect.objectContaining` devolve `any`; é só dos matchers do jest */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AnalyticsService } from './analytics.service';

type SessionRow = { storeId: string | null };

const build = (currentStoreId: string | null, existingSession?: SessionRow) => {
  const prisma = {
    storeSession: {
      findUnique: jest.fn().mockResolvedValue(existingSession ?? null),
      upsert: jest.fn().mockResolvedValue({
        sessionId: 's1',
        startedAt: new Date(),
        durationSeconds: 0,
      }),
      update: jest.fn().mockResolvedValue({ sessionId: 's1' }),
    },
    cartDraft: {
      findUnique: jest.fn().mockResolvedValue({ sessionId: 's1' }),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const tenant = { getStoreId: jest.fn().mockReturnValue(currentStoreId) };
  const service = new AnalyticsService(prisma as never, tenant as never);
  return { service, prisma };
};

const items = [{ productId: 'p1', quantity: 2 }];

describe('AnalyticsService: carrinho (CartDraft) por loja', () => {
  describe('trackSession', () => {
    it('sem loja identificada não grava nada', async () => {
      const { service, prisma } = build(null);

      await expect(service.trackSession('s1')).resolves.toBeNull();
      expect(prisma.storeSession.upsert).not.toHaveBeenCalled();
    });

    it('sessão de outra loja não é tocada nem movida de loja', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-B' });

      await expect(service.trackSession('s1')).resolves.toBeNull();
      expect(prisma.storeSession.upsert).not.toHaveBeenCalled();
      expect(prisma.storeSession.update).not.toHaveBeenCalled();
    });

    it('sessão nova é criada na loja atual', async () => {
      const { service, prisma } = build('store-A');

      await service.trackSession('s1');
      expect(prisma.storeSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 's1' },
          create: expect.objectContaining({
            sessionId: 's1',
            storeId: 'store-A',
          }),
          update: expect.objectContaining({ storeId: 'store-A' }),
        }),
      );
    });

    it('sessão da mesma loja é atualizada', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-A' });

      await service.trackSession('s1');
      expect(prisma.storeSession.upsert).toHaveBeenCalledTimes(1);
    });

    it('sessão antiga sem loja (legado) é adotada pela loja atual', async () => {
      const { service, prisma } = build('store-A', { storeId: null });

      await service.trackSession('s1');
      expect(prisma.storeSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ storeId: 'store-A' }),
        }),
      );
    });
  });

  describe('trackCart', () => {
    it('grava o rascunho para a sessão da loja atual', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-A' });

      await service.trackCart('s1', items, 40);
      expect(prisma.cartDraft.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 's1' },
          create: expect.objectContaining({ sessionId: 's1', totalAmount: 40 }),
        }),
      );
    });

    it('sessão de outra loja: não grava nem sobrescreve o rascunho', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-B' });

      await service.trackCart('s1', items, 40);
      expect(prisma.cartDraft.upsert).not.toHaveBeenCalled();
    });

    it('sessão de outra loja: carrinho vazio também não apaga o rascunho', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-B' });

      await service.trackCart('s1', [], 0);
      expect(prisma.cartDraft.findUnique).not.toHaveBeenCalled();
      expect(prisma.cartDraft.delete).not.toHaveBeenCalled();
    });

    it('sem loja identificada não grava rascunho', async () => {
      const { service, prisma } = build(null);

      await service.trackCart('s1', items, 40);
      expect(prisma.cartDraft.upsert).not.toHaveBeenCalled();
    });

    it('carrinho vazio da loja dona apaga o rascunho', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-A' });

      await service.trackCart('s1', [], 0);
      expect(prisma.cartDraft.delete).toHaveBeenCalledWith({
        where: { sessionId: 's1' },
      });
    });
  });
});
