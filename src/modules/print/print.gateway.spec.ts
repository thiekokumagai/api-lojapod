import { PrintGateway } from './print.gateway';

const STORE_A = '11111111-1111-4111-8111-111111111111';

function makeClient(
  auth: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
) {
  return {
    id: 'sock-1',
    data: {} as Record<string, unknown>,
    handshake: { auth, query },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as any;
}

function makeGateway(store: { id: string; title: string } | null = null) {
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue(store) },
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const gateway = new PrintGateway(prisma as any);
  gateway.server = { to: jest.fn(() => ({ emit: jest.fn() })) } as any;
  return { gateway, prisma };
}

describe('PrintGateway - acesso do agente de impressão', () => {
  it('só store_id, sem token: recusa e não entra na sala da loja', async () => {
    const { gateway, prisma } = makeGateway({ id: STORE_A, title: 'Loja A' });
    const client = makeClient({}, { store_id: STORE_A });
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    expect(client.disconnect).toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('conexão sem token e sem store_id (painel, vitrine) é ignorada, sem desconectar', async () => {
    const { gateway } = makeGateway();
    const client = makeClient({ accessToken: 'jwt' });
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('token inválido: recusa', async () => {
    const { gateway } = makeGateway(null);
    const client = makeClient({ token: 'ERRADO' });
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('token válido: entra na sala da loja do token, mesmo com store_id de outra loja', async () => {
    const { gateway, prisma } = makeGateway({ id: STORE_A, title: 'Loja A' });
    const client = makeClient({ token: 'abc123' }, { store_id: 'outra-loja' });
    await gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledTimes(1);
    expect(client.join).toHaveBeenCalledWith(`loja_${STORE_A}`);
    expect(client.data.printStoreId).toBe(STORE_A);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: STORE_A, isPrinted: false },
      }),
    );
  });

  it('marcar_como_impresso só atualiza pedido da loja do agente', async () => {
    const { gateway, prisma } = makeGateway();
    const client = makeClient();
    client.data.printStoreId = STORE_A;
    await gateway.handleMarcarComoImpresso(client, 'pedido-1');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'pedido-1', storeId: STORE_A },
      data: { isPrinted: true },
    });
  });

  it('marcar_como_impresso sem agente autenticado não faz nada', async () => {
    const { gateway, prisma } = makeGateway();
    await gateway.handleMarcarComoImpresso(makeClient(), 'pedido-1');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
