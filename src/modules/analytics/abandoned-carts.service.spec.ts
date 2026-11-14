/* `expect.objectContaining` devolve `any`; é só dos matchers do jest */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { AbandonedCartsService } from './abandoned-carts.service';

const NOW = new Date('2026-11-14T15:00:00.000Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000);

const draft = (extra: Record<string, unknown> = {}) => ({
  id: 'd1',
  customerName: 'João da Silva',
  customerPhone: '67992130201',
  contactCapturedAt: minutesAgo(40),
  contactedAt: null,
  createdAt: minutesAgo(60),
  updatedAt: minutesAgo(30),
  totalAmount: '120.50',
  cartItems: [
    {
      product: { name: 'Pod X', price: 60 },
      quantity: 2,
      selectedVariation: 'Menta',
    },
  ],
  ...extra,
});

const build = (
  storeId: string | undefined,
  drafts: unknown[] = [],
  orders: unknown[] = [],
) => {
  const prisma = {
    cartDraft: {
      findMany: jest.fn().mockResolvedValue(drafts),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: { findMany: jest.fn().mockResolvedValue(orders) },
  };
  const tenant = { getStoreId: jest.fn().mockReturnValue(storeId) };
  const service = new AbandonedCartsService(prisma as never, tenant as never);
  return { service, prisma };
};

describe('AbandonedCartsService.list', () => {
  it('sem loja identificada devolve lista vazia sem consultar', async () => {
    const { service, prisma } = build(undefined, [draft()]);

    await expect(service.list(NOW)).resolves.toEqual([]);
    expect(prisma.cartDraft.findMany).not.toHaveBeenCalled();
  });

  it('consulta só a loja atual, com telefone, parados há mais de 10 minutos ou já chamados, dentro de 30 dias', async () => {
    const { service, prisma } = build('store-A', []);

    await service.list(NOW);

    const keepAfter = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(prisma.cartDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: 'store-A',
          customerPhone: { not: null },
          OR: [
            { updatedAt: { lt: minutesAgo(10), gte: keepAfter } },
            { contactedAt: { not: null }, updatedAt: { gte: keepAfter } },
          ],
        },
      }),
    );
  });

  it('carrinho já chamado continua na lista, com a hora em que foi chamado', async () => {
    const calledAt = minutesAgo(3);
    const { service } = build('store-A', [draft({ contactedAt: calledAt })]);

    const [item] = await service.list(NOW);

    expect(item.id).toBe('d1');
    expect(item.contactedAt).toEqual(calledAt);
  });

  it('cliente que volta em outra sessão não reaparece como "para chamar"', async () => {
    const calledAt = minutesAgo(120);
    const { service } = build('store-A', [
      draft({ id: 'novo', updatedAt: minutesAgo(20), contactedAt: null }),
      draft({
        id: 'chamado',
        updatedAt: minutesAgo(200),
        contactedAt: calledAt,
      }),
    ]);

    const result = await service.list(NOW);

    expect(result.map((cart) => cart.id)).toEqual(['novo']);
    expect(result[0].contactedAt).toEqual(calledAt);
  });

  it('devolve o telefone completo (só dígitos) e os itens resumidos', async () => {
    const { service } = build('store-A', [draft()]);

    const [item] = await service.list(NOW);

    expect(item).toEqual({
      id: 'd1',
      customerName: 'João da Silva',
      customerPhone: '67992130201',
      items: [{ name: 'Pod X', quantity: 2, variation: 'Menta' }],
      totalEstimated: 120.5,
      updatedAt: minutesAgo(30),
      contactedAt: null,
    });
  });

  it('devolve o telefone completo só dos carrinhos da loja logada, nunca de outra loja', async () => {
    const all = [
      draft({ id: 'a1', storeId: 'store-A', customerPhone: '67992130201' }),
      draft({ id: 'b1', storeId: 'store-B', customerPhone: '11988887777' }),
    ];
    const { service, prisma } = build('store-A');
    // O banco só devolve as linhas da loja pedida no `where`
    prisma.cartDraft.findMany.mockImplementation(
      (args: { where: { storeId: string } }) =>
        Promise.resolve(all.filter((d) => d.storeId === args.where.storeId)),
    );

    const result = await service.list(NOW);

    expect(result.map((cart) => cart.id)).toEqual(['a1']);
    expect(JSON.stringify(result)).not.toContain('11988887777');
  });

  it('tira da lista quem comprou depois (mesmo telefone, mesmo com máscara)', async () => {
    const { service, prisma } = build(
      'store-A',
      [draft()],
      [{ customerPhone: '(67) 99213-0201', createdAt: minutesAgo(5) }],
    );

    await expect(service.list(NOW)).resolves.toEqual([]);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-A',
          status: { not: 'CANCELLED' },
        }),
      }),
    );
  });

  it('mantém quem só tem pedido anterior ao contato ou de outro telefone', async () => {
    const { service } = build(
      'store-A',
      [draft()],
      [
        { customerPhone: '(67) 99213-0201', createdAt: minutesAgo(50) },
        { customerPhone: '(11) 98888-7777', createdAt: minutesAgo(5) },
      ],
    );

    await expect(service.list(NOW)).resolves.toHaveLength(1);
  });

  it('mostra só o carrinho mais recente de cada telefone', async () => {
    const { service } = build('store-A', [
      draft({ id: 'novo', updatedAt: minutesAgo(20) }),
      draft({ id: 'antigo', updatedAt: minutesAgo(200) }),
      draft({
        id: 'outro',
        customerPhone: '11988887777',
        updatedAt: minutesAgo(90),
      }),
    ]);

    const ids = (await service.list(NOW)).map((cart) => cart.id);

    expect(ids).toEqual(['novo', 'outro']);
  });
});

