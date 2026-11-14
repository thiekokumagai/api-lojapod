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

    it('o rascunho é gravado com a loja atual (CartDraft por loja)', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-A' });

      await service.trackCart('s1', items, 40);
      expect(prisma.cartDraft.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ storeId: 'store-A' }),
          update: expect.objectContaining({ storeId: 'store-A' }),
        }),
      );
    });

    it('o carrinho que volta a mexer não apaga contato nem marca de "chamado"', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-A' });

      await service.trackCart('s1', items, 40);

      const [call] = prisma.cartDraft.upsert.mock.calls as [
        [{ update: Record<string, unknown> }],
      ];
      expect(Object.keys(call[0].update).sort()).toEqual([
        'cartItems',
        'storeId',
        'totalAmount',
      ]);
    });

    it('carrinho que não é lista ou passa de 100 itens não é gravado', async () => {
      const { service, prisma } = build('store-A', { storeId: 'store-A' });

      await service.trackCart('s1', { lixo: true } as never, 40);
      await service.trackCart(
        's1',
        Array.from({ length: 101 }, () => ({})),
        40,
      );
      expect(prisma.cartDraft.upsert).not.toHaveBeenCalled();
      expect(prisma.cartDraft.delete).not.toHaveBeenCalled();
    });
  });

  describe('saveContact (contato do carrinho abandonado)', () => {
    const NAME = 'João da Silva';
    const PHONE = '(67) 99213-0201';

    const withUpdate = (ctx: ReturnType<typeof build>) => {
      const update = jest.fn().mockResolvedValue({});
      (ctx.prisma.cartDraft as unknown as { update: jest.Mock }).update =
        update;
      return update;
    };

    it('grava nome e telefone (só dígitos) no carrinho da loja atual', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({
        storeId: 'store-A',
        customerName: null,
        customerPhone: null,
      });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', `  ${NAME} `, PHONE);

      expect(update).toHaveBeenCalledWith({
        where: { sessionId: 's1' },
        data: expect.objectContaining({
          storeId: 'store-A',
          customerName: NAME,
          customerPhone: '67992130201',
          contactCapturedAt: expect.any(Date),
          contactedAt: null,
        }),
      });
    });

    it('telefone inválido ou nome inválido não grava nada', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({ storeId: 'store-A' });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, '(67) 9213-020');
      await ctx.service.saveContact('s1', 'A', PHONE);
      expect(update).not.toHaveBeenCalled();
    });

    it('sem loja identificada não grava', async () => {
      const ctx = build(null);
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);
      expect(update).not.toHaveBeenCalled();
    });

    it('sessão de outra loja não recebe contato', async () => {
      const ctx = build('store-A', { storeId: 'store-B' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({ storeId: 'store-B' });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);
      expect(update).not.toHaveBeenCalled();
    });

    it('rascunho de outra loja não recebe contato, mesmo com sessão sem dono', async () => {
      const ctx = build('store-A', { storeId: null });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({ storeId: 'store-B' });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);
      expect(update).not.toHaveBeenCalled();
    });

    it('sem carrinho gravado não cria rascunho vazio', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue(null);
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);
      expect(update).not.toHaveBeenCalled();
      expect(ctx.prisma.cartDraft.upsert).not.toHaveBeenCalled();
    });

    it('mesmo contato de novo não regrava (não adia o "parado há 10 minutos")', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({
        storeId: 'store-A',
        customerName: NAME,
        customerPhone: '67992130201',
      });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);
      expect(update).not.toHaveBeenCalled();
    });

    it('telefone diferente no mesmo carrinho volta a ser "não chamado"', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({
        storeId: 'store-A',
        customerName: NAME,
        customerPhone: '11988887777',
      });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerPhone: '67992130201',
            contactedAt: null,
          }),
        }),
      );
    });

    it('mesmo telefone com nome corrigido não volta a ser "para chamar"', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({
        storeId: 'store-A',
        customerName: 'João',
        customerPhone: '67992130201',
      });
      const update = withUpdate(ctx);

      await ctx.service.saveContact('s1', NAME, PHONE);

      expect(update).toHaveBeenCalledTimes(1);
      const [call] = update.mock.calls as [[{ data: Record<string, unknown> }]];
      expect(call[0].data).not.toHaveProperty('contactedAt');
    });

    it('limita tentativas por telefone e por sessão', async () => {
      const ctx = build('store-A', { storeId: 'store-A' });
      ctx.prisma.cartDraft.findUnique.mockResolvedValue({ storeId: 'store-A' });
      const update = withUpdate(ctx);

      // 30 por telefone por hora, em sessões diferentes
      for (let i = 0; i < 35; i += 1) {
        await ctx.service.saveContact(
          `sessao-${i}-xxxxxxxx`,
          `${NAME} ${i}`,
          PHONE,
        );
      }
      expect(update).toHaveBeenCalledTimes(30);
    });
  });
});
