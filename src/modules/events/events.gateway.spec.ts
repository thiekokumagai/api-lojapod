import { JwtService } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';

const ORDER_ID = '3f8b1c0e-7a52-4c1d-9e0a-2b6d4f1a9c77';
const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'segredo-de-teste';

function makeGateway() {
  const roomEmit = jest.fn();
  const broadcastEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  const gateway = new EventsGateway(new JwtService({}));
  gateway.server = { to, emit: broadcastEmit } as any;
  return { gateway, to, roomEmit, broadcastEmit };
}

function makeClient(rooms: string[] = [], auth: Record<string, unknown> = {}) {
  const set = new Set<string>(rooms);
  return {
    rooms: set,
    data: {} as Record<string, unknown>,
    handshake: { auth, query: {} },
    emit: jest.fn(),
    join: jest.fn((room: string) => {
      set.add(room);
    }),
    leave: jest.fn((room: string) => {
      set.delete(room);
    }),
  } as any;
}

describe('EventsGateway - status do pedido para o cliente', () => {
  it('envia order.status só para a sala do pedido, com os 4 campos e sem dado pessoal', () => {
    const { gateway, to, roomEmit } = makeGateway();
    const updatedAt = new Date('2026-11-14T15:00:00.000Z');

    gateway.notifyOrderStatus({
      id: ORDER_ID,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      updatedAt,
      customerName: 'Fulano',
      customerPhone: '67999999999',
      street: 'Rua X',
      totalOrder: 99,
      items: [{ productName: 'Item' }],
    });

    expect(to).toHaveBeenCalledWith(`order:${ORDER_ID}`);
    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [event, payload] = roomEmit.mock.calls[0];
    expect(event).toBe('order.status');
    expect(payload).toEqual({
      orderId: ORDER_ID,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      updatedAt: '2026-11-14T15:00:00.000Z',
    });
  });

  it('nunca faz broadcast de order.status', () => {
    const { gateway, broadcastEmit } = makeGateway();
    gateway.notifyOrderStatus({ id: ORDER_ID, status: 'PENDING', paymentStatus: 'PENDING' });
    expect(broadcastEmit).not.toHaveBeenCalledWith('order.status', expect.anything());
  });

  it('notifyOrderUpdated também avisa a sala; eventos sem status (ex.: route_deleted) não', () => {
    const { gateway, roomEmit } = makeGateway();
    gateway.notifyOrderUpdated({ id: 'route_deleted', storeId: STORE_A });
    expect(roomEmit).not.toHaveBeenCalledWith('order.status', expect.anything());

    gateway.notifyOrderUpdated({ id: ORDER_ID, status: 'DISPATCHED', paymentStatus: 'PENDING' });
    expect(roomEmit).toHaveBeenCalledWith(
      'order.status',
      expect.objectContaining({ orderId: ORDER_ID, status: 'DISPATCHED' }),
    );
  });

  it('order.watch entra na sala do pedido só com UUID válido', () => {
    const { gateway } = makeGateway();
    const client = makeClient();

    expect(gateway.handleOrderWatch(client, { orderId: ORDER_ID })).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith(`order:${ORDER_ID}`);

    const bad = makeClient();
    expect(gateway.handleOrderWatch(bad, { orderId: 'todos' })).toEqual({ ok: false });
    expect(gateway.handleOrderWatch(bad, {} as any)).toEqual({ ok: false });
    expect(bad.join).not.toHaveBeenCalled();
  });

  it('limita as salas de pedido por conexão', () => {
    const { gateway } = makeGateway();
    const rooms = Array.from({ length: 20 }, (_, i) => `order:id-${i}`);
    const client = makeClient(rooms);
    expect(gateway.handleOrderWatch(client, { orderId: ORDER_ID })).toEqual({ ok: false });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('order.unwatch sai da sala', () => {
    const { gateway } = makeGateway();
    const client = makeClient([`order:${ORDER_ID}`]);
    gateway.handleOrderUnwatch(client, { orderId: ORDER_ID });
    expect(client.leave).toHaveBeenCalledWith(`order:${ORDER_ID}`);
  });
});

describe('EventsGateway - isolamento por loja', () => {
  const OLD_SECRET = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.JWT_SECRET = OLD_SECRET;
  });

  const sign = (payload: object, secret = SECRET) =>
    new JwtService({}).sign(payload, { secret, expiresIn: '5m' });

  it('painel com JWT válido entra só na sala da loja do token', async () => {
    const { gateway } = makeGateway();
    const client = makeClient([], {
      accessToken: sign({ sub: 'u1', email: 'a@a', role: 'ADMIN', storeId: STORE_A }),
    });
    await gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledTimes(1);
    expect(client.join).toHaveBeenCalledWith(`store:${STORE_A}`);
    expect(client.data.storeId).toBe(STORE_A);
  });

  it('conexão sem token não entra em sala de loja', async () => {
    const { gateway } = makeGateway();
    const client = makeClient();
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('agente de impressão (auth.token) é ignorado pelo EventsGateway', async () => {
    const { gateway } = makeGateway();
    const client = makeClient([], { token: 'PRINT-TOKEN' });
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('JWT assinado com outro segredo é recusado e avisa session.invalid', async () => {
    const { gateway } = makeGateway();
    const client = makeClient([], { accessToken: sign({ sub: 'u1', storeId: STORE_A }, 'outro-segredo') });
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('session.invalid');
  });

  it('super admin sem loja no token não recebe eventos de loja', async () => {
    const { gateway } = makeGateway();
    const client = makeClient([], { accessToken: sign({ sub: 'u1', role: 'SUPER_ADMIN', storeId: null }) });
    await gateway.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('order.new e order.updated vão só para a sala da loja do pedido, nunca broadcast', () => {
    const { gateway, to, roomEmit, broadcastEmit } = makeGateway();
    gateway.notifyNewOrder({ id: ORDER_ID, storeId: STORE_A, customerPhone: '67999999999' });
    gateway.notifyOrderUpdated({ id: ORDER_ID, storeId: STORE_B, status: 'CONFIRMED' });
    expect(to).toHaveBeenCalledWith(`store:${STORE_A}`);
    expect(to).toHaveBeenCalledWith(`store:${STORE_B}`);
    expect(roomEmit).toHaveBeenCalledWith('order.new', expect.objectContaining({ id: ORDER_ID }));
    expect(broadcastEmit).not.toHaveBeenCalled();
  });

  it('evento sem storeId não é enviado a ninguém', () => {
    const { gateway, to, broadcastEmit } = makeGateway();
    gateway.notifyNewOrder({ id: ORDER_ID });
    gateway.emitToStore(null, 'loyalty.refresh', {});
    gateway.notifyCatalogRefresh(undefined);
    expect(to).not.toHaveBeenCalled();
    expect(broadcastEmit).not.toHaveBeenCalled();
  });

  it('products.refresh vai ao painel e à vitrine da loja, sem payload', () => {
    const { gateway, to, roomEmit } = makeGateway();
    gateway.notifyCatalogRefresh(STORE_A);
    expect(to).toHaveBeenCalledWith([`store:${STORE_A}`, `catalog:${STORE_A}`]);
    expect(roomEmit).toHaveBeenCalledWith('products.refresh');
  });

  it('catalog.watch aceita só UUID e, ao trocar de loja, sai da sala anterior', () => {
    const { gateway } = makeGateway();
    const client = makeClient([`catalog:${STORE_A}`]);
    expect(gateway.handleCatalogWatch(client, { storeId: 'qualquer' })).toEqual({ ok: false });
    expect(gateway.handleCatalogWatch(client, { storeId: STORE_B })).toEqual({ ok: true });
    expect(client.leave).toHaveBeenCalledWith(`catalog:${STORE_A}`);
    expect(client.join).toHaveBeenCalledWith(`catalog:${STORE_B}`);
  });
});