describe('AbandonedCartsService.markContacted', () => {
  it('marca como chamado e devolve o contato completo da própria loja', async () => {
    const { service, prisma } = build('store-A');
    prisma.cartDraft.findFirst.mockResolvedValue({
      customerName: 'João da Silva',
      customerPhone: '67992130201',
      updatedAt: minutesAgo(30),
    });

    await expect(service.markContacted('d1')).resolves.toEqual({
      name: 'João da Silva',
      phone: '67992130201',
    });
    expect(prisma.cartDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'd1', storeId: 'store-A' }),
      }),
    );
  });

  it('marcar como chamado grava contactedAt e repete o updatedAt anterior (o clique não conta como atividade)', async () => {
    const { service, prisma } = build('store-A');
    const before = minutesAgo(30);
    prisma.cartDraft.findFirst.mockResolvedValue({
      customerName: 'João da Silva',
      customerPhone: '67992130201',
      updatedAt: before,
    });

    await service.markContacted('d1');

    expect(prisma.cartDraft.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.cartDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', storeId: 'store-A', updatedAt: before },
      data: { contactedAt: expect.any(Date), updatedAt: before },
    });
  });

  it('se o cliente mexeu no carrinho no meio, grava só o contactedAt (o updatedAt novo é real)', async () => {
    const { service, prisma } = build('store-A');
    prisma.cartDraft.findFirst.mockResolvedValue({
      customerName: 'João da Silva',
      customerPhone: '67992130201',
      updatedAt: minutesAgo(30),
    });
    prisma.cartDraft.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.markContacted('d1');

    expect(prisma.cartDraft.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.cartDraft.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'd1', storeId: 'store-A' },
      data: { contactedAt: expect.any(Date) },
    });
  });

  it('depois de chamar, o carrinho segue na lista como chamado e com o mesmo updatedAt', async () => {
    // Banco de mentira que imita o Prisma: `@updatedAt` vira "agora" quando o update não o informa
    const row: Record<string, unknown> = draft({ storeId: 'store-A' });
    const originalUpdatedAt = row.updatedAt as Date;
    const { service, prisma } = build('store-A');
    prisma.cartDraft.findMany.mockImplementation(() => Promise.resolve([row]));
    prisma.cartDraft.findFirst.mockImplementation(() => Promise.resolve(row));
    prisma.cartDraft.updateMany.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        Object.assign(row, { updatedAt: new Date(NOW) }, args.data);
        return Promise.resolve({ count: 1 });
      },
    );

    const [beforeCall] = await service.list(NOW);
    expect(beforeCall.contactedAt).toBeNull();

    await service.markContacted('d1');

    const [afterCall] = await service.list(NOW);
    expect(afterCall.id).toBe('d1');
    expect(afterCall.contactedAt).toBeInstanceOf(Date);
    expect(afterCall.updatedAt).toEqual(originalUpdatedAt);
  });

  it('carrinho de outra loja (ou inexistente) dá 404 e não grava', async () => {
    const { service, prisma } = build('store-A'); // findFirst devolve null

    await expect(service.markContacted('d-da-loja-B')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartDraft.updateMany).not.toHaveBeenCalled();
  });

  it('sem loja identificada dá 404', async () => {
    const { service, prisma } = build(undefined);

    await expect(service.markContacted('d1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartDraft.findFirst).not.toHaveBeenCalled();
  });
});

describe('AbandonedCartsService.dismiss', () => {
  it('apaga só o contato do carrinho da própria loja', async () => {
    const { service, prisma } = build('store-A');

    await service.dismiss('d1');

    expect(prisma.cartDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', storeId: 'store-A' },
      data: {
        customerName: null,
        customerPhone: null,
        contactCapturedAt: null,
        contactedAt: null,
      },
    });
  });

  it('carrinho de outra loja dá 404', async () => {
    const { service, prisma } = build('store-A');
    prisma.cartDraft.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.dismiss('d-da-loja-B')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AbandonedCartsService.wipeExpiredContacts', () => {
  it('apaga o contato de quem está sem atividade há mais de 30 dias', async () => {
    const { service, prisma } = build(undefined);
    prisma.cartDraft.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.wipeExpiredContacts(NOW)).resolves.toBe(3);
    expect(prisma.cartDraft.updateMany).toHaveBeenCalledWith({
      where: {
        updatedAt: { lt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000) },
        customerPhone: { not: null },
      },
      data: {
        customerName: null,
        customerPhone: null,
        contactCapturedAt: null,
        contactedAt: null,
      },
    });
  });
});
