import { EventsGateway } from './events.gateway';

const ORDER_ID = '3f8b1c0e-7a52-4c1d-9e0a-2b6d4f1a9c77';

function makeGateway() {
  const roomEmit = jest.fn();
  const broadcastEmit = jest.fn();
  const to = jest.fn(() => ({ emit: roomEmit }));
  const gateway = new EventsGateway();
  gateway.server = { to, emit: broadcastEmit } as any;
  return { gateway, to, roomEmit, broadcastEmit };
}

function makeClient(rooms: string[] = []) {
  const set = new Set<string>(rooms);
  return {
    rooms: set,
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
    gateway.notifyOrderUpdated({ id: 'route_deleted' });
    expect(roomEmit).not.toHaveBeenCalled();

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
